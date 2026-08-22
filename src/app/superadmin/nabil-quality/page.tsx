import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform-auth";
import { qualitySummary, reviewQueue, type QualityGroup } from "@/lib/voice/quality-analytics";

/**
 * Superadmin › Nabil quality (Phase D part 2c). Internal, English by policy.
 * One GROUP BY over VoiceCallEvaluation: by lane, by Core version, by day,
 * plus the review queue (most severe first). Everything here is model-free
 * unless marked "judge".
 */
export const dynamic = "force-dynamic";

function n(v: number | null | undefined) {
  return v === null || v === undefined ? "—" : String(v);
}

function GroupTable({ title, rows }: { title: string; rows: QualityGroup[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-semibold text-gray-900 mb-2">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-3">key</th>
              <th className="py-1 pr-3">calls</th>
              <th className="py-1 pr-3">avg det</th>
              <th className="py-1 pr-3">avg judge (n)</th>
              <th className="py-1 pr-3">needs review</th>
              <th className="py-1 pr-3">dead-air turns</th>
              <th className="py-1 pr-3">stuck transfers</th>
              <th className="py-1 pr-3">totals ≠</th>
              <th className="py-1 pr-3">reviewed bad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-gray-100">
                <td className="py-1 pr-3 font-mono">{r.key}</td>
                <td className="py-1 pr-3">{r.calls}</td>
                <td className={`py-1 pr-3 font-semibold ${r.avgDet !== null && r.avgDet < 70 ? "text-red-700" : "text-gray-900"}`}>{n(r.avgDet)}</td>
                <td className="py-1 pr-3">{n(r.avgJudge)} ({r.judged})</td>
                <td className="py-1 pr-3">{r.needsReview}</td>
                <td className="py-1 pr-3">{r.deadAirTurns}</td>
                <td className={`py-1 pr-3 ${r.transferStuck ? "text-red-700 font-semibold" : ""}`}>{r.transferStuck}</td>
                <td className={`py-1 pr-3 ${r.totalsMismatch ? "text-red-700 font-semibold" : ""}`}>{r.totalsMismatch}</td>
                <td className="py-1 pr-3">{r.reviewedBad}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="py-2 text-gray-400" colSpan={9}>No evaluated calls in this window yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function NabilQualityPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requirePlatformStaff();
  if (!user) redirect("/superadmin");
  const sp = await searchParams;
  const days = Math.max(1, Math.min(90, Number(sp.days) || 14));
  const [summary, queue] = await Promise.all([qualitySummary({ sinceDays: days }), reviewQueue({ take: 50 })]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nabil quality</h1>
          <p className="text-xs text-gray-500">Automatic evaluation of every call since {summary.sinceIso.slice(0, 10)} · det = model-free score · judge = Opus 5 on engaged calls</p>
        </div>
        <div className="flex gap-1 text-xs">
          {[7, 14, 30, 90].map((d) => (
            <Link key={d} href={`/superadmin/nabil-quality?days=${d}`} className={`px-2.5 py-1 rounded-lg border ${d === days ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 bg-white text-gray-700"}`}>
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          ["calls", summary.total.calls],
          ["avg det", n(summary.total.avgDet)],
          ["avg judge", `${n(summary.total.avgJudge)} (${summary.total.judged})`],
          ["needs review", summary.total.needsReview],
          ["stuck transfers", summary.total.transferStuck],
          ["dead-air turns", summary.total.deadAirTurns],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">{k}</div>
            <div className="text-xl font-bold text-gray-900">{String(v)}</div>
          </div>
        ))}
      </div>

      <GroupTable title="By lane (channel)" rows={summary.byChannel} />
      <GroupTable title="By Core version" rows={summary.byCoreVersion} />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">By day</div>
          <table className="w-full text-xs">
            <tbody>
              {summary.byDay.map((d) => (
                <tr key={d.day} className="border-t border-gray-100">
                  <td className="py-1 font-mono">{d.day}</td>
                  <td className="py-1">{d.calls}</td>
                  <td className={`py-1 font-semibold ${d.avgDet !== null && d.avgDet < 70 ? "text-red-700" : ""}`}>{n(d.avgDet)}</td>
                  <td className="py-1 text-gray-500">{d.needsReview} review</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">Why calls end early</div>
          <table className="w-full text-xs">
            <tbody>
              {summary.abandonClasses.map((a) => (
                <tr key={a.abandonClass} className="border-t border-gray-100">
                  <td className="py-1 font-mono">{a.abandonClass}</td>
                  <td className="py-1 text-right">{a.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-sm font-semibold text-gray-900 mb-2">Top findings (calls)</div>
          <table className="w-full text-xs">
            <tbody>
              {summary.topFindings.map((f) => (
                <tr key={f.code} className="border-t border-gray-100">
                  <td className="py-1 font-mono">{f.code}</td>
                  <td className="py-1 text-right">{f.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900 mb-2">Review queue — {queue.length} flagged, most severe first</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-3">when</th>
                <th className="py-1 pr-3">store</th>
                <th className="py-1 pr-3">lane</th>
                <th className="py-1 pr-3">outcome</th>
                <th className="py-1 pr-3">det</th>
                <th className="py-1 pr-3">judge</th>
                <th className="py-1 pr-3">why</th>
                <th className="py-1 pr-3">top finding</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((q) => (
                <tr key={q.callId} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="py-1 pr-3 whitespace-nowrap">
                    <Link href={`/superadmin/nabil-quality/calls/${q.callId}`} className="text-blue-700 hover:underline">
                      {q.startedAt.toISOString().slice(5, 16).replace("T", " ")}
                    </Link>{" "}
                    <span className="text-gray-400">{q.durationSeconds ?? "?"}s</span>
                  </td>
                  <td className="py-1 pr-3">{q.restaurantName}</td>
                  <td className="py-1 pr-3 font-mono">{q.channel ?? "—"}</td>
                  <td className="py-1 pr-3 font-mono">{q.outcome ?? "—"}</td>
                  <td className="py-1 pr-3">{n(q.detScore)}</td>
                  <td className="py-1 pr-3">{n(q.judgeScore)}</td>
                  <td className="py-1 pr-3 font-mono text-gray-600">{q.reviewReasons.join(", ")}</td>
                  <td className="py-1 pr-3 font-mono text-gray-600">{q.topFinding ?? "—"}</td>
                </tr>
              ))}
              {queue.length === 0 ? (
                <tr>
                  <td className="py-2 text-gray-400" colSpan={8}>Nothing waiting for review.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
