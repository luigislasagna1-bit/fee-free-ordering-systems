import { isPublicHoliday } from "./holidays";

export interface ServiceFeeRow {
  id: string;
  name: string;
  feeType: "fixed" | "percent" | string;
  amount: number;
  appliesTo: "pickup" | "delivery" | "both" | string;
  daysOfWeek: string | null; // CSV "0,5,6" — 0=Sun..6=Sat. null = every day.
  publicHolidaysOnly: boolean;
  countryCode: string;
  isActive: boolean;
}

export interface OrderContext {
  subtotal: number;
  type: "pickup" | "delivery";
  at: Date;
}

export interface AppliedFee {
  name: string;
  amount: number;
}

export function evaluateApplicableFees(fees: ServiceFeeRow[], ctx: OrderContext): AppliedFee[] {
  const out: AppliedFee[] = [];
  for (const fee of fees) {
    if (!fee.isActive) continue;
    if (fee.appliesTo !== "both" && fee.appliesTo !== ctx.type) continue;

    if (fee.publicHolidaysOnly) {
      if (!isPublicHoliday(ctx.at, fee.countryCode)) continue;
    } else if (fee.daysOfWeek) {
      const allowed = fee.daysOfWeek
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      if (allowed.length > 0 && !allowed.includes(ctx.at.getDay())) continue;
    }

    const amount = fee.feeType === "fixed"
      ? Math.round(fee.amount * 100) / 100
      : Math.round(ctx.subtotal * (fee.amount / 100) * 100) / 100;

    if (amount > 0) out.push({ name: fee.name, amount });
  }
  return out;
}

export function sumAppliedFees(fees: AppliedFee[]): number {
  return Math.round(fees.reduce((s, f) => s + f.amount, 0) * 100) / 100;
}
