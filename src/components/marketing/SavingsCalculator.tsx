"use client";
import { useMemo, useState } from "react";
import { Calculator, ArrowRight } from "lucide-react";
import { SectionEyebrow, PrimaryButton } from "./sections";

/**
 * Interactive commission-loss calculator (COMPETITOR-TOWNCLUB-PLAN.md action
 * #3, Luigi 2026-07-06). Town.club runs a loyalty calculator with fabricated-
 * precision numbers; ours generates every figure from the visitor's OWN inputs
 * and labels it an estimate — punchy but honest.
 *
 * Compares what the delivery apps' commission takes (orders/day × avg value ×
 * their %) against Fee Free Ordering's model: $0/month core, 0% commission on
 * direct orders. NO add-on dollar price is ever rendered — only the $0 core
 * fact (already published on /pricing), per the marketing house rules. All
 * strings are hardcoded English literals so no en.json key is added (the
 * 38-locale parity audit stays green).
 */

const COMMISSION_OPTIONS = [15, 20, 25, 30];
const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export function SavingsCalculator({ coreMonthlyLabel = "$0" }: { coreMonthlyLabel?: string }) {
  const [ordersPerDay, setOrdersPerDay] = useState(40);
  const [avgOrderValue, setAvgOrderValue] = useState(35);
  const [commissionPct, setCommissionPct] = useState(25);

  const { monthlyOrders, monthlyCommissionLoss, yearlyCommissionLoss } = useMemo(() => {
    const mo = ordersPerDay * 30;
    const revenue = mo * avgOrderValue;
    const loss = Math.round(revenue * (commissionPct / 100));
    return { monthlyOrders: mo, monthlyCommissionLoss: loss, yearlyCommissionLoss: loss * 12 };
  }, [ordersPerDay, avgOrderValue, commissionPct]);

  return (
    <div className="rounded-3xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-6 md:p-10 shadow-[0_24px_60px_-24px_rgba(16,185,129,0.25)]">
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        {/* ── LEFT: inputs ─────────────────────────────────────────── */}
        <div>
          <div className="mb-4">
            <SectionEyebrow icon={Calculator}>The commission math</SectionEyebrow>
          </div>
          <h3 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
            See what the delivery apps really cost you.
          </h3>

          {/* Orders per day */}
          <div className="mt-7">
            <div className="flex items-center justify-between text-sm font-semibold text-gray-700">
              <span>Orders per day</span>
              <span className="text-emerald-700 font-bold text-base">{ordersPerDay}</span>
            </div>
            <input
              type="range"
              min={5}
              max={300}
              step={5}
              value={ordersPerDay}
              onChange={(e) => setOrdersPerDay(Number(e.target.value))}
              className="w-full accent-emerald-500 mt-2"
              aria-label="Orders per day"
            />
            <p className="text-xs text-gray-400 mt-1">
              About {monthlyOrders.toLocaleString("en-US")} orders a month.
            </p>
          </div>

          {/* Average order value */}
          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Average order value</label>
            <div className="flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100">
              <span className="px-3 text-gray-400">$</span>
              <input
                type="number"
                min={5}
                max={200}
                value={avgOrderValue}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) setAvgOrderValue(v);
                }}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  setAvgOrderValue(Number.isNaN(v) ? 35 : Math.min(200, Math.max(5, v)));
                }}
                className="min-w-0 flex-1 py-2.5 pr-3 text-gray-900 font-semibold outline-none bg-transparent"
                aria-label="Average order value in dollars"
              />
            </div>
          </div>

          {/* Their commission */}
          <div className="mt-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Their commission</label>
            <div className="grid grid-cols-4 gap-2">
              {COMMISSION_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCommissionPct(v)}
                  className={`rounded-xl border py-2 text-sm font-bold transition ${
                    commissionPct === v
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-emerald-200"
                  }`}
                >
                  {v}%
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Delivery marketplaces typically take 15–30% per order.
            </p>
          </div>
        </div>

        {/* ── RIGHT: result ───────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-gray-200/80 p-6 md:p-7 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            What commission apps take
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl md:text-5xl font-extrabold text-gray-900">{fmt(monthlyCommissionLoss)}</span>
            <span className="text-lg font-semibold text-gray-400">/month</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            That&apos;s {fmt(yearlyCommissionLoss)} a year gone to fees.
          </p>

          <div className="my-6 h-px bg-gray-100" />

          <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-100 p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
              With Fee Free Ordering
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl md:text-5xl font-extrabold text-emerald-600">{fmt(monthlyCommissionLoss)}</span>
              <span className="text-lg font-semibold text-emerald-500/70">/month kept</span>
            </div>
            <p className="text-sm text-emerald-700 mt-1 font-medium">
              You keep {fmt(yearlyCommissionLoss)} a year. 0% commission on direct orders.
            </p>
            <p className="text-xs text-emerald-600/80 mt-2">
              Core platform is {coreMonthlyLabel}/month — free forever, first 100 orders on us.
            </p>
          </div>

          <PrimaryButton href="/signup" className="w-full mt-6">
            Start keeping 100%
            <ArrowRight className="w-4 h-4" />
          </PrimaryButton>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Estimate only. Actual commission varies by app and market; direct orders through Fee Free
            Ordering are always 0% commission.
          </p>
        </div>
      </div>
    </div>
  );
}
