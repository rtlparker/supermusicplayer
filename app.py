import os
import re
import threading
import time
import json
from flask import Flask, render_template, send_file, abort, jsonify, request, Response
from mutagen.flac import FLAC
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4
from io import BytesIO
import logging
from flask_caching import Cache

app = Flask(__name__)
app.config['CACHE_TYPE'] = 'SimpleCache'
app.config['CACHE_DEFAULT_TIMEOUT'] = 300
cache = Cache(app)

# Set your music directory (update this path!)
MUSIC_DIR = 'music'

logging.basicConfig(level=logging.WARNING)
music_cache = []

# Volume persistence file and default value
VOLUME_FILE = "volume.json"
current_volume = 0.5

def load_volume():
    global current_volume
    if os.path.exists(VOLUME_FILE):
        try:
            with open(VOLUME_FILE, "r") as f:
                data = json.load(f)
                current_volume = data.get("volume", 0.5)
        except Exception:
            current_volume = 0.5

def save_volume(new_volume):
    global current_volume
    current_volume = new_volume
    try:
        with open(VOLUME_FILE, "w") as f:
            json.dump({"volume": current_volume}, f)
    except Exception:
        pass

load_volume()

def get_audio_metadata(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    metadata = {}
    try:
        if ext == '.flac':
            audio = FLAC(file_path)
            metadata['title'] = audio.get('title', ['Unknown Title'])[0]
            metadata['artist'] = audio.get('artist', ['Unknown Artist'])[0]
            metadata['album'] = audio.get('album', ['Unknown Album'])[0]
            metadata['year'] = audio.get('date', ['Unknown'])[0]
            metadata['genre'] = audio.get('genre', ['Unknown'])[0]
        elif ext == '.mp3':
            audio = MP3(file_path)
            metadata['title'] = str(audio.tags.get('TIT2', 'Unknown Title'))
            metadata['artist'] = str(audio.tags.get('TPE1', 'Unknown Artist'))
            metadata['album'] = str(audio.tags.get('TALB', 'Unknown Album'))
            metadata['year'] = str(audio.tags.get('TDRC', 'Unknown'))
            metadata['genre'] = str(audio.tags.get('TCON', 'Unknown'))
        elif ext in ('.aac', '.m4a'):
            audio = MP4(file_path)
            metadata['title'] = audio.tags.get('\xa9nam', ['Unknown Title'])[0]
            metadata['artist'] = audio.tags.get('\xa9ART', ['Unknown Artist'])[0]
            metadata['album'] = audio.tags.get('\xa9alb', ['Unknown Album'])[0]
            metadata['year'] = audio.tags.get('\xa9day', ['Unknown'])[0]
            metadata['genre'] = audio.tags.get('\xa9gen', ['Unknown'])[0] if audio.tags.get('\xa9gen') else 'Unknown'
        else:
            metadata = {'title': os.path.basename(file_path), 'artist': 'Unknown', 'album': 'Unknown'}
    except Exception:
        metadata = {'title': os.path.basename(file_path), 'artist': 'Unknown', 'album': 'Unknown'}
    return metadata

def get_cover_art(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == '.flac':
            audio = FLAC(file_path)
            if audio.pictures:
                pic = audio.pictures[0]
                return BytesIO(pic.data), pic.mime
        elif ext == '.mp3':
            audio = MP3(file_path)
            if audio.tags:
                apic_list = audio.tags.getall('APIC')
                if apic_list:
                    pic = apic_list[0]
                    return BytesIO(pic.data), pic.mime
        elif ext in ('.aac', '.m4a'):
            audio = MP4(file_path)
            covr = audio.tags.get('covr')
            if covr:
                data = covr[0]
                if data.startswith(b'\xff\xd8\xff'):
                    mime = 'image/jpeg'
                elif data.startswith(b'\x89PNG\r\n\x1a\n'):
                    mime = 'image/png'
                else:
                    mime = 'image/jpeg'
                return BytesIO(data), mime
    except Exception as e:
        print("Cover art extraction error for", file_path, e)
    return None, None

def scan_music_library():
    global music_cache
    try:
        files = [f for f in os.listdir(MUSIC_DIR) if f.lower().endswith(('.flac', '.mp3', '.aac', '.m4a'))]
    except Exception:
        files = []
    updated_cache = []
    for filename in files:
        file_path = os.path.join(MUSIC_DIR, filename)
        if not os.path.exists(file_path):
            continue
        metadata = get_audio_metadata(file_path)
        metadata['cover_url'] = f"/cover/{filename}"
        metadata['filename'] = filename
        updated_cache.append(metadata)
    music_cache = updated_cache

def periodic_scan(interval=300):
    while True:
        scan_music_library()
        time.sleep(interval)

threading.Thread(target=periodic_scan, daemon=True).start()

@app.route('/')
def index():
    return render_template('index.html', music_files=music_cache, current_volume=current_volume)

def send_file_partial(path, mimetype):
    """
    Supports HTTP Range requests for streaming media.
    """
    range_header = request.headers.get('Range', None)
    if not os.path.exists(path):
        abort(404)
    file_size = os.path.getsize(path)
    if not range_header:
        return send_file(path, mimetype=mimetype, as_attachment=False)
    
    byte1, byte2 = 0, None
    m = re.search(r'bytes=(\d+)-(\d*)', range_header)
    if m:
        g = m.groups()
        byte1 = int(g[0])
        if g[1]:
            byte2 = int(g[1])
    if byte2 is None or byte2 >= file_size:
        byte2 = file_size - 1
    length = byte2 - byte1 + 1

    with open(path, 'rb') as f:
        f.seek(byte1)
        data = f.read(length)

    rv = Response(data, 206, mimetype=mimetype, direct_passthrough=True)
    rv.headers.add('Content-Range', f'bytes {byte1}-{byte2}/{file_size}')
    rv.headers.add('Accept-Ranges', 'bytes')
    rv.headers.add('Content-Length', str(length))
    return rv

@app.route('/play/<filename>')
def play(filename):
    filepath = os.path.join(MUSIC_DIR, filename)
    if os.path.exists(filepath):
        ext = os.path.splitext(filename)[1].lower()
        if ext == '.aac':
            mimetype = 'audio/aac'
        elif ext == '.m4a':
            mimetype = 'audio/mp4'
        elif ext == '.mp3':
            mimetype = 'audio/mpeg'
        elif ext == '.flac':
            mimetype = 'audio/flac'
        else:
            mimetype = 'application/octet-stream'
        return send_file_partial(filepath, mimetype)
    else:
        abort(404)

@app.route('/cover/<filename>')
def cover(filename):
    filepath = os.path.join(MUSIC_DIR, filename)
    if os.path.exists(filepath):
        image_data, mime = get_cover_art(filepath)
        if image_data:
            return send_file(image_data, mimetype=mime)
    # Fallback: Ensure default_cover.jpg is present in static/
    return send_file(os.path.join('static', 'default_cover.jpg'), mimetype='image/jpeg')

@cache.cached()
@app.route('/api/artist/<artist>')
def api_artist(artist):
    filtered = [song for song in music_cache if song.get('artist', '').lower() == artist.lower()]
    return jsonify(filtered)

@app.route('/set_volume', methods=['POST'])
def set_volume():
    data = request.get_json()
    if "volume" in data:
        try:
            new_volume = float(data["volume"])
            save_volume(new_volume)
            return jsonify({"status": "ok", "volume": new_volume})
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 400
    return jsonify({"status": "error", "error": "No volume provided"}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)