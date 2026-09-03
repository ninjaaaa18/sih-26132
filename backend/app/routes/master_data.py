from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.entities import Market
from app.schemas.master_data import CropRead, FarmerProfileRead, LocationRead, MarketPriceRead, MarketRead
from app.schemas.price_trends import PriceTrendRead
from app.services.price_trends import get_price_trends
from app.services.master_data import get_farmer_profile, list_crops, list_locations, list_market_prices, list_markets

router = APIRouter(prefix="/api/v1", tags=["master-data"])


@router.get("/crops", response_model=list[CropRead])
def read_crops(db: Session = Depends(get_db)) -> list[CropRead]:
    return list_crops(db)


@router.get("/locations", response_model=list[LocationRead])
def read_locations(db: Session = Depends(get_db)) -> list[LocationRead]:
    return list_locations(db)


@router.get("/farmer-profiles/{farmer_profile_id}", response_model=FarmerProfileRead)
def read_farmer_profile(farmer_profile_id: UUID, db: Session = Depends(get_db)) -> FarmerProfileRead:
    farmer_profile = get_farmer_profile(db, farmer_profile_id)
    if farmer_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Farmer profile not found")
    return farmer_profile


@router.get("/markets", response_model=list[MarketRead])
def read_markets(db: Session = Depends(get_db)) -> list[MarketRead]:
    return [
        MarketRead(
            id=market.id,
            name=market.name,
            location_id=market.location_id,
            district=location.district,
            state=location.state,
            market_type=market.market_type.value if market.market_type else None,
            is_active=market.is_active,
        )
        for market, location in list_markets(db)
    ]


@router.get("/market-prices", response_model=list[MarketPriceRead])
def read_market_prices(
    crop_id: UUID | None = None,
    market_id: UUID | None = None,
    price_date: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
) -> list[MarketPriceRead]:
    return [
        MarketPriceRead(
            id=price.id,
            crop_id=price.crop_id,
            market_id=price.market_id,
            price=price.price_per_unit,
            price_unit=price.unit,
            date=price.price_date,
            market_name=market.name,
            source=price.source,
        )
        for price, market in list_market_prices(db, crop_id, market_id, price_date)
    ]


@router.get("/price-trends", response_model=list[PriceTrendRead])
def read_price_trends(crop_id: UUID, market_id: UUID | None = None, db: Session = Depends(get_db)) -> list[PriceTrendRead]:
    crop, trends = get_price_trends(db, crop_id, market_id)
    if crop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop not found")
    if market_id is not None and not trends:
        if db.get(Market, market_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Market not found")
    return [
        PriceTrendRead(
            crop_id=trend.crop.id,
            crop_name=trend.crop.name,
            market_id=trend.market.id,
            market_name=trend.market.name,
            price_unit="quintal",
            oldest_price=trend.oldest_price,
            oldest_date=trend.oldest_date,
            latest_price=trend.latest_price,
            latest_date=trend.latest_date,
            absolute_change=trend.absolute_change,
            percentage_change=trend.percentage_change,
            trend_direction=trend.trend_direction,
        )
        for trend in trends
    ]