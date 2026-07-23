"use client";
/**
 * PrinterSetupModal — PrintNode-based printer setup.
 *
 * ⚠️ DEPRECATION NOTE (decided 2026-05-23):
 * This entire flow is temporary. Once the Kitchen Display native app
 * ships (Capacitor, task #78), the kitchen display becomes strictly
 * iOS/Android via the native app — with built-in printer support via
 * a custom native plugin wrapping Star + Epson SDKs. At that point:
 *
 *   1. PrintNode disappears entirely from the product.
 *   2. The /kitchen web URL stays online for browsers but the
 *      official, recommended path becomes "install the Fee Free
 *      Kitchen app from the App Store / Play Store."
 *   3. This whole modal (PrinterSetupModal.tsx) + the PrintNode API
 *      routes under /api/kitchen/printnode/* should be deleted, and
 *      the native app's settings screen takes over.
 *
 * Keep this file functional + polished in the meantime — soft launch
 * runs on PrintNode and restaurants need it to work for ~6-10 weeks
 * until the native app is live. Don't rip it out before then.
 *
 * See ROADMAP.md Phase G for the full plan.
 */
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
/** Labels/notes are i18n keys in the "kitchen" namespace (resolved via tk() inside the component). */
const PN_OS_OPTIONS: { id: PNDeviceOS; labelKey: string; icon: typeof Monitor; href: string; noteKey: string }[] = [
  { id: "windows", labelKey: "pnOsWindows", icon: Monitor,    href: "https://www.printnode.com/en/download/client/windows",  noteKey: "pnOsWindowsNote" },
  { id: "macos",   labelKey: "pnOsMacos",   icon: Apple,      href: "https://www.printnode.com/en/download/client/macos",    noteKey: "pnOsMacosNote" },
  { id: "linux",   labelKey: "pnOsLinux",   icon: Server,     href: "https://www.printnode.com/en/download/client/linux",    noteKey: "pnOsLinuxNote" },
  { id: "rpi",     labelKey: "pnOsRpi",     icon: Cpu,        href: "https://www.printnode.com/en/download/client/raspbian", noteKey: "pnOsRpiNote" },
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
  const tk = useTranslations("kitchen");
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
          setLoadError(data?.error ?? tk("pnLoadFailed"));
          setLoading(false);
          return;
        }
        if (data.settings) setSettings(data.settings);
        setEncryptionConfigured(data.encryptionConfigured ?? true);
        if (data.settings?.printNodeConnected) fetchPrinters();
      } catch (err: any) {
        setLoadError(err.message ?? tk("pnNetworkError"));
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
        setTestResult({ ok: false, msg: saveData?.error ?? tk("pnSaveKeyFailed") });
        return;
      }
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/kitchen/printnode/test", { method: "POST" });
      const data = await safeJson(res);
      if (!data) {
        setTestResult({ ok: false, msg: tk("pnNoResponse") });
        return;
      }
      if (res.ok) {
        setTestResult({ ok: true, msg: tk("pnConnectedAs", { name: data.accountName }) });
        setSettings((s) => ({ ...s, printNodeConnected: true, printNodeAccountName: data.accountName, hasApiKey: true }));
        setPrinters(data.printers ?? []);
        setApiKey("");
      } else {
        setTestResult({ ok: false, msg: data.error ?? tk("pnConnectionFailed") });
        setSettings((s) => ({ ...s, printNodeConnected: false }));
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? tk("pnNetworkError") });
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
        setTestResult({ ok: false, msg: data?.error ?? tk("pnSaveFailed") });
        return;
      }
      onSettingsSaved(settings);
      onClose();
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? tk("pnNetworkError") });
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
        setTestResult({ ok: true, msg: tk("pnTestPrintSent") });
      } else {
        setTestResult({ ok: false, msg: data?.error ?? tk("pnTestPrintFailed") });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? tk("pnNetworkError") });
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
        setTestResult({ ok: true, msg: tk("pnDiagSent", { n: data?.payloadBytes ?? "?", id: data?.jobId ?? "?" }) });
      } else {
        setTestResult({ ok: false, msg: data?.error ?? tk("pnDiagFailed") });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message ?? tk("pnNetworkError") });
    } finally {
      setSendingDiag(null);
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "connection", label: tk("pnTabConnection"), icon: <Key className="w-4 h-4" /> },
    { key: "settings", label: tk("pnTabSettings"), icon: <Settings className="w-4 h-4" /> },
    { key: "logs", label: tk("pnTabLogs"), icon: <List className="w-4 h-4" /> },
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
            <h3 className="text-lg font-bold text-white">{tk("pnTitle")}</h3>
            {settings.printNodeConnected && (
              <span className="ml-2 text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {tk("pnConnected")}
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
              <span className="text-sm">{tk("pnLoadingSettings")}</span>
            </div>
          ) : loadError ? (
            <div className="bg-red-900/30 border border-red-600/40 rounded-xl p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-300">{tk("pnLoadFailed")}</p>
                <p className="text-xs text-red-400 mt-0.5">{loadError}</p>
                <button onClick={() => window.location.reload()} className="mt-2 text-xs text-red-300 underline">
                  {tk("pnReloadPage")}
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
                        {tk("pnEncryptionWarning")}
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
                            {tk("pnGuideTitle")}
                          </div>
                          <div className="text-xs text-emerald-200/70 mt-0.5">
                            {tk("pnGuideSubtitle")}
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
                            {tk("pnHowItWorksTitle")}
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed mb-2">
                            {tk.rich("pnHowItWorksBody", { strong: (c) => <strong>{c}</strong> })}
                          </p>
                          <ul className="text-xs text-gray-400 space-y-1.5 leading-relaxed">
                            <li className="flex gap-2">
                              <Tablet className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <span>{tk.rich("pnPieceKitchenApp", { b: (c) => <strong className="text-gray-200">{c}</strong>, strong: (c) => <strong>{c}</strong>, em: (c) => <em>{c}</em> })}</span>
                            </li>
                            <li className="flex gap-2">
                              <Printer className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <span>{tk.rich("pnPiecePrintNode", { b: (c) => <strong className="text-gray-200">{c}</strong>, warn: (c) => <strong className="text-amber-300">{c}</strong> })}</span>
                            </li>
                          </ul>
                          <div className="mt-3 pt-3 border-t border-gray-700">
                            <div className="text-xs font-semibold text-gray-300 mb-1.5">{tk("pnCommonSetups")}</div>
                            <ul className="text-xs text-gray-400 space-y-1 leading-relaxed list-disc list-inside ml-1">
                              <li>{tk.rich("pnSetupCheapest", { b: (c) => <strong className="text-gray-200">{c}</strong> })}</li>
                              <li>{tk.rich("pnSetupTablet", { b: (c) => <strong className="text-gray-200">{c}</strong> })}</li>
                              <li>{tk.rich("pnSetupExisting", { b: (c) => <strong className="text-gray-200">{c}</strong> })}</li>
                            </ul>
                          </div>
                        </div>

                        {/* Step 1 — create account */}
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                              {tk("pnStep1Title")}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              {tk.rich("pnStep1Body", { warn: (c) => <strong className="text-amber-300">{c}</strong> })}
                            </p>
                            <a
                              href="https://app.printnode.com/app/signup"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                            >
                              {tk("pnOpenSignup")}
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
                              {tk("pnStep2Title")}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              {tk.rich("pnStep2Body", { mono: (c) => <span className="font-mono bg-gray-700 px-1 rounded text-[11px]">{c}</span>, strong: (c) => <strong>{c}</strong> })}
                            </p>
                          </div>
                        </div>

                        {/* Step 3 — install PrintNode (per-OS picker) */}
                        <div className="flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                              {tk("pnStep3Title")}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              {tk("pnStep3Body")}
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
                                    {tk(opt.labelKey)}
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
                                    {tk(sel.labelKey)}
                                  </div>
                                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{tk(sel.noteKey)}</p>
                                  <a
                                    href={sel.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                                  >
                                    {tk("pnDownloadFor", { os: tk(sel.labelKey) })}
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
                              {tk("pnStep4Title")}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              {tk.rich("pnStep4Body", { mono: (c) => <span className="font-mono bg-gray-700 px-1 rounded text-[11px]">{c}</span>, strong: (c) => <strong>{c}</strong>, warn: (c) => <span className="text-amber-300">{c}</span> })}
                            </p>
                            <a
                              href="https://app.printnode.com/app/apikeys"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:underline"
                            >
                              {tk("pnOpenApiKeys")}
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
                              {tk("pnStep5Title")}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                              {tk.rich("pnStep5Body", { strong: (c) => <strong>{c}</strong> })}
                            </p>
                          </div>
                        </div>

                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 flex gap-2 mt-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-200/90 leading-relaxed">
                            {tk.rich("pnHeadsUp", { strong: (c) => <strong>{c}</strong> })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-1">{tk("pnApiKeyLabel")}</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={settings.hasApiKey ? tk("pnApiKeyPlaceholderSaved") : tk("pnApiKeyPlaceholder")}
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
                        <CheckCircle className="w-3 h-3" /> {tk("pnApiKeySaved")}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-gray-500">
                      {tk.rich("pnFindKey", {
                        link: (c) => (
                          <a
                            href="https://app.printnode.com/app/apikeys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono bg-gray-700 px-1 rounded text-gray-300 hover:text-emerald-400 transition inline-flex items-center gap-1"
                          >
                            {c}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ),
                      })}
                      {!showGuide && (
                        <>
                          {" · "}
                          <button
                            type="button"
                            onClick={() => setShowGuide(true)}
                            className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            {tk("pnShowGuide")}
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
                    {testing ? tk("pnTesting") : tk("pnTestConnection")}
                  </button>

                  {/* Printer selection */}
                  {settings.printNodeConnected && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-300">{tk("pnSelectPrinter")}</label>
                        <button onClick={fetchPrinters} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                          <RefreshCw className="w-3 h-3" /> {tk("pnRefresh")}
                        </button>
                      </div>
                      {printers.length === 0 ? (
                        <div className="bg-gray-700/50 rounded-xl p-4 text-sm text-gray-400 text-center">
                          {tk.rich("pnNoPrinters", { strong: (c) => <strong>{c}</strong> })}
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
                          <div className="text-sm font-semibold text-gray-300">{tk("pnSendTestPrint")}</div>
                          <div className="text-xs text-gray-500">{tk("pnSendsTo")} <span className="text-gray-400">{settings.selectedPrinterName}</span></div>
                        </div>
                        <button
                          onClick={handleTestPrint}
                          disabled={sendingTest || !!sendingDiag}
                          className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
                        >
                          {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                          {sendingTest ? tk("pnSending") : tk("pnTestPrint")}
                        </button>
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-gray-300 mb-1">{tk("pnDiagnosticsTitle")}</div>
                        <div className="text-xs text-gray-500 mb-2">{tk("pnDiagnosticsHint")}</div>
                        <div className="flex flex-col gap-2">
                          {([
                            { type: "plaintext" as const,      labelKey: "pnDiagPlainLabel",    descKey: "pnDiagPlainDesc" },
                            { type: "escpos_basic" as const,   labelKey: "pnDiagEscposLabel",   descKey: "pnDiagEscposDesc" },
                            { type: "starprnt_basic" as const, labelKey: "pnDiagStarprntLabel", descKey: "pnDiagStarprntDesc" },
                            { type: "star_bold_test" as const, labelKey: "pnDiagStarBoldLabel", descKey: "pnDiagStarBoldDesc" },
                          ]).map(({ type, labelKey, descKey }) => (
                            <button
                              key={type}
                              onClick={() => handleDiagnostic(type)}
                              disabled={!!sendingDiag || sendingTest}
                              className="flex items-center justify-between w-full bg-gray-700/60 hover:bg-gray-700 border border-gray-600 text-left px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                            >
                              <div>
                                <div className="text-sm font-medium text-gray-200">{tk(labelKey)}</div>
                                <div className="text-xs text-gray-500">{tk(descKey)}</div>
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
                    <label className="block text-sm font-semibold text-gray-300 mb-2">{tk("pnPrinterLanguage")}</label>
                    <div className="flex flex-col gap-2">
                      {([
                        { val: "escpos",    labelKey: "pnLangEscpos",   descKey: "pnLangEscposDesc" },
                        { val: "starprnt",  labelKey: "pnLangStarprnt", descKey: "pnLangStarprntDesc" },
                        { val: "star_line", labelKey: "pnLangStarLine", descKey: "pnLangStarLineDesc" },
                        { val: "plaintext", labelKey: "pnLangPlain",    descKey: "pnLangPlainDesc" },
                      ]).map(({ val, labelKey, descKey }) => (
                        <button
                          key={val}
                          onClick={() => setSettings((s) => ({ ...s, printerLanguage: val }))}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${settings.printerLanguage === val ? "border-emerald-500 bg-emerald-500/10" : "border-gray-600 hover:border-gray-500"}`}
                        >
                          <div className="text-sm font-semibold text-white">{tk(labelKey)}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{tk(descKey)}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-300 mb-2">{tk("pnPaperWidth")}</label>
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
                    <p className="text-xs text-gray-500 mt-1.5">{tk("pnPaperWidthHint")}</p>
                  </div>

                  <div className="space-y-4">
                    <div className="text-sm font-semibold text-gray-300">{tk("pnPrintCopies")}</div>
                    <Toggle label={tk("pnKitchenCopy")} sub={tk("pnKitchenCopySub")} val={settings.printKitchen} onChange={(v) => setSettings((s) => ({ ...s, printKitchen: v }))} t={mt} />
                    {settings.printKitchen && (
                      <div className="pl-4 border-l-2 border-gray-700">
                        <NumSel label={tk("pnKitchenCopiesPerOrder")} value={settings.kitchenCopies} onChange={(v) => setSettings((s) => ({ ...s, kitchenCopies: v }))} />
                      </div>
                    )}
                    <Toggle label={tk("pnCustomerCopy")} sub={tk("pnCustomerCopySub")} val={settings.printCustomer} onChange={(v) => setSettings((s) => ({ ...s, printCustomer: v }))} t={mt} />
                    {settings.printCustomer && (
                      <div className="pl-4 border-l-2 border-gray-700">
                        <NumSel label={tk("pnCustomerCopiesPerOrder")} value={settings.customerCopies} onChange={(v) => setSettings((s) => ({ ...s, customerCopies: v }))} />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-gray-300">{tk("pnReceiptStyle")}</div>
                    <Toggle label={tk("pnLargeOrderNumber")} sub={tk("pnLargeOrderNumberSub")} val={settings.showLargeOrderNumber} onChange={(v) => setSettings((s) => ({ ...s, showLargeOrderNumber: v }))} t={mt} />
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-gray-300">{tk("pnAutoPrint")}</div>
                    <Toggle label={tk("pnAutoPrintLabel")} sub={tk("pnAutoPrintSub")} val={settings.autoPrint} onChange={(v) => setSettings((s) => ({ ...s, autoPrint: v }))} t={mt} />
                  </div>
                </div>
              )}

              {/* ── Logs Tab ── */}
              {tab === "logs" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm font-semibold text-gray-300">{tk("pnRecentJobs")}</div>
                    <button onClick={loadLogs} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" /> {tk("pnRefresh")}
                    </button>
                  </div>
                  {loadingLogs ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-emerald-400" /></div>
                  ) : logs.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">{tk("pnNoJobs")}</div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log) => (
                        <div key={log.id} className="bg-gray-700/50 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-white">
                                {log.orderNumber ? `#${log.orderNumber}` : tk("pnLogTest")}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                log.receiptType === "kitchen" ? "bg-emerald-500/20 text-emerald-300" :
                                log.receiptType === "customer" ? "bg-blue-500/20 text-blue-300" :
                                "bg-gray-600 text-gray-300"
                              }`}>{log.receiptType}</span>
                              {log.printNodeJobId && <span className="text-xs text-gray-500">{tk("pnJobId", { id: log.printNodeJobId })}</span>}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {log.printerName ?? tk("pnUnknownPrinter")} · {new Date(log.createdAt).toLocaleString()}
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
            {tab === "logs" ? tk("pnClose") : tk("pnCancel")}
          </button>
          {tab !== "logs" && (
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? tk("pnSaving") : tk("pnSaveSettings")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
