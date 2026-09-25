def test_save_and_read_trace(client, run):
    points = [{"signal": "angle", "t": i * 0.02, "value": 1.0 - i * 0.01} for i in range(100)]
    points += [{"signal": "u_0", "t": i * 0.02, "value": 0.5} for i in range(100)]

    res = client.post(f"/runs/{run['id']}/traces", json=points)

    assert res.status_code == 201
    assert res.json() == {"run_id": run["id"], "count": 200}
    assert client.get(f"/runs/{run['id']}/traces/signals").json() == ["angle", "u_0"]
    angle = client.get(f"/runs/{run['id']}/traces", params={"signal": "angle"}).json()
    assert len(angle) == 100
    assert [p["t"] for p in angle] == sorted(p["t"] for p in angle)


def test_trace_can_be_thinned_out(client, run):
    client.post(f"/runs/{run['id']}/traces", json=[{"signal": "angle", "t": i / 100, "value": i} for i in range(1001)])

    thinned = client.get(f"/runs/{run['id']}/traces", params={"signal": "angle", "max_points": 50}).json()

    assert len(thinned) <= 50
    assert thinned[0]["t"] == 0 and thinned[-1]["t"] == 10.0


def test_replace_overwrites_the_signals_that_are_sent(client, run):
    client.post(f"/runs/{run['id']}/traces", json=[{"signal": "angle", "t": 0, "value": 1}, {"signal": "u_0", "t": 0, "value": 2}])
    client.post(f"/runs/{run['id']}/traces", params={"replace": True}, json=[{"signal": "angle", "t": 0, "value": 9}])

    trace = client.get(f"/runs/{run['id']}/traces").json()

    assert [(p["signal"], p["value"]) for p in trace] == [("angle", 9), ("u_0", 2)]


def test_summary_lists_trace_signals(client, experiment, run):
    client.post(f"/runs/{run['id']}/traces", json=[{"signal": "u_1", "t": 0, "value": 0}, {"signal": "u_0", "t": 0, "value": 0}])

    summary = client.get("/summaries", params={"experiment_id": experiment["id"]}).json()[0]

    assert summary["trace_signals"] == ["u_0", "u_1"]


def test_trace_of_unknown_run_returns_404(client):
    assert client.post("/runs/999/traces", json=[]).status_code == 404
    assert client.get("/runs/999/traces").status_code == 404
