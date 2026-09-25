from fastapi import APIRouter, Depends, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from database.db import get_db
from database.tables import EvaluationTable
from models.evaluation import Evaluation, EvaluationCreate, EvaluationsSaved
from routes.metrics import ensure_run_exists

# Endkennwerte gehören immer zu einem Run, deshalb hängen sie unter /runs/{run_id}
router = APIRouter(prefix="/runs/{run_id}/evaluations", tags=["evaluations"])


@router.post("", response_model=EvaluationsSaved, status_code=status.HTTP_201_CREATED)
def save_evaluations(run_id: int, data: list[EvaluationCreate], db: Session = Depends(get_db)):
    """Speichert Endkennwerte. Gibt es einen Kennwert im selben Szenario schon, wird er überschrieben."""
    ensure_run_exists(run_id, db)
    # Kommt derselbe Kennwert in einer Anfrage mehrfach vor, gilt der letzte
    latest = {(e.scenario, e.name): e.value for e in data}
    for (scenario, name), value in latest.items():
        db.execute(
            delete(EvaluationTable).where(
                EvaluationTable.run_id == run_id, EvaluationTable.scenario == scenario, EvaluationTable.name == name
            )
        )
        db.add(EvaluationTable(run_id=run_id, scenario=scenario, name=name, value=value))
    db.commit()
    return EvaluationsSaved(run_id=run_id, count=len(latest))


@router.get("", response_model=list[Evaluation])
def list_evaluations(run_id: int, db: Session = Depends(get_db)):
    ensure_run_exists(run_id, db)
    query = (
        select(EvaluationTable)
        .where(EvaluationTable.run_id == run_id)
        .order_by(EvaluationTable.scenario, EvaluationTable.name)
    )
    return db.scalars(query).all()
