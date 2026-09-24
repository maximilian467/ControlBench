from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

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

# Nur Anfragen an localhost annehmen. Schützt vor DNS-Rebinding: Sonst könnte eine fremde Webseite
# ihren Domainnamen auf 127.0.0.1 umbiegen und die API im Browser wie eine eigene Seite aufrufen.
# Wer das Backend bewusst unter einem anderen Namen erreichbar macht, muss ihn hier ergänzen.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1"])


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Wie FastAPIs Standardantwort, aber ohne die ungültige Eingabe ("input") zu wiederholen:
    # Ist die NaN oder Infinity, lässt sie sich nicht als JSON schicken, und aus der 422 würde ein 500er
    errors = [{key: value for key, value in error.items() if key != "input"} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})

app.include_router(experiments.router)
app.include_router(runs.router)
app.include_router(metrics.router)
