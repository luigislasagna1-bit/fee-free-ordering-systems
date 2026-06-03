"use client";

import { useState } from "react";
import { ExternalLink, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Per-registrar "where to add these DNS records" guide.
 *
 * Restaurant owners are not network engineers. Showing a bare table
 * of CNAME records leaves them stuck. This component sits below the
 * DNS records table and offers a registrar picker — pick GoDaddy /
 * Namecheap / Cloudflare / Google / Squarespace / "other" — and
 * we render the click-by-click path inside THEIR registrar's
 * dashboard, plus a deep-link to the right page when we know it.
 *
 * Kept intentionally simple: no embedded screenshots (those go
 * stale), just text instructions + deep links. When the registrar's
 * UI changes the instructions still survive longer than screenshots
 * would.
 */

type Registrar = {
  id: string;
  label: string;
  /** Direct deep link to the registrar's DNS-management surface.
   *  Some registrars don't expose stable URLs, in which case we send
   *  the user to the dashboard root. */
  manageUrl: string | null;
  /** Step-by-step path inside the registrar's UI. */
  steps: string[];
};

export function RegistrarGuide() {
  const t = useTranslations("admin.registrarGuide");
  const [selectedId, setSelectedId] = useState<string>("godaddy");
  const [expanded, setExpanded] = useState(false);

  const REGISTRARS: Registrar[] = [
    {
      id: "godaddy",
      label: t("godaddyLabel"),
      manageUrl: "https://dcc.godaddy.com/control/portfolio",
      steps: [
        t("godaddyStep0"),
        t("godaddyStep1"),
        t("godaddyStep2"),
        t("godaddyStep3"),
        t("godaddyStep4"),
        t("godaddyStep5"),
        t("godaddyStep6"),
        t("godaddyStep7"),
      ],
    },
    {
      id: "namecheap",
      label: t("namecheapLabel"),
      manageUrl: "https://ap.www.namecheap.com/domains/list",
      steps: [
        t("namecheapStep0"),
        t("namecheapStep1"),
        t("namecheapStep2"),
        t("namecheapStep3"),
        t("namecheapStep4"),
        t("namecheapStep5"),
        t("namecheapStep6"),
        t("namecheapStep7"),
        t("namecheapStep8"),
      ],
    },
    {
      id: "cloudflare",
      label: t("cloudflareLabel"),
      manageUrl: "https://dash.cloudflare.com/",
      steps: [
        t("cloudflareStep0"),
        t("cloudflareStep1"),
        t("cloudflareStep2"),
        t("cloudflareStep3"),
        t("cloudflareStep4"),
        t("cloudflareStep5"),
        t("cloudflareStep6"),
        t("cloudflareStep7"),
      ],
    },
    {
      id: "google",
      label: t("googleLabel"),
      manageUrl: "https://domains.squarespace.com/",
      steps: [
        t("googleStep0"),
        t("googleStep1"),
        t("googleStep2"),
        t("googleStep3"),
        t("googleStep4"),
        t("googleStep5"),
        t("googleStep6"),
        t("googleStep7"),
      ],
    },
    {
      id: "shopify",
      label: t("shopifyLabel"),
      manageUrl: "https://admin.shopify.com/settings/domains",
      steps: [
        t("shopifyStep0"),
        t("shopifyStep1"),
        t("shopifyStep2"),
        t("shopifyStep3"),
        t("shopifyStep4"),
        t("shopifyStep5"),
      ],
    },
    {
      id: "other",
      label: t("otherLabel"),
      manageUrl: null,
      steps: [
        t("otherStep0"),
        t("otherStep1"),
        t("otherStep2"),
        t("otherStep3"),
        t("otherStep4"),
        t("otherStep5"),
        t("otherStep6"),
        t("otherStep7"),
        t("otherStep8"),
      ],
    },
  ];

  const r = REGISTRARS.find((x) => x.id === selectedId) ?? REGISTRARS[0];

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-900">{t("whereDoIAddRecords")}</span>
          <span className="text-[10px] text-blue-700">{t("pickYourRegistrar")}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-blue-700 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-blue-200">
          <div className="flex flex-wrap gap-1.5 my-3">
            {REGISTRARS.map((reg) => (
              <button
                key={reg.id}
                type="button"
                onClick={() => setSelectedId(reg.id)}
                className={`text-xs px-2.5 py-1 rounded-full transition ${
                  selectedId === reg.id
                    ? "bg-blue-600 text-white font-semibold"
                    : "bg-white border border-blue-200 text-blue-800 hover:border-blue-400"
                }`}
              >
                {reg.label}
              </button>
            ))}
          </div>

          {r.manageUrl && (
            <a
              href={r.manageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 mb-2"
            >
              {t("openDnsSettings", { label: r.label })} <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <ol className="text-xs text-blue-900 leading-relaxed space-y-1 list-decimal list-inside ml-1">
            {r.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
