import { redirect } from "next/navigation";
import Link from "next/link";
import { Phone, Sparkles, Mic, Bot, Clock, ArrowRight, Rocket } from "lucide-react";
import { getSessionUser } from "@/lib/session";

/**
 * Phone Ordering — "Coming Soon" teaser page.
 *
 * Linked from the SETUP → Taking Orders sub-group in the sidebar so the
 * feature is publicly discoverable on the admin panel. The page itself
 * doesn't do anything functional yet — there's no Twilio integration,
 * no AI agent, no number provisioning. The implementation is post-
 * launch work.
 *
 * Why ship the teaser before the feature: prospective restaurants get
 * to see the roadmap when they evaluate the platform. Owners can mark
 * interest (not yet wired — would be a future enhancement). And when
 * we DO build it, the entry point is already there in the sidebar so
 * launch is just "swap this page for the real one".
 *
 * When the actual feature lands:
 *   - Replace the body of this page with the configuration UI
 *     (phone number provisioning, AI voice picker, menu coverage,
 *     fallback to staff after-hours, etc.)
 *   - Set the `phone_ordering` add-on's comingSoon=false in /superadmin/add-ons
 *   - Set a real monthlyPriceCents + click Sync to Stripe
 *   - Restaurants can then subscribe + use the feature
 */
export default async function PhoneOrderingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; Back to admin
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shadow-md">
            <Phone className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">Automated Phone Ordering</h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                <Rocket className="w-3 h-3" />
                Coming Soon
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              An AI agent that answers your restaurant&apos;s phone 24/7, takes orders, and drops them straight into your kitchen display.
            </p>
          </div>
        </div>
      </div>

      {/* ── Hero pitch ────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-blue-600 text-white p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider opacity-90 mb-2">
          <Sparkles className="w-4 h-4" />
          In active development
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Never miss another phone order
        </h2>
        <p className="mt-3 text-white/90 text-sm sm:text-base leading-relaxed max-w-2xl">
          Every call answered, every order taken, every time — even during your busiest rush.
          Our AI agent handles the phone so your staff can focus on the food. Orders flow
          directly into your kitchen display alongside online orders. Customers get the
          same fast, friendly experience whether they tap or talk.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-medium">
            <Clock className="w-3.5 h-3.5" />
            Available 24/7
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-medium">
            <Bot className="w-3.5 h-3.5" />
            Trained on your menu
          </div>
          <div className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-lg text-xs font-medium">
            <Mic className="w-3.5 h-3.5" />
            Natural conversation
          </div>
        </div>
      </div>

      {/* ── Feature preview cards ─────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <FeatureCard
          icon={<Phone className="w-5 h-5" />}
          title="Dedicated phone number"
          body="Get a local number for your restaurant — keep your existing line for emergencies, or forward it to ours during busy hours."
        />
        <FeatureCard
          icon={<Bot className="w-5 h-5" />}
          title="Menu-aware AI"
          body="The agent knows every item, every modifier, every variant on your menu. Pricing, allergens, prep time — all answered correctly, every time."
        />
        <FeatureCard
          icon={<Mic className="w-5 h-5" />}
          title="Sounds human"
          body="Natural conversation, not a robotic phone tree. Customers won't realize they're talking to AI. Handles accents, background noise, and the inevitable &quot;wait can you change that to&quot;."
        />
        <FeatureCard
          icon={<Sparkles className="w-5 h-5" />}
          title="Same kitchen flow"
          body="Phone orders land in your existing kitchen display alongside online orders. No new app, no new training — your team accepts them the same way."
        />
      </div>

      {/* ── Status / next steps ───────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h3 className="font-bold text-amber-900 mb-2 flex items-center gap-2">
          <Rocket className="w-4 h-4" />
          Where this stands today
        </h3>
        <p className="text-sm text-amber-900 leading-relaxed">
          We&apos;re heads-down building the foundation. The voice agent, the Twilio
          integration, the kitchen handoff — all in active development. We expect
          to roll this out to early-access restaurants soon after the main platform
          launches.
        </p>
        <p className="text-sm text-amber-900 leading-relaxed mt-2">
          When it&apos;s ready you&apos;ll be able to subscribe to it from your
          billing page like any other add-on. Until then this page is just a heads-up
          that it&apos;s coming.
        </p>
        <div className="mt-4">
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-900 transition"
          >
            See the full add-on catalog
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
        {icon}
      </div>
      <h3 className="mt-3 font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
