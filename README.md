# ♟ Chess.com Opponent Stats — Estensione Chrome

Mostra le statistiche dell'avversario direttamente su chess.com: vittorie/sconfitte negli ultimi 1, 7 e 30 giorni, WLR (Win/Loss Ratio), win rate percentuale e Peak ELO.

---

## 📦 Installazione (modalità sviluppatore)

1. **Scarica** e decomprimi la cartella dell'estensione.
2. Apri Chrome e vai su **`chrome://extensions/`**
3. Attiva **"Modalità sviluppatore"** (in alto a destra).
4. Clicca **"Carica estensione non pacchettizzata"**.
5. Seleziona la cartella `chess-stats-extension`.
6. L'icona apparirà nella barra delle estensioni. ✅

---

## 🚀 Come si usa

1. Vai su **chess.com** (partita in corso, profilo, lobby, ecc.).
2. Accanto al nome dell'avversario comparirà il bottone **📊**.
3. Cliccalo: si apre il pannello flottante con tutte le statistiche.
4. Il pannello è **trascinabile** — spostalo dove vuoi.
5. Chiudilo con il bottone **✕**.

---

## 📊 Dati mostrati

| Campo | Descrizione |
|---|---|
| **ELO attuale** | Rating in rapid, blitz, bullet |
| **🏆 Peak ELO** | Massimo storico per modalità |
| **✅ Vittorie** | Negli ultimi 1 / 7 / 30 giorni |
| **❌ Sconfitte** | Negli ultimi 1 / 7 / 30 giorni |
| **🤝 Patte** | Negli ultimi 1 / 7 / 30 giorni |
| **WLR** | Win/Loss Ratio (vittorie ÷ sconfitte) |
| **Win%** | Percentuale di vittorie sul totale |

---

## 🔒 Privacy

- L'estensione utilizza solo l'**API pubblica di chess.com** (`api.chess.com/pub/`).
- Nessun dato viene inviato a server terzi.
- Le risposte API vengono **messe in cache** per 5 minuti per ridurre le richieste.

---

## ⚠️ Note

- Le statistiche per "1 giorno" e "7 giorni" sono calcolate filtrando le partite dell'archivio mensile di chess.com.
- Il **Peak ELO** proviene dall'endpoint `/stats` dell'API pubblica.
- chess.com non fornisce un endpoint diretto per i periodi personalizzati — i dati vengono calcolati lato client.

---

## 🛠 Struttura file

```
chess-stats-extension/
├── manifest.json      ← Configurazione estensione (MV3)
├── content.js         ← Logica principale + chiamate API
├── styles.css         ← Stili pannello flottante
├── icon16.png
├── icon48.png
└── icon128.png
```
