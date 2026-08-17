/**
 * Nabil AI concierge activation — the line-setup intake form (Luigi 2026-08-17,
 * OWNER-ACTIONS A64). PURE: validation + shapes only, no prisma (unit-tested in
 * setup-request.test.ts). Persisted as VoiceSetupRequest.payload; the
 * superadmin queue on Superadmin › Nabil Phone Lines reads the same shape.
 *
 * Why an intake at all: self-serve number provisioning does not exist yet — a
 * subscriber tells us how they want their line set up (forward their existing
 * number or take a new one), where to send callers who ask for a human, and
 * how Nabil should name the restaurant; the platform provisions by hand within
 * one business day and the dashboard shows "we're setting up your line" until a
 * VoiceNumber row exists.
 */
import { sanitizePhone } from "@/lib/phone";

export const VOICE_SETUP_MODES = ["new", "forward"] as const;
export type VoiceSetupMode = (typeof VOICE_SETUP_MODES)[number];

export const VOICE_SETUP_STATUSES = ["NEW", "DONE"] as const;
export type VoiceSetupStatus = (typeof VOICE_SETUP_STATUSES)[number];

export const MAX_GREETING_NAME_CHARS = 80;
export const MAX_SETUP_NOTES_CHARS = 1000;

export interface VoiceSetupPayload {
  /** The number callers dial today (E.164) — the line we forward or replace. */
  currentNumber: string;
  /** "new" = give them a Nabil number; "forward" = they forward their line to us. */
  mode: VoiceSetupMode;
  /** Where Nabil sends a caller who asks for a person (E.164). */
  transferNumber: string;
  /** How Nabil should introduce the restaurant in the greeting. */
  greetingName: string;
  /** Anything else (optional). */
  notes: string | null;
  /** Login email of the person who filed it (for the ops mail). */
  submittedBy: string | null;
}

export type ParseSetupResult =
  | { ok: true; value: VoiceSetupPayload }
  | { ok: false; code: "invalid_current_number" | "invalid_mode" | "invalid_transfer_number" | "invalid_greeting_name" };

/** Validate the intake body. Phone numbers are normalised to E.164 (a bare
 *  10-digit number is treated as NANP, like every other phone field here). */
export function parseVoiceSetupRequest(body: unknown, submittedBy?: string | null): ParseSetupResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const currentNumber = sanitizePhone(typeof b.currentNumber === "string" ? b.currentNumber : null);
  if (!currentNumber) return { ok: false, code: "invalid_current_number" };

  const mode = typeof b.mode === "string" ? b.mode : "";
  if (!(VOICE_SETUP_MODES as readonly string[]).includes(mode)) return { ok: false, code: "invalid_mode" };

  const transferNumber = sanitizePhone(typeof b.transferNumber === "string" ? b.transferNumber : null);
  if (!transferNumber) return { ok: false, code: "invalid_transfer_number" };

  const greetingName = typeof b.greetingName === "string" ? b.greetingName.trim().replace(/\s+/g, " ") : "";
  if (greetingName.length < 2 || greetingName.length > MAX_GREETING_NAME_CHARS) return { ok: false, code: "invalid_greeting_name" };

  const notesRaw = typeof b.notes === "string" ? b.notes.trim() : "";
  const notes = notesRaw ? notesRaw.slice(0, MAX_SETUP_NOTES_CHARS) : null;

  return {
    ok: true,
    value: {
      currentNumber,
      mode: mode as VoiceSetupMode,
      transferNumber,
      greetingName,
      notes,
      submittedBy: submittedBy?.trim().toLowerCase() || null,
    },
  };
}

/** One row of the superadmin queue (GET /api/superadmin/voice-setup-requests). */
export type VoiceSetupRequestRow = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
  restaurant: { id: string; name: string; slug: string; email: string | null; phone: string | null; timezone: string | null };
  /** The restaurant's provisioned Nabil line, if one exists already. */
  line: { phoneNumber: string; status: string } | null;
  payload: VoiceSetupPayload | null;
};

/** Read a stored payload back defensively (a hand-edited row must not crash a page). */
export function readVoiceSetupPayload(raw: unknown): VoiceSetupPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const mode = typeof p.mode === "string" && (VOICE_SETUP_MODES as readonly string[]).includes(p.mode) ? (p.mode as VoiceSetupMode) : "new";
  return {
    currentNumber: typeof p.currentNumber === "string" ? p.currentNumber : "",
    mode,
    transferNumber: typeof p.transferNumber === "string" ? p.transferNumber : "",
    greetingName: typeof p.greetingName === "string" ? p.greetingName : "",
    notes: typeof p.notes === "string" && p.notes ? p.notes : null,
    submittedBy: typeof p.submittedBy === "string" && p.submittedBy ? p.submittedBy : null,
  };
}
