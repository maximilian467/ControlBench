from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.tables import MetricTable

CURVE = [
    {"name": "success_rate", "step": 1000, "value": 0.4},
    {"name": "success_rate", "step": 0, "value": 0.0},
    {"name": "episode_reward", "step": 0, "value": -1200.0},
]


def test_create_metrics_in_one_request(client, run):
    res = client.post(f"/runs/{run['id']}/metrics", json=CURVE)

    assert res.status_code == 201
    assert res.json() == {"run_id": run["id"], "count": 3}


def test_list_metrics_sorted_by_name_and_step(client, run):
    client.post(f"/runs/{run['id']}/metrics", json=CURVE)

    res = client.get(f"/runs/{run['id']}/metrics")

    assert res.status_code == 200
    assert [(m["name"], m["step"]) for m in res.json()] == [
        ("episode_reward", 0),
        ("success_rate", 0),
        ("success_rate", 1000),
    ]


def test_list_metrics_filtered_by_name(client, run):
    client.post(f"/runs/{run['id']}/metrics", json=CURVE)

    res = client.get(f"/runs/{run['id']}/metrics", params={"name": "success_rate"})

    assert [(m["step"], m["value"]) for m in res.json()] == [(0, 0.0), (1000, 0.4)]


def test_metrics_for_unknown_run_return_404(client):
    assert client.post("/runs/999/metrics", json=CURVE).status_code == 404
    assert client.get("/runs/999/metrics").status_code == 404


def test_invalid_metric_returns_422_and_saves_nothing(client, run):
    broken = CURVE + [{"name": "success_rate", "step": "abc", "value": 1.0}]

    res = client.post(f"/runs/{run['id']}/metrics", json=broken)

    assert res.status_code == 422
    # Pydantic prüft die ganze Liste, bevor irgendetwas gespeichert wird
    assert client.get(f"/runs/{run['id']}/metrics").json() == []


def test_deleting_run_deletes_its_metrics(client, engine, run):
    client.post(f"/runs/{run['id']}/metrics", json=CURVE)

    client.delete(f"/runs/{run['id']}")

    # Direkt in die Datenbank schauen: Die API kann Messpunkte eines gelöschten Runs gar nicht mehr abfragen
    with Session(engine) as db:
        remaining = db.scalar(select(func.count()).select_from(MetricTable).where(MetricTable.run_id == run["id"]))
    assert remaining == 0


def test_metric_time_is_optional(client, run):
    client.post(
        f"/runs/{run['id']}/metrics",
        json=[
            {"name": "success_rate", "step": 0, "value": 0.0, "time": 0.0},
            {"name": "success_rate", "step": 500, "value": 0.2, "time": 12.5},
            {"name": "success_rate", "step": 1000, "value": 0.4},  # ohne Zeit
        ],
    )

    res = client.get(f"/runs/{run['id']}/metrics")

    assert [m["time"] for m in res.json()] == [0.0, 12.5, None]


def test_max_points_thins_out_long_curves(client, run):
    curve = [{"name": "success_rate", "step": step, "value": step / 1000} for step in range(0, 1001)]
    curve += [{"name": "episode_reward", "step": step, "value": -step} for step in range(0, 51)]
    client.post(f"/runs/{run['id']}/metrics", json=curve)

    res = client.get(f"/runs/{run['id']}/metrics", params={"max_points": 100})

    by_name = {}
    for m in res.json():
        by_name.setdefault(m["name"], []).append(m["step"])
    success_steps = by_name["success_rate"]
    assert len(success_steps) <= 100
    assert success_steps[0] == 0 and success_steps[-1] == 1000  # Anfang und Ende bleiben immer erhalten
    assert success_steps == sorted(success_steps)
    # Kurze Kurven (51 Punkte) bleiben vollständig
    assert len(by_name["episode_reward"]) == 51


def test_max_points_must_be_at_least_two(client, run):
    assert client.get(f"/runs/{run['id']}/metrics", params={"max_points": 1}).status_code == 422


def test_list_metric_names(client, run):
    client.post(f"/runs/{run['id']}/metrics", json=CURVE)

    res = client.get(f"/runs/{run['id']}/metrics/names")

    assert res.status_code == 200
    assert res.json() == ["episode_reward", "success_rate"]
    assert client.get("/runs/999/metrics/names").status_code == 404
