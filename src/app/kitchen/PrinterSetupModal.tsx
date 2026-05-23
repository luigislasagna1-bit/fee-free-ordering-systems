"use client";
import { useState, useEffect } from "react";
import {
  X, Printer, Key, Loader2, CheckCircle, XCircle, RefreshCw,
  Settings, List, Eye, EyeOff, AlertCircle, ExternalLink,
  ChevronDown, ChevronUp, BookOpen, Download, UserPlus,
  Monitor, Apple, Server, Cpu, Smartphone, Tablet,
} from "lucide-react";

/**
 * Operating systems on which PrintNode Desktop will run. PrintNode
 * publishes native clients for these platforms only — there is no
 * iOS or Android version. (The web kitchen display itself runs in
 * any browser, so the *display* can be on a tablet — but the
 * PrintNode bridge that talks to the printer must live on one of
 * these desktop OSes.)
 */
type PNDeviceOS = "windows" | "macos" | "linux" | "rpi";
const PN_OS_OPTIONS: { id: PNDeviceOS; label: string; icon: typeof Monitor; href: string; note: string }[] = [
  { id: "windows", label: "Windows",      icon: Monitor,    href: "https://www.printnode.com/en/download/client/windows", note: "Win 10 / 11. Cheapest option: a $150 mini-PC stays on permanently next to the printer." },
  { id: "macos",   label: "macOS",        icon: Apple,      href: "https://www.printnode.com/en/download/client/macos",   note: "macOS 11+. Use an old Mac mini or any spare Mac." },
  { id: "linux",   label: "Linux",        icon: Server,     href: "https://www.printnode.com/en/download/client/linux",   note: "Debian/Ubuntu/RHEL. Headless install on a small server works fine." },
  { id: "rpi",     label: "Raspberry Pi", icon: Cpu,        href: "https://www.printnode.com/en/download/client/raspbian", note: "Pre-built Raspbian image. ~$60 hardware, lowest-cost dedicated print bridge." },
];
import { THEMES, type PrinterSettings, type ThemeMode, type T } from "./kitchen-types";

interface PrinterInfo {
  id: number;
  name: string;
  description: string;
  state: string;
  computer: string;
}

interface PrintLog {
  id: string;
  orderNumber: string | null;
  receiptType: string;
  printerName: string | null;
  printNodeJobId: number | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface Props {
  onClose: () => void;
  onSettingsSaved: (settings: PrinterSettings) => void;
  themeMode?: ThemeMode;
}

type Tab = "connection" | "settings" | "logs";

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

function Toggle({ label, sub, val, onChange, t }: { label: string; sub?: string; val: boolean; onChange: (v: boolean) => void; t: T }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className={`text-sm ${t.text}`}>{label}</div>
        {sub && <div className={`text-xs ${t.muted} mt-0.5`}>{sub}</div>}
      </div>
      <button
        onClick={() => onChange(!val)}
        className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${val ? "bg-emerald-500" : "bg-gray-400"}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${val ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function NumSel({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-400">{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, value - 1))} className="w-7 h-7 rounded-lg bg-gray-700 text-white hover:bg-gray-600 flex items-center justify-center text-lg">−</button>
        <span className="w-6 text-center text-white font-semibold">{value}</span>
        <button onClick={() => onChange(Math.min(5, value + 1))} className="w-7 h-7 rounded-lg bg-gray-700 text-white hover:bg-gray-600 flex items-center justify-center text-lg">+</button>
      </div>
    </div>
  );
}

const DEFAULT_SETTINGS: PrinterSettings = {
  printNodeConnected: false, printNodeAccountName: null,
  selectedPrinterId: null, selectedPrinterName: null,
  autoPrint: false, printKitchen: true, printCustomer: true,
  kitchenCopies: 1, customerCopies: 1,
  paperWidth: "80mm", fontSize: "normal",
  showLargeOrderNumber: true, showLogo: false,
  printerLanguage: "escpos", hasApiKey: false,
};

export function PrinterSetupModal({ onClose, onSettingsSaved, themeMode = "dark" }: Props) {
  const t = THEMES[themeMode];
  const [tab, setTab] = useState<Tab>("connection");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingDiag, setSendingDiag] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [encryptionConfigured, setEncryptionConfigured] = useState(true);
  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_SETTINGS);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [logs, setLogs] = useState<PrintLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Whether the "How to set up PrintNode" walkthrough is expanded. Defaults
   *  to OPEN if the user hasn't connected an API key yet — so first-timers
   *  see the step-by-step immediately instead of staring at a blank API key
   *  field with no idea where to get one from. Once they're connected,
   *  collapses by default so the modal isn't cluttered for return visits. */
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    // Sync once settings load. If hasApiKey is false → show guide.
    if (!loading) setShowGuide(!settings.hasApiKey);
  }, [loading, settings.hasApiKey]);
  /** Which OS the owner intends to run PrintNode on. Drives the download
   *  link shown in Step 3. Defaults to Windows because that's the most
   *  common cheap-mini-PC option restaurants pick. */
  const [pnOS, setPnOS] = useState<PNDeviceOS>("windows");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/kitchen/printnode/settings");
        const data = await safeJson(res);
        if (!res.ok || !data) {
          setLoadError(data?.error ?? "Failed to load settings");
          setLoading(false);
          return;
        }
        if (data.settings) setSettings(data.settings);
        setEncryptionConfigured(data.encryptionConfigured ?? true);
        if (data.settings?.printNodeConnected) fetchPrinters();
      } catch (err: any) {
        setLoadError(err.message ?? "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tab === "logs") loadLogs();
  }, [tab]);

  async function fetchPrinters() {
    try {
      const res = await fetch("/api/kitchen/printnode/printers");
      const data = await safeJson(res);
      if (res.ok && data?.printers) setPrinters(data.printers);
    } catch {}
  }

  async function loadLogs() {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/kitchen/printnode/logs");
      const data = await safeJson(res);
      if (res.ok && data?.logs) setLogs(data.logs);
    } catch {} finally {
      setLoadingLogs(false);
    }
  }

  async function handleTestConnection() {
    // Save key first if provided
    if (apiKey.trim()) {
      const saveRes = await fetch("/api/kitchen/printnode/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const saveData = await safeJson(saveRes);
      if (!saveRes.ok) {
        setTestResult({ ok: false, msg: saveData?.error ?? "Failed to save API key" });
        return;
      }
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/kitchen/printnode/test", { method: "POST" });
      const data = await safeJson(res);
      if (!data) {
        setTestResult({ ok: false, msg: "No response from server" });
        return;
      }
      if (res.ok) {
        setTestResult({ ok: true, msg: `Connected as ${data.accountName}` });
        setSettings((s) => ({ ...s, printNodeConnected: true, printNodeAccountName: data.accountName, hasApiKey: true }));
        setPrinters(data.printers ?? []);
        setApiKey("");
      } else {
        setTestResult({ ok: false, msg: data.error ?? "Connection failed" });
        setSettings((s) => ({ ...s, printNodeConnected: false }));
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? "Network error" });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/kitchen/printnode/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedPrinterId: settings.selectedPrinterId,
          selectedPrinterName: settings.selectedPrinterName,
          autoPrint: settings.autoPrint,
          printKitchen: settings.printKitchen,
          printCustomer: settings.printCustomer,
          kitchenCopies: settings.kitchenCopies,
          customerCopies: settings.customerCopies,
          paperWidth: settings.paperWidth,
          fontSize: settings.fontSize,
          showLargeOrderNumber: settings.showLargeOrderNumber,
          showLogo: settings.showLogo,
          printerLanguage: settings.printerLanguage,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setTestResult({ ok: false, msg: data?.error ?? "Failed to save" });
        return;
      }
      onSettingsSaved(settings);
      onClose();
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPrint() {
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/kitchen/printnode/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test" }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTestResult({ ok: true, msg: "Test print sent! Check your printer." });
      } else {
        setTestResult({ ok: false, msg: data?.error ?? "Test print failed" });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? "Network error" });
    } finally {
      setSendingTest(false);
    }
  }

  async function handleDiagnostic(type: "plaintext" | "escpos_basic" | "starprnt_basic" | "star_bold_test") {
    setSendingDiag(type);
    setTestResult(null);
    try {
      const res = await fetch("/api/kitchen/printnode/diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTestResult({ ok: true, msg: `Diagnostic sent (${data?.payloadBytes ?? "?"} bytes, job #${data?.jobId ?? "?"}). Check printer.` });
      } else {
        setTestResult({ ok: false, msg: data?.error ?? "Diagnostic failed" });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? "Network error" });
    } finally {
      setSendingDiag(null);
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "connection", label: "Connection", icon: <Key className="w-4 h-4" /> },
    { key: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
    { key: "logs", label: "Print Logs", icon: <List className="w-4 h-4" /> },
  ];

  // Force dark styling for the modal regardless of theme (kitchen display modal)
  const mt = THEMES.dark;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-white">Printer Setup</h3>
            {settings.printNodeConnected && (
              <span className="ml-2 text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Connected
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 flex-shrink-0">
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition ${tab === key ? "border-emerald-500 text-emerald-400" : "border-transparent text-gray-400 hover:text-white"}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading settings...</span>
            </div>
          ) : loadError ? (
            <div className="bg-red-900/30 border border-red-600/40 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-300">Failed to load settings</p>
                <p className="text-xs text-red-400 mt-0.5">{loadError}</p>
                <button onClick={() => window.location.reload()} className="mt-2 text-xs text-red-300 underline">
                  Reload page
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── Connection Tab ── */}
              {tab === "connection" && (
                <div className="space-y-5">
                  {!encryptionConfigured && (
                    <div className="bg-amber-900/30 border border-amber-600/40 rounded-xl p-4 flex gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-300">
                        Secure key storage is not configured. Contact your system administrator to enable PrintNode integration.
                      </p>
                    </div>
                  )}

                  {/* ── Onboarding guide ───────────────────────────────────
                      Step-by-step walkthrough for restaurant owners who've
                      never used PrintNode. Auto-expanded on first visit
                      (no API key saved yet), collapsed once connected.
                      The whole point is that pasting an "API key" into a
                      field is meaningless to someone who hasn't created
                      the upstream account yet — they need a clear path:
                      sign up → install desktop → generate key → paste. */}
                  <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowGuide(g => !g)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-500/10 transition"
                    >
                      <div className="flex items-center gap-2 text-left">
                        <BookOpen className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-emerald-300">
                            First time setting up? Read this first
                          </div>
                          <div className="text-xs text-emerald-200/70 mt-0.5">
                            Create a PrintNode account, install the desktop app, get your API key — 5 minute walkthrough
                          </div>
                        </div>
                      </div>
                      {showGuide
                        ? <ChevronUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                    </button>

                    {showGuide && (
                      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-emerald-500/20">
                        {/* ── Architecture primer ───────────────────────────
                            Explains the two-component reality up front so
                            owners don't get confused later. The Kitchen
                            Display is a web app and runs anywhere; the
                            PrintNode bridge is a desktop app and only runs
                            on Win/Mac/Linux/RPi. They can be the same
                            physical device OR two devices on the same
                            network. */}
                        <div className="mt-3 bg-gray-900/40 border border-gray-700 rounded-lg p-3">
                          <div className="text-xs font-semibold text-emerald-300 mb-1.5">
                            How the kitchen printer works
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed mb-2">
                            There are <strong>two</strong> pieces. They can live on the same device or on two devices that share a network — your call.
                          </p>
                          <ul className="text-xs text-gray-400 space-y-1.5 leading-relaxed">
                            <li className="flex gap-2">
                              <Tablet className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <span><strong className="text-gray-200">Kitchen Display</strong> — a web app. Runs in any browser on <em>any</em> device: iPad, Android tablet, iPhone, Windows tablet, laptop, desktop, even a TV with a Chromecast. Just open the site and log in. On a tablet, use <strong>Add to Home Screen</strong> to launch it like an app.</span>
                            </li>
                            <li className="flex gap-2">
                              <Printer className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <span><strong className="text-gray-200">PrintNode</strong> — the bridge that talks to your physical receipt printer. <strong className="text-amber-300">Only runs on Windows, macOS, Linux, or Raspberry Pi.</strong> No iOS or Android version exists. Must be on a device on the same network as the printer (USB connection is fine — usually the same device).</span>
                            </li>
                          </ul>
                          <div className="mt-3 pt-3 border-t border-gray-700">
                            <div className="text-xs font-semibold text-gray-300 mb-1.5">Common setups</div>
                            <ul className="text-xs text-gray-400 space-y-1 leading-relaxed list-disc list-inside ml-1">
                              <li><strong className="text-gray-200">Cheapest / simplest:</strong> One Windows mini-PC (~$150) runs both — kitchen display in a browser and PrintNode + USB printer.</li>
                              <li><strong className="text-gray-200">Tablet kitchen:</strong> iPad or Android tablet for the display + a separate Raspberry Pi (~$60) or any spare PC for PrintNode + printer on the same Wi-Fi.</li>
                              <li><strong className="text-gray-200">Already have a Mac/PC:</strong> Use it. PrintNode runs alongside whatever else is on it. The browser can be on the same machine or a separate tablet.</li>
                            </ul>
                          </div>
                        </div>

                        {/* Step 1 — create account */}
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                              Create your own PrintNode account
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              Sign up with the email you want PrintNode notifications to go to. <strong className="text-amber-300">Each restaurant (and each location, if you have multiple) needs its own PrintNode account + paid plan.</strong> You can&apos;t share one account across locations because the API key only points to one set of installed printers. The free tier includes 50 prints / month for testing; production plans start around $5/mo for 500 prints.
                            </p>
                            <a
                              href="https://app.printnode.com/app/signup"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                            >
                              Open PrintNode signup
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>

                        {/* Step 2 — set up the display device */}
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                              Open the Kitchen Display on the device you want to view orders on
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              No install needed — it&apos;s a web app. Open your browser, navigate to <span className="font-mono bg-gray-700 px-1 rounded text-[11px]">/kitchen</span> on this site, sign in with the kitchen-staff account. On iPad / Android, use the browser&apos;s <strong>Add to Home Screen</strong> menu to pin the page — it then launches full-screen like a native app. On Windows you can do the same via Chrome / Edge → Install App.
                            </p>
                          </div>
                        </div>

                        {/* Step 3 — install PrintNode (per-OS picker) */}
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                              Install PrintNode on the device connected to your printer
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              This device must be Windows, macOS, Linux, or Raspberry Pi (PrintNode doesn&apos;t ship for iOS or Android). It must stay powered on with PrintNode running — it&apos;s the bridge between us and your printer. Once installed, sign in with the account from step 1. PrintNode auto-detects any printer your operating system already recognizes — USB Star TSP143, Epson TM, network thermal, regular office printers, all work.
                            </p>

                            {/* OS picker */}
                            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                              {PN_OS_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                const isActive = pnOS === opt.id;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setPnOS(opt.id)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
                                      isActive
                                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                                        : "border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                                    }`}
                                  >
                                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Selected-OS detail + download link */}
                            {(() => {
                              const sel = PN_OS_OPTIONS.find(o => o.id === pnOS)!;
                              const SelIcon = sel.icon;
                              return (
                                <div className="mt-2.5 bg-gray-900/40 border border-gray-700 rounded-lg p-2.5">
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                                    <SelIcon className="w-3.5 h-3.5 text-emerald-400" />
                                    {sel.label}
                                  </div>
                                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{sel.note}</p>
                                  <a
                                    href={sel.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                                  >
                                    Download PrintNode for {sel.label}
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Step 4 — generate API key */}
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">4</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <Key className="w-3.5 h-3.5 text-emerald-400" />
                              Generate an API key
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              In the PrintNode dashboard, go to <span className="font-mono bg-gray-700 px-1 rounded text-[11px]">Account → API Keys</span>, click <strong>Create API Key</strong>, give it any name (e.g. "Fee Free Ordering"), and copy the long string that appears. <span className="text-amber-300">You only see it once</span> — save it somewhere safe before navigating away.
                            </p>
                            <a
                              href="https://app.printnode.com/app/apikeys"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                            >
                              Open PrintNode API Keys page
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>

                        {/* Step 5 — paste + test */}
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">5</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <Printer className="w-3.5 h-3.5 text-emerald-400" />
                              Paste the key below, click Test Connection
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              Paste the API key into the field below. Click <strong>Test Connection</strong>. If your account name shows up + your printer appears in the list, you&apos;re done. Pick the printer, save settings, fire a test print.
                            </p>
                          </div>
                        </div>

                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex gap-2 mt-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-200/90 leading-relaxed">
                            <strong>Heads up:</strong> the PrintNode app must stay running on the device with the printer for receipts to print. If that device goes offline or PrintNode is closed, jobs queue up until it&apos;s back online. Most owners leave the PrintNode device powered on 24/7 (it sips electricity).
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1">PrintNode API Key</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={settings.hasApiKey ? "API key saved — enter new value to replace" : "Your PrintNode API key"}
                        className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-2.5 pr-10 text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        autoComplete="off"
                        disabled={!encryptionConfigured}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {settings.hasApiKey && !apiKey && (
                      <p className="mt-1 text-xs text-green-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> API key is saved. Leave blank to keep it.
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-gray-500">
                      Find your API key at <a
                        href="https://app.printnode.com/app/apikeys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono bg-gray-700 px-1 rounded text-gray-300 hover:text-emerald-400 transition inline-flex items-center gap-1"
                      >
                        app.printnode.com → Account → API Keys
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      {!showGuide && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            onClick={() => setShowGuide(true)}
                            className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            Show full setup guide
                          </button>
                        </>
                      )}
                    </p>
                  </div>

                  {testResult && (
                    <div className={`rounded-xl p-3 flex gap-2 text-sm ${testResult.ok ? "bg-green-900/40 border border-green-600/40 text-green-300" : "bg-red-900/40 border border-red-600/40 text-red-300"}`}>
                      {testResult.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                      <span>{testResult.msg}</span>
                    </div>
                  )}

                  <button
                    onClick={handleTestConnection}
                    disabled={testing || !encryptionConfigured || (!apiKey.trim() && !settings.hasApiKey)}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {testing ? "Testing..." : "Test Connection"}
                  </button>

                  {/* Printer selection */}
                  {settings.printNodeConnected && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-300">Select Printer</label>
                        <button onClick={fetchPrinters} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> Refresh
                        </button>
                      </div>
                      {printers.length === 0 ? (
                        <div className="bg-gray-700/50 rounded-xl p-4 text-sm text-gray-400 text-center">
                          No printers found. Make sure <strong>PrintNode Desktop</strong> is running on the computer with your printer.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {printers.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setSettings((s) => ({ ...s, selectedPrinterId: p.id, selectedPrinterName: p.name }))}
                              className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-xl border-2 transition ${settings.selectedPrinterId === p.id ? "border-emerald-500 bg-emerald-500/10" : "border-gray-600 hover:border-gray-500"}`}
                            >
                              <div>
                                <div className="text-sm font-semibold text-white">{p.name}</div>
                                <div className="text-xs text-gray-400">{p.computer} · {p.description || p.state}</div>
                              </div>
                              {settings.selectedPrinterId === p.id && <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Test print + diagnostics */}
                  {settings.selectedPrinterId && (
                    <div className="pt-3 border-t border-gray-700 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-300">Send Test Print</div>
                          <div className="text-xs text-gray-500">Sends to: <span className="text-gray-400">{settings.selectedPrinterName}</span></div>
                        </div>
                        <button
                          onClick={handleTestPrint}
                          disabled={sendingTest || !!sendingDiag}
                          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
                        >
                          {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                          {sendingTest ? "Sending..." : "Test Print"}
                        </button>
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-300 mb-1">Printer Diagnostics</div>
                        <div className="text-xs text-gray-500 mb-2">Use these to identify the right protocol for your printer. Start with Plain Text — if that works, try ESC/POS or StarPRNT.</div>
                        <div className="flex flex-col gap-2">
                          {([
                            { type: "plaintext" as const,      label: "Plain Text Test",        desc: "No control codes — just readable text" },
                            { type: "escpos_basic" as const,   label: "ESC/POS Basic Test",     desc: "Bold, center, large text, cut (Epson/generic protocol)" },
                            { type: "starprnt_basic" as const, label: "StarPRNT Basic Test",    desc: "Bold, sizes, inverse, black bars, alignment — each with PASS/FAIL label (Star StarPRNT mode)" },
                            { type: "star_bold_test" as const, label: "STAR BOLD TEST",         desc: "Tests ESC E (StarPRNT), ESC F/H (Star Line), and ESC ! (ESC/POS) side-by-side — print to see which bold command works on your printer" },
                          ]).map(({ type, label, desc }) => (
                            <button
                              key={type}
                              onClick={() => handleDiagnostic(type)}
                              disabled={!!sendingDiag || sendingTest}
                              className="flex items-center justify-between w-full bg-gray-700/60 hover:bg-gray-700 border border-gray-600 text-left px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                            >
                              <div>
                                <div className="text-sm font-medium text-gray-200">{label}</div>
                                <div className="text-xs text-gray-500">{desc}</div>
                              </div>
                              {sendingDiag === type
                                ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400 flex-shrink-0" />
                                : <Printer className="w-4 h-4 text-gray-500 flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Settings Tab ── */}
              {tab === "settings" && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Printer Language</label>
                    <div className="flex flex-col gap-2">
                      {([
                        { val: "escpos",    label: "ESC/POS (Epson / Generic)",               desc: "Epson ESC/POS — for Epson, Bixolon, and most generic thermal printers" },
                        { val: "starprnt",  label: "StarPRNT — Star TSP143 (StarPRNT mode)",  desc: "Star Micronics StarPRNT protocol — uses ESC E n for bold. Run 'STAR BOLD TEST' to verify." },
                        { val: "star_line", label: "Star Line Mode — Star TSP143 (Star Line)", desc: "Star Micronics Star Line mode — uses ESC F/H for bold. Try this if StarPRNT bold is not visible." },
                        { val: "plaintext", label: "Plain Text (debug only)",                  desc: "No formatting codes — fallback only" },
                      ]).map(({ val, label, desc }) => (
                        <button
                          key={val}
                          onClick={() => setSettings((s) => ({ ...s, printerLanguage: val }))}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${settings.printerLanguage === val ? "border-emerald-500 bg-emerald-500/10" : "border-gray-600 hover:border-gray-500"}`}
                        >
                          <div className="text-sm font-semibold text-white">{label}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">Paper Width</label>
                    <div className="flex gap-2">
                      {(["58mm", "80mm"] as const).map((w) => (
                        <button
                          key={w}
                          onClick={() => setSettings((s) => ({ ...s, paperWidth: w }))}
                          className={`px-5 py-2 rounded-xl text-sm font-semibold border-2 transition ${settings.paperWidth === w ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-gray-600 text-gray-400 hover:border-gray-500"}`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">58mm = 32 chars/line · 80mm = 48 chars/line</p>
                  </div>

                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-gray-300">Print Copies</div>
                    <Toggle label="Kitchen copy" sub="Items, modifiers, and notes for kitchen staff" val={settings.printKitchen} onChange={(v) => setSettings((s) => ({ ...s, printKitchen: v }))} t={mt} />
                    {settings.printKitchen && (
                      <div className="pl-4 border-l-2 border-gray-700">
                        <NumSel label="Kitchen copies per order" value={settings.kitchenCopies} onChange={(v) => setSettings((s) => ({ ...s, kitchenCopies: v }))} />
                      </div>
                    )}
                    <Toggle label="Customer copy" sub="Full receipt with prices for the customer" val={settings.printCustomer} onChange={(v) => setSettings((s) => ({ ...s, printCustomer: v }))} t={mt} />
                    {settings.printCustomer && (
                      <div className="pl-4 border-l-2 border-gray-700">
                        <NumSel label="Customer copies per order" value={settings.customerCopies} onChange={(v) => setSettings((s) => ({ ...s, customerCopies: v }))} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-gray-300">Receipt Style</div>
                    <Toggle label="Large order number" sub="Double-height order # at top of kitchen copy" val={settings.showLargeOrderNumber} onChange={(v) => setSettings((s) => ({ ...s, showLargeOrderNumber: v }))} t={mt} />
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-gray-300">Auto-Print</div>
                    <Toggle label="Print automatically on accept" sub="Sends receipt to printer when order is accepted" val={settings.autoPrint} onChange={(v) => setSettings((s) => ({ ...s, autoPrint: v }))} t={mt} />
                  </div>
                </div>
              )}

              {/* ── Logs Tab ── */}
              {tab === "logs" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-gray-300">Recent Print Jobs</div>
                    <button onClick={loadLogs} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>
                  {loadingLogs ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-emerald-400" /></div>
                  ) : logs.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">No print jobs yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div key={log.id} className="bg-gray-700/50 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white">
                                {log.orderNumber ? `#${log.orderNumber}` : "Test"}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                log.receiptType === "kitchen" ? "bg-emerald-500/20 text-emerald-300" :
                                log.receiptType === "customer" ? "bg-blue-500/20 text-blue-300" :
                                "bg-gray-600 text-gray-300"
                              }`}>{log.receiptType}</span>
                              {log.printNodeJobId && <span className="text-xs text-gray-500">Job #{log.printNodeJobId}</span>}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {log.printerName ?? "Unknown printer"} · {new Date(log.createdAt).toLocaleString()}
                            </div>
                            {log.errorMessage && <div className="text-xs text-red-400 mt-1">{log.errorMessage}</div>}
                          </div>
                          <div className="flex-shrink-0">
                            {log.status === "sent"
                              ? <CheckCircle className="w-4 h-4 text-green-400" />
                              : <XCircle className="w-4 h-4 text-red-400" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 flex-shrink-0">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition px-4 py-2 rounded-xl hover:bg-gray-700">
            {tab === "logs" ? "Close" : "Cancel"}
          </button>
          {tab !== "logs" && (
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? "Saving..." : "Save Settings"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
