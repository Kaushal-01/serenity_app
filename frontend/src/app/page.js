"use client";
import { useState } from "react";
import axios from "axios";

export default function Home() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);

  // 🧾 Login
  const handleLogin = async () => {
    if (!username.trim()) return alert("Enter a username first!");
    const formData = new FormData();
    formData.append("username", username);
    try {
      const res = await axios.post(`${API_URL}/user/login`, formData);
      setUserId(res.data.user_id);
    } catch (e) {
      console.error(e);
      alert("Login failed!");
    }
  };

  // 🎵 Upload & Recognize
  const handleUpload = async () => {
    if (!file || !userId) return alert("Login and upload a file first!");
    setLoading(true);
    const formData = new FormData();
    formData.append("audio", file);
    formData.append("user_id", userId);
    formData.append("emotion", "neutral");
    try {
      const res = await axios.post(`${API_URL}/recognize`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (err) {
      console.error(err);
      alert("Recognition failed.");
    } finally {
      setLoading(false);
    }
  };

  // 🎙 Record Live via FastAPI
  const handleRecordLive = async () => {
    if (!userId) return alert("Please login first!");
    setRecording(true);
    setResult(null);

    try {
      const res = await axios.get(`${API_URL}/recognize/live`, {
        params: { user_id: userId },
      });
      setResult(res.data);
    } catch (err) {
      console.error(err);
      alert("Recording or recognition failed.");
    } finally {
      setRecording(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 flex items-center justify-center p-6">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 max-w-md w-full border border-white/20">
        <h1 className="text-3xl font-bold text-center text-white mb-6">
          🎧 Serenity Audio Recognition
        </h1>

        {/* Login Section */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2 font-medium">
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-white/10 text-white border border-gray-500 focus:ring-2 focus:ring-indigo-400 outline-none"
            placeholder="Enter username..."
          />
          <button
            onClick={handleLogin}
            className="w-full mt-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold hover:scale-105 transition"
          >
            {userId ? "✅ Logged In" : "Login"}
          </button>
        </div>

        {/* Upload Section */}
        <div className="mb-6">
          <label className="block text-gray-300 mb-2 font-medium">
            Upload Audio File
          </label>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files[0])}
            className="w-full text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
          />
          <button
            onClick={handleUpload}
            disabled={loading}
            className="w-full mt-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:scale-105 transition disabled:opacity-50"
          >
            {loading ? "⏳ Recognizing..." : "🎵 Upload & Recognize"}
          </button>
        </div>

        {/* 🎙 Record Live Button */}
        <div className="mb-6">
          <button
            onClick={handleRecordLive}
            disabled={recording}
            className={`w-full py-2 rounded-lg text-white font-semibold transition ${
              recording
                ? "bg-red-600 animate-pulse"
                : "bg-gradient-to-r from-pink-500 to-red-500 hover:scale-105"
            }`}
          >
            {recording ? "🎙 Recording (7s)..." : "🎙 Record from Mic"}
          </button>
        </div>

        {/* Result Display */}
        {result && (
          <div className="bg-white/10 p-4 rounded-lg border border-white/20">
            <h3 className="text-xl font-semibold text-indigo-300 mb-2">
              Recognition Result
            </h3>
            <pre className="text-gray-100 text-sm overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <p className="text-center text-gray-400 mt-6 text-sm">
          Made with 💜 by Kaushal
        </p>
      </div>
    </div>
  );
}
