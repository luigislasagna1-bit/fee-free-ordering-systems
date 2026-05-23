"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function PublishToggleClient({
  isPublished,
  publishReady,
}: {
  isPublished: boolean;
  publishReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doAction(action: "publish" | "unpublish") {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/admin/publishing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "Action failed");
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e: any) {
      setError(e?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (isPublished) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => doAction("unpublish")}
          disabled={busy || pending}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "Working…" : "Unpublish"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={!publishReady || busy || pending}
        onClick={() => doAction("publish")}
        className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {busy ? "Publishing…" : "Publish"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
