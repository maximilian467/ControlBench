from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, aliased

from database.db import get_db
from database.tables import TraceTable
from models.trace import TracePoint, TracePointCreate, TraceSaved
from routes.metrics import ensure_run_exists

# Der Verlauf einer Test-Episode gehört zu einem Run
router = APIRouter(prefix="/runs/{run_id}/traces", tags=["traces"])


@router.post("", response_model=TraceSaved, status_code=status.HTTP_201_CREATED)
def save_trace(run_id: int, data: list[TracePointCreate], replace: bool = False, db: Session = Depends(get_db)):
    """Speichert Punkte des Episodenverlaufs, bei großen Mengen in mehreren Paketen.

    replace=true löscht vorher alle Punkte der mitgeschickten Signale, z. B. für eine neue Test-Episode.
    """
    ensure_run_exists(run_id, db)
    if replace:
        signals = {point.signal for point in data}
        db.execute(delete(TraceTable).where(TraceTable.run_id == run_id, TraceTable.signal.in_(signals)))
    db.add_all([TraceTable(run_id=run_id, **point.model_dump()) for point in data])
    db.commit()
    return TraceSaved(run_id=run_id, count=len(data))


@router.get("", response_model=list[TracePoint])
def list_trace(
    run_id: int,
    signal: str | None = None,
    max_points: int | None = Query(None, ge=2, description="Höchstens so viele Punkte pro Signal zurückgeben"),
    db: Session = Depends(get_db),
):
    ensure_run_exists(run_id, db)
    filters = [TraceTable.run_id == run_id]
    if signal is not None:
        filters.append(TraceTable.signal == signal)
    if max_points is None:
        return db.scalars(select(TraceTable).where(*filters).order_by(TraceTable.signal, TraceTable.t)).all()

    # Ausdünnen wie bei den Metriken: jeder k-te Punkt pro Signal, der letzte immer
    numbered = (
        select(
            TraceTable,
            func.row_number().over(partition_by=TraceTable.signal, order_by=TraceTable.t).label("rn"),
            func.count().over(partition_by=TraceTable.signal).label("n"),
        )
        .where(*filters)
        .subquery()
    )
    stride = (numbered.c.n + (max_points - 2)) // (max_points - 1)
    point = aliased(TraceTable, numbered)
    query = (
        select(point)
        .where(or_((numbered.c.rn - 1) % stride == 0, numbered.c.rn == numbered.c.n))
        .order_by(point.signal, point.t)
    )
    return db.scalars(query).all()


@router.get("/signals", response_model=list[str])
def list_signals(run_id: int, db: Session = Depends(get_db)):
    ensure_run_exists(run_id, db)
    query = select(TraceTable.signal).where(TraceTable.run_id == run_id).distinct().order_by(TraceTable.signal)
    return db.scalars(query).all()
