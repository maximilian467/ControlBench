from fastapi import FastAPI

from routes import experiments, runs

# Die Tabellen legt Alembic an: im Ordner backend/ "alembic upgrade head" ausführen

app = FastAPI(title="ControlBench API")

app.include_router(experiments.router)
app.include_router(runs.router)
