"use client";
import { useEffect } from "react";

/** Fires the browser print dialog once the flyer (incl. the inlined QR) has
 *  painted. A short rAF/timeout avoids printing a half-laid-out page. */
export function PrintTrigger() {
  useEffect(() => {
    const id = setTimeout(() => {
      try { window.print(); } catch {}
    }, 350);
    return () => clearTimeout(id);
  }, []);
  return null;
}
