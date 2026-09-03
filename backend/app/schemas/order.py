from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.entities import OrderStatus
from app.schemas.buyer_offer import BuyerOfferRead


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    produce_lot_id: UUID
    buyer_offer_id: UUID
    farmer_profile_id: UUID
    buyer_profile_id: UUID
    buyer_company_name: str
    order_status: OrderStatus
    agreed_price: Decimal
    agreed_quantity: Decimal
    unit: str
    order_date: datetime


class OfferAcceptanceRead(BaseModel):
    offer: BuyerOfferRead
    order: OrderRead
