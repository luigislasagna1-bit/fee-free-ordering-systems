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
        let durationMs = call.getInt("durationMs") ?? 4000
        let clampedMs = max(1000, min(10000, durationMs))

        // Map IP → printer dict, de-duping in case the same printer
        // shows up across multiple service types.
        var byIp: [String: [String: Any]] = [:]
        let lock = NSLock()
        var didComplete = false

        let serviceTypes = ["_pdl-datastream._tcp", "_ipp._tcp", "_printer._tcp"]
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

        for type in serviceTypes {
            let descriptor = NWBrowser.Descriptor.bonjour(type: type, domain: nil)
            let browser = NWBrowser(for: descriptor, using: .tcp)
            browser.browseResultsChangedHandler = { results, _ in
                for result in results {
                    if case let .service(name, _, _, _) = result.endpoint {
                        // Resolve the service via a one-shot connection
                        // to learn its IP. NWBrowser gives us the
                        // service name + endpoint metadata but not the
                        // raw IP until we open a connection.
                        let conn = NWConnection(to: result.endpoint, using: .tcp)
                        conn.stateUpdateHandler = { state in
                            if case .ready = state {
                                if let remote = conn.currentPath?.remoteEndpoint,
                                   case let .hostPort(host, _) = remote {
                                    let ip: String
                                    switch host {
                                    case .ipv4(let addr):
                                        ip = "\(addr)"
                                    case .ipv6(let addr):
                                        ip = "\(addr)"
                                    case .name(let n, _):
                                        ip = n
                                    @unknown default:
                                        ip = ""
                                    }
                                    if !ip.isEmpty {
                                        lock.lock()
                                        if byIp[ip] == nil {
                                            byIp[ip] = [
                                                "name": name,
                                                "ip": ip,
                                                "port": 9100, // always RAW print port for ESC/POS
                                                "type": type,
                                            ]
                                        }
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

        // Time-box the discovery.
        printerQueue.asyncAfter(deadline: .now() + .milliseconds(clampedMs)) {
            // Give in-flight resolves a moment to land, then finish.
            self.printerQueue.asyncAfter(deadline: .now() + .seconds(1)) {
                finish()
            }
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
                        conn.cancel()
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
