# fingerprint_train.py
import os
import pickle
import hashlib
import numpy as np
import librosa
from scipy.ndimage import maximum_filter

# =============== CONFIG ===============
SONG_DIR = "songs"
DB_PATH = "fingerprints_db.pkl"

# Tuned parameters for Hindi MP3 songs (4–5 min duration)
SR = 22050            # lower sample rate saves memory but keeps accuracy
N_FFT = 1024          # FFT window size ; 2048
HOP_LENGTH = 512      # hop length for STFT
PEAK_NEIGHBORHOOD = (10, 10)  # local maximum neighborhood ; 15 , 15
FAN_VALUE = 10        # number of right-side peaks to link for hashing ; 10
FREQ_BIN_IGNORE = 3   # ignore the very lowest frequencies
DT_MAX = 200          # max time delta (frames) for linking peaks
AMP_MIN = -25         # minimum dB level (used if adaptive thresholding fails)

# =============== FUNCTIONS ===============
def stft_peaks(S_db, adaptive=True):
    """
    Detects local maxima (peaks) in spectrogram (constellation map).
    If adaptive=True, uses top 15% of intensities instead of fixed threshold.
    """
    # Local maximum filter
    footprint = np.ones(PEAK_NEIGHBORHOOD)
    local_max = maximum_filter(S_db, footprint=footprint) == S_db

    if adaptive:
        # dynamically pick top 15% brightest points
        adaptive_thresh = np.percentile(S_db, 85)
        detected_peaks = np.where(local_max & (S_db >= adaptive_thresh))
    else:
        detected_peaks = np.where(local_max & (S_db >= AMP_MIN))

    freqs = detected_peaks[0]
    times = detected_peaks[1]
    mask = freqs >= FREQ_BIN_IGNORE
    peaks = list(zip(freqs[mask], times[mask]))
    return peaks


def generate_hashes(peaks, fan_value=FAN_VALUE):
    """
    Generate peak-pair hashes (Shazam-like).
    Each hash = SHA1(f1|f2|dt)[:20], stores with t1.
    """
    peaks.sort(key=lambda x: x[1])
    hashes = []
    for i in range(len(peaks)):
        f1, t1 = peaks[i]
        for j in range(1, fan_value + 1):
            if i + j < len(peaks):
                f2, t2 = peaks[i + j]
                dt = t2 - t1
                if dt <= 0 or dt > DT_MAX:
                    continue
                key = f"{f1}|{f2}|{dt}"
                h = hashlib.sha1(key.encode("utf-8")).hexdigest()[:20]
                hashes.append((h, t1))
    return hashes


def fingerprint_file(path, song_id, db):
    """Create and store fingerprint hashes for one song."""
    try:
        y, sr = librosa.load(path, sr=SR, mono=True)
        S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LENGTH))
        S_db = librosa.amplitude_to_db(S + 1e-6, ref=np.max)

        # debug info
        print(f"🎶 {os.path.basename(path)}: dB range {S_db.min():.1f} → {S_db.max():.1f}")

        peaks = stft_peaks(S_db, adaptive=True)
        hashes = generate_hashes(peaks, fan_value=FAN_VALUE)

        for h, t in hashes:
            db.setdefault(h, []).append((song_id, t))

        print(f"✅ Fingerprinted {os.path.basename(path)}, produced {len(hashes)} hashes")
        return len(hashes)

    except Exception as e:
        print(f"❌ Error processing {path}: {e}")
        return 0


# =============== MAIN SCRIPT ===============
if __name__ == "__main__":
    db = {}
    song_list = []

    print("🎵 Starting fingerprinting (adaptive STFT-peak + hash pairs)...")
    for fname in sorted(os.listdir(SONG_DIR)):
        if not fname.lower().endswith((".mp3", ".wav")):
            continue
        path = os.path.join(SONG_DIR, fname)
        song_id = fname
        song_list.append(song_id)
        fingerprint_file(path, song_id, db)

    # Save fingerprint DB
    with open(DB_PATH, "wb") as f:
        pickle.dump({"db": db, "songs": song_list}, f)

    print(f"✅ Fingerprinting complete. Saved to {DB_PATH}")
