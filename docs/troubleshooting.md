# Troubleshooting

| Problem | Cause and fix |
|---|---|
| `Activate.ps1 cannot be loaded because running scripts is disabled on this system` | Windows blocks scripts. Run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| The dashboard shows "No connection to the API" | The backend is not running. Start it in `backend/` with `uvicorn main:app --reload`. |
| `npm run dev` fails with `Port 5173 is already in use` | Another process uses port 5173 (often a second dev server). Stop it. The frontend must run on 5173 because the backend only allows this origin via CORS. |
| The browser console shows `blocked by CORS policy` | The dashboard is served from an origin other than `http://localhost:5173` / `http://127.0.0.1:5173`, e.g. via `npm run preview` (port 4173). Use `npm run dev`, or add the origin to `allow_origins` in `backend/main.py`. |
| The API answers `400 Invalid host header` | The backend only accepts requests addressed to `localhost` or `127.0.0.1` (protection against DNS rebinding). If you deliberately reach it under another name, add it to `allowed_hosts` in `backend/main.py`, and read [SECURITY.md](../SECURITY.md) first. |
| An upload fails with `422` although the fields are complete | A value is `NaN` or `Infinity`, e.g. from a diverged training. Replace it with `null` for optional fields or skip the point. |
| `sqlite3.OperationalError: no such column ...` | The code knows a column that is missing in the database: run `alembic upgrade head` in `backend/`. |
| `Can't locate revision identified by '...'` | The database is on a migration whose file is missing, usually because a migration file was deleted. Restore it from Git: `git restore backend/migrations/versions/<file>` |
| The upload script reports "keine Verbindung" (no connection) | The backend is not running, or runs at a different address than `API_URL` in the script. |
| A configuration appears twice in the comparison table | The seeds do not use exactly the same `name` (case, spaces) or use different `controller` values. |
| Curves are missing in the "Wall-clock time" view | The metric points were uploaded without `time`. They are visible over steps. |
| `ModuleNotFoundError` on start | The virtual environment is not active, or the command was not run in `backend/`. |
