"use client";

import { useState } from "react";
import toast from "react-hot-toast";

/**
 * Phase D part 2b — the internal review panel (platform staff): verdict,
 * failure tags, notes, completed?, failure reason. English by policy.
 */
const TAGS = ["wrong_item", "wrong_modifier", "missed_correction", "unnecessary_clarification", "failed_to_clarify", "hallucination", "bad_transfer", "tool_failure", "rigid_flow", "robotic", "dead_air", "audio", "other"] as const;

export type ReviewInitial = { verdict: string; tags: string[]; notes: string | null; completed: boolean | null; failureReason: string | null; reviewerEmail: string | null; updatedAt: string } | null;

export function ReviewPanel({ callId, initial, nextCallId }: { callId: string; initial: ReviewInitial; nextCallId: string | null }) {
  const [verdict, setVerdict] = useState<string>(initial?.verdict ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [completed, setCompleted] = useState<boolean | null>(initial?.completed ?? null);
  const [failureReason, setFailureReason] = useState(initial?.failureReason ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(initial?.updatedAt ?? null);

  const toggleTag = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]));

  async function save(goNext: boolean) {
    if (!verdict) {
      toast.error("Pick Good / Bad / Unsure first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/nabil-quality/review", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ callId, verdict, tags, notes, completed, failureReason }),
      });
      const body = (await res.json().catch(() => ({}))) as { updatedAt?: string; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setSavedAt(body.updatedAt ?? new Date().toISOString());
      toast.success("Review saved");
      if (goNext && nextCallId) window.location.href = `/superadmin/nabil-quality/calls/${nextCallId}`;
    } catch (e) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  const btn = (active: boolean, tone: string) =>
    `px-3 py-1.5 rounded-lg border text-sm font-semibold ${active ? tone : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900">Internal review</div>
        {savedAt ? <div className="text-[11px] text-gray-400">saved {new Date(savedAt).toLocaleString()}{initial?.reviewerEmail ? ` · ${initial.reviewerEmail}` : ""}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn(verdict === "good", "border-emerald-300 bg-emerald-50 text-emerald-800")} onClick={() => setVerdict("good")}>Good</button>
        <button type="button" className={btn(verdict === "bad", "border-red-300 bg-red-50 text-red-800")} onClick={() => setVerdict("bad")}>Bad</button>
        <button type="button" className={btn(verdict === "unsure", "border-amber-300 bg-amber-50 text-amber-800")} onClick={() => setVerdict("unsure")}>Unsure</button>
        <span className="mx-2 text-gray-300">|</span>
        <button type="button" className={btn(completed === true, "border-emerald-300 bg-emerald-50 text-emerald-800")} onClick={() => setCompleted(completed === true ? null : true)}>Caller got what they wanted</button>
        <button type="button" className={btn(completed === false, "border-red-300 bg-red-50 text-red-800")} onClick={() => setCompleted(completed === false ? null : false)}>Did not</button>
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-600 mb-1.5">What went wrong (tags)</div>
        <div className="flex flex-wrap gap-1.5">
          {TAGS.map((t) => (
            <button key={t} type="button" onClick={() => toggleTag(t)} className={`px-2 py-0.5 rounded-full border text-[11px] font-mono ${tags.includes(t) ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-xs font-semibold text-gray-600">Failure reason (one line)</span>
        <input value={failureReason} onChange={(e) => setFailureReason(e.target.value)} maxLength={300} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="e.g. recipe half dropped when the caller corrected the size" />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-gray-600">Notes (internal; may be anonymized with the call)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" disabled={saving} onClick={() => void save(false)} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">
          {saving ? "Saving…" : "Save review"}
        </button>
        {nextCallId ? (
          <button type="button" disabled={saving} onClick={() => void save(true)} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Save &amp; next in queue →
          </button>
        ) : null}
      </div>
    </div>
  );
}
