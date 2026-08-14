/**
 * Font loading for the Marketing Kit renderer (Luigi 2026-08-14).
 *
 * WHY THIS FILE EXISTS AT ALL: `next/og` ships exactly ONE face — `geist`, weight 400 — and
 * satori does NOT synthesise bold. It picks the nearest available weight, so a template with
 * `fontWeight: 800` headlines renders at regular weight and simply looks wrong, with no
 * warning. Supplying real faces is mandatory, not an optimisation.
 *
 * WHY FETCHED, NOT BUNDLED: satori accepts only ttf/otf/woff (woff2 — what almost every font
 * CDN serves by default — is unusable), and a Latin family with three weights is ~450 KB
 * before any non-Latin coverage; CJK faces are 5-16 MB each. Bundling that set would bloat the
 * function and wreck cold start for partners who will only ever print in English. So faces are
 * fetched once per isolate and memo-cached at module scope.
 *
 * SOURCE ORDER:
 *   1. RESELLER_KIT_FONT_BASE (a Vercel Blob prefix we control) — preferred in production:
 *      no third-party runtime dependency, and we can subset the files ourselves.
 *   2. Google Fonts — the same source satori itself falls back to internally for uncovered
 *      glyphs, so this adds no dependency the renderer didn't already have.
 *   3. Nothing — render with satori's default face. Latin still reads; headlines just lose
 *      their weight. A flyer that looks flat beats a 500.
 *
 * Every fetch is bounded by AbortSignal.timeout: satori's own image/font fetches have NO
 * timeout, and a hanging font host would otherwise stall the function until it dies.
 */

export interface KitFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 600 | 700 | 800;
  style: "normal";
}

const FETCH_TIMEOUT_MS = 4000;

/** Latin/Greek/Cyrillic/Vietnamese body + headline family. */
const CORE_FAMILY = "Noto Sans";
const CORE_WEIGHTS: KitFont["weight"][] = [400, 700, 800];

/**
 * Scripts satori can shape correctly, verified empirically on 2026-08-14 by rendering real
 * strings rather than trusting docs:
 *   - Thai            ✅ vowel/tone marks correctly positioned
 *   - Hebrew          ✅ correct RTL order AND digits kept LTR — but ONLY with direction:"rtl"
 *   - CJK             ✅ (coverage only, no shaping needed)
 *   - Devanagari      ❌ "मार्जिन" renders as "मार्जनि" — the short-i matra lands after the
 *                        consonant instead of before it. Genuinely broken; gated.
 *   - Arabic          ⚠️ contextual forms shape correctly, ordering looks right, but this has
 *                        not been checked by someone who reads Arabic. Gated until it is —
 *                        the alternative is a partner finding out after printing 500 copies.
 */
const UNRENDERABLE_LOCALES = new Set(["hi", "ar"]);

/** Locales whose text must be laid out right-to-left. */
const RTL_LOCALES = new Set(["ar", "he"]);

/** Extra family needed per locale, beyond the core Latin/Greek/Cyrillic face. */
const SCRIPT_FAMILY: Record<string, string> = {
  zh: "Noto Sans SC",
  ja: "Noto Sans JP",
  ko: "Noto Sans KR",
  th: "Noto Sans Thai",
  he: "Noto Sans Hebrew",
  ar: "Noto Sans Arabic",
  hi: "Noto Sans Devanagari",
};

export function isRenderableLocale(locale: string): boolean {
  return !UNRENDERABLE_LOCALES.has(locale);
}

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

/**
 * Base charset every render subsets to: ASCII printable + Latin-1 Supplement + the Latin
 * Extended-A characters European locales actually use + typographic punctuation + currency.
 *
 * WHY SUBSET AT ALL — measured 2026-08-14, and it was the difference between a usable feature
 * and an unusable one. Google's full Noto Sans TTF is 543 KB per weight; three weights is
 * 1.6 MB that opentype.js re-parses on EVERY satori call, which took a single A4 flyer from
 * 0.26 s to 7-9 s. Subsetted, one weight is 14 KB. Same pixels, ~38x less font to parse.
 */
const BASE_CHARSET =
  " !\"#$%&'()*+,-./0123456789:;<=>?@" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`" +
  "abcdefghijklmnopqrstuvwxyz{|}~" +
  "€‚„…†‡ˆ‰Š‹ŒŽ''\"\"•–—˜™š›œžŸ" +
  "¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿" +
  "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞß" +
  "àáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ" +
  "ĀāĂăĄąĆćČčĎďĐđĒēĖėĘęĚěĞğĪīĮįŁłŃńŇňŌōŐőŒœŔŕŘřŚśŞşŠšŤťŪūŮůŰűŲųŸŹźŻżŽž";

// ⚠️ Do NOT add pictorial symbols (✓ ★ ☰ ● →) here. They are not in Noto Sans, so Google's
// subset endpoint answers 400 for them, satori then falls back to its dynamic font loader,
// and that fires a fresh network request PER STRING — turning a 0.5 s render into a stream of
// "Failed to load dynamic font" errors. Icons are drawn as inline SVG instead; see the
// CheckIcon / StarIcon helpers in primitives.tsx. Luigi 2026-08-14.

/** Module-scope memo — survives across requests in a warm isolate. */
const cache = new Map<string, ArrayBuffer | null>();
let warnedNoFonts = false;

/** Unique codepoints of `text` that aren't already in the base charset. */
function extraChars(text: string): string {
  const base = new Set(Array.from(BASE_CHARSET));
  const extra = new Set<string>();
  for (const ch of text) {
    if (!base.has(ch) && ch.trim()) extra.add(ch);
  }
  return Array.from(extra).sort().join("");
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Google's CSS endpoint returns woff2 unless the UA looks old; this one gets us ttf.
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Resolve one family+weight, subsetted to `charset`, to font bytes.
 * Cached by (family, weight, charset) — a typical English flyer produces the same charset
 * every time, so this is one fetch per isolate rather than one per render.
 */
async function loadFace(
  family: string,
  weight: number,
  charset: string,
): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}:${charset.length}:${charset.slice(0, 64)}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let data: ArrayBuffer | null = null;

  const base = process.env.RESELLER_KIT_FONT_BASE?.replace(/\/+$/, "");
  if (base) {
    // A self-hosted set is expected to be pre-subsetted, so no &text= here.
    const slug = family.replace(/\s+/g, "");
    data = await fetchArrayBuffer(`${base}/${slug}-${weight}.ttf`);
  }

  if (!data) {
    // The `text` parameter is what makes this cheap — Google returns a font containing only
    // the requested glyphs. The old-browser UA is what makes it return ttf rather than woff2,
    // which satori cannot read.
    const cssUrl =
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}` +
      `:wght@${weight}&text=${encodeURIComponent(charset)}`;
    try {
      const cssRes = await fetch(cssUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" },
      });
      if (cssRes.ok) {
        const css = await cssRes.text();
        const m = css.match(/src:\s*url\(([^)]+)\)/);
        if (m?.[1]) data = await fetchArrayBuffer(m[1]);
      }
    } catch {
      data = null;
    }
  }

  cache.set(key, data);
  return data;
}

/**
 * The font set for a locale: the core family at 400/700/800, plus one script family when the
 * locale needs it. Returns [] when nothing could be loaded — the caller then omits `fonts`
 * and satori falls back to its bundled face.
 */
export async function fontsForLocale(locale: string, renderText = ""): Promise<KitFont[]> {
  // Base charset covers everything a Latin-script flyer needs, so the subset — and therefore
  // the cache key — stays identical across renders. Anything outside it (a partner's accented
  // company name, CJK copy) is appended, which only costs a fetch the first time it appears.
  const charset = BASE_CHARSET + extraChars(renderText);

  const wanted: { family: string; weight: KitFont["weight"] }[] = CORE_WEIGHTS.map((w) => ({
    family: CORE_FAMILY,
    weight: w,
  }));

  const script = SCRIPT_FAMILY[locale];
  if (script) {
    wanted.push({ family: script, weight: 400 }, { family: script, weight: 700 });
  }

  const loaded = await Promise.all(
    wanted.map(async ({ family, weight }) => {
      const data = await loadFace(family, weight, charset);
      // Every face is registered under the SAME satori family name, so a template only ever
      // writes fontFamily:"KitSans" and satori picks the right file per glyph and weight.
      return data ? ({ name: "KitSans", data, weight, style: "normal" } as KitFont) : null;
    }),
  );

  const fonts = loaded.filter((f): f is KitFont => f !== null);
  if (fonts.length === 0 && !warnedNoFonts) {
    warnedNoFonts = true;
    console.warn(
      "[reseller-kit] No fonts could be loaded; falling back to satori's default face. " +
        "Headlines will render at regular weight. Set RESELLER_KIT_FONT_BASE to a Blob prefix.",
    );
  }
  return fonts;
}

/** Test seam — drop the memo so a test can exercise the fallback path. */
export function __clearFontCache(): void {
  cache.clear();
  warnedNoFonts = false;
}
