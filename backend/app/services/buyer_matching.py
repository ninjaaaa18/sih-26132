from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.entities import BuyerDemand, BuyerProfile, BuyerType, DemandStatus, MarketPrice, ProduceLot, VerificationStatus
from app.services.net_realization import normalize_quantity_to_kg

VERIFICATION_PRIORITY = {
    VerificationStatus.VERIFIED: 0,
    VerificationStatus.PENDING: 1,
    VerificationStatus.REJECTED: 2,
}


@dataclass(frozen=True)
class BuyerMatchResult:
    buyer_profile_id: UUID
    buyer_demand_id: UUID
    company_name: str
    buyer_type: BuyerType
    verification_status: VerificationStatus
    location: object
    crop_id: UUID
    crop_name: str
    demanded_quantity: Decimal
    demand_unit: str
    preferred_price: Optional[Decimal]
    preferred_price_unit: str
    demand_status: DemandStatus
    match_score: int
    match_percentage: int
    match_explanation: str


def is_demand_active(demand: BuyerDemand, today: date) -> bool:
    if demand.demand_status != DemandStatus.ACTIVE:
        return False
    if demand.valid_from > today:
        return False
    if demand.valid_until is not None and demand.valid_until < today:
        return False
    return True


def quantity_compatible(lot_quantity: Decimal, lot_unit: str, demand_quantity: Decimal, demand_unit: str) -> bool:
    lot_kg = normalize_quantity_to_kg(lot_quantity, lot_unit)
    demand_kg = normalize_quantity_to_kg(demand_quantity, demand_unit)
    return demand_kg >= lot_kg


def get_best_market_price(db: Session, crop_id: UUID) -> tuple[Optional[Decimal], str]:
    market_price = db.scalar(
        select(MarketPrice)
        .where(MarketPrice.crop_id == crop_id)
        .order_by(MarketPrice.price_date.desc(), MarketPrice.price_per_unit.desc(), MarketPrice.created_at.desc())
        .limit(1)
    )
    if market_price is None:
        return None, "quintal"
    return market_price.price_per_unit, market_price.unit


def normalize_price_to_quintal(price: Decimal, unit: str) -> Decimal:
    price_kg = price / normalize_quantity_to_kg(Decimal("1"), unit)
    return (price_kg * Decimal("100")).quantize(Decimal("0.01"))


def build_match_explanation(
    quantity_ok: bool,
    price_ok: bool,
    same_district: bool,
    verified: bool,
) -> str:
    parts: list[str] = []
    if quantity_ok:
        parts.append("Demand can cover the full lot quantity")
    if price_ok:
        parts.append("Preferred price meets or exceeds current market levels")
    if same_district:
        parts.append("Buyer operates in the same district")
    if verified:
        parts.append("Verified buyer profile")
    if not parts:
        return "Crop match only"
    return "; ".join(parts)


def calculate_match_score(
    quantity_ok: bool,
    price_ok: bool,
    same_district: bool,
    verified: bool,
) -> int:
    score = 0
    if quantity_ok:
        score += 40
    if price_ok:
        score += 30
    if same_district:
        score += 20
    if verified:
        score += 10
    return score


def sort_matches(matches: list[BuyerMatchResult]) -> list[BuyerMatchResult]:
    return sorted(
        matches,
        key=lambda match: (
            VERIFICATION_PRIORITY.get(match.verification_status, 99),
            -match.match_score,
            -(match.preferred_price or Decimal("0")),
            match.company_name.lower(),
        ),
    )


def build_buyer_match(
    demand: BuyerDemand,
    produce_lot: ProduceLot,
    best_market_price: Optional[Decimal],
    best_market_price_unit: str,
) -> Optional[BuyerMatchResult]:
    quantity_ok = quantity_compatible(produce_lot.quantity, produce_lot.unit, demand.quantity, demand.unit)
    if not quantity_ok:
        return None

    buyer = demand.buyer
    buyer_location = buyer.location
    lot_location = produce_lot.location
    same_district = buyer_location.district.lower() == lot_location.district.lower()

    preferred_price = demand.preferred_price
    preferred_price_unit = best_market_price_unit
    price_ok = False
    if preferred_price is not None and best_market_price is not None:
        preferred_quintal = normalize_price_to_quintal(preferred_price, best_market_price_unit)
        market_quintal = normalize_price_to_quintal(best_market_price, best_market_price_unit)
        price_ok = preferred_quintal >= market_quintal

    verified = buyer.verification_status == VerificationStatus.VERIFIED
    score = calculate_match_score(quantity_ok, price_ok, same_district, verified)
    explanation = build_match_explanation(quantity_ok, price_ok, same_district, verified)

    return BuyerMatchResult(
        buyer_profile_id=buyer.id,
        buyer_demand_id=demand.id,
        company_name=buyer.company_name,
        buyer_type=buyer.buyer_type,
        verification_status=buyer.verification_status,
        location=buyer_location,
        crop_id=demand.crop_id,
        crop_name=demand.crop.name,
        demanded_quantity=demand.quantity,
        demand_unit=demand.unit,
        preferred_price=preferred_price,
        preferred_price_unit=preferred_price_unit,
        demand_status=demand.demand_status,
        match_score=score,
        match_percentage=min(score, 100),
        match_explanation=explanation,
    )


def get_buyer_matches(db: Session, produce_lot_id: UUID) -> tuple[ProduceLot | None, list[BuyerMatchResult]]:
    produce_lot = db.scalar(
        select(ProduceLot)
        .options(joinedload(ProduceLot.location), joinedload(ProduceLot.crop))
        .where(ProduceLot.id == produce_lot_id)
    )
    if produce_lot is None:
        return None, []

    today = date.today()
    demands = db.scalars(
        select(BuyerDemand)
        .join(BuyerDemand.buyer)
        .options(
            joinedload(BuyerDemand.buyer).joinedload(BuyerProfile.location),
            joinedload(BuyerDemand.crop),
        )
        .where(
            BuyerDemand.crop_id == produce_lot.crop_id,
            BuyerDemand.demand_status == DemandStatus.ACTIVE,
        )
    ).all()

    best_market_price, best_market_price_unit = get_best_market_price(db, produce_lot.crop_id)
    matches: list[BuyerMatchResult] = []
    for demand in demands:
        if not is_demand_active(demand, today):
            continue
        match = build_buyer_match(demand, produce_lot, best_market_price, best_market_price_unit)
        if match is not None:
            matches.append(match)

    return produce_lot, sort_matches(matches)
