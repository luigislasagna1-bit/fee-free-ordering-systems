/**
 * Nabil AI CALL REPORTS — the vocabulary shared by the restaurant call page
 * (Report this call), the admin + superadmin API routes and the superadmin
 * "Restaurant Reports › Nabil AI reports" section (Luigi 2026-08-16).
 *
 * The restaurant-facing labels live in the i18n catalogs
 * (admin.phoneOrderingPage.callDetail.report.topics.* / status.*, ×38); the
 * English strings here are for the SUPERADMIN surface (English-only by
 * convention, see src/lib/platform-notifications.ts) and for ops emails.
 */

export const VOICE_CALL_REPORT_TOPICS = [
  "order_taken_incorrectly",
  "order_sent_wrong",
  "incorrect_pricing",
  "allowed_unallowable",
  "reservation_issue",
  "voice_quality",
  "technical_issue",
  "other",
] as const;
export type VoiceCallReportTopic = (typeof VOICE_CALL_REPORT_TOPICS)[number];

export const VOICE_CALL_REPORT_STATUSES = ["NEW", "INVESTIGATING", "NEEDS_INFO", "FIXED", "WONT_FIX"] as const;
export type VoiceCallReportStatus = (typeof VOICE_CALL_REPORT_STATUSES)[number];

/** A report in one of these is still on the platform's plate. */
export const VOICE_CALL_REPORT_OPEN_STATUSES: readonly VoiceCallReportStatus[] = ["NEW", "INVESTIGATING", "NEEDS_INFO"];

/** Superadmin / ops-email labels (English). */
export const VOICE_CALL_REPORT_TOPIC_LABEL_EN: Record<VoiceCallReportTopic, string> = {
  order_taken_incorrectly: "Ordering — order taken incorrectly",
  order_sent_wrong: "Ordering — wrong order sent to the kitchen",
  incorrect_pricing: "Ordering — incorrect price given",
  allowed_unallowable: "Ordering — allowed something it shouldn't have",
  reservation_issue: "Reservation — reservation issue",
  voice_quality: "Voice — robotic, cut out, or misheard",
  technical_issue: "Technical — dropped call, dead air, errors",
  other: "Other",
};

export const VOICE_CALL_REPORT_STATUS_LABEL_EN: Record<VoiceCallReportStatus, string> = {
  NEW: "New",
  INVESTIGATING: "Investigating",
  NEEDS_INFO: "Needs info from the restaurant",
  FIXED: "Fixed",
  WONT_FIX: "Won't fix",
};

export const VOICE_CALL_REPORT_DESCRIPTION_MIN = 10;
export const VOICE_CALL_REPORT_DESCRIPTION_MAX = 2000;
export const VOICE_CALL_REPORT_COMMENT_MAX = 2000;
/** A call can be reported more than once (a second, different problem), but a
 *  stuck "Send" button must not file ten copies. */
export const VOICE_CALL_REPORT_MAX_OPEN_PER_CALL = 3;

export function isVoiceCallReportTopic(v: unknown): v is VoiceCallReportTopic {
  return typeof v === "string" && (VOICE_CALL_REPORT_TOPICS as readonly string[]).includes(v);
}
export function isVoiceCallReportStatus(v: unknown): v is VoiceCallReportStatus {
  return typeof v === "string" && (VOICE_CALL_REPORT_STATUSES as readonly string[]).includes(v);
}

/** Plain text only: trims, collapses runs of blank lines, caps length. */
export function cleanReportText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export type NewVoiceCallReportInput = { topic: VoiceCallReportTopic; urgent: boolean; description: string };

/** Validate the "Report this call" form. Returns the clean input or an error
 *  code the UI maps to a translated message. */
export function parseNewVoiceCallReport(body: unknown): { ok: true; value: NewVoiceCallReportInput } | { ok: false; code: "bad_topic" | "description_too_short" } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isVoiceCallReportTopic(b.topic)) return { ok: false, code: "bad_topic" };
  const description = cleanReportText(b.description, VOICE_CALL_REPORT_DESCRIPTION_MAX);
  if (description.length < VOICE_CALL_REPORT_DESCRIPTION_MIN) return { ok: false, code: "description_too_short" };
  return { ok: true, value: { topic: b.topic, urgent: b.urgent === true, description } };
}
