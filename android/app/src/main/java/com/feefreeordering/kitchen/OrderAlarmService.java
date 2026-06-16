package com.feefreeordering.kitchen;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service that plays the "GloriaFood ring" — the kitchen order sound,
 * LOOPING on the ALARM stream (loud, ignores ring/notification volume), plus a
 * full-screen-intent notification that wakes the screen / shows over the lock
 * screen like an incoming call. Started by KitchenMessagingService on a new
 * order when the app is backgrounded / screen off / closed.
 *
 * Stops when: staff open the app (MainActivity.onResume calls stop()), they tap
 * "Silence", or a 2-minute safety cap elapses (so it never rings forever).
 * Luigi 2026-06-15.
 */
public class OrderAlarmService extends Service {

    static final String CHANNEL_ID = "orders_alarm";
    static final int NOTIF_ID = 4711;
    static final String ACTION_STOP = "com.feefreeordering.kitchen.STOP_ALARM";
    // 5-min safety cap. Normally the keep-alive poll stops the alarm MUCH sooner
    // — the instant the order is accepted (leaves "pending") or its accept window
    // expires. This cap only matters if the poll dies. Luigi 2026-06-16.
    static final long MAX_RING_MS = 300_000L;
    /** True while the alarm is ringing — the keep-alive poll + FCM both read this
     *  so a re-trigger never restarts the sound, and the poll knows when to stop. */
    static volatile boolean isRunning = false;

    private MediaPlayer player;
    private Vibrator vibrator;
    /** Per-restaurant: vibrate alongside the ring? Set from the start intent's
     *  "vibrate" extra (default true). Ring-only when false. Luigi 2026-06-16. */
    private boolean vibrateEnabled = true;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable autoStop;

    /** Stop any running alarm — called from MainActivity when the app opens. */
    static void stop(Context ctx) {
        try {
            ctx.startService(new Intent(ctx, OrderAlarmService.class).setAction(ACTION_STOP));
        } catch (Exception ignored) {}
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // Idempotent: a second start while already ringing (the poll AND an FCM
        // push can both ask) must NOT restart the sound — just keep ringing.
        if (isRunning && player != null) {
            return START_STICKY;
        }
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "New order";
        String body = intent != null && intent.getStringExtra("body") != null ? intent.getStringExtra("body") : "";
        // Restaurant preference forwarded by the FCM push + the keep-alive poll:
        // ring + vibrate (default) vs ring only. Read on the FIRST start — a
        // re-trigger while already ringing returns early above. Luigi 2026-06-16.
        vibrateEnabled = intent == null || intent.getBooleanExtra("vibrate", true);

        Notification n = buildNotification(title, body);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }

        isRunning = true;
        startAlarm();
        autoStop = this::stopSelf;
        handler.postDelayed(autoStop, MAX_RING_MS);
        return START_STICKY;
    }

    private Notification buildNotification(String title, String body) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Incoming orders", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Loud alarm when a new order arrives");
            ch.setSound(null, null); // we play our own looping sound on the alarm stream
            ch.enableVibration(false);
            ch.setBypassDnd(true);
            nm.createNotificationChannel(ch);
        }

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent open = new Intent(this, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPi = PendingIntent.getActivity(this, 0, open, piFlags);

        PendingIntent stopPi = PendingIntent.getService(this, 1,
                new Intent(this, OrderAlarmService.class).setAction(ACTION_STOP), piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(true)
                .setFullScreenIntent(openPi, true) // wake screen / show over lock screen
                .setContentIntent(openPi)
                .addAction(0, "Open order", openPi)
                .addAction(0, "Silence", stopPi)
                .build();
    }

    private void startAlarm() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "feefree:orderAlarm");
            wakeLock.acquire(MAX_RING_MS + 5_000L);
        } catch (Exception ignored) {}

        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            AssetFileDescriptor afd = getResources().openRawResourceFd(R.raw.order_alarm);
            player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {}

        // Vibration is OPTIONAL per the restaurant's setting; the ring above always
        // plays. The notification channel has vibration off, so this explicit
        // waveform is the only buzz source — skipping it gives true ring-only.
        if (vibrateEnabled) {
            try {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                long[] pattern = {0, 800, 600};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (autoStop != null) handler.removeCallbacks(autoStop);
        try { if (player != null) { player.stop(); player.release(); player = null; } } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
