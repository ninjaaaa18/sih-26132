from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.entities import BuyerProfile, FarmerProfile, LotStatus, Order, ProduceLot
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


def get_farmer_produce_lots(db: Session, farmer_profile_id: UUID) -> tuple[FarmerProfile | None, list[ProduceLot]]:
    farmer = db.get(FarmerProfile, farmer_profile_id)
    if farmer is None:
        return None, []
    lots = db.scalars(
        select(ProduceLot)
        .where(ProduceLot.farmer_profile_id == farmer_profile_id)
        .order_by(ProduceLot.created_at.desc())
    ).all()
    return farmer, list(lots)


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


def get_lot_order_info(db: Session, lot_id: UUID) -> dict | None:
    order = db.scalar(
        select(Order)
        .options(joinedload(Order.buyer).joinedload(BuyerProfile.user))
        .where(Order.produce_lot_id == lot_id)
        .order_by(Order.order_date.desc())
        .limit(1)
    )
    if order is None:
        return None
    return {
        "order_id": order.id,
        "buyer_company_name": order.buyer.company_name,
        "agreed_price": order.agreed_price,
        "agreed_quantity": order.agreed_quantity,
        "unit": order.unit,
        "order_status": order.order_status.value,
        "order_date": order.order_date,
    }