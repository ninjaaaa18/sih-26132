from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Market, MarketPrice, ProduceLot

CENT = Decimal("0.01")
MASS_UNITS_IN_KG = {
    "kg": Decimal("1"),
    "kilogram": Decimal("1"),
    "kilograms": Decimal("1"),
    "quintal": Decimal("100"),
    "quintals": Decimal("100"),
    "tonne": Decimal("1000"),
    "tonnes": Decimal("1000"),
}


@dataclass(frozen=True)
class NetRealizationCalculation:
    market: Market
    market_price: MarketPrice
    price_unit: str
    quantity_in_price_unit: Decimal
    gross_value: Decimal
    estimated_transport_cost: Decimal
    net_realization: Decimal


def estimate_transport_cost(produce_lot: ProduceLot, market: Market) -> Decimal:
    """Return the flat controlled-demo estimate; no live logistics pricing is used."""
    return Decimal("250.00")


def convert_quantity_to_price_unit(quantity: Decimal, quantity_unit: str, price_unit: str) -> Decimal:
    quantity_factor = MASS_UNITS_IN_KG.get(quantity_unit.strip().lower())
    price_factor = MASS_UNITS_IN_KG.get(price_unit.strip().lower())
    if quantity_factor is None or price_factor is None:
        raise ValueError(f"Unsupported mass unit conversion: {quantity_unit} to {price_unit}")
    return (quantity * quantity_factor / price_factor).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def calculate_net_realization(
    produce_lot: ProduceLot,
    market: Market,
    market_price: MarketPrice,
    estimated_transport_cost: Decimal | None = None,
) -> NetRealizationCalculation:
    quantity_in_price_unit = convert_quantity_to_price_unit(produce_lot.quantity, produce_lot.unit, market_price.unit)
    gross_value = (quantity_in_price_unit * market_price.price_per_unit).quantize(CENT, rounding=ROUND_HALF_UP)
    transport_cost = (estimated_transport_cost if estimated_transport_cost is not None else estimate_transport_cost(produce_lot, market)).quantize(CENT, rounding=ROUND_HALF_UP)
    return NetRealizationCalculation(
        market=market,
        market_price=market_price,
        price_unit=market_price.unit,
        quantity_in_price_unit=quantity_in_price_unit,
        gross_value=gross_value,
        estimated_transport_cost=transport_cost,
        net_realization=(gross_value - transport_cost).quantize(CENT, rounding=ROUND_HALF_UP),
    )


def calculate_lot_net_realizations(db: Session, lot_id: UUID, market_id: UUID | None = None) -> tuple[ProduceLot | None, list[NetRealizationCalculation]]:
    produce_lot = db.get(ProduceLot, lot_id)
    if produce_lot is None:
        return None, []

    market_statement = select(Market).where(Market.is_active.is_(True)).order_by(Market.name)
    if market_id is not None:
        market_statement = market_statement.where(Market.id == market_id)
    markets = list(db.scalars(market_statement))
    calculations = []
    for market in markets:
        latest_price = db.scalar(
            select(MarketPrice)
            .where(MarketPrice.market_id == market.id, MarketPrice.crop_id == produce_lot.crop_id)
            .order_by(MarketPrice.price_date.desc(), MarketPrice.created_at.desc())
            .limit(1)
        )
        if latest_price is not None:
            calculations.append(calculate_net_realization(produce_lot, market, latest_price))
    return produce_lot, calculations