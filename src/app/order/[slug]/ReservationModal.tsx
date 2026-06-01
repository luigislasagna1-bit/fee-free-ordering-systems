"use client";
import { useEffect, useMemo, useState } from "react";
import { X, Calendar, Clock, Users, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { validateBooking, type ReservationSettingsLike } from "@/lib/reservation-validation";
import { parseTheme } from "@/lib/theme";
import { useTranslations } from "next-intl";
import { pickHoursForService } from "@/lib/service-hours";

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
  theme: Theme;
  onClose: () => void;
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

function generateTimeSlots(openHHMM: string, closeHHMM: string, stepMin: number): string[] {
  const [oh, om] = openHHMM.split(":").map(Number);
  const [ch, cm] = closeHHMM.split(":").map(Number);
  const start = oh * 60 + om;
  const end = ch * 60 + cm;
  const out: string[] = [];
  for (let m = start; m <= end; m += stepMin) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export function ReservationModal({
  restaurantSlug, restaurantName, settings,
  fallbackOpeningHours = [],
  requireCustomerEmail = true,
  requireCustomerPhone = true,
  theme, onClose,
}: Props) {
  const tr = useTranslations("reservation");
  const tOrd = useTranslations("ordering");
  const [step, setStep] = useState<"details" | "preorder" | "deposit" | "done">("details");
  const [partySize, setPartySize] = useState(Math.max(2, settings.minGuests));
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("19:00");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<"confirmed" | "pending" | null>(null);

  const validation = useMemo(() => validateBooking(settings, { date, time, partySize }, new Date()), [settings, date, time, partySize]);

  // On modal mount, auto-snap the date to the next open day if today
  // isn't reservable. Avoids the "land on Monday, see No reservations
  // available, give up" UX that Luigi's Italian client hit. Only fires
  // ONCE on mount — subsequent date changes are the customer's choice
  // and we don't second-guess them.
  useEffect(() => {
    const next = findNextOpenDate(settings.reservationHours, fallbackOpeningHours as any, todayISO());
    if (next && next !== date) setDate(next);
    // Intentionally not depending on settings or hours — we only want
    // this to fire on first mount.
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
  const timeSlots = useMemo(() => {
    if (dayHours) {
      if (dayHours.enabled === false) return [];
      return generateTimeSlots(dayHours.open || "10:00", dayHours.close || "22:00", 30);
    }
    if (fallbackRow && fallbackRow.isOpen) {
      return generateTimeSlots(fallbackRow.openTime || "10:00", fallbackRow.closeTime || "22:00", 30);
    }
    // No reservation hours AND no opening hours → genuinely closed.
    // We could still surface the 10-22 default to be permissive, but
    // honouring "the restaurant is closed today" is the right call.
    if (fallbackOpeningHours.length > 0) return [];
    return generateTimeSlots("10:00", "22:00", 30);
  }, [dayHours, fallbackRow, fallbackOpeningHours.length]);

  const partySizeRange = useMemo(() => {
    const out: number[] = [];
    for (let i = settings.minGuests; i <= settings.maxGuests; i++) out.push(i);
    return out;
  }, [settings.minGuests, settings.maxGuests]);

  const submit = async () => {
    if (!validation.ok) { toast.error(validation.reason); return; }
    if (!name.trim()) { toast.error(tr("nameAndPhone")); return; }
    if (requireCustomerPhone && !phone.trim()) { toast.error(tr("nameAndPhone")); return; }
    if (requireCustomerEmail && !email.trim()) { toast.error("Email is required"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantSlug,
          customerName: name, customerEmail: email, customerPhone: phone,
          partySize, date, time, notes,
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
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-2xl w-full max-w-lg max-h-[96vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{tOrd("tableReservation")}</h2>
            <p className="text-xs text-gray-500">{restaurantName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
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
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
              </div>

              {/* Time */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Clock className="w-4 h-4" /> {tr("selectTime")}
                </label>
                {timeSlots.length === 0 ? (() => {
                  // Smarter empty-state. Tell the customer WHICH day is
                  // closed and offer a "Jump to next open day" button
                  // so they don't have to play date-picker roulette.
                  const dayLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dayOfWeek] ?? "this day";
                  const nextOpen = findNextOpenDate(
                    settings.reservationHours,
                    fallbackOpeningHours as any,
                    (() => {
                      // Probe from the day AFTER the currently-selected one
                      const d = new Date(`${date}T00:00:00`);
                      d.setDate(d.getDate() + 1);
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    })(),
                  );
                  return (
                    <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-2">
                      <div>
                        We&apos;re closed on <strong>{dayLabel}</strong> — please pick a different date.
                      </div>
                      {nextOpen && (
                        <button
                          type="button"
                          onClick={() => setDate(nextOpen)}
                          className="text-xs font-semibold underline hover:no-underline"
                        >
                          Jump to next open day ({new Date(`${nextOpen}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })})
                        </button>
                      )}
                    </div>
                  );
                })() : (
                  <select
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  >
                    {timeSlots.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text" placeholder={tr("fullName")}
                  value={name} onChange={e => setName(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
                <input
                  type="tel"
                  required={requireCustomerPhone}
                  placeholder={`${tr("phoneRequired")}${requireCustomerPhone ? "" : " (optional)"}`}
                  value={phone} onChange={e => setPhone(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                />
              </div>
              <input
                type="email"
                required={requireCustomerEmail}
                placeholder={`${tr("emailForConfirmation")}${requireCustomerEmail ? "" : " (optional)"}`}
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
              />

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
                    {tr("seeYou", { date, time, n: partySize, label: partySize === 1 ? tr("person") : tr("people") })}
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
            <button
              onClick={submit}
              disabled={submitting || !validation.ok || timeSlots.length === 0}
              className="w-full text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
              style={{ backgroundColor: theme.primaryColor }}
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              {submitting ? tr("reserving") : tr("reserveTable")}
            </button>
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
