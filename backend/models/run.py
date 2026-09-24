from pydantic import BaseModel, ConfigDict


class RunCreate(BaseModel):
    """Daten, die der Client beim Speichern eines Runs schickt."""

    experiment_id: int
    seed: int
    reward: float
    # None, wenn das System im Run nie stabilisiert bzw. sich nie erholt hat
    stability_time: float | None = None
    recovery_time: float | None = None


class Run(RunCreate):
    """Run, wie ihn die API zurückgibt (mit vom Server vergebener ID)."""

    # Erlaubt, das Modell direkt aus einem SQLAlchemy-Objekt zu bauen
    model_config = ConfigDict(from_attributes=True)

    id: int
