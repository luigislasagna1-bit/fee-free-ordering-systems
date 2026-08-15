/**
 * The FREE deterministic tier: every engine scenario (hand-written E-ids +
 * generated permutations) runs the production tool layer + cart engine + the
 * real compiler over Luigi's prod menu snapshot, with no model, and must end
 * in exactly the expected cart. $0, in `npm test`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MenuSnapshot } from "../snapshot-types";
import { ENGINE_SCENARIOS } from "./index";
import { generateEngineScenarios } from "./generator";
import { runEngineScenario } from "./runner";

const snap: MenuSnapshot = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "luigis.menu.json"), "utf8"));

describe("engine scenarios — hand-written (the directive's own examples)", () => {
  for (const s of ENGINE_SCENARIOS) {
    it(`${s.id}: ${s.title}`, async () => {
      const r = await runEngineScenario(s, snap);
      expect(r.reasons, r.reasons.join("\n")).toEqual([]);
      expect(r.pass).toBe(true);
    });
  }
});

describe("engine scenarios — generated permutations (sizes × halves × exclusions × corrections × combos)", () => {
  const generated = generateEngineScenarios({ seed: 1 });
  it(`generates hundreds of distinct scenarios`, () => {
    expect(generated.length).toBeGreaterThanOrEqual(300);
    expect(new Set(generated.map((g) => g.id)).size).toBe(generated.length);
  });
  it("every generated scenario ends in exactly its expected cart", async () => {
    const failures: string[] = [];
    for (const s of generated) {
      const r = await runEngineScenario(s, snap);
      if (!r.pass) failures.push(`${s.id}: ${r.reasons.join(" | ")}`);
    }
    expect(failures, `${failures.length}/${generated.length} failed:\n${failures.slice(0, 15).join("\n")}`).toEqual([]);
  }, 120_000);
});
