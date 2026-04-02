# Workout App — Bouwspecificatie

Dit document is de volledige specificatie voor een statische workout-tracking webapp, gebouwd voor deployment op GitHub Pages. Alle ontwerpbeslissingen zijn al genomen — implementeer ze zo, zonder opnieuw te vragen.

---

## 1. Projectcontext

De app is voor persoonlijk gebruik door één gebruiker. Ze beheert workouts door JSON-bestanden te editen (developer-mode). De focus tijdens een workout ligt volledig op **wat nu gedaan moet worden**. Historische data is beschikbaar maar niet de hoofdfocus.

---

## 2. Bestandsstructuur

```
/
├── .nojekyll                          ← leeg bestand, verplicht voor GitHub Pages
├── index.html                         ← overzicht van alle workouts
├── workout.html                       ← ?w=leg-day, twee modi: lijst + actief
├── style.css
├── app.js
├── data/
│   ├── exercises.json                 ← bibliotheek van alle oefeningen
│   └── workouts/
│       ├── index.json                 ← manifest: array van workout-ids
│       ├── leg-day.json
│       └── benen-warm-maken.json
└── assets/
    └── images/
        └── *.gif / *.jpg / *.png
```

**Regels:**
- Alle `fetch()` paden zijn relatief aan de HTML-pagina die ze aanroept. Geen leading `/`, geen absolute paden.
- `workout.html` fetcht `data/exercises.json` en `data/workouts/leg-day.json`.
- `index.html` fetcht `data/workouts/index.json`.

---

## 3. Data model

### 3.1 `data/workouts/index.json`

```json
["leg-day", "benen-warm-maken"]
```

Een array van workout-ids (= bestandsnamen zonder `.json`). Dit is de enige manier om te weten welke workouts bestaan — GitHub Pages kan geen directory listing doen vanuit de browser.

### 3.2 `data/workouts/<id>.json`

```json
{
  "name": "Leg Day",
  "blocks": [
    {
      "id": "block-warmup",
      "name": "Warming-up",
      "exercises": [
        { "id": "ex-1", "ref": "loopband",      "variant": "activatie" },
        { "id": "ex-2", "ref": "hamstring-curl", "variant": "activatie" }
      ]
    },
    {
      "id": "block-main",
      "name": "Hoofdwerk",
      "exercises": [
        { "id": "ex-3", "ref": "hamstring-curl", "variant": "uitdaging" }
      ]
    }
  ]
}
```

**Regels:**
- Het JSON-bestand bevat géén `id` veld op het toplevel. De bestandsnaam én de query param `?w=leg-day` zijn de enige canonieke identifier. Er zijn dus nooit drie bronnen die uit sync kunnen raken.
- Elk `block` heeft een unieke `id` (stabiel, nooit wijzigen).
- Elke `exercise` entry in een workout heeft een unieke `id` binnen die workout (stabiel, nooit wijzigen). Deze id wordt gebruikt in de sessie- en historieksleutels.
- `ref` verwijst naar een sleutel in `exercises.json`.
- `variant` verwijst naar een sleutel in het `variants` object van die oefening.
- Er is geen `override` veld in v1.

### 3.3 `data/exercises.json`

```json
{
  "hamstring-curl": {
    "name": "Hamstring Curl",
    "image": "assets/images/hamstring-curl.gif",
    "side_mode": "each_side",
    "variants": {
      "activatie": {
        "sets": 3,
        "reps": 12,
        "params": { "weight_kg": 15 }
      },
      "uitdaging": {
        "sets": 3,
        "reps": 12,
        "params": { "weight_kg": 20 }
      }
    }
  },
  "plank": {
    "name": "Plank",
    "image": "assets/images/plank.gif",
    "side_mode": "none",
    "variants": {
      "activatie": {
        "sets": 2,
        "reps": 1,
        "seconds_per_rep": 30,
        "params": {}
      },
      "uitdaging": {
        "sets": 3,
        "reps": 1,
        "seconds_per_rep": 60,
        "params": {}
      }
    }
  },
  "loopband": {
    "name": "Loopband",
    "image": "assets/images/loopband.gif",
    "side_mode": "none",
    "variants": {
      "activatie": {
        "sets": 1,
        "reps": 1,
        "seconds_per_rep": 300,
        "params": { "speed_kmh": 9 }
      },
      "uitdaging": {
        "sets": 1,
        "reps": 1,
        "seconds_per_rep": 1200,
        "params": { "speed_kmh": 10 }
      }
    }
  },
  "nordic-hamstring-curl": {
    "name": "Nordic Hamstring Curl",
    "image": "assets/images/nordic-hamstring-curl.gif",
    "side_mode": "none",
    "variants": {
      "activatie": {
        "sets": 2,
        "reps": 5,
        "seconds_per_rep": 3,
        "params": {}
      },
      "uitdaging": {
        "sets": 4,
        "reps": 8,
        "note": "Zo lang mogelijk volhouden",
        "params": {}
      }
    }
  }
}
```

**Veldspecificatie per oefening:**

| Veld | Type | Verplicht | Beschrijving |
|---|---|---|---|
| `name` | string | ja | Weergavenaam |
| `image` | string | ja | Relatief pad vanaf HTML-pagina |
| `side_mode` | `"none"` \| `"each_side"` | ja | Zie §3.4 |

**Veldspecificatie per variant:**

| Veld | Type | Verplicht | Beschrijving |
|---|---|---|---|
| `sets` | integer ≥ 1 | ja | Aantal sets |
| `reps` | integer ≥ 1 | ja | Herhalingen per set |
| `seconds_per_rep` | integer ≥ 1 | nee | Triggert de afteltimer |
| `params` | object | ja (mag leeg `{}`) | Intensiteitsparameters |
| `note` | string | nee | Vrije tekst voor wat niet in getallen past |

**`params` rendering:**

| Key | UI-weergave |
|---|---|
| `weight_kg` | `20 kg` |
| `speed_kmh` | `9 km/u` |
| onbekende key | `key: value` (fallback, geen crash) |

Nieuwe keys zoals `incline`, `resistance`, `band_color` werken direct als fallback zonder codewijziging.

### 3.4 `side_mode`

- `"none"` — normale weergave, reps zijn totaal
- `"each_side"` — UI toont altijd **"X per been"** (of "per arm"), nooit "X reps". 1 tik op "set klaar" = beide benen/armen gedaan = hele set voltooid. De gebruiker tikt dus **één keer** per set, niet per been.

### 3.5 Variantnamen

Variantnamen zijn vrij te kiezen strings. Aanbevolen waarden: `activatie`, `uitdaging`, `herstel`, `max-effort`. De app gebruikt ze alleen als identifier en weergavelabel — er is geen speciale logica gekoppeld aan specifieke namen.

---

## 4. Pagina's en routing

### 4.1 `index.html`

- Laadt `data/workouts/index.json`
- Toont een kaart per workout met naam en een knop "Open workout"
- Link naar `workout.html?w=<id>`

### 4.2 `workout.html?w=<id>`

Twee modi op één pagina, gestuurd door interne JS-state (geen extra navigatie):

**Lijstmodus (standaard bij openen):**
- Toont workoutnaam
- Toont alle blokken met daarin alle oefeningen: naam, variant, sets/reps/tijd, params
- Onderaan: grote **Play** knop
- Knopje "Schema-geschiedenis" → opent history overlay (zie §7)
- Als `current_session` bestaat voor deze workout → toon banner: "Je hebt een lopende sessie. Hervatten?"
- Als `current_session` bestaat voor een *andere* workout → toon modal: "Je hebt een lopende [andere workout naam]. Hervatten of weggooien?"

**Actiefmodus (na Play of Hervatten):**
- Volledig scherm, één oefening tegelijk (zie §5)
- Geen terugknop zichtbaar tijdens workout (voorkomt onbedoeld verlaten)

---

## 5. Actiefmodus UI

De actiefmodus neemt de volledige viewport in. Structuur van boven naar onder:

```
┌─────────────────────────────────┐
│  [Blok naam]          [x] stop  │  ← klein, bovenaan
│                                 │
│  [Afbeelding oefening]          │  ← groot, centraal
│                                 │
│  [Naam oefening]                │
│  [side_mode label indien each_  │
│   side: "per been"]             │
│  [params: bijv. "20 kg"]        │
│  [note indien aanwezig]         │
│                                 │
│  Set 2 / 3                      │  ← huidige voortgang
│                                 │
│  [Timer of Rep-indicator]       │  ← zie §6
│                                 │
│  [✓ Set klaar]                  │  ← grote knop
│                                 │
│  ─────────────────────────      │
│  Straks: [volgende oefening]    │  ← klein, onderaan
└─────────────────────────────────┘
```

**"Straks" sectie:**
- Toont de naam van de eerstvolgende oefening in de workout
- Als de huidige oefening de laatste is: toont "Dit was de laatste oefening"
- Als er een blokwissel aankomt: toont ook de naam van het volgende blok

**Stop knop (×):**
- Vraagt bevestiging: "Workout stoppen? Voortgang gaat verloren."
- Bij bevestiging: `current_session` wordt gewist, terug naar lijstmodus
- Geen history entry — workout was niet voltooid

---

## 6. Timer gedrag

### 6.1 Oefening zonder `seconds_per_rep`

- Toon alleen: "Set X / Y" en de knop "✓ Set klaar"
- Geen timer zichtbaar
- Gebruiker klikt "✓ Set klaar" om set te voltooien

### 6.2 Oefening met `seconds_per_rep`

Tijdweergave boven de Play-knop:
- `reps: 1, seconds_per_rep: 300` → toont `5 min`
- `reps: 2, seconds_per_rep: 30` → toont `2× 30 sec`
- `reps: 12, seconds_per_rep: 3` → toont `12× 3 sec`

**Timerflow:**

1. Gebruiker ziet Play-knop (▶)
2. Gebruiker drukt Play → countdown start: `3… 2… 1…` met piepgeluid per seconde
3. Na countdown: oefentimer loopt af (`seconds_per_rep` × `reps` seconden totaal, of per rep — zie noot)
4. Timer bereikt 0 → geluid + set automatisch voltooid (geen extra bevestiging nodig)
5. Gebruiker klikt door naar volgende set of oefening

**Noot meerdere reps met tijd:**
Bij `reps > 1` met `seconds_per_rep` is de totale timerduur `reps × seconds_per_rep`. De app toont één doorlopende timer voor de hele set. (v1-beperking: geen per-rep aftelling.)

**Geluid is best-effort:**
`audio.play()` wordt aangeroepen maar de rejected Promise wordt opgevangen en genegeerd. De app werkt altijd correct zonder geluid. Toon nooit een foutmelding over geluid.

### 6.3 Timerherstel na refresh

`timer_ends_at` is een absolute ISO-timestamp in `current_session`. Bij laden:
- Bereken `remaining = timer_ends_at - Date.now()`
- Als `remaining > 0` → hervat timer met resterende tijd
- Als `remaining <= 0` → markeer set direct als voltooid, ga door naar volgende state

**Bewuste beperking v1:** het model kent één actieve timer. Na een refresh waarbij meerdere timers zijn verlopen, worden ze niet allemaal ingehaald — alleen de ene opgeslagen timer.

---

## 7. Schema-geschiedenis (history overlay)

Bereikbaar via knopje in de lijstmodus. Dit is **niet** de hoofdfocus van de app.

- Toont per oefening+variant een tijdlijn van prescripties
- Huidige waarden groot weergegeven
- Oudere waarden doorgestreept of begrijsd eronder
- Noem dit **niet** "progress" — het is een schema-geschiedenis (wat was de prescriptie op die datum), geen resultatenlog

---

## 8. Sessiemodel

**localStorage key:** `workout-app:v1:current_session`

```json
{
  "workout_id": "leg-day",
  "started_at": "2026-04-01T09:00:00Z",
  "current_exercise_id": "ex-3",
  "current_set": 2,
  "timer_phase": "exercise",
  "timer_ends_at": "2026-04-01T09:14:23Z",
  "completed": ["ex-1:1", "ex-2:1", "ex-2:2", "ex-3:1"]
}
```

**Veldspecificatie:**

| Veld | Type | Beschrijving |
|---|---|---|
| `workout_id` | string | Query param waarde, bijv. `"leg-day"` |
| `started_at` | ISO string | Tijdstip van starten |
| `current_exercise_id` | string | `id` van de huidige workout-exercise entry |
| `current_set` | integer, 1-based | De set waarmee de gebruiker **bezig is** (niet hoeveel er klaar zijn) |
| `timer_phase` | `"idle"` \| `"countdown"` \| `"exercise"` | Huidige timerfase |
| `timer_ends_at` | ISO string \| null | Absolute eindtijd van de lopende timer. `null` als `timer_phase === "idle"` |
| `completed` | array van strings | Opgeslagen als JSON-array. Format: `"exercise_id:set"`, bijv. `"ex-3:1"` |

**In JavaScript:** laad `completed` als array, zet direct om naar `Set` voor O(1) lookups.

**Semantiek `completed`:**
- Tuples zijn uniek: `"ex-3:2"` kan maar één keer voorkomen
- Set-nummers zijn 1-based
- `current_set: 2` betekent "bezig met set 2" — niet "2 sets voltooid"

**Sessie lifecycle:**
- Aanmaken: bij drukken op Play (nieuwe workout) of bij Hervatten
- Updaten: na elke voltooide set
- Verwijderen bij: workout voltooid (→ schrijf naar history), Stop knop bevestigd, of "Weggooien" bij conflict
- History wordt **alleen** geschreven bij volledige workout completion

---

## 9. Progressiemodel

**localStorage key:** `workout-app:v1:history`

```json
{
  "hamstring-curl:uitdaging": [
    {
      "date": "2026-04-01",
      "plan": {
        "sets": 3,
        "reps": 12,
        "seconds_per_rep": null,
        "params": { "weight_kg": 20 }
      }
    }
  ]
}
```

**Regels:**
- Key formaat: `"exercise_ref:variant"`, bijv. `"hamstring-curl:uitdaging"`
- History schrijft plan-data op het moment van workout completion, niet het resultaat
- Twee keer dezelfde `exercise_ref:variant` in één workout → één gedeelde history-kaart (blokcontext gaat verloren — bewuste v1-beperking)
- Resultaat-tracking (werkelijk uitgevoerde reps/gewicht) is v2

---

## 10. Conflictafhandeling lopende sessie

| Situatie | Gedrag |
|---|---|
| `workout.html?w=X` openen, `current_session.workout_id === X` | Toon banner: "Je hebt een lopende sessie. Hervatten?" met knoppen Hervatten / Opnieuw beginnen |
| `workout.html?w=X` openen, `current_session.workout_id === Y` (Y ≠ X) | Toon modal: "Je hebt een lopende [Y naam]. Hervatten of weggooien?" |
| Hervatten | Laad `current_session`, ga direct naar actiefmodus op juiste oefening/set |
| Weggooien / Opnieuw beginnen | Wis `current_session`, start fresh. Geen history entry |

---

## 11. Foutpaden

Alle fouten zijn zichtbaar in de UI — geen stille console warnings.

| Situatie | Gedrag |
|---|---|
| Onbekende `?w` query param | Toon foutpagina: "Workout niet gevonden." + link terug naar index |
| `ref` in workout.json niet gevonden in exercises.json | Toon zichtbaar foutblok in de workout: "Oefening '[ref]' niet gevonden in exercises.json" |
| `variant` niet gevonden op oefening | Toon zichtbaar foutblok: "Variant '[variant]' niet gevonden voor oefening '[ref]'" |
| Ontbrekende afbeelding | Toon placeholder (bijv. grijs vlak met naam), geen crash |
| `data/workouts/index.json` niet laadbaar | Toon foutmelding op index.html |

---

## 12. Tijdweergave

| `reps` | `seconds_per_rep` | Weergave |
|---|---|---|
| 1 | 300 | `5 min` |
| 1 | 90 | `1 min 30 sec` |
| 2 | 30 | `2× 30 sec` |
| 12 | — | `12 reps` |
| 12 | 3 | `12× 3 sec` |
| 1 | 60 | `1 min` |

Seconden onder 60: toon als `X sec`. Seconden ≥ 60: toon als `X min` of `X min Y sec`.

---

## 13. Technische randvoorwaarden

- Puur statisch: HTML, CSS, vanilla JavaScript. Geen framework, geen build-stap, geen backend.
- Werkt op GitHub Pages onder `https://<owner>.github.io/<repo>/`
- Alle paden zijn relatief — nooit een leading `/`
- localStorage is per origin (niet per pad). Alle keys zijn geprefixed met `workout-app:v1:` om conflicten met andere projecten onder dezelfde origin te voorkomen
- `.nojekyll` staat in de root (leeg bestand)
- Development: draai via `npx serve .` of equivalent — nooit via `file://` (fetch faalt dan in de meeste browsers)
- Mobile-first: de app is primair bedoeld voor gebruik op een telefoon tijdens een workout

---

## 14. Wat er bewust niet in v1 zit

- Override per workout-entry (JSON aanpassen is voldoende)
- Rusttimer tussen sets (gebruiker bepaalt zelf het tempo)
- Resultaat-tracking (werkelijk uitgevoerde reps/gewicht)
- Beheerpagina (JSON editen als developer)
- Per-rep aftelling bij meerdere timed reps (één doorlopende timer per set)
- Blokcontext in history

---

## 15. Voorbeelddata

De volgende oefeningen en workouts zijn aanwezig als voorbeelddata bij oplevering:

**exercises.json:** `hamstring-curl`, `plank`, `loopband`, `nordic-hamstring-curl`

**workouts/index.json:** `["leg-day", "benen-warm-maken"]`

**leg-day.json:**
- Blok "Warming-up": loopband activatie, hamstring-curl activatie
- Blok "Hoofdwerk": nordic-hamstring-curl uitdaging, hamstring-curl uitdaging

**benen-warm-maken.json:**
- Blok "Activatie": hamstring-curl activatie, nordic-hamstring-curl activatie
