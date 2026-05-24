import Foundation
import Capacitor
import Network

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

    /// Send raw bytes to a network printer over TCP.
    /// Required params: ip, bytes (base64). Optional: port, timeoutMs.
    @objc func print(_ call: CAPPluginCall) {
        guard let ip = call.getString("ip"), !ip.isEmpty else {
            call.reject("ip parameter is required")
            return
        }
        let port = UInt16(call.getInt("port") ?? Int(Self.DEFAULT_PORT))
        let timeoutMs = call.getInt("timeoutMs") ?? Self.DEFAULT_TIMEOUT_MS
        guard let bytesB64 = call.getString("bytes"), !bytesB64.isEmpty else {
            call.reject("bytes parameter (base64) is required")
            return
        }
        guard let payload = Data(base64Encoded: bytesB64) else {
            call.reject("bytes is not valid base64")
            return
        }

        connectAndSend(ip: ip, port: port, payload: payload, timeoutMs: timeoutMs) { result in
            switch result {
            case .success(let bytesWritten):
                call.resolve([
                    "ok": true,
                    "bytesWritten": bytesWritten,
                ])
            case .failure(let err):
                call.reject(err.message, err.reason)
            }
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
    enum PrinterError {
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
        completion: @escaping (Result<Int, PrinterError>) -> Void
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
}
