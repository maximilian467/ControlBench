"""Vorlage: Ergebnisse von Trainings- oder Regelungsläufen automatisch an ControlBench schicken.

So nutzt du diese Vorlage für dein eigenes Projekt:
  1. Die Einstellungen unten anpassen (API-Adresse, Experiment, Seeds, ...).
  2. fake_run() durch deinen echten Run ersetzen, z. B. ein SAC-Training oder eine LQR-Regelung.
     Die Funktion muss nur zwei Dinge zurückgeben:
       - results: die Endergebnisse des Runs, eine Zahl pro Feld  -> Tabelle "runs"
       - metrics: Messpunkte über die Steps, beliebig viele       -> Tabelle "metrics"
  3. Alles andere bleibt gleich: Experiment finden oder anlegen, lokal sichern, hochladen.

Hier wird noch nichts wirklich trainiert: fake_run() erzeugt nur eine plausible Fake-Lernkurve.

Voraussetzung: Das Backend läuft (im Ordner backend/: uvicorn main:app --reload)
Ausführen (im Projektordner): python experiments/example_upload.py
"""

import json
import math
import random
import time
from datetime import datetime
from pathlib import Path

import requests

# ============================================================
# Einstellungen
# ============================================================

API_URL = "http://127.0.0.1:8000"

EXPERIMENT = {
    "name": "Example Upload",
    "environment": "Pendulum-v1",
    "controller": "Fake",
    "description": "Angelegt von experiments/example_upload.py",
}

# True:  Gibt es schon ein Experiment mit gleichem Namen, Environment und Controller,
#        werden die neuen Runs dort angehängt.
# False: Bei jedem Start wird ein neues Experiment angelegt.
REUSE_EXPERIMENT = True

# True:  Jeder Run wird vor dem Hochladen als JSON-Datei gesichert. Ist die API beim
#        Hochladen nicht erreichbar, gehen die Ergebnisse so nicht verloren.
SAVE_LOCAL_BACKUP = True
BACKUP_DIR = Path(__file__).parent / "results"

SEEDS = [0, 1, 2, 3, 4]
TOTAL_STEPS = 20_000  # Trainingsschritte pro Run
LOG_EVERY = 500  # alle wie viele Steps ein Messpunkt aufgezeichnet wird


# ============================================================
# Kommunikation mit der ControlBench-API
# ============================================================

def find_experiment(name: str, environment: str, controller: str) -> int | None:
    """Sucht ein Experiment mit gleichem Namen, Environment und Controller. Gibt die ID oder None zurück."""
    res = requests.get(f"{API_URL}/experiments", timeout=5)
    res.raise_for_status()  # wirft einen Fehler bei 4xx/5xx statt still weiterzulaufen
    for exp in res.json():
        if (exp["name"], exp["environment"], exp["controller"]) == (name, environment, controller):
            return exp["id"]
    return None


def create_experiment(experiment: dict) -> int:
    """POST /experiments und gibt die vom Server vergebene ID zurück."""
    res = requests.post(f"{API_URL}/experiments", json=experiment, timeout=5)
    res.raise_for_status()
    return res.json()["id"]


def save_run(experiment_id: int, seed: int, results: dict) -> int:
    """POST /runs und gibt die ID des gespeicherten Runs zurück."""
    res = requests.post(
        f"{API_URL}/runs",
        json={"experiment_id": experiment_id, "seed": seed, **results},
        timeout=5,
    )
    res.raise_for_status()
    return res.json()["id"]


def save_metrics(run_id: int, metrics: list[dict]) -> int:
    """POST /runs/{run_id}/metrics mit allen Messpunkten in einer Anfrage. Gibt die Anzahl zurück."""
    res = requests.post(f"{API_URL}/runs/{run_id}/metrics", json=metrics, timeout=30)
    res.raise_for_status()
    return res.json()["count"]


def describe_error(error: requests.RequestException) -> str:
    """Macht aus einem requests-Fehler eine verständliche Meldung."""
    if isinstance(error, requests.HTTPError):
        return f"API-Fehler {error.response.status_code}: {error.response.text}"
    if isinstance(error, requests.ConnectionError):
        return f"keine Verbindung zu {API_URL}. Läuft das Backend?"
    return str(error)


# ============================================================
# Lokale Sicherung
# ============================================================

def save_backup(experiment_id: int, seed: int, results: dict, metrics: list[dict]) -> Path:
    """Schreibt einen Run als JSON-Datei nach BACKUP_DIR und gibt den Pfad zurück."""
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = BACKUP_DIR / f"experiment{experiment_id}_seed{seed}_{timestamp}.json"
    content = {"experiment_id": experiment_id, "seed": seed, "results": results, "metrics": metrics}
    path.write_text(json.dumps(content, indent=2), encoding="utf-8")
    return path


# ============================================================
# Der eigentliche Run: HIER deinen Code einsetzen
# ============================================================

def fake_run(seed: int) -> tuple[dict, list[dict]]:
    """Platzhalter für einen echten Run. Gleicher Seed -> gleiche Ergebnisse."""
    rng = random.Random(seed)
    learning_speed = rng.uniform(0.5, 1.5)  # jeder Seed lernt unterschiedlich schnell
    metrics = []

    start = time.perf_counter()
    for step in range(0, TOTAL_STEPS + 1, LOG_EVERY):
        time.sleep(0.01)  # hier würde im echten Training gelernt bzw. geregelt

        # Fake-Lernkurve: steigt von 0 gegen 1, plus etwas Rauschen
        progress = 1 - math.exp(-learning_speed * step / (TOTAL_STEPS / 4))
        success_rate = min(1.0, max(0.0, progress + rng.gauss(0, 0.05)))
        episode_reward = -1200 + 1050 * progress + rng.gauss(0, 30)

        metrics.append({"name": "success_rate", "step": step, "value": round(success_rate, 4)})
        metrics.append({"name": "episode_reward", "step": step, "value": round(episode_reward, 2)})
    duration = time.perf_counter() - start  # Rechenzeit in Sekunden

    stabilized = rng.random() > 0.2  # in ca. 20 % der Runs stabilisiert das Pendel nie
    results = {
        "reward": metrics[-1]["value"],  # letzter episode_reward
        "stability_time": round(rng.uniform(1.0, 4.0), 2) if stabilized else None,
        "recovery_time": None,
        "num_steps": TOTAL_STEPS,
        "duration": round(duration, 3),
    }
    return results, metrics


# ============================================================
# Ablauf
# ============================================================

def get_or_create_experiment() -> int:
    if REUSE_EXPERIMENT:
        existing_id = find_experiment(EXPERIMENT["name"], EXPERIMENT["environment"], EXPERIMENT["controller"])
        if existing_id is not None:
            print(f"Bestehendes Experiment #{existing_id} wird weiterverwendet")
            return existing_id
    experiment_id = create_experiment(EXPERIMENT)
    print(f"Experiment #{experiment_id} angelegt")
    return experiment_id


def main() -> None:
    # Ohne Experiment lässt sich nichts zuordnen. Schlägt das fehl, bricht das Skript ab,
    # bevor Rechenzeit für die Runs verbraucht wird.
    try:
        experiment_id = get_or_create_experiment()
    except requests.RequestException as error:
        print(f"Experiment konnte nicht angelegt werden: {describe_error(error)}")
        return

    for seed in SEEDS:
        print(f"Run mit seed={seed} läuft ...")
        results, metrics = fake_run(seed)

        backup_path = save_backup(experiment_id, seed, results, metrics) if SAVE_LOCAL_BACKUP else None

        # Ein fehlgeschlagener Upload bricht nicht ab: Die restlichen Runs laufen weiter
        try:
            run_id = save_run(experiment_id, seed, results)
            count = save_metrics(run_id, metrics)
            print(f"  -> Run #{run_id} gespeichert: reward={results['reward']}, "
                  f"{count} Messpunkte, Rechenzeit {results['duration']} s")
        except requests.RequestException as error:
            print(f"  -> Hochladen fehlgeschlagen: {describe_error(error)}")
            if backup_path:
                print(f"     Die Ergebnisse sind gesichert in {backup_path}")


if __name__ == "__main__":
    main()
