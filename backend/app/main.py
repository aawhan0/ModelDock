from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(title="ModelDock API", version="0.1.0")
app.include_router(api_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
