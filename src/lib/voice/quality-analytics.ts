import prisma from "@/lib/db";

/**
 * Nabil QUALITY analytics (Phase D part 2c) — one GROUP BY over the
 * VoiceCallEvaluation side table (denormalised keys) for the superadmin
 * quality page. Read-only; bounded windows; no PII.
 */
export type QualityGroup = {
  key: string;
  calls: number;
  scored: number;
  avgDet: number | null;
  avgJudge: number | null;
  judged: number;
  needsReview: number;
  transferStuck: number;
  totalsMismatch: number;
  deadAirTurns: number;
  reviewedBad: number;
};

export type QualitySummary = {
  sinceIso: string;
  total: QualityGroup;
  byChannel: QualityGroup[];
  byCoreVersion: QualityGroup[];
  byDay: Array<{ day: string; calls: number; avgDet: number | null; needsReview: number }>;
  abandonClasses: Array<{ abandonClass: string; calls: number }>;
  topFindings: Array<{ code: string; calls: number }>;
};

type Row = {
  channel: string | null;
  coreVersion: string | null;
  detScore: number | null;
  judgeScore: number | null;
  judgeStatus: string;
  needsReview: boolean;
  transferStuck: boolean;
  totalsMismatch: boolean;
  deadAirTurns: number;
  abandonClass: string | null;
  findings: unknown;
  evaluatedAt: Date;
  call: { review: { verdict: string } | null };
};

function aggregate(key: string, rows: Row[]): QualityGroup {
  const scored = rows.filter((r) => r.detScore !== null);
  const judged = rows.filter((r) => r.judgeStatus === "done" && r.judgeScore !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    key,
    calls: rows.length,
    scored: scored.length,
    avgDet: avg(scored.map((r) => r.detScore as number)),
    avgJudge: avg(judged.map((r) => r.judgeScore as number)),
    judged: judged.length,
    needsReview: rows.filter((r) => r.needsReview).length,
    transferStuck: rows.filter((r) => r.transferStuck).length,
    totalsMismatch: rows.filter((r) => r.totalsMismatch).length,
    deadAirTurns: rows.reduce((a, r) => a + r.deadAirTurns, 0),
    reviewedBad: rows.filter((r) => r.call.review?.verdict === "bad").length,
  };
}

const MAX_ROWS = 5_000;

export async function qualitySummary(opts: { sinceDays?: number; restaurantId?: string } = {}): Promise<QualitySummary> {
  const since = new Date(Date.now() - (opts.sinceDays ?? 14) * 24 * 3600_000);
  const rows = (await prisma.voiceCallEvaluation.findMany({
    where: { evaluatedAt: { gte: since }, ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}) },
    select: {
      channel: true,
      coreVersion: true,
      detScore: true,
      judgeScore: true,
      judgeStatus: true,
      needsReview: true,
      transferStuck: true,
      totalsMismatch: true,
      deadAirTurns: true,
      abandonClass: true,
      findings: true,
      evaluatedAt: true,
      call: { select: { review: { select: { verdict: true } } } },
    },
    orderBy: { evaluatedAt: "desc" },
    take: MAX_ROWS,
  })) as Row[];

  const groupBy = (f: (r: Row) => string) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = f(r);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].map(([k, rs]) => aggregate(k, rs)).sort((a, b) => b.calls - a.calls);
  };
  const byDayMap = new Map<string, Row[]>();
  for (const r of rows) {
    const d = r.evaluatedAt.toISOString().slice(0, 10);
    byDayMap.set(d, [...(byDayMap.get(d) ?? []), r]);
  }
  const abandon = new Map<string, number>();
  const findings = new Map<string, number>();
  for (const r of rows) {
    if (r.abandonClass) abandon.set(r.abandonClass, (abandon.get(r.abandonClass) ?? 0) + 1);
    const codes = new Set(((Array.isArray(r.findings) ? r.findings : []) as Array<{ code?: string }>).map((f) => String(f.code ?? "")).filter(Boolean));
    for (const c of codes) findings.set(c, (findings.get(c) ?? 0) + 1);
  }
  return {
    sinceIso: since.toISOString(),
    total: aggregate("all", rows),
    byChannel: groupBy((r) => r.channel ?? "unknown (pre-provenance)"),
    byCoreVersion: groupBy((r) => r.coreVersion ?? "unknown (pre-provenance)"),
    byDay: [...byDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, rs]) => {
        const g = aggregate(day, rs);
        return { day, calls: g.calls, avgDet: g.avgDet, needsReview: g.needsReview };
      }),
    abandonClasses: [...abandon.entries()].sort((a, b) => b[1] - a[1]).map(([abandonClass, calls]) => ({ abandonClass, calls })),
    topFindings: [...findings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([code, calls]) => ({ code, calls })),
  };
}

export type QueueItem = {
  callId: string;
  restaurantName: string;
  startedAt: Date;
  durationSeconds: number | null;
  outcome: string | null;
  channel: string | null;
  detScore: number | null;
  judgeScore: number | null;
  reviewReasons: string[];
  topFinding: string | null;
  severityRank: number;
};

/** Calls flagged for review and not yet reviewed — most severe first. */
export async function reviewQueue(opts: { take?: number; restaurantId?: string } = {}): Promise<QueueItem[]> {
  const rows = await prisma.voiceCallEvaluation.findMany({
    where: { needsReview: true, call: { review: null }, ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}) },
    select: {
      callId: true,
      channel: true,
      detScore: true,
      judgeScore: true,
      reviewReasons: true,
      findings: true,
      transferStuck: true,
      totalsMismatch: true,
      call: { select: { startedAt: true, durationSeconds: true, outcome: true, restaurant: { select: { name: true } } } },
    },
    orderBy: { evaluatedAt: "desc" },
    take: Math.min(200, (opts.take ?? 50) * 4),
  });
  const items: QueueItem[] = rows.map((r) => {
    const reasons = (Array.isArray(r.reviewReasons) ? r.reviewReasons : []) as string[];
    const findings = (Array.isArray(r.findings) ? r.findings : []) as Array<{ code: string; severity: string }>;
    const severityRank = r.totalsMismatch ? 0 : r.transferStuck ? 1 : findings.some((f) => f.severity === "critical") ? 2 : reasons.includes("judge_issue") ? 3 : reasons.includes("outcome_error") ? 4 : 5;
    return {
      callId: r.callId,
      restaurantName: r.call.restaurant.name,
      startedAt: r.call.startedAt,
      durationSeconds: r.call.durationSeconds,
      outcome: r.call.outcome,
      channel: r.channel,
      detScore: r.detScore,
      judgeScore: r.judgeScore,
      reviewReasons: reasons,
      topFinding: findings[0]?.code ?? null,
      severityRank,
    };
  });
  return items.sort((a, b) => a.severityRank - b.severityRank || b.startedAt.getTime() - a.startedAt.getTime()).slice(0, opts.take ?? 50);
}
