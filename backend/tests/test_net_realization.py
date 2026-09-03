import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services.net_realization import (
    FIXED_COST_PER_TRIP,
    ROAD_DISTANCE_FACTOR,
    VARIABLE_RATE_PER_KM,
    VEHICLE_CAPACITY_KG,
    calculate_net_realization,
    estimate_transport_cost,
    haversine_distance_km,
    normalize_quantity_to_kg,
)
from app.services.price_trends import PriceTrend
from app.services.recommendations import RecommendationCandidate, build_recommendation


FARMER_LOCATION = SimpleNamespace(latitude=Decimal("20.146"), longitude=Decimal("74.238"))
VASHI_LOCATION = SimpleNamespace(latitude=Decimal("19.077"), longitude=Decimal("72.998"))


def lot(quantity="500", unit="kg", location=FARMER_LOCATION):
    return SimpleNamespace(quantity=Decimal(quantity), unit=unit, location=location)


def market(name="APMC Vashi", location=VASHI_LOCATION):
    return SimpleNamespace(name=name, id=name, location=location)


class NetRealizationTests(unittest.TestCase):
    def test_haversine_distance_matches_demo_coordinates(self):
        distance = haversine_distance_km(Decimal("20.146"), Decimal("74.238"), Decimal("19.077"), Decimal("72.998"))
        self.assertEqual(distance, Decimal("176.06"))

    def test_500_kg_transport_cost_matches_approved_formula(self):
        self.assertEqual(estimate_transport_cost(lot(), market()), Decimal("2201.43"))

    def test_1000_kg_transport_cost_uses_one_trip(self):
        self.assertEqual(estimate_transport_cost(lot("1000"), market()), Decimal("4102.86"))

    def test_quantity_just_over_capacity_uses_two_trips(self):
        self.assertEqual(estimate_transport_cost(lot("1001"), market()), Decimal("4406.66"))

    def test_supported_units_normalize_to_kilograms(self):
        self.assertEqual(normalize_quantity_to_kg(Decimal("5"), "quintal"), Decimal("500.0000"))
        self.assertEqual(normalize_quantity_to_kg(Decimal("1.5"), "tonne"), Decimal("1500.0000"))
        self.assertEqual(normalize_quantity_to_kg(Decimal("500"), "kg"), Decimal("500.0000"))

    def test_unsupported_units_fail_clearly(self):
        with self.assertRaisesRegex(ValueError, "Unsupported mass unit"):
            normalize_quantity_to_kg(Decimal("1"), "bag")

    def test_missing_farmer_coordinates_fail_without_fallback_distance(self):
        missing_location = SimpleNamespace(latitude=None, longitude=None)
        with self.assertRaisesRegex(ValueError, "both locations"):
            estimate_transport_cost(lot(location=missing_location), market())

    def test_missing_market_coordinates_fail_without_fallback_distance(self):
        missing_location = SimpleNamespace(latitude=None, longitude=None)
        with self.assertRaisesRegex(ValueError, "both locations"):
            estimate_transport_cost(lot(), market(location=missing_location))

    def test_invalid_coordinates_fail_validation(self):
        with self.assertRaisesRegex(ValueError, "Latitude"):
            haversine_distance_km(Decimal("91"), Decimal("74"), Decimal("19"), Decimal("73"))
        with self.assertRaisesRegex(ValueError, "Longitude"):
            haversine_distance_km(Decimal("20"), Decimal("181"), Decimal("19"), Decimal("73"))

    def test_transport_cost_is_rounded_to_cents(self):
        cost = estimate_transport_cost(lot("500"), market())
        self.assertEqual(cost.as_tuple().exponent, -2)
        self.assertEqual(cost, Decimal("2201.43"))

    def test_net_realization_uses_distance_based_transport_cost(self):
        price = SimpleNamespace(price_per_unit=Decimal("2550"), unit="quintal")
        calculation = calculate_net_realization(lot(), market(), price)
        self.assertEqual(calculation.gross_value, Decimal("12750.00"))
        self.assertEqual(calculation.estimated_transport_cost, Decimal("2201.43"))
        self.assertEqual(calculation.net_realization, Decimal("10548.57"))

    def test_different_markets_produce_different_transport_costs(self):
        price = SimpleNamespace(price_per_unit=Decimal("2550"), unit="quintal")
        nearby = calculate_net_realization(lot(), market("APMC Lasalgaon", FARMER_LOCATION), price)
        distant = calculate_net_realization(lot(), market(), price)
        self.assertNotEqual(nearby.estimated_transport_cost, distant.estimated_transport_cost)
        self.assertGreater(nearby.net_realization, distant.net_realization)

    def test_recommendation_ranks_updated_net_realization(self):
        price = SimpleNamespace(price_per_unit=Decimal("2550"), unit="quintal")
        nearby_market = market("APMC Lasalgaon", FARMER_LOCATION)
        distant_market = market()
        nearby_calculation = calculate_net_realization(lot(), nearby_market, price)
        distant_calculation = calculate_net_realization(lot(), distant_market, price)
        trend = lambda selected_market: PriceTrend(
            SimpleNamespace(id="crop", name="Tomato"),
            selected_market,
            Decimal("2500"),
            date(2026, 8, 31),
            Decimal("2550"),
            date(2026, 9, 2),
            Decimal("50"),
            Decimal("2"),
            "RISING",
        )
        result = build_recommendation(
            lot(),
            [
                RecommendationCandidate(distant_calculation, trend(distant_market)),
                RecommendationCandidate(nearby_calculation, trend(nearby_market)),
            ],
        )
        self.assertEqual(result.recommended.calculation.market.name, "APMC Lasalgaon")
        self.assertEqual(result.recommended.calculation.estimated_transport_cost, Decimal("300.00"))


if __name__ == "__main__":
    unittest.main()
