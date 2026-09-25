"""Einmalige Umwandlung: Endwerte, die als Metriken gespeichert wurden, zusätzlich als Kennwerte (evaluations) ablegen.

Vor der Tabelle "evaluations" haben Trainingsskripte Endwerte und Robustheitstests oft als Metriken mit einem
einzigen Messpunkt gespeichert, z. B. "final_success_rate" oder "friction_high_success_rate". Dieses Skript
liest solche Einzelpunkte über die API und legt sie als Kennwerte mit Szenario ab:

    final_success_rate            -> Szenario "nominal",       Kennwert "success_rate"
    final_l2_success_rate         -> Szenario "level 2",       Kennwert "success_rate"
    friction_high_success_rate    -> Szenario "friction_high", Kennwert "success_rate"
    final_mean_control_effort     -> Szenario "nominal",       Kennwert "control_effort"  (siehe ALIASES)
    worst_success_rate            -> Szenario "nominal",       Kennwert "worst_success_rate"  (Zusammenfassung)

Szenarien erkennt das Skript an den Kennwerten, die es als "nominal_<name>" gibt: Existiert "nominal_success_rate",
dann ist "friction_high_success_rate" der Kennwert "success_rate" im Szenario "friction_high".
Alle anderen Einzelpunkte (z. B. Ereignisse wie "slow_command_response_time") werden übersprungen und gemeldet.

Die Metriken bleiben unverändert. Das Skript fügt nur hinzu; ein zweiter Lauf überschreibt dieselben Kennwerte.
Episodenverläufe kann es nicht erzeugen: Die wurden nie aufgezeichnet.

Aufruf (Backend muss laufen):
    python scripts/convert_final_metrics.py            # zeigt nur, was passieren würde
    python scripts/convert_final_metrics.py --apply    # schreibt die Kennwerte
    python scripts/convert_final_metrics.py --experiment 3 --apply
"""

import argparse
import re
from collections import defaultdict

import requests

API_URL = "http://127.0.0.1:8000"

# Umbenennungen für Kennwerte, die das Dashboard unter einem festen Namen erwartet.
# Achtung: "mean_control_effort" ist meist der Mittelwert von ‖u‖² pro Schritt, nicht das Integral ∫‖u‖² dt.
# Innerhalb eines Experiments ist das für den Vergleich gleichwertig (gleicher Faktor dt · Schritte).
ALIASES = {"mean_control_effort": "control_effort"}

LEVEL = re.compile(r"^l(\d+)_(.+)$")
# Präfixe, die kein Szenario sind, sondern eine Zusammenfassung über Szenarien oder Episoden
SUMMARIES = ("mean_", "median_", "worst_", "best_")

Evaluations = dict[tuple[str, str], tuple[float, str]]  # (Szenario, Name) -> (Wert, Quell-Metrik)


def get(path: str, **params):
    res = requests.get(f"{API_URL}{path}", params=params, timeout=30)
    res.raise_for_status()
    return res.json()


def single_points(run_id: int) -> dict[str, float]:
    """Alle Metriken dieses Runs, die genau einen Messpunkt haben: Name -> Wert."""
    by_name: dict[str, list[float]] = defaultdict(list)
    for point in get(f"/runs/{run_id}/metrics"):
        by_name[point["name"]].append(point["value"])
    return {name: values[0] for name, values in by_name.items() if len(values) == 1}


def convert(points: dict[str, float], known: set[str], scenarios: set[str] = frozenset()) -> tuple[Evaluations, list[str]]:
    """Macht aus Einzelpunkten Kennwerte und meldet, was übersprungen wurde.

    known:     Kennwert-Namen, die es als nominal_<name> gibt; daran werden Szenario-Präfixe erkannt.
    scenarios: bereits erkannte Szenarien; damit werden auch Kennwerte zugeordnet, die es nur in einem
               Szenario gibt (z. B. impulse_recovery_time)
    """
    result: Evaluations = {}
    skipped: list[str] = []
    # Reihenfolge: erst final_*, dann Szenario-Präfixe; ein ausdrückliches nominal_* gewinnt gegen final_*
    for source in sorted(points, key=lambda n: (not n.startswith("final_"), n)):
        value = points[source]
        if source.startswith("final_"):
            rest = source[len("final_"):]
            level = LEVEL.match(rest)
            scenario, name = (f"level {level.group(1)}", level.group(2)) if level else ("nominal", rest)
        elif source.startswith(SUMMARIES):
            scenario, name = "nominal", source
        else:
            suffix = next((k for k in sorted(known, key=len, reverse=True) if source.endswith("_" + k)), None)
            prefix = source[: -len(suffix) - 1] if suffix else ""
            if not prefix:
                # Zweite Regel: beginnt der Name mit einem bekannten Szenario (längstes zuerst: impulse_strong vor impulse)?
                prefix = next((s for s in sorted(scenarios, key=len, reverse=True) if source.startswith(s + "_")), "")
                suffix = source[len(prefix) + 1:] if prefix else None
            # Stufen wie l2_* ohne final_ sind Kurvenpunkte, keine Szenarien
            if not prefix or LEVEL.match(source):
                skipped.append(source)
                continue
            scenario, name = prefix, suffix
        result[(scenario, ALIASES.get(name, name))] = (value, source)
    return result, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="Kennwerte wirklich schreiben (sonst nur anzeigen)")
    parser.add_argument("--experiment", type=int, help="nur dieses Experiment")
    args = parser.parse_args()

    runs = get("/runs", **({"experiment_id": args.experiment} if args.experiment else {}))
    per_run = {run["id"]: single_points(run["id"]) for run in runs}
    # Kennwert-Namen mit Szenarien: alles, was als nominal_<name> vorkommt
    known = {n[len("nominal_"):] for points in per_run.values() for n in points if n.startswith("nominal_")}
    # Erster Durchgang: welche Szenarien gibt es überhaupt? (für Kennwerte, die es nur in einem Szenario gibt)
    found = {s for points in per_run.values() for s, _ in convert(points, known)[0]} - {"nominal"}
    found = {s for s in found if not s.startswith("level ")}

    total = 0
    scenarios: set[str] = set()
    skipped_names: set[str] = set()
    for run in runs:
        evaluations, skipped = convert(per_run[run["id"]], known, found)
        skipped_names |= set(skipped)
        if not evaluations:
            continue
        total += len(evaluations)
        scenarios |= {scenario for scenario, _ in evaluations}
        print(f"Run #{run['id']} ({run['name']}, seed {run['seed']}): {len(evaluations)} Kennwerte")
        for (scenario, name), (value, source) in sorted(evaluations.items())[:3]:
            print(f"    {source:40} -> {scenario:16} {name} = {value:.4g}")
        if args.apply:
            body = [{"scenario": s, "name": n, "value": v} for (s, n), (v, _) in evaluations.items()]
            requests.post(f"{API_URL}/runs/{run['id']}/evaluations", json=body, timeout=30).raise_for_status()

    print()
    print(f"{total} Kennwerte in {len(scenarios)} Szenarien: {', '.join(sorted(scenarios))}")
    if skipped_names:
        print(f"Übersprungen (kein Endwert erkennbar): {', '.join(sorted(skipped_names))}")
    print("Geschrieben." if args.apply else "Nur angezeigt. Mit --apply schreiben.")


if __name__ == "__main__":
    main()
