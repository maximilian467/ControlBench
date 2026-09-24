from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.db import get_db
from database.tables import MetricTable, RunTable
from models.metric import Metric, MetricCreate, MetricsCreated

# Messpunkte gehören immer zu einem Run, deshalb hängen sie unter /runs/{run_id}
router = APIRouter(prefix="/runs/{run_id}/metrics", tags=["metrics"])


@router.post("", response_model=MetricsCreated, status_code=status.HTTP_201_CREATED)
def create_metrics(run_id: int, data: list[MetricCreate], db: Session = Depends(get_db)):
    # Nimmt eine Liste an: viele Messpunkte in einer Anfrage statt einer Anfrage pro Punkt
    if db.get(RunTable, run_id) is None:
        raise HTTPException(status_code=404, detail="Run not found")
    db.add_all([MetricTable(run_id=run_id, **metric.model_dump()) for metric in data])
    db.commit()
    return MetricsCreated(run_id=run_id, count=len(data))


@router.get("", response_model=list[Metric])
def list_metrics(run_id: int, name: str | None = None, db: Session = Depends(get_db)):
    # Optionaler Filter über die URL: GET /runs/1/metrics?name=success_rate
    if db.get(RunTable, run_id) is None:
        raise HTTPException(status_code=404, detail="Run not found")
    query = select(MetricTable).where(MetricTable.run_id == run_id)
    if name is not None:
        query = query.where(MetricTable.name == name)
    return db.scalars(query.order_by(MetricTable.name, MetricTable.step)).all()
