"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, CheckCircle2, AlertCircle, Loader2, Copy, Trash2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Client-side custom-domain manager for the reseller white-label
 * Full tier. Three states it transitions between:
 *
 *   1. NOT CONNECTED — form to enter a domain. Server creates the
 *      Vercel binding + returns DNS records to add at the registrar.
 *   2. PENDING / VERIFYING — domain bound but DNS not propagated yet.
 *      Shows the DNS records + a "Re-check" button that polls /verify.
 *   3. VERIFIED — green badge, "Disconnect" + "Test the domain" CTAs.
 *
 * The "ERROR" state is handled inline within #2 — the badge changes
 * colour + the error message is shown above the DNS records, and
 * Re-check still works.
 */
export interface InitialState {
  domain: string | null;
  status: string;              // "none" | "pending" | "verifying" | "verified" | "error"
  addedAt: Date | null;
  error: string | null;
  tier: "basic" | "full" | null;
  active: boolean;
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

export function CustomDomainClient({ initial }: { initial: InitialState }) {
  const router = useRouter();
  const [state, setState] = useState<InitialState>(initial);
  const [domainInput, setDomainInput] = useState("");
  const [busy, setBusy] = useState(false);
  // DNS records aren't persisted server-side (Vercel returns them on
  // addDomain). We cache them client-side so the user can re-copy
  // without re-creating the binding.
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[] | null>(null);
  const [providerStub, setProviderStub] = useState(false);

  const tierOK = state.tier === "full" && state.active;

  const connect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/reseller/domain/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setState({ ...state, domain: data.domain, status: "pending", addedAt: new Date(), error: null });
      setDnsRecords(data.dnsRecords ?? null);
      setProviderStub(!!data.providerIsDevStub);
      toast.success("Domain registered — add the DNS records to verify.");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/reseller/domain/verify", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      const verified = !!data.status?.verified;
      setState({ ...state, status: verified ? "verified" : "verifying", error: data.status?.error ?? null });
      if (verified) toast.success("Domain verified! Your branding is live.");
      else toast(data.status?.error ?? "Still propagating — DNS can take up to an hour.", { icon: "⏳" });
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect this domain? Your branding will revert to the default platform login.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reseller/domain/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Disconnect failed");
      setState({ ...state, domain: null, status: "none", addedAt: null, error: null });
      setDnsRecords(null);
      toast.success("Domain disconnected.");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Render branches ───────────────────────────────────────────────

  if (!tierOK) {
    return (
      <div className="bg-white rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center flex-shrink-0">
            <Link2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-amber-900 mb-1">Requires White-Label Full</h2>
            <p className="text-xs text-amber-900 leading-relaxed mb-3">
              Custom domain is part of the White-Label Full tier ($29/mo). With Full you can
              point your own domain (like <code className="bg-amber-100 px-1 rounded">login.yourbrand.com</code>)
              at our platform — your restaurants log in at a URL with YOUR brand on it, not ours.
            </p>
            <a
              href="/reseller/branding"
              className="inline-flex items-center px-3 py-1.5 bg-emerald-500 text-white text-xs font-semibold rounded hover:bg-emerald-600 transition"
            >
              {state.tier === "basic" ? "Upgrade to Full" : "Subscribe to Full"}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Connected — show status panel + DNS instructions
  if (state.domain) {
    const verified = state.status === "verified";
    const hasErr = state.status === "error" || !!state.error;

    return (
      <div className="space-y-4">
        <div className={`rounded-2xl border shadow-sm p-5 ${verified ? "bg-emerald-50 border-emerald-200" : hasErr ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${verified ? "bg-emerald-100 text-emerald-700" : hasErr ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                {verified ? <CheckCircle2 className="w-5 h-5" /> : hasErr ? <AlertCircle className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
              </div>
              <div>
                <h2 className={`text-sm font-bold ${verified ? "text-emerald-900" : hasErr ? "text-red-900" : "text-blue-900"}`}>
                  {verified ? "Domain verified" : hasErr ? "Verification problem" : "Waiting for DNS"}
                </h2>
                <div className="font-mono text-sm font-semibold text-gray-900 mt-0.5">{state.domain}</div>
                {state.addedAt && (
                  <div className="text-[10px] text-gray-500 mt-1">
                    Connected {new Date(state.addedAt).toLocaleString()}
                  </div>
                )}
                {state.error && (
                  <p className="text-xs text-red-700 mt-2 font-mono">{state.error}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!verified && (
                <button
                  type="button"
                  onClick={verify}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded text-xs font-semibold text-gray-700 hover:border-gray-300 transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Re-check
                </button>
              )}
              {verified && (
                <a
                  href={`https://${state.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-semibold hover:bg-emerald-600 transition"
                >
                  Open domain ↗
                </a>
              )}
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded text-xs font-semibold transition disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Disconnect
              </button>
            </div>
          </div>
        </div>

        {!verified && dnsRecords && (
          <DnsRecordsPanel records={dnsRecords} stub={providerStub} />
        )}

        {!verified && !dnsRecords && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-sm text-gray-600">
            <p className="font-semibold text-gray-900 mb-1">DNS records</p>
            <p className="text-xs text-gray-500">
              We don&apos;t persist the DNS values across page reloads. If you need to see them again,
              copy them from your registrar dashboard, or disconnect + reconnect the domain to
              regenerate them.
            </p>
          </div>
        )}
      </div>
    );
  }

  // No domain — connection form
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-base font-bold text-gray-900 mb-1">Connect your domain</h2>
      <p className="text-xs text-gray-500 mb-4">
        Enter the domain you want to use. We&apos;ll register it with our hosting provider and
        give you DNS records to add at your registrar. Most domains verify within a few minutes.
      </p>
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value)}
          placeholder="login.yourbrand.com"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 transition font-mono"
          disabled={busy}
        />
        <button
          type="button"
          onClick={connect}
          disabled={busy || !domainInput.trim()}
          className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Connect
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mt-2 italic">
        Pick a subdomain you control (e.g. <code className="bg-gray-100 px-1 rounded">login</code>,
        <code className="bg-gray-100 px-1 rounded">app</code>, <code className="bg-gray-100 px-1 rounded">order</code>)
        rather than your bare apex — it&apos;s easier to manage DNS that way + leaves your main site untouched.
      </p>
    </div>
  );
}

function DnsRecordsPanel({ records, stub }: { records: DnsRecord[]; stub: boolean }) {
  const copy = (v: string) => {
    navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-2">Add these DNS records at your registrar</h3>
      <p className="text-xs text-gray-500 mb-3">
        Log in to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.) and add the
        records below. Propagation usually takes 5-30 minutes; longer in extreme cases.
      </p>
      {stub && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
          ⚠️ Dev mode — domain provider is the local stub. Real DNS records will appear once
          VERCEL_TOKEN + VERCEL_PROJECT_ID are configured in production.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
              <th className="py-2 pr-3 font-semibold">Type</th>
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-2 pr-3 font-mono font-semibold text-gray-700">{r.type}</td>
                <td className="py-2 pr-3 font-mono text-gray-800 break-all">{r.name}</td>
                <td className="py-2 pr-3 font-mono text-gray-600 break-all">{r.value}</td>
                <td className="py-2 pl-1">
                  <button
                    type="button"
                    onClick={() => copy(r.value)}
                    className="text-gray-400 hover:text-gray-700"
                    title="Copy value"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Help text — most owners don't know what "@" means in DNS, and
          we've seen registrars silently reject CNAME-at-apex (RFC 1035).
          Surface both rules inline so a confused owner can self-correct
          without contacting support. */}
      {records.some((r) => r.name === "@") && (
        <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
          <strong>Note:</strong> <code className="bg-gray-100 px-1 rounded font-mono">@</code> means
          your root domain. Most registrars (GoDaddy, Namecheap, Cloudflare) accept{" "}
          <code className="bg-gray-100 px-1 rounded font-mono">@</code> directly in the Name field.
          If yours doesn&apos;t, leave Name blank or type the full apex.
        </p>
      )}
      {records.some((r) => r.type === "CNAME" && r.name === "@") && (
        <p className="mt-2 text-[11px] text-amber-700 leading-relaxed">
          ⚠️ A CNAME at the root (<code className="bg-amber-100 px-1 rounded font-mono">@</code>) is forbidden
          by DNS spec — registrars will reject it. Use a subdomain (e.g.{" "}
          <code className="bg-amber-100 px-1 rounded font-mono">login.yourbrand.com</code>) instead.
        </p>
      )}
    </div>
  );
}
