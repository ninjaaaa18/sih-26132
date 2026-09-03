from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    BuyerDemand,
    BuyerOffer,
    BuyerProfile,
    DemandStatus,
    LotStatus,
    OfferStatus,
    Order,
    OrderStatus,
    ProduceLot,
)
from app.services.buyer_matching import get_best_market_price, is_demand_active


class OfferServiceError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


def _offer_to_read(offer: BuyerOffer) -> dict:
    return {
        "id": offer.id,
        "produce_lot_id": offer.produce_lot_id,
        "buyer_profile_id": offer.buyer_profile_id,
        "buyer_company_name": offer.buyer.company_name,
        "offered_price": offer.offered_price,
        "quantity": offer.quantity,
        "unit": offer.unit,
        "offer_status": offer.offer_status,
        "offer_message": offer.offer_message,
        "valid_until": offer.valid_until,
        "created_at": offer.created_at,
        "updated_at": offer.updated_at,
    }


def get_offers_for_lot(db: Session, produce_lot_id: UUID) -> tuple[ProduceLot | None, list[BuyerOffer]]:
    produce_lot = db.get(ProduceLot, produce_lot_id)
    if produce_lot is None:
        return None, []

    offers = db.scalars(
        select(BuyerOffer)
        .options(joinedload(BuyerOffer.buyer))
        .where(BuyerOffer.produce_lot_id == produce_lot_id)
        .order_by(BuyerOffer.created_at.desc())
    ).all()
    return produce_lot, list(offers)


def _find_pending_offer(db: Session, produce_lot_id: UUID, buyer_profile_id: UUID) -> BuyerOffer | None:
    return db.scalar(
        select(BuyerOffer).where(
            BuyerOffer.produce_lot_id == produce_lot_id,
            BuyerOffer.buyer_profile_id == buyer_profile_id,
            BuyerOffer.offer_status == OfferStatus.PENDING,
        )
    )


def _resolve_offer_price(db: Session, produce_lot: ProduceLot, buyer: BuyerProfile) -> Decimal:
    today = date.today()
    demand = db.scalar(
        select(BuyerDemand)
        .where(
            BuyerDemand.buyer_profile_id == buyer.id,
            BuyerDemand.crop_id == produce_lot.crop_id,
            BuyerDemand.demand_status == DemandStatus.ACTIVE,
        )
        .order_by(BuyerDemand.preferred_price.desc().nullslast())
    )
    if demand is not None and is_demand_active(demand, today) and demand.preferred_price is not None:
        return demand.preferred_price

    market_price, _ = get_best_market_price(db, produce_lot.crop_id)
    if market_price is not None:
        return market_price
    if produce_lot.price_expectation is not None:
        return produce_lot.price_expectation
    return Decimal("0")


def create_demo_offer(db: Session, produce_lot_id: UUID, buyer_profile_id: UUID) -> BuyerOffer:
    produce_lot = db.scalar(
        select(ProduceLot)
        .options(joinedload(ProduceLot.crop))
        .where(ProduceLot.id == produce_lot_id)
    )
    if produce_lot is None:
        raise OfferServiceError("Produce lot not found")

    buyer = db.scalar(
        select(BuyerProfile)
        .options(joinedload(BuyerProfile.location))
        .where(BuyerProfile.id == buyer_profile_id)
    )
    if buyer is None:
        raise OfferServiceError("Buyer profile not found")

    existing_offer = _find_pending_offer(db, produce_lot_id, buyer_profile_id)
    if existing_offer is not None:
        db.refresh(existing_offer, attribute_names=["buyer"])
        return existing_offer

    offered_price = _resolve_offer_price(db, produce_lot, buyer)
    offer = BuyerOffer(
        produce_lot_id=produce_lot.id,
        buyer_profile_id=buyer.id,
        offered_price=offered_price,
        quantity=produce_lot.quantity,
        unit=produce_lot.unit,
        offer_status=OfferStatus.PENDING,
        offer_message=f"DEMO offer from {buyer.company_name} for lot {produce_lot.lot_number}.",
        valid_until=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(offer)
    if produce_lot.lot_status in {LotStatus.DRAFT, LotStatus.ACTIVE, LotStatus.MATCHED}:
        produce_lot.lot_status = LotStatus.OFFERED

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise

    db.refresh(offer)
    db.refresh(offer, attribute_names=["buyer"])
    return offer


def accept_offer(db: Session, offer_id: UUID) -> tuple[BuyerOffer, Order]:
    offer = db.scalar(
        select(BuyerOffer)
        .options(
            joinedload(BuyerOffer.buyer),
            joinedload(BuyerOffer.produce_lot).joinedload(ProduceLot.farmer),
        )
        .where(BuyerOffer.id == offer_id)
    )
    if offer is None:
        raise OfferServiceError("Buyer offer not found")

    if offer.offer_status != OfferStatus.PENDING:
        raise OfferServiceError(f"Offer cannot be accepted because its status is {offer.offer_status.value}")

    now = datetime.now(timezone.utc)
    if offer.valid_until is not None and offer.valid_until <= now:
        offer.offer_status = OfferStatus.EXPIRED
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise
        raise OfferServiceError("Offer has expired")

    produce_lot = offer.produce_lot
    if offer.quantity != produce_lot.quantity or offer.unit != produce_lot.unit:
        raise OfferServiceError("Offer quantity must match the full produce lot for this MVP flow")

    if produce_lot.lot_status in {LotStatus.ACCEPTED, LotStatus.SOLD, LotStatus.CANCELLED}:
        raise OfferServiceError("Produce lot is no longer available for acceptance")

    existing_order = db.scalar(select(Order).where(Order.buyer_offer_id == offer.id))
    if existing_order is not None:
        raise OfferServiceError("An order already exists for this offer")

    offer.offer_status = OfferStatus.ACCEPTED
    db.flush()

    order = Order(
        produce_lot_id=produce_lot.id,
        buyer_offer_id=offer.id,
        farmer_profile_id=produce_lot.farmer_profile_id,
        buyer_profile_id=offer.buyer_profile_id,
        order_status=OrderStatus.CREATED,
        agreed_price=offer.offered_price,
        agreed_quantity=offer.quantity,
        unit=offer.unit,
        order_date=now,
    )
    db.add(order)
    produce_lot.lot_status = LotStatus.ACCEPTED

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise OfferServiceError("Could not create order from this offer")

    db.refresh(offer)
    db.refresh(order)
    db.refresh(offer, attribute_names=["buyer"])
    return offer, order


def serialize_offer(offer: BuyerOffer) -> dict:
    return _offer_to_read(offer)


def serialize_order(order: Order, buyer_company_name: str) -> dict:
    return {
        "id": order.id,
        "produce_lot_id": order.produce_lot_id,
        "buyer_offer_id": order.buyer_offer_id,
        "farmer_profile_id": order.farmer_profile_id,
        "buyer_profile_id": order.buyer_profile_id,
        "buyer_company_name": buyer_company_name,
        "order_status": order.order_status,
        "agreed_price": order.agreed_price,
        "agreed_quantity": order.agreed_quantity,
        "unit": order.unit,
        "order_date": order.order_date,
    }
