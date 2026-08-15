/**
 * READ-ONLY: freeze everything the Nabil voice agent can see for one restaurant
 * into a `MenuSnapshot` fixture (src/lib/voice/sim/snapshot-types.ts), so the
 * agent can be exercised offline against the exact data a real call would have.
 *
 *   npx tsx scripts/nabil-snapshot-menu.ts <slug> [--out path] [--db prod|dev]
 *
 *   --db dev   (default) the ACTIVE DATABASE_URL in .env.local / .env
 *   --db prod  the COMMENTED-OUT production DATABASE_URL in .env.local — the
 *              same line scripts/run-on-prod.ts recognises — but read here into
 *              process.env only. .env.local is NEVER rewritten, and this script
 *              only ever SELECTs.
 *   --out      defaults to src/lib/voice/sim/fixtures/<slug>.menu.json
 *
 * The three payloads come from the SAME builders the live routes use
 * (`buildVoiceMenuPayload`, `buildVoiceContextPayload`, `shapeItemData` /
 * `loadComboData`), so a fixture and a call can never disagree. Everything is
 * imported DYNAMICALLY, after DATABASE_URL is decided, because src/lib/db.ts
 * reads the URL once at module load.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

config({ path: ".env.local" });
config({ path: ".env" });

// The item loader imports the Next-only marker "server-only", which doesn't
// resolve under tsx. Reroute just that specifier to an empty module (same
// shim as scripts/_verify-mark-all-read.ts).
const req = createRequire(import.meta.url);
const Module = req("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return req.resolve("./_noop.cjs");
  return origResolve.call(this, request, ...rest);
};

/* ─────────────────────────────── args ──────────────────────────────────── */

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let out: string | undefined;
  let db: "prod" | "dev" = "dev";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a.startsWith("--out=")) out = a.slice("--out=".length);
    else if (a === "--db") db = argv[++i] as "prod" | "dev";
    else if (a.startsWith("--db=")) db = a.slice("--db=".length) as "prod" | "dev";
    else if (a.startsWith("--")) throw new Error(`Unknown flag ${a}`);
    else positional.push(a);
  }
  const slug = (positional[0] || "").toLowerCase().trim();
  if (!slug) throw new Error("Usage: npx tsx scripts/nabil-snapshot-menu.ts <slug> [--out path] [--db prod|dev]");
  if (db !== "prod" && db !== "dev") throw new Error(`--db must be prod or dev, got ${db}`);
  return { slug, out, db };
}

/** The commented-out `# DATABASE_URL="…"` line in .env.local is production
 *  (see scripts/run-on-prod.ts). Read it; never write it back. */
function productionUrlFromEnvLocal(): string {
  const text = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) url = m[1];
  }
  if (!url) throw new Error("No commented-out DATABASE_URL found in .env.local — can't identify production DB.");
  return url;
}

const mask = (u: string) => u.replace(/:[^:@]+@/, ":***@");
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/* ─────────────────────────────── main ──────────────────────────────────── */

async function main() {
  const { slug, out, db } = parseArgs(process.argv.slice(2));

  if (db === "prod") {
    process.env.DATABASE_URL = productionUrlFromEnvLocal();
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  console.log(`[snapshot] db=${db} → ${mask(process.env.DATABASE_URL)}`);

  // Dynamic imports AFTER the URL is decided (src/lib/db.ts reads it at load).
  const [
    { default: prisma },
    { buildVoiceMenuPayload },
    { buildVoiceContextPayload },
    { loadRawItem, loadComboData, shapeItemData, VOICE_ITEM_INCLUDE },
    { resolveMenuRestaurantId },
    { hashJson, stableStringify },
  ] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/voice/menu-payload"),
    import("../src/lib/voice/context-payload"),
    import("../src/lib/voice/item-loader"),
    import("../src/lib/brand"),
    import("../src/lib/voice/sim/snapshot-hash"),
  ]);
  type MenuSnapshot = import("../src/lib/voice/sim/snapshot-types").MenuSnapshot;
  type SnapshotComboData = import("../src/lib/voice/sim/snapshot-types").SnapshotComboData;
  type ItemData = import("../src/lib/voice/order-line-compiler").ItemData;

  const capturedAt = new Date().toISOString();

  // 1. The two prompt payloads, exactly as the routes would return them.
  const menuRes = await buildVoiceMenuPayload(slug);
  if (menuRes.status !== 200) throw new Error(`get_menu for ${slug}: ${menuRes.status} ${menuRes.body.code}`);
  const contextRes = await buildVoiceContextPayload(slug);
  if (contextRes.status !== 200) throw new Error(`context for ${slug}: ${contextRes.status} ${contextRes.body.code}`);
  const menu = menuRes.body;
  const context = contextRes.body;
  const restaurantId = menu.restaurant.id;
  const menuRestaurantId = await resolveMenuRestaurantId(restaurantId);

  // 2. EVERY orderable item, in the exact `item` shape get_item_options returns
  //    (shapeItemData over VOICE_ITEM_INCLUDE — the same include loadRawItem
  //    uses, batched so a 400-item menu isn't 400 round trips to Neon).
  const ITEM_CAP = 5000;
  const rawItems = await prisma.menuItem.findMany({
    where: { restaurantId: menuRestaurantId, isAvailable: true },
    include: VOICE_ITEM_INCLUDE,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    take: ITEM_CAP,
  });
  if (rawItems.length >= ITEM_CAP) console.warn(`[snapshot] WARNING: hit ITEM_CAP=${ITEM_CAP}; snapshot may be incomplete`);

  const items: Record<string, ItemData> = {};
  let pizzas = 0;
  for (const raw of rawItems) {
    items[raw.id] = shapeItemData(raw);
    if (raw.pizzaConfig) pizzas++;
  }

  // 3. Combos: the `combo` half of get_item_options for every combo item, with
  //    each slot's choices stored as ids into `items` (plus the per-pick size
  //    restriction, so hydrateComboData rebuilds loadComboData's output exactly).
  const combos: Record<string, SnapshotComboData> = {};
  let hydratedExtra = 0;
  for (const raw of rawItems) {
    if (!raw.comboConfig) continue;
    const combo = await loadComboData(menuRestaurantId, raw);
    if (!combo) continue; // unparseable comboConfig — get_item_options would return combo:null too
    const { slots, ...rest } = combo;
    combos[raw.id] = {
      ...rest,
      slots: await Promise.all(
        slots.map(async ({ choices, ...slot }) => {
          const choiceIds: string[] = [];
          const choiceVariantIds: Record<string, string[]> = {};
          for (const ch of choices) {
            choiceIds.push(ch.menuItemId);
            // Guarantee the reference resolves: a pick outside our batch (should
            // not happen — same restaurant + isAvailable filter — but never
            // leave a dangling id) is loaded through the real single-item path.
            if (!items[ch.menuItemId]) {
              const r = await loadRawItem(menuRestaurantId, ch.menuItemId);
              items[ch.menuItemId] = r ? shapeItemData(r) : ch;
              hydratedExtra++;
            }
            const full = items[ch.menuItemId];
            const fullIds = full.variants.map((v) => v.variantId);
            const chIds = ch.variants.map((v) => v.variantId);
            if (chIds.length !== fullIds.length || chIds.some((id, i) => id !== fullIds[i])) {
              choiceVariantIds[ch.menuItemId] = chIds;
            }
          }
          return {
            ...slot,
            choiceIds,
            ...(Object.keys(choiceVariantIds).length ? { choiceVariantIds } : {}),
          };
        }),
      ),
    };
  }

  // 4. Pricing facts the simulator needs to price/validate an order offline.
  const pricing: MenuSnapshot["pricing"] = {
    currency: menu.restaurant.currency,
    taxRatePct: context.restaurant.taxRatePct,
    deliveryFee: context.delivery.deliveryFee,
    minimumOrder: context.delivery.minimumOrder,
    zones: context.delivery.zones ?? [],
  };

  const snapshot: MenuSnapshot = {
    version: 1,
    slug,
    restaurantId,
    menuRestaurantId,
    capturedAt,
    // EXACTLY the /menu body — the voice service hashes the parsed response the
    // same way (stableStringify → sha256 → 16 hex), so the two agree.
    menuHash: hashJson(menu),
    hash: hashJson({ menu, items, combos, pricing }),
    menu,
    context,
    items,
    combos,
    pricing,
    addresses: [], // hand-curated later
  };

  const outPath = resolve(out ?? `src/lib/voice/sim/fixtures/${slug}.menu.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  const text = stableStringify(snapshot, 2) + "\n";
  writeFileSync(outPath, text, "utf8");

  const menuItemCount = menu.menu.reduce((n, c) => n + c.items.length, 0);
  console.log(`[snapshot] wrote ${outPath} (${kb(Buffer.byteLength(text, "utf8"))})`);
  console.log(`[snapshot] restaurant=${menu.restaurant.name} id=${restaurantId} menuRestaurantId=${menuRestaurantId}`);
  console.log(`[snapshot] menuHash=${snapshot.menuHash} hash=${snapshot.hash} capturedAt=${capturedAt}`);
  console.log(
    `[snapshot] menu: ${menu.menu.length} categories / ${menuItemCount} items visible today, ${menu.notToday.length} notToday, ${menu.speechHints.length} speechHints`,
  );
  console.log(
    `[snapshot] items: ${Object.keys(items).length} (pizzas ${pizzas}, combos ${Object.keys(combos).length}${hydratedExtra ? `, +${hydratedExtra} loaded for combo refs` : ""})`,
  );
  console.log(`[snapshot] context: open=${context.open.isOpenNow} zones=${context.delivery.zones.length} faqs=${context.faqs.length} upsells=${context.upsells.length}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
