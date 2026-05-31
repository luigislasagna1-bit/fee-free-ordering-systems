# Kitchen alert sounds

Drop sample audio files in this folder. The Kitchen Display
(`src/app/kitchen/KitchenDisplay.tsx`) loads them at runtime and prefers
them over the built-in synthesized bell.

## Files in this folder

| Filename | When it plays | Source |
|---|---|---|
| `gloriafood-new-order.mp3` ✅ present | Default new-order alarm (loops every 1.5s until the order is clicked) | Extracted from Luigi's reference recording `IMG_6508.mp3` at **0:11–0:15** (2026-05-31 swap — the previous YouTube extract was replaced after Luigi requested a cleaner clip). 4.0s, mono, 128 kbps, mild +1.5x gain. |

## How to re-extract or replace

If you ever need to swap the bundled default (different sound, cleaner cut, etc.):

**Option A — online tool (no install):**
1. Open https://mp3cut.net
2. Upload source file
3. Set start / end times, download, rename to `gloriafood-new-order.mp3`
4. Drop in this folder, commit, deploy

**Option B — local ffmpeg (faster, scriptable):**
```bash
ffmpeg -y -ss 11 -to 15 -i "<source.mp3>" \
  -c:a libmp3lame -b:a 128k -ac 1 -ar 44100 \
  -af "afade=t=in:st=0:d=0.05,afade=t=out:st=3.9:d=0.1,volume=1.5" \
  public/sounds/gloriafood-new-order.mp3
```

## Custom per-restaurant sounds (no file drop needed)

Restaurant owners can upload their OWN ring sound from `/admin/profile`
without anyone touching this folder. The file lands in Vercel Blob
storage and the URL is saved on `Restaurant.kitchenAlertSoundUrl`.
The Kitchen Display picker then surfaces "Custom Sound" as a third
option alongside the two built-ins. See:

- `src/app/api/restaurants/kitchen-sound/route.ts` (upload + delete)
- `src/app/admin/profile/ProfileClient.tsx` → `KitchenSoundSection`
- `src/app/kitchen/KitchenDisplay.tsx` → `customSampleBufferRef`

## Fallback behaviour

If `gloriafood-new-order.mp3` is missing or fails to load, the Kitchen
Display falls back to the synthesized 4-partial bell at 880 Hz (the
original implementation). A `console.warn` is logged so it's obvious
in dev tools.
