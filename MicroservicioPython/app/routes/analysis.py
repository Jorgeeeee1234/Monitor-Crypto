from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Query

from ..schemas import AnalysisResult
from ..services import analyse_symbol, MarketDataUnavailable

router = APIRouter()


@router.get("/analysis/{symbol}", response_model=AnalysisResult)
def analyse(
    symbol: str = Path(..., description="Simbolo de la criptomoneda"),
    vs: str = Query("usd", description="Divisa de referencia"),
    days: int = Query(7, ge=1, le=90, description="Ventana temporal (dias) para los KPIs"),
) -> AnalysisResult:
    try:
        data = analyse_symbol(symbol=symbol, vs_currency=vs, days=days)
        return AnalysisResult(**data)
    except MarketDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
