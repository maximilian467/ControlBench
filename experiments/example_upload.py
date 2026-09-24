"""Beispiel: ein Experiment anlegen und Runs automatisch an ControlBench schicken.

Hier wird noch nichts trainiert: fake_run() erzeugt nur plausible Zufallszahlen.
Später ersetzt echtes Training oder eine echte Regelung (z. B. SAC oder LQR) diese Funktion.

Voraussetzung: Das Backend läuft (im Ordner backend/: uvicorn main:app --reload)
Ausführen (im Projektordner): python experiments/example_upload.py
"""

import random
import time

import requests

API_URL = "http://127.0.0.1:8000"


def create_experiment(name: str, environment: str, controller: str, description: str | None = None) -> int:
    """POST /experiments und gibt die vom Server vergebene ID zurück."""
    res = requests.post(
        f"{API_URL}/experiments",
        json={
            "name": name,
            "environment": environment,
            "controller": controller,
            "description": description,
        },
        timeout=5,
    )
    res.raise_for_status()  # wirft einen Fehler bei 4xx/5xx statt still weiterzulaufen
    return res.json()["id"]


def save_run(experiment_id: int, seed: int, results: dict) -> dict:
    """POST /runs und gibt den gespeicherten Run zurück."""
    res = requests.post(
        f"{API_URL}/runs",
        json={"experiment_id": experiment_id, "seed": seed, **results},
        timeout=5,
    )
    res.raise_for_status()
    return res.json()


def fake_run(seed: int) -> dict:
    """Platzhalter für einen echten Run. Gleicher Seed -> gleiche Ergebnisse."""
    rng = random.Random(seed)
    num_steps = 200

    start = time.perf_counter()
    for _ in range(num_steps):
        time.sleep(0.005)  # tut so, als würde ein Simulationsschritt Rechenzeit kosten
    duration = time.perf_counter() - start  # echte Laufzeit in Sekunden

    stabilized = rng.random() > 0.2  # in ca. 20 % der Runs stabilisiert das Pendel nie
    return {
        "reward": round(rng.uniform(-300, -100), 2),
        "stability_time": round(rng.uniform(1.0, 4.0), 2) if stabilized else None,
        "recovery_time": None,
        "num_steps": num_steps,
        "duration": round(duration, 3),
    }


def main() -> None:
    experiment_id = create_experiment(
        name="Example Upload",
        environment="Pendulum-v1",
        controller="Fake",
        description="Automatisch angelegt von experiments/example_upload.py",
    )
    print(f"Experiment #{experiment_id} angelegt")

    for seed in range(5):
        results = fake_run(seed)
        run = save_run(experiment_id, seed, results)
        print(f"  Run #{run['id']} gespeichert: seed={seed}, reward={run['reward']}, "
              f"stability_time={run['stability_time']}, duration={run['duration']} s")


if __name__ == "__main__":
    try:
        main()
    except requests.ConnectionError:
        print(f"Keine Verbindung zu {API_URL}. Läuft das Backend?")
    except requests.HTTPError as error:
        print(f"Die API hat mit Fehler {error.response.status_code} geantwortet: {error.response.text}")
