/**
 * REPORT WRITER — one JSON (everything) + one Markdown summary per batch.
 * The Markdown is what a human reads after a run: totals, per-scenario
 * pass/fail with the first reason, failure clusters by taxonomy × first
 * reason, the slowest turns, and cost.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Scenario, ScenarioReport } from "./scenario-types";
import type { SimMetrics } from "./metrics";

export type ReportInput = {
  reports: ScenarioReport[];
  metrics: SimMetrics;
  args: Record<string, unknown>;
  /** Scenario definitions, for taxonomy / title lookups (optional). */
  scenarios?: Scenario[];
  generatedAt?: string;
};

const pctStr = (x: number) => `${(x * 100).toFixed(1)}%`;
const ms = (x: number | null) => (x === null ? "–" : `${Math.round(x)} ms`);
const cents = (c: number) => `$${(c / 100).toFixed(2)}`;
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** Bucket a failure reason so similar failures cluster ("cart mismatch", "never said", …). */
export function reasonBucket(reason: string): string {
  const r = reason.toLowerCase();
  if (r.startsWith("cart mismatch")) return "cart mismatch";
  if (r.includes("not placed")) return "not placed";
  if (r.includes("placed but mustplace")) return "placed when it must not";
  if (r.includes("orders were placed")) return "double placement";
  if (r.startsWith("expected a clarification")) return "no clarification";
  if (r.startsWith("said something forbidden")) return "forbidden phrase";
  if (r.startsWith("never said")) return "required phrase missing";
  if (r.startsWith("disallowed tool")) return "disallowed tool";
  if (r.startsWith("fulfilment") || r.startsWith("address")) return "fulfilment";
  if (r.startsWith("customer")) return "customer";
  if (r.includes("did not finish") || r.includes("no reply")) return "stuck / timeout";
  if (r.startsWith("call ended by agent")) return "agent ended call";
  if (r.startsWith("total ")) return "total";
  if (r.includes("tool errors")) return "tool errors";
  if (r.startsWith("caller gave up")) return "caller gave up";
  return reason.split(":")[0].slice(0, 40);
}

export function renderMarkdown(input: ReportInput): string {
  const { reports, metrics: m, args } = input;
  const scnById = new Map((input.scenarios ?? []).map((s) => [s.id, s]));
  const lines: string[] = [];
  lines.push(`# Nabil simulation report`);
  lines.push("");
  lines.push(`Generated ${input.generatedAt ?? new Date().toISOString()} · args: \`${esc(JSON.stringify(args))}\``);
  lines.push("");
  lines.push(`## Totals`);
  lines.push("");
  lines.push(`| metric | value |`);
  lines.push(`|---|---|`);
  lines.push(`| scenarios × runs | ${m.scenarios} × ${m.runs / Math.max(1, m.scenarios)} = ${m.runs} |`);
  lines.push(`| pass rate | ${pctStr(m.passRate)} |`);
  lines.push(`| exact-cart accuracy | ${pctStr(m.exactCartAccuracy)} |`);
  lines.push(`| item accuracy | ${pctStr(m.itemAccuracy)} |`);
  lines.push(`| modifier accuracy | ${pctStr(m.modifierAccuracy)} |`);
  lines.push(`| half-side accuracy | ${pctStr(m.halfSideAccuracy)} |`);
  lines.push(`| combo-slot accuracy | ${pctStr(m.comboSlotAccuracy)} |`);
  lines.push(`| completion (placed) | ${pctStr(m.completionRate)} |`);
  lines.push(`| wrong placement | ${pctStr(m.wrongPlacementRate)} |`);
  lines.push(`| tool failure rate | ${pctStr(m.toolFailureRate)} |`);
  lines.push(`| hallucination-flag rate | ${pctStr(m.hallucinationRate)} |`);
  lines.push(`| clarification precision | ${pctStr(m.clarificationPrecision)} |`);
  lines.push(`| escalation rate | ${pctStr(m.escalationRate)} |`);
  lines.push(`| TTFA p50 / p95 | ${ms(m.ttftP50)} / ${ms(m.ttftP95)} |`);
  lines.push(`| tool p95 | ${ms(m.toolP95)} |`);
  lines.push(`| turns / scenario | ${m.turnsPerScenario.toFixed(1)} |`);
  lines.push(`| cost / scenario · total | ${cents(m.costPerScenarioCents)} · ${cents(m.totalCostCents)} |`);
  lines.push(`| model ¢ per est. call-minute (budget 30¢ ⇒ ≤40¢ all-in with Twilio) | ${m.modelCentsPerEstMinute.toFixed(1)}¢ ${m.modelCentsPerEstMinute > 30 ? "🔴 OVER BUDGET" : "🟢"} |`);
  lines.push(`| flaky | ${m.flakyIds.length ? m.flakyIds.join(", ") : "none"} |`);
  lines.push(`| failed | ${m.failedIds.length ? m.failedIds.join(", ") : "none"} |`);
  lines.push("");

  lines.push(`## Per scenario`);
  lines.push("");
  lines.push(`| id | run | pass | placed | cart | turns | TTFA p95 | cost | first reason |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const r of [...reports].sort((a, b) => a.id.localeCompare(b.id) || a.run - b.run)) {
    lines.push(
      `| ${r.id} | ${r.run} | ${r.pass ? "✅" : "❌"} | ${r.placed ? "yes" : "no"} | ${r.cartDiff.exact ? "exact" : `${r.cartDiff.matched}/${r.cartDiff.items.total} +${r.cartDiff.extra.length}`} | ${r.turns.length} | ${ms(r.latency.ttftP95)} | ${cents(r.costCents)} | ${esc(r.reasons[0] ?? "")} |`,
    );
  }
  lines.push("");

  const failed = reports.filter((r) => !r.pass);
  lines.push(`## Failure clusters (taxonomy × first reason)`);
  lines.push("");
  if (!failed.length) lines.push("None — every run passed.");
  else {
    const clusters = new Map<string, string[]>();
    for (const r of failed) {
      const tax = (scnById.get(r.id)?.taxonomy ?? ["?"]).join("/");
      const key = `${tax} × ${reasonBucket(r.reasons[0] ?? "unknown")}`;
      clusters.set(key, [...(clusters.get(key) ?? []), `${r.id}#${r.run}`]);
    }
    lines.push(`| cluster | count | runs |`);
    lines.push(`|---|---|---|`);
    for (const [k, v] of [...clusters.entries()].sort((a, b) => b[1].length - a[1].length)) lines.push(`| ${esc(k)} | ${v.length} | ${v.join(", ")} |`);
  }
  lines.push("");

  if ((input.scenarios ?? []).some((s) => s.suite.includes("broad"))) {
    lines.push(`## Taxonomy × reason bucket (broad)`);
    lines.push("");
    lines.push(renderTaxonomyReasonTable(reports, input.scenarios ?? []));
    lines.push("");
  }

  lines.push(`## Failures in detail`);
  lines.push("");
  if (!failed.length) lines.push("None.");
  for (const r of failed) {
    lines.push(`### ${r.id} (run ${r.run}) — ${scnById.get(r.id)?.title ?? ""}`);
    lines.push("");
    for (const reason of r.reasons) lines.push(`- ${reason}`);
    if (!r.cartDiff.exact) {
      lines.push("");
      lines.push("Cart diff:");
      for (const h of r.cartDiff.humanSummary.slice(0, 12)) lines.push(`  - ${h}`);
    }
    if (r.hallucinationFlags.length) {
      lines.push("");
      lines.push(`Hallucination flags: ${r.hallucinationFlags.map((h) => `[t${h.turn} ${h.kind}] ${h.detail}`).join(" · ")}`);
    }
    lines.push("");
    lines.push("<details><summary>transcript</summary>");
    lines.push("");
    for (const t of r.transcript) lines.push(`- **${t.role}**: ${esc(t.text)}`);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }

  lines.push(`## Worst 5 latency (per-scenario TTFA p95)`);
  lines.push("");
  const worst = [...reports].filter((r) => r.latency.ttftP95 !== null).sort((a, b) => (b.latency.ttftP95 ?? 0) - (a.latency.ttftP95 ?? 0)).slice(0, 5);
  if (!worst.length) lines.push("No latency data.");
  else {
    lines.push(`| id | run | TTFA p50 | TTFA p95 | tool p95 |`);
    lines.push(`|---|---|---|---|---|`);
    for (const r of worst) lines.push(`| ${r.id} | ${r.run} | ${ms(r.latency.ttftP50)} | ${ms(r.latency.ttftP95)} | ${ms(r.latency.toolP95)} |`);
  }
  lines.push("");

  lines.push(`## Cost`);
  lines.push("");
  const totalIn = reports.reduce((a, r) => a + r.usage.in, 0);
  const totalOut = reports.reduce((a, r) => a + r.usage.out, 0);
  const cacheRead = reports.reduce((a, r) => a + r.usage.cacheRead, 0);
  lines.push(`Total ${cents(m.totalCostCents)} over ${m.runs} runs (${cents(m.costPerScenarioCents)} each). Tokens in ${totalIn.toLocaleString()} (cache read ${cacheRead.toLocaleString()}), out ${totalOut.toLocaleString()}.`);
  lines.push("");
  const versions = reports[0]?.versions;
  if (versions) lines.push(`Versions: \`${esc(JSON.stringify(versions))}\``);
  lines.push("");
  return lines.join("\n");
}

/**
 * taxonomy × reason-bucket matrix for broad (generated) runs: one row per
 * taxonomy bucket, one column per failure bucket, plus runs / pass counts.
 * Pure — the CLI prints it and the Markdown can embed it.
 */
export type TaxonomyReasonMatrix = { taxonomies: string[]; buckets: string[]; counts: Map<string, Map<string, number>>; runs: Map<string, number>; passed: Map<string, number> };

export function taxonomyReasonMatrix(reports: ScenarioReport[], scenarios: Scenario[]): TaxonomyReasonMatrix {
  const scnById = new Map(scenarios.map((s) => [s.id, s]));
  const counts = new Map<string, Map<string, number>>();
  const runs = new Map<string, number>();
  const passed = new Map<string, number>();
  const bucketSet = new Set<string>();
  for (const r of reports) {
    const taxes = scnById.get(r.id)?.taxonomy ?? ["?"];
    for (const tax of taxes.length ? taxes : ["?"]) {
      runs.set(tax, (runs.get(tax) ?? 0) + 1);
      if (r.pass) passed.set(tax, (passed.get(tax) ?? 0) + 1);
      else {
        const b = reasonBucket(r.reasons[0] ?? "unknown");
        bucketSet.add(b);
        const row = counts.get(tax) ?? new Map<string, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        counts.set(tax, row);
      }
    }
  }
  const taxonomies = [...runs.keys()].sort();
  const buckets = [...bucketSet].sort((a, b) => {
    const tot = (x: string) => taxonomies.reduce((n, t) => n + (counts.get(t)?.get(x) ?? 0), 0);
    return tot(b) - tot(a) || a.localeCompare(b);
  });
  return { taxonomies, buckets, counts, runs, passed };
}

/** Plain-text table of `taxonomyReasonMatrix` (also valid Markdown). */
export function renderTaxonomyReasonTable(reports: ScenarioReport[], scenarios: Scenario[]): string {
  const m = taxonomyReasonMatrix(reports, scenarios);
  if (!m.taxonomies.length) return "(no runs)";
  const head = ["taxonomy", "runs", "pass", ...m.buckets];
  const rows = m.taxonomies.map((t) => [t, String(m.runs.get(t) ?? 0), String(m.passed.get(t) ?? 0), ...m.buckets.map((b) => String(m.counts.get(t)?.get(b) ?? 0))]);
  const total = ["TOTAL", String([...m.runs.values()].reduce((a, b) => a + b, 0)), String([...m.passed.values()].reduce((a, b) => a + b, 0)), ...m.buckets.map((b) => String(m.taxonomies.reduce((n, t) => n + (m.counts.get(t)?.get(b) ?? 0), 0)))];
  const all = [head, ...rows, total];
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const fmt = (r: string[]) => `| ${r.map((c, i) => c.padEnd(w[i])).join(" | ")} |`;
  return [fmt(head), `|${w.map((x) => "-".repeat(x + 2)).join("|")}|`, ...rows.map(fmt), fmt(total)].join("\n");
}

/** Writes `<dir>/<name>.json` and `<dir>/<name>.md`; returns both paths. */
export function writeReport(dir: string, name: string, input: ReportInput): { json: string; md: string } {
  mkdirSync(dir, { recursive: true });
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const json = join(dir, `${name}.json`);
  const md = join(dir, `${name}.md`);
  writeFileSync(json, JSON.stringify({ generatedAt, args: input.args, metrics: input.metrics, reports: input.reports }, null, 2), "utf8");
  writeFileSync(md, renderMarkdown({ ...input, generatedAt }), "utf8");
  return { json, md };
}
