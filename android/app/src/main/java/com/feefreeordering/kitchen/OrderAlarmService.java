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
 * Foreground service that plays the "GloriaFood ring" — the kitchen order sound on the
 * ALARM stream (loud, ignores ring/notification volume), plus a full-screen-intent
 * notification that wakes the screen / shows over the lock screen like an incoming call.
 *
 * v2.6 SINGLE ENGINE (Luigi 2026-06-23): this owns the ring in ALL states (foreground +
 * screen-off) inside the v2.6 app — the WebView suppresses its own ring when the
 * OrderAlarm plugin is present. Started by KitchenMessagingService (FCM) and the
 * KitchenKeepAliveService poll, regardless of foreground. Opening the app does NOT stop
 * it (continuity — the ring never restarts from the top); the WebView HUSHES it per-order
 * when an order DETAIL is opened.
 *
 * Stops when: the poll sees the order leave "pending" (accepted / window expired →
 * ringing:false → stop()), staff tap "Silence", or the MAX_RING_MS safety cap elapses.
 */
public class OrderAlarmService extends Service {

    static final String CHANNEL_ID = "orders_alarm";
    static final int NOTIF_ID = 4711;
    static final String ACTION_STOP = "com.feefreeordering.kitchen.STOP_ALARM";
    static final String ACTION_HUSH = "com.feefreeordering.kitchen.HUSH_ALARM";
    static final String ACTION_REARM = "com.feefreeordering.kitchen.REARM_ALARM";
    // 16-min safety cap (> the longest 15-min closed-when-placed accept window, so a legit long
    // ring is never cut short). Normally the keep-alive poll stops the alarm MUCH sooner — the
    // instant the order is accepted (leaves "pending") or its window expires. This cap only
    // matters if the poll dies. Cleared while hushed + re-armed on rearm so a hush can't let it
    // kill a still-pending order. Luigi 2026-06-23.
    static final long MAX_RING_MS = 16 * 60 * 1000L;
    /** True while the alarm is ringing — the keep-alive poll + FCM both read this
     *  so a re-trigger never restarts the sound, and the poll knows when to stop. */
    static volatile boolean isRunning = false;
    /** Set when the WebView HUSHES the ring because staff OPENED the order detail (v2.6
     *  single-engine, replicating the verified v2.4 stop-on-open). The alarm PAUSES but
     *  the service stays alive (isRunning stays true), so the keep-alive poll's idempotent
     *  guard won't resume it while the order is still pending — only a real stop
     *  (accepted / window expired → ringing:false) or rearm() (staff backed out, or the
     *  app backgrounded) resumes it. Reset on each fresh start + on destroy. Luigi 2026-06-23. */
    static volatile boolean hushedByUser = false;

    private MediaPlayer player;
    private Vibrator vibrator;
    private android.media.AudioManager audioManager;
    /** Per-restaurant: vibrate alongside the ring? Set from the start intent's
     *  "vibrate" extra (default true). Ring-only when false. Luigi 2026-06-16. */
    private boolean vibrateEnabled = true;
    private PowerManager.WakeLock wakeLock;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable autoStop;

    /** Stop any running alarm (order accepted / window expired / force-stop). */
    static void stop(Context ctx) {
        try {
            ctx.startService(new Intent(ctx, OrderAlarmService.class).setAction(ACTION_STOP));
        } catch (Exception ignored) {}
    }

    /** PAUSE the ring (staff opened the order detail) WITHOUT ending the service, so the
     *  poll's idempotent guard keeps it paused. Resumes via rearm(). No-op if not ringing. */
    static void hush(Context ctx) {
        try {
            ctx.startService(new Intent(ctx, OrderAlarmService.class).setAction(ACTION_HUSH));
        } catch (Exception ignored) {}
    }

    /** Resume a hushed ring (staff backed out, or the app backgrounded with the order
     *  still pending so it must ring screen-off again). No-op if nothing is ringing. */
    static void rearm(Context ctx) {
        try {
            ctx.startService(new Intent(ctx, OrderAlarmService.class).setAction(ACTION_REARM));
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
        // HUSH = pause but KEEP the service alive (staff opened the order detail OR pressed
        // Silence). The idempotent guard below sees isRunning==true so a poll/FCM re-trigger
        // won't resume it; only rearm() or a real stop does. Guard against a zombie: if nothing
        // is ringing (or the player is gone after a cap/kill), just stop.
        if (intent != null && ACTION_HUSH.equals(intent.getAction())) {
            if (!isRunning || player == null) { stopSelf(); return START_NOT_STICKY; }
            hushedByUser = true;
            // Pause the MAX_RING_MS safety timer while hushed, else a long look at the order
            // detail could let the cap stopSelf() the paused service out from under a later
            // rearm (→ silent). Re-armed in REARM.
            if (autoStop != null) handler.removeCallbacks(autoStop);
            try { if (player.isPlaying()) player.pause(); } catch (Exception ignored) {}
            return START_STICKY;
        }
        // REARM = resume a hushed ring (back-out / new order / app backgrounded while pending).
        if (intent != null && ACTION_REARM.equals(intent.getAction())) {
            if (!isRunning || player == null) { stopSelf(); return START_NOT_STICKY; }
            hushedByUser = false;
            try { if (!player.isPlaying()) player.start(); } catch (Exception ignored) {}
            // Re-arm the safety cap from now (it was cleared on hush).
            if (autoStop != null) { handler.removeCallbacks(autoStop); handler.postDelayed(autoStop, MAX_RING_MS); }
            return START_STICKY;
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
        hushedByUser = false;
        startAlarm();
        // Play the FULL official GloriaFood ring (it intensifies in its final ~40s).
        // The keep-alive poll stops it the INSTANT the order is accepted (leaves
        // "pending") or its accept window expires; an auto-accepted order rings only
        // for its short ~8s ring window. This MAX_RING_MS cap is just a safety net in
        // case the poll ever dies, so it never rings forever. Luigi 2026-06-22.
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

        // Force the ALARM stream to MAX so the ring is LOUD regardless of the
        // device's alarm-volume slider (kitchen tablets are plugged in + must be
        // heard across the kitchen). Luigi 2026-06-22.
        try {
            audioManager = (android.media.AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                int max = audioManager.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM);
                audioManager.setStreamVolume(android.media.AudioManager.STREAM_ALARM, max, 0);
            }
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
            // Play the FULL ring once (it intensifies at the end). If it finishes
            // while the order is still pending, end the service so the keep-alive
            // poll restarts it on its next ~4s tick. Luigi 2026-06-22.
            //
            // LOUDNESS: order_alarm.mp3 is PRE-BAKED loud — the in-app ring's exact 6x
            // gain + -1.5 dBFS brick-wall limiter rendered into the file (regenerate
            // via scripts/bake-order-alarm.ps1). So it plays as loud as the foreground
            // ring with NO runtime processing. We deliberately do NOT use a
            // LoudnessEnhancer: it's a COMPRESSOR, which lifts the quiet intro up to the
            // crescendo's level and flattens the final-40s swell (Luigi 2026-06-22:
            // background "doesn't intensify"). The baked file keeps the full dynamic
            // range, so the screen-off ring is identical to the in-app one. Luigi 2026-06-22.
            player.setLooping(false);
            // Continuity (v2.6): if the full track finishes while the order is STILL
            // pending and not hushed, replay it seamlessly (no stopSelf → poll-restart
            // gap) so the ring is one continuous stream first→last. A real stop
            // (accept/expire) comes through the poll's stop(); a hush pauses (so the track
            // never completes while hushed). Each replay is the full baked-loud file, so
            // every pass still intensifies in its final ~40s. Luigi 2026-06-23.
            player.setOnCompletionListener(mp -> {
                try {
                    if (isRunning && !hushedByUser) { mp.seekTo(0); mp.start(); }
                    else stopSelf();
                } catch (Exception ignored) { stopSelf(); }
            });
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
        hushedByUser = false;
        if (autoStop != null) handler.removeCallbacks(autoStop);
        try { if (player != null) { player.stop(); player.release(); player = null; } } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
