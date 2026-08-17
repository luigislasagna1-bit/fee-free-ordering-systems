"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Phone, Play, RotateCcw } from "lucide-react";

/* ── Transcript data ──────────────────────────────────────────────────── */

type OrderItem = {
  name: string;
  price: string;
  details?: string[];
};

type OrderUpdate = {
  items: OrderItem[];
  discount?: { label: string; amount: string };
  deliveryFee?: { label: string; amount: string };
  total?: string;
};

type Line = {
  speaker: "nabil" | "caller";
  text: string;
  /** Cumulative seconds into the call when this line appears. */
  at: number;
  /** If present, the order summary updates to this state. */
  order?: OrderUpdate;
};

const TRANSCRIPT: Line[] = [
  {
    speaker: "nabil",
    text: "Hi, thanks for calling! How can I help you today?",
    at: 2,
  },
  {
    speaker: "caller",
    text: "Hey, I'd like to place an order for delivery.",
    at: 6,
  },
  {
    speaker: "nabil",
    text: "Of course! What can I get for you?",
    at: 9,
  },
  {
    speaker: "caller",
    text: "Can I get a large pizza, half pepperoni and mushrooms, half green peppers and onions?",
    at: 15,
  },
  {
    speaker: "nabil",
    text: "A large half-and-half — pepperoni and mushrooms on one side, green peppers and onions on the other. Got it. Anything else?",
    at: 22,
    order: {
      items: [
        {
          name: "1× Large Pizza (half & half)",
          price: "$16.99",
          details: ["Left: Pepperoni, Mushrooms", "Right: Green Peppers, Onions"],
        },
      ],
    },
  },
  {
    speaker: "caller",
    text: "Yeah, a garlic bread and a 2-litre Coke. Oh, and do you have any specials?",
    at: 29,
    order: {
      items: [
        {
          name: "1× Large Pizza (half & half)",
          price: "$16.99",
          details: ["Left: Pepperoni, Mushrooms", "Right: Green Peppers, Onions"],
        },
        { name: "1× Garlic Bread", price: "$5.99" },
        { name: "1× 2L Coke", price: "$3.99" },
      ],
    },
  },
  {
    speaker: "nabil",
    text: "Today we have a combo — any large pizza with garlic bread and a 2-litre pop for $24.99. Your order already qualifies! Would you like to apply that?",
    at: 38,
  },
  {
    speaker: "caller",
    text: "Yeah, do that.",
    at: 42,
    order: {
      items: [
        {
          name: "1× Large Pizza (half & half)",
          price: "$16.99",
          details: ["Left: Pepperoni, Mushrooms", "Right: Green Peppers, Onions"],
        },
        { name: "1× Garlic Bread", price: "$5.99" },
        { name: "1× 2L Coke", price: "$3.99" },
      ],
      discount: { label: "Combo discount", amount: "−$2.99" },
    },
  },
  {
    speaker: "nabil",
    text: "Done. I'll need your delivery address.",
    at: 45,
  },
  {
    speaker: "caller",
    text: "123 Main Street, unit 4.",
    at: 49,
  },
  {
    speaker: "nabil",
    text: "123 Main Street, unit 4 — that's in our delivery zone. A $3.99 delivery fee applies. Your total comes to twenty-eight ninety-eight, tax included. Can I get a name for the order?",
    at: 57,
    order: {
      items: [
        {
          name: "1× Large Pizza (half & half)",
          price: "$16.99",
          details: ["Left: Pepperoni, Mushrooms", "Right: Green Peppers, Onions"],
        },
        { name: "1× Garlic Bread", price: "$5.99" },
        { name: "1× 2L Coke", price: "$3.99" },
      ],
      discount: { label: "Combo discount", amount: "−$2.99" },
      deliveryFee: { label: "Delivery fee", amount: "$3.99" },
      total: "$28.98",
    },
  },
  {
    speaker: "caller",
    text: "Sam.",
    at: 60,
  },
  {
    speaker: "nabil",
    text: "Thanks, Sam. So that's a large half-and-half pizza — pepperoni and mushrooms on one side, green peppers and onions on the other — garlic bread, and a 2-litre Coke, delivered to 123 Main Street unit 4, for twenty-eight ninety-eight. Should I send that to the kitchen?",
    at: 72,
  },
  {
    speaker: "caller",
    text: "Yes please.",
    at: 76,
  },
  {
    speaker: "nabil",
    text: "Order placed! You'll get a confirmation shortly. Thanks for calling!",
    at: 80,
  },
];

const TOTAL_DURATION = 85; // seconds — a bit past last line

/* ── Helpers ──────────────────────────────────────────────────────────── */

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ── Component ────────────────────────────────────────────────────────── */

export function LiveCallDemo({
  heading,
  subheading,
  playLabel,
  replayLabel,
  pauseLabel,
  liveLabel,
  orderHeading,
}: {
  heading: string;
  subheading: string;
  playLabel: string;
  replayLabel: string;
  pauseLabel: string;
  liveLabel: string;
  orderHeading: string;
}) {
  const [state, setState] = useState<"idle" | "playing" | "paused" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [currentOrder, setCurrentOrder] = useState<OrderUpdate | null>(null);

  const startRef = useRef(0);
  const pausedAtRef = useRef(0);
  const rafRef = useRef(0);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const tick = useCallback(() => {
    const now = performance.now();
    const secs = (now - startRef.current) / 1000;
    setElapsed(secs);

    let lines = 0;
    let lastOrder: OrderUpdate | null = null;
    for (const line of TRANSCRIPT) {
      if (secs >= line.at) {
        lines++;
        if (line.order) lastOrder = line.order;
      } else break;
    }
    setVisibleLines(lines);
    if (lastOrder) setCurrentOrder(lastOrder);

    if (secs >= TOTAL_DURATION) {
      setState("done");
      setVisibleLines(TRANSCRIPT.length);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (state === "idle" || state === "done") {
      // Start fresh
      setVisibleLines(0);
      setCurrentOrder(null);
      setElapsed(0);
      startRef.current = performance.now();
      setState("playing");
      rafRef.current = requestAnimationFrame(tick);
    } else if (state === "paused") {
      // Resume — shift startRef forward to account for pause
      startRef.current += performance.now() - pausedAtRef.current;
      setState("playing");
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [state, tick]);

  const pause = useCallback(() => {
    if (state === "playing") {
      cancelAnimationFrame(rafRef.current);
      pausedAtRef.current = performance.now();
      setState("paused");
    }
  }, [state]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [visibleLines]);

  const isPlaying = state === "playing";
  const isDone = state === "done";

  return (
    <div>
      {/* Header + controls */}
      <div className="text-center mb-8 md:mb-12">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 tracking-tight leading-[1.08]">
          {heading}
        </h2>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">{subheading}</p>
      </div>

      <div className="max-w-5xl mx-auto grid lg:grid-cols-5 gap-6 lg:gap-8">
        {/* ── Transcript panel ─────────────────────────────────────── */}
        <div className="lg:col-span-3 rounded-2xl border border-gray-200/80 bg-white overflow-hidden shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {isPlaying && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
              {isPlaying ? liveLabel : "Nabil AI"}
              {(isPlaying || state === "paused") && (
                <span className="ml-1 tabular-nums">{formatTimer(elapsed)}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            </div>
          </div>

          {/* Chat area */}
          <div className="h-[380px] sm:h-[420px] overflow-y-auto p-4 sm:p-5 space-y-3">
            {state === "idle" ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center ring-1 ring-emerald-100">
                  <Phone className="w-7 h-7" />
                </div>
                <p className="text-gray-500 text-sm max-w-xs">
                  {subheading}
                </p>
              </div>
            ) : (
              <>
                {TRANSCRIPT.slice(0, visibleLines).map((line, i) => (
                  <div
                    key={i}
                    className={`flex ${line.speaker === "caller" ? "justify-start" : "justify-end"}`}
                    style={{
                      animation: "fadeSlideIn 0.3s ease-out",
                    }}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        line.speaker === "caller"
                          ? "bg-gray-100 text-gray-800 rounded-bl-sm"
                          : "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100 rounded-br-sm"
                      }`}
                    >
                      <div
                        className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
                          line.speaker === "caller" ? "text-gray-400" : "text-emerald-600"
                        }`}
                      >
                        {line.speaker === "caller" ? "Caller" : "Nabil"}
                      </div>
                      {line.text}
                    </div>
                  </div>
                ))}
                {isPlaying && visibleLines < TRANSCRIPT.length && (
                  <div className="flex justify-end">
                    <div className="bg-emerald-50 ring-1 ring-emerald-100 rounded-2xl rounded-br-sm px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-emerald-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>

          {/* Play controls */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-center gap-3">
            {state === "idle" && (
              <button
                onClick={play}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-600 transition duration-200 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)]"
              >
                <Play className="w-4 h-4" fill="currentColor" />
                {playLabel}
              </button>
            )}
            {isPlaying && (
              <button
                onClick={pause}
                className="inline-flex items-center gap-2 bg-gray-200 text-gray-700 font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-gray-300 transition duration-200"
              >
                <Pause className="w-4 h-4" />
                {pauseLabel}
              </button>
            )}
            {state === "paused" && (
              <button
                onClick={play}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-600 transition duration-200 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)]"
              >
                <Play className="w-4 h-4" fill="currentColor" />
                {playLabel}
              </button>
            )}
            {isDone && (
              <button
                onClick={play}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm hover:bg-emerald-600 transition duration-200 shadow-[0_8px_20px_-8px_rgba(16,185,129,0.5)]"
              >
                <RotateCcw className="w-4 h-4" />
                {replayLabel}
              </button>
            )}
          </div>
        </div>

        {/* ── Order summary panel ──────────────────────────────────── */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200/80 bg-white overflow-hidden shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)] self-start">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              {orderHeading}
            </div>
          </div>
          <div className="p-4 sm:p-5 min-h-[200px]">
            {!currentOrder ? (
              <div className="flex items-center justify-center h-[160px] text-gray-300 text-sm">
                {state === "idle"
                  ? "Press play to start"
                  : "Waiting for items…"}
              </div>
            ) : (
              <div className="space-y-3">
                {currentOrder.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-start gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                      {item.details?.map((d, j) => (
                        <div key={j} className="text-xs text-gray-500 ml-2">{d}</div>
                      ))}
                    </div>
                    <div className="text-sm font-semibold text-gray-700 flex-shrink-0">{item.price}</div>
                  </div>
                ))}

                {currentOrder.discount && (
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-dashed border-gray-200">
                    <div className="text-sm text-emerald-700 font-medium">{currentOrder.discount.label}</div>
                    <div className="text-sm text-emerald-700 font-semibold">{currentOrder.discount.amount}</div>
                  </div>
                )}

                {currentOrder.deliveryFee && (
                  <div className="flex justify-between items-center gap-2">
                    <div className="text-sm text-gray-600">{currentOrder.deliveryFee.label}</div>
                    <div className="text-sm text-gray-600">{currentOrder.deliveryFee.amount}</div>
                  </div>
                )}

                {currentOrder.total && (
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-gray-200">
                    <div className="text-sm font-bold text-gray-900">Total</div>
                    <div className="text-base font-bold text-gray-900">{currentOrder.total}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline keyframes — no animation library */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
