const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const cols = 17;
// Zjednodušený výpočet náhodného intervalu spawnutí
const spawnInterval = Math.random() * (4000 - 2000) + 2000; // Náhodný interval mezi 2000 a 4000 ms
const gameDuration = 150000; // Délka hry v ms (2.5 minuty)
const fallTime = 4000; // Doba pádu noty shora dolů v ms (upraveno pro lepší hratelnost)
const hitY = canvas.height - 100; // Y pozice pro zásahovou zónu
const hitWin = 50; // Tolerance pro zásah (zvětšeno)

let score = 0, startTime = 0, spawnTimer;
let rects = []; // Používáme let, protože array reassignujeme ve filter
const inputQueue = []; // Fronta pro zpracování rozpoznaných tónů

// Tone names & mapping (Ujistěte se, že toto odpovídá tónům, které váš model rozpoznává)
const toneNames = ['D6', 'B5', 'G5', 'E5', 'C5', 'A4', 'F4', 'D4', 'C4', 'E4', 'G4', 'B4', 'D5', 'F5', 'A5', 'C6', 'E6'];
const toneMap = {};
toneNames.forEach((t, i) => toneMap[t] = i);

// Proměnné pro rozpoznávání tónů
let mediaStream, audioContext, scriptProcessor, isRecording = false;
const sampleRate = 22050; // Musí odpovídat sampleRate použitému na serveru
const TARGET_BUFFER_DURATION_S = 0.75; // Doba trvání bufferu pro odeslání na server
const TARGET_BUFFER_SIZE_SAMPLES = Math.floor(TARGET_BUFFER_DURATION_S * sampleRate);
let audioBuffer = [];

// Získání odkazů na elementy pro zobrazení tónu, jistoty a zprávy
const toneDisplay = document.getElementById('toneDisplay');
const confidenceDisplay = document.getElementById('confidenceDisplay');
const messageDisplay = document.getElementById('message');

// Získání odkazů na herní tlačítka
const startBtn = document.getElementById('startBtn');

let isGameRunning = false; // Příznak pro sledování, zda hra aktivně běží
let isLoadingMicrophone = false; // Příznak pro sledování, zda čekáme na povolení mikrofonu

// Doba trvání vizuálního efektu zásahu noty v ms
const hitEffectDuration = 200;

// Kontrola existence klíčových elementů na začátku
if (!canvas || !ctx || !toneDisplay || !confidenceDisplay || !messageDisplay || !startBtn) {
    console.error("Některé klíčové HTML elementy nebyly nalezeny. Hra se nemusí správně inicializovat.");
    // Deaktivovat tlačítko start, pokud chybí zásadní elementy
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.textContent = 'Chyba načítání prvků';
    }
    if (messageDisplay) messageDisplay.textContent = "Chyba načítání herních prvků. Zkontrolujte konzoli prohlížeče.";
}


function spawn() {
    // Zkontrolovat, zda hra ještě běží, než se spawne nová nota
    if (isGameRunning && performance.now() - startTime < gameDuration) {
        rects.push({ lane: Math.floor(Math.random() * cols), t: performance.now(), hit: false, hitTime: null });
    }
}

function draw() {
    if (!isGameRunning || !ctx) return;
    const now = performance.now(), elapsed = now - startTime;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // pozadí lajn (trapezoid)
    const topWidth = canvas.width * 0.6, offX = (canvas.width - topWidth)/2, bottomY = canvas.height;
    const topStep = topWidth/cols, botStep = canvas.width/cols;
    ctx.fillStyle = '#39A0ED';
    ctx.beginPath();
    ctx.moveTo(offX,0); ctx.lineTo(offX+topWidth,0);
    ctx.lineTo(canvas.width,bottomY); ctx.lineTo(0,bottomY);
    ctx.closePath(); ctx.fill();

    // zpracování vstupu
    while(inputQueue.length) {
      const lane = inputQueue.shift();
      let closest=null, minD=Infinity;
      rects.forEach(r=>{
        if(!r.hit && now-r.t<=fallTime) {
          const y=(now-r.t)/fallTime*canvas.height;
          const d=Math.abs(y-hitY);
          if(d<hitWin && r.lane===lane && d<minD) {minD=d; closest=r;}
        }
      });
      if(closest) { score++; closest.hit=true; closest.hitTime=now; }
    }

    // kreslení not jako "kosočtverce"
    rects.forEach(r=>{
      const dt = now-r.t;
      if(dt>fallTime || (r.hit && now-r.hitTime>=hitEffectDuration)) return;
      const y = dt/fallTime*canvas.height;
      const rectH=30;
      const y1 = y-rectH/2, y2 = y+rectH/2;
      const topStepW = topStep, botStepW = botStep;
      // pro každý okraj vypočítat x
      const xL1 = offX+topStepW*r.lane + (botStepW*r.lane - (offX+topStepW*r.lane))*(y1/canvas.height);
      const xR1 = offX+topStepW*(r.lane+1) + (botStepW*(r.lane+1) - (offX+topStepW*(r.lane+1)))*(y1/canvas.height);
      const xL2 = offX+topStepW*r.lane + (botStepW*r.lane - (offX+topStepW*r.lane))*(y2/canvas.height);
      const xR2 = offX+topStepW*(r.lane+1) + (botStepW*(r.lane+1) - (offX+topStepW*(r.lane+1)))*(y2/canvas.height);
      ctx.fillStyle = r.hit ? '#ffb3f7' : '#D183C9';
      ctx.beginPath();
      ctx.moveTo(xL1, y1);
      ctx.lineTo(xR1, y1);
      ctx.lineTo(xR2, y2);
      ctx.lineTo(xL2, y2);
      ctx.closePath(); ctx.fill();
    });

    rects = rects.filter(r=> (now-r.t)<=fallTime && !(r.hit && now-r.hitTime>=hitEffectDuration));

    // lajnove čáry & labely
    ctx.strokeStyle='#555'; ctx.lineWidth=1;
    for(let i=0;i<=cols;i++){
      const x0=offX+topStep*i, x1=botStep*i;
      ctx.beginPath(); ctx.moveTo(x0,0); ctx.lineTo(x1,bottomY); ctx.stroke();
    }
    ctx.fillStyle='#FFF'; ctx.font='16px sans-serif';
    toneNames.forEach((name,i)=>{
      const lx=botStep*(i+0.5);
      ctx.fillText(name, lx-ctx.measureText(name).width/2, bottomY-10);
    });

    // hit line
    ctx.strokeStyle='#FFF'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,hitY); ctx.lineTo(canvas.width,hitY); ctx.stroke();

    // HUD & konec
    const rem=Math.max(0,gameDuration-elapsed);
    if(rem<=0) { stopGame(); messageDisplay.textContent='Hra skončila!'; }
    document.getElementById('score').innerText=`Score: ${score}`;
    const s=Math.floor(rem/1000), mm=String(Math.floor(s/60)).padStart(2,'0'), ss=String(s%60).padStart(2,'0');
    document.getElementById('timer').innerText=`Time: ${mm}:${ss}`;

    if(isGameRunning) requestAnimationFrame(draw);
}

// Funkce pro spuštění hry a rozpoznávání mikrofonu
async function startGame() {
     // Kontrola, zda se již nenačítá mikrofon nebo hra již neběží
     if (isLoadingMicrophone || isGameRunning) {
         return;
     }

    isLoadingMicrophone = true; // Nastavit příznak načítání

    // Aktualizovat text tlačítka a stav pro načítání mikrofonu
    if (startBtn) {
         startBtn.disabled = true; // Deaktivovat tlačítko během načítání
         startBtn.textContent = 'Načítám mikrofon...';
    }
    if (messageDisplay) messageDisplay.textContent = 'Čekám na povolení mikrofonu v prohlížeči...';


    try {
        // Vyžádat si povolení přístupu k mikrofonu
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Povolení mikrofonu uděleno, nyní spustit hru

        isLoadingMicrophone = false; // Načítání dokončeno
        isGameRunning = true; // Hra nyní běží
        score = 0; // Reset skóre
        startTime = performance.now(); // Nastavit čas začátku
        rects = []; // Vyčistit noty
        inputQueue.length = 0; // Vyčistit vstupní frontu

        // Aktualizovat UI a stav tlačítek pro spuštěnou hru
        if (startBtn) {
            startBtn.disabled = true; // Deaktivovat Start během hry
            startBtn.textContent = 'Hrát';
        }

        if (messageDisplay) messageDisplay.textContent = ''; // Vyčistit zprávu
        if (toneDisplay) toneDisplay.textContent = 'Poslouchám...';
        if (confidenceDisplay) confidenceDisplay.textContent = '';
        if (document.getElementById('score')) document.getElementById('score').innerText = `Score: ${score}`; // Reset skóre na UI
        if (document.getElementById('timer')) document.getElementById('timer').innerText = 'Time: 2:30'; // Reset časovače na UI (vizuálně)

        // Inicializovat audio kontext a zpracování
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        const source = audioContext.createMediaStreamSource(mediaStream);
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            audioBuffer = audioBuffer.concat(Array.from(inputData));

            if (audioBuffer.length >= TARGET_BUFFER_SIZE_SAMPLES) {
                const bufferToSend = new Float32Array(audioBuffer);
                audioBuffer = [];
                const wavBuffer = createWavBuffer(bufferToSend, sampleRate);
                const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                sendAudioToServer(blob);
            }
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);
        isRecording = true; // Rozpoznávání tónů je nyní skutečně aktivní

        spawn(); // Vytvořit první notu
        if (spawnTimer) clearInterval(spawnTimer); // Zrušit předchozí časovač, pokud existuje
        spawnTimer = setInterval(spawn, spawnInterval); // Spouštět nové noty v intervalech

        requestAnimationFrame(draw); // Spustit herní smyčku kreslení


    } catch (err) {
        // Zpracování chyby při získávání přístupu k mikrofonu nebo inicializaci
        console.error('Chyba při získání přístupu k mikrofonu: ', err);
        isLoadingMicrophone = false; // Načítání dokončeno (s chybou)
        isGameRunning = false; // Zajistit, že hra neběží
        isRecording = false; // Zajistit, že rozpoznávání je vypnuté

        if (messageDisplay) messageDisplay.textContent = 'Chyba: Nelze získat přístup k mikrofonu. Povolte přístup pro spuštění hry.';
        if (toneDisplay) toneDisplay.textContent = 'Chyba!';
        if (confidenceDisplay) confidenceDisplay.textContent = '';

        if (startBtn) {
             startBtn.disabled = false; // Povolit tlačítko
        }

        rects = []; // Vyčistit případné vytvořené noty (neměly by žádné být, pokud se hra nespustila)
        inputQueue.length = 0; // Vyčistit vstupní frontu
        if (spawnTimer) clearInterval(spawnTimer); // Zajistit, že časovač je zrušen
         spawnTimer = null;
         stopToneRec(); // Uklidit audio zdroje, pokud byly částečně inicializovány


    }
}


// Funkce pro zastavení hry
function stopGame() {
    // Kontrola, zda se hra aktuálně nehraje nebo se nenačítá mikrofon
    if (!isGameRunning && !isLoadingMicrophone) return; // Zastavit pouze, pokud hra běžela nebo se načítal mikrofon

    isGameRunning = false; // Nastavit příznak, že hra neběží
    isLoadingMicrophone = false; // Zajistit, že příznak načítání je také false

    // Zastavit spouštění not
    clearInterval(spawnTimer);
    spawnTimer = null;

    // Zastavit rozpoznávání tónů
    stopToneRec();

    // Vymazat všechny existující noty okamžitě
    rects = [];

    // Aktualizovat UI a stav tlačítek pro stav "zastaveno"
    if (messageDisplay) messageDisplay.textContent = 'Hra zastavena.';
    if (toneDisplay) toneDisplay.textContent = ''; // Vyčistit zobrazení tónu
    if (confidenceDisplay) confidenceDisplay.textContent = ''; // Vyčistit zobrazení jistoty

    if (startBtn) {
        startBtn.disabled = false;
    }

     console.log("Hra zastavena.");
}

// Helper funkce pro vytvoření WAV bufferu (převzato z předchozích verzí)
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
    // PCM data (writing Float32)
    let offset = 44;
    for (let i = 0; i < audioData.length; i++, offset += bytesPerSample) {
        view.setFloat32(offset, audioData[i], true);
    }

    return buffer;
}

// Helper funkce pro zápis řetězce do DataView (převzato z předchozích verzí)
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Funkce pro odesílání audio dat na server a zpracování odpovědi (převzato a upraveno z předchozích verzí)
async function sendAudioToServer(audioBlob) {
    // Pokud hra neběží nebo se nenahrává, data nezpracovávat ani neodesílat
    if (!isGameRunning || !isRecording) {
        return;
    }

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

        // Zpracování rozpoznaného tónu
        if (result.tone && result.tone !== 'None' && toneMap[result.tone] != null) {
            const recognizedLane = toneMap[result.tone];
             // Pouze přidat do fronty, pokud hra stále běží
            if (isGameRunning) { // Zbytečná kontrola, ale neškodná
                inputQueue.push(recognizedLane); // Přidání rozpoznané "dráhy" do herní vstupní fronty
                console.log(`Rozpoznán tón: ${result.tone}, přidána lajna ${recognizedLane}`); // Log rozpoznaného tónu
            }

            // Aktualizace UI pro zobrazení tónu a jistoty
            if (toneDisplay) toneDisplay.textContent = result.tone;
            if (confidenceDisplay) confidenceDisplay.textContent = `Jistota: ${(result.confidence * 100).toFixed(1)}%`;
            if (messageDisplay) messageDisplay.textContent = result.message || '';

        } else {
            // Pokud nebyl rozpoznán žádný tón nebo tón není v naší mapě
             if (toneDisplay) toneDisplay.textContent = '...'; // Zobrazit indikátor naslouchání
             if (confidenceDisplay) confidenceDisplay.textContent = ''; // Vyčistit jistotu
             // Ponechat poslední zprávu nebo zobrazit výchozí
             // if (messageDisplay) messageDisplay.textContent = result.message || '';
        }

    } catch (error) {
        console.error('Chyba při odesílání audio dat na server:', error);
        if (messageDisplay) messageDisplay.textContent = `Chyba spojení nebo serveru: ${error.message}`;
        if (toneDisplay) toneDisplay.textContent = 'Chyba!';
        if (confidenceDisplay) confidenceDisplay.textContent = '';
        // Volitelně zastavit hru nebo zobrazit trvalou chybu, pokud selže komunikace se serverem
        // stopGame(); // Možná nechceme zastavit nahrávání úplně, jen zobrazit chybu
    }
}

// Funkce pro zastavení rozpoznávání tónů
function stopToneRec() {
    if (isRecording) {
        isRecording = false;
        if (scriptProcessor) {
            scriptProcessor.disconnect();
            scriptProcessor = null;
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        if (audioContext) {
            audioContext.close().then(() => audioContext = null);
        }
         console.log("Rozpoznávání tónů zastaveno.");
    }
}

// Obsluha kliknutí na tlačítko Start
if (startBtn) {
    startBtn.onclick = startGame;
}

// Inicializace stavu tlačítek při načtení stránky
document.addEventListener('DOMContentLoaded', () => {
    if (startBtn) {
        startBtn.disabled = false;
    }
});