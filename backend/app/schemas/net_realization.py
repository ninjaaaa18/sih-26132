from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class NetRealizationRead(BaseModel):
    market_id: UUID
    market_name: str
    crop_id: UUID
    crop_name: str
    quantity: Decimal
    quantity_unit: str
    quantity_in_price_unit: Decimal
    price: Decimal
    price_unit: str
    price_date: date
    gross_value: Decimal
    estimated_transport_cost: Decimal
    transport_cost_type: str = "estimated"
    net_realization: Decimal


class NetRealizationComparisonRead(BaseModel):
    results: list[NetRealizationRead]
    highest_estimated_net_realization: Optional[NetRealizationRead]