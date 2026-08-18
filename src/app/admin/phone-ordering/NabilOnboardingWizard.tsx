"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import SetupRequestCard, { type SetupRequestView } from "./SetupRequestCard";
import NabilFaqTemplateForm from "./NabilFaqTemplateForm";

/**
 * Onboarding wizard shown while a restaurant is entitled to Nabil AI but has
 * no VoiceNumber yet (page.tsx's "awaitingLine" state). Steps 1+2 live here;
 * step 3 ("test & go live") only makes sense once a number exists, so it
 * renders separately as NabilGoLiveBanner above the normal dashboard. Every
 * step's "done" state is computed server-side from real data (VoiceSetupRequest
 * / VoiceNumber / VoiceFaq existence) — never a stored wizard-progress flag.
 */
export default function NabilOnboardingWizard({
  initialRequest,
  setupDefaults,
  step1Complete,
  step2Complete,
}: {
  initialRequest: SetupRequestView | null;
  setupDefaults: { currentNumber: string; transferNumber: string; greetingName: string; agentName: string };
  step1Complete: boolean;
  step2Complete: boolean;
}) {
  const t = useTranslations("admin.phoneOrderingPage.onboarding");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{t("wizardTitle")}</h2>
        <p className="text-sm text-gray-600 mt-0.5">{t("wizardSubtitle")}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-2.5">
        <StepChip n={1} label={t("step1Label")} done={step1Complete} active={!step1Complete} />
        <StepChip n={2} label={t("step2Label")} done={step2Complete} active={step1Complete && !step2Complete} />
        <StepChip n={3} label={t("step3Label")} done={false} active={false} />
      </div>

      <SetupRequestCard initialRequest={initialRequest} defaults={setupDefaults} />

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-gray-900">{t("step2Title")}</h3>
        <p className="text-sm text-gray-600 mt-1 mb-4">{t("step2Body")}</p>
        <NabilFaqTemplateForm />
      </div>
    </div>
  );
}

function StepChip({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 ${
        done ? "border-emerald-200 bg-emerald-50" : active ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          done ? "bg-emerald-500 text-white" : active ? "bg-amber-500 text-white" : "bg-gray-200 text-gray-500"
        }`}
      >
        {done ? <Check className="w-3.5 h-3.5" /> : n}
      </div>
      <span className={`text-xs font-semibold leading-tight ${done ? "text-emerald-900" : active ? "text-amber-900" : "text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}
