from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from database.db import Base


class ExperimentTable(Base):
    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    environment: Mapped[str]
    controller: Mapped[str]
    description: Mapped[str | None]


class RunTable(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    seed: Mapped[int]
    reward: Mapped[float]
    stability_time: Mapped[float | None]
    recovery_time: Mapped[float | None]
    num_steps: Mapped[int | None]
