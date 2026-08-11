"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Play, Square, Volume2 } from "lucide-react";

/**
 * Settings → Voice: pick who Nabil sounds like.
 *
 * Replaces a raw "ElevenLabs voice id" text box — a field no restaurant owner
 * could ever fill in. Cards carry a name, gender and accent, and the play button
 * samples the voice speaking THIS STORE'S OWN greeting, so the owner hears what
 * a caller will hear rather than a generic demo line.
 *
 * The catalogue comes from the server (the platform's live ElevenLabs list when
 * a key is configured, else a curated built-in set), so the picker can only ever
 * offer ids ConversationRelay will accept.
 */

export type VoiceOption = {
  id: string;
  name: string;
  gender: "female" | "male";
  accent: string;
};

export default function VoicePicker({
  value,
  speed,
  onChange,
}: {
  value: string;
  /** Current (possibly unsaved) speed, so a sample matches the slider. */
  speed: number;
  onChange: (voiceId: string) => void;
}) {
  const t = useTranslations("admin.phoneOrderingPage.settingsTabs");
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [previewAvailable, setPreviewAvailable] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/phone-ordering/voices")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setVoices(Array.isArray(j.voices) ? j.voices : []);
        setPreviewAvailable(!!j.previewAvailable);
      })
      .catch(() => {
        if (!cancelled) setVoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Never leave audio playing behind when the tab unmounts.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaying(null);
  }

  async function preview(voiceId: string) {
    setError("");
    if (playing === voiceId) {
      stop();
      return;
    }
    stop();
    setLoadingId(voiceId);
    try {
      const res = await fetch(
        `/api/admin/phone-ordering/voice-preview?voiceId=${encodeURIComponent(voiceId)}&speed=${speed}`,
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.code === "preview_unavailable" ? t("previewUnavailable") : t("previewFailed"));
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const el = new Audio(url);
      audioRef.current = el;
      el.onended = () => {
        URL.revokeObjectURL(url);
        setPlaying(null);
      };
      setPlaying(voiceId);
      await el.play();
    } catch {
      setError(t("previewFailed"));
    } finally {
      setLoadingId(null);
    }
  }

  if (voices === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("voicesLoading")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {/* "Default" is always first and always safe: it sends no voice
            attribute at all, so the call uses Twilio's own default. */}
        <VoiceCard
          selected={!value}
          name={t("voiceDefault")}
          sub={t("voiceDefaultHint")}
          onSelect={() => onChange("")}
        />
        {voices.map((v) => (
          <VoiceCard
            key={v.id}
            selected={value === v.id}
            name={v.name}
            sub={`${t(v.gender === "male" ? "voiceMale" : "voiceFemale")} · ${v.accent}`}
            onSelect={() => onChange(v.id)}
            onPreview={previewAvailable ? () => preview(v.id) : undefined}
            previewState={loadingId === v.id ? "loading" : playing === v.id ? "playing" : "idle"}
          />
        ))}
      </div>
      {!previewAvailable && <p className="text-xs text-gray-500">{t("previewUnavailable")}</p>}
      {previewAvailable && <p className="text-xs text-gray-500">{t("previewHint")}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function VoiceCard({
  selected,
  name,
  sub,
  onSelect,
  onPreview,
  previewState = "idle",
}: {
  selected: boolean;
  name: string;
  sub: string;
  onSelect: () => void;
  onPreview?: () => void;
  previewState?: "idle" | "loading" | "playing";
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-3 transition ${
        selected ? "border-sky-500 bg-sky-50" : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <button type="button" onClick={onSelect} className="flex-1 text-left min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          {selected && <Check className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />}
          <span className="truncate">{name}</span>
        </span>
        <span className="block text-xs text-gray-500 truncate">{sub}</span>
      </button>
      {onPreview && (
        <button
          type="button"
          onClick={onPreview}
          aria-label={name}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition"
        >
          {previewState === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : previewState === "playing" ? (
            <Square className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
      )}
      {!onPreview && <Volume2 className="w-4 h-4 text-gray-300 flex-shrink-0" />}
    </div>
  );
}
