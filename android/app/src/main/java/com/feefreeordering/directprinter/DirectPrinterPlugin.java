package com.feefreeordering.directprinter;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.DhcpInfo;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
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

// Star Micronics SDK — see build.gradle for the dependency note.
// We use IPort for raw byte send-over-Star-protocol, which handles
// the connection-level handshake that vanilla TCP doesn't, so Star
// printers in Star Line Mode actually receive + execute commands.
import com.starmicronics.stario.StarIOPort;
import com.starmicronics.stario.StarIOPortException;
import com.starmicronics.stario.StarPrinterStatus;
// StarIO Extension — generates correct Star Line Mode commands +
// document framing. Without this, our raw ESC/POS bytes get sent
// without the structure the printer expects.
import com.starmicronics.starioextension.ICommandBuilder;
import com.starmicronics.starioextension.StarIoExt;

import java.io.IOException;
import java.io.OutputStream;
import java.net.Inet4Address;
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
        // Optional structured receipt for Star printers (StarXpand
        // bitmap renderer). Caller may pass instead of/alongside bytes.
        final JSArray linesArr = call.getArray("lines");
        final int paperWidthDots = call.getInt("paperWidthDots", 576);

        if (ip == null || ip.trim().isEmpty()) {
            call.reject("ip parameter is required");
            return;
        }
        if ((bytesB64 == null || bytesB64.isEmpty()) && linesArr == null) {
            call.reject("either bytes or lines parameter is required");
            return;
        }

        final byte[] payload;
        if (bytesB64 != null && !bytesB64.isEmpty()) {
            try {
                payload = Base64.decode(bytesB64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                call.reject("bytes is not valid base64: " + e.getMessage());
                return;
            }
        } else {
            // Star-only path — no ESC/POS bytes provided. Raw TCP
            // fallback can't run; use empty payload as placeholder so
            // downstream logic compiles, but only StarXpand will use it.
            payload = new byte[0];
        }

        // Run print work on a background thread — Android throws
        // NetworkOnMainThreadException if we touch sockets from the
        // UI thread.
        //
        // Strategy: try Star's IPort FIRST. The Star SDK handles
        // the connection-level handshake required by Star printers
        // in Star Line Mode (TSP143III/IV, TSP100, mPOP, etc.) so
        // they actually accept + print our ESC/POS payload — vanilla
        // raw TCP gets accepted but silently discarded.
        //
        // If Star IPort throws (printer is NOT a Star — e.g. Epson
        // or Bixolon), fall back to raw TCP which the non-Star
        // printers respond to natively.
        new Thread(() -> {
            // Phase 0 — try StarXpand SDK (stario10). This is the
            // production path for Star printers (TSP143IIIW + family).
            // Classic stario was proven non-functional for this printer
            // family despite Star Print Utility working. StarXpand
            // bitmap rendering is the only reliable path.
            //
            // - If caller provided structured `lines`: use them to
            //   render a styled receipt bitmap.
            // - Else if caller provided `bytes` (legacy): no Star path
            //   available; skip straight to raw TCP for non-Star printers.
            // - For test print (no lines/bytes), use the hardcoded
            //   testPrint sanity check.
            // ALWAYS try StarXpand first for Star printers. Three modes:
            //   1. Caller passed `lines` (structured receipt) → render
            //      proper styled bitmap with bold/sizes/alignment.
            //   2. No `lines`, only bytes (legacy test print, or real
            //      order before server is redeployed with lines support)
            //      → fall back to hardcoded testPrint so SOMETHING prints
            //      and the print path is exercised. Once the server
            //      sends `lines`, real orders get full formatting.
            //   3. No input at all → run the sanity-check testPrint.
            String xpandResult;
            if (linesArr != null && linesArr.length() > 0) {
                Log.i(TAG, "StarXpand: rendering " + linesArr.length() + " structured lines");
                xpandResult = StarXpandBridge.printLines(
                    getContext(), ip, linesArr.toString(), paperWidthDots, (long) timeoutMs);
            } else {
                Log.i(TAG, "StarXpand: no lines provided (payload=" + payload.length +
                    "b) — falling back to hardcoded testPrint");
                xpandResult = StarXpandBridge.testPrint(getContext(), ip, (long) timeoutMs);
            }
            if ("ok".equals(xpandResult)) {
                Log.i(TAG, "StarXpand print SUCCESS");
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("bytesWritten", payload.length);
                ret.put("method", "starxpand");
                call.resolve(ret);
                return;
            }
            Log.w(TAG, "StarXpand print failed (" + xpandResult + "); falling back to raw TCP");

            // Phase 1 — try Star IPort (works on Star printers)
            if (tryStarPrint(ip, payload, timeoutMs, call)) {
                return;
            }
            // Phase 2 — raw TCP fallback for Epson/Bixolon/Citizen
            Socket sock = null;
            try {
                sock = new Socket();
                sock.connect(new InetSocketAddress(ip, port), timeoutMs);
                sock.setSoTimeout(timeoutMs);
                // Enable TCP_NODELAY so we don't sit in the kernel
                // waiting for Nagle to coalesce small writes. Receipt
                // payloads are <2KB; we want them on the wire ASAP.
                try { sock.setTcpNoDelay(true); } catch (Exception ignore) {}
                OutputStream out = sock.getOutputStream();
                out.write(payload);
                out.flush();
                // ⚠️ Critical: give the printer time to drain its
                // input buffer BEFORE we close the socket. Star
                // TSP143IIIW with Data Timeout=0 won't flush until
                // the connection's been held open for several seconds.
                try { Thread.sleep(5000); } catch (InterruptedException ignore) {}
                // Half-close so the printer's TCP stack sees a clean FIN.
                try { sock.shutdownOutput(); } catch (Exception ignore) {}
                try { Thread.sleep(500); } catch (InterruptedException ignore) {}
                Log.i(TAG, "Printed (raw TCP) " + payload.length + " bytes to " + ip + ":" + port);
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("bytesWritten", payload.length);
                ret.put("method", "raw");
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
     * Try printing via Star's StarIO library. Returns true if the
     * print succeeded (in which case we've already resolved the
     * PluginCall and the caller should bail). Returns false if the
     * printer isn't a Star — caller should fall back to raw TCP.
     *
     * StarIO is the magic that makes Star printers actually accept
     * print data. The raw TCP path opens port 9100 and writes bytes,
     * but Star printers in Star Line Mode silently discard ESC/POS
     * commands sent that way. StarIOPort wraps the connection with
     * Star's expected protocol-level handshake AND auto-translates
     * the command stream to match the printer's emulation mode.
     *
     * The portName format is "TCP:<ip>" and portSettings "mini"
     * indicates a Star Mini receipt printer (TSP100 family) —
     * which is the right setting for TSP143III/IV. Star's port
     * accepts this for all their thermal POS printers including
     * mPOP, TSP650, TSP700, TSP800, mC-Print*.
     */
    private boolean tryStarPrint(String ip, byte[] payload, int timeoutMs, PluginCall call) {
        StarIOPort port = null;
        // ⚠️ portSettings choice is CRITICAL:
        //   "mini"   = Mini Receipt Printer profile. Expects Auto-
        //              Status-Back (ASB) mode ON. TSP143IIIW with
        //              CloudPRNT has ASB off → getPort() throws
        //              "call-version timeout" after waiting for an
        //              ASB response that never comes. This is the
        //              failure Luigi saw in adb logcat.
        //   "escpos" = ESC/POS-emulating Star printer. Skips ASB
        //              handshake but assumes printer is in ESC/POS
        //              mode (rare).
        //   ""       = Default / no-protocol port. SKIPS the version
        //              handshake entirely, just opens TCP + writes
        //              bytes through Star's connection layer. This
        //              is what works on TSP143IIIW with CloudPRNT
        //              enabled, and matches the behavior of Star's
        //              own setup utility.
        // Try empty FIRST (works on the broadest range of printer
        // configs), fall back to "mini" if that fails (works on
        // printers with ASB on but in some edge cases).
        final String[] portSettingsCandidates = new String[] { "", "mini", "escpos" };
        StarIOPortException lastError = null;
        for (String portSettings : portSettingsCandidates) {
            try {
                Log.i(TAG, "tryStarPrint: opening TCP:" + ip + " portSettings='" + portSettings + "' timeout=" + timeoutMs);
                port = StarIOPort.getPort("TCP:" + ip, portSettings, timeoutMs, getContext());
                Log.i(TAG, "tryStarPrint: port opened (portSettings='" + portSettings + "'), reading status");
                // ── Diagnostic status read BEFORE write ─────────────
                // Star printers report physical state (paper, cover,
                // offline, error code) via retreiveStatus(). If the
                // printer is in any non-OK state, ESC/POS bytes get
                // silently queued and never printed even though the
                // TCP write succeeds. Logging this lets us see what
                // the printer thinks is wrong.
                try {
                    StarPrinterStatus s = port.retreiveStatus();
                    Log.i(TAG, "tryStarPrint: STATUS BEFORE WRITE — " +
                        "offline=" + s.offline +
                        " coverOpen=" + s.coverOpen +
                        " receiptPaperEmpty=" + s.receiptPaperEmpty +
                        " receiptPaperNearEmptyInner=" + s.receiptPaperNearEmptyInner +
                        " receiptPaperNearEmptyOuter=" + s.receiptPaperNearEmptyOuter +
                        " cutterError=" + s.cutterError +
                        " mechError=" + s.mechError +
                        " unrecoverableError=" + s.unrecoverableError);
                } catch (Exception se) {
                    Log.w(TAG, "tryStarPrint: status read failed (may be normal for portSettings=''): " + se.getMessage());
                }
                // ── beginCheckedBlock / endCheckedBlock pattern ─────
                // This is THE missing piece that was making the printer
                // silently queue our bytes instead of printing them.
                //
                // The printer's "#9100 Data Timeout = 0" setting means
                // it waits forever for more bytes after a write — it
                // never thinks "OK, the job is done, flush + print."
                // Just closing the socket doesn't tell it either.
                //
                // beginCheckedBlock() declares "starting a new print job"
                // endCheckedBlock() declares "job is complete, flush +
                // execute now" and BLOCKS until the printer confirms.
                //
                // This is the documented Star pattern for guaranteed
                // print + confirm. Star's sample apps, GloriaFood, and
                // Square's POS all use this — port.writePort() alone
                // is insufficient with Data Timeout=0.
                // ── PURE BUILDER-ONLY TEST PRINT ───────────────────
                // Diagnostic: ignore the user payload entirely. Build
                // a known-good test receipt using ONLY Star's
                // ICommandBuilder API. If THIS doesn't print, the
                // classic stario SDK can't talk to this printer at all
                // and we need to switch to stario10 (StarXpand). If
                // this DOES print, the issue is something specific
                // about our raw payload bytes interacting badly.
                ICommandBuilder builder = StarIoExt.createCommandBuilder(StarIoExt.Emulation.StarLine);
                builder.beginDocument();
                try {
                    builder.appendCodePage(ICommandBuilder.CodePageType.UTF8);
                } catch (Throwable t) { /* older builders may not have this */ }
                String testText = "\n\n"
                    + "*** PURE BUILDER TEST ***\n"
                    + "\n"
                    + "If you can read this,\n"
                    + "the SDK can talk to the printer!\n"
                    + "\n"
                    + new java.util.Date().toString() + "\n"
                    + "\n\n";
                builder.append(testText.getBytes("UTF-8"));
                builder.appendUnitFeed(48);
                builder.appendCutPaper(ICommandBuilder.CutPaperAction.PartialCutWithFeed);
                builder.endDocument();
                byte[] framed = builder.getCommands();
                Log.i(TAG, "tryStarPrint: PURE BUILDER test (ignoring " + payload.length + "-byte payload) -> " + framed.length + " bytes");

                Log.i(TAG, "tryStarPrint: beginCheckedBlock");
                port.beginCheckedBlock();
                Log.i(TAG, "tryStarPrint: writing " + framed.length + " framed bytes");
                port.writePort(framed, 0, framed.length);
                Log.i(TAG, "tryStarPrint: endCheckedBlock");
                StarPrinterStatus completion = port.endCheckedBlock();
                Log.i(TAG, "tryStarPrint: endCheckedBlock returned — " +
                    "offline=" + completion.offline +
                    " coverOpen=" + completion.coverOpen +
                    " receiptPaperEmpty=" + completion.receiptPaperEmpty +
                    " cutterError=" + completion.cutterError +
                    " unrecoverableError=" + completion.unrecoverableError);
                // ── POST-WRITE FLUSH TRIGGER ───────────────────────
                // endCheckedBlock with portSettings="" returns success
                // immediately without verifying the printer actually
                // printed. We've observed bytes get buffered and flush
                // only on a later trigger. Status reads send a query
                // command to the printer which DOES require the
                // printer to fully process its input buffer to respond
                // — this acts as a forced flush. Doing it 3 times with
                // small delays gives the print engine time to advance
                // paper through the cutter before we close the socket.
                for (int i = 1; i <= 3; i++) {
                    try { Thread.sleep(1000); } catch (InterruptedException ignore) {}
                    try {
                        StarPrinterStatus s = port.retreiveStatus();
                        Log.i(TAG, "tryStarPrint: post-end status #" + i + " — " +
                            "offline=" + s.offline +
                            " coverOpen=" + s.coverOpen +
                            " receiptPaperEmpty=" + s.receiptPaperEmpty);
                    } catch (Exception se) {
                        Log.w(TAG, "tryStarPrint: post-end status #" + i + " failed: " + se.getMessage());
                    }
                }
                // ── Diagnostic status read AFTER write ──────────────
                try {
                    StarPrinterStatus s = port.retreiveStatus();
                    Log.i(TAG, "tryStarPrint: STATUS AFTER WRITE — " +
                        "offline=" + s.offline +
                        " coverOpen=" + s.coverOpen +
                        " receiptPaperEmpty=" + s.receiptPaperEmpty +
                        " cutterError=" + s.cutterError +
                        " unrecoverableError=" + s.unrecoverableError);
                } catch (Exception se) {
                    Log.w(TAG, "tryStarPrint: post-write status read failed: " + se.getMessage());
                }
                // endCheckedBlock already blocked until the printer
                // confirmed completion — no manual drain needed.
                Log.i(TAG, "tryStarPrint: SUCCESS via portSettings='" + portSettings + "'");
                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("bytesWritten", payload.length);
                ret.put("method", "star:" + (portSettings.isEmpty() ? "default" : portSettings));
                call.resolve(ret);
                return true;
            } catch (StarIOPortException e) {
                lastError = e;
                Log.w(TAG, "tryStarPrint: portSettings='" + portSettings + "' failed: " + e.getMessage());
                if (port != null) {
                    try { StarIOPort.releasePort(port); } catch (Exception ignore) {}
                    port = null;
                }
                // Continue to next portSettings candidate.
            } catch (Exception e) {
                Log.w(TAG, "tryStarPrint: portSettings='" + portSettings + "' unexpected error", e);
                if (port != null) {
                    try { StarIOPort.releasePort(port); } catch (Exception ignore) {}
                    port = null;
                }
                // Bail to raw TCP for non-Star-SDK exceptions.
                return false;
            }
        }
        // All Star portSettings exhausted — printer likely isn't Star OR
        // is in a weird config. Fall through to raw TCP path.
        Log.w(TAG, "tryStarPrint: all portSettings failed; last error: " +
            (lastError != null ? lastError.getMessage() : "unknown"));
        return false;
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
        // Device IPv4 + subnet mask. WifiManager.getDhcpInfo() is DEPRECATED and
        // returns 0.0.0.0 on Android 12+ (API 31+) — which silently broke
        // auto-discovery on newer tablets (it found the device IP as 0, bailed,
        // and never scanned). Luigi/Fabrizio 2026-06-15. Use the modern
        // ConnectivityManager/LinkProperties path first; fall back to legacy
        // DHCP info only on older devices where it still works.
        int localIp;
        int netmask;
        int[] modern = getLocalIpv4AndPrefix(ctx);
        if (modern != null) {
            localIp = modern[0];
            int prefix = modern[1];
            netmask = (prefix <= 0 || prefix > 32) ? 0xFFFFFF00 : (int) (0xFFFFFFFFL << (32 - prefix));
        } else {
            WifiManager wifi = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi == null) return;
            DhcpInfo dhcp = wifi.getDhcpInfo();
            if (dhcp == null || dhcp.ipAddress == 0) return;
            // ipAddress + netmask are little-endian from DhcpInfo; convert.
            localIp = Integer.reverseBytes(dhcp.ipAddress);
            netmask = Integer.reverseBytes(dhcp.netmask == 0 ? 0xFFFFFF00 : dhcp.netmask);
        }

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

    /**
     * Device IPv4 address + subnet prefix length via the modern Connectivity
     * APIs, as { ipBigEndian, prefixLen }. Replaces the deprecated
     * WifiManager.getDhcpInfo() (returns 0 on Android 12+), so the subnet scan
     * works on current tablets. Uses only ACCESS_NETWORK_STATE (already
     * declared) — no WiFi-scan / nearby-devices permission needed. Returns null
     * when no usable IPv4 link address is found (caller falls back to DHCP).
     */
    private int[] getLocalIpv4AndPrefix(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getApplicationContext()
                .getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return null;
            Network net = cm.getActiveNetwork();
            if (net == null) return null;
            LinkProperties lp = cm.getLinkProperties(net);
            if (lp == null) return null;
            for (LinkAddress la : lp.getLinkAddresses()) {
                InetAddress addr = la.getAddress();
                if (addr instanceof Inet4Address && !addr.isLoopbackAddress() && !addr.isLinkLocalAddress()) {
                    byte[] b = addr.getAddress();
                    int ipInt = ((b[0] & 0xff) << 24) | ((b[1] & 0xff) << 16)
                              | ((b[2] & 0xff) << 8) | (b[3] & 0xff);
                    return new int[] { ipInt, la.getPrefixLength() };
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "modern IPv4 detection failed; will fall back to DHCP", e);
        }
        return null;
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
