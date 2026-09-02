from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from uuid import UUID

from app.models.entities import ProduceLot
from app.services.net_realization import NetRealizationCalculation, calculate_lot_net_realizations
from app.services.price_trends import PriceTrend, get_price_trends

TREND_PRIORITY = {"RISING": 3, "STABLE": 2, "FALLING": 1, "INSUFFICIENT_DATA": 0}


@dataclass(frozen=True)
class RecommendationCandidate:
    calculation: NetRealizationCalculation
    trend: PriceTrend


@dataclass(frozen=True)
class RecommendationResult:
    produce_lot: ProduceLot
    recommended: Optional[RecommendationCandidate]
    next_best: Optional[RecommendationCandidate]
    advantage: Optional[Decimal]
    reasons: list[str]


def rank_candidates(candidates: list[RecommendationCandidate]) -> list[RecommendationCandidate]:
    return sorted(
        candidates,
        key=lambda candidate: (
            -candidate.calculation.net_realization,
            -TREND_PRIORITY.get(candidate.trend.trend_direction, 0),
            -(candidate.trend.percentage_change if candidate.trend.percentage_change is not None else Decimal("-Infinity")),
            candidate.calculation.market.name,
        ),
    )


def build_recommendation(produce_lot: ProduceLot, candidates: list[RecommendationCandidate]) -> RecommendationResult:
    ranked = rank_candidates(candidates)
    if not ranked:
        return RecommendationResult(produce_lot, None, None, None, ["No comparable market data available"])

    recommended = ranked[0]
    next_best = ranked[1] if len(ranked) > 1 else None
    advantage = (recommended.calculation.net_realization - next_best.calculation.net_realization) if next_best else None
    reasons = ["Highest estimated net realization"]
    direction = recommended.trend.trend_direction.lower().replace("_", " ")
    reasons.append(f"Price trend is {direction}")
    if next_best:
        reasons.append(f"₹{advantage:.2f} higher estimated net realization than the next-best market")
    return RecommendationResult(produce_lot, recommended, next_best, advantage, reasons)


def get_recommendation(db, lot_id: UUID) -> tuple[ProduceLot | None, RecommendationResult | None]:
    produce_lot, calculations = calculate_lot_net_realizations(db, lot_id)
    if produce_lot is None:
        return None, None
    _, trends = get_price_trends(db, produce_lot.crop_id)
    trends_by_market = {trend.market.id: trend for trend in trends}
    candidates = [
        RecommendationCandidate(calculation, trends_by_market[calculation.market.id])
        for calculation in calculations
        if calculation.market.id in trends_by_market
    ]
    return produce_lot, build_recommendation(produce_lot, candidates)