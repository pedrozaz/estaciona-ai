from fastapi import FastAPI
from .ws_app import router as app_router
from .ws_edge import router as edge_router
from .routes import router as routes_router
from .db import db
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    await db.init_schema()
    yield
    await db.disconnect()

app = FastAPI(
    title="Estaciona AI Server",
    description="Central server for real-time parking spot management.",
    version="1.0",
    lifespan=lifespan
)

app.include_router(app_router)
app.include_router(edge_router)
app.include_router(routes_router)

@app.get("/health")
async def health_check():
    return {"status": "ok"}



