/**
 * Native app-version bridge — reads the running Kitchen Order App's version via the
 * OrderAlarm Capacitor plugin's getInfo() (added in v2.7). Used to show "vX.Y" in the
 * kitchen 3-dot menu + the kitchen login screen, so we (and testers) always know which
 * build a device is on. Returns null in a plain browser and on pre-v2.7 apps (no getInfo)
 * — the UI then shows nothing. Mirrors the loose window.Capacitor access of
 * native-order-alarm.ts. Luigi 2026-06-23 (A1).
 */

export async function getNativeAppVersion(): Promise<string | null> {
  if (typeof window === "undefined") return null; // SSR
  const cap = (window as any).Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  // Android exposes getInfo() on the OrderAlarm plugin (the native alarm
  // engine). iOS has no OrderAlarm — its DirectPrinter plugin carries the
  // same getInfo() instead (added 2026-07-04 so iPhone/iPad show the build
  // in the 3-dot menu like Android does). Try both; first answer wins.
  for (const name of ["OrderAlarm", "DirectPrinter"]) {
    const plugin = cap.Plugins?.[name];
    if (!plugin || typeof plugin.getInfo !== "function") continue;
    try {
      const info = await plugin.getInfo();
      const v = info?.version;
      if (typeof v === "string" && v.length > 0) return v;
    } catch {
      /* try the next plugin */
    }
  }
  return null;
}
