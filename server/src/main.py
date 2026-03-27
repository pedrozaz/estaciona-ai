from fastapi import FastAPI

app = FastAPI(
    title="Estaciona AI Server",
    description="Central server for real-time parking spot management.",
    version="1.0"
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}



