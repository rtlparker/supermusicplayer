// Global playback state
let currentSong = null;
let currentSongIndex = -1;
let isLoop = false;
let isShuffle = false;
let currentPlaylist = [];

const audioPlayer = document.getElementById('audio-player');
const playPauseButton = document.getElementById('play-pause-button');
const nowPlayingCover = document.getElementById('now-playing-cover');
const timeIndicator = document.getElementById('time-indicator');

// Set initial volume from slider (value passed from server)
audioPlayer.volume = document.getElementById('volume-slider').value;

// Audio events
audioPlayer.addEventListener('loadedmetadata', () => console.log("loadedmetadata: duration =", audioPlayer.duration));
audioPlayer.addEventListener('canplay', () => console.log("canplay event fired"));
audioPlayer.addEventListener('canplaythrough', () => console.log("canplaythrough event fired"));
audioPlayer.addEventListener('error', () => console.error("Audio element error:", audioPlayer.error));

// Format seconds to mm:ss
const formatTime = seconds => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

// Update progress slider and time indicator
const updateProgress = () => {
  const progressBar = document.getElementById('progress-bar');
  if (audioPlayer.duration) {
    const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.value = percent;
    timeIndicator.innerText = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
  }
};

// When a song ends: loop if enabled, else play next
const songEnded = () => {
  if (isLoop) {
    audioPlayer.currentTime = 0;
    audioPlayer.play();
  } else {
    nextSong();
  }
};

// Play a song from a given DOM element
const playSongFromElement = buttonElem => {
  const songElem = buttonElem.parentElement;
  const filename = songElem.getAttribute('data-filename');
  const title = songElem.querySelector('.song-title').innerText;
  const artist = songElem.querySelector('.song-artist a') 
                 ? songElem.querySelector('.song-artist a').innerText 
                 : songElem.querySelector('.song-artist').innerText;
  const coverUrl = songElem.querySelector('img.cover').src;
  currentSongIndex = currentPlaylist.findIndex(s => s.filename === filename);
  playSong(filename, title, artist, coverUrl);
};

// Main function to play a song
const playSong = (filename, title, artist, coverUrl) => {
  audioPlayer.pause();
  audioPlayer.innerHTML = '';

  const source = document.createElement('source');
  let mime = '';
  if (filename.toLowerCase().endsWith('.m4a')) {
    mime = 'audio/mp4';
  } else if (filename.toLowerCase().endsWith('.aac')) {
    mime = 'audio/aac';
  } else if (filename.toLowerCase().endsWith('.mp3')) {
    mime = 'audio/mpeg';
  } else if (filename.toLowerCase().endsWith('.flac')) {
    mime = 'audio/flac';
  }
  console.log("Playing", filename, "with MIME type", mime);
  source.src = '/play/' + filename;
  source.type = mime;
  audioPlayer.appendChild(source);

  audioPlayer.load();

  setTimeout(() => {
    audioPlayer.play().then(() => console.log("Playback started"))
      .catch(e => {
        if (e.name !== "AbortError") console.error("Playback error:", e);
      });
  }, 200);

  document.getElementById('now-playing-title').innerText = title;
  document.getElementById('now-playing-artist').innerText = artist;
  document.getElementById('now-playing-cover').src = coverUrl;
  playPauseButton.innerText = 'Pause';
  nowPlayingCover.classList.add('rotating');
};

// Toggle play/pause
const togglePlay = () => {
  if (audioPlayer.paused) {
    audioPlayer.play().catch(e => console.error('Playback error:', e));
    playPauseButton.innerText = 'Pause';
    nowPlayingCover.classList.add('rotating');
  } else {
    audioPlayer.pause();
    playPauseButton.innerText = 'Play';
    nowPlayingCover.classList.remove('rotating');
  }
};

// Play next song from currentPlaylist
const nextSong = () => {
  if (isShuffle) {
    currentSongIndex = Math.floor(Math.random() * currentPlaylist.length);
  } else {
    currentSongIndex = (currentSongIndex + 1) % currentPlaylist.length;
  }
  const nextSongObj = currentPlaylist[currentSongIndex];
  playSong(nextSongObj.filename, nextSongObj.title, nextSongObj.artist, nextSongObj.cover_url);
};

// Play previous song
const prevSong = () => {
  if (isShuffle) {
    currentSongIndex = Math.floor(Math.random() * currentPlaylist.length);
  } else {
    currentSongIndex = (currentSongIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
  }
  const prevSongObj = currentPlaylist[currentSongIndex];
  playSong(prevSongObj.filename, prevSongObj.title, prevSongObj.artist, prevSongObj.cover_url);
};

// Toggle loop mode
const toggleLoop = () => {
  isLoop = !isLoop;
  document.getElementById('loop-button').innerText = isLoop ? 'Loop On' : 'Loop Off';
};

// Toggle shuffle mode
const toggleShuffle = () => {
  isShuffle = !isShuffle;
  document.getElementById('shuffle-button').innerText = isShuffle ? 'Shuffle On' : 'Shuffle Off';
};

// Allow scrubbing through the song
document.getElementById('progress-bar').addEventListener('input', e => {
  if (audioPlayer.duration) {
    audioPlayer.currentTime = (e.target.value / 100) * audioPlayer.duration;
  }
});

// Volume control with persistence
const volumeSlider = document.getElementById('volume-slider');
volumeSlider.addEventListener('input', e => {
  const newVolume = e.target.value;
  audioPlayer.volume = newVolume;
  fetch('/set_volume', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({volume: newVolume})
  }).catch(err => console.error('Volume save error:', err));
});

// Update currentPlaylist based on visible songs in the DOM
const updateCurrentPlaylist = () => {
  const songs = document.querySelectorAll('.song');
  const list = [];
  songs.forEach(song => {
    if (song.style.display !== 'none') {
      list.push({
        filename: song.getAttribute('data-filename'),
        title: song.getAttribute('data-title'),
        artist: song.getAttribute('data-artist'),
        cover_url: song.querySelector('img.cover').src
      });
    }
  });
  currentPlaylist = list;
};

// Filter songs by artist (client-side filtering)
const filterByArtist = artist => {
  const songs = document.querySelectorAll('.song');
  songs.forEach(song => {
    const songArtist = song.getAttribute('data-artist').toLowerCase();
    song.style.display = (songArtist === artist.toLowerCase()) ? 'flex' : 'none';
  });
  updateCurrentPlaylist();
  document.getElementById('back-button').classList.remove('hidden');
};

// Reset filter to show all songs
const resetFilter = () => {
  const songs = document.querySelectorAll('.song');
  songs.forEach(song => song.style.display = 'flex');
  updateCurrentPlaylist();
  document.getElementById('back-button').classList.add('hidden');
};

// Attach click listeners to artist links for filtering
const attachArtistLinkListeners = () => {
  const artistLinks = document.querySelectorAll('.artist-link');
  artistLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const artist = link.getAttribute('data-artist');
      filterByArtist(artist);
    });
  });
};

// On page load, initialize currentPlaylist and attach listeners
document.addEventListener('DOMContentLoaded', () => {
  const songs = document.querySelectorAll('.song');
  const list = [];
  songs.forEach(song => {
    list.push({
      filename: song.getAttribute('data-filename'),
      title: song.getAttribute('data-title'),
      artist: song.getAttribute('data-artist'),
      cover_url: song.querySelector('img.cover').src
    });
  });
  currentPlaylist = list;
  attachArtistLinkListeners();
});
