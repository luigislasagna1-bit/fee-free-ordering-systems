import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff, requireSuperadmin, writeAuditLog } from "@/lib/platform-auth";
import { encrypt } from "@/lib/encrypt";
import {
  isBrandedAppPlatform,
  isBrandedAppStatus,
  type BrandedAppStatus,
} from "@/lib/branded-app/status";
import { transitionPlatformStatus, recordProjectEvent } from "@/lib/branded-app/project";
import { isValidBundleId } from "@/lib/branded-app/validate";

/**
 * Superadmin — one branded-app project (Luigi 2026-08-02).
 *
 * GET  — full project detail: platforms, billing state of the add-on row,
 *        full timeline (internal + restaurant rows), credential presence
 *        ({ kind, addedAt } ONLY — plaintext never leaves the server).
 * PATCH — action dispatch (superadmin only, every action audit-logged):
 *   { action: "status", platform, from, to, force?, messageKey?, detail? }
 *   { action: "verify-access", platform }        → stamps accessVerifiedAt
 *   { action: "package-name", platform, value }  → set/override bundle id (pre-live only)
 *   { action: "store-url", platform, value }
 *   { action: "credential", kind, secret, ascKeyId?, ascIssuerId?, appleTeamId?, artifactUrl? }
 *   { action: "note", detail, restaurantVisible?, messageKey?, platform? }
 *   { action: "build-recorded", platform }       → bumps lastBuildAt + event
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const project = await prisma.brandedAppProject.findUnique({
    where: { id },
    include: {
      restaurant: { select: { id: true, name: true, slug: true, email: true, customDomain: true, subdomain: true } },
      platforms: true,
      events: { orderBy: { createdAt: "desc" }, take: 100 },
      credentials: { select: { id: true, kind: true, ascKeyId: true, ascIssuerId: true, appleTeamId: true, artifactUrl: true, createdAt: true, updatedAt: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const addOnRow = await prisma.restaurantAddOn.findFirst({
    where: { restaurantId: project.restaurantId, addOn: { slug: "branded_mobile_app" } },
    select: { status: true, graceEndsAt: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, stripeSubscriptionId: true },
  });

  return NextResponse.json({ project, billing: addOnRow });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const project = await prisma.brandedAppProject.findUnique({
    where: { id },
    include: { platforms: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const platformRow = (platform: unknown) =>
    isBrandedAppPlatform(platform) ? project.platforms.find((p) => p.platform === platform) ?? null : null;

  switch (action) {
    case "status": {
      const row = platformRow(body.platform);
      if (!row) return NextResponse.json({ error: "bad_platform" }, { status: 400 });
      if (!isBrandedAppStatus(body.to) || !isBrandedAppStatus(body.from)) {
        return NextResponse.json({ error: "bad_status" }, { status: 400 });
      }
      const force = body.force === true;
      const res = await transitionPlatformStatus({
        platformRowId: row.id,
        from: body.from as BrandedAppStatus,
        to: body.to as BrandedAppStatus,
        actorType: "platform",
        actorId: admin.id,
        messageKey: typeof body.messageKey === "string" ? body.messageKey.slice(0, 60) : undefined,
        detail: typeof body.detail === "string" ? body.detail.slice(0, 2000) : undefined,
        force,
      });
      if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === "illegal" ? 400 : 409 });
      await writeAuditLog({
        actor: admin,
        action: force ? "branded-app.status.force" : "branded-app.status",
        entity: `brandedAppProject:${id}`,
        detail: { platform: row.platform, from: body.from, to: body.to },
      });
      return NextResponse.json({ ok: true });
    }

    case "verify-access": {
      const row = platformRow(body.platform);
      if (!row) return NextResponse.json({ error: "bad_platform" }, { status: 400 });
      await prisma.brandedAppPlatform.update({ where: { id: row.id }, data: { accessVerifiedAt: new Date() } });
      await recordProjectEvent({
        projectId: id,
        platform: row.platform as "android" | "ios",
        type: "access-verified",
        messageKey: "accessVerified",
        visibility: "restaurant",
        actorType: "platform",
        actorId: admin.id,
      });
      await writeAuditLog({ actor: admin, action: "branded-app.verify-access", entity: `brandedAppProject:${id}`, detail: { platform: row.platform } });
      return NextResponse.json({ ok: true });
    }

    case "package-name": {
      const row = platformRow(body.platform);
      if (!row) return NextResponse.json({ error: "bad_platform" }, { status: 400 });
      // Gate on liveAt, not the current `status` string — a live app that
      // takes the legal live→building detour to ship an update must STAY
      // immutable (the id is what names it inside the restaurant's real
      // store account; renaming it there breaks the existing listing).
      if (row.liveAt) return NextResponse.json({ error: "immutable_once_live" }, { status: 400 });
      const value = String(body.value ?? "").trim();
      if (!isValidBundleId(value)) return NextResponse.json({ error: "invalid_bundle_id" }, { status: 400 });
      // Pre-check for a friendly error (scoped to the SAME platform — the
      // same id on Android and iOS for one tenant is normal, not a clash).
      // The real backstop against a concurrent-request race is the DB
      // constraint (@@unique([platform, packageName])) caught below — two
      // simultaneous PATCHes can both pass this findFirst, but only one
      // update can win.
      const clash = await prisma.brandedAppPlatform.findFirst({
        where: { packageName: value, platform: row.platform, id: { not: row.id } },
        select: { id: true },
      });
      if (clash) return NextResponse.json({ error: "bundle_id_taken" }, { status: 409 });
      try {
        const updated = await prisma.brandedAppPlatform.updateMany({
          where: { id: row.id, liveAt: null },
          data: { packageName: value },
        });
        if (updated.count !== 1) return NextResponse.json({ error: "immutable_once_live" }, { status: 400 });
      } catch (e: any) {
        if (e?.code === "P2002") return NextResponse.json({ error: "bundle_id_taken" }, { status: 409 });
        throw e;
      }
      await writeAuditLog({ actor: admin, action: "branded-app.package-name", entity: `brandedAppProject:${id}`, detail: { platform: row.platform, value } });
      return NextResponse.json({ ok: true });
    }

    case "store-url": {
      const row = platformRow(body.platform);
      if (!row) return NextResponse.json({ error: "bad_platform" }, { status: 400 });
      const value = String(body.value ?? "").trim().slice(0, 500) || null;
      await prisma.brandedAppPlatform.update({ where: { id: row.id }, data: { storeUrl: value } });
      await writeAuditLog({ actor: admin, action: "branded-app.store-url", entity: `brandedAppProject:${id}`, detail: { platform: row.platform } });
      return NextResponse.json({ ok: true });
    }

    case "credential": {
      const kind = String(body.kind ?? "");
      if (!["google_service_account", "apple_asc_key", "android_keystore_passphrase"].includes(kind)) {
        return NextResponse.json({ error: "bad_kind" }, { status: 400 });
      }
      const secret = String(body.secret ?? "");
      if (!secret || secret.length > 20000) return NextResponse.json({ error: "bad_secret" }, { status: 400 });
      const { enc, iv, tag } = encrypt(secret);
      await prisma.brandedAppStoreCredential.upsert({
        where: { projectId_kind: { projectId: id, kind } },
        update: {
          secretEnc: enc, secretIv: iv, secretTag: tag,
          ascKeyId: body.ascKeyId ? String(body.ascKeyId).slice(0, 50) : null,
          ascIssuerId: body.ascIssuerId ? String(body.ascIssuerId).slice(0, 80) : null,
          appleTeamId: body.appleTeamId ? String(body.appleTeamId).slice(0, 20) : null,
          artifactUrl: body.artifactUrl ? String(body.artifactUrl).slice(0, 500) : null,
          addedByUserId: admin.id,
        },
        create: {
          projectId: id, kind,
          secretEnc: enc, secretIv: iv, secretTag: tag,
          ascKeyId: body.ascKeyId ? String(body.ascKeyId).slice(0, 50) : null,
          ascIssuerId: body.ascIssuerId ? String(body.ascIssuerId).slice(0, 80) : null,
          appleTeamId: body.appleTeamId ? String(body.appleTeamId).slice(0, 20) : null,
          artifactUrl: body.artifactUrl ? String(body.artifactUrl).slice(0, 500) : null,
          addedByUserId: admin.id,
        },
      });
      await recordProjectEvent({
        projectId: id, type: "credential-added", detail: kind, visibility: "internal",
        actorType: "platform", actorId: admin.id,
      });
      // Audit records the KIND only — never any part of the secret.
      await writeAuditLog({ actor: admin, action: "branded-app.credential", entity: `brandedAppProject:${id}`, detail: { kind } });
      return NextResponse.json({ ok: true });
    }

    case "note": {
      const detail = String(body.detail ?? "").trim().slice(0, 2000);
      if (!detail && !body.messageKey) return NextResponse.json({ error: "empty" }, { status: 400 });
      const restaurantVisible = body.restaurantVisible === true;
      await recordProjectEvent({
        projectId: id,
        platform: isBrandedAppPlatform(body.platform) ? body.platform : null,
        type: "note",
        // Restaurant-visible notes must go through a translated messageKey;
        // raw detail on a visible note is shown labeled as an external quote.
        messageKey: restaurantVisible && typeof body.messageKey === "string" ? body.messageKey.slice(0, 60) : undefined,
        detail: detail || undefined,
        visibility: restaurantVisible ? "restaurant" : "internal",
        actorType: "platform",
        actorId: admin.id,
      });
      await writeAuditLog({ actor: admin, action: "branded-app.note", entity: `brandedAppProject:${id}`, detail: { restaurantVisible } });
      return NextResponse.json({ ok: true });
    }

    case "build-recorded": {
      const row = platformRow(body.platform);
      if (!row) return NextResponse.json({ error: "bad_platform" }, { status: 400 });
      // nextBuildNumber is no longer incremented here — gen-build-manifest.ts
      // claims (and atomically increments) it the moment a manifest is
      // generated, so every manifest gets a distinct number even across
      // concurrent generations. This action just records that a build for
      // the already-claimed number actually happened.
      await prisma.brandedAppPlatform.update({
        where: { id: row.id },
        data: { lastBuildAt: new Date() },
      });
      await recordProjectEvent({
        projectId: id, platform: row.platform as "android" | "ios", type: "build-recorded",
        messageKey: "buildRecorded", visibility: "restaurant", actorType: "platform", actorId: admin.id,
      });
      await writeAuditLog({ actor: admin, action: "branded-app.build", entity: `brandedAppProject:${id}`, detail: { platform: row.platform } });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
