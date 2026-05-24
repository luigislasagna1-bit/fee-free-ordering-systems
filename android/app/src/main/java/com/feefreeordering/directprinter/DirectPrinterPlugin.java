package com.feefreeordering.directprinter;

import android.content.Context;
import android.net.DhcpInfo;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
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
        final int discoveryDurationMs = Math.max(2000, Math.min(15000, call.getInt("durationMs", 6000)));
        final Context ctx = getContext();

        // Accumulator shared by mDNS + subnet scan, de-duped by IP.
        final Map<String, JSObject> byIp = new HashMap<>();

        // Run both discovery methods in parallel and merge results.
        // This is what makes auto-discovery actually reliable across
        // diverse printer brands + Wi-Fi setups — mDNS alone misses
        // printers that don't advertise (or advertise on uncommon
        // service types), and subnet scan alone misses printers that
        // happen to listen on a non-default port.
        new Thread(() -> {
            // Phase 1: kick off mDNS discovery (async)
            MulticastLockHolder lockHolder = acquireMulticastLock(ctx);
            List<NsdManager.DiscoveryListener> listeners = startMdnsDiscovery(ctx, byIp);

            // Phase 2: subnet scan (blocking, runs while mDNS is still
            // listening on the side). Probes every IP in the local /24
            // on TCP port 9100 with a 400ms timeout each, 32 threads.
            // Anything that accepts the connection is almost certainly
            // a print server.
            try {
                subnetScan(ctx, byIp, 400, 32);
            } catch (Exception e) {
                Log.w(TAG, "subnet scan failed", e);
            }

            // Phase 3: wait for any straggling mDNS resolves
            try { Thread.sleep(Math.max(0, discoveryDurationMs - 3500)); } catch (InterruptedException ignore) {}

            // Phase 4: stop mDNS + multicast lock
            NsdManager nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
            if (nsd != null) {
                for (NsdManager.DiscoveryListener l : listeners) {
                    try { nsd.stopServiceDiscovery(l); } catch (Exception ignore) {}
                }
            }
            if (lockHolder != null) lockHolder.release();

            // Phase 5: return merged results
            JSArray arr = new JSArray();
            synchronized (byIp) {
                for (JSObject p : byIp.values()) arr.put(p);
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("printers", arr);
            call.resolve(ret);
        }).start();
    }

    /**
     * Subnet scan. The reliable fallback when mDNS misses a printer.
     * Get the device's IPv4 + netmask via WifiManager. Iterate every
     * address in the /24 (or smaller mask if the subnet is unusual),
     * try TCP-connect on port 9100 with a short timeout. Anything
     * that accepts is treated as a printer.
     *
     * Parallel: thread pool of `threads`. Default 32. A /24 subnet
     * (254 hosts) finishes in ~2.5 seconds with this. Larger subnets
     * are capped at /22 (1022 hosts, ~8s) — beyond that we'd take
     * too long.
     */
    private void subnetScan(Context ctx, Map<String, JSObject> byIp, int timeoutMs, int threads) {
        WifiManager wifi = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi == null) return;
        DhcpInfo dhcp = wifi.getDhcpInfo();
        if (dhcp == null || dhcp.ipAddress == 0) return;

        int ip = dhcp.ipAddress;
        int mask = dhcp.netmask == 0 ? 0xFFFFFF00 : dhcp.netmask; // assume /24 if not reported
        // ipAddress is little-endian; convert.
        int localIp = Integer.reverseBytes(ip);
        int netmask = Integer.reverseBytes(mask);

        int network = localIp & netmask;
        int broadcast = network | ~netmask;
        int hostCount = broadcast - network - 1;
        if (hostCount <= 0) return;
        // Cap at /22 (~1022 hosts) so a misconfigured / unusual
        // network can't make us scan forever.
        if (hostCount > 1022) {
            // Trim to /24 around the device's own IP — safer assumption
            network = localIp & 0xFFFFFF00;
            broadcast = network | 0xFF;
            hostCount = 254;
        }

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        final int startIp = network + 1;
        final int endIp = broadcast - 1;
        final CountDownLatch latch = new CountDownLatch(endIp - startIp + 1);

        for (int testIp = startIp; testIp <= endIp; testIp++) {
            final String addr = intToIp(testIp);
            pool.submit(() -> {
                try (Socket s = new Socket()) {
                    s.connect(new InetSocketAddress(addr, 9100), timeoutMs);
                    // Got a TCP handshake on port 9100 → almost
                    // certainly a print server. Add it.
                    JSObject p = new JSObject();
                    p.put("name", "Printer at " + addr);
                    p.put("ip", addr);
                    p.put("port", 9100);
                    p.put("type", "subnet-scan");
                    synchronized (byIp) {
                        // Don't overwrite if mDNS already discovered
                        // it with a friendlier name.
                        if (!byIp.containsKey(addr)) byIp.put(addr, p);
                    }
                } catch (IOException ignore) {
                    // Not a printer, or not reachable, or filtered.
                    // Expected for the vast majority of subnet IPs.
                } finally {
                    latch.countDown();
                }
            });
        }
        try {
            latch.await(timeoutMs * 3L, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignore) {}
        pool.shutdownNow();
    }

    /** Convert a 32-bit int IP (big-endian) to "a.b.c.d" string. */
    private String intToIp(int ip) {
        return ((ip >> 24) & 0xff) + "." +
               ((ip >> 16) & 0xff) + "." +
               ((ip >> 8) & 0xff) + "." +
               (ip & 0xff);
    }

    /** Holder so the caller can release the multicast lock at the end. */
    private static class MulticastLockHolder {
        WifiManager.MulticastLock lock;
        MulticastLockHolder(WifiManager.MulticastLock l) { this.lock = l; }
        void release() {
            try { if (lock != null && lock.isHeld()) lock.release(); } catch (Exception ignore) {}
        }
    }

    /**
     * Acquire a WiFi multicast lock for the duration of the scan.
     * Without this, NsdManager's mDNS broadcasts are dropped by the
     * Android kernel on most builds — multicast is filtered to save
     * battery. The lock costs ~10mW for the few seconds we hold it.
     */
    private MulticastLockHolder acquireMulticastLock(Context ctx) {
        try {
            WifiManager wifi = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) return null;
            WifiManager.MulticastLock lock = wifi.createMulticastLock("ffo-printer-discovery");
            lock.setReferenceCounted(false);
            lock.acquire();
            return new MulticastLockHolder(lock);
        } catch (Exception e) {
            Log.w(TAG, "multicast lock failed", e);
            return null;
        }
    }

    /**
     * Start mDNS discovery across many service types. Star printers
     * tend to advertise on _http._tcp + _printer._tcp; Epson on
     * _pdl-datastream._tcp + _ipp._tcp; older models sometimes on
     * _lpd._tcp. Scan ALL of them.
     */
    private List<NsdManager.DiscoveryListener> startMdnsDiscovery(Context ctx, Map<String, JSObject> byIp) {
        List<NsdManager.DiscoveryListener> active = new ArrayList<>();
        NsdManager nsd = (NsdManager) ctx.getSystemService(Context.NSD_SERVICE);
        if (nsd == null) return active;

        String[] serviceTypes = new String[] {
            "_pdl-datastream._tcp.", // RAW print (Star, Epson, Bixolon)
            "_ipp._tcp.",             // IPP (most modern printers)
            "_ipps._tcp.",            // Secure IPP
            "_printer._tcp.",         // LPR/LPD
            "_lpd._tcp.",             // Some Star advertise on this
        };
        for (final String type : serviceTypes) {
            NsdManager.DiscoveryListener disc = new NsdManager.DiscoveryListener() {
                @Override public void onStartDiscoveryFailed(String serviceType, int errorCode) {}
                @Override public void onStopDiscoveryFailed(String serviceType, int errorCode) {}
                @Override public void onDiscoveryStarted(String serviceType) {}
                @Override public void onDiscoveryStopped(String serviceType) {}
                @Override public void onServiceFound(NsdServiceInfo info) {
                    NsdManager.ResolveListener rl = new NsdManager.ResolveListener() {
                        @Override public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {}
                        @Override public void onServiceResolved(NsdServiceInfo serviceInfo) {
                            try {
                                InetAddress host = serviceInfo.getHost();
                                if (host == null) return;
                                String ip = host.getHostAddress();
                                if (ip == null || ip.isEmpty()) return;
                                JSObject p = new JSObject();
                                p.put("name", serviceInfo.getServiceName());
                                p.put("ip", ip);
                                p.put("port", 9100); // force RAW print port
                                p.put("type", type);
                                synchronized (byIp) {
                                    // mDNS gives us a friendlier name —
                                    // overwrite the subnet-scan placeholder.
                                    byIp.put(ip, p);
                                }
                            } catch (Exception ignore) {}
                        }
                    };
                    try { nsd.resolveService(info, rl); } catch (Exception ignore) {}
                }
                @Override public void onServiceLost(NsdServiceInfo info) {}
            };
            try {
                nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, disc);
                active.add(disc);
            } catch (Exception e) {
                Log.w(TAG, "discoverServices failed for " + type, e);
            }
        }
        return active;
    }
}
