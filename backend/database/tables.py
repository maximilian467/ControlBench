from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, UniqueConstraint, text
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
    # Einstellungen der Konfiguration, z. B. {"learning_rate": 0.0003, "gamma": 0.99}. Frei aufgebaut
    hyperparameters: Mapped[dict[str, Any] | None] = mapped_column(JSON)


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


class EvaluationTable(Base):
    """Ein Endkennwert eines Runs in einem Szenario, z. B. control_effort = 41.2 im Szenario "nominal".

    Kurven über das Training stehen in metrics; hier steht, wie gut der fertige Controller ist.
    Robustheit: dieselben Kennwerte unter veränderten Bedingungen, z. B. Szenario "mass+20%".
    """

    __tablename__ = "evaluations"
    # Pro Run, Szenario und Kennwert genau ein Wert; ein erneutes Hochladen überschreibt ihn
    __table_args__ = (UniqueConstraint("run_id", "scenario", "name", name="uq_evaluations_run_scenario_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    scenario: Mapped[str] = mapped_column(default="nominal", server_default="nominal")
    name: Mapped[str]  # z. B. "success_rate", "control_effort", "overshoot"
    value: Mapped[float]
