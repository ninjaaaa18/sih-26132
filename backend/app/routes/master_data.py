from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.master_data import CropRead, FarmerProfileRead, LocationRead
from app.services.master_data import get_farmer_profile, list_crops, list_locations

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