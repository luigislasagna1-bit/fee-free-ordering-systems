"use client";

import { useTranslations } from "next-intl";
import { PartyPopper } from "lucide-react";

/**
 * Onboarding wizard, Step 3 — "Test & go live." Shown once a VoiceNumber
 * exists but the restaurant has never flipped `enabled` on
 * (VoiceAgentConfig.firstEnabledAt is still null — see the PATCH route's
 * one-time stamp). Deliberately thin: NabilStatusHeader right below already
 * has the real "call to test" link and the enable toggle — this banner adds
 * guided copy around them, not a second mechanism.
 */
export default function NabilGoLiveBanner({ agentName }: { agentName: string }) {
  const t = useTranslations("admin.phoneOrderingPage.onboarding");

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
          <PartyPopper className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900">{t("goLiveTitle")}</h3>
          <p className="mt-1 text-sm text-gray-700 leading-relaxed">{t("goLiveBody", { agentName })}</p>
          <ul className="mt-2 text-sm text-gray-700 space-y-1 list-disc list-inside">
            <li>{t("goLiveTryHours")}</li>
            <li>{t("goLiveTryParking")}</li>
            <li>{t("goLiveTryOrder")}</li>
          </ul>
          <p className="mt-2 text-xs text-gray-500">{t("goLiveHint")}</p>
        </div>
      </div>
    </div>
  );
}
