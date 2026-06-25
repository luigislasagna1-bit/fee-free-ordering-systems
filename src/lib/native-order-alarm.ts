/**
 * Native order-alarm bridge — typed wrapper around the OrderAlarm Capacitor plugin.
 *
 * The OrderAlarm plugin exists ONLY in the v2.6+ Kitchen Order App (Android). Its very
 * PRESENCE is the signal that the app owns the ring via the NATIVE single engine, so the
 * kitchen WebView must SUPPRESS its own web ring (no double-ring). In a plain browser —
 * or on a v2.5 app, which has no OrderAlarm plugin — isNativeAlarmAvailable() is false, so
 * the web ring keeps working EXACTLY as before. That backward-compat gate is what makes
 * the web change safe to deploy before everyone upgrades to v2.6. Luigi 2026-06-23.
 *
 * The WebView drives the native ring's per-order HUSH (replicating the verified v2.4
 * stop-on-open-detail UX):
 *   - nativeHushAlarm()  — staff opened the SOLE pending order's detail → pause the ring.
 *   - nativeRearmAlarm() — staff backed out / a new order arrived / the app backgrounded
 *                          with an order still pending → resume the ring.
 *   - nativeStopAlarm()  — force-stop.
 *
 * All calls are best-effort + no-op off-app / on an older APK, so a new web build run
 * against an old shell never throws. We read window.Capacitor loosely (`any`) so this
 * file doesn't collide with the DirectPrinter bridge's global Window.Capacitor typing.
 */

/** True when running inside the Capacitor native app AND the v2.6 OrderAlarm plugin is
 *  present. False in a plain browser and on a v2.5 app — both keep the web ring. */
export function isNativeAlarmAvailable(): boolean {
  if (typeof window === "undefined") return false; // SSR
  const cap = (window as any).Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function") return false;
  if (!cap.isNativePlatform()) return false;
  return !!cap.Plugins?.OrderAlarm;
}

function orderAlarmPlugin(): any | null {
  if (!isNativeAlarmAvailable()) return null;
  return (window as any).Capacitor.Plugins.OrderAlarm ?? null;
}

/** PAUSE the native ring (staff opened the order detail). No-op off-app / old APK. */
export async function nativeHushAlarm(): Promise<void> {
  const p = orderAlarmPlugin();
  if (!p || typeof p.hush !== "function") return;
  try { await p.hush(); } catch { /* best-effort */ }
}

/** RESUME a hushed native ring (back-out / new order / app backgrounded while pending). */
export async function nativeRearmAlarm(): Promise<void> {
  const p = orderAlarmPlugin();
  if (!p || typeof p.rearm !== "function") return;
  try { await p.rearm(); } catch { /* best-effort */ }
}

/** Force-stop the native ring. */
export async function nativeStopAlarm(): Promise<void> {
  const p = orderAlarmPlugin();
  if (!p || typeof p.stop !== "function") return;
  try { await p.stop(); } catch { /* best-effort */ }
}

/** Hand the native app the restaurant's custom alert-sound URL (or null to clear) so it
 *  downloads + caches it for the screen-off ring. A cached custom sound REPLACES the built-in
 *  alarm on the app; on any failure the native side falls back to the built-in sound, so a ring
 *  always fires. No-op in a browser / on an older APK (no setCustomSound method). Luigi 2026-06-25. */
export async function nativeSetCustomSound(url: string | null): Promise<void> {
  const p = orderAlarmPlugin();
  if (!p || typeof p.setCustomSound !== "function") return;
  try { await p.setCustomSound({ url: url ?? "" }); } catch { /* best-effort */ }
}
