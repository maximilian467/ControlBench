"""move controller to runs and add run name

Revision ID: 9ece442b683d
Revises: 58750385a6e5
Create Date: 2026-09-24 14:35:17.322929

Von Hand geschrieben: autogenerate hätte experiments.controller zuerst gelöscht (Datenverlust)
und die neuen Pflichtspalten ohne Werte für bestehende Runs angelegt.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9ece442b683d'
down_revision: Union[str, Sequence[str], None] = '58750385a6e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Neue Spalten erst optional anlegen, damit bestehende Runs gültig bleiben
    with op.batch_alter_table('runs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('controller', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('name', sa.String(), nullable=True))

    # 2. Daten übertragen: Jeder Run erbt den Controller seines Experiments,
    #    der Name der Konfiguration ist vorerst der Controller-Name
    op.execute(
        """
        UPDATE runs
        SET controller = (SELECT experiments.controller FROM experiments WHERE experiments.id = runs.experiment_id),
            name = (SELECT experiments.controller FROM experiments WHERE experiments.id = runs.experiment_id)
        """
    )

    # 3. Jetzt, wo alle Runs Werte haben: Pflichtspalten daraus machen, alte Spalte entfernen
    with op.batch_alter_table('runs', schema=None) as batch_op:
        batch_op.alter_column('controller', existing_type=sa.String(), nullable=False)
        batch_op.alter_column('name', existing_type=sa.String(), nullable=False)

    with op.batch_alter_table('experiments', schema=None) as batch_op:
        batch_op.drop_column('controller')


def downgrade() -> None:
    """Downgrade schema."""
    # Rückweg: Das Experiment bekommt den Controller seines ersten Runs zurück ("unbekannt" ohne Runs).
    # Hatte ein Experiment Runs mit verschiedenen Controllern, geht diese Information dabei verloren.
    with op.batch_alter_table('experiments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('controller', sa.String(), nullable=True))

    op.execute(
        """
        UPDATE experiments
        SET controller = COALESCE(
            (SELECT runs.controller FROM runs WHERE runs.experiment_id = experiments.id ORDER BY runs.id LIMIT 1),
            'unbekannt'
        )
        """
    )

    with op.batch_alter_table('experiments', schema=None) as batch_op:
        batch_op.alter_column('controller', existing_type=sa.String(), nullable=False)

    with op.batch_alter_table('runs', schema=None) as batch_op:
        batch_op.drop_column('name')
        batch_op.drop_column('controller')
