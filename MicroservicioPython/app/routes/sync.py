from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..config import get_settings
from ..services import sync_market_data, sync_historical_series


class SyncRequest(BaseModel):
    vs_currency: Optional[str] = Field(None, description="Divisa base (por defecto la configuracion global)")
    per_page: Optional[int] = Field(None, ge=1, le=250, description="Numero de activos a sincronizar por pagina")
    pages: Optional[int] = Field(None, ge=1, le=10, description="Numero de paginas a solicitar")
    days: Optional[int] = Field(None, ge=1, le=365, description="Ventana de dias para la sincronizacion historica")
    coin_id: Optional[str] = Field(None, description="Identificador (CoinGecko) de la moneda a sincronizar")
    coin_ids: Optional[List[str]] = Field(None, description="Lista de monedas a sincronizar")


class SyncResponse(BaseModel):
    processed: int
    vs_currency: str
    per_page: int
    pages: int
    synced_at: datetime
    coins: Optional[int] = Field(None, description="Cantidad de monedas afectadas en la sincronizacion")
    coin_ids: Optional[list[str]] = Field(None, description="Identificadores de monedas procesadas")


router = APIRouter()


@router.post("/admin/sync", response_model=SyncResponse, status_code=status.HTTP_202_ACCEPTED)
def trigger_sync(payload: SyncRequest) -> SyncResponse:
    """
    Lanza manualmente la sincronizacion de precios desde CoinGecko.

    Este endpoint no aplica logica de permisos; se asume que el API Gateway
    valida que solo los usuarios autorizados puedan invocarlo.
    """
    settings = get_settings()
    vs = (payload.vs_currency or settings.sync_vs_currency).lower()
    per_page = payload.per_page or settings.sync_per_page
    pages = payload.pages or settings.sync_pages

    try:
        processed = sync_market_data(vs_currency=vs, per_page=per_page, pages=pages)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return SyncResponse(
        processed=processed,
        vs_currency=vs,
        per_page=per_page,
        pages=pages,
        synced_at=datetime.now(timezone.utc),
    )


@router.post('/admin/sync-series', response_model=SyncResponse, status_code=status.HTTP_202_ACCEPTED)
def trigger_sync_series(payload: SyncRequest) -> SyncResponse:
    """Sincroniza series historicas para graficas (por defecto 90 dias)."""
    settings = get_settings()
    vs = (payload.vs_currency or settings.sync_vs_currency).lower()
    target_days = payload.days or payload.per_page or payload.pages or 90
    coin_filter: list[str] | None = None
    if payload.coin_ids:
        coin_filter = payload.coin_ids
    elif payload.coin_id:
        coin_filter = [payload.coin_id]

    try:
        processed, coins, coin_ids = sync_historical_series(vs_currency=vs, days=target_days, coin_ids=coin_filter)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return SyncResponse(
        processed=processed,
        vs_currency=vs,
        per_page=target_days,
        pages=1,
        synced_at=datetime.now(timezone.utc),
        coins=coins,
        coin_ids=coin_ids,
    )
