"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Sparkles } from "lucide-react";

export function PaygOptInButton({
  disabled = false,
  blockerLabel,
}: {
  disabled?: boolean;
  /** Label to show on the disabled button when the parent KNOWS why it's
   *  disabled (e.g. "Publish your restaurant first"). Falls back to the
   *  card-not-on-file message when not supplied — that's the original
   *  case this button was first built for. */
  blockerLabel?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function optIn() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketplace/payg-opt-in", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // Server-enforced card gate (412) — keep them on this page so
        // they can finish setup, don't redirect or toast a confusing
        // generic error.
        if (res.status === 412 && data?.code === "card_required") {
          toast.error("Add a payment method above before opting in.");
        } else {
          toast.error(data?.error || "Failed to opt in");
        }
        return;
      }
      toast.success("You're on the marketplace! Customize your listing next.");
      router.push("/admin/marketplace");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Failed to opt in");
    } finally {
      setSubmitting(false);
    }
  }

  const isDisabled = disabled || submitting;

  return (
    <button
      type="button"
      onClick={optIn}
      disabled={isDisabled}
      className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-3.5 rounded-xl text-sm shadow-md transition flex items-center justify-center gap-2"
      title={disabled ? (blockerLabel || "Add a payment method first") : ""}
    >
      {submitting ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
      ) : disabled ? (
        <>{blockerLabel || "Add a payment method to continue"}</>
      ) : (
        <><Sparkles className="w-4 h-4" /> Yes, list me on the marketplace</>
      )}
    </button>
  );
}
