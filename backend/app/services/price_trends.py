from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Crop, Market, MarketPrice

STABLE_THRESHOLD_PERCENT = Decimal("1.00")
PERCENT_QUANTUM = Decimal("0.01")


@dataclass(frozen=True)
class PriceTrend:
    crop: Crop
    market: Market
    oldest_price: Decimal | None
    oldest_date: date | None
    latest_price: Decimal | None
    latest_date: date | None
    absolute_change: Decimal | None
    percentage_change: Decimal | None
    trend_direction: str


def calculate_price_trend(crop: Crop, market: Market, price_records: list[MarketPrice]) -> PriceTrend:
    """Analyze prices by date; duplicate dates are averaged before comparison."""
    prices_by_date: dict[date, list[Decimal]] = {}
    for record in price_records:
        prices_by_date.setdefault(record.price_date, []).append(record.price_per_unit)

    if len(prices_by_date) < 2:
        return PriceTrend(crop, market, None, None, None, None, None, None, "INSUFFICIENT_DATA")

    daily_prices = {
        price_date: (sum(values, Decimal("0")) / Decimal(len(values))).quantize(PERCENT_QUANTUM, rounding=ROUND_HALF_UP)
        for price_date, values in prices_by_date.items()
    }
    ordered_dates = sorted(daily_prices)
    oldest_date, latest_date = ordered_dates[0], ordered_dates[-1]
    oldest_price, latest_price = daily_prices[oldest_date], daily_prices[latest_date]
    absolute_change = (latest_price - oldest_price).quantize(PERCENT_QUANTUM, rounding=ROUND_HALF_UP)
    if oldest_price == 0:
        percentage_change = None
        trend_direction = "STABLE" if latest_price == 0 else "RISING"
    else:
        percentage_change = ((absolute_change / oldest_price) * Decimal("100")).quantize(PERCENT_QUANTUM, rounding=ROUND_HALF_UP)
        if abs(percentage_change) <= STABLE_THRESHOLD_PERCENT:
            trend_direction = "STABLE"
        elif percentage_change > 0:
            trend_direction = "RISING"
        else:
            trend_direction = "FALLING"
    return PriceTrend(crop, market, oldest_price, oldest_date, latest_price, latest_date, absolute_change, percentage_change, trend_direction)


def get_price_trends(db: Session, crop_id: UUID, market_id: UUID | None = None) -> tuple[Crop | None, list[PriceTrend]]:
    crop = db.get(Crop, crop_id)
    if crop is None:
        return None, []

    market_statement = select(Market).where(Market.is_active.is_(True)).order_by(Market.name)
    if market_id is not None:
        market_statement = market_statement.where(Market.id == market_id)
    markets = list(db.scalars(market_statement))
    trends = []
    for market in markets:
        records = list(
            db.scalars(
                select(MarketPrice)
                .where(MarketPrice.crop_id == crop_id, MarketPrice.market_id == market.id)
                .order_by(MarketPrice.price_date, MarketPrice.created_at, MarketPrice.id)
            )
        )
        trends.append(calculate_price_trend(crop, market, records))
    return crop, trends