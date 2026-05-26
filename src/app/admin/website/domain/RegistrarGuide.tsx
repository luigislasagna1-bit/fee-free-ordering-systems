"use client";

import { useState } from "react";
import { ExternalLink, ChevronDown } from "lucide-react";

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

const REGISTRARS: Registrar[] = [
  {
    id: "godaddy",
    label: "GoDaddy",
    manageUrl: "https://dcc.godaddy.com/control/portfolio",
    steps: [
      "Open GoDaddy → click your domain name in My Products",
      "Click the DNS tab (top of the page)",
      "Scroll to the Records section → click Add New Record",
      "Type: paste the Type column above (e.g. CNAME or A)",
      "Name: paste the Name column above (often @ for apex, or the subdomain like 'order')",
      "Value: paste the Value column above",
      "TTL: leave the default (600 / 1 hour)",
      "Click Save → repeat for every row above",
    ],
  },
  {
    id: "namecheap",
    label: "Namecheap",
    manageUrl: "https://ap.www.namecheap.com/domains/list",
    steps: [
      "Open Namecheap → Domain List in the left sidebar",
      "Click Manage next to your domain",
      "Click the Advanced DNS tab (top of the page)",
      "Click Add New Record under Host Records",
      "Type: pick the matching value from the dropdown",
      "Host: paste the Name (use @ for apex)",
      "Value: paste the Value column",
      "TTL: Automatic is fine",
      "Click the green checkmark to save → repeat for each row",
    ],
  },
  {
    id: "cloudflare",
    label: "Cloudflare",
    manageUrl: "https://dash.cloudflare.com/",
    steps: [
      "Open Cloudflare dashboard → click your domain",
      "Left sidebar → DNS → Records",
      "Click Add record",
      "Type: pick from the dropdown (CNAME / A / etc)",
      "Name: paste the Name column (use @ for apex)",
      "Target / Content: paste the Value column",
      "IMPORTANT: set Proxy status to DNS only (grey cloud), NOT Proxied (orange cloud) — Vercel needs to see the real records",
      "Click Save → repeat for every row above",
    ],
  },
  {
    id: "google",
    label: "Google Domains / Squarespace",
    manageUrl: "https://domains.squarespace.com/",
    steps: [
      "Google Domains was acquired by Squarespace — open https://domains.squarespace.com/",
      "Click your domain → DNS settings in the left sidebar",
      "Scroll to Custom records → click Add record",
      "Type: pick from the dropdown",
      "Host: paste the Name (@ for apex)",
      "Data: paste the Value",
      "TTL: 1 hour is fine",
      "Click Save → repeat for each row",
    ],
  },
  {
    id: "shopify",
    label: "Shopify",
    manageUrl: "https://admin.shopify.com/settings/domains",
    steps: [
      "Shopify admin → Settings → Domains",
      "Click your domain",
      "Click DNS settings",
      "Click Add custom record",
      "Type / Hostname / Target fields map directly to the table above",
      "Save → repeat for each row",
    ],
  },
  {
    id: "other",
    label: "Other / not listed",
    manageUrl: null,
    steps: [
      "Log into the website where you bought the domain (your registrar)",
      "Look for a section called DNS, DNS Management, Zone File, or Advanced DNS",
      "Find the option to Add a Record or Add Custom Record",
      "For each row in the table above, create one record:",
      "  • Type (dropdown): pick the value shown",
      "  • Name / Host: paste the Name value (@ usually means apex)",
      "  • Value / Target / Data: paste the Value column",
      "Save each record",
      "If your registrar isn't listed here and you get stuck, contact our support — we'll walk you through it",
    ],
  },
];

export function RegistrarGuide() {
  const [selectedId, setSelectedId] = useState<string>("godaddy");
  const [expanded, setExpanded] = useState(false);

  const r = REGISTRARS.find((x) => x.id === selectedId) ?? REGISTRARS[0];

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-900">Where do I add these records?</span>
          <span className="text-[10px] text-blue-700">Pick your registrar</span>
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
              Open {r.label} DNS settings <ExternalLink className="w-3 h-3" />
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
