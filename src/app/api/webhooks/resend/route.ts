/**
 * POST /api/webhooks/resend
 *
 * Resend delivery-event webhook. Turns hard bounces and spam complaints into
 * unified `EmailSuppression` rows so we stop emailing addresses that reject or
 * report us — required for CASL/anti-spam compliance AND for shared-domain
 * deliverability (Gmail/Yahoo bulk-sender rules punish senders who keep mailing
 * bouncing/complaining addresses).
 *
 * This fills a real gap: the kickstarter cron comment claims "the bounce webhook
 * will set Prospect.emailBouncedAt" — but until now NOTHING wrote it. This route
 * is that webhook.
 *
 * Security: Resend signs webhooks with the Svix scheme (svix-id / svix-timestamp
 * / svix-signature headers, HMAC-SHA256 over `${id}.${ts}.${body}` with the
 * whsec_ secret). We verify manually (no svix dependency).
 *
 * Idempotency (AGENTS.md webhook rule): suppressEmail() is an upsert, so
 * reprocessing the same bounce/complaint on a Resend retry is a harmless no-op.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { suppressEmail } from "@/lib/suppression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOLERANCE_MS = 5 * 60_000; // reject events whose timestamp is >5min skewed

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Verify a Svix-signed Resend webhook. Returns true iff a signature matches. */
function verifySvix(body: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // Replay guard: timestamp must be recent.
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) return false;

  // whsec_ secret is base64 after the prefix.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // svix-signature is a space-separated list of "v1,<sig>" entries.
  return sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" && !!sig && timingSafeEqualStr(sig, expected);
  });
}

type ResendTags = Array<{ name: string; value: string }> | Record<string, string>;
type ResendData = {
  to?: string[] | string;
  tags?: ResendTags;
  bounce?: { type?: string; subType?: string };
  [k: string]: unknown;
};
type ResendEvent = { type?: string; data?: ResendData };

/** Pull a tag value regardless of whether tags is an array or a map. */
function tagValue(tags: ResendTags | undefined, name: string): string | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) return tags.find((t) => t?.name === name)?.value;
  return tags[name];
}

function recipients(to: ResendData["to"]): string[] {
  if (!to) return [];
  return (Array.isArray(to) ? to : [to]).map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Resolve which restaurants should suppress this address. Prefer the
 * restaurantId tag we attach at send time; otherwise fall back to every
 * restaurant where the address is a known Customer or Prospect (so a bouncing
 * address sent BEFORE tagging still gets suppressed everywhere it's known).
 */
async function restaurantsFor(email: string, taggedRestaurantId?: string): Promise<string[]> {
  if (taggedRestaurantId) return [taggedRestaurantId];
  const ids = new Set<string>();
  const [customers, prospects] = await Promise.all([
    prisma.customer.findMany({ where: { email }, select: { restaurantId: true } }),
    prisma.prospect.findMany({ where: { email }, select: { import: { select: { restaurantId: true } } } }),
  ]);
  customers.forEach((c) => ids.add(c.restaurantId));
  prospects.forEach((p) => p.import?.restaurantId && ids.add(p.import.restaurantId));
  return [...ids];
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Refuse to process unverifiable webhooks. Configure RESEND_WEBHOOK_SECRET.
    console.error("[resend webhook] RESEND_WEBHOOK_SECRET not set — rejecting");
    return NextResponse.json({ error: "webhook not configured" }, { status: 400 });
  }

  const body = await req.text();
  if (!verifySvix(body, req.headers, secret)) {
    console.error("[resend webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = event.type ?? "";
  const isComplaint = type === "email.complained";
  // Only PERMANENT (hard) bounces should permanently suppress. Transient/soft
  // bounces are temporary (full mailbox, greylisting) and must NOT opt someone
  // out for good.
  const bounceType = (event.data?.bounce?.type ?? "").toLowerCase();
  const isHardBounce = type === "email.bounced" && (bounceType === "" || bounceType === "permanent" || bounceType === "hardbounce");

  if (!isComplaint && !isHardBounce) {
    // Delivered/opened/clicked/transient-bounce etc. — nothing to suppress.
    return NextResponse.json({ received: true, ignored: type });
  }

  const emails = recipients(event.data?.to);
  const taggedRestaurantId = tagValue(event.data?.tags, "restaurantId");
  const reason = isComplaint ? "complaint" : "bounce";

  let suppressed = 0;
  try {
    for (const email of emails) {
      const restaurantIds = await restaurantsFor(email, taggedRestaurantId);
      for (const restaurantId of restaurantIds) {
        await suppressEmail({ restaurantId, email, reason, source: "resend_webhook" });
        suppressed++;
      }
      // Also stamp the prospect bounce marker the kickstarter cron already filters on.
      if (reason === "bounce") {
        await prisma.prospect.updateMany({
          where: { email, emailBouncedAt: null },
          data: { emailBouncedAt: new Date() },
        });
      }
    }
  } catch (e) {
    // Log and 200 anyway — the upsert is idempotent, so a Resend retry is safe,
    // but we don't want a partial failure to loop retries forever.
    console.error("[resend webhook] processing error:", e);
  }

  return NextResponse.json({ received: true, type, suppressed });
}

// Health-check / dashboard "Send test" ping.
export async function GET() {
  return NextResponse.json({ endpoint: "resend-webhook", ok: true, timestamp: new Date().toISOString() });
}
