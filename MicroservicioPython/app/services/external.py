from __future__ import annotations

from typing import Any, Dict, List, Optional

import requests

from ..config import get_settings

# Simple in-memory cache to avoid hitting the external API excessively.
# We use a dictionary mapping cache keys to a tuple of (timestamp, data).
# When requesting data, we return the cached value if it hasn't expired.
# This helps prevent 429 "Too Many Requests" errors from the CoinGecko API.
import time

# Cache dictionary and TTL (time-to-live) in seconds.  Adjust TTL as needed.
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL: int = 300  # cache entries live for 5 minutes

def _cache_get(key: str) -> Optional[Any]:
    """Retrieve a cached value if it hasn't expired."""
    entry = _CACHE.get(key)
    if not entry:
        return None
    timestamp, data = entry
    # If entry is too old, remove it and return None
    if (time.time() - timestamp) > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return data

def _cache_set(key: str, data: Any) -> None:
    """Store a value in the cache with the current timestamp."""
    _CACHE[key] = (time.time(), data)

def _get_session() -> requests.Session:
    """Crea una sesión HTTP reutilizable."""
    return requests.Session()

def fetch_prices(vs_currency: str = "usd", per_page: int = 50, page: int = 1) -> List[Dict[str, Any]]:
    """Obtiene un listado de criptomonedas con sus métricas principales.

    Para evitar saturar el servicio externo de CoinGecko, se utiliza un cache
    en memoria.  Si existe un valor en la cache para los parámetros
    especificados y no ha expirado, se devuelve dicho valor.  En caso
    contrario se realiza la llamada HTTP y se almacena la respuesta en la
    cache.
    """
    # Construir una clave de cache basada en los parámetros
    cache_key = f"prices:{vs_currency}:{per_page}:{page}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    settings = get_settings()
    url = f"{settings.coingecko_api_base}/coins/markets"
    params = {
        "vs_currency": vs_currency,
        "order": "market_cap_desc",
        "per_page": per_page,
        "page": page,
        "sparkline": "false",
        "price_change_percentage": "1h,24h,7d",
    }
    session = _get_session()
    response = session.get(url, params=params, timeout=settings.external_timeout)
    response.raise_for_status()
    raw_data = response.json()
    data: List[Dict[str, Any]] = []
    for c in raw_data:
        data.append({
            "id": c.get("id"),
            "symbol": c.get("symbol"),
            "nombre": c.get("name"),
            "image": c.get("image"),
            "current_price": c.get("current_price"),
            "market_cap": c.get("market_cap"),
            "market_cap_rank": c.get("market_cap_rank"),
            "total_volume": c.get("total_volume"),
            "ath": c.get("ath"),
            "price_change_percentage_1h": c.get("price_change_percentage_1h_in_currency") or 0,
            "price_change_percentage_24h": c.get("price_change_percentage_24h_in_currency") or 0,
            "price_change_percentage_7d": c.get("price_change_percentage_7d_in_currency") or 0,
        })
    # Guardar en cache antes de devolver
    _cache_set(cache_key, data)
    return data

def fetch_coin_detail(
    coin_id: str,
    vs_currency: str = "usd",
    days: str = "7",
    interval: Optional[str] = None,
) -> Dict[str, Any]:
    """Obtiene el detalle de una moneda y su serie histórica de precios.

    Al igual que en `fetch_prices`, se utiliza un cache en memoria para
    almacenar resultados y reducir el número de peticiones hacia el
    servicio externo.  La clave de cache se construye con el id de la
    moneda y los parámetros relevantes.
    """
    cache_key = f"coin:{coin_id}:{vs_currency}:{days}:{interval}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    settings = get_settings()
    session = _get_session()
    info_url = f"{settings.coingecko_api_base}/coins/{coin_id}"
    info_params = {
        "localization": "false",
        "tickers": "false",
        "market_data": "true",
        "community_data": "false",
        "developer_data": "false",
        "sparkline": "false",
    }
    info_resp = session.get(info_url, params=info_params, timeout=settings.external_timeout)
    info_resp.raise_for_status()
    coin = info_resp.json()
    chart_url = f"{settings.coingecko_api_base}/coins/{coin_id}/market_chart"
    chart_params: Dict[str, Any] = {"vs_currency": vs_currency, "days": days}
    if interval:
        chart_params["interval"] = interval
    chart_resp = session.get(chart_url, params=chart_params, timeout=settings.external_timeout)
    chart_resp.raise_for_status()
    ch = chart_resp.json()
    out: Dict[str, Any] = {
        "id": coin.get("id"),
        "symbol": coin.get("symbol"),
        "nombre": coin.get("name"),
        "description": (coin.get("description") or {}).get("en") or "",
        "image": (coin.get("image") or {}).get("large"),
        "current_price": (coin.get("market_data") or {}).get("current_price", {}).get(vs_currency),
        "market_cap": (coin.get("market_data") or {}).get("market_cap", {}).get(vs_currency),
        "market_cap_rank": coin.get("market_cap_rank"),
        "total_volume": (coin.get("market_data") or {}).get("total_volume", {}).get(vs_currency),
        "ath": (coin.get("market_data") or {}).get("ath", {}).get(vs_currency),
        "price_change_percentage_1h": (coin.get("market_data") or {}).get("price_change_percentage_1h_in_currency", {}).get(vs_currency),
        "price_change_percentage_24h": (coin.get("market_data") or {}).get("price_change_percentage_24h_in_currency", {}).get(vs_currency),
        "price_change_percentage_7d": (coin.get("market_data") or {}).get("price_change_percentage_7d_in_currency", {}).get(vs_currency),
        "prices_series": ch.get("prices", []),
    }
    # Guardar en cache
    _cache_set(cache_key, out)
    return out
