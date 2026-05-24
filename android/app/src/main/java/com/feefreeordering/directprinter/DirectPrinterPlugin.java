package com.feefreeordering.directprinter;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

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

        // Run socket work on a background thread — Android throws
        // NetworkOnMainThreadException if we touch sockets from the
        // UI thread. A plain Thread is fine here; the JS bridge
        // resolves the PluginCall whenever we call resolve()/reject(),
        // regardless of which thread we're on.
        new Thread(() -> {
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
        }).start();
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

        new Thread(() -> {
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
        }).start();
    }

    /**
     * Search the local network for receipt printers via mDNS / Bonjour.
     *
     * The kitchen operator clicks "Find printers" in the setup UI and we
     * scan for services advertising the common receipt-print types:
     *
     *   _pdl-datastream._tcp  — raw "port 9100" print, used by Star,
     *                            Epson, Bixolon, most ESC/POS printers.
     *                            This is the one we actually want for
     *                            ESC/POS over TCP. Resolve to host+port.
     *
     *   _ipp._tcp             — Internet Printing Protocol. Slightly
     *                            different wire format (IPP vs raw),
     *                            but the IP is what matters; many
     *                            multi-protocol printers advertise both
     *                            and we'll still try port 9100 on them.
     *
     *   _printer._tcp         — LPR/LPD. Same comment as IPP — useful
     *                            for IP discovery, we'll override port.
     *
     * Behavior:
     *   - Discovery runs for ~4 seconds (UI shows a spinner)
     *   - Each resolved service is reported as { name, ip, port, type }
     *   - Duplicates de-duped by IP (some printers advertise on multiple
     *     service types simultaneously)
     *   - Resolves silently — failures to resolve a single advertisement
     *     don't fail the whole scan
     *
     * Returns: { printers: [{name, ip, port, type}, ...] }.
     *
     * Note: NSD on Android only works when device is on Wi-Fi (not
     * mobile data). And mDNS multicast is sometimes filtered by
     * enterprise routers / VLAN setups — restaurants on tricky
     * networks may get an empty result and need to fall back to
     * manual IP entry. The UI handles this gracefully.
     */
    @PluginMethod
    public void discover(PluginCall call) {
        final int discoveryDurationMs = Math.max(1000, Math.min(10000, call.getInt("durationMs", 4000)));
        final Context ctx = getContext();
        final NsdManager nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        if (nsd == null) {
            call.reject("Network Service Discovery unavailable", "nsd_unavailable");
            return;
        }

        final String[] serviceTypes = new String[] {
            "_pdl-datastream._tcp.",
            "_ipp._tcp.",
            "_printer._tcp.",
        };

        // Thread-safe accumulator of found printers (de-duplicated by IP).
        final Map<String, JSObject> byIp = new HashMap<>();
        final List<NsdManager.DiscoveryListener> activeListeners = new ArrayList<>();
        final AtomicInteger pendingResolves = new AtomicInteger(0);
        final boolean[] finalized = new boolean[] { false };

        final Runnable finishOnce = () -> {
            synchronized (finalized) {
                if (finalized[0]) return;
                finalized[0] = true;
                // Stop all active discovery listeners.
                for (NsdManager.DiscoveryListener l : activeListeners) {
                    try { nsd.stopServiceDiscovery(l); } catch (Exception ignore) {}
                }
                JSArray arr = new JSArray();
                synchronized (byIp) {
                    for (JSObject p : byIp.values()) arr.put(p);
                }
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("printers", arr);
                call.resolve(ret);
            }
        };

        // Start a discovery listener per service type.
        for (final String type : serviceTypes) {
            NsdManager.DiscoveryListener disc = new NsdManager.DiscoveryListener() {
                @Override public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                    Log.w(TAG, "discovery start failed for " + serviceType + " code=" + errorCode);
                }
                @Override public void onStopDiscoveryFailed(String serviceType, int errorCode) { /* ignore */ }
                @Override public void onDiscoveryStarted(String serviceType) { /* noop */ }
                @Override public void onDiscoveryStopped(String serviceType) { /* noop */ }
                @Override public void onServiceFound(NsdServiceInfo info) {
                    pendingResolves.incrementAndGet();
                    NsdManager.ResolveListener rl = new NsdManager.ResolveListener() {
                        @Override public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                            pendingResolves.decrementAndGet();
                            Log.w(TAG, "resolve failed " + serviceInfo.getServiceName() + " err=" + errorCode);
                        }
                        @Override public void onServiceResolved(NsdServiceInfo serviceInfo) {
                            try {
                                InetAddress host = serviceInfo.getHost();
                                if (host == null) {
                                    pendingResolves.decrementAndGet();
                                    return;
                                }
                                String ip = host.getHostAddress();
                                if (ip == null || ip.isEmpty()) {
                                    pendingResolves.decrementAndGet();
                                    return;
                                }
                                // For ESC/POS we always want port 9100
                                // (the universal "RAW print" port).
                                // Some printers advertise other ports
                                // for IPP — overriding to 9100 here is
                                // the consistent thing to do since the
                                // print() method also uses 9100.
                                int port = 9100;
                                JSObject p = new JSObject();
                                p.put("name", serviceInfo.getServiceName());
                                p.put("ip", ip);
                                p.put("port", port);
                                p.put("type", type);
                                synchronized (byIp) {
                                    // Don't overwrite an existing entry that
                                    // already got resolved from a different
                                    // service type (e.g. _pdl-datastream's
                                    // name is usually more printer-y).
                                    if (!byIp.containsKey(ip)) byIp.put(ip, p);
                                }
                            } catch (Exception e) {
                                Log.w(TAG, "resolve handler threw", e);
                            } finally {
                                pendingResolves.decrementAndGet();
                            }
                        }
                    };
                    try {
                        nsd.resolveService(info, rl);
                    } catch (Exception e) {
                        pendingResolves.decrementAndGet();
                        Log.w(TAG, "resolveService threw", e);
                    }
                }
                @Override public void onServiceLost(NsdServiceInfo info) { /* noop */ }
            };
            activeListeners.add(disc);
            try {
                nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, disc);
            } catch (Exception e) {
                Log.w(TAG, "discoverServices threw for " + type, e);
            }
        }

        // Time-box the discovery. After durationMs, stop discovery and
        // wait a brief moment for in-flight resolves to finish, then
        // return whatever we have.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            // Stop discovery first so no NEW services arrive after this
            // point — then give resolves up to 1 more second to complete.
            for (NsdManager.DiscoveryListener l : activeListeners) {
                try { nsd.stopServiceDiscovery(l); } catch (Exception ignore) {}
            }
            new Handler(Looper.getMainLooper()).postDelayed(finishOnce, 1000);
        }, discoveryDurationMs);
    }
}
