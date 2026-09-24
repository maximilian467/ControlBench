import pytest


def test_create_run(client, experiment):
    data = {
        "experiment_id": experiment["id"],
        "controller": "SAC",
        "name": "SAC lr 3e-4",
        "seed": 42,
        "reward": -150.3,
        "stability_time": 2.4,
        "num_steps": 200,
        "duration": 10.5,
    }
    res = client.post("/runs", json=data)

    assert res.status_code == 201
    body = res.json()
    assert body["id"] == 1
    assert body["controller"] == "SAC"
    assert body["name"] == "SAC lr 3e-4"
    assert body["seed"] == 42
    assert body["stability_time"] == 2.4
    # Nicht mitgeschickte optionale Felder werden zu None (JSON: null)
    assert body["recovery_time"] is None


def test_create_run_for_unknown_experiment_returns_404(client):
    res = client.post("/runs", json={"experiment_id": 999, "controller": "SAC", "name": "SAC default", "seed": 1, "reward": 0})

    assert res.status_code == 404


def test_create_run_with_invalid_seed_returns_422(client, experiment):
    res = client.post("/runs", json={"experiment_id": experiment["id"], "controller": "SAC", "name": "SAC default", "seed": "abc", "reward": 0})

    assert res.status_code == 422


def test_list_runs_can_be_filtered_by_experiment(client):
    exp_a = client.post("/experiments", json={"name": "A", "environment": "Pendulum-v1"}).json()
    exp_b = client.post("/experiments", json={"name": "B", "environment": "Pendulum-v1"}).json()
    client.post("/runs", json={"experiment_id": exp_a["id"], "controller": "SAC", "name": "SAC default", "seed": 1, "reward": -100})
    client.post("/runs", json={"experiment_id": exp_a["id"], "controller": "SAC", "name": "SAC default", "seed": 2, "reward": -110})
    client.post("/runs", json={"experiment_id": exp_b["id"], "controller": "SAC", "name": "SAC default", "seed": 1, "reward": -90})

    all_runs = client.get("/runs").json()
    runs_of_a = client.get("/runs", params={"experiment_id": exp_a["id"]}).json()

    assert len(all_runs) == 3
    assert [r["seed"] for r in runs_of_a] == [1, 2]
    assert all(r["experiment_id"] == exp_a["id"] for r in runs_of_a)


def test_get_run_by_id(client, run):
    res = client.get(f"/runs/{run['id']}")

    assert res.status_code == 200
    assert res.json() == run


def test_get_unknown_run_returns_404(client):
    assert client.get("/runs/999").status_code == 404


def test_delete_run(client, run):
    res = client.delete(f"/runs/{run['id']}")

    assert res.status_code == 204
    assert res.content == b""  # 204 = kein Inhalt
    assert client.get(f"/runs/{run['id']}").status_code == 404


def test_delete_unknown_run_returns_404(client):
    assert client.delete("/runs/999").status_code == 404


def test_create_run_without_controller_or_name_returns_422(client, experiment):
    base = {"experiment_id": experiment["id"], "seed": 1, "reward": 0}

    assert client.post("/runs", json={**base, "name": "SAC default"}).status_code == 422
    assert client.post("/runs", json={**base, "controller": "SAC"}).status_code == 422


def test_update_run_changes_only_sent_fields(client, run):
    res = client.patch(f"/runs/{run['id']}", json={"reward": -99.5, "stability_time": 1.2, "num_steps": 5000})

    assert res.status_code == 200
    body = res.json()
    assert body["reward"] == -99.5
    assert body["stability_time"] == 1.2
    assert body["num_steps"] == 5000
    # Nicht mitgeschickte Felder bleiben unverändert
    assert body["name"] == run["name"]
    assert body["seed"] == run["seed"]
    assert client.get(f"/runs/{run['id']}").json() == body


def test_update_run_can_reset_optional_field_to_null(client, run):
    client.patch(f"/runs/{run['id']}", json={"stability_time": 2.0})
    res = client.patch(f"/runs/{run['id']}", json={"stability_time": None})

    assert res.status_code == 200
    assert res.json()["stability_time"] is None


def test_update_run_with_null_reward_returns_422(client, run):
    assert client.patch(f"/runs/{run['id']}", json={"reward": None}).status_code == 422


def test_update_unknown_run_returns_404(client):
    assert client.patch("/runs/999", json={"reward": 1.0}).status_code == 404


@pytest.mark.parametrize("field", ["reward", "stability_time", "duration"])
def test_run_with_non_finite_value_returns_422(client, experiment, run, field):
    base = '"experiment_id": %d, "controller": "SAC", "name": "SAC default", "seed": 0' % experiment["id"]
    create = f'{{{base}, "reward": 1.0, "{field}": NaN}}'
    headers = {"Content-Type": "application/json"}

    assert client.post("/runs", content=create, headers=headers).status_code == 422
    assert client.patch(f"/runs/{run['id']}", content=f'{{"{field}": Infinity}}', headers=headers).status_code == 422
