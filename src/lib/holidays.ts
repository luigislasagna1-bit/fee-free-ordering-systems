// Small built-in public-holiday calendar. Date strings are local-date ISO
// "YYYY-MM-DD" — callers should normalize the comparison date the same way.
//
// US and CA federal holidays for 2026–2028. Extend by adding entries below or
// swap in `date-holidays` later if more locales are needed.
const HOLIDAYS: Record<string, Set<string>> = {
  US: new Set([
    // 2026
    "2026-01-01", // New Year's Day
    "2026-01-19", // MLK Day
    "2026-02-16", // Presidents' Day
    "2026-05-25", // Memorial Day
    "2026-06-19", // Juneteenth
    "2026-07-04", // Independence Day
    "2026-09-07", // Labor Day
    "2026-10-12", // Columbus Day
    "2026-11-11", // Veterans Day
    "2026-11-26", // Thanksgiving
    "2026-12-25", // Christmas
    // 2027
    "2027-01-01",
    "2027-01-18",
    "2027-02-15",
    "2027-05-31",
    "2027-06-19",
    "2027-07-04",
    "2027-09-06",
    "2027-10-11",
    "2027-11-11",
    "2027-11-25",
    "2027-12-25",
    // 2028
    "2028-01-01",
    "2028-07-04",
    "2028-11-23",
    "2028-12-25",
  ]),
  CA: new Set([
    // 2026
    "2026-01-01", // New Year's Day
    "2026-04-03", // Good Friday
    "2026-05-18", // Victoria Day
    "2026-07-01", // Canada Day
    "2026-09-07", // Labour Day
    "2026-10-12", // Thanksgiving
    "2026-12-25", // Christmas
    "2026-12-26", // Boxing Day
    // 2027
    "2027-01-01",
    "2027-03-26",
    "2027-05-24",
    "2027-07-01",
    "2027-09-06",
    "2027-10-11",
    "2027-12-25",
    "2027-12-27", // Boxing Day observed (26th Sunday)
    // 2028
    "2028-01-03", // observed
    "2028-07-03", // Canada Day observed
    "2028-12-25",
    "2028-12-26",
  ]),
};

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isPublicHoliday(date: Date, country: string): boolean {
  const iso = toLocalIsoDate(date);
  return HOLIDAYS[country]?.has(iso) ?? false;
}

export const SUPPORTED_HOLIDAY_COUNTRIES = Object.keys(HOLIDAYS);
