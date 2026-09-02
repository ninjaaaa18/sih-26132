import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class UserRole(str, enum.Enum):
    FARMER = "farmer"
    BUYER = "buyer"
    ADMIN = "admin"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"
    BLOCKED = "blocked"


class KycStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class VerificationStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class BuyerType(str, enum.Enum):
    TRADER = "trader"
    PROCESSOR = "processor"
    RETAILER = "retailer"
    AGGREGATOR = "aggregator"
    EXPORTER = "exporter"
    INSTITUTION = "institution"


class LotStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    MATCHED = "matched"
    OFFERED = "offered"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    SOLD = "sold"
    CANCELLED = "cancelled"


class MarketType(str, enum.Enum):
    MANDI = "mandi"
    WAREHOUSE = "warehouse"
    COLLECTION_CENTER = "collection_center"
    RETAIL_CLUSTER = "retail_cluster"


class DemandStatus(str, enum.Enum):
    ACTIVE = "active"
    FULFILLED = "fulfilled"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class OfferStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    COUNTERED = "countered"


class OrderStatus(str, enum.Enum):
    CREATED = "created"
    CONFIRMED = "confirmed"
    PACKED = "packed"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_role_status", "role", "status"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus, name="user_status", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False, default=UserStatus.PENDING)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    preferred_language: Mapped[Optional[str]] = mapped_column(String(50))
    notification_channel: Mapped[Optional[str]] = mapped_column(String(20))
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    farmer_profile: Mapped[Optional["FarmerProfile"]] = relationship(back_populates="user", uselist=False)
    buyer_profile: Mapped[Optional["BuyerProfile"]] = relationship(back_populates="user", uselist=False)


class Location(TimestampMixin, Base):
    __tablename__ = "locations"
    __table_args__ = (Index("ix_locations_state_district", "state", "district"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    state: Mapped[str] = mapped_column(String(120), nullable=False)
    district: Mapped[str] = mapped_column(String(120), nullable=False)
    tehsil: Mapped[Optional[str]] = mapped_column(String(120))
    village: Mapped[Optional[str]] = mapped_column(String(150))
    pincode: Mapped[Optional[str]] = mapped_column(String(20))
    latitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Optional[Decimal]] = mapped_column(Numeric(9, 6))


class FarmerProfile(TimestampMixin, Base):
    __tablename__ = "farmer_profiles"
    __table_args__ = (Index("ix_farmer_profiles_location_id", "location_id"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[Optional[str]] = mapped_column(String(30))
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    land_size_acre: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    farm_name: Mapped[Optional[str]] = mapped_column(String(255))
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("locations.id"), nullable=False)
    kyc_status: Mapped[KycStatus] = mapped_column(Enum(KycStatus, name="kyc_status", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False, default=KycStatus.PENDING)
    income_bucket: Mapped[Optional[str]] = mapped_column(String(50))
    user: Mapped[User] = relationship(back_populates="farmer_profile")
    location: Mapped[Location] = relationship()
    produce_lots: Mapped[list["ProduceLot"]] = relationship(back_populates="farmer")


class BuyerProfile(TimestampMixin, Base):
    __tablename__ = "buyer_profiles"
    __table_args__ = (Index("ix_buyer_profiles_location_id", "location_id"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_person: Mapped[str] = mapped_column(String(255), nullable=False)
    buyer_type: Mapped[BuyerType] = mapped_column(Enum(BuyerType, name="buyer_type", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False)
    license_no: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("locations.id"), nullable=False)
    verification_status: Mapped[VerificationStatus] = mapped_column(Enum(VerificationStatus, name="verification_status", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False, default=VerificationStatus.PENDING)
    user: Mapped[User] = relationship(back_populates="buyer_profile")
    location: Mapped[Location] = relationship()
    demands: Mapped[list["BuyerDemand"]] = relationship(back_populates="buyer")
    offers: Mapped[list["BuyerOffer"]] = relationship(back_populates="buyer")


class Crop(TimestampMixin, Base):
    __tablename__ = "crops"
    __table_args__ = (UniqueConstraint("name", "unit_default", name="uq_crops_name_unit"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    scientific_name: Mapped[Optional[str]] = mapped_column(String(120))
    category: Mapped[Optional[str]] = mapped_column(String(80))
    unit_default: Mapped[str] = mapped_column(String(20), nullable=False)
    seasonality: Mapped[Optional[str]] = mapped_column(String(100))


class Market(TimestampMixin, Base):
    __tablename__ = "markets"
    __table_args__ = (Index("ix_markets_location_active", "location_id", "is_active"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("locations.id"), nullable=False)
    market_type: Mapped[Optional[MarketType]] = mapped_column(Enum(MarketType, name="market_type", values_callable=lambda enum_cls: [member.value for member in enum_cls]))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    location: Mapped[Location] = relationship()
    prices: Mapped[list["MarketPrice"]] = relationship(back_populates="market")


class ProduceLot(TimestampMixin, Base):
    __tablename__ = "produce_lots"
    __table_args__ = (Index("ix_produce_lots_farmer_status", "farmer_profile_id", "lot_status"), Index("ix_produce_lots_crop_status", "crop_id", "lot_status"), CheckConstraint("quantity > 0", name="ck_produce_lots_quantity_positive"))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    farmer_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farmer_profiles.id"), nullable=False)
    crop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("crops.id"), nullable=False)
    lot_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    quality_grade: Mapped[Optional[str]] = mapped_column(String(50))
    harvest_date: Mapped[date] = mapped_column(Date, nullable=False)
    expected_delivery_date: Mapped[Optional[date]] = mapped_column(Date)
    lot_status: Mapped[LotStatus] = mapped_column(Enum(LotStatus, name="lot_status", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False, default=LotStatus.DRAFT)
    location_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("locations.id"), nullable=False)
    price_expectation: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    farmer: Mapped[FarmerProfile] = relationship(back_populates="produce_lots")
    crop: Mapped[Crop] = relationship()
    location: Mapped[Location] = relationship()
    recommendations: Mapped[list["Recommendation"]] = relationship(back_populates="produce_lot")
    offers: Mapped[list["BuyerOffer"]] = relationship(back_populates="produce_lot")


class MarketPrice(TimestampMixin, Base):
    __tablename__ = "market_prices"
    __table_args__ = (Index("ix_market_prices_market_crop_date", "market_id", "crop_id", "price_date"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    market_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("markets.id"), nullable=False)
    crop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("crops.id"), nullable=False)
    price_per_unit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    price_date: Mapped[date] = mapped_column(Date, nullable=False)
    min_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    max_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    avg_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    source: Mapped[Optional[str]] = mapped_column(String(100))
    market: Mapped[Market] = relationship(back_populates="prices")
    crop: Mapped[Crop] = relationship()


class BuyerDemand(TimestampMixin, Base):
    __tablename__ = "buyer_demands"
    __table_args__ = (Index("ix_buyer_demands_crop_status", "crop_id", "demand_status"), Index("ix_buyer_demands_buyer_status", "buyer_profile_id", "demand_status"), CheckConstraint("quantity > 0", name="ck_buyer_demands_quantity_positive"))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    buyer_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("buyer_profiles.id"), nullable=False)
    crop_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("crops.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    preferred_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    market_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("markets.id"))
    location_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("locations.id"))
    demand_status: Mapped[DemandStatus] = mapped_column(Enum(DemandStatus, name="demand_status", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False, default=DemandStatus.ACTIVE)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[Optional[date]] = mapped_column(Date)
    buyer: Mapped[BuyerProfile] = relationship(back_populates="demands")
    crop: Mapped[Crop] = relationship()
    market: Mapped[Optional[Market]] = relationship()
    location: Mapped[Optional[Location]] = relationship()


class BuyerOffer(TimestampMixin, Base):
    __tablename__ = "buyer_offers"
    __table_args__ = (Index("ix_buyer_offers_lot_status", "produce_lot_id", "offer_status"), Index("ix_buyer_offers_buyer_status", "buyer_profile_id", "offer_status"), CheckConstraint("quantity > 0", name="ck_buyer_offers_quantity_positive"))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    produce_lot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("produce_lots.id"), nullable=False)
    buyer_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("buyer_profiles.id"), nullable=False)
    offered_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    offer_status: Mapped[OfferStatus] = mapped_column(Enum(OfferStatus, name="offer_status", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False, default=OfferStatus.PENDING)
    offer_message: Mapped[Optional[str]] = mapped_column(Text)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    produce_lot: Mapped[ProduceLot] = relationship(back_populates="offers")
    buyer: Mapped[BuyerProfile] = relationship(back_populates="offers")
    order: Mapped[Optional["Order"]] = relationship(back_populates="buyer_offer", uselist=False)


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("buyer_offer_id", name="uq_orders_buyer_offer"), Index("ix_orders_farmer_status", "farmer_profile_id", "order_status"), Index("ix_orders_buyer_status", "buyer_profile_id", "order_status"))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    produce_lot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("produce_lots.id"), nullable=False)
    buyer_offer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("buyer_offers.id"), nullable=False)
    farmer_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farmer_profiles.id"), nullable=False)
    buyer_profile_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("buyer_profiles.id"), nullable=False)
    order_status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="order_status", values_callable=lambda enum_cls: [member.value for member in enum_cls]), nullable=False, default=OrderStatus.CREATED)
    agreed_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    agreed_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    order_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    buyer_offer: Mapped[BuyerOffer] = relationship(back_populates="order")
    produce_lot: Mapped[ProduceLot] = relationship()
    farmer: Mapped[FarmerProfile] = relationship()
    buyer: Mapped[BuyerProfile] = relationship()


class Recommendation(TimestampMixin, Base):
    __tablename__ = "recommendations"
    __table_args__ = (Index("ix_recommendations_lot_created", "produce_lot_id", "created_at"), CheckConstraint("confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)", name="ck_recommendations_confidence_range"))
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    produce_lot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("produce_lots.id"), nullable=False)
    recommended_market_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("markets.id"))
    recommended_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    predicted_price_gain: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))
    reason_summary: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[Optional[str]] = mapped_column(String(100))
    confidence_score: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 4))
    produce_lot: Mapped[ProduceLot] = relationship(back_populates="recommendations")
    recommended_market: Mapped[Optional[Market]] = relationship()