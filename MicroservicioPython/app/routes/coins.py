from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

from ..schemas import CoinDetail
from ..services import ensure_recent_market_data, get_coin_detail_from_db

router = APIRouter()


@router.get("/coin/{coin_id}", response_model=CoinDetail)
def get_coin_detail(
    coin_id: str = Path(..., description="Identificador de la moneda"),
    vs: str = Query("usd", description="Divisa de referencia"),
    days: str = Query("7", description="Dias de historico a devolver"),
) -> CoinDetail:
    try:
        has_data = ensure_recent_market_data(vs_currency=vs)
        if not has_data:
            raise HTTPException(
                status_code=503,
                detail="No hay datos sincronizados. Ejecuta la actualizacion manual antes de consultar el detalle.",
            )

        try:
            days_int = int(days)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="El parametro 'days' debe ser numerico") from exc

        window = days_int if days_int > 0 else None
        raw = get_coin_detail_from_db(coin_id, vs_currency=vs, days=window)
        return CoinDetail(**raw)
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
