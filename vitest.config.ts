import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest config — a DEV-ONLY unit-test runner. Tests live next to the code as
// *.test.ts and NEVER ship to production: they're excluded from the app build
// and typecheck (see tsconfig.json "exclude"), and Vitest is a devDependency.
// The `@` alias mirrors tsconfig so tests import modules exactly like the app
// does. Run all tests once with `npm test`, or watch with `npm run test:watch`.
// Luigi 2026-06-15.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // These budgets cover COLD MODULE LOADING, not slow assertions. This suite
    // is import-bound: a full idle run measures ~417s of import against ~39s of
    // actual test time. Much of that import is billed to a TEST, because the
    // heavy graph is pulled in from inside the test body rather than at the top
    // of the file — `getDict()` dynamically imports two ~500KB message catalogs
    // (src/lib/i18n-dict.ts), and receipt/route helpers do the same one level
    // down, where it can't be hoisted out without changing what the test drives.
    // Only the FIRST test in a file pays it (getDict memoizes per locale), which
    // is why the default 5000ms produced "Test timed out in 5000ms" on a cold
    // first test whose assertions ran in milliseconds — and why it struck at
    // random, sparing an idle machine but failing 30 tests when a `next build`
    // was competing for the same 8 cores. Preflight is the mandatory pre-push
    // gate, so that flake trained people to ignore red.
    // 30s is ~2x the worst cold import measured (14.84s) and ~10x the slowest
    // real test, so it absorbs load contention while still catching a genuine
    // hang. Raising it weakens nothing: a timeout is a liveness guard, not an
    // assertion. hookTimeout is raised in step (its default is 10000ms) so the
    // same cold load can't simply relocate into a beforeAll/beforeEach.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
