"use client";
import { useEffect, useRef, useState } from "react";
import {
  Globe, Copy, Check, ExternalLink, Loader2, AlertTriangle, ShieldCheck, Trash2,
  Clock, Mail,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { RegistrarGuide } from "./RegistrarGuide";

interface InitialState {
  slug: string;
  subdomain: string;
  customDomain: string | null;
  customDomainStatus: string;
}

interface DnsRecord { type: string; name: string; value: string }

interface Props {
  initial: InitialState;
  platformDomain: string;
  providerIsDevStub: boolean;
  /** True when the restaurant has the `custom_domain_routing` feature
   *  granted by an active "Custom Domain" add-on subscription ($9.99/mo).
   *  Without it, the custom-domain section shows an upgrade CTA
   *  instead of the connect input. */
  hasCustomDomainAddOn: boolean;
}

type SubAvailability = { ok: true } | { ok: false; reason: string } | null;

export function DomainClient({ initial, platformDomain, providerIsDevStub, hasCustomDomainAddOn }: Props) {
  const t = useTranslations("admin.domain");
  const [subdomain, setSubdomain] = useState(initial.subdomain);
  const [subAvail, setSubAvail] = useState<SubAvailability>(null);
  const [savingSub, setSavingSub] = useState(false);
  const subAvailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [customDomain, setCustomDomain] = useState(initial.customDomain ?? "");
  const [customStatus, setCustomStatus] = useState(initial.customDomainStatus);
  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const liveUrl =
    initial.customDomain && customStatus === "verified"
      ? `https://${initial.customDomain}`
      : `https://${subdomain}.${platformDomain}`;

  // Debounced availability check while typing the subdomain. Skip if value
  // matches what's already saved.
  useEffect(() => {
    if (subAvailTimer.current) clearTimeout(subAvailTimer.current);
    if (subdomain === initial.subdomain) { setSubAvail({ ok: true }); return; }
    setSubAvail(null);
    subAvailTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/domain/check-subdomain?value=${encodeURIComponent(subdomain)}`);
        const data = await res.json();
        if (data.available) setSubAvail({ ok: true });
        else setSubAvail({ ok: false, reason: data.reason || t("notAvailable") });
      } catch {
        setSubAvail({ ok: false, reason: t("checkFailed") });
      }
    }, 350);
    return () => { if (subAvailTimer.current) clearTimeout(subAvailTimer.current); };
  }, [subdomain, initial.subdomain, t]);

  // Auto-poll while a custom domain is in transit (pending / verifying).
  useEffect(() => {
    if (customStatus !== "pending" && customStatus !== "verifying") return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const res = await fetch("/api/admin/domain/verify-custom", { method: "POST" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.status?.verified) {
          setCustomStatus("verified");
          toast.success(t("verified"));
          return;
        }
      } catch {}
      if (cancelled) return;
      if (attempts < 24) setTimeout(tick, 5000); // up to 2 min
    };
    const handle = setTimeout(tick, 5000);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [customStatus, t]);

  const saveSubdomain = async () => {
    setSavingSub(true);
    try {
      const res = await fetch("/api/admin/domain/save-subdomain", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: subdomain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("saveFailed"));
      toast.success(t("subdomainSaved"));
    } catch (e: any) {
      toast.error(e.message || t("saveFailed"));
    }
    setSavingSub(false);
  };

  const connectCustom = async () => {
    setConnecting(true);
    setDnsRecords(null);
    try {
      const res = await fetch("/api/admin/domain/connect-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: customDomain }),
      });
      // Read as text first so empty-body 5xx responses don't crash with
      // "Unexpected end of JSON input" — we still get an error message,
      // just a less specific one.
      const raw = await res.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* leave data empty */ }
      if (!res.ok) {
        throw new Error(
          data.error
            || (raw && raw.slice(0, 200))
            || `${t("connectFailed")} (HTTP ${res.status})`,
        );
      }
      setDnsRecords(data.dnsRecords ?? []);
      setCustomStatus("pending");
      toast.success(t("customConnected"));
    } catch (e: any) {
      toast.error(e.message || t("connectFailed"));
    }
    setConnecting(false);
  };

  /** Hit /verify-custom ONCE. Used by both the manual button + the
   *  background auto-poll. Returns whether the domain is now verified.
   *  Silent (no toast) — the caller decides whether to toast. */
  const pollVerifyOnce = async (): Promise<boolean> => {
    const res = await fetch("/api/admin/domain/verify-custom", { method: "POST" });
    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { /* leave empty */ }
    if (data?.status?.verified) {
      setCustomStatus("verified");
      return true;
    }
    return false;
  };

  // Auto-poll while status is pending/verifying so the user doesn't
  // have to manually click "Re-check" every 30 seconds. Polls every
  // 20s and stops on verified, on disconnect, or after 20 minutes
  // (the typical max DNS propagation window we tell people about).
  useEffect(() => {
    if (!initial.customDomain) return;
    if (customStatus === "verified" || customStatus === "none") return;
    const start = Date.now();
    const MAX_MS = 20 * 60_000; // 20 minutes
    const interval = setInterval(async () => {
      if (Date.now() - start > MAX_MS) {
        clearInterval(interval);
        return;
      }
      try {
        const verified = await pollVerifyOnce();
        if (verified) clearInterval(interval);
      } catch {
        // Swallow transient errors — next tick will retry.
      }
    }, 20_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.customDomain, customStatus]);

  /** Manual re-check (button-driven). Toasts the result so the user
   *  knows the click worked. */
  const reverify = async () => {
    setVerifying(true);
    try {
      const verified = await pollVerifyOnce();
      if (verified) toast.success(t("verified"));
      else toast(t("notYetVerified"), { icon: "⏳" });
    } catch {
      toast.error(t("verifyFailed"));
    }
    setVerifying(false);
  };

  const disconnectCustom = async () => {
    if (!confirm(t("disconnectConfirm"))) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/admin/domain/disconnect-custom", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error || t("disconnectFailed"));
      setCustomDomain("");
      setCustomStatus("none");
      setDnsRecords(null);
      toast.success(t("disconnected"));
    } catch (e: any) {
      toast.error(e.message || t("disconnectFailed"));
    }
    setDisconnecting(false);
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t("copied")); }
    catch { toast.error(t("copyFailed")); }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Globe className="w-6 h-6 text-emerald-500" /> {t("title")}
      </h1>
      <p className="text-sm text-gray-500 mb-6">{t("subtitle")}</p>

      {providerIsDevStub && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{t("devModeBanner")}</span>
        </div>
      )}

      {/* ── Live URL ─────────────────────────────────────────────────────── */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">{t("liveAt")}</p>
          <p className="text-sm font-mono text-emerald-900 truncate">{liveUrl}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => copy(liveUrl)}
            className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-700"
            title={t("copy")}
          >
            <Copy className="w-4 h-4" />
          </button>
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-emerald-100 text-emerald-700"
            title={t("open")}
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* ── Free subdomain ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">{t("freeSubdomainTitle")}</h2>
        <p className="text-xs text-gray-500 mb-4">{t("freeSubdomainBody")}</p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-1 min-w-0 items-stretch border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500 overflow-hidden">
            <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm select-none">https://</span>
            <input
              value={subdomain}
              onChange={e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              className="flex-1 min-w-0 px-2 py-2 text-sm focus:outline-none"
              placeholder="your-restaurant"
              maxLength={63}
            />
            <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm select-none">.{platformDomain}</span>
          </div>
          <button
            onClick={saveSubdomain}
            disabled={savingSub || subAvail?.ok !== true || subdomain === initial.subdomain}
            className="bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition disabled:opacity-50 text-sm flex items-center gap-2 justify-center min-w-[100px]"
          >
            {savingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : t("save")}
          </button>
        </div>

        {subAvail && subAvail.ok === false && (
          <p className="text-xs text-red-600 mt-2">{subAvail.reason}</p>
        )}
        {subAvail?.ok && subdomain !== initial.subdomain && (
          <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
            <Check className="w-3 h-3" /> {t("available")}
          </p>
        )}
      </section>

      {/* ── Custom domain ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">
          {t("customDomainTitle")}
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
            $9.99/mo add-on
          </span>
        </h2>
        <p className="text-xs text-gray-500 mb-4">{t("customDomainBody")}</p>

        {/* Paid feature gate. Without the add-on we replace the connect
            form with an upgrade CTA. If a customDomain is already
            connected (active subscription that later lapsed), we still
            show the existing status so the owner can disconnect — but
            we never let them ADD a new domain without the add-on. */}
        {!hasCustomDomainAddOn && !initial.customDomain ? (
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-emerald-900 mb-1">Custom Domain — $9.99/mo add-on</h3>
                <p className="text-xs text-emerald-900 leading-relaxed mb-3">
                  Point your own domain (e.g. <code className="bg-emerald-100 px-1 rounded">yourrestaurant.com</code>) at
                  your ordering page. Includes free SSL, automatic DNS verification, and unlimited
                  domain changes. Cancel anytime.
                </p>
                <a
                  href="/admin/billing/add-ons"
                  className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  Activate add-on →
                </a>
              </div>
            </div>
          </div>
        ) : !initial.customDomain ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={customDomain}
              onChange={e => setCustomDomain(e.target.value.toLowerCase().trim())}
              placeholder="yourrestaurant.com"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={connectCustom}
              disabled={connecting || !customDomain}
              className="bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition disabled:opacity-50 text-sm flex items-center gap-2 justify-center min-w-[100px]"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("connect")}
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-mono font-semibold text-gray-900">{initial.customDomain}</p>
                <StatusBadge status={customStatus} t={t} />
              </div>
              <div className="flex items-center gap-2">
                {customStatus !== "verified" && (
                  <button
                    onClick={reverify}
                    disabled={verifying}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin inline" /> : t("recheck")}
                  </button>
                )}
                <button
                  onClick={disconnectCustom}
                  disabled={disconnecting}
                  className="text-sm font-semibold text-red-600 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  title={t("disconnect")}
                >
                  {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {dnsRecords && dnsRecords.length > 0 && customStatus !== "verified" && (
              <>
                {/* ETA banner — sets the right expectation BEFORE the
                    user starts the DNS dance. Without this, owners
                    panic 90 seconds after adding records when
                    "Re-check" still says pending. */}
                <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-900 leading-relaxed">
                    <strong>How long does this take?</strong> Usually 5-30 minutes after you add
                    the records below at your registrar. Occasionally up to 24 hours if your
                    DNS provider is slow or you had old records cached. We&apos;ll check automatically
                    every 20 seconds while you wait — no need to refresh.
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">{t("dnsInstructions")}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-gray-500">
                        <tr>
                          <th className="py-1 pr-3 font-medium">{t("dnsType")}</th>
                          <th className="py-1 pr-3 font-medium">{t("dnsName")}</th>
                          <th className="py-1 font-medium">{t("dnsValue")}</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono text-gray-800">
                        {dnsRecords.map((r, i) => (
                          <tr key={i} className="border-t border-gray-200">
                            <td className="py-1.5 pr-3">{r.type}</td>
                            <td className="py-1.5 pr-3">{r.name}</td>
                            <td className="py-1.5 break-all">
                              {r.value}
                              <button onClick={() => copy(r.value)} className="ml-2 text-gray-400 hover:text-gray-700">
                                <Copy className="w-3 h-3 inline" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Per-registrar step-by-step guide. Collapsed by default;
                    expand → pick GoDaddy / Namecheap / Cloudflare / etc.
                    Removes the most common support question we'd get
                    from non-technical restaurant owners. */}
                <RegistrarGuide />

                {/* Support escalation. If they're stuck, we want them to
                    email us BEFORE they give up + churn. The mailto
                    pre-fills the domain so we have context immediately. */}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-gray-500">Stuck? We&apos;ll walk you through it.</span>
                  <a
                    href={`mailto:support@feefreeordering.com?subject=Custom%20domain%20help%20for%20${encodeURIComponent(initial.customDomain ?? "")}&body=Hi%20%2D%20I%27m%20trying%20to%20connect%20${encodeURIComponent(initial.customDomain ?? "")}%20but%20%5Bdescribe%20the%20issue%5D.`}
                    className="inline-flex items-center gap-1 text-emerald-600 font-semibold hover:text-emerald-700"
                  >
                    <Mail className="w-3 h-3" /> Email support
                  </a>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: ReturnType<typeof useTranslations> }) {
  const label = {
    none: t("statusNone"),
    pending: t("statusPending"),
    verifying: t("statusVerifying"),
    verified: t("statusVerified"),
    error: t("statusError"),
  }[status] ?? status;

  const cls = {
    verified: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    verifying: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-700",
    none: "bg-gray-100 text-gray-600",
  }[status] ?? "bg-gray-100 text-gray-600";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${cls}`}>
      {status === "verified" && <ShieldCheck className="w-3 h-3" />}
      {(status === "pending" || status === "verifying") && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </span>
  );
}
