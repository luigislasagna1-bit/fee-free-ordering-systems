"use client";
import { useState, useId } from "react";
import { HelpCircle } from "lucide-react";

/**
 * Small inline "how does this work?" help affordance — a help icon that reveals
 * a compact tooltip on hover, keyboard focus, or tap. Standing rule (Luigi
 * 2026-06-12): every non-obvious feature carries one of these instead of a
 * page-cluttering text block. Keep `text` to 1–3 short, plain-language
 * sentences, and ALWAYS pass an already-translated string (t("...")).
 *
 *   <HelpTip text={t("dailyHoursExplainer")} />
 *
 * Accessible: the trigger is a real button (keyboard-focusable, aria-describedby
 * the tooltip), and tapping toggles it for touch devices where hover doesn't
 * exist. The tooltip renders BELOW the icon so it isn't clipped near the top of
 * a page; pass `placement="top"` for controls sitting low on screen.
 */
export function HelpTip({
  text,
  className,
  placement = "bottom",
}: {
  text: string;
  className?: string;
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pos =
    placement === "top"
      ? "bottom-full mb-1.5"
      : "top-full mt-1.5";
  return (
    <span className={`relative inline-flex align-middle ${className ?? ""}`}>
      <button
        type="button"
        aria-label={text}
        aria-describedby={open ? id : undefined}
        className="text-gray-400 hover:text-gray-600 focus:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-full"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 left-1/2 -translate-x-1/2 ${pos} w-60 max-w-[78vw] rounded-lg bg-gray-900 text-white text-xs font-normal leading-snug px-2.5 py-2 shadow-lg pointer-events-none whitespace-normal text-left`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
