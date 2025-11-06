"use client";
import { useState } from "react";
import axios from "axios";

export default function AdminPage() {
  const API_URL = "http://localhost:8001"; // trainer backend
  const [file, setFile] = useState(null);
  const [log, setLog] = useState("");
  const [loading, setLoading] = useState(false);

  // Helper: confirmation wrapper
  const confirmAction = async (message, action) => {
    if (!window.confirm(message)) return;
    setLoading(true);
    try {
      await action();
    } catch (err) {
      setLog(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Upload & train song
  const uploadSong = async () => {
    if (!file) return alert("Please choose a file first!");
    await confirmAction(
      `Are you sure you want to train "${file.name}"? This may take some time.`,
      async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("admin_key", "secret123");
        const res = await axios.post(`${API_URL}/train`, form);
        setLog(JSON.stringify(res.data, null, 2));
      }
    );
  };

  // List trained songs
  const listSongs = async () => {
    await confirmAction("Fetch the list of all trained songs?", async () => {
      const res = await axios.get(`${API_URL}/songs`, { params: { admin_key: "secret123" } });
      setLog(JSON.stringify(res.data, null, 2));
    });
  };

  // Delete a song
  const deleteSong = async () => {
    const name = prompt("Enter the exact song name to delete (e.g., my_song.mp3):");
    if (!name) return;
    await confirmAction(
      `Are you sure you want to permanently delete "${name}" from the database?`,
      async () => {
        const res = await axios.delete(`${API_URL}/delete`, {
          params: { song_name: name, admin_key: "secret123" },
        });
        setLog(JSON.stringify(res.data, null, 2));
      }
    );
  };

  return (
    <div className="p-6 text-white bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">🎧 Admin Audio Trainer</h1>

      <div className="space-y-4">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          className="block text-white"
        />

        <button
          onClick={uploadSong}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Processing..." : "Upload & Train"}
        </button>

        <button
          onClick={listSongs}
          disabled={loading}
          className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Loading..." : "List Songs"}
        </button>


        <button
          onClick={deleteSong}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Deleting..." : "Delete Song"}
        </button>
      </div>

      <pre className="bg-black p-4 mt-6 rounded overflow-x-auto whitespace-pre-wrap text-sm">
        {log || "Awaiting action..."}
      </pre>
    </div>
  );
}
