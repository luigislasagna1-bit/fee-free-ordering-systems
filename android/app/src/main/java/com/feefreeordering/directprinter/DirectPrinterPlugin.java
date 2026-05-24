package com.feefreeordering.directprinter;

import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

/**
 * DirectPrinter — Capacitor plugin that opens a raw TCP socket to a
 * network-attached receipt printer (Star, Epson, etc.) and writes
 * ESC/POS-formatted bytes directly. No PrintNode required.
 *
 * ── PROTOCOL ──────────────────────────────────────────────────────────
 * Most network thermal printers expose a raw TCP service on port 9100
 * ("RAW print" / "JetDirect"). The printer accepts ESC/POS commands
 * over this socket and prints them. We don't need any vendor SDK for
 * this protocol — it's an open standard that Star TSP143IIIW, Epson
 * TM-T20, and most receipt printers from 2010+ all support.
 *
 * ── USAGE FROM JS ────────────────────────────────────────────────────
 * The kitchen web app calls:
 *
 *   const { DirectPrinter } = Capacitor.Plugins;
 *   await DirectPrinter.print({
 *     ip:    "192.168.1.50",
 *     port:  9100,                // optional, defaults to 9100
 *     bytes: "base64-encoded-bytes",
 *     timeoutMs: 5000             // optional, defaults to 5000
 *   });
 *
 * The bytes are base64 because the JS bridge handles strings reliably
 * but raw binary array transfer is error-prone across platforms.
 *
 * ── ERROR HANDLING ───────────────────────────────────────────────────
 * Returns the failure with a specific reason so the kitchen UI can
 * give the staff actionable guidance:
 *   - "unreachable" → wrong IP / printer off / different subnet
 *   - "refused"     → printer reachable but port 9100 not listening
 *                    (try the printer's web admin to enable RAW print)
 *   - "timeout"     → printer accepted the connection but never ack'd
 *   - "io_error"    → socket dropped mid-print (cable, Wi-Fi flaked)
 *
 * Caller can show "Printer offline — check power + Wi-Fi" instead of
 * "Print failed: java.net.ConnectException: Connection refused".
 *
 * ── THREADING ────────────────────────────────────────────────────────
 * All socket operations run on a background thread (Capacitor's
 * built-in executor). The JS call returns immediately with a Promise
 * that resolves/rejects when the native side completes. No main-thread
 * networking — Android would throw NetworkOnMainThreadException.
 */
@CapacitorPlugin(name = "DirectPrinter")
public class DirectPrinterPlugin extends Plugin {

    private static final String TAG = "DirectPrinter";
    private static final int DEFAULT_PORT = 9100;
    private static final int DEFAULT_TIMEOUT_MS = 5000;

    /**
     * Print raw bytes to a network printer over TCP.
     *
     * Required params:  ip (string), bytes (base64 string)
     * Optional params:  port (int, default 9100),
     *                   timeoutMs (int, default 5000)
     *
     * Returns: { ok: true } on success, or rejects with
     *          { ok: false, reason: "...", message: "..." }.
     */
    @PluginMethod
    public void print(PluginCall call) {
        final String ip = call.getString("ip");
        final int port = call.getInt("port", DEFAULT_PORT);
        final int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
        final String bytesB64 = call.getString("bytes");

        if (ip == null || ip.trim().isEmpty()) {
            call.reject("ip parameter is required");
            return;
        }
        if (bytesB64 == null || bytesB64.isEmpty()) {
            call.reject("bytes parameter (base64) is required");
            return;
        }

        final byte[] payload;
        try {
            payload = Base64.decode(bytesB64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("bytes is not valid base64: " + e.getMessage());
            return;
        }

        // Run the socket work on Capacitor's background executor — never
        // do networking on the main thread (Android throws on contact).
        getBridge().getExecutor().execute(() -> {
            Socket sock = null;
            try {
                sock = new Socket();
                sock.connect(new InetSocketAddress(ip, port), timeoutMs);
                sock.setSoTimeout(timeoutMs);
                OutputStream out = sock.getOutputStream();
                out.write(payload);
                out.flush();
                Log.i(TAG, "Printed " + payload.length + " bytes to " + ip + ":" + port);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("bytesWritten", payload.length);
                call.resolve(ret);
            } catch (java.net.SocketTimeoutException e) {
                call.reject("Printer did not respond in " + timeoutMs + "ms", "timeout");
            } catch (java.net.ConnectException e) {
                String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
                if (msg.contains("refused")) {
                    call.reject("Printer reachable but port " + port + " not open (RAW print disabled?)", "refused");
                } else {
                    call.reject("Cannot reach printer at " + ip + ":" + port, "unreachable");
                }
            } catch (java.net.NoRouteToHostException e) {
                call.reject("No route to printer (different network?)", "unreachable");
            } catch (IOException e) {
                Log.w(TAG, "I/O error during print", e);
                call.reject("Print I/O error: " + e.getMessage(), "io_error");
            } finally {
                if (sock != null) {
                    try { sock.close(); } catch (IOException ignore) { /* shutting down */ }
                }
            }
        });
    }

    /**
     * Probe a printer's reachability without sending any payload.
     * Useful for the "Test connection" button in the kitchen settings —
     * lets the owner verify the IP is right before queueing real orders.
     *
     * Same params + reject reasons as print(), but no bytes.
     */
    @PluginMethod
    public void ping(PluginCall call) {
        final String ip = call.getString("ip");
        final int port = call.getInt("port", DEFAULT_PORT);
        final int timeoutMs = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);

        if (ip == null || ip.trim().isEmpty()) {
            call.reject("ip parameter is required");
            return;
        }

        getBridge().getExecutor().execute(() -> {
            Socket sock = null;
            try {
                sock = new Socket();
                sock.connect(new InetSocketAddress(ip, port), timeoutMs);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("reachable", true);
                call.resolve(ret);
            } catch (java.net.SocketTimeoutException e) {
                call.reject("Connection timed out after " + timeoutMs + "ms", "timeout");
            } catch (java.net.ConnectException e) {
                call.reject("Connection refused at " + ip + ":" + port, "refused");
            } catch (IOException e) {
                call.reject("Cannot reach printer", "unreachable");
            } finally {
                if (sock != null) {
                    try { sock.close(); } catch (IOException ignore) {}
                }
            }
        });
    }
}
