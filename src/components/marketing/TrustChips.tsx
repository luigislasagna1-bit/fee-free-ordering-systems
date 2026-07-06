import { ShieldCheck, Headset, Wand2 } from "lucide-react";

/**
 * Canonical risk-reversal trust chips (COMPETITOR-TOWNCLUB-PLAN.md action #7,
 * Luigi 2026-07-06). One trust message, everywhere a primary CTA lives — so the
 * reassurance travels with the ask. Server-safe (no "use client", no hooks) so
 * it drops into both server pages (/vs, /pricing sections) and client pages
 * (HomeClient) identically. English literals only — adds ZERO i18n keys, so the
 * 38-locale parity audit stays green.
 *
 * CLAIMS: "Real human support" (never "24/7" — no staffed phone line yet).
 */

const CHIPS = [
  {
    icon: ShieldCheck,
    label: "Risk-free — cancel anytime",
    sub: "No contracts, no lock-in. Leave whenever — keep your data.",
  },
  {
    icon: Headset,
    label: "Real human support",
    sub: "Talk to an actual person who runs restaurants, not a bot.",
  },
  {
    icon: Wand2,
    label: "We set everything up for you",
    sub: "Free menu + photo import from your old system. We do the heavy lifting.",
  },
];

export function TrustChips({
  variant = "inline",
  align = "center",
  dark = false,
  className = "",
}: {
  variant?: "inline" | "cards";
  align?: "center" | "start";
  dark?: boolean;
  className?: string;
}) {
  if (variant === "cards") {
    return (
      <div className={`grid gap-4 sm:grid-cols-3 ${className}`}>
        {CHIPS.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)]"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex items-center justify-center mb-3">
              <c.icon className="w-5 h-5" />
            </div>
            <div className="font-semibold text-gray-900">{c.label}</div>
            <p className="text-sm text-gray-600 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 ${align === "center" ? "justify-center" : "justify-start"} ${className}`}
    >
      {CHIPS.map((c) => (
        <span
          key={c.label}
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm ${
            dark ? "border-white/20 bg-white/10 text-white" : "border-gray-200/70 bg-white text-gray-700"
          }`}
        >
          <c.icon className={`w-4 h-4 ${dark ? "text-emerald-200" : "text-emerald-600"}`} />
          {c.label}
        </span>
      ))}
    </div>
  );
}
