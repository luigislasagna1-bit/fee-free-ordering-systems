"""
Denoise the Nabil AI demo audio using noisereduce (spectral gating).

Usage:
  python scripts/_denoise-demo-audio.py

Inputs:
  public/marketing/nabil/nabil-demo-order-ORIGINAL.mp3

Outputs:
  public/marketing/nabil/nabil-demo-order-denoised.wav  (intermediate WAV)
  public/marketing/nabil/nabil-demo-order-denoised.mp3  (final MP3)

Strategy:
  1. Load the original MP3 as WAV using soundfile+subprocess (ffmpeg decode to PCM)
  2. Extract a noise profile from a known inter-speaker silence window
  3. Apply noisereduce.reduce_noise() with the noise profile
  4. Export as WAV, then encode to MP3 with ffmpeg (to avoid double-lossy generation)
"""

import subprocess
import sys
import os
import numpy as np
import soundfile as sf
import noisereduce as nr

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGINAL = os.path.join(ROOT, "public", "marketing", "nabil", "nabil-demo-order-ORIGINAL.mp3")
OUT_WAV = os.path.join(ROOT, "public", "marketing", "nabil", "nabil-demo-order-denoised.wav")
OUT_MP3 = os.path.join(ROOT, "public", "marketing", "nabil", "nabil-demo-order-denoised.mp3")

# Target sample rate to work at (high-quality intermediate)
SR = 48000

print("Step 1: Decode original MP3 to float32 WAV at 48 kHz...")
decode_cmd = [
    "ffmpeg", "-y",
    "-i", ORIGINAL,
    "-af", "highpass=f=100:poles=2,lowpass=f=4000:poles=2",
    "-ar", str(SR),
    "-ac", "1",
    "-c:a", "pcm_f32le",
    OUT_WAV,
]
result = subprocess.run(decode_cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("FFmpeg decode failed:")
    print(result.stderr[-2000:])
    sys.exit(1)
print(f"  Decoded to: {OUT_WAV}")

print("Step 2: Load WAV into numpy...")
audio, sample_rate = sf.read(OUT_WAV, dtype="float32", always_2d=False)
print(f"  Shape: {audio.shape}, SR: {sample_rate}, Duration: {len(audio)/sample_rate:.2f}s")

# Silence window: between caller "It's for delivery." (ends ~8.7s) and Nabil (11.4s)
# Use t=9.0-10.5s as noise profile (1.5 seconds of inter-speaker gap)
noise_start_s = 9.0
noise_end_s = 10.5
noise_start = int(noise_start_s * sample_rate)
noise_end = int(noise_end_s * sample_rate)
noise_sample = audio[noise_start:noise_end]
print(f"  Noise profile: {noise_start_s}-{noise_end_s}s ({len(noise_sample)} samples, RMS={20*np.log10(np.sqrt(np.mean(noise_sample**2))+1e-10):.1f} dBFS)")

print("Step 3: Applying noisereduce spectral gating...")
# prop_decrease controls how much noise is removed (0-1)
# Use 0.75 to avoid over-denoising and metallic artifacts
# stationary=False allows tracking non-stationary noise
# freq_mask_smooth_hz and time_mask_smooth_ms control smoothing to reduce artifacts
reduced = nr.reduce_noise(
    y=audio,
    sr=sample_rate,
    y_noise=noise_sample,
    prop_decrease=0.75,       # 75% noise reduction (conservative to avoid artifacts)
    stationary=False,          # non-stationary for better caller-side handling
    freq_mask_smooth_hz=500,   # smooth frequency masking (reduces metallic artifacts)
    time_mask_smooth_ms=50,    # smooth time masking
    n_std_thresh_stationary=1.5,
    chunk_size=600000,         # process in chunks to handle long file
    padding=30000,
    use_tqdm=False,
)
print(f"  Reduction complete. Shape: {reduced.shape}")

# Measure noise floor in the same silence window after reduction
noise_sample_after = reduced[noise_start:noise_end]
rms_before = 20*np.log10(np.sqrt(np.mean(noise_sample**2))+1e-10)
rms_after = 20*np.log10(np.sqrt(np.mean(noise_sample_after**2))+1e-10)
print(f"  Noise floor BEFORE: {rms_before:.1f} dBFS")
print(f"  Noise floor AFTER:  {rms_after:.1f} dBFS")
print(f"  Improvement:        {rms_after - rms_before:.1f} dB")

print("Step 4: Write denoised WAV...")
sf.write(OUT_WAV, reduced, sample_rate, subtype="FLOAT")
print(f"  Written: {OUT_WAV}")

print("Step 5: Encode to MP3 with loudnorm...")
encode_cmd = [
    "ffmpeg", "-y",
    "-i", OUT_WAV,
    "-af", "loudnorm=I=-16:TP=-1:LRA=11",
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    "-ac", "1",
    "-ar", str(SR),
    OUT_MP3,
]
result = subprocess.run(encode_cmd, capture_output=True, text=True)
if result.returncode != 0:
    print("FFmpeg encode failed:")
    print(result.stderr[-2000:])
    sys.exit(1)
print(f"  Encoded to: {OUT_MP3}")

print("\nDone! Verify with:")
print(f"  ffprobe -v quiet -print_format json -show_format -show_streams \"{OUT_MP3}\"")
