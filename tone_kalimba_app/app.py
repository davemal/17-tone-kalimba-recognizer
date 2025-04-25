import numpy as np
import librosa
import tensorflow as tf
from flask import Flask, request, jsonify, render_template
import io
import joblib # <-- Přidáno pro načtení SVM modelu a scaleru
import time # <-- Pro případné měření času

# Parameters
SAMPLE_RATE = 22050
ONSET_THRESHOLD = 0.3 # Ponecháno, možná bude třeba ladit
CONFIDENCE_THRESHOLD = 0.7 # Ponecháno, možná bude třeba ladit
MIN_SEGMENT_LEN_FOR_SVM = 1024 # Minimální délka segmentu pro SVM (např. ~50ms)
MIN_SEGMENT_LEN_FOR_TONE = 2048 # Minimální délka segmentu pro tónový model (např. ~90ms)

# ---- Načtení modelů ----
svm_model = None
scaler = None
tone_model = None

try:
    svm_model = joblib.load("kalimba_ocsvm.pkl")
    print("SVM model kalimba_ocsvm.pkl úspěšně načten.")
except Exception as e:
    print(f"Chyba při načítání SVM modelu: {e}")
    # Aplikace může běžet i bez SVM, ale nebude filtrovat

# SVM funguje špatně, proto smazáno
svm_model = None

try:
    scaler = joblib.load("scaler.pkl")
    print("Scaler scaler.pkl úspěšně načten.")
except Exception as e:
    print(f"Chyba při načítání scaleru: {e}")
    # Pokud selže scaler, SVM nebude fungovat správně

try:
    tone_model = tf.keras.models.load_model("tone_recognition_multi_label.h5")
    print("Model tone_recognition_multi_label.h5 úspěšně načten.")
except Exception as e:
    print(f"Chyba při načítání tónového modelu: {e}")
    # Toto je kritická chyba, aplikace nemůže rozpoznávat tóny

label_to_tone = {
    0: "C4", 1: "D4", 2: "E4", 3: "F4", 4: "G4", 5: "A4", 6: "B4",
    7: "C5", 8: "D5", 9: "E5", 10: "F5", 11: "G5", 12: "A5", 13: "B5",
    14: "C6", 15: "D6", 16: "E6"
}
# ---- Konec načítání modelů ----

# ---- Funkce extrakce příznaků pro SVM (z notebooku) ----
def extract_features_from_segment(y, sr=SAMPLE_RATE):
    """Extrahuj příznaky pro SVM klasifikátor."""
    if len(y) == 0:
        return None

    try:
        # MFCC features
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, n_fft=2048, hop_length=512)
        mfccs_mean = np.mean(mfccs, axis=1)
        mfccs_std = np.std(mfccs, axis=1)

        # Další příznaky
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=2048, hop_length=512))
        zero_crossing_rate = np.mean(librosa.feature.zero_crossing_rate(y=y, hop_length=512))
        spectral_bandwidth = np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=2048, hop_length=512))
        spectral_rolloff = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr, n_fft=2048, hop_length=512))

        # Spojit všechny příznaky do jednoho vektoru
        # Ujistěte se, že pořadí a počet odpovídá trénování scaleru!
        features = np.concatenate([
            mfccs_mean,
            mfccs_std,
            [spectral_centroid],
            [zero_crossing_rate],
            [spectral_bandwidth],
            [spectral_rolloff]
        ])
        return features
    except Exception as e:
        print(f"Chyba při extrakci SVM příznaků: {e}")
        return None

# ---- Funkce pro zpracování tónovým modelem (mírně upravená) ----
def process_audio_segment_for_tone(buffer, sr=SAMPLE_RATE):
    """Zpracuj segment pomocí tónového modelu."""
    if len(buffer) == 0:
        return -1, 0.0

    # Kontrola minimální energie
    # if np.max(np.abs(buffer)) < 0.01:
    #     print("Segment má příliš nízkou energii pro tónový model.")
    #     return -1, 0.0

    try:
        buffer_float = buffer.astype(np.float32) # Zajistit správný typ
        mel_spec = librosa.feature.melspectrogram(y=buffer_float, sr=sr, n_fft=2048, hop_length=512, n_mels=128)
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)

        # Připravit vstup pro model
        mel_spec_db_resized = tf.image.resize(np.expand_dims(mel_spec_db, axis=-1), (128, 128)).numpy()
        input_data = np.expand_dims(mel_spec_db_resized, axis=0)

        # Predikce
        predictions = tone_model.predict(input_data, verbose=0)
        predicted_label = np.argmax(predictions[0])
        confidence = np.max(predictions[0])

        return predicted_label, float(confidence) # Vrátit confidence jako float

    except Exception as e:
        print(f"Chyba při zpracování tónu modelem: {e}")
        return -1, 0.0

# ---- Funkce pro detekci nástupu (Onset) ----
def detect_onset_in_segment(buffer, sr=SAMPLE_RATE):
    """Detekuj poslední nástup v daném bufferu."""
    if len(buffer) == 0:
        return None
    try:
        buffer_float = buffer.astype(np.float32)
        # Použijeme spíše librosa.onset.onset_detect, která vrací časy/vzorky
        # 'units' nastavíme na 'samples' pro indexy
        onsets = librosa.onset.onset_detect(
            y=buffer_float,
            sr=sr,
            units='samples',
            hop_length=512, # Standardní hodnota
            backtrack=False, # Nebo True, pokud chcete posunout k nejbližšímu minimu energie
            delta=ONSET_THRESHOLD, # Prah pro peak picking
             wait=1 # Počet hopů pro čekání mezi peaky
        )
        if len(onsets) > 0:
            # Vrátíme index posledního detekovaného nástupu
            return onsets[-1]
        return None
    except Exception as e:
        print(f"Chyba při detekci onsets: {e}")
        return None

# ---- Flask Aplikace ----
app = Flask(__name__)

@app.route('/')
def index():
    # Zajistit, že šablona index.html existuje ve složce 'templates'
    return render_template('index.html')

@app.route('/recognize_tone', methods=['POST'])
def recognize_tone():
    start_time = time.time() # Měření času zpracování

    # --- Kontrola načtení modelů ---
    if tone_model is None:
         print("Chyba: Tónový model není načten.")
         return jsonify({"tone": "Error", "confidence": 0.0, "message": "Server Error: Tone model not loaded"}), 500
    # SVM a scaler jsou volitelné, ale pokud jeden chybí, SVM se nepoužije
    use_svm = svm_model is not None and scaler is not None
    if not use_svm:
        print("Varování: SVM model nebo scaler není načten, před-filtrování bude přeskočeno.")


    if 'audio' not in request.files:
        print("Chyba: Nebyl přijat žádný audio soubor.")
        return jsonify({"tone": "None", "confidence": 0.0, "message": "No audio file received"}), 400

    audio_file = request.files['audio']
    audio_data = io.BytesIO(audio_file.read())

    detected_tone = "None"
    confidence_value = 0.0
    message = ""

    try:
        # Načíst celý přijatý audio segment (nyní delší)
        y, sr = librosa.load(audio_data, sr=SAMPLE_RATE)
        print(f"Přijato audio: délka {len(y)} vzorků ({len(y)/sr:.2f} s)")

        if len(y) == 0:
             print("Prázdný audio segment.")
             return jsonify({"tone": "None", "confidence": 0.0, "message": "Empty audio received"})


        # 1. Detekce nástupu (Onset) v celém segmentu
        onset_sample_index = detect_onset_in_segment(y, sr)

        if onset_sample_index is not None:
            print(f"Nástup detekován na vzorku: {onset_sample_index}")
            # Vezmeme segment od posledního nástupu do konce
            segment_to_process = y[onset_sample_index:]
            segment_len = len(segment_to_process)
            print(f"Délka segmentu po nástupu: {segment_len} vzorků ({segment_len/sr:.2f} s)")

            # --- Kontrola minimální délky pro SVM ---
            if segment_len >= MIN_SEGMENT_LEN_FOR_SVM:

                is_kalimba = -1 # Výchozí stav (neznámý nebo chyba)
                # 2. (Volitelné) Před-filtrování pomocí SVM
                if use_svm:
                    features = extract_features_from_segment(segment_to_process, sr)
                    if features is not None:
                        try:
                            features_scaled = scaler.transform([features]) # Scaler očekává 2D pole
                            is_kalimba = svm_model.predict(features_scaled)[0] # 1 = inlier (kalimba), -1 = outlier
                            print(f"SVM výsledek: {'Kalimba (inlier)' if is_kalimba == 1 else 'Není kalimba (outlier)'}")
                        except Exception as e:
                            print(f"Chyba při použití SVM nebo scaleru: {e}")
                            is_kalimba = -1 # Označit jako chybu/neznámý stav
                    else:
                        print("Nepodařilo se extrahovat SVM příznaky.")
                        is_kalimba = -1
                else:
                    # Pokud SVM nepoužíváme, předpokládáme, že to MŮŽE být kalimba
                    is_kalimba = 1 # Skok rovnou na tónový model
                    print("SVM se nepoužívá, pokračuji na tónový model.")


                # 3. Rozpoznání tónu (pouze pokud je to kalimba nebo pokud SVM není aktivní/selhal)
                #    A pokud je segment dost dlouhý pro tónový model
                if is_kalimba == 1 and segment_len >= MIN_SEGMENT_LEN_FOR_TONE:
                    predicted_label, confidence = process_audio_segment_for_tone(segment_to_process, sr)

                    if confidence >= CONFIDENCE_THRESHOLD and predicted_label in label_to_tone:
                        detected_tone = label_to_tone[predicted_label]
                        confidence_value = confidence
                        message = "Kalimba" # Přidáme zprávu
                        print(f"---> Detekován tón: {detected_tone} s jistotou {confidence_value*100:.1f}%")
                    else:
                        # Tón nebyl rozpoznán s dostatečnou jistotou
                        message = "Kalimba (nízká jistota tónu)" if is_kalimba == 1 else "Není kalimba"
                        print(f"Tón nerozpoznán (jistota {confidence*100:.1f}% < {CONFIDENCE_THRESHOLD*100}%)")

                elif is_kalimba == -1 and not use_svm:
                     # Pokud SVM nebylo použito a segment je krátký pro tónový model
                     print("Segment příliš krátký pro tónový model.")
                     message = "Krátký zvuk"
                elif is_kalimba != 1 and use_svm:
                     # Pokud SVM aktivně řeklo, že to není kalimba
                     message = "Není kalimba"
                     print("Segment klasifikován jako 'Není kalimba'.")
                else:
                     # Ostatní případy (krátký segment pro tónový model i když SVM prošlo)
                     print("Segment příliš krátký pro tónový model.")
                     message = "Kalimba (krátký tón?)"


            else:
                print("Segment po nástupu je příliš krátký pro zpracování.")
                message = "Příliš krátký zvuk po nástupu"
        else:
            print("V přijatém segmentu nebyl detekován žádný nástup.")
            message = "Ticho nebo nevýrazný zvuk"


        end_time = time.time()
        print(f"Doba zpracování požadavku: {(end_time - start_time)*1000:.1f} ms")

        return jsonify({
            "tone": detected_tone,
            "confidence": float(confidence_value), # Zajistit, že je to float
            "message": message
        })

    except Exception as e:
        print(f"!!! Kritická chyba serveru při zpracování audia: {e}")
        import traceback
        traceback.print_exc() # Vytisknout celý traceback pro ladění
        return jsonify({"tone": "Error", "confidence": 0.0, "message": f"Server error: {e}"}), 500

if __name__ == '__main__':
    # Ujistěte se, že máte soubory kalimba_ocsvm.pkl a scaler.pkl ve stejné složce
    # nebo upravte cesty v joblib.load()
    # Spusťte s debug=False v produkci
    app.run(debug=True, host='0.0.0.0', port=8000) # host='0.0.0.0' zpřístupní aplikaci v lokální síti