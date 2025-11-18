"""add description column to coins

Revision ID: 20250210_01
Revises: 20241020_01
Create Date: 2025-02-10 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20250210_01'
down_revision = '20241020_01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('coins', sa.Column('description', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('coins', 'description')
