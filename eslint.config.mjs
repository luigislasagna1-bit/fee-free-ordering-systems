import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // CASL compliance chokepoint (2026-08-04): the Resend client may ONLY be
  // imported by src/lib/email.ts. All marketing/automated mail must go through
  // sendMarketingEmail() (suppression + consent gate + CASL footer); all other
  // mail through the private send() there. This rule stops a future add-on from
  // quietly calling resend.emails.send() and bypassing the do-not-email list.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/email.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "resend",
              message:
                "Do not import `resend` directly. Marketing email must go through sendMarketingEmail() and all email through src/lib/email.ts — the CASL suppression/consent chokepoint.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
