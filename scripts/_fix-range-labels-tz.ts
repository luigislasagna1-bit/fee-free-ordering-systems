// Swap formatRangeLabel(range) → formatRangeLabelInTz(range, scope.timezone ?? undefined)
// on the sub-reports that use the tz-aware range (parseDateRangeInTz), so their
// subtitle dates match the dashboard (no "Jun 25 → Jun 26" UTC off-by-one).
// Excludes connectivity + heatmap (they use server-local parseDateRange — a label
// swap there would mismatch the data; their full tz migration is a separate follow-up).
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "src/app/admin/reports/list/clients/page.tsx",
  "src/app/admin/reports/list/orders/page.tsx",
  "src/app/admin/reports/menu-insights/categories/page.tsx",
  "src/app/admin/reports/menu-insights/items/page.tsx",
  "src/app/admin/reports/online-ordering/clients/page.tsx",
  "src/app/admin/reports/online-ordering/funnel/page.tsx",
  "src/app/admin/reports/online-ordering/promotions/page.tsx",
  "src/app/admin/reports/online-ordering/reservations/page.tsx",
  "src/app/admin/reports/online-ordering/visits/page.tsx",
  "src/app/admin/reports/sales/summary/page.tsx",
  "src/app/admin/reports/sales/trend/page.tsx",
];

const DR_RE = /import \{([^}]*)\} from "@\/lib\/reports\/date-range";/;
const TZ_RE = /import \{([^}]*)\} from "@\/lib\/reports\/date-range-tz";/;

let changed = 0;
for (const f of FILES) {
  let s = readFileSync(f, "utf8");
  if (!s.includes("formatRangeLabel(range)")) { console.log(`SKIP (no usage): ${f}`); continue; }
  s = s.replaceAll("formatRangeLabel(range)", "formatRangeLabelInTz(range, scope.timezone ?? undefined)");

  // Add formatRangeLabelInTz to the date-range-tz import (or insert one before the date-range import).
  if (TZ_RE.test(s)) {
    s = s.replace(TZ_RE, (_m, inner) => {
      const names = inner.split(",").map((x: string) => x.trim()).filter(Boolean);
      if (!names.includes("formatRangeLabelInTz")) names.push("formatRangeLabelInTz");
      return `import { ${names.join(", ")} } from "@/lib/reports/date-range-tz";`;
    });
  } else {
    s = s.replace(DR_RE, (m) => `import { formatRangeLabelInTz } from "@/lib/reports/date-range-tz";\n${m}`);
  }

  // Drop formatRangeLabel from the date-range import (remove the line if it becomes empty).
  s = s.replace(DR_RE, (_m, inner) => {
    const names = inner.split(",").map((x: string) => x.trim()).filter((x: string) => x && x !== "formatRangeLabel");
    return names.length ? `import { ${names.join(", ")} } from "@/lib/reports/date-range";` : "__DROP_LINE__";
  });
  s = s.replace(/__DROP_LINE__\n/, "");

  writeFileSync(f, s, "utf8");
  changed++;
  console.log(`fixed: ${f.replace("src/app/admin/reports/", "")}`);
}
console.log(`\n${changed} files updated.`);
