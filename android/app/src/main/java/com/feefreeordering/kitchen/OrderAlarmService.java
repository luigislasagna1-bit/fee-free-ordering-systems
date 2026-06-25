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

import android.content.SharedPreferences;
import android.media.audiofx.LoudnessEnhancer;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

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
    /** Auto-accepted "FYI" ring length — short (the order is already accepted + printed),
     *  NOT the full urgent alarm that rings until staff act. Luigi 2026-06-23 (K3). Tune here. */
    static final long AUTO_RING_MS = 3000L;
    /** True while the alarm is ringing — the keep-alive poll + FCM both read this
     *  so a re-trigger never restarts the sound, and the poll knows when to stop. */
    static volatile boolean isRunning = false;
    /** True while the CURRENT ring is a short auto-accept FYI (vs the full urgent alarm).
     *  The keep-alive poll reads this so its ringing:false stop never cuts a self-limiting
     *  auto ring short — only the AUTO_RING_MS timer ends it. Reset on destroy. Luigi 2026-06-23. */
    static volatile boolean autoMode = false;
    /** Order ids already given their one auto-accept FYI ring this app run, so the FCM push
     *  AND the keep-alive poll (both can see the same auto order) ring it exactly once.
     *  Mirrors KitchenKeepAliveService.printedThisSession. Luigi 2026-06-23 (K3). */
    static final java.util.Set<String> autoRangThisSession =
        java.util.Collections.synchronizedSet(new java.util.HashSet<String>());

    /** Claim the one-time auto ring for this order id. Returns true the FIRST time (→ ring),
     *  false thereafter (→ skip). A null/empty id is never deduped (always rings). */
    static boolean claimAutoRing(String orderId) {
        if (orderId == null || orderId.isEmpty()) return true;
        return autoRangThisSession.add(orderId);
    }

    // ── Custom alert sound (Luigi 2026-06-25) ──────────────────────────────────────
    // The owner can upload a CUSTOM ring; when set, it REPLACES the built-in alarm on the
    // app. The WebView (via OrderAlarmPlugin.setCustomSound) hands us the URL while the app
    // is foreground; we download it to a LOCAL file so the screen-off ring plays it with the
    // same reliability as the bundled R.raw alarm (no network at ring time). ANY failure
    // falls back to the baked alarm, so a ring ALWAYS fires.
    static final String PREFS = "ff_kitchen_alarm";
    static final String KEY_CUSTOM_URL = "customSoundUrl";
    static final String KEY_CUSTOM_PATH = "customSoundPath";
    static final String CUSTOM_FILE = "custom_alarm_sound";
    /** Loudness boost (millibels) applied to the CUSTOM sound ONLY — a raw upload isn't
     *  pre-amplified like the baked alarm. Tune here if owners' sounds ring too quiet/loud. */
    static final int CUSTOM_GAIN_MB = 800;

    /** Receive the restaurant's custom alert-sound URL (or null/empty to clear). Caches the
     *  file locally on a background thread; idempotent for an unchanged URL already cached. */
    static void setCustomSoundUrl(final Context ctx, final String url) {
        final SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (url == null || url.trim().isEmpty()) {
            sp.edit().remove(KEY_CUSTOM_URL).remove(KEY_CUSTOM_PATH).apply();
            try { new File(ctx.getFilesDir(), CUSTOM_FILE).delete(); } catch (Exception ignored) {}
            return;
        }
        final String current = sp.getString(KEY_CUSTOM_URL, null);
        final String cachedPath = sp.getString(KEY_CUSTOM_PATH, null);
        if (url.equals(current) && cachedPath != null && new File(cachedPath).exists()) return; // already cached
        new Thread(() -> {
            InputStream in = null; FileOutputStream out = null;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(20000);
                conn.connect();
                if (conn.getResponseCode() != 200) return;
                in = conn.getInputStream();
                File f = new File(ctx.getFilesDir(), CUSTOM_FILE);
                out = new FileOutputStream(f);
                byte[] buf = new byte[8192]; int n; long total = 0;
                while ((n = in.read(buf)) != -1) { out.write(buf, 0, n); total += n; if (total > 20_000_000L) break; }
                out.flush();
                if (total > 0) sp.edit().putString(KEY_CUSTOM_URL, url).putString(KEY_CUSTOM_PATH, f.getAbsolutePath()).apply();
            } catch (Exception ignored) {
            } finally {
                try { if (in != null) in.close(); } catch (Exception ignored) {}
                try { if (out != null) out.close(); } catch (Exception ignored) {}
            }
        }).start();
    }

    /** The cached custom-sound file path if one is ready, else null (→ play the baked alarm). */
    static String cachedCustomSoundPath(Context ctx) {
        try {
            String path = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CUSTOM_PATH, null);
            if (path != null) { File f = new File(path); if (f.exists() && f.length() > 0) return path; }
        } catch (Exception ignored) {}
        return null;
    }
    /** Set when the WebView HUSHES the ring because staff OPENED the order detail (v2.6
     *  single-engine, replicating the verified v2.4 stop-on-open). The alarm PAUSES but
     *  the service stays alive (isRunning stays true), so the keep-alive poll's idempotent
     *  guard won't resume it while the order is still pending — only a real stop
     *  (accepted / window expired → ringing:false) or rearm() (staff backed out, or the
     *  app backgrounded) resumes it. Reset on each fresh start + on destroy. Luigi 2026-06-23. */
    static volatile boolean hushedByUser = false;

    private MediaPlayer player;
    private LoudnessEnhancer loudnessEnhancer;
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
            // A short auto-accept FYI (autoMode) IGNORES hush — hush/rearm exist ONLY for the
            // full pending alarm's stop-on-open-detail UX. The WebView's shouldHush effect fires
            // rearm-in-its-else for any non-pending state (i.e. ALWAYS, for an already-accepted
            // order), which would otherwise cancel the 3s autoStop and let the full 245s track
            // play. Let the auto ring keep its own 3s timer. Luigi 2026-06-23 (K3 fix → v2.8).
            if (autoMode) return START_STICKY;
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
            // A short auto-accept FYI (autoMode) IGNORES rearm — its original 3s autoStop MUST
            // stand. Without this, the WebView's nativeRearmAlarm() (fired for any non-pending
            // state, so always for an auto order) re-posts autoStop at MAX_RING_MS and the full
            // 245s track plays out (~4 min) — the exact K3 bug. Luigi 2026-06-23 (K3 fix → v2.8).
            if (autoMode) return START_STICKY;
            hushedByUser = false;
            try { if (!player.isPlaying()) player.start(); } catch (Exception ignored) {}
            // Re-arm the safety cap from now (it was cleared on hush).
            if (autoStop != null) { handler.removeCallbacks(autoStop); handler.postDelayed(autoStop, MAX_RING_MS); }
            return START_STICKY;
        }
        // Auto-accepted order → a SHORT ~3s FYI ring (it's already accepted + printed),
        // NOT the full urgent alarm. The FCM + poll dedup via claimAutoRing so it rings
        // exactly once, and the poll leaves autoMode rings alone. Luigi 2026-06-23 (K3).
        boolean autoAccept = intent != null && intent.getBooleanExtra("autoAccept", false);
        // Idempotent: a second start while already ringing (the poll AND an FCM push can
        // both ask) must NOT restart the sound — just keep ringing. EXCEPTION: if a short
        // auto-FYI is currently ringing and a real PENDING start arrives, UPGRADE it in
        // place to the full alarm (clear autoMode + re-arm the long safety cap) so an urgent
        // order is never cut short at ~3s — no sound restart, no double-ring. Luigi 2026-06-23.
        if (isRunning && player != null) {
            if (autoMode && !autoAccept) {
                autoMode = false;
                if (autoStop != null) { handler.removeCallbacks(autoStop); handler.postDelayed(autoStop, MAX_RING_MS); }
            }
            return START_STICKY;
        }
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "New order";
        String body = intent != null && intent.getStringExtra("body") != null ? intent.getStringExtra("body") : "";
        // Restaurant preference forwarded by the FCM push + the keep-alive poll:
        // ring + vibrate (default) vs ring only. Read on the FIRST start — a
        // re-trigger while already ringing returns early above. Luigi 2026-06-16.
        vibrateEnabled = intent == null || intent.getBooleanExtra("vibrate", true);
        autoMode = autoAccept;

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
        // Pending order: play the FULL ring (it intensifies in its final ~40s); the
        // keep-alive poll stops it the INSTANT the order is accepted (leaves "pending") or
        // its window expires, and MAX_RING_MS is a safety net if the poll ever dies.
        // Auto-accepted order: a short fixed ~3s FYI — the poll deliberately leaves autoMode
        // rings alone, so THIS timer is its only stop (a reliable ~3s regardless of poll
        // timing). Luigi 2026-06-23.
        autoStop = this::stopSelf;
        handler.postDelayed(autoStop, autoAccept ? AUTO_RING_MS : MAX_RING_MS);
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

        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        // Continuity (v2.6): if the track finishes while the order is STILL pending and not
        // hushed, replay it seamlessly (no stopSelf → poll-restart gap) so the ring is one
        // continuous stream first→last. A short auto-FYI (autoMode) never self-replays. A real
        // stop (accept/expire) comes through the poll's stop(); a hush pauses. Luigi 2026-06-23.
        final MediaPlayer.OnCompletionListener replay = mp -> {
            try {
                if (isRunning && !hushedByUser && !autoMode) { mp.seekTo(0); mp.start(); }
                else stopSelf();
            } catch (Exception ignored) { stopSelf(); }
        };
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(attrs);
            player.setLooping(false);
            player.setOnCompletionListener(replay);

            // CUSTOM SOUND (Luigi 2026-06-25): if the owner uploaded a custom alert sound and
            // we cached it locally, play THAT — it REPLACES the built-in alarm on the app. The
            // cache is a LOCAL file, so screen-off reliability is identical to R.raw. ANY failure
            // (no cache / bad format / decode error) falls through to the baked alarm below, so a
            // ring ALWAYS fires. ADDITIVE: no custom set → byte-identical to the baked-only path.
            boolean usedCustom = false;
            String customPath = cachedCustomSoundPath(this);
            if (customPath != null) {
                try {
                    player.setDataSource(customPath);
                    player.prepare();
                    usedCustom = true;
                } catch (Exception customErr) {
                    try {
                        player.reset();
                        player.setAudioAttributes(attrs);
                        player.setLooping(false);
                        player.setOnCompletionListener(replay);
                    } catch (Exception ignored) {}
                    usedCustom = false;
                }
            }
            if (!usedCustom) {
                // Baked alarm (UNCHANGED): order_alarm.mp3 is PRE-BAKED loud — the in-app ring's
                // exact 6x gain + -1.5 dBFS brick-wall limiter rendered into the file (regenerate
                // via scripts/bake-order-alarm.ps1). Plays as loud as the foreground ring with NO
                // runtime processing; we deliberately do NOT LoudnessEnhance it — that's a
                // compressor → it flattens the final-40s crescendo. Luigi 2026-06-22.
                AssetFileDescriptor afd = getResources().openRawResourceFd(R.raw.order_alarm);
                player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();
                player.prepare();
            }
            player.start();

            // A raw custom upload isn't pre-amplified like the baked file — lift it with a
            // LoudnessEnhancer on the CUSTOM path ONLY (the baked crescendo stays untouched).
            if (usedCustom) {
                try {
                    loudnessEnhancer = new LoudnessEnhancer(player.getAudioSessionId());
                    loudnessEnhancer.setTargetGain(CUSTOM_GAIN_MB);
                    loudnessEnhancer.setEnabled(true);
                } catch (Exception ignored) {}
            }
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
        autoMode = false;
        hushedByUser = false;
        if (autoStop != null) handler.removeCallbacks(autoStop);
        try { if (loudnessEnhancer != null) { loudnessEnhancer.release(); loudnessEnhancer = null; } } catch (Exception ignored) {}
        try { if (player != null) { player.stop(); player.release(); player = null; } } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
