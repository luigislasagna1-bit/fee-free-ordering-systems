/**
 * Builds Nabil's per-STORE system prompt and the per-CALL facts.
 *
 * Two outputs, on purpose:
 *   • `system` — playbook + store facts + menu. Identical for every call to
 *     the same store while its menu/hours/config are unchanged, so the
 *     ~40k-token prefix is written to the prompt cache once and READ by every
 *     later call within the TTL (it used to carry the caller's number and name,
 *     which made every call a fresh cache write).
 *   • `callFacts` — who is calling, what we know about them. Goes on the FIRST
 *     user turn, next to the STATE block.
 *
 * Menu facts are names + prices + item ids only. Modifier/variant ids are gone
 * from the prompt: options resolve by NAME server-side, and every capped list
 * is marked "+N more" so the model can never mistake a truncated list for the
 * whole menu (2026-08-15: it told a caller red onion didn't exist).
 */
import type { AgentConfig } from "./agent-config";
import { playbookText } from "./playbook";

type Money = number;

function fmtMoney(n: Money, currency: string): string {
  const sym = currency?.toLowerCase() === "eur" ? "€" : currency?.toLowerCase() === "gbp" ? "£" : "$";
  return `${sym}${(n ?? 0).toFixed(2)}`;
}

/** The caller's own number, grouped so the TTS reads it as a phone number. */
export function spokenPhone(e164: string | null | undefined): string | null {
  const raw = (e164 || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return raw.startsWith("+") ? `${raw.slice(0, raw.length - 7)} ${raw.slice(-7)}` : digits;
}

export function menuText(menu: any, canBuild = false): string {
  const currency = menu?.restaurant?.currency || "usd";
  const lines: string[] = [];
  const off = menu?.notToday ?? [];
  if (off.length) {
    lines.push(
      `\nNOT AVAILABLE TODAY — real items on other days. If a caller asks for one, say which day it runs and offer something below instead. You CANNOT order these today: ${off
        .map((o: any) => `${o.name} (${o.available || "other days"})`)
        .join("; ")}`,
    );
  }
  for (const cat of menu?.menu ?? []) {
    lines.push(`\n## ${cat.category}`);
    for (const it of cat.items ?? []) {
      const flags = [
        it.isSoldOut ? "SOLD OUT" : "",
        it.isPizza ? (canBuild ? "PIZZA" : "PIZZA — transfer") : "",
        it.isCombo ? (canBuild ? "COMBO" : "COMBO — transfer") : "",
      ]
        .filter(Boolean)
        .join(", ");
      const headlinePrice = it.variants?.length || it.hasVariants ? "" : ` ${fmtMoney(it.price, currency)}`;
      lines.push(`- ${it.name} [id:${it.menuItemId}]${headlinePrice}${flags ? ` (${flags})` : ""}`);
      if (it.todayDeal) {
        const d = it.todayDeal;
        const sizes = (d.variants ?? []).length ? ` (${d.variants.map((v: any) => `${v.name} ${fmtMoney(v.price, currency)}`).join(", ")})` : "";
        lines.push(`    ★ TODAY ONLY: "${d.name}" [id:${d.dealItemId ?? ""}] is this exact item for ${fmtMoney(d.price, currency)}${sizes} — offer it instead when they order this.`);
      }
      if (it.description) lines.push(`    ${String(it.description).slice(0, 140)}`);
      if (it.variants?.length) {
        lines.push(`    sizes: ${it.variants.map((v: any) => `${v.name} ${fmtMoney(v.price, currency)}`).join("; ")}`);
      }
      if (it.sizeNames?.length) lines.push(`    sizes (names only — get_item_options for prices): ${it.sizeNames.join(", ")}`);
      for (const g of it.choiceNames ?? []) {
        if (!g?.options?.length) continue;
        const more = g.andMore ? ` (+${g.andMore} more — get_item_options)` : "";
        lines.push(`    ${g.name} (names only): ${g.options.join(", ")}${more}`);
      }
      if (it.choiceGroupsOmitted) lines.push(`    (+${it.choiceGroupsOmitted} more option groups — get_item_options)`);
      for (const g of it.modifierGroups ?? []) {
        const opts = (g.options ?? []).map((o: any) => `${o.name}${o.priceAdjustment ? ` (+${fmtMoney(o.priceAdjustment, currency)})` : ""}`).join(", ");
        if (!opts) continue;
        const req = g.required || (g.minSelect ?? 0) > 0 ? "required" : "optional";
        const range = g.maxSelect ? `choose ${g.minSelect ?? 0}-${g.maxSelect}` : `choose ${g.minSelect ?? 0}+`;
        lines.push(`    ${g.name} (${req}, ${range}): ${opts}`);
      }
    }
  }
  return lines.join("\n");
}

function servicesText(ctx: any, cfg: AgentConfig): string {
  const s = ctx?.services ?? {};
  const parts: string[] = [];
  const pausedNote = cfg.smsConfirmations
    ? "kitchen PAUSED right now — no immediate orders by phone; offer to text the online ordering link so the caller can schedule for after the pause"
    : "kitchen PAUSED right now — no immediate orders by phone; apologize and suggest trying again after the pause";
  const entry = (k: string, label: string) => {
    if (!s[k]?.offered) return;
    parts.push(s[k]?.pausedNow ? `${label} (${pausedNote})` : label);
  };
  entry("pickup", "pickup");
  entry("delivery", ctx?.delivery?.cashDeliveryBlocked ? "delivery (PREPAID only — no cash at door)" : "delivery");
  entry("reservations", "reservations");
  return parts.length ? parts.join(", ") : "none right now";
}

function afterHoursSection(context: any, cfg: AgentConfig): string {
  if (context?.open?.isOpenNow) return "";
  const nextOpen = context?.open?.nextOpenAt;
  const tz = context?.restaurant?.timezone;
  const reopen = nextOpen ? ` The restaurant next opens at ${nextOpen} (restaurant timezone: ${tz || "unknown"}) — say that time in natural spoken words, in local time.` : "";
  const behavior = cfg.afterHoursBehavior === "reservations_only" && !cfg.canBookReservations ? "message_only" : cfg.afterHoursBehavior;
  switch (behavior) {
    case "reservations_only":
      return `\n## CLOSED RIGHT NOW — reservations only (this OVERRIDES the ordering flow)\nThe restaurant is closed. Do NOT take any food order — politely explain the restaurant is closed.${reopen} You may still book reservations for future dates and answer questions.\n`;
    case "message_only":
      return `\n## CLOSED RIGHT NOW — questions only (this OVERRIDES ordering and reservations)\nThe restaurant is closed. Do NOT take orders or book reservations — politely explain the restaurant is closed and answer questions only.${reopen}\n`;
    case "transfer":
      return `\n## CLOSED RIGHT NOW — offer staff (this OVERRIDES ordering and reservations)\nThe restaurant is closed. Do NOT take orders or book reservations yourself — answer simple questions and offer transfer_to_human for anything else.${reopen}\n`;
    default:
      return `\n## CLOSED RIGHT NOW — orders are PRE-ORDERS for later (this OVERRIDES the ordering flow)\nThe restaurant is CLOSED at this moment. You may still take the order, but it is for AFTER the restaurant reopens.${reopen}\nNEVER say the restaurant is open, never say the food is being made now or give a time measured from this moment. Say plainly that you're closed right now and when the order will be ready.\n`;
  }
}

function faqSection(context: any, cfg: AgentConfig): string {
  if (!cfg.canAnswerFaq) return "";
  const faqs = Array.isArray(context?.faqs) ? context.faqs.filter((f: any) => f?.q && f?.a) : [];
  if (!faqs.length) return "";
  const lines = faqs.slice(0, 30).map((f: any) => `Q: ${String(f.q).trim()}\nA: ${String(f.a).trim()}`);
  return `\n## RESTAURANT FAQ (owner-provided — authoritative; rephrase for speech, never change a fact)\n${lines.join("\n")}\n`;
}

function upsellSection(context: any, cfg: AgentConfig, currency: string): string {
  if (!cfg.canTakeOrders) return "";
  const ups = Array.isArray(context?.upsells) ? context.upsells.filter((u: any) => u?.name) : [];
  if (!ups.length) return "";
  const lines = ups.slice(0, 5).map((u: any) => `- ${u.name} — ${fmtMoney(Number(u.price ?? 0), currency)}${u.note ? ` (${String(u.note).slice(0, 100)})` : ""}`);
  return `\n## UPSELL SUGGESTIONS\nSuggest AT MOST ONE of these per call, only when it fits what they're ordering, price included. Never after they decline extras, never during the read-back or after placing. If declined, drop it for good.\n${lines.join("\n")}\n`;
}

export type BuiltPrompt = { system: string; callFacts: string };

export function buildSystemPrompt(args: {
  menu: any;
  context: any;
  returningCaller: any;
  cfg: AgentConfig;
  callerPhone?: string | null;
}): BuiltPrompt {
  const { menu, context, returningCaller, cfg, callerPhone } = args;
  const name = context?.restaurant?.name || menu?.restaurant?.name || "the restaurant";
  const openNow = context?.open?.isOpenNow;
  const todayHours = context?.open?.todayHours;
  const address = context?.restaurant?.address;
  const minOrder = context?.delivery?.minimumOrder;
  const currency = menu?.restaurant?.currency || "usd";

  const caps: string[] = [];
  if (cfg.canTakeOrders) caps.push("take pickup/delivery orders");
  if (cfg.canBookReservations) caps.push("book reservations");
  if (cfg.canAnswerFaq) caps.push("answer questions");

  const pickupEta = context?.pickup?.estimatedMinutes;
  const deliveryEta = context?.delivery?.estimatedMinutes;
  const etaLine = cfg.quoteEta
    ? pickupEta || deliveryEta
      ? `- Estimated ready times (approximate — "about", never a promise): ${[pickupEta ? `pickup about ${pickupEta} minutes` : "", deliveryEta ? `delivery about ${deliveryEta} minutes` : ""].filter(Boolean).join(", ")}`
      : ""
    : "- NEVER promise or estimate how long an order will take; say it will be ready as soon as possible and the store can confirm timing.";
  const schedulingRule = !cfg.allowScheduledOrders
    ? "- Scheduled orders: RIGHT NOW only — politely decline requests for a later time or day."
    : cfg.smsConfirmations
      ? "- Scheduled orders: not possible by phone yet — offer to text the online ordering link (send_sms_link order_online)."
      : "- Scheduled orders: not possible by phone yet — suggest the restaurant's online ordering page.";
  const paymentLine = "- Payment: orders are pay at the store / on pickup (cash or card in person). Never ask for card numbers over the phone." +
    (context?.delivery?.cashDeliveryBlocked ? " Delivery is PREPAID-only — explain and offer pickup instead (or transfer)." : "");

  const system = `${playbookText(cfg)}

## About ${name}
- You: ${caps.length ? caps.join(", ") : "help callers and connect them to staff"}.
- Services available: ${servicesText(context, cfg)}
- Open now: ${openNow ? "yes" : "no"}${todayHours ? ` (today: ${todayHours})` : ""}
- Address: ${address || "n/a"}
${minOrder ? `- Delivery minimum: ${fmtMoney(minOrder, currency)}\n` : ""}${etaLine}
${schedulingRule}
${paymentLine}
${afterHoursSection(context, cfg)}${faqSection(context, cfg)}${upsellSection(context, cfg, currency)}${
    cfg.languages.length
      ? `\n## Language\nThe phone system detects the caller's language. Answer in the language they speak; if they switch, switch with them. Keep item names exactly as on the menu.\n`
      : ""
  }
# MENU (live — ${name}). Item ids in [id:…] are what add_to_order takes. Option lists are names only; "+N more" means the list is truncated — get_item_options has the full one.
${menuText(menu, cfg.allowPizzaCombo)}`;

  // Per-call facts — first user turn only.
  const facts: string[] = [];
  const spoken = spokenPhone(callerPhone);
  if (spoken) {
    facts.push(`Caller ID: ${spoken}. That is the callback number — confirm it ("I have you at ${spoken} — is that the best number?"), never make them recite it.`);
  } else {
    facts.push("No caller ID on this call — you will need to ask for a callback number (invite keypad entry if it's unclear twice).");
  }
  const knownName: string | null =
    (returningCaller?.found && typeof returningCaller?.name === "string" && returningCaller.name.trim() ? returningCaller.name.trim() : null) ??
    (typeof returningCaller?.nameHint === "string" && returningCaller.nameHint.trim() ? returningCaller.nameHint.trim() : null);
  if (knownName) facts.push(`Name on file for this number: ${knownName} — offer it ONLY when you settle the name near the end of the order (FLOW step 3: "Is this for ${knownName}?"), never in the greeting or before the food; take a fresh name if they correct you.`);
  if (returningCaller?.found && returningCaller?.name) {
    const last = returningCaller.lastOrder?.items?.map((i: any) => `${i.quantity}× ${i.name}`).join(", ");
    facts.push(`Returning caller (${returningCaller.orderCount ?? 0} past orders).${last ? ` Last order: ${last}. You may offer "the usual".` : ""} Greet them by first name.`);
  }
  return { system, callFacts: facts.join("\n") };
}
