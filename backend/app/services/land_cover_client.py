import logging

import httpx
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.footprint import LandCoverItem

logger = logging.getLogger(__name__)

# GFW Data API dataset and column names.
# Dataset: ESA CCI Land Cover 2015 (300m, global), version v2016.
_DATASET = "esa_land_cover_2015"
_VERSION = "v2016"
_CLASS_COL = "esa_land_cover_2015__class"

# Maps ESA CCI simplified class names to the keys used in ResultsPanel's COVER_COLORS.
# GFW returns IPCC-simplified classes: Agriculture, Forest, Grassland, Settlement, Water,
# Wetland, Shrubland, Sparse vegetation, Bare area, Permanent ice and snow.
_CLASS_MAP: dict[str, str] = {
    "Forest": "tree_cover",
    "Agriculture": "cropland",
    "Grassland": "grassland",
    "Wetland": "wetland",
    "Settlement": "urban",
    "Water": "water",
    "Bare area": "bare",
    "Sparse vegetation": "bare",
    "Shrubland": "shrubland",
    "Permanent ice and snow": "snow_ice",
}


class _GFWLandCoverRow(BaseModel):
    cover_class: str = Field(alias=_CLASS_COL)
    area_ha: float = Field(alias="area__ha", default=0.0)

    model_config = ConfigDict(populate_by_name=True)


async def fetch_land_cover(
    geometry: dict,
    api_key: str,
    base_url: str,
) -> list[LandCoverItem]:
    """Fetch ESA WorldCover land cover statistics for a GeoJSON geometry.

    Returns a list of LandCoverItem with percentages summing to 100, or an
    empty list if the API is unavailable or returns no data.
    """
    sql = (
        f"SELECT {_CLASS_COL}, SUM(area__ha) AS area__ha "
        f"FROM results GROUP BY {_CLASS_COL}"
    )
    url = f"{base_url}/dataset/{_DATASET}/{_VERSION}/query/json"

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.post(
                url,
                json={"sql": sql, "geometry": geometry},
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
            )

        if response.status_code != 200:
            logger.warning(
                "GFW land cover API returned HTTP %d: %s",
                response.status_code,
                response.text[:200],
            )
            return []

        body = response.json()
        if body.get("status") == "error":
            logger.warning("GFW land cover API returned error status: %s", body)
            return []

        rows = [_GFWLandCoverRow.model_validate(item) for item in body.get("data", [])]
    except Exception as exc:
        logger.warning("GFW land cover fetch failed: %s", exc)
        return []

    total_ha = sum(r.area_ha for r in rows)
    if total_ha <= 0:
        return []

    return [
        LandCoverItem(
            type=_CLASS_MAP.get(r.cover_class, r.cover_class.lower().replace(" ", "_").replace("/", "")),
            percentage=round(r.area_ha / total_ha * 100, 2),
        )
        for r in rows
    ]
