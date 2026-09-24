"""Prüft, dass die Alembic-Migrationen zu den Tabellen in database/tables.py passen.

Schlägt fehl, wenn jemand tables.py ändert und vergisst, eine Migration zu erzeugen.
"""

from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine

from database.db import Base

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def test_migrations_match_models(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrated.db'}"
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", url)

    # Leere Datenbank per Migrationen aufbauen, genau wie bei einer Neuinstallation
    command.upgrade(config, "head")

    # Dann vergleichen, was autogenerate als Unterschied erkennen würde: Es darf nichts sein
    engine = create_engine(url)
    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()

    assert differences == []
