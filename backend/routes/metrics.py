from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from database.db import get_db
from database.tables import MetricTable, RunTable
from models.metric import Metric, MetricCreate, MetricsCreated

# Messpunkte gehören immer zu einem Run, deshalb hängen sie unter /runs/{run_id}
router = APIRouter(prefix="/runs/{run_id}/metrics", tags=["metrics"])


def ensure_run_exists(run_id: int, db: Session) -> None:
    if db.get(RunTable, run_id) is None:
        raise HTTPException(status_code=404, detail="Run not found")


@router.post("", response_model=MetricsCreated, status_code=status.HTTP_201_CREATED)
def create_metrics(run_id: int, data: list[MetricCreate], db: Session = Depends(get_db)):
    # Nimmt eine Liste an: viele Messpunkte in einer Anfrage statt einer Anfrage pro Punkt
    ensure_run_exists(run_id, db)
    db.add_all([MetricTable(run_id=run_id, **metric.model_dump()) for metric in data])
    db.commit()
    return MetricsCreated(run_id=run_id, count=len(data))


@router.get("", response_model=list[Metric])
def list_metrics(
    run_id: int,
    name: str | None = None,
    # Lange Trainings haben hunderttausende Punkte; ein Diagramm braucht nur so viele, wie es Pixel breit ist
    max_points: int | None = Query(None, ge=2, description="Höchstens so viele Punkte pro Metrik zurückgeben"),
    db: Session = Depends(get_db),
):
    # Optionale Filter über die URL: GET /runs/1/metrics?name=success_rate&max_points=1000
    ensure_run_exists(run_id, db)
    filters = [MetricTable.run_id == run_id]
    if name is not None:
        filters.append(MetricTable.name == name)

    if max_points is None:
        query = select(MetricTable).where(*filters).order_by(MetricTable.name, MetricTable.step)
        return db.scalars(query).all()

    # Ausdünnen in der Datenbank: Jeder Punkt bekommt pro Metrik eine laufende Nummer (rn) und die Anzahl (n).
    # Behalten wird jeder k-te Punkt und immer der letzte. k ist so gewählt, dass inklusive des letzten Punkts
    # höchstens max_points übrig bleiben: aufgerundet n / (max_points - 1).
    numbered = (
        select(
            MetricTable,
            func.row_number().over(partition_by=MetricTable.name, order_by=MetricTable.step).label("rn"),
            func.count().over(partition_by=MetricTable.name).label("n"),
        )
        .where(*filters)
        .subquery()
    )
    stride = (numbered.c.n + (max_points - 2)) // (max_points - 1)
    metric = aliased(MetricTable, numbered)
    query = (
        select(metric)
        .where(or_((numbered.c.rn - 1) % stride == 0, numbered.c.rn == numbered.c.n))
        .order_by(metric.name, metric.step)
    )
    return db.scalars(query).all()


@router.get("/names", response_model=list[str])
def list_metric_names(run_id: int, db: Session = Depends(get_db)):
    """Welche Metriken hat dieser Run? Damit muss ein Client nicht alle Messpunkte laden, um es herauszufinden."""
    ensure_run_exists(run_id, db)
    query = select(MetricTable.name).where(MetricTable.run_id == run_id).distinct().order_by(MetricTable.name)
    return db.scalars(query).all()
