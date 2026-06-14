"use client";
import { useState, useRef, useCallback, useMemo } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import toast from "react-hot-toast";
import {
  Save, Printer, GripVertical, ChevronDown, ChevronRight,
  Eye, EyeOff, Receipt, ChefHat, Loader2,
} from "lucide-react";
import { ReceiptRenderer, PAPER_WIDTH_PX, PAPER_WIDTH_58_PX, SAMPLE_ORDER, makeSampleOrder } from "./ReceiptRenderer";
import type { CustomerConfig, KitchenConfig, Section, SectionStyle } from "@/lib/receipt-schema";
import { parseReceiptConfig } from "@/lib/receipt-schema";
import { useTranslations } from "next-intl";
import { ImageUpload } from "@/components/admin/ImageUpload";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tw(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Style editor (per-section) ───────────────────────────────────────────────

function StyleEditor({ section, onChange }: { section: Section; onChange: (s: Section) => void }) {
  const s = section.style;
  const set = (key: keyof SectionStyle, val: any) =>
    onChange({ ...section, style: { ...s, [key]: val } });

  const AlignBtn = ({ a }: { a: "left" | "center" | "right" }) => (
    <button
      onClick={() => set("align", a)}
      className={tw("px-2.5 py-1 text-xs rounded border transition", s.align === a ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50")}
    >
      {a === "left" ? "←" : a === "center" ? "↔" : "→"}
    </button>
  );

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-3">
      {/* Font size */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Font Size</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {[{ l: "XS", v: 9 }, { l: "S", v: 11 }, { l: "M", v: 13 }, { l: "L", v: 16 }, { l: "XL", v: 20 }, { l: "2XL", v: 26 }, { l: "3XL", v: 32 }].map(({ l, v }) => (
            <button key={l} onClick={() => set("fontSize", v)}
              className={tw("px-2 py-1 text-xs rounded border transition", s.fontSize === v ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-gray-300 hover:bg-gray-50")}>
              {l}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-1">
            <input type="number" min={8} max={48} value={s.fontSize}
              onChange={(e) => set("fontSize", Math.max(8, Math.min(48, parseInt(e.target.value) || 12)))}
              className="w-14 border border-gray-300 rounded px-2 py-1 text-xs text-center" />
            <span className="text-xs text-gray-400">px</span>
          </div>
        </div>
      </div>

      {/* Bold + Align + Line height */}
      <div className="flex flex-wrap gap-4">
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Style</div>
          <button onClick={() => set("bold", !s.bold)}
            className={tw("w-9 h-7 rounded border font-bold transition text-sm", s.bold ? "bg-emerald-500 text-white border-emerald-500" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50")}>
            B
          </button>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Align</div>
          <div className="flex gap-1"><AlignBtn a="left" /><AlignBtn a="center" /><AlignBtn a="right" /></div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Line Height</div>
          <input type="number" step={0.05} min={1} max={3} value={s.lineHeight}
            onChange={(e) => set("lineHeight", parseFloat(e.target.value) || 1.4)}
            className="w-16 border border-gray-300 rounded px-2 py-1 text-xs" />
        </div>
      </div>

      {/* Highlight */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-gray-700">Highlight (black bg / white text)</div>
          <div className="text-xs text-gray-400">For order numbers, badges</div>
        </div>
        <button onClick={() => set("highlight", !s.highlight)}
          className={tw("relative w-11 h-6 rounded-full transition-colors flex-shrink-0", s.highlight ? "bg-emerald-500" : "bg-gray-300")}>
          <div className={tw("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all", s.highlight ? "left-5" : "left-0.5")} />
        </button>
      </div>

      {/* Boxed (GloriaFood-style section box: thin border + inverse header strip) */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-gray-700">Box this section</div>
          <div className="text-xs text-gray-400">Thin border + header strip (GloriaFood style). Turn on Highlight above for a dark inverse header.</div>
        </div>
        <button onClick={() => set("boxed", !s.boxed)}
          className={tw("relative w-11 h-6 rounded-full transition-colors flex-shrink-0", s.boxed ? "bg-emerald-500" : "bg-gray-300")}>
          <div className={tw("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all", s.boxed ? "left-5" : "left-0.5")} />
        </button>
      </div>
      {s.boxed && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Box Header Text</div>
          <input
            type="text"
            value={section.boxTitle ?? ""}
            placeholder={section.label}
            onChange={(e) => onChange({ ...section, boxTitle: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          />
          <div className="text-xs text-gray-400 mt-1">Shown in the dark header strip. Blank = uses the section name.</div>
        </div>
      )}

      {/* Dividers */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Divider Lines</div>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={s.dividerAbove} onChange={(e) => set("dividerAbove", e.target.checked)} className="accent-emerald-500" />
            Above section
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={s.dividerBelow} onChange={(e) => set("dividerBelow", e.target.checked)} className="accent-emerald-500" />
            Below section
          </label>
        </div>
      </div>

      {/* Padding */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Padding (px)</div>
        <div className="flex gap-3">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Top</div>
            <input type="number" min={0} max={40} value={s.paddingTop}
              onChange={(e) => set("paddingTop", parseInt(e.target.value) || 0)}
              className="w-16 border border-gray-300 rounded px-2 py-1 text-xs" />
          </div>
          <div>
            <div className="text-xs text-gray-400 mb-0.5">Bottom</div>
            <input type="number" min={0} max={40} value={s.paddingBottom}
              onChange={(e) => set("paddingBottom", parseInt(e.target.value) || 0)}
              className="w-16 border border-gray-300 rounded px-2 py-1 text-xs" />
          </div>
        </div>
      </div>

      {/* Colors */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Colors</div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <span className="text-gray-600">Text</span>
            <input type="color" value={s.color} onChange={(e) => set("color", e.target.value)}
              className="w-7 h-6 rounded cursor-pointer border border-gray-300 p-0.5" />
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <span className="text-gray-600">Background</span>
            <input type="color" value={s.bgColor === "transparent" ? "#ffffff" : s.bgColor}
              onChange={(e) => set("bgColor", e.target.value)}
              className="w-7 h-6 rounded cursor-pointer border border-gray-300 p-0.5" />
            {s.bgColor !== "transparent" && (
              <button onClick={() => set("bgColor", "transparent")} className="text-gray-400 hover:text-red-400 text-xs">✕</button>
            )}
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable section row ─────────────────────────────────────────────────────

function SortableSectionRow({
  section,
  expanded,
  onToggleExpand,
  onToggleEnabled,
  onChange,
}: {
  section: Section;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onChange: (s: Section) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Drag handle */}
        {/* suppressHydrationWarning: dnd-kit generates DndDescribedBy-N ids from an
            internal counter that diverges between the server render (always starts
            at -0) and the client render (depends on mount order).  React warns but
            the aria-describedby is harmless either way. */}
        <button {...attributes} {...listeners} suppressHydrationWarning className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none">
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Enable toggle */}
        <button onClick={onToggleEnabled}
          className={tw("flex-shrink-0 transition", section.enabled ? "text-emerald-500" : "text-gray-300")}>
          {section.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>

        {/* Label */}
        <span className={tw("flex-1 text-sm select-none", !section.enabled && "text-gray-400 line-through")}>
          {section.label}
        </span>

        {/* Expand */}
        <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600 transition flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {expanded && <StyleEditor section={section} onChange={onChange} />}
    </div>
  );
}

// ─── Message panel ────────────────────────────────────────────────────────────

function MessagePanel({ config, onChange }: { config: CustomerConfig; onChange: (c: CustomerConfig) => void }) {
  return (
    <div className="p-4 border-t border-gray-200 bg-white">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Thank You & Footer Text</div>
      <div className="space-y-2">
        <input type="text" placeholder="Thank you message" value={config.thankYouMessage}
          onChange={(e) => onChange({ ...config, thankYouMessage: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input type="text" placeholder="Footer text" value={config.footerText}
          onChange={(e) => onChange({ ...config, footerText: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

function useReceiptsT() {
  const t = useTranslations("admin.receipts");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");
  return { t, tCommon, tToasts };
}

export function ReceiptsClient({
  templates,
  restaurant,
  printerSettings,
}: {
  templates: { type: string; template: string }[];
  restaurant: any;
  printerSettings?: any;
  __unused?: never;
}) {
  const { t: tR, tCommon, tToasts } = useReceiptsT();
  const custRaw = templates.find((t) => t.type === "customer")?.template ?? null;
  const kitRaw  = templates.find((t) => t.type === "kitchen")?.template  ?? null;

  const [activeType, setActiveType] = useState<"customer" | "kitchen">("customer");
  const [custConfig, setCustConfig] = useState<CustomerConfig>(() => parseReceiptConfig(custRaw, "customer"));
  const [kitConfig,  setKitConfig]  = useState<KitchenConfig>(() => parseReceiptConfig(kitRaw,  "kitchen"));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [kitchenCopies,  setKitchenCopies]  = useState<number>(printerSettings?.kitchenCopies ?? 1);
  const [customerCopies, setCustomerCopies] = useState<number>(printerSettings?.customerCopies ?? 1);
  // Receipt-header logo (customer receipt only). Lives on Restaurant, not in
  // the template JSON, so one upload covers print + preview + email. Saved by
  // the same Save button as the template. Luigi 2026-06-11.
  const [receiptLogoUrl, setReceiptLogoUrl] = useState<string>(restaurant?.receiptLogoUrl ?? "");
  const [saving, setSaving]         = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  // Preview-only state: which paper width + which sample-order type
  // to render in the live preview. Doesn't affect saved templates or
  // actual prints — just lets the owner test how their receipt looks
  // in different scenarios (58mm vs 80mm paper, delivery vs pickup vs
  // dine-in). Seeded from the saved printer setting so it matches what
  // the kitchen actually has on the shelf.
  const [previewWidth, setPreviewWidth] = useState<"58mm" | "80mm">(
    printerSettings?.paperWidth === "58mm" ? "58mm" : "80mm"
  );
  const [previewOrderType, setPreviewOrderType] = useState<"pickup" | "delivery" | "dine_in">("pickup");
  const previewOrder = useMemo(() => makeSampleOrder(previewOrderType), [previewOrderType]);
  const previewWidthPx = previewWidth === "58mm" ? PAPER_WIDTH_58_PX : PAPER_WIDTH_PX;

  const activeConfig = activeType === "customer" ? custConfig : kitConfig;
  const setActiveConfig = activeType === "customer"
    ? (c: CustomerConfig) => setCustConfig(c)
    : (c: KitchenConfig) => setKitConfig(c);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sections = activeConfig.sections;
    const oldIdx = sections.findIndex((s) => s.id === active.id);
    const newIdx = sections.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(sections, oldIdx, newIdx);
    (setActiveConfig as any)({ ...activeConfig, sections: reordered });
  }, [activeConfig, setActiveConfig]);

  const updateSection = useCallback((updated: Section) => {
    const sections = activeConfig.sections.map((s) => (s.id === updated.id ? updated : s));
    (setActiveConfig as any)({ ...activeConfig, sections });
  }, [activeConfig, setActiveConfig]);

  const toggleSection = useCallback((id: string) => {
    const sections = activeConfig.sections.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    (setActiveConfig as any)({ ...activeConfig, sections });
  }, [activeConfig, setActiveConfig]);

  // Save to DB.  Returns true on success so callers can chain print actions.
  const save = async (silent = false): Promise<boolean> => {
    setSaving(true);
    let ok = false;
    try {
      const res = await fetch("/api/restaurants/receipts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerTemplate: custConfig, kitchenTemplate: kitConfig, kitchenCopies, customerCopies, receiptLogoUrl: receiptLogoUrl || null }),
      });
      if (!res.ok) throw new Error("Failed");
      if (!silent) toast.success(tToasts("saved"));
      ok = true;
    } catch {
      toast.error(tToasts("saveFailed"));
    }
    setSaving(false);
    return ok;
  };

  // "Test this receipt" — saves the current draft first, then sends a single-type
  // test print using the live state to the configured PrintNode printer.  This is
  // what the user uses to iteratively compare a printed receipt against the live
  // preview pane.  The receipt type printed matches the currently active tab.
  const [testing, setTesting] = useState(false);
  const testThisReceipt = async () => {
    if (testing) return;
    setTesting(true);
    try {
      // Save first so saved DB state matches what we're about to print.  The save
      // also ensures kitchenCopies/customerCopies are up to date.
      const saved = await save(true);
      if (!saved) {
        toast.error("Save failed — test print cancelled");
        return;
      }

      // Send only the receipt type that's currently being edited.  Inline templates
      // are also sent so the server uses the exact draft (defensive in case of a
      // save-vs-read race).
      const printType = activeType === "customer" ? "test_customer" : "test_kitchen";
      const res = await fetch("/api/kitchen/printnode/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:             printType,
          customerTemplate: custConfig,
          kitchenTemplate:  kitConfig,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Test print failed");
        return;
      }
      toast.success(`Saved & sent test ${activeType} receipt to printer`);
    } catch (err: any) {
      toast.error(err?.message ?? "Test print failed");
    } finally {
      setTesting(false);
    }
  };

  // Print — serialize preview's inline-styled HTML into a new window
  const print = () => {
    if (!previewRef.current) return;
    const html = previewRef.current.outerHTML;
    const win = window.open("", "_blank", "width=440,height=720");
    if (!win) { toast.error("Pop-up blocked — allow pop-ups and try again"); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #fff; display: flex; justify-content: center; padding: 8px 0; }
  @page { size: 80mm auto; margin: 0; }
  @media print { body { padding: 0; } }
</style>
</head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 350);
  };

  const sections = activeConfig.sections;
  const sectionIds = sections.map((s) => s.id);

  return (
    <div className="flex h-full" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-hidden">
        {/* Type toggle — emerald for Customer receipt (customer-facing surface),
            navy slate-900 for Kitchen receipt (kitchen-facing surface). Mirrors
            the demo-page card colors (emerald=customer / navy=kitchen) so the
            mental model is consistent across the platform. */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {(["customer", "kitchen"] as const).map((t) => {
            const isActive = activeType === t;
            const isCustomer = t === "customer";
            return (
              <button
                key={t}
                onClick={() => { setActiveType(t); setExpandedId(null); }}
                className={tw(
                  "flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition border-b-2",
                  isActive
                    ? (isCustomer
                        ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                        : "border-slate-900 text-slate-900 bg-slate-100")
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                {isCustomer
                  ? <Receipt className={`w-4 h-4 ${isActive ? "text-emerald-700" : "text-emerald-500"}`} />
                  : <ChefHat className={`w-4 h-4 ${isActive ? "text-slate-900" : "text-slate-600"}`} />}
                {isCustomer ? tR("customerReceipt") : tR("kitchenReceipt")}
              </button>
            );
          })}
        </div>

        {/* Scrollable section list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-3 pb-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {tR("sections")}
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
              <div className="border-t border-gray-100">
                {sections.map((section) => (
                  <SortableSectionRow
                    key={section.id}
                    section={section}
                    expanded={expandedId === section.id}
                    onToggleExpand={() => setExpandedId(expandedId === section.id ? null : section.id)}
                    onToggleEnabled={() => toggleSection(section.id)}
                    onChange={updateSection}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Customer-only panels */}
          {activeType === "customer" && (
            <>
              <MessagePanel config={custConfig} onChange={setCustConfig} />
              <div className="border-t border-gray-100 px-3 py-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {tR("logoTitle")}
                </div>
                <ImageUpload value={receiptLogoUrl} onChange={setReceiptLogoUrl} aspectRatio="auto" />
                <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{tR("logoHint")}</p>
              </div>
            </>
          )}

          {/* Print copy count */}
          <div className="border-t border-gray-100 px-3 py-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Print Copies</div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-700">Kitchen copies</div>
                  <div className="text-[11px] text-gray-400">Printed for kitchen staff</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setKitchenCopies(Math.max(0, kitchenCopies - 1))}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-50 transition">−</button>
                  <input type="number" min={0} max={10} value={kitchenCopies}
                    onChange={e => setKitchenCopies(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-10 text-center border border-gray-300 rounded px-1 py-1 text-sm" />
                  <button onClick={() => setKitchenCopies(Math.min(10, kitchenCopies + 1))}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-50 transition">+</button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-700">Customer copies</div>
                  <div className="text-[11px] text-gray-400">Printed for the customer</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCustomerCopies(Math.max(0, customerCopies - 1))}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-50 transition">−</button>
                  <input type="number" min={0} max={10} value={customerCopies}
                    onChange={e => setCustomerCopies(Math.min(10, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="w-10 text-center border border-gray-300 rounded px-1 py-1 text-sm" />
                  <button onClick={() => setCustomerCopies(Math.min(10, customerCopies + 1))}
                    className="w-7 h-7 rounded border border-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 hover:bg-gray-50 transition">+</button>
                </div>
              </div>
              <p className="text-[11px] text-gray-400">Set to 0 to skip printing that receipt type.</p>
            </div>
          </div>

          <div className="h-4" />
        </div>

        {/* Action bar */}
        <div className="flex gap-2 p-3 border-t border-gray-200 flex-shrink-0 bg-gray-50 flex-wrap">
          <button onClick={print}
            className="flex items-center gap-1.5 justify-center bg-white border border-gray-300 text-gray-700 font-medium px-3 py-2 rounded-lg hover:bg-gray-50 transition text-sm">
            <Printer className="w-4 h-4" /> Preview
          </button>
          <button
            onClick={testThisReceipt}
            disabled={testing || saving}
            title={`Save & send a single-${activeType} test print to the configured printer`}
            className="flex items-center gap-1.5 justify-center bg-blue-600 text-white font-medium px-3 py-2 rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-60"
          >
            <Printer className="w-4 h-4" />
            {testing ? "Sending…" : `Test ${activeType === "customer" ? "Customer" : "Kitchen"} Print`}
          </button>
          <PrintNodeTestButton />
          <button onClick={() => save()} disabled={saving}
            className="flex items-center gap-1.5 flex-1 justify-center bg-emerald-500 text-white font-semibold px-3 py-2 rounded-lg hover:bg-emerald-600 transition text-sm disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL — Live preview ──────────────────────────────────────── */}
      <div className="flex-1 bg-gray-200 overflow-y-auto flex flex-col items-center py-8 px-4">
        {/* Header label */}
        <div className="mb-4 text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Live Preview — {activeType === "customer" ? "Customer Receipt" : "Kitchen Receipt"}
          </div>
          <div className="text-xs text-gray-400">
            {previewWidth} thermal · {previewWidthPx}px wide · Preview = Print
          </div>
        </div>

        {/* Preview controls — paper width + order type toggle pills so the
            owner can preview every realistic combination without placing
            a real test order. Doesn't affect saved templates or what
            actually prints; purely a viewing convenience. */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-xs">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
            {(["58mm", "80mm"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setPreviewWidth(w)}
                className={`px-3 py-1.5 rounded-md font-semibold transition ${
                  previewWidth === w
                    ? "bg-emerald-500 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
            {([
              { val: "pickup",   label: "Pickup" },
              { val: "delivery", label: "Delivery" },
              { val: "dine_in",  label: "Dine-In" },
            ] as const).map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setPreviewOrderType(opt.val)}
                className={`px-3 py-1.5 rounded-md font-semibold transition ${
                  previewOrderType === opt.val
                    ? "bg-slate-900 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Paper shadow wrapper */}
        <div
          style={{
            background: "#fff",
            boxShadow: "0 4px 24px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.1)",
            borderRadius: 2,
            padding: "0",
            display: "inline-block",
          }}
        >
          {activeType === "customer" ? (
            <ReceiptRenderer
              ref={previewRef}
              type="customer"
              config={custConfig}
              restaurant={{ ...restaurant, receiptLogoUrl: receiptLogoUrl || null }}
              order={previewOrder}
              widthPx={previewWidthPx}
            />
          ) : (
            <ReceiptRenderer
              ref={previewRef}
              type="kitchen"
              config={kitConfig}
              restaurant={restaurant}
              order={previewOrder}
              widthPx={previewWidthPx}
            />
          )}
        </div>

        <div className="mt-4 text-xs text-gray-400 text-center max-w-xs">
          All styles are inline — the printed receipt is an exact copy of this preview. Switch between paper widths and order types to test how each variant looks.
        </div>
      </div>
    </div>
  );
}

function PrintNodeTestButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleTestPrint = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/kitchen/printnode/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "test" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: true, msg: "Test print sent!" });
        toast.success("Test print sent to printer!");
      } else {
        setResult({ ok: false, msg: data.error ?? "Print failed" });
        toast.error(data.error ?? "Print failed");
      }
    } catch (err: any) {
      setResult({ ok: false, msg: err.message });
      toast.error("Network error");
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 4000);
    }
  };

  return (
    <button
      onClick={handleTestPrint}
      disabled={loading}
      title="Send test print via PrintNode"
      className={`flex items-center gap-1.5 justify-center border px-3 py-2 rounded-lg transition text-sm font-medium disabled:opacity-50 ${
        result?.ok === true ? "border-green-400 text-green-700 bg-green-50" :
        result?.ok === false ? "border-red-400 text-red-700 bg-red-50" :
        "border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
      }`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
      {loading ? "Sending..." : "Test PrintNode"}
    </button>
  );
}
