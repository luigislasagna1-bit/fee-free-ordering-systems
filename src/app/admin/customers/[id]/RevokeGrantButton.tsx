"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

/**
 * Revoke a customer-assigned offer (CustomerCoupon grant) from the customer
 * profile — Fabrizio 2026-07-02: assigned offers (incl. expired clutter) had
 * no way to be removed. Only rendered for revocable grants (granted/released
 * — the server enforces it too); the row disappears on refresh because the
 * page lists granted/applied/redeemed only.
 */
export function RevokeGrantButton({ grantId }: { grantId: string }) {
  const t = useTranslations("admin.customerDetailPage");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function revoke() {
    if (!confirm(t("confirmRevokeOffer"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customer-grants?id=${encodeURIComponent(grantId)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("revokeFailed"));
        return;
      }
      toast.success(t("offerRevoked"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={busy}
      title={t("revokeOffer")}
      className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  );
}
