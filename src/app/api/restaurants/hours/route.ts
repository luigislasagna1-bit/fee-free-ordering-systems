/**
 * Opening hours + display-format save endpoint.
 *
 * Body shape:
 *   {
 *     hours: [
 *       { dayOfWeek: 0, isOpen: true, openTime: "09:00",
 *         closeTime: "21:00", closesNextDay: false,
 *         service?: null | "pickup" | "delivery" | "reservation" },
 *       ...
 *     ],
 *     hoursFormat?: "12h" | "24h"
 *   }
 *
 * `hoursFormat` is optional — if present, persist it on the restaurant
 * row so the customer-facing surfaces render the new convention. We
 * accept it on the same endpoint so the UI can save format + hours in
 * one button click; less moving parts for the admin.
 *
 * `service` is optional — null/missing = the "default/all services" row,
 * a specific value = per-service override. The new unique key on
 * OpeningHours is `(restaurantId, dayOfWeek, service)` so default and
 * per-service rows for the same day coexist. GloriaFood-parity 2026-05-31.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingSetting } from "@/lib/brand";

const VALID_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A child location that INHERITS its hours from the brand can't edit them here
  // — it must turn "Opening hours" off in Locations first. Luigi 2026-06-14.
  const blocked = await blockIfInheritingSetting(restaurantId, "hours");
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const hours = Array.isArray(body?.hours) ? body.hours : [];
  const format = body?.hoursFormat === "12h" || body?.hoursFormat === "24h" ? body.hoursFormat : null;
  // Per-service tabs the owner REMOVED in the UI — their rows get DELETED
  // below. Explicit list (not "absent from payload") so partial saves that
  // legitimately omit a service can never wipe it. The default/all-services
  // rows (service null) are never deletable here. Luigi 2026-07-04: X'ing the
  // Pickup tab + Save used to leave the rows behind, and the stale 9:00–23:00
  // pickup hours kept blocking checkout after he'd deleted them.
  const removedServices: string[] = Array.isArray(body?.removedServices)
    ? body.removedServices.filter((s: unknown): s is string => s === "pickup" || s === "delivery" || s === "reservation")
    : [];

  // Per-row normalize — SPLIT HOURS aware. A row may carry an `intervals`
  // array (lunch + dinner) OR the legacy single open/close pair; both produce a
  // validated interval list. openTime/closeTime are dual-written as the ENVELOPE
  // (earliest open / latest close) so every legacy reader still works; the
  // `intervals` JSON is the source of truth for split-hours readers
  // (rowIntervals in src/lib/restaurant-hours.ts). The overnight auto-fix
  // (close<=open → closesNextDay, the GloriaFood "11 AM – 12 AM" default) is
  // applied per interval. Gaps ARE allowed (the whole point); overlaps are not.
  const VALID_SVC = new Set(["pickup", "delivery", "reservation"]);
  const toMin = (s: string) => { const [hh, mm] = s.split(":").map(Number); return (hh || 0) * 60 + (mm || 0); };

  type NormRow = {
    dayOfWeek: number; service: string | null; isOpen: boolean;
    openTime: string; closeTime: string; closesNextDay: boolean;
    intervals: Array<{ open: string; close: string; closesNextDay: boolean }>;
  };
  const normalized: NormRow[] = [];

  for (const h of hours) {
    if (typeof h?.dayOfWeek !== "number" || h.dayOfWeek < 0 || h.dayOfWeek > 6) {
      return NextResponse.json({ error: "Invalid dayOfWeek" }, { status: 400 });
    }
    const service: string | null = VALID_SVC.has(h.service) ? h.service : null;

    if (!h.isOpen) {
      // Times are unused while closed; keep the owner's last-entered ones if
      // valid (so reopening restores them), else a sane default.
      const ot = VALID_HHMM.test(h.openTime) ? h.openTime : "09:00";
      const ct = VALID_HHMM.test(h.closeTime) ? h.closeTime : "21:00";
      normalized.push({ dayOfWeek: h.dayOfWeek, service, isOpen: false, openTime: ot, closeTime: ct, closesNextDay: false, intervals: [] });
      continue;
    }

    // Source intervals: the explicit split-hours array, else the single pair.
    const rawIvs: Array<{ open?: unknown; close?: unknown; closesNextDay?: unknown }> =
      Array.isArray(h.intervals) && h.intervals.length > 0
        ? h.intervals
        : [{ open: h.openTime, close: h.closeTime, closesNextDay: h.closesNextDay }];
    if (rawIvs.length > 4) {
      return NextResponse.json({ error: "At most 4 time slots per day.", code: "too_many_slots" }, { status: 400 });
    }
    const ivs: Array<{ open: string; close: string; closesNextDay: boolean }> = [];
    for (const it of rawIvs) {
      const open = String(it?.open ?? ""), close = String(it?.close ?? "");
      if (!VALID_HHMM.test(open) || !VALID_HHMM.test(close)) {
        return NextResponse.json({ error: "Times must be HH:MM 24-hour" }, { status: 400 });
      }
      const closesNextDay = Boolean(it?.closesNextDay) || toMin(close) <= toMin(open);
      ivs.push({ open, close, closesNextDay });
    }
    ivs.sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
    for (let i = 0; i < ivs.length; i++) {
      if (ivs[i].closesNextDay && i !== ivs.length - 1) {
        return NextResponse.json({ error: "Only the last time slot of a day may pass midnight.", code: "overnight_not_last" }, { status: 400 });
      }
      if (i > 0 && !ivs[i - 1].closesNextDay && ivs[i].open < ivs[i - 1].close) {
        return NextResponse.json({ error: "Time slots can't overlap.", code: "overlapping_slots" }, { status: 400 });
      }
    }
    const last = ivs[ivs.length - 1];
    normalized.push({
      dayOfWeek: h.dayOfWeek, service, isOpen: true,
      openTime: ivs[0].open, closeTime: last.close, closesNextDay: last.closesNextDay,
      intervals: ivs,
    });
  }

  // Reject saves where every day is marked closed (audit 2026-05-30) — only when
  // the payload covers the full week, so partial updates still work.
  if (normalized.length >= 7 && normalized.every((n) => !n.isOpen)) {
    return NextResponse.json(
      {
        error:
          "Refusing to save: every day is marked closed. Toggle at least one day open, or use the temporary-close switch on the dashboard if you want to pause briefly.",
        code: "all_days_closed",
      },
      { status: 400 },
    );
  }

  for (const n of normalized) {
    // Prisma can't model a compound unique against a NULLABLE column in the
    // generated where input (service: null is rejected at type-check). Workaround:
    // find-then-update. Race-safe enough for an admin-only endpoint.
    const existing = await prisma.openingHours.findFirst({
      where: { restaurantId, dayOfWeek: n.dayOfWeek, service: n.service },
      select: { id: true },
    });
    const data = {
      isOpen: n.isOpen,
      openTime: n.openTime,
      closeTime: n.closeTime,
      closesNextDay: n.closesNextDay,
      intervals: n.intervals,
    };
    if (existing) {
      await prisma.openingHours.update({ where: { id: existing.id }, data });
    } else {
      await prisma.openingHours.create({ data: { restaurantId, dayOfWeek: n.dayOfWeek, service: n.service, ...data } });
    }
  }

  // Delete rows for per-service tabs the owner removed (see comment above).
  if (removedServices.length > 0) {
    await prisma.openingHours.deleteMany({
      where: { restaurantId, service: { in: removedServices } },
    });
  }

  if (format) {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { hoursFormat: format },
    });
  }

  return NextResponse.json({ success: true });
}
