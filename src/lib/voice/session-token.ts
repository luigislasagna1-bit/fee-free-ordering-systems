import jwt from "jsonwebtoken";

/**
 * Short-lived signed token that the TwiML entry route (/api/twilio/voice) hands
 * to Twilio ConversationRelay in the `wss://…?t=<token>` URL. The always-on
 * voice service verifies it on WS connect, so the socket endpoint can't be
 * driven without a token minted by us for a real inbound call.
 *
 * Deliberately signed with a DEDICATED secret (NABIL_VOICE_JWT_SECRET), NOT
 * NEXTAUTH_SECRET: the external voice service only ever needs to verify these
 * call tokens, so it should never hold the master session-signing secret
 * (least privilege — a compromised voice host can't forge admin sessions).
 *
 * TTL is tiny — the token only needs to survive the ConversationRelay handshake.
 */
const TOKEN_TTL = "2m";

export type NabilCallPayload = {
  restaurantId: string;
  slug: string;
  callSid: string;
  to: string;
  from: string;
};

function getSecret(): string {
  const s = process.env.NABIL_VOICE_JWT_SECRET;
  if (!s) throw new Error("NABIL_VOICE_JWT_SECRET must be set to sign Nabil call tokens");
  return s;
}

export function signNabilCallToken(p: NabilCallPayload): string {
  return jwt.sign({ t: "nabilcall", ...p }, getSecret(), { expiresIn: TOKEN_TTL });
}

/** Verify a call token. (The external voice service re-implements this same
 *  check against NABIL_VOICE_JWT_SECRET — kept here for any in-app use.) */
export function verifyNabilCallToken(token: string): NabilCallPayload | null {
  try {
    const d = jwt.verify(token, getSecret()) as Record<string, unknown>;
    if (d?.t !== "nabilcall") return null;
    const { restaurantId, slug, callSid, to, from } = d;
    if ([restaurantId, slug, callSid, to, from].every((v) => typeof v === "string")) {
      return {
        restaurantId: restaurantId as string,
        slug: slug as string,
        callSid: callSid as string,
        to: to as string,
        from: from as string,
      };
    }
    return null;
  } catch {
    return null;
  }
}
