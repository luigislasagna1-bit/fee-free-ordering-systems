/**
 * AI-powered menu extraction from PDF.
 *
 * Replaces the prior regex-based importer, which only matched lines ending
 * in "$X.XX" — useless on real-world restaurant menus that use multi-column
 * layouts, section headers, modifiers, and decorative typography.
 *
 * Strategy:
 *   - Send the PDF directly to Claude (native PDF input — no image conversion
 *     needed on our side).
 *   - Force structured output via a tool call with a strict JSON schema.
 *   - Falls back to the legacy regex parser if Claude is not configured or
 *     fails. That keeps the importer usable for self-hosted setups without
 *     an Anthropic key.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface ExtractedItem {
  name: string;
  description: string;
  price: number;
}

export interface ExtractedCategory {
  name: string;
  items: ExtractedItem[];
}

export interface ExtractionResult {
  method: "claude" | "regex_fallback";
  categories: ExtractedCategory[];
  /** Human-readable note (e.g. why fallback fired) for debugging in the UI. */
  note?: string;
}

// Sonnet 4.5 is the right balance for menu extraction:
//   - Confirmed working on Luigi's real 92-item / 9-category 5.7MB menu.
//   - Best vision-document quality among production-grade Claude models.
//   - Caveat: ~70s latency on large menus. Vercel Hobby caps functions
//     at 60s — very large menus may time out. Options if this becomes
//     an issue: upgrade Vercel Pro (300s limit), implement a
//     background-job pattern, or downsample PDFs server-side first.
// We tested Haiku 3.5 (deprecated, no PDF support) and Haiku 4.5
// (model identifier 502'd — not yet available on standard accounts).
// Stick with Sonnet 4.5 until faster vision models are GA.
const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a menu extraction expert. The user will provide a restaurant menu PDF.

Your job: read it carefully and call the \`save_menu_extraction\` tool with EVERY category and EVERY item you can find. Be exhaustive — restaurant menus often have 40-100 items across 6-10 categories.

Rules:
- Group items by the category headings shown on the menu (e.g. "Pizzas", "Appetizers", "Pasta", "Desserts"). If there are no visible categories, put everything in a single category called "Menu".
- Each item should include a numeric \`price\` in dollars (e.g. 14.99). If a price IS visible on the menu next to the item, ALWAYS extract it.
- If the menu is "All You Can Eat" / "Buffet" / "Prix Fixe" style where individual items don't have prices (only a single overall price like "$19.99 / person"), set price to 0 for those items — DON'T omit them. Restaurant owners need the item names + descriptions even when they'll set prices manually later. ALSO extract any items that DO have visible prices on the same menu (e.g. beverages, wines, desserts often have prices even when the food is AYCE).
- If a price genuinely isn't visible AND the menu isn't AYCE-style, set price to 0 — the owner will fill it in. It's better to surface the item than drop it.
- If an item has size variants like S/M/L or 10"/14" with different prices, pick the smallest size + price as the primary item and append the variants to the description (e.g. "10\\" $14.99 | 14\\" $19.99"). Do not create duplicate item entries for each size.
- Descriptions should be the ingredient list / blurb shown on the menu, NOT marketing copy from headers. Empty string is fine if there's no description.
- Names should be the dish name as printed — keep capitalization natural. Trim to under 80 characters.
- Do not invent items. Do not skip items that ARE on the menu. Be a faithful transcriber.`;

const TOOL_DEFINITION: Anthropic.Tool = {
  name: "save_menu_extraction",
  description: "Save the structured menu data extracted from the PDF.",
  input_schema: {
    type: "object" as const,
    properties: {
      categories: {
        type: "array",
        description: "All categories on the menu, in display order.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Category name as printed on the menu (e.g. 'Pizzas', 'Pasta', 'Desserts').",
            },
            items: {
              type: "array",
              description: "Every dish/item in this category.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Item name as printed on the menu." },
                  description: { type: "string", description: "Ingredient list or blurb. Empty string if none." },
                  price: { type: "number", description: "Base price in dollars, e.g. 14.99." },
                },
                required: ["name", "description", "price"],
              },
            },
          },
          required: ["name", "items"],
        },
      },
    },
    required: ["categories"],
  },
};

/**
 * Call Claude with the PDF, get structured menu data back. Throws on any
 * error; the route handler catches and decides whether to fall back.
 */
export async function extractMenuWithClaude(pdfBuffer: Buffer): Promise<ExtractedCategory[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  const pdfBase64 = pdfBuffer.toString("base64");

  // Streaming is REQUIRED by the Anthropic SDK when max_tokens is
  // high enough that the request could theoretically run >10 min.
  // Our bumped 32k cap crosses that threshold, so we use
  // client.messages.stream(...).finalMessage() which gives us the
  // same shape as create() but tells the API to stream tokens
  // server-side (we still wait for the complete result client-side
  // before parsing). Confirmed via Anthropic's 2026-05-26 error
  // surfaced during UAT: "Streaming is required for operations that
  // may take longer than 10 minutes."
  //
  // 32k tokens is enough for ~600 menu items. The old 8k cap was
  // truncating the tool-use JSON mid-output on big menus, which
  // surfaced as "Claude returned malformed extraction" + a silent
  // fall-through to the regex parser (useless on photo-heavy
  // menus). Claude Sonnet 4.5 supports up to 64k; 32k keeps
  // latency bounded while accommodating realistic huge menus.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    tools: [TOOL_DEFINITION],
    tool_choice: { type: "tool", name: "save_menu_extraction" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: "Extract every category and every item from this menu PDF. Call the save_menu_extraction tool with the result.",
          },
        ],
      },
    ],
  });
  const response = await stream.finalMessage();

  // Diagnostic: if Claude hit max_tokens we want a clear log line so
  // we can correlate failed UAT uploads to truncation rather than
  // chasing phantom "Claude is broken" reports. We DON'T throw on
  // max_tokens — Claude often gets through 80%+ of the items before
  // truncating; partial extraction is far better than zero.
  if (response.stop_reason === "max_tokens") {
    console.warn(
      "[menu-extractor] Claude hit max_tokens — extraction may be incomplete. " +
      "Input usage:", response.usage,
    );
  }

  // Find the tool_use block in the response. With tool_choice forced, Claude
  // should always produce one — but defensive parsing in case Claude refuses.
  const toolBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "save_menu_extraction"
  );
  if (!toolBlock) {
    throw new Error(
      `Claude did not call the extraction tool (stop_reason=${response.stop_reason ?? "unknown"}). ` +
      "If the menu is very large, try uploading a smaller PDF or splitting it.",
    );
  }

  const input = toolBlock.input as { categories?: ExtractedCategory[] };
  if (!input.categories || !Array.isArray(input.categories)) {
    throw new Error(
      `Claude returned malformed extraction (no categories array; stop_reason=${response.stop_reason ?? "unknown"})`,
    );
  }

  // Sanitize: drop empty categories, trim names/descriptions. Items with
  // price = 0 are KEPT (AYCE / no-price menus — see prompt). We still
  // reject obviously bad numbers (negative, NaN, >$10k) but a missing/
  // zero price now means "owner sets it later" rather than "drop this
  // item entirely." Confirmed during UAT 2026-05-26 against a 60-page
  // Italian Asian-fusion AYCE menu whose ~200 dishes had no per-item
  // prices — the old "omit if no price" rule silently lost everything.
  const clean: ExtractedCategory[] = [];
  for (const cat of input.categories) {
    if (!cat || typeof cat.name !== "string" || !cat.name.trim()) continue;
    const items: ExtractedItem[] = [];
    for (const item of cat.items ?? []) {
      if (!item || typeof item.name !== "string") continue;
      const rawPrice = typeof item.price === "number" ? item.price : parseFloat(String(item.price));
      const price = Number.isFinite(rawPrice) && rawPrice >= 0 && rawPrice <= 10000 ? rawPrice : 0;
      items.push({
        name: item.name.trim().slice(0, 120),
        description: (item.description ?? "").trim().slice(0, 500),
        price: Math.round(price * 100) / 100,
      });
    }
    if (items.length > 0) {
      clean.push({ name: cat.name.trim().slice(0, 60), items });
    }
  }

  return clean;
}

/**
 * Legacy regex fallback — only used when Claude is unavailable. Same heuristic
 * as the pre-Claude importer: lines like "Item Name $12.00" become items in a
 * single "Menu" category.
 */
export function extractMenuWithRegex(text: string): ExtractedCategory[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const items: ExtractedItem[] = [];
  const priceRe = /(?:\$\s*([\d,]+(?:\.\d{2})?)|([\d,]+\.\d{2}))\s*$/;
  let pendingDescription = "";

  for (const line of lines) {
    const priceMatch = line.match(priceRe);
    if (priceMatch) {
      const priceStr = (priceMatch[1] ?? priceMatch[2]).replace(/,/g, "");
      const price = parseFloat(priceStr);
      if (price >= 0 && price < 10000) {
        const name = line.replace(priceRe, "").replace(/\.{2,}/g, "").trim();
        if (name.length >= 2 && name.length <= 120) {
          items.push({ name, description: pendingDescription.trim(), price });
          pendingDescription = "";
          continue;
        }
      }
    }
    if (line.length > 3 && line.length < 200 && !line.match(/^[-=*#_]{3,}$/)) {
      pendingDescription = pendingDescription ? `${pendingDescription} ${line}` : line;
      const words = pendingDescription.split(" ");
      if (words.length > 30) pendingDescription = words.slice(-20).join(" ");
    } else {
      pendingDescription = "";
    }
  }

  if (items.length === 0) return [];
  return [{ name: "Menu", items }];
}
