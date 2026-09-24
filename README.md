# ControlBench

**Ein lokales Werkzeug, um Reinforcement Learning und klassische Regelungstechnik fair miteinander zu vergleichen.**

ControlBench speichert Experimente, Runs und Lernkurven zentral in einer Datenbank. Trainings- und Regelungsskripte schicken ihre Ergebnisse über eine REST-API automatisch dorthin, und eine Weboberfläche zeigt sie an. Die Beispiele in diesem Repository beziehen sich auf das Pendel und das Doppelpendel.

> **Status:** frühe Entwicklung. Backend, API, Datenbank mit Migrationen und Upload-Vorlage funktionieren. Die React-Oberfläche vergleicht die Konfigurationen eines Experiments (z. B. SAC, PPO, LQR) mit Mittelwert und Streuung über die Seeds und zeigt ihre Lernkurven über Steps oder Rechenzeit, siehe [Roadmap](#roadmap).

---

## Inhalt

- [Wofür ist ControlBench gedacht?](#wofür-ist-controlbench-gedacht)
- [Begriffe](#begriffe)
- [Architektur](#architektur)
- [Projektstruktur](#projektstruktur)
- [Installation](#installation)
- [Starten](#starten)
- [Ergebnisse automatisch hochladen](#ergebnisse-automatisch-hochladen)
  - [Dein eigenes Training anbinden](#dein-eigenes-training-anbinden)
  - [Große Trainings (Millionen von Steps)](#große-trainings-millionen-von-steps)
- [API-Referenz](#api-referenz)
- [Datenmodell](#datenmodell)
- [Konventionen für vergleichbare Daten](#konventionen-für-vergleichbare-daten)
- [Tests](#tests)
- [Das Datenbankschema ändern](#das-datenbankschema-ändern)
- [Häufige Probleme](#häufige-probleme)
- [Roadmap](#roadmap)

---

## Wofür ist ControlBench gedacht?

Wer ein Regelungsproblem wie das Aufschwingen und Stabilisieren eines Pendels einmal mit einem RL-Agenten (z. B. SAC) und einmal mit einem klassischen Regler (z. B. LQR oder PID) löst, will am Ende Fragen beantworten wie:

- Welcher Ansatz erreicht den höheren Reward, und wie stark streuen die Ergebnisse über verschiedene Seeds?
- **Nach wie vielen Trainingsschritten** wird der RL-Agent zuverlässig stabil?
- Wie schnell stabilisiert das System, wie schnell erholt es sich von Störungen?
- Wie viel Rechenzeit kostet welcher Ansatz?

Ohne ein gemeinsames Werkzeug landen solche Ergebnisse in verstreuten CSV-Dateien, Notebooks und Logordnern. ControlBench gibt ihnen eine **einheitliche Struktur**:

- Eine Fragestellung auf einem Environment wird ein **Experiment**, z. B. „Pendel aufschwingen“.
- Jeder Ansatz darin wird eine **Konfiguration**, z. B. „SAC default“, „PPO default“, „LQR“.
- Jede Wiederholung einer Konfiguration mit einem anderen Seed wird ein **Run**.
- Jede Lernkurve wird als **Metrik** gespeichert.

Verglichen werden die **Konfigurationen**, nicht einzelne Runs. Ein RL-Agent kann mit einem Seed hervorragend und mit dem nächsten schlecht abschneiden. Ob SAC generell besser ist als PPO, zeigt erst der Mittelwert über mehrere Seeds samt Streuung. ControlBench zeigt deshalb pro Konfiguration Mittelwert, Standardabweichung und Spannweite, und im Diagramm eine gemittelte Lernkurve mit Band.

Die Daten sind dann über eine einzige API abrufbar, egal ob sie aus einem PyTorch-Training, einer MATLAB-Simulation oder einem handgeschriebenen Regler stammen.

ControlBench ist für den **lokalen Einsatz** auf dem eigenen Rechner gedacht. Es gibt deshalb bewusst keine Benutzerkonten und keine Authentifizierung.

## Begriffe

| Begriff | Bedeutung | Beispiel |
|---|---|---|
| **Experiment** | eine Fragestellung auf einem Environment, in der mehrere Controller verglichen werden | „Pendulum Controller-Vergleich“ auf `Pendulum-v1` |
| **Controller** | der Algorithmus bzw. Regler | `SAC`, `PPO`, `LQR` |
| **Konfiguration** | ein Controller mit bestimmten Einstellungen, erkennbar am `name` des Runs. Runs mit gleichem Namen unterscheiden sich nur im Seed | „SAC default“, „SAC lr 1e-3“ |
| **Run** | ein einzelner Durchlauf einer Konfiguration mit einem bestimmten Seed, mit seinen Endergebnissen | „SAC default“, Seed 2: Reward −150,3 |
| **Metrik** | ein Messpunkt einer Kurve innerhalb eines Runs: Name, Step, Wert | `success_rate` bei Step 5000 = 0,82 |
| **Seed** | Startwert des Zufallsgenerators. Gleicher Seed ergibt reproduzierbare Ergebnisse | `0`, `1`, `2`, … |

Ein Experiment hat viele Runs, ein Run hat viele Metrik-Messpunkte. Konfigurationen sind keine eigene Tabelle: Sie ergeben sich aus `controller` und `name` der Runs.

## Architektur

```
┌────────────────────────┐        ┌────────────────────────┐
│  Trainings-/Regelungs- │        │  Weboberfläche         │
│  skript (Python)       │        │  (Browser, Port 5173)  │
│  z. B. SAC, LQR, PID   │        │  React + TypeScript    │
└───────────┬────────────┘        └───────────┬────────────┘
            │  HTTP + JSON                    │  HTTP + JSON (fetch)
            │  requests.post(...)             │
            ▼                                 ▼
┌───────────────────────────────────────────────────────────┐
│  Backend: FastAPI (Port 8000)                             │
│   routes/     REST-Endpunkte                              │
│   models/     Pydantic: prüft eingehendes/ausgehendes JSON│
│   database/   SQLAlchemy: Tabellen und DB-Zugriff         │
└───────────────────────────┬───────────────────────────────┘
                            │  SQL
                            ▼
                ┌───────────────────────┐
                │  SQLite               │  Schema wird mit
                │  backend/controlbench │  Alembic-Migrationen
                │  .db                  │  verwaltet
                └───────────────────────┘
```

Die zentrale Designidee ist, dass **alles über die REST-API läuft**. Das Backend unterscheidet nicht, ob eine Anfrage aus einem Trainingsskript, aus dem Browser oder von `curl` kommt. Wer Ergebnisse aus einer anderen Sprache oder einem anderen Tool einspielen will, muss nur HTTP-Anfragen mit JSON schicken.

**Technologien**

| Bereich | Werkzeug | Aufgabe |
|---|---|---|
| Web-Framework | [FastAPI](https://fastapi.tiangolo.com/) | REST-API, automatische Doku unter `/docs` |
| Validierung | [Pydantic](https://docs.pydantic.dev/) | prüft Typen und Pflichtfelder jeder Anfrage |
| Datenbankzugriff | [SQLAlchemy 2](https://docs.sqlalchemy.org/) (ORM) | Tabellen als Python-Klassen, datenbankunabhängig |
| Migrationen | [Alembic](https://alembic.sqlalchemy.org/) | versionierte Änderungen am Datenbankschema |
| Datenbank | SQLite | eine einzige Datei, kein Datenbankserver nötig |
| Server | [Uvicorn](https://www.uvicorn.org/) | führt die FastAPI-App aus |
| Tests | [pytest](https://docs.pytest.org/) | automatische Tests des Backends |
| Frontend | [React](https://react.dev/) + TypeScript, [Vite](https://vite.dev/) | Oberfläche, Entwicklungsserver |
| Styling | [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) | Design-Tokens und Grundkomponenten |
| Ladeanzeigen | [thinking-orbs](https://github.com/Jakubantalik/thinking-orbs) | animierte Ladezustände |

## Projektstruktur

```
ControlBench/
├── backend/
│   ├── main.py                 # Einstiegspunkt: erstellt die App, CORS, bindet Routen ein
│   ├── requirements.txt        # Abhängigkeiten zum Betrieb
│   ├── requirements-dev.txt    # zusätzlich: Werkzeuge für die Entwicklung (pytest)
│   ├── alembic.ini             # Alembic-Konfiguration
│   ├── pytest.ini              # pytest-Konfiguration
│   ├── controlbench.db         # die Datenbank (wird angelegt, nicht im Git)
│   ├── database/
│   │   ├── db.py               # Verbindung, Session, get_db()
│   │   └── tables.py           # Tabellen: experiments, runs, metrics
│   ├── models/                 # Pydantic-Modelle: Form des JSON an der API
│   │   ├── experiment.py
│   │   ├── run.py
│   │   └── metric.py
│   ├── routes/                 # die Endpunkte, eine Datei pro Ressource
│   │   ├── experiments.py
│   │   ├── runs.py
│   │   └── metrics.py
│   ├── migrations/             # Alembic: env.py und versions/ (eine Datei pro Schemaänderung)
│   └── tests/                  # pytest-Tests
├── frontend/                   # React-App (Vite + TypeScript)
│   ├── package.json            # npm-Abhängigkeiten und Befehle
│   └── src/
│       ├── main.tsx            # Einstiegspunkt
│       ├── App.tsx             # Seiten (Routen)
│       ├── index.css           # Design-Tokens: Farben, Schriften, Radien
│       ├── lib/api.ts          # alle Aufrufe ans Backend + TypeScript-Typen
│       ├── hooks/useAsync.ts   # Laden mit Zustand loading / error / success
│       ├── components/         # wiederverwendbare Bausteine (Loader, ErrorState, ...)
│       └── pages/              # eine Datei pro Seite
├── experiments/
│   ├── example_upload.py       # Vorlage: Ergebnisse automatisch hochladen
│   ├── requirements.txt
│   └── results/                # lokale Sicherungen der Runs (nicht im Git)
└── docs/
```

**Zwei Arten von Modellen:** `database/tables.py` beschreibt, wie Daten in der **Datenbank** liegen (SQLAlchemy). `models/` beschreibt, wie Daten an der **API** aussehen (Pydantic). Die beiden sind bewusst getrennt. So kann sich die Tabelle ändern, ohne dass sich das JSON für die Nutzer der API ändert, und umgekehrt.

## Installation

**Voraussetzungen:** Python **3.10 oder neuer**, [Node.js](https://nodejs.org/) **20 oder neuer** (für das Frontend) und Git.

**1. Repository klonen**

```bash
git clone https://github.com/maximilian467/ControlBench.git
cd ControlBench
```

**2. Virtuelle Umgebung anlegen und aktivieren**

Die virtuelle Umgebung hält die Pakete dieses Projekts getrennt von deinem System-Python.

```powershell
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

Wenn die Umgebung aktiv ist, steht `(.venv)` vor der Eingabezeile.

**3. Abhängigkeiten installieren**

```bash
pip install -r backend/requirements-dev.txt -r experiments/requirements.txt
```

Wer nur die App betreiben und keine Tests ausführen will, kann statt `requirements-dev.txt` auch `requirements.txt` nehmen.

**4. Datenbank anlegen**

```bash
cd backend
alembic upgrade head
```

Das legt `backend/controlbench.db` an und führt alle Migrationen aus. Denselben Befehl führst du auch nach jedem `git pull` aus, der neue Migrationen mitbringt.

**5. Frontend-Abhängigkeiten installieren**

```bash
cd frontend
npm install
```

## Starten

ControlBench besteht aus zwei Teilen, die jeweils in einem eigenen Terminal laufen. Für das Backend muss die virtuelle Umgebung aktiv sein.

**Terminal 1: Backend (API)**

```bash
cd backend
uvicorn main:app --reload
```

Die API läuft jetzt unter **http://127.0.0.1:8000**. `--reload` startet den Server bei jeder Codeänderung automatisch neu.

Unter **http://127.0.0.1:8000/docs** findest du eine interaktive Dokumentation aller Endpunkte. Dort lässt sich jede Anfrage direkt im Browser ausprobieren.

**Terminal 2: Frontend**

```bash
cd frontend
npm run dev
```

Dann **http://localhost:5173** im Browser öffnen. Änderungen am Code erscheinen sofort, ohne Neuladen.

> Das Frontend muss über Port **5173** laufen, weil das Backend per CORS nur diese Adresse zulässt (siehe `backend/main.py`). Ist der Port belegt, weicht Vite auf 5174 aus, dann blockiert der Browser die Anfragen.

Läuft das Backend unter einer anderen Adresse, lässt sie sich beim Start setzen: `VITE_API_URL=http://127.0.0.1:9000 npm run dev`.

**Weitere Befehle im Ordner `frontend/`**

```bash
npm run build    # Typprüfung + Produktions-Build nach frontend/dist
npm run lint     # Code auf typische Fehler prüfen (oxlint)
```

## Ergebnisse automatisch hochladen

Der eigentliche Nutzen von ControlBench: Dein Trainings- oder Regelungsskript schickt seine Ergebnisse selbst an die API, ohne dass du etwas abtippen musst. Die Vorlage dafür ist [`experiments/example_upload.py`](experiments/example_upload.py).

### Ausprobieren mit Fake-Daten

Die Vorlage funktioniert sofort, ohne echtes Training:

```bash
# im Projektordner, Backend muss laufen
python experiments/example_upload.py
```

```
Experiment #1 angelegt
SAC default, seed=0 läuft ...
  -> Run #1 gespeichert: reward=-144.8, 82 Messpunkte, Rechenzeit 0.632 s
  ...
LQR, seed=0 läuft ...
  -> Run #11 gespeichert: reward=-228.79, 82 Messpunkte, Rechenzeit 0.042 s
```

Danach im Frontend das Experiment „Pendulum Controller-Vergleich“ öffnen: SAC, PPO und LQR im Vergleich, mit gemittelten Lernkurven.

### Dein eigenes Training anbinden

**Schritt 1: Plane das Experiment.** Überlege vorher, was du vergleichen willst:

| Frage | Beispiel |
|---|---|
| Welches Environment? | `Pendulum-v1` |
| Welche Konfigurationen? | „SAC default“, „PPO default“, „LQR“ |
| Wie viele Seeds pro Konfiguration? | RL: mindestens 3, besser 5. Ein deterministischer Regler wie LQR: 1 |
| Welche Metriken im Verlauf? | z. B. `success_rate` und `episode_reward` |
| Wie oft ein Messpunkt? | siehe [Große Trainings](#große-trainings-millionen-von-steps) |

**Schritt 2: Kopiere die Vorlage** in dein Projekt, z. B. neben dein Trainingsskript.

**Schritt 3: Trage Experiment und Konfigurationen ein.** Oben in der Datei:

```python
EXPERIMENT = {
    "name": "Pendel aufschwingen",
    "environment": "Pendulum-v1",
    "description": "SAC gegen PPO gegen LQR, Standardparameter",
}

CONFIGURATIONS = [
    {"name": "SAC default", "controller": "SAC", "seeds": [0, 1, 2, 3, 4]},
    {"name": "PPO default", "controller": "PPO", "seeds": [0, 1, 2, 3, 4]},
    {"name": "LQR", "controller": "LQR", "seeds": [0]},
]
```

`name` ist der Name der Konfiguration. **Alle Seeds einer Konfiguration bekommen denselben Namen**, nur so kann ControlBench über sie mitteln. Änderst du Hyperparameter, legst du eine neue Konfiguration mit neuem Namen an, z. B. `{"name": "SAC lr 1e-3", "controller": "SAC", ...}`.

**Schritt 4: Ersetze `fake_run`** durch deinen echten Run. Die Funktion bekommt die Konfiguration und den Seed und gibt zwei Dinge zurück:

- `results`: die **Endergebnisse** des Runs, eine Zahl pro Feld. Sie landen in der Tabelle `runs`.
- `metrics`: die **Verläufe**, beliebig viele Messpunkte. Sie landen in der Tabelle `metrics`.

Das Grundgerüst, egal mit welcher Bibliothek du trainierst:

```python
def my_run(configuration: dict, seed: int) -> tuple[dict, list[dict]]:
    # 1. Alle Zufallsquellen seeden, damit der Run reproduzierbar ist
    random.seed(seed)
    numpy.random.seed(seed)
    torch.manual_seed(seed)
    env.reset(seed=seed)

    # 2. Controller passend zur Konfiguration bauen
    agent = build_agent(configuration["controller"])  # deine Funktion

    # 3. Trainieren und regelmäßig Messpunkte sammeln
    metrics = []
    start = time.perf_counter()
    for step in range(TOTAL_STEPS):
        agent.train_step()  # dein Trainingsschritt

        if step % LOG_EVERY == 0:
            elapsed = time.perf_counter() - start  # Sekunden seit Start: für die Achse "Rechenzeit"
            metrics.append({"name": "success_rate", "step": step, "value": evaluate_success(agent), "time": elapsed})
            metrics.append({"name": "episode_reward", "step": step, "value": last_episode_reward, "time": elapsed})

    # 4. Endergebnisse
    results = {
        "reward": final_reward,            # Pflicht: höher = besser
        "stability_time": 2.4,             # Sekunden bis stabil, oder None, wenn nie stabil
        "recovery_time": None,             # Sekunden bis zur Erholung nach einer Störung, oder None
        "num_steps": TOTAL_STEPS,
        "duration": time.perf_counter() - start,  # Rechenzeit in Sekunden
    }
    return results, metrics
```

Danach in `main()` den Aufruf `fake_run(configuration, seed)` durch `my_run(configuration, seed)` ersetzen. Alles andere übernimmt die Vorlage: Experiment finden oder anlegen, lokal sichern, Run und Metriken in Paketen hochladen.

Wichtig beim Ausfüllen:
- **`success_rate` definierst du selbst.** Beim Pendel z. B. der Anteil der Evaluations-Episoden, in denen der Winkel am Ende länger als 1 s unter 0,1 rad bleibt. Wichtig ist nur, dass alle Konfigurationen dieselbe Definition verwenden.
- **`time` ist die Zeit seit Start des Runs**, gemessen mit `time.perf_counter()`. Ohne `time` erscheint der Punkt nur in der Ansicht über die Steps.
- **`null` bzw. `None` heißt „nicht erreicht“ oder „nicht gemessen“.** Trag nie `0` oder `-1` als Platzhalter ein, das verfälscht Mittelwerte.

<details>
<summary><b>Beispiel: Stable-Baselines3 per Callback</b> (Skizze, an dein Setup anpassen)</summary>

Mit [Stable-Baselines3](https://stable-baselines3.readthedocs.io/) sammelt ein Callback die Messpunkte während `model.learn()`. `ep_info_buffer` enthält die letzten Episoden; SB3 füllt ihn, wenn das Environment in einen `Monitor` gewickelt ist, was beim Übergeben eines Environments an den Algorithmus standardmäßig passiert.

```python
import time

import numpy as np
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.callbacks import BaseCallback


class ControlBenchCallback(BaseCallback):
    """Sammelt alle log_every Steps den mittleren Episoden-Reward der letzten Episoden."""

    def __init__(self, log_every: int):
        super().__init__()
        self.log_every = log_every
        self.metrics: list[dict] = []
        self.start = time.perf_counter()
        self.last_logged = -log_every

    def _on_step(self) -> bool:
        # num_timesteps zählt über alle parallelen Environments, deshalb Abstand statt Modulo
        if self.num_timesteps - self.last_logged >= self.log_every and len(self.model.ep_info_buffer) > 0:
            rewards = [episode["r"] for episode in self.model.ep_info_buffer]
            self.metrics.append({
                "name": "episode_reward",
                "step": self.num_timesteps,
                "value": float(np.mean(rewards)),
                "time": time.perf_counter() - self.start,
            })
            self.last_logged = self.num_timesteps
        return True  # False würde das Training abbrechen


def my_run(configuration: dict, seed: int) -> tuple[dict, list[dict]]:
    algorithm = {"SAC": SAC, "PPO": PPO}[configuration["controller"]]
    model = algorithm("MlpPolicy", "Pendulum-v1", seed=seed)
    callback = ControlBenchCallback(log_every=LOG_EVERY)

    start = time.perf_counter()
    model.learn(total_timesteps=TOTAL_STEPS, callback=callback)

    results = {
        "reward": callback.metrics[-1]["value"],
        "num_steps": TOTAL_STEPS,
        "duration": time.perf_counter() - start,
    }
    return results, callback.metrics
```

</details>

**Schritt 5: Starten und prüfen.** Backend starten, dann dein Skript. Im Frontend das Experiment öffnen und prüfen:
- Stehen alle Konfigurationen in der Vergleichstabelle, jeweils mit der erwarteten Anzahl Seeds?
- Erscheinen die Kurven über die Steps **und** über die Rechenzeit?

### Einstellungen der Vorlage

| Variable | Standard | Wirkung |
|---|---|---|
| `API_URL` | `http://127.0.0.1:8000` | Adresse des Backends |
| `EXPERIMENT` | Name, Environment, Beschreibung | das Experiment, zu dem die Runs gehören |
| `CONFIGURATIONS` | SAC und PPO mit je 5 Seeds, LQR mit einem | die verglichenen Konfigurationen, jeweils mit `name`, `controller` und `seeds` |
| `REUSE_EXPERIMENT` | `True` | Gibt es schon ein Experiment mit **gleichem Namen und Environment**, werden die Runs dort angehängt. So kannst du später weitere Seeds oder Konfigurationen nachreichen. Bei `False` gibt es bei jedem Start ein neues Experiment. |
| `SAVE_LOCAL_BACKUP` | `True` | Jeder Run wird **vor** dem Hochladen als JSON in `experiments/results/` gesichert. |
| `TOTAL_STEPS` | `20_000` | Länge eines Runs |
| `LOG_EVERY` | `500` | Abstand der Messpunkte in Steps |
| `METRICS_BATCH_SIZE` | `10_000` | Messpunkte pro Anfrage beim Hochladen |

### Verhalten bei Fehlern

- **Backend beim Start nicht erreichbar:** Das Skript bricht sofort ab, *bevor* Rechenzeit verbraucht wird. Ohne Experiment ließen sich die Ergebnisse nicht zuordnen.
- **Upload schlägt mitten im Lauf fehl:** Das Skript meldet den Fehler und nennt die Sicherungsdatei. Die übrigen Runs laufen weiter, und nichts geht verloren.

### Große Trainings (Millionen von Steps)

RL-Trainings mit 20, 100 oder 200 Mio. Steps sind normal. PPO macht dabei typischerweise viel mehr Steps als SAC, braucht pro Step aber weniger Rechenzeit. Deshalb lohnt sich der Vergleich **über die Rechenzeit**: Er zeigt, welcher Ansatz bei gleichem Aufwand besser ist.

**Wie viele Messpunkte?** Nicht jeden Step loggen. Ein Diagramm ist etwa 1.000 Pixel breit, mehr Punkte sieht man nicht. Faustregel: **höchstens etwa 100.000 Messpunkte pro Run und Metrik**.

| Steps pro Run | `LOG_EVERY` | Messpunkte pro Metrik |
|---|---|---|
| 1 Mio. | 1.000 | 1.000 |
| 20 Mio. | 1.000 | 20.000 |
| 200 Mio. | 2.000 bis 10.000 | 20.000 bis 100.000 |

**Was ControlBench aushält**, gemessen auf einem normalen Laptop:

| Szenario | Ergebnis |
|---|---|
| Ein Run mit 200 Mio. Steps, alle 1.000 Steps geloggt, 2 Metriken = 400.000 Messpunkte hochladen | 13 s, in Paketen à 10.000 |
| Datenbank mit 22 solchen Runs = **4,6 Mio.** Messpunkte | 329 MB, Abfrage eines Runs per Index 0,12 s |
| Detailseite mit diesen 22 Runs öffnen, bis das Diagramm steht | ca. 1,3 s |

Möglich machen das zwei Dinge:
- Das Frontend holt pro Run nur die angezeigte Metrik, und der Server **dünnt sie auf höchstens 1.000 Punkte aus** (`max_points`). Statt 17,9 MB kommen 89 kB an. Erster und letzter Punkt bleiben immer erhalten.
- Die Vorlage lädt Messpunkte **in Paketen** hoch (`METRICS_BATCH_SIZE`), damit keine einzelne Anfrage in den Timeout läuft.

**Eine Einschränkung:** Die Vorlage lädt einen Run erst **nach** seinem Ende hoch. Bei einem Training über mehrere Tage heißt das: Stürzt es ab, ist der Run weder in ControlBench noch in der lokalen Sicherung. Speichere bei so langen Trainings zusätzlich selbst Checkpoints. Live-Upload während des Trainings steht auf der [Roadmap](#roadmap).

### Ohne die Vorlage

Die API ist nicht an Python gebunden. Drei Anfragen genügen:

```python
import requests

API = "http://127.0.0.1:8000"

exp = requests.post(f"{API}/experiments", json={
    "name": "Pendel aufschwingen", "environment": "Pendulum-v1",
}).json()

run = requests.post(f"{API}/runs", json={
    "experiment_id": exp["id"], "controller": "LQR", "name": "LQR Q=diag(10,1)",
    "seed": 0, "reward": -120.4, "num_steps": 200,
}).json()

requests.post(f"{API}/runs/{run['id']}/metrics", json=[
    {"name": "angle", "step": 0, "value": 3.14, "time": 0.0},
    {"name": "angle", "step": 1, "value": 3.02, "time": 0.001},
])
```

## API-Referenz

Die vollständige, stets aktuelle Referenz mit allen Feldern steht unter **http://127.0.0.1:8000/docs**. Hier eine Übersicht:

| Methode | Pfad | Beschreibung | Erfolg |
|---|---|---|---|
| `POST` | `/experiments` | Experiment anlegen | `201` |
| `GET` | `/experiments` | alle Experimente | `200` |
| `GET` | `/experiments/{id}` | ein Experiment | `200` |
| `DELETE` | `/experiments/{id}` | Experiment löschen, **inklusive aller Runs und Metriken** | `204` |
| `POST` | `/runs` | Run anlegen | `201` |
| `GET` | `/runs` | alle Runs; optional `?experiment_id=1` | `200` |
| `GET` | `/runs/{id}` | ein Run | `200` |
| `DELETE` | `/runs/{id}` | Run löschen, **inklusive seiner Metriken** | `204` |
| `POST` | `/runs/{id}/metrics` | **Liste** von Messpunkten auf einmal speichern | `201` |
| `GET` | `/runs/{id}/metrics` | Messpunkte eines Runs, sortiert nach Name und Step; optional `?name=success_rate` und `?max_points=1000` (siehe unten) | `200` |
| `GET` | `/runs/{id}/metrics/names` | Namen der Metriken, die dieser Run hat | `200` |

**Fehlercodes**

| Code | Bedeutung |
|---|---|
| `404` | Die ID existiert nicht, oder ein Run verweist auf ein unbekanntes Experiment. |
| `422` | Die Daten passen nicht: Pflichtfeld fehlt oder falscher Typ, z. B. `"seed": "abc"`. Die Antwort nennt das betroffene Feld. |

### Beispiele

**Experiment anlegen**

```http
POST /experiments
Content-Type: application/json

{
  "name": "Pendulum Controller-Vergleich",
  "environment": "Pendulum-v1",
  "description": "SAC, PPO und LQR mit Standardparametern"
}
```

```json
201 Created
{ "id": 1, "name": "Pendulum Controller-Vergleich", "environment": "Pendulum-v1", "description": "SAC, PPO und LQR mit Standardparametern" }
```

| Feld | Typ | Pflicht |
|---|---|---|
| `name` | string | ja |
| `environment` | string | ja |
| `description` | string | nein |

**Run anlegen**

```http
POST /runs
Content-Type: application/json

{ "experiment_id": 1, "controller": "SAC", "name": "SAC default", "seed": 42, "reward": -150.3, "stability_time": 2.4, "num_steps": 20000, "duration": 312.5 }
```

| Feld | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `experiment_id` | int | ja | zu welchem Experiment der Run gehört |
| `controller` | string | ja | Algorithmus bzw. Regler, z. B. `SAC`, `PPO`, `LQR` |
| `name` | string | ja | Name der Konfiguration. **Alle Seeds einer Konfiguration bekommen denselben Namen**, andere Einstellungen einen anderen. |
| `seed` | int | ja | Seed des Runs |
| `reward` | float | ja | Endergebnis des Runs |
| `stability_time` | float | nein | Sekunden bis zur Stabilisierung; `null` = nie stabil |
| `recovery_time` | float | nein | Sekunden bis zur Erholung nach einer Störung; `null` = keine Erholung / nicht gemessen |
| `num_steps` | int | nein | Anzahl der Schritte |
| `duration` | float | nein | **Rechenzeit** in Sekunden |

**Messpunkte speichern**

```http
POST /runs/1/metrics
Content-Type: application/json

[
  { "name": "success_rate", "step": 0,    "value": 0.0,  "time": 0.0 },
  { "name": "success_rate", "step": 1000, "value": 0.41, "time": 31.8 },
  { "name": "episode_reward", "step": 0,  "value": -1200.5 }
]
```

```json
201 Created
{ "run_id": 1, "count": 3 }
```

| Feld | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `name` | string | ja | Name der Metrik, z. B. `success_rate` |
| `step` | int | ja | Trainings- bzw. Simulationsschritt |
| `value` | float | ja | Messwert |
| `time` | float | nein | **Sekunden seit Start des Runs** (Rechenzeit). Nur Punkte mit `time` erscheinen im Diagramm über die Rechenzeit. |

**Messpunkte lesen, ausgedünnt**

```http
GET /runs/1/metrics?name=success_rate&max_points=1000
```

Mit `max_points` liefert der Server pro Metrik höchstens so viele Punkte, gleichmäßig über den Verlauf verteilt. Der erste und der letzte Punkt sind immer dabei. Ohne `max_points` kommen alle Punkte, bei langen Trainings können das hunderttausende sein.

Schicke Messpunkte **gesammelt** als Liste, nicht einzeln, bei großen Mengen in Paketen von etwa 10.000. 1.000 Punkte in einer Anfrage sind um ein Vielfaches schneller als 1.000 einzelne Anfragen. Enthält die Liste einen ungültigen Punkt, wird **nichts** gespeichert (`422`).

## Datenmodell

```
experiments                 runs                          metrics
───────────                 ────                          ───────
id            PK ◄──┐       id              PK ◄──┐       id       PK
name                └────── experiment_id   FK    └────── run_id   FK (ON DELETE CASCADE)
environment                 controller                    name
description   (optional)    name                          step
                            seed                          value
                            reward                        time     (optional)
                            stability_time  (optional)
                            recovery_time   (optional)    Index: (run_id, name)
                            num_steps       (optional)
                            duration        (optional)
```

- **Fremdschlüssel** sorgen dafür, dass es keinen Run ohne Experiment und keinen Messpunkt ohne Run gibt. Das prüft die Datenbank selbst.
- **Wird ein Run gelöscht**, löscht die Datenbank seine Messpunkte automatisch mit (`ON DELETE CASCADE`).
- **Metriken sind „lang“ gespeichert:** Jeder Messpunkt ist eine eigene Zeile mit `name`, `step` und `value`, keine Array-Spalte. Neue Metriken wie `angle`, `torque` oder `critic_loss` brauchen deshalb **keine Datenbankänderung**, es ist einfach ein neuer Name. Außerdem kann die Datenbank über Runs hinweg rechnen, z. B. „mittlere Erfolgsrate bei Step 50.000, SAC gegen LQR“.

## Konventionen für vergleichbare Daten

Damit Runs verschiedener Ansätze vergleichbar bleiben, gelten diese Regeln:

- **`duration` ist Rechenzeit** (Wall-Clock) in Sekunden, *nicht* die simulierte Zeit. Die simulierte Zeit ergibt sich aus `num_steps` × Zeitschritt des Environments.
- **`null` heißt „nicht erreicht“ oder „nicht gemessen“**, nie `0` oder `-1`. Ein Run, der nie stabilisiert, hat `stability_time: null`. Erfundene Platzhalterzahlen würden Mittelwerte verfälschen.
- **Jeder Run hat einen Seed.** Setze ihn in deinem Skript auch für alle Zufallsquellen (Python, NumPy, PyTorch, Environment), damit Runs reproduzierbar sind.
- **Mehrere Seeds pro RL-Konfiguration**, mindestens 3, besser 5 oder mehr. Erst dann sind Mittelwert und Streuung aussagekräftig.
- **Gleiche Konfiguration, gleicher Name.** Alle Seeds von „SAC default“ heißen exakt so. Änderst du Hyperparameter, bekommt die Konfiguration einen neuen Namen, z. B. „SAC lr 1e-3“.
- **Gleiche Metrik, gleicher Name.** Verwende über alle Experimente dieselben Metriknamen, z. B. immer `success_rate` und nicht mal `success` und mal `successRate`, sonst lassen sich Kurven nicht vergleichen.

## Tests

```bash
cd backend
pytest
```

Die Tests laufen gegen eine **eigene, temporäre Datenbank**. Deine echte `controlbench.db` wird nie angefasst.

| Datei | Prüft |
|---|---|
| `tests/test_experiments.py` | Experimente anlegen, auflisten, abrufen, löschen (samt Runs und Metriken), Pflichtfelder, 404 |
| `tests/test_runs.py` | Runs anlegen, filtern, abrufen, löschen, 404/422 |
| `tests/test_metrics.py` | Messpunkte speichern und filtern, Sortierung, „alles oder nichts“ bei ungültigen Daten, Mitlöschen mit dem Run, Ausdünnen mit `max_points`, Namen der Metriken |
| `tests/test_cors.py` | Das Frontend darf die API aufrufen, fremde Seiten nicht |
| `tests/test_migrations.py` | Die Alembic-Migrationen passen exakt zu `database/tables.py`, und die Datenmigration überträgt den Controller vom Experiment auf seine Runs |

Nützliche Varianten:

```bash
pytest -v                      # jeden Test einzeln anzeigen
pytest tests/test_runs.py      # nur eine Datei
pytest -k delete               # nur Tests, deren Name "delete" enthält
```

## Das Datenbankschema ändern

Tabellen werden **nie von Hand** und nicht mit `create_all` geändert, sondern über Alembic-Migrationen. Nur so kommt jede Datenbank, egal wie alt, ohne Datenverlust auf den aktuellen Stand.

Beispiel: eine neue Spalte `notes` für Runs.

1. **Die Spalte in `backend/database/tables.py` eintragen und die Datei speichern**
   ```python
   notes: Mapped[str | None]
   ```
2. **Das Feld im Pydantic-Modell `backend/models/run.py` ergänzen**, damit die API es annimmt und zurückgibt.
3. **Migration erzeugen** (im Ordner `backend/`)
   ```bash
   alembic revision --autogenerate -m "add notes to runs"
   ```
4. **Die erzeugte Datei in `migrations/versions/` lesen.** Autogenerate ist ein Vorschlag, keine Garantie. Steht in `upgrade()` nur `pass`, wurde eine Datei nicht gespeichert. Umbenennungen erkennt Alembic als „löschen + neu anlegen“, was zu Datenverlust führen würde, dann muss man die Migration von Hand anpassen.
5. **Migration ausführen**
   ```bash
   alembic upgrade head
   ```
6. **Tests laufen lassen.** `test_migrations.py` schlägt fehl, falls Tabelle und Migrationen nicht zusammenpassen.
7. **Die Migrationsdatei mit committen.**

Weitere Befehle:

```bash
alembic current     # auf welchem Stand ist die Datenbank?
alembic history     # alle Migrationen
alembic downgrade -1  # eine Migration zurück
```

> Eine Migration, die schon committet oder bei anderen ausgeführt wurde, wird **nie gelöscht oder geändert**. Fehler korrigiert man mit einer neuen Migration.

SQLite kann bestehende Tabellen nur eingeschränkt ändern. Alembic ist deshalb im *Batch-Modus* konfiguriert (`render_as_batch=True` in `migrations/env.py`). Wo nötig, baut es die Tabelle neu auf und kopiert die Daten.

## Häufige Probleme

| Problem | Ursache und Lösung |
|---|---|
| `Activate.ps1 kann nicht geladen werden, da die Ausführung von Skripts deaktiviert ist` | Windows blockiert Skripte. Einmalig ausführen: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Frontend meldet „Keine Verbindung zur API“ | Das Backend läuft nicht. Im Ordner `backend/` mit `uvicorn main:app --reload` starten. |
| In der Browser-Konsole steht `blocked by CORS policy` | Das Frontend läuft nicht auf Port 5173, z. B. weil Vite auf 5174 ausgewichen ist. Den anderen Prozess auf 5173 beenden. |
| `sqlite3.OperationalError: no such column ...` | Der Code kennt eine Spalte, die in der Datenbank fehlt: `alembic upgrade head` ausführen. |
| `Can't locate revision identified by '...'` | Die Datenbank steht auf einer Migration, deren Datei fehlt. Meist wurde eine Migrationsdatei gelöscht. Aus Git wiederherstellen: `git restore backend/migrations/versions/<datei>` |
| Upload-Skript meldet „keine Verbindung“ | Das Backend läuft nicht oder unter einer anderen Adresse als `API_URL`. |
| Eine Konfiguration erscheint doppelt in der Vergleichstabelle | Die Seeds tragen nicht exakt denselben `name` (Groß-/Kleinschreibung, Leerzeichen) oder unterschiedliche `controller`. |
| Kurven fehlen in der Ansicht „Rechenzeit“ | Die Messpunkte wurden ohne `time` hochgeladen. Über die Steps sind sie sichtbar. |
| `ModuleNotFoundError` beim Starten | Die virtuelle Umgebung ist nicht aktiv, oder der Befehl wurde nicht im Ordner `backend/` ausgeführt. |

## Roadmap

**Geplant**
- Vergleich über Experimente hinweg, z. B. SAC gegen LQR in einem Diagramm
- Experimente bearbeiten
- Live-Upload: Run beim Start anlegen und Metriken schon **während** eines langen Trainings hochladen (`PATCH /runs/{id}`)
- Echte Controller-Beispiele (SAC, LQR) für Pendel und Doppelpendel

**Bewusst nicht im Umfang** (ControlBench ist ein lokales Werkzeug)
- Benutzerkonten und Authentifizierung
- Hosting und Deployment
- Docker-Setup
