"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Truck, Check, AlertTriangle, Send } from "lucide-react";

/**
 * ShipDay dispatch state + "Send to ShipDay" retry on the admin order page.
 *
 * Dispatch used to be a single invisible fire-and-forget on accept: when
 * ShipDay rejected the order (it can do so with HTTP 200 + success:false),
 * the order silently never reached a driver and there was no retry. This card
 * makes the state visible and the button returns ShipDay's actual answer —
 * built after Luigi's first two live test orders vanished this way
 * (2026-07-12).
 *
 * Renders only for delivery orders when ShipDay is configured (or the order
 * already carries dispatch state, e.g. config later turned off).
 */
export function ShipdayDispatchCard(props: {
  orderId: string;
  orderStatus: string;
  shipdayOrderId: string | null;
  shipdayStatus: string | null;
  dispatchedAtLabel: string | null;
  configOn: boolean;
}) {
  const t = useTranslations("admin.orders");
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sent = !!props.shipdayOrderId;
  const canSend =
    !sent && props.configOn && ["accepted", "preparing", "ready"].includes(props.orderStatus);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${props.orderId}/shipday-dispatch`, { method: "POST" });
      const data = await res.json();
      if (data?.ok) {
        setResult({ ok: true, msg: t("shipdaySendSuccess") });
        router.refresh();
      } else if (data?.skipped) {
        setResult({ ok: false, msg: t("shipdaySkipped", { reason: String(data.skipped).replace(/_/g, " ") }) });
      } else {
        setResult({ ok: false, msg: t("shipdaySendError", { error: data?.error || "unknown" }) });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: t("shipdaySendError", { error: e?.message || "network" }) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <Truck className="w-4 h-4 text-blue-500" aria-hidden />
          <span className="font-semibold text-gray-900">{t("shipdayTitle")}</span>
          {sent ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <Check className="w-4 h-4" /> {t("shipdaySent")}
              <span className="text-gray-400 font-normal">
                · #{props.shipdayOrderId}
                {props.shipdayStatus ? ` · ${props.shipdayStatus}` : ""}
                {props.dispatchedAtLabel ? ` · ${props.dispatchedAtLabel}` : ""}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
              <AlertTriangle className="w-4 h-4" /> {t("shipdayNotSent")}
            </span>
          )}
        </div>
        {canSend && (
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? t("shipdaySending") : t("shipdaySendButton")}
          </button>
        )}
      </div>
      {result && (
        <p className={`mt-2 text-sm font-medium ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {result.msg}
        </p>
      )}
    </div>
  );
}
