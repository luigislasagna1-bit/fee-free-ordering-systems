/**
 * Promotion engine verification script.
 *
 * Exercises all 12 promotion types with realistic carts and asserts the
 * expected discount amounts. Closes task #60 — gives Luigi a one-command
 * sanity check that the engine still does what it claims to.
 *
 * Run:   npx tsx scripts/verify-promotions.ts
 * Pass:  every test logs ✓ and the script exits 0.
 * Fail:  failing tests log ✗ with expected vs actual; script exits 1.
 *
 * No DB access — pure calculation tests. Carts and promos are
 * constructed in-memory to drive the engine deterministically.
 */
import { applyPromotions, calcDiscount, type CartItem, type ApplyContext, type PromoInput } from "../src/lib/promo-engine";

// ── Helpers ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assertEqual(label: string, actual: number, expected: number, tolerance = 0.005) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✓ ${label} = ${actual.toFixed(2)}`);
    passed++;
  } else {
    console.log(`  ✗ ${label} = ${actual.toFixed(2)} (expected ${expected.toFixed(2)})`);
    failed++;
    failures.push(`${label} expected ${expected.toFixed(2)} got ${actual.toFixed(2)}`);
  }
}

function makePromo(overrides: Partial<PromoInput>): PromoInput {
  return {
    id: "p_" + Math.random().toString(36).slice(2, 7),
    name: "Test promo",
    description: null,
    promotionType: "percentage_off",
    isActive: true,
    stackingRule: "standard",
    orderType: "both",
    customerType: "any",
    minimumOrder: 0,
    rules: "{}",
    daysOfWeek: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    usedCount: 0,
    autoApply: true,
    couponCode: null,
    ...overrides,
  };
}

function makeContext(overrides: Partial<ApplyContext> = {}): ApplyContext {
  return {
    orderType: "delivery",
    isNewCustomer: false,
    subtotal: 0,
    items: [],
    ...overrides,
  };
}

// Sample carts
const PIZZA: CartItem = { menuItemId: "pizza", categoryId: "mains", price: 20, quantity: 1, subtotal: 20 };
const SODA:  CartItem = { menuItemId: "soda",  categoryId: "drinks", price: 3,  quantity: 2, subtotal: 6 };
const SALAD: CartItem = { menuItemId: "salad", categoryId: "sides",  price: 8,  quantity: 1, subtotal: 8 };
// NOTE: WINGS lives in its own "wings" category, NOT "mains". The promo
// engine sums eligibleTotal across groups; if an item belongs to multiple
// matching groups it gets double-counted (by design — restaurants set up
// non-overlapping groups in practice). Keep this distinct so the
// meal_bundle_speciality test doesn't trip that quirk.
const WINGS: CartItem = { menuItemId: "wings", categoryId: "wings",  price: 12, quantity: 1, subtotal: 12 };
const CART = [PIZZA, SODA, SALAD]; // subtotal = 34
const CART_TOTAL = 34;

// ── Test cases ────────────────────────────────────────────────────────

function test1_percentageOff() {
  console.log("\n[1/12] percentage_off — 10% off cart");
  const promo = makePromo({
    promotionType: "percentage_off",
    rules: JSON.stringify({ discountPercent: 10 }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  assertEqual("10% off $34", calcDiscount(promo, ctx), 3.40);
}

function test2_percentageOffTargeted() {
  console.log("\n[1b] percentage_off — 25% off MAINS only");
  const promo = makePromo({
    promotionType: "percentage_off",
    rules: JSON.stringify({
      discountPercent: 25,
      groups: [{ id: "g", label: "Mains", categoryIds: ["mains"], itemIds: [] }],
    }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  // Mains in cart = pizza ($20) only; 25% off $20 = $5
  assertEqual("25% off $20 mains", calcDiscount(promo, ctx), 5.00);
}

function test3_freeDelivery() {
  console.log("\n[2/12] free_delivery — discount is always 0 (handled via flag)");
  const promo = makePromo({ promotionType: "free_delivery", rules: "{}" });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  assertEqual("free_delivery discount", calcDiscount(promo, ctx), 0);
}

function test4_bogo() {
  console.log("\n[3/12] bogo — buy a pizza ($20), get cheapest free");
  const promo = makePromo({
    promotionType: "bogo",
    rules: JSON.stringify({
      discountStrategy: "cheapest",
      cheapestDiscount: 100,
      groups: [
        { id: "paid", label: "Paid", role: "paid", categoryIds: ["mains"], itemIds: [] },
        { id: "free", label: "Free", role: "free", categoryIds: ["drinks", "sides"], itemIds: [] },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  // Cheapest qualifying item across BOTH groups (pizza $20 + soda $3 + salad $8)
  // = soda $3 (100% off). The pricey main never wins "cheapest", so reward-style
  // BOGO is unaffected while a true cheaper-of-the-pair BOGO now works.
  assertEqual("BOGO cheapest free", calcDiscount(promo, ctx), 3.00);
}

function test4d_bogoOncePerOrder() {
  // Luigi 2026-06-07: "Only allowed once per order" checkbox caps a repeating
  // BOGO to a single application. 4 same-category pizzas:
  //   unchecked (default) → 2 pairs → 2 cheapest free ($10 + $12 = $22)
  //   checked            → 1 application → 1 cheapest free ($10)
  console.log("\n[3d] bogo — once-per-order cap vs repeating");
  const items = [
    { menuItemId: "p1", categoryId: "mains", price: 10, quantity: 1, subtotal: 10 },
    { menuItemId: "p2", categoryId: "mains", price: 12, quantity: 1, subtotal: 12 },
    { menuItemId: "p3", categoryId: "mains", price: 14, quantity: 1, subtotal: 14 },
    { menuItemId: "p4", categoryId: "mains", price: 16, quantity: 1, subtotal: 16 },
  ];
  const ctx = makeContext({ subtotal: 52, items });
  const groups = [
    { id: "paid", role: "paid", categoryIds: ["mains"], itemIds: [] },
    { id: "free", role: "free", categoryIds: ["mains"], itemIds: [] },
  ];
  const repeating = makePromo({ promotionType: "bogo", rules: JSON.stringify({ discountStrategy: "cheapest", cheapestDiscount: 100, groups }) });
  assertEqual("BOGO repeating (4 items → 2 free)", calcDiscount(repeating, ctx), 22.00);
  const once = makePromo({ promotionType: "bogo", rules: JSON.stringify({ discountStrategy: "cheapest", cheapestDiscount: 100, oncePerOrder: true, groups }) });
  assertEqual("BOGO once-per-order (4 items → 1 free)", calcDiscount(once, ctx), 10.00);
}

function test4b_bogoCheaperOfPairFree() {
  // Luigi 2026-06-07 regression: distinct BOGO groups where the customer put
  // the PRICIER item ($20 pizza) in the "free" group and the cheaper item
  // ($12 wings) in the "paid" group. With a "cheapest" strategy the CHEAPER
  // item ($12) must be the one made free — NOT the pricey free-group pick.
  // Before the fix the engine discounted the free-group item ($20), over-
  // discounting. Cart here is just the two qualifying items.
  console.log("\n[3b] bogo — cheaper of the two picks is free (cross-group)");
  const promo = makePromo({
    promotionType: "bogo",
    rules: JSON.stringify({
      discountStrategy: "cheapest",
      cheapestDiscount: 100,
      groups: [
        { id: "paid", label: "Wings", role: "paid", categoryIds: ["wings"], itemIds: [] },
        { id: "free", label: "Pizza", role: "free", categoryIds: ["mains"], itemIds: [] },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: 32, items: [WINGS, PIZZA] });
  assertEqual("BOGO discounts cheaper $12 wings (not $20 free-group pizza)", calcDiscount(promo, ctx), 12.00);
}

function test5_buyNGetFree() {
  console.log("\n[4/12] buy_n_get_free — buy main + side, get drink 50% off");
  const promo = makePromo({
    promotionType: "buy_n_get_free",
    rules: JSON.stringify({
      discountStrategy: "cheapest",
      cheapestDiscount: 50,
      groups: [
        { id: "m", label: "Main",  role: "paid",     categoryIds: ["mains"],  itemIds: [] },
        { id: "s", label: "Side",  role: "required", categoryIds: ["sides"],  itemIds: [] },
        { id: "d", label: "Drink", role: "free",     categoryIds: ["drinks"], itemIds: [] },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  // Cheapest drink = soda $3, 50% off = $1.50
  assertEqual("buy_n_get_free 50% off soda", calcDiscount(promo, ctx), 1.50);
}

function test6_fixedCart() {
  console.log("\n[5/12] fixed_cart — $5 off any order");
  const promo = makePromo({
    promotionType: "fixed_cart",
    rules: JSON.stringify({ discountAmount: 5 }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  assertEqual("$5 off", calcDiscount(promo, ctx), 5.00);

  // Cap at subtotal
  const small = makeContext({ subtotal: 3, items: [SODA] });
  assertEqual("$5 capped to $3 subtotal", calcDiscount(promo, small), 3.00);
}

function test7_paymentReward() {
  console.log("\n[6/12] payment_reward — 5% off when paying with cash");
  const promo = makePromo({
    promotionType: "payment_reward",
    rules: JSON.stringify({ discountPercent: 5, paymentMethod: "cash" }),
  });
  const ctxMatch = makeContext({ subtotal: CART_TOTAL, items: CART, paymentMethod: "cash" });
  assertEqual("5% off with cash", calcDiscount(promo, ctxMatch), 1.70);

  const ctxMismatch = makeContext({ subtotal: CART_TOTAL, items: CART, paymentMethod: "card" });
  assertEqual("0 off when paying card", calcDiscount(promo, ctxMismatch), 0);
}

function test8_freeItem() {
  console.log("\n[7/12] free_item — spend $30+, free side");
  const promo = makePromo({
    promotionType: "free_item",
    rules: JSON.stringify({
      triggerAmount: 30,
      groups: [{ id: "free", label: "Free side", role: "free", categoryIds: ["sides"], itemIds: [] }],
    }),
  });
  const ctxOver = makeContext({ subtotal: CART_TOTAL, items: CART });
  // Subtotal $34 >= $30 trigger; cheapest matching side = salad $8 free
  assertEqual("free salad when over $30", calcDiscount(promo, ctxOver), 8.00);

  const ctxUnder = makeContext({ subtotal: 25, items: [PIZZA] });
  assertEqual("no discount under $30", calcDiscount(promo, ctxUnder), 0);
}

function test9_mealBundle() {
  console.log("\n[8/12] meal_bundle — pizza + soda + side @ $25 bundle price");
  const promo = makePromo({
    promotionType: "meal_bundle",
    rules: JSON.stringify({
      bundlePrice: 25,
      groups: [
        { id: "m", label: "Main", role: "required", categoryIds: ["mains"],  itemIds: [], minCount: 1 },
        { id: "d", label: "Drink", role: "required", categoryIds: ["drinks"], itemIds: [], minCount: 1 },
        { id: "s", label: "Side", role: "required", categoryIds: ["sides"],  itemIds: [], minCount: 1 },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  // Eligible total = $20 + $6 + $8 = $34; bundle = $25; discount = $9
  assertEqual("meal bundle saves $9", calcDiscount(promo, ctx), 9.00);

  const noSide = makeContext({ subtotal: 26, items: [PIZZA, SODA] });
  assertEqual("no bundle without side", calcDiscount(promo, noSide), 0);
}

function test10_freeDishMeal() {
  console.log("\n[9/12] free_dish_meal — buy pizza, get a free side");
  const promo = makePromo({
    promotionType: "free_dish_meal",
    rules: JSON.stringify({
      discountPercent: 100,
      groups: [
        { id: "t", label: "Trigger", role: "trigger", categoryIds: ["mains"], itemIds: [] },
        { id: "f", label: "Free",    role: "free",    categoryIds: ["sides"], itemIds: [] },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  // Cheapest matching side = salad $8 at 100% = $8 free
  assertEqual("free $8 salad", calcDiscount(promo, ctx), 8.00);
}

function test11_fixedCombo() {
  console.log("\n[10/12] fixed_combo — $5 off when combo conditions met");
  const promo = makePromo({
    promotionType: "fixed_combo",
    rules: JSON.stringify({
      discountAmount: 5,
      groups: [
        { id: "m", label: "Main",  categoryIds: ["mains"],  itemIds: [] },
        { id: "d", label: "Drink", categoryIds: ["drinks"], itemIds: [] },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  assertEqual("$5 combo discount", calcDiscount(promo, ctx), 5.00);
}

function test12_percentageCombo() {
  console.log("\n[11/12] percentage_combo — 15% off main+drink combo");
  const promo = makePromo({
    promotionType: "percentage_combo",
    rules: JSON.stringify({
      discountPercent: 15,
      groups: [
        { id: "m", label: "Main",  categoryIds: ["mains"],  itemIds: [] },
        { id: "d", label: "Drink", categoryIds: ["drinks"], itemIds: [] },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: CART_TOTAL, items: CART });
  // Eligible = $20 (pizza) + $6 (soda) = $26; 15% = $3.90
  assertEqual("15% off $26 combo", calcDiscount(promo, ctx), 3.90);

  // "Only allowed once per order" → discount ONE combo (priciest item per
  // group): pizza $20 + one soda $3 = $23; 15% = $3.45 (not all qualifying
  // items). Luigi 2026-06-07.
  const once = makePromo({
    promotionType: "percentage_combo",
    rules: JSON.stringify({
      discountPercent: 15,
      oncePerOrder: true,
      groups: [
        { id: "m", label: "Main",  categoryIds: ["mains"],  itemIds: [] },
        { id: "d", label: "Drink", categoryIds: ["drinks"], itemIds: [] },
      ],
    }),
  });
  assertEqual("combo once-per-order = one combo ($23 → $3.45)", calcDiscount(once, ctx), 3.45);
}

function test13_mealBundleSpeciality() {
  console.log("\n[12/12] meal_bundle_speciality — same calc as meal_bundle");
  const promo = makePromo({
    promotionType: "meal_bundle_speciality",
    rules: JSON.stringify({
      bundlePrice: 30,
      groups: [
        { id: "m", label: "Pizza", role: "required", categoryIds: ["mains"], itemIds: [], minCount: 1 },
        { id: "w", label: "Wings", role: "required", itemIds: ["wings"],     categoryIds: [], minCount: 1 },
      ],
    }),
  });
  const ctx = makeContext({ subtotal: 32, items: [PIZZA, WINGS] });
  // Eligible = $20 + $12 = $32; bundle = $30; discount = $2
  assertEqual("speciality bundle saves $2", calcDiscount(promo, ctx), 2.00);
}

// ── Stacking + eligibility integration ────────────────────────────────

function test_stackingRules() {
  console.log("\n[stack] stacking — master + exclusive picks best exclusive");
  const exclSmall = makePromo({
    id: "excl-small",
    promotionType: "percentage_off",
    stackingRule: "exclusive",
    rules: JSON.stringify({ discountPercent: 5 }),
  });
  const exclLarge = makePromo({
    id: "excl-large",
    promotionType: "percentage_off",
    stackingRule: "exclusive",
    rules: JSON.stringify({ discountPercent: 20 }),
  });
  const master = makePromo({
    id: "master",
    promotionType: "free_delivery",
    stackingRule: "master",
  });
  const ctx = makeContext({ subtotal: 100, items: [{ ...PIZZA, price: 100, subtotal: 100 }] });

  const results = applyPromotions([exclSmall, exclLarge, master], ctx);
  const exclResult = results.find(r => r.stackingRule === "exclusive");
  const masterResult = results.find(r => r.stackingRule === "master");

  if (!exclResult || exclResult.promoId !== "excl-large") {
    console.log(`  ✗ expected exclusive=excl-large, got ${exclResult?.promoId}`);
    failed++; failures.push("stacking: best exclusive not chosen");
  } else {
    console.log(`  ✓ best exclusive chosen (20% over 5%)`);
    passed++;
  }
  if (!masterResult) {
    console.log(`  ✗ master promo dropped`);
    failed++; failures.push("stacking: master dropped");
  } else {
    console.log(`  ✓ master kept alongside exclusive`);
    passed++;
  }

  // Luigi 2026-06-08: an exclusive that produces $0 (e.g. "10% off pizzas" with
  // no pizzas in the cart) must NOT block a real standard deal. Here the
  // exclusive targets a category absent from the cart, so the standard wins.
  const inertExclusive = makePromo({
    id: "excl-pizzas",
    promotionType: "percentage_off",
    stackingRule: "exclusive",
    rules: JSON.stringify({ discountPercent: 10, groups: [{ id: "g", categoryIds: ["pizzas"], itemIds: [] }] }),
  });
  const realStandard = makePromo({
    id: "std-cart",
    promotionType: "fixed_cart",
    stackingRule: "standard",
    rules: JSON.stringify({ discountAmount: 5 }),
  });
  const noPizzaCtx = makeContext({ subtotal: 100, items: [{ ...PIZZA, categoryId: "mains", price: 100, subtotal: 100 }] });
  const r2 = applyPromotions([inertExclusive, realStandard], noPizzaCtx);
  if (r2.length === 1 && r2[0].promoId === "std-cart") {
    console.log(`  ✓ $0 exclusive doesn't block a real standard`);
    passed++;
  } else {
    console.log(`  ✗ $0 exclusive wrongly blocked the standard (got ${r2.map(r => r.promoId).join(",") || "none"})`);
    failed++; failures.push("stacking: inert exclusive blocked standard");
  }
}

function test_eligibility() {
  console.log("\n[elig] eligibility — minimum order + customer type + scheduling");

  // Minimum order
  const min50 = makePromo({
    promotionType: "percentage_off",
    minimumOrder: 50,
    rules: JSON.stringify({ discountPercent: 10 }),
  });
  const small = makeContext({ subtotal: 30, items: CART });
  const big = makeContext({ subtotal: 75, items: [{ ...PIZZA, price: 75, subtotal: 75 }] });
  const smallResults = applyPromotions([min50], small);
  const bigResults = applyPromotions([min50], big);
  if (smallResults.length === 0) { console.log("  ✓ blocked under minimum"); passed++; }
  else { console.log(`  ✗ should be blocked under min`); failed++; failures.push("elig: minimum order"); }
  if (bigResults.length === 1) { console.log("  ✓ applied above minimum"); passed++; }
  else { console.log(`  ✗ should apply above min`); failed++; failures.push("elig: above minimum"); }

  // New-customer only
  const newOnly = makePromo({
    promotionType: "percentage_off",
    customerType: "new",
    rules: JSON.stringify({ discountPercent: 15 }),
  });
  const newCtx = makeContext({ subtotal: 50, items: [{ ...PIZZA, price: 50, subtotal: 50 }], isNewCustomer: true });
  const returningCtx = makeContext({ subtotal: 50, items: [{ ...PIZZA, price: 50, subtotal: 50 }], isNewCustomer: false });
  if (applyPromotions([newOnly], newCtx).length === 1) { console.log("  ✓ new-customer promo applied to new"); passed++; }
  else { console.log(`  ✗ should apply for new`); failed++; failures.push("elig: new only"); }
  if (applyPromotions([newOnly], returningCtx).length === 0) { console.log("  ✓ new-customer promo blocked for returning"); passed++; }
  else { console.log(`  ✗ should block for returning`); failed++; failures.push("elig: returning blocked"); }

  // Scheduled (expired)
  const expired = makePromo({
    promotionType: "percentage_off",
    endsAt: new Date(Date.now() - 24 * 60 * 60_000),
    rules: JSON.stringify({ discountPercent: 50 }),
  });
  if (applyPromotions([expired], newCtx).length === 0) { console.log("  ✓ expired promo blocked"); passed++; }
  else { console.log(`  ✗ expired should be blocked`); failed++; failures.push("elig: expired"); }

  // Coupon required
  const coupon = makePromo({
    promotionType: "fixed_cart",
    autoApply: false,
    couponCode: "SAVE5",
    rules: JSON.stringify({ discountAmount: 5 }),
  });
  if (applyPromotions([coupon], newCtx).length === 0) { console.log("  ✓ coupon promo not auto-applied"); passed++; }
  else { console.log(`  ✗ coupon should not auto-apply`); failed++; failures.push("elig: coupon auto-apply"); }
  if (applyPromotions([coupon], { ...newCtx, couponCode: "SAVE5" }).length === 1) { console.log("  ✓ coupon applied with code"); passed++; }
  else { console.log(`  ✗ coupon should apply with code`); failed++; failures.push("elig: coupon with code"); }
  if (applyPromotions([coupon], { ...newCtx, couponCode: "WRONG" }).length === 0) { console.log("  ✓ wrong coupon code blocked"); passed++; }
  else { console.log(`  ✗ wrong coupon should block`); failed++; failures.push("elig: wrong coupon"); }
}

// ── Run ───────────────────────────────────────────────────────────────

console.log("═".repeat(60));
console.log("  Fee Free Ordering — Promotion Engine Verification");
console.log("═".repeat(60));

test1_percentageOff();
test2_percentageOffTargeted();
test3_freeDelivery();
test4_bogo();
test4b_bogoCheaperOfPairFree();
test4d_bogoOncePerOrder();
test5_buyNGetFree();
test6_fixedCart();
test7_paymentReward();
test8_freeItem();
test9_mealBundle();
test10_freeDishMeal();
test11_fixedCombo();
test12_percentageCombo();
test13_mealBundleSpeciality();
test_stackingRules();
test_eligibility();

console.log("\n" + "═".repeat(60));
console.log(`  ${passed} passed · ${failed} failed`);
console.log("═".repeat(60));

if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
} else {
  console.log("\nAll promotion types calculate as expected. ✓");
  process.exit(0);
}
