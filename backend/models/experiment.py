from pydantic import BaseModel, ConfigDict


class ExperimentCreate(BaseModel):
    """Daten, die der Client beim Anlegen eines Experiments schickt."""

    name: str
    environment: str  # z. B. "Pendulum-v1" oder "DoublePendulum"
    description: str | None = None
    # Art der Aufgabe, z. B. "stabilization", "positioning", "locomotion"; frei wählbar
    category: str | None = None


class ExperimentUpdate(BaseModel):
    """Experiment nachträglich ändern (PATCH /experiments/{id}); nur mitgeschickte Felder ändern sich."""

    name: str | None = None
    environment: str | None = None
    description: str | None = None
    category: str | None = None


class Experiment(ExperimentCreate):
    """Experiment, wie es die API zurückgibt (mit vom Server vergebener ID)."""

    # Erlaubt, das Modell direkt aus einem SQLAlchemy-Objekt zu bauen
    model_config = ConfigDict(from_attributes=True)

    id: int
