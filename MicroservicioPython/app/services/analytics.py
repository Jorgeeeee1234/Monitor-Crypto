from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from sqlalchemy import select

from ..db import session_scope
from ..models import Coin, CoinSnapshot
from .sync import ensure_recent_market_data


class MarketDataUnavailable(Exception):
    """Se lanza cuando no hay snapshots recientes y se requiere una sincronizacion previa."""


def analyse_symbol(symbol: str, vs_currency: str = "usd", days: int = 7) -> Dict[str]:
    """Calcula KPIs basicos para una moneda a partir de los snapshots almacenados."""
    symbol_norm = symbol.strip().upper()
    if not symbol_norm:
        raise ValueError("El simbolo no puede estar vacio")

    vs = vs_currency.lower()
    has_data = ensure_recent_market_data(vs_currency=vs)
    if not has_data:
        raise MarketDataUnavailable(
            "No hay datos sincronizados para el simbolo solicitado. Ejecuta la actualizacion manual."
        )

    with session_scope() as session:
        coin = (
            session.execute(select(Coin).where(Coin.symbol == symbol_norm))
            .scalar_one_or_none()
        )
        if coin is None:
            raise ValueError(f"No hay datos almacenados para el simbolo {symbol_norm}")

        since = datetime.now(timezone.utc) - timedelta(days=days)
        snapshots = (
            session.execute(
                select(CoinSnapshot)
                .where(CoinSnapshot.coin_id == coin.id)
                .where(CoinSnapshot.vs_currency == vs)
                .where(CoinSnapshot.recorded_at >= since)
                .order_by(CoinSnapshot.recorded_at.asc())
            )
            .scalars()
            .all()
        )

    if not snapshots:
        raise ValueError(f"No hay snapshots recientes para {symbol_norm} en {vs}")

    prices = [float(s.price) for s in snapshots if s.price is not None]
    last_snapshot = snapshots[-1]
    last_price = float(last_snapshot.price) if last_snapshot.price is not None else None
    change_24h = float(last_snapshot.change_24h) if last_snapshot.change_24h is not None else None
    change_7d = float(last_snapshot.change_7d) if last_snapshot.change_7d is not None else None
    avg_price = sum(prices) / len(prices) if prices else None
    min_price = min(prices) if prices else None
    max_price = max(prices) if prices else None
    volatility = statistics.pstdev(prices) if len(prices) > 1 else 0.0 if prices else None

    first_price = prices[0] if prices else None
    trend = "sin datos"
    variation_pct = None
    if first_price and last_price and first_price != 0:
        variation_pct = ((last_price - first_price) / first_price) * 100
        if variation_pct > 1.5:
            trend = "bullish"
        elif variation_pct < -1.5:
            trend = "bearish"
        else:
            trend = "sideways"

    return {
        "symbol": symbol_norm,
        "trend": trend,
        "variation_pct": variation_pct,
        "last_price": last_price,
        "average_price": avg_price,
        "min_price": min_price,
        "max_price": max_price,
        "volatility": volatility,
        "change_24h": change_24h,
        "change_7d": change_7d,
        "last_updated": last_snapshot.recorded_at,
        "sample_size": len(prices),
        "period_days": days,
        "vs_currency": vs,
    }
