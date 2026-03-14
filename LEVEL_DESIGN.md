# Level Design Workflow (Sambo Phaser Prototype)

## 1) Controlli disponibili
- Movimento: **A / D** (anche frecce sinistra/destra)
- Salto: **W / Space / Freccia su**

## 2) Flusso consigliato per il level design
1. Scegli una traccia audio (WAV 16-bit PCM consigliato).
2. Genera analisi e bozza livello:
   ```bash
   python scripts/audio_to_level.py --input path/to/track.wav --output-dir data
   ```
3. Apri `data/audio_analysis.json`:
   - verifica `bpm`
   - controlla la forma della `energy_curve`
4. Apri `data/level_draft.json`:
   - ogni segmento ha `energy_state`, `platform_types`, `vertical_range`, `rhythm_density`
5. Usa la bozza come base e rifinisci manualmente i segmenti:
   - Low: orientamento, piattaforme larghe
   - Medium: alternanza e timing
   - High: precisione, verticalità e combinazioni beat/ghost
6. Porta i segmenti in gioco (in questa fase prototipale sono visualizzati placeholder; il prossimo step naturale è caricare JSON runtime).

## 3) Suggerimenti pratici
- Se il BPM stimato non è corretto, usa override manuale:
  ```bash
  python scripts/audio_to_level.py --input track.wav --output-dir data --bpm 128
  ```
- Per una prima iterazione rapida, mantieni segmenti da 8 beat e modifica solo:
  - `vertical_range`
  - `platform_types`
  - `rhythm_density`

## 4) Limiti attuali
- Lo script di preprocessing è volutamente lightweight (solo stdlib Python).
- BPM stimato con autocorrelazione su energia RMS: buono per bozza iniziale, non sostituisce tool professionali (es. librosa).


## 5) Editor semplice incluso
- È disponibile un editor minimale nel progetto: **`/editor.html`** (avvia prima `npm run start`).
- Funzioni disponibili:
  - caricare un `level_draft.json`
  - modificare segmenti in tabella
  - **anteprima grafica minimap live** (in basso a destra)
  - aggiungere/eliminare/ordinare segmenti
  - esportare o copiare il JSON aggiornato
- Workflow consigliato:
  1. genera bozza con `audio_to_level.py`
  2. apri `http://localhost:4173/editor.html`
  3. importa il file e rifinisci parametri
  4. salva `level_draft.edited.json`
