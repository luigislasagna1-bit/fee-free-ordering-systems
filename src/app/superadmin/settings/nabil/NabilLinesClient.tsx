"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, PhoneCall, RefreshCw, Wrench } from "lucide-react";
import type { VoiceLineRow, VoiceLinesResponse } from "@/lib/voice/voice-lines";

/**
 * Superadmin › Nabil Phone Lines (English-only by policy — superadmin surface).
 *
 * One row per provisioned Nabil number: what Twilio has registered vs what
 * this deployment intends, the drift, and who each fallback layer would ring.
 * "Repair" writes ONLY the two voice URLs + their methods on the number
 * (see src/lib/voice/twilio-number-config.ts) and is idempotent.
 */

function Chip({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800"
        : tone === "bad"
          ? "bg-rose-100 text-rose-700"
          : "bg-gray-100 text-gray-500";
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

function EnvChip({ label, present }: { label: string; present: boolean }) {
  return (
    <Chip tone={present ? "ok" : "warn"}>
      {present ? "●" : "○"} {label}
    </Chip>
  );
}

function UrlCell({ current, intended }: { current: string | null; intended: string | null }) {
  if (intended === null) return <span className="text-xs text-gray-400">— (nothing to register)</span>;
  const ok = (current || "") === intended;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
        <code className="text-[11px] break-all">{current || <span className="text-rose-600 font-semibold">not set</span>}</code>
      </div>
      {!ok && (
        <div className="text-[11px] text-gray-500">
          should be <code className="break-all">{intended}</code>
        </div>
      )}
    </div>
  );
}

function verdict(row: VoiceLineRow): { tone: "ok" | "warn" | "bad" | "muted"; label: string } {
  if (row.twilioState === "not_configured") return { tone: "muted", label: "Twilio creds missing here" };
  if (row.twilioState === "not_found") return { tone: "bad", label: "not on this Twilio account" };
  if (row.drift.length) return { tone: "warn", label: `drift: ${row.drift.join(", ")}` };
  return { tone: "ok", label: "healthy" };
}

export function NabilLinesClient() {
  const [data, setData] = useState<VoiceLinesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/voice-numbers", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData((await res.json()) as VoiceLinesResponse);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Lane switch (Luigi 2026-08-22: nothing reaches the live line untested).
  // "staging" sends this number's calls to nabil-voice-staging — only ever a
  // test line. Moving the PUBLIC number to staging is the one thing this
  // control must make hard, hence the explicit confirm naming the number.
  const [switching, setSwitching] = useState<string | null>(null);
  const setLane = async (row: VoiceLineRow, voiceChannel: "current" | "staging") => {
    if (voiceChannel === row.voiceChannel) return;
    const warn =
      voiceChannel === "staging"
        ? `Send ALL calls to ${row.phoneNumber} (${row.restaurant.name}) to the STAGING build?\n\nOnly do this for a test line — real customers on this number would reach unpromoted code.`
        : `Move ${row.phoneNumber} back to the LIVE lane?`;
    if (!window.confirm(warn)) return;
    setSwitching(row.id);
    try {
      const res = await fetch("/api/superadmin/voice-numbers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, voiceChannel }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; changed?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(body.changed ? `${row.phoneNumber} → ${voiceChannel} lane` : "No change");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Lane change failed");
    }
    setSwitching(null);
  };

  const repair = async (row: VoiceLineRow) => {
    const what = row.drift.length ? row.drift.join(", ") : "nothing (already correct — this just re-checks)";
    if (!window.confirm(`Repair ${row.phoneNumber} on Twilio?\n\nThis writes: ${what}.\nOnly the two voice URLs + methods are touched.`)) return;
    setRepairing(row.id);
    try {
      const res = await fetch("/api/superadmin/voice-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; changed?: string[]; error?: string; sidBackfilled?: boolean };
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      toast.success(body.changed?.length ? `Repaired: ${body.changed.join(", ")}` : "Already correct — nothing changed");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Repair failed");
    }
    setRepairing(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PhoneCall className="w-6 h-6 text-emerald-600" /> Nabil Phone Lines
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            What Twilio has registered on each Nabil number vs. what this deployment expects: the voice webhook
            (<code>/api/twilio/voice</code>) and the <strong>&ldquo;PRIMARY HANDLER FAILS&rdquo;</strong> fallback on Fly
            (<code>/twiml/fallback</code>), plus who each safety layer would ring if Nabil can&apos;t take the call.
            <strong> Repair</strong> writes only those two URLs and their methods, and is safe to press twice.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Re-check
        </button>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500 font-semibold mr-1">This deployment:</span>
          <EnvChip label="Twilio credentials" present={data.env.twilioCredentials} />
          <EnvChip label="NABIL_VOICE_WSS_URL" present={data.env.voiceWssUrl} />
          <EnvChip label="NABIL_VOICE_STAGING_WSS_URL (staging lane)" present={data.env.voiceStagingWssUrl} />
          <EnvChip label="NABIL_FALLBACK_MAP" present={data.env.fallbackMap} />
          <EnvChip label="NABIL_FALLBACK_DEFAULT_NUMBER" present={data.env.fallbackDefaultNumber} />
          <span className="text-gray-400 ml-2">checked {new Date(data.generatedAt).toLocaleTimeString()}</span>
        </div>
      )}

      {data && !data.env.twilioCredentials && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Twilio credentials (<code>FFOS_TWILIO_ACCOUNT_SID</code> / <code>FFOS_TWILIO_AUTH_TOKEN</code>) are not set on
          this deployment — showing intended values only; Repair is disabled.
        </div>
      )}

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-3 py-2">Number</th>
              <th className="text-left px-3 py-2">Restaurant</th>
              <th className="text-left px-3 py-2">Voice webhook (Vercel)</th>
              <th className="text-left px-3 py-2">Fallback (Fly)</th>
              <th className="text-left px-3 py-2">If Nabil fails, ring…</th>
              <th className="text-left px-3 py-2">Verdict</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && !data && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  Asking Twilio…
                </td>
              </tr>
            )}
            {data && data.numbers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  No provisioned Nabil numbers.
                </td>
              </tr>
            )}
            {data?.numbers.map((row) => {
              const v = verdict(row);
              const noHuman = !row.layers.flyFeed.dial && !row.layers.safetyNet.dial;
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="font-mono font-semibold">{row.phoneNumber}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Chip tone={row.status === "active" ? "ok" : "muted"}>{row.status}</Chip>
                      <Chip tone={row.enabled ? "ok" : "muted"}>{row.enabled ? "agent on" : "agent off"}</Chip>
                      {row.isDemo && <Chip tone="warn">DEMO</Chip>}
                      <Chip tone={row.voiceChannel === "staging" ? "warn" : "ok"}>{row.voiceChannel === "staging" ? "STAGING lane" : "live lane"}</Chip>
                      <Chip tone={row.twilioNumberSid ? "muted" : "warn"}>{row.twilioNumberSid ? row.twilioNumberSid : "no SID yet"}</Chip>
                    </div>
                    <label className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                      lane
                      <select
                        value={row.voiceChannel === "staging" ? "staging" : "current"}
                        disabled={switching === row.id || (row.voiceChannel !== "staging" && !data?.env.voiceStagingWssUrl)}
                        onChange={(e) => void setLane(row, e.target.value === "staging" ? "staging" : "current")}
                        className="text-[11px] border border-gray-200 rounded px-1 py-0.5 bg-white"
                        title={!data?.env.voiceStagingWssUrl ? "Set NABIL_VOICE_STAGING_WSS_URL on this deployment to enable the staging lane" : undefined}
                      >
                        <option value="current">live (nabil-voice)</option>
                        <option value="staging">staging (nabil-voice-staging)</option>
                      </select>
                    </label>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-gray-900">{row.restaurant.name}</div>
                    <div className="text-xs text-gray-400">{row.restaurant.slug}</div>
                  </td>
                  <td className="px-3 py-3 max-w-[16rem]">
                    <UrlCell current={row.current?.voiceUrl ?? null} intended={row.intended.voiceUrl} />
                    {row.current && (row.current.voiceMethod || "").toUpperCase() !== "POST" && (
                      <div className="text-[11px] text-amber-700 mt-0.5">method {row.current.voiceMethod || "unset"} → POST</div>
                    )}
                  </td>
                  <td className="px-3 py-3 max-w-[16rem]">
                    <UrlCell current={row.current?.voiceFallbackUrl ?? null} intended={row.intended.voiceFallbackUrl} />
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div>
                      <span className="text-gray-500">Fly feed:</span>{" "}
                      {row.layers.flyFeed.dial ? (
                        <>
                          <span className="font-mono">{row.layers.flyFeed.dial}</span>{" "}
                          <span className="text-gray-400">({row.layers.flyFeed.source})</span>
                        </>
                      ) : (
                        <span className="text-rose-600 font-semibold">none</span>
                      )}
                    </div>
                    <div className="mt-0.5">
                      <span className="text-gray-500">Vercel safety net:</span>{" "}
                      {row.layers.safetyNet.dial ? (
                        <>
                          <span className="font-mono">{row.layers.safetyNet.dial}</span>{" "}
                          <span className="text-gray-400">({row.layers.safetyNet.source})</span>
                        </>
                      ) : (
                        <span className="text-rose-600 font-semibold">none — apology only</span>
                      )}
                    </div>
                    {noHuman && (
                      <div className="mt-1">
                        <Chip tone="bad">no human to ring</Chip>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Chip tone={v.tone}>{v.label}</Chip>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => void repair(row)}
                      disabled={repairing === row.id || row.twilioState !== "ok"}
                      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-40"
                    >
                      <Wrench className="w-3.5 h-3.5" /> {repairing === row.id ? "Repairing…" : row.drift.length ? "Repair" : "Re-apply"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 max-w-3xl">
        Layers, in order: Twilio → <code>/api/twilio/voice</code> (Vercel). If that throws, the Vercel safety net answers with a
        <code> &lt;Dial&gt;</code> to the number above. If Vercel can&apos;t answer at all, Twilio calls the Fly fallback, which dials
        the &ldquo;Fly feed&rdquo; number (transfer number → alert phone → store phone). Both layers must show a number for the
        promise &ldquo;if anything on our side fails, your phone rings&rdquo; to be true.
      </p>
    </div>
  );
}
