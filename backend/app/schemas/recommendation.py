from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class RecommendedMarketRead(BaseModel):
    market_id: UUID
    market_name: str
    price: Decimal
    price_unit: str
    net_realization: Decimal
    trend_direction: str
    percentage_change: Optional[Decimal]


class RecommendationRead(BaseModel):
    produce_lot_id: UUID
    recommended_market: Optional[RecommendedMarketRead]
    next_best_market: Optional[RecommendedMarketRead]
    advantage_over_next_best: Optional[Decimal]
    reasons: list[str]