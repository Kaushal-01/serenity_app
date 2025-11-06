# audio_trainer_service.py
from fastapi import FastAPI, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os, pickle, random, librosa
from fingerprint_train import fingerprint_file, SONG_DIR as FT_SONG_DIR, DB_PATH as FT_DB_PATH
import live_recognize

# ================= CONFIG =================
ADMIN_KEY = "secret123"  # change this in production
SONG_DIR = "songs"
DB_PATH = "fingerprints_db.pkl"

app = FastAPI(title="🎵 Serenity Audio Trainer API (Admin Only)")

# Enable CORS for your frontend admin panel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(SONG_DIR, exist_ok=True)

# ================= UTILITIES =================
def load_db():
    if os.path.exists(DB_PATH):
        with open(DB_PATH, "rb") as f:
            data = pickle.load(f)
        return data.get("db", {}), data.get("songs", [])
    return {}, []

def save_db(db, songs):
    with open(DB_PATH, "wb") as f:
        pickle.dump({"db": db, "songs": songs}, f)

# ================= ROUTES =================
@app.get("/")
def home():
    return {"message": "🎧 Serenity Audio Trainer API running — Admin access only"}

@app.post("/train")
async def train_song(file: UploadFile = File(...), admin_key: str = Form(...)):
    if admin_key != ADMIN_KEY:
        return JSONResponse(status_code=403, content={"error": "Unauthorized"})

    os.makedirs(SONG_DIR, exist_ok=True)
    song_path = os.path.join(SONG_DIR, file.filename)
    with open(song_path, "wb") as f:
        f.write(await file.read())

    db, songs = load_db()
    try:
        count = fingerprint_file(song_path, file.filename, db)
        if file.filename not in songs:
            songs.append(file.filename)
        save_db(db, songs)

        # reload recognizer in main API if it's running
        try:
            live_recognize.reload_db()
        except Exception as e:
            print("⚠️ Could not reload recognizer DB:", e)

        return {"status": "success", "song": file.filename, "hashes": count}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.delete("/delete")
def delete_song(song_name: str = Query(...), admin_key: str = Query(...)):
    if admin_key != ADMIN_KEY:
        return JSONResponse(status_code=403, content={"error": "Unauthorized"})

    db, songs = load_db()
    if song_name not in songs:
        return JSONResponse(status_code=404, content={"error": "Song not found"})

    # remove hashes
    for h in list(db.keys()):
        db[h] = [entry for entry in db[h] if entry[0] != song_name]
        if not db[h]:
            del db[h]
    songs.remove(song_name)
    save_db(db, songs)

    # delete file
    path = os.path.join(SONG_DIR, song_name)
    if os.path.exists(path):
        os.remove(path)

    try:
        live_recognize.reload_db()
    except Exception as e:
        print("⚠️ Reload failed:", e)

    return {"status": "deleted", "song": song_name}
    if not songs:
        return {"error": "No songs in DB"}

    CLIP_SECONDS, N_TRIALS = 6, 3
    total, correct = 0, 0
    for song in songs:
        full_path = os.path.join(SONG_DIR, song)
        if not os.path.exists(full_path):
            continue
        for _ in range(N_TRIALS):
            y, sr = librosa.load(full_path, sr=None, mono=True)
            full_len = librosa.get_duration(y=y, sr=sr)
            start = 0 if full_len <= CLIP_SECONDS else random.uniform(0, full_len - CLIP_SECONDS)
            y_clip = y[int(start * sr): int((start + CLIP_SECONDS) * sr)]
            tmp = f"temp_{song}.wav"
            librosa.output.write_wav(tmp, y_clip, sr)
            result = live_recognize.recognize_audio(y_clip, live_recognize.DB)
            total += 1
            if result and result["song"] == song:
                correct += 1
            os.remove(tmp)
    acc = round((correct / total) * 100, 2) if total else 0
    return {"accuracy": acc, "tested_clips": total, "songs_tested": len(songs)}

@app.get("/songs")
def list_songs(admin_key: str = Query(...)):
    if admin_key != ADMIN_KEY:
        return JSONResponse(status_code=403, content={"error": "Unauthorized"})
    _, songs = load_db()
    return {"songs": songs}