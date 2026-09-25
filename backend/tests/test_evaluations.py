import pytest


def test_hyperparameters_are_stored_as_json(client, experiment):
    hyperparameters = {"learning_rate": 0.0003, "net_arch": [256, 256], "policy": "MlpPolicy"}
    run = client.post(
        "/runs",
        json={"experiment_id": experiment["id"], "controller": "SAC", "name": "SAC default", "seed": 0,
              "reward": -100, "hyperparameters": hyperparameters},
    ).json()

    assert client.get(f"/runs/{run['id']}").json()["hyperparameters"] == hyperparameters
    assert client.patch(f"/runs/{run['id']}", json={"hyperparameters": {"gamma": 0.98}}).json()["hyperparameters"] == {"gamma": 0.98}


def test_save_and_list_evaluations(client, run):
    res = client.post(
        f"/runs/{run['id']}/evaluations",
        json=[
            {"name": "success_rate", "value": 0.96},
            {"name": "control_effort", "value": 41.2},
            {"scenario": "mass+20%", "name": "success_rate", "value": 0.71},
        ],
    )

    assert res.status_code == 201
    assert res.json() == {"run_id": run["id"], "count": 3}
    evaluations = client.get(f"/runs/{run['id']}/evaluations").json()
    assert [(e["scenario"], e["name"], e["value"]) for e in evaluations] == [
        ("mass+20%", "success_rate", 0.71),
        ("nominal", "control_effort", 41.2),
        ("nominal", "success_rate", 0.96),
    ]


def test_saving_an_evaluation_again_overwrites_it(client, run):
    client.post(f"/runs/{run['id']}/evaluations", json=[{"name": "success_rate", "value": 0.5}])
    client.post(f"/runs/{run['id']}/evaluations", json=[{"name": "success_rate", "value": 0.9}])

    assert [e["value"] for e in client.get(f"/runs/{run['id']}/evaluations").json()] == [0.9]


@pytest.mark.parametrize("body", [[{"name": "", "value": 1.0}], [{"scenario": "", "name": "x", "value": 1.0}]])
def test_evaluation_needs_name_and_scenario(client, run, body):
    assert client.post(f"/runs/{run['id']}/evaluations", json=body).status_code == 422


def test_evaluations_of_unknown_run_return_404(client):
    assert client.post("/runs/999/evaluations", json=[]).status_code == 404
    assert client.get("/runs/999/evaluations").status_code == 404


def test_summary_finds_first_step_above_threshold(client, experiment, run):
    curve = [(0, 0.0, 0.0), (1000, 0.5, 10.0), (2000, 0.92, 20.0), (3000, 0.85, 30.0), (4000, 0.97, 40.0)]
    client.post(
        f"/runs/{run['id']}/metrics",
        json=[{"name": "success_rate", "step": s, "value": v, "time": t} for s, v, t in curve],
    )
    client.post(f"/runs/{run['id']}/evaluations", json=[{"name": "control_effort", "value": 12.5}])

    summary = client.get("/summaries", params={"experiment_id": experiment["id"]}).json()[0]

    assert summary["run_id"] == run["id"]
    assert summary["steps_to_threshold"] == 2000  # erstes Erreichen von 90 %, nicht der Endwert
    assert summary["time_to_threshold"] == 20.0
    assert summary["last_success_rate"] == 0.97
    assert [(e["name"], e["value"]) for e in summary["evaluations"]] == [("control_effort", 12.5)]
    # Mit strengerer Schwelle später
    strict = client.get("/summaries", params={"experiment_id": experiment["id"], "threshold": 0.95}).json()[0]
    assert strict["steps_to_threshold"] == 4000


def test_summary_without_success_curve(client, experiment, run):
    summary = client.get("/summaries", params={"experiment_id": experiment["id"]}).json()[0]

    assert summary["steps_to_threshold"] is None
    assert summary["last_success_rate"] is None


def test_deleting_run_or_experiment_deletes_evaluations(client, engine, experiment, run):
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session

    from database.tables import EvaluationTable

    client.post(f"/runs/{run['id']}/evaluations", json=[{"name": "success_rate", "value": 0.9}])
    client.delete(f"/experiments/{experiment['id']}")

    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(EvaluationTable)) == 0
