from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.tables import MetricTable


def test_create_experiment(client):
    data = {
        "name": "Pendulum LQR",
        "environment": "Pendulum-v1",
        "description": "Linearisiert um die obere Ruhelage",
    }
    res = client.post("/experiments", json=data)

    assert res.status_code == 201
    body = res.json()
    assert body["id"] == 1
    assert body["name"] == "Pendulum LQR"
    assert body["description"] == "Linearisiert um die obere Ruhelage"


def test_description_is_optional(client):
    res = client.post("/experiments", json={"name": "A", "environment": "Pendulum-v1"})

    assert res.status_code == 201
    assert res.json()["description"] is None


def test_create_experiment_without_required_field_returns_422(client):
    res = client.post("/experiments", json={"name": "A"})

    assert res.status_code == 422


def test_list_experiments_is_empty_at_start(client):
    res = client.get("/experiments")

    assert res.status_code == 200
    assert res.json() == []


def test_list_experiments_returns_created_experiments(client):
    client.post("/experiments", json={"name": "A", "environment": "Pendulum-v1"})
    client.post("/experiments", json={"name": "B", "environment": "DoublePendulum"})

    res = client.get("/experiments")

    assert [exp["name"] for exp in res.json()] == ["A", "B"]


def test_get_experiment_by_id(client, experiment):
    res = client.get(f"/experiments/{experiment['id']}")

    assert res.status_code == 200
    assert res.json() == experiment


def test_get_unknown_experiment_returns_404(client):
    res = client.get("/experiments/999")

    assert res.status_code == 404


def test_delete_experiment(client, experiment):
    res = client.delete(f"/experiments/{experiment['id']}")

    assert res.status_code == 204
    assert client.get(f"/experiments/{experiment['id']}").status_code == 404


def test_delete_experiment_deletes_its_runs_and_metrics(client, engine, experiment):
    other = client.post("/experiments", json={"name": "B", "environment": "Pendulum-v1"}).json()
    run = client.post("/runs", json={"experiment_id": experiment["id"], "controller": "SAC", "name": "SAC default", "seed": 1, "reward": -100}).json()
    other_run = client.post("/runs", json={"experiment_id": other["id"], "controller": "SAC", "name": "SAC default", "seed": 1, "reward": -90}).json()
    client.post(f"/runs/{run['id']}/metrics", json=[{"name": "success_rate", "step": 0, "value": 0.0}])

    client.delete(f"/experiments/{experiment['id']}")

    assert client.get(f"/runs/{run['id']}").status_code == 404
    # Runs anderer Experimente bleiben unberührt
    assert client.get(f"/runs/{other_run['id']}").status_code == 200
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(MetricTable)) == 0


def test_delete_unknown_experiment_returns_404(client):
    assert client.delete("/experiments/999").status_code == 404
