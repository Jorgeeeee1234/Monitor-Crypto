from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field

class CoinDetail(BaseModel):
    id: str
    symbol: str
    nombre: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    market_cap_rank: Optional[int] = None
    total_volume: Optional[float] = None
    ath: Optional[float] = None
    price_change_percentage_1h: Optional[float] = None
    price_change_percentage_24h: Optional[float] = None
    price_change_percentage_7d: Optional[float] = None
    prices_series: List[List[float]] = Field(default_factory=list)