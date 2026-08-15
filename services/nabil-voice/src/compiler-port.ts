/**
 * The Compiler port over the app's /api/internal/voice/build-line — the ONE
 * mapping from the route's JSON to the engine's CompileResponse. Lives in its
 * own module (no CONFIG import) so the deterministic engine-scenario tier
 * (src/lib/voice/sim/engine-scenarios) can run the exact production adapter
 * over the fake backend without the service's env.
 */
import type { VoiceApi } from "./api";
import type { CompileResponse, Compiler } from "./cart-engine";

export function compilerFromApi(api: VoiceApi, slug: string): Compiler {
  return {
    async compile(req): Promise<CompileResponse> {
      const res = await api.buildLine({ slug, kind: req.kind, intent: req.intent, askGroupIds: req.askGroupIds, ...(req.offerDeals ? { offerDeals: true } : {}) });
      if (!res.ok) {
        const code = String(res.json?.code ?? `http_${res.status}`);
        return { ok: false, code, message: String(res.json?.error ?? "I couldn't build that.") };
      }
      const j = res.json ?? {};
      return {
        ok: true,
        line: j.line ?? null,
        readBack: String(j.readBack ?? ""),
        // The spoken layer (spoken-line.ts on Vercel). Undefined on a
        // build-line that predates it — the engine then speaks readBack.
        ...(typeof j.spoken === "string" ? { spoken: j.spoken } : {}),
        ...(typeof j.spokenNoQty === "string" ? { spokenNoQty: j.spokenNoQty } : {}),
        pricingNote: j.pricingNote ?? null,
        // Raw surcharge (spoken in words above a threshold); `undefined`
        // = old build-line ⇒ keep its pricingNote text.
        ...(j.surcharge !== undefined ? { surcharge: j.surcharge ?? null } : {}),
        unresolved: Array.isArray(j.unresolved) ? j.unresolved.map(String) : [],
        halves: j.halves ?? null,
        lineSubtotal: typeof j.lineSubtotal === "number" ? j.lineSubtotal : null,
        notices: Array.isArray(j.notices) ? j.notices.map(String) : undefined,
        toppings: Array.isArray(j.toppings) ? j.toppings : undefined,
        pickSlots: Array.isArray(j.pickSlots) ? j.pickSlots : undefined,
        recipeNames: Array.isArray(j.recipeNames) ? j.recipeNames.map(String) : undefined,
        betterDeal: j.betterDeal ? { name: String(j.betterDeal.name), menuItemId: String(j.betterDeal.menuItemId), saving: Number(j.betterDeal.saving ?? 0) } : null,
        switchedTo: j.switchedTo ? { from: String(j.switchedTo.from), to: String(j.switchedTo.to), menuItemId: j.switchedTo.menuItemId ? String(j.switchedTo.menuItemId) : undefined, saving: Number(j.switchedTo.saving ?? 0) } : null,
      };
    },
  };
}

