import { resolvePromotions } from "./dist/lib/promo-engine.js";

// Test: reward_credit with stackingRule="standard" should NOT be blocked by an exclusive
const exclusive = {
  id: "ex1",
  name: "Exclusive 10% off",
  promotionType: "fixed_cart",
  isActive: true,
  stackingRule: "exclusive",
  orderType: "both",
  customerType: "any",
  minimumOrder: 0,
  rules: "{}",
  ruleConfig: { discountAmount: 10 },
  usedCount: 0,
  autoApply: true,
  couponCode: null
};

const rewardCredit = {
  id: "rc1",
  name: "Earn 5 dollars",
  promotionType: "reward_credit",
  isActive: true,
  stackingRule: "standard",  // Note: standard, not master
  orderType: "both",
  customerType: "any",
  minimumOrder: 0,
  rules: "{}",
  ruleConfig: { creditAmount: 5 },
  usedCount: 0,
  autoApply: true,
  couponCode: null
};

const ctx = {
  orderType: "pickup",
  isNewCustomer: true,
  isMember: false,
  subtotal: 20,
  items: [{ menuItemId: "i1", categoryId: "cat1", price: 20, quantity: 1, subtotal: 20 }]
};

const { results, blockedPromos } = resolvePromotions([exclusive, rewardCredit], ctx);

console.log("Results:", results.map(r => ({ type: r.type, discount: r.discount, creditAmount: r.creditAmount })));
console.log("Blocked:", blockedPromos.map(b => ({ promoId: b.promoId, wasExclusive: b.wasExclusive })));

// Check if reward_credit is incorrectly blocked
const rcIsBlocked = blockedPromos.some(b => b.promoId === "rc1");
const rcIsApplied = results.some(r => r.promoId === "rc1");

console.log("\nBUG CHECK:");
console.log("reward_credit applied?", rcIsApplied, "(should be true)");
console.log("reward_credit blocked?", rcIsBlocked, "(should be false)");
if (rcIsBlocked) {
  console.log("ERROR: reward_credit should NOT be blocked!");
}
