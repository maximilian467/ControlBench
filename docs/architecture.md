# Architecture

This page explains how ControlBench is structured: the core concepts, the components, the project layout and the data model.

## Concepts

ControlBench compares **configurations**, not individual runs. A reinforcement learning agent can do very well with one seed and poorly with the next. Whether SAC is generally better than PPO, or than an LQR controller, only shows up in the mean over several seeds together with its spread.

| Term | Meaning | Example |
|---|---|---|
| **Experiment** | One question on one environment, in which several controllers are compared | "Pendulum controller comparison" on `Pendulum-v1` |
| **Controller** | The algorithm or control law | `SAC`, `PPO`, `TQC`, `PID`, `LQR`, `MPC`, your own |
| **Configuration** | A controller with specific settings, identified by the `name` of its runs. Runs with the same controller and name differ only in their seed | "SAC default", "SAC lr 1e-3" |
| **Run** | One execution of a configuration with a specific seed, with its final results | "SAC default", seed 2: reward −150.3 |
| **Metric** | One point of a curve within a run: name, step, value, optional wall-clock time | `success_rate` at step 5000 = 0.82 |
| **Seed** | Start value of the random number generators. Same seed, reproducible result | `0`, `1`, `2`, … |

An experiment has many runs, and a run has many metric points. Configurations are **not** a separate table: they are derived from `controller` and `name` of the runs.

For each configuration, the dashboard shows:

- mean reward, sample standard deviation (n − 1) and range (min … max) over its seeds
- how many seeds stabilized, and the mean time until stable (over the seeds that did)
- mean wall-clock time
- learning curves averaged over the seeds, with a min–max band, over environment steps or wall-clock time

The configuration with the highest mean reward is highlighted as the best one.

## Components

```
┌────────────────────────┐        ┌────────────────────────┐
│  Training / control    │        │  Dashboard             │
│  script                │        │  (browser, port 5173)  │
│  e.g. SAC, LQR, PID    │        │  React + TypeScript    │
└───────────┬────────────┘        └───────────┬────────────┘
            │  HTTP + JSON                    │  HTTP + JSON (fetch)
            ▼                                 ▼
┌───────────────────────────────────────────────────────────┐
│  Backend: FastAPI (port 8000)                             │
│   routes/     REST endpoints                              │
│   models/     Pydantic: validates incoming/outgoing JSON  │
│   database/   SQLAlchemy: tables and database access      │
└───────────────────────────┬───────────────────────────────┘
                            │  SQL
                            ▼
                ┌───────────────────────┐
                │  SQLite               │  schema managed with
                │  backend/controlbench │  Alembic migrations
                │  .db                  │
                └───────────────────────┘
```

The central design idea is that **everything goes through the REST API**. The backend does not care whether a request comes from a training script, the browser or `curl`. To ingest results from another language or tool, you only need to send JSON over HTTP.

ControlBench is meant to run **locally** on your own machine. There are deliberately no user accounts and no authentication (see [SECURITY.md](../SECURITY.md)).

## Tech stack

| Area | Tool | Purpose |
|---|---|---|
| Web framework | [FastAPI](https://fastapi.tiangolo.com/) | REST API, interactive docs at `/docs` |
| Validation | [Pydantic](https://docs.pydantic.dev/) | checks types and required fields of every request |
| Database access | [SQLAlchemy 2](https://docs.sqlalchemy.org/) (ORM) | tables as Python classes |
| Migrations | [Alembic](https://alembic.sqlalchemy.org/) | versioned changes to the database schema |
| Database | SQLite | a single file, no database server |
| Server | [Uvicorn](https://uvicorn.dev/) | runs the FastAPI app |
| Tests | [pytest](https://docs.pytest.org/) | backend tests |
| Frontend | [React](https://react.dev/) + TypeScript, [Vite](https://vite.dev/) | dashboard, dev server |
| Charts | [visx](https://airbnb.io/visx/) | learning curves with seed bands |
| Styling | [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) | design tokens and base components |
| Loading states | [thinking-orbs](https://www.npmjs.com/package/thinking-orbs) | animated loading indicators |
| Lint | [oxlint](https://oxc.rs/docs/guide/usage/linter) | frontend linting |

## Project structure

```
ControlBench/
├── backend/
│   ├── main.py                 # entry point: creates the app, CORS, includes the routes
│   ├── requirements.txt        # runtime dependencies
│   ├── requirements-dev.txt    # plus development tools (pytest)
│   ├── alembic.ini             # Alembic configuration
│   ├── pytest.ini              # pytest configuration
│   ├── controlbench.db         # the database (created locally, not in Git)
│   ├── database/
│   │   ├── db.py               # connection, session, get_db()
│   │   └── tables.py           # tables: experiments, runs, metrics
│   ├── models/                 # Pydantic models: shape of the JSON at the API
│   │   ├── experiment.py
│   │   ├── run.py
│   │   └── metric.py
│   ├── routes/                 # endpoints, one file per resource
│   │   ├── experiments.py
│   │   ├── runs.py
│   │   └── metrics.py
│   ├── migrations/             # Alembic: env.py and versions/ (one file per schema change)
│   └── tests/                  # pytest tests
├── frontend/                   # React app (Vite + TypeScript)
│   ├── package.json            # npm dependencies and scripts
│   └── src/
│       ├── main.tsx            # entry point
│       ├── App.tsx             # pages (routes)
│       ├── index.css           # design tokens: colors, fonts, radii
│       ├── lib/api.ts          # all backend calls + TypeScript types
│       ├── lib/configurations.ts  # grouping runs into configurations, seed statistics, curve averaging
│       ├── lib/messages.ts     # all UI text in English and German
│       ├── lib/i18n.ts         # language context and useI18n() hook (texts + number formats)
│       ├── hooks/              # data loading (useAsync, useRunMetrics)
│       ├── components/         # reusable building blocks (MetricChart, HoldToDelete, ...)
│       └── pages/              # one file per page
├── experiments/
│   ├── example_upload.py       # template: upload results automatically (generates demo data)
│   ├── requirements.txt
│   └── results/                # local backups of runs (not in Git)
└── docs/                       # this documentation, screenshots and demo GIF
```

**Two kinds of models:** `database/tables.py` describes how data is stored in the **database** (SQLAlchemy). `models/` describes how data looks at the **API** (Pydantic). They are deliberately separate, so a table can change without changing the JSON for API users, and vice versa.

## Data model

```
experiments                 runs                          metrics
───────────                 ────                          ───────
id            PK ◄──┐       id              PK ◄──┐       id       PK
name                └────── experiment_id   FK    └────── run_id   FK (ON DELETE CASCADE)
environment                 controller                    name
description   (optional)    name                          step
                            seed                          value
                            reward                        time     (optional)
                            stability_time  (optional)
                            recovery_time   (optional)    Index: (run_id, name)
                            num_steps       (optional)
                            duration        (optional)
```

- **Foreign keys** make sure there is no run without an experiment and no metric point without a run. The database enforces this itself (`PRAGMA foreign_keys = ON` is set on every connection).
- **When a run is deleted**, the database deletes its metric points automatically (`ON DELETE CASCADE`). Deleting an experiment deletes its runs, and with them their metrics, in one transaction.
- **Metrics are stored in "long" format:** every point is its own row with `name`, `step` and `value`, not an array column. New metrics such as `angle`, `torque` or `critic_loss` therefore need **no schema change**; they are just a new name. It also lets the database compute across runs.
- `recovery_time` is stored and returned by the API, but not yet shown in the dashboard.

### Downsampling

Long trainings produce hundreds of thousands of points per metric. `GET /runs/{id}/metrics?max_points=N` thins them out **in the database** (window functions): every k-th point is kept, plus always the first and the last, so at most `N` points per metric are returned. The dashboard loads only the metric that is currently shown, at 1,000 points per run.
