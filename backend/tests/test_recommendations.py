import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException

from app.models.entities import ProduceLot
from app.routes.produce_lots import read_recommendation
from app.services.net_realization import NetRealizationCalculation
from app.services.price_trends import PriceTrend
from app.services.recommendations import RecommendationCandidate, build_recommendation, rank_candidates


def candidate(name, net, direction="RISING", percentage=Decimal("2.13")):
    market = SimpleNamespace(id=uuid4(), name=name)
    price = SimpleNamespace(price_per_unit=Decimal("2550.00"), unit="quintal")
    calculation = NetRealizationCalculation(market, price, "quintal", Decimal("5.0000"), Decimal(net) + Decimal("250.00"), Decimal("250.00"), Decimal(net))
    trend = PriceTrend(SimpleNamespace(id=uuid4(), name="Tomato"), market, Decimal("2350.00"), date(2026, 8, 31), Decimal("2400.00"), date(2026, 9, 2), Decimal("50.00"), percentage, direction)
    return RecommendationCandidate(calculation, trend)


class RecommendationTests(unittest.TestCase):
    def test_highest_net_is_primary_and_next_best_is_correct(self):
        result = build_recommendation(SimpleNamespace(id=uuid4()), [candidate("APMC Pune", "12300.00"), candidate("APMC Vashi", "12500.00"), candidate("APMC Lasalgaon", "12000.00")])
        self.assertEqual(result.recommended.calculation.market.name, "APMC Vashi")
        self.assertEqual(result.next_best.calculation.market.name, "APMC Pune")
        self.assertEqual(result.advantage, Decimal("200.00"))

    def test_trend_is_secondary_only_when_net_ties(self):
        candidates = [candidate("Stable Market", "12500.00", "STABLE", Decimal("0.00")), candidate("Rising Market", "12500.00", "RISING", Decimal("2.00"))]
        self.assertEqual(rank_candidates(candidates)[0].trend.trend_direction, "RISING")

    def test_percentage_is_tertiary_and_name_is_final_tiebreaker(self):
        candidates = [candidate("B Market", "12500.00", "RISING", Decimal("2.00")), candidate("A Market", "12500.00", "RISING", Decimal("2.00"))]
        self.assertEqual(rank_candidates(candidates)[0].calculation.market.name, "A Market")

    def test_insufficient_trend_does_not_block_recommendation(self):
        result = build_recommendation(SimpleNamespace(id=uuid4()), [candidate("APMC Vashi", "12500.00", "INSUFFICIENT_DATA", None)])
        self.assertEqual(result.recommended.trend.trend_direction, "INSUFFICIENT_DATA")
        self.assertEqual(result.recommended.calculation.net_realization, Decimal("12500.00"))

    def test_no_comparable_data_is_clear(self):
        result = build_recommendation(SimpleNamespace(id=uuid4()), [])
        self.assertIsNone(result.recommended)
        self.assertEqual(result.reasons, ["No comparable market data available"])

    def test_route_returns_404_for_invalid_lot(self):
        with patch("app.routes.produce_lots.get_recommendation", return_value=(None, None)):
            with self.assertRaises(HTTPException) as context:
                read_recommendation(uuid4(), SimpleNamespace())
        self.assertEqual(context.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()