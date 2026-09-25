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
| Which metrics over time? | e.g. `success_rate`, `episode_reward`, `control_effort` |
| What counts as success? | one yes/no question per test episode, see step 4 |
| Which robustness tests? | e.g. heavier mass, sensor noise, pushes, other terrain |
| How often a data point? | see [Large trainings](#large-trainings-millions-of-steps) |

**Step 2: Copy the template** into your project, e.g. next to your training script.

**Step 3: Enter experiment, configurations and scenarios** at the top of the file:

```python
EXPERIMENT = {
    "name": "Pendulum swing-up",
    "environment": "Pendulum-v1",
    "description": "SAC vs. PPO vs. LQR, default parameters",
    "category": "swing-up",  # kind of task, see below
}

CONFIGURATIONS = [
    {"name": "SAC default", "controller": "SAC", "seeds": [0, 1, 2, 3, 4],
     "hyperparameters": {"learning_rate": 3e-4, "gamma": 0.99}},
    {"name": "PPO default", "controller": "PPO", "seeds": [0, 1, 2, 3, 4],
     "hyperparameters": {"learning_rate": 3e-4, "n_steps": 2048}},
    {"name": "LQR", "controller": "LQR", "seeds": [0], "trains": False,
     "hyperparameters": {"Q": "diag(10, 1)", "R": 0.1}},
]

# Robustness tests: every finished controller is also evaluated under changed conditions
SCENARIOS = {"nominal": ..., "mass+20%": ..., "sensor_noise": ...}
```

- `name` is the name of the configuration. **All seeds of a configuration get the same name**; that is how ControlBench averages over them. If you change hyperparameters, add a new configuration with a new name, e.g. `"SAC lr 1e-3"`.
- `trains: False` marks controllers without training (LQR, PID, MPC, ...). The dashboard draws them as a dashed **reference line** instead of a learning curve.
- `hyperparameters` is free-form; the dashboard shows it when a configuration is expanded.
- `category` says what kind of task the experiment is. Suggested keys: `stabilization`, `swing-up`, `positioning`, `tracking`, `disturbance-rejection`, `locomotion`. Custom categories are allowed. The **Categories** page compares controllers across all experiments of a category.
- `SCENARIOS` are the robustness tests. `nominal` means unchanged conditions; every other name becomes a column in the robustness table. Different terrains for a walking robot are scenarios too (`flat`, `stairs`, `rough`).

**Step 4: Define success.** The success rate is the **share of successful test episodes**. It is therefore always between 0 and 1 and comparable across all tasks, from a pendulum to a walking robot; no normalization is needed. The only task-specific part is one question per episode: success or not? That is `is_success`, built from small building blocks in the template:

| Building block | Success if ... |
|---|---|
| `holds_within(signal, tolerance, hold_time, until_end=False)` | the absolute value of the signal stays within the tolerance for at least `hold_time` seconds in a row (with `until_end=True`: at the end of the episode) |
| `stays_between(signal, low, high)` | the signal never leaves the range, e.g. "never fell over" |
| `final_at_least(signal, minimum)` | the signal is at least `minimum` at the end, e.g. distance walked |
| `all_of(*conditions)` | all conditions hold |

```python
# Pendulum: angle within 0.1 rad for 1 s
is_success = holds_within("angle", tolerance=0.1, hold_time=1.0)

# Ball balancer: ball within 2 cm of the target for 0.5 s, never dropped
is_success = all_of(holds_within("ball_error", 0.02, 0.5), stays_between("ball_height", 0.0, math.inf))

# Reacher: at the target at the end, for at least 0.2 s
is_success = holds_within("distance_to_target", 0.01, 0.2, until_end=True)

# Ant / humanoid: at least 5 m forward without falling
is_success = all_of(final_at_least("x_position", 5.0), stays_between("torso_height", 0.25, math.inf))
```

An episode is a dictionary `{"dt": 0.02, "signals": {"angle": [...], ...}, "actions": [[u0, u1, ...], ...]}` with one entry per time step. If none of the building blocks fits, write `is_success` yourself: any function `episode -> bool`.

**Step 5: Replace `fake_run`** with your real run. It receives the configuration and the seed and returns a dictionary with four parts:

| Part | What | Table |
|---|---|---|
| `results` | final results, one number per field | `runs` |
| `metrics` | curves over training, e.g. `success_rate` over the steps | `metrics` |
| `evaluations` | key figures of the finished controller per scenario, e.g. `success_rate`, `control_effort` | `evaluations` |
| `trace` | one test episode: signals and actuator commands over simulated time | `traces` |

The skeleton, independent of the library you train with:

```python
def my_run(configuration: dict, seed: int) -> dict:
    # 1. Seed every source of randomness so the run is reproducible
    random.seed(seed)
    numpy.random.seed(seed)
    torch.manual_seed(seed)

    # 2. Build the controller for this configuration
    agent = build_agent(configuration)  # your function

    # 3. Train and collect data points regularly (controllers without training skip this)
    metrics = []
    start = time.perf_counter()
    for step in range(TOTAL_STEPS):
        agent.train_step()  # your training step
        if step % LOG_EVERY == 0:
            episodes = [run_test_episode(agent, env) for _ in range(5)]  # your function, returns an episode dict
            elapsed = time.perf_counter() - start  # seconds since start: for the wall-clock axis
            metrics.append({"name": "success_rate", "step": step, "value": success_rate(episodes, is_success), "time": elapsed})
            metrics.append({"name": "control_effort", "step": step, "value": numpy.mean([control_effort(e) for e in episodes]), "time": elapsed})

    # 4. Evaluate the finished controller in every scenario
    evaluations = []
    for scenario in SCENARIOS:
        episodes = [run_test_episode(agent, make_env(scenario)) for _ in range(EVAL_EPISODES)]
        evaluations.append({"scenario": scenario, "name": "success_rate", "value": success_rate(episodes, is_success)})
        evaluations.append({"scenario": scenario, "name": "control_effort", "value": numpy.mean([control_effort(e) for e in episodes])})

    # 5. Final results and one nominal test episode as trace
    results = {
        "reward": final_reward,                     # required: higher = better
        "stability_time": 2.4,                      # seconds until stable, or None if never stable
        "num_steps": TOTAL_STEPS,
        "duration": time.perf_counter() - start,    # wall-clock time in seconds
    }
    trace = episode_to_trace(run_test_episode(agent, make_env("nominal")))
    return {"results": results, "metrics": metrics, "evaluations": evaluations, "trace": trace}
```

Then replace the call `fake_run(configuration, seed)` in `main()` with `my_run(configuration, seed)`. The template handles everything else: finding or creating the experiment, the local backup, uploading run, metrics, evaluations and trace in batches.

Keep in mind:

- **`control_effort(episode)`** computes ∫‖u‖² dt: the squared actuator commands, summed over all actuators and integrated over time. It works for one actuator (pendulum) as well as for eight (ant). Lower means the controller reaches its goal with less force or energy.
- **`episode_to_trace(episode)`** turns an episode into the trace format: all signals plus the actuator commands as `u_0`, `u_1`, ...
- **`time` is the time since the start of the run**, measured with `time.perf_counter()`. Without `time`, a point only appears in the chart over steps.
- **`null` / `None` means "not reached" or "not measured".** Never use `0` or `-1` as a placeholder; it distorts the means.
- **Standard metric names** (`STANDARD_METRICS` in the template) appear at the top of the metric picker in the dashboard: `success_rate`, `episode_reward`, `control_effort`, `episode_length`, `tracking_error`. Any other name is allowed and can be found with the search.

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


def my_run(configuration: dict, seed: int) -> dict:
    algorithm = {"SAC": SAC, "PPO": PPO}[configuration["controller"]]
    model = algorithm("MlpPolicy", "Pendulum-v1", seed=seed, **configuration.get("hyperparameters", {}))
    callback = ControlBenchCallback(log_every=LOG_EVERY)

    start = time.perf_counter()
    model.learn(total_timesteps=TOTAL_STEPS, callback=callback)

    results = {
        "reward": callback.metrics[-1]["value"],
        "num_steps": TOTAL_STEPS,
        "duration": time.perf_counter() - start,
    }
    # Evaluations and trace: run test episodes with model.predict(...) as in the skeleton above
    return {"results": results, "metrics": callback.metrics, "evaluations": [], "trace": []}
```

</details>

**Step 6: Run and check.** Start the backend, then your script. Open the experiment in the dashboard and check:

- Are all configurations listed in the comparison table, each with the expected number of seeds, success rate and control effort?
- Do the curves appear over steps **and** over wall-clock time? Are controllers without training drawn as dashed reference lines?
- Does the robustness table show your scenarios, and the episode trace your signals?

## Template settings

| Variable | Default | Effect |
|---|---|---|
| `API_URL` | `http://127.0.0.1:8000` | address of the backend |
| `EXPERIMENT` | name, environment, description, category | the experiment the runs belong to |
| `CONFIGURATIONS` | SAC and PPO with 5 seeds each, LQR with one | the compared configurations, each with `name`, `controller`, `seeds` and optionally `trains` and `hyperparameters` |
| `SCENARIOS` | `nominal`, `mass+20%`, `sensor_noise`, `impulse` | robustness tests; in the demo the value is the strength of the disturbance |
| `EVAL_EPISODES` | `20` | test episodes per scenario |
| `REUSE_EXPERIMENT` | `True` | If an experiment with the **same name and environment** already exists, the runs are appended to it. This lets you add seeds or configurations later. With `False`, every start creates a new experiment. |
| `SAVE_LOCAL_BACKUP` | `True` | Every run is saved as JSON in `experiments/results/` **before** it is uploaded. |
| `TOTAL_STEPS` | `20_000` | length of a run |
| `LOG_EVERY` | `500` | distance between data points in steps |
| `BATCH_SIZE` | `10_000` | metric or trace points per request when uploading |

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
- The template uploads metric and trace points **in batches** (`BATCH_SIZE`), so no single request runs into a timeout.

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

## Converting older data

Before evaluations existed, training scripts often stored final values and robustness tests as metrics with a single point, e.g. `final_success_rate`, `final_mean_control_effort` or `friction_high_success_rate`. [`scripts/convert_final_metrics.py`](../scripts/convert_final_metrics.py) copies such single points into evaluations with a scenario, so they appear in the comparison table and the robustness table:

| Metric | becomes scenario | key figure |
|---|---|---|
| `final_success_rate` | `nominal` | `success_rate` |
| `final_l2_success_rate` | `level 2` | `success_rate` |
| `friction_high_success_rate` | `friction_high` | `success_rate` |
| `final_mean_control_effort` | `nominal` | `control_effort` |
| `worst_success_rate` | `nominal` | `worst_success_rate` |

Scenarios are recognized from the key figures that exist as `nominal_<name>`. Other single points (events, curve points of classical controllers) are skipped and listed. The metrics themselves stay unchanged; the script only adds evaluations and can be run again. Episode traces cannot be created this way, because they were never recorded.

```bash
python scripts/convert_final_metrics.py              # dry run: shows what would happen
python scripts/convert_final_metrics.py --apply      # writes the evaluations
python scripts/convert_final_metrics.py --experiment 3 --apply
```

## Conventions for comparable data

To keep runs of different approaches comparable:

- **`duration` is wall-clock time** in seconds, *not* simulated time. Simulated time follows from `num_steps` × the environment's time step.
- **`null` means "not reached" or "not measured"**, never `0` or `-1`. A run that never stabilizes has `stability_time: null`. Made-up placeholder numbers would distort the means.
- **Every run has a seed.** Also set it in your script for every source of randomness (Python, NumPy, PyTorch, environment) so runs are reproducible.
- **Several seeds per RL configuration**, at least 3, better 5 or more. Only then are mean and spread meaningful.
- **Same configuration, same name.** All seeds of "SAC default" are named exactly that. If you change hyperparameters, the configuration gets a new name, e.g. "SAC lr 1e-3".
- **Same metric, same name.** Use the same metric names across all experiments, e.g. always `success_rate`, not sometimes `success` and sometimes `successRate`; otherwise curves cannot be compared.
