from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.entities import ProduceLot
from app.schemas.produce_lot import ProduceLotCreate


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