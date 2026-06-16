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
        super.onCreate(savedInstanceState);
        requestBatteryExemption();
        startKeepAlive();
        createLoudOrderChannel();
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
        // Opening the app silences the loud order alarm; the in-app kitchen ring
        // + accept countdown take over from here.
        OrderAlarmService.stop(this);
    }

    @Override
    public void onPause() {
        isForeground = false;
        super.onPause();
    }
}
