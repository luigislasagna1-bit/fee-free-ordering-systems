"use client";
import { Layers } from "lucide-react";

/**
 * Banner shown above MenuClient on the BRAND PARENT's menu page when
 * one or more child locations are inheriting this menu. Tells the owner
 * "edits flow downstream" so they don't accidentally rename an item
 * thinking it only affects this location.
 *
 * Hidden when zero locations are inheriting (every child has customized,
 * or there are no child locations at all).
 */
export function MasterMenuBanner({
  inheritingCount,
  totalChildCount,
}: {
  inheritingCount: number;
  totalChildCount: number;
}) {
  if (inheritingCount <= 0) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-3.5 mb-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center flex-shrink-0">
        <Layers className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 text-sm">
        <p className="font-semibold text-indigo-900">
          Master menu — {inheritingCount} of {totalChildCount} location{totalChildCount === 1 ? "" : "s"} inherit{inheritingCount === 1 ? "s" : ""} this menu
        </p>
        <p className="text-indigo-700/85 mt-0.5 text-xs leading-snug">
          Changes you make here appear on every inheriting location instantly. Locations with a custom menu (the
          {totalChildCount - inheritingCount > 0 ? ` ${totalChildCount - inheritingCount} that customized` : " ones that customize"}) are not affected.
        </p>
      </div>
    </div>
  );
}
