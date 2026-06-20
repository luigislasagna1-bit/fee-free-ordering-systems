import UIKit
import Capacitor

/// Capacitor host view controller.
///
/// Subclassed for ONE reason: to EXPLICITLY register our app-embedded
/// `DirectPrinterPlugin`. Capacitor iOS 6+ does NOT auto-discover plugins
/// defined in the app target — the bridge only registers built-in plugins plus
/// the ones listed in `capacitor.config.json` (`packageClassList`), which
/// `npx cap sync` fills from installed npm/Capacitor packages ONLY. A
/// hand-written plugin in the App target is never in that list, so without this
/// it's never registered and `window.Capacitor.Plugins.DirectPrinter` is
/// undefined — the kitchen printer UI then shows "needs native app".
///
/// This is the iOS analogue of Android `MainActivity.registerPlugin(
/// DirectPrinterPlugin.class)`. The storyboard's root view controller is set to
/// this class (App module) instead of the stock `CAPBridgeViewController`.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DirectPrinterPlugin())
    }
}
