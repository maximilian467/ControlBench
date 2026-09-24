from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.db import get_db
from database.tables import ExperimentTable, RunTable
from models.run import Run, RunCreate, RunUpdate

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=Run, status_code=status.HTTP_201_CREATED)
def create_run(data: RunCreate, db: Session = Depends(get_db)):
    # Die Datenbank würde einen Run ohne Experiment ohnehin ablehnen (Fremdschlüssel);
    # die Prüfung hier sorgt für eine verständliche 404 statt eines Serverfehlers.
    if db.get(ExperimentTable, data.experiment_id) is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    run = RunTable(**data.model_dump())
    db.add(run)
    db.commit()
    db.refresh(run)  # lädt die von der Datenbank vergebene ID nach
    return run


@router.get("", response_model=list[Run])
def list_runs(experiment_id: int | None = None, db: Session = Depends(get_db)):
    # Optionaler Filter über die URL: GET /runs?experiment_id=1
    query = select(RunTable)
    if experiment_id is not None:
        query = query.where(RunTable.experiment_id == experiment_id)
    return db.scalars(query).all()


@router.get("/{run_id}", response_model=Run)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(RunTable, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.patch("/{run_id}", response_model=Run)
def update_run(run_id: int, data: RunUpdate, db: Session = Depends(get_db)):
    run = db.get(RunTable, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    # exclude_unset: nur Felder ändern, die der Client wirklich mitgeschickt hat.
    # So lässt sich z. B. stability_time bewusst auf null setzen, ohne andere Felder zu berühren.
    changes = data.model_dump(exclude_unset=True)
    if "reward" in changes and changes["reward"] is None:
        raise HTTPException(status_code=422, detail="reward must not be null")
    for field, value in changes.items():
        setattr(run, field, value)
    db.commit()
    db.refresh(run)
    return run


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(RunTable, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    db.delete(run)
    db.commit()
