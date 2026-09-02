from sqlalchemy import select

from app.database.session import get_session_factory
from app.models.entities import Crop, FarmerProfile, KycStatus, Location, User, UserRole, UserStatus

DEMO_EMAIL = "demo.farmer@sih26132.local"
DEMO_PHONE = "+91999926132"

CROPS = (
    {"name": "Tomato", "unit_default": "kg", "category": "vegetable", "seasonality": "kharif, rabi"},
    {"name": "Onion", "unit_default": "kg", "category": "vegetable", "seasonality": "rabi"},
    {"name": "Potato", "unit_default": "kg", "category": "vegetable", "seasonality": "rabi"},
    {"name": "Maize", "unit_default": "kg", "category": "cereal", "seasonality": "kharif, rabi"},
)

LOCATIONS = (
    {"state": "Maharashtra", "district": "Nashik", "tehsil": "Niphad", "village": "Lasalgaon", "pincode": "422306"},
    {"state": "Maharashtra", "district": "Pune", "tehsil": "Junnar", "village": "Ale", "pincode": "412411"},
    {"state": "Maharashtra", "district": "Ahmednagar", "tehsil": "Rahata", "village": "Shirdi", "pincode": "423109"},
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
    return location


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

        db.commit()
        db.refresh(farmer_profile)
        print(f"Demo farmer profile: {farmer_profile.id}")
        print(f"Demo location: {locations[0].id}")
        print("Seeded crops: " + ", ".join(crop.name for crop in crops))
        print(f"Seeded locations: {len(locations)}")
        return farmer_profile
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_data()