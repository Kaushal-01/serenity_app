"use client";
import { useState } from "react";
import axios from "axios";
import MusicPlayer from "@/components/MusicPlayer";

// Utility function to convert AudioBuffer to WAV format
function audioBufferToWav(buffer, numberOfChannels, sampleRate) {
  const length = buffer.length * numberOfChannels * 2;
  const view = new DataView(new ArrayBuffer(44 + length));

  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  // Write audio data
  const channelData = new Float32Array(buffer.length);
  buffer.copyFromChannel(channelData, 0, 0);
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    const sample = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return view.buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export default function Home() {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorderRef, setMediaRecorderRef] = useState(null);
  const [streamRef, setStreamRef] = useState(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState(null);

  // 🧾 Login with debounce and loading state
  const handleLogin = async () => {
    if (!username.trim()) return alert("Enter a username first!");
    if (loginLoading) return; // Prevent multiple clicks
    
    setLoginLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("username", username);
      const res = await axios.post(`${API_URL}/user/login`, formData);
      setUserId(res.data.user_id);
      localStorage.setItem('userId', res.data.user_id); // Cache user ID
    } catch (e) {
      console.error(e);
      setError("Login failed. Please try again.");
    } finally {
      setLoginLoading(false);
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

  // 🎙 Record Live via Browser
  const handleRecordToggle = async () => {
    if (!userId) return alert("Please login first!");

    // If already recording, stop it
    if (recording) {
      if (mediaRecorderRef?.state === 'recording') {
        mediaRecorderRef.stop();
      }
      return;
    }

    // Start new recording
    try {
      setResult(null);
      setRecordingTime(0);
      
      // Request microphone access with optimal settings for recognition
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 44100, // Higher initial sample rate for better quality
          channelCount: 1,   // Mono audio
          echoCancellation: false, // Disable audio processing that might affect fingerprinting
          noiseSuppression: false,
          autoGainControl: false
        } 
      });
      setStreamRef(stream);
      
      const audioChunks = [];
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',  // Use raw WebM without specifying codec
        audioBitsPerSecond: 256000 // Higher bitrate for better quality
      });
      setMediaRecorderRef(mediaRecorder);

      // Set up recording handlers
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        // Process recorded audio with improved settings
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 22050 // Match the backend's expected sample rate
        });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Ensure audio quality with proper resampling
        const offlineContext = new OfflineAudioContext({
          numberOfChannels: 1,
          length: Math.ceil(audioBuffer.duration * 22050),
          sampleRate: 22050
        });
        
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        
        const renderedBuffer = await offlineContext.startRendering();
        const wavBuffer = audioBufferToWav(renderedBuffer, 1, 22050);
        const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
        
        const formData = new FormData();
        formData.append('audio', wavBlob, 'recording.wav');
        formData.append('user_id', userId);
        formData.append('emotion', 'neutral');

        try {
          setLoading(true);
          const res = await axios.post(`${API_URL}/recognize`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          setResult(res.data);
        } catch (err) {
          console.error(err);
          alert('Recognition failed.');
        } finally {
          setLoading(false);
          setRecording(false);
          setRecordingTime(0);
          stream.getTracks().forEach(track => track.stop());
          setStreamRef(null);
          setMediaRecorderRef(null);
        }
      };

      // Start recording
      mediaRecorder.start();
      setRecording(true);

      // Update recording timer
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Clean up timer when recording stops
      mediaRecorder.addEventListener('stop', () => {
        clearInterval(timer);
      });

    } catch (err) {
      console.error(err);
      alert("Could not access microphone. Please grant permission.");
      setRecording(false);
      setRecordingTime(0);
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
            disabled={loginLoading}
            className={`w-full mt-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold transition 
              ${!loginLoading && !userId ? 'hover:scale-105' : ''} 
              ${loginLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
          >
            {loginLoading ? "Logging in..." : userId ? "✅ Logged In" : "Login"}
          </button>
          {error && (
            <div className="mt-2 text-red-400 text-sm text-center">
              {error}
            </div>
          )}
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

        {/* 🎙 Record Live Section */}
        <div className="mb-6">
          <div className="flex flex-col items-center space-y-2">
            <button
              onClick={handleRecordToggle}
              disabled={loading}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all transform hover:scale-110 ${
                recording 
                  ? "bg-red-600 animate-pulse" 
                  : "bg-gradient-to-r from-pink-500 to-red-500"
              }`}
            >
              <span className="text-2xl">🎙️</span>
            </button>
            
            {recording && (
              <div className="text-white text-center">
                <div className="font-semibold">Recording... ({recordingTime}s)</div>
                <div className="text-sm text-gray-300">Click mic to stop</div>
              </div>
            )}
            {!recording && !loading && (
              <div className="text-sm text-gray-300">
                Click mic to start recording
              </div>
            )}
            {loading && (
              <div className="text-white text-center">
                Processing recording...
              </div>
            )}
          </div>
        </div>

        {/* Result Display */}
        <div className="mt-6">
          {loading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
              <div className="text-indigo-300">Processing audio...</div>
            </div>
          )}

          {!loading && result && (
            <div className="bg-white/10 p-4 rounded-lg border border-white/20">
              {/* Main Match */}
              {result.status === "success" ? (
                <>
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold text-indigo-300 mb-2">
                      Recognized Song
                    </h3>
                    <div className="bg-white/5 p-3 rounded">
                      <div className="text-lg text-white">{result.song}</div>
                      <div className="text-sm text-gray-400 mt-1">
                        Confidence: {Math.round(result.confidence * 100)}%
                        <span className="mx-2">•</span>
                        Votes: {result.votes}
                      </div>
                    </div>
                  </div>

                  {/* Similar Songs */}
                  {result.similar_songs && result.similar_songs.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-purple-300 mb-2">
                        Similar Songs
                      </h4>
                      <div className="space-y-2">
                        {result.similar_songs.map((song, index) => (
                          <div key={index} className="bg-white/5 p-2 rounded">
                            <div className="text-white">{song.song}</div>
                            <div className="text-sm text-gray-400">
                              Confidence: {Math.round(song.confidence * 100)}%
                              <span className="mx-2">•</span>
                              Votes: {song.votes}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Music Player */}
                  <MusicPlayer recognizedSong={result} />

                  {/* Processing Time */}
                  <div className="text-xs text-gray-500 mt-3">
                    Processing time: {result.processing_time}s
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="text-yellow-400 mb-2">⚠️ No Match Found</div>
                  <div className="text-sm text-gray-400">
                    Try recording again or choose a different audio sample
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-gray-400 mt-6 text-sm">
          Made with 💜 by Kaushal
        </p>
      </div>
    </div>
  );
}
