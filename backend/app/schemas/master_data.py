from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.entities import KycStatus


class CropRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    scientific_name: Optional[str]
    category: Optional[str]
    unit_default: str
    seasonality: Optional[str]
    created_at: datetime
    updated_at: datetime


class LocationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    state: str
    district: str
    tehsil: Optional[str]
    village: Optional[str]
    pincode: Optional[str]
    latitude: Optional[Decimal]
    longitude: Optional[Decimal]
    created_at: datetime
    updated_at: datetime


class FarmerProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    full_name: str
    gender: Optional[str]
    date_of_birth: Optional[date]
    land_size_acre: Optional[Decimal]
    farm_name: Optional[str]
    location_id: UUID
    kyc_status: KycStatus
    income_bucket: Optional[str]
    created_at: datetime
    updated_at: datetime


class MarketRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    location_id: UUID
    district: str
    state: str
    market_type: Optional[str]
    is_active: bool


class MarketPriceRead(BaseModel):
    id: UUID
    crop_id: UUID
    market_id: UUID
    price: Decimal
    price_unit: str
    date: date
    market_name: str
    source: Optional[str]