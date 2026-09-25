# API reference

The complete, always up-to-date reference with every field is served by the backend itself at **http://127.0.0.1:8000/docs** (OpenAPI / Swagger UI). You can try out every request there directly in the browser.

All requests and responses use JSON. There is no authentication (ControlBench is a local tool).

## Endpoints

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/experiments` | Create an experiment | `201` |
| `GET` | `/experiments` | List all experiments | `200` |
| `GET` | `/experiments/{id}` | Get one experiment | `200` |
| `PATCH` | `/experiments/{id}` | Change name, environment, description or category; only fields that are sent are changed | `200` |
| `DELETE` | `/experiments/{id}` | Delete an experiment **including all its runs and metrics** | `204` |
| `POST` | `/runs` | Create a run | `201` |
| `GET` | `/runs` | List all runs; optional `?experiment_id=1` | `200` |
| `GET` | `/runs/{id}` | Get one run | `200` |
| `PATCH` | `/runs/{id}` | Set the final results of a run later (`reward`, `trains`, `stability_time`, `recovery_time`, `num_steps`, `duration`, `hyperparameters`); only fields that are sent are changed | `200` |
| `DELETE` | `/runs/{id}` | Delete a run **including its metrics** | `204` |
| `POST` | `/runs/{id}/metrics` | Store a **list** of metric points in one request | `201` |
| `GET` | `/runs/{id}/metrics` | Metric points of a run, sorted by name and step; optional `?name=success_rate` and `?max_points=1000` | `200` |
| `GET` | `/runs/{id}/metrics/names` | Names of the metrics this run has | `200` |
| `POST` | `/runs/{id}/evaluations` | Store final key figures (per scenario); an existing value is overwritten | `201` |
| `GET` | `/runs/{id}/evaluations` | Key figures of a run | `200` |
| `POST` | `/runs/{id}/traces` | Store points of a test episode (signals over simulated time); `?replace=true` replaces the signals that are sent | `201` |
| `GET` | `/runs/{id}/traces` | Points of the episode trace; optional `?signal=u_0` and `?max_points=1000` | `200` |
| `GET` | `/runs/{id}/traces/signals` | Names of the signals in the trace | `200` |
| `GET` | `/summaries` | Per run: key figures and when `success_rate` first reached the threshold; optional `?experiment_id=1`, `?threshold=0.9` | `200` |

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
{ "id": 1, "name": "Pendulum controller comparison", "environment": "Pendulum-v1", "description": "SAC, PPO and LQR with default parameters", "category": null }
```

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `environment` | string | yes |
| `description` | string | no |

**Category**

`category` (optional) says what kind of task an experiment is. It is free text; the dashboard suggests these keys and translates them:

| Key | Task |
|---|---|
| `stabilization` | keep a system in an (unstable) state, e.g. ball balancer, cart-pole |
| `swing-up` | bring a system into the target state first, then hold it, e.g. pendulum swing-up |
| `positioning` | reach a target point, e.g. reacher, robot arm |
| `tracking` | follow a moving target or a trajectory |
| `disturbance-rejection` | recover quickly from disturbances |
| `locomotion` | walking or running, e.g. ant, humanoid |

The **Categories** page compares controllers across all experiments of a category. Rewards cannot be compared between environments, so it uses the rank of each controller within each experiment, the success rate and the rank of the control effort.

```http
PATCH /experiments/1
Content-Type: application/json

{ "category": "stabilization" }
```

Send `"category": null` or `""` to remove the category. `name` and `environment` must not be empty (`422`).

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
| `hyperparameters` | object | no | settings of the configuration, free-form JSON, e.g. `{"learning_rate": 0.0003, "net_arch": [256, 256]}`. Shown in the dashboard when a configuration is expanded. |

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

## Evaluations (final key figures)

Metrics are **curves over training**. Evaluations are **single numbers that describe the finished controller**, e.g. its success rate, control effort or overshoot. Each value belongs to a **scenario**: `nominal` (the default) for unchanged conditions, any other name for a robustness test, e.g. `mass+20%` or `sensor_noise`.

**Store key figures**

```http
POST /runs/1/evaluations
Content-Type: application/json

[
  { "name": "success_rate",   "value": 0.96 },
  { "name": "control_effort", "value": 41.2 },
  { "name": "overshoot",      "value": 0.08 },
  { "scenario": "mass+20%", "name": "success_rate", "value": 0.71 }
]
```

```json
201 Created
{ "run_id": 1, "count": 4 }
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `scenario` | string | no | `nominal` (default) or the name of a robustness test |
| `name` | string | yes | name of the key figure |
| `value` | float | yes | the value; `NaN`/`Infinity` are rejected (`422`) |

There is exactly one value per run, scenario and name. Uploading the same one again **overwrites** it, so an evaluation can simply be repeated.

Names the dashboard knows:

| Name | Meaning |
|---|---|
| `success_rate` | share of successful evaluation episodes (0 to 1). Used as the final success rate of a run; without it, the last point of the `success_rate` curve is used. |
| `control_effort` | **control effort**: ∫‖u‖² dt over an episode, i.e. the squared actuator commands summed over all actuators and integrated over time, averaged over the evaluation episodes. Works for one actuator (pendulum) as well as for eight (walking robot). |

Any other name is allowed and appears in the expanded configuration in the dashboard.

**Summaries**

```http
GET /summaries?experiment_id=1&threshold=0.9
```

```json
[
  {
    "run_id": 12,
    "steps_to_threshold": 30000,
    "time_to_threshold": 412.5,
    "last_success_rate": 0.98,
    "evaluations": [{ "id": 1, "run_id": 12, "scenario": "nominal", "name": "control_effort", "value": 41.2 }],
    "trace_signals": ["ball_x", "u_0", "u_1"]
  }
]
```

`steps_to_threshold` and `time_to_threshold` are the step and wall-clock time at which the `success_rate` curve **first** reached the threshold (`null` = never). The database computes this from the metric points, so the dashboard does not have to load the curves.

## Episode traces

A trace records **one test episode** of the finished controller: states and actuator commands over the **simulated** time. The dashboard plots one signal at a time for the selected configurations, using the best seed that has a trace. This shows how calmly or nervously a controller acts, which a single number like the control effort cannot.

```http
POST /runs/1/traces
Content-Type: application/json

[
  { "signal": "ball_x", "t": 0.00, "value": 0.080 },
  { "signal": "u_0",    "t": 0.00, "value": 0.000 },
  { "signal": "ball_x", "t": 0.02, "value": 0.079 },
  { "signal": "u_0",    "t": 0.02, "value": -0.012 }
]
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `signal` | string | yes | name of the signal, e.g. `angle`, `ball_x`, `u_0` ... `u_7` for eight actuators |
| `t` | float | yes | seconds since the start of the episode (simulated time) |
| `value` | float | yes | value of the signal |

Upload long traces in batches of about 10,000 points. To replace a trace with a new episode, send `?replace=true`: all points of the signals in the request are deleted first.

