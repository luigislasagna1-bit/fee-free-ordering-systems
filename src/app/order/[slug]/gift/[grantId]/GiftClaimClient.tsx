"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Gift } from "lucide-react";
import { HelpTip } from "@/components/HelpTip";

/**
 * Reads the code from the URL fragment (`#g=...`) if present, strips it
 * from the address bar + history on mount (the code lives in component
 * state ONLY — never localStorage/sessionStorage), then walks
 * verify → claim behind one explicit button. Typed refusal codes map to a
 * translated message with a concrete next step (never a bare failure).
 */
export function GiftClaimClient({
  slug,
  grantId,
  restaurantName,
  primaryColor,
}: {
  slug: string;
  grantId: string;
  restaurantName: string;
  primaryColor: string;
}) {
  const t = useTranslations("giftPass");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"entry" | "verified" | "claiming" | "done">("entry");
  const [verifying, setVerifying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ amountLabel: string; note: string | null } | null>(null);
  const [resent, setResent] = useState(false);

  // Pull the code from the fragment (never sent to the server on its own —
  // the fragment never leaves the browser) and immediately scrub it from the
  // visible URL/history so a screenshot or back-button doesn't leak it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const m = hash.match(/#g=([0-9A-Za-z]+)/);
    if (m?.[1]) {
      setCode(m[1]);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  function errorMessage(reason: string): string {
    switch (reason) {
      case "expired": return t("errExpired");
      case "revoked": return t("errRevoked");
      case "account_exists": return t("errAccountExists");
      case "rewards_off": return t("errRewardsOff");
      case "superseded": return t("errSuperseded");
      case "too_many_attempts": return t("errTooManyAttempts");
      case "rate_limited": return t("errRateLimited");
      case "email_mismatch": return t("errEmailMismatch");
      case "invalid": return t("errInvalid");
      default: return t("errGeneric");
    }
  }

  async function verify() {
    if (verifying || !code.trim()) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/public/gift-pass/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setError(errorMessage(data.reason || "generic"));
        return;
      }
      setPreview({ amountLabel: data.amountLabel, note: data.note ?? null });
      setStage("verified");
    } catch {
      setError(t("errGeneric"));
    } finally {
      setVerifying(false);
    }
  }

  async function claim() {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch("/api/public/gift-pass/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setError(errorMessage(data.reason || "generic"));
        setClaiming(false);
        return;
      }
      setStage("done");
      window.location.assign(data.redirectTo || `/order/${slug}`);
    } catch {
      setError(t("errGeneric"));
      setClaiming(false);
    }
  }

  async function resendCode() {
    if (resent) return;
    try {
      await fetch("/api/public/gift-pass/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, grantId }),
      });
    } catch {
      /* generic response either way — never reveal outcome */
    } finally {
      setResent(true);
    }
  }

  const inputCls =
    "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono tracking-wide focus:outline-none focus:ring-2";

  return (
    <div className="mt-6">
      {stage === "entry" || stage === "verified" ? (
        <>
          <label htmlFor="gift-code-input" className="flex items-center gap-1 text-sm font-semibold text-gray-700 mb-1">
            {t("codeLabel")}
            <HelpTip text={t("helpTipWhatIsThis")} />
          </label>
          <input
            id="gift-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("codePlaceholder")}
            autoComplete="off"
            className={inputCls}
            style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
          />
          <p className="text-xs text-gray-500 mt-1">{t("codeHelp")}</p>

          {preview && stage === "verified" && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5" style={{ color: primaryColor }} />
                <span className="text-lg font-bold text-gray-900">{t("giftAmount", { amount: preview.amountLabel })}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">{t("giftFrom", { restaurantName })}</p>
              {preview.note && <p className="text-sm italic text-gray-500 mt-2">{t("giftNote", { note: preview.note })}</p>}
            </div>
          )}

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <button
            type="button"
            onClick={stage === "verified" ? claim : verify}
            disabled={verifying || claiming || !code.trim()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {verifying || claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {claiming ? t("claiming") : stage === "verified" ? t("claimButton") : t("verifyButton")}
          </button>

          {error && (
            <button type="button" onClick={resendCode} disabled={resent} className="mt-3 w-full text-xs text-gray-500 hover:underline disabled:opacity-50">
              {resent ? t("resendSent") : t("resendButton")}
            </button>
          )}

          <p className="mt-6 text-xs text-center text-gray-400">
            {t.rich("signUpInstead", {
              link: (chunks) => (
                <a href={`/order/${slug}/account/signup`} className="font-semibold hover:underline" style={{ color: primaryColor }}>
                  {chunks}
                </a>
              ),
            })}
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-600">{t("successBanner")}</p>
      )}
    </div>
  );
}
