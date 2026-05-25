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
     * everything to a single bitmap (with bold/double-size/alignment
     * styling preserved) and send via actionPrintImage. This is the
     * production print path for real orders.
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
        // Build the bitmap from structured lines BEFORE opening the
        // printer, so any rendering failure is reported cleanly without
        // tying up the printer connection.
        val bitmap = renderReceiptBitmap(lines, widthDots)
        // Some lines (e.g., {"kind":"cut"}) become SDK actions instead
        // of being drawn on the bitmap. Scan for those after rendering.
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
    private fun renderReceiptBitmap(lines: org.json.JSONArray, widthDots: Int): Bitmap {
        val defaultLineHeight = lineHeightForFont(12)

        // Pre-compute total height by walking lines with the same
        // metrics we'll use for drawing. Avoids a second allocation.
        var totalHeight = 16 // top margin
        for (i in 0 until lines.length()) {
            val item = lines.optJSONObject(i) ?: continue
            when (item.optString("kind")) {
                "text", "twoCol" -> {
                    val fontSize = item.optInt("fontSize", 12)
                    totalHeight += lineHeightForFont(fontSize)
                }
                "divider" -> totalHeight += defaultLineHeight
                "feed" -> totalHeight += defaultLineHeight * item.optInt("count", 1)
                "cut" -> { /* SDK action, no bitmap height */ }
            }
        }
        totalHeight += 16 // bottom margin

        val bitmap = Bitmap.createBitmap(widthDots, maxOf(totalHeight, 50), Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)

        var y = 16f
        for (i in 0 until lines.length()) {
            val item = lines.optJSONObject(i) ?: continue
            when (item.optString("kind")) {
                "text" -> {
                    val text = item.optString("text", "")
                    val fontSize = item.optInt("fontSize", 12)
                    val bold = item.optBoolean("bold", false)
                    val highlight = item.optBoolean("highlight", false)
                    val align = item.optString("align", "left")
                    val paint = textPaint(scaledTextSize(fontSize), bold)
                    val lh = lineHeight(paint)
                    if (highlight) {
                        // Black bar across full width; white text on top.
                        val bg = Paint().apply { color = Color.BLACK }
                        canvas.drawRect(0f, y, widthDots.toFloat(), y + lh, bg)
                        paint.color = Color.WHITE
                    }
                    val baseline = y + (-paint.ascent())
                    val x = when (align) {
                        "center" -> (widthDots - paint.measureText(text)) / 2f
                        "right" -> widthDots - paint.measureText(text) - 8f
                        else -> 8f
                    }
                    canvas.drawText(text, x, baseline, paint)
                    y += lh
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
                        canvas.drawRect(0f, y, widthDots.toFloat(), y + lh, bg)
                        paint.color = Color.WHITE
                    }
                    val baseline = y + (-paint.ascent())
                    canvas.drawText(left, 8f, baseline, paint)
                    val rightX = widthDots - paint.measureText(right) - 8f
                    canvas.drawText(right, rightX, baseline, paint)
                    y += lh
                }
                "divider" -> {
                    val baseline = y + defaultLineHeight / 2f
                    val dashPaint = Paint().apply {
                        color = Color.BLACK
                        strokeWidth = 2f
                    }
                    var dx = 8f
                    while (dx < widthDots - 8f) {
                        canvas.drawLine(dx, baseline, dx + 8f, baseline, dashPaint)
                        dx += 16f
                    }
                    y += defaultLineHeight
                }
                "feed" -> {
                    y += defaultLineHeight * item.optInt("count", 1)
                }
                "cut" -> { /* SDK action */ }
            }
        }
        return bitmap
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

    private inline fun runPrint(
        context: Context,
        ip: String,
        timeoutMs: Long,
        configure: (PrinterBuilder) -> PrinterBuilder
    ): String {
        val settings = StarConnectionSettings(InterfaceType.Lan, ip)
        val printer = StarPrinter(settings, context)
        return try {
            val printerBuilder = PrinterBuilder()
            configure(printerBuilder)
            val docBuilder = DocumentBuilder().addPrinter(printerBuilder)
            val commands = StarXpandCommandBuilder().addDocument(docBuilder).getCommands()
            Log.i(TAG, "StarXpand: commands len=${commands.length}; opening printer at $ip")
            runBlocking {
                withTimeout(timeoutMs) {
                    printer.openAsync().await()
                    Log.i(TAG, "StarXpand: printer opened; sending print")
                    printer.printAsync(commands).await()
                    Log.i(TAG, "StarXpand: print returned SUCCESS")
                }
            }
            "ok"
        } catch (e: Throwable) {
            Log.w(TAG, "StarXpand failed: ${e.javaClass.simpleName}: ${e.message}", e)
            "${e.javaClass.simpleName}: ${e.message}"
        } finally {
            try {
                runBlocking { printer.closeAsync().await() }
            } catch (ignore: Throwable) { }
        }
    }
}
