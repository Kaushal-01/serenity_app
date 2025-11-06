'use client';
import { useState, useRef, useEffect } from 'react';
import { searchSong, getSongDetails } from '@/utils/saavnApi';

export default function MusicPlayer({ recognizedSong }) {
    const [songDetails, setSongDetails] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(null);

    useEffect(() => {
        const findAndSetSong = async () => {
            if (!recognizedSong) return;
            
            // Remove file extension from recognized song name
            const searchQuery = recognizedSong.song.replace(/\.[^/.]+$/, "");
            
            // Search for the song on JioSaavn
            const searchResults = await searchSong(searchQuery);
            if (searchResults && searchResults.length > 0) {
                // Get detailed info for the first matching song
                const details = await getSongDetails(searchResults[0].id);
                setSongDetails(details);
            }
        };

        findAndSetSong();
    }, [recognizedSong]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
            audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
            
            return () => {
                audioRef.current?.removeEventListener('timeupdate', handleTimeUpdate);
                audioRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
            };
        }
    }, [songDetails]);

    const handleTimeUpdate = () => {
        setCurrentTime(audioRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
        setDuration(audioRef.current.duration);
    };

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e) => {
        const time = e.target.value;
        setCurrentTime(time);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
        }
    };

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    if (!songDetails) return null;

    return (
        <div className="w-full max-w-xl mx-auto bg-white/10 backdrop-blur-lg rounded-xl p-4 mt-6">
            {/* Song Info */}
            <div className="flex items-center mb-4">
                <img 
                    src={songDetails.image?.[2]?.url || '/default-album.png'} 
                    alt={songDetails.name} 
                    className="w-16 h-16 rounded-lg shadow-lg"
                />
                <div className="ml-4">
                    <h3 className="text-lg font-semibold text-white">{songDetails.name}</h3>
                    <p className="text-sm text-gray-300">
                        {songDetails.primaryArtists}
                    </p>
                </div>
            </div>

            {/* Audio Element */}
            <audio 
                ref={audioRef} 
                src={songDetails.downloadUrl?.[4]?.url} 
                preload="metadata"
            />

            {/* Controls */}
            <div className="space-y-2">
                {/* Progress Bar */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-10">
                        {formatTime(currentTime)}
                    </span>
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-400 w-10">
                        {formatTime(duration)}
                    </span>
                </div>

                {/* Play/Pause Button */}
                <div className="flex justify-center">
                    <button
                        onClick={togglePlay}
                        className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center text-white transition"
                    >
                        {isPlaying ? (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                            </svg>
                        ) : (
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}