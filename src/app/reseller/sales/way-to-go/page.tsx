import { GraduationCap, Target, Users, TrendingUp, Sparkles } from "lucide-react";

/**
 * /reseller/sales/way-to-go
 *
 * Four-step seller playbook. Mirrors GloriaFood PartnerNet's "Way to go"
 * section in shape (4 numbered phases) but with copy tuned to Fee Free's
 * positioning vs UberEats/DoorDash/GloriaFood.
 *
 * Each step is a self-contained section with: short summary, concrete
 * actions to take, and a "what to say" sample so the reseller has
 * exact language they can lift for their first few pitches.
 */
export default function ResellerWayToGoPage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <GraduationCap className="w-3.5 h-3.5" /> Sales playbook
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Way to go</h1>
        <p className="text-sm text-gray-500">
          Four short steps. If you&apos;ve never sold restaurant software before, start here.
        </p>
      </div>

      <Step
        n={1}
        icon={<Target className="w-5 h-5" />}
        title="Iron out your pitch"
        summary="Restaurants are pitched constantly. Yours has to land in 30 seconds or you lose them."
      >
        <p className="mb-3">
          The pitch isn&apos;t about features. It&apos;s about <strong>what they currently lose</strong> to
          UberEats and DoorDash. A restaurant doing $20k/month in delivery is paying $5-6k of that to
          third-party platforms. Fee Free is a $30/month subscription that lets them keep all of it.
        </p>
        <Detail label="The 30-second version">
          &ldquo;Hey — quick question: how much do you spend on UberEats and DoorDash a month? Most
          restaurants don&apos;t realize they&apos;re paying 25-30% commission on every order. We built
          a platform that takes 0% commission. Your customers order on YOUR site instead of theirs,
          and you keep the full ticket. Want to see a 2-minute demo?&rdquo;
        </Detail>
        <Detail label="What to avoid">
          Don&apos;t lead with features (menu builder, marketing tools, etc.). Lead with the money they&apos;re
          losing. Features come up naturally when they ask &ldquo;how does it work?&rdquo;
        </Detail>
      </Step>

      <Step
        n={2}
        icon={<Users className="w-5 h-5" />}
        title="Start small, win nearby"
        summary="Your first 5 restaurants don't pay you anything — that's the 0% tier. So pick easy wins to cross the threshold fast."
      >
        <p className="mb-3">
          Pick restaurants you have an existing relationship with — places you eat at, friends-of-friends,
          neighborhood spots. The goal in the first month is to hit <strong>5 active paying restaurants</strong>
          (each with at least one paid add-on, usually Online Payments). Once you cross, every existing
          restaurant retroactively starts paying you 5% on their subscription. The 6th restaurant pays the
          1st through 5th too.
        </p>
        <Detail label="Smart first-five targets">
          Restaurants currently using GloriaFood (Oracle is sunsetting it April 2027 — perfect timing).
          Independent pizzerias and ethnic restaurants paying UberEats 30%. Anywhere with a steady online
          delivery business that&apos;s clearly bleeding margin. Skip chains and franchises — corporate-controlled.
        </Detail>
        <Detail label="Easy first ask">
          Most restaurants will agree to a free 14-day trial just to see what it looks like. No commitment
          on day one. Get them set up, walk them through accepting their first order, and the
          decision becomes obvious once they see the difference.
        </Detail>
      </Step>

      <Step
        n={3}
        icon={<Sparkles className="w-5 h-5" />}
        title="Get social proof"
        summary="Your second 10 restaurants will sign up because your first 5 referred them. Make that easy."
      >
        <p className="mb-3">
          As soon as one of your restaurants is delighted, ask them for two things: a short testimonial
          (one sentence + their name + photo, or just a quote you can attribute to &ldquo;Tony&apos;s Pizza, Boston&rdquo;)
          and an intro to another nearby restaurant owner they trust.
        </p>
        <Detail label="The ask">
          &ldquo;Now that you&apos;ve seen what this saves you — do you know any other restaurant owners who
          might be losing the same to UberEats? I&apos;ll do them the same favor I did you. And if you&apos;re
          willing, mind sending me a one-sentence note I can show other restaurants?&rdquo;
        </Detail>
        <Detail label="Track conversions, not conversations">
          Your dashboard shows signup count + lifetime earned per restaurant. After 30 days you&apos;ll see
          which referrals actually paid off. Double down on whoever referred multiple converted restaurants.
        </Detail>
      </Step>

      <Step
        n={4}
        icon={<TrendingUp className="w-5 h-5" />}
        title="Prepare to scale to 26+ (and 50+)"
        summary="At 26 active paying restaurants your rate doubles to 10%. At 50+ it goes to 15%. The path from 5 to 50 needs a process."
      >
        <p className="mb-3">
          Once your first cohort is referring others, you&apos;ll outgrow ad-hoc outreach. Plan ahead:
          a 25-restaurant roster doing $30/mo each = $187.50/mo at 10% = ~$2,250/year on autopilot.
          A 50+ restaurant roster at 15% across $30+ of add-ons each crosses $13,000/year recurring.
        </p>
        <Detail label="Build a repeatable funnel">
          Stop pitching one restaurant at a time. Create a 1-page comparison PDF (we have a template in
          Partner Resources). Email it to 20 restaurants a week. Follow up by phone two days later. A
          5-10% response rate × 80 outreach/month = 4-8 new restaurants/month. That gets you to 50+ in
          well under a year.
        </Detail>
        <Detail label="Hire help (after 25)">
          At 25+ restaurants, you should be making enough commission to hire one part-time SDR. Use them
          to handle the cold outreach so you can focus on the closing conversations. Most resellers
          plateau at 15-20 restaurants because they refuse to delegate the top of the funnel.
        </Detail>
      </Step>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-2">
        <h3 className="text-sm font-bold text-emerald-900 mb-1">Pace expectations</h3>
        <p className="text-xs text-emerald-800 leading-relaxed">
          Typical timeline: month 1 = 3-5 restaurants (you hit 5% retroactively). Month 3 = 10-15. Month 6
          = 20-30 (you cross 10%). Month 12 = 40-60 (you cross 15%). Faster if you&apos;ve worked in the
          restaurant industry before; slower if this is your first time selling B2B SaaS. The math works
          either way — recurring commission compounds.
        </p>
      </div>
    </div>
  );
}

function Step({
  n, icon, title, summary, children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-bold flex-shrink-0">
          {n}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-emerald-600">{icon}</div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">{summary}</p>
        </div>
      </div>
      <div className="text-sm text-gray-700 leading-relaxed pl-12">{children}</div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 mb-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 mb-1">{label}</div>
      <div className="text-xs text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}
