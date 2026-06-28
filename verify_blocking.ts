import { resolvePromotions } from "@/lib/promo-engine";

const exclusive = {
  id: "ex1", name: "Ex", promotionType: "fixed_cart", isActive: true,
  stackingRule: "exclusive", orderType: "both", customerType: "any" as const,
  minimumOrder: 0, rules: "{}", ruleConfig: { discountAmount: 10 },
  usedCount: 0, autoApply: true, couponCode: null
};

const rc = {
  id: "rc1", name: "RC", promotionType: "reward_credit", isActive: true,
  stackingRule: "standard" as const, orderType: "both", customerType: "any" as const,
  minimumOrder: 0, rules: "{}", ruleConfig: { creditAmount: 5 },
  usedCount: 0, autoApply: true, couponCode: null
};

const ctx = {
  orderType: "pickup" as const, isNewCustomer: true, isMember: false,
  subtotal: 20, items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }]
};

const { results, blockedPromos } = resolvePromotions([exclusive, rc], ctx);

console.log("RESULTS:");
results.forEach(r => console.log(`  ${r.promoId} (${r.type}): discount=${r.discount}, credit=${r.creditAmount}`));

console.log("\nBLOCKED:");
if (blockedPromos.length === 0) {
  console.log("  (none)");
} else {
  blockedPromos.forEach(b => console.log(`  ${b.promoId} blocked by ${b.winnerName}`));
}

if (blockedPromos.some(b => b.promoId === "rc1")) {
  console.error("\nBUG: reward_credit should NOT be blocked!");
  process.exit(1);
} else {
  console.log("\nOK: reward_credit not blocked");
  process.exit(0);
}
