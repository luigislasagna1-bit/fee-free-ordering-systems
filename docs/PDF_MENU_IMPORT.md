# PDF Menu Import — Architecture & Locked-In Settings

The auto-import for restaurant menus took a non-trivial amount of iteration to
get working reliably. This doc captures the full architecture and the
configuration choices that need to stay in place. Touch this stack carefully.

## What it does

A restaurant owner drops a menu PDF (up to 25 MB, print-designed, multi-column
layouts welcome) into the importer at `/admin/menu`. About 70–90 seconds later
they see a review modal grouped by category with editable name / price /
description per item. One click imports everything into their menu, creating
new MenuCategory and MenuItem rows in the right shape.

Tested end-to-end on Luigi's Lasagna real menu: 5.7 MB PDF, 9 categories,
92 items, ~98% extraction accuracy (multi-size pricing, multi-column layout,
decorative typography).

## The stack — and why each piece matters

```
Browser
   │
   ├─ 1. Drop PDF into modal
   │
   ├─ 2. @vercel/blob/client.upload()    ◄─── direct upload to Vercel Blob
   │       │                                  storage. Bypasses Vercel's
   │       │                                  4.5 MB serverless function
   │       │                                  body limit (HTTP 413).
   │       │
   │       └── handshake with
   │           /api/menu/import-pdf/upload-url   ◄── issues a 5-minute pre-signed
   │                                              token (was 30 s — too tight)
   │
   ├─ 3. Blob URL returned (tiny string)
   │
   ├─ 4. POST /api/menu/import-pdf with { blobUrl }
   │       │
   │       ├── server fetches PDF from blob (intra-Vercel network, fast)
   │       └── server calls Claude Sonnet 4.5 with PDF + tool_use schema
   │           (takes 70–90 s for a 5.7 MB menu — needs Vercel Pro)
   │
   └─ 5. Review modal renders categories + items, user clicks Import,
        PUT writes everything to DB in one transaction.
```

## Locked-in configuration

### Vercel plan

**Pro plan or higher.** The Hobby plan caps serverless functions at 60 s, and
Claude needs ~70–90 s on a real restaurant menu. **Do not downgrade to Hobby.**

If you must operate on Hobby for some reason, the alternative is to:
  - rasterize the PDF to images at lower DPI server-side before sending to
    Claude (cuts processing time roughly in half)
  - OR split the PDF into chunks and process pages in parallel

Either of those is a substantial code change. Pro plan is the right answer.

### Route configuration

`src/app/api/menu/import-pdf/route.ts`:

```ts
export const maxDuration = 300;   // the full Pro-plan ceiling
```

Do NOT lower this below ~150 s. Real menus need the room.

### Blob upload token validity

`src/app/api/menu/import-pdf/upload-url/route.ts`:

```ts
validUntil: Date.now() + 5 * 60_000;   // 5 minutes
```

The default of 30 s tipped over on slower connections or with edge clock skew.
5 minutes is safe — Blob URLs are public-by-default once written so a longer-
lived token doesn't materially weaken the model.

### Anthropic model

`src/lib/menu-extractor.ts`:

```ts
const MODEL = "claude-sonnet-4-5";
```

We tested alternatives:
  - **Haiku 3.5**: deprecated, doesn't support PDF input. Don't use.
  - **Haiku 4.5**: model identifier returned 502 from Cloudflare on this
    account — appears not yet GA. Re-evaluate later; would be a 2-3× speedup
    when accessible.
  - **Opus**: overkill for transcription work, much more expensive.

Sonnet 4.5 is the right balance until faster vision models are accessible.

### Tool-use vs plain JSON

We use Claude's `tool_use` with a forced `tool_choice` on `save_menu_extraction`.
The schema is strict (categories[].items[].{name, description, price}).
This is more reliable than parsing free-form JSON from text output — the
SDK guarantees the shape matches the schema before our code sees it.

### Body-size limit (Blob route)

The legacy multipart fallback is capped at 4 MB on purpose:

```ts
if (file.size > 4 * 1024 * 1024) {
  return NextResponse.json(
    { error: "PDF too large for direct upload (>4MB). Use the blob upload flow." },
    { status: 413 }
  );
}
```

That keeps it well under Vercel's 4.5 MB function-body limit. The client
never actually hits this path because @vercel/blob/client.upload() is the
default flow — but the fallback exists for future tooling that might post
directly.

### SSRF protection

The POST handler validates that `blobUrl` is from a Vercel Blob domain:

```ts
if (!/^[a-z0-9.-]+\.public\.blob\.vercel-storage\.com$/.test(u.hostname)) {
  return NextResponse.json({ error: "blobUrl must be a Vercel Blob URL" }, { status: 400 });
}
```

Don't relax this — without it, an authenticated user could trick our server
into fetching arbitrary URLs from the internet.

## Required env vars

| Var | Where set | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel Production env vars | Claude API calls |
| `BLOB_READ_WRITE_TOKEN` | Vercel Production env vars (auto-set by Vercel Blob integration) | Pre-signed Blob URLs |

If `ANTHROPIC_API_KEY` is missing, the route falls back to a regex parser
(low quality, but doesn't fail outright).

## Cost

Approximately **$0.20 per import** at current Sonnet 4.5 pricing for a
~5 MB menu. One-time per restaurant signup. Not a meaningful line item.

## Don't ship to users

Never reference "AI", "Claude", "GPT", or "LLM" in user-facing copy. The
internal architecture is ours — users see "we read your PDF automatically"
and that's it. This is a product decision (keeps us free to swap providers
or run a local model later).
