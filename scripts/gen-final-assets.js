// FINAL brand assets from the approved bell+FF mark:
//   • store-assets/app-icon-512.png       — full-bleed 512 Play Store icon
//   • store-assets/feature-1024x500.png    — Play feature graphic
//   • android .../mipmap-*/ic_launcher.png + ic_launcher_round.png  (legacy)
//   • android .../mipmap-*/ic_launcher_foreground.png              (adaptive fg)
// The adaptive BACKGROUND is the @color/ic_launcher_background green (set in the
// values xml). Run: node scripts/gen-final-assets.js
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const outDir = path.join(ROOT, "store-assets");
const resDir = path.join(ROOT, "android", "app", "src", "main", "res");
fs.mkdirSync(outDir, { recursive: true });

const GREEN = "#57B935", GREEN_A = "#63C141", GREEN_B = "#49A329", NAVY = "#16243F", WHITE = "#ffffff";

// Bell + two-tone FF, centered in a 0..512 space, at the given scale.
function bellMark(scale) {
  const cx = 256, cy = 258;
  return `<g transform="translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})">
    <circle cx="256" cy="126" r="19" fill="${WHITE}"/>
    <path d="M256 138 C 194 138 174 196 174 262 C 174 314 162 338 148 354 L 364 354
             C 350 338 338 314 338 262 C 338 196 318 138 256 138 Z" fill="${WHITE}"/>
    <path d="M228 356 a28 24 0 0 0 56 0 Z" fill="${WHITE}"/>
    <text x="256" y="300" font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="900" text-anchor="middle" letter-spacing="-5"><tspan fill="${NAVY}">F</tspan><tspan fill="${GREEN}">F</tspan></text>
  </g>`;
}

const grad = `<linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${GREEN_A}"/><stop offset="1" stop-color="${GREEN_B}"/></linearGradient>`;

// full-bleed square (Play store icon): green fills the whole square, no rounding
function fullBleedSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${grad}</defs><rect width="512" height="512" fill="url(#g)"/>${bellMark(1.36)}</svg>`;
}
// rounded-square legacy launcher icon
function roundedSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${grad}<clipPath id="c"><rect width="512" height="512" rx="112"/></clipPath></defs><g clip-path="url(#c)"><rect width="512" height="512" fill="url(#g)"/>${bellMark(1.36)}</g></svg>`;
}
// circular legacy launcher icon
function circleSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${grad}<clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath></defs><g clip-path="url(#c)"><rect width="512" height="512" fill="url(#g)"/>${bellMark(1.36)}</g></svg>`;
}
// adaptive foreground: bell+FF on transparent, scaled to sit in the safe zone
function foregroundSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${bellMark(1.12)}</svg>`;
}

const launcher = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

(async () => {
  // Store icon (full bleed) + a feature graphic
  await sharp(Buffer.from(fullBleedSvg(512))).png().toFile(path.join(outDir, "app-icon-512.png"));

  // Feature graphic: rounded icon tile on the left + wordmark on the right
  const iconTile = await sharp(Buffer.from(roundedSvg(340))).png().toBuffer();
  const featBg = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="500" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2f7"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#bg)"/>
    <rect x="0" y="452" width="1024" height="48" fill="${NAVY}"/>
    <text x="512" y="483" font-family="Arial" font-size="20" font-weight="600" fill="#bfe6ad" text-anchor="middle">www.feefreeordering.com</text>
    <text x="470" y="228" font-family="Arial" font-style="italic" font-size="104" font-weight="800" fill="${NAVY}">Fee <tspan fill="${GREEN}">Free</tspan></text>
    <text x="474" y="292" font-family="Arial" font-size="40" font-weight="700" letter-spacing="10" fill="${NAVY}">ORDER APP</text>
    <text x="476" y="352" font-family="Arial" font-size="28" font-weight="500" fill="#42526b">Never miss an online order or table booking.</text>
  </svg>`;
  await sharp(Buffer.from(featBg)).composite([{ input: iconTile, left: 78, top: 80 }]).png().toFile(path.join(outDir, "feature-1024x500.png"));

  // Android launcher assets
  for (const [d, size] of Object.entries(launcher)) {
    const dir = path.join(resDir, `mipmap-${d}`);
    await sharp(Buffer.from(roundedSvg(size))).png().toFile(path.join(dir, "ic_launcher.png"));
    await sharp(Buffer.from(circleSvg(size))).png().toFile(path.join(dir, "ic_launcher_round.png"));
  }
  for (const [d, size] of Object.entries(fg)) {
    const dir = path.join(resDir, `mipmap-${d}`);
    await sharp(Buffer.from(foregroundSvg(size))).png().toFile(path.join(dir, "ic_launcher_foreground.png"));
  }

  console.log("wrote store icon, feature graphic, and all android launcher PNGs");
})().catch((e) => { console.error(e); process.exit(1); });
