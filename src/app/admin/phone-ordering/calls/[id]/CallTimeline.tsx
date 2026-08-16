import { getTranslations } from "next-intl/server";
import { AlertTriangle, Download } from "lucide-react";

/**
 * The per-call EVENT LOG rendered as a timeline (directive §25–§27), shown on
 * the call detail page under `?debug=1`. Server component, no client JS: the
 * collapsibles are plain <details>. Grouped by turn: what the caller said →
 * for each model hop: what Nabil said, tool calls (name + collapsed input),
 * tool results (ok/error chip, ms, collapsed output), cart snapshots (hash +
 * line descriptions), filler / interrupt / protected-respoken markers,
 * hallucination suspects (red), and the per-turn latency line from the `turn`
 * event. Payloads are already REDACTED at write time (event-redaction.ts) —
 * nothing here re-hides anything, so never render an unredacted source.
 */

export type TimelineEvent = {
  seq: number;
  ts: Date;
  turn: number | null;
  type: string;
  payload: unknown;
  latencyMs: number | null;
  cartHash: string | null;
};

export type TimelineVersions = {
  agentVersion: string | null;
  promptVersion: string | null;
  toolsVersion: string | null;
  model: string | null;
  menuSnapshotHash: string | null;
  eventCount: number | null;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const short = (h: string | null | undefined) => (h ? h.slice(0, 8) : "—");

function Json({ value, label }: { value: unknown; label: string }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2) ?? "";
  } catch {
    text = String(value);
  }
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-gray-500 hover:text-gray-800 select-none">{label}</summary>
      <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-gray-50 border border-gray-100 p-2 text-[11px] leading-snug text-gray-700 whitespace-pre-wrap break-words">
        {text}
      </pre>
    </details>
  );
}

function Chip({ tone, children }: { tone: "ok" | "err" | "warn" | "muted" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "err"
        ? "bg-red-100 text-red-800"
        : tone === "warn"
          ? "bg-amber-100 text-amber-900"
          : tone === "info"
            ? "bg-sky-100 text-sky-800"
            : "bg-gray-100 text-gray-600";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

/** Group events by turn, preserving first-appearance order (events without a
 *  turn go in a trailing "outside a turn" bucket keyed -1). */
function groupByTurn(events: TimelineEvent[]): Array<{ turn: number | null; events: TimelineEvent[] }> {
  const groups = new Map<number, TimelineEvent[]>();
  for (const e of events) {
    const k = e.turn ?? -1;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return [...groups.entries()].map(([k, evs]) => ({ turn: k === -1 ? null : k, events: evs }));
}

export default async function CallTimeline({
  events,
  versions,
  callId,
  interruptedTag,
  regressionHref,
}: {
  events: TimelineEvent[];
  versions: TimelineVersions;
  callId: string;
  /** Already-translated "interrupted" tag from the parent namespace. */
  interruptedTag: string;
  /** Where the "regression case" download lives — the restaurant route by
   *  default; the superadmin report page passes its own (platform-staff) URL. */
  regressionHref?: string;
}) {
  const t = await getTranslations("admin.phoneOrderingPage.callDetail.timeline");
  const groups = groupByTurn(events);

  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{t("title")}</h3>
          <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-x-4 gap-y-1 flex-wrap font-mono">
            <span>
              {t("versionsAgent")}: {versions.agentVersion ?? "—"}
            </span>
            <span>
              {t("versionsPrompt")}: {versions.promptVersion ?? "—"}
            </span>
            <span>
              {t("versionsTools")}: {versions.toolsVersion ?? "—"}
            </span>
            <span>
              {t("versionsModel")}: {versions.model ?? "—"}
            </span>
            <span>
              {t("versionsMenu")}: {versions.menuSnapshotHash ?? "—"}
            </span>
            <span>{t("eventCount", { count: versions.eventCount ?? events.length })}</span>
          </div>
        </div>
        <a
          href={regressionHref ?? `/api/admin/phone-ordering/calls/${callId}/regression-case`}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100"
          title={t("regressionHint")}
        >
          <Download className="w-3.5 h-3.5" />
          {t("regressionButton")}
        </a>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{t("empty")}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.turn ?? "none"} className="rounded-lg border border-gray-100">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {g.turn == null ? t("outsideTurn") : t("turnLabel", { n: g.turn })}
              </div>
              <ol className="divide-y divide-gray-50">
                {g.events.map((e) => (
                  <li key={e.seq} className="px-3 py-2 text-sm">
                    <EventRow e={e} t={t} interruptedTag={interruptedTag} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;

function Meta({ e }: { e: TimelineEvent }) {
  return (
    <span className="text-[10px] text-gray-400 font-mono mr-2 tabular-nums">
      #{e.seq} · {e.ts.toISOString().slice(11, 23)}
    </span>
  );
}

function EventRow({ e, t, interruptedTag }: { e: TimelineEvent; t: T; interruptedTag: string }) {
  const p = obj(e.payload);
  switch (e.type) {
    case "call_start":
      return (
        <div>
          <Meta e={e} />
          <Chip tone="info">{t("callStart")}</Chip>
          <Json value={p.versions} label={t("versionsLabel")} />
        </div>
      );
    case "asr":
      return (
        <div>
          <Meta e={e} />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mr-2">{t("callerSaid")}</span>
          {p.synthetic === true && (
            <span className="mr-2">
              <Chip tone="muted">{t("syntheticTag")}</Chip>
            </span>
          )}
          <span className="inline-block rounded-2xl bg-gray-100 px-3 py-1 text-gray-800">{s(p.text)}</span>
          {p.lang ? <span className="ml-2 text-[10px] uppercase text-gray-400">{s(p.lang)}</span> : null}
        </div>
      );
    case "model_text":
      return (
        <div>
          <Meta e={e} />
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mr-2">
            {t("nabilSaid")} · {t("hopLabel", { n: n(p.hop) ?? 0 })}
          </span>
          <span className="inline-block rounded-2xl bg-amber-100 px-3 py-1 text-amber-950">{s(p.text)}</span>
          {p.interrupted === true && <span className="ml-2 text-[10px] italic uppercase text-gray-400">· {interruptedTag}</span>}
        </div>
      );
    case "tool_use":
      return (
        <div>
          <Meta e={e} />
          <Chip tone="info">{t("toolCall")}</Chip> <span className="font-mono text-xs font-semibold text-gray-800">{s(p.name)}</span>
          <span className="ml-2 text-[10px] text-gray-400">
            {t("hopLabel", { n: n(p.hop) ?? 0 })} · cart {short(e.cartHash)}
          </span>
          <Json value={p.input} label={t("inputLabel")} />
        </div>
      );
    case "tool_result": {
      const ok = p.ok === true;
      return (
        <div>
          <Meta e={e} />
          <Chip tone={ok ? "ok" : "err"}>{ok ? t("okChip") : t("errorChip")}</Chip>{" "}
          <span className="font-mono text-xs font-semibold text-gray-800">{s(p.name)}</span>
          {!ok && p.code ? <span className="ml-1 font-mono text-[11px] text-red-700">{s(p.code)}</span> : null}
          <span className="ml-2 text-[10px] text-gray-400 tabular-nums">
            {e.latencyMs != null ? `${e.latencyMs} ms` : ""} · cart {short(e.cartHash)}
          </span>
          <Json value={p.output} label={t("outputLabel")} />
        </div>
      );
    }
    case "cart": {
      const lines = Array.isArray(p.lines) ? (p.lines as unknown[]) : [];
      const problems = Array.isArray(p.problems) ? (p.problems as unknown[]) : [];
      return (
        <div>
          <Meta e={e} />
          <Chip tone="muted">{t("cartLabel")}</Chip> <span className="font-mono text-[11px] text-gray-500">{short(s(p.hash))}</span>
          {lines.length === 0 ? (
            <div className="text-xs text-gray-400 italic mt-1">{t("cartEmpty")}</div>
          ) : (
            <ul className="mt-1 ml-4 list-disc text-xs text-gray-700 space-y-0.5">
              {lines.map((l, i) => {
                const lo = obj(l);
                const picks = Array.isArray(lo.picks) ? (lo.picks as unknown[]) : [];
                return (
                  <li key={i}>
                    {n(lo.quantity) != null ? `${n(lo.quantity)} × ` : ""}
                    {s(lo.description)}
                    {lo.status === "needs_info" && (
                      <span className="ml-1">
                        <Chip tone="warn">{t("needsInfo")}</Chip>
                      </span>
                    )}
                    {picks.length > 0 && (
                      <ul className="ml-4 list-[circle] text-gray-500">
                        {picks.map((pk, j) => (
                          <li key={j}>{s(obj(pk).description)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {problems.length > 0 && (
            <div className="mt-1 text-xs text-red-700">
              {t("problemsLabel")}: {problems.map((pr) => s(obj(pr).message) || s(obj(pr).code)).join(" · ")}
            </div>
          )}
        </div>
      );
    }
    case "filler":
      return (
        <div className="text-xs text-gray-500">
          <Meta e={e} />
          <Chip tone="muted">{t("fillerLabel", { ms: e.latencyMs ?? 0 })}</Chip> <span className="italic">“{s(p.phrase)}”</span>
          {p.tool ? <span className="ml-1 font-mono text-[10px]">({s(p.tool)})</span> : null}
        </div>
      );
    case "interrupt":
      return (
        <div className="text-xs text-gray-500">
          <Meta e={e} />
          <Chip tone="warn">{t("interruptLabel")}</Chip>
          {p.heard ? <span className="ml-1">“{s(p.heard)}”</span> : null}
          {p.stale === true && <span className="ml-1 text-gray-400">· {t("interruptStale")}</span>}
          {p.duringProtected === true && <span className="ml-1 text-gray-400">· {t("interruptProtected")}</span>}
        </div>
      );
    case "protected_respoken":
      return (
        <div className="text-xs text-gray-500">
          <Meta e={e} />
          <Chip tone="warn">{t("respokenLabel")}</Chip> <span className="italic">“{s(p.text)}”</span>
        </div>
      );
    case "compaction":
      return (
        <div className="text-xs text-gray-500">
          <Meta e={e} />
          <Chip tone="muted">
            {t("compactionLabel", { dropped: n(p.droppedMessages) ?? 0, before: n(p.bytesBefore) ?? 0, after: n(p.bytesAfter) ?? 0 })}
          </Chip>
        </div>
      );
    case "cache_miss":
      return (
        <div className="text-xs text-gray-500">
          <Meta e={e} />
          <Chip tone="warn">{t("cacheMissLabel", { request: n(p.request) ?? 0, uncached: n(p.uncached) ?? 0 })}</Chip>
        </div>
      );
    case "hallucination_suspect":
      return (
        <div className="text-xs">
          <Meta e={e} />
          <Chip tone="err">
            <AlertTriangle className="inline w-3 h-3 mr-1 -mt-0.5" />
            {t("hallucinationLabel")} · {s(p.kind)}
          </Chip>{" "}
          <span className="text-red-800">“{s(p.sentence)}”</span>
          {Array.isArray(p.evidence) && p.evidence.length > 0 && <Json value={p.evidence} label={t("evidenceLabel")} />}
        </div>
      );
    case "turn": {
      const hops = Array.isArray(p.hops) ? (p.hops as unknown[]).map(obj) : [];
      const tools = Array.isArray(p.tools) ? (p.tools as unknown[]).map(obj) : [];
      const toolMs = tools.reduce((a, x) => a + (n(x.ms) ?? 0), 0);
      let inTok = 0;
      let cacheRead = 0;
      let cacheWrite = 0;
      for (const h of hops) {
        inTok += n(h.tokensIn) ?? 0;
        cacheRead += n(h.cacheRead) ?? 0;
        cacheWrite += n(h.cacheWrite) ?? 0;
      }
      const denom = inTok + cacheRead + cacheWrite;
      const cachePct = denom > 0 ? Math.round((cacheRead / denom) * 100) : null;
      return (
        <div className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
          <Meta e={e} />
          <Chip tone="info">{t("latencyTtfa", { ms: e.latencyMs ?? 0 })}</Chip>
          {hops.map((h, i) => (
            <Chip key={i} tone="muted">
              {t("latencyHop", { n: n(h.hop) ?? i + 1, ms: n(h.ttftMs) ?? 0 })}
            </Chip>
          ))}
          <Chip tone="muted">{t("latencyTools", { ms: toolMs })}</Chip>
          {cachePct != null && <Chip tone={cachePct >= 50 ? "ok" : "warn"}>{t("latencyCache", { pct: cachePct })}</Chip>}
          {p.interrupted === true && <Chip tone="warn">{interruptedTag}</Chip>}
        </div>
      );
    }
    case "call_end":
      return (
        <div>
          <Meta e={e} />
          <Chip tone="info">{t("callEnd")}</Chip> <span className="font-mono text-xs">{s(p.outcome)}</span>
          <Json value={{ latency: p.latency, usage: p.usage }} label={t("latencyLabel")} />
        </div>
      );
    case "error":
      return (
        <div className="text-xs">
          <Meta e={e} />
          <Chip tone="err">{t("errorLabel", { where: s(p.where) })}</Chip> <span className="text-red-800">{s(p.message)}</span>
        </div>
      );
    default:
      return (
        <div className="text-xs text-gray-500">
          <Meta e={e} />
          <Chip tone="muted">{e.type}</Chip>
          <Json value={p} label={t("payloadLabel")} />
        </div>
      );
  }
}
