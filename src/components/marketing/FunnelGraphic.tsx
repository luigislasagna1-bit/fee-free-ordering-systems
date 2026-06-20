import { ArrowDown, QrCode, Store } from "lucide-react";

/**
 * GrowthNet "catch the traffic, keep the repeat" funnel — LIGHT version, lives
 * on a white / emerald-tint section. Clean cards + a soft emerald funnel neck;
 * no glow, no dark. The 3 source brands are neutral white chips with a small
 * brand-tinted dot (no logo assets / trademarks, no loud brand fills).
 *
 * ACCURACY: this conveys that GrowthNet gives every marketplace customer a
 * reason to RETURN DIRECT (via QR codes + Smart Links + Autopilot email). It
 * does NOT import/sync orders from Uber/DoorDash (that's coming-soon) — the copy
 * never implies order ingestion.
 */
const SOURCES: { name: string; dot: string }[] = [
  { name: "Uber Eats", dot: "#06C167" },
  { name: "DoorDash", dot: "#FF3008" },
  { name: "SkipTheDishes", dot: "#FF8000" },
];

export function FunnelGraphic() {
  return (
    <div className="mx-auto max-w-md">
      {/* Sources */}
      <div className="flex items-center justify-center gap-2.5 flex-wrap">
        {SOURCES.map((s) => (
          <span
            key={s.name}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-gray-700 shadow-[0_4px_14px_-6px_rgba(16,24,40,0.12)]"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
            {s.name}
          </span>
        ))}
      </div>
      <p className="text-center text-sm text-gray-500 mt-3">Marketplaces bring you a first-time customer.</p>

      <div className="flex justify-center my-2.5">
        <ArrowDown className="w-5 h-5 text-emerald-400" />
      </div>

      {/* Funnel neck — emerald gradient trapezoid narrowing downward */}
      <div
        className="relative h-24 bg-gradient-to-b from-emerald-500 to-emerald-600 flex flex-col items-center justify-center gap-1 text-white shadow-[0_12px_30px_-12px_rgba(16,185,129,0.45)]"
        style={{ clipPath: "polygon(0 0, 100% 0, 72% 100%, 28% 100%)" }}
      >
        <QrCode className="w-5 h-5" />
        <span className="text-sm font-bold">QR code + Smart Link</span>
      </div>

      <div className="flex justify-center my-2.5">
        <ArrowDown className="w-5 h-5 text-emerald-400" />
      </div>

      {/* Outcome — solid emerald card */}
      <div className="rounded-2xl bg-emerald-500 text-center px-5 py-5 shadow-[0_16px_40px_-16px_rgba(16,185,129,0.55)]">
        <div className="flex items-center justify-center gap-2 text-white">
          <Store className="w-5 h-5" />
          <span className="font-extrabold text-lg leading-tight">Your brand</span>
        </div>
        <div className="text-emerald-50 text-sm font-semibold mt-1">Direct orders · 0% commission</div>
      </div>

      {/* Outcome chips */}
      <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
        {["0% commission", "Own your customers", "More repeat orders"].map((c) => (
          <span key={c} className="rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 px-3 py-1 text-xs font-semibold">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}
