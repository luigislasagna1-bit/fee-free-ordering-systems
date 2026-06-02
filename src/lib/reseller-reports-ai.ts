/**
 * AI triage for reseller reports. SERVER-ONLY.
 *
 * Takes a raw report (often two messy sentences from a reseller) and
 * returns a structured, superadmin-only analysis — the same shape Claude
 * Code produces by hand, minus the precise file pinpointing (the live
 * server can't see the source tree; the FEATURE_MAP narrows the guess).
 *
 * Reuses the same Anthropic SDK + ANTHROPIC_API_KEY as the menu importer
 * (src/lib/menu-extractor.ts). Returns null when the key is missing or the
 * call fails — callers treat that as "analysis unavailable", never fatal.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { FEATURE_MAP } from "@/lib/reseller-reports-feature-map";

// Sonnet 4.5 — the model the menu importer already uses in prod. Good
// reasoning for triage; fast enough for an on-view call (text only).
const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a senior software engineer triaging an internal bug/feature report for a multi-tenant restaurant ordering SaaS. The report was filed by the platform owner or one of his resellers and may be short or vague.

Produce a tight, scannable Markdown analysis for the platform owner (superadmin) — NOT the reporter. Use these sections, in order, omitting any that don't apply:

## Summary
One or two sentences: what's being reported, in clear terms.

## Suggested classification
- **Type:** one of Bug / Feature Request / Feature Adjustment / Feature Update / Feature Fix — with a one-line reason.
- **Priority:** Low / Medium / High / Critical — with a one-line reason (customer-facing? money/trust? has a workaround?).
(This is a SUGGESTION only — the owner decides whether to apply it.)

## Steps to reproduce
Your best reconstruction of the repro steps, numbered. Mark anything you're inferring.

## Expected vs actual
- **Expected:** …
- **Actual:** …

## Likely affected area
Point at the most probable code area(s) using the FEATURE MAP provided. Be specific where the map allows (name the module/route), but say "likely" — you cannot see the source code, so do not fabricate exact line numbers or function names you aren't given.

## Possible solution direction
A plausible fix approach for the engineer to investigate. Hedge appropriately.

## To confirm with the reporter
Any missing detail that would speed up the fix (only if genuinely needed).

Rules: be concise — this is a triage note, not an essay. Never invent product behavior. If it's clearly a feature request rather than a bug, frame "reproduce/expected/actual" as "current behavior / desired behavior" instead.`;

export async function analyzeReport(report: {
  title: string;
  body: string;
  type: string;
  priority: string;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[reseller-reports-ai] ANTHROPIC_API_KEY not set — skipping analysis");
    return null;
  }

  try {
    const client = new Anthropic({ apiKey });
    const userContent =
      `Reporter-selected type: ${report.type}\n` +
      `Reporter-selected priority: ${report.priority}\n\n` +
      `Title: ${report.title}\n\n` +
      `Report:\n${report.body}\n\n` +
      `---\nFEATURE MAP (use for the "Likely affected area" section):\n${FEATURE_MAP}`;

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return text || null;
  } catch (err) {
    console.error("[reseller-reports-ai] analysis failed", err);
    return null;
  }
}
