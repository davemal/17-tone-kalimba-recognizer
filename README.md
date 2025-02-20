# 17-tone-kalimba-recognizer

### Kalimba
- [x] Naladení hudebního nástroje na správné tóny
    - [x] D6 1174,6
    - [x] B5 987,7
    - [x] G5 784,0
    - [x] E5 659,2
    - [x] C5 523,2
    - [x] A4 440,0
    - [x] F4 349,2
    - [x] D4 293,6
    - [x] C4 261,6
    - [x] E4 329,6
    - [x] G4 392,0
    - [x] B4 493,8
    - [x] D5 587,3
    - [x] F5 698,4
    - [x] A5 880,0
    - [x] C6 1046,5
    - [x] E6 1318,5

### Data
- [x] Rozsekání dlouhé nahrávky na krátké úseky
- [x] Filtrace záznamů obsahující tóny z krátkých úseků (klasterizace)
- [ ] 100 záznamů od každého tónu
    - [ ] D6 
    - [ ] B5 
    - [ ] G5 
    - [ ] E5 
    - [ ] C5 
    - [ ] A4 
    - [ ] F4 
    - [ ] D4 
    - [ ] C4 
    - [ ] E4 
    - [ ] G4 
    - [ ] B4 
    - [ ] D5 
    - [ ] F5 
    - [ ] A5 
    - [ ] C6 
    - [ ] E6 
- [ ] Více záznamů pro jednotlivé tóny
- [ ] Normalizace dat
- [ ] Využít Spektogram nebo MFCC pro trénování modelu?
    - [ ] Normalizace a převod z WAV souboru na MFCC
        - *Data se převedou ze souboru WAV na MFCC za pomocí knihovny **Librosa***

### Model
- [ ] Vymyšlení modelu
    - [ ] Počet vstupních neuronů
    - [ ] Počet vrstev
    - [ ] Počet neuronů v jednotlivých vrstvách
    - [ ] Počet výstupních neuronů
- [ ] Jednoduchý model pro rozpoznávání méně tónů (např. 3 - 5)
- [ ] Složitější model pro rozpoznávání všech 17 tónů
- [ ] Vylepšení modelu pro rozpoznávání vícero nejednou zahraných tónů
- [ ] Optimalizace modelu

### Aplikování modelu
- [ ] Tensorflow Lite - prohnání nahrávky z mikrofonu modelem
- [ ] Vytvoření mobilní aplikace ve Flutteru

- ### Mobilní aplikace
    - [ ] Získání a zpracování audia z mikrofonu
        - *Pro získání audia a jeho zpracování lze využít jednu z těchto knihoven **tflite_audio** nebo **flutter_audio_processing**. Je zapotřebí, aby se při převodu získané audio z mikrofonu normalizovalo stejným způsobem jako v případě trénování modelu a to stejné platí pro nastavení parametrů při převodu na MFCC*
    - [ ] Načtení TFlite modelu
    - [ ] Jednoduchá aplikace ukazující zahraný tón
    - [ ] Jednoduchá aplikace sloužící k trénování skladeb
    - [ ] Pokročilá aplikace sloužící k trénování skladeb (Kalimba Hero)
