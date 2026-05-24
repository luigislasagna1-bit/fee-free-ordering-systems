"use client";
/**
 * NativePrinterSetup — settings UI for the LAN-direct printer.
 *
 * Only renders when the kitchen page is running inside the Capacitor
 * native app shell (Android / iOS). In a regular browser this file
 * is harmless — isNativePrinterAvailable() returns false and the
 * caller renders PrinterSetupModal (PrintNode flow) instead.
 *
 * What it does:
 *   1. Lets the kitchen operator enter the printer's IP address
 *   2. Persists the IP + paper width + autoprint preference in
 *      localStorage (Capacitor Preferences would be cleaner but
 *      localStorage works fine and the values are non-sensitive)
 *   3. Provides "Test Connection" + "Test Print" buttons that hit
 *      the DirectPrinter native plugin so the operator can verify
 *      before going live
 *
 * Once configured, the order-accept handler in KitchenDisplay
 * checks for these saved values and auto-prints the receipt via
 * nativePrint() when accepting an order. See kitchen-print-helpers
 * for the integration point.
 */

import { useEffect, useState } from "react";
import {
  X, Printer, CheckCircle2, XCircle, Loader2, Wifi, AlertCircle, Sparkles, Search,
} from "lucide-react";
import {
  isNativePrinterAvailable,
  nativePing,
  nativePrint,
  nativeDiscover,
  nativePrinterErrorCopy,
  type NativePrinterReason,
  type DiscoveredPrinter,
} from "@/lib/native-printer";
import { EscPosBuilder } from "@/lib/escpos";

// localStorage keys — namespaced to ffo:kitchen-direct-printer:* so a
// future settings reset can wipe them cleanly with one prefix match.
const LS_KEYS = {
  enabled: "ffo:kitchen-direct-printer:enabled",
  ip: "ffo:kitchen-direct-printer:ip",
  port: "ffo:kitchen-direct-printer:port",
  paperWidth: "ffo:kitchen-direct-printer:paperWidth", // "58" | "80"
  autoprint: "ffo:kitchen-direct-printer:autoprint",
};

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

/**
 * Read the current direct-printer config from localStorage. Returns
 * null when running in a non-native browser OR when the operator
 * hasn't configured a printer IP yet — caller should fall back to
 * the PrintNode pipeline in those cases.
 */
export function getDirectPrinterConfig(): {
  ip: string;
  port: number;
  paperWidth: 58 | 80;
  autoprint: boolean;
} | null {
  if (!isNativePrinterAvailable()) return null;
  if (typeof window === "undefined") return null;
  try {
    if (localStorage.getItem(LS_KEYS.enabled) !== "1") return null;
    const ip = localStorage.getItem(LS_KEYS.ip);
    if (!ip) return null;
    const port = parseInt(localStorage.getItem(LS_KEYS.port) || "9100", 10);
    const paperWidth = (localStorage.getItem(LS_KEYS.paperWidth) || "80") === "58" ? 58 : 80;
    const autoprint = localStorage.getItem(LS_KEYS.autoprint) === "1";
    return { ip, port: Number.isFinite(port) ? port : 9100, paperWidth, autoprint };
  } catch {
    return null;
  }
}

export function NativePrinterSetup({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("9100");
  const [paperWidth, setPaperWidth] = useState<"58" | "80">("80");
  const [autoprint, setAutoprint] = useState(true);
  const [testState, setTestState] = useState<TestState>({ kind: "idle" });
  // Auto-discovery state. The "Find Printers" button kicks off a 4-second
  // mDNS scan; results populate `discovered`. When the list has entries,
  // they appear as cards above the manual IP input. Empty list +
  // discoveredAtLeastOnce=true → show "No printers found, enter IP below".
  const [discovered, setDiscovered] = useState<DiscoveredPrinter[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredAtLeastOnce, setDiscoveredAtLeastOnce] = useState(false);
  // Manual IP entry is hidden by default — the auto-discovery is the
  // GloriaFood-style intended path. Expand only when the operator
  // clicks the "Enter IP manually" link (or auto-expand if discovery
  // came up empty).
  const [showManualEntry, setShowManualEntry] = useState(false);

  // Load current settings on mount
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(LS_KEYS.enabled) === "1");
      setIp(localStorage.getItem(LS_KEYS.ip) || "");
      setPort(localStorage.getItem(LS_KEYS.port) || "9100");
      const w = localStorage.getItem(LS_KEYS.paperWidth);
      setPaperWidth(w === "58" ? "58" : "80");
      // Default true for autoprint — most operators want this on so
      // accepting an order automatically prints the kitchen ticket.
      setAutoprint(localStorage.getItem(LS_KEYS.autoprint) !== "0");
    } catch { /* localStorage blocked — sane defaults */ }
  }, []);

  const native = isNativePrinterAvailable();

  function save() {
    try {
      localStorage.setItem(LS_KEYS.enabled, enabled ? "1" : "0");
      localStorage.setItem(LS_KEYS.ip, ip);
      localStorage.setItem(LS_KEYS.port, port);
      localStorage.setItem(LS_KEYS.paperWidth, paperWidth);
      localStorage.setItem(LS_KEYS.autoprint, autoprint ? "1" : "0");
    } catch { /* noop */ }
  }

  async function findPrinters() {
    if (!native) return;
    setDiscovering(true);
    setDiscovered([]);
    try {
      // 7-second combined scan: mDNS + subnet scan run in parallel
      // inside the native plugin. Subnet scan probes every IP on the
      // local /24 for port 9100 — that's how we catch printers that
      // don't advertise via mDNS (Star TSP143IIIW being one).
      const res = await nativeDiscover({ durationMs: 7000 });
      setDiscovered(res.printers ?? []);
      setDiscoveredAtLeastOnce(true);
      // If no printers found, auto-show the manual entry box so the
      // user has somewhere to enter the IP.
      if (!res.printers || res.printers.length === 0) {
        setShowManualEntry(true);
      }
    } catch {
      // Plugin error — silent degradation; fall back to manual entry.
      setDiscovered([]);
      setDiscoveredAtLeastOnce(true);
      setShowManualEntry(true);
    } finally {
      setDiscovering(false);
    }
  }

  function selectDiscovered(p: DiscoveredPrinter) {
    const newIp = p.ip;
    const newPort = String(p.port || 9100);
    setIp(newIp);
    setPort(newPort);
    setEnabled(true);
    // Persist IMMEDIATELY so closing the modal without clicking
    // "Save & Close" still keeps the selection. (Bug: previously
    // selecting a discovered printer + closing X lost the IP.)
    try {
      localStorage.setItem(LS_KEYS.enabled, "1");
      localStorage.setItem(LS_KEYS.ip, newIp);
      localStorage.setItem(LS_KEYS.port, newPort);
    } catch { /* ignore */ }
    // Auto-test the selected printer using the explicit IP (NOT via
    // state because setIp is async and testConnection() reading state
    // would see the OLD value). Fixes the "Can't reach printer"
    // immediately followed by manual Test Connection working bug.
    runConnectivityTest(newIp, parseInt(newPort, 10) || 9100);
  }

  async function runConnectivityTest(testIp: string, testPort: number) {
    if (!native) return;
    setTestState({ kind: "testing" });
    try {
      await nativePing({ ip: testIp, port: testPort, timeoutMs: 4000 });
      setTestState({ kind: "success", message: `Reachable ✓ — printer responding at ${testIp}:${testPort}` });
    } catch (err: any) {
      const reason = (err?.code || err?.message || "") as NativePrinterReason | string;
      setTestState({ kind: "error", message: nativePrinterErrorCopy(reason) });
    }
  }

  async function testConnection() {
    if (!native) return;
    await runConnectivityTest(ip, parseInt(port, 10) || 9100);
  }

  // Persist any state change immediately so localStorage stays in sync.
  // Previously we saved only on close; if the user closed via the X
  // OR the app was force-closed, recent changes were lost. Now every
  // toggle / input change syncs through to localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(LS_KEYS.enabled, enabled ? "1" : "0");
      localStorage.setItem(LS_KEYS.ip, ip);
      localStorage.setItem(LS_KEYS.port, port);
      localStorage.setItem(LS_KEYS.paperWidth, paperWidth);
      localStorage.setItem(LS_KEYS.autoprint, autoprint ? "1" : "0");
    } catch { /* ignore */ }
  }, [enabled, ip, port, paperWidth, autoprint]);

  async function testPrint() {
    if (!native) return;
    setTestState({ kind: "testing" });
    try {
      // Minimal test print — bare ASCII text + line feeds + cut.
      // We deliberately AVOID the EscPosBuilder helpers (bold,
      // double-size, alignment) because those use commands that
      // differ between ESC/POS and Star Line Mode. If we can't
      // print this absolute baseline, the issue is connection-
      // level, not command-level. Iterating on formatting comes
      // after the bytes physically come out.
      //
      // Bytes:
      //   0x1B 0x40         = ESC @ (init printer — both modes)
      //   ASCII text + LF   = plain text content
      //   0x0A x3           = three line feeds (whitespace before cut)
      //   0x1B 0x64 0x02    = Star Line Mode partial cut
      //   0x1D 0x56 0x01    = ESC/POS partial cut (Star ignores)
      const bytes: number[] = [];
      const push = (s: string) => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); bytes.push(0x0a); };
      bytes.push(0x1b, 0x40); // ESC @ init
      push("FEE FREE TEST PRINT");
      push("");
      push(new Date().toLocaleString());
      push("");
      push("If you can read this,");
      push("the printer is working!");
      push("");
      bytes.push(0x0a, 0x0a, 0x0a); // feed
      bytes.push(0x1b, 0x64, 0x02); // Star partial cut
      bytes.push(0x1d, 0x56, 0x01); // ESC/POS partial cut
      const b64 = typeof Buffer !== "undefined"
        ? Buffer.from(new Uint8Array(bytes)).toString("base64")
        : btoa(String.fromCharCode(...bytes));
      const result = await nativePrint({
        ip,
        port: parseInt(port, 10) || 9100,
        bytes: b64,
        timeoutMs: 8000,
      });
      // Surface WHICH method actually printed (Star SDK vs raw TCP)
      // so we know which path is working. Huge debugging signal.
      const method = (result as any)?.method || "unknown";
      setTestState({
        kind: "success",
        message: `Test print sent via ${method === "star" ? "Star SDK ✓" : method === "raw" ? "raw TCP" : method}. Check your printer for paper.`,
      });
    } catch (err: any) {
      const reason = (err?.code || err?.message || "") as NativePrinterReason | string;
      setTestState({ kind: "error", message: nativePrinterErrorCopy(reason) });
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Printer className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <h2 className="text-lg font-bold text-gray-900 truncate">Direct Printer (LAN)</h2>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5 flex-shrink-0">
              <Sparkles className="w-3 h-3" /> RECOMMENDED
            </span>
          </div>
          <button
            type="button"
            onClick={() => { save(); onClose(); }}
            className="text-gray-400 hover:text-gray-700 p-1 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!native && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-sm text-amber-900">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Native app only</p>
                <p className="mt-1 leading-relaxed">
                  Direct LAN printing requires the Fee Free Kitchen native app for Android or iOS.
                  In a regular web browser, use the PrintNode setup instead.
                </p>
              </div>
            </div>
          )}

          {/* Master enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="rounded text-emerald-500 focus:ring-emerald-500 w-5 h-5"
            />
            <div>
              <div className="font-semibold text-gray-900">Use direct LAN printer</div>
              <div className="text-xs text-gray-500">
                Print straight from this tablet to your receipt printer over Wi-Fi.
                No PrintNode account, no monthly fee.
              </div>
            </div>
          </label>

          {/* Auto-discovery — primary path (GloriaFood-style). */}
          <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Find your printer
            </label>
            <button
              type="button"
              onClick={findPrinters}
              disabled={discovering || !native}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold text-sm transition"
            >
              {discovering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching for printers on your Wi-Fi…
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  {discoveredAtLeastOnce ? "Search again" : "Find printers on my Wi-Fi"}
                </>
              )}
            </button>
            <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
              Make sure the printer is powered on and connected to the same Wi-Fi network as this tablet.
            </p>

            {/* Discovered printers list */}
            {discovered.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                  Found {discovered.length} printer{discovered.length === 1 ? "" : "s"}
                </p>
                {discovered.map((p) => (
                  <button
                    key={p.ip}
                    type="button"
                    onClick={() => selectDiscovered(p)}
                    className={
                      ip === p.ip
                        ? "w-full text-left p-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 transition"
                        : "w-full text-left p-3 rounded-lg border-2 border-gray-200 bg-white hover:border-emerald-300 transition"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        ip === p.ip ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                        <Printer className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-gray-900 truncate">{p.name || "Receipt printer"}</div>
                        <div className="text-xs text-gray-500 font-mono">{p.ip}:{p.port}</div>
                      </div>
                      {ip === p.ip && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {discoveredAtLeastOnce && discovered.length === 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                <p className="font-bold mb-1">No printers found on Wi-Fi</p>
                <p>
                  Make sure the printer is powered on and on the same Wi-Fi as the tablet. Some routers (especially business Wi-Fi) block printer broadcasts — in that case, enter the IP manually below.
                </p>
              </div>
            )}

            {/* Manual entry — hidden by default, shown after empty
                discovery OR when the user explicitly opts in. */}
            <button
              type="button"
              onClick={() => setShowManualEntry(!showManualEntry)}
              className="mt-3 text-xs text-gray-500 hover:text-gray-700 underline"
            >
              {showManualEntry ? "Hide manual IP entry" : "Or enter IP manually"}
            </button>
          </div>

          {/* Manual IP + port — collapsed by default */}
          {showManualEntry && (
            <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Printer IP address
                  </label>
                  <input
                    type="text"
                    value={ip}
                    onChange={(e) => setIp(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="192.168.1.50"
                    // inputMode="text" shows the full keyboard with the
                    // period key — required for IP entry. We use
                    // type="text" so the field accepts dots; the
                    // onChange strips anything that's NOT a digit or
                    // dot so users can't fat-finger letters.
                    inputMode="text"
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Port
                  </label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed">
                Power-cycle the printer while holding the <strong>FEED</strong> button — it prints a self-test page with the IP near the bottom. Default port for Star/Epson is <code>9100</code>.
              </p>
            </div>
          )}

          {/* Paper width */}
          <div className={enabled ? "" : "opacity-40 pointer-events-none"}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Paper width
            </label>
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
              <button
                type="button"
                onClick={() => setPaperWidth("80")}
                className={
                  paperWidth === "80"
                    ? "px-4 py-2 bg-emerald-500 text-white"
                    : "px-4 py-2 text-gray-700 hover:bg-gray-50"
                }
              >
                80 mm (standard)
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth("58")}
                className={
                  paperWidth === "58"
                    ? "px-4 py-2 bg-emerald-500 text-white"
                    : "px-4 py-2 text-gray-700 hover:bg-gray-50"
                }
              >
                58 mm (compact)
              </button>
            </div>
          </div>

          {/* Autoprint toggle */}
          <label className={`flex items-center gap-3 cursor-pointer ${enabled ? "" : "opacity-40 pointer-events-none"}`}>
            <input
              type="checkbox"
              checked={autoprint}
              onChange={(e) => setAutoprint(e.target.checked)}
              className="rounded text-emerald-500 focus:ring-emerald-500 w-5 h-5"
            />
            <div>
              <div className="font-medium text-gray-900">Auto-print on accept</div>
              <div className="text-xs text-gray-500">
                When you accept an order, the kitchen ticket prints automatically.
                Turn off if you'd rather manually trigger every print.
              </div>
            </div>
          </label>

          {/* Test buttons */}
          <div className={`flex flex-wrap gap-2 ${enabled && ip ? "" : "opacity-40 pointer-events-none"}`}>
            <button
              type="button"
              onClick={testConnection}
              disabled={!enabled || !ip || testState.kind === "testing" || !native}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 disabled:opacity-50 transition"
            >
              <Wifi className="w-4 h-4" /> Test Connection
            </button>
            <button
              type="button"
              onClick={testPrint}
              disabled={!enabled || !ip || testState.kind === "testing" || !native}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-bold text-white disabled:opacity-50 transition"
            >
              <Printer className="w-4 h-4" /> Test Print
            </button>
          </div>

          {/* Test result */}
          {testState.kind === "testing" && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Testing…
            </div>
          )}
          {testState.kind === "success" && (
            <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{testState.message}</span>
            </div>
          )}
          {testState.kind === "error" && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{testState.message}</span>
            </div>
          )}

          {/* Star printer help notice. Star TSP143III/IV/mPOP ship in
              Star Line Mode and silently ignore ESC/POS commands —
              user sees "Test Print sent" but no paper. The fix is a
              one-time emulation-mode switch via Star's PC utility. */}
          <details className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <summary className="cursor-pointer font-bold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Test Print said success but no paper came out?
            </summary>
            <div className="mt-2 space-y-2 leading-relaxed">
              <p>
                <strong>If you have a Star TSP143III, TSP100, or mPOP printer:</strong> these models ship in &quot;Star Line Mode&quot; by default and ignore the standard print commands our app sends. The TCP connection works (Test Connection passes) but the printer silently discards the print job. You&apos;ll need to switch the printer to &quot;ESC/POS Mode&quot; one time — takes ~5 minutes.
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Download <strong>Star Printer Utility</strong> from <a href="https://www.starmicronics.com/support/" target="_blank" rel="noopener noreferrer" className="underline">starmicronics.com/support</a> (Windows or Mac)</li>
                <li>Connect the printer to your computer via USB cable</li>
                <li>Open the utility → <strong>Printer Settings</strong> → change <strong>Emulation</strong> from &quot;Star Line Mode&quot; to <strong>&quot;Standard ESC/POS Mode&quot;</strong></li>
                <li>Save + unplug + plug in the printer (power-cycle)</li>
                <li>Verify: hold the FEED button while powering on. The self-test page should show &quot;Emulation: ESC/POS&quot;</li>
                <li>Try Test Print again — receipt should come out</li>
              </ol>
              <p>
                <strong>Other printer brands</strong> (Epson, Bixolon, Citizen): these usually work without configuration. If still no paper, check paper roll + cover + power LED.
              </p>
              <p className="text-amber-700">
                We&apos;re adding native Star SDK support in a future update so this manual step won&apos;t be needed.
              </p>
            </div>
          </details>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => { save(); onClose(); }}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-bold text-white transition"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
