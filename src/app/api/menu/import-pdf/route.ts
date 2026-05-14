import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

// Parses raw PDF text into candidate menu items using heuristics.
// Lines that look like "Item Name ... $12.00" or "Item Name  12.00" are captured.
function parsePdfTextToItems(text: string): { name: string; description: string; price: number }[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const items: { name: string; description: string; price: number }[] = [];

  // Require either a "$" prefix or a decimal with two digits so bare integers
  // like years (2024) or page numbers don't get scooped up as menu items.
  const priceRe = /(?:\$\s*([\d,]+(?:\.\d{2})?)|([\d,]+\.\d{2}))\s*$/;
  let pendingDescription = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const priceMatch = line.match(priceRe);

    if (priceMatch) {
      const priceStr = (priceMatch[1] ?? priceMatch[2]).replace(/,/g, "");
      const price = parseFloat(priceStr);
      if (price > 0 && price < 1000) {
        const name = line.replace(priceRe, "").replace(/\.{2,}/g, "").trim();
        if (name.length >= 2 && name.length <= 120) {
          items.push({ name, description: pendingDescription.trim(), price });
          pendingDescription = "";
          continue;
        }
      }
    }

    // Lines without a price may be descriptions for the next item or section headers
    if (line.length > 3 && line.length < 200 && !line.match(/^[-=*#_]{3,}$/)) {
      pendingDescription = pendingDescription ? `${pendingDescription} ${line}` : line;
      // Don't let description accumulate more than 2 lines worth
      const words = pendingDescription.split(" ");
      if (words.length > 30) pendingDescription = words.slice(-20).join(" ");
    } else {
      pendingDescription = "";
    }
  }

  return items;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") || "";

  // ── Extract text from PDF ──────────────────────────────────────────────────
  let rawText = "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("pdf") as File | null;
    if (!file) return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF must be under 10 MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      rawText = text;
    } catch (err) {
      console.error("[PDF import] extractText failed", err);
      return NextResponse.json({ error: "Failed to parse PDF. Make sure it contains selectable text (not a scanned image)." }, { status: 422 });
    }
  } else {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  if (!rawText.trim()) {
    console.warn("[PDF import] extractor returned empty text");
    return NextResponse.json({ error: "No text could be extracted. The PDF may be a scanned image." }, { status: 422 });
  }

  const candidates = parsePdfTextToItems(rawText);
  if (candidates.length === 0) {
    return NextResponse.json({
      error: "No menu items detected. The PDF may be a scanned image or use an unsupported format. Try copying your menu into a text file and pasting it instead.",
    }, { status: 422 });
  }

  // Return categories for the review dropdown
  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({ candidates, categories });
}

// ── Confirm import ─────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { items, categoryId } = await req.json() as {
    items: { name: string; description: string; price: number }[];
    categoryId: string;
  };

  if (!items?.length || !categoryId) {
    return NextResponse.json({ error: "items and categoryId required" }, { status: 400 });
  }

  const maxSort = await prisma.menuItem.aggregate({
    where: { restaurantId, categoryId },
    _max: { sortOrder: true },
  });
  let sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const created = await prisma.$transaction(
    items.map((item) =>
      prisma.menuItem.create({
        data: {
          restaurantId,
          categoryId,
          name: item.name.slice(0, 120),
          description: item.description?.slice(0, 500) || "",
          price: item.price,
          sortOrder: sortOrder++,
        },
      })
    )
  );

  return NextResponse.json({ created: created.length });
}
