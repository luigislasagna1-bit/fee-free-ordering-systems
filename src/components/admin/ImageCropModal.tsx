"use client";
/**
 * Crop-before-upload modal (Luigi 2026-07-04): every admin image upload
 * (menu item, category, logo, banner, promo popup, website editor…) opens
 * this first so owners can zoom/pan and pick the section of the photo they
 * actually want — no more letterboxed or off-centre item photos. Built on
 * react-easy-crop (drag + wheel/pinch zoom, touch-friendly).
 *
 * Output: the cropped area rendered to a canvas → JPEG blob (0.9 quality),
 * handed back to ImageUpload which uploads it through the existing
 * /api/upload path. "Use original" skips cropping entirely, so nothing that
 * worked before is taken away.
 */
import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { X, Check, ZoomIn, ImageIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type AspectKey = "square" | "standard" | "wide";
const ASPECTS: Record<AspectKey, number> = { square: 1, standard: 4 / 3, wide: 16 / 9 };

interface Props {
  /** Object URL of the picked file (caller creates + revokes it). */
  imageUrl: string;
  /** Preselected aspect — from ImageUpload's aspectRatio prop. */
  initialAspect?: AspectKey;
  /** Cropped JPEG blob, or null when the owner chose "Use original". */
  onDone: (cropped: Blob | null) => void;
  onCancel: () => void;
}

/** Draw the selected area onto a canvas and return it as a JPEG blob. */
async function cropToBlob(imageUrl: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = imageUrl;
  });
  const canvas = document.createElement("canvas");
  // Cap the output at 2000px on the long edge — plenty for any surface we
  // render (item cards, banners) and keeps uploads well under the 5 MB cap.
  const scale = Math.min(1, 2000 / Math.max(area.width, area.height));
  canvas.width = Math.round(area.width * scale);
  canvas.height = Math.round(area.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("crop failed"))), "image/jpeg", 0.9);
  });
}

export function ImageCropModal({ imageUrl, initialAspect = "standard", onDone, onCancel }: Props) {
  const t = useTranslations("admin.imageCrop");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<AspectKey>(initialAspect);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  const onCropComplete = useCallback((_: Area, px: Area) => setAreaPixels(px), []);

  const confirm = async () => {
    if (!areaPixels) return;
    setWorking(true);
    try {
      onDone(await cropToBlob(imageUrl, areaPixels));
    } catch {
      // Canvas failed (rare — e.g. a tainted cross-origin image): fall back
      // to uploading the original rather than dead-ending the owner.
      onDone(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm">{t("title")}</h3>
          <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Crop stage */}
        <div className="relative w-full h-72 bg-gray-900">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={ASPECTS[aspect]}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Aspect presets */}
          <div className="flex items-center gap-2">
            {(Object.keys(ASPECTS) as AspectKey[]).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setAspect(k)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                  aspect === k
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {t(`aspect_${k}`)}
              </button>
            ))}
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-2">
            <ZoomIn className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onDone(null)}
            disabled={working}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <ImageIcon className="w-3.5 h-3.5" /> {t("useOriginal")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={working}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={working || !areaPixels}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t("cropAndUpload")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
