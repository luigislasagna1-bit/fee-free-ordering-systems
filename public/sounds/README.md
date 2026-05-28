# Kitchen alert sounds

Drop sample audio files in this folder. The Kitchen Display
(`src/app/kitchen/KitchenDisplay.tsx`) will load them at runtime and prefer
them over the built-in synthesized bell.

## Files in this folder

| Filename | When it plays | Source |
|---|---|---|
| `gloriafood-new-order.mp3` ✅ present | New-order alarm (loops every 1.5s until the order is clicked) | Extracted from https://www.youtube.com/watch?v=EJoBrAFjsa8 at **0:37–0:39** — the GloriaFood "new order" ding Luigi wants to match exactly. 2.04s, mono, 128 kbps. |

## How to re-extract or replace

If you ever need to swap the file (different sound, cleaner cut, etc.):

**Option A — online tool (no install):**
1. Open https://mp3cut.net/youtube-to-mp3-converter
2. Paste the YouTube URL
3. Set start / end times, download, rename to `gloriafood-new-order.mp3`
4. Drop in this folder, commit, deploy

**Option B — local ffmpeg (faster, scriptable):**
```bash
ffmpeg -y -ss 37 -to 39 -i "<source.mp4>" -vn -ac 1 -ar 44100 -b:a 128k \
  public/sounds/gloriafood-new-order.mp3
```

## Fallback behaviour

If `gloriafood-new-order.mp3` is missing or fails to load, the Kitchen Display
falls back to the synthesized 4-partial bell at 880 Hz (the original
implementation). A `console.warn` is logged so it's obvious in dev tools.
