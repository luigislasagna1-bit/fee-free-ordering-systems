# Building the Kitchen Native App (Android + iOS)

The Capacitor-based kitchen app wraps the live `/kitchen` web UI in a
native shell and adds a custom `DirectPrinter` plugin that talks
directly to a LAN receipt printer over TCP — no PrintNode required.

This doc covers:

- [Architecture](#architecture)
- [Android build (works on Windows)](#android-build-works-on-windows)
- [iOS build (requires macOS)](#ios-build-requires-macos)
- [How the printer plugin works](#how-the-printer-plugin-works)
- [Testing on real devices](#testing-on-real-devices)
- [Publishing to app stores](#publishing-to-app-stores)

---

## Architecture

The native app is a thin WebView wrapper that loads
`https://feefreeordering.com/kitchen`. The web UI is identical to
what you see in a desktop browser — the native shell only exists to:

1. **Talk to the LAN printer** directly via TCP socket
2. **(Future)** Persistent push notifications, native menu items,
   background polling

Updates ship via the regular web deploy. **The native app itself
only needs to be rebuilt when the native plugin changes** — not when
the kitchen UI changes.

---

## Android build (works on Windows)

### Prereqs (one-time setup, ~30 min)

1. Install **Android Studio**: https://developer.android.com/studio
2. During setup, accept all the SDK license prompts (Android SDK
   Platform 34, Build Tools 34.x).
3. Set the `ANDROID_HOME` env var to point at your SDK location
   (default is `C:\Users\<you>\AppData\Local\Android\Sdk`).

### Build the .apk

From the project root:

```powershell
# 1. Sync any web changes into the native shell
npx cap sync android

# 2. Open Android Studio with the project (one time):
npx cap open android

# Inside Android Studio:
#   Build → Build Bundle(s) / APK(s) → Build APK(s)
#   Wait ~2-3 min for the first build (Gradle has to download deps)
#   When done, click "locate" in the bottom-right notification —
#   that opens File Explorer to the .apk file
#
# Output path: android/app/build/outputs/apk/debug/app-debug.apk
```

### Install on your Android tablet

1. On the tablet: **Settings → About → tap "Build number" 7 times** to
   enable Developer Mode
2. **Settings → Developer options → enable "USB debugging"**
3. Plug the tablet into your PC via USB
4. The tablet shows an "Allow USB debugging?" prompt → tap Allow
5. Back in Android Studio: **Run → Run 'app'** → pick your tablet from
   the device dropdown → Android Studio builds + installs + launches
   the app on the tablet
6. The Fee Free Kitchen app icon now appears on the tablet's home
   screen

Once installed once, you can re-run via Studio anytime you make
changes. For your kitchen staff, you'd produce a signed .apk
(see [Publishing](#publishing-to-app-stores) below) and just
side-load it on their tablets via USB or email.

---

## iOS build (requires macOS)

You're on Windows so you can't compile this directly. Options:

### Option A — Use a Mac (cleanest)

1. Buy/rent a Mac (or use a friend's). Mac mini M2 works.
2. Install **Xcode** from the Mac App Store (~30 min download).
3. Clone the repo, run `npm install`.
4. Open the iOS project: `npx cap open ios`
5. In Xcode: select your iPad/iPhone from the device dropdown →
   click the **Play (▶) button**.

### Option B — Cloud build service (no Mac needed)

[**Ionic AppFlow**](https://ionic.io/appflow/native-builds) is the
standard. ~$50/mo. You push to GitHub, AppFlow builds the .ipa
on their Macs, you download or auto-publish to TestFlight.

For ad-hoc builds (you just want a .ipa to install on your own
iPad), a single AppFlow build runs ~$5 on the Pay-As-You-Go tier.

### Option C — Hire a Mac-using contractor for the first build

Fiverr / Upwork have iOS developers who'll do "build my Capacitor
app and produce a signed .ipa" for ~$50-100. One-time.

---

## How the printer plugin works

```
┌────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  Kitchen web   │─fetch─▶ │  /api/kitchen/   │         │              │
│  app inside    │   ◀──   │  print-job/[id]  │         │              │
│  WebView       │  bytes  │  → ESC/POS bytes │         │              │
│                │         └──────────────────┘         │              │
│                │                                       │              │
│  Calls         │                                       │              │
│  DirectPrinter │   TCP socket → 192.168.1.50:9100 ──▶ │  Star/Epson  │
│  .print({ip,   │   (raw ESC/POS bytes streamed)      │  thermal     │
│   bytes})      │                                       │  printer     │
└────────────────┘                                       └──────────────┘
                                                              │
                                                              ▼
                                                         📄  Receipt
```

1. Order comes in → kitchen UI calls `/api/kitchen/print-job/<orderId>`
2. Server generates ESC/POS bytes (see `src/lib/escpos.ts`) and returns
   them as base64
3. Kitchen UI invokes `Capacitor.Plugins.DirectPrinter.print({ip, bytes})`
4. Native plugin opens TCP socket to printer, writes bytes, closes
5. Printer prints

**Failure modes** the plugin distinguishes (so the UI can show
actionable copy):
- `timeout` — printer didn't respond
- `refused` — printer reachable but port 9100 closed
- `unreachable` — wrong IP or different network
- `io_error` — connection dropped mid-print

---

## Testing on real devices

### Star TSP143IIIW setup checklist

1. Plug the printer into power + your Wi-Fi router (Ethernet or
   built-in Wi-Fi on the W model)
2. Print the self-test page: hold the **FEED** button while powering
   on. The printout shows the printer's IP address near the bottom.
3. Note that IP — you'll enter it in the kitchen settings.
4. On the printer's web admin (`http://<printer-ip>/`), verify
   **"RAW print" / "Port 9100"** is enabled (it's on by default
   for TSP143IIIW).

### Test from the kitchen app

1. Launch the app
2. Sign in with your kitchen staff credentials
3. Go to Settings → Printer
4. Enter the printer IP (e.g. `192.168.1.50`)
5. Tap **Test Connection** → should say "Reachable ✓"
6. Tap **Test Print** → printer should print a test receipt
   ("FEE FREE TEST PRINT — If you can read this, your printer is
   connected ✓")

### Common issues

| Symptom | Cause | Fix |
|---|---|---|
| "Cannot reach printer" | Printer offline or on different network | Verify the tablet + printer are on the SAME Wi-Fi |
| "Connection refused" | Port 9100 disabled in printer | Open printer's web admin, enable "Star TCP Print Service" |
| "Timeout" | Printer responding slowly | Power cycle the printer, try again |
| Garbled output | Wrong paper width | Set paper width (58mm/80mm) in app settings to match your printer |

---

## Publishing to app stores

### Google Play Store

1. Sign up at https://play.google.com/console — one-time **$25 fee**
2. In Android Studio: **Build → Generate Signed Bundle / APK** →
   create a keystore (back this up; you'll need it for every update)
3. Upload the signed `.aab` to Play Console
4. Fill in app details (description, screenshots, content rating)
5. First review usually takes ~2-3 days

### Apple App Store

1. Sign up for **Apple Developer Program** — $99/year
2. In Xcode: **Product → Archive** → Distribute via App Store Connect
3. Fill in app details in App Store Connect
4. Submit for review — typically 1-2 days
5. Once approved, app appears in the App Store

**Important for the kitchen app specifically:**
- App Store reviewers will test the printer connection — you may
  need to include a "test mode" or screencast showing how the
  printer pairing works
- The `NSLocalNetworkUsageDescription` in `ios/App/App/Info.plist`
  must explain WHY the app needs local network access. We have
  good copy there already.
- The Google Play "data safety" form asks about what data the app
  collects. The kitchen app: kitchen staff credentials (next-auth),
  no PII beyond what's in the orders staff are already authorized
  to see.

---

## File layout

```
capacitor.config.ts                          # native shell config
android/                                     # Android project (Gradle)
  app/src/main/
    AndroidManifest.xml                      # permissions (INTERNET)
    java/com/feefreeordering/
      kitchen/MainActivity.java              # registers plugins
      directprinter/DirectPrinterPlugin.java # TCP printer plugin
ios/                                         # iOS project (Xcode)
  App/App/
    Info.plist                               # NSLocalNetworkUsageDescription
    AppDelegate.swift
    DirectPrinterPlugin.swift                # TCP printer plugin
src/lib/
  escpos.ts                                  # ESC/POS encoder
  native-printer.ts                          # JS-side bridge to plugin
src/app/api/kitchen/print-job/[orderId]/
  route.ts                                   # generates ESC/POS bytes per order
```
