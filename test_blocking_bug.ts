import { resolvePromotions } from "@/lib/promo-engine";
import { describe, it, expect } from "vitest";

// Test the blocking logic for reward_credit when an exclusive is present
describe("reward_credit blocking bug test", () => {
  it("reward_credit standard should not be added to blockedPromos when an exclusive is present", () => {
    const exclusive = {
      id: "ex1",
      name: "Exclusive 10% off",
      promotionType: "fixed_cart",
      isActive: true,
      stackingRule: "exclusive" as const,
      orderType: "both",
      customerType: "any" as const,
      minimumOrder: 0,
      rules: "{}",
      ruleConfig: { discountAmount: 10 },
      usedCount: 0,
      autoApply: true,
      couponCode: null,
    };

    const rewardCredit = {
      id: "rc1",
      name: "Earn $5",
      promotionType: "reward_credit",
      isActive: true,
      stackingRule: "standard" as const,  // <-- standard, not master!
      orderType: "both",
      customerType: "any" as const,
      minimumOrder: 0,
      rules: "{}",
      ruleConfig: { creditAmount: 5 },
      usedCount: 0,
      autoApply: true,
      couponCode: null,
    };

    const ctx = {
      orderType: "pickup" as const,
      isNewCustomer: true,
      isMember: false,
      subtotal: 20,
      items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }],
    };

    const { results, blockedPromos } = resolvePromotions([exclusive, rewardCredit], ctx);
    
    console.log("Results:", results.map(r => ({ type: r.type, discount: r.discount, creditAmount: r.creditAmount })));
    console.log("Blocked:", blockedPromos.map(b => ({ promoId: b.promoId, name: b.name })));

    // The reward_credit should NOT be in blockedPromos
    const rcBlocked = blockedPromos.find(b => b.promoId === "rc1");
    if (rcBlocked) {
      console.error("BUG FOUND: reward_credit should not be in blockedPromos!");
      console.error("Blocked promo:", rcBlocked);
    }
  });
});
