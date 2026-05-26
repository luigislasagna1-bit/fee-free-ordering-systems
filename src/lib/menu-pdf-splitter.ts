/**
 * PDF splitter for big menus that exceed Anthropic's 100-page limit.
 *
 * Anthropic's PDF input has a hard 100-page-per-request limit. Real
 * Italian / fine-dining / Asian-fusion menus regularly hit 100-150
 * pages once you add allergens, photos, beverages, wines, desserts.
 * The competitor (GloriaFood-equivalent) handles these — so we do too.
 *
 * Strategy: when the menu is > MAX_PAGES_PER_CHUNK, split into
 * sequential N-page chunks server-side via pdf-lib, run Claude once
 * per chunk, then MERGE the extracted categories.
 *
 * Merge rules:
 *   - Categories with the same (case-insensitive, trimmed) name are
 *     combined. E.g. chunk-1 has "Sushi" and chunk-2 also has "Sushi"
 *     because the menu spilled across the split — they collapse to
 *     one category in the final output.
 *   - Items within a merged category are de-duplicated by name
 *     (case-insensitive, trimmed). The first occurrence wins.
 *   - Category display order follows first-seen order across chunks,
 *     so the merged menu reads top-to-bottom like the original PDF.
 *
 * Chunk size choice: 80 pages, not the full 100. The 20-page margin
 * keeps us safely under Anthropic's limit even if their page-counting
 * differs from pdf-lib's (e.g. metadata pages, embedded forms, etc.).
 *
 * Concurrency: we run chunks SEQUENTIALLY, not in parallel. Reason:
 * Anthropic's per-minute token rate limit is hit easily by parallel
 * 80-page PDFs. Sequential adds latency but is reliable. A 250-page
 * menu = 4 chunks × ~60s = ~240s, fits in Vercel's 300s function
 * cap with margin.
 */

import { PDFDocument } from "pdf-lib";
import { extractMenuWithClaude, type ExtractedCategory } from "./menu-extractor";

/** Max pages per chunk sent to Claude. 20 pages of slack under
 *  Anthropic's 100-page hard limit. */
const MAX_PAGES_PER_CHUNK = 80;

export interface SplitExtractionResult {
  categories: ExtractedCategory[];
  /** Number of chunks the source PDF was split into. 1 = no split. */
  chunkCount: number;
  /** Total pages processed (may equal pageCount of the source). */
  pageCount: number;
}

/**
 * Run Claude over a PDF, automatically splitting + merging if the
 * PDF exceeds MAX_PAGES_PER_CHUNK. For PDFs under the threshold this
 * is a thin wrapper around extractMenuWithClaude (one call, no split).
 */
export async function extractMenuWithSplitting(
  pdfBuffer: Buffer,
): Promise<SplitExtractionResult> {
  const sourceDoc = await PDFDocument.load(new Uint8Array(pdfBuffer));
  const pageCount = sourceDoc.getPageCount();

  // Fast path — fits in one Claude call, no split needed.
  if (pageCount <= MAX_PAGES_PER_CHUNK) {
    const categories = await extractMenuWithClaude(pdfBuffer);
    return { categories, chunkCount: 1, pageCount };
  }

  // Split path. Compute chunk page ranges.
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < pageCount; start += MAX_PAGES_PER_CHUNK) {
    ranges.push({ start, end: Math.min(start + MAX_PAGES_PER_CHUNK, pageCount) });
  }

  // Extract + Claude-call each chunk sequentially.
  const perChunk: ExtractedCategory[][] = [];
  for (const range of ranges) {
    const chunkPdf = await PDFDocument.create();
    const copiedPages = await chunkPdf.copyPages(
      sourceDoc,
      Array.from({ length: range.end - range.start }, (_, i) => range.start + i),
    );
    for (const p of copiedPages) chunkPdf.addPage(p);
    const chunkBytes = await chunkPdf.save();
    const chunkBuffer = Buffer.from(chunkBytes);
    try {
      const cats = await extractMenuWithClaude(chunkBuffer);
      perChunk.push(cats);
    } catch (err) {
      // One chunk failing shouldn't kill the whole import. Log + skip.
      // Owner still gets the items from the other chunks.
      console.error(
        `[menu-pdf-splitter] chunk ${range.start + 1}-${range.end} failed:`,
        err instanceof Error ? err.message : err,
      );
      perChunk.push([]);
    }
  }

  return {
    categories: mergeCategories(perChunk),
    chunkCount: ranges.length,
    pageCount,
  };
}

/**
 * Merge multiple chunks' extracted categories into a single, deduped
 * category list. Same-named categories collapse; items dedup by name
 * within a category. First-seen ordering preserved.
 *
 * Exported for testing — production callers go through
 * extractMenuWithSplitting.
 */
export function mergeCategories(perChunk: ExtractedCategory[][]): ExtractedCategory[] {
  const byKey = new Map<string, ExtractedCategory>();
  const order: string[] = [];

  for (const chunk of perChunk) {
    for (const cat of chunk) {
      const key = cat.name.trim().toLowerCase();
      if (!key) continue;
      let target = byKey.get(key);
      if (!target) {
        target = { name: cat.name.trim(), items: [] };
        byKey.set(key, target);
        order.push(key);
      }
      // Merge items, deduped by name.
      const existingItemNames = new Set(
        target.items.map((it) => it.name.trim().toLowerCase()),
      );
      for (const item of cat.items) {
        const itemKey = item.name.trim().toLowerCase();
        if (existingItemNames.has(itemKey)) continue;
        existingItemNames.add(itemKey);
        target.items.push(item);
      }
    }
  }

  return order.map((k) => byKey.get(k)!).filter((c) => c.items.length > 0);
}
