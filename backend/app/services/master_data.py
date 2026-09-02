from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Crop, FarmerProfile, Location, Market, MarketPrice


def list_crops(db: Session) -> list[Crop]:
    return list(db.scalars(select(Crop).order_by(Crop.name)))


def list_locations(db: Session) -> list[Location]:
    return list(db.scalars(select(Location).order_by(Location.state, Location.district, Location.village)))


def get_farmer_profile(db: Session, farmer_profile_id: UUID) -> FarmerProfile | None:
    return db.get(FarmerProfile, farmer_profile_id)


def list_markets(db: Session) -> list[tuple[Market, Location]]:
    statement = select(Market, Location).join(Location, Market.location_id == Location.id).where(Market.is_active.is_(True)).order_by(Market.name)
    return list(db.execute(statement).all())


def list_market_prices(db: Session, crop_id: UUID | None = None, market_id: UUID | None = None, price_date=None) -> list[tuple[MarketPrice, Market]]:
    statement = select(MarketPrice, Market).join(Market, MarketPrice.market_id == Market.id).order_by(MarketPrice.price_date.desc(), Market.name)
    if crop_id is not None:
        statement = statement.where(MarketPrice.crop_id == crop_id)
    if market_id is not None:
        statement = statement.where(MarketPrice.market_id == market_id)
    if price_date is not None:
        statement = statement.where(MarketPrice.price_date == price_date)
    return list(db.execute(statement).all())