"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Sparkles } from "lucide-react";

export function PaygOptInButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function optIn() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/marketplace/payg-opt-in", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to opt in");
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

  return (
    <button
      type="button"
      onClick={optIn}
      disabled={submitting}
      className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold px-6 py-3.5 rounded-xl text-sm shadow-md transition flex items-center justify-center gap-2"
    >
      {submitting ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
      ) : (
        <><Sparkles className="w-4 h-4" /> Yes, list me on the marketplace</>
      )}
    </button>
  );
}
