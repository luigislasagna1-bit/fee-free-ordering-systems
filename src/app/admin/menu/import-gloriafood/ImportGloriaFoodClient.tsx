"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Download, Loader2, CheckCircle2, AlertTriangle, ChevronRight,
  Layers, ShoppingBag, Sparkles, Tags,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

/**
 * GloriaFood import wizard — 3 steps.
 *
 * Step 1: paste the embed snippet / URL / UID.
 *         The same input handles all three forms — the server-side
 *         parser is permissive on purpose so the owner doesn't have
 *         to know whether they're pasting the right "kind" of string.
 *
 * Step 2: preview the parsed menu with totals + per-category counts.
 *         Owners can pick "merge into existing category" per imported
 *         category so re-importing later doesn't create duplicate
 *         categories.
 *
 * Step 3: commit + redirect to /admin/menu with a success toast
 *         summarising what landed.
 */
export function ImportGloriaFoodClient() {
  const router = useRouter();
  const t = useTranslations("admin.importGloriaFood");

  // Wizard state
  const [step, setStep] = useState<"input" | "preview" | "committing" | "done">("input");
  const [source, setSource] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [existingCategories, setExistingCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [mergeMap, setMergeMap] = useState<Record<string, string>>({});
  const [commitResult, setCommitResult] = useState<any | null>(null);

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/menu/import-gloriafood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("previewFailed", { status: res.status }));
        return;
      }
      setPreview(data.preview);
      setExistingCategories(data.existingCategories ?? []);
      setStep("preview");
    } catch (e: any) {
      setError(e?.message ?? t("networkError"));
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setStep("committing");
    setError(null);
    try {
      const res = await fetch("/api/menu/import-gloriafood", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview, mergeMap }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("importFailed", { status: res.status }));
        setStep("preview");
        return;
      }
      setCommitResult(data);
      setStep("done");
      toast.success(t("toastImported", { count: data.itemsCreated ?? 0 }));
    } catch (e: any) {
      setError(e?.message ?? t("networkError"));
      setStep("preview");
    }
  };

  // ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-8">
      <Link
        href="/admin/menu"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> {t("backToMenu")}
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <Download className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-600">
            {t("pageSubtitle")}{" "}
            <span className="text-gray-500">
              {t("pageSubtitleNote")}
            </span>
          </p>
        </div>
      </div>

      {/* Progress chips */}
      <div className="flex items-center gap-2 my-6 text-xs">
        <StepChip active={step === "input"} done={step !== "input"}>{t("step1Label")}</StepChip>
        <ChevronRight className="w-3 h-3 text-gray-300" />
        <StepChip active={step === "preview" || step === "committing"} done={step === "done"}>
          {t("step2Label")}
        </StepChip>
        <ChevronRight className="w-3 h-3 text-gray-300" />
        <StepChip active={step === "done"} done={false}>{t("step3Label")}</StepChip>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* ── Step 1: paste source ───────────────────────────────────── */}
      {step === "input" && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            {t("inputLabel")}
          </label>
          <p className="text-xs text-gray-500 mb-3">
            {t.rich("inputHint", {
              strong: (c) => <strong>{c}</strong>,
            })}
          </p>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            placeholder={`<span class="glf-button" data-glf-cuid="..." data-glf-ruid="...">See MENU & Order</span>\n<script src="https://www.fbgcdn.com/embedder/js/ewm2.js" defer async></script>`}
          />
          <div className="flex items-center justify-between mt-4">
            <Link
              href="/admin/menu"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {t("cancel")}
            </Link>
            <button
              onClick={handlePreview}
              disabled={previewing || !source.trim()}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {previewing ? t("fetchingMenu") : t("previewMenu")}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: preview ────────────────────────────────────────── */}
      {(step === "preview" || step === "committing") && preview && (
        <div className="space-y-4">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatTile icon={Layers} label={t("statCategories")} value={preview.stats.categories} />
            <StatTile icon={ShoppingBag} label={t("statItems")} value={preview.stats.items} />
            <StatTile icon={Tags} label={t("statSizes")} value={preview.stats.variants} />
            <StatTile icon={Sparkles} label={t("statModifierGroups")} value={preview.stats.modifierGroups} />
            <StatTile icon={Sparkles} label={t("statOptions")} value={preview.stats.modifierOptions} />
          </div>
          {(preview.stats.skippedInactive > 0 || preview.stats.skippedHidden > 0) && (
            <div className="text-xs text-gray-500">
              {preview.stats.skippedHidden > 0
                ? t("skippedBoth", {
                    inactive: preview.stats.skippedInactive ?? 0,
                    hidden: preview.stats.skippedHidden ?? 0,
                  })
                : t("skippedInactive", { inactive: preview.stats.skippedInactive ?? 0 })}
            </div>
          )}

          {/* Per-category list with merge target dropdown */}
          <div className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
            {preview.categories.map((cat: any) => (
              <div key={cat.sourceId} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{cat.name}</div>
                    {cat.description && (
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{cat.description}</div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      {t("catItemCount", { count: cat.items.length ?? 0 })}
                    </div>
                  </div>
                  {existingCategories.length > 0 && (
                    <select
                      value={mergeMap[String(cat.sourceId)] ?? ""}
                      onChange={(e) =>
                        setMergeMap((m) => ({ ...m, [String(cat.sourceId)]: e.target.value }))
                      }
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 max-w-[200px]"
                    >
                      <option value="">{t("createNewCategory")}</option>
                      {existingCategories.map((ec) => (
                        <option key={ec.id} value={ec.id}>
                          {t("mergeInto", { name: ec.name })}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {cat.items.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs text-emerald-700 cursor-pointer hover:underline">
                      {t("showItems", { count: cat.items.length ?? 0 })}
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {cat.items.slice(0, 50).map((it: any) => (
                        <li key={it.sourceId} className="flex items-center justify-between gap-3 pl-3">
                          <span className="text-gray-700 truncate">
                            {it.name}
                            {it.hasVariants && (
                              <span className="text-xs text-gray-400 ml-2">
                                ({t("variantSizes", { count: it.variants.length ?? 0 })})
                              </span>
                            )}
                          </span>
                          <span className="text-gray-500 text-xs flex-shrink-0">
                            ${it.basePrice.toFixed(2)}
                          </span>
                        </li>
                      ))}
                      {cat.items.length > 50 && (
                        <li className="pl-3 text-xs text-gray-400">{t("andMore", { count: cat.items.length - 50 })}</li>
                      )}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => { setStep("input"); setPreview(null); }}
              className="text-sm text-gray-500 hover:text-gray-700"
              disabled={step === "committing"}
            >
              {t("startOver")}
            </button>
            <button
              onClick={handleCommit}
              disabled={step === "committing"}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50"
            >
              {step === "committing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {step === "committing" ? t("importing") : t("importThisMenu")}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: done ───────────────────────────────────────────── */}
      {step === "done" && commitResult && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-1">{t("doneHeading")}</h2>
          <p className="text-sm text-gray-700 mb-5">
            {t("doneSummary", {
              categories: commitResult.categoriesCreated ?? 0,
              items: commitResult.itemsCreated ?? 0,
              sizes: commitResult.variantsCreated ?? 0,
              libraryGroups: commitResult.libraryGroupsCreated ?? 0,
              groups: commitResult.groupsCreated ?? 0,
              options: commitResult.optionsCreated ?? 0,
            })}
            {typeof commitResult.imagesImported === "number" && (
              <span className="block text-xs text-gray-500 mt-1">
                {commitResult.imagesFailed > 0
                  ? t("imagesImportedWithFailures", {
                      imported: commitResult.imagesImported ?? 0,
                      failed: commitResult.imagesFailed ?? 0,
                    })
                  : t("imagesImported", { imported: commitResult.imagesImported ?? 0 })}
              </span>
            )}
            {commitResult.itemsSkippedDuplicate > 0 && (
              <span className="block text-xs text-gray-500 mt-1">
                {t("skippedDuplicates", { count: commitResult.itemsSkippedDuplicate ?? 0 })}
              </span>
            )}
          </p>
          <button
            onClick={() => router.push("/admin/menu")}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
          >
            {t("openMenuEditor")} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function StepChip({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full font-medium ${
        done ? "bg-emerald-100 text-emerald-700"
          : active ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {children}
    </span>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}
