const SAAVN_API_BASE = 'https://saavn.sumit.co/api';

export const searchSong = async (query) => {
    try {
        const response = await fetch(`${SAAVN_API_BASE}/search/songs?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        return data.data.results;
    } catch (error) {
        console.error('Error searching song:', error);
        return null;
    }
};

export const getSongDetails = async (songId) => {
    try {
        const response = await fetch(`${SAAVN_API_BASE}/songs/${songId}`);
        const data = await response.json();
        return data.data[0];
    } catch (error) {
        console.error('Error getting song details:', error);
        return null;
    }
};