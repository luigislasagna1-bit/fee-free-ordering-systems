import { ApplyClient } from "./ApplyClient";

export default function PartnersApplyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-block bg-orange-500 text-white text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full mb-4">
            Partner Program
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Sell Fee Free Ordering. Get paid for it.</h1>
          <p className="text-gray-600">
            Bring restaurants onto Fee Free Ordering and earn recurring monthly commission on every paid
            subscription you generate.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-10">
          <Tier rate="0%" range="0–5 active" tone="gray" />
          <Tier rate="5%" range="6–49 active" tone="orange" highlight />
          <Tier rate="10%" range="50+ active" tone="green" />
        </div>

        <ApplyClient />

        <p className="text-center text-xs text-gray-500 mt-6 max-w-md mx-auto">
          Already have a restaurant account on Fee Free Ordering? Use a <strong>different email</strong> for
          this reseller application — one account per role, no self-referrals.
        </p>
      </div>
    </div>
  );
}

function Tier({
  rate,
  range,
  tone,
  highlight,
}: {
  rate: string;
  range: string;
  tone: "gray" | "orange" | "green";
  highlight?: boolean;
}) {
  const tones: Record<string, string> = {
    gray: "bg-white border-gray-200 text-gray-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    green: "bg-green-50 border-green-200 text-green-700",
  };
  return (
    <div className={`rounded-xl border p-4 text-center ${tones[tone]} ${highlight ? "ring-2 ring-orange-300" : ""}`}>
      <div className="text-3xl font-bold mb-1">{rate}</div>
      <div className="text-xs uppercase tracking-wide">{range}</div>
    </div>
  );
}
