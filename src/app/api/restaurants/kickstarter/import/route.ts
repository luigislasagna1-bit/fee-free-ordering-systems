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
    },
  });

  // Track emails we've already imported in THIS file to skip duplicates
  // (one prospect → one invite, even if the CSV listed them twice).
  // Case-insensitive — "Foo@example.com" and "foo@example.com" are the
  // same person.
  const seen = new Set<string>();
  let successRows = 0;
  let errorRows = 0;
  // Pre-validated rows queued for a single bulk insert. Doing N
  // individual prisma.prospect.create() calls would be ~N round trips,
  // which at the 2 MB cap could mean 30K queries. createMany() is one
  // query.
  type PendingProspect = {
    importId: string;
    name: string | null;
    email: string;
    phone: string | null;
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
    pending.push({
      importId: importRow.id,
      name: name.length > 0 ? name : null,
      email,
      phone: phone.length > 0 ? phone : null,
    });
    successRows++;
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
      isComplete: true,
    },
  });

  return NextResponse.json({ id: updated.id, import: updated });
}
