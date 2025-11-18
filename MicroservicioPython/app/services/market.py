from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List

from sqlalchemy import func, select

from ..db import session_scope
from ..models import Coin, CoinSnapshot, CoinSeries


def _decimal_to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _safe_ratio(numerator: Decimal | None, denominator: Decimal | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    if denominator == 0:
        return None
    return float(numerator / denominator)


def get_latest_prices(vs_currency: str = "usd", per_page: int = 50, page: int = 1) -> List[Dict[str, Any]]:
    """Devuelve los ultimos precios almacenados en la base de datos junto con KPIs."""
    vs = vs_currency.lower()
    per_page = max(1, per_page)
    page = max(1, page)

    with session_scope() as session:
        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(hours=24)
        week_ago = now - timedelta(days=7)

        latest_snapshot = (
            select(
                CoinSnapshot.coin_id.label("coin_id"),
                func.max(CoinSnapshot.recorded_at).label("max_recorded"),
            )
            .where(CoinSnapshot.vs_currency == vs)
            .group_by(CoinSnapshot.coin_id)
            .subquery()
        )

        stats_24h = (
            select(
                CoinSnapshot.coin_id.label("coin_id"),
                func.avg(CoinSnapshot.price).label("avg_price_24h"),
            )
            .where(CoinSnapshot.vs_currency == vs)
            .where(CoinSnapshot.recorded_at >= day_ago)
            .group_by(CoinSnapshot.coin_id)
            .subquery()
        )

        stats_7d = (
            select(
                CoinSnapshot.coin_id.label("coin_id"),
                func.avg(CoinSnapshot.price).label("avg_price_7d"),
                func.min(CoinSnapshot.price).label("min_price_7d"),
                func.max(CoinSnapshot.price).label("max_price_7d"),
                func.stddev_pop(CoinSnapshot.price).label("volatility_7d"),
            )
            .where(CoinSnapshot.vs_currency == vs)
            .where(CoinSnapshot.recorded_at >= week_ago)
            .group_by(CoinSnapshot.coin_id)
            .subquery()
        )

        stmt = (
            select(
                Coin,
                CoinSnapshot,
                stats_24h.c.avg_price_24h,
                stats_7d.c.avg_price_7d,
                stats_7d.c.min_price_7d,
                stats_7d.c.max_price_7d,
                stats_7d.c.volatility_7d,
            )
            .join(latest_snapshot, Coin.id == latest_snapshot.c.coin_id)
            .join(
                CoinSnapshot,
                (CoinSnapshot.coin_id == latest_snapshot.c.coin_id)
                & (CoinSnapshot.recorded_at == latest_snapshot.c.max_recorded)
                & (CoinSnapshot.vs_currency == vs),
            )
            .outerjoin(stats_24h, stats_24h.c.coin_id == Coin.id)
            .outerjoin(stats_7d, stats_7d.c.coin_id == Coin.id)
            .order_by(
                func.coalesce(CoinSnapshot.market_cap, 0).desc(),
                func.coalesce(Coin.market_cap_rank, 1_000_000).asc(),
            )
            .limit(per_page)
            .offset((page - 1) * per_page)
        )

        rows = session.execute(stmt).all()

    results: List[Dict[str, Any]] = []
    for coin, snapshot, avg_24h, avg_7d, min_7d, max_7d, volatility_7d in rows:
        kpis: Dict[str, Any] = {
            "avg_price_24h": _decimal_to_float(avg_24h),
            "avg_price_7d": _decimal_to_float(avg_7d),
            "min_price_7d": _decimal_to_float(min_7d),
            "max_price_7d": _decimal_to_float(max_7d),
            "volatility_7d": _decimal_to_float(volatility_7d),
            "volume_market_cap_ratio": _safe_ratio(snapshot.total_volume, snapshot.market_cap),
        }

        results.append(
            {
                "id": coin.coingecko_id,
                "symbol": coin.symbol,
                "nombre": coin.name,
                "image": coin.image_url,
                "current_price": _decimal_to_float(snapshot.price),
                "market_cap": _decimal_to_float(snapshot.market_cap),
                "market_cap_rank": coin.market_cap_rank,
                "total_volume": _decimal_to_float(snapshot.total_volume),
                "ath": _decimal_to_float(snapshot.ath),
                "price_change_percentage_1h": _decimal_to_float(snapshot.change_1h) or 0.0,
                "price_change_percentage_24h": _decimal_to_float(snapshot.change_24h) or 0.0,
                "price_change_percentage_7d": _decimal_to_float(snapshot.change_7d) or 0.0,
                "last_snapshot_at": snapshot.recorded_at,
                "vs_currency": snapshot.vs_currency,
                "kpis": kpis,
            }
        )

    return results




def get_coin_detail_from_db(
    coin_id: str,
    vs_currency: str = "usd",
    days: int | None = None,
    max_points: int = 200,
) -> Dict[str, Any]:
    """Recupera el detalle de una moneda usando la serie almacenada en PostgreSQL."""
    vs = vs_currency.lower()

    with session_scope() as session:
        coin = (
            session.execute(select(Coin).where(Coin.coingecko_id == coin_id))
            .scalar_one_or_none()
        )
        if coin is None:
            raise ValueError(f"No existe la moneda '{coin_id}' en la base sincronizada")

        series_stmt = (
            select(CoinSeries)
            .where(CoinSeries.coin_id == coin.id)
            .where(CoinSeries.vs_currency == vs)
            .order_by(CoinSeries.recorded_at.asc())
        )
        series_rows = session.execute(series_stmt).scalars().all()

        snapshots_stmt = (
            select(CoinSnapshot)
            .where(CoinSnapshot.coin_id == coin.id)
            .where(CoinSnapshot.vs_currency == vs)
            .order_by(CoinSnapshot.recorded_at.asc())
        )
        if days is not None and days > 0:
            since = datetime.now(timezone.utc) - timedelta(days=days)
            snapshots_stmt = snapshots_stmt.where(CoinSnapshot.recorded_at >= since)
        snapshot_rows = session.execute(snapshots_stmt).scalars().all()

    now = datetime.now(timezone.utc)
    since_filter = None
    if days is not None and days > 0:
        since_filter = now - timedelta(days=days)

    filtered_series = [s for s in series_rows if since_filter is None or s.recorded_at >= since_filter]
    if filtered_series:
        limited_series = filtered_series[-max_points:]
        prices_series = [
            [int(s.recorded_at.timestamp() * 1000), _decimal_to_float(s.price) or 0.0]
            for s in limited_series
        ]
    else:
        limited_snapshots = snapshot_rows[-max_points:]
        prices_series = [
            [int(s.recorded_at.timestamp() * 1000), _decimal_to_float(s.price) or 0.0]
            for s in limited_snapshots
            if s.price is not None
        ]

    if not prices_series:
        raise ValueError(f"No hay serie almacenada para '{coin_id}' en {vs}.")

    last_snapshot = snapshot_rows[-1] if snapshot_rows else None
    if last_snapshot is not None:
        current_price = _decimal_to_float(last_snapshot.price)
        market_cap = _decimal_to_float(last_snapshot.market_cap)
        total_volume = _decimal_to_float(last_snapshot.total_volume)
        ath = _decimal_to_float(last_snapshot.ath)
        change_1h = _decimal_to_float(last_snapshot.change_1h)
        change_24h = _decimal_to_float(last_snapshot.change_24h)
        change_7d = _decimal_to_float(last_snapshot.change_7d)
    elif filtered_series:
        last_series = filtered_series[-1]
        current_price = _decimal_to_float(last_series.price)
        market_cap = None
        total_volume = None
        ath = None
        change_1h = None
        change_24h = None
        change_7d = None
    else:
        raise ValueError(f"No hay informacion reciente para '{coin_id}' en {vs}.")

    return {
        "id": coin.coingecko_id,
        "symbol": coin.symbol.lower(),
        "nombre": coin.name,
        "description": coin.description,
        "image": coin.image_url,
        "current_price": current_price,
        "market_cap": market_cap,
        "market_cap_rank": coin.market_cap_rank,
        "total_volume": total_volume,
        "ath": ath,
        "price_change_percentage_1h": change_1h,
        "price_change_percentage_24h": change_24h,
        "price_change_percentage_7d": change_7d,
        "prices_series": prices_series,
    }

