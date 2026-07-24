"use client";
import { useMemo, useState } from "react";
import { Mail, MessageSquare, Send, Loader2, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * "Send the download link to your phone" — the owner emails/texts THEMSELVES the
 * Kitchen Order App link so they can install it on the kitchen device without
 * hunting the store. Posts to /api/admin/publishing/send-app-link (session-gated,
 * rate-limited). Shown inside the "Get the app" block on /admin/publishing.
 */
type Channel = "email" | "sms";
type Status = "idle" | "sending" | "done" | "error";

export function SendAppLinkForm({ defaultEmail, defaultPhone }: { defaultEmail?: string | null; defaultPhone?: string | null }) {
  const t = useTranslations("admin.publishingPage");
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const value = channel === "email" ? email : phone;
  const setValue = channel === "email" ? setEmail : setPhone;
  const canSend = useMemo(() => value.trim().length > 0 && status !== "sending", [value, status]);

  async function send() {
    if (!canSend) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/publishing/send-app-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, to: value.trim() }),
      });
      if (res.ok) {
        setStatus("done");
        return;
      }
      const data = await res.json().catch(() => ({}));
      setErrorMsg(res.status === 429 ? t("sendLinkRateLimited") : t("sendLinkError"));
      setStatus("error");
      void data;
    } catch {
      setErrorMsg(t("sendLinkError"));
      setStatus("error");
    }
  }

  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
      active ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;

  return (
    <div className="mt-4 border-t border-emerald-100 pt-4">
      <h4 className="text-sm font-semibold text-gray-900">{t("sendLinkTitle")}</h4>
      <p className="text-xs text-gray-600 mt-0.5">{t("sendLinkBody")}</p>

      <div className="mt-3 flex gap-2">
        <button type="button" className={tabCls(channel === "email")} onClick={() => { setChannel("email"); setStatus("idle"); }}>
          <Mail className="w-3.5 h-3.5" /> {t("sendLinkEmailOption")}
        </button>
        <button type="button" className={tabCls(channel === "sms")} onClick={() => { setChannel("sms"); setStatus("idle"); }}>
          <MessageSquare className="w-3.5 h-3.5" /> {t("sendLinkTextOption")}
        </button>
      </div>

      {status === "done" ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="w-4 h-4" /> {t("sendLinkDone")}
        </p>
      ) : (
        <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            type={channel === "email" ? "email" : "tel"}
            inputMode={channel === "email" ? "email" : "tel"}
            value={value}
            onChange={(e) => { setValue(e.target.value); if (status === "error") setStatus("idle"); }}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder={channel === "email" ? t("sendLinkEmailPlaceholder") : t("sendLinkTextPlaceholder")}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap"
          >
            {status === "sending" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {status === "sending" ? t("sendLinkSending") : t("sendLinkSend")}
          </button>
        </div>
      )}
      {status === "error" && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}
    </div>
  );
}
