import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Framed product screenshot for the Nabil AI marketing page — the same
 * browser-chrome / phone-bezel look as `ScreenshotFrame` in
 * components/marketing/sections.tsx, but rendered through `next/image` so the
 * dashboard captures (public/marketing/nabil/*.png, ≤1600 px wide) are served
 * resized + lazy. Intrinsic width/height are passed by the caller (they were
 * measured at capture time by scripts/_capture-nabil-shots.ts) so the frame
 * reserves the right box before the image loads (no CLS).
 *
 * Presentational, isomorphic (no hooks) — usable from the server page.
 */
const SHADOW_FRAME =
  "shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18),0_8px_24px_-12px_rgba(16,24,40,0.10)]";

export type NabilShotProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  variant?: "browser" | "phone";
  /** Faux address-bar text (browser variant only). */
  url?: string;
  /** Above-the-fold hero use only. */
  priority?: boolean;
  /** `sizes` hint for the responsive srcset. */
  sizes?: string;
  glow?: boolean;
  className?: string;
};

export function NabilShot({
  src, alt, width, height, variant = "browser", url, priority = false,
  sizes = "(min-width: 1024px) 50vw, 100vw", glow = false, className = "",
}: NabilShotProps) {
  const img = (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      priority={priority}
      className="w-full h-auto block"
    />
  );

  let frame: ReactNode;
  if (variant === "phone") {
    frame = (
      <div className={`relative mx-auto max-w-[270px] rounded-[2.4rem] border-[8px] border-gray-800 bg-gray-800 ${SHADOW_FRAME} ${className}`}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-800 rounded-b-2xl z-10" />
        <div className="overflow-hidden rounded-[1.7rem] bg-white">{img}</div>
      </div>
    );
  } else {
    frame = (
      <div className={`rounded-2xl border border-gray-200/80 bg-white overflow-hidden ${SHADOW_FRAME} ${className}`}>
        <div className="flex items-center gap-1.5 px-3.5 py-2.5 bg-gray-50 border-b border-gray-100">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          {url ? (
            <div className="ml-2 flex-1 max-w-[60%]">
              <div className="rounded-md bg-white border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-400 truncate">{url}</div>
            </div>
          ) : null}
        </div>
        {img}
      </div>
    );
  }

  if (!glow) return frame;
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-10 -z-10"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0) 70%)" }}
      />
      {frame}
    </div>
  );
}
