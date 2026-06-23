package com.feefreeordering.kitchen;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Doze-proof heartbeat (K1 reliability, Luigi 2026-06-23).
 *
 * Aggressive OEMs — Samsung One UI on Android 10 (S20/S20+) is the worst — kill the
 * keep-alive foreground service AND throttle FCM once the screen has been off a while
 * (App Standby / deep sleep), so a screen-off order silently doesn't ring even with
 * battery optimization disabled. We schedule a while-idle alarm to wake, restart the
 * keep-alive service (idempotent → its poll re-asserts), and reschedule the next beat.
 *
 * Honest expectations: on pre-API-31 (the Samsung A10 target) this is an EXACT ~90s beat
 * (no permission needed there — exactly where the gap is). On API 31+ the OS throttles
 * while-idle alarms to its Doze maintenance window (~10 min), so it's best-effort there —
 * fine, since those devices ring via FCM + the poll and kitchen tablets are plugged in (no
 * Doze). This is the third INDEPENDENT ring trigger alongside FCM + the 4s poll; if any one
 * survives a device's battery management, the order rings. NOTE: on aggressive Samsung One
 * UI the app must ALSO be added to "Never sleeping apps" (a list separate from battery
 * optimization) for screen-off reliability — code alone can't escape it.
 */
public class HeartbeatReceiver extends BroadcastReceiver {
    static final String ACTION_BEAT = "com.feefreeordering.kitchen.HEARTBEAT";
    static final long INTERVAL_MS = 90_000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        // Revive the keep-alive poll (idempotent — no-op if already running). Wrapped so
        // an OEM FGS-start refusal can never crash the beat; the reschedule still happens.
        try {
            Intent svc = new Intent(context, KitchenKeepAliveService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
        } catch (Exception ignored) {}
        schedule(context);
    }

    /** (Re)schedule the next exact-while-idle beat. Idempotent — FLAG_UPDATE_CURRENT
     *  replaces any prior PendingIntent so beats never pile up. Safe to call repeatedly
     *  (MainActivity.onCreate, boot, each beat). */
    static void schedule(Context context) {
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(context, HeartbeatReceiver.class).setAction(ACTION_BEAT);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(context, 0, i, flags);
            long next = System.currentTimeMillis() + INTERVAL_MS;
            // API 31+ gates EXACT alarms behind a Play-reviewed permission we deliberately don't
            // claim (a restaurant app isn't an alarm clock) AND throttles setExactAndAllowWhileIdle
            // to ~once/10-min anyway — so use INEXACT while-idle there (no permission, Play-safe;
            // fires in the Doze maintenance window). Pre-31 (Samsung A10 target — exactly where the
            // screen-off gap is) needs NO permission for exact, so keep the precise ~90s beat.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, next, pi);
            }
        } catch (Exception ignored) {}
    }
}
