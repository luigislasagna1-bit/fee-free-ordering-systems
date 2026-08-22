/**
 * Nabil CORE version (Phase B, 2026-08-22).
 *
 * `CORE_VERSION` is bumped BY A HUMAN when the shared, tenant-independent
 * behaviour changes (semver: behaviour-visible change = minor, fix = patch).
 * `coreContentHash()` is what actually ran: a sha256 over the core source
 * files as found on disk at boot, so two builds that claim the same version
 * but differ in code are told apart on every call's provenance row.
 *
 * The file list is the CORE manifest — tenant data (menu, config, FAQs) never
 * lives in these files; a later `core-layout.test.ts` enforces the split.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_VERSION = "1.1.0";

/** Files whose bytes define Core behaviour (relative to src/). */
export const CORE_FILES = [
  "session.ts",
  "tools.ts",
  "cart-engine.ts",
  "playbook.ts",
  "prompt.ts",
  "transfer-policy.ts",
  "reservation-date.ts",
  "street-compare.ts",
  "robocall-detect.ts",
  "dialogue-state.ts",
  "turn-context.ts",
  "compaction.ts",
  "claims-guard.ts",
  "narration-filter.ts",
  "asr-normalize.ts",
  "spoken-numbers.ts",
  "voice-i18n.ts",
  "menu-index.ts",
  "compiler-port.ts",
  "media/media-session.ts",
  "media/stt.ts",
  "media/tts.ts",
] as const;

let cached: string | null = null;

/** sha256 (first 12 hex) over the core files present on disk; "unknown" when
 *  the sources are not readable (never throws — a version stamp must not be
 *  able to stop a call). Computed once per process. */
export function coreContentHash(): string {
  if (cached) return cached;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const h = createHash("sha256");
    let any = false;
    for (const f of CORE_FILES) {
      try {
        h.update(f).update("\0").update(readFileSync(join(here, f))).update("\0");
        any = true;
      } catch {
        /* a missing file just doesn't contribute */
      }
    }
    cached = any ? h.digest("hex").slice(0, 12) : "unknown";
  } catch {
    cached = "unknown";
  }
  return cached;
}

/** The git sha the image was built from (nabil-release.ts --build-arg GIT_SHA). */
export function gitSha(): string | null {
  const s = (process.env.NABIL_GIT_SHA || "").trim();
  return s && s !== "dev" ? s : null;
}
