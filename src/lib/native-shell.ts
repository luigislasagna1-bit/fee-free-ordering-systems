"use client";
/**
 * Branded Mobile App — web-side shell bootstrap (Luigi 2026-08-02).
 *
 * Loaded by the customer ordering layout ONLY when running inside a Capacitor
 * shell (isNativeShell). Wires the native surfaces the 4.2-clearing shell
 * needs: deep-link routing (appUrlOpen), Android back-button sanity, and
 * push registration AFTER the first order (never prompt on launch).
 *
 * All Capacitor access is via the injected window.Capacitor bridge — no
 * @capacitor/* imports so this file is a no-op in every regular browser and
 * adds nothing to the web bundle.
 */

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as any).Capacitor;
    return !!cap && (typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : !!cap.isNative);
  } catch {
    return false;
  }
}

function plugin(name: string): any | null {
  try {
    return (window as any).Capacitor?.Plugins?.[name] ?? null;
  } catch {
    return null;
  }
}

let booted = false;

/** Idempotent bootstrap — call from the order layout when in a shell. */
export function bootNativeShell(opts: { slug: string }): void {
  if (booted || !isNativeShell()) return;
  booted = true;

  // Deep links: push taps + app links (order status, PayPal return) navigate
  // in-app instead of opening a new browser context.
  const app = plugin("App");
  if (app?.addListener) {
    app.addListener("appUrlOpen", (event: { url?: string }) => {
      try {
        if (!event?.url) return;
        const url = new URL(event.url);
        window.location.assign(url.pathname + url.search);
      } catch {
        /* malformed deep link — ignore */
      }
    });

    // Android back: browser-style history back; at the menu root, minimize
    // instead of killing the app mid-session (never exit-on-back mid-cart).
    app.addListener("backButton", (ev: { canGoBack?: boolean }) => {
      if (ev?.canGoBack ?? window.history.length > 1) {
        window.history.back();
      } else {
        app.minimizeApp?.();
      }
    });
  }

  // Push-notification taps: route to the payload's url when present.
  const push = plugin("PushNotifications");
  if (push?.addListener) {
    push.addListener("pushNotificationActionPerformed", (action: { notification?: { data?: { url?: string } } }) => {
      const url = action?.notification?.data?.url;
      if (!url) return;
      try {
        const u = new URL(url, window.location.origin);
        window.location.assign(u.pathname + u.search);
      } catch { /* ignore */ }
    });
    // Token registration handshake — fires after requestPushPermission().
    push.addListener("registration", async (token: { value?: string }) => {
      if (!token?.value) return;
      try {
        const platform = (window as any).Capacitor?.getPlatform?.() === "ios" ? "ios" : "android";
        await fetch(`/api/restaurants/${opts.slug}/account/push/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.value, platform }),
        });
      } catch { /* best-effort */ }
    });
  }
}

const ASKED_KEY = "ff_push_prompted";

/**
 * Ask for push permission — call from the order CONFIRMATION surface (after
 * the first order), never on launch: "get notified when your order is ready"
 * converts; a cold-launch prompt gets denied and can never be re-asked.
 * Remembers a denial and never re-asks.
 */
export async function requestPushPermission(): Promise<void> {
  if (!isNativeShell()) return;
  const push = plugin("PushNotifications");
  if (!push) return;
  try {
    if (localStorage.getItem(ASKED_KEY) === "denied") return;
    const status = await push.checkPermissions?.();
    if (status?.receive === "granted") {
      await push.register?.();
      return;
    }
    const asked = await push.requestPermissions?.();
    if (asked?.receive === "granted") {
      localStorage.setItem(ASKED_KEY, "granted");
      await push.register?.();
    } else {
      localStorage.setItem(ASKED_KEY, "denied");
    }
  } catch { /* best-effort */ }
}
