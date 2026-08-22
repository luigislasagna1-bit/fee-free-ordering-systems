/**
 * Phase D part 2 — the LLM judge (src/lib/voice/eval/judge.ts): parsing,
 * scoring, persistence, skips and backoff (Anthropic + prisma mocked).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    voiceCallEvaluation: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    order: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ default: prismaMock }));

import { MAX_ATTEMPTS, judgePendingCalls, judgeScoreOf, judgeStoredCall, parseJudgeOutput } from "./judge";

const NOW = new Date("2026-08-22T20:00:00Z");
const transcript = [
  { role: "user", text: "Hi, a large pepperoni for pickup, it's Marco, 416-555-0199.", turn: 1 },
  { role: "assistant", text: "One large pepperoni for pickup — anything else?", turn: 1 },
  { role: "user", text: "That's it.", turn: 2 },
  { role: "assistant", text: "Your total is twenty dollars. Shall I place it?", turn: 2 },
  { role: "user", text: "Yes.", turn: 3 },
  { role: "assistant", text: "All set, see you soon!", turn: 3 },
];
const evalRow = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  judgeAttempts: 0,
  findings: [],
  detScore: 95,
  needsReview: false,
  reviewReasons: [],
  call: {
    outcome: "order_placed",
    durationSeconds: 80,
    transcript,
    orderNumber: "ORD-1",
    quotedTotal: 20,
    chargedTotal: 20,
    transferReason: null,
    restaurant: { defaultLanguage: "en", name: "Luigi's", voiceAgentConfig: { agentName: "Luna", transferPolicy: "immediate" } },
    orderId: "o1",
    restaurantId: "r1",
  },
  ...over,
});
const goodOutput = {
  callerGoal: "Order a large pepperoni for pickup",
  goalAchieved: true,
  confidence: 0.9,
  axes: { understanding: 95, accuracy: 100, conversation: 90, grounding: 100, handling: 90 },
  issues: [],
};
function fakeClient(output: unknown, stop = "tool_use") {
  return {
    messages: {
      create: vi.fn(async () => ({ stop_reason: stop, content: [{ type: "tool_use", name: "record_call_evaluation", input: output }], usage: { input_tokens: 1200, output_tokens: 200 } })),
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.voiceCallEvaluation.update.mockResolvedValue({ id: "e1" });
  prismaMock.order.findFirst.mockResolvedValue({ items: [{ name: "Large 1 Topping", quantity: 1, variantName: null }] });
});

describe("parseJudgeOutput / judgeScoreOf", () => {
  it("clamps axes, sanitises issues, redacts PII in free text", () => {
    const r = parseJudgeOutput({
      callerGoal: "Reach Marco at 416-555-0199",
      goalAchieved: "yes",
      confidence: 1.7,
      axes: { understanding: 120, accuracy: -5, conversation: "80", grounding: 70, handling: 60 },
      issues: [{ severity: "huge", category: "nonsense", description: "Called back 416-555-0199", turn: 2.5 }, { severity: "high", category: "wrong_size", description: "Medium instead of large", turn: 2 }],
    })!;
    expect(r.axes).toEqual({ understanding: 100, accuracy: 0, conversation: 80, grounding: 70, handling: 60 });
    expect(r.goalAchieved).toBe(false);
    expect(r.confidence).toBe(1);
    expect(r.callerGoal).not.toMatch(/416-555-0199/);
    expect(r.issues[0]).toMatchObject({ severity: "low", category: "other" });
    expect(r.issues[0].description).not.toMatch(/416-555/); // redactString keeps the last four digits
    expect(r.issues[1]).toEqual({ severity: "high", category: "wrong_size", description: "Medium instead of large", turn: 2 });
  });
  it("weights accuracy most; a critical issue caps at 40, an unmet goal at 60", () => {
    const base = parseJudgeOutput(goodOutput)!;
    expect(judgeScoreOf(base)).toBeGreaterThanOrEqual(95);
    expect(judgeScoreOf({ ...base, issues: [{ severity: "critical", category: "wrong_item", description: "x" }] })).toBe(40);
    expect(judgeScoreOf({ ...base, goalAchieved: false })).toBe(60);
  });
});

describe("judgeStoredCall", () => {
  it("judges an engaged call with a forced tool and stores score, findings, cost; a clean call adds no review reason", async () => {
    prismaMock.voiceCallEvaluation.findUnique.mockResolvedValue(evalRow());
    const client = fakeClient(goodOutput);
    const r = await judgeStoredCall("c1", { now: NOW, client });
    expect(r).toEqual({ status: "done", judgeScore: expect.any(Number) });
    const req = (client as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create.mock.calls[0][0];
    expect(req.tool_choice).toEqual({ type: "tool", name: "record_call_evaluation" });
    expect(String(req.messages[0].content)).toMatch(/ORDER AS PLACED/);
    expect(String(req.messages[0].content)).not.toMatch(/416-555-0199/); // redacted transcript
    const data = prismaMock.voiceCallEvaluation.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ judgeStatus: "done", judgeScore: expect.any(Number), needsReview: false, judgedAt: NOW });
    expect(data.judgeCostCents).toBeGreaterThan(0);
    expect(data.judgeFindings).toMatchObject({ goalAchieved: true, axes: goodOutput.axes });
  });

  it("a judge-found high issue or a big det/judge disagreement flags the call for review (additive)", async () => {
    prismaMock.voiceCallEvaluation.findUnique.mockResolvedValue(evalRow({ reviewReasons: ["low_score"], needsReview: true, detScore: 95 }));
    const client = fakeClient({ ...goodOutput, goalAchieved: false, axes: { understanding: 40, accuracy: 30, conversation: 50, grounding: 40, handling: 50 }, issues: [{ severity: "high", category: "wrong_item", description: "Pepperoni became Hawaiian", turn: 2 }] });
    await judgeStoredCall("c1", { now: NOW, client });
    const data = prismaMock.voiceCallEvaluation.update.mock.calls[0][0].data;
    expect(data.needsReview).toBe(true);
    expect(data.reviewReasons).toEqual(expect.arrayContaining(["low_score", "judge_issue", "judge_low_score", "det_judge_disagree"]));
  });

  it("skips robocalls, dropped records and calls with fewer than two caller turns without calling the model", async () => {
    const client = fakeClient(goodOutput);
    prismaMock.voiceCallEvaluation.findUnique.mockResolvedValue(evalRow({ call: { ...evalRow().call, outcome: "spam" } }));
    expect(await judgeStoredCall("c1", { now: NOW, client })).toEqual({ status: "skipped", reason: "spam" });
    prismaMock.voiceCallEvaluation.findUnique.mockResolvedValue(evalRow({ call: { ...evalRow().call, transcript: transcript.slice(0, 2) } }));
    expect(await judgeStoredCall("c1", { now: NOW, client })).toEqual({ status: "skipped", reason: "not_engaged" });
    expect((client as { messages: { create: ReturnType<typeof vi.fn> } }).messages.create).not.toHaveBeenCalled();
    expect(prismaMock.voiceCallEvaluation.update.mock.calls.every((c) => c[0].data.judgeStatus === "skipped")).toBe(true);
  });

  it("a model failure backs off exponentially and dead-letters after MAX_ATTEMPTS", async () => {
    prismaMock.voiceCallEvaluation.findUnique.mockResolvedValue(evalRow({ judgeAttempts: 0 }));
    const failing = { messages: { create: vi.fn(async () => { throw new Error("overloaded"); }) } } as never;
    const r1 = await judgeStoredCall("c1", { now: NOW, client: failing });
    expect(r1).toMatchObject({ status: "retry" });
    expect(prismaMock.voiceCallEvaluation.update.mock.calls[0][0].data).toMatchObject({ judgeAttempts: 1, judgeStatus: "pending", judgeNextAt: new Date(NOW.getTime() + 30 * 60_000) });
    prismaMock.voiceCallEvaluation.findUnique.mockResolvedValue(evalRow({ judgeAttempts: MAX_ATTEMPTS - 1 }));
    const r2 = await judgeStoredCall("c1", { now: NOW, client: failing });
    expect(r2).toMatchObject({ status: "failed" });
    expect(prismaMock.voiceCallEvaluation.update.mock.calls[1][0].data).toMatchObject({ judgeStatus: "failed", judgeNextAt: null });
  });
});

describe("judgePendingCalls", () => {
  it("picks pending rows whose backoff elapsed, oldest first, and tallies outcomes", async () => {
    prismaMock.voiceCallEvaluation.findMany.mockResolvedValue([{ callId: "c1" }, { callId: "c2" }]);
    prismaMock.voiceCallEvaluation.findUnique.mockImplementation(async ({ where }: { where: { callId: string } }) => (where.callId === "c1" ? evalRow() : evalRow({ call: { ...evalRow().call, outcome: "spam" } })));
    const r = await judgePendingCalls({ cap: 20, now: NOW, client: fakeClient(goodOutput) });
    expect(prismaMock.voiceCallEvaluation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { judgeStatus: "pending", OR: [{ judgeNextAt: null }, { judgeNextAt: { lte: NOW } }] }, take: 20 }));
    expect(r).toEqual({ done: 1, skipped: 1, retried: 0, failed: 0 });
  });
});
