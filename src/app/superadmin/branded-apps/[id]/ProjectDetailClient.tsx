"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Apple, Play, ShieldCheck, KeyRound, Hammer, ExternalLink } from "lucide-react";
import {
  legalTargets, ownerOfNextAction, type BrandedAppStatus,
} from "@/lib/branded-app/status";

/**
 * Superadmin — branded-app project detail (Luigi 2026-08-02). English-only.
 * Every mutation goes through PATCH /api/superadmin/branded-apps/[id] with an
 * action name; the server enforces transition legality, audits everything,
 * and never echoes credential plaintext.
 */

type PlatformRow = {
  id: string; platform: "android" | "ios"; status: BrandedAppStatus;
  packageName: string | null; storeUrl: string | null; checklist: Record<string, { done?: boolean }> | null;
  accessVerifiedAt: string | null; lastBuildAt: string | null; liveAt: string | null; nextBuildNumber: number;
};
type EventRow = {
  id: string; platform: string | null; type: string; fromStatus: string | null; toStatus: string | null;
  messageKey: string | null; detail: string | null; visibility: string; actorType: string; createdAt: string;
};
type CredRow = { id: string; kind: string; ascKeyId: string | null; appleTeamId: string | null; createdAt: string; updatedAt: string };
type Detail = {
  project: {
    id: string; appName: string | null; shortDescription: string | null; fullDescription: string | null;
    appIconUrl: string | null; primaryColorHex: string | null; useWebsiteBranding: boolean;
    supportEmail: string | null; privacyPolicyUrl: string | null; platformsRequested: string;
    approvedAt: string | null; approvedConfigVersion: number;
    restaurant: { id: string; name: string; slug: string; email: string | null; customDomain: string | null; subdomain: string | null };
    platforms: PlatformRow[]; events: EventRow[]; credentials: CredRow[];
  };
  billing: { status: string; graceEndsAt: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; stripeSubscriptionId: string | null } | null;
};

export default function ProjectDetailClient({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/superadmin/branded-apps/${projectId}`);
    if (res.ok) setData(await res.json());
  }, [projectId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const act = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/superadmin/branded-apps/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(`Failed: ${d.error ?? res.status}`);
      return false;
    }
    await refresh();
    return true;
  }, [projectId, refresh]);

  if (!data) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }
  const { project, billing } = data;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Link href="/superadmin/branded-apps" className="text-sm text-gray-500 hover:text-gray-800">← All projects</Link>
        <div className="flex items-center gap-3 mt-1">
          {project.appIconUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={project.appIconUrl} alt="" className="w-10 h-10 rounded-xl border border-gray-200 object-cover" />
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.appName ?? "(unnamed app)"}</h1>
            <div className="text-sm text-gray-500">
              <Link href={`/superadmin/restaurants/${project.restaurant.id}`} className="hover:underline">{project.restaurant.name}</Link>
              {" · "}config v{project.approvedConfigVersion}
              {" · "}billing: <span className={billing?.status === "active" ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>{billing?.status ?? "none"}</span>
              {billing && !billing.stripeSubscriptionId && billing.status === "active" && " (comp)"}
            </div>
          </div>
        </div>
      </div>

      {msg && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{msg}</div>}

      {/* Approved config snapshot */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm space-y-1.5">
        <div className="font-semibold text-gray-800 mb-1">Approved config</div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
          <div><span className="text-gray-400">Short:</span> {project.shortDescription ?? "—"}</div>
          <div><span className="text-gray-400">Support:</span> {project.supportEmail ?? "—"}</div>
          <div><span className="text-gray-400">Privacy:</span> {project.privacyPolicyUrl ?? "—"}</div>
          <div><span className="text-gray-400">Branding:</span> {project.useWebsiteBranding ? "website theme" : project.primaryColorHex ?? "—"}</div>
          <div><span className="text-gray-400">Host:</span> {project.restaurant.customDomain ?? `${project.restaurant.subdomain ?? project.restaurant.slug}.feefreeordering.com`}</div>
          <div><span className="text-gray-400">Approved:</span> {project.approvedAt ? new Date(project.approvedAt).toLocaleString() : "not yet"}</div>
        </div>
      </div>

      {/* Platform cards */}
      {project.platforms.map((row) => (
        <PlatformCard key={row.id} row={row} busy={busy} act={act} />
      ))}

      {/* Credentials */}
      <CredentialsCard creds={project.credentials} busy={busy} act={act} />

      {/* Notes + timeline */}
      <NotesCard busy={busy} act={act} />
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-800 mb-3">Timeline (internal + restaurant-visible)</div>
        <div className="space-y-2">
          {project.events.map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-xs">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.visibility === "restaurant" ? "bg-emerald-400" : "bg-gray-300"}`} />
              <div className="min-w-0">
                <span className="text-gray-700">
                  {e.type}
                  {e.fromStatus && e.toStatus && ` (${e.fromStatus} → ${e.toStatus})`}
                  {e.platform && ` · ${e.platform}`}
                  {` · ${e.actorType}`}
                  {e.visibility === "restaurant" && <span className="ml-1 text-emerald-600 font-semibold">visible</span>}
                </span>
                {e.detail && <div className="text-gray-500 italic">{e.detail}</div>}
                <div className="text-gray-400">{new Date(e.createdAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PlatformCard({ row, busy, act }: {
  row: PlatformRow; busy: boolean;
  act: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [target, setTarget] = useState<string>("");
  const [pkg, setPkg] = useState(row.packageName ?? "");
  const [url, setUrl] = useState(row.storeUrl ?? "");
  const checklist = row.checklist ?? {};
  const claimed = Object.values(checklist).filter((v) => v?.done).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        {row.platform === "ios" ? <Apple className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        <span className="font-semibold text-gray-900">{row.platform}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{row.status}</span>
        <span className="text-xs text-gray-400">next: {ownerOfNextAction(row.status)}</span>
        {row.accessVerifiedAt && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 ml-auto">
            <ShieldCheck className="w-3.5 h-3.5" /> access verified
          </span>
        )}
      </div>

      <div className="text-xs text-gray-500">
        Owner checklist claims: {claimed} step{claimed === 1 ? "" : "s"} ticked · build #{row.nextBuildNumber}
        {row.lastBuildAt && ` · last build ${new Date(row.lastBuildAt).toLocaleDateString()}`}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Status transition — constrained to legal targets; force is deliberate */}
        <select value={target} onChange={(e) => setTarget(e.target.value)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
          <option value="">Move to…</option>
          {legalTargets(row.status).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button disabled={!target || busy}
          onClick={() => void act({ action: "status", platform: row.platform, from: row.status, to: target }).then((ok) => ok && setTarget(""))}
          className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg disabled:opacity-40">
          Apply
        </button>
        {!row.accessVerifiedAt && (
          <button disabled={busy}
            onClick={() => void act({ action: "verify-access", platform: row.platform })}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg disabled:opacity-40">
            Mark access verified
          </button>
        )}
        <button disabled={busy}
          onClick={() => void act({ action: "build-recorded", platform: row.platform })}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg disabled:opacity-40">
          <Hammer className="w-3 h-3" /> Record build
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <div className="flex gap-1.5">
          <input value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="bundle / package id"
            disabled={row.status === "live"}
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono disabled:bg-gray-50" />
          <button disabled={busy || row.status === "live"}
            onClick={() => void act({ action: "package-name", platform: row.platform, value: pkg })}
            className="px-2.5 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg disabled:opacity-40">
            Set
          </button>
        </div>
        <div className="flex gap-1.5">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="store listing URL"
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          <button disabled={busy}
            onClick={() => void act({ action: "store-url", platform: row.platform, value: url })}
            className="px-2.5 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg disabled:opacity-40">
            Set
          </button>
          {row.storeUrl && (
            <a href={row.storeUrl} target="_blank" rel="noreferrer" className="p-1.5 text-gray-400 hover:text-gray-700">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CredentialsCard({ creds, busy, act }: {
  creds: CredRow[]; busy: boolean;
  act: (b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [kind, setKind] = useState("google_service_account");
  const [secret, setSecret] = useState("");
  const [ascKeyId, setAscKeyId] = useState("");
  const [ascIssuerId, setAscIssuerId] = useState("");
  const [appleTeamId, setAppleTeamId] = useState("");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <KeyRound className="w-4 h-4" /> Store credentials
        <span className="text-[11px] font-normal text-gray-400">encrypted at rest — plaintext is never shown again</span>
      </div>
      {creds.length > 0 && (
        <div className="space-y-1">
          {creds.map((c) => (
            <div key={c.id} className="text-xs text-gray-600">
              ✓ {c.kind}
              {c.ascKeyId && ` · key ${c.ascKeyId}`}
              {c.appleTeamId && ` · team ${c.appleTeamId}`}
              {" · added "}{new Date(c.createdAt).toLocaleDateString()}
            </div>
          ))}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
          <option value="google_service_account">Google service-account JSON</option>
          <option value="apple_asc_key">Apple ASC API key (.p8 contents)</option>
          <option value="android_keystore_passphrase">Android keystore passphrase</option>
        </select>
        {kind === "apple_asc_key" && (
          <div className="flex gap-1.5">
            <input value={ascKeyId} onChange={(e) => setAscKeyId(e.target.value)} placeholder="Key ID" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            <input value={ascIssuerId} onChange={(e) => setAscIssuerId(e.target.value)} placeholder="Issuer ID" className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
            <input value={appleTeamId} onChange={(e) => setAppleTeamId(e.target.value)} placeholder="Team ID" className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
          </div>
        )}
      </div>
      <textarea value={secret} onChange={(e) => setSecret(e.target.value)} rows={3}
        placeholder="Paste the secret… (stored AES-256-GCM encrypted; this box clears after save)"
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-mono" />
      <button disabled={busy || !secret}
        onClick={() => void act({ action: "credential", kind, secret, ascKeyId, ascIssuerId, appleTeamId }).then((ok) => { if (ok) setSecret(""); })}
        className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg disabled:opacity-40">
        Save credential
      </button>
    </div>
  );
}

function NotesCard({ busy, act }: { busy: boolean; act: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
      <div className="text-sm font-semibold text-gray-800">Add note</div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Internal note, or a store rejection message to record…"
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="w-3.5 h-3.5 accent-emerald-500" />
          Visible to the restaurant (shown labeled as a store/status message)
        </label>
        <button disabled={busy || !note.trim()}
          onClick={() => void act({ action: "note", detail: note, restaurantVisible: visible, messageKey: visible ? "storeResponse" : undefined }).then((ok) => { if (ok) { setNote(""); setVisible(false); } })}
          className="ml-auto px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg disabled:opacity-40">
          Save note
        </button>
      </div>
    </div>
  );
}
