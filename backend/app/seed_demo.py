from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from app.database.session import get_session_factory
from app.models.entities import (
    BuyerDemand,
    BuyerProfile,
    BuyerType,
    Crop,
    DemandStatus,
    FarmerProfile,
    KycStatus,
    Location,
    Market,
    MarketPrice,
    MarketType,
    User,
    UserRole,
    UserStatus,
    VerificationStatus,
)

DEMO_EMAIL = "demo.farmer@sih26132.local"
DEMO_PHONE = "+91999926132"

CROPS = (
    {"name": "Tomato", "unit_default": "kg", "category": "vegetable", "seasonality": "kharif, rabi"},
    {"name": "Onion", "unit_default": "kg", "category": "vegetable", "seasonality": "rabi"},
    {"name": "Potato", "unit_default": "kg", "category": "vegetable", "seasonality": "rabi"},
    {"name": "Maize", "unit_default": "kg", "category": "cereal", "seasonality": "kharif, rabi"},
)

LOCATIONS = (
    {"state": "Maharashtra", "district": "Nashik", "tehsil": "Niphad", "village": "Lasalgaon", "pincode": "422306", "latitude": Decimal("20.146"), "longitude": Decimal("74.238")},
    {"state": "Maharashtra", "district": "Pune", "tehsil": "Junnar", "village": "Ale", "pincode": "412411", "latitude": Decimal("19.143"), "longitude": Decimal("73.943")},
    {"state": "Maharashtra", "district": "Ahmednagar", "tehsil": "Rahata", "village": "Shirdi", "pincode": "423109", "latitude": Decimal("19.766"), "longitude": Decimal("74.477")},
    {"state": "Maharashtra", "district": "Thane", "tehsil": "Vashi", "village": "Vashi", "pincode": "400703", "latitude": Decimal("19.077"), "longitude": Decimal("72.998")},
    {"state": "Karnataka", "district": "Bengaluru Rural", "tehsil": "Devanahalli", "village": "Devanahalli", "pincode": "562110", "latitude": Decimal("13.247"), "longitude": Decimal("77.705")},
    {"state": "Karnataka", "district": "Belagavi", "tehsil": "Belagavi", "village": "Macleshwar", "pincode": "590008", "latitude": Decimal("15.855"), "longitude": Decimal("74.505")},
    {"state": "Karnataka", "district": "Mysuru", "tehsil": "Mysuru", "village": "Saragur", "pincode": "571121", "latitude": Decimal("12.053"), "longitude": Decimal("76.905")},
    {"state": "Karnataka", "district": "Dharwad", "tehsil": "Hubballi", "village": "Hubballi", "pincode": "580020", "latitude": Decimal("15.365"), "longitude": Decimal("75.124")},
)

MARKETS = (
    {"name": "APMC Lasalgaon", "location_index": 0, "market_type": MarketType.MANDI},
    {"name": "APMC Pune", "location_index": 1, "market_type": MarketType.MANDI},
    {"name": "APMC Vashi", "location_index": 3, "market_type": MarketType.MANDI},
    {"name": "APMC Yeshwanthpur", "location_index": 4, "market_type": MarketType.MANDI},
    {"name": "APMC Belagavi", "location_index": 5, "market_type": MarketType.MANDI},
    {"name": "APMC Mysuru", "location_index": 6, "market_type": MarketType.MANDI},
    {"name": "APMC Hubballi", "location_index": 7, "market_type": MarketType.MANDI},
)

DEMO_PRICES = {"Tomato": Decimal("2400"), "Onion": Decimal("2200"), "Potato": Decimal("1800"), "Maize": Decimal("2100")}

DEMO_BUYERS = (
    {
        "email": "demo.buyer.freshmart@sih26132.local",
        "phone": "+91999926133",
        "company_name": "FreshMart Foods",
        "contact_person": "Anita Desai",
        "buyer_type": BuyerType.RETAILER,
        "license_no": "DEMO-FRESHMART-001",
        "location_index": 3,
        "verification_status": VerificationStatus.VERIFIED,
        "demands": (
            {"crop_name": "Tomato", "quantity": Decimal("1000"), "unit": "kg", "preferred_price": Decimal("2600"), "location_index": 3},
        ),
    },
    {
        "email": "demo.buyer.agrotraders@sih26132.local",
        "phone": "+91999926134",
        "company_name": "Maharashtra Agro Traders",
        "contact_person": "Rahul Kulkarni",
        "buyer_type": BuyerType.TRADER,
        "license_no": "DEMO-AGROTRADERS-001",
        "location_index": 1,
        "verification_status": VerificationStatus.VERIFIED,
        "demands": (
            {"crop_name": "Tomato", "quantity": Decimal("500"), "unit": "kg", "preferred_price": Decimal("2550"), "location_index": 1},
        ),
    },
    {
        "email": "demo.buyer.greenbasket@sih26132.local",
        "phone": "+91999926135",
        "company_name": "GreenBasket Wholesale",
        "contact_person": "Sneha More",
        "buyer_type": BuyerType.AGGREGATOR,
        "license_no": "DEMO-GREENBASKET-001",
        "location_index": 0,
        "verification_status": VerificationStatus.PENDING,
        "demands": (
            {"crop_name": "Onion", "quantity": Decimal("800"), "unit": "kg", "preferred_price": Decimal("2300"), "location_index": 0},
        ),
    },
)


def find_or_create_crop(db, data: dict) -> Crop:
    crop = db.scalar(select(Crop).where(Crop.name == data["name"], Crop.unit_default == data["unit_default"]))
    if crop is None:
        crop = Crop(**data)
        db.add(crop)
    return crop


def find_or_create_location(db, data: dict) -> Location:
    location = db.scalar(
        select(Location).where(
            Location.state == data["state"],
            Location.district == data["district"],
            Location.tehsil == data["tehsil"],
            Location.village == data["village"],
            Location.pincode == data["pincode"],
        )
    )
    if location is None:
        location = Location(**data)
        db.add(location)
    else:
        location.latitude = data["latitude"]
        location.longitude = data["longitude"]
    return location


def find_or_create_market(db, data: dict, location: Location) -> Market:
    market = db.scalar(select(Market).where(Market.name == data["name"]))
    if market is None:
        market = Market(name=data["name"], location_id=location.id, market_type=data["market_type"], is_active=True)
        db.add(market)
    return market


def find_or_create_buyer_user(db, data: dict) -> User:
    user = db.scalar(select(User).where(User.email == data["email"]))
    if user is None:
        user = User(
            email=data["email"],
            phone=data["phone"],
            password_hash="demo-only-account",
            role=UserRole.BUYER,
            status=UserStatus.ACTIVE,
            is_verified=True,
            preferred_language="en",
            notification_channel="email",
        )
        db.add(user)
    return user


def find_or_create_buyer_profile(db, user: User, data: dict, location: Location) -> BuyerProfile:
    profile = db.scalar(select(BuyerProfile).where(BuyerProfile.user_id == user.id))
    if profile is None:
        profile = BuyerProfile(
            user_id=user.id,
            company_name=data["company_name"],
            contact_person=data["contact_person"],
            buyer_type=data["buyer_type"],
            license_no=data["license_no"],
            location_id=location.id,
            verification_status=data["verification_status"],
        )
        db.add(profile)
    else:
        profile.company_name = data["company_name"]
        profile.contact_person = data["contact_person"]
        profile.buyer_type = data["buyer_type"]
        profile.license_no = data["license_no"]
        profile.location_id = location.id
        profile.verification_status = data["verification_status"]
    return profile


def find_or_create_buyer_demand(db, buyer: BuyerProfile, crop: Crop, data: dict, location: Location) -> BuyerDemand:
    demand = db.scalar(
        select(BuyerDemand).where(
            BuyerDemand.buyer_profile_id == buyer.id,
            BuyerDemand.crop_id == crop.id,
            BuyerDemand.demand_status == DemandStatus.ACTIVE,
        )
    )
    if demand is None:
        demand = BuyerDemand(
            buyer_profile_id=buyer.id,
            crop_id=crop.id,
            quantity=data["quantity"],
            unit=data["unit"],
            preferred_price=data["preferred_price"],
            location_id=location.id,
            demand_status=DemandStatus.ACTIVE,
            valid_from=date.today() - timedelta(days=7),
            valid_until=date.today() + timedelta(days=90),
        )
        db.add(demand)
    else:
        demand.quantity = data["quantity"]
        demand.unit = data["unit"]
        demand.preferred_price = data["preferred_price"]
        demand.location_id = location.id
        demand.valid_from = date.today() - timedelta(days=7)
        demand.valid_until = date.today() + timedelta(days=90)
    return demand


def find_or_create_price(db, market: Market, crop: Crop, price_date: date, price: Decimal) -> MarketPrice:
    market_price = db.scalar(
        select(MarketPrice).where(
            MarketPrice.market_id == market.id,
            MarketPrice.crop_id == crop.id,
            MarketPrice.price_date == price_date,
        )
    )
    if market_price is None:
        market_price = MarketPrice(
            market_id=market.id,
            crop_id=crop.id,
            price_per_unit=price,
            unit="quintal",
            price_date=price_date,
            min_price=price - Decimal("100"),
            max_price=price + Decimal("100"),
            avg_price=price,
            source="SIH 26132 controlled demo data",
        )
        db.add(market_price)
    else:
        market_price.price_per_unit = price
        market_price.unit = "quintal"
        market_price.min_price = price - Decimal("100")
        market_price.max_price = price + Decimal("100")
        market_price.avg_price = price
        market_price.source = "SIH 26132 controlled demo data"
    return market_price


def seed_demo_data() -> FarmerProfile:
    db = get_session_factory()()
    try:
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(
                email=DEMO_EMAIL,
                phone=DEMO_PHONE,
                password_hash="demo-only-account",
                role=UserRole.FARMER,
                status=UserStatus.ACTIVE,
                is_verified=True,
                preferred_language="en",
                notification_channel="sms",
            )
            db.add(user)
            db.flush()

        crops = [find_or_create_crop(db, data) for data in CROPS]
        locations = [find_or_create_location(db, data) for data in LOCATIONS]
        db.flush()
        markets = [find_or_create_market(db, data, locations[data["location_index"]]) for data in MARKETS]
        db.flush()
        for crop in crops:
            base_price = DEMO_PRICES[crop.name]
            for market_index, market in enumerate(markets):
                for days_ago in (0, 1, 2):
                    observed_price = base_price + Decimal(market_index * 75) - Decimal(days_ago * 25)
                    find_or_create_price(db, market, crop, date.today() - timedelta(days=days_ago), observed_price)

        farmer_profile = db.scalar(select(FarmerProfile).where(FarmerProfile.user_id == user.id))
        if farmer_profile is None:
            farmer_profile = FarmerProfile(
                user_id=user.id,
                full_name="Ramesh Patil",
                farm_name="Patil Farms",
                location_id=locations[0].id,
                kyc_status=KycStatus.VERIFIED,
            )
            db.add(farmer_profile)
        elif farmer_profile.location_id != locations[0].id:
            farmer_profile.location_id = locations[0].id

        crop_by_name = {crop.name: crop for crop in crops}
        seeded_buyers: list[str] = []
        for buyer_data in DEMO_BUYERS:
            buyer_user = find_or_create_buyer_user(db, buyer_data)
            db.flush()
            buyer_location = locations[buyer_data["location_index"]]
            buyer_profile = find_or_create_buyer_profile(db, buyer_user, buyer_data, buyer_location)
            db.flush()
            for demand_data in buyer_data["demands"]:
                demand_location = locations[demand_data["location_index"]]
                find_or_create_buyer_demand(db, buyer_profile, crop_by_name[demand_data["crop_name"]], demand_data, demand_location)
            seeded_buyers.append(buyer_profile.company_name)

        db.commit()
        db.refresh(farmer_profile)
        print(f"Demo farmer profile: {farmer_profile.id}")
        print(f"Demo location: {locations[0].id}")
        print("Seeded crops: " + ", ".join(crop.name for crop in crops))
        print(f"Seeded locations: {len(locations)}")
        print("Seeded markets: " + ", ".join(market.name for market in markets))
        print(f"Seeded market prices: {len(crops) * len(markets) * 3}")
        print("Seeded demo buyers: " + ", ".join(seeded_buyers))
        return farmer_profile
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()