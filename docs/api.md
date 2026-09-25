# API reference

The complete, always up-to-date reference with every field is served by the backend itself at **http://127.0.0.1:8000/docs** (OpenAPI / Swagger UI). You can try out every request there directly in the browser.

All requests and responses use JSON. There is no authentication (ControlBench is a local tool).

## Endpoints

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/experiments` | Create an experiment | `201` |
| `GET` | `/experiments` | List all experiments | `200` |
| `GET` | `/experiments/{id}` | Get one experiment | `200` |
| `DELETE` | `/experiments/{id}` | Delete an experiment **including all its runs and metrics** | `204` |
| `POST` | `/runs` | Create a run | `201` |
| `GET` | `/runs` | List all runs; optional `?experiment_id=1` | `200` |
| `GET` | `/runs/{id}` | Get one run | `200` |
| `PATCH` | `/runs/{id}` | Set the final results of a run later (`reward`, `trains`, `stability_time`, `recovery_time`, `num_steps`, `duration`); only fields that are sent are changed | `200` |
| `DELETE` | `/runs/{id}` | Delete a run **including its metrics** | `204` |
| `POST` | `/runs/{id}/metrics` | Store a **list** of metric points in one request | `201` |
| `GET` | `/runs/{id}/metrics` | Metric points of a run, sorted by name and step; optional `?name=success_rate` and `?max_points=1000` | `200` |
| `GET` | `/runs/{id}/metrics/names` | Names of the metrics this run has | `200` |

## Errors

| Code | Meaning |
|---|---|
| `404` | The ID does not exist, or a run refers to an unknown experiment. |
| `422` | The data is invalid: a required field is missing or has the wrong type, e.g. `"seed": "abc"`, or a number is `NaN`/`Infinity`. The response names the affected field. |

Errors are returned in FastAPI's format: `{"detail": ...}`.

## Experiments

**Create an experiment**

```http
POST /experiments
Content-Type: application/json

{
  "name": "Pendulum controller comparison",
  "environment": "Pendulum-v1",
  "description": "SAC, PPO and LQR with default parameters"
}
```

```json
201 Created
{ "id": 1, "name": "Pendulum controller comparison", "environment": "Pendulum-v1", "description": "SAC, PPO and LQR with default parameters" }
```

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `environment` | string | yes |
| `description` | string | no |

## Runs

**Create a run**

```http
POST /runs
Content-Type: application/json

{ "experiment_id": 1, "controller": "SAC", "name": "SAC default", "seed": 42, "reward": -150.3, "stability_time": 2.4, "num_steps": 20000, "duration": 312.5 }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `experiment_id` | int | yes | experiment the run belongs to |
| `controller` | string | yes | algorithm or controller, e.g. `SAC`, `PPO`, `LQR` |
| `name` | string | yes | name of the configuration. **All seeds of a configuration use the same name**, different settings use a different name. |
| `trains` | bool | no | `false` for controllers without training (LQR, PID, MPC, ...). The dashboard draws them as a dashed horizontal reference line instead of a learning curve. Default `true`; can be corrected with `PATCH`. |
| `seed` | int | yes | seed of the run |
| `reward` | float | yes | final result of the run (higher is better) |
| `stability_time` | float | no | seconds until the system is stable; `null` = never stable |
| `recovery_time` | float | no | seconds until recovery after a disturbance; `null` = no recovery / not measured |
| `num_steps` | int | no | number of steps |
| `duration` | float | no | **wall-clock time** in seconds |

**Set final results later** (for live uploads: create the run early, update it at the end)

```http
PATCH /runs/1
Content-Type: application/json

{ "reward": -120.4, "stability_time": 0.8, "num_steps": 150000, "duration": 1320.5 }
```

Fields that are not sent stay unchanged. Optional fields can be reset with `null`; `reward` and `trains` must not be `null` (`422`).

## Metrics

**Store metric points**

```http
POST /runs/1/metrics
Content-Type: application/json

[
  { "name": "success_rate", "step": 0,    "value": 0.0,  "time": 0.0 },
  { "name": "success_rate", "step": 1000, "value": 0.41, "time": 31.8 },
  { "name": "episode_reward", "step": 0,  "value": -1200.5 }
]
```

```json
201 Created
{ "run_id": 1, "count": 3 }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | name of the metric, e.g. `success_rate` |
| `step` | int | yes | training or simulation step |
| `value` | float | yes | measured value |
| `time` | float | no | **seconds since the start of the run** (wall-clock). Only points with `time` appear in the chart over wall-clock time. |

Send metric points **batched** as a list, not one by one; for large amounts in batches of about 10,000. 1,000 points in one request are many times faster than 1,000 single requests. If the list contains one invalid point, **nothing** is stored (`422`).

**Read metric points, downsampled**

```http
GET /runs/1/metrics?name=success_rate&max_points=1000
```

With `max_points` (at least 2) the server returns at most that many points per metric, evenly spread over the curve. The first and the last point are always included. Without `max_points` all points are returned, which can be hundreds of thousands for long trainings.

**List metric names**

```http
GET /runs/1/metrics/names
```

```json
["episode_reward", "success_rate"]
```
