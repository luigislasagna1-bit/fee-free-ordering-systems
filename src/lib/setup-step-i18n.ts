/**
 * Localized setup-checklist labels (the 2026-07-22 retrofit).
 *
 * setup-checklist.ts stays PURE and keeps its hardcoded English `label` /
 * `detail` strings — those are now the FALLBACK. Renderers (SetupWizardClient,
 * GuidedSetupPill, /admin/publishing status card) resolve through the
 * `admin.setupSteps.*` message keys (all 38 locales, parity-audited) via
 * these helpers: `t.has()` guard → English fallback, so a missing key can
 * never break the wizard (next-intl would otherwise render the raw key path
 * — no onError/getMessageFallback is configured; same pattern as
 * addon-catalog-i18n.ts and AdminSidebar's useSafeT).
 *
 * Callers pass a translator scoped to "admin.setupSteps":
 *   const tSteps = useTranslations("admin.setupSteps");
 *
 * StepIds ("orders.appConnected") nest naturally as key paths. Detail lines
 * come structured off the step (`detailKey` + `detailArgs`); the special
 * `lastSeenAtMs` arg is turned into a localized relative-"ago" string here,
 * at RENDER time (slightly fresher than the server-computed English detail —
 * harmless, the progress provider refetches every 30s anyway).
 */

export type SetupStepsTranslator = {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
};

export function setupStepLabel(t: SetupStepsTranslator, step: { id: string; label: string }): string {
  return t.has(step.id) ? t(step.id) : step.label;
}

export function setupSectionLabel(t: SetupStepsTranslator, section: { id: string; label: string }): string {
  const key = `sections.${section.id}`;
  return t.has(key) ? t(key) : section.label;
}

export function setupStepDetail(
  t: SetupStepsTranslator,
  step: { detail?: string; detailKey?: string; detailArgs?: Record<string, string | number> },
): string | undefined {
  if (step.detailKey && t.has(step.detailKey)) {
    const { lastSeenAtMs, ...rest } = step.detailArgs ?? {};
    const args: Record<string, string | number> = { ...rest };
    if (typeof lastSeenAtMs === "number") args.ago = relativeAgo(t, lastSeenAtMs);
    return t(step.detailKey, args);
  }
  return step.detail;
}

/** Localized compact relative time ("12s ago" / "3m ago" / …) mirroring
 *  setup-checklist.ts formatRelativeAgo, with English fallback per unit. */
function relativeAgo(t: SetupStepsTranslator, whenMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - whenMs) / 1000));
  if (seconds < 60) return t.has("ago.seconds") ? t("ago.seconds", { n: seconds }) : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t.has("ago.minutes") ? t("ago.minutes", { n: minutes }) : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.has("ago.hours") ? t("ago.hours", { n: hours }) : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return t.has("ago.days") ? t("ago.days", { n: days }) : `${days}d ago`;
}
