"use client";
import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2, Send, Trash2, CheckCircle2, Clock, Ban } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { HelpTip } from "@/components/HelpTip";

/**
 * "Gift Reward Dollars" (Luigi 2026-07-28) — gift wallet credit to a person by
 * EMAIL, including people with no account yet. Existing account → credited
 * instantly; otherwise the gift waits and is credited automatically the moment
 * they sign up with that email (no expiry). Backed by /api/admin/reward-gifts.
 * Rendered on the Reward Dollars page inside the rewardsEnabled block.
 */
type GiftRow = {
  id: string;
  email: string;
  name: string;
  amount: number;
  note: string | null;
  status: string; // pending | claimed | revoked
  createdAt: string;
  claimedAt: string | null;
  emailSentAt: string | null;
};

export function GiftRewardDollars({ currency, rewardLabel }: { currency: string; rewardLabel: string }) {
  const t = useTranslations("admin.rewards");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reward-gifts", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.gifts)) setGifts(data.gifts);
    } catch {
      /* list is non-critical; the form still works */
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sendGift() {
    if (sending) return;
    const amt = Number(amount);
    if (!name.trim() || !email.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast.error(t("giftValidation"));
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/admin/reward-gifts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), amount: amt, note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.code === "invalid_email" ? t("giftInvalidEmail") : t("giftFailed"));
        return;
      }
      toast.success(data.instant ? t("giftSentInstant") : t("giftSentPending"));
      setName(""); setEmail(""); setAmount(""); setNote("");
      load();
    } catch {
      toast.error(t("giftFailed"));
    } finally {
      setSending(false);
    }
  }

  async function revoke(id: string) {
    if (revoking) return;
    setRevoking(id);
    try {
      const res = await fetch(`/api/admin/reward-gifts/${id}/revoke`, { method: "POST" });
      if (res.ok) {
        toast.success(t("giftRevoked"));
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.code === "not_pending" ? t("giftRevokeTooLate") : t("giftFailed"));
      }
      load();
    } catch {
      toast.error(t("giftFailed"));
    } finally {
      setRevoking(null);
    }
  }

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-100 p-2"><Gift className="w-5 h-5 text-emerald-600" /></div>
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-900 flex items-center gap-1.5">
            {t("giftTitle", { label: rewardLabel })}
            <HelpTip text={t("giftHelp", { label: rewardLabel })} />
          </h2>
          <p className="text-sm text-gray-600 mt-0.5">{t("giftSubtitle")}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("giftNamePlaceholder")} className={inputCls} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" placeholder={t("giftEmailPlaceholder")} className={inputCls} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder={t("giftAmountPlaceholder")} className={inputCls} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("giftNotePlaceholder")} className={inputCls} />
      </div>
      <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        {/* CASL reminder — 1:1 gifts to YOUR customers, not cold outreach. */}
        <p className="text-[11px] text-gray-400 leading-relaxed">{t("giftConsentReminder")}</p>
        <button
          type="button"
          onClick={sendGift}
          disabled={sending}
          className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg whitespace-nowrap"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? t("giftSending") : t("giftSend")}
        </button>
      </div>

      {loaded && gifts.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
          {gifts.map((g) => (
            <li key={g.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium text-gray-800 truncate">
                  {g.name} <span className="text-gray-400 font-normal">· {g.email}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {formatCurrency(g.amount, currency)} · {new Date(g.createdAt).toLocaleDateString()}
                  {g.note ? ` · “${g.note}”` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {g.status === "claimed" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> {t("giftStatusClaimed")}
                  </span>
                ) : g.status === "revoked" ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    <Ban className="w-3 h-3" /> {t("giftStatusRevoked")}
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      <Clock className="w-3 h-3" /> {t("giftStatusPending")}
                    </span>
                    <button
                      type="button"
                      onClick={() => revoke(g.id)}
                      disabled={revoking === g.id}
                      className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                      title={t("giftRevoke")}
                      aria-label={t("giftRevoke")}
                    >
                      {revoking === g.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
