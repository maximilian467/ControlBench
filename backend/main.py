from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import experiments, runs

# Die Tabellen legt Alembic an: im Ordner backend/ "alembic upgrade head" ausführen

app = FastAPI(title="ControlBench API")

# Erlaubt dem Frontend (anderer Port = andere "Origin"), die API aus dem Browser aufzurufen
app.add_middleware(
    CORSMiddleware,
    #allow_origins=["http://localhost:5500", "http://127.0.0.1:5500"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(experiments.router)
app.include_router(runs.router)
