from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.db import get_db
from database.tables import ExperimentTable
from models.experiment import Experiment, ExperimentCreate

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
