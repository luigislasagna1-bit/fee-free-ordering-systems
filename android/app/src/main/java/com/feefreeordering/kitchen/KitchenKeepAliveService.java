package com.feefreeordering.kitchen;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Always-on keep-alive foreground service. Android was silently DROPPING the
 * new-order alarm push once the screen had been off a while — app-standby / deep
 * sleep throttles a backgrounded app's FCM delivery, even with the battery
 * exemption (Luigi 2026-06-16: rang when freshly backgrounded, went silent once
 * settled). A foreground service keeps the process alive + the FCM connection
 * warm + holds a partial wake lock, so high-priority order pushes deliver
 * in-process and the alarm fires EVERY time. Kitchen tablets are plugged in, so
 * the quiet always-on notification + wake lock cost nothing. This is how
 * dedicated kitchen-display apps stay reliable.
 *
 * START_STICKY + started from MainActivity.onCreate, so it comes back if Android
 * ever kills it and restarts whenever the app is opened.
 */
public class KitchenKeepAliveService extends Service {
    static final String CHANNEL_ID = "keepalive";
    static final int NOTIF_ID = 4720;
    private PowerManager.WakeLock wakeLock;
    private static final String POLL_URL = "https://feefreeordering.com/api/kitchen/alarm-state?token=";
    private volatile boolean polling = false;
    // Restaurant ring+vibrate vs ring-only preference, refreshed on each poll
    // (default true). Passed to OrderAlarmService when the alarm starts. 2026-06-16.
    private volatile boolean lastVibrate = true;
    private Thread pollThread;
    // Orders this session has already background-printed, so we don't re-fetch a
    // print job every 4s for one that's done. The server's atomic kitchenPrintedAt
    // claim is the real cross-device/web dedup; this is just a local optimization.
    private final java.util.Set<String> printedThisSession =
        java.util.Collections.synchronizedSet(new java.util.HashSet<String>());

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIF_ID, buildNotification(),
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIF_ID, buildNotification());
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "feefree:keepalive");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire();
        } catch (Exception ignored) {
        }
        startPolling();
        return START_STICKY;
    }

    /** Poll the server every ~4s for whether an order/reservation is currently
     *  "ringing", and start/stop the loud OrderAlarmService accordingly. This is
     *  the RELIABLE alarm path — the app's own loop, kept awake by this foreground
     *  service + wake lock + battery exemption — so it does NOT depend on
     *  background push delivery (which old Samsung devices throttle). It rings
     *  continuously until the order is accepted (leaves "pending") or its accept
     *  window expires, then stops on the next poll. Skips while the app is in the
     *  foreground (the in-app ring covers that). Luigi 2026-06-16. */
    private void startPolling() {
        if (polling) return;
        polling = true;
        pollThread = new Thread(() -> {
            String token = null;
            while (polling && token == null) {
                try {
                    // Bound the token wait so a slow/hung Firebase init can't block the
                    // poll loop for minutes — a screen-off order wouldn't ring until the
                    // token resolved. Retry every 5s. Luigi 2026-06-22.
                    token = com.google.android.gms.tasks.Tasks.await(
                            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken(),
                            8, java.util.concurrent.TimeUnit.SECONDS);
                } catch (Exception e) {
                    token = null;
                }
                if (token == null) {
                    try { Thread.sleep(5000); } catch (InterruptedException e) { return; }
                }
            }
            while (polling) {
                try {
                    String resp = token != null ? fetchAlarmState(token) : null;
                    boolean ringing = false;
                    if (resp != null) {
                        lastVibrate = !resp.contains("\"vibrate\":false");
                        ringing = resp.contains("\"ringing\":true");
                    }
                    // Native alarm = screen-off / backgrounded ONLY. Foreground, the
                    // in-app web ring (loud official GloriaFood track, stop-on-open)
                    // handles it — firing the native alarm too is the double-ring. When
                    // the app comes foreground, the else-branch STOPS a running alarm so
                    // the web takes over cleanly. Luigi 2026-06-22.
                    if (ringing && !MainActivity.isForeground) {
                        if (!OrderAlarmService.isRunning) {
                            Intent i = new Intent(this, OrderAlarmService.class);
                            i.putExtra("vibrate", lastVibrate);
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                startForegroundService(i);
                            } else {
                                startService(i);
                            }
                        }
                    } else if (OrderAlarmService.isRunning) {
                        OrderAlarmService.stop(this);
                    }
                    // Background AUTO-PRINT — while the app is CLOSED (foreground
                    // printing is the WebView's job), print any order the server
                    // flagged for printing, straight to the Star. Luigi 2026-06-22.
                    if (resp != null && token != null && !MainActivity.isForeground) {
                        handleBackgroundPrint(token, resp);
                    }
                } catch (Exception ignored) {
                }
                try { Thread.sleep(4000); } catch (InterruptedException e) { break; }
            }
        });
        pollThread.setDaemon(true);
        pollThread.start();
    }

    /** GET the alarm-state poll (ringing + vibrate + the background-print order
     *  list) as a raw JSON string, or null on any failure. */
    private String fetchAlarmState(String token) {
        try {
            return httpGet(POLL_URL + java.net.URLEncoder.encode(token, "UTF-8"), 8000);
        } catch (Exception e) {
            return null;
        }
    }

    /** Simple background HTTP GET → response body string, or null. */
    private String httpGet(String urlStr, int readTimeoutMs) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(readTimeoutMs);
            conn.setRequestMethod("GET");
            if (conn.getResponseCode() != 200) return null;
            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Print any order the server flagged for background printing (the "print"
     *  array on the alarm-state response), using the printer config the WebView
     *  mirrored into SharedPreferences. Each order is claimed atomically server-
     *  side (print-job-token) so the app-open web print and this can never
     *  double-print. Luigi 2026-06-22. */
    private void handleBackgroundPrint(String token, String resp) {
        try {
            android.content.SharedPreferences prefs = getSharedPreferences("ffo_printer", MODE_PRIVATE);
            boolean enabled = prefs.getBoolean("enabled", false);
            boolean autoprint = prefs.getBoolean("autoprint", false);
            String ip = prefs.getString("ip", "");
            int width = prefs.getInt("width", 80);
            if (!enabled || !autoprint || ip == null || ip.isEmpty()) return;

            org.json.JSONArray ids = new org.json.JSONObject(resp).optJSONArray("print");
            if (ids == null || ids.length() == 0) return;
            for (int i = 0; i < ids.length(); i++) {
                String orderId = ids.optString(i, "");
                if (orderId.isEmpty() || printedThisSession.contains(orderId)) continue;
                printOrder(token, orderId, ip, width);
            }
        } catch (Exception ignored) {
        }
    }

    private void printOrder(String token, String orderId, String ip, int width) {
        try {
            String base = "https://feefreeordering.com/api/kitchen/print-job-token?token="
                + java.net.URLEncoder.encode(token, "UTF-8")
                + "&orderId=" + java.net.URLEncoder.encode(orderId, "UTF-8");
            // Claim + fetch the receipt jobs (atomic kitchenPrintedAt claim server-side).
            String jobResp = httpGet(base, 15000);
            if (jobResp == null) {
                // The claim+build GET timed out — the server may have claimed
                // kitchenPrintedAt before the slow receipt build finished. Release so
                // the next poll re-offers + retries, instead of a stuck claim
                // permanently hiding the ticket. Idempotent if no claim was made.
                // Luigi 2026-06-22.
                httpGet(base + "&release=1", 8000);
                return;
            }
            org.json.JSONObject root = new org.json.JSONObject(jobResp);
            if (!root.optBoolean("ok", false)) {
                // alreadyPrinted (web / another device won the claim) → done.
                printedThisSession.add(orderId);
                return;
            }
            int w = root.optInt("width", width);
            int widthDots = (w == 58) ? 384 : 576;
            org.json.JSONArray jobs = root.optJSONArray("jobs");
            boolean anyFailed = false;
            boolean anyPrinted = false;
            if (jobs != null) {
                for (int j = 0; j < jobs.length(); j++) {
                    org.json.JSONObject job = jobs.getJSONObject(j);
                    int copies = Math.max(1, Math.min(5, job.optInt("copies", 1)));
                    org.json.JSONArray lines = job.optJSONArray("lines");
                    if (lines == null) continue;
                    String linesJson = lines.toString();
                    for (int c = 0; c < copies; c++) {
                        String result = com.feefreeordering.directprinter.StarXpandBridge.printLines(
                            this, ip, linesJson, widthDots, 12000L);
                        if (!"ok".equals(result)) {
                            anyFailed = true;
                            android.util.Log.w("KitchenKeepAlive", "bg print failed for " + orderId + ": " + result);
                        } else {
                            anyPrinted = true;
                        }
                    }
                }
            }
            if (anyFailed && !anyPrinted) {
                // NOTHING physically printed → release the claim so a later poll retries
                // cleanly (printer off/unreachable). Bounded by the server's 15-min
                // print window. Don't mark printed.
                httpGet(base + "&release=1", 8000);
            } else {
                // Fully printed, OR partially printed (≥1 copy already came out of the
                // cutter). Mark done so we DON'T reprint the successful copies on the
                // next poll — a partial failure loses at most one duplicate copy rather
                // than restarting the whole order in a reprint storm. Luigi 2026-06-22.
                printedThisSession.add(orderId);
                if (anyFailed) {
                    android.util.Log.w("KitchenKeepAlive", "bg partial print for " + orderId + " — kept to avoid reprint storm");
                } else {
                    android.util.Log.i("KitchenKeepAlive", "bg printed order " + orderId);
                }
            }
        } catch (Exception e) {
            android.util.Log.w("KitchenKeepAlive", "printOrder error for " + orderId, e);
        }
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Order listener", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Keeps the app ready to ring for new orders");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, piFlags);
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_recent_history)
                .setContentTitle("Kitchen Order App")
                .setContentText("Listening for new orders")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    @Override
    public void onDestroy() {
        polling = false;
        if (pollThread != null) pollThread.interrupt();
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
