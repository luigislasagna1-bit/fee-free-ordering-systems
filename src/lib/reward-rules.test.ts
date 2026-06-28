import { describe, it, expect } from "vitest";
import { isWindowActive, computeRuleAmount, signupGrantsFor, orderEarnGrantsFor, type EarnRule } from "@/lib/reward-rules";

const rule = (over: Partial<EarnRule>): EarnRule => ({ id: "r1", active: true, triggerType: "signup", ...over });
const at = (iso: string) => new Date(iso);
const NOW = at("2026-06-15T12:00:00Z");

describe("reward-rules — isWindowActive", () => {
  it("inactive → false", () => expect(isWindowActive(rule({ active: false }), NOW)).toBe(false));
  it("no window → true", () => expect(isWindowActive(rule({}), NOW)).toBe(true));
  it("before start → false", () => expect(isWindowActive(rule({ startsAt: "2026-07-01T00:00:00Z" }), NOW)).toBe(false));
  it("after end → false", () => expect(isWindowActive(rule({ endsAt: "2026-06-01T00:00:00Z" }), NOW)).toBe(false));
  it("inside window → true", () => expect(isWindowActive(rule({ startsAt: "2026-06-01T00:00:00Z", endsAt: "2026-06-30T23:59:59Z" }), NOW)).toBe(true));
});

describe("reward-rules — computeRuleAmount", () => {
  it("flat amount wins", () => expect(computeRuleAmount(rule({ earnAmount: 10, earnPercent: 5 }), 100)).toBe(10));
  it("percent of basis when no flat", () => expect(computeRuleAmount(rule({ earnPercent: 15 }), 40)).toBe(6));
  it("zero when neither", () => expect(computeRuleAmount(rule({}), 100)).toBe(0));
});

describe("reward-rules — signupGrantsFor", () => {
  it("only windowed flat signup rules pay", () => {
    const rules: EarnRule[] = [
      rule({ id: "a", triggerType: "signup", earnAmount: 10 }),
      rule({ id: "b", triggerType: "signup", earnAmount: 5, startsAt: "2026-07-01T00:00:00Z" }), // future → skip
      rule({ id: "c", triggerType: "signup", earnPercent: 10 }), // no basis at signup → skip
      rule({ id: "d", triggerType: "first_order", earnAmount: 99 }), // wrong trigger
    ];
    const out = signupGrantsFor(rules, NOW);
    expect(out).toEqual([{ ruleId: "a", amount: 10, reason: "earn:signup:a" }]);
  });
});

describe("reward-rules — orderEarnGrantsFor", () => {
  const base = { at: NOW, basis: 40, orderSubtotal: 40, completedOrderCount: 1 };

  it("first_order matches only on the 1st completed order", () => {
    const r = [rule({ id: "f", triggerType: "first_order", earnAmount: 15 })];
    expect(orderEarnGrantsFor(r, { ...base, completedOrderCount: 1 })).toHaveLength(1);
    expect(orderEarnGrantsFor(r, { ...base, completedOrderCount: 2 })).toHaveLength(0);
  });

  it("order_over matches when subtotal ≥ threshold; amount can be percent", () => {
    const r = [rule({ id: "o", triggerType: "order_over", orderThreshold: 50, earnPercent: 10 })];
    expect(orderEarnGrantsFor(r, { ...base, orderSubtotal: 40 })).toHaveLength(0);
    const hit = orderEarnGrantsFor(r, { ...base, orderSubtotal: 60, basis: 60 });
    expect(hit).toEqual([{ ruleId: "o", triggerType: "order_over", amount: 6, reason: "earn:order_over:o" }]);
  });

  it("nth_order matches every Nth completed order", () => {
    const r = [rule({ id: "n", triggerType: "nth_order", nthInterval: 5, earnAmount: 20 })];
    expect(orderEarnGrantsFor(r, { ...base, completedOrderCount: 4 })).toHaveLength(0);
    expect(orderEarnGrantsFor(r, { ...base, completedOrderCount: 5 })).toHaveLength(1);
    expect(orderEarnGrantsFor(r, { ...base, completedOrderCount: 10 })).toHaveLength(1);
  });

  it("multiple matching rules stack (distinct reasons)", () => {
    const r = [
      rule({ id: "f", triggerType: "first_order", earnAmount: 15 }),
      rule({ id: "o", triggerType: "order_over", orderThreshold: 30, earnAmount: 5 }),
    ];
    const out = orderEarnGrantsFor(r, { ...base, completedOrderCount: 1, orderSubtotal: 40 });
    expect(out.map((g) => g.reason).sort()).toEqual(["earn:first_order:f", "earn:order_over:o"]);
  });

  it("a windowed rule outside its window does not fire", () => {
    const r = [rule({ id: "x", triggerType: "first_order", earnAmount: 15, endsAt: "2026-06-01T00:00:00Z" })];
    expect(orderEarnGrantsFor(r, base)).toHaveLength(0);
  });
});
