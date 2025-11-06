# live_recognize.py
"""
Unified Audio Recognition Module
Handles both uploaded audio and live microphone input using the same recognition pipeline.
Optimized for speed: no disk I/O, in-memory processing, adaptive STFT peak detection.
"""

import sounddevice as sd
import numpy as np
import librosa
import pickle, hashlib, os, time
from scipy.ndimage import maximum_filter
from collections import defaultdict, Counter

# ==== CONFIG ====
SR = 22050
N_FFT = 2048
HOP_LENGTH = 512
PEAK_NEIGHBORHOOD = (15, 15)
FAN_VALUE = 20
FREQ_BIN_IGNORE = 3
DT_MAX = 200
DB_PATH = "fingerprints_db.pkl"
AMP_MIN = -25
RECORD_DURATION = 7  # seconds

# ==== LOAD DATABASE (once) ====
print("📂 Loading fingerprint database...")
with open(DB_PATH, "rb") as f:
    payload = pickle.load(f)
DB = payload["db"]
SONG_LIST = payload["songs"]
print(f"✅ Loaded {len(DB)} fingerprints for {len(SONG_LIST)} songs.")


# ==== PEAK + HASH FUNCTIONS ====
def stft_peaks(S_db, adaptive=True):
    """Detect spectral peaks using adaptive thresholding."""
    footprint = np.ones(PEAK_NEIGHBORHOOD)
    local_max = maximum_filter(S_db, footprint=footprint) == S_db
    if adaptive:
        adaptive_thresh = np.percentile(S_db, 85)
        detected_peaks = np.where(local_max & (S_db >= adaptive_thresh))
    else:
        detected_peaks = np.where(local_max & (S_db >= AMP_MIN))
    freqs = detected_peaks[0]
    times = detected_peaks[1]
    mask = freqs >= FREQ_BIN_IGNORE
    return list(zip(freqs[mask], times[mask]))


def generate_hashes(peaks, fan_value=FAN_VALUE):
    """Generate unique peak-pair hashes (Shazam-like)."""
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


# ==== CORE RECOGNITION ====
def recognize_audio(y, db):
    """Recognize song directly from numpy audio array."""
    S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LENGTH))
    S_db = librosa.amplitude_to_db(S + 1e-6, ref=np.max)
    peaks = stft_peaks(S_db, adaptive=True)
    q_hashes = generate_hashes(peaks)

    if not q_hashes:
        print("⚠️ No peaks found in query.")
        return None

    votes = defaultdict(list)
    for h, q_t in q_hashes:
        if h in db:
            for song_id, song_t in db[h]:
                offset = song_t - q_t
                votes[song_id].append(offset)

    if not votes:
        print("❌ No match found.")
        return None

    results = []
    for song_id, offsets in votes.items():
        best_offset, best_votes = Counter(int(round(o)) for o in offsets).most_common(1)[0]
        results.append((song_id, best_votes, best_offset))

    results.sort(key=lambda x: x[1], reverse=True)
    top = results[0]
    return {"song": top[0], "votes": top[1], "offset": top[2]}


# ==== AUDIO LOADER (Unified Input Handler) ====
def load_audio(source=None, sr=SR, duration=RECORD_DURATION):
    """
    Load or record audio into numpy array.
    - source: None → record via mic
    - str (path) → load from file
    - np.ndarray → use directly
    """
    if isinstance(source, np.ndarray):
        print("🎧 Using provided NumPy audio array.")
        return source, sr
    elif isinstance(source, str):
        print(f"📀 Loading audio from file: {os.path.basename(source)}")
        y, sr_loaded = librosa.load(source, sr=sr, mono=True)
        return y, sr_loaded
    else:
        print(f"🎙️ Recording via mic for {duration} seconds...")
        audio = sd.rec(int(duration * sr), samplerate=sr, channels=1, dtype='float32')
        sd.wait()
        return audio.flatten(), sr


# ==== MAIN ENTRY ====
def main(source=None):
    """
    Recognize song either from live mic or uploaded file.
    Usage:
        python live_recognize.py            → live mic
        python live_recognize.py path/to.mp3 → file input
    """
    start = time.time()
    y, sr = load_audio(source)
    print("🎧 Recognizing now...")
    result = recognize_audio(y, DB)
    end = time.time()

    if result:
        print(f"\n✅ Match: {result['song']}  (votes={result['votes']}, offset={result['offset']})")
    else:
        print("\n❌ No match found.")
    print(f"⏱️ Total processing time: {end - start:.2f} sec")


# ==== RUN ====
if __name__ == "__main__":
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else None
    main(src)
