def test_create_experiment(client):
    data = {
        "name": "Pendulum LQR",
        "environment": "Pendulum-v1",
        "controller": "LQR",
        "description": "Linearisiert um die obere Ruhelage",
    }
    res = client.post("/experiments", json=data)

    assert res.status_code == 201
    body = res.json()
    assert body["id"] == 1
    assert body["name"] == "Pendulum LQR"
    assert body["description"] == "Linearisiert um die obere Ruhelage"


def test_description_is_optional(client):
    res = client.post("/experiments", json={"name": "A", "environment": "Pendulum-v1", "controller": "SAC"})

    assert res.status_code == 201
    assert res.json()["description"] is None


def test_create_experiment_without_required_field_returns_422(client):
    res = client.post("/experiments", json={"name": "A", "environment": "Pendulum-v1"})

    assert res.status_code == 422


def test_list_experiments_is_empty_at_start(client):
    res = client.get("/experiments")

    assert res.status_code == 200
    assert res.json() == []


def test_list_experiments_returns_created_experiments(client):
    client.post("/experiments", json={"name": "A", "environment": "Pendulum-v1", "controller": "SAC"})
    client.post("/experiments", json={"name": "B", "environment": "DoublePendulum", "controller": "LQR"})

    res = client.get("/experiments")

    assert [exp["name"] for exp in res.json()] == ["A", "B"]


def test_get_experiment_by_id(client, experiment):
    res = client.get(f"/experiments/{experiment['id']}")

    assert res.status_code == 200
    assert res.json() == experiment


def test_get_unknown_experiment_returns_404(client):
    res = client.get("/experiments/999")

    assert res.status_code == 404
