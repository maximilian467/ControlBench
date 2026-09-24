# Development

## Requirements

- Python **3.10 – 3.13** (CI tests 3.10 and 3.13)
- [Node.js](https://nodejs.org/) **22.22 or newer** (CI uses Node 24)
- Git

## Setup

```bash
git clone https://github.com/maximilian467/ControlBench.git
cd ControlBench
```

**Virtual environment**

```powershell
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1
```

```bash
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

When the environment is active, `(.venv)` appears in front of the prompt.

**Dependencies**

```bash
pip install -r backend/requirements-dev.txt -r experiments/requirements.txt
cd frontend && npm install
```

`requirements-dev.txt` includes the runtime dependencies from `requirements.txt` plus the test tools. Python dependencies are constrained to tested version ranges; the frontend uses the committed `package-lock.json`.

**Database**

```bash
cd backend
alembic upgrade head
```

This creates `backend/controlbench.db` and runs all migrations. Run the same command after every `git pull` that brings new migrations.

## Running

Backend and frontend run in separate terminals. The virtual environment must be active for the backend.

```bash
# Terminal 1: backend (API)
cd backend
uvicorn main:app --reload
```

The API runs at **http://127.0.0.1:8000**, with interactive docs at **http://127.0.0.1:8000/docs**. `--reload` restarts the server on every code change.

```bash
# Terminal 2: frontend
cd frontend
npm run dev
```

Open **http://localhost:5173**.

The frontend must run on port **5173**, because the backend only allows this origin via CORS (see `backend/main.py`). The dev server is configured with `strictPort`, so it stops with an error instead of silently switching to another port if 5173 is taken.

If the backend runs at a different address, set it when starting the frontend: `VITE_API_URL=http://127.0.0.1:9000 npm run dev`.

## Tests

```bash
cd backend
pytest
```

The tests run against their **own temporary database** per test. Your real `controlbench.db` is never touched.

| File | Checks |
|---|---|
| `tests/test_experiments.py` | create, list, get and delete experiments (including runs and metrics), required fields, 404 |
| `tests/test_runs.py` | create, filter, get, update (PATCH) and delete runs, 404/422 |
| `tests/test_metrics.py` | store and filter metric points, ordering, all-or-nothing on invalid data, deletion with the run, downsampling with `max_points`, metric names |
| `tests/test_cors.py` | the frontend may call the API, foreign origins may not |
| `tests/test_migrations.py` | the Alembic migrations match `database/tables.py` exactly, and the data migration moves the controller from the experiment to its runs |

Useful variants:

```bash
pytest -v                      # show every test
pytest tests/test_runs.py      # one file only
pytest -k delete               # only tests whose name contains "delete"
```

## Lint and build (frontend)

```bash
cd frontend
npm run lint     # oxlint
npm run build    # type check + production build into frontend/dist
```

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to `main` and on every pull request:

- **Backend:** install `requirements-dev.txt`, run `pytest` on Python 3.10 and 3.13
- **Frontend:** `npm ci`, `npm run lint`, `npm run build` on Node 24

[Dependabot](../.github/dependabot.yml) checks the pip, npm and GitHub Actions dependencies weekly and opens pull requests for updates. Minor and patch updates are grouped into one PR per ecosystem, and CI runs on every such PR.

## Changing the database schema

Tables are **never** changed by hand or with `create_all`, but through Alembic migrations. That is the only way every database, no matter how old, reaches the current state without data loss.

Example: a new column `notes` for runs.

1. **Add the column in `backend/database/tables.py`** and save the file:
   ```python
   notes: Mapped[str | None]
   ```
2. **Add the field to the Pydantic model `backend/models/run.py`**, so the API accepts and returns it.
3. **Generate the migration** (in `backend/`):
   ```bash
   alembic revision --autogenerate -m "add notes to runs"
   ```
4. **Read the generated file in `migrations/versions/`.** Autogenerate is a suggestion, not a guarantee. If `upgrade()` only contains `pass`, a file was not saved. Alembic detects renames as "drop + create", which would lose data; in that case, adjust the migration by hand.
5. **Run the migration:**
   ```bash
   alembic upgrade head
   ```
6. **Run the tests.** `test_migrations.py` fails if tables and migrations do not match.
7. **Commit the migration file.**

More commands:

```bash
alembic current       # which revision is the database on?
alembic history       # all migrations
alembic downgrade -1  # go back one migration
```

> A migration that has been committed or run elsewhere is **never** deleted or changed. Fix mistakes with a new migration.

SQLite can only change existing tables in limited ways. Alembic is therefore configured in *batch mode* (`render_as_batch=True` in `migrations/env.py`). Where necessary, it rebuilds the table and copies the data.

## Code conventions

- Code comments are currently in German.
- The dashboard is available in English (default) and German. All UI text lives in `frontend/src/lib/messages.ts`; the German dictionary has the type of the English one, so a missing translation fails the type check. Numbers are formatted with the locale of the selected language.
- Keep the separation between `database/tables.py` (storage) and `models/` (API shape); see [Architecture](architecture.md#project-structure).
- Every schema change comes with a migration; every API change with a test.
