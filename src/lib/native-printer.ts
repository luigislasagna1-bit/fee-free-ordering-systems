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
      discover?: (opts: NativeDiscoverOpts) => Promise<NativeDiscoverResult>;
    };
  };
};

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

/** A single styled line in a structured receipt. Sent to Star printers
 *  via the StarXpand bitmap renderer, which produces a properly
 *  formatted receipt regardless of the printer's emulation mode.
 *  Mirror of ReceiptLine from `@/lib/receipt-lines` so the JS bridge
 *  and the server share a single contract. */
export type ReceiptLine =
  | {
      kind: "text";
      text: string;
      fontSize?: number;
      bold?: boolean;
      align?: "left" | "center" | "right";
      /** Black background, white text — used for kitchen "DELIVERY" badge. */
      highlight?: boolean;
    }
  | {
      kind: "twoCol";
      left: string;
      right: string;
      fontSize?: number;
      bold?: boolean;
      highlight?: boolean;
    }
  | { kind: "divider" }
  | { kind: "feed"; count: number }
  | { kind: "cut" };

export interface NativePrintOpts {
  /** Printer IP on the local network, e.g. "192.168.1.50". */
  ip: string;
  /** TCP port. Default 9100 (RAW print). */
  port?: number;
  /** ESC/POS payload, base64-encoded. Used as fallback for non-Star
   *  printers (Epson, Bixolon, etc.) via raw TCP. */
  bytes: string;
  /** Structured receipt for Star printers. Native plugin prefers this
   *  when present — bitmap-renders via StarXpand SDK, which is the
   *  only path that reliably prints on Star TSP-series printers. */
  lines?: ReceiptLine[];
  /** Paper width in dots. Default 576 (80mm). 384 for 58mm paper.
   *  Determines bitmap rendering width on the native side. */
  paperWidthDots?: number;
  /** Connection + send timeout. Default 5000ms. */
  timeoutMs?: number;
}

export interface NativePrintResult {
  ok: true;
  bytesWritten: number;
  /** Which underlying transport actually printed:
   *    "star" — Star SDK / IPort (used for Star-family printers)
   *    "raw"  — raw TCP socket (Epson/Bixolon/Citizen + fallback)
   *  Surfaced so the Test Print UI can show which path worked,
   *  helps diagnose printer-compatibility issues. */
  method?: "star" | "raw";
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

export interface NativeDiscoverOpts {
  /** How long to scan, in milliseconds. Default 4000. Clamped 1000-10000
   *  by the native side. Most printers respond within 2-3 seconds; we
   *  pad to 4 to handle stragglers on busy Wi-Fi. */
  durationMs?: number;
}

export interface DiscoveredPrinter {
  /** Service name advertised by the printer ("Star_TSP143IIIW_xxxx"). */
  name: string;
  /** IP address on the local subnet. */
  ip: string;
  /** Print port — always 9100 for the RAW print path we use. */
  port: number;
  /** mDNS service type that found it (_pdl-datastream._tcp etc.).
   *  Mostly diagnostic; you usually want printers found via
   *  _pdl-datastream since those explicitly advertise ESC/POS over
   *  raw TCP. The native plugins overrride port to 9100 regardless. */
  type: string;
}

export interface NativeDiscoverResult {
  ok: true;
  printers: DiscoveredPrinter[];
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

/**
 * Scan the local Wi-Fi network for receipt printers via mDNS / Bonjour.
 * GloriaFood-style auto-discovery — the kitchen operator clicks "Find
 * printers", we scan for 4 seconds, return a list of detected devices.
 *
 * Returns an empty list when:
 *   - No printers on the network are advertising (powered off, wrong VLAN)
 *   - The Wi-Fi router has multicast filtering (common on enterprise
 *     routers) blocking mDNS broadcasts
 *   - Discovery API itself is unavailable (rare; ancient Android pre-API 24)
 *
 * Caller should fall back to manual IP entry in any of those cases.
 */
export async function nativeDiscover(opts: NativeDiscoverOpts = {}): Promise<NativeDiscoverResult> {
  if (!isNativePrinterAvailable()) {
    throw new Error("Native printer plugin not available — running in browser?");
  }
  const plugin = window.Capacitor!.Plugins.DirectPrinter!;
  if (typeof plugin.discover !== "function") {
    // Older plugin shipped without discovery — graceful empty result so
    // the UI can render its manual-entry fallback without breaking.
    return { ok: true, printers: [] };
  }
  return plugin.discover(opts);
}
