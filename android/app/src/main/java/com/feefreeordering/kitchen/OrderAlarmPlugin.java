package com.feefreeordering.kitchen;

import android.content.pm.PackageInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for the v2.6 single-engine ring (Luigi 2026-06-23).
 *
 * The kitchen WebView drives the native OrderAlarmService through this:
 *   - hush()  → staff OPENED an order detail: PAUSE the ring without ending the
 *               service, so the keep-alive poll's idempotent guard keeps it paused
 *               (replicates the verified v2.4 stop-on-open-detail UX, per-order).
 *   - rearm() → staff backed out / a new order arrived / the app backgrounded with an
 *               order still pending: RESUME the ring.
 *   - stop()  → force-stop.
 *
 * Crucially, the mere PRESENCE of this plugin is how the WebView knows it's running on a
 * v2.6 app, so it suppresses its own web ring (single engine). A v2.5 app has no
 * OrderAlarm plugin → its WebView keeps the old two-engine web ring untouched. That
 * backward-compat gate is what makes the web change safe to deploy before everyone
 * upgrades. See src/lib/native-order-alarm.ts.
 */
@CapacitorPlugin(name = "OrderAlarm")
public class OrderAlarmPlugin extends Plugin {
    @PluginMethod
    public void hush(PluginCall call) {
        OrderAlarmService.hush(getContext());
        call.resolve();
    }

    @PluginMethod
    public void rearm(PluginCall call) {
        OrderAlarmService.rearm(getContext());
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        OrderAlarmService.stop(getContext());
        call.resolve();
    }

    /** Hand the native side the restaurant's custom alert-sound URL (or "" / null to clear) so
     *  it downloads + caches the file locally for the screen-off ring. A cached custom sound
     *  REPLACES the built-in alarm; if it's missing/undecodable the alarm falls back to the
     *  baked sound, so a ring always fires. Called by the WebView while foreground. Luigi 2026-06-25. */
    @PluginMethod
    public void setCustomSound(PluginCall call) {
        OrderAlarmService.setCustomSoundUrl(getContext(), call.getString("url", ""));
        call.resolve();
    }

    /** No-op the WebView can call to confirm the plugin exists (v2.6 detection). */
    @PluginMethod
    public void ping(PluginCall call) {
        call.resolve();
    }

    /** App version (name + code) so the WebView can show it in the 3-dot menu + login (A1).
     *  Read from PackageManager so it works without the BuildConfig feature. Luigi 2026-06-23. */
    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo pi = getContext().getPackageManager()
                    .getPackageInfo(getContext().getPackageName(), 0);
            ret.put("version", pi.versionName);
            ret.put("build", pi.versionCode);
        } catch (Exception e) {
            ret.put("version", "");
        }
        call.resolve(ret);
    }
}
