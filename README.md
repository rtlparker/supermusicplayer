# Super Music Player 🎵

A simple web-based music player built with **Flask**. Originally made on a **Raspberry Pi 5** running **Python 3.11.2**, but should work fine on other systems and Python versions too.

## Features

- 🌀 Shuffle mode  
- 🔁 Loop toggle  
- ⏮️ Previous / ⏯️ Play & Pause / ⏭️ Next  
- 🎚️ Volume control (saves across sessions)  
- 📀 Displays current song info and album art  
- 🧭 Song skimmer (seek through tracks)  
- 🧑‍🎤 Barebones artist page — click an artist's name to see all their tracks

## File Support

- Designed with **FLAC** in mind  
- Also works with **MP3** and **M4A**  
- Some leftover support code for other formats, might need polishing

## Setup

### Requirements

- Python 3.11.2 (or close enough, should work fine on other versions)
- Flask  
- A `requirements.txt` is included to make life easier:

```bash
pip install -r requirements.txt
