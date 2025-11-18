from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PriceKPIs(BaseModel):
    avg_price_24h: Optional[float] = Field(
        None, description="Precio promedio en las últimas 24 horas"
    )
    avg_price_7d: Optional[float] = Field(
        None, description="Precio promedio en los últimos 7 días"
    )
    min_price_7d: Optional[float] = Field(
        None, description="Precio mínimo observado en los últimos 7 días"
    )
    max_price_7d: Optional[float] = Field(
        None, description="Precio máximo observado en los últimos 7 días"
    )
    volatility_7d: Optional[float] = Field(
        None, description="Volatilidad (desviación estándar) en 7 días"
    )
    volume_market_cap_ratio: Optional[float] = Field(
        None, description="Relación volumen/market cap del último snapshot"
    )


class PriceItem(BaseModel):
    id: str = Field(..., description="Identificador único de la moneda (CoinGecko ID)")
    symbol: str = Field(..., description="Ticker de la moneda")
    nombre: Optional[str] = Field(None, description="Nombre completo de la moneda")
    image: Optional[str] = Field(None, description="URL del icono")
    current_price: Optional[float] = Field(None, alias="current_price")
    market_cap: Optional[float] = Field(None)
    market_cap_rank: Optional[int] = Field(None)
    total_volume: Optional[float] = Field(None)
    ath: Optional[float] = Field(None)
    price_change_percentage_1h: float = Field(0.0)
    price_change_percentage_24h: float = Field(0.0)
    price_change_percentage_7d: float = Field(0.0)
    last_snapshot_at: Optional[datetime] = Field(
        None, description="Fecha/hora del snapshot más reciente", alias="last_snapshot_at"
    )
    vs_currency: Optional[str] = Field(
        None, description="Divisa en la que se calculó el snapshot"
    )
    kpis: Optional[PriceKPIs] = Field(None, description="Indicadores calculados a partir de los snapshots")

    model_config = ConfigDict(populate_by_name=True)
