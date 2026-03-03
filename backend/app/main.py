import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import footprint

app = FastAPI(title="Farm Footprint Explorer API")

_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173")
_origins = [o.strip() for o in _raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(footprint.router, prefix="/footprint")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
