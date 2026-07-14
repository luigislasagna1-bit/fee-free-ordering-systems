"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Send } from "lucide-react";

/** Manual "Send to driver" for a held delivery order (autoSend off). */
export function SendToDriverButton({
  orderId,
  label,
  sendingLabel,
  failLabel,
  sentLabel,
}: {
  orderId: string;
  label: string;
  sendingLabel: string;
  failLabel: string;
  sentLabel: string;
}) {
  const router = useRouter();
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/admin/feefree-delivery/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        toast.error(failLabel);
        return;
      }
      toast.success(sentLabel);
      router.refresh();
    } catch {
      toast.error(failLabel);
    } finally {
      setSending(false);
    }
  }

  return (
    <button
      onClick={send}
      disabled={sending}
      className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
    >
      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
      {sending ? sendingLabel : label}
    </button>
  );
}
