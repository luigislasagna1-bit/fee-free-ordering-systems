import { redirect } from "next/navigation";

/**
 * RETIRED (Luigi 2026-07-14 → 2026-07-20): the marketplace is now FREE +
 * INCLUDED for every restaurant — there is no pay-as-you-go opt-in, no $3/order
 * fee, and no monthly plan. Listing is controlled by the isListed opt-out on
 * /admin/marketplace. This route is kept only as an unconditional redirect so
 * any stale bookmark or old email link lands on the (free) marketplace page
 * instead of 404-ing. Safe to delete once no traffic hits it.
 */
export default function PaygOptInRetiredRedirect(): never {
  redirect("/admin/marketplace");
}
