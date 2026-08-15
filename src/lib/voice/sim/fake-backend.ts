/**
 * The simulator's OFFLINE BACKEND — a `VoiceApi` (services/nabil-voice/src/api.ts)
 * answered entirely from a `MenuSnapshot`, with the REAL compiler
 * (`buildLineCore`) in-process. The real `CallSession` is constructed with
 * `{ api: backend }` and cannot tell the difference: every read comes back in
 * the same envelope the live routes use, and every write is recorded so a
 * runner can assert on what would have hit the database.
 *
 * Envelopes mirrored (read the real routes before changing these):
 *  • menu / context / returningCaller / availability / itemOptions — GET-style:
 *    resolve with the JSON body, THROW on failure (getInternal throws on !ok).
 *  • checkAddress / buildLine / dryRunOrder / placeOrder / previewOrder /
 *    bookReservation / sendSms / logCall* — POST-style: `{ ok, status, json }`.
 *
 * Knobs (`opts`): closed store, sold-out ids, a returning caller, per-call
 * latency, one injected failure (`failNext`), agent-config overrides.
 *
 * NOT here (see fake-pricer.ts header): promos, minimum-order enforcement,
 * service fees, size-family swaps and day-deal offers (both need Prisma).
 */
import { buildLineCore } from "@/lib/voice/build-line-core";
import { compilePizzaLine, normalizeSizeToken, splitSizeToken, type ItemData } from "@/lib/voice/order-line-compiler";
import type { VoiceApi } from "../../../../services/nabil-voice/src/api";
import { hydrateComboData, type MenuSnapshot } from "./snapshot-types";
import { priceOrder, resolveSimAddress, type OrderBody } from "./fake-pricer";

export type FakeBackendOpts = {
  open?: boolean;
  soldOut?: string[];
  returningCaller?: unknown;
  latencyMs?: number;
  failNext?: { method: string; code: string };
  config?: Record<string, unknown>;
};

export type BackendCall = { method: string; args: unknown; ms: number; ok: boolean };

export type PlacedOrder = {
  id: string;
  orderNumber: string;
  total: number;
  idempotencyKey: string | null;
  /** The exact `/api/orders` body the session sent. */
  body: OrderBody & Record<string, unknown>;
};

export type FakeBackend = VoiceApi & {
  placed: PlacedOrder[];
  sms: unknown[];
  logs: unknown[];
  events: unknown[];
  calls: BackendCall[];
  /** The bodies of every dryRun (quote) request, in order. */
  quotes: Array<{ body: unknown; result: unknown }>;
};

type PostResult = { ok: boolean; status: number; json: any };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createFakeBackend(snapshot: MenuSnapshot, opts: FakeBackendOpts = {}): FakeBackend {
  const soldOut = new Set(opts.soldOut ?? []);
  const calls: BackendCall[] = [];
  const placed: PlacedOrder[] = [];
  const sms: unknown[] = [];
  const logs: unknown[] = [];
  const events: unknown[] = [];
  const quotes: Array<{ body: unknown; result: unknown }> = [];
  const byIdempotency = new Map<string, PlacedOrder>();
  let failNext: { method: string; code: string } | null = opts.failNext ? { ...opts.failNext } : null;
  let orderSeq = 0;
  let reservationSeq = 0;
  const currency = snapshot.pricing.currency || snapshot.menu?.restaurant?.currency || "usd";
  const timezone = snapshot.context?.restaurant?.timezone ?? "America/Toronto";

  const itemOf = (id: string): ItemData | null => {
    const it = snapshot.items[id];
    if (!it) return null;
    return soldOut.has(id) ? { ...clone(it), isSoldOut: true } : clone(it);
  };
  /** Category of an item, from the menu payload (the size-family rule is "same category"). */
  const categoryById = new Map<string, string>();
  for (const cat of snapshot.menu?.menu ?? []) for (const it of (cat as any).items ?? []) categoryById.set(String(it.menuItemId), String((cat as any).category ?? ""));
  const categoryOf = (id: string) => categoryById.get(id) ?? "";
  const comboOf = (id: string) => {
    if (!(id in snapshot.combos)) return null;
    const c = hydrateComboData(snapshot, id);
    if (soldOut.has(id)) c.isSoldOut = true;
    // A sold-out pick inside a slot must be refused by the compiler too.
    for (const slot of c.slots) slot.choices = slot.choices.map((ch) => (soldOut.has(ch.menuItemId) ? { ...ch, isSoldOut: true } : ch));
    return c;
  };

  /** Common wrapper: latency, failNext, timing, recording. `get` style throws
   *  on failure (like getInternal); `post` style returns {ok:false,...}. */
  async function run<T>(method: string, args: unknown, style: "get" | "post", fn: () => Promise<T> | T): Promise<T> {
    const started = Date.now();
    if (opts.latencyMs && opts.latencyMs > 0) await sleep(opts.latencyMs);
    if (failNext && failNext.method === method) {
      const code = failNext.code;
      failNext = null;
      calls.push({ method, args, ms: Date.now() - started, ok: false });
      if (style === "get") throw new Error(`GET ${method} -> 500 (${code})`);
      return { ok: false, status: 500, json: { error: `Simulated failure (${code})`, code } } as unknown as T;
    }
    try {
      const out = await fn();
      const ok = style === "get" ? true : (out as unknown as PostResult)?.ok !== false;
      calls.push({ method, args, ms: Date.now() - started, ok });
      return out;
    } catch (e) {
      calls.push({ method, args, ms: Date.now() - started, ok: false });
      throw e;
    }
  }

  const backend: FakeBackend = {
    placed,
    sms,
    logs,
    events,
    calls,
    quotes,

    /* ── reads ─────────────────────────────────────────────────────────── */

    menu: (slug: string) =>
      run("menu", { slug }, "get", () => {
        const m = clone(snapshot.menu);
        for (const cat of m.menu ?? []) for (const it of cat.items ?? []) if (soldOut.has(it.menuItemId)) it.isSoldOut = true;
        return m;
      }),

    context: (slug: string) =>
      run("context", { slug }, "get", () => {
        const c: any = clone(snapshot.context);
        if (typeof opts.open === "boolean") {
          c.open = c.open ?? {};
          c.open.isOpenNow = opts.open;
          if (opts.open && c.open.status?.kind !== "open") c.open.status = { kind: "open", closesAt: "11:00 PM" };
          if (!opts.open && c.open.status?.kind === "open") c.open.status = { kind: "closed_today" };
        }
        c.config = { ...(c.config ?? {}), ...(opts.config ?? {}) };
        return c;
      }),

    returningCaller: (slug: string, phone: string) => run("returningCaller", { slug, phone }, "get", () => clone(opts.returningCaller ?? { found: false })),

    availability: (slug: string, date: string, partySize: number) =>
      run("availability", { slug, date, partySize }, "get", () => ({
        available: true,
        date,
        partySize,
        slots: ["17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"],
        partyLimits: { min: 1, max: 12 },
      })),

    itemOptions: (slug: string, itemId: string) =>
      run("itemOptions", { slug, itemId }, "get", () => {
        const item = itemOf(itemId);
        if (!item) throw new Error(`GET /api/internal/voice/item-options?itemId=${itemId} -> 404`);
        return { currency, item, combo: comboOf(itemId) };
      }),

    /* ── address ───────────────────────────────────────────────────────── */

    checkAddress: (body: unknown) =>
      run("checkAddress", body, "post", (): PostResult => {
        const b = (body ?? {}) as { slug?: string; street?: string; city?: string; zip?: string };
        if (!String(b.street ?? "").trim()) return { ok: false, status: 400, json: { error: "Missing street", code: "missing_street" } };
        const r = resolveSimAddress(snapshot, b);
        if (!r.located) {
          return {
            ok: true,
            status: 200,
            json: {
              hasZones: true,
              located: false,
              currency,
              instruction:
                "That address could not be pinned down. Do NOT refuse the order and do not say anything about maps or systems. " +
                "Ask once for the missing piece in plain words — the house number, or the cross street, or the postcode — and call this again. " +
                "If it still can't be found, carry on and take the order anyway; the store will confirm the delivery details.",
            },
          };
        }
        return {
          ok: true,
          status: 200,
          json: {
            hasZones: true,
            located: true,
            inside: r.inside,
            lat: r.lat,
            lng: r.lng,
            matchedAddress: r.matchedAddress,
            zoneName: r.zoneName,
            deliveryFee: r.fee,
            minimumOrder: r.minimumOrder,
            estimatedMinutes: 45,
            distanceKm: 2.1,
            currency,
            instruction: r.inside
              ? "We deliver to this address. Confirm the street back to the caller in plain words, tell them the delivery fee" +
                (r.minimumOrder > 0 ? " and the minimum order" : "") +
                ", then take their food order. Never read out the zone name, the distance, or the matched address string — those are for you, not for them."
              : "This address is BEYOND every delivery zone. Say warmly that it is outside the usual delivery area, give this fee" +
                (r.minimumOrder > 0 ? " and this minimum" : "") +
                " as what it would cost, and let the caller decide — do not refuse it and do not promise it will definitely be accepted. If they would rather not, offer pickup. Never read out the zone name or the distance.",
          },
        };
      }),

    /* ── compiler ──────────────────────────────────────────────────────── */

    buildLine: (body: unknown) =>
      run("buildLine", body, "post", async (): Promise<PostResult> => {
        const b = (body ?? {}) as { kind?: unknown; intent?: unknown; askGroupIds?: unknown; offerDeals?: unknown };
        const out = await buildLineCore(
          {
            kind: b.kind as "item" | "pizza" | "combo",
            intent: b.intent,
            askGroupIds: Array.isArray(b.askGroupIds) ? (b.askGroupIds as string[]) : [],
            offerDeals: b.offerDeals === true,
            currency,
            timezone,
          },
          {
            item: async (id) => itemOf(id),
            combo: async (id) => comboOf(id),
            // Offline twin of item-family.findSizeMatch: on menus where each size
            // is its own product ("Large 1 Topping" / "Medium 1 Topping"), a
            // spoken size that the named item can't be resolves to the sibling
            // whose name differs ONLY by its size token, in the same category.
            sizeMatch: async ({ item, intent }) => {
              const want = normalizeSizeToken(intent.size ?? null);
              if (!want) return null;
              const have = splitSizeToken(item.name);
              if (!have.token || have.token === want) return null;
              const cat = categoryOf(item.menuItemId);
              const siblings = Object.values(snapshot.items).filter((c) => {
                if (c.menuItemId === item.menuItemId || !c.pizzaConfig) return false;
                if (categoryOf(c.menuItemId) !== cat) return false;
                const sp = splitSizeToken(c.name);
                return sp.token === want && sp.rest === have.rest;
              });
              if (siblings.length !== 1) return null;
              const sib = siblings[0];
              const compiled = compilePizzaLine({ ...intent, menuItemId: sib.menuItemId }, sib, { currency });
              if (!compiled.line || compiled.unresolved.length) return null;
              return { menuItemId: sib.menuItemId, name: sib.name, variantId: compiled.line.variantId, subtotal: compiled.lineSubtotal ?? 0, readBack: compiled.readBack, saving: 0 };
            },
          },
        );
        return { ok: out.status === 200, status: out.status, json: out.body };
      }),

    /* ── orders ────────────────────────────────────────────────────────── */

    previewOrder: (body: unknown) =>
      run("previewOrder", body, "post", (): PostResult => {
        const p = priceOrder(snapshot, (body ?? {}) as OrderBody, { soldOut });
        if (!p.ok) return { ok: false, status: p.status, json: { error: p.error, code: p.code } };
        return { ok: true, status: 200, json: { subtotal: p.subtotal, discount: 0, deliveryFee: p.deliveryFee, tax: p.tax, total: p.total, appliedPromoNames: [], promos: [] } };
      }),

    dryRunOrder: (body: unknown) =>
      run("dryRunOrder", body, "post", (): PostResult => {
        const p = priceOrder(snapshot, (body ?? {}) as OrderBody, { soldOut });
        const result: PostResult = !p.ok
          ? { ok: false, status: p.status, json: { error: p.error, code: p.code } }
          : {
              ok: true,
              status: 200,
              json: {
                dryRun: true,
                total: p.total,
                subtotal: p.subtotal,
                discount: p.discount,
                tax: p.tax,
                deliveryFee: p.deliveryFee,
                serviceFees: p.serviceFees,
                deposits: p.deposits,
                tip: p.tip,
                appliedPromoNames: p.appliedPromoNames,
                lines: p.lines,
              },
            };
        quotes.push({ body, result: result.json });
        return result;
      }),

    placeOrder: (body: unknown) =>
      run("placeOrder", body, "post", (): PostResult => {
        const b = (body ?? {}) as OrderBody & { idempotencyKey?: unknown; expectedTotal?: unknown };
        const key = typeof b.idempotencyKey === "string" ? b.idempotencyKey : null;
        if (key && byIdempotency.has(key)) {
          const prior = byIdempotency.get(key)!;
          return { ok: true, status: 200, json: { id: prior.id, orderNumber: prior.orderNumber, total: prior.total, promoDiscount: 0, appliedPromoNames: [], deduped: true } };
        }
        const p = priceOrder(snapshot, b, { soldOut });
        if (!p.ok) return { ok: false, status: p.status, json: { error: p.error, code: p.code } };
        if (typeof b.expectedTotal === "number" && Number.isFinite(b.expectedTotal) && Math.abs(p.total - b.expectedTotal) > 0.005) {
          return {
            ok: false,
            status: 409,
            json: { error: "The total changed since it was quoted — the order was not placed.", code: "total_changed", total: p.total, expectedTotal: b.expectedTotal, appliedPromoNames: [] },
          };
        }
        orderSeq++;
        const order: PlacedOrder = {
          id: `sim_${orderSeq}`,
          orderNumber: `SIM-${String(orderSeq).padStart(4, "0")}`,
          total: p.total,
          idempotencyKey: key,
          body: clone(b) as PlacedOrder["body"],
        };
        placed.push(order);
        if (key) byIdempotency.set(key, order);
        return { ok: true, status: 201, json: { id: order.id, orderNumber: order.orderNumber, total: order.total, creditApplied: 0, promoDiscount: 0, appliedPromoNames: [], requiresPayment: false } };
      }),

    bookReservation: (body: unknown) =>
      run("bookReservation", body, "post", (): PostResult => {
        reservationSeq++;
        return { ok: true, status: 201, json: { id: `simres_${reservationSeq}`, confirmationCode: `SIMR${String(reservationSeq).padStart(3, "0")}`, status: "confirmed" } };
      }),

    /* ── side channels ─────────────────────────────────────────────────── */

    sendSms: (body: unknown) =>
      run("sendSms", body, "post", (): PostResult => {
        sms.push(clone(body));
        return { ok: true, status: 200, json: { ok: true, sid: `SM_sim_${sms.length}` } };
      }),

    logCallStart: (body: unknown) =>
      run("logCallStart", body, "post", (): PostResult => {
        logs.push(clone(body));
        return { ok: true, status: 200, json: { ok: true, id: `vc_sim_${logs.length}` } };
      }),

    logCall: (body: unknown) =>
      run("logCall", body, "post", (): PostResult => {
        logs.push(clone(body));
        return { ok: true, status: 200, json: { ok: true, id: `vc_sim_${logs.length}` } };
      }),

    logEvents: (body: unknown) =>
      run("logEvents", body, "post", (): PostResult => {
        const b = body as { events?: unknown[] } | null;
        if (Array.isArray(b?.events)) events.push(...clone(b!.events!));
        logs.push({ event: "events", count: Array.isArray(b?.events) ? b!.events!.length : 0 });
        return { ok: true, status: 200, json: { ok: true, id: `vc_sim_${logs.length}` } };
      }),
  };
  return backend;
}
