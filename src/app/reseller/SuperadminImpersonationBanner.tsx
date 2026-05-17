"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";

/**
 * Banner shown at the top of /reseller/* when a superadmin is currently
 * impersonating a reseller via the sa_reseller_impersonate cookie. Visually
 * distinct from the reseller→restaurant banner (purple) and the
 * superadmin→restaurant banner (indigo) so the operator never confuses what
 * level of identity they're acting under.
 */
export function SuperadminImpersonationBanner({
  resellerProfileId,
  companyName,
}: {
  resellerProfileId: string;
  companyName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    await fetch(`/api/superadmin/resellers/${resellerProfileId}/impersonate`, {
      method: "DELETE",
    }).catch(() => {});
    router.push(`/superadmin/resellers/${resellerProfileId}`);
    router.refresh();
  }

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm flex-shrink-0">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4" />
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-white/25 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            Superadmin
          </span>
          Viewing {companyName ?? "this reseller"}'s portal
        </span>
      </div>
      <button
        onClick={exit}
        disabled={busy}
        className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 transition px-3 py-1 rounded-lg font-medium disabled:opacity-60"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Superadmin
      </button>
    </div>
  );
}
