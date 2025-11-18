from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AnalysisResult(BaseModel):
    symbol: str = Field(..., description="Ticker analizado")
    trend: str = Field(..., description="Tendencia detectada (bullish/bearish/sideways)")
    variation_pct: Optional[float] = Field(
        None, description="Variación porcentual desde el inicio del período"
    )
    last_price: Optional[float] = Field(None, description="Precio del último snapshot")
    average_price: Optional[float] = Field(
        None, description="Precio medio en el período analizado"
    )
    min_price: Optional[float] = Field(None, description="Precio mínimo observado")
    max_price: Optional[float] = Field(None, description="Precio máximo observado")
    volatility: Optional[float] = Field(
        None, description="Volatilidad (desviación estándar) del período"
    )
    change_24h: Optional[float] = Field(None, description="Variación porcentual 24h")
    change_7d: Optional[float] = Field(None, description="Variación porcentual 7d")
    last_updated: Optional[datetime] = Field(
        None, description="Marca temporal del snapshot más reciente"
    )
    sample_size: int = Field(0, description="Número de snapshots evaluados")
    period_days: int = Field(7, description="Ventana temporal considerada (días)")
    vs_currency: Optional[str] = Field(
        None, description="Divisa en la que se calcularon los KPIs"
    )
