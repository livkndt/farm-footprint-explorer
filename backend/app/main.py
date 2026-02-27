from fastapi import FastAPI

from app.api.routes import footprint

app = FastAPI(title="Farm Footprint Explorer API")

app.include_router(footprint.router, prefix="/footprint")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
