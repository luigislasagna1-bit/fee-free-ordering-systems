import Foundation
import UIKit
import StarIO10

/**
 * StarXpandBridge — iOS counterpart to the Android `StarXpandBridge.kt`.
 *
 * FAITHFUL PORT of the GOLDEN Android print path (verified 2026-05-24).
 * Keep the two in sync: if the Android receipt rendering changes, mirror
 * it here. Star designed the Android + iOS StarXpand (StarIO10) APIs to
 * mirror each other, so most calls map 1:1.
 *
 * ── HOW IT PRINTS ─────────────────────────────────────────────────────
 * The web app sends `lines` — a JSON array of styled receipt rows (text,
 * twoCol, divider, feed, cut, image, boxStart/boxEnd). We rasterize the
 * whole thing to ONE UIImage (`renderReceiptImage`) and send it via
 * `actionPrintImage`. Bitmap output is mode-independent — it prints
 * regardless of the printer's emulation, which is the ONLY path that
 * worked reliably on the TSP143IIIW (text actions were silently dropped).
 *
 * ── PIXELS, NOT POINTS ────────────────────────────────────────────────
 * Thermal printing needs 1 image pixel = 1 printer dot. UIGraphicsImage-
 * Renderer defaults to the device's @2x/@3x scale, which would inflate
 * the pixel count. Every renderer here forces `format.scale = 1` so a
 * 576-dot image is exactly 576 px wide.
 *
 * NOTE(build): this is a first-draft port written off-Mac. The StarIO10
 * Swift symbol names (ImageParameter, CutType.partial, print(command:))
 * are verified against Star's SDK at compile time in Xcode — expect a
 * few small fix-ups on the first build. The rendering LOGIC mirrors the
 * proven Kotlin exactly.
 */
enum StarXpandBridge {

    private static let TAG = "DirectPrinter"

    // MARK: - Public entry points

    /// Hardcoded diagnostic print. Returns "ok" or a short error string.
    static func testPrint(ip: String, timeoutMs: Int) async -> String {
        let text = """

        *** STARXPAND TEST (iOS) ***

        If you can read this text,
        the bitmap path WORKS.

        \(Date())

        """
        let image = renderTextImage(text, widthDots: 576)
        return await runPrint(ip: ip, timeoutMs: timeoutMs) { builder in
            _ = builder.actionPrintImage(StarXpandCommand.Printer.ImageParameter(image: image, width: 576))
            _ = builder.actionFeedLine(5)
            _ = builder.actionCut(StarXpandCommand.Printer.CutType.partial)
        }
    }

    /// Print a structured receipt (JSON array of lines) rendered to a
    /// bitmap. `widthDots`: 576 for 80mm paper, 384 for 58mm. The
    /// production path for real orders. Returns "ok" or an error string.
    static func printLines(ip: String, linesJson: String, widthDots: Int, timeoutMs: Int) async -> String {
        guard let data = linesJson.data(using: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: data),
              let lines = parsed as? [[String: Any]] else {
            return "JSONParseError"
        }

        let image = renderReceiptImage(lines, widthDots: widthDots)

        // Trailing feed + cut become SDK actions instead of bitmap pixels
        // (same scan as the Android side).
        var shouldCut = false
        var trailingFeed = 0
        for (i, item) in lines.enumerated() {
            switch item["kind"] as? String {
            case "cut":
                shouldCut = true
            case "feed":
                let isLast = (i == lines.count - 1)
                let isSecondLastBeforeCut = (i == lines.count - 2) &&
                    ((lines[i + 1]["kind"] as? String) == "cut")
                if isLast || isSecondLastBeforeCut {
                    trailingFeed += (item["count"] as? Int) ?? 1
                }
            default:
                break
            }
        }

        return await runPrint(ip: ip, timeoutMs: timeoutMs) { builder in
            _ = builder.actionPrintImage(StarXpandCommand.Printer.ImageParameter(image: image, width: widthDots))
            _ = builder.actionFeedLine(max(trailingFeed, 5))
            if shouldCut {
                _ = builder.actionCut(StarXpandCommand.Printer.CutType.partial)
            }
        }
    }

    // MARK: - Bitmap rendering (mirror of renderReceiptBitmap / renderTextBitmap)

    /// Simple monospace text → image. Used by the diagnostic test print.
    private static func renderTextImage(_ text: String, widthDots: Int) -> UIImage {
        let f = font(size: 28, bold: false)
        let lines = text.components(separatedBy: "\n")
        let lh = lineHeight(f)
        let height = max(lh * lines.count + 20, 100)
        return image(width: widthDots, height: height) { _ in
            var y = CGFloat(10)
            let attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: UIColor.black]
            for line in lines {
                (line as NSString).draw(at: CGPoint(x: 8, y: y), withAttributes: attrs)
                y += CGFloat(lh)
            }
        }
    }

    /// Render structured receipt lines to a single image. Each line
    /// carries its own style (fontSize, bold, align, highlight). This is
    /// a direct port of the Kotlin `renderReceiptBitmap` — two passes:
    /// (1) measure total height with word-wrap, (2) draw.
    private static func renderReceiptImage(_ lines: [[String: Any]], widthDots: Int) -> UIImage {
        let defaultLineHeight = lineHeightForFont(12)
        let leftMargin: CGFloat = 8
        let rightMargin: CGFloat = 8
        let drawableWidth = CGFloat(widthDots) - leftMargin - rightMargin
        // Section-box geometry (GloriaFood-style). Additive: with no
        // boxStart/boxEnd present, boxActive stays false and lines render
        // exactly as before.
        let boxPadX: CGFloat = 12
        let boxPadY: CGFloat = 8
        let boxBorder: CGFloat = 2
        let boxGap: CGFloat = 6

        // ── Pass 1: total height ──────────────────────────────────────
        var totalHeight = 16 // top margin
        var boxActiveM = false
        for item in lines {
            let innerWidth = boxActiveM ? drawableWidth - 2 * boxPadX : drawableWidth
            switch item["kind"] as? String {
            case "text":
                let fontSize = (item["fontSize"] as? Int) ?? 12
                let bold = (item["bold"] as? Bool) ?? false
                let text = (item["text"] as? String) ?? ""
                let f = font(size: scaledTextSize(fontSize), bold: bold)
                let wrapped = wrapText(text, font: f, maxWidth: innerWidth)
                totalHeight += lineHeight(f) * max(wrapped.count, 1)
            case "twoCol":
                let fontSize = (item["fontSize"] as? Int) ?? 12
                totalHeight += lineHeightForFont(fontSize)
            case "divider":
                totalHeight += defaultLineHeight
            case "feed":
                totalHeight += defaultLineHeight * ((item["count"] as? Int) ?? 1)
            case "cut":
                break // SDK action, no bitmap height
            case "image":
                if let img = decodeImage(item, drawableWidth: innerWidth) {
                    totalHeight += Int(img.size.height) + 8
                }
            case "boxStart":
                let fontSize = (item["fontSize"] as? Int) ?? 12
                let headerFont = font(size: scaledTextSize(fontSize), bold: true)
                totalHeight += Int(boxBorder) + lineHeight(headerFont) + 8 + Int(boxPadY)
                boxActiveM = true
            case "boxEnd":
                totalHeight += Int(boxPadY) + Int(boxBorder) + Int(boxGap)
                boxActiveM = false
            default:
                break
            }
        }
        totalHeight += 16 // bottom margin

        // ── Pass 2: draw ──────────────────────────────────────────────
        return image(width: widthDots, height: max(totalHeight, 50)) { ctx in
            var y: CGFloat = 16
            var boxActive = false
            var boxStartY: CGFloat = 0
            for item in lines {
                let cLeft = boxActive ? leftMargin + boxPadX : leftMargin
                let cRight = boxActive ? CGFloat(widthDots) - rightMargin - boxPadX : CGFloat(widthDots) - rightMargin
                let cWidth = cRight - cLeft
                switch item["kind"] as? String {
                case "text":
                    let text = (item["text"] as? String) ?? ""
                    let fontSize = (item["fontSize"] as? Int) ?? 12
                    let bold = (item["bold"] as? Bool) ?? false
                    let highlight = (item["highlight"] as? Bool) ?? false
                    let align = (item["align"] as? String) ?? "left"
                    let f = font(size: scaledTextSize(fontSize), bold: bold)
                    let lh = CGFloat(lineHeight(f))
                    for line in wrapText(text, font: f, maxWidth: cWidth) {
                        var color = UIColor.black
                        if highlight {
                            ctx.cgContext.setFillColor(UIColor.black.cgColor)
                            ctx.cgContext.fill(CGRect(x: cLeft, y: y, width: cRight - cLeft, height: lh))
                            color = UIColor.white
                        }
                        let measured = measure(line, font: f)
                        let x: CGFloat
                        switch align {
                        case "center": x = cLeft + (cWidth - measured) / 2
                        case "right": x = cRight - measured
                        default: x = cLeft
                        }
                        (line as NSString).draw(at: CGPoint(x: x, y: y),
                            withAttributes: [.font: f, .foregroundColor: color])
                        y += lh
                    }
                case "twoCol":
                    let left = (item["left"] as? String) ?? ""
                    let right = (item["right"] as? String) ?? ""
                    let fontSize = (item["fontSize"] as? Int) ?? 12
                    let bold = (item["bold"] as? Bool) ?? false
                    let highlight = (item["highlight"] as? Bool) ?? false
                    let f = font(size: scaledTextSize(fontSize), bold: bold)
                    let lh = CGFloat(lineHeight(f))
                    var color = UIColor.black
                    if highlight {
                        ctx.cgContext.setFillColor(UIColor.black.cgColor)
                        ctx.cgContext.fill(CGRect(x: cLeft, y: y, width: cRight - cLeft, height: lh))
                        color = UIColor.white
                    }
                    // Right-side value is priority — measure it, then
                    // truncate the left so they never overlap.
                    let rightWidth = measure(right, font: f)
                    let rightX = cRight - rightWidth
                    let maxLeftWidth = rightX - cLeft - 16
                    let truncatedLeft = truncateToWidth(left, font: f, maxWidth: maxLeftWidth)
                    let attrs: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: color]
                    (truncatedLeft as NSString).draw(at: CGPoint(x: cLeft, y: y), withAttributes: attrs)
                    (right as NSString).draw(at: CGPoint(x: rightX, y: y), withAttributes: attrs)
                    y += lh
                case "divider":
                    let midY = y + CGFloat(defaultLineHeight) / 2
                    ctx.cgContext.setStrokeColor(UIColor.black.cgColor)
                    ctx.cgContext.setLineWidth(2)
                    var dx = cLeft
                    while dx < cRight {
                        ctx.cgContext.move(to: CGPoint(x: dx, y: midY))
                        ctx.cgContext.addLine(to: CGPoint(x: dx + 8, y: midY))
                        dx += 16
                    }
                    ctx.cgContext.strokePath()
                    y += CGFloat(defaultLineHeight)
                case "feed":
                    y += CGFloat(defaultLineHeight * ((item["count"] as? Int) ?? 1))
                case "cut":
                    break
                case "image":
                    if let img = decodeImage(item, drawableWidth: cWidth) {
                        let x: CGFloat
                        switch (item["align"] as? String) ?? "center" {
                        case "left": x = cLeft
                        case "right": x = cRight - img.size.width
                        default: x = cLeft + (cWidth - img.size.width) / 2
                        }
                        img.draw(in: CGRect(x: x, y: y, width: img.size.width, height: img.size.height))
                        y += img.size.height + 8
                    }
                case "boxStart":
                    let header = (item["header"] as? String) ?? ""
                    let hl = (item["headerHighlight"] as? Bool) ?? false
                    let fontSize = (item["fontSize"] as? Int) ?? 12
                    let headerFont = font(size: scaledTextSize(fontSize), bold: true)
                    let headerH = CGFloat(lineHeight(headerFont)) + 8
                    let boxLeft = leftMargin
                    let boxRight = CGFloat(widthDots) - rightMargin
                    boxStartY = y
                    var headerColor = UIColor.black
                    if hl {
                        ctx.cgContext.setFillColor(UIColor.black.cgColor)
                        ctx.cgContext.fill(CGRect(x: boxLeft, y: y, width: boxRight - boxLeft, height: headerH))
                        headerColor = UIColor.white
                    }
                    (header as NSString).draw(at: CGPoint(x: boxLeft + boxPadX, y: y + 4),
                        withAttributes: [.font: headerFont, .foregroundColor: headerColor])
                    if !hl {
                        ctx.cgContext.setStrokeColor(UIColor.black.cgColor)
                        ctx.cgContext.setLineWidth(1.5)
                        ctx.cgContext.move(to: CGPoint(x: boxLeft, y: y + headerH))
                        ctx.cgContext.addLine(to: CGPoint(x: boxRight, y: y + headerH))
                        ctx.cgContext.strokePath()
                    }
                    y += headerH + boxPadY
                    boxActive = true
                case "boxEnd":
                    y += boxPadY
                    ctx.cgContext.setStrokeColor(UIColor.black.cgColor)
                    ctx.cgContext.setLineWidth(boxBorder)
                    ctx.cgContext.stroke(CGRect(x: leftMargin, y: boxStartY,
                        width: CGFloat(widthDots) - rightMargin - leftMargin, height: y - boxStartY))
                    y += boxGap
                    boxActive = false
                default:
                    break
                }
            }
        }
    }

    /// Decode + scale a {"kind":"image"} line (server inlines the logo as
    /// base64). Returns nil on ANY problem so a bad logo silently skips.
    private static func decodeImage(_ item: [String: Any], drawableWidth: CGFloat) -> UIImage? {
        guard let b64 = item["dataBase64"] as? String, !b64.isEmpty,
              let data = Data(base64Encoded: b64),
              let src = UIImage(data: data) else { return nil }
        let cap = (item["maxWidthDots"] as? Int) ?? 0
        let maxW = cap > 0 ? min(CGFloat(cap), drawableWidth) : drawableWidth * 0.6
        if src.size.width <= maxW { return src }
        let scale = maxW / src.size.width
        let newSize = CGSize(width: maxW, height: max(src.size.height * scale, 1))
        return image(width: Int(newSize.width), height: Int(newSize.height)) { _ in
            src.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    // MARK: - Text helpers (mirror of wrapText / truncateToWidth / paint)

    /// Word-wrap to fit `maxWidth`px. Splits on spaces; character-splits a
    /// single word that's too long. Preserves leading indent (modifiers).
    private static func wrapText(_ text: String, font f: UIFont, maxWidth: CGFloat) -> [String] {
        if text.isEmpty { return [""] }
        if measure(text, font: f) <= maxWidth { return [text] }

        var result: [String] = []
        let indent = String(text.prefix { $0 == " " })
        let body = String(text.dropFirst(indent.count))

        var current = indent
        for word in body.split(separator: " ", omittingEmptySubsequences: false).map(String.init) {
            let attempt = current.count > indent.count ? "\(current) \(word)" : "\(current)\(word)"
            if measure(attempt, font: f) <= maxWidth {
                current = attempt
            } else {
                if current.count > indent.count {
                    result.append(current)
                    current = indent
                }
                if measure(indent + word, font: f) > maxWidth {
                    var chunk = indent
                    for ch in word {
                        let tryAdd = chunk + String(ch)
                        if measure(tryAdd, font: f) > maxWidth && chunk.count > indent.count {
                            result.append(chunk)
                            chunk = indent + String(ch)
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
        if current.count > indent.count { result.append(current) }
        return result.isEmpty ? [""] : result
    }

    private static func truncateToWidth(_ text: String, font f: UIFont, maxWidth: CGFloat) -> String {
        if measure(text, font: f) <= maxWidth { return text }
        let ellipsis = "..."
        let ellipsisW = measure(ellipsis, font: f)
        var cut = text
        while !cut.isEmpty && measure(cut, font: f) + ellipsisW > maxWidth {
            cut = String(cut.dropLast())
        }
        return cut + ellipsis
    }

    /// Map a template `fontSize` (px) to a printer text size. 12px ≈ 28pt
    /// baseline, clamped — matches the Android tuning for the TSP143IIIW.
    private static func scaledTextSize(_ templatePx: Int) -> CGFloat {
        let baseline: CGFloat = 28
        return min(max(baseline * (CGFloat(templatePx) / 12), 18), 96)
    }

    private static func lineHeightForFont(_ templatePx: Int) -> Int {
        return lineHeight(font(size: scaledTextSize(templatePx), bold: false))
    }

    private static func font(size: CGFloat, bold: Bool) -> UIFont {
        return UIFont.monospacedSystemFont(ofSize: size, weight: bold ? .bold : .regular)
    }

    /// Mirror of Android's (descent - ascent) + 4. iOS descender is
    /// negative, so (ascender - descender) is the full glyph height.
    private static func lineHeight(_ f: UIFont) -> Int {
        return Int(ceil(f.ascender - f.descender)) + 4
    }

    private static func measure(_ text: String, font f: UIFont) -> CGFloat {
        return (text as NSString).size(withAttributes: [.font: f]).width
    }

    /// Renderer forced to scale=1 so image pixels == printer dots.
    private static func image(width: Int, height: Int, _ draw: (UIGraphicsImageRendererContext) -> Void) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: width, height: height), format: format)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
            draw(ctx)
        }
    }

    // MARK: - Star connection (mirror of runPrint)

    /// Open the Star printer over LAN, send the configured document, close.
    /// `configure` adds actions (image/feed/cut) to the PrinterBuilder.
    /// Returns "ok" or "<ErrorType>: <message>".
    private static func runPrint(
        ip: String,
        timeoutMs: Int,
        configure: (StarXpandCommand.PrinterBuilder) -> Void
    ) async -> String {
        let settings = StarConnectionSettings(interfaceType: .lan, identifier: ip)
        let printer = StarPrinter(settings)
        defer {
            Task { await printer.close() }
        }
        do {
            let printerBuilder = StarXpandCommand.PrinterBuilder()
            configure(printerBuilder)
            let docBuilder = StarXpandCommand.DocumentBuilder().addPrinter(printerBuilder)
            let commands = StarXpandCommand.StarXpandCommandBuilder()
                .addDocument(docBuilder)
                .getCommands()
            try await withTimeout(ms: timeoutMs) {
                try await printer.open()
                try await printer.print(command: commands)
            }
            return "ok"
        } catch {
            return "\(type(of: error)): \(error.localizedDescription)"
        }
    }

    private struct TimeoutError: Error {}

    /// Race the operation against a sleep — throws TimeoutError if the
    /// operation doesn't finish in time. Mirrors Kotlin `withTimeout`.
    private static func withTimeout(ms: Int, _ op: @escaping () async throws -> Void) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { try await op() }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(ms) * 1_000_000)
                throw TimeoutError()
            }
            try await group.next()
            group.cancelAll()
        }
    }
}
