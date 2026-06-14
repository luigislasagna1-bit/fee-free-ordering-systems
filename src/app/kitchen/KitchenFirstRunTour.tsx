"use client";
import { useEffect, useState } from "react";
import {
  ChefHat, Bell, CheckCircle2, XCircle, Printer, Settings,
  ArrowRight, ArrowLeft, X, SkipForward, PartyPopper,
} from "lucide-react";

/**
 * First-run onboarding tour for the Kitchen Display.
 *
 * Behavior:
 *   - On mount, check localStorage. If the user hasn't completed (or
 *     skipped) the tour on this device, show it. Otherwise render
 *     nothing.
 *   - Tour is a 5-slide modal walkthrough. Each slide has a Next /
 *     Back / Skip option. Skip dismisses for good. Finishing the last
 *     slide also dismisses for good.
 *   - localStorage key is restaurantId-scoped so an owner who switches
 *     restaurants on the same device sees the tour fresh per location
 *     (helpful for chains).
 *   - Esc dismisses (same as Skip). Click outside the modal body
 *     does NOT dismiss — too easy to lose progress accidentally.
 *
 * Inspired by the GloriaFood kitchen-app first-run flow Luigi referenced
 * during UAT. Their tour is 4 slides + a "Got it" button at the end.
 *
 * Why localStorage (not sessionStorage): we want this to fire ONCE per
 * device per restaurant, not on every login. Kitchen staff log in
 * frequently (every shift) and seeing the same tour every time would
 * become noise the second day.
 */

const DISMISS_KEY_PREFIX = "ffo:kitchen-tour-completed:";

interface Slide {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  body: React.ReactNode;
}

export function KitchenFirstRunTour({ restaurantId }: { restaurantId: string | null | undefined }) {
  const [visible, setVisible] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  // Check localStorage on mount only. We deliberately don't re-check
  // on prop changes — once shown for a session, the user finishes or
  // skips before we hide. Mounting in the middle of a session because
  // restaurantId becomes available is fine; React only mounts once
  // per restaurantId value via the key in the parent.
  useEffect(() => {
    if (!restaurantId) return;
    try {
      const seen = localStorage.getItem(DISMISS_KEY_PREFIX + restaurantId);
      if (!seen) setVisible(true);
    } catch {
      // localStorage blocked — just show the tour. Worst case it shows
      // every visit; the user can still Skip.
      setVisible(true);
    }
  }, [restaurantId]);

  // Esc-to-skip — same UX as the dispatch-mode toggle modal.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss("skipped");
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, slideIdx]);

  function dismiss(reason: "skipped" | "completed") {
    setVisible(false);
    try {
      if (restaurantId) {
        // Value records whether they skipped or completed — useful if
        // we ever add a "show me the tour again" link in settings and
        // want to distinguish "haven't seen yet" from "explicitly opted out".
        localStorage.setItem(
          DISMISS_KEY_PREFIX + restaurantId,
          JSON.stringify({ reason, at: Date.now() }),
        );
      }
    } catch {
      /* localStorage blocked — they'll see the tour again next visit */
    }
  }

  function next() {
    if (slideIdx < SLIDES.length - 1) setSlideIdx(slideIdx + 1);
    else dismiss("completed");
  }
  function back() {
    if (slideIdx > 0) setSlideIdx(slideIdx - 1);
  }

  if (!visible) return null;
  const slide = SLIDES[slideIdx];
  const isLast = slideIdx === SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kitchen-tour-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden relative">
        {/* Skip button — always visible, top right */}
        <button
          type="button"
          onClick={() => dismiss("skipped")}
          className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition"
          aria-label="Skip tour"
        >
          <SkipForward className="w-3.5 h-3.5" /> Skip
        </button>

        {/* Slide content */}
        <div className="p-7 pt-12 text-center">
          <div className={`mx-auto w-16 h-16 rounded-2xl ${slide.iconBg} flex items-center justify-center mb-4 text-white shadow-md`}>
            {slide.icon}
          </div>
          <h2 id="kitchen-tour-title" className="text-xl font-bold text-gray-900 mb-2">
            {slide.title}
          </h2>
          <div className="text-sm text-gray-700 leading-relaxed">{slide.body}</div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`rounded-full transition-all ${
                i === slideIdx ? "w-6 h-2 bg-emerald-500" : "w-2 h-2 bg-gray-300"
              }`}
            />
          ))}
        </div>

        {/* Nav buttons */}
        <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={slideIdx === 0}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-2 rounded-lg hover:bg-gray-100 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2 rounded-xl shadow-sm transition"
          >
            {isLast ? (
              <>
                Got it <X className="w-4 h-4" />
              </>
            ) : (
              <>
                Next <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tour content. Kept inline for tree-shake-ability and to make it
// trivially editable when the kitchen UI changes shape. Five slides
// matches GloriaFood's flow which we know converts well (kitchen staff
// don't have patience for more than ~5 steps).
const SLIDES: Slide[] = [
  {
    icon: <ChefHat className="w-8 h-8" />,
    iconBg: "bg-emerald-500",
    title: "Welcome to your Kitchen Order App",
    body: (
      <>
        This is where you&apos;ll see every customer order in real time. Quick walkthrough — should take less than a minute.
      </>
    ),
  },
  {
    icon: <Bell className="w-8 h-8" />,
    iconBg: "bg-orange-500",
    title: "When a new order arrives",
    body: (
      <>
        A loud alert plays and the order card flashes <strong className="text-orange-600">orange</strong> on the left. Tap it to see the details, then tap <strong className="text-emerald-600">Accept</strong> to confirm the prep time. The customer is notified instantly.
      </>
    ),
  },
  {
    icon: <CheckCircle2 className="w-8 h-8" />,
    iconBg: "bg-blue-500",
    title: "Move orders through the flow",
    body: (
      <>
        After accepting, an order moves to <strong>Preparing</strong>. When the food&apos;s ready, tap <strong>Ready</strong> for pickup or <strong>Out for delivery</strong> for delivery. Each tap notifies the customer.
      </>
    ),
  },
  {
    icon: <XCircle className="w-8 h-8" />,
    iconBg: "bg-red-500",
    title: "If you can't fulfill an order",
    body: (
      <>
        Tap <strong className="text-red-600">Reject</strong> and pick a reason (out of stock, closing soon, etc.). The customer is refunded automatically and informed — no awkward phone call needed.
      </>
    ),
  },
  {
    icon: <Printer className="w-8 h-8" />,
    iconBg: "bg-slate-700",
    title: "Printing & settings",
    body: (
      <>
        If you have a thermal printer connected, receipts print automatically when you accept an order. Set up your printer or change settings via the <Settings className="inline w-3.5 h-3.5" /> button in the top bar. <br /><br />
        <span className="text-xs text-gray-500">You can re-watch this tour anytime by clearing your browser&apos;s site data.</span>
      </>
    ),
  },
  {
    icon: <PartyPopper className="w-8 h-8" />,
    iconBg: "bg-emerald-600",
    title: "You're all set",
    body: (
      <>
        That&apos;s it. The kitchen runs itself from here — just keep this tab open during service. Good luck out there.
      </>
    ),
  },
];
