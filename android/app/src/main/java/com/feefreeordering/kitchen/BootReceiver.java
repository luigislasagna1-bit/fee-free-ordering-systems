package com.feefreeordering.kitchen;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * On device boot, re-arm the keep-alive service + the Doze heartbeat (Luigi 2026-06-23).
 *
 * Kitchen tablets reboot on power blips; without this they wouldn't ring for new orders
 * until someone manually opened the app. On Android 12+ a background FGS-start from boot
 * can be refused (caught below) — but the heartbeat we schedule here fires ~90s later
 * under the exact-alarm exemption and starts the service then, so it self-heals.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            try {
                Intent svc = new Intent(context, KitchenKeepAliveService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(svc);
                } else {
                    context.startService(svc);
                }
            } catch (Exception ignored) {}
            HeartbeatReceiver.schedule(context);
        }
    }
}
