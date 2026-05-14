"use client";
import { useRef, useState } from "react";
import { Upload, X, ImageIcon, Link } from "lucide-react";

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspectRatio?: "square" | "wide" | "auto";
}

export function ImageUpload({ value, onChange, label, aspectRatio = "auto" }: Props) {
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState(value);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const previewClass = aspectRatio === "square"
    ? "w-20 h-20"
    : aspectRatio === "wide"
    ? "w-full h-24"
    : "w-full h-20";

  const handleFile = async (file: File) => {
    setError("");
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onChange(data.url);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const applyUrl = () => {
    onChange(urlDraft.trim());
    setShowUrlInput(false);
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}

      {/* Preview */}
      {value ? (
        <div className={`relative ${previewClass} mb-2`}>
          <img
            src={value}
            alt="Preview"
            className="w-full h-full object-cover rounded-lg border border-gray-200"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow hover:bg-red-600 transition"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className={`${previewClass} min-h-[80px] border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 mb-2`}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-1">
              <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400">Uploading…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 text-gray-300">
              <ImageIcon className="w-6 h-6" />
              <span className="text-xs">Drop image here</span>
            </div>
          )}
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:border-orange-400 hover:text-orange-600 transition disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Uploading…" : value ? "Replace" : "Upload Image"}
        </button>
        <button
          type="button"
          onClick={() => { setShowUrlInput(!showUrlInput); setUrlDraft(value); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 hover:border-gray-400 transition"
        >
          <Link className="w-3.5 h-3.5" />
          Use URL
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-600 transition"
          >
            <X className="w-3.5 h-3.5" /> Remove
          </button>
        )}
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="flex gap-2 mt-2">
          <input
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
            value={urlDraft}
            onChange={e => setUrlDraft(e.target.value)}
            placeholder="https://example.com/image.jpg"
            onKeyDown={e => e.key === "Enter" && applyUrl()}
          />
          <button
            type="button"
            onClick={applyUrl}
            className="px-3 py-1.5 text-xs font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
          >
            Apply
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
