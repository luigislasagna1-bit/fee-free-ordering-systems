"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";

export function ImpersonateButton({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    const res = await fetch("/api/superadmin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition px-3 py-1.5 rounded-lg disabled:opacity-60"
    >
      <Settings className="w-3.5 h-3.5" />
      {loading ? "Opening..." : "Manage"}
    </button>
  );
}
