from fastapi import FastAPI

from app.routes.buyer_matching import buyer_offer_router, produce_lot_buyer_router
from app.routes.master_data import router as master_data_router
from app.routes.produce_lots import router as produce_lots_router

app = FastAPI(title="SIH 26132 API")
app.include_router(master_data_router)
app.include_router(produce_lots_router)
app.include_router(produce_lot_buyer_router)
app.include_router(buyer_offer_router)


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "project": "SIH 26132",
    }
