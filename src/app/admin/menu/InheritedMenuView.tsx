"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Layers, Eye, AlertCircle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

/**
 * Read-only view shown on /admin/menu when this location inherits the
 * brand's master menu (Restaurant.useBrandMenu = true). The MenuClient
 * editing UI is hidden until the owner clicks "Customize this
 * location's menu" — that flips useBrandMenu to false and copies the
 * brand's menu into this location so they have a starting point.
 *
 * Kept separate from MenuClient (1500-line file) on purpose: the
 * inheriting state is a fundamentally different mode and trying to
 * grey-out every edit button in MenuClient would be both error-prone
 * and noisy.
 */

type InheritedItem = {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
};
type InheritedCategory = {
  id: string;
  name: string;
  itemCount: number;
  items: InheritedItem[];
};

export function InheritedMenuView({
  brandName,
  categories,
}: {
  brandName: string;
  categories: InheritedCategory[];
}) {
  const router = useRouter();
  const t = useTranslations("admin.inheritedMenu");
  const [customizing, setCustomizing] = useState(false);

  const totalItems = categories.reduce((s, c) => s + c.itemCount, 0);

  const handleCustomize = async () => {
    if (customizing) return;
    setCustomizing(true);
    try {
      const res = await fetch("/api/menu/customize-location", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("toastCustomizeError"));
        return;
      }
      toast.success(
        t("toastCopied", { categoriesCopied: data.categoriesCopied ?? 0, itemsCopied: data.itemsCopied ?? 0 }),
        { duration: 6000 },
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || t("toastCustomizeError"));
    } finally {
      setCustomizing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-5 sm:p-6 mb-6 shadow-lg">
        <div className="flex items-start gap-3 mb-3">
          <Layers className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h1 className="text-lg sm:text-xl font-bold leading-tight">
              {t("headerTitle", { brandName })}
            </h1>
            <p className="text-sm text-white/85 mt-1 leading-snug">
              {t("headerSubtitle", { totalItems, categoryCount: categories.length })}
            </p>
          </div>
        </div>

        {/* Customize CTA */}
        <div className="mt-4 bg-white/15 border border-white/25 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold mb-0.5">{t("customizeHeading")}</p>
              <p className="text-white/80">
                {t("customizeDescription")}
              </p>
            </div>
          </div>
          <button
            onClick={handleCustomize}
            disabled={customizing}
            className="w-full sm:w-auto bg-white text-amber-700 hover:bg-amber-50 disabled:opacity-60 disabled:cursor-wait font-bold px-5 py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
          >
            {customizing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t("buttonCopying")}</>
            ) : (
              <><Eye className="w-4 h-4" /> {t("buttonCustomize")}</>
            )}
          </button>
        </div>
      </div>

      {/* Read-only preview */}
      <div className="space-y-4">
        {categories.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Layers className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{t("emptyState")}</p>
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-bold text-gray-900 truncate">{cat.name}</h2>
                  <span className="text-xs font-medium text-gray-500 flex-shrink-0">
                    {t("categoryItemCount", { count: cat.itemCount })}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {cat.items.slice(0, 12).map((item) => (
                  <div key={item.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-800 truncate">{item.name}</span>
                    <span className="text-sm font-mono text-gray-600 flex-shrink-0">
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                ))}
                {cat.itemCount > 12 && (
                  <div className="px-4 py-2 text-xs text-gray-500 italic">
                    {t("moreItems", { count: cat.itemCount - 12 })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
