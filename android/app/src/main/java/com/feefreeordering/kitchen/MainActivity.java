package com.feefreeordering.kitchen;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;
import com.feefreeordering.directprinter.DirectPrinterPlugin;

/**
 * MainActivity — Capacitor's host Activity that owns the WebView.
 *
 * Override onCreate() to register our custom DirectPrinter plugin
 * BEFORE super.onCreate() runs the bridge init. Otherwise the bridge
 * starts the WebView without knowing the plugin exists and JS calls
 * to `Capacitor.Plugins.DirectPrinter.print()` would resolve undefined.
 *
 * Plugin registration order is irrelevant for built-in plugins (those
 * are auto-registered via the @CapacitorPlugin annotation scanner),
 * but custom plugins in a non-default package need this explicit
 * registerPlugin() call.
 */
public class MainActivity extends BridgeActivity {
    /** True while the kitchen UI is in the foreground. KitchenMessagingService
     *  reads this to decide whether to fire the native loud alarm (background /
     *  screen-off only — the in-app alarm already covers the foreground).
     *  Luigi 2026-06-15. */
    static volatile boolean isForeground = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DirectPrinterPlugin.class);
        registerPlugin(OrderAlarmPlugin.class);
        super.onCreate(savedInstanceState);
        // Allow the in-app web ring (the loud official GloriaFood track) to autoplay
        // with NO screen tap — the kitchen must never have to tap to make sound. The
        // WebView blocks audio until a user gesture by default. Luigi 2026-06-22.
        try {
            android.webkit.WebSettings ws = getBridge().getWebView().getSettings();
            ws.setMediaPlaybackRequiresUserGesture(false);
            // Stop the OS Dark theme from auto-inverting our light-only web app — the WebView is the
            // surface Android force-darks (images vanish, colors invert; Fabrizio 2026-06-24). Version-
            // aware: algorithmic-darkening OFF on API 33+, legacy force-dark OFF on 29-32; no-op on older
            // (force-dark didn't exist). Pairs with the web <meta color-scheme:light> + theme flag.
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(ws, false);
            } else if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                WebSettingsCompat.setForceDark(ws, WebSettingsCompat.FORCE_DARK_OFF);
            }
        } catch (Exception ignored) {}
        requestBatteryExemption();
        startKeepAlive();
        createLoudOrderChannel();
        // Doze-proof heartbeat: re-asserts the keep-alive poll even after aggressive OEMs
        // (Samsung One UI) kill it in deep sleep — the reliable screen-off ring path (K1).
        HeartbeatReceiver.schedule(this);
    }

    /** Create the loud "orders_loud2" notification channel (Android 8+) whose
     *  sound is the CONTINUOUS order ring (order_alarm_long) on the ALARM stream,
     *  so a new-order notification rings loud + continuously even from the lock
     *  screen, and overrides silent/DND. On Android 7.x there are no channels —
     *  the FCM message's own sound field plays the ring instead. Luigi 2026-06-16. */
    private void createLoudOrderChannel() {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) return;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null || nm.getNotificationChannel("orders_loud2") != null) return;
            NotificationChannel ch = new NotificationChannel(
                    "orders_loud2", "New orders", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Loud continuous ring when a new order arrives");
            Uri sound = Uri.parse("android.resource://" + getPackageName() + "/raw/order_alarm_long");
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            ch.setSound(sound, attrs);
            ch.enableVibration(true);
            ch.setBypassDnd(true);
            nm.createNotificationChannel(ch);
        } catch (Exception ignored) {
        }
    }

    /** Start the always-on keep-alive service so Android never app-standby /
     *  deep-sleep throttles the new-order alarm push. Idempotent — safe to call
     *  on every launch. Luigi 2026-06-16. */
    private void startKeepAlive() {
        try {
            Intent svc = new Intent(this, KitchenKeepAliveService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(svc);
            } else {
                startService(svc);
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Ask Android to exempt this app from battery optimization (a one-tap
     * "Allow" dialog). Without it the OS puts the app to sleep when the screen
     * is off and DELAYS/DROPS the high-priority data push that fires the loud
     * new-order alarm — so orders silently don't ring (the exact bug Luigi hit
     * 2026-06-16). Only prompts when not already exempt, so it appears once and
     * never again after the owner allows it. Kitchen tablets are plugged in, so
     * there's no real battery cost.
     */
    private void requestBatteryExemption() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        } catch (Exception ignored) {
            // Some OEMs hide this intent; the owner can still set it manually.
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        isForeground = true;
        // v2.6 single-engine (continuity): do NOT stop the native alarm on open — it keeps
        // playing seamlessly so the ring never restarts from the top when staff open the
        // app. The WebView hushes it (per-order) when an order DETAIL is opened, and the
        // poll stops it on accept/expiry. (v2.5 + browser still use the web ring; this
        // native engine only owns the ring when the OrderAlarm plugin is present, which the
        // WebView detects.) Luigi 2026-06-23.
    }

    @Override
    public void onPause() {
        isForeground = false;
        // Backgrounding / screen-off clears any "viewing the order detail" hush so a
        // still-pending order rings screen-off again (the WebView also does this via its
        // visibility handler — this is the native safety net). No-op if nothing's ringing.
        OrderAlarmService.rearm(this);
        super.onPause();
    }
}
