import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import prisma from "@/lib/db";
import { daysLeft, dayStamp, clearRestaurantGrace } from "@/lib/dunning";
import { cascadeMultiLocationDowngrade } from "@/lib/multi-location-downgrade";
import {
  sendOwnerCountdown,
  sendOwnerDowngraded,
  sendResellerAlert,
  sendChildBrandWarning,
  sendChildBrandReset,
} from "@/lib/dunning-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily dunning sweep (Luigi 2026-06-15). For every restaurant inside a
 * failed-payment grace window:
 *   - in grace  → countdown email + SMS to the owner, ONCE per calendar day
 *                 (idempotent via lastDunnedOn). On the FIRST nudge it also
 *                 alerts the reseller (if any) and warns child locations when
 *                 the lapsed add-on is Multi-Location.
 *   - grace expired → send the "paid features paused" notice, run the
 *                 Multi-Location cascade (sever children + notify each child
 *                 owner) when that add-on lapsed, then clear the clock so the
 *                 restaurant is no longer swept (the per-add-on past_due rows
 *                 now govern; their features already dropped automatically as
 *                 the entitlement grace window expired).
 *
 * Every restaurant is wrapped in try/catch so one failure can't abort the
 * sweep. Best-effort sends never throw (see dunning-notify).
 */
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const now = new Date();
  const today = dayStamp(now);

  // Only restaurants with a live grace clock. The in-grace population is tiny
  // (failed payments), and graceEndsAt is indexed — so this never scans the
  // whole table. Cap defensively regardless.
  const restaurants = await prisma.restaurant.findMany({
    where: { graceEndsAt: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      defaultLanguage: true,
      graceEndsAt: true,
      lastDunnedOn: true,
      resellerProfileId: true,
    },
    take: 2000,
  });

  let dunned = 0;
  let downgraded = 0;

  for (const r of restaurants) {
    if (!r.graceEndsAt) continue;
    try {
      // ── Grace expired → finalize the downgrade (once) ──────────────────
      if (r.graceEndsAt <= now) {
        if (r.email) {
          await sendOwnerDowngraded({ to: r.email, restaurantName: r.name, locale: r.defaultLanguage });
        }
        // If the Multi-Location add-on is what lapsed, cascade to the children:
        // sever inheritance (each child self-manages) + notify each child owner.
        const mlLapsed = await prisma.restaurantAddOn.findFirst({
          where: { restaurantId: r.id, status: "past_due", addOn: { slug: "multi_location" } },
          select: { id: true },
        });
        if (mlLapsed) {
          const children = await cascadeMultiLocationDowngrade(r.id);
          for (const c of children) {
            if (c.email) {
              await sendChildBrandReset({
                to: c.email,
                childName: c.name,
                brandName: r.name,
                locale: c.defaultLanguage,
              });
            }
          }
        }
        await clearRestaurantGrace(r.id);
        downgraded++;
        continue;
      }

      // ── In grace → daily countdown (once per calendar day) ─────────────
      if (r.lastDunnedOn === today) continue;
      const firstRun = !r.lastDunnedOn;
      const left = daysLeft(r.graceEndsAt, now);

      if (r.email) {
        await sendOwnerCountdown({
          to: r.email,
          restaurantName: r.name,
          locale: r.defaultLanguage,
          phone: r.phone,
          daysLeft: left,
        });
      }

      if (firstRun) {
        // One-time at the first nudge: alert the reseller + warn child locations.
        if (r.resellerProfileId) {
          const reseller = await prisma.resellerProfile.findUnique({
            where: { id: r.resellerProfileId },
            select: { user: { select: { email: true } } },
          });
          if (reseller?.user?.email) {
            await sendResellerAlert({
              to: reseller.user.email,
              restaurantName: r.name,
              locale: r.defaultLanguage,
            });
          }
        }
        const mlGrace = await prisma.restaurantAddOn.findFirst({
          where: { restaurantId: r.id, status: "past_due", addOn: { slug: "multi_location" } },
          select: { id: true },
        });
        if (mlGrace) {
          const children = await prisma.restaurant.findMany({
            where: { parentRestaurantId: r.id },
            select: { name: true, email: true, defaultLanguage: true },
          });
          for (const c of children) {
            if (c.email) {
              await sendChildBrandWarning({
                to: c.email,
                childName: c.name,
                brandName: r.name,
                locale: c.defaultLanguage,
              });
            }
          }
        }
      }

      await prisma.restaurant.update({ where: { id: r.id }, data: { lastDunnedOn: today } });
      dunned++;
    } catch (e) {
      console.error(`[cron/dunning] failed for restaurant ${r.id}`, e);
    }
  }

  return NextResponse.json({ ok: true, scanned: restaurants.length, dunned, downgraded });
}
