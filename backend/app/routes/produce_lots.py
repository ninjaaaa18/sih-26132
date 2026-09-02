from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.produce_lot import ProduceLotCreate, ProduceLotRead
from app.services.produce_lots import create_produce_lot, get_produce_lot

router = APIRouter(prefix="/api/v1/produce-lots", tags=["produce-lots"])


@router.post("", response_model=ProduceLotRead, status_code=status.HTTP_201_CREATED)
def create_lot(lot_data: ProduceLotCreate, db: Session = Depends(get_db)) -> ProduceLotRead:
    try:
        return create_produce_lot(db, lot_data)
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Produce lot conflicts with an existing record or references missing data",
        ) from error


@router.get("/{lot_id}", response_model=ProduceLotRead)
def read_lot(lot_id: UUID, db: Session = Depends(get_db)) -> ProduceLotRead:
    produce_lot = get_produce_lot(db, lot_id)
    if produce_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produce lot not found")
    return produce_lot