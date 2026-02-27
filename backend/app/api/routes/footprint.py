from fastapi import APIRouter

from app.schemas.footprint import AnalyseRequest, AnalyseResponse
from app.services import land_analysis

router = APIRouter()


@router.post("/analyse", response_model=AnalyseResponse)
async def analyse(request: AnalyseRequest) -> AnalyseResponse:
    return land_analysis.analyse(request)
