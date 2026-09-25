from pydantic import BaseModel, ConfigDict, Field


class TracePointCreate(BaseModel):
    """Ein Punkt im Verlauf einer Test-Episode. Die run_id steht in der URL."""

    model_config = ConfigDict(allow_inf_nan=False)

    signal: str = Field(min_length=1)  # z. B. "angle", "u_0"
    t: float  # Sekunden seit Start der Episode (simulierte Zeit)
    value: float


class TracePoint(TracePointCreate):
    model_config = ConfigDict(from_attributes=True, allow_inf_nan=True)

    id: int
    run_id: int


class TraceSaved(BaseModel):
    run_id: int
    count: int
