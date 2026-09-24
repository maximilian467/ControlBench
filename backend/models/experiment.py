from pydantic import BaseModel, ConfigDict


class ExperimentCreate(BaseModel):
    """Daten, die der Client beim Anlegen eines Experiments schickt."""

    name: str
    environment: str  # z. B. "Pendulum-v1" oder "DoublePendulum"
    controller: str  # z. B. "SAC", "LQR", "PID"
    description: str | None = None


class Experiment(ExperimentCreate):
    """Experiment, wie es die API zurückgibt (mit vom Server vergebener ID)."""

    # Erlaubt, das Modell direkt aus einem SQLAlchemy-Objekt zu bauen
    model_config = ConfigDict(from_attributes=True)

    id: int
