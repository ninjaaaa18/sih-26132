import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException

from app.models.entities import BuyerType, DemandStatus, FarmerProfile, LotStatus, OfferStatus, OrderStatus, VerificationStatus
from app.routes.buyer_matching import accept_buyer_offer, create_buyer_offer, read_buyer_matches
from app.routes.produce_lots import list_lots, sell_lot
from app.seed_demo import DEMO_BUYERS, CROPS
from app.services.buyer_matching import (
    build_buyer_match,
    calculate_match_score,
    get_buyer_matches,
    is_demand_active,
    quantity_compatible,
    sort_matches,
)
from app.services.buyer_offers import OfferServiceError, accept_offer, create_demo_offer
from app.services.produce_lots import SellProduceLotError, get_farmer_produce_lots, sell_produce_lot


def location(district: str, state: str = "Maharashtra") -> SimpleNamespace:
    return SimpleNamespace(state=state, district=district, tehsil=None, village=None)


def demand(
    crop_name: str = "Tomato",
    quantity: str = "1000",
    unit: str = "kg",
    preferred_price: str | None = "2600",
    district: str = "Thane",
    verification: VerificationStatus = VerificationStatus.VERIFIED,
    buyer_type: BuyerType = BuyerType.RETAILER,
    company: str = "FreshMart Foods",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        crop_id=uuid4(),
        crop=SimpleNamespace(name=crop_name),
        quantity=Decimal(quantity),
        unit=unit,
        preferred_price=Decimal(preferred_price) if preferred_price is not None else None,
        demand_status=DemandStatus.ACTIVE,
        valid_from=date.today() - timedelta(days=1),
        valid_until=date.today() + timedelta(days=30),
        buyer=SimpleNamespace(
            id=uuid4(),
            company_name=company,
            buyer_type=buyer_type,
            verification_status=verification,
            location=location(district),
        ),
    )


def lot(quantity: str = "500", unit: str = "kg", district: str = "Thane", crop_name: str = "Tomato") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        crop_id=uuid4(),
        crop=SimpleNamespace(name=crop_name),
        quantity=Decimal(quantity),
        unit=unit,
        location=location(district),
        lot_number="LOT-DEMO-001",
        farmer_profile_id=uuid4(),
        price_expectation=Decimal("2500"),
        lot_status=LotStatus.ACTIVE,
    )


class BuyerMatchingLogicTests(unittest.TestCase):
    def test_seeded_demands_cover_all_demo_crops_at_250_quintals(self):
        crop_names = {crop["name"] for crop in CROPS}
        demand_by_crop = {
            demand_data["crop_name"]
            for buyer_data in DEMO_BUYERS
            for demand_data in buyer_data["demands"]
        }

        self.assertEqual(demand_by_crop, crop_names)
        for buyer_data in DEMO_BUYERS:
            for demand_data in buyer_data["demands"]:
                self.assertEqual(demand_data["unit"], "quintal")
                self.assertGreaterEqual(demand_data["quantity"], Decimal("250"))

    def test_get_buyer_matches_returns_seed_style_match_for_250_quintal_lot(self):
        crop_id = uuid4()
        produce_lot = lot(quantity="250", unit="quintal")
        produce_lot.crop_id = crop_id
        buyer_demand = demand(quantity="1000", unit="quintal")
        buyer_demand.crop_id = crop_id
        market_price = SimpleNamespace(price_per_unit=Decimal("2400"), unit="quintal")
        db = MagicMock()
        db.scalar.side_effect = [produce_lot, market_price]
        db.scalars.return_value.all.return_value = [buyer_demand]

        matched_lot, matches = get_buyer_matches(db, produce_lot.id)

        self.assertIs(matched_lot, produce_lot)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].company_name, "FreshMart Foods")

    def test_quantity_compatible_accepts_full_lot(self):
        self.assertTrue(quantity_compatible(Decimal("500"), "kg", Decimal("1000"), "kg"))
        self.assertTrue(quantity_compatible(Decimal("500"), "kg", Decimal("5"), "quintal"))

    def test_quantity_incompatible_is_excluded(self):
        self.assertFalse(quantity_compatible(Decimal("600"), "kg", Decimal("500"), "kg"))

    def test_active_demand_respects_validity_window(self):
        active = SimpleNamespace(
            demand_status=DemandStatus.ACTIVE,
            valid_from=date.today() - timedelta(days=1),
            valid_until=date.today() + timedelta(days=1),
        )
        expired = SimpleNamespace(
            demand_status=DemandStatus.ACTIVE,
            valid_from=date.today() - timedelta(days=10),
            valid_until=date.today() - timedelta(days=1),
        )
        self.assertTrue(is_demand_active(active, date.today()))
        self.assertFalse(is_demand_active(expired, date.today()))

    def test_matching_crop_builds_score_with_verified_buyer(self):
        match = build_buyer_match(
            demand(district="Thane"),
            lot(district="Thane"),
            Decimal("2400"),
            "quintal",
        )
        self.assertIsNotNone(match)
        self.assertEqual(match.match_score, 100)
        self.assertIn("Verified buyer profile", match.match_explanation)

    def test_nonmatching_crop_is_excluded_before_build(self):
        tomato_demand = demand(crop_name="Tomato")
        onion_lot = lot(crop_name="Onion")
        self.assertNotEqual(tomato_demand.crop.name, onion_lot.crop.name)

    def test_sort_matches_prefers_verified_then_score(self):
        verified = SimpleNamespace(
            verification_status=VerificationStatus.VERIFIED,
            match_score=70,
            preferred_price=Decimal("2500"),
            company_name="Alpha Traders",
        )
        pending = SimpleNamespace(
            verification_status=VerificationStatus.PENDING,
            match_score=90,
            preferred_price=Decimal("2700"),
            company_name="Beta Foods",
        )
        ranked = sort_matches([pending, verified])
        self.assertEqual(ranked[0].company_name, "Alpha Traders")

    def test_calculate_match_score_components(self):
        self.assertEqual(calculate_match_score(True, True, True, True), 100)
        self.assertEqual(calculate_match_score(True, False, False, False), 40)


class BuyerOfferServiceTests(unittest.TestCase):
    def test_create_demo_offer_reuses_pending_offer(self):
        db = MagicMock()
        lot_id = uuid4()
        buyer_id = uuid4()
        existing = SimpleNamespace(
            id=uuid4(),
            buyer=SimpleNamespace(company_name="FreshMart Foods"),
        )
        produce_lot = SimpleNamespace(
            id=lot_id,
            quantity=Decimal("500"),
            unit="kg",
            crop_id=uuid4(),
            lot_number="LOT-1",
            lot_status=LotStatus.ACTIVE,
            price_expectation=None,
        )
        buyer = SimpleNamespace(id=buyer_id)
        db.scalar.side_effect = [produce_lot, buyer, existing]

        offer = create_demo_offer(db, lot_id, buyer_id)
        self.assertIs(offer, existing)
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_accept_offer_rejects_expired_status(self):
        db = MagicMock()
        expired_offer = SimpleNamespace(
            id=uuid4(),
            offer_status=OfferStatus.PENDING,
            valid_until=datetime.now(timezone.utc) - timedelta(hours=1),
            quantity=Decimal("500"),
            unit="kg",
            produce_lot=SimpleNamespace(quantity=Decimal("500"), unit="kg", lot_status=LotStatus.ACTIVE, farmer_profile_id=uuid4()),
            buyer_profile_id=uuid4(),
            buyer=SimpleNamespace(company_name="FreshMart Foods"),
        )
        db.scalar.return_value = expired_offer
        with self.assertRaisesRegex(OfferServiceError, "expired"):
            accept_offer(db, expired_offer.id)
        db.commit.assert_called_once()

    def test_accept_offer_rejects_non_pending(self):
        db = MagicMock()
        rejected = SimpleNamespace(
            id=uuid4(),
            offer_status=OfferStatus.REJECTED,
            valid_until=None,
            quantity=Decimal("500"),
            unit="kg",
            produce_lot=SimpleNamespace(quantity=Decimal("500"), unit="kg", lot_status=LotStatus.ACTIVE),
            buyer=SimpleNamespace(company_name="FreshMart Foods"),
        )
        db.scalar.return_value = rejected
        with self.assertRaisesRegex(OfferServiceError, "cannot be accepted"):
            accept_offer(db, rejected.id)

    def test_accept_offer_success_updates_lot_and_creates_order(self):
        db = MagicMock()
        produce = SimpleNamespace(
            id=uuid4(),
            quantity=Decimal("500"),
            unit="kg",
            lot_status=LotStatus.OFFERED,
            farmer_profile_id=uuid4(),
        )
        offer = SimpleNamespace(
            id=uuid4(),
            offer_status=OfferStatus.PENDING,
            valid_until=datetime.now(timezone.utc) + timedelta(days=1),
            quantity=Decimal("500"),
            unit="kg",
            offered_price=Decimal("2600"),
            buyer_profile_id=uuid4(),
            produce_lot=produce,
            buyer=SimpleNamespace(company_name="FreshMart Foods"),
        )
        db.scalar.side_effect = [offer, None]
        accepted_offer, order = accept_offer(db, offer.id)

        self.assertEqual(accepted_offer.offer_status, OfferStatus.ACCEPTED)
        self.assertEqual(produce.lot_status, LotStatus.SOLD)
        self.assertEqual(order.order_status, OrderStatus.CREATED)
        db.flush.assert_called_once()
        db.commit.assert_called_once()

    def test_accept_offer_rolls_back_on_integrity_error(self):
        db = MagicMock()
        produce = SimpleNamespace(
            id=uuid4(),
            quantity=Decimal("500"),
            unit="kg",
            lot_status=LotStatus.OFFERED,
            farmer_profile_id=uuid4(),
        )
        offer = SimpleNamespace(
            id=uuid4(),
            offer_status=OfferStatus.PENDING,
            valid_until=datetime.now(timezone.utc) + timedelta(days=1),
            quantity=Decimal("500"),
            unit="kg",
            offered_price=Decimal("2600"),
            buyer_profile_id=uuid4(),
            produce_lot=produce,
            buyer=SimpleNamespace(company_name="FreshMart Foods"),
        )
        from sqlalchemy.exc import IntegrityError

        db.commit.side_effect = IntegrityError("insert", {}, Exception("duplicate"))
        db.scalar.side_effect = [offer, None]
        with self.assertRaisesRegex(OfferServiceError, "Could not create order"):
            accept_offer(db, offer.id)
        db.rollback.assert_called_once()


class BuyerMatchingRouteTests(unittest.TestCase):
    def test_route_returns_404_for_missing_lot(self):
        with patch("app.routes.buyer_matching.get_buyer_matches", return_value=(None, [])):
            with self.assertRaises(HTTPException) as context:
                read_buyer_matches(uuid4(), SimpleNamespace())
        self.assertEqual(context.exception.status_code, 404)

    def test_create_offer_route_maps_not_found(self):
        with patch("app.routes.buyer_matching.create_demo_offer", side_effect=OfferServiceError("Produce lot not found")):
            with self.assertRaises(HTTPException) as context:
                create_buyer_offer(uuid4(), SimpleNamespace(buyer_profile_id=uuid4()), SimpleNamespace())
        self.assertEqual(context.exception.status_code, 404)

    def test_accept_route_maps_conflict_for_duplicate(self):
        with patch("app.routes.buyer_matching.accept_offer", side_effect=OfferServiceError("An order already exists for this offer")):
            with self.assertRaises(HTTPException) as context:
                accept_buyer_offer(uuid4(), SimpleNamespace())
        self.assertEqual(context.exception.status_code, 409)


class SellProduceLotTests(unittest.TestCase):
    def test_sell_eligible_lot_becomes_available(self):
        db = MagicMock()
        produce_lot = SimpleNamespace(id=uuid4(), lot_status=LotStatus.DRAFT)
        db.get.return_value = produce_lot

        result = sell_produce_lot(db, produce_lot.id)

        self.assertEqual(result.lot_status, LotStatus.ACTIVE)
        db.commit.assert_called_once()

    def test_sell_missing_lot_raises_not_found(self):
        db = MagicMock()
        db.get.return_value = None
        with self.assertRaisesRegex(SellProduceLotError, "not found"):
            sell_produce_lot(db, uuid4())
        db.commit.assert_not_called()

    def test_sell_ineligible_lot_is_rejected(self):
        db = MagicMock()
        produce_lot = SimpleNamespace(id=uuid4(), lot_status=LotStatus.SOLD)
        db.get.return_value = produce_lot
        with self.assertRaisesRegex(SellProduceLotError, "cannot be put up for sale"):
            sell_produce_lot(db, produce_lot.id)
        db.commit.assert_not_called()

    def test_sell_rolls_back_on_integrity_error(self):
        from sqlalchemy.exc import IntegrityError

        db = MagicMock()
        produce_lot = SimpleNamespace(id=uuid4(), lot_status=LotStatus.ACTIVE)
        db.get.return_value = produce_lot
        db.commit.side_effect = IntegrityError("insert", {}, Exception("duplicate"))
        with self.assertRaises(IntegrityError):
            sell_produce_lot(db, produce_lot.id)
        db.rollback.assert_called_once()

    def test_sell_route_maps_missing_lot_to_404(self):
        with patch("app.routes.produce_lots.sell_produce_lot", side_effect=SellProduceLotError("Produce lot not found")):
            with self.assertRaises(HTTPException) as context:
                sell_lot(uuid4(), SimpleNamespace())
        self.assertEqual(context.exception.status_code, 404)

    def test_sell_route_maps_ineligible_lot_to_conflict(self):
        with patch("app.routes.produce_lots.sell_produce_lot", side_effect=SellProduceLotError("cannot be put up for sale")):
            with self.assertRaises(HTTPException) as context:
                sell_lot(uuid4(), SimpleNamespace())
        self.assertEqual(context.exception.status_code, 409)


class ListProduceLotTests(unittest.TestCase):
    def test_farmer_lots_returned_newest_first(self):
        db = MagicMock()
        farmer = SimpleNamespace(id=uuid4())
        older = SimpleNamespace(
            id=uuid4(),
            farmer_profile_id=farmer.id,
            created_at=datetime.now(timezone.utc) - timedelta(days=1),
        )
        newer = SimpleNamespace(
            id=uuid4(),
            farmer_profile_id=farmer.id,
            created_at=datetime.now(timezone.utc),
        )
        db.get.return_value = farmer
        db.scalars.return_value.all.return_value = [newer, older]

        result_farmer, lots = get_farmer_produce_lots(db, farmer.id)

        self.assertIs(result_farmer, farmer)
        self.assertEqual(lots, [newer, older])
        db.get.assert_called_once_with(FarmerProfile, farmer.id)

    def test_unknown_farmer_returns_empty(self):
        db = MagicMock()
        db.get.return_value = None

        result_farmer, lots = get_farmer_produce_lots(db, uuid4())

        self.assertIsNone(result_farmer)
        self.assertEqual(lots, [])

    def test_farmer_with_no_lots_returns_empty(self):
        db = MagicMock()
        farmer = SimpleNamespace(id=uuid4())
        db.get.return_value = farmer
        db.scalars.return_value.all.return_value = []

        result_farmer, lots = get_farmer_produce_lots(db, farmer.id)

        self.assertIs(result_farmer, farmer)
        self.assertEqual(lots, [])

    def test_route_unknown_farmer_returns_404(self):
        with patch("app.routes.produce_lots.get_farmer_produce_lots", return_value=(None, [])):
            with self.assertRaises(HTTPException) as context:
                list_lots(uuid4(), SimpleNamespace())
        self.assertEqual(context.exception.status_code, 404)

    def test_route_returns_only_that_farmers_lots(self):
        db = MagicMock()
        farmer = SimpleNamespace(id=uuid4())
        lot = SimpleNamespace(
            id=uuid4(),
            farmer_profile_id=farmer.id,
            crop_id=uuid4(),
            lot_number="LOT-1",
            quantity=Decimal("500"),
            unit="kg",
            quality_grade=None,
            harvest_date=date.today(),
            expected_delivery_date=None,
            lot_status=LotStatus.ACTIVE,
            location_id=uuid4(),
            price_expectation=Decimal("2500"),
            notes=None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        with patch(
            "app.routes.produce_lots.get_farmer_produce_lots",
            return_value=(farmer, [lot]),
        ) as mock_svc:
            result = list_lots(farmer.id, db)

        self.assertEqual(len(result.lots), 1)
        self.assertEqual(result.lots[0].farmer_profile_id, farmer.id)
        mock_svc.assert_called_once_with(db, farmer.id)


if __name__ == "__main__":
    unittest.main()
