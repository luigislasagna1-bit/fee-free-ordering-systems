import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { Clock, AlertCircle, ChevronRight } from "lucide-react";

/**
 * /reseller/restaurants/pending
 *
 * Restaurants the reseller has brought on that AREN'T yet contributing
 * to their commission tier. Three categories of "pending":
 *
 *   1. on_free       — restaurant landed on the FREE plan (every new
 *                       restaurant does). They haven't subscribed to any
 *                       paid add-on yet, so they're not generating
 *                       commission. This is the most common bucket —
 *                       the reseller's job is to nudge them onto a paid
 *                       add-on or the Unlimited Orders upgrade.
 *   2. past_due       — was paying, last invoice failed; commission
 *                       would resume if they update their card.
 *   3. no paid add-on — subscription "active" (Unlimited Orders or
 *                       similar) but no actual paid add-on rows. Still
 *                       counts toward tier per Luigi's rule: need at
 *                       least one paid add-on for commission.
 *
 * Restaurants in "active+at least one paid add-on" status live on the
 * main Management page — those are the ones earning commission.
 */
export default async function ResellerPendingRestaurantsPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: { status: true },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  // Pull all restaurants attributed to this reseller + their active
  // add-on count, so we can categorize. We do it in one query then
  // bucket in TS to keep the DB call simple.
  const restaurants = await prisma.restaurant.findMany({
    where: { resellerProfileId: user.resellerProfileId },
    select: {
      id: true,
      name: true,
      slug: true,
      email: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      createdAt: true,
      _count: {
        select: {
          addOns: {
            where: { status: { in: ["active", "trialing"] } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Bucket. "trialing" is a legacy status — treated as "free" for
  // categorization. The actual fix to stop creating trial statuses
  // lives in src/app/api/auth/register and the reseller signup route.
  const buckets = {
    on_free: [] as typeof restaurants,
    past_due: [] as typeof restaurants,
    no_addon: [] as typeof restaurants,
  };
  for (const r of restaurants) {
    const s = r.subscriptionStatus;
    if (s === "free" || s === "trialing") {
      buckets.on_free.push(r);
    } else if (s === "past_due" || s === "incomplete") {
      buckets.past_due.push(r);
    } else if (s === "active" && r._count.addOns === 0) {
      buckets.no_addon.push(r);
    }
  }

  const total = buckets.on_free.length + buckets.past_due.length + buckets.no_addon.length;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Pending</h1>
        <p className="text-sm text-gray-500">
          Restaurants you&apos;ve brought on that aren&apos;t yet earning you commission.
          Each restaurant needs at least one <strong>paid add-on</strong> (or an
          Unlimited Orders upgrade) to count toward your tier.
        </p>
      </div>

      {total === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-sm font-bold text-gray-900 mb-1">All caught up</h2>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Every restaurant attributed to you is either paying for at least one
            add-on, or you haven&apos;t brought any on yet. New signups show up here first while
            they ramp up.
          </p>
        </div>
      )}

      {buckets.on_free.length > 0 && (
        <Section
          title="On FREE plan"
          subtitle="These restaurants are signed up but haven't activated any paid add-on yet — they're using the FREE tier (up to 100 orders/month). Reach out to help them pick the right add-on so they start earning you commission."
          icon={<Clock className="w-4 h-4" />}
          tone="amber"
          restaurants={buckets.on_free}
          dateLabel="Signed up"
          getDate={(r) => r.createdAt}
        />
      )}

      {buckets.past_due.length > 0 && (
        <Section
          title="Past due"
          subtitle="Last invoice didn't clear. Card declined, expired, or insufficient funds. They have a grace period — message them before Stripe gives up."
          icon={<AlertCircle className="w-4 h-4" />}
          tone="red"
          restaurants={buckets.past_due}
          dateLabel="Period ends"
          getDate={(r) => r.currentPeriodEnd}
        />
      )}

      {buckets.no_addon.length > 0 && (
        <Section
          title="No paid add-on yet"
          subtitle="Subscription is active but they haven't activated any paid add-on. Restaurants need at least one paid add-on (Online Payments is the usual first) to count toward your tier."
          icon={<Clock className="w-4 h-4" />}
          tone="slate"
          restaurants={buckets.no_addon}
          dateLabel="Signed up"
          getDate={(r) => r.createdAt}
        />
      )}
    </div>
  );
}

function Section({
  title, subtitle, icon, tone, restaurants, dateLabel, getDate,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  tone: "amber" | "red" | "slate";
  restaurants: Array<{
    id: string;
    name: string;
    slug: string;
    email: string | null;
  }>;
  dateLabel: string;
  getDate: (r: any) => Date | string | null;
}) {
  const tones: Record<string, { ring: string; pill: string }> = {
    amber: { ring: "border-amber-200", pill: "bg-amber-100 text-amber-800" },
    red: { ring: "border-rose-200", pill: "bg-rose-100 text-rose-800" },
    slate: { ring: "border-slate-200", pill: "bg-slate-100 text-slate-700" },
  };
  return (
    <div className={`bg-white rounded-2xl border ${tones[tone].ring} shadow-sm mb-4 overflow-hidden`}>
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center gap-1 ${tones[tone].pill} rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold`}>
            {icon}
            {title}
          </span>
          <span className="text-xs text-gray-500">
            {restaurants.length} restaurant{restaurants.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{subtitle}</p>
      </div>
      <ul>
        {restaurants.map((r) => {
          const dt = getDate(r);
          const dateStr = dt ? new Date(dt).toLocaleDateString() : null;
          return (
            <li key={r.id} className="border-t border-gray-100 first:border-t-0">
              <Link
                href={`/reseller/restaurants/${r.id}`}
                className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-gray-50 transition"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate">{r.name}</div>
                  <div className="text-xs text-gray-500 truncate">{r.email ?? "—"}</div>
                </div>
                <div className="text-right flex items-center gap-2 flex-shrink-0">
                  {dateStr && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                        {dateLabel}
                      </div>
                      <div className="text-xs text-gray-700">{dateStr}</div>
                    </div>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
