# Rebuild Android APK, force-stop app, install, relaunch, tail logcat.
# Run by typing: C:\FeeFreeOrderingSystems\scripts\rebuild-printer.ps1

$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio1\jbr"
$env:PATH += ";C:\Users\luigi\AppData\Local\Android\Sdk\platform-tools"

Write-Host ""
Write-Host "==> Cleaning + building APK..." -ForegroundColor Cyan
Push-Location C:\FeeFreeOrderingSystems\android

.\gradlew.bat clean assembleDebug
if ($LASTEXITCODE -ne 0) {
    Write-Host "Gradle build FAILED. Fix the error above and re-run." -ForegroundColor Red
    Pop-Location
    return
}

Write-Host ""
Write-Host "==> Force-stopping app on tablet (so new native code loads)..." -ForegroundColor Cyan
adb shell am force-stop com.feefreeordering.kitchen

Write-Host ""
Write-Host "==> Installing APK on tablet..." -ForegroundColor Cyan
adb install -r app\build\outputs\apk\debug\app-debug.apk
if ($LASTEXITCODE -ne 0) {
    Write-Host "adb install FAILED. Make sure tablet is connected via USB with debugging on." -ForegroundColor Red
    Pop-Location
    return
}

Write-Host ""
Write-Host "==> Clearing old logcat..." -ForegroundColor Cyan
adb logcat -c

Write-Host ""
Write-Host "==> Launching app fresh..." -ForegroundColor Cyan
adb shell monkey -p com.feefreeordering.kitchen -c android.intent.category.LAUNCHER 1 | Out-Null

Write-Host ""
Write-Host "==> Tailing printer logs. Wait 3 sec then hit TEST PRINT on tablet." -ForegroundColor Green
Write-Host "    Press Ctrl+C in this window to stop tailing." -ForegroundColor Green
Write-Host ""
adb logcat -s DirectPrinter:I DirectPrinter:W

Pop-Location
