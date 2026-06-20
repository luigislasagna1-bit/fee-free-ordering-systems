"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, BarChart3,
  Settings, ChefHat, Tag, Zap, Truck, Clock, Receipt, Store, LogOut, ChevronLeft, Menu, Plug,
  CreditCard, Palette, CalendarDays, Layers, ChevronDown,
  Megaphone, MoreHorizontal, Map as MapIcon, Bell, Wallet, Share2, Globe,
  Check, Circle, Sparkles, Rocket, QrCode, Lock, Network, MessageSquare, Bot, MonitorCheck, Smartphone, Calculator,
  // Reports sub-section icons — match GloriaFood's iconography by purpose:
  // TrendingUp for Sales (line going up), PieChart for Menu Insights (mix
  // breakdown), Globe2 for Online Ordering family, ListChecks for List View.
  TrendingUp, PieChart, Globe2, ListChecks, Wifi, MousePointerClick,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { Session } from "next-auth";
import { useTranslations } from "next-intl";
import type { SetupProgress, StepId } from "@/lib/setup-checklist";
import type { Feature } from "@/lib/entitlements";
import { useSetupProgress } from "@/components/admin/SetupProgressProvider";

type NavItem = {
  href: string;
  /** Translation key into the "admin.sidebar" namespace. Falls back to `label` if the key is missing. */
  labelKey: string;
  label?: string;
  icon: LucideIcon;
  exact?: boolean;
  badgeKey?: string;
  /** When set, the sidebar shows a checkmark/circle based on SetupProgress. */
  step?: StepId;
  /** When true, hide this item unless the restaurant has the
   *  `hosted_marketing_page` entitlement (Sales Optimized Website add-on).
   *  Used to gate the Website Editor link so non-subscribers never see it. */
  requiresHostedSite?: boolean;
  /** When set, this is a PAID feature: if the restaurant lacks the entitlement,
   *  the item stays VISIBLE but renders with a lock icon and the page behind it
   *  shows an upsell wall (Luigi 2026-06-11 — "show with lock + upgrade"). This
   *  differs from requiresHostedSite, which HIDES the item entirely. */
  requiresFeature?: Feature;
  /** When true, this feature isn't released yet: the nav entry renders a lock +
   *  "Soon" badge and (for a leaf) still links to its teaser page. The reusable
   *  "not ready to release" gate (Luigi 2026-06-13) — set it on any item OR
   *  top-level group to lock a feature in the nav without hiding its teaser. */
  comingSoon?: boolean;
  /** Locations special-case: lock for a solo/parent restaurant WITHOUT the
   *  feature, but NEVER a child admin — children use the page for brand
   *  inheritance toggles without owning multi_location. Luigi 2026-06-14. */
  childExempt?: boolean;
};

type NavSubGroup = {
  key: string;
  labelKey: string;
  /** Optional fallback label when the locale doesn't have the key. */
  label?: string;
  icon: LucideIcon;
  items: NavItem[];
  /** When set, the sub-group header shows "X/Y" completion counts based on SetupProgress. */
  setupSectionId?: "basics" | "services" | "payments" | "orders" | "menu" | "publishing";
  /** When set, the sub-group header is ALSO a link to its own page — clicking
   *  the label navigates there, the chevron still toggles the nested items.
   *  Used by GrowthNet (a real hub page) so it can both open the bundle page
   *  AND reveal its member tools. Luigi 2026-06-11. */
  href?: string;
};

type NavGroup = {
  key: string;
  labelKey: string;
  /** Optional fallback label when the locale doesn't have the key. */
  label?: string;
  icon: LucideIcon;
  /** Direct child items, shown immediately under the top-level header. */
  items?: NavItem[];
  /** Nested sub-groups (e.g. "Services & Hours" inside SETUP). Each sub-group
   *  expands/collapses independently with single-open accordion behavior. */
  subGroups?: NavSubGroup[];
  /** When true, this whole section is an unreleased feature — its header shows a
   *  lock + "Soon" badge. Same reusable gate as NavItem.comingSoon. */
  comingSoon?: boolean;
};

// ─── Sidebar structure ─────────────────────────────────────────────────────
// 5 top-level categories (GloriaFood-style): SETUP / MARKETING TOOLS / REPORTS /
// ONLINE ORDERING / OTHER. SETUP nests 7 sub-groups (the original onboarding
// flow). Single-open accordion at both top-level and sub-level so an open
// category forces the others closed — far less visual noise.
//
// Every nav item from the previous flat 10-group layout lives here. Cross-
// check before deleting anything from this constant.
const navGroups: NavGroup[] = [
  {
    key: "setup",
    labelKey: "categorySetup",
    label: "Setup",
    icon: Rocket,
    // The Setup Wizard is the overview/dashboard for the whole SETUP
    // category. Rendered as a direct item at the very top of the group,
    // above the sub-groups, so owners always have a one-click path to
    // the "what's left to do?" view. The header "X% complete" banner
    // (when below 100%) also links here.
    items: [
      { href: "/admin/setup", labelKey: "setup", label: "Setup Wizard", icon: Rocket },
    ],
    subGroups: [
      {
        key: "setup.basics",
        labelKey: "setupBasics",
        label: "Restaurant Basics",
        icon: Store,
        setupSectionId: "basics",
        items: [
          { href: "/admin/profile", labelKey: "profile", label: "Profile", icon: Store, step: "basics.nameAddress" },
        ],
      },
      {
        key: "setup.services",
        labelKey: "setupServices",
        label: "Services & Hours",
        icon: Layers,
        setupSectionId: "services",
        items: [
          { href: "/admin/services",      labelKey: "services",      label: "Services",       icon: Layers,       step: "services.atLeastOne" },
          { href: "/admin/hours",         labelKey: "openingHours",  label: "Opening Hours",  icon: Clock,        step: "services.openingHours" },
          { href: "/admin/delivery",      labelKey: "deliveryZones", label: "Delivery Zones", icon: Truck,        step: "services.deliveryZones" },
          { href: "/admin/delivery/pool", labelKey: "driverPool",    label: "Driver Pool",    icon: Truck,        step: "services.deliveryManagement", requiresFeature: "driver_pool" },
          { href: "/admin/reservations",  labelKey: "reservations",  label: "Reservations",   icon: CalendarDays },
          // Multi-location management ($49.99) — locked for a solo/parent
          // restaurant WITHOUT the add-on, but childExempt so a CHILD admin
          // always reaches its brand-inheritance toggles. Luigi 2026-06-14.
          { href: "/admin/locations",     labelKey: "locations",     label: "Locations",      icon: MapIcon, requiresFeature: "multi_location_management", childExempt: true },
        ],
      },
      {
        key: "setup.payments",
        labelKey: "setupPayments",
        label: "Payments / Taxes",
        icon: CreditCard,
        setupSectionId: "payments",
        items: [
          { href: "/admin/payments",           labelKey: "paymentMethods", label: "Accepted Methods",   icon: CreditCard, step: "payments.methodsSelected" },
          // Online card payments (Stripe Connect + PayPal) require the
          // online_payments add-on ($39.99). Without it a restaurant can still
          // take cash / card-at-counter via "Accepted Methods" above. Luigi 2026-06-14.
          { href: "/admin/payments/providers", labelKey: "payments",       label: "Stripe Connect",     icon: CreditCard, step: "payments.methodConfigured", requiresFeature: "card_payments" },
          { href: "/admin/service-fees",       labelKey: "serviceFees",    label: "Service Fees & Tax", icon: Wallet,     step: "payments.taxation" },
        ],
      },
      {
        key: "setup.orders",
        labelKey: "setupOrders",
        label: "Taking Orders",
        icon: Bell,
        setupSectionId: "orders",
        items: [
          { href: "/admin/notifications", labelKey: "notifications", label: "Notifications", icon: Bell, step: "orders.notificationRecipient" },
          // NOTE: Phone Ordering used to live here. Moved to ONLINE
          // ORDERING (operational order channels, not setup steps) — it
          // was confusing owners about the X/Y completion count of this
          // sub-group (Luigi during UAT: "Taking Orders says 1/2 but the
          // AI phone orders isn't even ready yet, so I'm not sure why
          // it's 1/2?"). The 1/2 was actually the count of the Orders
          // setup-section's 2 real steps (kitchen device + notifications)
          // — but with Phone Ordering visually in the sub-group, owners
          // misread it as "1 of these 2 menu items is complete".
        ],
      },
      {
        key: "setup.menu",
        labelKey: "setupMenu",
        label: "Menu Setup",
        icon: UtensilsCrossed,
        setupSectionId: "menu",
        items: [
          { href: "/admin/menu",     labelKey: "menu",     label: "Menu Editor", icon: UtensilsCrossed, step: "menu.categoryExists" },
          // Receipts moved OUT of here to OTHER (Luigi 2026-06-13) — receipt
          // templates are an operational/config concern, not a menu-build step.
        ],
      },
      {
        key: "setup.publishing",
        labelKey: "setupPublishing",
        label: "Publishing",
        icon: Globe,
        setupSectionId: "publishing",
        items: [
          { href: "/admin/publishing",     labelKey: "publishing",   label: "Publishing",     icon: Globe },
          { href: "/admin/website",        labelKey: "websiteTheme", label: "Website Theme",  icon: Palette },
          // Sales Optimized Website (hosted_website add-on). SHOWN to everyone
          // with a LOCK for non-subscribers (Luigi 2026-06-14 — "don't hide it");
          // the page behind it is the marketing/conversion upsell. Unlocks on
          // subscribing to hosted_marketing_page.
          { href: "/admin/website/editor", labelKey: "salesOptimizedWebsite", label: "Sales Optimized Website", icon: Palette, requiresFeature: "hosted_marketing_page" },
          // Custom Domain — direct sidebar link to the bring-your-own-
          // domain page. Always visible; the page itself surfaces the
          // $9.99/mo Custom Domain add-on upgrade CTA when the
          // entitlement (custom_domain_routing) isn't active. Visible
          // even without the add-on because the page doubles as a
          // conversion surface explaining what the upgrade unlocks.
          { href: "/admin/website/domain", labelKey: "customDomain", label: "Custom Domain",  icon: Globe, requiresFeature: "custom_domain_routing" },
          // Branded Mobile App — your own iOS/Android app (post-launch). Moved here
          // under Publishing (Luigi 2026-06-20) from its own top-level section to
          // de-clutter the sidebar. "Soon" + lock are DB-driven via app_store_listing.
          { href: "/admin/mobile-app", labelKey: "categoryMobileApp", label: "Branded Mobile App", icon: Smartphone, comingSoon: true, requiresFeature: "app_store_listing" },
        ],
      },
      // NOTE: "Subscription & Billing" used to live here. Moved to OTHER —
      // billing isn't a pre-publish setup step (you can take orders without
      // touching billing), so it polluted the SETUP rollup X/Y counter.
      // Now SETUP contains only the 6 categories that ACTUALLY gate publishing.
    ],
  },

  {
    key: "marketing",
    labelKey: "categoryMarketing",
    label: "Marketing Tools",
    icon: Megaphone,
    // FREE for everyone: Customers, Promotions (basic types — advanced types
    // are gated in the promo wizard), Social Media. Marketplace is a separate
    // paid channel (its own billing). The PAID marketing suite lives under the
    // GrowthNet sub-group below. Luigi 2026-06-11.
    items: [
      { href: "/admin/customers",    labelKey: "customers",    label: "Customers",    icon: Users },
      { href: "/admin/promotions",   labelKey: "promotions",   label: "Promotions",   icon: Tag },
      { href: "/admin/social-media", labelKey: "socialMedia",  label: "Social Media", icon: Share2 },
      { href: "/admin/marketplace",  labelKey: "marketplace",  label: "Marketplace",  icon: Sparkles, requiresFeature: "marketplace_listing" },
    ],
    subGroups: [
      // GrowthNet — Fee Free's Restaurant Growth System. The bundle hub: its
      // header links to /admin/growthnet (activate one tool at a time or all at
      // once at the discounted bundle price), and expanding it reveals the paid
      // member tools as sub-headings (Luigi 2026-06-11 — "Kickstarter,
      // Autopilot and Marketing Studio as sub-headings, only seen when we click
      // GrowthNet"). Each member keeps its own lock + upsell wall for free
      // accounts. "GrowthNet" is a brand name → untranslated (tr falls back to
      // the label). New growth tools get added here as the bundle grows.
      {
        key: "marketing.growthnet",
        labelKey: "growthNet",
        label: "GrowthNet",
        icon: Network,
        href: "/admin/growthnet",
        items: [
          { href: "/admin/kickstarter",      labelKey: "kickstarter",     label: "Kickstarter",      icon: Rocket, requiresFeature: "kickstarter" },
          { href: "/admin/autopilot",        labelKey: "apm",             label: "APM (Advanced Promo Marketing)", icon: Zap, requiresFeature: "automated_campaigns" },
          // "Soon" is DB-driven now (these add-ons are flagged comingSoon in
          // /superadmin/add-ons) — no hardcoded comingSoon. Luigi 2026-06-14.
          { href: "/admin/marketing-studio", labelKey: "marketingStudio", label: "Marketing Studio", icon: QrCode, requiresFeature: "marketing_studio" },
          { href: "/admin/customer-sms",     labelKey: "customerSms",     label: "Customer SMS",     icon: MessageSquare, requiresFeature: "customer_sms" },
          // ContentPilot — AI social media manager (brand name, untranslated).
          { href: "/admin/contentpilot",     labelKey: "contentPilot",    label: "ContentPilot",     icon: Bot, requiresFeature: "contentpilot" },
        ],
      },
    ],
  },

  // ─── REPORTS ──────────────────────────────────────────────────────────
  // GloriaFood-style information architecture: one top-level "Reports"
  // category with 5 sections — Dashboard (direct item, the landing) +
  // 4 sub-groups: Sales / Menu Insights / Online Ordering / List View.
  //
  // Every leaf is a real page under /admin/reports/**. Pages are server
  // components that share the DateRangePicker + Chart/Table + Export
  // components from `src/components/admin/reports/`.
  //
  // The legacy /admin/customers route stays linked under Online Ordering
  // → Clients (matches GloriaFood; "customers" and "clients" are the
  // same concept).
  //
  // 4-YEAR DATA RETENTION on every backing table — see schema.prisma
  // REPORTS section. Do not add any cleanup job that touches Order,
  // OrderItem, Customer, ReportDailySnapshot, WebsiteVisit, etc.
  {
    key: "reports",
    labelKey: "categoryReports",
    label: "Reports",
    icon: BarChart3,
    items: [
      // Dashboard is the landing — direct item at the top of the group
      // so owners always have one click to "the headline numbers." Same
      // pattern we use for /admin/setup (Setup Wizard) at the top of the
      // SETUP category.
      { href: "/admin/reports", labelKey: "reportsDashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
    subGroups: [
      {
        key: "reports.sales",
        labelKey: "reportsSales",
        label: "Sales",
        icon: TrendingUp,
        items: [
          { href: "/admin/reports/sales/trend",   labelKey: "reportsSalesTrend",   label: "Trend",   icon: TrendingUp },
          { href: "/admin/reports/sales/summary", labelKey: "reportsSalesSummary", label: "Summary", icon: BarChart3 },
        ],
      },
      {
        key: "reports.menu-insights",
        labelKey: "reportsMenuInsights",
        label: "Menu Insights",
        icon: PieChart,
        items: [
          { href: "/admin/reports/menu-insights/categories", labelKey: "reportsMenuInsightsCategories", label: "By Category", icon: Layers },
          { href: "/admin/reports/menu-insights/items",      labelKey: "reportsMenuInsightsItems",      label: "By Item",     icon: UtensilsCrossed },
        ],
      },
      {
        key: "reports.online-ordering",
        labelKey: "reportsOnlineOrdering",
        label: "Online Ordering",
        icon: Globe2,
        items: [
          { href: "/admin/reports/online-ordering/funnel",       labelKey: "reportsFunnel",       label: "Website Funnel",    icon: MousePointerClick },
          // Reuses the existing /admin/customers page conceptually but
          // under the Reports IA. The clients-dashboard page (with
          // returning/new cohort split + add-on upsells) lives at
          // /admin/reports/online-ordering/clients. /admin/customers
          // stays as the editable list (different concern).
          { href: "/admin/reports/online-ordering/clients",      labelKey: "reportsClients",      label: "Clients",           icon: Users },
          { href: "/admin/reports/online-ordering/reservations", labelKey: "reportsReservations", label: "Table Reservations", icon: CalendarDays },
          { href: "/admin/reports/online-ordering/google-rank",  labelKey: "reportsGoogleRank",   label: "Google Ranking",    icon: Sparkles, requiresFeature: "hosted_marketing_page" },
          { href: "/admin/reports/online-ordering/visits",       labelKey: "reportsVisits",       label: "Website Visits",    icon: BarChart3 },
          { href: "/admin/reports/online-ordering/heatmap",      labelKey: "reportsHeatmap",      label: "Delivery Heatmap",  icon: MapIcon },
          { href: "/admin/reports/online-ordering/connectivity", labelKey: "reportsConnectivity", label: "Connectivity Health", icon: Wifi },
          { href: "/admin/reports/online-ordering/promotions",   labelKey: "reportsPromotions",   label: "Promotions Stats",  icon: Tag },
        ],
      },
      {
        key: "reports.list",
        labelKey: "reportsListView",
        label: "List View",
        icon: ListChecks,
        items: [
          { href: "/admin/reports/list/orders",  labelKey: "reportsListOrders",  label: "Orders",  icon: ShoppingBag },
          { href: "/admin/reports/list/clients", labelKey: "reportsListClients", label: "Clients", icon: Users },
        ],
      },
    ],
  },

  {
    // ─── ORDERING ───────────────────────────────────────────────────────
    // Consolidated order-channel hub (Luigi 2026-06-20): Orders + the
    // coming-soon channels (Nabil AI phone ordering, KDS Screen, POS Module)
    // nested as items here instead of sprawling as four separate top-level
    // sections. Branded Mobile App moved to SETUP → Publishing. Each item's
    // "Soon" badge + lock come from its own comingSoon flag + requiresFeature
    // (DB-driven via the matching add-on in /superadmin/add-ons). Brand names
    // reuse existing i18n keys (categoryNabilAi/Kds/Pos) — no new locale strings.
    key: "online-ordering",
    labelKey: "categoryOnlineOrdering",
    label: "Ordering",
    icon: ShoppingBag,
    items: [
      { href: "/admin/orders", labelKey: "orders", label: "Orders", icon: ShoppingBag, badgeKey: "orders" },
      { href: "/admin/phone-ordering", labelKey: "categoryNabilAi", label: "Nabil AI", icon: Bot, comingSoon: true, requiresFeature: "phone_ordering_agent" },
      { href: "/admin/kds", labelKey: "categoryKds", label: "KDS Screen", icon: MonitorCheck, comingSoon: true, requiresFeature: "kds_screen" },
      { href: "/admin/pos", labelKey: "categoryPos", label: "POS Module", icon: Calculator, comingSoon: true, requiresFeature: "in_house_pos" },
    ],
  },

  {
    key: "other",
    labelKey: "categoryOther",
    label: "Other",
    icon: MoreHorizontal,
    items: [
      // Subscription & Billing lives here, not under SETUP — billing isn't
      // a pre-publish setup step. Restaurants can take orders without
      // touching billing (free trial), so dragging it into the setup
      // rollup gave a misleading "you're not ready to publish" feel.
      { href: "/admin/billing",         labelKey: "billing", label: "Billing", icon: Wallet },
      { href: "/admin/billing/add-ons", labelKey: "addOns",  label: "Add-Ons", icon: Zap },
      { href: "/admin/settings",     labelKey: "settings",    label: "Settings",     icon: Settings },
      { href: "/admin/integrations", labelKey: "integrations", label: "Integrations", icon: Plug },
      // Receipts moved here from SETUP -> Menu Setup (Luigi 2026-06-13): receipt
      // templates are an operational/config concern, not a menu-build step.
      { href: "/admin/receipts",     labelKey: "receipts",    label: "Receipts",     icon: Receipt },
      // Map Settings removed (Luigi 2026-06-13): every restaurant now uses the
      // free Leaflet/OSM map for tiles + the platform Google key for autocomplete
      // + distance — no per-restaurant map option to configure.
    ],
  },
];

/** Flatten all NavItems across the nested structure — used by the active-path
 *  detector. Order matches visual order so first-match-wins works as expected. */
function allItems(): NavItem[] {
  const out: NavItem[] = [];
  for (const group of navGroups) {
    if (group.items) out.push(...group.items);
    if (group.subGroups) for (const sg of group.subGroups) out.push(...sg.items);
  }
  return out;
}

/** Flatten ALL items in a top-level group (direct items + items in any
 *  sub-group). Used to compute "is anything in this group active?" and
 *  collapsed-mode badge rollups. */
function collectItems(group: NavGroup): NavItem[] {
  const out: NavItem[] = [];
  if (group.items) out.push(...group.items);
  if (group.subGroups) for (const sg of group.subGroups) out.push(...sg.items);
  return out;
}

/** Sum the setup-progress counts across all sub-groups of this top-level group.
 *  Returns null when no sub-group tracks completion (so we don't render a "0/0"
 *  chip on Marketing Tools / Reports / etc.). */
function rollupCounts(
  group: NavGroup,
  perSection: Map<string, { done: number; total: number }>,
): { done: number; total: number } | null {
  let done = 0;
  let total = 0;
  let any = false;
  for (const sg of group.subGroups ?? []) {
    if (sg.setupSectionId) {
      const counts = perSection.get(sg.setupSectionId);
      if (counts) {
        done += counts.done;
        total += counts.total;
        any = true;
      }
    }
  }
  return any ? { done, total } : null;
}

/** Return [groupKey, subGroupKeyOrNull] that contains the given item, or
 *  null when the item isn't found. Used by the active-path auto-open logic. */
function locateItem(item: NavItem): { groupKey: string; subKey: string | null } | null {
  for (const group of navGroups) {
    if (group.items?.some((it) => it.href === item.href)) {
      return { groupKey: group.key, subKey: null };
    }
    if (group.subGroups) {
      for (const sg of group.subGroups) {
        if (sg.items.some((it) => it.href === item.href)) {
          return { groupKey: group.key, subKey: sg.key };
        }
      }
    }
  }
  return null;
}

const STORAGE_KEY = "admin-sidebar-groups-v2";

function isActiveItem(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** Safe translation lookup — falls back to the NavItem's `label` when the
 *  locale doesn't yet have a translation for the new sidebar keys. Keeps the
 *  UI usable even before en/fr/es/it/pt JSON is updated. */
function useSafeT() {
  const t = useTranslations("admin.sidebar");
  return (key: string, fallback?: string, values?: Record<string, string | number>) => {
    // next-intl's t() throws in dev mode when a key is missing — that
    // takes down the whole sidebar and blocks navigation. Wrap in a
    // try/catch so a missing translation degrades gracefully to the
    // hardcoded English fallback (which every NavItem already carries).
    try {
      const v = t(key, values);
      return v.startsWith("admin.sidebar.") || v === key ? fallback ?? key : v;
    } catch {
      return fallback ?? key;
    }
  };
}

export function AdminSidebar({
  session,
  pendingOrders = 0,
  setupProgress: setupProgressProp,
  hasHostedSite = false,
  entitlements = [],
  comingSoonFeatures = [],
  isChildAdmin = false,
  isPublished = false,
}: {
  session: Session;
  pendingOrders?: number;
  setupProgress?: SetupProgress | null;
  /** True iff this restaurant has the `hosted_marketing_page` entitlement.
   *  Computed in the admin layout (single Prisma round-trip). */
  hasHostedSite?: boolean;
  /** The restaurant's full set of unlocked feature slugs (from getEntitlements
   *  in the layout). Drives the lock icon on paid items flagged with
   *  `requiresFeature`. */
  entitlements?: string[];
  /** Feature slugs whose granting add-on is flagged comingSoon in
   *  /superadmin/add-ons. Drives the DB-driven "Soon" badge. Luigi 2026-06-14. */
  comingSoonFeatures?: string[];
  /** True iff the active restaurant is a brand CHILD — exempts childExempt
   *  items (Locations) from the lock so children keep inheritance access. */
  isChildAdmin?: boolean;
  /** True iff Restaurant.publishedAt is set. Hides the "Ready to publish"
   *  chip once the restaurant is already live — no nudge needed. */
  isPublished?: boolean;
}) {
  // Set for O(1) lookups when deciding whether a paid item is locked.
  const entitled = new Set(entitlements);
  // DB-driven "Soon": features whose add-on is flagged comingSoon in superadmin.
  const comingSoonFeatureSet = new Set(comingSoonFeatures);
  // Reuse the already-translated "Paid add-on" badge for the lock tooltip.
  const tLock = useTranslations("admin.featureLocked");
  const tr = useSafeT();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // Mobile drawer state (separate from collapsed). On screens < md the
  // sidebar is hidden by default; a hamburger button in AdminHeader
  // toggles it via window event. Tap the backdrop or pick a link to
  // close. Desktop ignores this — sidebar always visible.
  const [mobileOpen, setMobileOpen] = useState(false);
  const restaurantSlug = (session.user as any)?.restaurantSlug;
  // Prefer the live progress from the SetupProgressProvider context (polls +
  // refetches on route change). Fall back to the prop for callsites that
  // haven't been wired through the provider yet, and for the initial paint
  // before the context hydrates.
  const livesetupProgress = useSetupProgress();
  const setupProgress = livesetupProgress ?? setupProgressProp;

  // Single-open accordion state:
  //   openGroup    — which TOP-level category is currently expanded (one only)
  //   openSubGroup — which sub-group under that category is expanded (one only)
  // When a user clicks a new category, the old one collapses. Sub-groups behave
  // the same way within their parent. null = everything in that level closed.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubGroup, setOpenSubGroup] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          if (typeof parsed.openGroup === "string" || parsed.openGroup === null) {
            setOpenGroup(parsed.openGroup ?? null);
          }
          if (typeof parsed.openSubGroup === "string" || parsed.openSubGroup === null) {
            setOpenSubGroup(parsed.openSubGroup ?? null);
          }
        }
      }
    } catch {
      /* corrupt storage — fall back to defaults */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ openGroup, openSubGroup }),
      );
    } catch {}
  }, [openGroup, openSubGroup, hydrated]);

  // Auto-open the group + sub-group containing the active route. Runs on every
  // pathname change so navigating via a direct URL or clicking from elsewhere
  // pops the right accordion sections open without the user having to do it.
  useEffect(() => {
    const active = allItems().find((it) => isActiveItem(it, pathname));
    if (active) {
      const loc = locateItem(active);
      if (loc) {
        if (openGroup !== loc.groupKey) setOpenGroup(loc.groupKey);
        if (loc.subKey && openSubGroup !== loc.subKey) setOpenSubGroup(loc.subKey);
      }
      return;
    }
    // A sub-group HUB page (e.g. /admin/growthnet) isn't a leaf item — open the
    // group + sub-group whose own href matches the current path so its members
    // are revealed when the owner lands there directly.
    for (const group of navGroups) {
      for (const sg of group.subGroups ?? []) {
        if (sg.href && pathname.startsWith(sg.href)) {
          if (openGroup !== group.key) setOpenGroup(group.key);
          if (openSubGroup !== sg.key) setOpenSubGroup(sg.key);
          return;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Mobile drawer wiring:
  //  - Listen for the hamburger button's window event (dispatched by
  //    AdminHeader so we don't have to drill a setter prop through the
  //    server-rendered layout boundary)
  //  - Close the drawer automatically on route change so a tap on any
  //    nav link doesn't leave the overlay open covering the destination
  //  - Lock body scroll while the drawer is open so the page behind
  //    doesn't scroll under the user's thumb
  useEffect(() => {
    const onToggle = () => setMobileOpen((v) => !v);
    window.addEventListener("admin-sidebar-toggle", onToggle);
    return () => window.removeEventListener("admin-sidebar-toggle", onToggle);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  /** Click a top-level header: toggle this one, force-close any other. */
  const toggleGroup = (key: string) => {
    setOpenGroup((prev) => (prev === key ? null : key));
    // Closing the parent group collapses the sub-group too. Opening a NEW
    // group resets the sub-group selection so the new group starts fresh.
    setOpenSubGroup(null);
  };

  /** Click a sub-group header: toggle this one, force-close any sibling. */
  const toggleSubGroup = (key: string) => {
    setOpenSubGroup((prev) => (prev === key ? null : key));
  };

  /** Build a quick lookup: stepId -> complete. */
  const stepComplete = (() => {
    const map = new Map<string, boolean>();
    if (setupProgress) {
      for (const section of setupProgress.sections) {
        for (const step of section.steps) {
          map.set(step.id, step.complete);
        }
      }
    }
    return map;
  })();

  /** Per-group setup counts ("3/4 done"). */
  const groupCounts = (() => {
    const map = new Map<string, { done: number; total: number }>();
    if (setupProgress) {
      for (const section of setupProgress.sections) {
        map.set(section.id, { done: section.completedCount, total: section.totalCount });
      }
    }
    return map;
  })();

  const renderItem = (item: NavItem, nested = false) => {
    // Entitlement gate — hide items flagged as requiring the hosted-site
    // add-on when the restaurant doesn't have it. Avoids surfacing dead
    // links and the "you need to subscribe" landing for unsubscribed users.
    if (item.requiresHostedSite && !hasHostedSite) return null;
    const { href, labelKey, label, icon: Icon, exact, badgeKey, step } = item;
    const display = tr(labelKey, label);
    const active = exact ? pathname === href : pathname.startsWith(href);
    const badge = badgeKey === "orders" && pendingOrders > 0 ? pendingOrders : null;
    const isStepComplete = step ? stepComplete.get(step) : undefined;
    // Two INDEPENDENT signals (Luigi 2026-06-14):
    //   • "Soon" = RELEASE status, DB-driven. An item is coming-soon if its own
    //     flag is set OR the add-on granting its feature is flagged comingSoon in
    //     /superadmin/add-ons — so toggling it there reflects here live.
    //   • Lock   = ACCESS status. Shown when THIS restaurant lacks the feature
    //     (paid add-on unbought, or coming-soon without a backend grant). A child
    //     admin is EXEMPT on childExempt items (Locations) — they use the page for
    //     brand inheritance without owning the add-on.
    // Granted → "Soon" may still show (preview) but NO lock; paid+shipped → neither.
    const comingSoon =
      !!item.comingSoon || (!!item.requiresFeature && comingSoonFeatureSet.has(item.requiresFeature));
    const granted =
      (!!item.requiresFeature && entitled.has(item.requiresFeature)) ||
      (!!item.childExempt && isChildAdmin);
    const locked = (!!item.requiresFeature || comingSoon) && !granted;

    return (
      <Link
        key={href}
        href={href}
        title={locked ? `${display} · ${tLock("badge")}` : display}
        className={cn(
          // LEAF ITEM — two visual variants sharing one renderer:
          //   tier-2 (direct under a top-level category, e.g. Customers):
          //     text-sm gray-300, same as before.
          //   tier-3 (`nested`, inside a sub-group, e.g. Services): one
          //     notch smaller + dimmer, sits inside the tree guide-line
          //     rail so children can't be confused with their parents.
          // Active state is the same emerald pill at both tiers.
          "flex items-center gap-2.5 py-1.5 transition rounded-lg mb-0.5 relative",
          nested ? "px-2.5 text-[13px] font-normal ml-1 mr-2" : "px-3 text-sm font-medium mx-2",
          active
            ? "bg-emerald-500 text-white"
            : nested
              ? "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        )}
      >
        <div className="relative flex-shrink-0">
          <Icon className={cn(nested ? "w-3.5 h-3.5" : "w-4 h-4", locked && !active && "opacity-60")} />
          {badge !== null && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </div>
        {!collapsed && (
          <>
            <span className={cn("flex-1 truncate", locked && !active && "opacity-70")}>{display}</span>
            {/* Unreleased feature → "Soon" pill, shown to EVERYONE (release status). */}
            {comingSoon && (
              <span className={cn(
                "text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0",
                active ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
              )}>
                {tr("comingSoonBadge", "Soon")}
              </span>
            )}
            {/* Lock marker = no ACCESS (paid-but-unbought, or coming-soon without
                a backend grant). A granted early-access restaurant shows "Soon"
                above but no lock. Badges/steps never co-occur, so no collision. */}
            {locked && (
              <Lock className={cn("w-3.5 h-3.5 flex-shrink-0", active ? "text-white" : "text-amber-500")} />
            )}
            {!locked && !comingSoon && isStepComplete === true && (
              <Check className={cn("w-3.5 h-3.5 flex-shrink-0", active ? "text-white" : "text-green-600")} />
            )}
            {!locked && !comingSoon && isStepComplete === false && (
              <Circle className={cn("w-3.5 h-3.5 flex-shrink-0", active ? "text-white" : "text-gray-500")} />
            )}
            {badge !== null && (
              <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile backdrop — only shown while the drawer is open on small
          screens. Tap to dismiss. Hidden on md+ since the sidebar is
          always visible there. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label={tr("closeSidebar", "Close sidebar")}
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        />
      )}
    <aside className={cn(
      "bg-white text-gray-900 border-r border-gray-200 flex flex-col transition-transform duration-300",
      // Width: same on desktop, but on mobile we ignore the collapsed
      // toggle and always use the full-width (256px) drawer when open.
      collapsed ? "md:w-16" : "md:w-64",
      "w-64",
      // Position: static on desktop (lives inside flex layout),
      // fixed-overlay on mobile (slides in from the left). Translate-x
      // is the drawer-style hide/show animation.
      "md:static md:translate-x-0",
      "fixed inset-y-0 left-0 z-40",
      mobileOpen ? "translate-x-0" : "-translate-x-full",
    )}>
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        {!collapsed && (
          <Link href="/admin" className="flex items-center gap-2 text-emerald-600 font-bold text-lg truncate">
            <ChefHat className="w-6 h-6 flex-shrink-0" />
            <span className="truncate">{tr("dashboard", "Dashboard")}</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn("text-gray-500 hover:text-gray-900 transition flex-shrink-0", collapsed && "mx-auto")}
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Setup-progress chip just under the header. Behavior across states:
       *
       *   percent <100, publish NOT ready  → orange chip nudging to the next
       *                                       required step (the common state
       *                                       for new restaurants).
       *   percent <100, publish IS  ready  → orange chip nudging to /admin/setup
       *                                       so the owner sees the green
       *                                       Publish CTA (optional steps still
       *                                       open but they could ship now).
       *   percent =100, NOT yet published   → emerald "Ready to publish" chip
       *                                       so the win is celebrated and the
       *                                       owner has a one-click path to
       *                                       the Publish button. Replaces the
       *                                       silent "chip just disappears"
       *                                       behavior from before.
       *   percent =100, already published   → chip hidden entirely. SETUP
       *                                       is done done.
       */}
      {!collapsed && setupProgress && !(setupProgress.percent === 100 && isPublished) && (
        setupProgress.percent === 100 ? (
          <Link
            href="/admin/setup"
            className="mx-2 mt-3 mb-1 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border border-emerald-500/40 rounded-lg px-3 py-2 text-xs hover:border-emerald-500/70 transition"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-600">{tr("readyToPublish", "Ready to publish")}</span>
              <Rocket className="w-3.5 h-3.5 text-emerald-700" />
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              {tr(
                "allStepsComplete",
                `All ${setupProgress.totalSteps} steps complete · click to go live`,
                { total: setupProgress.totalSteps },
              )}
            </div>
          </Link>
        ) : (
          <Link
            href={setupProgress.publishReady ? "/admin/setup" : "/admin/setup/next"}
            className="mx-2 mt-3 mb-1 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border border-emerald-500/40 rounded-lg px-3 py-2 text-xs hover:border-emerald-500/70 transition"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-semibold text-emerald-600">{tr("setupProgress", "Setup progress")}</span>
              <span className="text-emerald-700 font-bold">{setupProgress.percent}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${setupProgress.percent}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-500 mt-1">
              {tr(
                "stepsComplete",
                `${setupProgress.completedSteps}/${setupProgress.totalSteps} steps complete`,
                { completed: setupProgress.completedSteps, total: setupProgress.totalSteps },
              )}
              {!setupProgress.publishReady &&
                ` · ${tr(
                  "requiredCount",
                  `${setupProgress.requiredStepsRemaining.length} required`,
                  { count: setupProgress.requiredStepsRemaining.length },
                )}`}
            </div>
          </Link>
        )
      )}

      <nav className="flex-1 py-2 overflow-y-auto">
        {collapsed ? (
          // Collapsed mode: show one icon per TOP-LEVEL category.
          navGroups.map((group) => {
            const GroupIcon = group.icon;
            const items = collectItems(group);
            const activeInGroup = items.some((it) => isActiveItem(it, pathname));
            const groupBadge =
              items.some((it) => it.badgeKey === "orders") && pendingOrders > 0
                ? pendingOrders
                : null;
            return (
              <button
                key={group.key}
                onClick={() => {
                  setCollapsed(false);
                  setOpenGroup(group.key);
                }}
                title={tr(group.labelKey, group.label)}
                className={cn(
                  "w-full flex items-center justify-center py-3 transition mx-2 rounded-lg mb-1 relative",
                  activeInGroup ? "bg-emerald-500 text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <div className="relative">
                  <GroupIcon className="w-5 h-5" />
                  {groupBadge !== null && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {groupBadge > 99 ? "99+" : groupBadge}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          // Expanded mode: top-level accordion with single-open behavior.
          navGroups.map((group, gi) => {
            const GroupIcon = group.icon;
            const isOpen = openGroup === group.key;
            const items = collectItems(group);
            const activeInGroup = items.some((it) => isActiveItem(it, pathname));
            // Roll up setup counts from any sub-groups that track them.
            const rolled = rollupCounts(group, groupCounts);

            return (
              <div key={group.key} className={gi > 0 ? "mt-2" : ""}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    // TOP-LEVEL CATEGORY — small caps, bold, tracked. All
                    // five categories share this exact style so they read
                    // as one tier of navigation.
                    "w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition",
                    activeInGroup
                      ? "text-emerald-700 bg-emerald-50"
                      : isOpen
                        ? "text-gray-900 bg-gray-50"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <GroupIcon className="w-4 h-4" />
                    {tr(group.labelKey, group.label)}
                    {group.comingSoon && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full normal-case tracking-normal",
                          activeInGroup ? "bg-emerald-500/20 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}
                      >
                        <Lock className="w-2.5 h-2.5" />
                        {tr("comingSoonBadge", "Soon")}
                      </span>
                    )}
                    {rolled && (
                      <span
                        className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full normal-case tracking-normal",
                          rolled.done === rolled.total
                            ? "bg-green-500/20 text-green-600"
                            : "bg-gray-100 text-gray-500"
                        )}
                      >
                        {rolled.done}/{rolled.total}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn("w-3.5 h-3.5 transition-transform", !isOpen && "-rotate-90")}
                  />
                </button>

                {isOpen && (
                  <div className="pb-1">
                    {/* Direct items rendered at the same level as the group header.
                        NB: explicit lambda — .map(renderItem) would pass the array
                        index into renderItem's `nested` param. */}
                    {group.items?.map((it) => renderItem(it))}

                    {/* Nested sub-groups: each with its own accordion. Within
                        a single parent group only ONE sub-group is open at a
                        time (single-open). */}
                    {group.subGroups?.map((sg) => {
                      const SubIcon = sg.icon;
                      const subOpen = openSubGroup === sg.key;
                      const counts = sg.setupSectionId
                        ? groupCounts.get(sg.setupSectionId)
                        : undefined;
                      const subActive = sg.items.some((it) => isActiveItem(it, pathname));
                      return (
                        <div key={sg.key} className="mx-2 mt-0.5">
                          {(() => {
                            // SUB-GROUP HEADER — text-sm + semibold. The 7 SETUP
                            // sub-groups are pure toggles; a sub-group with its
                            // own `href` (GrowthNet) splits into a navigating
                            // label + a separate chevron toggle.
                            const headerActive = subActive || (!!sg.href && pathname.startsWith(sg.href));
                            const headerClass = cn(
                              // One shade brighter than leaf items (gray-200 vs
                              // gray-300/400) so parents read "above" children.
                              "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition",
                              headerActive
                                ? "text-emerald-700 bg-gray-100/60"
                                : "text-gray-700 hover:bg-gray-100/60 hover:text-gray-900"
                            );
                            const labelContent = (
                              <>
                                <SubIcon className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{tr(sg.labelKey, sg.label)}</span>
                                {counts && (
                                  <span
                                    className={cn(
                                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0",
                                      counts.done === counts.total
                                        ? "bg-green-500/20 text-green-600"
                                        : "bg-gray-100 text-gray-500"
                                    )}
                                  >
                                    {counts.done}/{counts.total}
                                  </span>
                                )}
                              </>
                            );
                            const chevron = (
                              <ChevronDown
                                className={cn("w-3.5 h-3.5 transition-transform flex-shrink-0", !subOpen && "-rotate-90")}
                              />
                            );
                            if (sg.href) {
                              return (
                                <div className={headerClass}>
                                  <Link href={sg.href} className="flex items-center gap-2.5 min-w-0 flex-1">
                                    {labelContent}
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => toggleSubGroup(sg.key)}
                                    aria-label={tr(sg.labelKey, sg.label)}
                                    className="ml-1 -mr-1 p-1 rounded hover:bg-gray-200/70"
                                  >
                                    {chevron}
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                onClick={() => toggleSubGroup(sg.key)}
                                className={cn("w-full", headerClass)}
                              >
                                <span className="flex items-center gap-2.5 min-w-0">{labelContent}</span>
                                {chevron}
                              </button>
                            );
                          })()}
                          {subOpen && (
                            // Tree guide-line: vertical rail anchored under the
                            // sub-group's icon, so nested items visibly hang off
                            // their parent instead of floating at the same level.
                            <div className="ml-5 pl-1.5 mt-0.5 border-l border-gray-200/70">
                              {sg.items.map((it) => renderItem(it, true))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-gray-200 p-4 space-y-2">
        {/* Quick access to the Kitchen Order App — persistent bottom-left link so
            staff can jump to /kitchen without typing the URL (Luigi 2026-06-04).
            Opens in a new tab so the admin panel stays put. Visible collapsed
            (icon only) and expanded (icon + label). */}
        <Link
          href="/kitchen"
          target="_blank"
          title={tr("kitchenOrderApp", "Kitchen Order App")}
          className={cn(
            "flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 transition",
            collapsed && "justify-center"
          )}
        >
          <ChefHat className="w-4 h-4 flex-shrink-0" />
          {!collapsed && tr("kitchenOrderApp", "Kitchen Order App")}
        </Link>
        {restaurantSlug && !collapsed && (
          <Link
            href={`/order/${restaurantSlug}`}
            target="_blank"
            className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 transition"
          >
            <Store className="w-4 h-4" /> {tr("viewOrderingPage", "View ordering page")}
          </Link>
        )}
        {!collapsed && (
          <div className="text-xs text-gray-500 truncate">
            {(session.user as any)?.email}
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={tr("logOut", "Log out")}
          className={cn(
            "flex items-center gap-2 text-sm text-gray-500 hover:text-red-400 transition",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && tr("logOut", "Log out")}
        </button>
      </div>
    </aside>
    </>
  );
}
