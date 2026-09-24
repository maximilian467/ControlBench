from fastapi import FastAPI

from database.db import Base, engine
from database import tables  # noqa: F401  (registriert die Tabellen bei Base)
from routes import experiments, runs

# Legt fehlende Tabellen an; bestehende Tabellen werden nicht verändert
Base.metadata.create_all(bind=engine)

app = FastAPI(title="ControlBench API")

app.include_router(experiments.router)
app.include_router(runs.router)
