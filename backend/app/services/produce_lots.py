from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.entities import LotStatus, ProduceLot
from app.schemas.produce_lot import ProduceLotCreate

SELLABLE_LOT_STATUSES = {LotStatus.DRAFT, LotStatus.ACTIVE, LotStatus.MATCHED}


class SellProduceLotError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def create_produce_lot(db: Session, lot_data: ProduceLotCreate) -> ProduceLot:
    produce_lot = ProduceLot(**lot_data.model_dump())
    db.add(produce_lot)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise
    db.refresh(produce_lot)
    return produce_lot


def get_produce_lot(db: Session, lot_id: UUID) -> ProduceLot | None:
    return db.get(ProduceLot, lot_id)


def sell_produce_lot(db: Session, lot_id: UUID) -> ProduceLot:
    produce_lot = db.get(ProduceLot, lot_id)
    if produce_lot is None:
        raise SellProduceLotError("Produce lot not found")
    if produce_lot.lot_status not in SELLABLE_LOT_STATUSES:
        raise SellProduceLotError(
            f"Produce lot cannot be put up for sale because its status is {produce_lot.lot_status.value}"
        )
    produce_lot.lot_status = LotStatus.ACTIVE
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise
    db.refresh(produce_lot)
    return produce_lot