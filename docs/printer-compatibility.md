# Receipt Printer Compatibility

This guide covers which receipt printers work with Fee Free Ordering's
Direct WiFi/LAN printing feature, known quirks, and how to fix common
issues.

## TL;DR — what works out of the box

| Printer brand | Works without config? | Notes |
|---|---|---|
| Epson TM-T20, TM-T88 (any V) | ✅ Yes | Ships in ESC/POS by default |
| Bixolon SRP-330, SRP-350 | ✅ Yes | Ships in ESC/POS by default |
| Citizen CT-S310, CT-S801 | ✅ Yes | Ships in ESC/POS by default |
| Star TSP143III (any variant) | ⚠️ Requires one-time setup | See [Star setup](#star-printer-setup) below |
| Star TSP100ECO, TSP143IV | ⚠️ Requires one-time setup | Same Star setup |
| Star mPOP | ⚠️ Requires one-time setup | Same Star setup |

## How direct printing works

The Fee Free Kitchen native app opens a TCP socket to your printer's
local IP address on port 9100 (the universal "RAW print" port). The
app sends ESC/POS-formatted bytes; the printer prints them.

**Requirements:**
- Printer connected to the same Wi-Fi network as the kitchen tablet
- Printer's "TCP Print Service" (or equivalent name) enabled in the printer's web admin
- Printer in ESC/POS emulation mode

For Star printers, the last one is the catch — they ship in **Star Line
Mode** which is Star's proprietary command set, not ESC/POS. The
printer accepts our TCP connection but ignores our commands.

---

## Star printer setup

### Why Star printers need configuration

Star Micronics ships their thermal receipt printers (TSP143III,
TSP100, mPOP, etc.) configured in **"Star Line Mode"** emulation by
default. This is Star's own command set, not the industry-standard
ESC/POS used by Epson/Bixolon/Citizen and what our app sends.

The fix is a one-time configuration change to switch the printer to
"Standard ESC/POS Mode". Takes 5 minutes with a Windows PC + USB cable.

### Switching a Star TSP143III to ESC/POS mode

#### Method 1 — Star Configuration Utility (Recommended)

1. **Download Star's Configuration Utility**:
   - Go to https://www.starmicronics.com/support/
   - Search for your printer model (e.g. "TSP143IIIW")
   - Download **"Printer Utility for TSP100III"** for Windows or macOS

2. **Connect printer via USB cable** (yes, even if you normally use Wi-Fi)

3. **Open Star Printer Utility**
   - It auto-detects the printer
   - Click **"Star Printer Settings"** or **"Printer Configuration"**

4. **Change Emulation Mode**:
   - Find **"Emulation"** in the settings list (sometimes under "General Settings")
   - Change from **"Star Line Mode"** to **"Standard ESC/POS Mode"**
   - Click **"Apply"** or **"Save to Printer"**

5. **Power-cycle the printer** (unplug, wait 5 sec, plug back in)

6. **Verify**:
   - Hold the FEED button while powering on the printer
   - It prints a self-test page
   - Look for **"Emulation: ESC/POS"** near the top

7. **Reconnect the printer to Wi-Fi** (if you changed that during setup)

8. **Done.** The Fee Free Kitchen app's Test Print should now produce
   a physical receipt.

#### Method 2 — DIP switches (older Star models)

Some older Star printers have physical DIP switches inside the cover
that control emulation. Consult the printer's manual for the specific
switch combination. Generally:
- DIP switch 1-1 OFF = Star Line Mode (default)
- DIP switch 1-1 ON = ESC/POS Mode

After flipping the switch, power-cycle the printer.

### Verifying the switch worked

Power-cycle the printer while holding FEED. The self-test printout
should now show:

```
Emulation: Standard ESC/POS Mode
```

(Not "Star Line Mode" anymore.)

After that, the Fee Free Kitchen app's Direct LAN printing will work
out of the box.

---

## Other common issues

### "Cannot reach printer" / "Connection refused"

**Cause**: Printer is off, on a different network, or has port 9100 disabled.

**Fix**:
1. Verify the printer's power LED is on (green/blue)
2. Verify the tablet and printer are on the SAME Wi-Fi network
3. Open the printer's web admin in a browser:
   - Find printer IP via self-test page (hold FEED while powering on)
   - Navigate to `http://<printer-ip>/` in any browser
4. Look for "TCP Print Service" / "Socket Print" / "Raw Print" — ensure it's **Enabled**

### "Connection timed out"

**Cause**: Wi-Fi network too slow OR printer overwhelmed.

**Fix**:
1. Move tablet closer to Wi-Fi router
2. Power-cycle the printer
3. Try again

### Test Print returns "success" but no paper

**Cause**: Most commonly — the printer is in Star Line Mode but receiving
ESC/POS commands. The TCP connection accepts the bytes but the printer
silently discards them.

**Fix**: Follow the [Star printer setup](#star-printer-setup) above to
switch to ESC/POS Mode.

**Other causes**:
- Out of paper (check the paper roll)
- Cover not fully closed
- Printer in error state (red LED blinking — power cycle)

### Auto-discovery doesn't find the printer

**Cause**: Several:
1. Printer is on a different Wi-Fi network (most common)
2. Router has multicast filtering (common on business Wi-Fi)
3. Printer hasn't fully booted yet (wait 30 sec after power-on)
4. Star CloudPRNT mode is hijacking the network discovery

**Fix**:
1. Verify same network: connect the tablet to the same SSID as the printer
2. **Use manual IP entry** as a fallback — get the IP from the printer's
   self-test page (FEED + power), then enter it in the kitchen settings.
3. Retry auto-discovery 30 sec later after a power-cycle.

### Receipt prints but doesn't cut

**Cause**: Printer doesn't have an auto-cutter (some entry-level models)
OR the cutter is disabled in printer settings.

**Fix**: The receipt is still printed — you just need to tear it off
manually. If the printer DOES have a cutter and it's not working:
1. Open the printer cover
2. Check the cutter mechanism for paper jams
3. In the printer's web admin, ensure "Auto Cutter" is enabled

---

## Known compatible printer models

This is the list we've tested or have confirmed reports of working:

**Tested + Working (out of the box)**:
- Epson TM-T20II, TM-T20III, TM-T88V, TM-T88VI
- Bixolon SRP-330II, SRP-350III
- Citizen CT-S310II

**Tested + Working (after ESC/POS mode switch)**:
- Star TSP143III (all W/E/U/L variants)
- Star TSP100ECO
- Star TSP143IV
- Star mPOP

**Untested but likely compatible** (ESC/POS over port 9100):
- Almost any thermal receipt printer from a major brand
- Look for "ESC/POS support" or "Ethernet/Wi-Fi" in the spec sheet

If you have a printer not on this list and it doesn't work, contact
support — we can either help you switch its emulation mode OR
add Star/Epson SDK integration as a follow-up.

---

## For developers

The native plugin source is at:
- Android: `android/app/src/main/java/com/feefreeordering/directprinter/DirectPrinterPlugin.java`
- iOS: `ios/App/App/DirectPrinterPlugin.swift`

ESC/POS encoder: `src/lib/escpos.ts`

The encoder emits BOTH ESC/POS cut (`GS V 1`) and Star Line Mode cut
(`ESC d 2`) at the end of every receipt — this means a Star printer in
Star Line Mode will at least cut the paper properly. But the rest of
the formatting (bold, double-size, alignment) only works in ESC/POS
mode, so the Star Line setup is still required for production use.

A follow-up will integrate Star's StarXpand SDK so the app auto-detects
Star printers and sends Star-formatted bytes natively — eliminating
the one-time configuration step.
