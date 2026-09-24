# Uploading results

The point of ControlBench: your training or control script sends its results to the API itself, so you never have to copy numbers by hand. The template for this is [`experiments/example_upload.py`](../experiments/example_upload.py).

## Try it with demo data

The template works immediately, without any real training. Its `fake_run()` function generates plausible **demo** learning curves for SAC, PPO and LQR. These are not real training results.

```bash
# from the repository root, with the backend running
python experiments/example_upload.py
```

```
Experiment #1 angelegt
SAC default, seed=0 läuft ...
  -> Run #1 gespeichert: reward=-144.8, 82 Messpunkte, Rechenzeit 0.634 s
  ...
LQR, seed=0 läuft ...
  -> Run #11 gespeichert: reward=-228.79, 82 Messpunkte, Rechenzeit 0.047 s
```

(The script's console output is currently in German.) Then open the experiment "Pendulum controller comparison" in the dashboard: SAC, PPO and LQR compared, with averaged learning curves.

## Connect your own training

**Step 1: Plan the experiment.** Decide beforehand what you want to compare:

| Question | Example |
|---|---|
| Which environment? | `Pendulum-v1` |
| Which configurations? | "SAC default", "PPO default", "LQR" |
| How many seeds per configuration? | RL: at least 3, better 5. A deterministic controller such as LQR: 1 |
| Which metrics over time? | e.g. `success_rate` and `episode_reward` |
| How often a data point? | see [Large trainings](#large-trainings-millions-of-steps) |

**Step 2: Copy the template** into your project, e.g. next to your training script.

**Step 3: Enter experiment and configurations** at the top of the file:

```python
EXPERIMENT = {
    "name": "Pendulum swing-up",
    "environment": "Pendulum-v1",
    "description": "SAC vs. PPO vs. LQR, default parameters",
}

CONFIGURATIONS = [
    {"name": "SAC default", "controller": "SAC", "seeds": [0, 1, 2, 3, 4]},
    {"name": "PPO default", "controller": "PPO", "seeds": [0, 1, 2, 3, 4]},
    {"name": "LQR", "controller": "LQR", "seeds": [0]},
]
```

`name` is the name of the configuration. **All seeds of a configuration get the same name**; that is how ControlBench averages over them. If you change hyperparameters, add a new configuration with a new name, e.g. `{"name": "SAC lr 1e-3", "controller": "SAC", ...}`.

**Step 4: Replace `fake_run`** with your real run. The function receives the configuration and the seed and returns two things:

- `results`: the **final results** of the run, one number per field. They end up in the `runs` table.
- `metrics`: the **curves**, any number of points. They end up in the `metrics` table.

The skeleton, independent of the library you train with:

```python
def my_run(configuration: dict, seed: int) -> tuple[dict, list[dict]]:
    # 1. Seed every source of randomness so the run is reproducible
    random.seed(seed)
    numpy.random.seed(seed)
    torch.manual_seed(seed)
    env.reset(seed=seed)

    # 2. Build the controller for this configuration
    agent = build_agent(configuration["controller"])  # your function

    # 3. Train and collect data points regularly
    metrics = []
    start = time.perf_counter()
    for step in range(TOTAL_STEPS):
        agent.train_step()  # your training step

        if step % LOG_EVERY == 0:
            elapsed = time.perf_counter() - start  # seconds since start: for the wall-clock axis
            metrics.append({"name": "success_rate", "step": step, "value": evaluate_success(agent), "time": elapsed})
            metrics.append({"name": "episode_reward", "step": step, "value": last_episode_reward, "time": elapsed})

    # 4. Final results
    results = {
        "reward": final_reward,            # required: higher = better
        "stability_time": 2.4,             # seconds until stable, or None if never stable
        "recovery_time": None,             # seconds until recovery after a disturbance, or None
        "num_steps": TOTAL_STEPS,
        "duration": time.perf_counter() - start,  # wall-clock time in seconds
    }
    return results, metrics
```

Then replace the call `fake_run(configuration, seed)` in `main()` with `my_run(configuration, seed)`. The template handles everything else: finding or creating the experiment, the local backup, uploading the run and its metrics in batches.

Keep in mind:

- **You define `success_rate` yourself.** For the pendulum, e.g. the share of evaluation episodes in which the angle stays below 0.1 rad for more than 1 s at the end. What matters is that all configurations use the same definition.
- **`time` is the time since the start of the run**, measured with `time.perf_counter()`. Without `time`, a point only appears in the chart over steps.
- **`null` / `None` means "not reached" or "not measured".** Never use `0` or `-1` as a placeholder; it distorts the means.

<details>
<summary><b>Example: Stable-Baselines3 callback</b> (sketch, adapt to your setup)</summary>

With [Stable-Baselines3](https://stable-baselines3.readthedocs.io/) a callback collects data points during `model.learn()`. `ep_info_buffer` holds the most recent episodes; SB3 fills it when the environment is wrapped in a `Monitor`, which happens by default when you pass an environment to the algorithm. Stable-Baselines3 is not a dependency of ControlBench.

```python
import time

import numpy as np
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.callbacks import BaseCallback


class ControlBenchCallback(BaseCallback):
    """Every log_every steps, records the mean episode reward of the most recent episodes."""

    def __init__(self, log_every: int):
        super().__init__()
        self.log_every = log_every
        self.metrics: list[dict] = []
        self.start = time.perf_counter()
        self.last_logged = -log_every

    def _on_step(self) -> bool:
        # num_timesteps counts across all parallel environments, so compare distances instead of using modulo
        if self.num_timesteps - self.last_logged >= self.log_every and len(self.model.ep_info_buffer) > 0:
            rewards = [episode["r"] for episode in self.model.ep_info_buffer]
            self.metrics.append({
                "name": "episode_reward",
                "step": self.num_timesteps,
                "value": float(np.mean(rewards)),
                "time": time.perf_counter() - self.start,
            })
            self.last_logged = self.num_timesteps
        return True  # False would stop the training


def my_run(configuration: dict, seed: int) -> tuple[dict, list[dict]]:
    algorithm = {"SAC": SAC, "PPO": PPO}[configuration["controller"]]
    model = algorithm("MlpPolicy", "Pendulum-v1", seed=seed)
    callback = ControlBenchCallback(log_every=LOG_EVERY)

    start = time.perf_counter()
    model.learn(total_timesteps=TOTAL_STEPS, callback=callback)

    results = {
        "reward": callback.metrics[-1]["value"],
        "num_steps": TOTAL_STEPS,
        "duration": time.perf_counter() - start,
    }
    return results, callback.metrics
```

</details>

**Step 5: Run and check.** Start the backend, then your script. Open the experiment in the dashboard and check:

- Are all configurations listed in the comparison table, each with the expected number of seeds?
- Do the curves appear over steps **and** over wall-clock time?

## Template settings

| Variable | Default | Effect |
|---|---|---|
| `API_URL` | `http://127.0.0.1:8000` | address of the backend |
| `EXPERIMENT` | name, environment, description | the experiment the runs belong to |
| `CONFIGURATIONS` | SAC and PPO with 5 seeds each, LQR with one | the compared configurations, each with `name`, `controller` and `seeds` |
| `REUSE_EXPERIMENT` | `True` | If an experiment with the **same name and environment** already exists, the runs are appended to it. This lets you add seeds or configurations later. With `False`, every start creates a new experiment. |
| `SAVE_LOCAL_BACKUP` | `True` | Every run is saved as JSON in `experiments/results/` **before** it is uploaded. |
| `TOTAL_STEPS` | `20_000` | length of a run |
| `LOG_EVERY` | `500` | distance between data points in steps |
| `METRICS_BATCH_SIZE` | `10_000` | metric points per request when uploading |

## Behavior on errors

- **Backend not reachable at start:** the script stops immediately, *before* spending compute. Without an experiment, results could not be assigned.
- **Upload fails in the middle:** the script reports the error and names the backup file. The remaining runs continue, and nothing is lost.

## Large trainings (millions of steps)

RL trainings with 20, 100 or 200 million steps are normal. PPO typically takes many more steps than SAC but needs less compute per step. That is why comparing **over wall-clock time** is useful: it shows which approach is better for the same compute budget.

**How many data points?** Do not log every step. A chart is about 1,000 pixels wide; you cannot see more points than that. Rule of thumb: **at most about 100,000 data points per run and metric**.

| Steps per run | `LOG_EVERY` | Points per metric |
|---|---|---|
| 1 M | 1,000 | 1,000 |
| 20 M | 1,000 | 20,000 |
| 200 M | 2,000 to 10,000 | 20,000 to 100,000 |

**What ControlBench handles**, measured on a regular laptop:

| Scenario | Result |
|---|---|
| Upload one run with 200 M steps, logged every 1,000 steps, 2 metrics = 400,000 points | 13 s, in batches of 10,000 |
| Database with 22 such runs = **4.6 M** metric points | 329 MB, querying one run via the index 0.12 s |
| Open the detail page with these 22 runs until the chart is drawn | about 1.3 s |

Two things make this possible:

- The dashboard only loads the metric that is shown, and the server **downsamples it to at most 1,000 points** per run (`max_points`). Instead of 17.9 MB, 89 kB are transferred. The first and last points are always kept.
- The template uploads metric points **in batches** (`METRICS_BATCH_SIZE`), so no single request runs into a timeout.

**One limitation:** the template uploads a run only **after** it has finished. For a training that runs for days, a crash means the run is neither in ControlBench nor in the local backup. Save your own checkpoints for such long trainings.

## Live upload during training

The template does not do this yet, but the API supports it. To see data points **while** training:

1. Create the run early, e.g. after the first evaluation with its reward (`reward` is required).
2. After each evaluation, send the new points to `POST /runs/{id}/metrics`.
3. At the end, set the final results with `PATCH /runs/{id}`.

A minimal sketch (not part of the repository; `evaluate()` stands for your own code):

```python
import requests

API = "http://127.0.0.1:8000"

first_reward, points = evaluate()  # your first evaluation
run = requests.post(f"{API}/runs", json={
    "experiment_id": experiment_id, "controller": "SAC", "name": "SAC default",
    "seed": seed, "reward": first_reward,
}).json()

for _ in range(num_evaluations):
    ...  # train
    reward, points = evaluate()
    requests.post(f"{API}/runs/{run['id']}/metrics", json=points)

requests.patch(f"{API}/runs/{run['id']}", json={
    "reward": reward, "num_steps": total_steps, "duration": elapsed,
})
```

## Without the template

The API is not tied to Python. Any tool that can send JSON over HTTP works. Three requests are enough:

```python
import requests

API = "http://127.0.0.1:8000"

exp = requests.post(f"{API}/experiments", json={
    "name": "Pendulum swing-up", "environment": "Pendulum-v1",
}).json()

run = requests.post(f"{API}/runs", json={
    "experiment_id": exp["id"], "controller": "LQR", "name": "LQR Q=diag(10,1)",
    "seed": 0, "reward": -120.4, "num_steps": 200,
}).json()

requests.post(f"{API}/runs/{run['id']}/metrics", json=[
    {"name": "angle", "step": 0, "value": 3.14, "time": 0.0},
    {"name": "angle", "step": 1, "value": 3.02, "time": 0.001},
])
```

The same with `curl`:

```bash
curl -X POST http://127.0.0.1:8000/experiments \
  -H "Content-Type: application/json" \
  -d '{"name": "Pendulum swing-up", "environment": "Pendulum-v1"}'
```

See the [API reference](api.md) for all endpoints and fields.

## Conventions for comparable data

To keep runs of different approaches comparable:

- **`duration` is wall-clock time** in seconds, *not* simulated time. Simulated time follows from `num_steps` × the environment's time step.
- **`null` means "not reached" or "not measured"**, never `0` or `-1`. A run that never stabilizes has `stability_time: null`. Made-up placeholder numbers would distort the means.
- **Every run has a seed.** Also set it in your script for every source of randomness (Python, NumPy, PyTorch, environment) so runs are reproducible.
- **Several seeds per RL configuration**, at least 3, better 5 or more. Only then are mean and spread meaningful.
- **Same configuration, same name.** All seeds of "SAC default" are named exactly that. If you change hyperparameters, the configuration gets a new name, e.g. "SAC lr 1e-3".
- **Same metric, same name.** Use the same metric names across all experiments, e.g. always `success_rate`, not sometimes `success` and sometimes `successRate`; otherwise curves cannot be compared.
