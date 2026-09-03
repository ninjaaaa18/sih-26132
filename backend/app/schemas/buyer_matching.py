from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.entities import BuyerType, DemandStatus, VerificationStatus


class BuyerMatchLocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    state: str
    district: str
    tehsil: Optional[str]
    village: Optional[str]


class BuyerMatchRead(BaseModel):
    buyer_profile_id: UUID
    buyer_demand_id: UUID
    company_name: str
    buyer_type: BuyerType
    verification_status: VerificationStatus
    location: BuyerMatchLocationRead
    crop_id: UUID
    crop_name: str
    demanded_quantity: Decimal
    demand_unit: str
    preferred_price: Optional[Decimal]
    preferred_price_unit: str
    demand_status: DemandStatus
    match_score: int
    match_percentage: int
    match_explanation: str


class BuyerMatchListRead(BaseModel):
    produce_lot_id: UUID
    matches: list[BuyerMatchRead]
