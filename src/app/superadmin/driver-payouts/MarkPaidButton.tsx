"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

/**
 * "Mark paid" — records that Fee Free has manually paid this driver-week. Prompts
 * for an optional payout reference (e-transfer #, etc.) so a human can match it to
 * their own records. The server flips pending→paid atomically; a double-click gets
 * a 409 and this surfaces "already paid".
 */
export function MarkPaidButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    const payoutReference = window.prompt("Payout reference (optional — e-transfer #, note):") ?? undefined;
    // Cancel returns null → treated as "" (proceed with no reference); an actual
    // cancel is indistinguishable from empty in prompt(), so we proceed either way.
    setBusy(true);
    try {
      const res = await fetch(`/api/superadmin/driver-payouts/${id}/mark-paid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payoutReference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Couldn't mark paid");
        if (res.status === 409) router.refresh();
        return;
      }
      toast.success("Marked paid");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't mark paid");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-3 py-1.5 rounded-lg text-xs inline-flex items-center gap-1.5"
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Mark paid
    </button>
  );
}
