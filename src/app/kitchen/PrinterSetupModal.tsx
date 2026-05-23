"use client";
import { useState, useEffect } from "react";
import {
  X, Printer, Key, Loader2, CheckCircle, XCircle, RefreshCw,
  Settings, List, Eye, EyeOff, AlertCircle,
} from "lucide-react";
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
                      Find your API key at <span className="font-mono bg-gray-700 px-1 rounded">app.printnode.com → Account → API Keys</span>
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
