from fastapi import FastAPI

app = FastAPI(title="SIH 26132 API")


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "project": "SIH 26132",
    }
