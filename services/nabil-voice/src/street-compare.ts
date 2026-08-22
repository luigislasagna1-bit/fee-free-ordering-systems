/**
 * Spoken-street vs matched-address similarity (A6 / C13, 2026-08-22).
 *
 * Call cmt3ezxz1: the caller said "Moreland", the geocoder matched "Rutland"
 * and the pin was accepted as verified — nobody read it back. A map hit whose
 * street name shares nothing with what the caller said is NOT a verified
 * address; it is a question ("I have 12 Rutland Crescent — is that right?").
 *
 * Pure and deliberately forgiving: abbreviations are expanded on both sides,
 * a single typo/transposition is tolerated on longer names (the ASR's
 * "McEachren" vs OSM's "McEachern"), and landmarks with no street word at
 * all are never flagged (there is nothing to compare).
 */
const ABBREV: Record<string, string> = {
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  rd: "road",
  dr: "drive",
  cres: "crescent",
  cr: "crescent",
  crt: "court",
  ct: "court",
  blvd: "boulevard",
  bvd: "boulevard",
  ln: "lane",
  pl: "place",
  trl: "trail",
  hwy: "highway",
  pkwy: "parkway",
  sq: "square",
  ter: "terrace",
  terr: "terrace",
  cir: "circle",
  gdns: "gardens",
  grv: "grove",
  hts: "heights",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
};
const GENERIC = new Set([
  ...Object.values(ABBREV),
  "unit",
  "apt",
  "apartment",
  "suite",
  "floor",
  "the",
  "on",
  "at",
  "and",
  "of",
  "in",
  "near",
  "by",
]);

export function streetTokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((t) => ABBREV[t] ?? t);
}

/** The words of a spoken street that actually identify it: no house number,
 *  no unit, no suffix/direction words. */
export function streetCoreTokens(spoken: string): string[] {
  return streetTokens(spoken).filter((t) => !/^\d+[a-z]?$/.test(t) && !GENERIC.has(t) && t.length >= 3);
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transposition). */
export function osaDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

function tokensClose(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  if (len >= 5 && (a.startsWith(b) || b.startsWith(a))) return true;
  const tol = len >= 8 ? 2 : len >= 5 ? 1 : 0;
  return tol > 0 && osaDistance(a, b) <= tol;
}

/**
 * True when the matched address plausibly IS the street the caller named.
 * Returns true (no opinion) when the spoken text carries no identifying word.
 */
export function streetMatches(spoken: string, matchedLabel: string): boolean {
  const core = streetCoreTokens(spoken);
  if (core.length === 0) return true;
  const label = streetTokens(matchedLabel);
  if (label.length === 0) return true;
  return core.some((t) => label.some((l) => tokensClose(t, l)));
}
