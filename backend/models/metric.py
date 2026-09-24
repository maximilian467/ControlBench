from pydantic import BaseModel, ConfigDict


class MetricCreate(BaseModel):
    """Ein Messpunkt, wie ihn der Client schickt. Die run_id steht in der URL."""

    # NaN und Infinity ablehnen (422): SQLite speichert NaN als NULL, Infinity käme als null zurück
    model_config = ConfigDict(allow_inf_nan=False)

    name: str  # z. B. "success_rate", "episode_reward"
    step: int
    value: float
    # Sekunden seit Start des Runs (Rechenzeit). Optional: ohne time erscheint der Punkt nur über den Steps
    time: float | None = None


class Metric(MetricCreate):
    """Messpunkt, wie ihn die API zurückgibt."""

    # Erlaubt, das Modell direkt aus einem SQLAlchemy-Objekt zu bauen.
    # allow_inf_nan: Ältere Datenbanken können noch Infinity enthalten, die sollen lesbar bleiben
    model_config = ConfigDict(from_attributes=True, allow_inf_nan=True)

    id: int
    run_id: int


class MetricsCreated(BaseModel):
    """Antwort auf das Speichern mehrerer Messpunkte auf einmal."""

    run_id: int
    count: int
