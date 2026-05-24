"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Zap, Activity, ChevronDown, ChevronUp, Info, Printer, ServerCrash } from "lucide-react";

/**
 * Kitchen workflow mode toggle for the Orders page.
 *
 * Lets the restaurant owner choose between two operating models:
 *
 *   SIMPLE  — GloriaFood-style. The kitchen just accepts (or rejects)
 *             orders. There's no Preparing/Ready/Complete tracking; the
 *             order stays in "In Progress" until end-of-day. This is
 *             the default — busy restaurants that don't have time to
 *             click through multiple statuses per order shouldn't have to.
 *
 *   TRACKING — Full state machine. Each order moves through Accepted →
 *              Preparing → Ready → (Out for delivery) → Complete with
 *              the kitchen tapping each transition. Customer gets a
 *              notification at each step. Best for slower-paced
 *              restaurants that want precise status updates.
 *
 * UX intent: this is a Major Setting. It changes how the entire kitchen
 * display behaves. So we show it as a collapsible card at the top of
 * the Orders page (visible but not always expanded), with explainer
 * copy on each option. Default collapsed once configured.
 */
export function KitchenWorkflowToggle({
  initialMode,
  initialPrintNodeEnabled = false,
}: {
  initialMode: "simple" | "tracking";
  initialPrintNodeEnabled?: boolean;
}) {
  const [mode, setMode] = useState<"simple" | "tracking">(initialMode);
  const [printNodeEnabled, setPrintNodeEnabled] = useState<boolean>(initialPrintNodeEnabled);
  const [savingPrintNode, setSavingPrintNode] = useState(false);
  const [saving, setSaving] = useState(false);
  // Auto-expand when the choice is the non-default ("tracking") so an
  // existing customer who already picked tracking sees their setting
  // at a glance. Default-simple users see the card collapsed since
  // there's nothing they need to change.
  const [expanded, setExpanded] = useState(initialMode === "tracking");

  async function togglePrintNode(enabled: boolean) {
    setSavingPrintNode(true);
    setPrintNodeEnabled(enabled); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printNodeEnabled: enabled }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(
        enabled
          ? "PrintNode backup enabled — kitchen now shows PrintNode setup option"
          : "PrintNode backup disabled — only direct WiFi/LAN printing shown",
      );
    } catch {
      setPrintNodeEnabled(!enabled);
      toast.error("Failed to save — please try again");
    } finally {
      setSavingPrintNode(false);
    }
  }

  async function change(newMode: "simple" | "tracking") {
    if (newMode === mode) return;
    setSaving(true);
    setMode(newMode); // optimistic
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitchenWorkflowMode: newMode }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success(
        newMode === "simple"
          ? "Switched to Simple mode — kitchen just accepts orders"
          : "Switched to Tracking mode — kitchen updates each order through every stage",
      );
    } catch {
      // Roll back optimistic state on failure
      setMode(mode);
      toast.error("Failed to save — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            mode === "simple" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
          }`}>
            {mode === "simple" ? <Zap className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
          </div>
          <div className="text-left min-w-0">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Kitchen workflow
            </div>
            <div className="text-sm font-bold text-gray-900 truncate">
              {mode === "simple"
                ? "Simple — just Accept or Reject (recommended for busy restaurants)"
                : "Tracking — kitchen updates each order through every stage"}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4 bg-gray-50/50">
          <div className="grid sm:grid-cols-2 gap-3">
            <ModeCard
              active={mode === "simple"}
              disabled={saving}
              onClick={() => change("simple")}
              icon={<Zap className="w-5 h-5" />}
              tagText="DEFAULT — RECOMMENDED"
              tagColor="emerald"
              title="Simple (GloriaFood-style)"
              description="Kitchen sees only Accept and Reject. Orders move into 'In Progress' on accept and stay there until end-of-day. No status updates needed per order. Best for busy restaurants — same model GloriaFood uses."
              points={[
                "Kitchen: 1 tap per order (Accept)",
                "Customer notified once when accepted",
                "'In Progress' shows today + scheduled today/tomorrow",
              ]}
            />
            <ModeCard
              active={mode === "tracking"}
              disabled={saving}
              onClick={() => change("tracking")}
              icon={<Activity className="w-5 h-5" />}
              tagText="DETAILED"
              tagColor="blue"
              title="Tracking (full state)"
              description="Kitchen explicitly moves each order through Preparing → Ready → Complete. Customer gets a notification at each step. Slower workflow but the most precise status updates."
              points={[
                "Kitchen: 3-4 taps per order",
                "Customer notified at each stage",
                "Better for slower-paced or upscale restaurants",
              ]}
            />
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <p>
              You can switch modes anytime. Orders already in progress keep their current status when you switch — only NEW orders follow the new mode.
            </p>
          </div>
        </div>
      )}
      </div>

      {/* ── PrintNode backup toggle ─────────────────────────────────
          Direct WiFi/LAN printing (via the native kitchen app) is the
          main + recommended path. PrintNode is a legacy backup for
          restaurants on Windows browsers, unusual networks, or those
          who already have it set up. Default OFF — restaurants enable
          here to make the PrintNode setup option visible in the
          kitchen settings. */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            printNodeEnabled ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"
          }`}>
            <ServerCrash className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                PrintNode backup printer
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                OPTIONAL · BACKUP
              </span>
            </div>
            <div className="text-sm text-gray-900 mt-0.5 leading-snug">
              {printNodeEnabled
                ? "ON — kitchen also shows PrintNode setup as a backup option"
                : "OFF — direct WiFi/LAN printing only (recommended)"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => togglePrintNode(!printNodeEnabled)}
            disabled={savingPrintNode}
            aria-label="Toggle PrintNode backup"
            className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
              printNodeEnabled ? "bg-amber-500" : "bg-gray-300"
            } ${savingPrintNode ? "opacity-50" : ""}`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${
                printNodeEnabled ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50">
          <p className="text-[11px] text-gray-600 leading-relaxed flex items-start gap-2">
            <Printer className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-gray-400" />
            <span>
              <strong>Direct WiFi/LAN printing</strong> (via the Fee Free Kitchen native app on Android/iOS tablet) is the main printer connection — it auto-discovers your printer on the network, no PrintNode account or monthly fee needed. Enable PrintNode only as a backup if you can&apos;t install the native app or are running the kitchen on a Windows browser.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  disabled,
  onClick,
  icon,
  tagText,
  tagColor,
  title,
  description,
  points,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tagText: string;
  tagColor: "emerald" | "blue";
  title: string;
  description: string;
  points: string[];
}) {
  const tagClass = tagColor === "emerald"
    ? "bg-emerald-100 text-emerald-800"
    : "bg-blue-100 text-blue-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        active
          ? "text-left rounded-lg border-2 border-emerald-500 bg-white p-4 transition disabled:opacity-60"
          : "text-left rounded-lg border-2 border-gray-200 bg-white p-4 hover:border-gray-300 transition disabled:opacity-60"
      }
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          active
            ? tagColor === "emerald" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
            : "bg-gray-100 text-gray-500"
        }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-bold text-gray-900 text-sm">{title}</h4>
            <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${tagClass}`}>
              {tagText}
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{description}</p>
          <ul className="mt-2 space-y-0.5">
            {points.map((p, i) => (
              <li key={i} className="text-[11px] text-gray-500 flex items-start gap-1.5">
                <span className="text-emerald-500 flex-shrink-0 mt-1">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}
