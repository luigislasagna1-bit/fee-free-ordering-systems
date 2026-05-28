/**
 * Per-restaurant PayPal credential management.
 *
 *   POST   — save (or update) the restaurant's PayPal REST app creds.
 *            We encrypt the secret at rest and verify the creds work
 *            against PayPal's OAuth endpoint before persisting status.
 *   DELETE — disconnect: clears stored creds + flips status back to
 *            "not_connected". Customers can no longer pay with PayPal
 *            until the owner re-connects.
 *
 * Why no hosted onboarding? PayPal's Partner Commerce Platform flow gives
 * a one-click "Connect with PayPal" but requires us to be an approved
 * PayPal Partner — that approval takes days to weeks. The per-restaurant
 * REST app model ships today: owner creates a PayPal Business account +
 * REST app (5 min self-serve at developer.paypal.com), copies client_id +
 * secret, pastes here. We never see the raw secret after the initial save.
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encrypt";
import { verifyPaypalCredentials } from "@/lib/paypal";

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { clientId?: unknown; secret?: unknown; environment?: unknown; merchantEmail?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  const environment = body.environment === "sandbox" ? "sandbox" : "live";
  const merchantEmail = typeof body.merchantEmail === "string"
    ? body.merchantEmail.trim().slice(0, 254) || null
    : null;

  if (!clientId || !secret) {
    return NextResponse.json({ error: "Client ID and secret are both required" }, { status: 400 });
  }
  // PayPal client IDs are ~80 chars of base64-ish; secrets are similar.
  // Reject anything wildly off-shape to catch paste errors before they
  // hit PayPal's auth endpoint with a generic 401.
  if (clientId.length < 20 || clientId.length > 200 || secret.length < 20 || secret.length > 200) {
    return NextResponse.json({
      error: "Client ID or secret doesn't look right. Double-check you pasted the values from developer.paypal.com → My Apps & Credentials → your REST app.",
    }, { status: 400 });
  }

  // Encrypt at rest BEFORE we attempt verification. That way if the
  // verify call itself errors transiently, we don't lose the user's
  // typed creds — but we also don't flip status="connected" yet.
  const clientIdEnc = encrypt(clientId);
  const secretEnc = encrypt(secret);

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      paypalClientIdEnc: clientIdEnc.enc,
      paypalClientIdIv: clientIdEnc.iv,
      paypalClientIdTag: clientIdEnc.tag,
      paypalSecretEnc: secretEnc.enc,
      paypalSecretIv: secretEnc.iv,
      paypalSecretTag: secretEnc.tag,
      paypalEnvironment: environment,
      paypalMerchantEmail: merchantEmail,
      // Provisional — verify call below confirms.
      paypalAccountStatus: "pending",
    },
  });

  // Verify by OAuthing into PayPal with these creds. If it works we're
  // connected; otherwise surface the error and leave status="pending"
  // so the owner can retry without re-typing.
  const verify = await verifyPaypalCredentials(restaurantId);
  if (!verify.ok) {
    return NextResponse.json({
      error: "We saved your credentials but PayPal rejected them when we tried to connect. " +
             "Double-check the environment (Sandbox vs Live) matches the app, and that you " +
             "copied the values from the right REST app. PayPal said: " +
             (verify.errorMessage ?? "unknown").slice(0, 300),
    }, { status: 400 });
  }

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      paypalAccountStatus: "connected",
      paypalConnectedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    environment,
    merchantEmail,
  });
}

export async function DELETE() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      paypalAccountStatus: "not_connected",
      paypalClientIdEnc: null,
      paypalClientIdIv: null,
      paypalClientIdTag: null,
      paypalSecretEnc: null,
      paypalSecretIv: null,
      paypalSecretTag: null,
      paypalMerchantEmail: null,
      paypalWebhookId: null,
      paypalConnectedAt: null,
    },
  });
  return NextResponse.json({ ok: true });
}
