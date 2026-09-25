from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from database.db import Base


class ExperimentTable(Base):
    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    environment: Mapped[str]
    description: Mapped[str | None]


class RunTable(Base):
    __tablename__ = "runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id"))
    controller: Mapped[str]  # z. B. "SAC", "PPO", "LQR"
    # Name der Konfiguration, z. B. "SAC lr 3e-4". Runs mit gleichem Namen unterscheiden sich nur im Seed
    name: Mapped[str]
    # False bei Controllern ohne Training (LQR, PID, ...): Sie erscheinen im Diagramm als Referenzlinie
    trains: Mapped[bool] = mapped_column(default=True, server_default=text("1"))
    seed: Mapped[int]
    reward: Mapped[float]
    stability_time: Mapped[float | None]
    recovery_time: Mapped[float | None]
    num_steps: Mapped[int | None]
    duration: Mapped[float | None]  # Rechenzeit in Sekunden, nicht die simulierte Zeit


class MetricTable(Base):
    """Ein Messpunkt einer Kurve: der Wert einer Metrik bei einem bestimmten Step."""

    __tablename__ = "metrics"
    # Beschleunigt die häufigste Abfrage: alle Werte einer Metrik eines Runs
    __table_args__ = (Index("ix_metrics_run_id_name", "run_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # ondelete="CASCADE": Wird ein Run gelöscht, löscht die Datenbank seine Messpunkte mit
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"))
    name: Mapped[str]  # z. B. "success_rate", "episode_reward"
    step: Mapped[int]
    value: Mapped[float]
    time: Mapped[float | None]  # Sekunden seit Start des Runs (Rechenzeit); None, wenn nicht erfasst
