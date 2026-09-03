from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import OfferStatus


class BuyerOfferCreate(BaseModel):
    buyer_profile_id: UUID


class BuyerOfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    produce_lot_id: UUID
    buyer_profile_id: UUID
    buyer_company_name: str
    offered_price: Decimal
    quantity: Decimal
    unit: str
    offer_status: OfferStatus
    offer_message: Optional[str]
    valid_until: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class BuyerOfferListRead(BaseModel):
    produce_lot_id: UUID
    offers: list[BuyerOfferRead]
