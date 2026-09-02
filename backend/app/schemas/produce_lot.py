from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import LotStatus


class ProduceLotCreate(BaseModel):
    farmer_profile_id: UUID
    crop_id: UUID
    lot_number: str = Field(min_length=1, max_length=100)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    unit: str = Field(min_length=1, max_length=20)
    quality_grade: Optional[str] = Field(default=None, max_length=50)
    harvest_date: date
    expected_delivery_date: Optional[date] = None
    lot_status: LotStatus = LotStatus.DRAFT
    location_id: UUID
    price_expectation: Optional[Decimal] = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    notes: Optional[str] = None


class ProduceLotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    farmer_profile_id: UUID
    crop_id: UUID
    lot_number: str
    quantity: Decimal
    unit: str
    quality_grade: Optional[str]
    harvest_date: date
    expected_delivery_date: Optional[date]
    lot_status: LotStatus
    location_id: UUID
    price_expectation: Optional[Decimal]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime