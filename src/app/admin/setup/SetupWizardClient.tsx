"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CheckCircle2, Circle, ArrowRight, ExternalLink, Loader2,
  Rocket, AlertCircle, PartyPopper, ChevronDown,
} from "lucide-react";
import toast from "react-hot-toast";
import type { SetupProgress, SetupSection, SetupStep } from "@/lib/setup-checklist";

/**
 * Step-by-step onboarding wizard for new restaurants.
 *
 * Visual model:
 *   - Top: hero with progress bar + "X of Y steps complete"
 *   - Middle: stacked section cards. Each section shows its own progress
 *     and expands to reveal its steps. Completed sections collapse by
 *     default; the first incomplete section auto-expands.
 *   - Bottom: "Publish my restaurant" CTA card. Locked until all
 *     required steps are done; shows what's still needed otherwise.
 *
 * No client-side fetching — all data is passed in from the server.
 * Clicking a step goes to its `href`, the owner finishes it there,
 * then comes back to /admin/setup. Refresh shows updated checkmarks.
 */

export function SetupWizardClient({
  restaurantName,
  restaurantSlug,
  isPublished,
  publishedAt,
  progress,
}: {
  restaurantName: string;
  restaurantSlug: string;
  isPublished: boolean;
  publishedAt: string | null;
  progress: SetupProgress;
}) {
  const router = useRouter();
  const t = useTranslations("admin.setupWizard");
  const [publishing, setPublishing] = useState(false);
  /**
   * Race-condition guard: the Publish button only renders when
   * progress.publishReady is true (computed at server render time), but a
   * second tab could un-complete a required step between page load and
   * click. In that case the API returns 412 with `requiredStepsRemaining[]`.
   * We render those steps inline instead of a generic toast so the owner
   * can click straight to fix them without re-loading.
   */
  const [publishBlock, setPublishBlock] = useState<
    null | Array<{ id: string; label: string; href: string }>
  >(null);

  // Auto-expand the FIRST incomplete section (best onboarding UX —
  // owner sees what to work on next without hunting). Completed
  // sections stay collapsed. Owner can manually expand/collapse any.
  const firstIncomplete = progress.sections.find((s) => !s.complete)?.id;
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(firstIncomplete ? [firstIncomplete] : [progress.sections[0]?.id])
  );
  const toggleSection = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setPublishBlock(null);
    try {
      const res = await fetch("/api/admin/publish", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // 412 = publish_blocked → render inline list of remaining required
        // steps so the owner can click each one. Everything else (401/403/
        // 500) goes through the generic toast path.
        if (
          res.status === 412 &&
          Array.isArray(data?.requiredStepsRemaining) &&
          data.requiredStepsRemaining.length > 0
        ) {
          setPublishBlock(data.requiredStepsRemaining);
          // Also kick a refresh so the section list / progress bar reflect
          // the actual current state on the next render.
          router.refresh();
          return;
        }
        toast.error(data.error || t("publishFailedGeneric"));
        return;
      }
      toast.success(t("publishSuccessToast"));
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("publishFailedGeneric");
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      {/* ─── HERO ───────────────────────────────────────────────────── */}
      <div className={`rounded-2xl p-6 sm:p-8 text-white shadow-lg ${
        isPublished
          ? "bg-gradient-to-br from-emerald-500 to-teal-600"
          : "bg-gradient-to-br from-emerald-500 to-emerald-700"
      }`}>
        <div className="flex items-center gap-2 mb-2">
          {isPublished ? <PartyPopper className="w-5 h-5" /> : <Rocket className="w-5 h-5" />}
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">
            {isPublished ? t("heroBadgeLive") : t("heroBadgeSetup")}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {isPublished ? t("heroTitlePublished", { restaurantName }) : t("heroTitleSetup", { restaurantName })}
        </h1>
        <p className="mt-2 text-white/90 text-sm sm:text-base leading-relaxed">
          {isPublished ? (
            <>
              {t("heroSubtitlePublishedBefore")}{" "}
              <code className="bg-white/15 px-1.5 py-0.5 rounded text-xs">
                /order/{restaurantSlug}
              </code>
              {t("heroSubtitlePublishedAfter")}
            </>
          ) : (
            <>
              {t.rich("heroSubtitleSetup", { strong: (chunks) => <strong>{chunks}</strong> })}
            </>
          )}
        </p>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs mb-1.5 opacity-90">
            <span className="font-semibold">{t("progressLabel", { completed: progress.completedSteps, total: progress.totalSteps })}</span>
            <span className="font-bold">{progress.percent}%</span>
          </div>
          <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Guided-walkthrough CTA. Sends the owner to the first incomplete
            required step via /admin/setup/next; after they save, the
            sticky banner on the next page brings them back here for the
            next one. Hidden once nothing required is left — the green
            Publish CTA below takes over from there. */}
        {!isPublished && progress.requiredStepsRemaining.length > 0 && (
          <Link
            href="/admin/setup/next"
            className="mt-5 inline-flex items-center gap-2 bg-white text-emerald-600 hover:bg-emerald-50 font-bold px-5 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            {progress.completedSteps === 0 ? t("ctaStartSetup") : t("ctaContinueSetup")}
            <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* ─── SECTIONS ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        {progress.sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            isOpen={expanded.has(section.id)}
            onToggle={() => toggleSection(section.id)}
          />
        ))}
      </div>

      {/* ─── PUBLISH CTA ────────────────────────────────────────────── */}
      {!isPublished && (
        <div className={`rounded-2xl p-6 border-2 ${
          progress.publishReady
            ? "border-emerald-300 bg-emerald-50"
            : "border-amber-200 bg-amber-50"
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              progress.publishReady ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
            }`}>
              {progress.publishReady ? <Rocket className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`font-bold ${progress.publishReady ? "text-emerald-900" : "text-amber-900"}`}>
                {progress.publishReady ? t("publishReadyTitle") : t("publishBlockedTitle", { count: progress.requiredStepsRemaining.length })}
              </h2>
              {progress.publishReady ? (
                <p className="text-sm text-emerald-800 mt-1 leading-relaxed">
                  {t("publishReadyDescription")}
                </p>
              ) : (
                <>
                  <p className="text-sm text-amber-800 mt-1 leading-snug">
                    {t("publishBlockedDescription")}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {progress.requiredStepsRemaining.map((step) => (
                      <li key={step.id}>
                        <Link
                          href={step.href}
                          className="inline-flex items-center gap-1.5 text-sm text-amber-900 hover:underline font-medium"
                        >
                          <Circle className="w-3.5 h-3.5" />
                          {step.label}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {/* Big, obvious "Take me there" button — same destination
                      as the hero CTA, repeated here because owners who
                      scroll all the way to the publish card shouldn't
                      have to scroll back up to find the guided path. */}
                  <Link
                    href="/admin/setup/next"
                    className="mt-4 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow transition"
                  >
                    {t("takeNextStepButton")}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </>
              )}
            </div>
          </div>

          {progress.publishReady && (
            <>
              {publishBlock && (
                <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm font-semibold text-red-900">
                      {t("publishBlockErrorTitle")}
                    </div>
                  </div>
                  <p className="text-xs text-red-800 mb-2 leading-snug">
                    {t("publishBlockErrorDescription")}
                  </p>
                  <ul className="space-y-1">
                    {publishBlock.map((step) => (
                      <li key={step.id}>
                        <Link
                          href={step.href}
                          className="inline-flex items-center gap-1.5 text-sm text-red-900 hover:underline font-medium"
                        >
                          <Circle className="w-3.5 h-3.5" />
                          {step.label}
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                onClick={publish}
                disabled={publishing}
                className="mt-5 w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                {publishing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t("publishingButton")}</>
                ) : (
                  <><Rocket className="w-4 h-4" /> {t("publishButton")}</>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Already-published info card */}
      {isPublished && (
        <div className="rounded-2xl p-5 bg-white border border-gray-200">
          <h3 className="font-bold text-gray-900 text-sm mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            {t("youAreLiveTitle")}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {t("youAreLivePublishedOn", { date: publishedAt ? new Date(publishedAt).toLocaleDateString() : t("youAreLivePublishedRecently") })}.
            {t("youAreLiveOfflinePrompt")}{" "}<Link href="/admin/profile" className="text-emerald-600 hover:underline">{t("youAreLiveProfileLink")}</Link>{" "}
            {t("youAreLiveOfflineSuffix")}
          </p>
        </div>
      )}
    </div>
  );
}

function SectionCard({
  section,
  isOpen,
  onToggle,
}: {
  section: SetupSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("admin.setupWizard");
  const allDone = section.complete;
  const sectionPercent = section.totalCount > 0
    ? Math.round((section.completedCount / section.totalCount) * 100)
    : 100;

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition ${
      allDone ? "border-emerald-200" : "border-gray-200"
    }`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-gray-50 transition"
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          allDone ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
        }`}>
          {allDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-gray-900 text-sm sm:text-base">{section.label}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {t("sectionStepCount", { completed: section.completedCount, total: section.totalCount, count: section.totalCount })}
            {allDone ? " ✓" : ""}
          </div>
        </div>
        {/* Mini per-section progress bar */}
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${allDone ? "bg-emerald-500" : "bg-emerald-400"}`}
              style={{ width: `${sectionPercent}%` }}
            />
          </div>
          <span className={`text-xs font-mono w-8 text-right ${allDone ? "text-emerald-600" : "text-gray-500"}`}>
            {sectionPercent}%
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {section.steps.map((step) => (
            <StepRow key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: SetupStep }) {
  const t = useTranslations("admin.setupWizard");
  return (
    <Link
      href={step.href}
      className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition group ${
        step.complete ? "" : ""
      }`}
    >
      {step.complete ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      ) : (
        <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${step.complete ? "text-gray-500 line-through" : "text-gray-900 font-medium"}`}>
          {step.label}
        </div>
        {step.detail && (
          <div className="text-[11px] text-gray-500 mt-0.5 truncate">
            {step.detail}
          </div>
        )}
        {step.required && !step.complete && (
          <div className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider mt-0.5">
            {t("requiredToPublish")}
          </div>
        )}
      </div>
      <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition flex-shrink-0" />
    </Link>
  );
}
