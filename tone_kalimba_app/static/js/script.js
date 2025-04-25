const startButton = document.getElementById('startButton');
const toneDisplay = document.getElementById('toneDisplay');
const confidenceDisplay = document.getElementById('confidenceDisplay');
const messageDisplay = document.getElementById('message');

let mediaStream;
let audioContext;
let scriptProcessor; // Zůstáváme u ScriptProcessorNode pro jednoduchost, i když AudioWorklet je modernější
let isRecording = false;
const sampleRate = 22050; // Musí odpovídat serveru SAMPLE_RATE
let lastTone = null; // Proměnná pro uchování posledního rozpoznaného tónu

// --- Nové proměnné pro bufferování ---
let audioBuffer = []; // Buffer pro sběr audio dat
const TARGET_BUFFER_DURATION_S = 0.75; // Cílová délka bufferu v sekundách (laditelný parametr)
const TARGET_BUFFER_SIZE_SAMPLES = Math.floor(TARGET_BUFFER_DURATION_S * sampleRate);
// --- Konec nových proměnných ---

startButton.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording(); // Přidáno await
    }
});

async function startRecording() {
    messageDisplay.textContent = '';
    lastTone = null; // Reset posledního tónu
    audioBuffer = []; // Vyčistit buffer při startu

    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const source = audioContext.createMediaStreamSource(mediaStream);
        // Velikost bufferu ScriptProcessorNode může zůstat, ovlivňuje jen jak často se volá onaudioprocess
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            // Přidat nová data do našeho vlastního bufferu
            audioBuffer = audioBuffer.concat(Array.from(inputData)); // Array.from pro převod Float32Array

            // Zkontrolovat, zda buffer dosáhl cílové velikosti
            if (audioBuffer.length >= TARGET_BUFFER_SIZE_SAMPLES) {
                console.log(`Buffer plný (${audioBuffer.length} vzorků), odesílám...`);
                // Vytvořit kopii bufferu pro odeslání (Float32Array)
                const bufferToSend = new Float32Array(audioBuffer);

                // Vyčistit buffer pro další sběr (nebo ponechat překryv - zde čistíme)
                audioBuffer = [];

                // Vytvořit WAV a odeslat
                const wavBuffer = createWavBuffer(bufferToSend, sampleRate); // Posíláme celý buffer
                const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                sendAudioToServer(blob);
            }
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination); // Připojení k destinaci pro případný odposlech (lze odstranit)

        startButton.textContent = 'Zastavit rozpoznávání';
        toneDisplay.textContent = 'Poslouchám...';
        confidenceDisplay.textContent = '';
        isRecording = true;
        console.log("Nahrávání spuštěno...");

    } catch (err) {
        console.error('Chyba při získání přístupu k mikrofonu: ', err);
        messageDisplay.textContent = 'Chyba: Nelze získat přístup k mikrofonu. Povolte přístup.';
        toneDisplay.textContent = 'Chyba!';
        startButton.textContent = 'Spustit rozpoznávání';
        isRecording = false;
        audioBuffer = []; // Vyčistit buffer i při chybě
    }
}

function stopRecording() {
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor.onaudioprocess = null; // Odebrat handler
        scriptProcessor = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null; // Uvolnit stream
    }
    if (audioContext && audioContext.state !== 'closed') {
         audioContext.close(); // Uzavřít AudioContext
         audioContext = null;
    }

    // Zpracovat případný zbytek bufferu? Pro jednoduchost ne.
    audioBuffer = [];

    startButton.textContent = 'Spustit rozpoznávání';
    toneDisplay.textContent = '';
    confidenceDisplay.textContent = '';
    isRecording = false;
    lastTone = null; // Reset posledního tónu
    console.log("Nahrávání zastaveno.");
}

// Funkce createWavBuffer zůstává stejná, ale bude dostávat větší audioData pole
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
    view.setUint32(16, 16, true); // Subchunk1Size for PCM (18 for non-PCM like float) -> Ne, pro Float je to stále 16 + extra data? Zkusme 16. Standard říká 16 pro PCM, 18 pro non-PCM, 40 pro extensible. Ale Librosa by si měla poradit.
    // Standardně pro Float PCM (IEEE float) je wFormatTag = 3.
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

// Funkce sendAudioToServer zůstává víceméně stejná
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

        // Aktualizace UI zůstává stejná
        if (result.tone && result.tone !== 'None') {
            lastTone = result.tone;
            toneDisplay.textContent = result.tone;
            confidenceDisplay.textContent = `Jistota: ${(result.confidence * 100).toFixed(1)}%`;
            messageDisplay.textContent = result.message || ''; // Zobrazit případnou zprávu (např. "Kalimba")
        } else {
            // Pokud není rozpoznán tón, necháme poslední, pokud existuje
             if (lastTone && toneDisplay.textContent !== 'Poslouchám...') {
                 // Ponecháme zobrazený poslední tón, ale vymažeme jistotu
                 confidenceDisplay.textContent = '';
             } else {
                 // Pokud nebyl žádný předchozí tón NEBO jsme byli ve stavu "Poslouchám"
                 toneDisplay.textContent = 'Poslouchám...';
                 confidenceDisplay.textContent = '';
             }
             // Zobrazíme zprávu, pokud existuje (např. "Není kalimba")
             messageDisplay.textContent = result.message || '';
        }

    } catch (error) {
        console.error('Chyba při odesílání audio dat na server:', error);
        messageDisplay.textContent = `Chyba spojení nebo serveru: ${error.message}`;
        toneDisplay.textContent = 'Chyba!';
        confidenceDisplay.textContent = '';
        // stopRecording();
    }
}