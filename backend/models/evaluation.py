from pydantic import BaseModel, ConfigDict, Field


class EvaluationCreate(BaseModel):
    """Ein Endkennwert, wie ihn der Client schickt. Die run_id steht in der URL."""

    # NaN und Infinity ablehnen (422), wie bei Runs und Metriken
    model_config = ConfigDict(allow_inf_nan=False)

    # "nominal" = unveränderte Bedingungen; andere Namen für Robustheitstests, z. B. "mass+20%"
    scenario: str = Field(default="nominal", min_length=1)
    name: str = Field(min_length=1)  # z. B. "success_rate", "control_effort"
    value: float


class Evaluation(EvaluationCreate):
    model_config = ConfigDict(from_attributes=True, allow_inf_nan=True)

    id: int
    run_id: int


class EvaluationsSaved(BaseModel):
    run_id: int
    count: int
