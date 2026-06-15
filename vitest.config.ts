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
  },
});
