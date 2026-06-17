"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Calendar, Clock, Users, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { validateBooking, type ReservationSettingsLike } from "@/lib/reservation-validation";
import { parseTheme } from "@/lib/theme";
import { useTranslations } from "next-intl";
import { pickHoursForService } from "@/lib/service-hours";
import { formatTime, type HoursFormat } from "@/lib/format-time";

type Theme = ReturnType<typeof parseTheme>;

interface Props {
  restaurantSlug: string;
  restaurantName: string;
  settings: ReservationSettingsLike;
  /** Restaurant's standard opening hours — used as a fallback when
   *  reservationSettings.reservationHours is empty / unset. Each row
   *  is one day of the week (dayOfWeek: 0=Sunday … 6=Saturday) with
   *  open/close strings and an isOpen flag. The reservation modal
   *  treats these as the "default" reservation window if the owner
   *  hasn't explicitly configured per-day reservation hours.
   *  Previously the modal returned no slots when reservationHours
   *  was "{}" (the schema default) which made the booking form
   *  unusable for every new restaurant. */
  fallbackOpeningHours?: Array<{
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isOpen: boolean;
    service?: string | null;
  }>;
  /** Whether email is mandatory on the reservation form. Mirrors the
   *  same flag used by the ordering checkout (Restaurant.
   *  requireCustomerEmail). Default true. */
  requireCustomerEmail?: boolean;
  /** Whether phone is mandatory on the reservation form. Mirrors the
   *  ordering side. Default true — strongly recommended because the
   *  restaurant needs to call about table assignments. */
  requireCustomerPhone?: boolean;
  /** Customer-facing time-of-day display format — comes from
   *  Restaurant.hoursFormat. Drives only the LABEL in the time slot
   *  dropdown; the form value stays HH:MM 24-hour for API
   *  compatibility. "12h" → "7:00 PM", "24h" → "19:00". Default 24h
   *  matches the legacy behaviour for restaurants who haven't
   *  explicitly opted into 12-hour rendering. */
  hoursFormat?: HoursFormat;
  /** Restaurant's IANA timezone. Threaded into validateBooking so
   *  client- and server-side validation use the same wall-clock
   *  reference. Without it the server (UTC) and client (browser
   *  local) can disagree on whether "today 6 PM" is enough notice.
   *  Luigi 2026-06-01. */
  timezone?: string;
  theme: Theme;
  onClose: () => void;
  /** When true, render as an inline card (no fixed dark overlay, no internal
   *  header) for the standalone reservation page, which supplies its own
   *  branded hero above. Default false = the classic modal overlay. */
  embedded?: boolean;
  /** Restaurant has "let customers order food with their reservation" on
   *  (ReservationSettings.allowPreOrder). When true AND onContinueToOrder is
   *  provided, the form offers "Add food to your booking", which hands the
   *  validated booking off to the ordering flow instead of booking a bare
   *  table — the reservation is then created together with the paid order
   *  (one combined submission). Luigi 2026-06-08. */
  allowPreOrder?: boolean;
  /** Called when the customer chooses to add food. Receives the validated
   *  booking draft; the caller carries it into the ordering/checkout flow. */
  onContinueToOrder?: (draft: {
    date: string; time: string; partySize: number;
    name: string; phone: string; email: string; notes: string;
  }) => void;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function maxISO(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Find the next calendar date (looking at up to 14 days ahead) that
 * has a reservable hours window. Checks both the per-day reservation
 * hours JSON and the fallback openingHours rows. Used to:
 *   - auto-default the date picker to a day the customer can actually
 *     book on, instead of landing on a closed day and seeing "No
 *     reservations available"
 *   - surface a "next open: <day>" suggestion in the closed-day banner
 *
 * Returns the YYYY-MM-DD string of the next open day, or null when we
 * can't find one in the lookahead window (typical when the restaurant
 * is genuinely closed every day, which suggests a setup problem).
 */
function findNextOpenDate(
  reservationHoursJson: string | null | undefined,
  fallbackOpeningHours: Array<{ dayOfWeek: number; isOpen: boolean; service?: string | null }>,
  startISO: string,
): string | null {
  let hoursMap: Record<string, { enabled: boolean }> = {};
  try { hoursMap = JSON.parse(reservationHoursJson || "{}"); } catch {}
  const start = new Date(`${startISO}T00:00:00`);
  for (let offset = 0; offset < 14; offset++) {
    const probe = new Date(start);
    probe.setDate(start.getDate() + offset);
    const dow = probe.getDay();
    const explicit = hoursMap[String(dow)];
    if (explicit) {
      if (explicit.enabled !== false) {
        return `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, "0")}-${String(probe.getDate()).padStart(2, "0")}`;
      }
      continue;
    }
    // Fall back to openingHours — prefer a reservation-scoped row,
    // then the default. Closed (isOpen=false) days don't count.
    const reservationRow = fallbackOpeningHours.find(
      (h) => h.dayOfWeek === dow && h.service === "reservation",
    );
    const defaultRow = fallbackOpeningHours.find(
      (h) => h.dayOfWeek === dow && (h.service == null || h.service === ""),
    );
    const row = reservationRow ?? defaultRow;
    if (row && row.isOpen) {
      return `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, "0")}-${String(probe.getDate()).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Closed-day banner — renders when the owner explicitly marked the
 * selected date off in admin hours. Shows the day name + a button
 * that hops the date picker to the next open day. Booking is blocked
 * until the customer picks a different date (the submit button is
 * disabled by the parent).
 */
function ClosedDayBlock({
  dayOfWeek,
  date,
  settings,
  fallbackOpeningHours,
  onJump,
}: {
  dayOfWeek: number;
  date: string;
  settings: { reservationHours?: string | null };
  fallbackOpeningHours: Array<{ dayOfWeek: number; isOpen: boolean; service?: string | null }>;
  onJump: (next: string) => void;
}) {
  const dayLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek] ?? "this day";
  const nextOpen = findNextOpenDate(
    settings.reservationHours,
    fallbackOpeningHours,
    (() => {
      const d = new Date(`${date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })(),
  );
  return (
    <div className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-3 space-y-2">
      <div>
        We&apos;re closed on <strong>{dayLabel}</strong> — please pick a different date.
      </div>
      {nextOpen && (
        <button
          type="button"
          onClick={() => onJump(nextOpen)}
          className="text-xs font-semibold underline hover:no-underline"
        >
          Jump to next open day ({new Date(`${nextOpen}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })})
        </button>
      )}
    </div>
  );
}

/**
 * Build a list of HH:MM strings from openHHMM (inclusive) to closeHHMM
 * (inclusive) at stepMin-minute intervals.
 *
 * Closes-next-day handling (Luigi 2026-06-01): when the close time
 * is at or before the open time we treat the window as wrapping past
 * midnight — e.g. 11 AM → 12 AM means "open 11 AM to midnight" and
 * should emit 11 AM, 11:30 AM, 12 PM, … 11:30 PM. The owner-side
 * hours editor stamps closesNextDay on save, and the read path
 * auto-applies it (src/lib/service-hours.ts), but we make the slot
 * generator defensive regardless — if anyone EVER hands us an
 * impossible window, returning [] silently is the exact "no slots"
 * footgun we just spent a day diagnosing.
 *
 * stepMin is the configurable slot interval — comes from
 * ReservationSettings.slotLengthMinutes (default 30, owner can pick
 * 10/15/20/30/45/60 in the admin reservation settings).
 *
 * sanitisation: clamp stepMin to [5, 120] so a bad value (0, negative,
 * 9999) can't lock the slot loop or generate thousands of options.
 */
function generateTimeSlots(openHHMM: string, closeHHMM: string, stepMin: number): string[] {
  const step = Math.max(5, Math.min(120, Math.floor(stepMin) || 30));
  const [oh, om] = openHHMM.split(":").map(Number);
  const [ch, cm] = closeHHMM.split(":").map(Number);
  const start = (oh ?? 0) * 60 + (om ?? 0);
  let end = (ch ?? 0) * 60 + (cm ?? 0);
  // Wrap-past-midnight: 11 AM → 12 AM, 9 PM → 2 AM, etc. We don't
  // bother passing closesNextDay explicitly because it's implied
  // whenever close <= open. (The owner can't legitimately set a
  // 0-minute window.)
  if (end <= start) end += 24 * 60;
  const out: string[] = [];
  for (let m = start; m <= end; m += step) {
    const hh = Math.floor(m / 60) % 24;
    const mm = m % 60;
    out.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}

export function ReservationModal({
  restaurantSlug, restaurantName, settings,
  fallbackOpeningHours = [],
  requireCustomerEmail = true,
  requireCustomerPhone = true,
  hoursFormat = "24h",
  timezone,
  theme, onClose,
  embedded = false,
  allowPreOrder = false,
  onContinueToOrder,
}: Props) {
  const tr = useTranslations("reservation");
  const tOrd = useTranslations("ordering");
  const [step, setStep] = useState<"details" | "preorder" | "deposit" | "done">("details");
  const [partySize, setPartySize] = useState(Math.max(2, settings.minGuests));
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("19:00");
  // First / last name split for the form (Luigi 2026-06-01) — the
  // wire payload still posts a single `customerName` field so the
  // API + DB schema are unchanged. We concatenate "First Last" on
  // submit; an empty last name produces just "First". GloriaFood
  // parity. The legacy `name` variable name is preserved for the
  // existing validation/submit logic; `name` is derived from
  // firstName + lastName via a memo below.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const name = useMemo(
    () => [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
    [firstName, lastName],
  );
  const setName = (v: string) => {
    // Back-compat shim: any code paths that still call setName()
    // (e.g. autofill from a saved profile) split the value on the
    // first space. Most use-cases hand us "First Last".
    const parts = v.split(" ");
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
  };
  void setName; // suppress unused-warn — kept available for future autofill
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  // Marketing consent — default CHECKED (opt-out), mirrors the order checkout
  // (Fabrizio 2026-06-14, GloriaFood parity). Persisted via the reservations
  // route's Customer upsert so it lands in the same consent field as orders.
  const [marketingConsent, setMarketingConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<"confirmed" | "pending" | null>(null);

  // (validation is computed below, AFTER dayHours / fallbackRow are resolved —
  // it needs the day's effective open/close to handle cross-midnight windows.)

  // On modal mount, auto-snap the date to the next open day IF today
  // is explicitly closed (per admin hours). When today is open or the
  // day is ambiguous (no row for the day-of-week) we stay on today —
  // we only fast-forward when the owner clearly marked the day off.
  useEffect(() => {
    const next = findNextOpenDate(settings.reservationHours, fallbackOpeningHours as any, todayISO());
    // Only auto-jump when "today" is explicitly closed AND we found
    // a different, open day to land on.
    const todayClosedExplicit = (() => {
      const today = todayISO();
      const dow = new Date(`${today}T00:00:00`).getDay();
      let hoursMap: Record<string, { enabled?: boolean }> = {};
      try { hoursMap = JSON.parse(settings.reservationHours || "{}"); } catch {}
      const explicit = hoursMap[String(dow)];
      if (explicit) return explicit.enabled === false;
      const row = (fallbackOpeningHours as any[]).find((h) => h.dayOfWeek === dow);
      return !!row && row.isOpen === false;
    })();
    if (todayClosedExplicit && next && next !== date) setDate(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build time slot list from the day's reservation hours
  const dayOfWeek = useMemo(() => {
    const d = new Date(`${date}T00:00:00`);
    return d.getDay();
  }, [date]);
  let hoursMap: Record<string, { open: string; close: string; enabled: boolean }> = {};
  try { hoursMap = JSON.parse(settings.reservationHours || "{}"); } catch {}
  const dayHours = hoursMap[String(dayOfWeek)];
  // Fallback chain (Luigi bug 2026-05-31, "No reservations available"):
  //   1. Explicit reservationHours for this day, if owner configured one
  //   2. Restaurant's regular openingHours for this day-of-week
  //   3. Final hard fallback to 10:00–22:00 so the form is never empty
  //      when the data is genuinely missing — at worst the kitchen
  //      will see a booking outside hours and decline it.
  // Service-aware lookup: prefer a "reservation"-scoped row when the
  // owner has configured one, else the default row. Pre-feature
  // restaurants only have default rows so the result matches the
  // legacy behaviour.
  const fallbackRow = pickHoursForService(fallbackOpeningHours as any, dayOfWeek, "reservation");

  // The day's effective open/close — same fallback chain the slot list uses
  // (explicit reservationHours row, else the opening-hours row). Fed to the
  // validator so it recognises a cross-midnight close (e.g. 04:00) and stops
  // rejecting a valid post-midnight slot as "in the past". Luigi 2026-06-08.
  const effectiveDayHours = useMemo<{ open: string; close: string } | null>(() => {
    if (dayHours && dayHours.open && dayHours.close) {
      return { open: dayHours.open, close: dayHours.close };
    }
    if (fallbackRow && fallbackRow.openTime && fallbackRow.closeTime) {
      return { open: fallbackRow.openTime, close: fallbackRow.closeTime };
    }
    return null;
  }, [dayHours, fallbackRow]);
  const validation = useMemo(
    () => validateBooking(settings, { date, time, partySize }, new Date(), timezone, effectiveDayHours),
    [settings, date, time, partySize, timezone, effectiveDayHours],
  );

  // Whether the day looks closed per the data we have. Used to render
  // a soft amber warning ABOVE the slots — we still surface slots so
  // the customer can submit a request the kitchen can accept or
  // decline, matching GloriaFood's "never block the customer" pattern.
  // Luigi 2026-06-01: data-shape edge cases were producing false
  // "Closed on X" messages even when the restaurant was actually
  // open. Switching to soft warnings eliminates the dead end.
  // Browser-console diagnostic — when an owner sees an unexpected
  // "this date may be outside our usual hours" warning, this log
  // makes it obvious whether the openingHours data we received
  // actually says open or closed for the selected day. Reads once
  // per date change. Strip later once we're confident.
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.debug("[Reservation] day check", {
      date,
      dayOfWeek,
      reservationHoursJson: settings.reservationHours,
      fallbackOpeningHours,
      pickedFallbackRow: fallbackRow,
    });
  }

  // Three-state day status (Luigi 2026-06-01, GloriaFood-strict):
  //   "open"        — owner explicitly marked this day open OR provided
  //                   a reservationHours row with enabled !== false
  //   "closedHard"  — owner explicitly marked the day off in admin
  //                   (isOpen:false row OR reservationHours enabled:false).
  //                   BLOCK booking — match GloriaFood: no requests
  //                   get through for explicitly-closed days.
  //   "ambiguous"   — no row at all for the day-of-week. Show a soft
  //                   warning + still allow the request so an
  //                   incomplete setup doesn't kill the flow.
  const dayStatus: "open" | "closedHard" | "ambiguous" = useMemo(() => {
    if (dayHours) {
      return dayHours.enabled === false ? "closedHard" : "open";
    }
    if (fallbackRow) {
      return fallbackRow.isOpen === false ? "closedHard" : "open";
    }
    return "ambiguous";
  }, [dayHours, fallbackRow]);
  const dayLooksClosed = dayStatus === "closedHard";

  // Slot interval — owner-controlled via ReservationSettings.
  // slotLengthMinutes (admin reservation settings, default 30). Cap
  // at sane values inside generateTimeSlots so a stale or corrupt
  // value can't break the loop.
  const slotStep = settings.slotLengthMinutes ?? 30;
  const timeSlots = useMemo(() => {
    // 1. Generate the raw list from the day's hours.
    let raw: string[];
    let openHHMM = "10:00";
    if (dayHours && dayHours.enabled !== false) {
      openHHMM = dayHours.open || "10:00";
      raw = generateTimeSlots(openHHMM, dayHours.close || "22:00", slotStep);
    } else if (fallbackRow && fallbackRow.isOpen) {
      openHHMM = fallbackRow.openTime || "10:00";
      raw = generateTimeSlots(openHHMM, fallbackRow.closeTime || "22:00", slotStep);
    } else if (dayStatus === "closedHard") {
      // Hard-closed days: empty list. The JSX below switches to the
      // "We're closed on Monday — pick another date" + Jump-to-next CTA.
      return [];
    } else {
      // Ambiguous (no row): permissive default so an incomplete setup
      // doesn't block the customer.
      openHHMM = "10:00";
      raw = generateTimeSlots("10:00", "22:00", slotStep);
    }

    // 2. If the selected date is TODAY, drop slots that are in the
    //    past OR within the minNoticeMinutes window. No reason to
    //    let a customer pick 11:00 AM at 2:58 PM and then see the
    //    validator reject it with "book at least 2 hours in advance"
    //    — better to hide the impossible options up front. Luigi
    //    2026-06-01 (GloriaFood parity: the picker only ever shows
    //    bookable slots for the chosen day).
    if (date === todayISO()) {
      // Prefer minNoticeMinutes when set; fall back to legacy
      // minNoticeHours * 60 for older settings rows.
      const minNotice =
        typeof settings.minNoticeMinutes === "number"
          ? settings.minNoticeMinutes
          : (settings.minNoticeHours ?? 0) * 60;
      const now = new Date();
      const cutoffMin =
        now.getHours() * 60 + now.getMinutes() + Math.max(0, minNotice);
      // Slots generated PAST MIDNIGHT (a day that closes at/after 00:00) come
      // back as small HH:MM (e.g. 00:30) but happen TONIGHT, after midnight.
      // Shift them a full day before comparing to the cutoff, otherwise they
      // look ~22 h in the past and get dropped — which is exactly why a
      // restaurant open until 4 AM showed NO slots after ~10 PM. A slot is
      // post-midnight when its minute-of-day is below the open time (the
      // generator emits slots in order from open, wrapping). Luigi 2026-06-08.
      const [ohh, omm] = openHHMM.split(":").map(Number);
      const openMin = (ohh ?? 0) * 60 + (omm ?? 0);
      raw = raw.filter((hhmm) => {
        const [hh, mm] = hhmm.split(":").map(Number);
        let slotMin = (hh ?? 0) * 60 + (mm ?? 0);
        if (slotMin < openMin) slotMin += 24 * 60;
        return slotMin >= cutoffMin;
      });
    }
    return raw;
  }, [dayHours, fallbackRow, dayStatus, slotStep, date, settings.minNoticeMinutes, settings.minNoticeHours]);

  // When the slot list changes (date pick, hours change, interval
  // change) and the currently-selected time is no longer in the list,
  // snap to the first valid slot. Prevents the dropdown rendering
  // visually-empty in browsers that hide unselected options when the
  // bound value doesn't match — the exact "Select time is blank"
  // symptom Luigi reported 2026-06-01.
  useEffect(() => {
    if (timeSlots.length === 0) return;
    if (!timeSlots.includes(time)) {
      // Prefer a "prime-time" default near 7 PM when available, else
      // the middle of the list, else the first slot. Mirrors the
      // GloriaFood UX where the dropdown opens close to dinner.
      const prime =
        timeSlots.find((t) => t === "19:00") ??
        timeSlots.find((t) => t === "18:30") ??
        timeSlots.find((t) => t === "19:30") ??
        timeSlots[Math.floor(timeSlots.length / 2)] ??
        timeSlots[0];
      setTime(prime);
    }
  }, [timeSlots, time]);

  const partySizeRange = useMemo(() => {
    const out: number[] = [];
    for (let i = settings.minGuests; i <= settings.maxGuests; i++) out.push(i);
    return out;
  }, [settings.minGuests, settings.maxGuests]);

  // Shared validation for both "Just book the table" and "Add food to your
  // booking" — same rules, so a pre-order can't slip past with bad contact /
  // booking details. Returns false (and toasts) on the first failure.
  const validateForm = (): boolean => {
    if (dayLooksClosed) {
      // Belt-and-suspenders to the disabled submit button — refuse
      // to fire the request when the day is explicitly closed in
      // admin hours. GloriaFood-strict: no requests get through.
      toast.error("We're closed on the selected date — please pick another day.");
      return false;
    }
    if (!validation.ok) { toast.error(validation.reason); return false; }
    // Require BOTH first and last name. The form shows two "*" fields, but the
    // submit is an onClick (not a <form> submit) so the inputs' `required` never
    // fires — a first-name-only entry used to slip straight through. Mirrors
    // checkout + the server guard below. (Fabrizio: the reservation panel let
    // bookings complete with no last name even after checkout was fixed.)
    if (!firstName.trim() || !lastName.trim()) { toast.error(tOrd("toasts.fullNameRequired")); return false; }
    if (requireCustomerPhone && !phone.trim()) { toast.error(tr("nameAndPhone")); return false; }
    // Phone must be a real number — no letters, at least 6 digits. Mirrors the
    // order checkout guard (cmq0vafk5) + catches autofill that bypasses the
    // keystroke filter. Only when a phone is actually present.
    if (phone.trim()) {
      const digits = (phone.match(/\d/g) || []).length;
      if (/[a-z]/i.test(phone) || digits < 6) { toast.error(tOrd("toasts.phoneInvalid")); return false; }
    }
    if (requireCustomerEmail && !email.trim()) { toast.error("Email is required"); return false; }
    return true;
  };

  // "Add food to your booking" — validate, then hand the booking off to the
  // ordering flow. The reservation is created together with the paid order
  // (combined checkout), so we DON'T create a reservation here. Luigi 2026-06-08.
  const continueToOrder = () => {
    if (!validateForm()) return;
    onContinueToOrder?.({ date, time, partySize, name, phone, email, notes });
  };

  const submit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug,
          customerName: name, customerEmail: email, customerPhone: phone,
          partySize, date, time, notes, marketingConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || tr("reservationFailed"));
      setConfirmationCode(data.confirmationCode);
      setFinalStatus(data.status === "confirmed" ? "confirmed" : "pending");
      setStep("done");
    } catch (e: any) {
      toast.error(e.message || tr("reservationFailed"));
    }
    setSubmitting(false);
  };

  return (
    <div
      className={embedded ? "contents" : "fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"}
      onClick={embedded ? undefined : onClose}
    >
      <div
        className={embedded
          ? "bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col"
          : "bg-white sm:rounded-2xl w-full max-w-lg max-h-[96vh] overflow-hidden flex flex-col"}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — hidden in embedded mode; the standalone reservation page
            supplies its own branded hero with the name + "Table Reservation". */}
        {!embedded && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{tOrd("tableReservation")}</h2>
              <p className="text-xs text-gray-500">{restaurantName}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === "details" && (
            <div className="space-y-4">
              {/* Party size */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Users className="w-4 h-4" /> {tr("numberOfPeople")}
                </label>
                <select
                  value={partySize}
                  onChange={e => setPartySize(parseInt(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                >
                  {partySizeRange.map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? tr("person") : tr("people")}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Calendar className="w-4 h-4" /> {tr("selectDate")}
                </label>
                <input
                  type="date"
                  value={date}
                  min={todayISO()}
                  max={maxISO(settings.maxAdvanceDays)}
                  onChange={e => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
              </div>

              {/* Time */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Clock className="w-4 h-4" /> {tr("selectTime")}
                </label>
                {/* GloriaFood-strict closed-day handling:
                    - "closedHard" (owner explicitly marked off in
                      admin) → block booking with a red banner + Jump
                      CTA. No time picker.
                    - "ambiguous" (no row at all for the day) → amber
                      soft warning above the time picker; submission
                      allowed so an incomplete setup doesn't kill the
                      flow entirely.
                    - "open" → just the time picker. */}
                {dayStatus === "closedHard" ? (
                  <ClosedDayBlock
                    dayOfWeek={dayOfWeek}
                    date={date}
                    settings={settings}
                    fallbackOpeningHours={fallbackOpeningHours}
                    onJump={(d) => setDate(d)}
                  />
                ) : (
                  <>
                    {dayStatus === "ambiguous" && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                        Heads up: we haven&apos;t set hours for this day. Submit a request anyway and we&apos;ll confirm if we can fit you in.
                      </p>
                    )}
                    <select
                      value={time}
                      onChange={e => setTime(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    >
                      {timeSlots.map(t => (
                        // value stays HH:MM 24h (the form posts this
                        // verbatim — the API and DB expect 24h). The
                        // label renders in the restaurant's chosen
                        // hoursFormat so a 12-hour-clock restaurant
                        // sees "7:00 PM" instead of "19:00".
                        <option key={t} value={t}>{formatTime(t, hoursFormat)}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              {/* Contact — first/last name split (Luigi 2026-06-01
                  GloriaFood parity). Asterisk rendered ONCE based on
                  required state; no more "Name **" double-marker.
                  Email placeholder no longer says "optional" when the
                  field is in fact required (requireCustomerEmail). */}
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder={`${tr("firstName")} *`}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
                <input
                  type="text"
                  required
                  placeholder={`${tr("lastName")} *`}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
                <input
                  type="tel"
                  inputMode="tel"
                  required={requireCustomerPhone}
                  placeholder={`${tr("phoneRequired")}${requireCustomerPhone ? " *" : " (optional)"}`}
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d+()\-.\s]/g, ""))}
                  className="col-span-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
              </div>
              <input
                type="email"
                required={requireCustomerEmail}
                placeholder={
                  requireCustomerEmail
                    ? `${tr("emailForConfirmation")} *`
                    : tr("emailForConfirmationOptional")
                }
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />

              {/* Marketing consent — only when an email is present (consent is
                  meaningless without an inbox), default checked. Mirrors checkout. */}
              {email.trim().length > 0 && (
                <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={marketingConsent}
                    onChange={e => setMarketingConsent(e.target.checked)}
                    style={{ accentColor: theme.primaryColor }}
                  />
                  <span>{tOrd("marketingConsentLabel")}</span>
                </label>
              )}

              {/* Comments */}
              <textarea
                rows={2} placeholder={tr("commentsPlaceholder")}
                value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 resize-none"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />

              {/* Inline validation hint */}
              {!validation.ok && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{validation.reason}</span>
                </div>
              )}

              {/* Deposit hint */}
              {settings.requireDeposit && settings.depositAmount > 0 && (
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  {tr("depositHintPerGuest", { amount: `$${settings.depositAmount.toFixed(2)}`, total: `$${(settings.depositAmount * partySize).toFixed(2)}` })}
                </div>
              )}

              {/* Table-hold note (GloriaFood parity) — we hold the table for
                  holdMinutes after the reservation time. Luigi 2026-06-08. */}
              {settings.holdMinutes > 0 && (
                <p className="text-xs text-gray-500 flex items-start gap-1.5">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{tr("holdMinutesNote", { minutes: settings.holdMinutes })}</span>
                </p>
              )}

              {/* Cancellation policy */}
              {settings.cancellationPolicy && (
                <p className="text-xs text-gray-400">{settings.cancellationPolicy}</p>
              )}
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-14 h-14 mx-auto" style={{ color: theme.primaryColor }} />
              {finalStatus === "confirmed" ? (
                <>
                  <h3 className="text-xl font-bold text-gray-900">{tr("reservationConfirmedHeading")}</h3>
                  <p className="text-sm text-gray-600">
                    {tr("seeYou", { date, time: formatTime(time, hoursFormat), n: partySize, label: partySize === 1 ? tr("person") : tr("people") })}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-gray-900">{tr("requestReceived")}</h3>
                  <p className="text-sm text-gray-600">
                    {tr("reviewAndConfirm", { restaurant: restaurantName })}
                  </p>
                </>
              )}
              {confirmationCode && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{tr("confirmationCode")}</p>
                  <p className="text-2xl font-mono font-bold tracking-widest mt-1">{confirmationCode}</p>
                </div>
              )}
              {email && (
                <p className="text-xs text-gray-500 mt-3">{tr("emailSent", { email })}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4">
          {step === "details" && (
            allowPreOrder && onContinueToOrder ? (
              // Pre-order enabled: leading action adds food (combined checkout);
              // a secondary action still allows booking a bare table.
              <div className="space-y-2">
                <button
                  onClick={continueToOrder}
                  disabled={submitting || !validation.ok || timeSlots.length === 0}
                  className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {tr("addFoodToBooking")}
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || !validation.ok || timeSlots.length === 0}
                  className="w-full font-semibold py-2.5 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 border"
                  style={{ borderColor: theme.primaryColor, color: theme.primaryColor }}
                >
                  {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                  {submitting ? tr("reserving") : tr("justBookTable")}
                </button>
              </div>
            ) : (
              <button
                onClick={submit}
                disabled={submitting || !validation.ok || timeSlots.length === 0}
                className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                {submitting ? tr("reserving") : tr("reserveTable")}
              </button>
            )
          )}
          {step === "done" && (
            <button
              onClick={onClose}
              className="w-full text-white font-bold py-3 rounded-xl"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {tr("done")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
