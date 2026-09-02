from fastapi import FastAPI

from app.routes.produce_lots import router as produce_lots_router

app = FastAPI(title="SIH 26132 API")
app.include_router(produce_lots_router)


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "project": "SIH 26132",
    }
