"""Vorlage: Ergebnisse von Trainings- oder Regelungsläufen automatisch an ControlBench schicken.

Ein Experiment vergleicht mehrere Konfigurationen (z. B. SAC, PPO, LQR) auf demselben Environment.
Jede Konfiguration läuft mit mehreren Seeds, damit ControlBench Mittelwert und Streuung zeigen kann.

So nutzt du diese Vorlage für dein eigenes Projekt:
  1. Die Einstellungen unten anpassen (API-Adresse, Experiment, Konfigurationen, Seeds, ...).
  2. fake_run() durch deinen echten Run ersetzen, z. B. ein SAC-Training oder eine LQR-Regelung.
     Die Funktion muss nur zwei Dinge zurückgeben:
       - results: die Endergebnisse des Runs, eine Zahl pro Feld  -> Tabelle "runs"
       - metrics: Messpunkte über die Steps (mit Zeitstempel), beliebig viele -> Tabelle "metrics"
  3. Alles andere bleibt gleich: Experiment finden oder anlegen, lokal sichern, hochladen.

Hier wird noch nichts wirklich trainiert: fake_run() erzeugt nur plausible Fake-Lernkurven.

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
    "name": "Pendulum controller comparison",
    "environment": "Pendulum-v1",
    "description": "Demo data created by experiments/example_upload.py",
}

# Die Konfigurationen, die verglichen werden.
#   name:       Name der Konfiguration. Alle Seeds einer Konfiguration tragen denselben Namen,
#               so kann ControlBench über sie mitteln. Andere Hyperparameter = anderer Name,
#               z. B. "SAC lr 1e-3".
#   controller: der Algorithmus bzw. Regler, z. B. "SAC", "PPO", "LQR"
#   seeds:      ein Run pro Seed. Ein deterministischer Regler wie LQR braucht nur einen.
CONFIGURATIONS = [
    {"name": "SAC default", "controller": "SAC", "seeds": [0, 1, 2, 3, 4]},
    {"name": "PPO default", "controller": "PPO", "seeds": [0, 1, 2, 3, 4]},
    {"name": "LQR", "controller": "LQR", "seeds": [0]},
]

# True:  Gibt es schon ein Experiment mit gleichem Namen und Environment,
#        werden die neuen Runs dort angehängt.
# False: Bei jedem Start wird ein neues Experiment angelegt.
REUSE_EXPERIMENT = True

# True:  Jeder Run wird vor dem Hochladen als JSON-Datei gesichert. Ist die API beim
#        Hochladen nicht erreichbar, gehen die Ergebnisse so nicht verloren.
SAVE_LOCAL_BACKUP = True
BACKUP_DIR = Path(__file__).parent / "results"

TOTAL_STEPS = 20_000  # Trainingsschritte pro Run
# Alle wie viele Steps ein Messpunkt aufgezeichnet wird. Faustregel: so wählen, dass pro Run
# höchstens ~100.000 Messpunkte entstehen, z. B. bei 200 Mio. Steps alle 2.000 bis 10.000 Steps.
LOG_EVERY = 500
METRICS_BATCH_SIZE = 10_000  # Messpunkte pro Anfrage beim Hochladen


# ============================================================
# Kommunikation mit der ControlBench-API
# ============================================================

def find_experiment(name: str, environment: str) -> int | None:
    """Sucht ein Experiment mit gleichem Namen und Environment. Gibt die ID oder None zurück."""
    res = requests.get(f"{API_URL}/experiments", timeout=5)
    res.raise_for_status()  # wirft einen Fehler bei 4xx/5xx statt still weiterzulaufen
    for exp in res.json():
        if (exp["name"], exp["environment"]) == (name, environment):
            return exp["id"]
    return None


def create_experiment(experiment: dict) -> int:
    """POST /experiments und gibt die vom Server vergebene ID zurück."""
    res = requests.post(f"{API_URL}/experiments", json=experiment, timeout=5)
    res.raise_for_status()
    return res.json()["id"]


def save_run(experiment_id: int, configuration: dict, seed: int, results: dict) -> int:
    """POST /runs und gibt die ID des gespeicherten Runs zurück."""
    res = requests.post(
        f"{API_URL}/runs",
        json={
            "experiment_id": experiment_id,
            "controller": configuration["controller"],
            "name": configuration["name"],
            "seed": seed,
            **results,
        },
        timeout=5,
    )
    res.raise_for_status()
    return res.json()["id"]


def save_metrics(run_id: int, metrics: list[dict]) -> int:
    """POST /runs/{run_id}/metrics in Paketen à METRICS_BATCH_SIZE Punkten. Gibt die Anzahl zurück.

    Lange Trainings haben hunderttausende Messpunkte. In einer einzigen Anfrage wären das zig Megabyte,
    die leicht in den Timeout laufen; 10.000 Punkte pro Anfrage brauchen nur Bruchteile einer Sekunde.
    """
    saved = 0
    for start in range(0, len(metrics), METRICS_BATCH_SIZE):
        batch = metrics[start:start + METRICS_BATCH_SIZE]
        res = requests.post(f"{API_URL}/runs/{run_id}/metrics", json=batch, timeout=30)
        res.raise_for_status()
        saved += res.json()["count"]
    return saved


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

def save_backup(experiment_id: int, configuration: dict, seed: int, results: dict, metrics: list[dict]) -> Path:
    """Schreibt einen Run als JSON-Datei nach BACKUP_DIR und gibt den Pfad zurück."""
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    slug = configuration["name"].replace(" ", "-")
    path = BACKUP_DIR / f"experiment{experiment_id}_{slug}_seed{seed}_{timestamp}.json"
    content = {
        "experiment_id": experiment_id,
        "controller": configuration["controller"],
        "name": configuration["name"],
        "seed": seed,
        "results": results,
        "metrics": metrics,
    }
    path.write_text(json.dumps(content, indent=2), encoding="utf-8")
    return path


# ============================================================
# Der eigentliche Run: HIER deinen Code einsetzen
# ============================================================

# Nur für die Fake-Daten: wie schnell jeder Controller "lernt" und wie viel Rechenzeit er braucht.
# LQR lernt nicht, er ist von Anfang an gut, aber nicht perfekt.
FAKE_PROFILES = {
    "SAC": {"learning_speed": 1.3, "step_cost": 0.012, "final_reward": -140},
    "PPO": {"learning_speed": 0.6, "step_cost": 0.005, "final_reward": -190},
    "LQR": {"learning_speed": None, "step_cost": 0.0005, "final_reward": -150},
}


def fake_run(configuration: dict, seed: int) -> tuple[dict, list[dict]]:
    """Platzhalter für einen echten Run. Gleicher Seed -> gleiche Ergebnisse."""
    profile = FAKE_PROFILES.get(configuration["controller"], FAKE_PROFILES["SAC"])
    rng = random.Random(f"{configuration['name']}-{seed}")
    # Jeder Seed lernt und rechnet etwas anders: genau diese Streuung zeigt ControlBench an
    speed = None if profile["learning_speed"] is None else profile["learning_speed"] * rng.uniform(0.6, 1.4)
    step_cost = profile["step_cost"] * rng.uniform(0.7, 1.3)
    metrics = []

    start = time.perf_counter()
    for step in range(0, TOTAL_STEPS + 1, LOG_EVERY):
        time.sleep(step_cost)  # hier würde im echten Training gelernt bzw. geregelt

        # Fake-Lernkurve: steigt von 0 gegen 1 (LQR: von Anfang an konstant hoch), plus Rauschen
        progress = 0.9 if speed is None else 1 - math.exp(-speed * step / (TOTAL_STEPS / 4))
        success_rate = min(1.0, max(0.0, progress + rng.gauss(0, 0.04)))
        episode_reward = -1200 + (1200 + profile["final_reward"]) * progress + rng.gauss(0, 25)

        # time: Sekunden seit Start des Runs. Damit lässt sich die Kurve auch über die Rechenzeit zeichnen
        elapsed = round(time.perf_counter() - start, 3)
        metrics.append({"name": "success_rate", "step": step, "value": round(success_rate, 4), "time": elapsed})
        metrics.append({"name": "episode_reward", "step": step, "value": round(episode_reward, 2), "time": elapsed})
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
        existing_id = find_experiment(EXPERIMENT["name"], EXPERIMENT["environment"])
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

    for configuration in CONFIGURATIONS:
        for seed in configuration["seeds"]:
            print(f"{configuration['name']}, seed={seed} läuft ...")
            results, metrics = fake_run(configuration, seed)

            backup_path = (
                save_backup(experiment_id, configuration, seed, results, metrics) if SAVE_LOCAL_BACKUP else None
            )

            # Ein fehlgeschlagener Upload bricht nicht ab: Die restlichen Runs laufen weiter
            try:
                run_id = save_run(experiment_id, configuration, seed, results)
                count = save_metrics(run_id, metrics)
                print(f"  -> Run #{run_id} gespeichert: reward={results['reward']}, "
                      f"{count} Messpunkte, Rechenzeit {results['duration']} s")
            except requests.RequestException as error:
                print(f"  -> Hochladen fehlgeschlagen: {describe_error(error)}")
                if backup_path:
                    print(f"     Die Ergebnisse sind gesichert in {backup_path}")


if __name__ == "__main__":
    main()
