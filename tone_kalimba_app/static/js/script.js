const startButton = document.getElementById('startButton');
const toneDisplay = document.getElementById('toneDisplay');
const confidenceDisplay = document.getElementById('confidenceDisplay');
const messageDisplay = document.getElementById('message');

let mediaStream;
let audioContext;
let scriptProcessor;
let isRecording = false;
const sampleRate = 22050;
let lastTone = null;
let currentlyHighlightedKeyId = null; // Sledování zvýrazněné klávesy

// --- Nové proměnné pro bufferování ---
let audioBuffer = [];
const TARGET_BUFFER_DURATION_S = 0.75;
const TARGET_BUFFER_SIZE_SAMPLES = Math.floor(TARGET_BUFFER_DURATION_S * sampleRate);
// --- Konec nových proměnných ---

startButton.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
});

async function startRecording() { 
    lastTone = null;
    audioBuffer = [];
    unhighlightKey(); // Zrušit zvýraznění při startu

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const source = audioContext.createMediaStreamSource(mediaStream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            audioBuffer = audioBuffer.concat(Array.from(inputData));

            if (audioBuffer.length >= TARGET_BUFFER_SIZE_SAMPLES) {
                console.log(`Buffer plný (${audioBuffer.length} vzorků), odesílám...`);
                const bufferToSend = new Float32Array(audioBuffer);
                audioBuffer = [];
                const wavBuffer = createWavBuffer(bufferToSend, sampleRate);
                const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                sendAudioToServer(blob);
            }
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        startButton.textContent = 'Zastavit rozpoznávání';
        toneDisplay.textContent = 'Poslouchám...';
        toneDisplay.style.color = '#D7263D';
        confidenceDisplay.textContent = '';
        isRecording = true;
        console.log("Nahrávání spuštěno...");

    } catch (err) {
        console.error('Chyba při získání přístupu k mikrofonu: ', err);
        messageDisplay.textContent = 'Chyba: Nelze získat přístup k mikrofonu. Povolte přístup.';
        toneDisplay.textContent = 'Chyba!';
        startButton.textContent = 'Spustit rozpoznávání';
        isRecording = false;
        audioBuffer = [];
        unhighlightKey(); // Zrušit zvýraznění i při chybě
    }
}

function stopRecording() {
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor.onaudioprocess = null;
        scriptProcessor = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
         audioContext.close();
         audioContext = null;
    }

    audioBuffer = [];
    startButton.textContent = 'Spustit rozpoznávání';
    toneDisplay.textContent = '';
    confidenceDisplay.textContent = '';
    isRecording = false;
    lastTone = null;
    unhighlightKey(); // Zrušit zvýraznění při zastavení
    console.log("Nahrávání zastaveno.");
}

// Funkce createWavBuffer a writeString zůstávají stejné (viz váš původní soubor)
function createWavBuffer(audioData, sampleRate) {
    const numChannels = 1;
    const bitsPerSample = 32; // Používáme Float32
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioData.length * bytesPerSample;
    const bufferSize = 44 + dataSize; // Velikost celého bufferu

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // WAV header (RIFF chunk)
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // ChunkSize
    writeString(view, 8, 'WAVE');

    // Format sub-chunk ('fmt ')
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true); // AudioFormat (3 = IEEE float)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample

    // Data sub-chunk ('data')
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true); // Subchunk2Size

    // PCM data (zápis Float32)
    let offset = 44;
    for (let i = 0; i < audioData.length; i++, offset += bytesPerSample) {
        view.setFloat32(offset, audioData[i], true);
    }

    return buffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function highlightKey(tone) {
    unhighlightKey(); // Nejprve zrušíme předchozí zvýraznění

    if (tone && tone !== 'None') {
        const keyId = `key-${tone}`; // Předpokládáme formát tónu jako "C4", "D#5" atd.
        const keyElement = document.getElementById(keyId);
        if (keyElement) {
            keyElement.classList.add('highlighted');
            currentlyHighlightedKeyId = keyId; // Uložíme ID aktuálně zvýrazněné klávesy
            console.log(`Highlighting key: ${keyId}`);
        } else {
            console.warn(`Key element not found for tone: ${tone} (ID: ${keyId})`);
        }
    }
}

function unhighlightKey() {
    if (currentlyHighlightedKeyId) {
        const previousKey = document.getElementById(currentlyHighlightedKeyId);
        if (previousKey) {
            previousKey.classList.remove('highlighted');
            console.log(`Unhighlighting key: ${currentlyHighlightedKeyId}`);
        }
        currentlyHighlightedKeyId = null;
    }
}

async function sendAudioToServer(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.wav');

    try {
        const response = await fetch('/recognize_tone', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const result = await response.json();

        // Aktualizace UI pro tón a jistotu
        if (result.tone && result.tone !== 'None') {
            lastTone = result.tone;
            toneDisplay.textContent = result.tone;
            confidenceDisplay.textContent = `Jistota: ${(result.confidence * 100).toFixed(1)}%`;
            messageDisplay.textContent = result.message || '';
            highlightKey(result.tone); // ZVÝRAZNĚNÍ KLÁVESY

            const keyId = `key-${result.tone}`;
            const keyElement = document.getElementById(keyId);

            if (keyElement) {
                if (keyElement.classList.contains('group-left')) {
                    toneDisplay.style.color = '#D183C9'; // Barva pro levou skupinu (shodná s highlighted barvou)
                } else if (keyElement.classList.contains('group-right')) {
                    toneDisplay.style.color = '#39A0ED'; // Barva pro pravou skupinu (shodná s highlighted barvou)
                } else {
                      if (keyElement.classList.contains('middle-key') && keyElement.classList.contains('group-right')) {
                          toneDisplay.style.color = '#39A0ED';
                      } else {
                          toneDisplay.style.color = '#D7263D'; // Původní barva z CSS
                      }
                }
            } else {
                 // Pokud element klávesy nebyl nalezen, nastavte výchozí barvu
                 toneDisplay.style.color = '#D7263D'; // Původní barva z CSS
                 console.warn(`Key element not found for tone: ${result.tone} (ID: ${keyId})`);
            }
        } else {
             if (lastTone && toneDisplay.textContent !== 'Poslouchám...') {
                 confidenceDisplay.textContent = '';
                 unhighlightKey(); // ZRUŠENÍ ZVÝRAZNĚNÍ
             } else {
                 toneDisplay.textContent = 'Poslouchám...';
                 confidenceDisplay.textContent = '';
                 unhighlightKey(); // ZRUŠENÍ ZVÝRAZNĚNÍ
                 toneDisplay.style.color = '#D7263D';
             }
             messageDisplay.textContent = result.message || '';
        }
    } catch (error) {
        console.error('Chyba při odesílání audio dat na server:', error);
        messageDisplay.textContent = `Chyba spojení nebo serveru: ${error.message}`;
        toneDisplay.textContent = 'Chyba!';
        confidenceDisplay.textContent = '';
        unhighlightKey(); // Zrušit zvýraznění i při chybě serveru
        toneDisplay.style.color = '#D7263D'; // Nastavit barvu chyby
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const keys = [
      'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4',
      'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5',
      'C6', 'D6', 'E6'
    ];

    keys.forEach((key, index) => {
      const element = document.getElementById(`key-${key}`);
      if (element) {
        element.style.height = `${100 - index * 5}%`;
      }
    });
});
