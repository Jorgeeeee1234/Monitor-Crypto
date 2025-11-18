"""create coin_series table

Revision ID: 20250210_02
Revises: 20250210_01
Create Date: 2025-02-10 00:05:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250210_02'
down_revision = '20250210_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'coin_series',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('coin_id', sa.Integer(), nullable=False),
        sa.Column('vs_currency', sa.String(length=16), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('price', sa.Numeric(20, 8), nullable=False),
        sa.ForeignKeyConstraint(['coin_id'], ['coins.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('coin_id', 'vs_currency', 'recorded_at', name='uq_series_coin_vs_ts'),
    )
    op.create_index(
        'ix_series_coin_vs_time',
        'coin_series',
        ['coin_id', 'vs_currency', 'recorded_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_series_coin_vs_time', table_name='coin_series')
    op.drop_table('coin_series')
