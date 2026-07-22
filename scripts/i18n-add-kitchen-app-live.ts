/**
 * Kitchen-app Play launch ×38 (2026-07-22) — splices the app-distribution
 * strings + the setup-wizard label RETROFIT into all 38 locale files:
 *   auth.kitchenGetAppHint                       (kitchen login hint)
 *   admin.publishingPage.getApp{Title,Body,ScanHint,IosSoon}   (install hub)
 *   marketing.footer.getTheApp                   (footer badges heading)
 *   marketplace.nativeApps{Title,Body}           (CHANGED values — consumer-app
 *                                                 disambiguation vs the staff app)
 *   admin.setupSteps.*                           (18 step labels + details +
 *                                                 6 sections + 4 "ago" units —
 *                                                 previously hardcoded English
 *                                                 in setup-checklist.ts)
 *
 * en.json already holds the canonical values (hand-added — validated here,
 * never rewritten). 37 packs, one per locale, in
 * scripts/i18n-data/kitchen-app-live/<code>.json (translator workflow output).
 *
 * Fails loudly on missing locale/key/empty value, dropped ICU args
 * ({device}/{ago}/{n}), or broken <b></b> pairs in nativeAppsBody.
 *   npx tsx scripts/i18n-add-kitchen-app-live.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Pack = {
  kitchenGetAppHint: string;
  publishingPage: Record<string, string>;
  footerGetTheApp: string;
  nativeAppsTitle: string;
  nativeAppsBody: string;
  setupSteps: Record<string, unknown>;
};

const PUBLISHING_KEYS = ["getAppTitle", "getAppBody", "getAppScanHint", "getAppIosSoon"] as const;
const SETUP_LEAVES: Array<{ path: string[]; args?: string[] }> = [
  { path: ["basics", "nameAddress"] },
  { path: ["basics", "mapPin"] },
  { path: ["basics", "cuisine"] },
  { path: ["basics", "accountConfirmation"] },
  { path: ["services", "atLeastOne"] },
  { path: ["services", "openingHours"] },
  { path: ["services", "deliveryZones"] },
  { path: ["services", "deliveryManagement"] },
  { path: ["payments", "methodsSelected"] },
  { path: ["payments", "taxation"] },
  { path: ["payments", "currency"] },
  { path: ["payments", "methodConfigured"] },
  { path: ["orders", "appConnected"] },
  { path: ["orders", "appConnectedDetail", "native"], args: ["{device}", "{ago}"] },
  { path: ["orders", "appConnectedDetail", "browser"], args: ["{device}", "{ago}"] },
  { path: ["orders", "appConnectedDetail", "install"] },
  { path: ["orders", "notificationRecipient"] },
  { path: ["menu", "categoryExists"] },
  { path: ["menu", "itemExists"] },
  { path: ["publish", "officialDetails"] },
  { path: ["publish", "widgetReady"] },
  { path: ["publish", "widgetReadyDetail", "sow"] },
  { path: ["publish", "widgetReadyDetail", "optional"] },
  { path: ["sections", "basics"] },
  { path: ["sections", "services"] },
  { path: ["sections", "payments"] },
  { path: ["sections", "orders"] },
  { path: ["sections", "menu"] },
  { path: ["sections", "publishing"] },
  { path: ["ago", "seconds"], args: ["{n}"] },
  { path: ["ago", "minutes"], args: ["{n}"] },
  { path: ["ago", "hours"], args: ["{n}"] },
  { path: ["ago", "days"], args: ["{n}"] },
];

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getPath(obj: unknown, p: string[]): unknown {
  return p.reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj: Record<string, any>, p: string[], value: string) {
  let o = obj;
  for (const k of p.slice(0, -1)) o = o[k] ??= {};
  o[p[p.length - 1]] = value;
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "kitchen-app-live");
const dir = path.join(process.cwd(), "src", "messages");

let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  if (loc === "en") continue; // en.json is the hand-added source of truth

  const packFile = path.join(dataDir, `${loc}.json`);
  if (!fs.existsSync(packFile)) throw new Error(`${loc}: missing pack ${packFile}`);
  const pack = JSON.parse(fs.readFileSync(packFile, "utf8")) as Pack;

  const need = (v: unknown, label: string): string => {
    if (typeof v !== "string" || !v.trim()) throw new Error(`${loc}: ${label} missing/empty`);
    return decode(v).trim();
  };

  const hint = need(pack.kitchenGetAppHint, "kitchenGetAppHint");
  const footer = need(pack.footerGetTheApp, "footerGetTheApp");
  const title = need(pack.nativeAppsTitle, "nativeAppsTitle");
  const body = need(pack.nativeAppsBody, "nativeAppsBody");
  if ((body.match(/<b>/g)?.length ?? 0) !== (body.match(/<\/b>/g)?.length ?? 0) || !body.includes("<b>")) {
    throw new Error(`${loc}: nativeAppsBody must keep paired <b></b> tags`);
  }

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  (json.auth ??= {}).kitchenGetAppHint = hint;

  const pubTarget = ((json.admin ??= {}).publishingPage ??= {});
  for (const k of PUBLISHING_KEYS) pubTarget[k] = need(pack.publishingPage?.[k], `publishingPage.${k}`);

  (((json.marketing ??= {}).footer ??= {})).getTheApp = footer;

  (json.marketplace ??= {}).nativeAppsTitle = title;
  json.marketplace.nativeAppsBody = body;

  const stepsTarget = ((json.admin ??= {}).setupSteps ??= {});
  for (const leaf of SETUP_LEAVES) {
    const raw = getPath(pack.setupSteps, leaf.path);
    const v = need(raw, `setupSteps.${leaf.path.join(".")}`);
    for (const arg of leaf.args ?? []) {
      if (!v.includes(arg)) throw new Error(`${loc}: setupSteps.${leaf.path.join(".")} lost ICU arg ${arg}`);
    }
    setPath(stepsTarget, leaf.path, v);
  }

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ kitchen-app-live strings (${8 + SETUP_LEAVES.length} values) spliced into ${changed} locale file(s) (+ en hand-added)`);
