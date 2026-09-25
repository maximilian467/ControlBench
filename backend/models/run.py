from pydantic import BaseModel, ConfigDict


class RunCreate(BaseModel):
    """Daten, die der Client beim Speichern eines Runs schickt."""

    # NaN und Infinity ablehnen (422): SQLite speichert NaN als NULL, Infinity käme als null zurück
    model_config = ConfigDict(allow_inf_nan=False)

    experiment_id: int
    controller: str  # z. B. "SAC", "PPO", "LQR"
    # Name der Konfiguration, z. B. "SAC lr 3e-4". Mehrere Seeds derselben Konfiguration tragen denselben Namen,
    # so kann die Oberfläche über die Seeds mitteln
    name: str
    # False bei Controllern ohne Training (LQR, PID, ...). Die Oberfläche zeigt sie als Referenzlinie
    # statt als Lernkurve. Gilt für die ganze Konfiguration, also für alle ihre Seeds.
    trains: bool = True
    seed: int
    reward: float
    # None, wenn das System im Run nie stabilisiert bzw. sich nie erholt hat
    stability_time: float | None = None
    recovery_time: float | None = None
    # Anzahl der Simulationsschritte; None bei alten Runs, die das nicht erfasst haben
    num_steps: int | None = None
    # Rechenzeit des Runs in Sekunden (nicht die simulierte Zeit, die ergibt sich aus num_steps);
    # None bei alten Runs, die das nicht erfasst haben
    duration: float | None = None


class RunUpdate(BaseModel):
    """Endergebnisse eines Runs nachträglich setzen (PATCH /runs/{id}).

    Damit kann ein langes Training seinen Run schon früh anlegen, Messpunkte live hochladen
    und die Endergebnisse am Ende nachtragen. Nur mitgeschickte Felder werden geändert.
    """

    model_config = ConfigDict(allow_inf_nan=False)

    reward: float | None = None
    trains: bool | None = None
    stability_time: float | None = None
    recovery_time: float | None = None
    num_steps: int | None = None
    duration: float | None = None


class Run(RunCreate):
    """Run, wie ihn die API zurückgibt (mit vom Server vergebener ID)."""

    # Erlaubt, das Modell direkt aus einem SQLAlchemy-Objekt zu bauen.
    # allow_inf_nan: Ältere Datenbanken können noch Infinity enthalten, die sollen lesbar bleiben
    model_config = ConfigDict(from_attributes=True, allow_inf_nan=True)

    id: int
