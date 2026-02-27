from fastapi import FastAPI

app = FastAPI(title="Farm Footprint Explorer API")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
