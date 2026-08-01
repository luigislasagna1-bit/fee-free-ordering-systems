/**
 * Which cart lines does the promo PREVIEW send for evaluation?
 *
 * One predicate, exported so it can be unit-tested — because getting it wrong
 * is invisible: the line simply never reaches the engine and every promo
 * computes $0 on it with no error anywhere.
 *
 * The distinction that matters (Luigi 2026-08-01, "Large / Wings Combo"):
 *
 *  - PROMO BUNDLE ("2 pizzas $30", built by a promotion): its price IS the
 *    deal. It has no real MenuItem (synthetic bundle:<promoId> id) and must
 *    stay OUT of promo evaluation, or the deal price gets re-discounted.
 *
 *  - COMBO MENU ITEM (MenuItem.comboConfig — "Large / Wings Combo"): an
 *    ordinary menu item with child slots. It has a real id, a real category,
 *    and the owner can target it with promotions like any other dish. The cart
 *    marks it isBundle:true purely to reuse the parent+children RENDERING, with
 *    isCombo:true to tell it apart — but the preview filter read only isBundle
 *    and threw combos away. Net effect: a VIP special explicitly targeting the
 *    combo's category showed $0 in the cart… while the CHARGE path has always
 *    included combo lines (orders/route.ts pushes them with their real
 *    menuItemId — "combos ARE real menu items"). So the preview under-promised
 *    what the server would actually charge. This predicate makes the preview
 *    agree with the charge, which is the entire contract of the shared context
 *    (Blocker #7: preview == charge, always).
 */
export function includeLineInPromoEval(line: { isBundle?: boolean; isCombo?: boolean }): boolean {
  return !line.isBundle || line.isCombo === true;
}
