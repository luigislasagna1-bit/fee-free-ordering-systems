/**
 * Upload the kitchen Android debug APK to the project's own Vercel Blob store
 * and print a public download link to send to a tester.
 *
 *   npx tsx --env-file=.env.local scripts/upload-apk-to-blob.ts
 *
 * Requires BLOB_READ_WRITE_TOKEN in .env.local (Vercel → your project →
 * Storage → Blob → ".env.local" snippet). The link is unguessable (random
 * suffix) and served from *your* Vercel storage — not a third-party host.
 */
import { put } from "@vercel/blob";
import { readFileSync, statSync } from "node:fs";

const APK_PATH = "android/app/build/outputs/apk/debug/app-debug.apk";

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "✗ BLOB_READ_WRITE_TOKEN missing. Add it to .env.local (Vercel → project → Storage → your Blob store → .env.local snippet), then re-run.",
    );
    process.exit(1);
  }
  const sizeMb = (statSync(APK_PATH).size / (1024 * 1024)).toFixed(1);
  console.log(`Uploading ${APK_PATH} (${sizeMb} MB) to Vercel Blob…`);
  const blob = await put("fee-free-order-app.apk", readFileSync(APK_PATH), {
    access: "public",
    contentType: "application/vnd.android.package-archive",
    addRandomSuffix: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  console.log("\n✓ Uploaded. Send this link to your tester:\n");
  console.log("   " + blob.url + "\n");
}

main().catch((e) => {
  console.error("Upload failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
