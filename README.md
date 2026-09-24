# ControlBench

**Ein lokales Werkzeug, um Reinforcement Learning und klassische Regelungstechnik fair miteinander zu vergleichen.**

ControlBench speichert Experimente, Runs und Lernkurven zentral in einer Datenbank. Trainings- und Regelungsskripte schicken ihre Ergebnisse über eine REST-API automatisch dorthin, und eine Weboberfläche zeigt sie an. Die Beispiele in diesem Repository beziehen sich auf das Pendel und das Doppelpendel.

> **Status:** frühe Entwicklung. Backend, API, Datenbank mit Migrationen, Upload-Vorlage und eine einfache HTML-Oberfläche funktionieren. Eine React-Oberfläche mit Diagrammen ist in Arbeit, siehe [Roadmap](#roadmap).

---

## Inhalt

- [Wofür ist ControlBench gedacht?](#wofür-ist-controlbench-gedacht)
- [Begriffe](#begriffe)
- [Architektur](#architektur)
- [Projektstruktur](#projektstruktur)
- [Installation](#installation)
- [Starten](#starten)
- [Ergebnisse automatisch hochladen](#ergebnisse-automatisch-hochladen)
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

- Jeder Ansatz wird ein **Experiment**.
- Jede Wiederholung mit einem anderen Seed wird ein **Run**.
- Jede Lernkurve wird als **Metrik** gespeichert.

Die Daten sind dann über eine einzige API abrufbar, egal ob sie aus einem PyTorch-Training, einer MATLAB-Simulation oder einem handgeschriebenen Regler stammen.

ControlBench ist für den **lokalen Einsatz** auf dem eigenen Rechner gedacht. Es gibt deshalb bewusst keine Benutzerkonten und keine Authentifizierung.

## Begriffe

| Begriff | Bedeutung | Beispiel |
|---|---|---|
| **Experiment** | eine Kombination aus Environment und Controller, die untersucht wird | „SAC auf Pendulum-v1“ |
| **Run** | ein einzelner Durchlauf eines Experiments mit einem bestimmten Seed, mit seinen Endergebnissen | Seed 42: Reward −150,3, stabil nach 2,4 s |
| **Metrik** | ein Messpunkt einer Kurve innerhalb eines Runs: Name, Step, Wert | `success_rate` bei Step 5000 = 0,82 |
| **Seed** | Startwert des Zufallsgenerators. Gleicher Seed ergibt reproduzierbare Ergebnisse | `0`, `1`, `2`, … |

Ein Experiment hat viele Runs, ein Run hat viele Metrik-Messpunkte.

## Architektur

```
┌────────────────────────┐        ┌────────────────────────┐
│  Trainings-/Regelungs- │        │  Weboberfläche         │
│  skript (Python)       │        │  (Browser, Port 5500)  │
│  z. B. SAC, LQR, PID   │        │  HTML + JavaScript     │
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
| Frontend | HTML + JavaScript | einfache Oberfläche (React folgt) |

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
├── frontend/
│   ├── index.html              # Struktur der Oberfläche
│   └── app.js                  # Verhalten: spricht per fetch mit der API
├── experiments/
│   ├── example_upload.py       # Vorlage: Ergebnisse automatisch hochladen
│   ├── requirements.txt
│   └── results/                # lokale Sicherungen der Runs (nicht im Git)
└── docs/
```

**Zwei Arten von Modellen:** `database/tables.py` beschreibt, wie Daten in der **Datenbank** liegen (SQLAlchemy). `models/` beschreibt, wie Daten an der **API** aussehen (Pydantic). Die beiden sind bewusst getrennt. So kann sich die Tabelle ändern, ohne dass sich das JSON für die Nutzer der API ändert, und umgekehrt.

## Installation

**Voraussetzungen:** Python **3.10 oder neuer** und Git.

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

## Starten

ControlBench besteht aus zwei Teilen, die jeweils in einem eigenen Terminal laufen. In beiden Terminals muss die virtuelle Umgebung aktiv sein.

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
python -m http.server 5500
```

Dann **http://127.0.0.1:5500** im Browser öffnen. Dort kannst du Experimente anlegen und öffnen sowie Runs anlegen, ansehen und löschen.

> Das Frontend muss über Port **5500** laufen, weil das Backend per CORS nur diese Adresse zulässt (siehe `backend/main.py`). Die HTML-Datei direkt per Doppelklick zu öffnen funktioniert nicht.

## Ergebnisse automatisch hochladen

Der eigentliche Nutzen von ControlBench: Dein Trainings- oder Regelungsskript schickt seine Ergebnisse selbst an die API, ohne dass du etwas abtippen musst.

[`experiments/example_upload.py`](experiments/example_upload.py) ist eine **Vorlage** dafür. Sie funktioniert sofort mit Fake-Daten:

```bash
# im Projektordner, Backend muss laufen
python experiments/example_upload.py
```

```
Experiment #1 angelegt
Run mit seed=0 läuft ...
  -> Run #1 gespeichert: reward=-172.24, 82 Messpunkte, Rechenzeit 0.428 s
Run mit seed=1 läuft ...
  ...
```

### Die Vorlage für dein Projekt übernehmen

1. **Kopiere** `example_upload.py` in dein Projekt.
2. **Passe die Einstellungen** oben in der Datei an.
3. **Ersetze `fake_run(seed)`** durch deinen echten Run. Die Funktion muss nur zwei Dinge zurückgeben:

```python
def my_run(seed: int) -> tuple[dict, list[dict]]:
    # ... dein SAC-Training oder deine LQR-Regelung ...

    results = {                      # Endergebnisse: eine Zahl pro Feld -> Tabelle "runs"
        "reward": -150.3,
        "stability_time": 2.4,       # oder None, wenn nie stabil
        "recovery_time": None,
        "num_steps": 20_000,
        "duration": 312.5,           # Rechenzeit in Sekunden
    }
    metrics = [                      # Kurven: beliebig viele Punkte -> Tabelle "metrics"
        {"name": "success_rate", "step": 0, "value": 0.0},
        {"name": "success_rate", "step": 500, "value": 0.12},
        # ...
    ]
    return results, metrics
```

Alles andere übernimmt die Vorlage: Experiment finden oder anlegen, lokal sichern, Run und Metriken hochladen.

### Einstellungen

| Variable | Standard | Wirkung |
|---|---|---|
| `API_URL` | `http://127.0.0.1:8000` | Adresse des Backends |
| `EXPERIMENT` | Name, Environment, Controller, Beschreibung | das Experiment, zu dem die Runs gehören |
| `REUSE_EXPERIMENT` | `True` | Gibt es schon ein Experiment mit **gleichem Namen, Environment und Controller**, werden die Runs dort angehängt. Bei `False` gibt es bei jedem Start ein neues Experiment. |
| `SAVE_LOCAL_BACKUP` | `True` | Jeder Run wird **vor** dem Hochladen als JSON in `experiments/results/` gesichert. |
| `SEEDS` | `[0, 1, 2, 3, 4]` | ein Run pro Seed |
| `TOTAL_STEPS`, `LOG_EVERY` | `20_000`, `500` | Länge eines Runs und Abstand der Messpunkte |

### Verhalten bei Fehlern

- **Backend beim Start nicht erreichbar:** Das Skript bricht sofort ab, *bevor* Rechenzeit verbraucht wird. Ohne Experiment ließen sich die Ergebnisse nicht zuordnen.
- **Upload schlägt mitten im Lauf fehl:** Das Skript meldet den Fehler und nennt die Sicherungsdatei. Die übrigen Runs laufen weiter, und nichts geht verloren.

### Ohne die Vorlage

Die API ist nicht an Python gebunden. Drei Anfragen genügen:

```python
import requests

API = "http://127.0.0.1:8000"

exp = requests.post(f"{API}/experiments", json={
    "name": "Pendulum LQR", "environment": "Pendulum-v1", "controller": "LQR",
}).json()

run = requests.post(f"{API}/runs", json={
    "experiment_id": exp["id"], "seed": 0, "reward": -120.4, "num_steps": 200,
}).json()

requests.post(f"{API}/runs/{run['id']}/metrics", json=[
    {"name": "angle", "step": 0, "value": 3.14},
    {"name": "angle", "step": 1, "value": 3.02},
])
```

## API-Referenz

Die vollständige, stets aktuelle Referenz mit allen Feldern steht unter **http://127.0.0.1:8000/docs**. Hier eine Übersicht:

| Methode | Pfad | Beschreibung | Erfolg |
|---|---|---|---|
| `POST` | `/experiments` | Experiment anlegen | `201` |
| `GET` | `/experiments` | alle Experimente | `200` |
| `GET` | `/experiments/{id}` | ein Experiment | `200` |
| `POST` | `/runs` | Run anlegen | `201` |
| `GET` | `/runs` | alle Runs; optional `?experiment_id=1` | `200` |
| `GET` | `/runs/{id}` | ein Run | `200` |
| `DELETE` | `/runs/{id}` | Run löschen, **inklusive seiner Metriken** | `204` |
| `POST` | `/runs/{id}/metrics` | **Liste** von Messpunkten auf einmal speichern | `201` |
| `GET` | `/runs/{id}/metrics` | Messpunkte eines Runs, sortiert nach Name und Step; optional `?name=success_rate` | `200` |

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
  "name": "Pendulum SAC",
  "environment": "Pendulum-v1",
  "controller": "SAC",
  "description": "Standard-Hyperparameter"
}
```

```json
201 Created
{ "id": 1, "name": "Pendulum SAC", "environment": "Pendulum-v1", "controller": "SAC", "description": "Standard-Hyperparameter" }
```

| Feld | Typ | Pflicht |
|---|---|---|
| `name` | string | ja |
| `environment` | string | ja |
| `controller` | string | ja |
| `description` | string | nein |

**Run anlegen**

```http
POST /runs
Content-Type: application/json

{ "experiment_id": 1, "seed": 42, "reward": -150.3, "stability_time": 2.4, "num_steps": 20000, "duration": 312.5 }
```

| Feld | Typ | Pflicht | Bedeutung |
|---|---|---|---|
| `experiment_id` | int | ja | zu welchem Experiment der Run gehört |
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
  { "name": "success_rate", "step": 0,    "value": 0.0 },
  { "name": "success_rate", "step": 1000, "value": 0.41 },
  { "name": "episode_reward", "step": 0,  "value": -1200.5 }
]
```

```json
201 Created
{ "run_id": 1, "count": 3 }
```

Schicke Messpunkte **gesammelt** als Liste, nicht einzeln. 1000 Punkte in einer Anfrage sind um ein Vielfaches schneller als 1000 einzelne Anfragen. Enthält die Liste einen ungültigen Punkt, wird **nichts** gespeichert (`422`).

## Datenmodell

```
experiments                 runs                          metrics
───────────                 ────                          ───────
id            PK ◄──┐       id              PK ◄──┐       id       PK
name                └────── experiment_id   FK    └────── run_id   FK (ON DELETE CASCADE)
environment                 seed                          name
controller                  reward                        step
description   (optional)    stability_time  (optional)    value
                            recovery_time   (optional)
                            num_steps       (optional)    Index: (run_id, name)
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
- **Gleiche Metrik, gleicher Name.** Verwende über alle Experimente dieselben Metriknamen, z. B. immer `success_rate` und nicht mal `success` und mal `successRate`, sonst lassen sich Kurven nicht vergleichen.

## Tests

```bash
cd backend
pytest
```

Die Tests laufen gegen eine **eigene, temporäre Datenbank**. Deine echte `controlbench.db` wird nie angefasst.

| Datei | Prüft |
|---|---|
| `tests/test_experiments.py` | Experimente anlegen, auflisten, abrufen, Pflichtfelder, 404 |
| `tests/test_runs.py` | Runs anlegen, filtern, abrufen, löschen, 404/422 |
| `tests/test_metrics.py` | Messpunkte speichern und filtern, Sortierung, „alles oder nichts“ bei ungültigen Daten, Mitlöschen mit dem Run |
| `tests/test_cors.py` | Das Frontend darf die API aufrufen, fremde Seiten nicht |
| `tests/test_migrations.py` | Die Alembic-Migrationen passen exakt zu `database/tables.py` |

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
| Frontend zeigt nichts, in der Browser-Konsole steht `blocked by CORS policy` | Das Frontend läuft nicht über `http://127.0.0.1:5500` oder `http://localhost:5500`, z. B. weil die Datei direkt geöffnet wurde. |
| `sqlite3.OperationalError: no such column ...` | Der Code kennt eine Spalte, die in der Datenbank fehlt: `alembic upgrade head` ausführen. |
| `Can't locate revision identified by '...'` | Die Datenbank steht auf einer Migration, deren Datei fehlt. Meist wurde eine Migrationsdatei gelöscht. Aus Git wiederherstellen: `git restore backend/migrations/versions/<datei>` |
| Upload-Skript meldet „keine Verbindung“ | Das Backend läuft nicht oder unter einer anderen Adresse als `API_URL`. |
| `ModuleNotFoundError` beim Starten | Die virtuelle Umgebung ist nicht aktiv, oder der Befehl wurde nicht im Ordner `backend/` ausgeführt. |

## Roadmap

**Geplant**
- React-Oberfläche mit Diagrammen der Lernkurven, um Controller auf einen Blick zu vergleichen
- Experimente bearbeiten und löschen
- `PATCH /runs/{id}`, damit Metriken schon **während** eines langen Trainings hochgeladen werden können
- Echte Controller-Beispiele (SAC, LQR) für Pendel und Doppelpendel

**Bewusst nicht im Umfang** (ControlBench ist ein lokales Werkzeug)
- Benutzerkonten und Authentifizierung
- Hosting und Deployment
- Docker-Setup
