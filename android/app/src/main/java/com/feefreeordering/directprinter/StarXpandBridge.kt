package com.feefreeordering.directprinter

import android.content.Context
import android.util.Log
import com.starmicronics.stario10.InterfaceType
import com.starmicronics.stario10.StarConnectionSettings
import com.starmicronics.stario10.StarPrinter
import com.starmicronics.stario10.starxpandcommand.StarXpandCommandBuilder
import com.starmicronics.stario10.starxpandcommand.DocumentBuilder
import com.starmicronics.stario10.starxpandcommand.PrinterBuilder
import com.starmicronics.stario10.starxpandcommand.printer.CutType
import com.starmicronics.stario10.starxpandcommand.printer.Alignment
import com.starmicronics.stario10.starxpandcommand.printer.InternationalCharacterType
import com.starmicronics.stario10.starxpandcommand.printer.ImageParameter
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout

/**
 * Bridges stario10 (StarXpand SDK)'s Kotlin-suspend API into simple
 * blocking calls Java can use. The plugin's main file is Java, and
 * stario10 doesn't expose a Java-friendly Future-based API for its
 * core printing methods.
 *
 * Two methods exposed:
 *   testPrint(context, ip, timeoutMs) - hardcoded "is it working" print
 *   printRawText(context, ip, text, timeoutMs) - print arbitrary text
 *
 * Returns "ok" on success or a short error description string.
 */
object StarXpandBridge {
    private const val TAG = "DirectPrinter"

    /**
     * Send a hardcoded diagnostic test print via StarXpand.
     * Returns "ok" if the SDK reports success, otherwise an error string.
     */
    @JvmStatic
    fun testPrint(context: Context, ip: String, timeoutMs: Long): String {
        return runPrint(context, ip, timeoutMs) { builder ->
            // BITMAP-RENDERED text. Star's actionPrintText was sending
            // commands the printer accepted but didn't render. The
            // bulletproof fallback is to rasterize text to a bitmap
            // (which works in any printer mode) and send via
            // actionPrintImage. This is how the Star Print app does it.
            val text = buildString {
                append("\n")
                append("*** STARXPAND TEST ***\n")
                append("\n")
                append("If you see this text,\n")
                append("the bitmap fix WORKS.\n")
                append("\n")
                append(java.util.Date().toString() + "\n")
                append("\n")
            }
            val bitmap = renderTextBitmap(text, 576)
            builder.actionPrintImage(ImageParameter(bitmap, 576))
            builder.actionFeedLine(5)
            builder.actionCut(CutType.Partial)
        }
    }

    private fun renderTextBitmap(text: String, widthDots: Int): Bitmap {
        val paint = Paint().apply {
            color = Color.BLACK
            textSize = 28f
            typeface = Typeface.MONOSPACE
            isAntiAlias = false
        }
        val lines = text.split("\n")
        val lineHeight = (paint.descent() - paint.ascent()).toInt() + 4
        val height = maxOf(lineHeight * lines.size + 20, 100)
        val bitmap = Bitmap.createBitmap(widthDots, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        var y = lineHeight.toFloat() - paint.descent()
        for (line in lines) {
            canvas.drawText(line, 8f, y, paint)
            y += lineHeight
        }
        return bitmap
    }

    /**
     * Print a structured receipt. Lines are a JSON array string with
     * the same shape as the server-side ReceiptLine type. We render
     * everything to a bitmap (with bold/double-size/alignment styling
     * preserved) and send via actionPrintImage. This is the production
     * print path for real orders.
     *
     * MEMORY SAFETY (Luigi 2026-07-25, ORD-336535031): a very large order
     * (2× six-pizza combos → a ~6,600-char ticket) rendered as ONE tall
     * ARGB bitmap ran the old Samsung kitchen tablet out of memory — the
     * app froze then crashed ("Fee Free Order App has stopped") every time
     * that order printed, while small orders printed fine. Receipts up to
     * SINGLE_RENDER_MAX_HEIGHT_PX keep the proven single-bitmap path,
     * byte-for-byte unchanged. Taller receipts switch to the BANDED path:
     * the same layout is drawn band-by-band into a small reusable-size
     * bitmap (translate + canvas clipping), each band printed in ONE open
     * printer session and freed before the next — peak memory stays at one
     * band (~5.5 MB) no matter how huge the order. The paper output is
     * identical: consecutive raster bands butt together seamlessly.
     *
     * widthDots: 576 for 80mm paper, 384 for 58mm.
     */
    @JvmStatic
    fun printLines(context: Context, ip: String, linesJson: String, widthDots: Int, timeoutMs: Long): String {
        val lines = try {
            org.json.JSONArray(linesJson)
        } catch (e: Throwable) {
            return "JSONParseError: ${e.message}"
        }
        // Some lines (e.g., {"kind":"cut"}) become SDK actions instead
        // of being drawn on the bitmap. Scan for those up front.
        var shouldCut = false
        var trailingFeed = 0
        for (i in 0 until lines.length()) {
            val item = lines.optJSONObject(i) ?: continue
            when (item.optString("kind")) {
                "cut" -> shouldCut = true
                "feed" -> {
                    // Trailing feeds AFTER the last visible content count
                    // as advance-paper-then-cut; intermediate feeds are
                    // already represented in the bitmap as blank lines.
                    if (i == lines.length() - 1 ||
                        (i == lines.length() - 2 && lines.optJSONObject(i + 1)?.optString("kind") == "cut")) {
                        trailingFeed += item.optInt("count", 1)
                    }
                }
            }
        }

        // Height pre-pass (cheap — no bitmap). Decides which path we take.
        val totalHeight = computeReceiptHeight(lines, widthDots)
        if (totalHeight > MAX_RECEIPT_HEIGHT_PX) {
            // ~5 metres of paper — a runaway template, not a real order.
            return "ReceiptTooTall: ${totalHeight}px"
        }

        if (totalHeight <= SINGLE_RENDER_MAX_HEIGHT_PX) {
            // The original, proven path — unchanged for every normal order.
            val bitmap = renderReceiptBitmap(lines, widthDots)
            return runPrint(context, ip, timeoutMs) { builder ->
                builder.actionPrintImage(ImageParameter(bitmap, widthDots))
                // Always feed enough to clear cutter (~6 lines = ~14mm).
                builder.actionFeedLine(maxOf(trailingFeed, 5))
                if (shouldCut) {
                    builder.actionCut(CutType.Partial)
                }
                builder // explicit return — lambda must yield PrinterBuilder
            }
        }

        Log.i(TAG, "StarXpand: large receipt (${totalHeight}px) — printing in bands of $BAND_HEIGHT_PX")
        return printLinesBanded(context, ip, lines, widthDots, totalHeight, timeoutMs, shouldCut, trailingFeed)
    }

    /**
     * Banded print for oversized receipts: ONE open→[print band]×N→feed/cut→close
     * session. Each band re-runs the same deterministic layout with the canvas
     * translated so only that band's slice lands on a small bitmap (everything
     * outside is clipped by the canvas — cheap no-ops). The band bitmap is
     * recycled as soon as its raster commands are built, so peak memory is one
     * band regardless of receipt size. A failed band is retried once on the same
     * session; a second failure aborts with a clear error (the printer may hold
     * a partial receipt — the app surfaces the failure so staff reprints).
     */
    private fun printLinesBanded(
        context: Context,
        ip: String,
        lines: org.json.JSONArray,
        widthDots: Int,
        totalHeight: Int,
        timeoutMs: Long,
        shouldCut: Boolean,
        trailingFeed: Int,
    ): String {
        val settings = StarConnectionSettings(InterfaceType.Lan, ip)
        val printer = StarPrinter(settings, context)
        try {
            try {
                runBlocking { withTimeout(OPEN_TIMEOUT_MS) { printer.openAsync().await() } }
            } catch (e: Throwable) {
                return "OpenError: ${e.javaClass.simpleName}: ${e.message}"
            }
            Log.i(TAG, "StarXpand banded: printer opened; ${totalHeight}px in bands")

            var bandTop = 0
            while (bandTop < totalHeight) {
                val bandH = minOf(BAND_HEIGHT_PX, totalHeight - bandTop)
                var bandResult = "unknown"
                for (attempt in 1..2) {
                    bandResult = try {
                        // Build this band's raster commands with the bitmap alive
                        // only inside this block.
                        val commands = run {
                            val bitmap = Bitmap.createBitmap(widthDots, bandH, Bitmap.Config.ARGB_8888)
                            try {
                                val canvas = Canvas(bitmap)
                                canvas.drawColor(Color.WHITE)
                                canvas.translate(0f, -bandTop.toFloat())
                                drawReceiptInto(canvas, lines, widthDots)
                                val pb = PrinterBuilder()
                                pb.actionPrintImage(ImageParameter(bitmap, widthDots))
                                StarXpandCommandBuilder()
                                    .addDocument(DocumentBuilder().addPrinter(pb))
                                    .getCommands()
                            } finally {
                                bitmap.recycle()
                            }
                        }
                        runBlocking { withTimeout(timeoutMs) { printer.printAsync(commands).await() } }
                        "ok"
                    } catch (e: Throwable) {
                        "${e.javaClass.simpleName}: ${e.message}"
                    }
                    if (bandResult == "ok") break
                    Log.w(TAG, "StarXpand banded: band@$bandTop attempt $attempt failed: $bandResult")
                    if (attempt < 2) {
                        try { Thread.sleep(RETRY_DELAY_MS) } catch (ignore: InterruptedException) {}
                    }
                }
                if (bandResult != "ok") {
                    return "BandError@${bandTop}px: $bandResult"
                }
                bandTop += bandH
            }

            // Trailing feed + cut as a final tiny job on the same session.
            return try {
                val pb = PrinterBuilder()
                pb.actionFeedLine(maxOf(trailingFeed, 5))
                if (shouldCut) pb.actionCut(CutType.Partial)
                val commands = StarXpandCommandBuilder()
                    .addDocument(DocumentBuilder().addPrinter(pb))
                    .getCommands()
                runBlocking { withTimeout(timeoutMs) { printer.printAsync(commands).await() } }
                Log.i(TAG, "StarXpand banded: print returned SUCCESS")
                "ok"
            } catch (e: Throwable) {
                "FeedCutError: ${e.javaClass.simpleName}: ${e.message}"
            }
        } finally {
            // ALWAYS close, with its own timeout — same guarantee as sendOnce.
            try {
                runBlocking { withTimeout(CLOSE_TIMEOUT_MS) { printer.closeAsync().await() } }
            } catch (ignore: Throwable) {
                Log.w(TAG, "StarXpand banded: close failed/timed out (continuing): ${ignore.message}")
            }
        }
    }

    /**
     * Render structured receipt lines to a single bitmap. Each line
     * carries its own style (fontSize, bold, align, highlight).
     *
     * fontSize semantics: the server emits the px size from the per-
     * restaurant template (9..32 typically). We treat 12px as the
     * baseline "normal" size and scale linearly into bitmap text size.
     * Highlighting is rendered as white text on a black background bar
     * spanning the full paper width — matches the HTML preview style
     * for the kitchen ORDER TYPE badge.
     */
    /** Pre-compute the full receipt height by walking lines once — no bitmap is
     *  allocated. Must stay in lockstep with drawReceiptInto (same wrap + line-
     *  height math), exactly as the old inline pre-pass did. */
    private fun computeReceiptHeight(lines: org.json.JSONArray, widthDots: Int): Int {
        val defaultLineHeight = lineHeightForFont(12)
        val leftMargin = 8f
        val rightMargin = 8f
        val drawableWidth = widthDots - leftMargin - rightMargin
        val boxPadX = 12f
        val boxPadY = 8f
        val boxBorder = 2f
        val boxGap = 6f

        // Pre-compute total height by walking lines once. Word-wrapping
        // is done here too so multi-line wraps allocate enough space.
        var totalHeight = 16 // top margin
        var boxActiveM = false
        for (i in 0 until lines.length()) {
            val item = lines.optJSONObject(i) ?: continue
            // Inside a box, the wrap width narrows so multi-line wraps reserve
            // the right height. Identical to drawableWidth when not boxed.
            val innerWidth = if (boxActiveM) drawableWidth - 2 * boxPadX else drawableWidth
            when (item.optString("kind")) {
                "text" -> {
                    val fontSize = item.optInt("fontSize", 12)
                    val bold = item.optBoolean("bold", false)
                    val text = item.optString("text", "")
                    val paint = textPaint(scaledTextSize(fontSize), bold)
                    val wrapped = wrapText(text, paint, innerWidth)
                    totalHeight += lineHeight(paint) * wrapped.size.coerceAtLeast(1)
                }
                "twoCol" -> {
                    val fontSize = item.optInt("fontSize", 12)
                    totalHeight += lineHeightForFont(fontSize)
                }
                "divider" -> totalHeight += defaultLineHeight
                "feed" -> totalHeight += defaultLineHeight * item.optInt("count", 1)
                "cut" -> { /* SDK action, no bitmap height */ }
                // Receipt-logo image (additive 2026-06-11). decodeImageLine
                // returns null on ANY problem, so a bad/absent logo adds no
                // height and the receipt lays out exactly as before.
                "image" -> {
                    val img = decodeImageLine(item, innerWidth)
                    if (img != null) totalHeight += img.height + 8
                }
                // GloriaFood section box (additive): header strip + inner pad in
                // the height budget; boxActiveM narrows the inner lines' wrap.
                "boxStart" -> {
                    val fontSize = item.optInt("fontSize", 12)
                    val headerPaint = textPaint(scaledTextSize(fontSize), true)
                    totalHeight += boxBorder.toInt() + lineHeight(headerPaint) + 8 + boxPadY.toInt()
                    boxActiveM = true
                }
                "boxEnd" -> {
                    totalHeight += boxPadY.toInt() + boxBorder.toInt() + boxGap.toInt()
                    boxActiveM = false
                }
            }
        }
        totalHeight += 16 // bottom margin
        return totalHeight
    }

    private fun renderReceiptBitmap(lines: org.json.JSONArray, widthDots: Int): Bitmap {
        val totalHeight = computeReceiptHeight(lines, widthDots)
        val bitmap = Bitmap.createBitmap(widthDots, maxOf(totalHeight, 50), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        drawReceiptInto(canvas, lines, widthDots)
        return bitmap
    }

    /** Draw the whole receipt onto the given canvas at absolute coordinates
     *  (y starts at 16). The banded path pre-translates the canvas so only the
     *  current band's slice lands on its small bitmap — everything outside is
     *  clipped by the canvas at negligible cost. Drawing logic is the original
     *  loop, verbatim. */
    private fun drawReceiptInto(canvas: Canvas, lines: org.json.JSONArray, widthDots: Int) {
        val defaultLineHeight = lineHeightForFont(12)
        val leftMargin = 8f
        val rightMargin = 8f
        // Section-box geometry (GloriaFood-style boxes). ADDITIVE: with no
        // boxStart/boxEnd lines present, boxActive stays false and every other
        // line renders exactly as before; old app builds skip the two unknown
        // kinds and just print the plain lines. Luigi 2026-06-13.
        val boxPadX = 12f
        val boxPadY = 8f
        val boxBorder = 2f
        val boxGap = 6f

        var y = 16f
        var boxActive = false
        var boxStartY = 0f
        for (i in 0 until lines.length()) {
            val item = lines.optJSONObject(i) ?: continue
            // Content area — inset while inside a section box so text/rules clear
            // the border. Identical to the paper margins when not boxed.
            val cLeft = if (boxActive) leftMargin + boxPadX else leftMargin
            val cRight = if (boxActive) widthDots - rightMargin - boxPadX else widthDots - rightMargin
            val cWidth = cRight - cLeft
            when (item.optString("kind")) {
                "text" -> {
                    val text = item.optString("text", "")
                    val fontSize = item.optInt("fontSize", 12)
                    val bold = item.optBoolean("bold", false)
                    val highlight = item.optBoolean("highlight", false)
                    val align = item.optString("align", "left")
                    val paint = textPaint(scaledTextSize(fontSize), bold)
                    val lh = lineHeight(paint)
                    val wrapped = wrapText(text, paint, cWidth)
                    for (line in wrapped) {
                        if (highlight) {
                            // Black bar spans the content width (full paper when
                            // not boxed; inside the border when boxed).
                            val bg = Paint().apply { color = Color.BLACK }
                            canvas.drawRect(cLeft, y, cRight, y + lh, bg)
                            paint.color = Color.WHITE
                        } else {
                            paint.color = Color.BLACK
                        }
                        val baseline = y + (-paint.ascent())
                        val measured = paint.measureText(line)
                        val x = when (align) {
                            "center" -> cLeft + (cWidth - measured) / 2f
                            "right" -> cRight - measured
                            else -> cLeft
                        }
                        canvas.drawText(line, x, baseline, paint)
                        y += lh
                    }
                }
                "twoCol" -> {
                    val left = item.optString("left", "")
                    val right = item.optString("right", "")
                    val fontSize = item.optInt("fontSize", 12)
                    val bold = item.optBoolean("bold", false)
                    val highlight = item.optBoolean("highlight", false)
                    val paint = textPaint(scaledTextSize(fontSize), bold)
                    val lh = lineHeight(paint)
                    if (highlight) {
                        val bg = Paint().apply { color = Color.BLACK }
                        canvas.drawRect(cLeft, y, cRight, y + lh, bg)
                        paint.color = Color.WHITE
                    }
                    val baseline = y + (-paint.ascent())
                    // Right-side price is the priority — measure it
                    // first then truncate the left side if the two
                    // would collide. Avoids item name overlapping price.
                    val rightWidth = paint.measureText(right)
                    val rightX = cRight - rightWidth
                    val maxLeftWidth = rightX - cLeft - 16f // 16px gap
                    val truncatedLeft = truncateToWidth(left, paint, maxLeftWidth)
                    canvas.drawText(truncatedLeft, cLeft, baseline, paint)
                    canvas.drawText(right, rightX, baseline, paint)
                    y += lh
                }
                "divider" -> {
                    val baseline = y + defaultLineHeight / 2f
                    val dashPaint = Paint().apply {
                        color = Color.BLACK
                        strokeWidth = 2f
                    }
                    var dx = cLeft
                    while (dx < cRight) {
                        canvas.drawLine(dx, baseline, dx + 8f, baseline, dashPaint)
                        dx += 16f
                    }
                    y += defaultLineHeight
                }
                "feed" -> {
                    y += defaultLineHeight * item.optInt("count", 1)
                }
                "cut" -> { /* SDK action */ }
                // Receipt-logo image (additive 2026-06-11): pre-scaled by
                // decodeImageLine; skipped entirely when decoding fails so
                // the logo can never break a print.
                "image" -> {
                    val img = decodeImageLine(item, cWidth)
                    if (img != null) {
                        val x = when (item.optString("align", "center")) {
                            "left" -> cLeft
                            "right" -> cRight - img.width
                            else -> cLeft + (cWidth - img.width) / 2f
                        }
                        canvas.drawBitmap(img, x, y, null)
                        y += img.height + 8
                    }
                }
                // GloriaFood section box (additive). boxStart draws the header
                // strip (inverse only when headerHighlight, else a plain bold
                // header with a separator rule); boxEnd strokes the border around
                // the whole region from boxStartY down to here.
                "boxStart" -> {
                    val header = item.optString("header", "")
                    val hl = item.optBoolean("headerHighlight", false)
                    val fontSize = item.optInt("fontSize", 12)
                    val headerPaint = textPaint(scaledTextSize(fontSize), true)
                    val headerH = lineHeight(headerPaint) + 8
                    val boxLeft = leftMargin
                    val boxRight = widthDots - rightMargin
                    boxStartY = y
                    if (hl) {
                        val bg = Paint().apply { color = Color.BLACK }
                        canvas.drawRect(boxLeft, y, boxRight, y + headerH, bg)
                        headerPaint.color = Color.WHITE
                    } else {
                        headerPaint.color = Color.BLACK
                    }
                    val baseline = y + 4f + (-headerPaint.ascent())
                    canvas.drawText(header, boxLeft + boxPadX, baseline, headerPaint)
                    if (!hl) {
                        val sep = Paint().apply { color = Color.BLACK; strokeWidth = 1.5f }
                        canvas.drawLine(boxLeft, y + headerH, boxRight, y + headerH, sep)
                    }
                    y += headerH + boxPadY
                    boxActive = true
                }
                "boxEnd" -> {
                    y += boxPadY
                    val border = Paint().apply {
                        color = Color.BLACK
                        style = Paint.Style.STROKE
                        strokeWidth = boxBorder
                    }
                    canvas.drawRect(leftMargin, boxStartY, widthDots - rightMargin, y, border)
                    y += boxGap
                    boxActive = false
                }
            }
        }
    }

    /**
     * Decode + scale a {"kind":"image"} receipt line (the server inlines the
     * logo as base64 — the tablet never fetches URLs mid-print). Width is
     * capped at maxWidthDots when provided, else 60% of the drawable width,
     * and never exceeds the paper. Returns null on ANY problem so a corrupt
     * or oversized logo silently skips instead of breaking the print.
     * Additive 2026-06-11 — no existing line kinds are affected.
     */
    private fun decodeImageLine(item: org.json.JSONObject, drawableWidth: Float): Bitmap? {
        return try {
            val b64 = item.optString("dataBase64", "")
            if (b64.isEmpty()) return null
            val bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
            val src = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            val cap = item.optInt("maxWidthDots", 0)
            val maxW = if (cap > 0) minOf(cap.toFloat(), drawableWidth) else drawableWidth * 0.6f
            if (src.width.toFloat() <= maxW) {
                src
            } else {
                val scale = maxW / src.width
                Bitmap.createScaledBitmap(src, maxW.toInt(), (src.height * scale).toInt().coerceAtLeast(1), true)
            }
        } catch (e: Exception) {
            Log.w("StarXpandBridge", "decodeImageLine failed: " + e.message)
            null
        }
    }

    /**
     * Word-wrap text to fit within the given pixel width. Splits on
     * spaces; if a single word exceeds maxWidth (rare on receipts —
     * usually URLs or long order IDs), breaks the word character-by-
     * character so nothing gets clipped off the right edge.
     */
    private fun wrapText(text: String, paint: Paint, maxWidth: Float): List<String> {
        if (text.isEmpty()) return listOf("")
        if (paint.measureText(text) <= maxWidth) return listOf(text)

        val result = mutableListOf<String>()
        // Preserve leading whitespace so indented modifier lines stay
        // indented after wrapping ("  + Extra Cheese, 5 ranches" wraps
        // to two lines, both starting with the indent).
        val indent = text.takeWhile { it == ' ' }
        val body = text.substring(indent.length)

        var current = indent
        for (word in body.split(" ")) {
            val attempt = if (current.length > indent.length) "$current $word" else "$current$word"
            if (paint.measureText(attempt) <= maxWidth) {
                current = attempt
            } else {
                if (current.length > indent.length) {
                    result.add(current)
                    current = indent
                }
                // The word itself doesn't fit — character-split it.
                if (paint.measureText(indent + word) > maxWidth) {
                    var chunk = indent
                    for (ch in word) {
                        val tryAdd = chunk + ch
                        if (paint.measureText(tryAdd) > maxWidth && chunk.length > indent.length) {
                            result.add(chunk)
                            chunk = indent + ch
                        } else {
                            chunk = tryAdd
                        }
                    }
                    current = chunk
                } else {
                    current = indent + word
                }
            }
        }
        if (current.length > indent.length) result.add(current)
        return result.ifEmpty { listOf("") }
    }

    /** Truncate text to fit within maxWidth, appending "..." when cut. */
    private fun truncateToWidth(text: String, paint: Paint, maxWidth: Float): String {
        if (paint.measureText(text) <= maxWidth) return text
        val ellipsis = "..."
        val ellipsisW = paint.measureText(ellipsis)
        var cut = text
        while (cut.isNotEmpty() && paint.measureText(cut) + ellipsisW > maxWidth) {
            cut = cut.dropLast(1)
        }
        return cut + ellipsis
    }

    /**
     * Map a template `fontSize` (px from the HTML preview) to a
     * thermal-printer text size (Android Canvas units). Empirically
     * tuned so 12px ≈ baseline 28px on the bitmap which prints at a
     * comfortable receipt-text size on TSP143IIIW at 576 dots/80mm.
     */
    private fun scaledTextSize(templatePx: Int): Float {
        val baseline = 28f
        // Scale linearly, clamping to a sane range so a runaway value
        // in the template can't blow up the bitmap height.
        return (baseline * (templatePx / 12f)).coerceIn(18f, 96f)
    }

    private fun lineHeightForFont(templatePx: Int): Int {
        val tmp = textPaint(scaledTextSize(templatePx), false)
        return lineHeight(tmp)
    }

    private fun textPaint(size: Float, bold: Boolean): Paint {
        return Paint().apply {
            color = Color.BLACK
            textSize = size
            typeface = if (bold)
                Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            else
                Typeface.MONOSPACE
            isAntiAlias = false
        }
    }

    private fun lineHeight(paint: Paint): Int {
        return (paint.descent() - paint.ascent()).toInt() + 4
    }

    // Connection-phase timeouts. The OLD code wrapped open+print in ONE timeout
    // and had NO timeout on close — so a hung close froze the whole call
    // ("spinner forever") and left the printer's single LAN session half-open,
    // which broke EVERY following print until a restart (the cascade). Each
    // phase is now bounded independently; close ALWAYS runs with its own cap so
    // the session is always released; and a failed attempt is retried once on a
    // fresh connection. Luigi 2026-06-16.
    private const val OPEN_TIMEOUT_MS = 10_000L
    private const val CLOSE_TIMEOUT_MS = 6_000L
    private const val RETRY_DELAY_MS = 1_200L

    // Banded-print thresholds (Luigi 2026-07-25 — the 12-pizza-combo OOM).
    // ≤ SINGLE_RENDER: the original one-bitmap path, unchanged (covers every
    // normal receipt; 576×4000 ARGB ≈ 9 MB, proven fine in production).
    // Above it: bands of BAND_HEIGHT (576×2400 ARGB ≈ 5.5 MB peak, constant).
    // MAX_RECEIPT: hard sanity cap (~5 m of paper) against runaway templates.
    private const val SINGLE_RENDER_MAX_HEIGHT_PX = 4_000
    private const val BAND_HEIGHT_PX = 2_400
    private const val MAX_RECEIPT_HEIGHT_PX = 60_000

    private inline fun runPrint(
        context: Context,
        ip: String,
        timeoutMs: Long,
        configure: (PrinterBuilder) -> PrinterBuilder
    ): String {
        val commands = try {
            val printerBuilder = PrinterBuilder()
            configure(printerBuilder)
            val docBuilder = DocumentBuilder().addPrinter(printerBuilder)
            StarXpandCommandBuilder().addDocument(docBuilder).getCommands()
        } catch (e: Throwable) {
            Log.w(TAG, "StarXpand: command build failed: ${e.message}", e)
            return "BuildError: ${e.message}"
        }
        Log.i(TAG, "StarXpand: commands len=${commands.length}; printing to $ip")
        var lastErr = "unknown"
        for (attempt in 1..2) {
            val res = sendOnce(context, ip, commands, timeoutMs)
            if (res == "ok") {
                if (attempt > 1) Log.i(TAG, "StarXpand: succeeded on retry (attempt $attempt)")
                return "ok"
            }
            lastErr = res
            Log.w(TAG, "StarXpand: attempt $attempt failed: $res")
            if (attempt < 2) {
                // Let the printer fully release its single LAN session before retrying.
                try { Thread.sleep(RETRY_DELAY_MS) } catch (ignore: InterruptedException) {}
            }
        }
        return lastErr
    }

    /** One open -> print -> close cycle with INDEPENDENT bounded timeouts and a
     *  guaranteed close, so it can never hang the call and always frees the
     *  printer's session for the next job. */
    private fun sendOnce(context: Context, ip: String, commands: String, printTimeoutMs: Long): String {
        val settings = StarConnectionSettings(InterfaceType.Lan, ip)
        val printer = StarPrinter(settings, context)
        var result: String
        try {
            runBlocking {
                withTimeout(OPEN_TIMEOUT_MS) { printer.openAsync().await() }
                Log.i(TAG, "StarXpand: printer opened; sending print")
                withTimeout(printTimeoutMs) { printer.printAsync(commands).await() }
                Log.i(TAG, "StarXpand: print returned SUCCESS")
            }
            result = "ok"
        } catch (e: Throwable) {
            Log.w(TAG, "StarXpand send failed: ${e.javaClass.simpleName}: ${e.message}")
            result = "${e.javaClass.simpleName}: ${e.message}"
        } finally {
            // ALWAYS close, with its OWN timeout, so a stuck close can't freeze
            // the call and the printer session is always released for the next job.
            try {
                runBlocking { withTimeout(CLOSE_TIMEOUT_MS) { printer.closeAsync().await() } }
            } catch (ignore: Throwable) {
                Log.w(TAG, "StarXpand: close failed/timed out (continuing): ${ignore.message}")
            }
        }
        return result
    }
}
