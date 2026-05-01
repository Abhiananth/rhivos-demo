"""
Scenario 1 — Mixed Criticality
Real Podman containers with real cgroup enforcement.

  asil-b-container: --cpuset-cpus 0  (dedicated CPU core, physically isolated)
  qm-container:     --cpus 0.6       (60% ceiling on remaining cores)

We poll /health on the ASIL-B container every second and record the latency.
A CPU stress can be triggered inside the QM container.
The ASIL-B latency should be unaffected by the QM storm — that's FFI.
"""
import asyncio
import time
from typing import AsyncIterator
import httpx
import podman_client as podman

ASIL_IMAGE   = "demo-asil-b"
QM_IMAGE     = "demo-qm"
ASIL_NAME    = "demo-asil-b"
QM_NAME      = "demo-qm"
ASIL_PORT    = 8101
QM_PORT      = 8102
CONTEXT_BASE = "/Users/abhi/projects/automotive-demo/containers"

_state = {
    "running": False,
    "asil_latencies": [],      # list of {ts, latency_ms}
    "qm_latencies": [],
    "storm_active": False,
    "asil_deadline_misses": 0,
    "qm_deadline_misses": 0,
    "cycles": 0,
}

ASIL_DEADLINE_MS = 10.0
QM_DEADLINE_MS   = 33.0


async def build_images():
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.build_image, ASIL_IMAGE,
                               f"{CONTEXT_BASE}/asil-b")
    await loop.run_in_executor(None, podman.build_image, QM_IMAGE,
                               f"{CONTEXT_BASE}/qm-service")


async def start(broadcast_fn):
    """Start containers and begin polling."""
    loop = asyncio.get_event_loop()

    # clean up any leftovers
    await loop.run_in_executor(None, podman.cleanup, ASIL_NAME, QM_NAME)

    # start ASIL-B on dedicated CPU core 0
    ok = await loop.run_in_executor(None, lambda: podman.run_container(
        name=ASIL_NAME, image=ASIL_IMAGE,
        env={"SERVICE_NAME": "lane-keep-assist", "CRITICALITY": "ASIL-B"},
        cpuset_cpus="0", port=8000, host_port=ASIL_PORT,
    ))
    if not ok:
        await broadcast_fn({"type": "error", "msg": "Failed to start ASIL-B container"})
        return

    # start QM with 60% CPU ceiling
    ok = await loop.run_in_executor(None, lambda: podman.run_container(
        name=QM_NAME, image=QM_IMAGE,
        env={"SERVICE_NAME": "media-player", "CRITICALITY": "QM"},
        cpus=0.6, port=8000, host_port=QM_PORT,
    ))
    if not ok:
        await broadcast_fn({"type": "error", "msg": "Failed to start QM container"})
        return

    _state["running"] = True
    _state["asil_latencies"].clear()
    _state["qm_latencies"].clear()
    _state["storm_active"] = False
    _state["asil_deadline_misses"] = 0
    _state["qm_deadline_misses"] = 0
    _state["cycles"] = 0

    await broadcast_fn({"type": "scenario1_started",
                        "asil_cpuset": "0 (dedicated core)",
                        "qm_cpus": "0.6 (60% ceiling)"})

    await _poll_loop(broadcast_fn)


async def _poll_loop(broadcast_fn):
    """Poll both containers every second, broadcast latencies."""
    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            ts = time.time()
            asil_lat = await _ping(client, ASIL_PORT)
            qm_lat   = await _ping(client, QM_PORT)

            if asil_lat is not None:
                _state["cycles"] += 1
                rec = {"ts": ts, "latency_ms": asil_lat}
                _state["asil_latencies"].append(rec)
                if len(_state["asil_latencies"]) > 60:
                    _state["asil_latencies"].pop(0)
                if asil_lat > ASIL_DEADLINE_MS:
                    _state["asil_deadline_misses"] += 1

            if qm_lat is not None:
                rec = {"ts": ts, "latency_ms": qm_lat}
                _state["qm_latencies"].append(rec)
                if len(_state["qm_latencies"]) > 60:
                    _state["qm_latencies"].pop(0)
                if qm_lat > QM_DEADLINE_MS:
                    _state["qm_deadline_misses"] += 1

            await broadcast_fn({
                "type": "scenario1_tick",
                "asil_latency_ms": asil_lat,
                "qm_latency_ms": qm_lat,
                "storm_active": _state["storm_active"],
                "asil_deadline_misses": _state["asil_deadline_misses"],
                "qm_deadline_misses": _state["qm_deadline_misses"],
                "cycles": _state["cycles"],
            })
            await asyncio.sleep(1.0)


async def _ping(client: httpx.AsyncClient, port: int):
    try:
        r = await client.get(f"http://localhost:{port}/health")
        if r.status_code == 200:
            return r.json().get("latency_ms")
    except Exception:
        pass
    return None


async def trigger_storm(broadcast_fn):
    """Start CPU stress inside the QM container."""
    _state["storm_active"] = True
    await broadcast_fn({"type": "scenario1_storm_start"})
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            await client.post(f"http://localhost:{QM_PORT}/stress/start")
        except Exception:
            pass
    # auto-stop after 15s
    await asyncio.sleep(15)
    await stop_storm(broadcast_fn)


async def stop_storm(broadcast_fn):
    _state["storm_active"] = False
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            await client.post(f"http://localhost:{QM_PORT}/stress/stop")
        except Exception:
            pass
    await broadcast_fn({"type": "scenario1_storm_stop"})


async def stop(broadcast_fn):
    _state["running"] = False
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.cleanup, ASIL_NAME, QM_NAME)
    await broadcast_fn({"type": "scenario1_stopped"})


def get_state():
    return {
        "running": _state["running"],
        "asil_latencies": _state["asil_latencies"][-20:],
        "qm_latencies": _state["qm_latencies"][-20:],
        "storm_active": _state["storm_active"],
        "asil_deadline_misses": _state["asil_deadline_misses"],
        "qm_deadline_misses": _state["qm_deadline_misses"],
        "cycles": _state["cycles"],
    }
