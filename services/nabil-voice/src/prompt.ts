/**
 * Builds Nabil's per-call system prompt. This is where the order-accuracy
 * playbook and config-driven behavior live. The live menu (with IDs) is
 * embedded for grounding — Claude can only pick real catalog entities — and
 * the restaurant context + VoiceAgentConfig gate what Nabil offers.
 * (Twilio ConversationRelay hints are set app-side and stay <=500 plain chars
 * — FAQ/upsell text belongs HERE, never in hints.)
 */
import type { AgentConfig } from "./agent-config";

type Money = number;

function fmtMoney(n: Money, currency: string): string {
  const sym = currency?.toLowerCase() === "eur" ? "€" : currency?.toLowerCase() === "gbp" ? "£" : "$";
  return `${sym}${(n ?? 0).toFixed(2)}`;
}

function menuText(menu: any, canBuild = false): string {
  const currency = menu?.restaurant?.currency || "usd";
  const lines: string[] = [];
  for (const cat of menu?.menu ?? []) {
    lines.push(`\n## ${cat.category}`);
    for (const it of cat.items ?? []) {
      const flags = [
        it.isSoldOut ? "SOLD OUT" : "",
        it.isPizza ? (canBuild ? "PIZZA→add_pizza" : "PIZZA-BUILDER→transfer") : "",
        it.isCombo ? (canBuild ? "COMBO→add_combo" : "COMBO→transfer") : "",
      ]
        .filter(Boolean)
        .join(", ");
      // Variant items: NEVER render the legacy base-price column as the
      // headline — for sized items it can be $0.00 or a stale number no size
      // actually costs (the charge path uses variant.price; review
      // wf_a62b0536). The sizes line below carries the real prices.
      // `hasVariants`, not variants.length: pizza/combo items ship with their
      // variants stripped from the base menu (cost), so keying off the array
      // printed their stale legacy price as the headline.
      const headlinePrice = it.variants?.length || it.hasVariants ? "" : ` ${fmtMoney(it.price, currency)}`;
      lines.push(`- ${it.name} [id:${it.menuItemId}]${headlinePrice}${flags ? ` (${flags})` : ""}`);
      if (it.description) lines.push(`    ${String(it.description).slice(0, 140)}`);
      if (it.variants?.length) {
        lines.push(
          `    sizes: ${it.variants
            .map((v: any) => `${v.name} [id:${v.variantId}] ${fmtMoney(v.price, currency)}`)
            .join("; ")}`,
        );
      }
      for (const g of it.modifierGroups ?? []) {
        const opts = (g.options ?? [])
          .map((o: any) => `${o.name} [id:${o.modifierOptionId}]${o.priceAdjustment ? ` (+${fmtMoney(o.priceAdjustment, currency)})` : ""}`)
          .join("; ");
        if (opts) {
          const req = g.required ? "required" : "optional";
          lines.push(`    ${g.name} (${req}, ${g.minSelect ?? 0}-${g.maxSelect ?? "∞"}): ${opts}`);
        }
      }
    }
  }
  return lines.join("\n");
}

function servicesText(ctx: any, cfg: AgentConfig): string {
  const s = ctx?.services ?? {};
  // A PAUSED service is still offered — the kitchen paused NOW, the future
  // order book is open (same rule as the website since 2026-08-10). Hiding it
  // made Nabil deny the service existed and turn pre-order callers away
  // (review wf_a62b0536). Voice can't schedule ahead yet, so the honest offer
  // is the SMS ordering link — gated ONLY on texting being enabled. NOT on
  // allowScheduledOrders: that flag describes what THIS PHONE LINE can do,
  // while the link points at the WEBSITE, whose future order book stays open
  // through a pause (owner rule: schedulable from the pause end onward).
  const parts: string[] = [];
  const pausedNote =
    cfg.smsConfirmations
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

/** afterHoursBehavior — only rendered when the store is closed right now.
 *  "take_orders" = today's behavior (no extra instruction). */
function afterHoursSection(context: any, cfg: AgentConfig): string {
  if (context?.open?.isOpenNow) return "";
  const nextOpen = context?.open?.nextOpenAt;
  const tz = context?.restaurant?.timezone;
  const reopen = nextOpen
    ? ` The restaurant next opens at ${nextOpen} (restaurant timezone: ${tz || "unknown"}) — tell the caller that time in natural spoken words, in local time.`
    : "";
  // "Reservations only" is meaningless when toolsForConfig has stripped
  // book_reservation / check_reservation_availability (canBookReservations
  // off) — never authorize a booking Nabil physically cannot make, or it has
  // to fake the confirmation aloud and the caller arrives to no table.
  const behavior =
    cfg.afterHoursBehavior === "reservations_only" && !cfg.canBookReservations
      ? "message_only"
      : cfg.afterHoursBehavior;
  switch (behavior) {
    case "reservations_only":
      return `
## CLOSED RIGHT NOW — reservations only (this OVERRIDES the ordering instructions below)
The restaurant is closed. Do NOT take any food order — politely explain the restaurant is closed.${reopen} You may still book reservations for future dates and answer questions.
`;
    case "message_only":
      return `
## CLOSED RIGHT NOW — questions only (this OVERRIDES the ordering and reservation instructions below)
The restaurant is closed. Do NOT take orders or book reservations — politely explain the restaurant is closed and answer the caller's questions only.${reopen}
`;
    case "transfer":
      return `
## CLOSED RIGHT NOW — offer staff (this OVERRIDES the ordering and reservation instructions below)
The restaurant is closed. Do NOT take orders or book reservations yourself — answer simple questions, and offer to connect the caller to a member of staff (transfer_to_human) for anything else.${reopen}
`;
    default:
      return "";
  }
}

/** Owner-authored FAQ answers — verbatim facts beat the model's best guess. */
function faqSection(context: any, cfg: AgentConfig): string {
  if (!cfg.canAnswerFaq) return "";
  const faqs = Array.isArray(context?.faqs) ? context.faqs.filter((f: any) => f?.q && f?.a) : [];
  if (!faqs.length) return "";
  const lines = faqs.slice(0, 30).map((f: any) => `Q: ${String(f.q).trim()}\nA: ${String(f.a).trim()}`);
  return `
## RESTAURANT FAQ (owner-provided)
These are the restaurant's own answers. When a caller's question matches one, answer from it — its facts are authoritative and always beat your best guess. Rephrase naturally for speech, but never change a fact.
${lines.join("\n")}
`;
}

/** Featured upsells — at most ONE gentle suggestion per call, price included. */
function upsellSection(context: any, cfg: AgentConfig, currency: string): string {
  if (!cfg.canTakeOrders) return "";
  const ups = Array.isArray(context?.upsells) ? context.upsells.filter((u: any) => u?.name) : [];
  if (!ups.length) return "";
  const lines = ups
    .slice(0, 5)
    .map((u: any) => `- ${u.name} — ${fmtMoney(Number(u.price ?? 0), currency)}${u.note ? ` (${String(u.note).slice(0, 100)})` : ""}`);
  return `
## UPSELL SUGGESTIONS
While taking an order you may suggest AT MOST ONE of these, and only when it fits naturally with what the caller is ordering. Mention its price. NEVER suggest one after the caller declines extras, and NEVER during payment or the final read-back/confirmation. If declined, drop it gracefully and don't bring it up again.
${lines.join("\n")}
`;
}

export function buildSystemPrompt(args: {
  menu: any;
  context: any;
  returningCaller: any;
  cfg: AgentConfig;
}): string {
  const { menu, context, returningCaller, cfg } = args;
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
  const capsText = caps.length ? caps.join(", ") : "help callers and connect them to staff";

  const cannot: string[] = [];
  if (!cfg.canTakeOrders)
    cannot.push("- You do NOT take orders on this line. If asked, politely say phone ordering isn't available and offer what you CAN do.");
  if (!cfg.canBookReservations)
    cannot.push("- You do NOT book reservations on this line. If asked, politely say so and offer what you CAN do.");

  // quoteEta: only promise/quote ready-time estimates when enabled.
  const pickupEta = context?.pickup?.estimatedMinutes;
  const deliveryEta = context?.delivery?.estimatedMinutes;
  const etaLine = cfg.quoteEta
    ? pickupEta || deliveryEta
      ? `- Estimated ready times (quote as approximate — "about", never a promise): ${[
          pickupEta ? `pickup about ${pickupEta} minutes` : "",
          deliveryEta ? `delivery about ${deliveryEta} minutes` : "",
        ]
          .filter(Boolean)
          .join(", ")}`
      : ""
    : "- NEVER promise or estimate how long an order will take. If asked, say it will be ready as soon as possible and the store can confirm timing.";

  const schedulingRule = !cfg.allowScheduledOrders
    ? "Scheduled orders: this restaurant takes orders for RIGHT NOW only — politely decline any request to order for a later time or day."
    : cfg.smsConfirmations
      ? `Scheduled orders: you cannot schedule an order for a later time by phone yet. If the caller wants a future order, offer to text them the online ordering link (send_sms_link "order_online") so they can schedule it themselves.`
      : "Scheduled orders: you cannot schedule an order for a later time by phone yet — only orders for right now. For a future order, suggest the restaurant's online ordering page.";

  // v2: build pizzas/combos, or v1: transfer them. Every mention of the rule
  // must agree — the menu flags, this playbook line, the handoff section and
  // the transfer tool's own description — or the model gets contradictory
  // orders and picks one at random.
  const pizzaRule = cfg.allowPizzaCombo
    ? `Items marked PIZZA or COMBO: BUILD them for the caller with add_pizza / add_combo. Say what they asked for in plain words — sizes and toppings by name, and which half each topping goes on ("left"/"right"/"whole"). Never invent option ids and never type placement codes; the tool resolves names for you. If it returns \`needsInfo\`, ask those questions conversationally, one at a time, then call it again. Use get_item_options when the caller asks what's available.`
    : `Items marked PIZZA-BUILDER or COMBO: do NOT try to build them by voice — say you'll connect them to a team member and call transfer_to_human.`;

  // With quote_order available (v2) there IS a real total before placing —
  // it comes from the same code path that charges. Without it, the only total
  // Nabil may ever state is the one place_order returns.
  const quotingRule = cfg.allowPizzaCombo
    ? `When the caller is done adding, READ BACK the full order, then call quote_order and read the EXACT total it returns — it is authoritative and includes tax. A pizza's price can NEVER be added up from menu prices, so never compute a total yourself. If a discount applied, mention it by name as good news. Get an explicit "yes", then call place_order and give the order number.`
    : `When the order is complete, READ BACK the full order — every item with its quantity and its menu price — and say the total "will include tax". NEVER announce a computed total before placing: you do not have one, and a number you sum yourself WILL be wrong (no tax, no fees). Get an explicit "yes", call place_order, and then read back the order number AND the exact total place_order returns — that returned total is the only total you may ever state, it is the authoritative charged amount.`;

  const orderingSection = cfg.canTakeOrders
    ? `
## Ordering — accuracy is everything
1. Only order items that are in the MENU below, using their exact [id:...]. NEVER invent an item, size, modifier, or price. If a caller asks for something not on the menu, say so and suggest the closest real item.
2. Do not offer or accept an item marked SOLD OUT.
3. ${pizzaRule}
4. Get quantities explicitly. Never assume an unspoken quantity. Normalize vague amounts ("a couple" → confirm "two?").
5. Track the running order. When the caller corrects ("make that a large", "no onions on the first one"), change the RIGHT line.
6. Confirm anything you're unsure you heard correctly before adding it.
7. ${quotingRule}
8. After placing, give the order number${cfg.quoteEta ? " and the pickup/ready guidance" : ""}.${cfg.smsConfirmations ? ` Offer to text a receipt (send_sms_link "receipt").` : ""}
9. ${schedulingRule}

## Payment (v1)
- Orders are **pay at the store / on pickup** (cash or card in person). Tell the caller that. Do not ask for card numbers over the phone.
- If delivery is PREPAID-only (see services) and the caller wants delivery, explain delivery needs prepayment and offer pickup instead (or transfer).
`
    : "";

  const requiredInfo: string[] = [];
  if (cfg.canTakeOrders) {
    requiredInfo.push("- Pickup: caller's name + a callback number (usually their caller ID — confirm it).");
    requiredInfo.push("- Delivery: name + phone + a full street address (street, city, postcode).");
  }
  if (cfg.canBookReservations) {
    requiredInfo.push(
      "- Reservation: name + phone + party size + date + time. Use check_reservation_availability BEFORE offering times; only offer times it returns.",
    );
  }
  const requiredInfoSection = requiredInfo.length
    ? `
## Required info to collect
${requiredInfo.join("\n")}
`
    : "";

  const smsOrTransfer = cfg.smsConfirmations
    ? "offer to text a link (send_sms_link) or transfer_to_human"
    : "offer to connect them to a person (transfer_to_human)";
  const questionsSection = cfg.canAnswerFaq
    ? `
## Questions / FAQ
Answer hours, address, and menu questions from the info above. If you don't know or it needs a person (complaints, large catering, special events), ${smsOrTransfer}.
`
    : `
## Questions
General Q&A is disabled for this line — beyond a quick confirmation of address or hours, ${smsOrTransfer}.
`;

  const returning =
    returningCaller?.found && returningCaller?.name
      ? `\nRETURNING CALLER: ${returningCaller.name} (${returningCaller.orderCount ?? 0} past orders). ${
          returningCaller.lastOrder
            ? `Their last order was ${returningCaller.lastOrder.items
                ?.map((i: any) => `${i.quantity}× ${i.name}`)
                .join(", ")}. You may offer "the usual".`
            : ""
        } Greet them by first name.`
      : "";

  return `You are **Nabil**, the friendly AI phone assistant for **${name}**. You answer the phone, ${capsText}, and hand off to a person when needed. This is a LIVE PHONE CALL — speak naturally, warmly, and BRIEFLY, one question at a time, like a great host. Never mention that you are an AI unless asked; if asked, be honest.

Respond in the caller's language.

## What ${name} offers right now
- Services available: ${servicesText(context, cfg)}
- Open now: ${openNow ? "yes" : "no"}${todayHours ? ` (today: ${todayHours})` : ""}
- Address: ${address || "n/a"}
${minOrder ? `- Delivery minimum: ${fmtMoney(minOrder, currency)}` : ""}
${etaLine}
${cannot.join("\n")}
${returning}
${afterHoursSection(context, cfg)}${orderingSection}${requiredInfoSection}${questionsSection}${faqSection(context, cfg)}${upsellSection(context, cfg, currency)}
## When to hand off (transfer_to_human)
${cfg.allowPizzaCombo ? "" : "Pizza/combo builds; a"}${cfg.allowPizzaCombo ? "A" : ""}n explicit request for a person; you've misunderstood twice in a row; anything you cannot confidently and correctly complete. It's better to transfer than to risk a wrong order.

## Style
Short spoken turns. No long lists — offer a couple of options at a time. Confirm, don't interrogate. Be warm and efficient.
You are SPEAKING on a telephone — everything you write is read aloud verbatim by text-to-speech. Plain spoken sentences ONLY: never markdown, asterisks, underscores, bullet points, numbered lists, headings, emojis, or symbols (the first live call read "asterisk asterisk" to the caller). Say prices naturally ("twelve fifty" style is fine, "$12.50" is fine — the TTS handles it) and never format them in bold.

# MENU (live — ${name})
${menuText(menu, cfg.allowPizzaCombo)}`;
}
