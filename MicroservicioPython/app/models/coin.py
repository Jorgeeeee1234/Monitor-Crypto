from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Coin(Base):
    """Representa un activo de CoinGecko que seguimos en el sistema."""

    __tablename__ = "coins"
    __table_args__ = (UniqueConstraint("coingecko_id", name="uq_coins_coingecko_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    coingecko_id: Mapped[str] = mapped_column(String(120), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    market_cap_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    snapshots: Mapped[list["CoinSnapshot"]] = relationship(
        "CoinSnapshot",
        back_populates="coin",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    series: Mapped[list["CoinSeries"]] = relationship(
        "CoinSeries",
        back_populates="coin",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def __repr__(self) -> str:
        return f"Coin(id={self.id!r}, coingecko_id={self.coingecko_id!r})"
