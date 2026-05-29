"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import {
  Zap, ShoppingBag, ShoppingCart, Users, Mail, Clock, Tag,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Save, AlertTriangle,
  Target, Rocket,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: string | null;
  campaignType: string;
  isEnabled: boolean;
  subject: string;
  emailBody: string;
  delayHours: number;
  couponId: string | null;
}

// ─── Campaign config ──────────────────────────────────────────────────────────

const CAMPAIGN_CONFIGS = [
  {
    type: "second_order",
    icon: ShoppingBag,
    color: "orange",
    title: "Encourage Second Order",
    tagline: "Win back customers after their first order",
    description: "Automatically emails a customer after their first completed order if they have not ordered again.",
    triggerLabel: "Send this many hours after first order:",
    defaultDelay: 24,
    defaultSubject: "Thanks for your order! Here's a little something for next time 🍽️",
    defaultBody: "Hi {customer_name},\n\nThank you so much for your recent order from {restaurant_name}! We hope you enjoyed it.\n\nAs a thank-you, here's a special offer just for you:\n\n{coupon_section}\n\nWe'd love to see you back soon!\n\n– The {restaurant_name} team",
  },
  // Cart Abandonment campaign is hidden for soft launch. The backend
  // returns [] for cart_abandonment types (src/lib/autopilot.ts) because
  // we don't yet track cart state server-side (carts live only in the
  // customer's localStorage). Surfacing this campaign in the UI before
  // wiring up CartSession tracking would let owners enable a campaign
  // that silently never fires — worse UX than not offering it at all.
  // Reintroduce after the post-launch cart-tracking buildout.
  // {
  //   type: "cart_abandonment",
  //   icon: ShoppingCart,
  //   color: "blue",
  //   title: "Cart Abandonment",
  //   tagline: "Recover orders that didn't make it through checkout",
  //   description: "Sends a reminder to customers who added items to their cart but didn't complete their order.",
  //   triggerLabel: "Send this many hours after cart abandoned:",
  //   defaultDelay: 2,
  //   defaultSubject: "You left something behind! 🛒",
  //   defaultBody: "Hi {customer_name},\n\nYou started an order from {restaurant_name} but didn't finish it. No worries — it happens!\n\nYour cart is still saved. Come back and complete your order:\n\n{restaurant_link}\n\n{coupon_section}\n\n– The {restaurant_name} team",
  // },
  {
    type: "reengagement",
    icon: Users,
    color: "purple",
    title: "Re-engage Inactive Customers",
    tagline: "Bring back customers who haven't ordered in a while",
    description: "Sends a re-engagement email to customers who haven't placed an order for a set number of days.",
    triggerLabel: "Send after this many days without an order:",
    defaultDelay: 168, // 7 days in hours
    defaultSubject: "We miss you! Come back for something delicious 🍕",
    defaultBody: "Hi {customer_name},\n\nIt's been a while since your last order from {restaurant_name} and we miss you!\n\nCome back and treat yourself — we have some amazing dishes waiting for you.\n\n{coupon_section}\n\nWe hope to see you soon!\n\n– The {restaurant_name} team",
  },
];

const COLOR_MAP: Record<string, { bg: string; icon: string; border: string; badge: string }> = {
  orange: { bg: "bg-emerald-50", icon: "text-emerald-500", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
  blue:   { bg: "bg-blue-50",   icon: "text-blue-500",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700"   },
  purple: { bg: "bg-amber-50", icon: "text-amber-500", border: "border-amber-200", badge: "bg-amber-100 text-amber-700" },
};

// ─── CampaignCard ─────────────────────────────────────────────────────────────

function CampaignCard({
  config, campaign, emailConfigured, coupons, onChange,
}: {
  config: typeof CAMPAIGN_CONFIGS[0];
  campaign: Campaign;
  emailConfigured: boolean;
  coupons: { id: string; code: string; description?: string | null }[];
  onChange: (updated: Partial<Campaign>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const colors = COLOR_MAP[config.color];
  const Icon = config.icon;
  const delayDisplay = config.type === "reengagement"
    ? `${Math.round(campaign.delayHours / 24)} days`
    : campaign.delayHours < 24
      ? `${campaign.delayHours} hour${campaign.delayHours !== 1 ? "s" : ""}`
      : `${Math.round(campaign.delayHours / 24)} day${Math.round(campaign.delayHours / 24) !== 1 ? "s" : ""}`;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/autopilot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignType: config.type,
          isEnabled: campaign.isEnabled,
          subject: campaign.subject,
          emailBody: campaign.emailBody,
          delayHours: campaign.delayHours,
          couponId: campaign.couponId || null,
        }),
      });
      if (!res.ok) {
        let msg = "Save failed";
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      toast.success("Campaign saved!");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const toggle = () => onChange({ isEnabled: !campaign.isEnabled });

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${campaign.isEnabled ? colors.border : "border-gray-100"}`}>
      {/* Header */}
      <div className="p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
          <Icon className={`w-5 h-5 ${colors.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900">{config.title}</span>
            {campaign.isEnabled && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>Active</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{config.tagline}</p>
          {campaign.isEnabled && (
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Trigger: {delayDisplay} after event
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={toggle} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition">
            {campaign.isEnabled
              ? <ToggleRight className="w-8 h-8 text-emerald-500" />
              : <ToggleLeft className="w-8 h-8 text-gray-300" />}
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50">
          {!emailConfigured && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <span className="font-semibold">Email provider not configured.</span> Set <code className="bg-yellow-100 px-1 rounded">EMAIL_SERVER</code> and <code className="bg-yellow-100 px-1 rounded">EMAIL_FROM</code> in your environment variables to enable sending. Campaign settings will be saved but emails won't be sent until configured.
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600">{config.description}</p>

          {/* Trigger delay */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {config.triggerLabel}
            </label>
            {config.type === "reengagement" ? (
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="365"
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={Math.round(campaign.delayHours / 24)}
                  onChange={e => onChange({ delayHours: (parseInt(e.target.value) || 7) * 24 })} />
                <span className="text-sm text-gray-500">days</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="168"
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={campaign.delayHours}
                  onChange={e => onChange({ delayHours: parseInt(e.target.value) || 24 })} />
                <span className="text-sm text-gray-500">hours</span>
              </div>
            )}
          </div>

          {/* Linked coupon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Tag className="inline w-3.5 h-3.5 mr-1" />
              Attach a Coupon (optional)
            </label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={campaign.couponId ?? ""}
              onChange={e => onChange({ couponId: e.target.value || null })}
            >
              <option value="">No coupon — email only</option>
              {coupons.map(c => (
                <option key={c.id} value={c.id}>{c.code}{c.description ? ` — ${c.description}` : ""}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Use <code className="bg-gray-100 px-1 rounded">{"{coupon_section}"}</code> in your email body to show the coupon.</p>
          </div>

          {/* Email subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="inline w-3.5 h-3.5 mr-1" />
              Email Subject
            </label>
            <input type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={config.defaultSubject}
              value={campaign.subject}
              onChange={e => onChange({ subject: e.target.value })} />
          </div>

          {/* Email body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Body</label>
            <div className="text-xs text-gray-400 mb-1.5 flex flex-wrap gap-2">
              {["{customer_name}", "{restaurant_name}", "{restaurant_link}", "{coupon_section}"].map(t => (
                <code key={t} className="bg-gray-100 px-1.5 py-0.5 rounded">{t}</code>
              ))}
            </div>
            <textarea rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-y"
              placeholder={config.defaultBody}
              value={campaign.emailBody}
              onChange={e => onChange({ emailBody: e.target.value })} />
          </div>

          <div className="flex justify-end">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 bg-emerald-500 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Campaign"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AutopilotClient ──────────────────────────────────────────────────────────

export function AutopilotClient({
  campaigns: initialCampaigns,
  coupons,
  emailConfigured,
}: {
  campaigns: Campaign[];
  coupons: { id: string; code: string; description?: string | null }[];
  emailConfigured: boolean;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(() =>
    CAMPAIGN_CONFIGS.map(config => {
      const found = initialCampaigns.find(c => c.campaignType === config.type);
      return found ?? {
        id: null, campaignType: config.type,
        isEnabled: false, subject: "", emailBody: "",
        delayHours: config.defaultDelay, couponId: null,
      };
    })
  );

  const update = (type: string, partial: Partial<Campaign>) => {
    setCampaigns(prev => prev.map(c => c.campaignType === type ? { ...c, ...partial } : c));
  };

  const activeCampaigns = campaigns.filter(c => c.isEnabled).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Autopilot</h1>
        </div>
        <p className="text-sm text-gray-500 ml-13">
          Run your marketing on autopilot with automated email campaigns that bring customers back.
        </p>
      </div>

      {/* Overview card */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-6 mb-6">
        <h2 className="font-bold text-gray-900 text-lg mb-2">How Autopilot Works</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-700">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
            <div><span className="font-semibold block">Configure campaigns</span>Set trigger rules, email templates, and optional coupon codes.</div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
            <div><span className="font-semibold block">Enable the campaigns</span>Toggle each campaign on and save your settings.</div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">3</div>
            <div><span className="font-semibold block">Emails go out automatically</span>Customers receive emails based on their behavior — no manual work needed.</div>
          </div>
        </div>
        {activeCampaigns > 0 && (
          <div className="mt-4 text-sm font-semibold text-emerald-700">
            {activeCampaigns} of {CAMPAIGN_CONFIGS.length} campaigns active
          </div>
        )}
      </div>

      {/* Segment-based targeting — Coming Soon ────────────────────────────
          Today's Autopilot sends the same email to every customer who
          matches a campaign trigger (e.g. all first-time buyers, all
          abandoned-cart visitors). The next iteration will let you target
          by segment — VIPs, lapsed regulars, big spenders, allergy
          preferences, etc. The schema field exists (`customer_segmentation`)
          but the UI + matching engine ships post-launch. */}
      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Target className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-sm font-bold text-amber-900">Segment-based targeting</h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
                <Rocket className="w-2.5 h-2.5" />
                Coming Soon
              </span>
            </div>
            <p className="text-xs sm:text-sm text-amber-900/90 leading-relaxed">
              Right now Autopilot sends the same email to everyone who matches a campaign trigger. Soon you&apos;ll be able to target specific groups — VIP regulars, lapsed customers, big spenders, dietary preferences — and tune the message for each. The campaigns below still run today; segmentation is purely additive when it lands.
            </p>
          </div>
        </div>
      </div>

      {/* Campaign cards */}
      <div className="space-y-4">
        {CAMPAIGN_CONFIGS.map((config, i) => (
          <CampaignCard
            key={config.type}
            config={config}
            campaign={campaigns[i]}
            emailConfigured={emailConfigured}
            coupons={coupons}
            onChange={partial => update(config.type, partial)}
          />
        ))}
      </div>
    </div>
  );
}
