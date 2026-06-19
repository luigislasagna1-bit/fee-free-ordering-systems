// Generate the iOS app icon (1024x1024, opaque — no alpha, as Apple requires)
// from the brand bell+FF mark, matching the Android launcher + Play store icon.
// Writes ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
const sharp = require("sharp");
const path = require("path");

const GREEN = "#57B935", GREEN_A = "#63C141", GREEN_B = "#49A329", NAVY = "#16243F", WHITE = "#ffffff";

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

const svg = `<svg width="1024" height="1024" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${GREEN_A}"/><stop offset="1" stop-color="${GREEN_B}"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>${bellMark(1.36)}</svg>`;

const out = path.join(__dirname, "..", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png");

sharp(Buffer.from(svg))
  .flatten({ background: GREEN }) // strip alpha — iOS icons must be fully opaque
  .png()
  .toFile(out)
  .then((i) => console.log("wrote iOS icon", i.width + "x" + i.height, "channels:", i.channels))
  .catch((e) => { console.error(e); process.exit(1); });
