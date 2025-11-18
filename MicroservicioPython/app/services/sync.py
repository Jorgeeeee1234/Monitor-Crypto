from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, delete

from ..config import get_settings
from ..db import session_scope
from ..models import Coin, CoinSnapshot, CoinSeries
from .external import fetch_prices, fetch_coin_detail

logger = logging.getLogger(__name__)

_background_task: asyncio.Task | None = None


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ValueError, TypeError):
        return None


def sync_market_data(
    vs_currency: str | None = None,
    per_page: int | None = None,
    pages: int | None = None,
) -> int:
    """Descarga los datos de CoinGecko y guarda snapshots en PostgreSQL."""
    settings = get_settings()
    vs = (vs_currency or settings.sync_vs_currency).lower()
    per_page = per_page or settings.sync_per_page
    pages = pages or settings.sync_pages
    pages = max(1, pages)

    processed = 0
    now = datetime.now(timezone.utc)

    with session_scope() as session:
        for page in range(1, pages + 1):
            batch = fetch_prices(vs_currency=vs, per_page=per_page, page=page)
            if not batch:
                break

            for entry in batch:
                coin = (
                    session.execute(
                        select(Coin).where(Coin.coingecko_id == entry.get("id"))
                    ).scalar_one_or_none()
                )
                if coin is None:
                    coin = Coin(coingecko_id=entry.get("id"))

                coin.symbol = (entry.get("symbol") or "").upper()
                coin.name = entry.get("nombre") or entry.get("id") or coin.symbol
                coin.image_url = entry.get("image")
                coin.market_cap_rank = entry.get("market_cap_rank")
                coin.last_synced_at = now

                needs_description = not coin.description
                if needs_description:
                    try:
                        details = fetch_coin_detail(entry.get("id"), vs_currency=vs, days="1")
                        description = (details.get("description") or "").strip()
                        coin.description = description or coin.description
                        if not coin.image_url:
                            coin.image_url = details.get("image")
                    except Exception as detail_error:
                        logger.warning(
                            "No se pudo obtener la descripcion para %s: %s",
                            entry.get("id"),
                            detail_error,
                        )

                session.add(coin)
                session.flush()  # asegura que coin.id esta disponible

                exists = (
                    session.execute(
                        select(CoinSnapshot.id)
                        .where(CoinSnapshot.coin_id == coin.id)
                        .where(CoinSnapshot.vs_currency == vs)
                        .where(CoinSnapshot.recorded_at == now)
                    ).scalar_one_or_none()
                )
                if exists:
                    continue

                snapshot = CoinSnapshot(
                    coin_id=coin.id,
                    recorded_at=now,
                    vs_currency=vs,
                    price=_to_decimal(entry.get("current_price")),
                    market_cap=_to_decimal(entry.get("market_cap")),
                    total_volume=_to_decimal(entry.get("total_volume")),
                    change_1h=_to_decimal(entry.get("price_change_percentage_1h")),
                    change_24h=_to_decimal(entry.get("price_change_percentage_24h")),
                    change_7d=_to_decimal(entry.get("price_change_percentage_7d")),
                    ath=_to_decimal(entry.get("ath")),
                )
                session.add(snapshot)
                processed += 1

            if len(batch) < per_page:
                break

    logger.info(
        "Sincronizacion completada: %s snapshots nuevos (%s, per_page=%s, pages=%s)",
        processed,
        vs,
        per_page,
        pages,
    )
    return processed




def sync_historical_series(
    vs_currency: str | None = None,
    days: int | None = None,
    coin_ids: list[str] | None = None,
) -> tuple[int, int, list[str]]:
    """Descarga series historicas y las almacena en la tabla coin_series.

    Devuelve una tupla (entradas_insertadas, monedas_afectadas, lista_moneda_ids).
    """
    settings = get_settings()
    vs = (vs_currency or settings.sync_vs_currency).lower()
    window_days = days or 90
    interval = "daily" if window_days >= 1 else None
    normalized_filter = None
    if coin_ids:
        normalized_filter = sorted({str(value).strip().lower() for value in coin_ids if value})

    # Garantiza que existan monedas en la base antes de sincronizar series.
    with session_scope() as session:
        base_query = select(func.count(Coin.id))
        if normalized_filter:
            base_query = base_query.where(Coin.coingecko_id.in_(normalized_filter))
        coin_count = session.execute(base_query).scalar_one() or 0
    if coin_count == 0:
        target_log = f"{normalized_filter}" if normalized_filter else "todas las monedas"
        logger.info("No hay monedas registradas para %s. Ejecutando sincronizacion de mercado previa.", target_log)
        try:
            sync_market_data(vs_currency=vs)
        except Exception as exc:  # pragma: no cover - logging de errores
            logger.warning("Fallo creando monedas previas a la serie historica: %s", exc)

    total_entries = 0
    coins_processed = 0
    processed_names: list[str] = []

    with session_scope() as session:
        coin_query = select(Coin)
        if normalized_filter:
            coin_query = coin_query.where(Coin.coingecko_id.in_(normalized_filter))
        coins = session.execute(coin_query).scalars().all()
        if not coins:
            logger.warning("No se encontraron monedas con los criterios solicitados: %s", normalized_filter)
            return 0, 0, []

        for coin in coins:
            try:
                details = fetch_coin_detail(
                    coin.coingecko_id,
                    vs_currency=vs,
                    days=str(window_days),
                    interval=interval,
                )
            except Exception as exc:  # pragma: no cover - logging de errores
                logger.warning("No se pudo obtener la serie historica para %s: %s", coin.coingecko_id, exc)
                continue

            series = details.get('prices_series') or []
            session.execute(
                delete(CoinSeries).where(
                    CoinSeries.coin_id == coin.id,
                    CoinSeries.vs_currency == vs,
                )
            )

            entries_added = 0
            for timestamp_ms, price in series:
                recorded_at = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
                price_decimal = _to_decimal(price)
                if price_decimal is None:
                    continue
                session.add(
                    CoinSeries(
                        coin_id=coin.id,
                        vs_currency=vs,
                        recorded_at=recorded_at,
                        price=price_decimal,
                    )
                )
                entries_added += 1

            if entries_added:
                coins_processed += 1
                total_entries += entries_added
                processed_names.append(coin.coingecko_id)

    logger.info(
        "Series historicas sincronizadas: %s puntos en %s monedas (%s, window=%s dias)",
        total_entries,
        coins_processed,
        vs,
        window_days,
    )
    return total_entries, coins_processed, processed_names

def ensure_recent_market_data(
    vs_currency: str | None = None,
    max_age_minutes: int | None = None,
) -> bool:
    """Comprueba si existen datos recientes en la base de datos.

    Devuelve ``True`` cuando los datos estan disponibles y frescos.
    Si no hay snapshots o estan desactualizados devuelve ``False`` sin lanzar sincronizacion.
    """
    settings = get_settings()
    vs = (vs_currency or settings.sync_vs_currency).lower()
    freshness = max_age_minutes or settings.data_freshness_minutes

    with session_scope() as session:
        last_snapshot_at = (
            session.execute(
                select(func.max(CoinSnapshot.recorded_at))
                .where(CoinSnapshot.vs_currency == vs)
            ).scalar_one_or_none()
        )

    if last_snapshot_at is None:
        logger.warning("No hay snapshots almacenados para %s.", vs)
        return False

    age = datetime.now(timezone.utc) - last_snapshot_at
    if age > timedelta(minutes=freshness):
        logger.info(
            "Snapshots para %s tienen %s minutos: requieren actualizacin manual.",
            vs,
            age.total_seconds() / 60,
        )
        return False

    return True


async def ensure_initial_sync() -> None:
    """Inicializacin sin sincronizacion autom!tica (requiere accin manual)."""
    logger.info("Sincronizacion inicial manual requerida si la base esta vacia.")


async def _periodic_sync_loop() -> None:
    settings = get_settings()
    interval = max(30, settings.sync_interval_seconds)
    vs = settings.sync_vs_currency
    per_page = settings.sync_per_page
    pages = settings.sync_pages

    while True:
        try:
            await asyncio.get_running_loop().run_in_executor(
                None, sync_market_data, vs, per_page, pages
            )
        except Exception as exc:  # pragma: no cover - logging de errores
            logger.exception("Error en la sincronizacion periodica: %s", exc)
        await asyncio.sleep(interval)


async def start_background_sync() -> asyncio.Task | None:
    """Inicia la tarea periodica en segundo plano si esta habilitada."""
    settings = get_settings()
    if not settings.sync_enable_scheduler or settings.sync_interval_seconds <= 0:
        logger.info("Scheduler de sincronizacion deshabilitado por configuracion.")
        return None

    global _background_task  # pylint: disable=global-statement
    if _background_task and not _background_task.done():
        return _background_task

    loop = asyncio.get_running_loop()
    _background_task = loop.create_task(_periodic_sync_loop())
    logger.info(
        "Scheduler de sincronizacion iniciado (intervalo %s segundos, vs=%s).",
        settings.sync_interval_seconds,
        settings.sync_vs_currency,
    )
    return _background_task


async def stop_background_sync(task: asyncio.Task | None = None) -> None:
    """Detiene la tarea periodica si esta activa."""
    global _background_task  # pylint: disable=global-statement
    active_task = task or _background_task
    if not active_task:
        return

    active_task.cancel()
    try:
        await active_task
    except asyncio.CancelledError:  # pragma: no cover - comportamiento esperado
        pass
    finally:
        _background_task = None
        logger.info("Scheduler de sincronizacion detenido.")
