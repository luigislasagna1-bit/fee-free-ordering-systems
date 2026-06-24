package com.feefreeordering.kitchen;

import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Extends the Capacitor push plugin's FirebaseMessagingService so we keep its
 * JS delivery + token handling, and ADD the "GloriaFood ring": when a new-order
 * data push arrives while the app is NOT in the foreground, start the loud
 * looping alarm (OrderAlarmService) that wakes the screen and rings until staff
 * open the order. In the foreground the in-app kitchen alarm already handles it,
 * so we skip the native alarm to avoid double sound. Luigi 2026-06-15.
 *
 * Registered in AndroidManifest.xml in place of the plugin's own service (which
 * is removed there), so FCM dispatches here. super.onMessageReceived keeps the
 * plugin's pushNotificationReceived JS event + token refresh working.
 */
public class KitchenMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Preserve Capacitor's behaviour (JS event when the app is alive).
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if (data == null) return;
        if (!"new_order".equals(data.get("type"))) return;

        // v2.6 single-engine: the native alarm owns the ring in ALL states (the v2.6
        // WebView suppresses its own ring when the OrderAlarm plugin is present), so fire
        // the (idempotent) alarm regardless of foreground — no double-ring, and a foreground
        // push rings instantly. The hush latch + idempotent guard keep a currently-open
        // order paused. Luigi 2026-06-23.
        // K3: an auto-accepted order is a brief FYI — ring it ONCE for ~3s (the native
        // OrderAlarmService honours the autoAccept extra), deduped across this FCM push +
        // the keep-alive poll so it never double-rings. A pending order has autoAccept=false
        // → the full urgent alarm rings until staff act. Luigi 2026-06-23.
        boolean autoAccept = "true".equals(data.get("autoAccept"));
        if (autoAccept && !OrderAlarmService.claimAutoRing(data.get("orderId"))) return; // already rang this one

        Intent i = new Intent(this, OrderAlarmService.class);
        i.putExtra("title", data.get("title") != null ? data.get("title") : "New order");
        i.putExtra("body", data.get("body") != null ? data.get("body") : "");
        // Restaurant ring+vibrate vs ring-only preference (default true unless the
        // push data explicitly carries "false"). Luigi 2026-06-16.
        i.putExtra("vibrate", !"false".equals(data.get("vibrate")));
        i.putExtra("autoAccept", autoAccept);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(i);
            } else {
                startService(i);
            }
        } catch (Exception e) {
            // Background FGS start can be refused under heavy battery restriction.
            // The high-priority FCM message normally grants the exemption; if it
            // doesn't, we simply miss the loud alarm (the in-app poll still shows
            // the order). Nothing else in the app is affected.
        }
    }
}
