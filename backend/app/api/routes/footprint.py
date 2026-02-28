from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.footprint import AnalyseRequest, AnalyseResponse
from app.services import land_analysis

router = APIRouter()


@router.post("/analyse", response_model=AnalyseResponse)
async def analyse(
    request: AnalyseRequest,
    db: AsyncSession = Depends(get_db),
) -> AnalyseResponse:
    return await land_analysis.analyse_footprint(
        geometry=request.geometry.model_dump(),
        db=db,
        buffer_km=request.buffer_km,
    )
