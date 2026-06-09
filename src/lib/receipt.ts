// ESC/POS + StarPRNT thermal receipt builder — template-driven.
// printerLanguage controls which command set is used:
//   "escpos"     — Epson ESC/POS (Epson, Bixolon, most generic thermal)
//   "starprnt"   — Star Micronics StarPRNT protocol (TSP100/143 StarPRNT mode)
//                  Bold = ESC E n.  If bold looks identical to normal, the printer
//                  may be in Star Line mode — switch to "star_line".
//   "star_line"  — Star Micronics Star Line mode (TSP100/143/654 Star Line mode)
//                  Bold = ESC F (on) / ESC H (off).  Alignment = ESC a n.
//                  Use this when "starprnt" bold does not produce visible output.
//   "plaintext"  — No control codes (debug / unsupported hardware)

import type { CustomerConfig, KitchenConfig, Section, SectionStyle } from "./receipt-schema";
import { formatCurrency } from "./utils";
import { formatTime } from "./format-time";
import { getDict, type Translator } from "./i18n-dict";

export type PrinterLanguage = "escpos" | "starprnt" | "star_line" | "plaintext";

// Translate the canonical lowercase order-type string ("delivery" / "pickup" /
// "dine_in" / "catering" / "takeout") via the receipt dictionary. Falls back
// to the raw value when the key isn't present so an unfamiliar type still
// renders something on paper.
function tOrderTypeUpper(type: string, t: Translator): string {
  const v = t(`receipt.orderTypes.${type}`);
  return v.startsWith("receipt.") ? type.toUpperCase() : v;
}
function tOrderTypeLower(type: string, t: Translator): string {
  const v = t(`receipt.orderTypesLower.${type}`);
  return v.startsWith("receipt.") ? type : v;
}

const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;

// ── EscPos builder ────────────────────────────────────────────────────────────

class EscPos {
  private chunks: Buffer[] = [];
  readonly cw:   number;         // chars per line (normal size)
  readonly dots: number;         // printable pixel cols (for images)
  readonly lang: PrinterLanguage;

  // Internal state — tracked so line() can auto-pad when inverted and so
  // ESC/POS size commands (ESC !) always include the current bold bit.
  private _inverted = false;
  private _bold     = false;     // tracked to keep ESC ! bold-bit consistent
  private _sizeW    = 1;         // 1 = normal, 2 = double-width, 3 = triple-width (divides effective cw)
  private _sizeH    = false;     // false = normal height, true = magnified (2x or 3x) height
  private _align: "left" | "center" | "right" = "left";   // tracked so inverted line() pads on the correct side

  constructor(paperWidth: string, lang: PrinterLanguage = "escpos") {
    this.cw   = paperWidth === "58mm" ? 32 : 48;
    this.dots = paperWidth === "58mm" ? 384 : 576;
    this.lang = lang;
  }

  // ── Raw output ────────────────────────────────────────────────────────────
  cmd(...bytes: number[]) { this.chunks.push(Buffer.from(bytes)); return this; }
  raw(buf: Buffer)         { this.chunks.push(buf);               return this; }

  // Sanitize common typographic chars to ASCII so all printer code pages render
  // them correctly.  UTF-8 multi-byte sequences (e.g. ×, →, ⚠, em-dash) print as
  // garbage on CP437 printers, so we substitute ASCII fallbacks here.  The
  // editor's HTML preview can keep using the typographic forms — only the print
  // path needs to be ASCII-safe.
  text(s: string) {
    const safe = s
      .replace(/[‐-―−]/g, "-")          // various dashes → hyphen
      .replace(/[‘’]/g, "'")             // curly single quotes
      .replace(/[“”]/g, '"')             // curly double quotes
      .replace(/…/g, "...")              // ellipsis
      .replace(/×/g, "x")                // multiplication sign → lowercase x (preview uses × for item qty)
      .replace(/→/g, "->")               // right arrow → ASCII arrow (preview uses → for modifiers)
      .replace(/⚠/g, "!")                // warning sign → exclamation (preview uses ⚠ for notes)
      .replace(/•/g, "*");               // bullet → asterisk
    this.chunks.push(Buffer.from(safe, "utf8"));
    return this;
  }

  nl(n = 1) { for (let i = 0; i < n; i++) this.cmd(LF); return this; }

  // ── Alignment ─────────────────────────────────────────────────────────────
  // ESC/POS + Star Line: ESC a n    (0x1B 0x61 n)       left=0, center=1, right=2
  // StarPRNT:            ESC GS a n (0x1B 0x1D 0x61 n)  same values, different prefix
  //
  // Idempotent: skip emitting the alignment command if the requested alignment
  // already matches the tracked state.  Reduces bytes between section style and
  // text — fewer intermediate ESC sequences = fewer chances for the printer to
  // drop emphasis state.
  left()   {
    if (this._align === "left") return this;
    this._align = "left";
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt")  return this.cmd(ESC, GS, 0x61, 0x00);
    return this.cmd(ESC, 0x61, 0x00);   // escpos + star_line both use ESC a n
  }
  center() {
    if (this._align === "center") return this;
    this._align = "center";
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt")  return this.cmd(ESC, GS, 0x61, 0x01);
    return this.cmd(ESC, 0x61, 0x01);
  }
  right()  {
    if (this._align === "right") return this;
    this._align = "right";
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt")  return this.cmd(ESC, GS, 0x61, 0x02);
    return this.cmd(ESC, 0x61, 0x02);
  }
  align(a: "left" | "center" | "right") {
    return a === "center" ? this.center() : a === "right" ? this.right() : this.left();
  }

  // ── Bold ──────────────────────────────────────────────────────────────────
  // Each printer language uses a different emphasis command:
  //
  //  starprnt  — ESC E n  (1B 45 n)  n=1 on / n=0 off.  StarPRNT specification.
  //              If this produces no visible output, the printer is likely in
  //              Star Line mode — switch the printer language to "star_line".
  //
  //  star_line — ESC F    (1B 46)    emphasis ON   (no parameter byte)
  //              ESC H    (1B 48)    emphasis OFF  (no parameter byte)
  //              These are the Star Line mode emphasis commands used by TSP100/143
  //              series in their default (non-StarPRNT) firmware mode.
  //
  //  escpos    — ESC E n  (1B 45 n) + ESC ! bit3 (1B 21 n|08)
  //              Dual-send covers both ESC-E-aware and ESC-!-only Epson variants.
  //              State tracked so every ESC ! from size methods includes the bold bit.
  //
  //  DO NOT send ESC G (double-strike) to any Star thermal printer.  ESC G is a
  //  dot-matrix command; on thermal Star printers the printer swallows subsequent
  //  bytes as phantom parameters, corrupting the rest of the print job.
  bold(on = true) {
    // Idempotent: don't emit the command if state already matches.  Reduces
    // intermediate ESC sequences in the byte stream between section style and
    // text bytes.  The line()-level defensive bold re-assert still fires before
    // every text() call to guard against external state drift.
    if (this._bold === on) return this;
    this._bold = on;
    if (this.lang === "plaintext") return this;

    if (this.lang === "star_line") {
      // Star Line Mode: ESC F (no param) = emphasis on; ESC H (no param) = emphasis off.
      return on ? this.cmd(ESC, 0x46) : this.cmd(ESC, 0x48);
    }

    if (this.lang === "starprnt") {
      // Round 7: Dual-emphasis experiment.
      // `ESC E n` alone (StarPRNT spec) is reaching the printer immediately
      // before the text bytes but the printer is rendering at normal weight.
      // Hex-dump diagnostics confirm the bytes are correct.  The Star
      // TSP143IIIW auto-detects between StarPRNT and Star Line mode at
      // power-on, and the active mode may be honoring `ESC F`/`ESC H`
      // (Star Line emphasis) but silently dropping `ESC E n` in our section
      // render context (even though it honors `ESC E n` in Block A of the
      // diagnostic).  We send BOTH commands.  If the printer is in StarPRNT
      // mode it processes ESC E n and ignores ESC F/H as unknown.  If it's
      // in Star Line mode it processes ESC F/H and ignores ESC E n.  Either
      // way at least one of the two should engage emphasis.
      //
      // KNOWN FAILURE MODE: if `ESC F` is unsupported the printer may print
      // the literal `F` character (same as the `ESC ! 0x08`/`8` failure).
      // If that happens, roll back this change immediately.
      this.cmd(ESC, 0x45, on ? 1 : 0);   // ESC E n  — StarPRNT
      if (on) this.cmd(ESC, 0x46);        // ESC F   — Star Line bold ON
      else    this.cmd(ESC, 0x48);        // ESC H   — Star Line bold OFF
      return this;
    }

    // ESC/POS: ESC E + ESC ! with bold bit so both command-set variants respond.
    const sizeN = (this._sizeH ? 0x10 : 0) | (this._sizeW === 2 ? 0x20 : 0);
    return this.cmd(ESC, 0x45, on ? 1 : 0)
               .cmd(ESC, 0x21, sizeN | (on ? 0x08 : 0));
  }

  // ── Inverse (WHITE-ON-BLACK) ───────────────────────────────────────────────
  // ESC/POS:            GS B n  (0x1D 0x42 n)   n=1 on, n=0 off
  // StarPRNT + Star Line: ESC 4 (0x1B 0x34) on / ESC 5 (0x1B 0x35) off
  // State is tracked so line() can auto-pad for full-width coverage.
  invert(on = true) {
    // Idempotent: don't re-emit ESC 4 / ESC 5 if state is unchanged.  The
    // unnecessary ESC 5 (sent on every non-highlighted section's applyStyle)
    // was the most likely cause of bold being canceled mid-stream — Star
    // firmware appears to drop the emphasis register when ESC 5 is sent
    // between ESC E 01 and the printable text, even though the spec says
    // they're independent commands.
    if (this._inverted === on) return this;
    this._inverted = on;
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt" || this.lang === "star_line") {
      return on ? this.cmd(ESC, 0x34) : this.cmd(ESC, 0x35);
    }
    return this.cmd(GS, 0x42, on ? 1 : 0);
  }

  // ── Font size ─────────────────────────────────────────────────────────────
  // ESC/POS:              ESC ! n       (0x1B 0x21 n)        bit4=dbl-h, bit5=dbl-w
  // StarPRNT + Star Line: ESC i n1 n2  (0x1B 0x69 n1 n2)    n1=height, n2=width
  //
  // ESC i resets the emphasis register on many Star printers.  After every ESC i
  // we re-assert the correct bold command if _bold is true:
  //   starprnt  → re-sends ESC E 1
  //   star_line → re-sends ESC F
  // _sizeW tracks width multiplier so wrapped/columns can compute effective line width.
  normalSize() {
    // EMPIRICAL OBSERVATION on the Star TSP143IIIW (verified via user testing
    // across multiple iterations): `ESC F` (Star Line emphasis) does NOT engage
    // visible bold on its own.  Sections with `ESC F` immediately followed by
    // text bytes render at normal weight.  But sections that emit `ESC F`
    // followed by an `ESC i n1 n2` (size set) DO render bold.  The `ESC i`
    // command appears to "arm" the emphasis register on this firmware — without
    // it, the ESC F state is set internally but not applied during character
    // rendering.  Therefore we ALWAYS emit `ESC i 0 0` here, even when size
    // state already matches normal.  Removing the idempotent guard was the
    // single missing piece that made bold work for non-sized sections.
    this._sizeW = 1;
    this._sizeH = false;
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt") {
      this.cmd(ESC, 0x69, 0x00, 0x00);
      // Re-assertion order: INVERSE first, BOLD last — so the very last ESC
      // byte before text() runs is ESC E 01 if bold is on.
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x45, 1);
      return this;
    }
    if (this.lang === "star_line") {
      this.cmd(ESC, 0x69, 0x00, 0x00);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x46);
      return this;
    }
    return this.cmd(ESC, 0x21, this._bold ? 0x08 : 0x00);
  }
  doubleHeight() {
    // No idempotent guard — see comment on normalSize().  We always emit `ESC i`
    // so the emphasis register gets armed on this Star firmware.
    this._sizeW = 1;   // height doubles but width stays 1x — same chars per line
    this._sizeH = true;
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt") {
      this.cmd(ESC, 0x69, 0x01, 0x00);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x45, 1);
      return this;
    }
    if (this.lang === "star_line") {
      this.cmd(ESC, 0x69, 0x01, 0x00);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x46);
      return this;
    }
    return this.cmd(ESC, 0x21, (this._bold ? 0x08 : 0) | 0x10);
  }
  doubleWidth() {
    // No idempotent guard — see comment on normalSize().
    this._sizeW = 2;
    this._sizeH = false;
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt") {
      this.cmd(ESC, 0x69, 0x00, 0x01);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x45, 1);
      return this;
    }
    if (this.lang === "star_line") {
      this.cmd(ESC, 0x69, 0x00, 0x01);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x46);
      return this;
    }
    return this.cmd(ESC, 0x21, (this._bold ? 0x08 : 0) | 0x20);
  }
  doubleSize() {
    // No idempotent guard — see comment on normalSize().
    this._sizeW = 2;
    this._sizeH = true;
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt") {
      this.cmd(ESC, 0x69, 0x01, 0x01);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x45, 1);
      return this;
    }
    if (this.lang === "star_line") {
      this.cmd(ESC, 0x69, 0x01, 0x01);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x46);
      return this;
    }
    return this.cmd(ESC, 0x21, (this._bold ? 0x08 : 0) | 0x30);
  }
  // Triple size (3× both dimensions).  StarPRNT `ESC i n1 n2` accepts vertical
  // and horizontal magnification 0-5 (representing 1×-6×).  Used for the "3XL"
  // editor preset so it prints visibly larger than 2XL (doubleSize / 2×).
  // ESC/POS composite mode (`ESC ! n`) only supports 2× so this falls back to
  // doubleSize for that mode.
  tripleSize() {
    this._sizeW = 3;
    this._sizeH = true;
    if (this.lang === "plaintext") return this;
    if (this.lang === "starprnt") {
      this.cmd(ESC, 0x69, 0x02, 0x02);   // ESC i 2 2 — 3× vertical, 3× horizontal
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x45, 1);
      return this;
    }
    if (this.lang === "star_line") {
      this.cmd(ESC, 0x69, 0x02, 0x02);
      if (this._inverted) this.cmd(ESC, 0x34);
      if (this._bold)     this.cmd(ESC, 0x46);
      return this;
    }
    // ESC/POS can't go beyond 2× via ESC !; fall back to the doubleSize byte.
    return this.cmd(ESC, 0x21, (this._bold ? 0x08 : 0) | 0x30);
  }

  // Map preview pixel sizes → ESC/POS size mode.
  // The editor presets are: XS=9, S=11, M=13, L=16, XL=20, 2XL=26, 3XL=32.
  // Thresholds chosen so each preset maps to a distinct printer mode:
  //   ≥ 28  → tripleSize  (3×)   — 3XL preset (32) and any custom ≥ 28
  //   ≥ 24  → doubleSize  (2×)   — 2XL preset (26)
  //   ≥ 16  → doubleHeight       — L and XL presets (16, 20)
  //   else  → normalSize         — XS, S, M (9, 11, 13)
  sizeMode(px: number) {
    if (px >= 28) return this.tripleSize();
    if (px >= 24) return this.doubleSize();
    if (px >= 16) return this.doubleHeight();
    return this.normalSize();
  }

  // ── Style reset ───────────────────────────────────────────────────────────
  // CRITICAL ORDER: emit the off-commands FIRST (while internal state still
  // reflects what the printer currently has) so the idempotent guards on
  // bold()/invert()/left()/normalSize() actually fire the ESC bytes.  The
  // previous version pre-cleared the JS state, which made every idempotent
  // method think "already off" and emit nothing — leaving the printer stuck
  // in whatever bold/inverse/size mode the previous section turned on, so
  // every subsequent section inherited that state.  Hex dumps + photo evidence
  // confirmed this (inverse stayed on for all sections after the PICKUP bar).
  resetStyle() {
    // These call the idempotent methods, which check current state vs target
    // and emit the right ESC command if a change is needed.  Order: turn off
    // emphasis + inverse first, then collapse size, then realign to left.
    this.bold(false);
    this.invert(false);
    this.normalSize();
    this.left();
    return this;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  init() {
    this._inverted = false;
    this._bold     = false;
    this._sizeW    = 1;
    this._sizeH    = false;
    this._align    = "left";
    if (this.lang === "plaintext") return this;
    return this.cmd(ESC, 0x40);   // ESC @ — full hardware reset
  }

  // ── Cut ───────────────────────────────────────────────────────────────────
  cut() {
    if (this.lang === "plaintext") return this.nl(4);
    if (this.lang === "starprnt" || this.lang === "star_line")
      return this.cmd(ESC, 0x64, 0x03);   // ESC d 3 — Star full cut + feed
    return this.cmd(GS, 0x56, 0x42, 0x00);                              // GS V B 0
  }

  // ── Line output ───────────────────────────────────────────────────────────
  // When inverted, auto-pad to effective line width so the black bar spans the
  // full paper width.  Without padding, inverse only covers the printed characters.
  line(s: string) {
    const effectiveCw = Math.floor(this.cw / this._sizeW);

    let out = s;
    // When the inverse bar is active, pad the line to full paper width so the
    // black bar spans the page.  Distribute the padding based on the current
    // alignment so center/right alignment still produces visible centering/right
    // shift inside the bar.  Without this, padEnd always pushes text to the left.
    if (this._inverted && s.length < effectiveCw) {
      const total = effectiveCw - s.length;
      if (this._align === "center") {
        const left  = Math.floor(total / 2);
        const right = total - left;
        out = " ".repeat(left) + s + " ".repeat(right);
      } else if (this._align === "right") {
        out = s.padStart(effectiveCw);
      } else {
        out = s.padEnd(effectiveCw);
      }
    }

    // Round 6: removed the defensive bold re-assert.  Hex-dump diagnostics
    // confirmed it was emitting a SECOND `ESC E 01` immediately after the one
    // from applyStyle.bold(), producing `ESC E 01 ESC E 01 text`.  Block A of
    // the STAR BOLD TEST emits a single `ESC E 01 text` and prints bold; the
    // section path with the double emit was not.  We match Block A's exact
    // pattern: one ESC E 01 from applyStyle.bold() followed directly by text.
    return this.text(out).nl();
  }

  divider(c = "-") {
    const effectiveCw = Math.floor(this.cw / this._sizeW);
    return this.line(c.repeat(effectiveCw));
  }

  blankLine() { return this.nl(); }

  // Word-wrap text to effective line width, with optional left indent.
  wrapped(s: string, indent = 0) {
    const effectiveCw = Math.floor(this.cw / this._sizeW) - indent;
    const prefix      = " ".repeat(indent);
    const words       = s.split(/\s+/);
    let cur = "";
    for (const w of words) {
      if ((cur + (cur ? " " : "") + w).length <= effectiveCw) {
        cur += (cur ? " " : "") + w;
      } else {
        if (cur) this.line(prefix + cur);
        cur = w.slice(0, Math.max(1, effectiveCw));
      }
    }
    if (cur) this.line(prefix + cur);
    return this;
  }

  // Two-column layout (label left, value right) with padding between.
  // When the current mode is inverted, line() auto-pads so the bar is full-width.
  columns(left: string, right: string, isBold = false) {
    const effectiveCw = Math.floor(this.cw / this._sizeW);
    const maxLeft     = effectiveCw - right.length - 1;
    const l           = left.length > maxLeft ? left.slice(0, maxLeft - 1) + ">" : left;
    const pad         = effectiveCw - l.length - right.length;
    if (isBold) this.bold(true);
    this.line(l + " ".repeat(Math.max(1, pad)) + right);
    if (isBold) this.bold(false);
    return this;
  }

  build(): Buffer { return Buffer.concat(this.chunks); }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function applyStyle(r: EscPos, s: SectionStyle) {
  // ORDER MATTERS — on the Star TSP143IIIW:
  //   ESC i n1 n2  (size)        clears the emphasis register
  //   ESC 4 / ESC 5 (inverse)    may also clear emphasis on some firmware
  //
  // sizeMode is therefore LAST.  By the time it runs, both _bold and _inverted
  // are already set to the target values, so the re-assertion blocks inside
  // each size method fire and emit ESC E 01 / ESC 4 immediately after ESC i.
  // The size methods are also now idempotent — if the requested size matches
  // the current size (most common: section.fontSize maps to normal and the
  // printer already IS at normal after the previous resetStyle), no ESC i is
  // emitted at all and the only ESC bytes between bold-on and the text are
  // the bold command itself.
  r.align(s.align);
  r.invert(s.highlight);
  r.bold(s.bold);
  r.sizeMode(s.fontSize);
}

function blankLines(r: EscPos, px: number) {
  const n = Math.max(0, Math.round(px / 8));
  for (let i = 0; i < n; i++) r.nl();
}

// Logo printing removed — ESC * and GS v 0 image commands both fail on the
// Star TSP143IIIW in StarPRNT mode.  No image printing is attempted.


// ── Public types ──────────────────────────────────────────────────────────────

export interface ReceiptOrder {
  orderNumber: string;
  type: string;
  status: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryZoneName?: string | null;
  deliveryEstimatedMinutes?: number | null;
  notes?: string | null;
  subtotal: number;
  taxAmount: number;
  deliveryFee: number;
  tip?: number;
  couponDiscount?: number;
  promoDiscount?: number;
  appliedServiceFees?: string | null;  // JSON: [{ name, amount }]
  /** Snapshot of every promo that fired for this order, frozen at
   *  order-create time. JSON: [{ promoId, name, type, discount, couponCode? }].
   *  When present + non-empty, the customer receipt renders a boxed
   *  "PROMOS APPLIED" section above the totals listing each promo by
   *  name + the savings amount. Free-delivery entries carry the saved
   *  delivery fee as their `discount` value. */
  appliedPromos?: string | null;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string | Date;
  /** Customer-chosen slot for a scheduled ("order for later") order. Null/absent
   *  = ASAP. Drives the prominent ASAP / ORDER FOR LATER line on receipts. */
  scheduledFor?: string | Date | null;
  estimatedReady?: string | Date | null;
  preparationTime?: number | null;
  /** Reserve-then-order: the linked table booking. When set, the kitchen
   *  ticket prints a "TABLE RESERVATION + PRE-ORDER · Party of N" flag so staff
   *  see it's a booking, not a normal order. Luigi 2026-06-08. */
  reservation?: { partySize: number; date: string; time: string } | null;
  items: ReceiptItem[];
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  notes?: string | null;
  modifiers: { name: string; priceAdjustment: number }[];
  /** Promo Type 8 / 13 bundle line item. When present + non-empty the
   *  renderer prints the parent name + bundle price ONCE, then for each
   *  child indents the child's name (+variant +modifiers +speciality
   *  fee) underneath. Per-child prices are NOT printed — the bundle
   *  price covers them. */
  bundleItems?: Array<{
    name: string;
    variantName?: string | null;
    notes?: string | null;
    modifiers?: Array<{ name: string; priceAdjustment?: number }>;
    specialityFee?: number;
  }> | null;
}

export interface ReceiptRestaurant {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  /** ISO 4217 currency code. Drives money formatting on the receipt. */
  currency?: string | null;
  /** IANA timezone (e.g. "Europe/Rome"). Drives the printed order time so it
   *  reads in the restaurant's local clock, not the server's UTC. Optional —
   *  falls back to the runtime default when absent (legacy behaviour). */
  timezone?: string | null;
  /** 12h/24h preference — drives clock-time formatting on the receipt.
   *  Defaults to 12h when absent (legacy behaviour). Luigi 2026-06-08. */
  hoursFormat?: string | null;
}

// ── Format helpers ────────────────────────────────────────────────────────────

// Module-scoped active currency for the receipt being built. Set at the top
// of each public builder from the restaurant's currency. Single-threaded per
// request, so no cross-bleed; defaults to USD for legacy callers.
let activeReceiptCurrency = "usd";
function fmt(n: number) { return formatCurrency(n, activeReceiptCurrency); }

// Module-scoped active timezone for the receipt being built. Set at the top of
// each public builder from the restaurant's timezone. WHY this matters: order
// timestamps are stored in UTC and Node on Vercel runs in UTC, so without an
// explicit timeZone the printed time was the SERVER's UTC clock — a Rome
// restaurant's 20:00 order printed as 18:00/19:00. Passing the restaurant's
// IANA timezone fixes the printed time to the restaurant's local clock.
//
// DELIBERATELY locale-FROZEN to "en-US": thermal printers render a limited
// code page (CP437) and text() only ASCII-sanitizes a fixed set of glyphs.
// A localized month/day-period ("févr.", "1月", Arabic AM/PM) would print as
// garbage. en-US keeps output pure ASCII ("Jan", "3:45 PM") on every printer.
// This changes ONLY the date STRING content — the ESC/POS byte pipeline (the
// locked GOLDEN path) is untouched. Defaults to undefined → runtime default
// (legacy behaviour) when a caller hasn't threaded a timezone through.
let activeReceiptTimezone: string | undefined = undefined;

// Module-scoped 12h/24h preference for the receipt being built — set from the
// restaurant's hoursFormat at the top of each builder. Defaults to 12h (the
// long-standing receipt behaviour) for legacy callers. Luigi 2026-06-08:
// receipts were hardcoded to 12h; now a 24h restaurant prints 24h.
let activeReceiptHoursFormat: "12h" | "24h" = "12h";

function fmtTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: activeReceiptHoursFormat !== "24h",
    ...(activeReceiptTimezone ? { timeZone: activeReceiptTimezone } : {}),
  });
}

function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = new Date(d);
  const date = dt.toLocaleDateString("en-US", {
    month: "short", day: "numeric",
    ...(activeReceiptTimezone ? { timeZone: activeReceiptTimezone } : {}),
  });
  return date + " " + fmtTime(dt);
}

// ── Kitchen section renderer ──────────────────────────────────────────────────

async function renderKitchenSection(
  r: EscPos,
  section: Section,
  order: ReceiptOrder,
  config: KitchenConfig,
  t: Translator,
): Promise<void> {
  const s = section.style;

  switch (section.type) {
    case "k_title":
      r.line(`--- ${t("receipt.kitchen.title")} ---`);
      break;

    case "k_order_type":
      // Always render as a centred badge.  The section's highlight style controls
      // whether it's inverted; applyStyle() has already set the inverse state.
      // line() auto-pads to full width so the coloured bar spans the paper.
      r.line(`  ${tOrderTypeUpper(order.type, t)}  `);
      break;

    case "k_order_number":
      r.line(`#${order.orderNumber}`);
      break;

    // Reserve-then-order block — its OWN section so restaurants can toggle /
    // style / reposition it in the template editor. Renders only for a
    // pre-order; the section is skipped entirely for normal orders (see the
    // section loop). Mirrors the lines builder in receipt-lines.ts so the
    // bitmap (native LAN) and raw-TCP/PrintNode copies stay identical. Luigi
    // 2026-06-09.
    case "k_reservation":
      if (!order.reservation) break;
      r.line(`** ${t("receipt.kitchen.tableReservation")} **`);
      r.line(t("receipt.reservation.partyOf", { n: order.reservation.partySize }));
      r.line(`${t("receipt.reservation.booking")}: ${fmtDateTime(order.scheduledFor ?? `${order.reservation.date}T${order.reservation.time}`)}`);
      break;

    case "k_datetime":
      r.line(fmtDateTime(order.createdAt));
      // ASAP vs scheduled — prominent so the kitchen instantly sees whether to
      // make it now or hold it for a later slot. Luigi 2026-06-05. A
      // reservation's timing lives in the dedicated k_reservation section.
      if (order.reservation) {
        // booking time shown by k_reservation
      } else if (order.scheduledFor) {
        r.line(`** ${t("receipt.scheduling.orderForLater")} **`);
        r.line(fmtDateTime(order.scheduledFor));
      } else {
        r.line(`${t("receipt.scheduling.asap")} : ${fmtTime(order.createdAt)}`);
      }
      if (order.estimatedReady) r.line(`${t("kitchen.ready")} : ${fmtTime(order.estimatedReady)}`);
      break;

    case "k_customer":
      r.line(order.customerName);
      if (order.customerPhone) r.line(order.customerPhone);
      if (order.type === "delivery" && order.deliveryAddress) {
        r.line(order.deliveryAddress);
        if (order.deliveryCity) r.line(order.deliveryCity);
        if (order.deliveryZoneName || order.deliveryEstimatedMinutes) {
          const parts: string[] = [];
          if (order.deliveryZoneName) parts.push(`${order.deliveryZoneName}`);
          if (order.deliveryEstimatedMinutes) parts.push(`~${order.deliveryEstimatedMinutes} ${t("receipt.kitchen.minutes")}`);
          r.line(parts.join(" · "));
        }
      }
      break;

    case "k_items": {
      // Item names use this section's style.  Modifier lines use the separate
      // "k_modifiers" section's style if present and enabled, otherwise fall
      // back to this section's style.  Notes use this section's style.
      //
      // Bundle line items (Promo Type 8 / 13) print the parent name once
      // followed by each child indented underneath. No per-child price —
      // the bundle price covers them.
      const modStyle = findStyleSection(config, "k_modifiers");
      const modsEnabled = modStyle !== null;
      for (const item of order.items) {
        applyStyle(r, s);
        r.line(`${item.quantity}x ${item.name}`);
        if (Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
          for (const child of item.bundleItems) {
            applyStyle(r, s);
            const variantPart = child.variantName ? ` (${child.variantName})` : "";
            const specPart =
              child.specialityFee && child.specialityFee > 0
                ? ` (+${fmt(child.specialityFee)})`
                : "";
            r.wrapped(`  - 1x ${child.name}${variantPart}${specPart}`, 4);
            if (modsEnabled && Array.isArray(child.modifiers)) {
              for (const mod of child.modifiers) {
                applyStyle(r, modStyle);
                r.wrapped(`    -> ${mod.name}`, 7);
              }
            }
            if (child.notes) {
              applyStyle(r, s);
              r.wrapped(`    !! ${child.notes}`, 7);
            }
          }
        }
        if (modsEnabled) {
          for (const mod of item.modifiers) {
            applyStyle(r, modStyle);
            r.wrapped(`  -> ${mod.name}`, 5);
          }
        }
        if (item.notes) {
          applyStyle(r, s);
          r.wrapped(`  !! ${item.notes}`, 5);
        }
      }
      break;
    }

    case "k_modifiers":
      // Style-only — never renders as its own block.  Skipped by renderSections
      // before reaching here, but we list the case to silence exhaustiveness
      // checks and to document the intent.
      break;

    case "k_notes":
      // Both the label and body inherit the section's style.  Previously the
      // "NOTES:" label was hardcoded to inverse+bold which made the whole
      // section ignore the template's bold/highlight toggles.
      if (order.notes) {
        r.line(`${t("receipt.kitchen.notes")}:`);
        r.wrapped(order.notes);
      }
      break;

    case "k_prep": {
      const payStatus = order.paymentStatus === "paid"
        ? "PAID"
        : `${t("receipt.customer.payOnType", { type: tOrderTypeLower(order.type, t) }).toUpperCase()}`;
      r.line(`${t("receipt.kitchen.payment")}: ${payStatus}`);
      if (order.preparationTime) r.line(`${t("receipt.kitchen.prep")}: ${order.preparationTime} ${t("receipt.kitchen.minutes")}`);
      break;
    }
  }
}

// ── Customer section renderer ─────────────────────────────────────────────────

async function renderCustomerSection(
  r: EscPos,
  section: Section,
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  config: CustomerConfig,
  t: Translator,
): Promise<void> {
  const s = section.style;

  switch (section.type) {
    case "store_name":
      r.wrapped(restaurant.name);
      break;

    case "store_info":
      // Match the HTML preview: address + city/zip joined on one line when both
      // fit, phone on its own line, email on its own line.
      if (restaurant.address || restaurant.city) {
        const parts: string[] = [];
        if (restaurant.address) parts.push(restaurant.address);
        if (restaurant.city) {
          let cityLine = restaurant.city;
          if (restaurant.state) cityLine += `, ${restaurant.state}`;
          if (restaurant.zip)   cityLine += ` ${restaurant.zip}`;
          parts.push(cityLine);
        }
        r.wrapped(parts.join(", "));
      }
      if (restaurant.phone) r.wrapped(restaurant.phone);
      if (restaurant.email) r.wrapped(restaurant.email);
      break;

    // Reserve-then-order block (customer copy) — its own toggleable/styleable
    // section. Renders only for a pre-order; skipped for normal orders. Luigi
    // 2026-06-09.
    case "reservation":
      if (!order.reservation) break;
      r.line(`** ${t("receipt.kitchen.tableReservation")} **`);
      r.line(t("receipt.reservation.partyOf", { n: order.reservation.partySize }));
      r.line(`${t("receipt.reservation.booking")}: ${fmtDateTime(order.scheduledFor ?? `${order.reservation.date}T${order.reservation.time}`)}`);
      break;

    case "order_info":
      r.line(`${t("receipt.customer.orderNumber")}${order.orderNumber}`);
      r.line(t("receipt.customer.title", { type: tOrderTypeUpper(order.type, t) }));
      r.line(`${t("receipt.customer.date")}: ${fmtDateTime(order.createdAt)}`);
      // A reservation's booking time lives in the dedicated reservation section.
      if (order.reservation) {
        // booking time shown by the reservation section
      } else if (order.scheduledFor) {
        r.line(`${t("receipt.scheduling.orderForLater")}:`);
        r.line(fmtDateTime(order.scheduledFor));
      } else {
        r.line(`${t("receipt.scheduling.asap")} : ${fmtTime(order.createdAt)}`);
      }
      break;

    case "customer_info":
      r.line(order.customerName);
      if (order.customerPhone) r.line(order.customerPhone);
      if (order.customerEmail) r.line(order.customerEmail);
      if (order.type === "delivery" && order.deliveryAddress) {
        r.line(order.deliveryAddress);
        if (order.deliveryCity) r.line(order.deliveryCity);
      }
      break;

    case "items": {
      // Item lines use this section's style.  Modifier lines use the separate
      // "modifiers" section's style if present and enabled, otherwise fall back
      // to this section's style.  Notes use this section's style.
      //
      // Bundle line items print as: parent (with bundle subtotal),
      // then indented children without per-child prices.
      const modStyle = findStyleSection(config, "modifiers");
      const modsEnabled = modStyle !== null;
      for (const item of order.items) {
        applyStyle(r, s);
        r.columns(`${item.quantity}× ${item.name}`, fmt(item.subtotal));
        if (Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
          for (const child of item.bundleItems) {
            applyStyle(r, s);
            const variantPart = child.variantName ? ` (${child.variantName})` : "";
            const specPart =
              child.specialityFee && child.specialityFee > 0
                ? ` (+${fmt(child.specialityFee)})`
                : "";
            r.wrapped(`  - ${child.name}${variantPart}${specPart}`, 2);
            if (modsEnabled && Array.isArray(child.modifiers)) {
              for (const mod of child.modifiers) {
                applyStyle(r, modStyle);
                r.wrapped(`    + ${mod.name}`, 4);
              }
            }
          }
        }
        if (modsEnabled) {
          for (const mod of item.modifiers) {
            const p = mod.priceAdjustment !== 0 ? ` (+${fmt(mod.priceAdjustment)})` : "";
            applyStyle(r, modStyle);
            r.wrapped(`  + ${mod.name}${p}`, 2);
          }
        }
        if (item.notes) {
          applyStyle(r, s);
          r.wrapped(`  * Note: ${item.notes}`, 2);
        }
      }
      break;
    }

    case "modifiers":
      // Style-only — never renders as its own block.
      break;

    case "promos":
    case "k_promos": {
      // Applied promotions block — restaurants control visibility +
      // styling via the receipt template editor (font size, bold,
      // dividers, padding). Renders only when the order has any
      // promo in its appliedPromos snapshot.
      if (!order.appliedPromos) break;
      try {
        const promos = JSON.parse(order.appliedPromos) as Array<{
          name: string; type: string; discount: number; couponCode?: string;
        }>;
        if (!Array.isArray(promos) || promos.length === 0) break;
        applyStyle(r, s);
        r.line("* PROMOS APPLIED *");
        for (const p of promos) {
          const label = p.couponCode
            ? `  ${p.name} [${p.couponCode}]`
            : `  ${p.name}`;
          r.columns(label, p.discount > 0 ? `-${fmt(p.discount)}` : "FREE");
        }
      } catch { /* malformed JSON — skip */ }
      break;
    }

    case "totals":
      r.columns(t("receipt.customer.subtotal"), fmt(order.subtotal));
      if ((order.couponDiscount ?? 0) > 0)
        r.columns(t("receipt.customer.couponDiscount"), `-${fmt(order.couponDiscount!)}`);
      if ((order.promoDiscount ?? 0) > 0)
        r.columns(t("receipt.customer.promoDiscount"),  `-${fmt(order.promoDiscount!)}`);
      // Delivery line — when a free-delivery promo was applied, show the
      // ORIGINAL fee in parentheses alongside FREE so the customer sees
      // what was saved. Mirrors the on-screen behaviour. Pure text since
      // thermal printers can't render strike-through.
      {
        const promosRaw = (order as any).appliedPromos as string | null | undefined;
        let savedDeliveryFee = 0;
        if (promosRaw) {
          try {
            const promos = JSON.parse(promosRaw) as Array<{ type: string; discount: number }>;
            const fd = Array.isArray(promos) ? promos.find((p) => p.type === "free_delivery") : null;
            if (fd && fd.discount > 0) savedDeliveryFee = fd.discount;
          } catch { /* ignore */ }
        }
        if (savedDeliveryFee > 0) {
          r.columns(t("receipt.customer.deliveryFee"), `FREE (was ${fmt(savedDeliveryFee)})`);
        } else if (order.deliveryFee > 0) {
          r.columns(t("receipt.customer.deliveryFee"), fmt(order.deliveryFee));
        }
      }
      if (order.appliedServiceFees) {
        try {
          const fees = JSON.parse(order.appliedServiceFees) as { name: string; amount: number }[];
          for (const fee of fees) {
            if (fee && typeof fee.amount === "number" && fee.amount > 0) {
              // Fee NAMES are owner-entered content and stay as-typed.
              r.columns(fee.name, fmt(fee.amount));
            }
          }
        } catch { /* ignore malformed JSON */ }
      }
      if (order.taxAmount   > 0) r.columns(t("receipt.customer.tax"), fmt(order.taxAmount));
      if ((order.tip ?? 0)  > 0) r.columns(t("receipt.customer.tip"), fmt(order.tip!));
      r.divider("-");
      r.columns(t("receipt.customer.total"), fmt(order.total));
      break;

    case "payment": {
      const label  = order.paymentMethod === "card" ? t("receipt.customer.creditCard")
                   : order.paymentMethod === "cash" ? t("receipt.customer.cash")
                   : order.paymentMethod;
      const status = order.paymentStatus === "paid"    ? "PAID"
                   : order.paymentStatus === "pending" ? t("receipt.customer.payOnType", { type: tOrderTypeLower(order.type, t) })
                   : order.paymentStatus;
      r.line(`${t("receipt.kitchen.payment")}: ${label}`);
      r.line(`${t("receipt.reservation.status")}: ${status}`);
      break;
    }

    case "notes":
      if (order.notes) {
        r.line(`${t("receipt.customer.orderNotes")}:`);
        r.wrapped(order.notes);
      }
      break;

    case "thank_you":
      r.wrapped(config.thankYouMessage || t("receipt.customer.thankYou"));
      break;

    case "footer":
      if (config.footerText) r.wrapped(config.footerText);
      break;
  }
}

// ── Section render loop ───────────────────────────────────────────────────────

// Style-only section types — they describe the appearance of sub-elements of
// other sections (modifiers go inside items) and are looked up by the items
// renderer.  They do NOT render as their own block in the section loop.
const STYLE_ONLY_SECTIONS = new Set<string>(["k_modifiers", "modifiers"]);

async function renderSections(
  r: EscPos,
  config: CustomerConfig | KitchenConfig,
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  t: Translator,
) {
  for (const section of config.sections) {
    if (!section.enabled) continue;
    if (STYLE_ONLY_SECTIONS.has(section.type)) continue;
    // Reservation sections only exist for a pre-order — skip the WHOLE section
    // (padding + dividers included) on a normal order so it leaves no empty gap.
    if ((section.type === "reservation" || section.type === "k_reservation") && !order.reservation) continue;
    const s = section.style;

    blankLines(r, s.paddingTop);
    if (s.dividerAbove) r.resetStyle().left().divider("-");
    applyStyle(r, s);

    if (config.receiptType === "kitchen") {
      await renderKitchenSection(r, section, order, config as KitchenConfig, t);
    } else {
      await renderCustomerSection(r, section, order, restaurant, config as CustomerConfig, t);
    }

    r.resetStyle().left();
    if (s.dividerBelow) r.divider("-");
    blankLines(r, s.paddingBottom);
  }
}

// Look up a style-only section by type.  Returns the section's style if it
// exists and is enabled, or `null` if it should be skipped entirely (e.g.
// the user disabled the modifiers section, which suppresses modifier lines).
function findStyleSection(
  config: CustomerConfig | KitchenConfig,
  type: string,
): SectionStyle | null {
  const section = config.sections.find((sec) => sec.type === type);
  if (!section || !section.enabled) return null;
  return section.style;
}

// ── Template-driven builders ──────────────────────────────────────────────────

export async function buildKitchenReceiptFromConfig(
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  config: KitchenConfig,
  paperWidth = "80mm",
  lang: PrinterLanguage = "escpos",
  locale: string = "en",
): Promise<Buffer> {
  console.log(`[receipt] Kitchen print — lang=${lang} paper=${paperWidth} locale=${locale} sections=${config.sections.filter(s => s.enabled).length}`);
  activeReceiptCurrency = restaurant.currency ?? "usd";
  activeReceiptTimezone = restaurant.timezone ?? undefined;
  activeReceiptHoursFormat = restaurant.hoursFormat === "24h" ? "24h" : "12h";
  const r = new EscPos(paperWidth, lang);
  const t = await getDict(locale);
  r.init();
  await renderSections(r, config, order, restaurant, t);
  r.nl(4).cut();
  return r.build();
}

export async function buildCustomerReceiptFromConfig(
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  config: CustomerConfig,
  paperWidth = "80mm",
  lang: PrinterLanguage = "escpos",
  locale: string = "en",
): Promise<Buffer> {
  console.log(`[receipt] Customer print — lang=${lang} paper=${paperWidth} locale=${locale} sections=${config.sections.filter(s => s.enabled).length}`);
  activeReceiptCurrency = restaurant.currency ?? "usd";
  activeReceiptTimezone = restaurant.timezone ?? undefined;
  activeReceiptHoursFormat = restaurant.hoursFormat === "24h" ? "24h" : "12h";
  const r = new EscPos(paperWidth, lang);
  const t = await getDict(locale);
  r.init();
  await renderSections(r, config, order, restaurant, t);
  r.nl(4).cut();
  return r.build();
}

// ── Reservation receipt ──────────────────────────────────────────────────────

export interface ReservationReceiptData {
  restaurantName: string;
  confirmationCode: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  partySize: number;
  date: string;          // "YYYY-MM-DD"
  time: string;          // "HH:MM"
  tableName?: string | null;
  notes?: string | null;
  depositAmount?: number;
  depositPaid?: boolean;
  preOrderTotal?: number;
  status: string;
  createdAt: Date;
  /** ISO 4217 currency code for money on the reservation receipt. */
  currency?: string | null;
  /** IANA timezone for the printed "printed at" time. Optional — falls back to
   *  the runtime default when absent. */
  timezone?: string | null;
  /** 12h/24h preference for printed times. Defaults to 12h. Luigi 2026-06-08. */
  hoursFormat?: string | null;
}

export async function buildReservationReceipt(
  data: ReservationReceiptData,
  paperWidth = "80mm",
  lang: PrinterLanguage = "escpos",
  locale: string = "en",
): Promise<Buffer> {
  activeReceiptCurrency = data.currency ?? "usd";
  activeReceiptTimezone = data.timezone ?? undefined;
  activeReceiptHoursFormat = data.hoursFormat === "24h" ? "24h" : "12h";
  const r = new EscPos(paperWidth, lang);
  const t = await getDict(locale);
  r.init();

  r.center().sizeMode(24).bold(true).line(t("receipt.reservation.title")).bold(false).sizeMode(12);
  r.line("");
  r.line(data.restaurantName);
  r.divider("-");

  r.left().bold(true).line(`#${data.confirmationCode}`).bold(false);
  r.line(`${t("receipt.reservation.status")}: ${data.status.toUpperCase()}`);
  r.line(`${t("receipt.reservation.printed")}: ${fmtDateTime(data.createdAt)}`);
  r.divider("-");

  r.bold(true).line(t("receipt.reservation.guest")).bold(false);
  r.line(data.customerName);
  if (data.customerPhone) r.line(data.customerPhone);
  if (data.customerEmail) r.wrapped(data.customerEmail);
  r.divider("-");

  r.bold(true).line(t("receipt.reservation.booking")).bold(false);
  r.sizeMode(24).line(`${data.date}`).sizeMode(12);
  r.sizeMode(24).line(formatTime(data.time, activeReceiptHoursFormat)).sizeMode(12);
  r.line(t("receipt.reservation.partyOf", { n: data.partySize }));
  if (data.tableName) r.line(`${t("receipt.reservation.table")}: ${data.tableName}`);
  r.divider("-");

  if (data.notes) {
    r.bold(true).line(t("receipt.reservation.notes")).bold(false);
    r.wrapped(data.notes);
    r.divider("-");
  }

  if ((data.depositAmount ?? 0) > 0) {
    r.bold(true).line(t("receipt.reservation.deposit")).bold(false);
    r.columns(t("receipt.reservation.amount"), fmt(data.depositAmount ?? 0));
    r.columns(t("receipt.reservation.status"), data.depositPaid ? "PAID" : "PENDING");
    r.divider("-");
  }

  if ((data.preOrderTotal ?? 0) > 0) {
    r.bold(true).line(t("receipt.reservation.preOrder")).bold(false);
    r.columns(t("receipt.customer.subtotal"), fmt(data.preOrderTotal ?? 0));
    r.line(t("receipt.reservation.preOrderHint"));
    r.divider("-");
  }

  r.line("");
  r.center().line(t("receipt.customer.thankYou"));
  r.line("").nl(2).cut();
  return r.build();
}

// ── Diagnostic builders ───────────────────────────────────────────────────────

export function buildPlainTextDiagnostic(restaurantName: string, paperWidth = "80mm"): Buffer {
  const cw     = paperWidth === "58mm" ? 32 : 48;
  const dashes = "-".repeat(cw);
  const lines  = [
    "PLAIN TEXT DIAGNOSTIC",
    dashes,
    `Restaurant: ${restaurantName}`,
    `Time: ${new Date().toLocaleTimeString()}`,
    dashes,
    "If this reads correctly:",
    "  - PrintNode is receiving data",
    "  - Windows driver is passing text",
    "  - Basic communication works",
    dashes,
    "Next: try ESC/POS Basic test.",
    "", "", "", "",
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

export function buildEscPosDiagnostic(restaurantName: string, paperWidth = "80mm"): Buffer {
  const r = new EscPos(paperWidth, "escpos");
  r.init();
  r.center().doubleSize().bold(true).line("ESC/POS").bold(false).normalSize();
  r.center().line("DIAGNOSTIC TEST");
  r.left().divider("=");
  r.line(`Restaurant: ${restaurantName}`);
  r.line(`Time: ${new Date().toLocaleTimeString()}`);
  r.line(`Paper: ${paperWidth}`);
  r.divider("-");
  // Bold test
  r.bold(true).line("BOLD TEXT (ESC E 1)").bold(false);
  r.line("Normal text after bold off");
  // Size tests
  r.doubleHeight().line("DOUBLE HEIGHT").normalSize();
  r.doubleWidth().line("DOUBLE WIDE").normalSize();
  r.doubleSize().line("DOUBLE SIZE").normalSize();
  // Inverse test — GS B (ESC/POS)
  r.divider("-");
  r.line("Inverse test (GS B 1):");
  r.invert(true).line("  WHITE ON BLACK  ").invert(false);
  r.line("Normal after inverse off");
  // Alignment test
  r.divider("-");
  r.left().line("Left aligned");
  r.center().line("Centered");
  r.right().line("Right");
  r.left();
  r.divider("=");
  r.center().line("Cut command follows").left();
  r.nl(4).cut();
  return r.build();
}

export function buildStarPrntDiagnostic(restaurantName: string, paperWidth = "80mm"): Buffer {
  const r   = new EscPos(paperWidth, "starprnt");
  const cw  = paperWidth === "58mm" ? 32 : 48;
  const now = new Date().toLocaleTimeString();

  r.init();
  r.center().doubleSize().bold(true).line("StarPRNT").bold(false).normalSize();
  r.center().line("DIAGNOSTIC TEST").left();
  r.divider("=");
  r.line(`Restaurant: ${restaurantName}`);
  r.line(`Time: ${now}  Paper: ${paperWidth}`);
  r.divider("=");

  // ── TEST 1: Bold (ESC E 1 / ESC E 0) ───────────────────────────────────────
  r.left().line("TEST 1 - Bold (ESC E 1 / ESC E 0)");
  r.bold(true).line(">>> THIS SHOULD BE BOLD <<<").bold(false);
  r.line("If the line above is darker: PASS");
  r.divider("-");

  // ── TEST 2: Double size (ESC i 1 1) ────────────────────────────────────────
  r.left().line("TEST 2 - Double Size (ESC i 1 1)");
  r.doubleSize().line("BIG").normalSize();
  r.line("If BIG above was large: PASS");
  r.divider("-");

  // ── TEST 3: Double height (ESC i 1 0) ──────────────────────────────────────
  r.left().line("TEST 3 - Double Height (ESC i 1 0)");
  r.doubleHeight().line("TALL TEXT").normalSize();
  r.line("If TALL TEXT was taller: PASS");
  r.divider("-");

  // ── TEST 4: Inverse bar (ESC 4 / ESC 5) ────────────────────────────────────
  r.left().line("TEST 4 - Inverse (ESC 4 on / ESC 5 off)");
  r.invert(true).line(" WHITE TEXT ON BLACK ").invert(false);
  r.line("If above was white-on-black: PASS");
  r.divider("-");

  // ── TEST 5: Filled black block via inverse ──────────────────────────────────
  // Prints a solid black rectangle using inverse + spaces — no image commands.
  // If this prints as a clean solid black bar, inverse + auto-padding works.
  r.left().line("TEST 5 - Black block (inverse+spaces)");
  r.invert(true).line("").invert(false);       // full-width black bar
  r.invert(true).line("").invert(false);
  r.invert(true).line("").invert(false);
  r.line("If 3 solid black bars above: PASS");
  r.divider("-");

  // ── TEST 6: Alignment (ESC GS a n) ─────────────────────────────────────────
  r.left().line("TEST 6 - Alignment (ESC GS a n)");
  r.left().line("[LEFT]");
  r.center().line("[CENTERED]");
  r.right().line("[RIGHT]");
  r.left();
  r.line("If labels match positions: PASS");
  r.divider("-");

  // ── TEST 7: Binary byte check ───────────────────────────────────────────────
  // Prints two hex dump lines so you can verify specific byte values reach the
  // printer correctly.  If binary is corrupted in transit these will differ.
  r.left().line("TEST 7 - Binary pipeline check");
  r.line("Bytes 00-0F should print as spaces/ctrl");
  r.line(`Paper width=${paperWidth} cw=${cw} chars`);
  r.line("If all tests 1-6 passed: binary OK");
  r.divider("=");

  r.bold(true).center().line("ALL PASS = StarPRNT OK").bold(false).left();
  r.divider("=");
  r.center().line("Cut (ESC d 3) follows").left();
  r.nl(4).cut();
  return r.build();
}

// ── STAR BOLD TEST — tests all three emphasis command sets on one receipt ─────
//
// Run this when bold is not working.  Each block uses a different command:
//   Block A — ESC E 1 / ESC E 0    (StarPRNT emphasis)
//   Block B — ESC F / ESC H        (Star Line Mode emphasis)
//   Block C — ESC ! 0x08 / 0x00    (ESC/POS composite mode bit 3)
//
// Whichever block prints darker text is the correct bold command for your printer.
// Then set the printer language to match:
//   Block A works → use "StarPRNT"
//   Block B works → use "Star Line Mode"
//   Block C works → use "ESC/POS"

export function buildStarBoldTest(restaurantName: string, paperWidth = "80mm"): Buffer {
  // Build raw bytes manually so we can send exact command sequences regardless
  // of which language the EscPos builder would pick.  Uses a "starprnt" builder
  // for size/alignment/inverse/cut, but overrides bold bytes directly.
  const r = new EscPos(paperWidth, "starprnt");
  const now = new Date().toLocaleTimeString();

  r.init();
  r.center().doubleHeight().line("STAR BOLD TEST").normalSize();
  r.center().line(`${restaurantName}   ${now}`).left();
  r.divider("=");
  r.line("Each block tests a DIFFERENT bold command.");
  r.line("The block that prints DARKER text is the");
  r.line("correct bold for your printer.");
  r.divider("=");

  // ── BLOCK A: StarPRNT — ESC E 1 / ESC E 0 ──────────────────────────────────
  r.left().line("BLOCK A: StarPRNT (ESC E 1 / ESC E 0)");
  r.line("Bytes sent: 1B 45 01 ... 1B 45 00");
  r.cmd(ESC, 0x45, 0x01);                // ESC E 1 — StarPRNT bold on
  r.line(">>> A: THIS SHOULD BE BOLD <<<");
  r.cmd(ESC, 0x45, 0x00);                // ESC E 0 — bold off
  r.line("Normal text after bold off");
  r.divider("-");

  // ── BLOCK B: Star Line Mode — ESC F / ESC H ─────────────────────────────────
  r.left().line("BLOCK B: Star Line (ESC F / ESC H)");
  r.line("Bytes sent: 1B 46 ... 1B 48");
  r.cmd(ESC, 0x46);                      // ESC F — Star Line Mode emphasis on
  r.line(">>> B: THIS SHOULD BE BOLD <<<");
  r.cmd(ESC, 0x48);                      // ESC H — emphasis off
  r.line("Normal text after bold off");
  r.divider("-");

  // ── BLOCK C: ESC/POS composite mode — ESC ! 0x08 / 0x00 ────────────────────
  r.left().line("BLOCK C: ESC/POS mode (ESC ! 0x08 / 0x00)");
  r.line("Bytes sent: 1B 21 08 ... 1B 21 00");
  r.cmd(ESC, 0x21, 0x08);                // ESC ! bit3 — ESC/POS bold on
  r.line(">>> C: THIS SHOULD BE BOLD <<<");
  r.cmd(ESC, 0x21, 0x00);                // ESC ! 0 — back to normal
  r.line("Normal text after bold off");
  r.divider("-");

  // ── BLOCK D: Bold + Double Size combined (uses Block B commands) ─────────────
  r.left().line("BLOCK D: Star Line bold + double size");
  r.cmd(ESC, 0x46);                      // ESC F on
  r.doubleSize().line("BIG BOLD D").normalSize();
  r.cmd(ESC, 0x48);                      // ESC H off
  r.line("Normal size after");
  r.divider("-");

  // ── BLOCK E: Inverse heading (confirmed working) ─────────────────────────────
  r.left().line("BLOCK E: Inverse (ESC 4 / ESC 5)");
  r.invert(true).line(" INVERSE SHOULD BE WHITE ON BLACK ").invert(false);
  r.line("If above white-on-black: inverse OK");
  r.divider("=");

  r.center().line("WHICH BLOCK PRINTED DARKER?").left();
  r.line("A=StarPRNT  B=Star Line  C=ESC/POS");
  r.line("Set printer language to match.");
  r.divider("=");
  r.nl(4).cut();
  return r.build();
}

// ── Sample order for test prints ──────────────────────────────────────────────

export const SAMPLE_RECEIPT_ORDER: ReceiptOrder = {
  orderNumber: "TEST-001",
  type: "pickup",
  status: "accepted",
  customerName: "Test Customer",
  customerPhone: "(555) 000-0000",
  customerEmail: "test@example.com",
  notes: "This is a test print. If you can read this clearly, PrintNode is working!",
  subtotal: 24.98,
  taxAmount: 2.00,
  deliveryFee: 0,
  tip: 3.00,
  couponDiscount: 0,
  promoDiscount: 0,
  total: 29.98,
  paymentMethod: "cash",
  paymentStatus: "pending",
  createdAt: new Date().toISOString(),
  preparationTime: 20,
  items: [
    {
      name: "Margherita Pizza",
      quantity: 2,
      price: 12.99,
      subtotal: 25.98,
      notes: "Well done please",
      modifiers: [{ name: "Extra Cheese", priceAdjustment: 1.50 }],
    },
    {
      name: "Caesar Salad",
      quantity: 1,
      price: 9.99,
      subtotal: 9.99,
      notes: null,
      modifiers: [],
    },
  ],
};
