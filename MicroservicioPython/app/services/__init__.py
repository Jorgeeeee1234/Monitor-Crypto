"""Reexporta funciones de la capa de servicios.

Este archivo permite que se puedan importar directamente las funciones de
servicio desde ``app.services``.  Sin este archivo, la importación
``from ..services import fetch_prices`` fallaría porque ``services`` se
considera un paquete implícito sin atributos.

Las funciones se definen en :mod:`app.services.external` y se vuelven a
exportar aquí para simplificar las importaciones en los módulos de rutas.
"""

from .external import fetch_prices
from .market import get_latest_prices, get_coin_detail_from_db
from .analytics import analyse_symbol, MarketDataUnavailable
from .sync import (
    sync_market_data,
    sync_historical_series,
    ensure_recent_market_data,
    start_background_sync,
    stop_background_sync,
    ensure_initial_sync,
)

__all__ = [
    "fetch_prices",
    "get_latest_prices",
    "get_coin_detail_from_db",
    "analyse_symbol",
    "MarketDataUnavailable",
    "sync_market_data",
    "sync_historical_series",
    "ensure_recent_market_data",
    "start_background_sync",
    "stop_background_sync",
    "ensure_initial_sync",
]
