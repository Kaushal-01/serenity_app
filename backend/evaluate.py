# evaluate.py
import os, random, pickle, librosa
from live_recognize import recognize_clip

SONG_DIR = "songs"
DB_PATH = "fingerprints_db.pkl"

# length of clip (seconds)
CLIP_SECONDS = 6
# how many random clips per song to test
N_TRIALS = 3

def extract_random_clip(path, duration=CLIP_SECONDS):
    """returns a temp wav file path for a random segment"""
    y, sr = librosa.load(path, sr=None, mono=True)
    full_len = librosa.get_duration(y=y, sr=sr)
    if full_len <= duration:
        start = 0
    else:
        start = random.uniform(0, full_len - duration)
    y_clip = y[int(start * sr): int((start + duration) * sr)]
    tmp = f"temp_{os.path.basename(path)}.wav"
    librosa.output.write_wav(tmp, y_clip, sr)
    return tmp

if __name__ == "__main__":
    with open(DB_PATH, "rb") as f:
        data = pickle.load(f)
    all_songs = [s for s in data["songs"] if s.lower().endswith((".mp3", ".wav"))]
    total, correct = 0, 0
    print("🎯 Evaluating recognizer on", len(all_songs), "songs")

    for song in all_songs:
        full_path = os.path.join(SONG_DIR, song)
        for _ in range(N_TRIALS):
            clip = extract_random_clip(full_path)
            res = recognize_clip(clip)
            os.remove(clip)
            total += 1
            if res and res["song"] == song:
                correct += 1
            else:
                print(f"❌ Wrong for {song}: predicted {res['song'] if res else None}")

    acc = correct / total if total else 0
    print(f"\n✅ Overall accuracy: {acc*100:.2f}%  ({correct}/{total})")
