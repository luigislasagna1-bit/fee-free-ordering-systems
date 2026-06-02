"use client";
import { useEffect, useState, useCallback } from "react";
import {
  X, Pause, Play, AlertTriangle, Loader2, Package, Search, CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";

/**
 * Kitchen-side restaurant Settings panel (header button label = "Settings").
 *
 * Two responsibilities, both kitchen staff need from the floor:
 *
 *   1. Pause services — when the kitchen is slammed, the chef hits a
 *      single button to stop new pickup / delivery / etc. orders for
 *      30 min / 1h / 2h / rest of day. Auto-resumes when the
 *      timestamp passes — no remembering to flip it back. Per-service
 *      so a backed-up kitchen can still take pickups while pausing
 *      delivery, or vice versa.
 *
 *   2. Item availability & pricing — quick per-item Mark out / Restock
 *      toggle PLUS an inline price input so the owner can bump a price
 *      without leaving the kitchen tablet. Both fields write to
 *      MenuItem, which is the same row read by /admin/menu and
 *      /order/[slug], so changes are reflected everywhere immediately.
 *
 * Posts to /api/kitchen/pause-services and /api/kitchen/menu-stock.
 * Luigi 2026-06-01 GloriaFood-parity; pricing 2026-06-02.
 */

type ServiceKey =
  | "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";

interface StatusModalProps {
  open: boolean;
  onClose: () => void;
  /** Active services for this restaurant — only these get shown in
   *  the pause panel (no point offering to pause "delivery" for a
   *  pickup-only shop). */
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
  acceptsDineIn: boolean;
  acceptsCatering: boolean;
  acceptsTakeOut: boolean;
  acceptsReservations: boolean;
  /** Current pausedUntil per service — null = active, future Date = paused. */
  pausedUntilByService: Partial<Record<ServiceKey, string | null>>;
  /** Notify parent so it can refetch fresh restaurant + menu state. */
  onChange?: () => void;
}

const SERVICE_LABELS: Record<ServiceKey, string> = {
  pickup: "Pickup",
  delivery: "Delivery",
  dineIn: "Dine-in",
  catering: "Catering",
  takeOut: "Take & Bake",
  reservations: "Reservations",
};

const DURATION_PRESETS: { label: string; minutes: number }[] = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
];

export function RestaurantStatusModal({
  open, onClose,
  acceptsPickup, acceptsDelivery, acceptsDineIn,
  acceptsCatering, acceptsTakeOut, acceptsReservations,
  pausedUntilByService,
  onChange,
}: StatusModalProps) {
  const [tab, setTab] = useState<"pause" | "stock">("pause");
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(new Set());
  const [pauseBusy, setPauseBusy] = useState(false);

  // Build the list of services the kitchen can actually pause.
  const availableServices = (
    [
      acceptsPickup       ? ("pickup"       as ServiceKey) : null,
      acceptsDelivery     ? ("delivery"     as ServiceKey) : null,
      acceptsDineIn       ? ("dineIn"       as ServiceKey) : null,
      acceptsCatering     ? ("catering"     as ServiceKey) : null,
      acceptsTakeOut      ? ("takeOut"      as ServiceKey) : null,
      acceptsReservations ? ("reservations" as ServiceKey) : null,
    ].filter(Boolean) as ServiceKey[]
  );

  const isPaused = (s: ServiceKey): boolean => {
    const until = pausedUntilByService?.[s];
    if (!until) return false;
    return new Date(until).getTime() > Date.now();
  };

  const togglePick = (s: ServiceKey) => {
    setSelectedServices((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const submitPause = useCallback(async (mode: "duration" | "restOfDay" | "resume", durationMinutes?: number) => {
    if (selectedServices.size === 0) {
      toast.error("Pick at least one service first.");
      return;
    }
    setPauseBusy(true);
    try {
      const body: Record<string, unknown> = {
        services: Array.from(selectedServices),
      };
      if (mode === "resume") body.resume = true;
      else if (mode === "restOfDay") body.restOfDay = true;
      else if (mode === "duration") body.durationMinutes = durationMinutes;
      const res = await fetch("/api/kitchen/pause-services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed (${res.status})`);
      }
      const verb = mode === "resume" ? "resumed" : "paused";
      toast.success(`${selectedServices.size} service${selectedServices.size > 1 ? "s" : ""} ${verb}`);
      setSelectedServices(new Set());
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPauseBusy(false);
    }
  }, [selectedServices, onChange]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Restaurant settings
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={() => setTab("pause")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "pause" ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Pause className="w-4 h-4 inline mr-1.5" /> Pause services
          </button>
          <button
            type="button"
            onClick={() => setTab("stock")}
            className={`px-3 py-2 text-sm font-semibold border-b-2 transition ${
              tab === "stock" ? "border-emerald-500 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Package className="w-4 h-4 inline mr-1.5" /> Item availability / pricing
          </button>
        </div>

        {tab === "pause" && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              Pause one or more services when the kitchen is slammed. Customers will see a notice
              and can&apos;t place new orders for the paused service until the time passes (or you tap Resume).
            </p>

            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Pick services
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableServices.length === 0 ? (
                  <div className="col-span-full text-sm text-gray-500 py-4">
                    No services are enabled for this restaurant.
                  </div>
                ) : availableServices.map((s) => {
                  const paused = isPaused(s);
                  const picked = selectedServices.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => togglePick(s)}
                      className={`relative px-3 py-2 rounded-xl border text-sm font-semibold transition text-left ${
                        picked
                          ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                          : paused
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-gray-200 bg-white text-gray-800 hover:border-emerald-300"
                      }`}
                    >
                      {SERVICE_LABELS[s]}
                      {paused && (
                        <span className="block text-[10px] mt-0.5 opacity-70">
                          paused until {new Date(pausedUntilByService[s]!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      {picked && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 absolute top-1.5 right-1.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                For how long?
              </div>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    disabled={pauseBusy || selectedServices.size === 0}
                    onClick={() => submitPause("duration", d.minutes)}
                    className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition"
                  >
                    Pause {d.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={pauseBusy || selectedServices.size === 0}
                  onClick={() => submitPause("restOfDay")}
                  className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold transition"
                >
                  Rest of day
                </button>
                <button
                  type="button"
                  disabled={pauseBusy || selectedServices.size === 0}
                  onClick={() => submitPause("resume")}
                  className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold transition inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Resume now
                </button>
              </div>
              {pauseBusy && (
                <div className="mt-2 text-xs text-gray-500 inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "stock" && (
          <StockPanel onChange={onChange} />
        )}
      </div>
    </div>
  );
}

interface StockItem {
  id: string;
  name: string;
  isSoldOut: boolean;
  price: number;
  hasVariants: boolean;
  variants: { id: string; name: string; price: number; sortOrder: number }[];
  category: { name: string; sortOrder: number } | null;
}

function StockPanel({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // Per-item draft for the inline price input — keyed by item id, holds
  // the raw text the user is typing. Committed (saved) on blur or
  // Enter; reverted on Escape. We don't write keystroke-by-keystroke
  // so the kitchen doesn't fire 14 PATCHes while the owner types
  // "12.50". Items not in this map render the canonical it.price.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceBusyIds, setPriceBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/kitchen/menu-stock");
      const d = r.ok ? await r.json() : { items: [] };
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (it: StockItem) => {
    setBusyIds((s) => new Set(s).add(it.id));
    try {
      const r = await fetch(`/api/kitchen/menu-stock/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSoldOut: !it.isSoldOut }),
      });
      if (!r.ok) throw new Error("Failed");
      setItems((cur) => cur.map((i) => i.id === it.id ? { ...i, isSoldOut: !it.isSoldOut } : i));
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(it.id);
        return next;
      });
    }
  };

  // Commit a draft price for a VARIANT (size). Same UX as the base
  // commitPrice below — local validate, PATCH the new
  // /api/kitchen/menu-stock/variant/[id] route, mutate the in-memory
  // it.variants[] entry on success so the input reverts cleanly.
  const commitVariantPrice = async (it: StockItem, v: StockItem["variants"][number]) => {
    const raw = priceDrafts[v.id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const next = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(next) || next < 0 || next > 9999) {
      toast.error("Enter a valid price (0 – 9999).");
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[v.id];
        return cp;
      });
      return;
    }
    const rounded = Math.round(next * 100) / 100;
    if (rounded === v.price) {
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[v.id];
        return cp;
      });
      return;
    }
    setPriceBusyIds((s) => new Set(s).add(v.id));
    try {
      const r = await fetch(`/api/kitchen/menu-stock/variant/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: rounded }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      setItems((cur) => cur.map((i) => i.id === it.id
        ? { ...i, variants: i.variants.map((vv) => vv.id === v.id ? { ...vv, price: rounded } : vv) }
        : i,
      ));
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[v.id];
        return cp;
      });
      toast.success(`${it.name} · ${v.name}: $${rounded.toFixed(2)}`);
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save price");
    } finally {
      setPriceBusyIds((s) => {
        const cp = new Set(s);
        cp.delete(v.id);
        return cp;
      });
    }
  };

  // Commit a draft price for the given item. Validates locally so a
  // typo (empty string, NaN, negative, > 9999) shows an immediate
  // toast instead of a backend round-trip. On success we update the
  // local item row so the input reverts to formatted server state on
  // the next blur.
  const commitPrice = async (it: StockItem) => {
    const raw = priceDrafts[it.id];
    if (raw === undefined) return; // no draft = nothing to commit
    const trimmed = raw.trim();
    // No change → quietly clear the draft.
    const next = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(next) || next < 0 || next > 9999) {
      toast.error("Enter a valid price (0 – 9999).");
      // Revert by clearing the draft so the canonical price renders.
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[it.id];
        return cp;
      });
      return;
    }
    const rounded = Math.round(next * 100) / 100;
    if (rounded === it.price) {
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[it.id];
        return cp;
      });
      return;
    }
    setPriceBusyIds((s) => new Set(s).add(it.id));
    try {
      const r = await fetch(`/api/kitchen/menu-stock/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: rounded }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Failed");
      }
      setItems((cur) => cur.map((i) => i.id === it.id ? { ...i, price: rounded } : i));
      setPriceDrafts((d) => {
        const cp = { ...d };
        delete cp[it.id];
        return cp;
      });
      toast.success(`Price updated to $${rounded.toFixed(2)}`);
      onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save price");
    } finally {
      setPriceBusyIds((s) => {
        const cp = new Set(s);
        cp.delete(it.id);
        return cp;
      });
    }
  };

  const filtered = query.trim()
    ? items.filter((it) =>
        it.name.toLowerCase().includes(query.toLowerCase()) ||
        (it.category?.name ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search items or categories…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
        />
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-500 inline-flex items-center justify-center gap-2 w-full">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading menu…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">
          {query.trim() ? "No items match that search." : "No menu items yet."}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {filtered.map((it) => {
            const hasVariants = it.hasVariants && it.variants.length > 0;
            // Two rendering modes:
            //   - hasVariants → header row with Mark out/Restock (no base
            //     price input — MenuItem.price isn't what the customer
            //     pays for variant items, so editing it would be a silent
            //     no-op and that's exactly the bug we're fixing). Below
            //     the header, one nested row per variant with its own
            //     live-editable price.
            //   - no variants → original single row: base price input +
            //     Mark out / Restock button.
            if (hasVariants) {
              return (
                <li key={it.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold truncate ${it.isSoldOut ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {it.name}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">
                        {it.category?.name ?? ""}
                        {it.category && " · "}
                        <span className="italic">Priced by size below</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(it)}
                      disabled={busyIds.has(it.id)}
                      className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                        it.isSoldOut
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                          : "bg-amber-500 hover:bg-amber-600 text-white"
                      } ${busyIds.has(it.id) ? "opacity-50 cursor-wait" : ""}`}
                    >
                      {busyIds.has(it.id)
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : it.isSoldOut ? "Restock" : "Mark out"}
                    </button>
                  </div>
                  <ul className="mt-2 ml-4 border-l border-gray-200 pl-3 space-y-1.5">
                    {it.variants.map((v) => {
                      const vDraft = priceDrafts[v.id];
                      const vInputValue = vDraft !== undefined ? vDraft : v.price.toFixed(2);
                      const vBusy = priceBusyIds.has(v.id);
                      return (
                        <li key={v.id} className="flex items-center justify-between gap-2">
                          <div className="text-xs text-gray-700 min-w-0 flex-1 truncate">{v.name}</div>
                          <div className="flex-shrink-0 flex items-center gap-1 text-xs">
                            <span className="text-gray-400">$</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={vInputValue}
                              disabled={vBusy}
                              onChange={(e) => setPriceDrafts((d) => ({ ...d, [v.id]: e.target.value }))}
                              onBlur={() => commitVariantPrice(it, v)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === "Escape") {
                                  setPriceDrafts((d) => {
                                    const cp = { ...d };
                                    delete cp[v.id];
                                    return cp;
                                  });
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="w-20 px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
                              aria-label={`Price for ${it.name} — ${v.name}`}
                            />
                            {vBusy && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            }

            const draft = priceDrafts[it.id];
            const inputValue = draft !== undefined ? draft : it.price.toFixed(2);
            const priceBusy = priceBusyIds.has(it.id);
            return (
              <li key={it.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-semibold truncate ${it.isSoldOut ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {it.name}
                  </div>
                  {it.category && (
                    <div className="text-[11px] text-gray-500 truncate">{it.category.name}</div>
                  )}
                </div>
                {/* Inline price editor — sits LEFT of the Mark out /
                    Restock button. Owner taps in, edits, blurs (or hits
                    Enter) to save. Escape reverts. Writes propagate to
                    the same MenuItem.price row read by /admin/menu and
                    /order/[slug] so changes are immediately reflected
                    everywhere. */}
                <div className="flex-shrink-0 flex items-center gap-1 text-xs">
                  <span className="text-gray-400">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={inputValue}
                    disabled={priceBusy}
                    onChange={(e) => setPriceDrafts((d) => ({ ...d, [it.id]: e.target.value }))}
                    onBlur={() => commitPrice(it)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                      } else if (e.key === "Escape") {
                        setPriceDrafts((d) => {
                          const cp = { ...d };
                          delete cp[it.id];
                          return cp;
                        });
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60"
                    aria-label={`Price for ${it.name}`}
                  />
                  {priceBusy && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                </div>
                <button
                  type="button"
                  onClick={() => toggle(it)}
                  disabled={busyIds.has(it.id)}
                  className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    it.isSoldOut
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                      : "bg-amber-500 hover:bg-amber-600 text-white"
                  } ${busyIds.has(it.id) ? "opacity-50 cursor-wait" : ""}`}
                >
                  {busyIds.has(it.id)
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : it.isSoldOut ? "Restock" : "Mark out"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        Edit any price (item or size) then tap outside (or press Enter) to save. Items
        with sizes are priced per-size below — the base item has no editable price.
        Marking an item out of stock greys it out on the customer ordering page and
        blocks new orders. All changes appear on the customer site and admin menu
        immediately. Modifier (add-on) pricing still lives in /admin/menu.
      </p>
    </div>
  );
}
