"""Vorlage: Ergebnisse von Trainings- oder Regelungsläufen automatisch an ControlBench schicken.

Ein Experiment vergleicht mehrere Konfigurationen (z. B. SAC, PPO, LQR) auf demselben Environment.
Jede Konfiguration läuft mit mehreren Seeds, damit ControlBench Mittelwert und Streuung zeigen kann.

Was pro Run hochgeladen wird:
  - results:      Endergebnisse, eine Zahl pro Feld (Reward, Rechenzeit, ...)       -> Tabelle "runs"
  - metrics:      Kurven über das Training (Success Rate über die Steps, ...)        -> Tabelle "metrics"
  - evaluations:  Kennwerte des fertigen Controllers, pro Szenario                   -> Tabelle "evaluations"
                  (Success Rate, Stellaufwand, ...; Szenarien = Robustheitstests)
  - trace:        Verlauf einer Test-Episode (Zustände und Stellgrößen über die Zeit) -> Tabelle "traces"

So nutzt du diese Vorlage für dein eigenes Projekt:
  1. Die Einstellungen unten anpassen (Experiment, Kategorie, Konfigurationen, Szenarien, ...).
  2. Festlegen, wann eine Episode ein Erfolg ist: is_success (Abschnitt "Success Rate").
  3. fake_run() durch deinen echten Run ersetzen. Die Funktion bekommt Konfiguration und Seed und gibt
     results, metrics, evaluations und trace zurück. Die Bausteine success_rate(), control_effort() und
     episode_to_trace() helfen beim Ausrechnen.
  4. Alles andere bleibt gleich: Experiment finden oder anlegen, lokal sichern, hochladen.

Hier wird noch nichts wirklich trainiert: fake_run() erzeugt nur plausible Fake-Daten.

Voraussetzung: Das Backend läuft (im Ordner backend/: uvicorn main:app --reload)
Ausführen (im Projektordner): python experiments/example_upload.py
"""

import json
import math
import random
import time
from collections.abc import Callable
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
    # Art der Aufgabe. Vorschläge: "stabilization", "swing-up", "positioning", "tracking",
    # "disturbance-rejection", "locomotion". Eigene Kategorien sind erlaubt.
    "category": "swing-up",
}

# Die Konfigurationen, die verglichen werden.
#   name:            Name der Konfiguration. Alle Seeds einer Konfiguration tragen denselben Namen,
#                    so kann ControlBench über sie mitteln. Andere Hyperparameter = anderer Name.
#   controller:      der Algorithmus bzw. Regler, z. B. "SAC", "PPO", "LQR"
#   seeds:           ein Run pro Seed. Ein deterministischer Regler wie LQR braucht nur einen.
#   trains:          False bei Controllern ohne Training (LQR, PID, MPC, ...). ControlBench zeigt sie
#                    als waagerechte Referenzlinie statt als Lernkurve. Ohne Angabe: True.
#   hyperparameters: Einstellungen, frei aufgebaut. ControlBench zeigt sie beim Aufklappen der Konfiguration.
CONFIGURATIONS = [
    {
        "name": "SAC default",
        "controller": "SAC",
        "seeds": [0, 1, 2, 3, 4],
        "hyperparameters": {"learning_rate": 3e-4, "gamma": 0.99, "batch_size": 256, "net_arch": [256, 256]},
    },
    {
        "name": "PPO default",
        "controller": "PPO",
        "seeds": [0, 1, 2, 3, 4],
        "hyperparameters": {"learning_rate": 3e-4, "gamma": 0.99, "n_steps": 2048, "clip_range": 0.2},
    },
    {
        "name": "LQR",
        "controller": "LQR",
        "seeds": [0],
        "trains": False,
        "hyperparameters": {"Q": "diag(10, 1)", "R": 0.1},
    },
]

# Robustheit: Jeder fertige Controller wird zusätzlich unter veränderten Bedingungen getestet.
# "nominal" = unverändert. Die anderen Namen erscheinen in ControlBench als Spalten der Robustheits-Tabelle.
# Die Werte hier sind nur für die Fake-Daten (Stärke der Störung); in deinem Code stellst du z. B. Masse,
# Reibung oder Sensorrauschen im Environment um.
SCENARIOS = {"nominal": 1.0, "mass+20%": 1.6, "sensor_noise": 1.4, "impulse": 1.8}
EVAL_EPISODES = 20  # Test-Episoden pro Szenario

# Standard-Metriken: Unter diesen Namen erscheinen Kurven in ControlBench ganz oben in der Metrik-Auswahl.
# Beliebige weitere Namen sind erlaubt, sie sind über die Suche erreichbar.
STANDARD_METRICS = ["success_rate", "episode_reward", "control_effort", "episode_length", "tracking_error"]

# True:  Gibt es schon ein Experiment mit gleichem Namen und Environment, werden die neuen Runs dort angehängt.
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
BATCH_SIZE = 10_000  # Messpunkte bzw. Verlaufspunkte pro Anfrage beim Hochladen


# ============================================================
# Success Rate: überall gleich definiert
# ============================================================
#
# Die Success Rate ist der ANTEIL ERFOLGREICHER TEST-EPISODEN. Sie liegt damit immer zwischen 0 und 1 und
# ist über alle Aufgaben vergleichbar, egal ob Pendel oder laufender Roboter; eine Normierung ist nicht nötig.
# Aufgabenspezifisch ist nur eine einzige Frage pro Episode: Erfolg ja oder nein? Das beantwortet is_success.
#
# Eine Episode ist hier ein Dictionary:
#   {"dt": 0.02,                                  Zeitschritt in Sekunden
#    "signals": {"angle": [...], "x": [...]},     beliebige Zustände, je eine Liste pro Zeitschritt
#    "actions": [[u0, u1], [u0, u1], ...]}        Stellgrößen pro Zeitschritt (beliebig viele Steller)
#
# is_success setzt man aus Bausteinen zusammen. Beispiele:
#
#   Pendel aufschwingen und halten:
#       all_of(holds_within("angle", tolerance=0.1, hold_time=1.0))
#   Ball Balancer (Kugel 2 cm ums Ziel, 0,5 s lang, nie herunterfallen):
#       all_of(holds_within("ball_error", 0.02, 0.5), stays_between("ball_height", 0.0, math.inf))
#   Reacher (Zielpunkt erreichen und dort bleiben):
#       holds_within("distance_to_target", 0.01, 0.2, until_end=True)
#   Laufroboter (Ant, Humanoid): mindestens 5 m weit kommen, ohne umzufallen:
#       all_of(final_at_least("x_position", 5.0), stays_between("torso_height", 0.25, math.inf))
#     Unterschiedliches Terrain testet man als Szenarien (SCENARIOS = {"flat": ..., "stairs": ..., "rough": ...}),
#     so zeigt ControlBench die Success Rate pro Terrain in der Robustheits-Tabelle.
#
# Wer etwas ganz anderes braucht, schreibt is_success einfach selbst: Funktion(episode) -> bool.

Episode = dict
Predicate = Callable[[Episode], bool]


def holds_within(signal: str, tolerance: float, hold_time: float, until_end: bool = False) -> Predicate:
    """Erfolg, wenn |signal| mindestens hold_time Sekunden am Stück innerhalb der Toleranz bleibt.

    until_end=True: Das Signal muss am Ende der Episode innerhalb der Toleranz sein (und dort hold_time lang).
    """
    def predicate(episode: Episode) -> bool:
        needed = max(1, round(hold_time / episode["dt"]))
        streak = 0
        for value in episode["signals"][signal]:
            streak = streak + 1 if abs(value) <= tolerance else 0
            if streak >= needed and not until_end:
                return True
        return streak >= needed
    return predicate


def stays_between(signal: str, low: float, high: float) -> Predicate:
    """Erfolg, wenn das Signal nie den Bereich verlässt, z. B. "nie umgefallen" oder "nie heruntergefallen"."""
    return lambda episode: all(low <= value <= high for value in episode["signals"][signal])


def final_at_least(signal: str, minimum: float) -> Predicate:
    """Erfolg, wenn das Signal am Ende mindestens minimum ist, z. B. zurückgelegte Strecke."""
    return lambda episode: episode["signals"][signal][-1] >= minimum


def all_of(*predicates: Predicate) -> Predicate:
    """Erfolg nur, wenn alle Bedingungen erfüllt sind."""
    return lambda episode: all(predicate(episode) for predicate in predicates)


def success_rate(episodes: list[Episode], is_success: Predicate) -> float:
    """Anteil erfolgreicher Episoden, zwischen 0 und 1."""
    return sum(1 for episode in episodes if is_success(episode)) / len(episodes)


def control_effort(episode: Episode) -> float:
    """Stellaufwand einer Episode: ∫‖u‖² dt, also die quadrierten Stellgrößen, über alle Steller summiert
    und über die Zeit integriert. Funktioniert für einen Steller (Pendel) genauso wie für acht (Ant)."""
    return sum(sum(u * u for u in action) for action in episode["actions"]) * episode["dt"]


def episode_to_trace(episode: Episode) -> list[dict]:
    """Macht aus einer Episode den Verlauf für ControlBench: alle Signale und Stellgrößen u_0, u_1, ...
    über die simulierte Zeit."""
    dt = episode["dt"]
    trace = [
        {"signal": name, "t": round(i * dt, 6), "value": value}
        for name, values in episode["signals"].items()
        for i, value in enumerate(values)
    ]
    trace += [
        {"signal": f"u_{axis}", "t": round(i * dt, 6), "value": u}
        for i, action in enumerate(episode["actions"])
        for axis, u in enumerate(action)
    ]
    return trace


# Die Definition für DIESES Experiment (Pendel aufschwingen): Winkel 1 s lang innerhalb 0,1 rad
is_success = holds_within("angle", tolerance=0.1, hold_time=1.0)


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
            "trains": configuration.get("trains", True),
            "hyperparameters": configuration.get("hyperparameters"),
            "seed": seed,
            **results,
        },
        timeout=5,
    )
    res.raise_for_status()
    return res.json()["id"]


def post_in_batches(path: str, points: list[dict]) -> int:
    """Schickt viele Punkte in Paketen à BATCH_SIZE, damit keine einzelne Anfrage in den Timeout läuft."""
    saved = 0
    for start in range(0, len(points), BATCH_SIZE):
        res = requests.post(f"{API_URL}{path}", json=points[start:start + BATCH_SIZE], timeout=30)
        res.raise_for_status()
        saved += res.json()["count"]
    return saved


def save_metrics(run_id: int, metrics: list[dict]) -> int:
    """POST /runs/{run_id}/metrics: Kurven über das Training."""
    return post_in_batches(f"/runs/{run_id}/metrics", metrics)


def save_evaluations(run_id: int, evaluations: list[dict]) -> int:
    """POST /runs/{run_id}/evaluations: Kennwerte pro Szenario. Erneutes Hochladen überschreibt sie."""
    res = requests.post(f"{API_URL}/runs/{run_id}/evaluations", json=evaluations, timeout=30)
    res.raise_for_status()
    return res.json()["count"]


def save_trace(run_id: int, trace: list[dict]) -> int:
    """POST /runs/{run_id}/traces: Verlauf einer Test-Episode."""
    return post_in_batches(f"/runs/{run_id}/traces", trace)


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

def save_backup(experiment_id: int, configuration: dict, seed: int, run: dict) -> Path:
    """Schreibt einen Run mit allem, was hochgeladen wird, als JSON-Datei nach BACKUP_DIR."""
    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    slug = configuration["name"].replace(" ", "-")
    path = BACKUP_DIR / f"experiment{experiment_id}_{slug}_seed{seed}_{timestamp}.json"
    content = {"experiment_id": experiment_id, "configuration": configuration, "seed": seed, **run}
    path.write_text(json.dumps(content, indent=2), encoding="utf-8")
    return path


# ============================================================
# Der eigentliche Run: HIER deinen Code einsetzen
# ============================================================

# Nur für die Fake-Daten: wie schnell jeder Controller "lernt", wie viel Rechenzeit er braucht und wie
# unruhig seine Stellgröße ist. LQR lernt nicht; er ist von Anfang an gut, regelt ruhig, ist aber empfindlich.
FAKE_PROFILES = {
    "SAC": {"learning_speed": 1.3, "step_cost": 0.012, "final_reward": -140, "jitter": 0.12, "sensitivity": 0.5},
    "PPO": {"learning_speed": 0.6, "step_cost": 0.005, "final_reward": -190, "jitter": 0.25, "sensitivity": 0.4},
    "LQR": {"learning_speed": None, "step_cost": 0.0005, "final_reward": -150, "jitter": 0.0, "sensitivity": 1.0},
}


def fake_episode(profile: dict, quality: float, disturbance: float, rng: random.Random) -> Episode:
    """Eine erfundene Test-Episode: der Winkel schwingt gedämpft aufs Ziel ein, die Stellgröße regelt dagegen.

    quality (0..1): wie gut der Controller trainiert ist. disturbance: Stärke der Störung (1 = nominal).
    """
    dt = 0.02
    damping = 0.4 + 1.6 * quality
    # Bleibende Restschwingung: größer bei schlechtem Training, starker Störung und empfindlichem Controller.
    # Liegt sie über der Toleranz von is_success (0,1 rad), scheitert die Episode.
    wobble = abs(
        0.04 + 0.12 * (1 - quality) + 0.08 * (disturbance - 1) * profile["sensitivity"] + rng.gauss(0, 0.04)
    )
    angle, actions = [], []
    for i in range(300):
        t = i * dt
        a = 3.0 * math.exp(-damping * t) * math.cos(4.0 * t) + wobble * math.sin(9.0 * t)
        angle.append(a)
        u = -0.6 * a + rng.gauss(0, profile["jitter"] * disturbance)
        actions.append([max(-2.0, min(2.0, u))])
    return {"dt": dt, "signals": {"angle": angle}, "actions": actions}


def fake_run(configuration: dict, seed: int) -> dict:
    """Platzhalter für einen echten Run. Gleicher Seed -> gleiche Ergebnisse.

    Gibt ein Dictionary mit results, metrics, evaluations und trace zurück (siehe Kopf der Datei).
    """
    profile = FAKE_PROFILES.get(configuration["controller"], FAKE_PROFILES["SAC"])
    rng = random.Random(f"{configuration['name']}-{seed}")
    # Jeder Seed lernt und rechnet etwas anders: genau diese Streuung zeigt ControlBench an
    speed = None if profile["learning_speed"] is None else profile["learning_speed"] * rng.uniform(0.6, 1.4)
    step_cost = profile["step_cost"] * rng.uniform(0.7, 1.3)

    # 1. Training: Kurven über die Steps
    metrics = []
    start = time.perf_counter()
    for step in range(0, TOTAL_STEPS + 1, LOG_EVERY):
        time.sleep(step_cost)  # hier würde im echten Training gelernt bzw. geregelt

        progress = 0.9 if speed is None else 1 - math.exp(-speed * step / (TOTAL_STEPS / 4))
        # time: Sekunden seit Start des Runs. Damit lässt sich die Kurve auch über die Rechenzeit zeichnen
        elapsed = round(time.perf_counter() - start, 3)
        # Im echten Training: ein paar Test-Episoden auswerten und success_rate(episodes, is_success) loggen
        values = {
            "success_rate": min(1.0, max(0.0, progress + rng.gauss(0, 0.04))),
            "episode_reward": -1200 + (1200 + profile["final_reward"]) * progress + rng.gauss(0, 25),
            "control_effort": 60 * (1.2 - 0.6 * progress) * (1 + profile["jitter"]) + rng.gauss(0, 2),
        }
        metrics += [{"name": name, "step": step, "value": round(v, 4), "time": elapsed} for name, v in values.items()]
    duration = time.perf_counter() - start  # Rechenzeit in Sekunden
    quality = 0.9 if speed is None else min(1.0, 1 - math.exp(-speed * 4))

    # 2. Evaluation des fertigen Controllers: EVAL_EPISODES Episoden pro Szenario
    evaluations = []
    first_nominal_episode = None
    for scenario, disturbance in SCENARIOS.items():
        episodes = [fake_episode(profile, quality, disturbance, rng) for _ in range(EVAL_EPISODES)]
        first_nominal_episode = first_nominal_episode or episodes[0]
        evaluations += [
            {"scenario": scenario, "name": "success_rate", "value": success_rate(episodes, is_success)},
            {"scenario": scenario, "name": "control_effort", "value": sum(map(control_effort, episodes)) / len(episodes)},
        ]

    nominal_success = evaluations[0]["value"]
    results = {
        "reward": round(metrics[-2]["value"], 2),  # letzter episode_reward
        "stability_time": round(rng.uniform(1.0, 4.0), 2) if nominal_success > 0 else None,
        "recovery_time": None,
        "num_steps": TOTAL_STEPS,
        "duration": round(duration, 3),
    }
    # 3. Verlauf: eine nominale Test-Episode
    return {"results": results, "metrics": metrics, "evaluations": evaluations, "trace": episode_to_trace(first_nominal_episode)}


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
            run = fake_run(configuration, seed)

            backup_path = save_backup(experiment_id, configuration, seed, run) if SAVE_LOCAL_BACKUP else None

            # Ein fehlgeschlagener Upload bricht nicht ab: Die restlichen Runs laufen weiter
            try:
                run_id = save_run(experiment_id, configuration, seed, run["results"])
                points = save_metrics(run_id, run["metrics"])
                figures = save_evaluations(run_id, run["evaluations"])
                trace = save_trace(run_id, run["trace"])
                print(f"  -> Run #{run_id} gespeichert: {points} Messpunkte, {figures} Kennwerte, "
                      f"{trace} Verlaufspunkte, Rechenzeit {run['results']['duration']} s")
            except requests.RequestException as error:
                print(f"  -> Hochladen fehlgeschlagen: {describe_error(error)}")
                if backup_path:
                    print(f"     Die Ergebnisse sind gesichert in {backup_path}")


if __name__ == "__main__":
    main()
