"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Ban, ShieldCheck } from "lucide-react";

/**
 * Block / Unblock action on the call-detail header. Talks to the
 * blocked-callers CRUD (workstream D); the server page passes the existing
 * BlockedCaller row id when the number is already blocked, and a refresh
 * re-derives the state after each action.
 */
export default function BlockCallerButton({
  phone,
  blockedId,
}: {
  phone: string;
  blockedId: string | null;
}) {
  const t = useTranslations("admin.phoneOrderingPage.callDetail");
  const tb = useTranslations("admin.phoneOrderingPage.blocked");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async () => {
    setBusy(true);
    try {
      const res = blockedId
        ? await fetch(`/api/admin/phone-ordering/blocked-callers/${blockedId}`, { method: "DELETE" })
        : await fetch("/api/admin/phone-ordering/blocked-callers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ phone }),
          });
      if (!res.ok) throw new Error();
      toast.success(blockedId ? tb("removedToast") : tb("addedToast"));
      router.refresh();
    } catch {
      toast.error(tb("errorToast"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={act}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition disabled:opacity-60 ${
        blockedId
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
          : "border-red-200 bg-red-50 text-red-600 hover:border-red-300"
      }`}
    >
      {blockedId ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
      {blockedId ? t("unblockCaller") : t("blockCaller")}
    </button>
  );
}
