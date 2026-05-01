#!/usr/bin/env python3
"""OTA versioned service — v1 (blue) and v2 (green) share this code."""
import os
import time
import math
from fastapi import FastAPI
import uvicorn

app = FastAPI()
VERSION     = os.getenv("VERSION", "0.0.0")
BUILD_COLOR = os.getenv("BUILD_COLOR", "unknown")
SERVICE     = os.getenv("SERVICE_NAME", "ota-service")

_healthy = True   # can be toggled to simulate a bad build

@app.get("/health")
def health():
    start = time.monotonic()
    _ = sum(math.sqrt(i) for i in range(500))
    latency_ms = (time.monotonic() - start) * 1000
    if not _healthy:
        return {"status": "unhealthy", "version": VERSION, "latency_ms": round(latency_ms, 3)}
    return {
        "status":      "ok",
        "version":     VERSION,
        "build_color": BUILD_COLOR,
        "latency_ms":  round(latency_ms, 3),
    }

@app.post("/break")
def break_service():
    global _healthy
    _healthy = False
    return {"status": "service broken — health check will fail"}

@app.get("/info")
def info():
    return {"service": SERVICE, "version": VERSION, "build_color": BUILD_COLOR}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
