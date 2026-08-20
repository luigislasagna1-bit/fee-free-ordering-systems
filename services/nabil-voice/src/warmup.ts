/**
 * PROMPT-CACHE WARMER (Luigi call review, 2026-08-20).
 *
 * The first call to a store after a deploy — or after a quiet hour — paid the
 * full cold-cache tax: the ~40k-token store prefix (tools + playbook + menu)
 * re-processed on the greeting turn, which is seconds of extra silence on
 * every hop and exactly the call the owner test-drives right after shipping.
 *
 * This module keeps the 1h cache entry hot instead: at boot and every 50
 * minutes, for every store whose agent can take a call (GET
 * /api/internal/voice/active-stores), it builds the IDENTICAL request prefix a
 * real call would build — same tools, same STABLE system block, same
 * cache_control — and fires a zero-output request so Anthropic writes or
 * TTL-refreshes the entry. The volatile "RIGHT NOW" block is omitted on
 * purpose: blocks after the breakpoint never enter the cache key, which is the
 * whole point of the stable/volatile split (prompt.ts).
 *
 * Anthropic's prompt cache is org-scoped and server-side, so one machine's
 * warm serves every Fly machine; a second machine warming the same store just
 * pays a cheap cache READ. Real traffic refreshes the TTL by itself — a store
 * whose last model request was < 45 min ago is skipped (noteStoreRequest is
 * called from the session's request path).
 *
 * Cost, Sonnet-5 class: a cold 1h write on a 40k prefix ≈ $0.24; a refresh
 * that hits the cache ≈ $0.01. A zero-traffic store therefore costs well
 * under a dollar a day to keep warm; a busy store costs almost nothing.
 *
 * Failure policy mirrors fallback.ts: keep the last good store list when a
 * refresh fails, warn (with a refractory) and never throw — a failed warm
 * just means the next caller pays today's cold start, which is the status quo.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { api, fetchActiveStores } from "./api";
import { normalizeAgentConfig } from "./agent-config";
import { buildSystemPrompt } from "./prompt";
import { toolsForConfig } from "./tools";
import { CONFIG } from "./config";
import { captureError, createRefractory } from "./observability";
import { quickHash } from "./versions";

/** Real-call activity per slug — a request within this window refreshed the
 *  1h TTL on read, so the warmer can skip the store. */
const RECENT_REQUEST_MS = 45 * 60 * 1000;
const CYCLE_MS = 50 * 60 * 1000;
const BOOT_DELAY_MS = 15 * 1000;
/** Spacing between per-store warm requests inside one cycle. */
const SPACING_MS = 300;

const lastStoreRequestAt = new Map<string, number>();
let lastGoodStores: Array<{ slug: string }> = [];
/** Per-key warn refractory: a broken store warns every ~10 min, not every cycle. */
const refractories = new Map<string, ReturnType<typeof createRefractory>>();
function warnOnce(key: string): boolean {
  let r = refractories.get(key);
  if (!r) {
    r = createRefractory(10 * 60 * 1000);
    refractories.set(key, r);
  }
  return r.fire();
}

/** Called from the session on every model request — real traffic IS a warm. */
export function noteStoreRequest(slug: string): void {
  if (slug) lastStoreRequestAt.set(slug, Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One store: build the identical prefix a call would and touch the cache.
 *  Exported for tests; `deps` lets tests inject fakes. */
export async function warmStore(
  anthropic: Anthropic,
  slug: string,
  deps: { menu?: typeof api.menu; context?: typeof api.context } = {},
): Promise<{ outcome: "written" | "refreshed"; tokens: number; stableHash: string; toolsHash: string } | null> {
  const [menu, context] = await Promise.all([(deps.menu ?? api.menu)(slug), (deps.context ?? api.context)(slug)]);
  const cfg = normalizeAgentConfig(context?.config);
  // returningCaller/callerPhone only shape per-call facts, never the stable
  // block — mirror session.init()'s inputs for everything that does.
  const built = buildSystemPrompt({ menu, context, returningCaller: { found: false }, cfg, callerPhone: null, isDemo: false, isTestOrder: false });
  const tools = toolsForConfig(cfg);
  const request = (maxTokens: number) => {
    const params: Record<string, unknown> = {
      model: CONFIG.model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: built.stable, cache_control: { type: "ephemeral", ttl: CONFIG.cacheTtl } }],
      tools: tools as never,
      messages: [{ role: "user", content: "warmup" }],
    };
    // Mirror the live turn loop EXACTLY (session.ts runTurnInner). The 22:23
    // live call proved a disabled-thinking warm writes an entry adaptive calls
    // do NOT read (turn 1 cache=0% ten minutes after "written 52253") —
    // whatever the precise invalidation rule, identical params is the cure.
    if (CONFIG.thinking === "adaptive") {
      params.thinking = { type: "adaptive" };
      params.output_config = { effort: CONFIG.effort };
    } else {
      params.thinking = { type: "disabled" };
    }
    return anthropic.messages.create(params as never);
  };
  // max_tokens: 0 is the prefill-only form (nothing sampled, no output
  // billed). Some param combinations demand a minimum, so step up the ladder
  // ONLY on max_tokens-shaped rejections — anything else is a real error.
  type WarmUsage = { usage?: { cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
  let res: WarmUsage | null = null;
  let lastErr: unknown = null;
  for (const maxTokens of [0, 1, 64]) {
    try {
      res = (await request(maxTokens)) as WarmUsage;
      break;
    } catch (e) {
      lastErr = e;
      if (!/max_tokens/i.test(String((e as Error)?.message ?? ""))) throw e;
    }
  }
  if (!res) throw lastErr;
  const wrote = Number(res?.usage?.cache_creation_input_tokens ?? 0);
  const read = Number(res?.usage?.cache_read_input_tokens ?? 0);
  return {
    outcome: wrote > 0 ? "written" : "refreshed",
    tokens: wrote > 0 ? wrote : read,
    // Comparable against the next call's call_start versions: systemStableHash
    // and toolsVersion. Equal hashes + a turn-1 miss would disprove the
    // params theory and point at the request shape instead.
    stableHash: quickHash(built.stable),
    toolsHash: quickHash(tools),
  };
}

async function runCycle(anthropic: Anthropic): Promise<void> {
  try {
    const r = await fetchActiveStores();
    if (Array.isArray(r?.stores)) lastGoodStores = r.stores.filter((s) => s?.slug);
  } catch (e) {
    if (warnOnce("active-stores")) {
      console.warn("[nabil-voice/warm] active-stores fetch failed — using last good list", String((e as Error)?.message ?? e));
    }
  }
  for (const { slug } of lastGoodStores) {
    const last = lastStoreRequestAt.get(slug) ?? 0;
    if (Date.now() - last < RECENT_REQUEST_MS) continue;
    const startedAt = Date.now();
    try {
      const out = await warmStore(anthropic, slug);
      if (out) {
        console.log(`[nabil-voice/warm] slug=${slug} ${out.outcome} tokens=${out.tokens} stable=${out.stableHash} tools=${out.toolsHash} ms=${Date.now() - startedAt}`);
        // A warm counts as activity: don't re-warm the same store next cycle
        // when nothing else happened — the TTL was just refreshed.
        lastStoreRequestAt.set(slug, Date.now());
      }
    } catch (e) {
      if (warnOnce(`warm:${slug}`)) {
        console.warn(`[nabil-voice/warm] slug=${slug} failed`, String((e as Error)?.message ?? e));
        captureError(e, { where: "cache-warm", extra: { slug } });
      }
    }
    await sleep(SPACING_MS);
  }
}

/** Boot hook (server.ts): first warm shortly after listen, then every cycle.
 *  Timers are unref'd so they never hold a draining process open. */
export function startCacheWarm(anthropic: Anthropic): void {
  const boot = setTimeout(() => void runCycle(anthropic), BOOT_DELAY_MS);
  boot.unref?.();
  const interval = setInterval(() => void runCycle(anthropic), CYCLE_MS);
  interval.unref?.();
}
