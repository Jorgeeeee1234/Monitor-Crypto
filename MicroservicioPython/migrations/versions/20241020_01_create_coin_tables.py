"""create coins and snapshots tables

Revision ID: 20241020_01
Revises: None
Create Date: 2025-10-20 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20241020_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coins",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("coingecko_id", sa.String(length=120), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("image_url", sa.String(length=255), nullable=True),
        sa.Column("market_cap_rank", sa.Integer(), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_coins_id", "coins", ["id"], unique=False)
    op.create_unique_constraint("uq_coins_coingecko_id", "coins", ["coingecko_id"])

    op.create_table(
        "coin_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("coin_id", sa.Integer(), sa.ForeignKey("coins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("vs_currency", sa.String(length=16), nullable=False),
        sa.Column("price", sa.Numeric(20, 8), nullable=True),
        sa.Column("market_cap", sa.Numeric(24, 2), nullable=True),
        sa.Column("total_volume", sa.Numeric(24, 2), nullable=True),
        sa.Column("change_1h", sa.Numeric(10, 4), nullable=True),
        sa.Column("change_24h", sa.Numeric(10, 4), nullable=True),
        sa.Column("change_7d", sa.Numeric(10, 4), nullable=True),
        sa.Column("ath", sa.Numeric(20, 8), nullable=True),
    )
    op.create_index("ix_snapshots_vs_recorded", "coin_snapshots", ["vs_currency", "recorded_at"], unique=False)
    op.create_index("ix_coin_snapshots_coin_id", "coin_snapshots", ["coin_id"], unique=False)
    op.create_unique_constraint(
        "uq_snapshots_coin_timestamp",
        "coin_snapshots",
        ["coin_id", "vs_currency", "recorded_at"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_snapshots_coin_timestamp", "coin_snapshots", type_="unique")
    op.drop_index("ix_coin_snapshots_coin_id", table_name="coin_snapshots")
    op.drop_index("ix_snapshots_vs_recorded", table_name="coin_snapshots")
    op.drop_table("coin_snapshots")
    op.drop_constraint("uq_coins_coingecko_id", "coins", type_="unique")
    op.drop_index("ix_coins_id", table_name="coins")
    op.drop_table("coins")
