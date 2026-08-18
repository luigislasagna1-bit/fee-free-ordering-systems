"use client";

import { useEffect, useRef } from "react";

/**
 * Drop-in replacement for `<audio controls>` that applies a +6 dB gain via
 * Web Audio API. Twilio phone recordings are notoriously quiet; this makes
 * them comfortable to listen to without the user maxing their system volume.
 */
export function BoostedAudio({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const boosted = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || boosted.current) return;
    const boost = () => {
      if (boosted.current) return;
      boosted.current = true;
      try {
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        gain.gain.value = 2.5;
        source.connect(gain);
        gain.connect(ctx.destination);
      } catch {
        // Fallback: no boost (browser doesn't support Web Audio or element
        // was already connected). The native player still works.
      }
    };
    el.addEventListener("play", boost, { once: true });
    return () => el.removeEventListener("play", boost);
  }, []);

  return <audio ref={ref} controls preload="none" className={className} src={src} />;
}
