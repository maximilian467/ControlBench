from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from database.db import get_db
from database.tables import EvaluationTable, MetricTable, RunTable, TraceTable
from models.evaluation import Evaluation
from models.summary import RunSummary

router = APIRouter(prefix="/summaries", tags=["summaries"])

SUCCESS_METRIC = "success_rate"


@router.get("", response_model=list[RunSummary])
def list_summaries(
    experiment_id: int | None = None,
    # Ab welcher Success Rate ein Controller als "funktioniert" gilt
    threshold: float = Query(0.9, gt=0, le=1),
    db: Session = Depends(get_db),
):
    """Pro Run: Kennwerte und wann die Success Rate die Schwelle zum ersten Mal erreicht hat.

    Das rechnet die Datenbank direkt aus den Messpunkten; die Oberfläche muss dafür keine Kurven laden.
    """
    run_query = select(RunTable.id)
    if experiment_id is not None:
        run_query = run_query.where(RunTable.experiment_id == experiment_id)
    run_ids = list(db.scalars(run_query))
    if not run_ids:
        return []

    success = (MetricTable.name == SUCCESS_METRIC, MetricTable.run_id.in_(run_ids))

    # Erster Step (und die dazugehörige Rechenzeit), an dem die Schwelle erreicht wurde
    reached = {
        run_id: (step, time)
        for run_id, step, time in db.execute(
            select(MetricTable.run_id, func.min(MetricTable.step), func.min(MetricTable.time))
            .where(*success, MetricTable.value >= threshold)
            .group_by(MetricTable.run_id)
        )
    }

    # Letzter Wert der Kurve: der Messpunkt mit dem größten Step
    last_step = (
        select(MetricTable.run_id, func.max(MetricTable.step).label("step"))
        .where(*success)
        .group_by(MetricTable.run_id)
        .subquery()
    )
    metric = aliased(MetricTable)
    last_value = {
        run_id: value
        for run_id, value in db.execute(
            select(metric.run_id, metric.value).join(
                last_step,
                (metric.run_id == last_step.c.run_id) & (metric.step == last_step.c.step),
            ).where(metric.name == SUCCESS_METRIC)
        )
    }

    evaluations: dict[int, list[EvaluationTable]] = {}
    for evaluation in db.scalars(
        select(EvaluationTable)
        .where(EvaluationTable.run_id.in_(run_ids))
        .order_by(EvaluationTable.scenario, EvaluationTable.name)
    ):
        evaluations.setdefault(evaluation.run_id, []).append(evaluation)

    signals: dict[int, list[str]] = {}
    for run_id, signal in db.execute(
        select(TraceTable.run_id, TraceTable.signal)
        .where(TraceTable.run_id.in_(run_ids))
        .distinct()
        .order_by(TraceTable.run_id, TraceTable.signal)
    ):
        signals.setdefault(run_id, []).append(signal)

    return [
        RunSummary(
            run_id=run_id,
            steps_to_threshold=reached.get(run_id, (None, None))[0],
            time_to_threshold=reached.get(run_id, (None, None))[1],
            last_success_rate=last_value.get(run_id),
            evaluations=[Evaluation.model_validate(e) for e in evaluations.get(run_id, [])],
            trace_signals=signals.get(run_id, []),
        )
        for run_id in run_ids
    ]
