/**
 * Builds Nabil's per-call system prompt. This is where the order-accuracy
 * playbook and config-driven behavior live. The live menu (with IDs) is
 * embedded for grounding — Claude can only pick real catalog entities — and
 * the restaurant context gates what Nabil offers.
 */

type Money = number;

function fmtMoney(n: Money, currency: string): string {
  const sym = currency?.toLowerCase() === "eur" ? "€" : currency?.toLowerCase() === "gbp" ? "£" : "$";
  return `${sym}${(n ?? 0).toFixed(2)}`;
}

function menuText(menu: any): string {
  const currency = menu?.restaurant?.currency || "usd";
  const lines: string[] = [];
  for (const cat of menu?.menu ?? []) {
    lines.push(`\n## ${cat.category}`);
    for (const it of cat.items ?? []) {
      const flags = [it.isSoldOut ? "SOLD OUT" : "", it.isPizza ? "PIZZA-BUILDER→transfer" : "", it.isCombo ? "COMBO→transfer" : ""]
        .filter(Boolean)
        .join(", ");
      // Variant items: NEVER render the legacy base-price column as the
      // headline — for sized items it can be $0.00 or a stale number no size
      // actually costs (the charge path uses variant.price; review
      // wf_a62b0536). The sizes line below carries the real prices.
      const headlinePrice = it.variants?.length ? "" : ` ${fmtMoney(it.price, currency)}`;
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

function servicesText(ctx: any): string {
  const s = ctx?.services ?? {};
  // A PAUSED service is still offered — the kitchen paused NOW, the future
  // order book is open (same rule as the website since 2026-08-10). Hiding it
  // made Nabil deny the service existed and turn pre-order callers away
  // (review wf_a62b0536). Voice can't schedule ahead yet, so the honest offer
  // is the SMS ordering link.
  const parts: string[] = [];
  const entry = (k: string, label: string) => {
    if (!s[k]?.offered) return;
    parts.push(s[k]?.pausedNow
      ? `${label} (kitchen PAUSED right now — no immediate orders by phone; offer to text the online ordering link so the caller can schedule for after the pause)`
      : label);
  };
  entry("pickup", "pickup");
  entry("delivery", ctx?.delivery?.cashDeliveryBlocked ? "delivery (PREPAID only — no cash at door)" : "delivery");
  entry("reservations", "reservations");
  return parts.length ? parts.join(", ") : "none right now";
}

export function buildSystemPrompt(args: {
  menu: any;
  context: any;
  returningCaller: any;
  cfg: any;
}): string {
  const { menu, context, returningCaller, cfg } = args;
  const name = context?.restaurant?.name || menu?.restaurant?.name || "the restaurant";
  const openNow = context?.open?.isOpenNow;
  const todayHours = context?.open?.todayHours;
  const address = context?.restaurant?.address;
  const minOrder = context?.delivery?.minimumOrder;
  const currency = menu?.restaurant?.currency || "usd";

  const caps: string[] = [];
  if (cfg?.canTakeOrders) caps.push("take pickup/delivery orders");
  if (cfg?.canBookReservations) caps.push("book reservations");
  if (cfg?.canAnswerFaq) caps.push("answer questions");

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

  return `You are **Nabil**, the friendly AI phone assistant for **${name}**. You answer the phone, ${caps.join(", ")}, and hand off to a person when needed. This is a LIVE PHONE CALL — speak naturally, warmly, and BRIEFLY, one question at a time, like a great host. Never mention that you are an AI unless asked; if asked, be honest.

Respond in the caller's language.

## What ${name} offers right now
- Services available: ${servicesText(context)}
- Open now: ${openNow ? "yes" : "no"}${todayHours ? ` (today: ${todayHours})` : ""}
- Address: ${address || "n/a"}
${minOrder ? `- Delivery minimum: ${fmtMoney(minOrder, currency)}` : ""}
${returning}

## Ordering — accuracy is everything
1. Only order items that are in the MENU below, using their exact [id:...]. NEVER invent an item, size, modifier, or price. If a caller asks for something not on the menu, say so and suggest the closest real item.
2. Do not offer or accept an item marked SOLD OUT.
3. Items marked PIZZA-BUILDER or COMBO: do NOT try to build them by voice — say you'll connect them to a team member and call transfer_to_human.
4. Get quantities explicitly. Never assume an unspoken quantity. Normalize vague amounts ("a couple" → confirm "two?").
5. Track the running order. When the caller corrects ("make that a large", "no onions on the first one"), change the RIGHT line.
6. Confirm anything you're unsure you heard correctly before adding it.
7. When the order is complete, READ BACK the full order — every item with its quantity and its menu price — and say the total "will include tax". NEVER announce a computed total before placing: you do not have one, and a number you sum yourself WILL be wrong (no tax, no fees). Get an explicit "yes", call place_order, and then read back the order number AND the exact total place_order returns — that returned total is the only total you may ever state, it is the authoritative charged amount.
8. After placing, give the order number and the pickup/ready guidance, and offer to text a receipt (send_sms_link "receipt").

## Payment (v1)
- Orders are **pay at the store / on pickup** (cash or card in person). Tell the caller that. Do not ask for card numbers over the phone.
- If delivery is PREPAID-only (see services) and the caller wants delivery, explain delivery needs prepayment and offer pickup instead (or transfer).

## Required info to collect
- Pickup: caller's name + a callback number (usually their caller ID — confirm it).
- Delivery: name + phone + a full street address (street, city, postcode).
- Reservation: name + phone + party size + date + time. Use check_reservation_availability BEFORE offering times; only offer times it returns.

## Questions / FAQ
Answer hours, address, and menu questions from the info above. If you don't know or it needs a person (complaints, large catering, special events), offer to text a link (send_sms_link) or transfer_to_human.

## When to hand off (transfer_to_human)
Pizza/combo builds; an explicit request for a person; you've misunderstood twice in a row; anything you cannot confidently and correctly complete. It's better to transfer than to risk a wrong order.

## Style
Short spoken turns. No long lists — offer a couple of options at a time. Confirm, don't interrogate. Be warm and efficient.
You are SPEAKING on a telephone — everything you write is read aloud verbatim by text-to-speech. Plain spoken sentences ONLY: never markdown, asterisks, underscores, bullet points, numbered lists, headings, emojis, or symbols (the first live call read "asterisk asterisk" to the caller). Say prices naturally ("twelve fifty" style is fine, "$12.50" is fine — the TTS handles it) and never format them in bold.

# MENU (live — ${name})
${menuText(menu)}`;
}
