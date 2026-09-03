from dataclasses import dataclass
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from math import asin, cos, radians, sin, sqrt
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Market, MarketPrice, ProduceLot

CENT = Decimal("0.01")
ROAD_DISTANCE_FACTOR = Decimal("1.20")
VEHICLE_CAPACITY_KG = Decimal("1000")
FIXED_COST_PER_TRIP = Decimal("300")
VARIABLE_RATE_PER_KM = Decimal("18")
EARTH_RADIUS_KM = 6371.0088
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


def haversine_distance_km(latitude1: Decimal, longitude1: Decimal, latitude2: Decimal, longitude2: Decimal) -> Decimal:
    coordinates = (latitude1, longitude1, latitude2, longitude2)
    if not all(Decimal(str(coordinate)).is_finite() for coordinate in coordinates):
        raise ValueError("Location coordinates must be finite")
    if not -90 <= latitude1 <= 90 or not -90 <= latitude2 <= 90:
        raise ValueError("Latitude must be between -90 and 90")
    if not -180 <= longitude1 <= 180 or not -180 <= longitude2 <= 180:
        raise ValueError("Longitude must be between -180 and 180")
    latitude_delta = radians(float(latitude2 - latitude1))
    longitude_delta = radians(float(longitude2 - longitude1))
    latitude1_radians = radians(float(latitude1))
    latitude2_radians = radians(float(latitude2))
    haversine = sin(latitude_delta / 2) ** 2 + cos(latitude1_radians) * cos(latitude2_radians) * sin(longitude_delta / 2) ** 2
    return Decimal(str(2 * EARTH_RADIUS_KM * asin(sqrt(haversine)))).quantize(CENT, rounding=ROUND_HALF_UP)


def normalize_quantity_to_kg(quantity: Decimal, quantity_unit: str) -> Decimal:
    quantity_factor = MASS_UNITS_IN_KG.get(quantity_unit.strip().lower())
    if quantity_factor is None:
        raise ValueError(f"Unsupported mass unit: {quantity_unit}")
    return (quantity * quantity_factor).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def estimate_transport_cost(produce_lot: ProduceLot, market: Market) -> Decimal:
    """Estimate deterministic demo transport cost from locations and load utilization."""
    farmer_location = produce_lot.location
    market_location = market.location
    if farmer_location is None or market_location is None:
        raise ValueError("Transport cost requires farmer and market locations")
    coordinates = (farmer_location.latitude, farmer_location.longitude, market_location.latitude, market_location.longitude)
    if any(coordinate is None for coordinate in coordinates):
        raise ValueError("Transport cost requires latitude and longitude for both locations")
    distance_km = haversine_distance_km(*coordinates)
    effective_distance_km = (distance_km * ROAD_DISTANCE_FACTOR).quantize(CENT, rounding=ROUND_HALF_UP)
    quantity_kg = normalize_quantity_to_kg(produce_lot.quantity, produce_lot.unit)
    trips = int((quantity_kg / VEHICLE_CAPACITY_KG).to_integral_value(rounding=ROUND_CEILING))
    variable_cost = effective_distance_km * VARIABLE_RATE_PER_KM * quantity_kg / VEHICLE_CAPACITY_KG
    return (FIXED_COST_PER_TRIP * trips + variable_cost).quantize(CENT, rounding=ROUND_HALF_UP)


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