/**
 * Kitchen gear-panel settings i18n ×38 (Fabrizio report cmrldhwep, 2026-07-22)
 * — the "Restaurant settings" panel + StockPanel + EndOfDayModal chrome +
 * native-printer error copy + the DispatchModeToggle modal were hardcoded
 * English, so Italian staff saw an EN/IT mix. en.json holds the canonical
 * values (hand-added, validated here); 37 flat packs in
 * scripts/i18n-data/kitchen-settings/<code>.json.
 *
 * Fails loudly on missing locale/key/empty value or dropped ICU pieces.
 *   npx tsx scripts/i18n-add-kitchen-settings.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

/** key → required ICU fragments that must survive translation */
const KEYS: Record<string, string[]> = {
  rsTitle: [], rsTabPause: [], rsTabStock: [], rsTabPrefs: [], rsTabDayReport: [],
  svcPickup: [], svcDelivery: [], svcDineIn: [], svcCatering: [], svcTakeBake: [], svcReservations: [],
  dur30m: [], dur1h: [], dur2h: [],
  pauseIntro: [], pausePickServices: [], pauseNoServices: [],
  pausedUntil: ["{time}"], pauseHowLong: [], pauseFor: ["{duration}"],
  pauseRestOfDay: [], pauseResumeNow: [], pauseSaving: [],
  pausePickFirst: [], pauseFailedStatus: ["{status}"],
  pauseToastResumed: ["plural", "one {", "other {"],
  pauseToastPaused: ["plural", "one {", "other {"],
  genericFailed: [],
  eodIntroPanel: [], eodRowTitle: [], eodRowSubtitle: [],
  prefsIntro: [], prefsSoundTitle: [], prefsSoundMuted: [],
  prefsSoundVolumeLow: ["{n}"], prefsSoundVolume: ["{n}"],
  prefsDayNight: [], prefsDayNightNowDay: [], prefsDayNightNowNight: [],
  prefsBadgeDay: [], prefsBadgeNight: [],
  prefsPrinterTitle: [], prefsPrinterNone: [], prefsRefreshTitle: [], prefsRefreshSubtitle: [],
  stockPriceInvalid: [], stockPriceSaveFailed: [], stockPriceUpdated: ["{price}"],
  stockSearchPlaceholder: [], stockLoading: [], stockNoMatch: [], stockNoItems: [],
  stockPricedBySize: [], stockRestock: [], stockMarkOut: [],
  stockPriceAriaVariant: ["{item}", "{variant}"], stockPriceAria: ["{item}"],
  stockFooterHint: [],
  navOrdersLabel: [], navSettingsLabel: [], navSettingsTooltip: [], soundVolumeAria: [],
  printerDirectLabel: ["{ip}"], printerConnectedLabel: [], printerLanNotConfigured: [],
  eodLoadFailed: [], eodNothingToPrint: [], eodPrinted: [], eodPrintFailed: [],
  eodRefresh: [], eodLoading: [], eodClose: [], eodPrinting: [], eodPrintButton: [],
  printerErrTimeout: [], printerErrRefused: [], printerErrUnreachable: [], printerErrIo: [], printerErrGeneric: [],
  dispatchSwitchFailed: [], dispatchToastInhouse: [], dispatchToastShipday: [],
  dispatchInhouseShort: [], dispatchShipdayShort: [], dispatchTooltip: [],
  dispatchButtonLabel: ["{label}"], dispatchTitle: [], dispatchIntro: [], dispatchClose: [],
  dispatchInhouseOption: [], dispatchShipdayOption: [], dispatchActiveBadge: [],
  dispatchInhouseDesc: [], dispatchShipdayDesc: [], dispatchFooterHint: [], dispatchSwitching: [],
};

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "kitchen-settings");
const dir = path.join(process.cwd(), "src", "messages");

// Validate en.json completeness first (source of truth, never rewritten).
const enKitchen = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8")).kitchen;
for (const k of Object.keys(KEYS)) {
  if (typeof enKitchen?.[k] !== "string") throw new Error(`en.json kitchen.${k} missing`);
}

let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  if (loc === "en") continue;
  const packFile = path.join(dataDir, `${loc}.json`);
  if (!fs.existsSync(packFile)) throw new Error(`${loc}: missing pack ${packFile}`);
  const pack = JSON.parse(fs.readFileSync(packFile, "utf8")) as Record<string, string>;

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const kitchen = (json.kitchen ??= {});

  // The translator packs carry prefsDayNightNow as an ICU select — but the
  // parity audit's stripper doesn't understand custom select branch names
  // (`day {…}`), so we DECOMPOSE it into two plain keys instead. Extract the
  // day/other branch texts and inline them into the surrounding template.
  if (typeof pack.prefsDayNightNow === "string" && !pack.prefsDayNightNowDay) {
    const m = pack.prefsDayNightNow.match(/\{\s*mode\s*,\s*select\s*,\s*day\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\s*\}/);
    if (!m) throw new Error(`${loc}: prefsDayNightNow select form unparseable`);
    pack.prefsDayNightNowDay = pack.prefsDayNightNow.replace(m[0], m[1]);
    pack.prefsDayNightNowNight = pack.prefsDayNightNow.replace(m[0], m[2]);
    delete pack.prefsDayNightNow;
  }
  // Remove the retired select key if an earlier splice run wrote it.
  delete kitchen.prefsDayNightNow;

  for (const [k, frags] of Object.entries(KEYS)) {
    const v = pack[k];
    if (typeof v !== "string" || !v.trim()) throw new Error(`${loc}: ${k} missing/empty`);
    const clean = decode(v).trim();
    for (const f of frags) {
      if (!clean.includes(f)) throw new Error(`${loc}: ${k} lost required ICU fragment "${f}"`);
    }
    kitchen[k] = clean;
  }
  const extra = Object.keys(pack).filter((k) => !(k in KEYS));
  if (extra.length) throw new Error(`${loc}: unexpected extra pack keys: ${extra.join(", ")}`);

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ kitchen settings-panel strings (${Object.keys(KEYS).length} keys) spliced into ${changed} locale file(s) (+ en hand-added)`);
