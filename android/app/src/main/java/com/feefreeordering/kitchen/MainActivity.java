package com.feefreeordering.kitchen;

import android.os.Bundle;

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
