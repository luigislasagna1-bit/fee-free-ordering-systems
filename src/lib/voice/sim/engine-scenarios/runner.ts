/**
 * Runs an EngineScenario: the production tool layer (executeTool → CartEngine
 * → compilerFromApi → fake backend → the REAL compiler over the fixture) with
 * no model in the loop, then compares the cart to the expectation with the
 * same canonical/compare code the LLM tier uses. See types.ts.
 */
import { CartEngine } from "../../../../../services/nabil-voice/src/cart-engine";
import { buildMenuIndex } from "../../../../../services/nabil-voice/src/menu-index";
import { compilerFromApi } from "../../../../../services/nabil-voice/src/compiler-port";
import { canonicalPhone, executeTool, type ToolContext } from "../../../../../services/nabil-voice/src/tools";
import { normalizeAgentConfig } from "../../../../../services/nabil-voice/src/agent-config";
import type { VoiceApi } from "../../../../../services/nabil-voice/src/api";
import { createFakeBackend } from "../fake-backend";
import { toCanonicalFromCart } from "../canonical";
import { compareCarts } from "../compare-carts";
import { isRoboticUtterance } from "../metrics";
import type { MenuSnapshot } from "../snapshot-types";
import type { CanonicalCart } from "../scenario-types";
import type { EngineRunResult, EngineScenario } from "./types";

function withNames(cart: CanonicalCart, snapshot: MenuSnapshot): CanonicalCart {
  return {
    lines: cart.lines.map((l) => ({
      ...l,
      name: l.name ?? snapshot.items[l.item]?.name,
      ...(l.picks ? { picks: l.picks.map((p) => ({ ...p, name: p.name ?? snapshot.items[p.item]?.name })) } : {}),
    })),
  };
}

export async function runEngineScenario(scn: EngineScenario, snapshot: MenuSnapshot): Promise<EngineRunResult> {
  const backend = createFakeBackend(snapshot, { open: true });
  const menuPayload = await backend.menu(snapshot.slug);
  const menu = buildMenuIndex(menuPayload);
  const cfg = normalizeAgentConfig({ allowPizzaCombo: true, canTakeOrders: true });
  const token = { restaurantId: snapshot.restaurantId, slug: snapshot.slug, callSid: `ENG${scn.id}`, to: "+13656581458", from: "+16475550100" };
  const cart = new CartEngine({
    compiler: compilerFromApi(backend as unknown as VoiceApi, token.slug),
    menu,
    askGroupIds: cfg.pizzaAskGroups,
    offerDeals: cfg.offerDayDeals,
    allowPizzaCombo: true,
    callerId: canonicalPhone(token.from) || null,
    knownName: null,
  });
  const ctx: ToolContext = {
    token,
    cfg,
    api: backend as unknown as VoiceApi,
    cart,
    menu,
    cashDeliveryBlocked: false,
    pendingTransfer: null,
    itemOptionsCache: new Map(),
    speakExactlyThisTurn: [],
    currency: snapshot.pricing.currency || "usd",
  };

  const reasons: string[] = [];
  const spoken: string[] = [];
  let i = 0;
  for (const op of scn.ops) {
    i++;
    if (!op.sameTurn) cart.beginTurn();
    ctx.speakExactlyThisTurn = [];
    ctx.lastUserText = op.said;
    let out: any;
    try {
      out = await executeTool(op.tool, op.input, ctx);
    } catch (e) {
      reasons.push(`op ${i} ${op.tool} threw: ${String((e as Error)?.message ?? e)}`);
      break;
    }
    const ok = !(out?.error) && out?.ok !== false;
    const want = op.expect ?? {};
    const wantOk = want.ok ?? true;
    if (ok !== wantOk) reasons.push(`op ${i} ${op.tool}: expected ${wantOk ? "ok" : "refusal"} but got ${ok ? "ok" : `${out?.code ?? "error"}: ${String(out?.message ?? "").slice(0, 120)}`}`);
    if (want.code && out?.code !== want.code) reasons.push(`op ${i} ${op.tool}: expected code ${want.code}, got ${out?.code ?? "none"}`);
    const speak = typeof out?.speakExactly === "string" ? out.speakExactly : "";
    if (speak) {
      spoken.push(speak);
      const why = isRoboticUtterance(speak);
      if (why) reasons.push(`op ${i} ${op.tool}: robotic speakExactly (${why}): "${speak.slice(0, 120)}"`);
    }
    if (want.speaks && !speak.includes(want.speaks)) reasons.push(`op ${i} ${op.tool}: speakExactly should contain "${want.speaks}" — got "${speak.slice(0, 160)}"`);
    if (want.mustNotSpeak && new RegExp(want.mustNotSpeak, "i").test(speak)) reasons.push(`op ${i} ${op.tool}: speakExactly must not match /${want.mustNotSpeak}/ — got "${speak.slice(0, 160)}"`);
  }

  const state = cart.snapshot();
  const actual = toCanonicalFromCart(state, snapshot);
  const diff = compareCarts(actual, withNames(scn.expected.cart, snapshot));
  if (!diff.exact) reasons.push(`cart mismatch: ${diff.humanSummary.join(" | ")}`);
  const problems = cart.validate().filter((p) => p.blocking).map((p) => p.code);
  const expectedProblems = scn.expected.problems ?? [];
  const unexpected = problems.filter((p) => !expectedProblems.includes(p) && !["cart_empty", "fulfilment_missing", "customer_name_missing"].includes(p));
  if (unexpected.length) reasons.push(`unexpected blocking problems: ${unexpected.join(", ")}`);
  for (const p of expectedProblems) if (!problems.includes(p)) reasons.push(`expected blocking problem ${p} is missing`);
  if (scn.expected.fulfilment && state.fulfilment.type !== scn.expected.fulfilment) reasons.push(`fulfilment ${state.fulfilment.type} ≠ ${scn.expected.fulfilment}`);
  if (scn.expected.customerName && state.customer.name !== scn.expected.customerName) reasons.push(`customer ${state.customer.name} ≠ ${scn.expected.customerName}`);

  return { id: scn.id, pass: reasons.length === 0, reasons, cartDiffSummary: diff.humanSummary.join(" | "), spoken, problems, ops: scn.ops.length };
}
