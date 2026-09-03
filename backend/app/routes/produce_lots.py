from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.entities import Market
from app.schemas.net_realization import NetRealizationComparisonRead, NetRealizationRead
from app.schemas.recommendation import RecommendationRead, RecommendedMarketRead
from app.schemas.produce_lot import ProduceLotCreate, ProduceLotRead
from app.services.net_realization import calculate_lot_net_realizations
from app.services.recommendations import get_recommendation
from app.services.produce_lots import SellProduceLotError, create_produce_lot, get_produce_lot, sell_produce_lot

router = APIRouter(prefix="/api/v1/produce-lots", tags=["produce-lots"])


def _recommendation_market(candidate) -> RecommendedMarketRead:
    return RecommendedMarketRead(
        market_id=candidate.calculation.market.id,
        market_name=candidate.calculation.market.name,
        price=candidate.calculation.market_price.price_per_unit,
        price_unit=candidate.calculation.price_unit,
        net_realization=candidate.calculation.net_realization,
        trend_direction=candidate.trend.trend_direction,
        percentage_change=candidate.trend.percentage_change,
    )


@router.get("/{lot_id}/recommendation", response_model=RecommendationRead)
def read_recommendation(lot_id: UUID, db: Session = Depends(get_db)) -> RecommendationRead:
    produce_lot, recommendation = get_recommendation(db, lot_id)
    if produce_lot is None or recommendation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produce lot not found")
    return RecommendationRead(
        produce_lot_id=produce_lot.id,
        recommended_market=_recommendation_market(recommendation.recommended) if recommendation.recommended else None,
        next_best_market=_recommendation_market(recommendation.next_best) if recommendation.next_best else None,
        advantage_over_next_best=recommendation.advantage,
        reasons=recommendation.reasons,
    )


def _net_realization_response(calculation, produce_lot) -> NetRealizationRead:
    return NetRealizationRead(
        market_id=calculation.market.id,
        market_name=calculation.market.name,
        crop_id=calculation.market_price.crop_id,
        crop_name=calculation.market_price.crop.name,
        quantity=produce_lot.quantity,
        quantity_unit=produce_lot.unit,
        quantity_in_price_unit=calculation.quantity_in_price_unit,
        price=calculation.market_price.price_per_unit,
        price_unit=calculation.price_unit,
        price_date=calculation.market_price.price_date,
        gross_value=calculation.gross_value,
        estimated_transport_cost=calculation.estimated_transport_cost,
        net_realization=calculation.net_realization,
    )


@router.get("/{lot_id}/net-realization", response_model=NetRealizationComparisonRead)
def read_net_realization(lot_id: UUID, market_id: UUID | None = None, db: Session = Depends(get_db)) -> NetRealizationComparisonRead:
    produce_lot, calculations = calculate_lot_net_realizations(db, lot_id, market_id)
    if produce_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produce lot not found")
    if market_id is not None and db.get(Market, market_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Market not found")
    if not calculations:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No market price available for this lot")
    results = [_net_realization_response(calculation, produce_lot) for calculation in calculations]
    highest = max(results, key=lambda result: result.net_realization)
    return NetRealizationComparisonRead(results=results, highest_estimated_net_realization=highest)


@router.post("", response_model=ProduceLotRead, status_code=status.HTTP_201_CREATED)
def create_lot(lot_data: ProduceLotCreate, db: Session = Depends(get_db)) -> ProduceLotRead:
    try:
        return create_produce_lot(db, lot_data)
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Produce lot conflicts with an existing record or references missing data",
        ) from error


@router.get("/{lot_id}", response_model=ProduceLotRead)
def read_lot(lot_id: UUID, db: Session = Depends(get_db)) -> ProduceLotRead:
    produce_lot = get_produce_lot(db, lot_id)
    if produce_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produce lot not found")
    return produce_lot


@router.post("/{lot_id}/sell", response_model=ProduceLotRead)
def sell_lot(lot_id: UUID, db: Session = Depends(get_db)) -> ProduceLotRead:
    try:
        return sell_produce_lot(db, lot_id)
    except SellProduceLotError as error:
        status_code = status.HTTP_404_NOT_FOUND if "not found" in error.message.lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=status_code, detail=error.message) from error
    except IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not put produce lot up for sale because of a database conflict",
        ) from error