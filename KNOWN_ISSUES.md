# Known Issues & Future Work

Running list of bugs / UX gaps the team is aware of but hasn't fixed yet.
Keep this file short — items move OUT once they're fixed, and IN as soon
as they're observed. If something has a workaround, document it.

---

## 🐛 Location switcher doesn't go child → parent

**Reported:** 2026-05-18

**Symptom:** From the parent restaurant admin, clicking a child location
in the `LocationSwitcher` correctly drops you into that child's admin.
But once you're in the child admin, clicking the parent's name in the
switcher does NOT navigate you back. The UI shows the parent's row but
the active session stays scoped to the child.

**Suspected cause:** The session/cookie/JWT carries the active
`restaurantId`. The switcher likely only re-fetches one direction (parent
→ child) without properly clearing/resetting on the reverse hop.

**Files to investigate:**
- `src/components/admin/LocationSwitcher.tsx`
- The API route the switcher POSTs to (likely `/api/admin/switch-location`
  or similar — confirm exact path)
- Session callbacks in `src/lib/auth.ts` that build the JWT

**Workaround until fixed:** log out, log back in (the JWT rebuilds from
the User row, which always points at the canonical owning restaurant).

**Severity:** HIGH for any restaurant managing 2+ locations. Blocks the
multi-location use case from feeling polished. Should be fixed before
charging $49.99/mo for the Multi-Location add-on.

---

## 💲 Multi-Location add-on shipped but not yet behavior-gated

**Reported:** 2026-05-18

The `multi_location` add-on row exists in the AddOn catalog at $49.99/mo
with feature slug `multi_location_management`. The price is set, the
public pricing page lists it, the admin add-ons page lets restaurants
subscribe to it.

**What's NOT yet wired:**
- No code path actually calls `hasFeature("multi_location_management")`
  before allowing the parent restaurant to add a child location.
- The "Add another location" button / flow doesn't check the entitlement.

**To-do when ready to enforce:**
1. Find the route that creates a child restaurant (probably
   `/api/restaurants/locations` or `/api/admin/locations`).
2. At the top of that handler, call
   `await requireFeature(parentRestaurantId, "multi_location_management")`.
3. Update the admin UI to show "Upgrade to Multi-Location" CTA when the
   feature is missing.

Pricing decision (locked-in 2026-05-18): the parent restaurant pays
$49.99/mo for the *privilege* of managing locations. Each child location
separately pays full price for its own add-ons (Online Payments, Hosted
Website, etc.). The $49.99 just unlocks the network-management
capability — it does NOT cover the child's individual add-ons.
