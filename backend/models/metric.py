from pydantic import BaseModel, ConfigDict


class MetricCreate(BaseModel):
    """Ein Messpunkt, wie ihn der Client schickt. Die run_id steht in der URL."""

    name: str  # z. B. "success_rate", "episode_reward"
    step: int
    value: float
    # Sekunden seit Start des Runs (Rechenzeit). Optional: ohne time erscheint der Punkt nur über den Steps
    time: float | None = None


class Metric(MetricCreate):
    """Messpunkt, wie ihn die API zurückgibt."""

    # Erlaubt, das Modell direkt aus einem SQLAlchemy-Objekt zu bauen
    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: int


class MetricsCreated(BaseModel):
    """Antwort auf das Speichern mehrerer Messpunkte auf einmal."""

    run_id: int
    count: int
