from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query

from ..schemas import PriceItem
from ..services import ensure_recent_market_data, get_latest_prices

router = APIRouter()


@router.get("/prices", response_model=List[PriceItem])
def list_prices(
    vs: str = Query("usd", description="Divisa de referencia"),
    per_page: int = Query(50, ge=1, le=250, description="Resultados por pagina"),
    page: int = Query(1, ge=1, description="Numero de pagina"),
) -> List[PriceItem]:
    try:
        has_data = ensure_recent_market_data(vs_currency=vs)
        if not has_data:
            raise HTTPException(
                status_code=503,
                detail="No hay datos sincronizados. Ejecuta la actualizacion manual antes de consultar precios.",
            )
        data = get_latest_prices(vs_currency=vs, per_page=per_page, page=page)
        return [PriceItem(**item) for item in data]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc