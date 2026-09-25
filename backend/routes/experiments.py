from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from database.db import get_db
from database.tables import ExperimentTable, RunTable
from models.experiment import Experiment, ExperimentCreate, ExperimentUpdate

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.post("", response_model=Experiment, status_code=status.HTTP_201_CREATED)
def create_experiment(data: ExperimentCreate, db: Session = Depends(get_db)):
    experiment = ExperimentTable(**data.model_dump())
    db.add(experiment)
    db.commit()
    db.refresh(experiment)  # lädt die von der Datenbank vergebene ID nach
    return experiment


@router.get("", response_model=list[Experiment])
def list_experiments(db: Session = Depends(get_db)):
    return db.scalars(select(ExperimentTable)).all()


@router.get("/{experiment_id}", response_model=Experiment)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.get(ExperimentTable, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.patch("/{experiment_id}", response_model=Experiment)
def update_experiment(experiment_id: int, data: ExperimentUpdate, db: Session = Depends(get_db)):
    experiment = db.get(ExperimentTable, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    changes = data.model_dump(exclude_unset=True)
    # Name und Environment sind Pflichtfelder; Beschreibung und Kategorie dürfen mit null geleert werden
    for required in ("name", "environment"):
        if required in changes and not changes[required]:
            raise HTTPException(status_code=422, detail=f"{required} must not be empty")
    if changes.get("category") == "":
        changes["category"] = None
    for field, value in changes.items():
        setattr(experiment, field, value)
    db.commit()
    db.refresh(experiment)
    return experiment


@router.delete("/{experiment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    experiment = db.get(ExperimentTable, experiment_id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    # Erst die Runs löschen, sonst verhindert der Fremdschlüssel das Löschen des Experiments.
    # Deren Messpunkte löscht die Datenbank per ON DELETE CASCADE mit.
    # Alles passiert in einer Transaktion: Entweder ist danach alles weg oder nichts.
    db.execute(delete(RunTable).where(RunTable.experiment_id == experiment_id))
    db.delete(experiment)
    db.commit()
