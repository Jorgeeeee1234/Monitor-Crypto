from __future__ import annotations

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class CoinSeries(Base):
    """Serie histórica almacenada para una moneda."""

    __tablename__ = "coin_series"
    __table_args__ = (
        UniqueConstraint("coin_id", "vs_currency", "recorded_at", name="uq_series_coin_vs_ts"),
        Index("ix_series_coin_vs_time", "coin_id", "vs_currency", "recorded_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    coin_id: Mapped[int] = mapped_column(ForeignKey("coins.id", ondelete="CASCADE"), nullable=False)
    vs_currency: Mapped[str] = mapped_column(String(16), nullable=False)
    recorded_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    price: Mapped[Numeric] = mapped_column(Numeric(20, 8), nullable=False)

    coin: Mapped["Coin"] = relationship("Coin", back_populates="series")
