from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Die Datenbankdatei liegt immer in backend/, egal aus welchem Ordner der Server gestartet wird
DB_PATH = Path(__file__).resolve().parent.parent / "controlbench.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False: FastAPI kann eine Anfrage in einem anderen Thread
# bearbeiten als dem, der die Verbindung geöffnet hat. SQLite verbietet das
# standardmäßig; da jede Anfrage ihre eigene Session bekommt, ist es hier sicher.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    # SQLite prüft Fremdschlüssel nur, wenn man es pro Verbindung einschaltet
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()


# Wird bei jeder neuen Verbindung ausgeführt; die Tests hängen es an ihre eigene Engine
event.listen(engine, "connect", enable_sqlite_foreign_keys)

SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    """Basisklasse für alle Tabellen."""


def get_db():
    """Gibt jeder Anfrage eine eigene Session und schließt sie danach wieder."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
