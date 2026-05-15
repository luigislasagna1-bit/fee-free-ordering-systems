"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, Loader2 } from "lucide-react";

export function CreateTestRestaurantButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/superadmin/restaurants/seed-test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`Created ${data.email} · password: ${data.password}`, { duration: 8000 });
      router.refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
    setBusy(false);
  };

  return (
    <button
      onClick={create}
      disabled={busy}
      className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
      Create test restaurant
    </button>
  );
}
