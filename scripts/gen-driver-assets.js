// FINAL brand assets for the FEE FREE DELIVERY (driver) app — same family as the
// kitchen bell+FF mark (scripts/gen-final-assets.js), but the glyph is a delivery
// mark instead of the bell. Writes:
//   • store-assets/driver-app-icon-512.png       — full-bleed 512 Play Store icon
//   • store-assets/driver-feature-1024x500.png    — Play feature graphic
//   • android-driver .../mipmap-*/ic_launcher.png + ic_launcher_round.png (legacy)
//   • android-driver .../mipmap-*/ic_launcher_foreground.png             (adaptive fg)
//   • ios-driver .../AppIcon.appiconset/AppIcon-512@2x.png                (1024, opaque)
//   • public/icons/driver-icon.svg                                        (PWA manifest)
// The adaptive BACKGROUND color lives in android-driver/.../values/ic_launcher_background.xml
// (must be the brand green #54B135, same as the kitchen app). Run: node scripts/gen-driver-assets.js
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const outDir = path.join(ROOT, "store-assets");
const resDir = path.join(ROOT, "android-driver", "app", "src", "main", "res");
const iosIcon = path.join(ROOT, "ios-driver", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png");
const webIcon = path.join(ROOT, "public", "icons", "driver-icon.svg");
fs.mkdirSync(outDir, { recursive: true });

const GREEN = "#57B935", GREEN_A = "#63C141", GREEN_B = "#49A329", NAVY = "#16243F", WHITE = "#ffffff";

// Delivery mark + two-tone FF, centered in a 0..512 space, at the given scale.
// Mark = the judged winner of the 2026-07-16 design round ("box-pin": location pin
// over a takeout box with motion dashes), refined per the judge panel's fixes.
function deliveryMark(scale) {
  const cx = 256, cy = 258;
  return `<g transform="translate(${cx},${cy}) scale(${scale}) translate(${-cx},${-cy})">
    <path fill="${WHITE}" fill-rule="evenodd" d="M264,190 C 247,164 222,154 222,128 A42,42 0 1 1 306,128 C 306,154 281,164 264,190 Z M245,128 a19,19 0 1 0 38,0 a19,19 0 1 0 -38,0 Z"/>
    <rect x="166" y="198" width="196" height="28" rx="10" fill="${WHITE}"/>
    <rect x="174" y="238" width="180" height="152" rx="14" fill="${WHITE}"/>
    <rect x="112" y="272" width="48" height="20" rx="10" fill="${WHITE}"/>
    <rect x="112" y="306" width="36" height="20" rx="10" fill="${WHITE}"/>
    <rect x="112" y="340" width="24" height="20" rx="10" fill="${WHITE}"/>
    <text x="264" y="356" font-family="Arial, Helvetica, sans-serif" font-size="118" font-weight="900" text-anchor="middle" letter-spacing="-5"><tspan fill="${NAVY}">F</tspan><tspan fill="${GREEN}">F</tspan></text>
  </g>`;
}

const grad = `<linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${GREEN_A}"/><stop offset="1" stop-color="${GREEN_B}"/></linearGradient>`;

// full-bleed square (Play store icon)
function fullBleedSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${grad}</defs><rect width="512" height="512" fill="url(#g)"/>${deliveryMark(1.18)}</svg>`;
}
// rounded-square legacy launcher icon
function roundedSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${grad}<clipPath id="c"><rect width="512" height="512" rx="112"/></clipPath></defs><g clip-path="url(#c)"><rect width="512" height="512" fill="url(#g)"/>${deliveryMark(1.18)}</g></svg>`;
}
// circular legacy launcher icon
function circleSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><defs>${grad}<clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath></defs><g clip-path="url(#c)"><rect width="512" height="512" fill="url(#g)"/>${deliveryMark(1.05)}</g></svg>`;
}
// adaptive foreground: mark on transparent, scaled into the safe zone
function foregroundSvg(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${deliveryMark(0.98)}</svg>`;
}
// PWA icon: full-bleed gradient + safe-zone mark (single file serves any+maskable)
function webSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${grad}</defs><rect width="512" height="512" fill="url(#g)"/>${deliveryMark(1.0)}</svg>`;
}

const launcher = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

(async () => {
  // Play store icon (full bleed) + feature graphic
  await sharp(Buffer.from(fullBleedSvg(512))).png().toFile(path.join(outDir, "driver-app-icon-512.png"));

  const iconTile = await sharp(Buffer.from(roundedSvg(340))).png().toBuffer();
  const featBg = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="500" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2f7"/></linearGradient></defs>
    <rect width="1024" height="500" fill="url(#bg)"/>
    <rect x="0" y="452" width="1024" height="48" fill="${NAVY}"/>
    <text x="512" y="483" font-family="Arial" font-size="20" font-weight="600" fill="#bfe6ad" text-anchor="middle">www.feefreeordering.com</text>
    <text x="470" y="228" font-family="Arial" font-style="italic" font-size="104" font-weight="800" fill="${NAVY}">Fee <tspan fill="${GREEN}">Free</tspan></text>
    <text x="474" y="292" font-family="Arial" font-size="40" font-weight="700" letter-spacing="10" fill="${NAVY}">DELIVERY</text>
    <text x="476" y="352" font-family="Arial" font-size="26" font-weight="500" fill="#42526b">Accept jobs, navigate, share live GPS.</text>
  </svg>`;
  await sharp(Buffer.from(featBg)).composite([{ input: iconTile, left: 78, top: 80 }]).png().toFile(path.join(outDir, "driver-feature-1024x500.png"));

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

  // iOS app icon — 1024, opaque (Apple rejects alpha in the marketing icon)
  await sharp(Buffer.from(fullBleedSvg(1024))).flatten({ background: GREEN_B }).png().toFile(iosIcon);

  // PWA manifest icon
  fs.writeFileSync(webIcon, webSvg());

  console.log("wrote driver store icon, feature graphic, android launchers, iOS 1024, web svg");
})().catch((e) => { console.error(e); process.exit(1); });
