/**
 * Reseller Reports & Requests — shared constants safe for client import.
 *
 * Split out from reseller-reports-access.ts because that module pulls
 * in prisma + next-auth's getServerSession, which can't be bundled
 * into a "use client" file. This module is pure literals + types and
 * compiles into the client bundle cleanly.
 */
export const REPORT_TYPES = [
  "BUG",
  "FEATURE_REQUEST",
  "FEATURE_ADJUSTMENT",
  "FEATURE_UPDATE",
  "FEATURE_FIX",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "IN_TESTING",
  "FIXED",
  "WONT_FIX",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

export const TYPE_LABEL: Record<ReportType, string> = {
  BUG: "Bug Report",
  FEATURE_REQUEST: "Feature Request",
  FEATURE_ADJUSTMENT: "Feature Adjustment",
  FEATURE_UPDATE: "Feature Update",
  FEATURE_FIX: "Feature Fix",
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  NEW: "New",
  IN_PROGRESS: "In Progress",
  IN_TESTING: "In Testing",
  FIXED: "Fixed / Solved",
  WONT_FIX: "Won't Fix",
};

export const PRIORITY_LABEL: Record<ReportPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const TYPE_BADGE: Record<ReportType, string> = {
  BUG: "bg-red-100 text-red-800 border-red-200",
  FEATURE_REQUEST: "bg-sky-100 text-sky-800 border-sky-200",
  FEATURE_ADJUSTMENT: "bg-amber-100 text-amber-800 border-amber-200",
  FEATURE_UPDATE: "bg-indigo-100 text-indigo-800 border-indigo-200",
  FEATURE_FIX: "bg-orange-100 text-orange-800 border-orange-200",
};

export const STATUS_BADGE: Record<ReportStatus, string> = {
  NEW: "bg-blue-100 text-blue-800 border-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-300",
  IN_TESTING: "bg-purple-100 text-purple-800 border-purple-300",
  FIXED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  WONT_FIX: "bg-gray-200 text-gray-700 border-gray-300",
};

export const PRIORITY_BADGE: Record<ReportPriority, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-sky-100 text-sky-700",
  HIGH: "bg-amber-100 text-amber-800",
  CRITICAL: "bg-red-100 text-red-800",
};

/** Verification-poll vote values. One row per (report, voter) — flipping
 *  vote upserts the row, withdrawing deletes it. */
export const VERIFICATION_VOTES = ["WORKING", "NOT_WORKING"] as const;
export type VerificationVote = (typeof VERIFICATION_VOTES)[number];

/** Activity-log entry kinds. The API auto-writes one of these every
 *  time a report's state changes — surfaces as the timeline on the
 *  detail page. */
export const ACTIVITY_KINDS = [
  "CREATED",
  "STATUS_CHANGE",
  "PRIORITY_CHANGE",
  "VERIFIED_WORKING",
  "VERIFIED_BROKEN",
  "VERIFICATION_REMOVED",
  "UPVOTED",
  "UNUPVOTED",
  "COMMENTED",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  CREATED: "filed this report",
  STATUS_CHANGE: "changed status",
  PRIORITY_CHANGE: "changed priority",
  VERIFIED_WORKING: "marked confirmed working ✓",
  VERIFIED_BROKEN: "marked still not working ✗",
  VERIFICATION_REMOVED: "withdrew verification",
  UPVOTED: "added a me-too",
  UNUPVOTED: "removed their me-too",
  COMMENTED: "commented",
};
