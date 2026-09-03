from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.buyer_matching import buyer_offer_router, produce_lot_buyer_router
from app.routes.master_data import router as master_data_router
from app.routes.produce_lots import router as produce_lots_router

app = FastAPI(title="SIH 26132 API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
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
