/**
 * Native printer bridge — typed wrapper around the DirectPrinter
 * Capacitor plugin.
 *
 * The DirectPrinter plugin only exists when the kitchen page is running
 * inside the Capacitor native app shell (Android APK or iOS .ipa). In
 * the regular web browser it doesn't exist at all — `isNativePrinter
 * Available()` lets the kitchen UI gracefully fall back to the
 * PrintNode-based "browser print" path when running on desktop.
 *
 * Source of bytes: the server endpoint /api/kitchen/print-job/[orderId]
 * generates ESC/POS-encoded bytes for the order and returns them as
 * base64. We feed those bytes straight to the plugin which opens a TCP
 * socket to the printer at the user-configured IP and writes them.
 *
 * No vendor SDK is involved — ESC/POS over port 9100 ("RAW print") is
 * the open standard that Star, Epson, Bixolon, and Citizen receipt
 * printers all support. If the restaurant later adds a printer that
 * needs vendor-specific commands (label printers, kitchen ticket
 * printers with cutters in non-standard positions), we'd extend the
 * server-side encoder, not this client.
 */

// Capacitor types — keeping them loose with `any` so this file builds
// cleanly even when Capacitor isn't installed in environments that
// don't need it (e.g. CI for the SSR Next.js bundle). Tightening to
// the @capacitor/core types is optional polish.
type CapacitorGlobal = {
  isNativePlatform: () => boolean;
  Plugins: {
    DirectPrinter?: {
      print: (opts: NativePrintOpts) => Promise<NativePrintResult>;
      ping: (opts: NativePingOpts) => Promise<NativePingResult>;
    };
  };
};

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

export interface NativePrintOpts {
  /** Printer IP on the local network, e.g. "192.168.1.50". */
  ip: string;
  /** TCP port. Default 9100 (RAW print). */
  port?: number;
  /** ESC/POS payload, base64-encoded. */
  bytes: string;
  /** Connection + send timeout. Default 5000ms. */
  timeoutMs?: number;
}

export interface NativePrintResult {
  ok: true;
  bytesWritten: number;
}

export interface NativePingOpts {
  ip: string;
  port?: number;
  timeoutMs?: number;
}

export interface NativePingResult {
  ok: true;
  reachable: true;
}

/** Specific failure modes the plugin emits, matching both the Android
 *  Java and iOS Swift implementations. UI maps these to friendly copy. */
export type NativePrinterReason =
  | "timeout"
  | "refused"
  | "unreachable"
  | "io_error";

/** Caller-friendly mapping of reason codes to actionable copy. Used
 *  by the kitchen settings page's test-print button + by the order
 *  acceptance handler when an auto-print fails. */
export function nativePrinterErrorCopy(reason: NativePrinterReason | string): string {
  switch (reason) {
    case "timeout":
      return "Printer didn't respond — check that it's powered on and connected to the same Wi-Fi.";
    case "refused":
      return "Printer reachable but the print port (9100) isn't open. Check the printer's web admin to enable RAW print, or restart the printer.";
    case "unreachable":
      return "Can't reach printer. Double-check the IP address and that this tablet is on the same network as the printer.";
    case "io_error":
      return "Print failed mid-job. Try again, and if it keeps happening, restart the printer.";
    default:
      return "Print failed. Check printer connection and try again.";
  }
}

/** True when running inside the Capacitor native app AND the
 *  DirectPrinter plugin is available. False on plain web browsers
 *  (where the kitchen UI should keep using PrintNode). */
export function isNativePrinterAvailable(): boolean {
  if (typeof window === "undefined") return false; // SSR
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function") return false;
  if (!cap.isNativePlatform()) return false;
  return !!cap.Plugins?.DirectPrinter;
}

/** Send raw ESC/POS bytes to a network printer. Throws if the plugin
 *  isn't available — callers should gate with isNativePrinterAvailable()
 *  first OR catch the throw and fall back to PrintNode. */
export async function nativePrint(opts: NativePrintOpts): Promise<NativePrintResult> {
  if (!isNativePrinterAvailable()) {
    throw new Error("Native printer plugin not available — running in browser?");
  }
  // Non-null assertion safe because isNativePrinterAvailable verified it.
  const plugin = window.Capacitor!.Plugins.DirectPrinter!;
  return plugin.print(opts);
}

/** Test connectivity without sending a payload. Used by the kitchen
 *  settings "Test connection" button so the operator can verify the IP
 *  before queueing real orders. */
export async function nativePing(opts: NativePingOpts): Promise<NativePingResult> {
  if (!isNativePrinterAvailable()) {
    throw new Error("Native printer plugin not available — running in browser?");
  }
  const plugin = window.Capacitor!.Plugins.DirectPrinter!;
  return plugin.ping(opts);
}
