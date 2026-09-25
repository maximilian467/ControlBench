from pydantic import BaseModel, ConfigDict

from models.evaluation import Evaluation


class RunSummary(BaseModel):
    """Was die Oberfläche pro Run zum Vergleichen braucht, ohne alle Kurven zu laden."""

    model_config = ConfigDict(allow_inf_nan=True)

    run_id: int
    # Erster Step bzw. erste Rechenzeit, bei der success_rate die Schwelle erreicht; None = nie erreicht
    steps_to_threshold: int | None
    time_to_threshold: float | None
    # Letzter Wert der Kurve success_rate; None, wenn der Run keine hat
    last_success_rate: float | None
    evaluations: list[Evaluation]
