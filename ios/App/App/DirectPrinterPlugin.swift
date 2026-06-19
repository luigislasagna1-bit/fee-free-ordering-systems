import Foundation
import Capacitor
import Network
import UIKit
import StarIO10

// Star's StarXpand SDK (StarIO10) is integrated below for the same
// "Star printers just work" behavior the Android plugin has. Star
// TSP-series printers (TSP143IIIW + family) silently DISCARD raw
// ESC/POS sent over port 9100, so for a real order (structured
// `lines`) we render the receipt to a bitmap and print it via
// StarXpand's image path — a direct mirror of StarXpandBridge.kt on
// Android. Non-Star printers (Epson / Bixolon / Citizen) still use the
// raw-TCP ESC/POS path (connectAndSend) further down. SPM dependency
// (added to App.xcodeproj, NOT CapApp-SPM/Package.swift which
// `npx cap sync` regenerates): https://github.com/star-micronics/StarXpand-SDK-iOS

/**
 * DirectPrinter — iOS counterpart to the Android plugin.
 *
 * Same JS surface, same semantics, same reject-reason codes. The
 * kitchen web app calls `Capacitor.Plugins.DirectPrinter.print(...)`
 * without caring which OS it's running on; this file is what makes
 * that work on iPad/iPhone.
 *
 * ── PROTOCOL ──────────────────────────────────────────────────────
 * Opens a raw TCP socket to the printer at <ip>:<port> using Apple's
 * Network.framework (NWConnection). Writes the supplied bytes, waits
 * for the send to complete, closes the socket, resolves. Same wire
 * protocol the Android side uses — RAW print on port 9100, accepts
 * ESC/POS commands.
 *
 * ── WHY Network.framework AND NOT POSIX SOCKETS ───────────────────
 * - Cleaner async/error model — Apple-recommended since iOS 12
 * - Honors iOS's network reachability constraints automatically
 *   (Wi-Fi vs cellular, VPN, etc.)
 * - Plays nicely with App Transport Security exemptions (we don't
 *   need ATS exemptions for raw TCP — ATS only governs HTTPS) but
 *   Network.framework integrates with the system's connection
 *   monitoring without us having to roll our own
 * - Cancellable: the timeout path can cleanly cancel the in-flight
 *   connection without leaking file descriptors
 *
 * ── LOCAL NETWORK PERMISSION (iOS 14+) ────────────────────────────
 * Talking to a LAN device (printer at 192.168.x.x) triggers Apple's
 * "Local Network" permission prompt on first attempt. We document
 * the NSLocalNetworkUsageDescription Info.plist key alongside this
 * file in /docs/native-app-build.md so the App Store reviewer knows
 * why we ask for it.
 */
@objc(DirectPrinterPlugin)
public class DirectPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DirectPrinterPlugin"
    public let jsName = "DirectPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discover", returnType: CAPPluginReturnPromise),
    ]

    private static let DEFAULT_PORT: UInt16 = 9100
    private static let DEFAULT_TIMEOUT_MS: Int = 5000
    private let printerQueue = DispatchQueue(label: "com.feefreeordering.directprinter")

    /// Search the local network for receipt printers via mDNS / Bonjour
    /// using Network.framework's NWBrowser. Same return shape as the
    /// Android plugin: { printers: [{name, ip, port, type}, ...] }.
    ///
    /// We browse _pdl-datastream._tcp (the raw port-9100 service that
    /// Star/Epson/etc advertise). _ipp._tcp and _printer._tcp could be
    /// added too but the JSON declared in Info.plist already includes
    /// all three; in practice 95% of receipt printers advertise on
    /// _pdl-datastream so we keep the scan focused.
    ///
    /// iOS requires NSLocalNetworkUsageDescription + NSBonjourServices
    /// in Info.plist — both already declared.
    @objc func discover(_ call: CAPPluginCall) {
        let durationMs = call.getInt("durationMs") ?? 6000
        let clampedMs = max(2000, min(15000, durationMs))

        // Shared accumulator (de-duped by IP) used by both mDNS and
        // subnet scan. mDNS alone misses printers that don't advertise
        // (or advertise on uncommon service types) — Star TSP143IIIW
        // is a known offender. Subnet scan picks up any device that
        // accepts a TCP connection on port 9100 = print server.
        var byIp: [String: [String: Any]] = [:]
        let lock = NSLock()
        var didComplete = false

        let serviceTypes = [
            "_pdl-datastream._tcp", // RAW print (Star, Epson, Bixolon)
            "_ipp._tcp",             // IPP (most modern printers)
            "_ipps._tcp",            // Secure IPP
            "_printer._tcp",         // LPR/LPD
            "_lpd._tcp",             // Some Star advertise on this
        ]
        var browsers: [NWBrowser] = []

        let finish = {
            lock.lock()
            if didComplete {
                lock.unlock()
                return
            }
            didComplete = true
            for b in browsers { b.cancel() }
            let printers = Array(byIp.values)
            lock.unlock()
            call.resolve([
                "ok": true,
                "printers": printers,
            ])
        }

        // Start all mDNS browsers in parallel.
        for type in serviceTypes {
            let descriptor = NWBrowser.Descriptor.bonjour(type: type, domain: nil)
            let browser = NWBrowser(for: descriptor, using: .tcp)
            browser.browseResultsChangedHandler = { results, _ in
                for result in results {
                    if case let .service(name, _, _, _) = result.endpoint {
                        let conn = NWConnection(to: result.endpoint, using: .tcp)
                        conn.stateUpdateHandler = { state in
                            if case .ready = state {
                                if let remote = conn.currentPath?.remoteEndpoint,
                                   case let .hostPort(host, _) = remote {
                                    let ip: String
                                    switch host {
                                    case .ipv4(let addr): ip = "\(addr)"
                                    case .ipv6(let addr): ip = "\(addr)"
                                    case .name(let n, _): ip = n
                                    @unknown default: ip = ""
                                    }
                                    if !ip.isEmpty {
                                        lock.lock()
                                        // mDNS name overwrites subnet-scan
                                        // placeholder because it's friendlier
                                        byIp[ip] = [
                                            "name": name,
                                            "ip": ip,
                                            "port": 9100,
                                            "type": type,
                                        ]
                                        lock.unlock()
                                    }
                                }
                                conn.cancel()
                            } else if case .failed = state {
                                conn.cancel()
                            }
                        }
                        conn.start(queue: self.printerQueue)
                    }
                }
            }
            browsers.append(browser)
            browser.start(queue: printerQueue)
        }

        // Kick off subnet scan in parallel with mDNS — same accumulator,
        // de-duped by IP. Most printers will be found by both methods;
        // the merge is harmless.
        DispatchQueue.global(qos: .userInitiated).async {
            self.subnetScan(byIp: &byIp, lock: lock, timeoutMs: 400)
        }

        // Time-box the whole discovery.
        printerQueue.asyncAfter(deadline: .now() + .milliseconds(clampedMs)) {
            finish()
        }
    }

    /// Subnet scan — probe every IP in the device's local /24 subnet
    /// for port 9100 responders. Parallel via DispatchGroup. ~3 seconds
    /// for a typical /24 with concurrent connections.
    ///
    /// IMPORTANT: byIp is passed inout but accessed under `lock`. Swift
    /// inout doesn't synchronize — the lock does.
    private func subnetScan(byIp: inout [String: [String: Any]], lock: NSLock, timeoutMs: Int) {
        // Get the device's IPv4 address on the active Wi-Fi interface
        // via getifaddrs. Network.framework doesn't expose the local
        // IP directly so we use the BSD socket helpers.
        guard let localIp = getLocalIPv4() else { return }
        let parts = localIp.split(separator: ".")
        guard parts.count == 4 else { return }
        let prefix = "\(parts[0]).\(parts[1]).\(parts[2])."

        let group = DispatchGroup()
        let scanQueue = DispatchQueue(label: "ffo.subnet-scan", attributes: .concurrent)
        let semaphore = DispatchSemaphore(value: 32) // cap concurrent connects

        for i in 1...254 {
            let target = "\(prefix)\(i)"
            group.enter()
            scanQueue.async {
                semaphore.wait()
                defer {
                    semaphore.signal()
                    group.leave()
                }
                if self.tcpProbe(host: target, port: 9100, timeoutMs: timeoutMs) {
                    lock.lock()
                    if byIp[target] == nil {
                        byIp[target] = [
                            "name": "Printer at \(target)",
                            "ip": target,
                            "port": 9100,
                            "type": "subnet-scan",
                        ]
                    }
                    lock.unlock()
                }
            }
        }
        group.wait()
    }

    /// Synchronous TCP probe — returns true if the target accepts a
    /// connection on the given port within the timeout. Uses
    /// CFSocket-style POSIX since Network.framework's API is
    /// callback-only and we want to wait inline.
    private func tcpProbe(host: String, port: UInt16, timeoutMs: Int) -> Bool {
        var hints = addrinfo(
            ai_flags: AI_NUMERICHOST,
            ai_family: AF_INET,
            ai_socktype: SOCK_STREAM,
            ai_protocol: IPPROTO_TCP,
            ai_addrlen: 0,
            ai_canonname: nil,
            ai_addr: nil,
            ai_next: nil
        )
        var res: UnsafeMutablePointer<addrinfo>? = nil
        let portStr = "\(port)"
        guard getaddrinfo(host, portStr, &hints, &res) == 0, let info = res else { return false }
        defer { freeaddrinfo(res) }

        let sock = socket(info.pointee.ai_family, info.pointee.ai_socktype, info.pointee.ai_protocol)
        if sock < 0 { return false }
        defer { close(sock) }

        // Non-blocking + select() for the timeout.
        let flags = fcntl(sock, F_GETFL, 0)
        _ = fcntl(sock, F_SETFL, flags | O_NONBLOCK)
        let connectRet = connect(sock, info.pointee.ai_addr, info.pointee.ai_addrlen)
        if connectRet == 0 { return true } // immediate success (unlikely)
        if errno != EINPROGRESS { return false }

        var writeSet = fd_set()
        fdZero(&writeSet); fdSet(sock, &writeSet)
        var tv = timeval(tv_sec: __darwin_time_t(timeoutMs / 1000), tv_usec: __darwin_suseconds_t((timeoutMs % 1000) * 1000))
        let ready = select(sock + 1, nil, &writeSet, nil, &tv)
        if ready <= 0 { return false }
        var soError: Int32 = 0
        var len = socklen_t(MemoryLayout<Int32>.size)
        let optRet = getsockopt(sock, SOL_SOCKET, SO_ERROR, &soError, &len)
        return optRet == 0 && soError == 0
    }

    /// Find the device's IPv4 address on the active Wi-Fi interface
    /// ("en0" on iOS). Returns nil if not on Wi-Fi or no v4 address.
    private func getLocalIPv4() -> String? {
        var addr: UnsafeMutablePointer<ifaddrs>? = nil
        guard getifaddrs(&addr) == 0, let firstAddr = addr else { return nil }
        defer { freeifaddrs(addr) }
        var ptr: UnsafeMutablePointer<ifaddrs>? = firstAddr
        while let cur = ptr {
            defer { ptr = cur.pointee.ifa_next }
            let interface = cur.pointee
            let family = interface.ifa_addr.pointee.sa_family
            if family == UInt8(AF_INET) {
                let name = String(cString: interface.ifa_name)
                if name == "en0" || name == "en1" { // Wi-Fi
                    var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                    getnameinfo(
                        interface.ifa_addr, socklen_t(interface.ifa_addr.pointee.sa_len),
                        &hostname, socklen_t(hostname.count),
                        nil, 0,
                        NI_NUMERICHOST
                    )
                    return String(cString: hostname)
                }
            }
        }
        return nil
    }

    // fd_set bitwise helpers — Swift doesn't bridge the C macros so
    // we do it manually. These cover the bytes for fd values up to
    // FD_SETSIZE (typically 1024) which is more than enough for one
    // socket per probe.
    private func fdZero(_ set: inout fd_set) {
        set.fds_bits = (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    }
    private func fdSet(_ fd: Int32, _ set: inout fd_set) {
        let index = Int(fd) / 32
        let mask = Int32(1 << (Int(fd) % 32))
        switch index {
        case 0: set.fds_bits.0 = set.fds_bits.0 | mask
        case 1: set.fds_bits.1 = set.fds_bits.1 | mask
        case 2: set.fds_bits.2 = set.fds_bits.2 | mask
        case 3: set.fds_bits.3 = set.fds_bits.3 | mask
        default: break
        }
    }

    /// Print a receipt to a network printer.
    ///
    /// Two transports, chosen the same way the Android plugin chooses:
    ///   • `lines` (structured ReceiptLine[]) present → STAR path: render
    ///     the receipt to a bitmap and print via StarXpand (the only path
    ///     that works on Star TSP-series, which discard raw ESC/POS).
    ///   • `bytes` only (no lines) → RAW path: raw-TCP ESC/POS for the
    ///     test print and non-Star printers. We still try a StarXpand
    ///     sanity print FIRST so the test print produces paper on a Star
    ///     printer, then fall back to raw TCP if that fails (non-Star).
    ///
    /// Params: ip (req), bytes (base64) and/or lines (array), port,
    /// timeoutMs, paperWidthDots (576=80mm / 384=58mm).
    @objc func print(_ call: CAPPluginCall) {
        guard let ip = call.getString("ip"), !ip.isEmpty else {
            call.reject("ip parameter is required")
            return
        }
        let port = UInt16(call.getInt("port") ?? Int(Self.DEFAULT_PORT))
        let timeoutMs = call.getInt("timeoutMs") ?? Self.DEFAULT_TIMEOUT_MS
        let widthDots = call.getInt("paperWidthDots") ?? 576
        let jsLines: [[String: Any]] = (call.getArray("lines") ?? []).compactMap { $0 as? [String: Any] }
        let hasLines = !jsLines.isEmpty
        let hasBytes = !(call.getString("bytes")?.isEmpty ?? true)

        // ── STAR PATH (StarXpand bitmap) ──
        if #available(iOS 15.0, *) {
            let lines = hasLines ? jsLines : defaultTestLines()
            if let image = renderReceiptBitmap(lines: lines, widthDots: widthDots) {
                let command = buildImageCommand(image: image, widthDots: widthDots)
                printViaStarXpand(ip: ip, command: command) { result in
                    switch result {
                    case .success:
                        // bytesWritten is informational; the Star path prints
                        // a bitmap, not a byte count, so report 0.
                        call.resolve(["ok": true, "bytesWritten": 0, "method": "starxpand"])
                    case .failure(let err):
                        if hasLines {
                            // Real order targeting a Star printer — raw ESC/POS
                            // would be silently discarded, so report honestly
                            // (matches Android: no fake-success fallback).
                            call.reject(err.message, err.reason)
                        } else if hasBytes {
                            // Bytes-only test print and StarXpand failed → this
                            // is a non-Star printer; print the ESC/POS via raw TCP.
                            self.rawTcpPrint(call: call, ip: ip, port: port, timeoutMs: timeoutMs)
                        } else {
                            call.reject(err.message, err.reason)
                        }
                    }
                }
                return
            }
            // Bitmap render failed (extremely unlikely). With lines this is a
            // real order on a Star printer → report honestly; otherwise drop
            // to the raw-TCP path below.
            if hasLines {
                call.reject("Could not render the receipt image", "io_error")
                return
            }
        }

        // ── RAW TCP PATH (non-Star ESC/POS, or pre-iOS-15) ──
        if hasBytes {
            rawTcpPrint(call: call, ip: ip, port: port, timeoutMs: timeoutMs)
        } else {
            call.reject("either bytes or lines parameter is required")
        }
    }

    /// Probe reachability without sending payload. Same params as print().
    @objc func ping(_ call: CAPPluginCall) {
        guard let ip = call.getString("ip"), !ip.isEmpty else {
            call.reject("ip parameter is required")
            return
        }
        let port = UInt16(call.getInt("port") ?? Int(Self.DEFAULT_PORT))
        let timeoutMs = call.getInt("timeoutMs") ?? Self.DEFAULT_TIMEOUT_MS

        // Empty payload — just open the connection and close it.
        connectAndSend(ip: ip, port: port, payload: Data(), timeoutMs: timeoutMs) { result in
            switch result {
            case .success:
                call.resolve(["ok": true, "reachable": true])
            case .failure(let err):
                call.reject(err.message, err.reason)
            }
        }
    }

    // ─── Internal ────────────────────────────────────────────────────

    /// Specific failure modes the JS layer can format into actionable
    /// guidance ("printer offline" vs "wrong port" vs "network down").
    /// Matches the Android plugin's reject reason codes 1:1.
    enum PrintFailure {
        case timeout
        case refused
        case unreachable
        case ioError(String)

        var reason: String {
            switch self {
            case .timeout:     return "timeout"
            case .refused:     return "refused"
            case .unreachable: return "unreachable"
            case .ioError:     return "io_error"
            }
        }
        var message: String {
            switch self {
            case .timeout:        return "Printer did not respond in time"
            case .refused:        return "Printer reachable but RAW print port not open"
            case .unreachable:    return "Cannot reach printer (wrong IP or network)"
            case .ioError(let m): return "Print I/O error: \(m)"
            }
        }
    }

    private func connectAndSend(
        ip: String,
        port: UInt16,
        payload: Data,
        timeoutMs: Int,
        completion: @escaping (Swift.Result<Int, PrintFailure>) -> Void
    ) {
        let host = NWEndpoint.Host(ip)
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            completion(.failure(.ioError("invalid port: \(port)")))
            return
        }
        let conn = NWConnection(host: host, port: nwPort, using: .tcp)

        // One-shot timeout — if the connection state hasn't moved to
        // .ready within timeoutMs we cancel it and report .timeout.
        var didComplete = false
        let timeoutWork = DispatchWorkItem {
            if !didComplete {
                didComplete = true
                conn.cancel()
                completion(.failure(.timeout))
            }
        }
        printerQueue.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: timeoutWork)

        conn.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready:
                // Connection up — send payload (or nothing for ping).
                if payload.isEmpty {
                    if !didComplete {
                        didComplete = true
                        timeoutWork.cancel()
                        conn.cancel()
                        completion(.success(0))
                    }
                    return
                }
                conn.send(content: payload, completion: .contentProcessed { sendError in
                    if !didComplete {
                        didComplete = true
                        timeoutWork.cancel()
                        // ⚠️ Give the printer ~750ms to drain its
                        // input buffer BEFORE we cancel the connection.
                        // Star TSP143IIIW (and others) treat a
                        // too-fast close as "incomplete transmission"
                        // and silently discard the print job.
                        self.printerQueue.asyncAfter(deadline: .now() + .milliseconds(750)) {
                            conn.cancel()
                        }
                        if let sendError = sendError {
                            completion(.failure(.ioError(sendError.debugDescription)))
                        } else {
                            completion(.success(payload.count))
                        }
                    }
                })
            case .failed(let err):
                if !didComplete {
                    didComplete = true
                    timeoutWork.cancel()
                    conn.cancel()
                    // Distinguish "refused" (printer found, port closed)
                    // from "unreachable" (no route, wrong subnet).
                    let nsErr = (err as NSError)
                    if nsErr.code == ECONNREFUSED || nsErr.code == 61 {
                        completion(.failure(.refused))
                    } else if nsErr.code == EHOSTUNREACH || nsErr.code == ENETUNREACH {
                        completion(.failure(.unreachable))
                    } else {
                        completion(.failure(.ioError(err.debugDescription)))
                    }
                }
            case .cancelled:
                // No-op — we cancelled the connection ourselves either
                // from the timeout path or after a successful send.
                break
            default:
                break
            }
        }
        conn.start(queue: printerQueue)
    }

    // ════════════════════════════════════════════════════════════════
    //  StarXpand (Star printer) path
    //  Mirrors android/.../directprinter/StarXpandBridge.kt so iOS and
    //  Android print byte-for-byte identical receipts from the same
    //  structured `lines` the server emits.
    // ════════════════════════════════════════════════════════════════

    /// Raw-TCP print of the base64 `bytes` payload — Epson / Bixolon /
    /// Citizen and any non-Star ESC/POS printer. Extracted so both the
    /// bytes-only path and the StarXpand non-Star fallback reuse it.
    private func rawTcpPrint(call: CAPPluginCall, ip: String, port: UInt16, timeoutMs: Int) {
        guard let bytesB64 = call.getString("bytes"), !bytesB64.isEmpty,
              let payload = Data(base64Encoded: bytesB64) else {
            call.reject("Printer did not respond — the receipt was not printed", "io_error")
            return
        }
        connectAndSend(ip: ip, port: port, payload: payload, timeoutMs: timeoutMs) { result in
            switch result {
            case .success(let bytesWritten):
                call.resolve(["ok": true, "bytesWritten": bytesWritten, "method": "raw"])
            case .failure(let err):
                call.reject(err.message, err.reason)
            }
        }
    }

    /// Open the Star printer, print the prepared StarXpand command, close.
    /// `close()` always runs (success or failure) so the printer's single
    /// LAN session is released for the next job.
    @available(iOS 15.0, *)
    private func printViaStarXpand(
        ip: String,
        command: String,
        completion: @escaping (Swift.Result<Void, PrintFailure>) -> Void
    ) {
        let settings = StarConnectionSettings(interfaceType: .lan, identifier: ip)
        let printer = StarPrinter(settings)
        Task {
            do {
                try await printer.open()
            } catch {
                await printer.close()
                completion(.failure(self.mapStarError(error)))
                return
            }
            do {
                try await printer.print(command: command)
                await printer.close()
                completion(.success(()))
            } catch {
                await printer.close()
                completion(.failure(self.mapStarError(error)))
            }
        }
    }

    /// Build a StarXpand command that prints one image at `widthDots`,
    /// feeds to clear the cutter, and partial-cuts. Single fluent chain
    /// (matches Star's documented sample) so it's robust to the builder's
    /// reference/value semantics.
    @available(iOS 15.0, *)
    private func buildImageCommand(image: UIImage, widthDots: Int) -> String {
        let printerBuilder = StarXpandCommand.PrinterBuilder()
            .actionPrintImage(StarXpandCommand.Printer.ImageParameter(image: image, width: widthDots))
            .actionFeedLine(5)
            .actionCut(StarXpandCommand.Printer.CutType.partial)
        let builder = StarXpandCommand.StarXpandCommandBuilder()
        _ = builder.addDocument(StarXpandCommand.DocumentBuilder().addPrinter(printerBuilder))
        return builder.getCommands()
    }

    /// Map a StarIO10 error to our reason codes by matching the error's
    /// textual description — deliberately NOT pattern-matching the SDK's
    /// (version-specific) error enum cases, so this compiles across
    /// StarIO10 versions. Reason codes feed the same UI copy as Android.
    private func mapStarError(_ error: Error) -> PrintFailure {
        let d = String(describing: error).lowercased()
        if d.contains("timeout") { return .timeout }
        if d.contains("inuse") || d.contains("in use") { return .refused }
        if d.contains("notfound") || d.contains("not found")
            || d.contains("unavailable") || d.contains("network")
            || d.contains("connect") { return .unreachable }
        return .ioError(String(describing: error))
    }

    // ─── Receipt bitmap renderer ─────────────────────────────────────
    //  Port of StarXpandBridge.renderReceiptBitmap (Android Canvas →
    //  CoreGraphics). Same line kinds, styling, box geometry, wrapping
    //  and 12px→28pt font scaling so receipts match Android exactly.

    /// Hardcoded sanity receipt for the bytes-only test print, so a Star
    /// printer prints SOMETHING when no structured lines were sent.
    private func defaultTestLines() -> [[String: Any]] {
        let stamp = DateFormatter.localizedString(from: Date(), dateStyle: .medium, timeStyle: .short)
        return [
            ["kind": "text", "text": "*** FEE FREE TEST ***", "bold": true, "align": "center", "fontSize": 16],
            ["kind": "feed", "count": 1],
            ["kind": "text", "text": "If you can read this,", "align": "center"],
            ["kind": "text", "text": "the printer is working!", "align": "center"],
            ["kind": "feed", "count": 1],
            ["kind": "text", "text": stamp, "align": "center"],
        ]
    }

    private func scaledTextSize(_ templatePx: Int) -> CGFloat {
        // 12px ≈ 28pt baseline (matches Android), clamped to a sane range.
        let v = 28.0 * (CGFloat(templatePx) / 12.0)
        return min(max(v, 18), 96)
    }
    private func receiptFont(size: CGFloat, bold: Bool) -> UIFont {
        return UIFont.monospacedSystemFont(ofSize: size, weight: bold ? .bold : .regular)
    }
    private func lineHeight(_ font: UIFont) -> CGFloat {
        // Android: descent - ascent + 4. iOS: ascender - descender + 4
        // (descender is negative), which is the same total line height.
        return (font.ascender - font.descender) + 4
    }
    private func lineHeightForFont(_ templatePx: Int) -> CGFloat {
        return lineHeight(receiptFont(size: scaledTextSize(templatePx), bold: false))
    }

    // Field readers tolerant of the JS bridge's numeric representation
    // (Int vs Double vs NSNumber).
    private func strField(_ obj: [String: Any], _ key: String, _ def: String) -> String {
        return obj[key] as? String ?? def
    }
    private func intField(_ obj: [String: Any], _ key: String, _ def: Int) -> Int {
        if let i = obj[key] as? Int { return i }
        if let d = obj[key] as? Double { return Int(d) }
        if let n = obj[key] as? NSNumber { return n.intValue }
        return def
    }
    private func boolField(_ obj: [String: Any], _ key: String, _ def: Bool) -> Bool {
        if let b = obj[key] as? Bool { return b }
        if let n = obj[key] as? NSNumber { return n.boolValue }
        return def
    }

    private func textWidth(_ s: String, _ font: UIFont) -> CGFloat {
        return (s as NSString).size(withAttributes: [.font: font]).width
    }

    /// Word-wrap to fit `maxWidth`; char-splits a single over-long word
    /// and preserves leading indentation. Mirrors the Android helper.
    private func wrapText(_ text: String, font: UIFont, maxWidth: CGFloat) -> [String] {
        if text.isEmpty { return [""] }
        if textWidth(text, font) <= maxWidth { return [text] }
        var result: [String] = []
        let indent = String(text.prefix(while: { $0 == " " }))
        let body = String(text.dropFirst(indent.count))
        var current = indent
        for word in body.split(separator: " ", omittingEmptySubsequences: false).map(String.init) {
            let attempt = current.count > indent.count ? current + " " + word : current + word
            if textWidth(attempt, font) <= maxWidth {
                current = attempt
            } else {
                if current.count > indent.count {
                    result.append(current)
                    current = indent
                }
                if textWidth(indent + word, font) > maxWidth {
                    var chunk = indent
                    for ch in word {
                        let tryAdd = chunk + String(ch)
                        if textWidth(tryAdd, font) > maxWidth && chunk.count > indent.count {
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

    /// Truncate to fit, appending "..." when cut.
    private func truncateToWidth(_ text: String, font: UIFont, maxWidth: CGFloat) -> String {
        if textWidth(text, font) <= maxWidth { return text }
        let ellipsis = "..."
        let ew = textWidth(ellipsis, font)
        var cut = text
        while !cut.isEmpty && textWidth(cut, font) + ew > maxWidth {
            cut = String(cut.dropLast())
        }
        return cut + ellipsis
    }

    /// Decode + scale a {"kind":"image"} line (server inlines the logo as
    /// base64). Returns nil on ANY problem so a bad logo never breaks a
    /// print — identical guarantee to the Android renderer.
    private func decodeImageLine(_ obj: [String: Any], maxWidth: CGFloat) -> UIImage? {
        guard let b64 = obj["dataBase64"] as? String, !b64.isEmpty,
              let data = Data(base64Encoded: b64),
              let src = UIImage(data: data) else { return nil }
        let cap = intField(obj, "maxWidthDots", 0)
        let maxW = cap > 0 ? min(CGFloat(cap), maxWidth) : maxWidth * 0.6
        if src.size.width <= maxW { return src }
        let scale = maxW / src.size.width
        let newSize = CGSize(width: maxW, height: max(src.size.height * scale, 1))
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: newSize, format: fmt).image { _ in
            src.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    /// Render structured receipt lines to a single 1×-scale bitmap.
    private func renderReceiptBitmap(lines: [[String: Any]], widthDots: Int) -> UIImage? {
        let width = CGFloat(max(widthDots, 100))
        let leftMargin: CGFloat = 8, rightMargin: CGFloat = 8
        let drawableWidth = width - leftMargin - rightMargin
        let boxPadX: CGFloat = 12, boxPadY: CGFloat = 8, boxBorder: CGFloat = 2, boxGap: CGFloat = 6
        let defaultLH = lineHeightForFont(12)

        // ── Pass 1: measure total height (with word-wrap) ──
        var totalHeight: CGFloat = 16
        var boxActiveM = false
        for item in lines {
            let innerWidth = boxActiveM ? drawableWidth - 2 * boxPadX : drawableWidth
            switch strField(item, "kind", "") {
            case "text":
                let font = receiptFont(size: scaledTextSize(intField(item, "fontSize", 12)), bold: boolField(item, "bold", false))
                let wrapped = wrapText(strField(item, "text", ""), font: font, maxWidth: innerWidth)
                totalHeight += lineHeight(font) * CGFloat(max(wrapped.count, 1))
            case "twoCol":
                totalHeight += lineHeightForFont(intField(item, "fontSize", 12))
            case "divider":
                totalHeight += defaultLH
            case "feed":
                totalHeight += defaultLH * CGFloat(intField(item, "count", 1))
            case "image":
                if let img = decodeImageLine(item, maxWidth: innerWidth) { totalHeight += img.size.height + 8 }
            case "boxStart":
                let headerFont = receiptFont(size: scaledTextSize(intField(item, "fontSize", 12)), bold: true)
                totalHeight += boxBorder + lineHeight(headerFont) + 8 + boxPadY
                boxActiveM = true
            case "boxEnd":
                totalHeight += boxPadY + boxBorder + boxGap
                boxActiveM = false
            default:
                break
            }
        }
        totalHeight += 16

        let size = CGSize(width: width, height: max(totalHeight, 50))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true

        // ── Pass 2: draw ──
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let cg = ctx.cgContext
            cg.setFillColor(UIColor.white.cgColor)
            cg.fill(CGRect(origin: .zero, size: size))

            var y: CGFloat = 16
            var boxActive = false
            var boxStartY: CGFloat = 0
            for item in lines {
                let cLeft = boxActive ? leftMargin + boxPadX : leftMargin
                let cRight = boxActive ? width - rightMargin - boxPadX : width - rightMargin
                let cWidth = cRight - cLeft
                switch strField(item, "kind", "") {
                case "text":
                    let font = receiptFont(size: scaledTextSize(intField(item, "fontSize", 12)), bold: boolField(item, "bold", false))
                    let highlight = boolField(item, "highlight", false)
                    let align = strField(item, "align", "left")
                    let lh = lineHeight(font)
                    for line in wrapText(strField(item, "text", ""), font: font, maxWidth: cWidth) {
                        var color = UIColor.black
                        if highlight {
                            cg.setFillColor(UIColor.black.cgColor)
                            cg.fill(CGRect(x: cLeft, y: y, width: cRight - cLeft, height: lh))
                            color = UIColor.white
                        }
                        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
                        let measured = (line as NSString).size(withAttributes: attrs).width
                        let x: CGFloat
                        switch align {
                        case "center": x = cLeft + (cWidth - measured) / 2
                        case "right": x = cRight - measured
                        default: x = cLeft
                        }
                        (line as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
                        y += lh
                    }
                case "twoCol":
                    let font = receiptFont(size: scaledTextSize(intField(item, "fontSize", 12)), bold: boolField(item, "bold", false))
                    let highlight = boolField(item, "highlight", false)
                    let lh = lineHeight(font)
                    var color = UIColor.black
                    if highlight {
                        cg.setFillColor(UIColor.black.cgColor)
                        cg.fill(CGRect(x: cLeft, y: y, width: cRight - cLeft, height: lh))
                        color = UIColor.white
                    }
                    let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
                    let right = strField(item, "right", "")
                    let left = strField(item, "left", "")
                    let rightWidth = (right as NSString).size(withAttributes: attrs).width
                    let rightX = cRight - rightWidth
                    let maxLeftWidth = rightX - cLeft - 16
                    let truncatedLeft = truncateToWidth(left, font: font, maxWidth: maxLeftWidth)
                    (truncatedLeft as NSString).draw(at: CGPoint(x: cLeft, y: y), withAttributes: attrs)
                    (right as NSString).draw(at: CGPoint(x: rightX, y: y), withAttributes: attrs)
                    y += lh
                case "divider":
                    cg.setFillColor(UIColor.black.cgColor)
                    let yMid = y + defaultLH / 2
                    var dx = cLeft
                    while dx < cRight {
                        cg.fill(CGRect(x: dx, y: yMid, width: 8, height: 2))
                        dx += 16
                    }
                    y += defaultLH
                case "feed":
                    y += defaultLH * CGFloat(intField(item, "count", 1))
                case "image":
                    if let img = decodeImageLine(item, maxWidth: cWidth) {
                        let iw = img.size.width
                        let x: CGFloat
                        switch strField(item, "align", "center") {
                        case "left": x = cLeft
                        case "right": x = cRight - iw
                        default: x = cLeft + (cWidth - iw) / 2
                        }
                        img.draw(in: CGRect(x: x, y: y, width: iw, height: img.size.height))
                        y += img.size.height + 8
                    }
                case "boxStart":
                    let headerFont = receiptFont(size: scaledTextSize(intField(item, "fontSize", 12)), bold: true)
                    let hl = boolField(item, "headerHighlight", false)
                    let headerH = lineHeight(headerFont) + 8
                    let boxLeft = leftMargin, boxRight = width - rightMargin
                    boxStartY = y
                    var color = UIColor.black
                    if hl {
                        cg.setFillColor(UIColor.black.cgColor)
                        cg.fill(CGRect(x: boxLeft, y: y, width: boxRight - boxLeft, height: headerH))
                        color = UIColor.white
                    }
                    let attrs: [NSAttributedString.Key: Any] = [.font: headerFont, .foregroundColor: color]
                    (strField(item, "header", "") as NSString).draw(at: CGPoint(x: boxLeft + boxPadX, y: y + 4), withAttributes: attrs)
                    if !hl {
                        cg.setFillColor(UIColor.black.cgColor)
                        cg.fill(CGRect(x: boxLeft, y: y + headerH, width: boxRight - boxLeft, height: 1.5))
                    }
                    y += headerH + boxPadY
                    boxActive = true
                case "boxEnd":
                    y += boxPadY
                    cg.setStrokeColor(UIColor.black.cgColor)
                    cg.setLineWidth(boxBorder)
                    cg.stroke(CGRect(x: leftMargin, y: boxStartY, width: (width - rightMargin) - leftMargin, height: y - boxStartY))
                    y += boxGap
                    boxActive = false
                default:
                    break
                }
            }
        }
    }
}
