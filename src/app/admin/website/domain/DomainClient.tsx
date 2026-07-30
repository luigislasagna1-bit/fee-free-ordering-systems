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
  pendingCustomDomain: string | null;
  previousCustomDomain: string | null;
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
  /** DNS records computed SERVER-SIDE for whichever domain still needs
   *  registrar work (the pending switch target, or an unverified live
   *  domain). Server-provided so the table survives page reloads — the
   *  old bug was that records lived only in post-connect component
   *  state and vanished on refresh. */
  initialDnsRecords: DnsRecord[] | null;
}

type SubAvailability = { ok: true } | { ok: false; reason: string } | null;

/** Outcome of one verify-custom poll:
 *  - "cutover"  → a pending domain SWITCH just completed (new domain live)
 *  - "verified" → the live domain is now verified (no switch in progress)
 *  - "pending"  → still waiting on DNS */
type VerifyResult = "cutover" | "verified" | "pending";

export function DomainClient({ initial, platformDomain, providerIsDevStub, hasCustomDomainAddOn, initialDnsRecords }: Props) {
  const t = useTranslations("admin.domain");
  const [subdomain, setSubdomain] = useState(initial.subdomain);
  const [subAvail, setSubAvail] = useState<SubAvailability>(null);
  const [savingSub, setSavingSub] = useState(false);
  const subAvailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The domain currently serving the store. Changes client-side on
  // first-connect and on a zero-downtime switch cutover.
  const [liveDomain, setLiveDomain] = useState(initial.customDomain);
  // A domain SWITCH in progress: the new domain waits here while the live
  // one keeps serving. verify-custom performs the atomic cutover.
  const [pendingDomain, setPendingDomain] = useState(initial.pendingCustomDomain);
  // After a cutover, the old domain permanently redirects to the new one.
  const [previousDomain, setPreviousDomain] = useState(initial.previousCustomDomain);
  const [customStatus, setCustomStatus] = useState(initial.customDomainStatus);
  // The connect / switch input field (always a NEW domain being typed).
  const [domainInput, setDomainInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(initialDnsRecords);
  // Ownership confirmed at the provider but DNS not routing to us yet —
  // surfaced so the owner knows the TXT record worked and only the
  // A/CNAME change is still propagating.
  const [dnsPending, setDnsPending] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  // Pre-flight warning modal. Click "Connect" / "Switch" shows the modal;
  // only when the user confirms do we actually fire the API call.
  // Prevents accidental DNS takedowns of the restaurant's existing
  // website. They have to click through a clear warning explaining
  // what's about to happen.
  const [showConfirm, setShowConfirm] = useState(false);

  const liveUrl =
    liveDomain && customStatus === "verified"
      ? `https://${liveDomain}`
      : `https://${subdomain}.${platformDomain}`;

  // The domain still awaiting registrar work (drives the DNS table + mailto).
  const setupDomain = pendingDomain ?? liveDomain ?? "";

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

  /** Hit /verify-custom ONCE. Used by the manual button + both background
   *  auto-polls. Handles ALL state transitions centrally (cutover swap,
   *  verified promotion, dnsPending flag) so no caller can miss the
   *  zero-downtime switch. The cutover toast fires here — exactly once —
   *  regardless of which caller happened to catch it. Other toasts are
   *  left to the caller. */
  const pollVerifyOnce = async (): Promise<VerifyResult> => {
    const res = await fetch("/api/admin/domain/verify-custom", { method: "POST" });
    const raw = await res.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { /* leave empty */ }
    setDnsPending(!!data?.dnsPending);
    if (data?.cutover) {
      // ZERO-DOWNTIME SWITCH just completed: pending → live; the old live
      // domain now permanently redirects to the new one.
      setPreviousDomain(data.redirectingFrom ?? null);
      setLiveDomain(data.liveDomain ?? null);
      setPendingDomain(null);
      setCustomStatus("verified");
      setDnsRecords(null);
      toast.success(t("switchedLive"));
      return "cutover";
    }
    if (data?.status?.verified) {
      setCustomStatus("verified");
      return "verified";
    }
    return "pending";
  };

  // Fast auto-poll right after a connect (pending / verifying): every 5s
  // for up to 2 minutes, so quick DNS setups verify without any clicking.
  useEffect(() => {
    if (customStatus !== "pending" && customStatus !== "verifying") return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      attempts++;
      try {
        const result = await pollVerifyOnce();
        if (cancelled) return;
        if (result === "cutover") return; // toast handled centrally
        if (result === "verified") {
          toast.success(t("verified"));
          return;
        }
      } catch {}
      if (cancelled) return;
      if (attempts < 24) setTimeout(tick, 5000); // up to 2 min
    };
    const handle = setTimeout(tick, 5000);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    try {
      const res = await fetch("/api/admin/domain/connect-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput }),
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
      if (data.mode === "already-live") {
        // Re-connecting the domain that's already live — nothing to do.
        toast(t("alreadyLive"), { icon: "ℹ️" });
      } else if (data.mode === "switch-pending") {
        // ZERO-DOWNTIME SWITCH: live domain untouched — the new one waits
        // in pending until the provider confirms its DNS actually routes.
        setPendingDomain(data.domain);
        setDnsRecords(data.dnsRecords ?? []);
        setDnsPending(false);
        setDomainInput("");
        toast.success(t("customConnected"));
      } else {
        // First connect — no domain was live before.
        setLiveDomain(data.domain);
        setCustomStatus("pending");
        setDnsRecords(data.dnsRecords ?? []);
        setDnsPending(false);
        setDomainInput("");
        toast.success(t("customConnected"));
      }
    } catch (e: any) {
      toast.error(e.message || t("connectFailed"));
    }
    setConnecting(false);
  };

  // Auto-poll while a domain is in transit (unverified live domain OR a
  // pending switch) so the user doesn't have to manually click "Re-check"
  // every 30 seconds. Polls every 20s and stops on verified / cutover, on
  // disconnect, or after 20 minutes (the typical max DNS propagation
  // window we tell people about).
  useEffect(() => {
    const needsPolling = pendingDomain
      ? true
      : !!liveDomain && customStatus !== "verified" && customStatus !== "none";
    if (!needsPolling) return;
    const start = Date.now();
    const MAX_MS = 20 * 60_000; // 20 minutes
    const interval = setInterval(async () => {
      if (Date.now() - start > MAX_MS) {
        clearInterval(interval);
        return;
      }
      try {
        const result = await pollVerifyOnce();
        if (result === "cutover" || result === "verified") clearInterval(interval);
      } catch {
        // Swallow transient errors — next tick will retry.
      }
    }, 20_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDomain, pendingDomain, customStatus]);

  /** Manual re-check (button-driven). Toasts the result so the user
   *  knows the click worked. */
  const reverify = async () => {
    setVerifying(true);
    try {
      const result = await pollVerifyOnce();
      // "cutover" already toasted centrally in pollVerifyOnce.
      if (result === "verified") toast.success(t("verified"));
      else if (result === "pending") toast(t("notYetVerified"), { icon: "⏳" });
    } catch {
      toast.error(t("verifyFailed"));
    }
    setVerifying(false);
  };

  /** DELETE /disconnect-custom. When a switch is pending the server ONLY
   *  cancels the pending switch (live domain untouched); with no pending
   *  it disconnects the live domain fully. The confirm copy + state
   *  cleanup mirror those two modes. */
  const disconnectCustom = async () => {
    const cancellingSwitch = !!pendingDomain;
    if (!confirm(t(cancellingSwitch ? "cancelSwitchConfirm" : "disconnectConfirm"))) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/admin/domain/disconnect-custom", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || t("disconnectFailed"));
      if (data?.cancelledPending) {
        // Only the pending switch was cancelled — the live domain stays.
        setPendingDomain(null);
        setDnsRecords(null);
        setDnsPending(false);
        toast.success(t("switchCancelled"));
      } else {
        setLiveDomain(null);
        setPendingDomain(null);
        setPreviousDomain(null);
        setCustomStatus("none");
        setDnsRecords(null);
        setDnsPending(false);
        setDomainInput("");
        toast.success(t("disconnected"));
      }
    } catch (e: any) {
      toast.error(e.message || t("disconnectFailed"));
    }
    setDisconnecting(false);
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(t("copied")); }
    catch { toast.error(t("copyFailed")); }
  };

  // Shared DNS setup block: ETA banner + records table + registrar guide +
  // support nudge. Rendered for an unverified live domain AND for a pending
  // switch target. Records come from the server (survive reloads).
  const dnsSetupBlock = dnsRecords && dnsRecords.length > 0 ? (
    <>
      {/* ETA banner — sets the right expectation BEFORE the
          user starts the DNS dance. Without this, owners
          panic 90 seconds after adding records when
          "Re-check" still says pending. */}
      <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
        <Clock className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 leading-relaxed">
          {t.rich("etaBanner", {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
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
        <span className="text-gray-500">{t("supportNudge")}</span>
        <a
          href={`mailto:support@feefreeordering.com?subject=Custom%20domain%20help%20for%20${encodeURIComponent(setupDomain)}&body=Hi%20%2D%20I%27m%20trying%20to%20connect%20${encodeURIComponent(setupDomain)}%20but%20%5Bdescribe%20the%20issue%5D.`}
          className="inline-flex items-center gap-1 text-emerald-600 font-semibold hover:text-emerald-700"
        >
          <Mail className="w-3 h-3" /> {t("emailSupport")}
        </a>
      </div>
    </>
  ) : null;

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
            {t("addOnBadge")}
          </span>
        </h2>
        <p className="text-xs text-gray-500 mb-4">{t("customDomainBody")}</p>

        {/* Paid feature gate. Without the add-on we replace the connect
            form with an upgrade CTA. If a customDomain is already
            connected (active subscription that later lapsed), we still
            show the existing status so the owner can disconnect — but
            we never let them ADD a new domain without the add-on. */}
        {!hasCustomDomainAddOn && !liveDomain ? (
          <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-emerald-900 mb-1">{t("upsellTitle")}</h3>
                <p className="text-xs text-emerald-900 leading-relaxed mb-3">
                  {t.rich("upsellBody", {
                    code: (chunks) => <code className="bg-emerald-100 px-1 rounded">{chunks}</code>,
                  })}
                </p>
                <a
                  href="/admin/billing/add-ons"
                  className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                >
                  {t("upsellCta")}
                </a>
              </div>
            </div>
          </div>
        ) : !liveDomain ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={domainInput}
              onChange={e => setDomainInput(e.target.value.toLowerCase().trim())}
              placeholder="yourrestaurant.com"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => setShowConfirm(true)}
              disabled={connecting || !domainInput}
              className="bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition disabled:opacity-50 text-sm flex items-center gap-2 justify-center min-w-[100px]"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("connect")}
            </button>
          </div>
        ) : pendingDomain ? (
          <div>
            {/* ── Zero-downtime switch in progress: BOTH cards ──────────── */}
            {/* Live domain — keeps serving the store during the switch. */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 mb-3">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">{t("liveCardStaysTitle")}</p>
              <p className="text-sm font-mono font-semibold text-gray-900">{liveDomain}</p>
              <StatusBadge status={customStatus} t={t} />
            </div>

            {/* Pending domain — waiting for its DNS to route to us. */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">{t("pendingCardTitle")}</p>
                  <p className="text-sm font-mono font-semibold text-gray-900 truncate">{pendingDomain}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full mt-1 bg-amber-100 text-amber-700">
                    <Loader2 className="w-3 h-3 animate-spin" /> {t("pendingBadge")}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={reverify}
                    disabled={verifying}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {verifying ? <Loader2 className="w-4 h-4 animate-spin inline" /> : t("recheck")}
                  </button>
                  <button
                    onClick={disconnectCustom}
                    disabled={disconnecting}
                    className="text-sm font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    {disconnecting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : t("cancelSwitch")}
                  </button>
                </div>
              </div>
              {dnsPending && (
                <p className="text-xs text-amber-800 mt-2">{t("dnsPendingHint")}</p>
              )}
              {dnsSetupBlock}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-mono font-semibold text-gray-900">{liveDomain}</p>
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

            {/* After a cutover the old domain permanently redirects here. */}
            {previousDomain && (
              <p className="text-xs text-gray-500 mb-3">{t("previousRedirectNote", { domain: previousDomain })}</p>
            )}

            {customStatus !== "verified" && dnsPending && (
              <p className="text-xs text-amber-800 mt-2">{t("dnsPendingHint")}</p>
            )}
            {customStatus !== "verified" && dnsSetupBlock}

            {/* Zero-downtime switch: connect a NEW domain while this one
                keeps serving. Same add-on gate as a first connect. */}
            {hasCustomDomainAddOn && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-bold text-gray-900 mb-1">{t("switchTitle")}</h3>
                <p className="text-xs text-gray-500 mb-3">{t("switchBody")}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={domainInput}
                    onChange={e => setDomainInput(e.target.value.toLowerCase().trim())}
                    placeholder="yourrestaurant.com"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={connecting || !domainInput}
                    className="bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition disabled:opacity-50 text-sm flex items-center gap-2 justify-center min-w-[100px]"
                  >
                    {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("switchCta")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Pre-flight confirmation modal — shown after the user clicks
          Connect / Switch but BEFORE we fire the Vercel API call.
          Restaurant owners often don't realize that pointing a domain at
          us means the domain stops pointing wherever it currently points
          (e.g. an existing WordPress / Wix / Square site goes offline).
          The modal forces an explicit acknowledgment of this trade-off
          + reassures them that email is unaffected. For a SWITCH it also
          explains the zero-downtime behavior: the current domain keeps
          working until the new one is ready, then redirects to it.

          Plain fixed-position overlay; no portal lib needed. Backdrop
          click cancels; Esc-to-close handled by the X button only
          for simplicity. */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !connecting && setShowConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">{t(liveDomain ? "switchConfirmTitle" : "confirmTitle")}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {liveDomain
                    ? t.rich("switchConfirmIntro", {
                        domain: domainInput,
                        liveDomain,
                        code: (chunks) => <code className="font-mono text-gray-700 bg-gray-100 px-1 rounded">{chunks}</code>,
                      })
                    : t.rich("confirmIntro", {
                        domain: domainInput,
                        code: (chunks) => <code className="font-mono text-gray-700 bg-gray-100 px-1 rounded">{chunks}</code>,
                      })}
                </p>
              </div>
            </div>

            <ul className="space-y-2.5 text-sm text-gray-700 mb-5">
              {liveDomain && (
                <>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 flex-shrink-0">✓</span>
                    <span>
                      {t.rich("switchBulletKeepsWorking", {
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 flex-shrink-0">✓</span>
                    <span>
                      {t.rich("switchBulletAutoRedirect", {
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </span>
                  </li>
                </>
              )}
              <li className="flex gap-2">
                <span className="text-amber-500 flex-shrink-0">⚠️</span>
                <span>
                  {t.rich("confirmBulletOffline", {
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500 flex-shrink-0">✓</span>
                <span>
                  {t.rich("confirmBulletEmail", {
                    email: `orders@${domainInput || "yourdomain.com"}`,
                    strong: (chunks) => <strong>{chunks}</strong>,
                    code: (chunks) => <code className="font-mono text-gray-600 bg-gray-100 px-1 rounded">{chunks}</code>,
                  })}
                </span>
              </li>
              {!liveDomain && (
                <>
                  <li className="flex gap-2">
                    <span className="text-emerald-500 flex-shrink-0">✓</span>
                    <span>
                      {t.rich("confirmBulletSsl", {
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gray-400 flex-shrink-0">ℹ️</span>
                    <span className="text-gray-600">
                      {t("confirmBulletVercel")}
                    </span>
                  </li>
                </>
              )}
            </ul>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={connecting}
                className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowConfirm(false);
                  await connectCustom();
                }}
                disabled={connecting}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 inline-flex items-center gap-2"
              >
                {connecting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("confirmConnect")}
              </button>
            </div>
          </div>
        </div>
      )}
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
