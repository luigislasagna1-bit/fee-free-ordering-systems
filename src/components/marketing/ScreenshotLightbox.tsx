"use client";
import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

export type LightboxShot = { src: string; alt: string; label?: string };

/**
 * Full-screen screenshot viewer used on /demo to give the Kitchen + Admin
 * "previews" a real, no-login look instead of bouncing visitors to signup.
 * Keyboard: Esc closes, ←/→ navigate. Click the backdrop to close. The inner
 * content stops propagation so clicks on the image/controls don't dismiss it.
 */
export function ScreenshotLightbox({
  open,
  title,
  shots,
  onClose,
}: {
  open: boolean;
  title: string;
  shots: LightboxShot[];
  onClose: () => void;
}) {
  const t = useTranslations("common");
  const [i, setI] = useState(0);
  useEffect(() => { if (open) setI(0); }, [open]);
  const go = useCallback((d: number) => setI((p) => (p + d + shots.length) % shots.length), [shots.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, go, onClose]);

  if (!open || shots.length === 0) return null;
  const idx = Math.min(i, shots.length - 1);
  const shot = shots[idx];
  const multi = shots.length > 1;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex items-center justify-between w-full max-w-5xl mb-3" onClick={(e) => e.stopPropagation()}>
        <div className="text-white font-semibold flex items-center gap-2">
          {title}
          {multi && <span className="text-white/50 font-normal text-sm">{idx + 1} / {shots.length}</span>}
        </div>
        <button onClick={onClose} aria-label={t("close")} className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative w-full max-w-5xl flex-1 flex items-center justify-center min-h-0" onClick={(e) => e.stopPropagation()}>
        {multi && (
          <button onClick={() => go(-1)} aria-label={t("previous")} className="absolute left-0 sm:-left-5 z-10 bg-white/90 hover:bg-white text-gray-900 rounded-full p-2 shadow-lg transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shot.src} alt={shot.alt} className="max-h-[70vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl ring-1 ring-white/10 bg-white" />
        {multi && (
          <button onClick={() => go(1)} aria-label={t("next")} className="absolute right-0 sm:-right-5 z-10 bg-white/90 hover:bg-white text-gray-900 rounded-full p-2 shadow-lg transition">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {shot.label && <div className="mt-3 text-white/60 text-xs font-mono" onClick={(e) => e.stopPropagation()}>{shot.label}</div>}
      {multi && (
        <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {shots.map((_, n) => (
            <button key={n} onClick={() => setI(n)} aria-label={`${n + 1}`} className={`h-2 rounded-full transition-all ${n === idx ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
