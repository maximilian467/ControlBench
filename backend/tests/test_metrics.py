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
