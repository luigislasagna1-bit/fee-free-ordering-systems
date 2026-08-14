/**
 * Shared satori-safe building blocks for Marketing Kit templates (Luigi 2026-08-14).
 *
 * Every box goes through <Box>, which pins the two satori defaults that differ from the
 * browser — `display: flex` and `boxSizing: border-box` — explicitly. Templates therefore
 * read the same way whether you are picturing them in a browser or in satori, and nobody has
 * to remember the difference.
 *
 * Styles are typed `SatoriStyle`, an allow-list of what satori actually implements, so
 * `display: grid`, `containerType`, `zIndex` and friends are compile errors here rather than
 * silently-wrong pixels on a printed page.
 */
import type { CSSProperties, ReactNode } from "react";
import type { Geom, SatoriStyle } from "./types";

export function Box({
  style,
  children,
}: {
  style?: SatoriStyle;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", boxSizing: "border-box", ...(style as CSSProperties) }}>
      {children}
    </div>
  );
}

/** Vertical stack. */
export function Col({ style, children }: { style?: SatoriStyle; children?: ReactNode }) {
  return <Box style={{ flexDirection: "column", ...style }}>{children}</Box>;
}

/** Horizontal row. */
export function Row({ style, children }: { style?: SatoriStyle; children?: ReactNode }) {
  return <Box style={{ flexDirection: "row", alignItems: "center", ...style }}>{children}</Box>;
}

/**
 * A run of text. Satori requires a single text child per element for reliable wrapping, so
 * this deliberately takes a string rather than arbitrary children.
 */
export function Text({ style, children }: { style?: SatoriStyle; children: string }) {
  return (
    <Box
      style={{
        fontFamily: "KitSans",
        // flexShrink: 0 is NOT cosmetic. A page has a fixed height, and flexbox's default
        // `flex-shrink: 1` means that as soon as the content is even slightly too tall, every
        // text box shrinks BELOW its measured height and the text spills out of its own box —
        // which on a flyer looks like paragraphs printed on top of each other, not like an
        // overflow. Pinning it makes over-long content run off the bottom instead, which is
        // obvious in the preview and therefore fixable. Luigi 2026-08-14.
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </Box>
  );
}

/** Fills remaining space in a flex parent — the satori-safe equivalent of margin:auto. */
export function Spacer() {
  return <Box style={{ flexGrow: 1 }} />;
}

/**
 * The outer canvas. Owns the bleed box, the paper colour and text direction.
 *
 * `direction: "rtl"` is what makes Hebrew and Arabic lay out correctly — verified on
 * 2026-08-14: with it, `שמור על 30% מהרווח` renders in proper RTL word order AND keeps the
 * `30%` left-to-right inside the line. Without it the same string comes out backwards, which
 * is where the "satori can't do Hebrew" folklore comes from.
 */
export function Canvas({
  geom,
  paper,
  ink,
  rtl,
  children,
}: {
  geom: Geom;
  paper: string;
  ink: string;
  rtl: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      style={{
        width: geom.w,
        height: geom.h,
        flexDirection: "column",
        backgroundColor: paper,
        color: ink,
        fontFamily: "KitSans",
        direction: rtl ? "rtl" : "ltr",
        // ⚠️ NO `overflow: "hidden"` HERE, and no `position: absolute` inner box either.
        //
        // Both were in the first version and both are pathologically slow on a full-page
        // canvas. Measured 2026-08-14 on this exact flyer at 1702x2387 (4.06 MP):
        //
        //     plain wrapper ................  296 ms
        //     + overflow: hidden ........... 4168 ms   <-- 14x
        //     + direction / fontFamily / padding ~300 ms each (free)
        //
        // Neither penalty appears on trivial content, so it stays invisible until a real
        // design goes in — and then it looks like "satori is just slow", which it is not.
        // Nothing needs clipping anyway: the safe area below is sized to the trim box and
        // every child is laid out inside it. If a future template genuinely needs to clip,
        // clip THAT element, never the page root.
        //
        // Safe area via PADDING rather than an absolutely-positioned child, same reasoning.
        paddingTop: geom.bleed,
        paddingRight: geom.bleed,
        paddingBottom: geom.bleed,
        paddingLeft: geom.bleed,
      }}
    >
      <Box
        style={{
          width: geom.trimW,
          height: geom.trimH,
          flexDirection: "column",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

/**
 * The partner's logo, or a monogram tile when there isn't a usable one.
 *
 * The monogram matters: a logo that 404s, hangs, is WebP, or is an SVG without a viewBox all
 * resolve to null upstream (see images.ts), and a flyer with a clean brand-coloured initial
 * is still a flyer a partner can hand out. Failing the whole render over a bad image would
 * not be.
 */
export function BrandMark({
  logoDataUri,
  brandName,
  size,
  primary,
  onPrimary,
}: {
  logoDataUri: string | null;
  brandName: string;
  size: number;
  primary: string;
  onPrimary: string;
}) {
  if (logoDataUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoDataUri}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  const initial = (brandName.trim()[0] ?? "•").toUpperCase();
  return (
    <Box
      style={{
        width: size,
        height: size,
        backgroundColor: primary,
        color: onPrimary,
        borderRadius: Math.round(size * 0.22),
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.55),
        fontWeight: 800,
      }}
    >
      {initial}
    </Box>
  );
}

/** QR code in a white card with its printable URL underneath. */
export function QrBlock({
  geom,
  qrDataUri,
  caption,
  label,
  size,
  ink,
  muted,
}: {
  geom: Geom;
  qrDataUri: string;
  caption: string;
  label: string;
  size: number;
  ink: string;
  muted: string;
}) {
  return (
    <Col
      style={{
        backgroundColor: "#ffffff",
        borderRadius: geom.u(16),
        padding: geom.u(18),
        alignItems: "center",
        border: `${Math.max(1, geom.u(3))}px solid #e2e8f0`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrDataUri} alt="" width={size} height={size} style={{ width: size, height: size }} />
      <Text style={{ marginTop: geom.u(10), fontSize: geom.u(20), fontWeight: 700, color: ink }}>
        {label}
      </Text>
      <Text style={{ marginTop: geom.u(4), fontSize: geom.u(16), color: muted }}>{caption}</Text>
    </Col>
  );
}

/**
 * Icons are drawn as inline SVG data URIs, never as font glyphs.
 *
 * ✓ ★ ☰ and friends are absent from Noto Sans, so satori falls through to its dynamic font
 * loader, which asks Google for a subset containing them, gets a 400, and logs a failure for
 * EVERY string that contains one. Inlining the shape removes the network entirely.
 */
function svgUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** White tick inside a filled circle. */
export function CheckIcon({ size, color = "#16a34a" }: { size: number; color?: string }) {
  const uri = svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<circle cx="12" cy="12" r="12" fill="${color}"/>` +
      `<path d="M6.5 12.4l3.6 3.6 7.4-8" fill="none" stroke="#fff" stroke-width="2.6" ` +
      `stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={uri} alt="" width={size} height={size} style={{ width: size, height: size, flexShrink: 0 }} />;
}

/** Solid five-point star. */
export function StarIcon({ size, color = "#F5C542" }: { size: number; color?: string }) {
  const uri = svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
      `<path d="M12 2l3 6.5 7 .9-5.1 4.8 1.3 7L12 17.9 5.8 21.2l1.3-7L2 9.4l7-.9z" fill="${color}"/></svg>`,
  );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={uri} alt="" width={size} height={size} style={{ width: size, height: size, flexShrink: 0 }} />;
}

/** Three stacked bars (a menu glyph), drawn rather than typed. */
export function MenuIcon({ size, color = "#ffffff" }: { size: number; color?: string }) {
  const bar = { width: size, height: Math.max(1, Math.round(size * 0.13)), backgroundColor: color, borderRadius: 999 };
  return (
    <Col style={{ gap: Math.max(1, Math.round(size * 0.13)), flexShrink: 0 }}>
      <Box style={bar} />
      <Box style={bar} />
      <Box style={bar} />
    </Col>
  );
}

/** A small pill — used for feature chips and stat callouts. */
export function Chip({
  geom,
  text,
  bg,
  fg,
}: {
  geom: Geom;
  text: string;
  bg: string;
  fg: string;
}) {
  return (
    <Box
      style={{
        backgroundColor: bg,
        color: fg,
        borderRadius: geom.u(22),
        paddingTop: geom.u(6),
        paddingBottom: geom.u(6),
        paddingLeft: geom.u(16),
        paddingRight: geom.u(16),
        fontSize: geom.u(18),
        fontWeight: 700,
      }}
    >
      {text}
    </Box>
  );
}
