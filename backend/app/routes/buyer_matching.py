from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.schemas.buyer_matching import BuyerMatchListRead, BuyerMatchLocationRead, BuyerMatchRead
from app.schemas.buyer_offer import BuyerOfferCreate, BuyerOfferListRead, BuyerOfferRead
from app.schemas.order import OfferAcceptanceRead, OrderRead
from app.services.buyer_matching import get_buyer_matches
from app.services.buyer_offers import OfferServiceError, accept_offer, create_demo_offer, get_offers_for_lot, serialize_offer, serialize_order

produce_lot_buyer_router = APIRouter(prefix="/api/v1/produce-lots", tags=["buyer-matching"])
buyer_offer_router = APIRouter(prefix="/api/v1/buyer-offers", tags=["buyer-offers"])


def _match_read(match) -> BuyerMatchRead:
    return BuyerMatchRead(
        buyer_profile_id=match.buyer_profile_id,
        buyer_demand_id=match.buyer_demand_id,
        company_name=match.company_name,
        buyer_type=match.buyer_type,
        verification_status=match.verification_status,
        location=BuyerMatchLocationRead.model_validate(match.location),
        crop_id=match.crop_id,
        crop_name=match.crop_name,
        demanded_quantity=match.demanded_quantity,
        demand_unit=match.demand_unit,
        preferred_price=match.preferred_price,
        preferred_price_unit=match.preferred_price_unit,
        demand_status=match.demand_status,
        match_score=match.match_score,
        match_percentage=match.match_percentage,
        match_explanation=match.match_explanation,
    )


def _offer_read(offer) -> BuyerOfferRead:
    payload = serialize_offer(offer)
    return BuyerOfferRead(**payload)


@produce_lot_buyer_router.get("/{lot_id}/buyer-matches", response_model=BuyerMatchListRead)
def read_buyer_matches(lot_id: UUID, db: Session = Depends(get_db)) -> BuyerMatchListRead:
    produce_lot, matches = get_buyer_matches(db, lot_id)
    if produce_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produce lot not found")
    return BuyerMatchListRead(produce_lot_id=produce_lot.id, matches=[_match_read(match) for match in matches])


@produce_lot_buyer_router.get("/{lot_id}/buyer-offers", response_model=BuyerOfferListRead)
def read_buyer_offers(lot_id: UUID, db: Session = Depends(get_db)) -> BuyerOfferListRead:
    produce_lot, offers = get_offers_for_lot(db, lot_id)
    if produce_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produce lot not found")
    return BuyerOfferListRead(produce_lot_id=produce_lot.id, offers=[_offer_read(offer) for offer in offers])


@produce_lot_buyer_router.post("/{lot_id}/buyer-offers", response_model=BuyerOfferRead, status_code=status.HTTP_201_CREATED)
def create_buyer_offer(lot_id: UUID, payload: BuyerOfferCreate, db: Session = Depends(get_db)) -> BuyerOfferRead:
    try:
        offer = create_demo_offer(db, lot_id, payload.buyer_profile_id)
    except OfferServiceError as error:
        status_code = status.HTTP_404_NOT_FOUND if "not found" in error.message.lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=error.message) from error
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Buyer offer conflicts with an existing record or references missing data",
        ) from error
    return _offer_read(offer)


@buyer_offer_router.post("/{offer_id}/accept", response_model=OfferAcceptanceRead)
def accept_buyer_offer(offer_id: UUID, db: Session = Depends(get_db)) -> OfferAcceptanceRead:
    try:
        offer, order = accept_offer(db, offer_id)
    except OfferServiceError as error:
        status_code = status.HTTP_404_NOT_FOUND if "not found" in error.message.lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=error.message) from error
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not accept offer because of a database conflict",
        ) from error

    order_payload = serialize_order(order, offer.buyer.company_name)
    return OfferAcceptanceRead(offer=_offer_read(offer), order=OrderRead(**order_payload))
