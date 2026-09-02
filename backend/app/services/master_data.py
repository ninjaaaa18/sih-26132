from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Crop, FarmerProfile, Location


def list_crops(db: Session) -> list[Crop]:
    return list(db.scalars(select(Crop).order_by(Crop.name)))


def list_locations(db: Session) -> list[Location]:
    return list(db.scalars(select(Location).order_by(Location.state, Location.district, Location.village)))


def get_farmer_profile(db: Session, farmer_profile_id: UUID) -> FarmerProfile | None:
    return db.get(FarmerProfile, farmer_profile_id)