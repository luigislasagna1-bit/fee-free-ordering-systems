/**
 * POST /api/restaurants/kickstarter/import
 *
 * Multipart CSV upload for Kickstarter → Invite Prospects.
 *
 * Body:           multipart/form-data with `file` (CSV, ≤ 2 MB)
 * Expected cols:  name, email, phone   (case-insensitive; email REQUIRED)
 *
 * Flow:
 *   1. Server-side size + MIME check (don't trust the client).
 *   2. Parse CSV → header-mapped rows.
 *   3. Create ProspectImport row (running totals updated as we go).
 *   4. Per-row: validate email, dedup within this file, persist Prospect.
 *   5. Mark import isComplete=true at the end.
 *
 * Idempotency: each upload is its own ProspectImport — re-uploading the
 * same file creates a second import. The cron's email-send dedup is
 * per-Prospect, not per-import, so accidental double-uploads will
 * still email each address only once (we de-dup by email globally
 * within the cron loop). For now within this single file we just skip
 * intra-file duplicates.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { EMAIL_REGEX, parseCsv } from "@/lib/kickstarter";
import { loadSuppressionSet } from "@/lib/suppression";
import { monthsAgo, EBR_MONTHS, INQUIRY_MONTHS, type ConsentBasisValue } from "@/lib/marketing-consent";

const VALID_BASES: ConsentBasisValue[] = ["express", "existing_business_relationship", "inquiry"];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per AGENTS.md scale guidance: bound the upload size SERVER-SIDE.
// Browsers will happily POST a 50 MB CSV. Two MB caps prospects to ~
// 30-40K rows worth of email/name/phone, which is well past anything a
// single restaurant would have.
const MAX_SIZE = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File must be under ${Math.floor(MAX_SIZE / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }

  // CASL consent gate: the owner MUST attest a lawful basis before we accept a
  // list to email. Without this, importing an old/purchased list and blasting it
  // is a straight CASL violation (the 2026-08 complaint). Every ProspectImport
  // carries the attestation; the kickstarter cron refuses to send from any
  // import where consentAttestedAt is null.
  const consentBasis = String(form.get("consentBasis") ?? "").trim() as ConsentBasisValue;
  const consentAttested = String(form.get("consentAttested") ?? "") === "true";
  const consentSourceNote = String(form.get("consentSourceNote") ?? "").trim().slice(0, 500) || null;
  const dateColumnHint = String(form.get("dateColumn") ?? "").trim().toLowerCase();
  if (!VALID_BASES.includes(consentBasis) || !consentAttested) {
    return NextResponse.json(
      { error: "You must confirm the lawful basis for contacting these people before importing." },
      { status: 422 },
    );
  }

  // Read full file into memory — 2 MB cap above keeps this safe.
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV had no rows" }, { status: 400 });
  }

  // Header detection: first row is treated as headers if any cell
  // case-insensitively matches one of our expected column names. If
  // the file is headerless we fall back to a positional mapping
  // (col0=name, col1=email, col2=phone) — matches what most owners
  // export from Excel without a header row.
  const headerCandidates = rows[0].map((c) => c.trim().toLowerCase());
  const isHeaderRow = headerCandidates.some(
    (c) => c === "email" || c === "name" || c === "phone",
  );
  // Optional last-order / relationship date column, used to enforce CASL's
  // 24-month (EBR) / 6-month (inquiry) implied-consent window. Prefer the
  // owner-supplied column name; else auto-detect common headers.
  const DATE_HEADERS = ["last_order", "last order", "last order date", "relationship_date", "last_visit", "last visit", "order date"];
  const dateCol = isHeaderRow
    ? headerCandidates.findIndex((c) => (dateColumnHint ? c === dateColumnHint : DATE_HEADERS.includes(c)))
    : -1;
  const headerMap: { name: number; email: number; phone: number } = isHeaderRow
    ? {
        name: headerCandidates.findIndex((c) => c === "name" || c === "full name" || c === "first name"),
        email: headerCandidates.findIndex((c) => c === "email" || c === "e-mail"),
        phone: headerCandidates.findIndex((c) => c === "phone" || c === "phone number" || c === "mobile"),
      }
    : { name: 0, email: 1, phone: 2 };

  if (headerMap.email < 0) {
    return NextResponse.json(
      { error: "CSV is missing an 'email' column" },
      { status: 400 },
    );
  }

  const dataRows = isHeaderRow ? rows.slice(1) : rows;
  const totalRows = dataRows.length;

  // Create the parent row first so subsequent inserts can FK to it.
  // We pre-populate totalRows; success/error counts update as we go.
  const importRow = await prisma.prospectImport.create({
    data: {
      restaurantId,
      filename: file.name || "prospects.csv",
      totalRows,
      successRows: 0,
      errorRows: 0,
      consentBasis,
      consentSourceNote,
      consentAttestedAt: new Date(),
      attestedByUserId: user.id,
    },
  });

  // Preload the restaurant's do-not-email set once so an unsubscribed/erased
  // person can NEVER be resurrected by a re-import.
  const suppressed = await loadSuppressionSet(restaurantId);
  // Implied-consent window cutoff (express consent doesn't expire).
  const impliedCutoff =
    consentBasis === "existing_business_relationship" ? monthsAgo(EBR_MONTHS)
    : consentBasis === "inquiry" ? monthsAgo(INQUIRY_MONTHS)
    : null;

  // Track emails we've already imported in THIS file to skip duplicates
  // (one prospect → one invite, even if the CSV listed them twice).
  // Case-insensitive — "Foo@example.com" and "foo@example.com" are the
  // same person.
  const seen = new Set<string>();
  let successRows = 0; // SENDABLE rows only (the cron drains until emailsSent >= successRows)
  let errorRows = 0;
  let excludedRows = 0; // stale / suppressed — kept but never sent
  // Pre-validated rows queued for a single bulk insert. Doing N
  // individual prisma.prospect.create() calls would be ~N round trips,
  // which at the 2 MB cap could mean 30K queries. createMany() is one
  // query.
  type PendingProspect = {
    importId: string;
    name: string | null;
    email: string;
    phone: string | null;
    relationshipDate: Date | null;
    excludedAt: Date | null;
    excludedReason: string | null;
  };
  const pending: PendingProspect[] = [];

  for (const row of dataRows) {
    const email = (row[headerMap.email] ?? "").trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) {
      errorRows++;
      continue;
    }
    if (seen.has(email)) {
      // Duplicate within this file — count as an error so the owner sees
      // a non-zero error count and knows their CSV had dupes. Doesn't
      // hard-fail the import.
      errorRows++;
      continue;
    }
    seen.add(email);
    const name = headerMap.name >= 0 ? (row[headerMap.name] ?? "").trim() : "";
    const phone = headerMap.phone >= 0 ? (row[headerMap.phone] ?? "").trim() : "";
    // Parse the optional relationship date (tolerant — blank/invalid = null).
    let relationshipDate: Date | null = null;
    if (dateCol >= 0) {
      const raw = (row[dateCol] ?? "").trim();
      if (raw) {
        const d = new Date(raw);
        if (!Number.isNaN(d.getTime())) relationshipDate = d;
      }
    }
    // Exclude (keep the row, but never send) when suppressed, or when an
    // implied-consent basis is stale/undated.
    let excludedReason: string | null = null;
    if (suppressed.has(email)) {
      excludedReason = "suppressed";
    } else if (impliedCutoff && (!relationshipDate || relationshipDate < impliedCutoff)) {
      excludedReason = "stale_relationship";
    }
    pending.push({
      importId: importRow.id,
      name: name.length > 0 ? name : null,
      email,
      phone: phone.length > 0 ? phone : null,
      relationshipDate,
      excludedAt: excludedReason ? new Date() : null,
      excludedReason,
    });
    if (excludedReason) excludedRows++;
    else successRows++;
  }

  if (pending.length > 0) {
    // Single bulk insert. createMany skips the @relation hydration so
    // it's the fastest way to land N rows. We don't need the returned
    // ids — the cron looks up prospects by emailSentAt IS NULL.
    await prisma.prospect.createMany({ data: pending });
  }

  const updated = await prisma.prospectImport.update({
    where: { id: importRow.id },
    data: {
      successRows,
      errorRows,
      excludedRows,
      isComplete: true,
    },
  });

  return NextResponse.json({ id: updated.id, import: updated, excludedRows });
}
