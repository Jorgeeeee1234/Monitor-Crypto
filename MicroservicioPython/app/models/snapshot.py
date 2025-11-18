from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CoinSnapshot(Base):
    """Almacena la fotografía de métricas de una moneda en un instante determinado."""

    __tablename__ = "coin_snapshots"
    __table_args__ = (
        UniqueConstraint("coin_id", "vs_currency", "recorded_at", name="uq_snapshots_coin_timestamp"),
        Index("ix_snapshots_vs_recorded", "vs_currency", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    coin_id: Mapped[int] = mapped_column(
        ForeignKey("coins.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    vs_currency: Mapped[str] = mapped_column(String(16), nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    market_cap: Mapped[Decimal | None] = mapped_column(Numeric(24, 2), nullable=True)
    total_volume: Mapped[Decimal | None] = mapped_column(Numeric(24, 2), nullable=True)
    change_1h: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    change_24h: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    change_7d: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    ath: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)

    coin: Mapped["Coin"] = relationship("Coin", back_populates="snapshots")

    def __repr__(self) -> str:
        ts = self.recorded_at.isoformat() if self.recorded_at else None
        return (
            f"CoinSnapshot(id={self.id!r}, coin_id={self.coin_id!r}, "
            f"vs={self.vs_currency!r}, recorded_at={ts})"
        )
