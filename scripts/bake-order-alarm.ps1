# Regenerates android/app/src/main/res/raw/order_alarm.mp3 — the kitchen's SCREEN-OFF
# alarm sound. It must sound IDENTICAL to the in-app (web) ring, which plays
# public/sounds/gloriafood-alert.mp3 through a 6x gain + a -1.5 dBFS brick-wall limiter
# at RUNTIME (see ensureLongAlertRouting / LONG_ALERT_BOOST in KitchenDisplay.tsx).
#
# The native MediaPlayer can't reproduce that chain at runtime without a compressor
# (LoudnessEnhancer), which flattens the track's final-40s crescendo. So we BAKE the
# same processing straight into the file: 6x gain -> limiter at -1.5 dBFS (0.841).
# Result: ~+17 dB louder, SAME dynamic range (the swell is preserved). Luigi 2026-06-22.
#
# Requires ffmpeg:  winget install Gyan.FFmpeg
$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ffmpeg) { throw "ffmpeg not found on PATH. Install with: winget install Gyan.FFmpeg" }
$src = Join-Path $PSScriptRoot "..\public\sounds\gloriafood-alert.mp3"
$dst = Join-Path $PSScriptRoot "..\android\app\src\main\res\raw\order_alarm.mp3"
& $ffmpeg -y -i $src -af "volume=6,alimiter=limit=0.841:attack=2:release=120" -c:a libmp3lame -b:a 192k $dst
Write-Host "Rebuilt $dst — rebuild the APK (versionCode bump) + install to apply."
