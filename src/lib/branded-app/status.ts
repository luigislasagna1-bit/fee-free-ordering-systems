/**
 * Branded Mobile App — platform-project status machine (Luigi 2026-08-02).
 *
 * THE single authority on states, legal transitions, and who owns the next
 * action. Pure module (no Prisma, no React) so the wizard, the status page,
 * the superadmin module, notify.ts and the tests all share one truth — the
 * custom-domain-flow lesson: keep the states FEW and let events carry detail.
 *
 * State → owner mapping is 1:1 by design; the restaurant's status page can
 * always answer "whose move is it?" without interpreting history:
 *
 *   draft            restaurant   filling the wizard
 *   submitted        platform     owner approved; we verify store access
 *   needs_owner      restaurant   blocked on an owner action (latest event says what)
 *   building         platform     building / internal QA / fixing a rejection
 *   in_store_review  store        waiting on Apple / Google review
 *   live             nobody       published
 *   suspended        platform     paused (billing lapse, policy, owner request)
 *
 * Store rejections deliberately do NOT get a state: one we can fix ourselves
 * stays `building` (internal event); one needing owner input goes
 * `needs_owner`. Fewer states = fewer stuck projects.
 */

export const BRANDED_APP_PLATFORMS = ["android", "ios"] as const;
export type BrandedAppPlatformKind = (typeof BRANDED_APP_PLATFORMS)[number];

export const BRANDED_APP_STATUSES = [
  "draft",
  "submitted",
  "needs_owner",
  "building",
  "in_store_review",
  "live",
  "suspended",
] as const;
export type BrandedAppStatus = (typeof BRANDED_APP_STATUSES)[number];

export type NextActionOwner = "restaurant" | "platform" | "store" | "none";

/** Who must act next in a given state (total — every state mapped). */
export function ownerOfNextAction(status: BrandedAppStatus): NextActionOwner {
  switch (status) {
    case "draft":
    case "needs_owner":
      return "restaurant";
    case "submitted":
    case "building":
    case "suspended":
      return "platform";
    case "in_store_review":
      return "store";
    case "live":
      return "none";
  }
}

/**
 * Legal transitions. Key → the set of states reachable FROM it. Anything not
 * listed is illegal and must be refused by APIs (superadmin has a separate,
 * separately-audited force override for genuine operational messes).
 *
 *  draft → submitted                    owner approves the config
 *  submitted → building                 access verified
 *  submitted → needs_owner              access check failed / info missing
 *  needs_owner → submitted              owner re-approved / completed the ask
 *  building → in_store_review           submitted to the store
 *  building → needs_owner               build/QA surfaced an owner blocker
 *  in_store_review → live               approved + released
 *  in_store_review → building           rejected, we fix and resubmit
 *  in_store_review → needs_owner        store wants something only the owner has
 *  live → building                      shipping a binary update
 *  live → suspended                     takedown (billing/policy/owner request)
 *  suspended → building                 reinstating (via a fresh build)
 *  suspended → live                     reinstated without a rebuild
 *  any-of(draft…in_store_review) → suspended   billing lapse mid-flight
 */
const TRANSITIONS: Record<BrandedAppStatus, readonly BrandedAppStatus[]> = {
  draft: ["submitted", "suspended"],
  submitted: ["building", "needs_owner", "suspended"],
  needs_owner: ["submitted", "suspended"],
  building: ["in_store_review", "needs_owner", "suspended"],
  in_store_review: ["live", "building", "needs_owner", "suspended"],
  live: ["building", "suspended"],
  suspended: ["building", "live"],
};

export function canTransition(from: BrandedAppStatus, to: BrandedAppStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

export function legalTargets(from: BrandedAppStatus): readonly BrandedAppStatus[] {
  return TRANSITIONS[from];
}

export function isBrandedAppStatus(s: unknown): s is BrandedAppStatus {
  return typeof s === "string" && (BRANDED_APP_STATUSES as readonly string[]).includes(s);
}

export function isBrandedAppPlatform(s: unknown): s is BrandedAppPlatformKind {
  return typeof s === "string" && (BRANDED_APP_PLATFORMS as readonly string[]).includes(s);
}

/** i18n key (under brandedApp.status.*) for the owner-facing label. */
export function statusLabelKey(status: BrandedAppStatus): string {
  return `status${status
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("")}`; // e.g. in_store_review → statusInStoreReview
}

/**
 * Which transitions notify whom (consumed by notify.ts; tested as a matrix).
 * Restaurant emails are localized; superadmin pings are internal.
 */
export function notificationsFor(to: BrandedAppStatus): {
  restaurant: boolean;
  superadmin: boolean;
} {
  switch (to) {
    case "submitted":
      return { restaurant: false, superadmin: true };
    case "needs_owner":
    case "building":
    case "in_store_review":
    case "live":
    case "suspended":
      return { restaurant: true, superadmin: false };
    case "draft":
      return { restaurant: false, superadmin: false };
  }
}
