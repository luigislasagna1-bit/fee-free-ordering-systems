/**
 * Minimal ESC/POS encoder for receipt printing.
 *
 * ESC/POS is the de facto standard for thermal receipt printers
 * (Star, Epson, Bixolon, Citizen…). It's a stream of control-byte
 * sequences interleaved with the text to print. We assemble those
 * bytes here, then ship them over a raw TCP socket via the native
 * DirectPrinter plugin (see src/lib/native-printer.ts).
 *
 * This is NOT a full ESC/POS implementation. We support only what
 * receipt printing needs:
 *   - Initialize / reset printer state
 *   - Set character encoding (CP437 western default)
 *   - Bold, double-size, alignment (left/center/right)
 *   - Line spacing + line feeds
 *   - Horizontal divider lines made of '-' characters
 *   - Cut paper at end (partial cut — leaves a small tab so the
 *     receipt doesn't fall on the floor)
 *
 * Things we DELIBERATELY skip:
 *   - QR codes / barcodes (need printer-model-specific commands;
 *     re-add if/when we want to print order-tracking QR on receipts)
 *   - Bitmap/logo printing (printer-specific raster format —
 *     restaurants who want a logo on the receipt should upload it
 *     to the printer's NV memory using the vendor utility one
 *     time, then we just emit the "print stored logo" command)
 *   - Cash drawer kick (not relevant — we don't take cash through
 *     the kitchen display)
 *
 * Reference: Epson ESC/POS Command Reference
 *   https://reference.epson-biz.com/modules/ref_escpos/
 *
 * Tested against Star TSP143IIIW (Luigi's printer per project memory)
 * which is fully ESC/POS-compatible despite Star's own "Star Line Mode"
 * being a slightly extended dialect.
 */

// ─── Raw control bytes ───────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Reusable byte sequences for the commands we use. */
const CMD = {
  // ESC @ — initialize printer (resets formatting state)
  INIT: [ESC, 0x40],
  // ESC a n — text alignment: 0=left, 1=center, 2=right
  ALIGN_LEFT:   [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT:  [ESC, 0x61, 0x02],
  // ESC E n — bold: 1=on, 0=off
  BOLD_ON:  [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  // GS ! n — character size. Lower nibble = width multiplier, upper
  // nibble = height multiplier. 0x00 = normal, 0x11 = 2x both, etc.
  SIZE_NORMAL: [GS, 0x21, 0x00],
  SIZE_DOUBLE: [GS, 0x21, 0x11],
  // ESC d n — feed n lines
  FEED_3: [ESC, 0x64, 0x03],
  // GS V m — paper cut: 0=full cut, 1=partial cut (leaves a small tab)
  CUT_PARTIAL: [GS, 0x56, 0x01],
} as const;

/**
 * Builder that collects bytes for a single receipt then emits them
 * as a Uint8Array. Use the fluent API: each method returns `this`.
 */
export class EscPosBuilder {
  private chunks: number[] = [];
  private widthChars: number;

  /**
   * @param widthChars Number of characters that fit on one line at
   *                   normal size. 48 is the standard for 80mm paper
   *                   on most Star/Epson printers; 32 is the standard
   *                   for 58mm. Defaults to 48.
   */
  constructor(widthChars: number = 48) {
    this.widthChars = widthChars;
    // Initialize printer state on every receipt — cheap insurance
    // against state left over from a previous (failed) print.
    this.raw(CMD.INIT);
  }

  // ── Raw byte ops ───────────────────────────────────────────────

  /** Append raw bytes directly. Use when you need a command not
   *  exposed by the helpers below. */
  raw(bytes: number[] | readonly number[]): this {
    for (const b of bytes) this.chunks.push(b);
    return this;
  }

  // ── Text ───────────────────────────────────────────────────────

  /** Write text using ASCII-safe encoding. Non-ASCII characters are
   *  collapsed to '?' to avoid garbled output on printers that don't
   *  speak UTF-8 (most don't, by default). Restaurants with menus
   *  in French/Spanish should configure the printer's character
   *  table to a matching codepage (CP858 = western European) — until
   *  then ASCII-only is the safe path. */
  text(s: string): this {
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      this.chunks.push(code < 0x20 || code > 0x7e ? 0x3f : code);
    }
    return this;
  }

  /** Text + newline. */
  textln(s: string): this {
    return this.text(s).newline();
  }

  newline(): this {
    this.chunks.push(LF);
    return this;
  }

  /** Multiple line feeds. Useful for spacing at receipt end before cut. */
  feed(lines: number): this {
    for (let i = 0; i < lines; i++) this.chunks.push(LF);
    return this;
  }

  // ── Formatting ─────────────────────────────────────────────────

  align(mode: "left" | "center" | "right"): this {
    if (mode === "center") return this.raw(CMD.ALIGN_CENTER);
    if (mode === "right") return this.raw(CMD.ALIGN_RIGHT);
    return this.raw(CMD.ALIGN_LEFT);
  }

  bold(on: boolean): this {
    return this.raw(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
  }

  doubleSize(on: boolean): this {
    return this.raw(on ? CMD.SIZE_DOUBLE : CMD.SIZE_NORMAL);
  }

  // ── Layout helpers ─────────────────────────────────────────────

  /** Horizontal divider of '-' across the full paper width. */
  divider(char: string = "-"): this {
    return this.textln(char.repeat(this.widthChars));
  }

  /** Two-column line: left-aligned label on the left, right-aligned
   *  value on the right, padded with spaces in between. If the
   *  combined text exceeds paper width, the label is truncated. */
  twoCol(left: string, right: string): this {
    const max = this.widthChars;
    const r = right.slice(0, max);
    const remaining = max - r.length;
    let l = left;
    if (l.length > remaining - 1) l = l.slice(0, remaining - 1) + "…".replace("…", ".");
    const gap = max - l.length - r.length;
    return this.textln(l + " ".repeat(Math.max(1, gap)) + r);
  }

  // ── Finishing ──────────────────────────────────────────────────

  /** Add some bottom whitespace + cut. Call once at the very end
   *  of the receipt — cutting mid-print discards remaining bytes. */
  cut(): this {
    return this.raw(CMD.FEED_3).raw(CMD.CUT_PARTIAL);
  }

  /** Materialize the collected bytes. */
  build(): Uint8Array {
    return new Uint8Array(this.chunks);
  }

  /** Materialize + base64 encode. The native plugin accepts base64
   *  to keep the JS bridge transport simple. */
  buildBase64(): string {
    const bytes = this.build();
    // Browser-safe base64 — server-side Node.js also has Buffer.
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("base64");
    }
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
}
