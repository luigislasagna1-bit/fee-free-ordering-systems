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

/**
 * The caller's own number, grouped so the TTS reads it as a phone number rather
 * than one enormous integer. North-American numbers become "647 669 0808";
 * anything else keeps its digits with the country code split off.
 *
 * Why this exists: the prompt has always told Nabil the callback number is
 * "usually their caller ID — confirm it", but the number was never actually put
 * in the prompt, so Nabil COULDN'T confirm it and always asked the caller to
 * recite it instead. On 2026-08-12 that dictation came back from Deepgram as
 * "$6.04 $7.06 $6.09 $0.08 $0.08" — smart-formatting had read the spoken digits
 * as currency — and the call spent two extra turns recovering. Reading a number
 * we already hold back to the caller removes the whole failure mode.
 */
function spokenPhone(e164: string | null | undefined): string | null {
  const raw = (e164 || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null; // not a dialable number (blocked/anonymous)
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return raw.startsWith("+") ? `${raw.slice(0, raw.length - 7)} ${raw.slice(-7)}` : digits;
}

function menuText(menu: any, canBuild = false): string {
  const currency = menu?.restaurant?.currency || "usd";
  const lines: string[] = [];
  // Items that exist but don't run today. The server already removed them from
  // the orderable menu — this list exists purely so a caller who asks for one
  // hears "that's a Thursday special" instead of "we don't have that". There
  // are no ids here on purpose: nothing here can be ordered today.
  const off = menu?.notToday ?? [];
  if (off.length) {
    lines.push(
      `\nNOT AVAILABLE TODAY — these are real items on other days. If a caller asks for one, tell them which day it runs and offer something from the menu below instead. You CANNOT order these today: ${off
        .map((o: any) => `${o.name} (${o.available || "other days"})`)
        .join("; ")}`,
    );
  }
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
      // TODAY'S DEAL on this exact item — the same food, cheaper, running now.
      // The price and the day check were both computed server-side; just offer
      // it. Never work out a saving yourself.
      if (it.todayDeal) {
        const d = it.todayDeal;
        // Sizes carry their OWN ids: the caller's size has to be ordered off
        // the deal item, and a 12" quoted at the 6" price is the whole failure
        // this feature has to avoid.
        const sizes = (d.variants ?? []).length
          ? ` (${d.variants
              .map((v: any) => `${v.name} [id:${v.variantId ?? ""}] ${fmtMoney(v.price, currency)}`)
              .join(", ")})`
          : "";
        lines.push(
          `    ★ TODAY ONLY: "${d.name}" [id:${d.dealItemId ?? ""}] is this exact item for ${fmtMoney(d.price, currency)}${sizes} — OFFER IT instead when they order this.`,
        );
      }
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
 *
 *  "take_orders" USED to return nothing at all, which is how Nabil ended up
 *  telling a caller the restaurant was open while it was closed (Luigi, live,
 *  2026-08-12: said open once, then closed on the next two calls). "Keep taking
 *  orders after hours" is a legitimate owner choice — it must never license
 *  "we're open now". The only thing carrying closed-ness was one quiet line far
 *  below, `- Open now: no`, which the model honoured most of the time and not
 *  always; that intermittency is the signature of an instruction that is too
 *  weak, not of a bug in the hours. Every branch now says the store is closed. */
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
    // "take_orders" (and any unrecognised value) — the owner is happy to keep
    // selling after hours. Taking the order is fine; misrepresenting the state
    // of the shop is not. The caller must be told it is a pre-order for after
    // reopening, because someone who believes the kitchen is cooking now will
    // turn up to a locked door.
    default:
      return `
## CLOSED RIGHT NOW — orders are PRE-ORDERS for later (this OVERRIDES the ordering instructions below)
The restaurant is CLOSED at this moment. You may still take the order, but it is for AFTER the restaurant reopens.${reopen}
NEVER tell the caller the restaurant is open, and never say the food is being made now, will be "right up", or give a delivery or pickup time measured from this moment. Say plainly that you're closed right now and when the order will be ready.
`;
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
  /** The caller's own number (E.164), straight off the call token. */
  callerPhone?: string | null;
}): string {
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
    ? `Items marked PIZZA or COMBO: BUILD them for the caller with add_pizza / add_combo. Say what they asked for in plain words — sizes and toppings by name, and which half each topping goes on ("left"/"right"/"whole"). Only name toppings they want ON it: if they say "no onions", that is NOT a topping to add, it just means don't list onions. Never invent option ids and never type placement codes; the tool resolves names for you. If it returns \`needsInfo\`, ask those questions conversationally, one at a time, then call it again. Use get_item_options when the caller asks what's available.`
    : `Items marked PIZZA-BUILDER or COMBO: do NOT try to build them by voice — say you'll connect them to a team member and call transfer_to_human.`;

  // With quote_order available (v2) there IS a real total before placing —
  // it comes from the same code path that charges. Without it, the only total
  // Nabil may ever state is the one place_order returns.
  const quotingRule = cfg.allowPizzaCombo
    ? `When the caller is done adding, READ BACK the full order, then call quote_order and read the EXACT total it returns — it is authoritative and includes tax. A pizza's price can NEVER be added up from menu prices, so never compute a total yourself. If a discount applied, mention it by name as good news. Get an explicit "yes", then call place_order.`
    : `When the order is complete, READ BACK the full order — every item with its quantity and its menu price — and say the total "will include tax". NEVER announce a computed total before placing: you do not have one, and a number you sum yourself WILL be wrong (no tax, no fees). Get an explicit "yes", call place_order, and then read back the exact total place_order returns — that returned total is the only total you may ever state, it is the authoritative charged amount.`;

  // Mid-order changes. With the edit tools the basket is LIVE — a correction
  // changes the line it refers to. Without them the basket is append-only, and
  // telling the model to "change the right line" only makes it add a second
  // pizza; the honest instruction there is to re-place, not to patch.
  const revisingRule = cfg.allowPizzaCombo
    ? `Keep the running order in mind — every tool result returns it, numbered. When the caller changes something already on it ("actually make that a large", "half mushroom instead of onion on the second one", "forget the wings"), call revise_line or remove_line with that line's number. NEVER add a corrected copy alongside the old one; that charges them twice.`
    : `Track the running order. If the caller changes their mind about something already added, restate the FULL corrected order when you place it — do not assume an earlier item was replaced.`;

  // Sequence rule (Luigi 2026-08-13). Nothing used to say WHEN to collect
  // delivery details, so the model did what it does for pickup: build the whole
  // order, then ask at the end. For delivery that is the wrong way round — the
  // address decides the fee AND whether we can deliver at all, so discovering it
  // last means a caller spends three minutes ordering food we then can't bring
  // them. Ask the moment they say "delivery".
  const deliveryFirstRule = cfg.canTakeOrders
    ? `
## Order sequence — for DELIVERY, settle the address FIRST
Your first question on any order is **pickup or delivery?**

If they say DELIVERY, do ALL of this BEFORE adding a single item:
1. Ask for the full street address — house number and street, city, and postcode.
2. **Call \`check_delivery_address\` straight away.** It tells you whether this restaurant actually delivers there, the delivery fee for that address, and any minimum order. Follow the instruction it returns.
3. Tell the caller the delivery fee${minOrder ? " and the minimum order" : ""} now, in plain words — not after they've chosen their food.
4. Take the caller's name and confirm the callback number (as described above).

This order is not negotiable. The fee and whether we can deliver at all depend on the address. Taking a whole order first and only then finding out we don't reach them — or that it costs three times what they expected — wastes the caller's time and loses the sale.

Use the SAME address wording in check_delivery_address, quote_order and place_order. If the caller corrects their address at any point, call check_delivery_address again with the corrected one — the fee may change.

Read the address back once, in full, before moving on to food. If a piece is missing — no house number, no city — ask for that piece specifically rather than guessing or accepting a partial address. If they give you a landmark or a business name instead of an address, ask for the street address.

For PICKUP the name and callback number can wait until the order is built — don't front-load questions they don't need yet.
`
    : "";

  const orderingSection = cfg.canTakeOrders
    ? `
## Ordering — accuracy is everything
1. Only order items that are in the MENU below, using their exact [id:...]. NEVER invent an item, size, modifier, or price. If a caller asks for something not on the menu, say so and suggest the closest real item.
2. Do not offer or accept an item marked SOLD OUT.
3. ${pizzaRule}
4. Get quantities explicitly. Never assume an unspoken quantity. Normalize vague amounts ("a couple" → confirm "two?").
5. ${revisingRule}
6. Confirm anything you're unsure you heard correctly before adding it.
7. ${quotingRule}
8. After placing, ${cfg.smsConfirmations ? "the receipt is TEXTED to the caller automatically with their order number and a tracking link — tell them it's on its way and do NOT read the order number aloud (a long number said out loud is the easiest thing in a call to mishear). Just confirm the total" : "give the order number clearly and confirm the total"}${cfg.quoteEta ? " and the pickup/ready guidance" : ""}. The place_order result tells you whether the text actually went out — if it did not, read the order number aloud instead.
9. ${schedulingRule}

## Payment (v1)
- Orders are **pay at the store / on pickup** (cash or card in person). Tell the caller that. Do not ask for card numbers over the phone.
- If delivery is PREPAID-only (see services) and the caller wants delivery, explain delivery needs prepayment and offer pickup instead (or transfer).
`
    : "";

  const spokenCaller = spokenPhone(callerPhone);
  const requiredInfo: string[] = [];
  if (cfg.canTakeOrders) {
    requiredInfo.push(
      spokenCaller
        ? `- Pickup: caller's name + a callback number. You ALREADY HAVE their number — read it back for a yes/no ("I have you at ${spokenCaller} — is that the best number?"). Never make them recite it; only ask for digits if they say it's wrong.`
        : "- Pickup: caller's name + a callback number (no caller ID on this call, so you do have to ask).",
    );
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
- HEARING DIGITS: speech-to-text sometimes hands you a spoken number formatted as money or as decimals — "$6.04 $7.06 $0.08" is a caller saying "6 4 7 6 6 9 0 8". When a reply where you expected digits arrives looking like currency, strip the symbols and punctuation and read the remaining digits back for confirmation instead of asking them to start over. If it's still unclear after ONE re-ask, invite them to type it on their keypad — keypad presses reach you as text.
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
${afterHoursSection(context, cfg)}${deliveryFirstRule}${orderingSection}${requiredInfoSection}${questionsSection}${faqSection(context, cfg)}${upsellSection(context, cfg, currency)}
## When to hand off (transfer_to_human)
${cfg.allowPizzaCombo ? "" : "Pizza/combo builds; a"}${cfg.allowPizzaCombo ? "A" : ""}n explicit request for a person; you've misunderstood twice in a row; anything you cannot confidently and correctly complete. It's better to transfer than to risk a wrong order.

${cfg.languages.length ? `
## Language
The phone system detects the caller's language automatically. ANSWER IN THE LANGUAGE THEY SPEAK — if they switch mid-call, switch with them. Keep item names exactly as they appear on the menu below (never translate a dish name), and read prices in the caller's language.
` : ""}
## Style
Short spoken turns. No long lists — offer a couple of options at a time. Confirm, don't interrogate. Be warm and efficient.

## NEVER think out loud
The caller hears every word you write, and they are standing in a kitchen or a car — not reading a log.

- While you are looking something up or fixing an attempt that didn't work, say **at most ONE** short holding phrase ("one moment", "let me get that added"). Do the rest of the work silently across as many tool calls as you need. Do NOT narrate each attempt.
- NEVER describe what went wrong internally, and never use internal words out loud: item, id, modifier, option, slot, tool, catering item, "let me try that again", "let me check that directly", "let me fix this properly". On 2026-08-13 a caller ordering a pizza-and-wings combo heard four sentences of this in a row, including "this is the catering wings item, not the combo's regular wings" — they had no idea what any of it meant and it sounded broken.
- If something genuinely cannot be resolved, don't explain the machinery — say plainly that you're having trouble with that one item and either offer an alternative or transfer_to_human.
- The caller only ever needs to hear: what you understood, what it costs, and what happens next.
You are SPEAKING on a telephone — everything you write is read aloud verbatim by text-to-speech. Plain spoken sentences ONLY: never markdown, asterisks, underscores, bullet points, numbered lists, headings, emojis, or symbols (the first live call read "asterisk asterisk" to the caller). Say prices naturally ("twelve fifty" style is fine, "$12.50" is fine — the TTS handles it) and never format them in bold.

# MENU (live — ${name})
${menuText(menu, cfg.allowPizzaCombo)}`;
}
