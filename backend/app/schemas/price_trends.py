from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class PriceTrendRead(BaseModel):
    crop_id: UUID
    crop_name: str
    market_id: UUID
    market_name: str
    price_unit: str
    oldest_price: Optional[Decimal]
    oldest_date: Optional[date]
    latest_price: Optional[Decimal]
    latest_date: Optional[date]
    absolute_change: Optional[Decimal]
    percentage_change: Optional[Decimal]
    trend_direction: str