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
                    token = com.google.android.gms.tasks.Tasks.await(
                            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken());
                } catch (Exception e) {
                    token = null;
                }
                if (token == null) {
                    try { Thread.sleep(5000); } catch (InterruptedException e) { return; }
                }
            }
            while (polling) {
                try {
                    boolean ringing = token != null && checkRinging(token);
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
                } catch (Exception ignored) {
                }
                try { Thread.sleep(4000); } catch (InterruptedException e) { break; }
            }
        });
        pollThread.setDaemon(true);
        pollThread.start();
    }

    private boolean checkRinging(String token) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(POLL_URL + java.net.URLEncoder.encode(token, "UTF-8"));
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setRequestMethod("GET");
            if (conn.getResponseCode() != 200) return false;
            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
            br.close();
            String resp = sb.toString();
            // Vibration preference rides along on the same poll (default true unless
            // the response explicitly says "vibrate":false). Luigi 2026-06-16.
            lastVibrate = !resp.contains("\"vibrate\":false");
            return resp.contains("\"ringing\":true");
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
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
