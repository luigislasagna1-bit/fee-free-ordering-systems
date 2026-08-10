/**
 * Pure-function coverage for the call-intelligence pass: tool-output parsing,
 * upsell revenue matching (the money math), and cost math. The Anthropic leg
 * of generateCallIntelligence is intentionally not exercised here — but the
 * EARLY-EXIT branches are, because they decide whether the catch-up cron can
 * ever make progress.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// call-intelligence imports @/lib/db, whose module init throws without
// DATABASE_URL — mock it out; the pure functions never touch prisma, and the
// early-exit tests below assert on these spies.
const db = vi.hoisted(() => ({
  voiceCall: { findUnique: vi.fn(), update: vi.fn() },
  order: { findFirst: vi.fn() },
  voiceUpsell: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ default: db }));

import {
  normalizeTranscript,
  parseIntelligenceOutput,
  computeUpsellCents,
  computeCostCents,
  generateCallIntelligence,
} from "./call-intelligence";

describe("normalizeTranscript", () => {
  it("keeps only well-formed, non-empty turns", () => {
    expect(
      normalizeTranscript([
        { role: "caller", text: "Hello", ts: 1 },
        { role: "agent", text: "   " }, // whitespace-only text dropped
        { role: "", text: "no role" },
        null,
        { role: "agent", text: "Hi there" },
      ]),
    ).toEqual([
      { role: "caller", text: "Hello" },
      { role: "agent", text: "Hi there" },
    ]);
  });

  it("returns [] for non-arrays (null / DbNull round-trips)", () => {
    expect(normalizeTranscript(null)).toEqual([]);
    expect(normalizeTranscript({})).toEqual([]);
  });
});

describe("parseIntelligenceOutput", () => {
  it("accepts a valid tool output", () => {
    expect(
      parseIntelligenceOutput({
        summary: "  A caller ordered a pizza. Nabil AI upsold garlic bread.  ",
        sentiment: "positive",
        upsellAcceptedItemNames: ["Garlic Bread", "  ", 42, "Tiramisu"],
      }),
    ).toEqual({
      summary: "A caller ordered a pizza. Nabil AI upsold garlic bread.",
      sentiment: "positive",
      upsellAcceptedItemNames: ["Garlic Bread", "Tiramisu"],
    });
  });

  it("returns null without a usable summary (the one required field)", () => {
    expect(parseIntelligenceOutput({ sentiment: "positive" })).toBeNull();
    expect(parseIntelligenceOutput({ summary: "   " })).toBeNull();
    expect(parseIntelligenceOutput(null)).toBeNull();
    expect(parseIntelligenceOutput("summary")).toBeNull();
  });

  it("normalizes an off-taxonomy sentiment to neutral instead of failing", () => {
    const r = parseIntelligenceOutput({ summary: "ok", sentiment: "ecstatic" });
    expect(r?.sentiment).toBe("neutral");
  });

  it("caps the summary length defensively", () => {
    const r = parseIntelligenceOutput({ summary: "x".repeat(5000), sentiment: "neutral" });
    expect(r?.summary).toHaveLength(2000);
  });
});

describe("computeUpsellCents", () => {
  const lines = [
    { name: "Margherita Pizza", subtotal: 18.99 },
    { name: "Garlic Bread", subtotal: 5.5 },
    { name: "Tiramisu", subtotal: 7.25 },
  ];
  const configured = ["Garlic Bread", "Tiramisu"];

  it("sums only lines that are accepted AND configured upsells (cents, rounded)", () => {
    expect(computeUpsellCents(lines, ["Garlic Bread"], configured)).toBe(550);
    expect(computeUpsellCents(lines, ["Garlic Bread", "Tiramisu"], configured)).toBe(550 + 725);
  });

  it("matches names case-insensitively with whitespace tolerance", () => {
    expect(computeUpsellCents(lines, ["  garlic BREAD "], configured)).toBe(550);
  });

  it("ignores accepted names that are NOT in the configured upsell list", () => {
    // The model crediting the main dish as an 'upsell' must not count.
    expect(computeUpsellCents(lines, ["Margherita Pizza"], configured)).toBe(0);
  });

  it("returns 0 with no accepted names, no lines, or no configured upsells", () => {
    expect(computeUpsellCents(lines, [], configured)).toBe(0);
    expect(computeUpsellCents([], ["Garlic Bread"], configured)).toBe(0);
    expect(computeUpsellCents(lines, ["Garlic Bread"], [])).toBe(0);
  });

  it("counts duplicate lines (qty split across lines) and rounds per line", () => {
    const dup = [
      { name: "Garlic Bread", subtotal: 5.505 },
      { name: "Garlic Bread", subtotal: 5.505 },
    ];
    expect(computeUpsellCents(dup, ["Garlic Bread"], configured)).toBe(551 + 551);
  });

  it("skips non-finite or non-positive subtotals", () => {
    const bad = [
      { name: "Garlic Bread", subtotal: NaN },
      { name: "Garlic Bread", subtotal: -5 },
      { name: "Garlic Bread", subtotal: 5.5 },
    ];
    expect(computeUpsellCents(bad, ["Garlic Bread"], configured)).toBe(550);
  });
});

describe("computeCostCents", () => {
  // claude-sonnet-5 list pricing (2026-08-10): $3/MTok in, $15/MTok out.
  it("prices a full megatoken at list rates", () => {
    expect(computeCostCents(1_000_000, 1_000_000)).toBe(1800); // $3 + $15
  });

  it("rounds a realistic small call to whole cents", () => {
    // 20k in, 2k out -> $0.06 + $0.03 = $0.09 -> 9 cents
    expect(computeCostCents(20_000, 2_000)).toBe(9);
  });

  it("handles zero and clamps negatives", () => {
    expect(computeCostCents(0, 0)).toBe(0);
    expect(computeCostCents(-100, -100)).toBe(0);
  });
});

describe("generateCallIntelligence — unsummarizable calls are TERMINALLY skipped", () => {
  // Regression guard for the catch-up cron (/api/cron/voice-intelligence):
  // it selects `summary: null` ORDER BY endedAt ASC LIMIT 20. Hang-ups, spam
  // and wrong numbers are logged with an empty / single-turn transcript that
  // can never be summarized, so if they stayed `summary: null` forever, 20 of
  // them would permanently starve the sweep and no genuinely-failed call
  // would ever be retried.
  const callRow = (over: Record<string, unknown> = {}) => ({
    id: "call-1",
    restaurantId: "rest-1",
    transcript: [],
    summary: null,
    outcome: "abandoned",
    orderNumber: null,
    reservationCode: null,
    durationSeconds: 4,
    tokensIn: null,
    tokensOut: null,
    restaurant: { defaultLanguage: "en", currency: "CAD" },
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    db.voiceCall.update.mockResolvedValue({});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stamps summary:\"\" for an empty transcript (stored as [], NOT DbNull)", async () => {
    db.voiceCall.findUnique.mockResolvedValue(callRow({ transcript: [] }));

    await expect(generateCallIntelligence("call-1")).resolves.toBeNull();
    expect(db.voiceCall.update).toHaveBeenCalledWith({
      where: { id: "call-1" },
      data: { summary: "" },
    });
  });

  it("stamps summary:\"\" for a single-turn transcript", async () => {
    db.voiceCall.findUnique.mockResolvedValue(
      callRow({ transcript: [{ role: "agent", text: "Hi, this is Nabil AI." }] }),
    );

    await expect(generateCallIntelligence("call-1")).resolves.toBeNull();
    expect(db.voiceCall.update).toHaveBeenCalledWith({
      where: { id: "call-1" },
      data: { summary: "" },
    });
  });

  it("still skips silently when the call is already summarized or missing", async () => {
    db.voiceCall.findUnique.mockResolvedValueOnce(callRow({ summary: "Already analyzed." }));
    await expect(generateCallIntelligence("call-1")).resolves.toBeNull();

    db.voiceCall.findUnique.mockResolvedValueOnce(null);
    await expect(generateCallIntelligence("nope")).resolves.toBeNull();

    expect(db.voiceCall.update).not.toHaveBeenCalled();
  });

  it("never throws when the stamping write fails", async () => {
    db.voiceCall.findUnique.mockResolvedValue(callRow());
    db.voiceCall.update.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(generateCallIntelligence("call-1")).resolves.toBeNull();
    err.mockRestore();
  });
});
