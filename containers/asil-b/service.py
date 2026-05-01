#!/usr/bin/env python3
"""
ASIL-B / QM service container.
Responds to health checks and can be put under CPU or memory stress (QM only).
Reports its own response latency so the controller can measure FFI.
"""
import os
import time
import math
import threading
import resource
from fastapi import FastAPI
import uvicorn

app = FastAPI()
SERVICE_NAME  = os.getenv("SERVICE_NAME", "unknown")
CRITICALITY   = os.getenv("CRITICALITY", "QM")

# ── CPU stress ────────────────────────────────────────────────────────────────
_stress_active = False
_stress_lock   = threading.Lock()

def _cpu_burn():
    end = time.monotonic() + 30
    while time.monotonic() < end:
        with _stress_lock:
            if not _stress_active:
                break
        _ = sum(math.sqrt(i) for i in range(5000))

# ── Memory leak ───────────────────────────────────────────────────────────────
_memory_chunks: list = []
_memory_leak_active = False

def _memory_leak():
    global _memory_leak_active
    while _memory_leak_active:
        _memory_chunks.append(bytearray(8 * 1024 * 1024))  # 8 MB per step
        time.sleep(0.8)

def _get_memory_mb() -> float:
    # ru_maxrss is in KB on Linux, bytes on macOS
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # Inside Podman VM (Linux) it's KB
    return round(rss / 1024, 1)

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    start = time.monotonic()
    _ = sum(math.sqrt(i) for i in range(1000))
    elapsed_ms = (time.monotonic() - start) * 1000
    return {
        "service":     SERVICE_NAME,
        "criticality": CRITICALITY,
        "status":      "ok",
        "latency_ms":  round(elapsed_ms, 3),
        "stress":      _stress_active,
        "memory_mb":   _get_memory_mb(),
        "memory_leak": _memory_leak_active,
    }

@app.post("/stress/start")
def stress_start():
    global _stress_active
    if CRITICALITY == "ASIL-B":
        return {"error": "stress not allowed on ASIL-B service"}
    _stress_active = True
    threading.Thread(target=_cpu_burn, daemon=True).start()
    return {"status": "cpu stress started"}

@app.post("/stress/stop")
def stress_stop():
    global _stress_active
    _stress_active = False
    return {"status": "cpu stress stopped"}

@app.post("/memory/start")
def memory_leak_start():
    global _memory_leak_active
    if CRITICALITY == "ASIL-B":
        return {"error": "memory stress not allowed on ASIL-B service"}
    _memory_leak_active = True
    threading.Thread(target=_memory_leak, daemon=True).start()
    return {"status": "memory leak started"}

@app.post("/memory/stop")
def memory_leak_stop():
    global _memory_leak_active, _memory_chunks
    _memory_leak_active = False
    _memory_chunks.clear()
    return {"status": "memory leak stopped"}

@app.get("/info")
def info():
    return {
        "service":     SERVICE_NAME,
        "criticality": CRITICALITY,
        "pid":         os.getpid(),
        "memory_mb":   _get_memory_mb(),
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
