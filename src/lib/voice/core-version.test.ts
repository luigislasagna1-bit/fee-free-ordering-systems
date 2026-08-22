/**
 * Phase B — Nabil Core version stamp (services/nabil-voice/src/core-version.ts).
 */
import { describe, expect, it } from "vitest";
import { CORE_FILES, CORE_VERSION, coreContentHash, gitSha } from "../../../services/nabil-voice/src/core-version";

describe("core-version", () => {
  it("CORE_VERSION is semver and the manifest names the behaviour files", () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    for (const f of ["session.ts", "tools.ts", "cart-engine.ts", "playbook.ts", "prompt.ts", "transfer-policy.ts"]) expect(CORE_FILES).toContain(f);
  });
  it("coreContentHash is a stable 12-hex digest over the files on disk", () => {
    const a = coreContentHash();
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(coreContentHash()).toBe(a);
  });
  it("gitSha comes only from the build arg, never 'dev'", () => {
    const prev = process.env.NABIL_GIT_SHA;
    process.env.NABIL_GIT_SHA = "dev";
    expect(gitSha()).toBeNull();
    process.env.NABIL_GIT_SHA = "abc1234";
    expect(gitSha()).toBe("abc1234");
    if (prev === undefined) delete process.env.NABIL_GIT_SHA;
    else process.env.NABIL_GIT_SHA = prev;
  });
});
