import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import UserNotifications

/**
 * AppDelegate — mostly the stock Capacitor template PLUS the native-push
 * wiring that makes the order alarm ring when the app is closed, locked or
 * backgrounded (Luigi 2026-07-04; iOS parity with Android's finalized ring
 * behavior — foreground ringing stays with the WEB engine, so the push
 * plugin's presentationOptions are [] in capacitor.config.ts and there is
 * never a double ring).
 *
 * Flow: the kitchen web app calls PushNotifications.register() →
 * iOS hands us the APNs device token below → we give it to Firebase
 * Messaging, which mints the FCM token our server actually sends to →
 * we post that FCM token through Capacitor's notification so the plugin's
 * 'registration' listener (src/lib/native-push.ts) receives it and POSTs
 * it to /api/kitchen/register-device — the exact same server flow Android
 * uses. The server then targets iOS tokens with an ALERT push carrying the
 * bundled order_alarm.caf / order_short.caf sound (src/lib/push.ts).
 *
 * Firebase is configured ONLY when a real GoogleService-Info.plist is
 * bundled — the committed placeholder keeps builds green until Luigi drops
 * in the real file from the Firebase console.
 */
@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path),
           !options.googleAppID.contains("PLACEHOLDER") {
            FirebaseApp.configure(options: options)
            Messaging.messaging().delegate = self
        } else {
            print("[push] GoogleService-Info.plist missing or placeholder — native push disabled this build")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // The moment the app comes on-screen, dismiss every delivered ring
        // notification so the APNs alarm chain stops and the WEB engine owns
        // the ring alone (Fabrizio cmrkvs5r: waking into the app overlapped /
        // then silenced the .caf mid-play; the web ring now takes over on the
        // order list). Delivered-notification removal is the documented way to
        // end a notification's presentation; whether it also cuts an in-flight
        // .caf mid-second is verified on the TestFlight device gate for this
        // build — if it does not, the fallback is raising the web engine's
        // wake grace (KitchenDisplay WAKE_AUDIO_GRACE_MS) under the iOS shell.
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        UIApplication.shared.applicationIconBadgeNumber = 0
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // ── Native push: APNs → FCM → Capacitor ─────────────────────────────

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else {
            // Firebase not configured (placeholder plist) — report failure so
            // the web side logs it instead of waiting forever for a token.
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                            object: NSError(domain: "ffo.push", code: 1,
                                                            userInfo: [NSLocalizedDescriptionKey: "Firebase not configured"]))
            return
        }
        // Hand the APNs token to Firebase; the FCM registration token comes
        // back via the MessagingDelegate below (and via this direct fetch,
        // whichever fires first — posting twice is harmless, the plugin
        // just re-emits 'registration' and native-push.ts re-POSTs the
        // same token idempotently).
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
            } else if let token = token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
}

extension AppDelegate: MessagingDelegate {
    /// FCM token minted/rotated — forward to the Capacitor push plugin so the
    /// web layer re-registers the device with the server.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        if let fcmToken = fcmToken {
            NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: fcmToken)
        }
    }
}
