// Redact PII from the kitchen screenshots and produce Play Store sets for all
// three form factors. Output (under store-assets/screenshots/):
//   redacted/   — blurred full-res (768x1024) for verification
//   phone/      — 1080x1920 (9:16) framed, branded  ← Phone slot
//   tablet-7/   — 1200x1600 (3:4) full-bleed         ← 7-inch tablet slot
//   tablet-10/  — 1536x2048 (3:4) full-bleed         ← 10-inch tablet slot
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "store-assets", "screenshots");
const NAVY = "#16243F", GREEN = "#57B935";
for (const sub of ["redacted", "phone", "tablet-7", "tablet-10"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });

// name blur box centered on a list-row name (768-wide layout)
const nameBox = (cy) => ({ left: 52, top: cy - 16, width: 206, height: 32 });

const FILES = [
  { src: "Screenshot_20260618-015256.jpg", out: "1-orders",       caption: "Every order, the moment it lands",
    regions: [212, 532, 612, 692, 772, 852, 932].map(nameBox) },
  { src: "Screenshot_20260618-015449.jpg", out: "2-order-detail", caption: "Full ticket for every order",
    regions: [
      { left: 94,  top: 115, width: 122, height: 30 }, // customer name
      { left: 40,  top: 145, width: 120, height: 28 }, // phone
      { left: 40,  top: 173, width: 188, height: 28 }, // email
    ] },
  { src: "Screenshot_20260618-015420.jpg", out: "3-settings",     caption: "Sound, printing & reports - 1 tap",
    regions: [212, 772, 852, 932].map(nameBox) },
];

async function redact(srcPath, regions) {
  const comps = [];
  for (const r of regions) {
    const buf = await sharp(srcPath).extract(r).blur(20).toBuffer();
    comps.push({ input: buf, left: r.left, top: r.top });
  }
  return sharp(srcPath).composite(comps).png().toBuffer();
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function phoneFrame(redactedBuf, caption, outPath) {
  const W = 1080, H = 1920, shotW = 980;
  const shotH = Math.round((shotW * 1024) / 768); // 1307
  const shot = await sharp(redactedBuf).resize(shotW, shotH).toBuffer();
  const mask = Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="30" ry="30"/></svg>`);
  const rounded = await sharp(shot).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const left = Math.round((W - shotW) / 2);
  const top = 410;
  const shadowSvg = Buffer.from(`<svg width="${W}" height="${H}"><rect x="${left}" y="${top}" width="${shotW}" height="${shotH}" rx="30" fill="#0b1f3a" opacity="0.22"/></svg>`);
  const shadow = await sharp(shadowSvg).blur(26).png().toBuffer();
  const bg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8eef5"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="${W / 2}" y="210" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="${NAVY}" text-anchor="middle">${esc(caption)}</text>
    <rect x="${W / 2 - 64}" y="246" width="128" height="9" rx="4" fill="${GREEN}"/>
  </svg>`;
  await sharp(Buffer.from(bg)).composite([{ input: shadow, left: 0, top: 0 }, { input: rounded, left, top }]).png().toFile(outPath);
}

(async () => {
  for (const f of FILES) {
    const srcPath = path.join(dir, f.src);
    const redacted = await redact(srcPath, f.regions);
    await sharp(redacted).png().toFile(path.join(dir, "redacted", `${f.out}.png`));
    await phoneFrame(redacted, f.caption, path.join(dir, "phone", `${f.out}.png`));
    await sharp(redacted).resize(1200, 1600).png().toFile(path.join(dir, "tablet-7", `${f.out}.png`));
    await sharp(redacted).resize(1536, 2048).png().toFile(path.join(dir, "tablet-10", `${f.out}.png`));
    console.log(`✓ ${f.out}`);
  }
  console.log("done — phone/ tablet-7/ tablet-10/ ready");
})().catch((e) => { console.error(e); process.exit(1); });
