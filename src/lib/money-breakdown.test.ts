import { describe, it, expect } from "vitest";
import { buildMoneyBreakdown, type MoneyRow, type MoneyRowKind } from "@/lib/money-breakdown";
import { paymentMethodLabelKey } from "@/lib/payment-label";

const kinds = (rows: MoneyRow[]): MoneyRowKind[] => rows.map((r) => r.kind);
const row = (rows: MoneyRow[], k: MoneyRowKind) => rows.find((r) => r.kind === k);

describe("buildMoneyBreakdown", () => {
  it("Luigi's real order: two named promos + tip + Pizza Bucks → balance to pay reconciles", () => {
    const b = buildMoneyBreakdown({
      currency: "cad",
      subtotal: 59.99,
      appliedPromos: [
        { name: "50 % off entire menu", type: "percentage_off", discount: 30, couponCode: "VIPSKOOLJAN" },
        { name: "20% OFF EVERYTHING", type: "percentage_off", discount: 12, couponCode: "20OFF" },
      ],
      deliveryFee: 0,
      taxAmount: 2.34,
      tip: 9,
      total: 29.33,
      orderType: "pickup",
      rewardsActive: true,
      rewardLabelPlural: "Pizza Bucks",
      reward: { used: 14.66, earned: 0 },
      paymentMethod: "cash",
    });
    expect(kinds(b.rows)).toEqual([
      "SUBTOTAL", "PROMO_DISCOUNT", "PROMO_DISCOUNT", "TAX", "TIP", "TOTAL", "REWARD_USED", "AMOUNT_TO_PAY", "PAYMENT_METHOD",
    ]);
    // The two promos keep their names + codes (never a generic "Discount").
    const promos = b.rows.filter((r) => r.kind === "PROMO_DISCOUNT");
    expect(promos[0].labelArgs).toEqual({ name: "50 % off entire menu", code: "VIPSKOOLJAN" });
    expect(promos[1].amount).toBe(12);
    expect(row(b.rows, "TIP")!.amount).toBe(9);
    expect(row(b.rows, "TOTAL")!.amount).toBe(29.33);
    expect(row(b.rows, "REWARD_USED")!.amount).toBe(14.66);
    // Total 29.33 − 14.66 credit = 14.67 collected (the owner's screenshot).
    expect(b.amountToPay).toBe(14.67);
    expect(row(b.rows, "AMOUNT_TO_PAY")!.amount).toBe(14.67);
    expect(row(b.rows, "AMOUNT_TO_PAY")!.labelKey).toBe("receipt.customer.balanceDue");
    expect(row(b.rows, "PAYMENT_METHOD")!.labelKey).toBe("money.pay.cashOnPickup");
    expect(b.rewardLabel).toBe("Pizza Bucks");
  });

  it("no reward program → no credit/collected/earned rows; amountToPay === total", () => {
    const b = buildMoneyBreakdown({
      currency: "usd", subtotal: 20, deliveryFee: 0, taxAmount: 2, tip: 3, total: 25,
      orderType: "pickup", rewardsActive: false, creditApplied: 0, paymentMethod: "cash",
    });
    expect(kinds(b.rows)).toEqual(["SUBTOTAL", "TAX", "TIP", "TOTAL", "PAYMENT_METHOD"]);
    expect(b.amountToPay).toBe(25);
    expect(b.rewardUsed).toBe(0);
  });

  it("free-delivery promo → struck delivery line marked FREE", () => {
    const b = buildMoneyBreakdown({
      currency: "usd", subtotal: 40,
      appliedPromos: [{ name: "Free delivery", type: "free_delivery", discount: 7.99 }],
      deliveryFee: 0, taxAmount: 0, total: 40, orderType: "delivery", rewardsActive: false,
    });
    const d = row(b.rows, "DELIVERY_FEE")!;
    expect(d.free).toBe(true);
    expect(d.strikeBase).toBe(7.99);
    expect(d.amount).toBe(0);
    // free_delivery is NOT surfaced as a discount row.
    expect(b.rows.some((r) => r.kind === "PROMO_DISCOUNT")).toBe(false);
  });

  it("staff audience labels the collected line differently", () => {
    const b = buildMoneyBreakdown({
      currency: "usd", subtotal: 20, deliveryFee: 0, taxAmount: 0, total: 20,
      orderType: "pickup", audience: "staff", rewardsActive: true, reward: { used: 5, earned: 0 },
    });
    expect(row(b.rows, "AMOUNT_TO_PAY")!.labelKey).toBe("money.amountCollected");
    expect(b.amountToPay).toBe(15);
  });

  it("reward earned shows a +row; credit fully covering total → amountToPay 0", () => {
    const b = buildMoneyBreakdown({
      currency: "usd", subtotal: 10, deliveryFee: 0, taxAmount: 0, total: 10,
      orderType: "pickup", rewardsActive: true, rewardLabelPlural: "Bucks",
      reward: { used: 10, earned: 0.5 },
    });
    expect(b.amountToPay).toBe(0);
    expect(row(b.rows, "REWARD_EARNED")!.amount).toBe(0.5);
    expect(row(b.rows, "REWARD_EARNED")!.sign).toBe("plus");
  });

  it("malformed appliedPromos JSON never throws + falls back to flat columns", () => {
    const b = buildMoneyBreakdown({
      currency: "usd", subtotal: 20, appliedPromos: "not json", promoDiscount: 5,
      deliveryFee: 0, taxAmount: 0, total: 15, orderType: "pickup", rewardsActive: false,
    });
    expect(row(b.rows, "PROMO_DISCOUNT")!.labelKey).toBe("receipt.customer.promoDiscount");
    expect(row(b.rows, "PROMO_DISCOUNT")!.amount).toBe(5);
  });
});

describe("paymentMethodLabelKey", () => {
  it("maps methods to keys, orderType picks the on-premise variant", () => {
    expect(paymentMethodLabelKey("card")).toBe("money.pay.card");
    expect(paymentMethodLabelKey("cash", "pickup")).toBe("money.pay.cashOnPickup");
    expect(paymentMethodLabelKey("cash", "delivery")).toBe("money.pay.cashOnDelivery");
    expect(paymentMethodLabelKey("card_in_person", "delivery")).toBe("money.pay.cardOnDelivery");
    expect(paymentMethodLabelKey("paypal")).toBe("money.pay.paypal");
    expect(paymentMethodLabelKey("reward_credit")).toBe("money.pay.rewardCredit");
    expect(paymentMethodLabelKey("something_weird")).toBeNull();
  });
});
