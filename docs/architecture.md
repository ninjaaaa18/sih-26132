# SIH 26132 Architecture Design

## 1. System overview

SIH Problem Statement 26132 focuses on strengthening market linkages and price discovery for farmers. The system is designed as a monorepo with a farmer-facing application, a backend API, price comparison and recommendation logic, and a buyer-facing dashboard. The architecture centers on a simple but scalable workflow:

Farmer -> creates produce lot -> market prices are compared -> recommendation generated -> suitable buyers are matched -> buyer makes an offer -> farmer accepts/rejects -> order is created.

The system is intended to support the following modules:

1. Farmer App/Web
   - Farmer registration and profile management
   - Produce lot creation and tracking
   - Market comparison and recommendation viewing
   - Offer and order status tracking

2. Backend + Database
   - Authentication and authorization
   - Business logic for pricing, matching, offers, and orders
   - Persistence layer for farmer/buyer data and marketplace operations

3. Price Comparison + Recommendation
   - Compare prices across nearby markets
   - Estimate likely best selling outcomes
   - Generate AI-assisted recommendations using historical and current market data

4. IVR + SMS + Languages
   - Voice and SMS support for farmers with low digital literacy
   - Multi-language support for regional accessibility

5. Buyer Dashboard + Farmer-Buyer Matching
   - Buyer demand management and matching recommendations
   - Offer lifecycle management from interested buyer to accepted order

The project is intentionally designed for a hackathon-friendly foundation. The first iteration should keep business logic simple and persistence straightforward, while remaining extensible for later features such as logistics, payment tracing, and grievance handling.

---

## 2. Entity/data model

### 2.1 Conventions

- Primary key: usually `id` (UUID or BIGINT) for all major entities
- Timestamps: `created_at`, `updated_at`, `deleted_at` as needed
- Country/region fields should be normalized when possible using location references
- Data should be split into core user/account data, profile data, operational data, and AI-generated recommendation data
- `NULL` values should be used only for genuinely optional information; required fields should be enforced in the schema

### 2.2 User

Represents a common login/account entity used by both farmers and buyers.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| email | VARCHAR(255) | Yes | Login identifier |
| phone | VARCHAR(20) | Yes | Mobile contact |
| password_hash | VARCHAR(255) | Yes | Stored as hash, never plain text |
| role | ENUM('farmer', 'buyer', 'admin', 'fpo') | Yes | User type |
| status | ENUM('active','inactive','pending','blocked') | Yes | Account status |
| is_verified | BOOLEAN | Yes | Phone/email verification |
| preferred_language | VARCHAR(50) | No | For IVR/SMS content |
| created_at | TIMESTAMP | Yes | Audit field |
| updated_at | TIMESTAMP | Yes | Audit field |
| last_login_at | TIMESTAMP | No | Optional |

Relationships:
- One-to-one with `FarmerProfile` when role is farmer
- One-to-one with `BuyerProfile` when role is buyer
- Optional many-to-one with `FPO` if user is associated with a farmer producer organization

Required vs optional:
- Required: email, phone, password_hash, role, status, is_verified, created_at, updated_at
- Optional: preferred_language, last_login_at

---

### 2.3 Farmer Profile

Additional farmer-specific profile information.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| user_id | UUID | Yes | FK to User |
| full_name | VARCHAR(255) | Yes | Farmer name |
| gender | VARCHAR(30) | No | Optional demographic field |
| date_of_birth | DATE | No | Optional |
| land_size_acre | DECIMAL(10,2) | No | Land area |
| farm_name | VARCHAR(255) | No | Optional |
| location_id | UUID | Yes | FK to Location |
| fpo_id | UUID | No | FK to FPO |
| kyc_status | ENUM('pending','verified','rejected') | Yes | Compliance field |
| income_bucket | VARCHAR(50) | No | Optional reporting field |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `User`
- Many-to-one with `Location`
- Many-to-one with `FPO` (optional)
- One-to-many with `ProduceLot`

Required vs optional:
- Required: user_id, full_name, location_id, kyc_status, created_at, updated_at
- Optional: gender, date_of_birth, land_size_acre, farm_name, fpo_id, income_bucket

---

### 2.4 Buyer Profile

Additional buyer-specific profile information.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| user_id | UUID | Yes | FK to User |
| company_name | VARCHAR(255) | Yes | Buyer entity name |
| contact_person | VARCHAR(255) | Yes | Primary contact |
| buyer_type | ENUM('trader','processor','retailer','aggregator','exporter','institution') | Yes | Buyer category |
| license_no | VARCHAR(100) | No | Regulatory number if any |
| location_id | UUID | Yes | FK to Location |
| verification_status | ENUM('pending','verified','rejected') | Yes | Compliance |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `User`
- Many-to-one with `Location`
- One-to-many with `BuyerDemand`
- One-to-many with `BuyerOffer`

Required vs optional:
- Required: user_id, company_name, contact_person, buyer_type, location_id, verification_status, created_at, updated_at
- Optional: license_no

---

### 2.5 Produce Lot

Represents a farmer's produce offering or batch in the market.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| farmer_profile_id | UUID | Yes | FK to FarmerProfile |
| crop_id | UUID | Yes | FK to Crop |
| lot_number | VARCHAR(100) | Yes | Human-friendly lot identifier |
| quantity | DECIMAL(12,2) | Yes | Quantity available |
| unit | VARCHAR(20) | Yes | e.g. kg, quintal, mandi-bag |
| quality_grade | VARCHAR(50) | No | Grade A/B/C |
| harvest_date | DATE | Yes | Harvest timing |
| expected_delivery_date | DATE | No | If relevant |
| lot_status | ENUM('draft','active','matched','offered','accepted','rejected','sold','cancelled') | Yes | Workflow status |
| location_id | UUID | Yes | FK to Location |
| price_expectation | DECIMAL(12,2) | No | Farmer's expected price |
| notes | TEXT | No | Farmer remarks |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `FarmerProfile`
- Many-to-one with `Crop`
- Many-to-one with `Location`
- One-to-many with `Recommendation`
- One-to-many with `BuyerOffer`
- One-to-many with `Order` (after it is accepted)

Required vs optional:
- Required: farmer_profile_id, crop_id, lot_number, quantity, unit, harvest_date, lot_status, location_id, created_at, updated_at
- Optional: quality_grade, expected_delivery_date, price_expectation, notes

---

### 2.6 Crop

Master catalog of crop types used in market matching.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| name | VARCHAR(120) | Yes | Crop name |
| scientific_name | VARCHAR(120) | No | Optional |
| category | VARCHAR(80) | No | e.g. cereal, vegetable, pulse |
| unit_default | VARCHAR(20) | Yes | Default unit |
| seasonality | VARCHAR(100) | No | Crop season info |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- One-to-many with `ProduceLot`
- One-to-many with `BuyerDemand`
- One-to-many with `MarketPrice`

Required vs optional:
- Required: name, unit_default, created_at, updated_at
- Optional: scientific_name, category, seasonality

---

### 2.7 Market

Geographic market center where prices are tracked.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| name | VARCHAR(200) | Yes | Market name |
| location_id | UUID | Yes | FK to Location |
| market_type | ENUM('mandi','warehouse','collection_center','retail_cluster') | No | Market category |
| is_active | BOOLEAN | Yes | Operational status |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `Location`
- One-to-many with `MarketPrice`
- One-to-many with `BuyerDemand` if demand is market-specific

Required vs optional:
- Required: name, location_id, is_active, created_at, updated_at
- Optional: market_type

---

### 2.8 Market Price

Historical/current market price information for crops in specific markets.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| market_id | UUID | Yes | FK to Market |
| crop_id | UUID | Yes | FK to Crop |
| price_per_unit | DECIMAL(12,2) | Yes | Current or recorded price |
| unit | VARCHAR(20) | Yes | Unit of price |
| price_date | DATE | Yes | Observation date |
| min_price | DECIMAL(12,2) | No | Optional floor price |
| max_price | DECIMAL(12,2) | No | Optional ceiling price |
| avg_price | DECIMAL(12,2) | No | Optional average |
| source | VARCHAR(100) | No | e.g. mandi, API, manually entered |
| created_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `Market`
- Many-to-one with `Crop`

Required vs optional:
- Required: market_id, crop_id, price_per_unit, unit, price_date, created_at
- Optional: min_price, max_price, avg_price, source

---

### 2.9 Buyer Demand

A buyer’s requirement for a crop and quantity at a given market or location.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| buyer_profile_id | UUID | Yes | FK to BuyerProfile |
| crop_id | UUID | Yes | FK to Crop |
| quantity | DECIMAL(12,2) | Yes | Requested quantity |
| unit | VARCHAR(20) | Yes | Unit |
| preferred_price | DECIMAL(12,2) | No | Buyer target price |
| market_id | UUID | No | Optional destination market |
| location_id | UUID | No | Optional demand location |
| demand_status | ENUM('active','fulfilled','expired','cancelled') | Yes | Requirement state |
| valid_from | DATE | Yes | Start date |
| valid_until | DATE | No | Expiration date |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `BuyerProfile`
- Many-to-one with `Crop`
- Many-to-one with `Market` (optional)
- Many-to-one with `Location` (optional)

Required vs optional:
- Required: buyer_profile_id, crop_id, quantity, unit, demand_status, valid_from, created_at, updated_at
- Optional: preferred_price, market_id, location_id, valid_until

---

### 2.10 Buyer Offer

Offer made by a buyer to a farmer for a specific produce lot.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| produce_lot_id | UUID | Yes | FK to ProduceLot |
| buyer_profile_id | UUID | Yes | FK to BuyerProfile |
| offered_price | DECIMAL(12,2) | Yes | Offer price per unit |
| quantity | DECIMAL(12,2) | Yes | Quantity offered |
| unit | VARCHAR(20) | Yes | Unit |
| offer_status | ENUM('pending','accepted','rejected','expired','countered') | Yes | Offer state |
| offer_message | TEXT | No | Additional terms |
| valid_until | TIMESTAMP | No | Offer expiry |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `ProduceLot`
- Many-to-one with `BuyerProfile`
- One-to-many with `Order` (if accepted)

Required vs optional:
- Required: produce_lot_id, buyer_profile_id, offered_price, quantity, unit, offer_status, created_at, updated_at
- Optional: offer_message, valid_until

---

### 2.11 Order

Booking or transaction created after a farmer accepts a buyer offer.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| produce_lot_id | UUID | Yes | FK to ProduceLot |
| buyer_offer_id | UUID | Yes | FK to BuyerOffer |
| farmer_profile_id | UUID | Yes | FK to FarmerProfile |
| buyer_profile_id | UUID | Yes | FK to BuyerProfile |
| order_status | ENUM('created','confirmed','packed','in_transit','delivered','cancelled') | Yes | Lifecycle state |
| agreed_price | DECIMAL(12,2) | Yes | Final executed price |
| agreed_quantity | DECIMAL(12,2) | Yes | Final quantity |
| unit | VARCHAR(20) | Yes | Unit |
| order_date | TIMESTAMP | Yes | Date of order creation |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `ProduceLot`
- Many-to-one with `BuyerOffer`
- Many-to-one with `FarmerProfile`
- Many-to-one with `BuyerProfile`

Required vs optional:
- Required: produce_lot_id, buyer_offer_id, farmer_profile_id, buyer_profile_id, order_status, agreed_price, agreed_quantity, unit, order_date, created_at, updated_at
- Optional: none in initial design

---

### 2.12 Recommendation

AI/system-generated guidance of the best selling strategy for a produce lot.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| produce_lot_id | UUID | Yes | FK to ProduceLot |
| recommended_market_id | UUID | No | Recommended market |
| recommended_price | DECIMAL(12,2) | Yes | Suggested price |
| predicted_price_gain | DECIMAL(12,2) | No | Potential uplift |
| reason_summary | TEXT | Yes | Human readable summary |
| model_version | VARCHAR(100) | No | AI model versioning |
| confidence_score | DECIMAL(5,4) | No | Model confidence |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- Many-to-one with `ProduceLot`
- Many-to-one with `Market` (optional)

Required vs optional:
- Required: produce_lot_id, recommended_price, reason_summary, created_at, updated_at
- Optional: recommended_market_id, predicted_price_gain, model_version, confidence_score

---

### 2.13 Location

Geographic location used to identify farm, market, and buyer operations.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| state | VARCHAR(120) | Yes | State |
| district | VARCHAR(120) | Yes | District |
| tehsil | VARCHAR(120) | No | Administrative block |
| village | VARCHAR(150) | No | Village |
| pincode | VARCHAR(20) | No | Postal code |
| latitude | DECIMAL(9,6) | No | GIS coordinate |
| longitude | DECIMAL(9,6) | No | GIS coordinate |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- One-to-many with `FarmerProfile`
- One-to-many with `BuyerProfile`
- One-to-many with `Market`
- One-to-many with `ProduceLot`
- One-to-many with `BuyerDemand`

Required vs optional:
- Required: state, district, created_at, updated_at
- Optional: tehsil, village, pincode, latitude, longitude

---

### 2.14 FPO (Farmer Producer Organization)

Optional organization-level entity for group membership and aggregation.

| Field | Type | Required | Notes |
|---|---|---:|---|
| id | UUID | Yes | Primary key |
| name | VARCHAR(255) | Yes | FPO name |
| registration_no | VARCHAR(100) | No | Registration number |
| location_id | UUID | Yes | FK to Location |
| contact_phone | VARCHAR(20) | No | Contact number |
| created_at | TIMESTAMP | Yes | |
| updated_at | TIMESTAMP | Yes | |

Relationships:
- One-to-many with `FarmerProfile`
- One-to-many with `User` if FPO accounts exist as entity users

Required vs optional:
- Required: name, location_id, created_at, updated_at
- Optional: registration_no, contact_phone

---

## 3. Entity relationships

High-level relationship map:

- `User` 1--1 `FarmerProfile`
- `User` 1--1 `BuyerProfile`
- `FarmerProfile` N--1 `Location`
- `BuyerProfile` N--1 `Location`
- `FarmerProfile` N--1 `FPO` (optional)
- `FarmerProfile` 1--N `ProduceLot`
- `Crop` 1--N `ProduceLot`
- `Crop` 1--N `BuyerDemand`
- `Crop` 1--N `MarketPrice`
- `Market` N--1 `Location`
- `Market` 1--N `MarketPrice`
- `ProduceLot` 1--N `Recommendation`
- `ProduceLot` 1--N `BuyerOffer`
- `ProduceLot` 1--N `Order`
- `BuyerProfile` 1--N `BuyerDemand`
- `BuyerProfile` 1--N `BuyerOffer`
- `BuyerProfile` 1--N `Order`
- `FarmerProfile` 1--N `Order`
- `BuyerOffer` 1--N `Order`

This is a clean relational model suitable for PostgreSQL or similar SQL database with explicit foreign keys.

---

## 4. API list

The initial REST API is designed to support a simplified MVP centered on crop listing, price comparison, recommendations, offers, and order acceptance.

### 4.1 Authentication

#### POST /api/v1/auth/register
- Purpose: Register a new user as a farmer or buyer
- Request body:
  ```json
  {
    "email": "farmer@example.com",
    "phone": "+919876543210",
    "password": "StrongPassword123",
    "role": "farmer",
    "preferred_language": "hi",
    "full_name": "Ramesh Kumar",
    "state": "Maharashtra",
    "district": "Nashik",
    "village": "Bhojpur"
  }
  ```
- Response:
  ```json
  {
    "user_id": "uuid",
    "role": "farmer",
    "status": "active",
    "message": "Registration successful"
  }
  ```
- Status codes:
  - 201 Created
  - 400 Bad Request
  - 409 Conflict

#### POST /api/v1/auth/login
- Purpose: Authenticate user and return token
- Request body:
  ```json
  {
    "email": "farmer@example.com",
    "password": "StrongPassword123"
  }
  ```
- Response:
  ```json
  {
    "access_token": "jwt_token",
    "token_type": "bearer",
    "user": {
      "id": "uuid",
      "role": "farmer",
      "email": "farmer@example.com"
    }
  }
  ```
- Status codes:
  - 200 OK
  - 401 Unauthorized
  - 400 Bad Request

---

### 4.2 Farmer

#### POST /api/v1/farmers/lots
- Purpose: Create a produce lot
- Request body:
  ```json
  {
    "crop_id": "uuid",
    "lot_number": "LOT-2026-001",
    "quantity": 120,
    "unit": "kg",
    "quality_grade": "A",
    "harvest_date": "2026-09-01",
    "location_id": "uuid",
    "price_expectation": 2200,
    "notes": "Good quality onion lot"
  }
  ```
- Response:
  ```json
  {
    "id": "uuid",
    "lot_number": "LOT-2026-001",
    "status": "active",
    "crop_id": "uuid",
    "quantity": 120,
    "unit": "kg"
  }
  ```
- Status codes:
  - 201 Created
  - 400 Bad Request
  - 401 Unauthorized

#### GET /api/v1/farmers/{farmer_id}/lots
- Purpose: View all lots for a farmer
- Response:
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "lot_number": "LOT-2026-001",
        "crop_name": "Onion",
        "quantity": 120,
        "unit": "kg",
        "lot_status": "active"
      }
    ]
  }
  ```
- Status codes:
  - 200 OK
  - 401 Unauthorized
  - 404 Not Found

#### GET /api/v1/farmers/lots/{lot_id}
- Purpose: Get detailed produce lot information
- Response:
  ```json
  {
    "id": "uuid",
    "lot_number": "LOT-2026-001",
    "crop": {
      "id": "uuid",
      "name": "Onion"
    },
    "quantity": 120,
    "unit": "kg",
    "quality_grade": "A",
    "harvest_date": "2026-09-01",
    "location": {
      "state": "Maharashtra",
      "district": "Nashik"
    },
    "price_expectation": 2200,
    "lot_status": "active"
  }
  ```
- Status codes:
  - 200 OK
  - 401 Unauthorized
  - 404 Not Found

---

### 4.3 Market

#### GET /api/v1/markets/prices
- Purpose: Fetch market prices for selected crops or all crops
- Query params:
  - `crop_id` optional
  - `market_id` optional
  - `date` optional
- Response:
  ```json
  {
    "items": [
      {
        "market_id": "uuid",
        "market_name": "Nashik Mandi",
        "crop_id": "uuid",
        "crop_name": "Onion",
        "price_per_unit": 2100,
        "unit": "kg",
        "price_date": "2026-09-01"
      }
    ]
  }
  ```
- Status codes:
  - 200 OK
  - 400 Bad Request

#### GET /api/v1/markets/compare
- Purpose: Compare crop prices across markets
- Query params:
  - `crop_id`
  - `location_id`
  - `radius_km` optional
- Response:
  ```json
  {
    "crop_id": "uuid",
    "crop_name": "Onion",
    "markets": [
      {
        "market_id": "uuid",
        "market_name": "Nashik Mandi",
        "price_per_unit": 2100,
        "distance_km": 18.4
      },
      {
        "market_id": "uuid",
        "market_name": "Pune Market",
        "price_per_unit": 1950,
        "distance_km": 72.5
      }
    ],
    "best_market": {
      "market_id": "uuid",
      "market_name": "Nashik Mandi"
    }
  }
  ```
- Status codes:
  - 200 OK
  - 400 Bad Request

---

### 4.4 Buyer

#### POST /api/v1/buyers/demands
- Purpose: Create a buyer demand
- Request body:
  ```json
  {
    "crop_id": "uuid",
    "quantity": 500,
    "unit": "kg",
    "preferred_price": 2050,
    "market_id": "uuid",
    "valid_from": "2026-09-01",
    "valid_until": "2026-09-10"
  }
  ```
- Response:
  ```json
  {
    "id": "uuid",
    "buyer_profile_id": "uuid",
    "crop_id": "uuid",
    "demand_status": "active"
  }
  ```
- Status codes:
  - 201 Created
  - 401 Unauthorized
  - 400 Bad Request

#### GET /api/v1/buyers/demands
- Purpose: View active buyer demands
- Response:
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "crop_name": "Onion",
        "quantity": 500,
        "unit": "kg",
        "preferred_price": 2050,
        "demand_status": "active"
      }
    ]
  }
  ```
- Status codes:
  - 200 OK
  - 401 Unauthorized

---

### 4.5 Matching

#### GET /api/v1/matching/recommendations/{lot_id}
- Purpose: Get recommended buyers for a produce lot
- Response:
  ```json
  {
    "lot_id": "uuid",
    "recommendations": [
      {
        "buyer_profile_id": "uuid",
        "company_name": "ABC Traders",
        "score": 0.91,
        "match_reason": "Strong demand for onions in nearby district",
        "preferred_price": 2100,
        "distance_km": 12.5
      }
    ]
  }
  ```
- Status codes:
  - 200 OK
  - 404 Not Found

---

### 4.6 Offers

#### POST /api/v1/offers
- Purpose: Create buyer offer for a lot
- Request body:
  ```json
  {
    "produce_lot_id": "uuid",
    "buyer_profile_id": "uuid",
    "offered_price": 2150,
    "quantity": 100,
    "unit": "kg",
    "offer_message": "Ready to procure within 48 hours"
  }
  ```
- Response:
  ```json
  {
    "id": "uuid",
    "offer_status": "pending",
    "produce_lot_id": "uuid",
    "offered_price": 2150
  }
  ```
- Status codes:
  - 201 Created
  - 400 Bad Request
  - 401 Unauthorized

#### GET /api/v1/farmers/lots/{lot_id}/offers
- Purpose: Get all offers for a farmer's lot
- Response:
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "buyer_name": "ABC Traders",
        "offered_price": 2150,
        "quantity": 100,
        "unit": "kg",
        "offer_status": "pending"
      }
    ]
  }
  ```
- Status codes:
  - 200 OK
  - 401 Unauthorized
  - 404 Not Found

#### PATCH /api/v1/offers/{offer_id}/decision
- Purpose: Accept or reject an offer
- Request body:
  ```json
  {
    "decision": "accepted",
    "reason": "Offer is within farmer expectation"
  }
  ```
- Response:
  ```json
  {
    "id": "uuid",
    "offer_status": "accepted",
    "message": "Offer accepted"
  }
  ```
- Status codes:
  - 200 OK
  - 400 Bad Request
  - 401 Unauthorized
  - 404 Not Found

---

### 4.7 Orders

#### POST /api/v1/orders
- Purpose: Create an order after offer acceptance
- Request body:
  ```json
  {
    "produce_lot_id": "uuid",
    "buyer_offer_id": "uuid",
    "farmer_profile_id": "uuid",
    "buyer_profile_id": "uuid",
    "agreed_price": 2150,
    "agreed_quantity": 100,
    "unit": "kg"
  }
  ```
- Response:
  ```json
  {
    "id": "uuid",
    "order_status": "created",
    "agreed_price": 2150,
    "agreed_quantity": 100
  }
  ```
- Status codes:
  - 201 Created
  - 400 Bad Request
  - 401 Unauthorized

#### GET /api/v1/orders/{order_id}
- Purpose: View order details
- Response:
  ```json
  {
    "id": "uuid",
    "produce_lot_id": "uuid",
    "buyer_company": "ABC Traders",
    "farmer_name": "Ramesh Kumar",
    "order_status": "created",
    "agreed_price": 2150,
    "agreed_quantity": 100,
    "unit": "kg"
  }
  ```
- Status codes:
  - 200 OK
  - 404 Not Found

---

### 4.8 Recommendation

#### GET /api/v1/recommendations/lots/{lot_id}
- Purpose: Get selling recommendation for a produce lot
- Response:
  ```json
  {
    "lot_id": "uuid",
    "recommended_market_id": "uuid",
    "recommended_market_name": "Nashik Mandi",
    "recommended_price": 2140,
    "predicted_price_gain": 140,
    "reason_summary": "Current mandi prices are highest in this market and demand is strong for this crop segment",
    "confidence_score": 0.88,
    "created_at": "2026-09-01T12:00:00Z"
  }
  ```
- Status codes:
  - 200 OK
  - 404 Not Found

---

## 5. Data flow

### Primary flow

1. Farmer registers and creates profile
2. Farmer creates a produce lot with crop, quantity, quality details, and location
3. System fetches current market prices for the crop from relevant markets
4. Price comparison logic identifies best options by market and proximity
5. Recommendation engine generates a suggested selling price and best market
6. Buyer demand and matching logic ranks suitable buyers for the lot
7. Buyer creates an offer
8. Farmer accepts or rejects the offer
9. Order is created after acceptance
10. System stores order state and prepares later modules such as logistics, payments, and grievances

### Data sources

- External market data
  - mandi prices
  - weather and seasonal trends
  - crop condition or quality data
  - district-level commodity demand data

- Internal user-entered data
  - farmer profile and farm details
  - produce lot details
  - location information
  - buyer company details and demand constraints

- System-generated data
  - recommendations
  - ranking or matching scores
  - offer decision status
  - accepted order records

---

## 6. Future modules

The first architecture is intentionally limited but expandable for the next phases:

1. Logistics tracking
   - transport status
   - vehicle assignment
   - pickup/delivery milestones

2. Payment tracking
   - settlement status
   - installment handling
   - payment proofs

3. Grievances and dispute management
   - complaint intake
   - escalation flow
   - resolution notes

4. IVR and SMS workflows
   - voice prompts in local languages
   - farmer-friendly order and recommendation notifications

5. Multi-market analytics
   - price trend prediction
   - seasonal demand forecasting
   - crop health and risk indicators

6. Audit and compliance
   - KYC validation
   - transaction logs
   - farmer/buyer verification workflows

---

## Recommended first implementation priorities

For the hackathon MVP, prioritize:

1. User authentication and role separation
2. Farmer create lot flow
3. Market price retrieval and comparison
4. Basic recommendation generation
5. Buyer demand and matching
6. Offer creation and decision management
7. Order creation

This keeps the system minimal, testable, and aligned with the core workflow while leaving room for future expansion.
