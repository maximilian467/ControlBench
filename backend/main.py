from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import experiments, metrics, runs

# Die Tabellen legt Alembic an: im Ordner backend/ "alembic upgrade head" ausführen

app = FastAPI(title="ControlBench API", version="0.1.0")

# Erlaubt dem React-Frontend (Vite, Port 5173 = andere "Origin"), die API aus dem Browser aufzurufen
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(experiments.router)
app.include_router(runs.router)
app.include_router(metrics.router)
