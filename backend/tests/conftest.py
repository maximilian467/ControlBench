"""Gemeinsame Fixtures für alle Tests.

pytest lädt diese Datei automatisch. Jede Fixture hier kann ein Test einfach
als Parameter anfordern, z. B. def test_etwas(client): ...
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from database import tables  # noqa: F401  (registriert die Tabellen bei Base)
from database.db import Base, enable_sqlite_foreign_keys, get_db
from main import app


@pytest.fixture
def engine(tmp_path):
    """Eine frische, leere Test-Datenbank pro Test, nie die echte controlbench.db."""
    # tmp_path ist ein von pytest angelegter temporärer Ordner, der nach dem Test weg ist
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    event.listen(engine, "connect", enable_sqlite_foreign_keys)
    # Für Tests reicht create_all; ob die Migrationen stimmen, prüft test_migrations.py
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def client(engine):
    """Ein HTTP-Client für die App, der statt der echten Datenbank die Test-Datenbank nutzt."""
    TestingSession = sessionmaker(bind=engine)

    def get_test_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    # Dependency Override: Überall, wo eine Route Depends(get_db) verlangt, bekommt sie jetzt get_test_db
    app.dependency_overrides[get_db] = get_test_db
    # base_url: Die App nimmt nur Anfragen an localhost an (TrustedHostMiddleware in main.py)
    with TestClient(app, base_url="http://127.0.0.1") as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def experiment(client):
    """Ein bereits angelegtes Experiment, für Tests, die eins voraussetzen."""
    res = client.post(
        "/experiments",
        json={"name": "Pendulum SAC", "environment": "Pendulum-v1"},
    )
    return res.json()


@pytest.fixture
def run(client, experiment):
    """Ein bereits angelegter Run (gehört zu experiment)."""
    res = client.post("/runs", json={"experiment_id": experiment["id"], "controller": "SAC", "name": "SAC default", "seed": 42, "reward": -150.3})
    return res.json()
