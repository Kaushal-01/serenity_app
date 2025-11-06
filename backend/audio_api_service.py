# audio_api_service.py
"""
🎵 Serenity Audio Recognition API
Handles:
- File upload & mic recognition
- User login
- Recognition history & mood storage
"""

from fastapi import FastAPI, UploadFile, File, Query, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import sqlite3, os, io, time, sounddevice as sd, numpy as np, librosa
from datetime import datetime

# Import recognition logic
from live_recognize import recognize_audio, load_audio, DB

app = FastAPI(title="Serenity Audio Recognition API")

# ===== CORS for frontend (Next.js) =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # later replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== DB SETUP =====
DB_PATH = "serenity_users.db"
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            mood TEXT DEFAULT 'neutral'
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            song TEXT,
            emotion TEXT,
            timestamp TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ===== HELPERS =====
def log_recognition(user_id, song, emotion="neutral"):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "INSERT INTO history (user_id, song, emotion, timestamp) VALUES (?, ?, ?, ?)",
        (user_id, song, emotion, datetime.now().isoformat())
    )
    conn.commit()
    conn.close()


# ===================================
# 🌐 ROUTES
# ===================================

@app.get("/")
def home():
    return {
        "message": "🎧 Serenity Audio Recognition API",
        "routes": {
            "/recognize [POST]": "Upload .mp3/.wav file to recognize",
            "/recognize/live [GET]": "Record via mic and recognize",
            "/user/login [POST]": "Authenticate or create new user",
            "/user/history/{user_id} [GET]": "Get user recognition history"
        }
    }

# 🎧 FILE RECOGNITION
@app.post("/recognize")
async def recognize_uploaded(
    audio: UploadFile = File(...),
    user_id: int = Form(...),
    emotion: str = Form(default="neutral")
):
    start = time.time()
    try:
        y, _ = librosa.load(io.BytesIO(await audio.read()), sr=22050, mono=True)
        result = recognize_audio(y, DB)
        end = time.time()

        if result:
            # Get the top matched song and its details
            primary_match = result[0]
            log_recognition(user_id, primary_match["song"], emotion)
            
            # Include similar songs if available
            similar_songs = result[1:3] if len(result) > 1 else []  # Get next 2 songs
            
            return {
                "status": "success",
                "song": primary_match["song"],
                "votes": primary_match["votes"],
                "confidence": primary_match["confidence"],
                "offset": primary_match["offset"],
                "processing_time": round(end - start, 2),
                "similar_songs": [
                    {
                        "song": song["song"],
                        "votes": song["votes"],
                        "confidence": song["confidence"]
                    } for song in similar_songs
                ]
            }
        else:
            return {"status": "no_match", "message": "No song match found."}

    except Exception as e:
        return {"status": "error", "message": str(e)}


# Note: Live recognition now handled through the /recognize endpoint with uploaded audio
# The /recognize/live endpoint is removed as recording happens in the browser


# 👤 USER LOGIN
@app.post("/user/login")
def user_login(username: str = Form(...)):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE username=?", (username,))
    user = c.fetchone()
    if not user:
        c.execute("INSERT INTO users (username) VALUES (?)", (username,))
        conn.commit()
        user_id = c.lastrowid
    else:
        user_id = user[0]
    conn.close()
    return {"status": "ok", "user_id": user_id}


# 🕒 FETCH HISTORY
@app.get("/user/history/{user_id}")
def user_history(user_id: int):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT song, emotion, timestamp FROM history WHERE user_id=?", (user_id,))
    rows = c.fetchall()
    conn.close()
    return {"history": [{"song": r[0], "emotion": r[1], "timestamp": r[2]} for r in rows]}


# 🎭 FETCH USER PROFILE + MOOD
@app.get("/user/profile/{user_id}")
def get_profile(user_id: int):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT username, mood FROM users WHERE id=?", (user_id,))
    user = c.fetchone()
    conn.close()
    if user:
        return {"username": user[0], "mood": user[1]}
    return {"error": "User not found"}
