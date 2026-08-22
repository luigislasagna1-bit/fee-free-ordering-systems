import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { reviewQueue } from "@/lib/voice/quality-analytics";
import { ReviewPanel } from "../../ReviewPanel";

/**
 * Superadmin › Nabil quality › one call (Phase D part 2b): facts, the
 * deterministic findings, the judge's verdict, provenance, the transcript,
 * and the review panel. Internal, English by policy. The transcript shown is
 * what the owner also sees on the admin call page (redacted at write).
 */
export const dynamic = "force-dynamic";

type Finding = { code: string; severity: string; turn: number | null; detail: string };
type JudgeFindings = { callerGoal?: string; goalAchieved?: boolean; confidence?: number; axes?: Record<string, number>; issues?: Array<{ severity: string; category: string; description: string; turn?: number }> };

const sevTone: Record<string, string> = { critical: "bg-red-100 text-red-800", high: "bg-orange-100 text-orange-800", medium: "bg-amber-100 text-amber-800", low: "bg-gray-100 text-gray-700", info: "bg-blue-50 text-blue-700" };

export default async function QualityCallPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformStaff();
  if (!user) redirect("/superadmin");
  const { id } = await params;
  const call = await prisma.voiceCall.findUnique({
    where: { id },
    select: {
      id: true,
      startedAt: true,
      durationSeconds: true,
      outcome: true,
      transferReason: true,
      orderNumber: true,
      quotedTotal: true,
      chargedTotal: true,
      sentiment: true,
      summary: true,
      transcript: true,
      restaurant: { select: { id: true, name: true, slug: true } },
      evaluation: true,
      provenance: true,
      review: true,
    },
  });
  if (!call) notFound();
  const ev = call.evaluation;
  const findings = (Array.isArray(ev?.findings) ? ev!.findings : []) as Finding[];
  const jf = (ev?.judgeFindings ?? null) as JudgeFindings | null;
  const transcript = (Array.isArray(call.transcript) ? call.transcript : []) as Array<{ role?: string; text?: string; turn?: number; toolName?: string }>;
  const queue = await reviewQueue({ take: 50 });
  const idx = queue.findIndex((q) => q.callId === call.id);
  const nextCallId = idx >= 0 ? (queue[idx + 1]?.callId ?? null) : (queue[0]?.callId ?? null);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <Link href="/superadmin/nabil-quality" className="text-xs text-blue-700 hover:underline">← Nabil quality</Link>
          <h1 className="text-xl font-bold text-gray-900">
            {call.restaurant.name} · {call.startedAt.toISOString().replace("T", " ").slice(0, 16)}Z · {call.durationSeconds ?? "?"}s
          </h1>
          <div className="text-xs text-gray-500 font-mono">
            outcome {call.outcome ?? "—"}{call.transferReason ? ` · end ${call.transferReason}` : ""}{call.orderNumber ? ` · ${call.orderNumber}` : ""}
            {call.quotedTotal != null ? ` · quoted ${call.quotedTotal}` : ""}{call.chargedTotal != null ? ` · charged ${call.chargedTotal}` : ""}{call.sentiment ? ` · ${call.sentiment}` : ""}
          </div>
        </div>
        <div className="flex gap-2 text-center">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2">
            <div className="text-[10px] uppercase text-gray-500">det</div>
            <div className={`text-2xl font-bold ${ev?.detScore != null && ev.detScore < 70 ? "text-red-700" : "text-gray-900"}`}>{ev?.detScore ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2">
            <div className="text-[10px] uppercase text-gray-500">judge</div>
            <div className={`text-2xl font-bold ${ev?.judgeScore != null && ev.judgeScore < 70 ? "text-red-700" : "text-gray-900"}`}>{ev?.judgeScore ?? "—"}</div>
            <div className="text-[10px] text-gray-400">{ev?.judgeStatus ?? "—"}</div>
          </div>
        </div>
      </div>

      {ev ? (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900 mb-1">Detector ({ev.evaluatorVersion})</div>
            <div className="text-xs text-gray-500 mb-2">
              {ev.failureClass ? `failure: ${ev.failureClass} · ` : ""}{ev.abandonClass ? `abandon: ${ev.abandonClass} · ` : ""}dead-air {ev.deadAirTurns} · tool errors {ev.toolErrors} · clarifications {ev.clarifications} · interrupts {ev.interrupts} · fillers {ev.fillers}
              {ev.transferStuck ? " · TRANSFER STUCK" : ""}{ev.totalsMismatch ? " · TOTALS MISMATCH" : ""}
            </div>
            <div className="text-xs text-gray-500 mb-2">review: {(Array.isArray(ev.reviewReasons) ? (ev.reviewReasons as string[]) : []).join(", ") || "—"}</div>
            <ul className="space-y-1">
              {findings.map((f, i) => (
                <li key={i} className="text-xs flex gap-2">
                  <span className={`px-1.5 rounded ${sevTone[f.severity] ?? sevTone.low}`}>{f.severity}</span>
                  <span className="font-mono">{f.code}</span>
                  {f.turn != null ? <span className="text-gray-400">@{f.turn}</span> : null}
                  <span className="text-gray-700">{f.detail}</span>
                </li>
              ))}
              {findings.length === 0 ? <li className="text-xs text-gray-400">No findings.</li> : null}
            </ul>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm font-semibold text-gray-900 mb-1">Judge {ev.judgeModel ? <span className="text-[10px] text-gray-400 font-normal">{ev.judgeModel}</span> : null}</div>
            {jf ? (
              <>
                <div className="text-xs text-gray-700 mb-1">
                  Goal: {jf.callerGoal ?? "—"} · achieved: <b>{String(jf.goalAchieved)}</b> · confidence {jf.confidence ?? "—"}
                </div>
                <div className="text-[11px] font-mono text-gray-500 mb-2">{jf.axes ? Object.entries(jf.axes).map(([k, v]) => `${k} ${v}`).join(" · ") : ""}</div>
                <ul className="space-y-1">
                  {(jf.issues ?? []).map((i, k) => (
                    <li key={k} className="text-xs flex gap-2">
                      <span className={`px-1.5 rounded ${sevTone[i.severity] ?? sevTone.low}`}>{i.severity}</span>
                      <span className="font-mono">{i.category}</span>
                      {i.turn != null ? <span className="text-gray-400">@{i.turn}</span> : null}
                      <span className="text-gray-700">{i.description}</span>
                    </li>
                  ))}
                  {(jf.issues ?? []).length === 0 ? <li className="text-xs text-gray-400">No issues.</li> : null}
                </ul>
              </>
            ) : (
              <div className="text-xs text-gray-400">{ev.judgeStatus === "skipped" ? `Skipped (${ev.judgeModel ?? ""})` : "Not judged yet."}</div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Not evaluated yet (the cron evaluates ended calls within 15 minutes).</div>
      )}

      <ReviewPanel
        callId={call.id}
        initial={
          call.review
            ? { verdict: call.review.verdict, tags: call.review.tags, notes: call.review.notes, completed: call.review.completed, failureReason: call.review.failureReason, reviewerEmail: call.review.reviewerEmail, updatedAt: call.review.updatedAt.toISOString() }
            : null
        }
        nextCallId={nextCallId}
      />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">Transcript</div>
          {call.summary ? <div className="text-xs text-gray-600 italic mb-2">{call.summary}</div> : null}
          <div className="space-y-1 text-xs max-h-[28rem] overflow-y-auto">
            {transcript.map((t, i) => (
              <div key={i} className={t.role === "user" ? "text-gray-900" : t.role === "assistant" ? "text-blue-900" : "text-gray-400 font-mono"}>
                <span className="text-gray-400 mr-1">[{t.turn ?? "?"}]</span>
                <b>{t.role === "user" ? "Caller" : t.role === "assistant" ? "Nabil" : `tool ${t.toolName ?? ""}`}:</b> {String(t.text ?? "").slice(0, 600)}
              </div>
            ))}
            {transcript.length === 0 ? <div className="text-gray-400">No transcript stored.</div> : null}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">Provenance</div>
          {call.provenance ? (
            <dl className="text-[11px] font-mono text-gray-700 space-y-0.5">
              {Object.entries({
                lane: call.provenance.channel,
                build: call.provenance.agentVersion,
                sha: call.provenance.gitSha,
                core: call.provenance.coreVersion ? `${call.provenance.coreVersion}+${call.provenance.coreContentHash ?? "?"}` : null,
                prompt: call.provenance.promptVersion,
                tools: call.provenance.toolsVersion,
                menu: call.provenance.menuSnapshotHash,
                model: call.provenance.model,
                audio: call.provenance.audioProfile ? JSON.stringify(call.provenance.audioProfile) : null,
                machine: call.provenance.flyMachineId ? `${call.provenance.flyMachineId} ${call.provenance.flyRegion ?? ""}` : null,
                app: call.provenance.appVersion,
              }).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-14 text-gray-400">{k}</dt>
                  <dd className="break-all">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="text-xs text-gray-400">No provenance row (call predates Phase B or ran on the live app before promotion).</div>
          )}
        </div>
      </div>
    </div>
  );
}
