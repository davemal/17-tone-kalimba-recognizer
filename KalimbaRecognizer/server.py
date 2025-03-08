import wave
import io
import numpy as np
from flask import Flask
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

audio_buffer = io.BytesIO()

@socketio.on("audio")
def handle_audio(data):
    global audio_buffer
    audio_buffer.write(data)
    print(f"Přijato {len(data)} bytů audia")

@socketio.on("stop_recording")
def save_audio():
    global audio_buffer

    audio_buffer.seek(0)
    raw_audio = np.frombuffer(audio_buffer.getvalue(), dtype=np.int16)

    with wave.open("audio_received.wav", "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit PCM
        wav_file.setframerate(44100)  # 44.1 kHz
        wav_file.writeframes(raw_audio.tobytes())

    print("Audio bylo správně uloženo jako audio_received.wav")
    
    # Reset bufferu
    audio_buffer = io.BytesIO()

if __name__ == "__main__":
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)
