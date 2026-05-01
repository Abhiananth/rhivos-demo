#!/usr/bin/env python3
"""
ASIL-B / QM service container.
Responds to health checks and can be put under CPU stress (QM only).
Reports its own response latency so the controller can measure FFI.
"""
import os
import time
import math
import threading
from fastapi import FastAPI
import uvicorn

app = FastAPI()
SERVICE_NAME  = os.getenv("SERVICE_NAME", "unknown")
CRITICALITY   = os.getenv("CRITICALITY", "QM")

_stress_active = False
_stress_lock   = threading.Lock()

def _cpu_burn():
    """Spin the CPU — simulates a misbehaving QM process."""
    end = time.monotonic() + 15   # burn for 15 seconds
    while time.monotonic() < end:
        with _stress_lock:
            if not _stress_active:
                break
        # busy-work
        _ = sum(math.sqrt(i) for i in range(5000))

@app.get("/health")
def health():
    start = time.monotonic()
    # small computation to make latency measurable
    _ = sum(math.sqrt(i) for i in range(1000))
    elapsed_ms = (time.monotonic() - start) * 1000
    return {
        "service":     SERVICE_NAME,
        "criticality": CRITICALITY,
        "status":      "ok",
        "latency_ms":  round(elapsed_ms, 3),
        "stress":      _stress_active,
    }

@app.post("/stress/start")
def stress_start():
    global _stress_active
    if CRITICALITY == "ASIL-B":
        return {"error": "stress not allowed on ASIL-B service"}
    _stress_active = True
    t = threading.Thread(target=_cpu_burn, daemon=True)
    t.start()
    return {"status": "stress started"}

@app.post("/stress/stop")
def stress_stop():
    global _stress_active
    _stress_active = False
    return {"status": "stress stopped"}

@app.get("/info")
def info():
    return {
        "service":     SERVICE_NAME,
        "criticality": CRITICALITY,
        "pid":         os.getpid(),
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
