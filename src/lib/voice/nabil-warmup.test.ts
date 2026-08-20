/**
 * The prompt-cache warmer (services/nabil-voice/src/warmup.ts).
 *
 * What matters: the warm request must be BYTE-IDENTICAL to a real call's
 * cached prefix — same tools, same stable system block, same cache_control —
 * or it warms a different cache entry and the money is wasted. And a rejected
 * max_tokens: 0 must fall back to 1 token instead of failing the cycle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.APP_BASE_URL = "http://localhost:3001";
  process.env.INTERNAL_API_SECRET = "test-internal";
  process.env.NABIL_VOICE_JWT_SECRET = "test-jwt";
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
});

import { warmStore } from "../../../services/nabil-voice/src/warmup";
import { buildSystemPrompt } from "../../../services/nabil-voice/src/prompt";
import { normalizeAgentConfig } from "../../../services/nabil-voice/src/agent-config";
import { toolsForConfig } from "../../../services/nabil-voice/src/tools";

const MENU = { restaurant: { name: "Luigi's", currency: "cad" }, menu: [] };
const CONTEXT = {
  restaurant: { name: "Luigi's" },
  open: { isOpenNow: true, todayHours: "10 – 10" },
  services: { pickup: { offered: true } },
  config: { canTakeOrders: true },
};

function fakeAnthropic(behavior: "ok" | "reject-zero") {
  const calls: any[] = [];
  return {
    calls,
    messages: {
      create: vi.fn(async (params: any) => {
        calls.push(params);
        if (behavior === "reject-zero" && params.max_tokens === 0) {
          throw new Error("400: max_tokens must be at least 1");
        }
        return { usage: { cache_creation_input_tokens: 41230, cache_read_input_tokens: 0 } };
      }),
    },
  };
}

const deps = { menu: vi.fn(async () => MENU), context: vi.fn(async () => CONTEXT) };

beforeEach(() => vi.clearAllMocks());

describe("warmStore", () => {
  it("sends the identical prefix a real call caches: stable block + 1h marker + the store's tools", async () => {
    const anthropic = fakeAnthropic("ok");
    const out = await warmStore(anthropic as never, "luigis", deps);

    expect(out).toEqual({ outcome: "written", tokens: 41230 });
    expect(anthropic.calls).toHaveLength(1);
    const p = anthropic.calls[0];

    const cfg = normalizeAgentConfig(CONTEXT.config);
    const expected = buildSystemPrompt({ menu: MENU, context: CONTEXT, returningCaller: { found: false }, cfg, callerPhone: null, isDemo: false, isTestOrder: false });
    expect(p.system).toEqual([{ type: "text", text: expected.stable, cache_control: { type: "ephemeral", ttl: "1h" } }]);
    expect(p.tools).toEqual(toolsForConfig(cfg));
    expect(p.max_tokens).toBe(0);
    expect(p.thinking).toEqual({ type: "disabled" });
  });

  it("falls back to max_tokens: 1 when the API rejects 0, and reports a cache READ as 'refreshed'", async () => {
    const anthropic = fakeAnthropic("reject-zero");
    anthropic.messages.create.mockImplementationOnce(async (params: any) => {
      anthropic.calls.push(params);
      throw new Error("400: max_tokens must be at least 1");
    });
    anthropic.messages.create.mockImplementationOnce(async (params: any) => {
      anthropic.calls.push(params);
      return { usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 41230 } };
    });

    const out = await warmStore(anthropic as never, "luigis", deps);
    expect(out).toEqual({ outcome: "refreshed", tokens: 41230 });
    expect(anthropic.calls.map((c) => c.max_tokens)).toEqual([0, 1]);
  });

  it("a non-max_tokens failure propagates (the cycle logs and moves on)", async () => {
    const anthropic = fakeAnthropic("ok");
    anthropic.messages.create.mockRejectedValueOnce(new Error("529 overloaded"));
    await expect(warmStore(anthropic as never, "luigis", deps)).rejects.toThrow(/overloaded/);
  });
});
