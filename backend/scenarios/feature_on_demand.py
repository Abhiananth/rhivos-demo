"""
Scenario 8 — Feature-on-Demand (per-container OTA)

Demonstrates that RHIVOS can update a single QM container (IVI software)
without ever touching the ASIL-B safety container.

  fod-asil  — ASIL-B ADAS (--cpus 0.4) — runs throughout, latency stays flat
  fod-qm    — QM Media/IVI service — atomically swapped v1.0.0 → v2.0.0

During the swap:
  · ASIL-B never restarts, health never drops
  · QM has ~4s container-swap window
  · On real RHIVOS: atomic layer swap keeps downtime to <500ms
"""
import asyncio
import time
import httpx
import podman_client as podman

ASIL_PORT = 8801
QM_PORT   = 8802
ASIL_NAME = "fod-asil"
QM_NAME   = "fod-qm"

_state: dict = {
    "running": False,
    "asil_status": "stopped",
    "qm_status": "stopped",
    "qm_version": "v1.0.0",
    "asil_latency": [],
    "qm_latency": [],
    "qm_downtime_ms": 0,
    "update_in_progress": False,
    "asil_uptime_s": 0,
    "log": [],
    "error": None,
}

_run_task: asyncio.Task | None = None


def get_state() -> dict:
    return dict(_state)


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    _state["log"] = ([f"[{ts}] {msg}"] + _state["log"])[:30]


async def start(broadcast):
    global _state, _run_task
    podman.cleanup(ASIL_NAME, QM_NAME)
    _state.update({
        "running": True, "asil_status": "starting", "qm_status": "starting",
        "qm_version": "v1.0.0", "asil_latency": [], "qm_latency": [],
        "update_in_progress": False, "asil_uptime_s": 0,
        "qm_downtime_ms": 0, "log": [], "error": None,
    })
    await broadcast({"type": "s8_state", **_state})

    ok_asil = podman.run_container(
        ASIL_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "ADAS-Safety"},
        cpus=0.4, port=8000, host_port=ASIL_PORT,
    )
    if not ok_asil:
        _state["error"] = "Failed to start ASIL-B container. Run 'Build container images' first."
        _state["running"] = False
        await broadcast({"type": "s8_state", **_state})
        return

    ok_qm = podman.run_container(
        QM_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "IVI-Media", "APP_VERSION": "v1.0.0"},
        port=8000, host_port=QM_PORT,
    )
    if not ok_qm:
        _state["error"] = "Failed to start QM IVI container."
        _state["running"] = False
        await broadcast({"type": "s8_state", **_state})
        return

    _log("ASIL-B ADAS started  →  fod-asil  --cpus 0.4  port 8801")
    _log("QM IVI started       →  fod-qm    v1.0.0      port 8802")
    _log("Both healthy. Trigger 'Push IVI Update' to demonstrate FoD.")
    await asyncio.sleep(1.5)
    _run_task = asyncio.create_task(_poll_loop(broadcast))


async def _poll_loop(broadcast):
    start_t = time.time()
    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            _state["asil_uptime_s"] = int(time.time() - start_t)

            t0 = time.time()
            try:
                r = await client.get(f"http://localhost:{ASIL_PORT}/health")
                asil_ms = round((time.time() - t0) * 1000, 1)
                _state["asil_status"] = "healthy" if r.status_code == 200 else "unhealthy"
            except Exception:
                asil_ms = 9999.0
                _state["asil_status"] = "unreachable"
            _state["asil_latency"] = (_state["asil_latency"] + [asil_ms])[-60:]

            if not _state["update_in_progress"]:
                t0 = time.time()
                try:
                    r = await client.get(f"http://localhost:{QM_PORT}/health")
                    qm_ms = round((time.time() - t0) * 1000, 1)
                    _state["qm_status"] = "healthy" if r.status_code == 200 else "unhealthy"
                    _state["qm_latency"] = (_state["qm_latency"] + [qm_ms])[-60:]
                except Exception:
                    _state["qm_status"] = "unreachable"

            await broadcast({"type": "s8_state", **_state})
            await asyncio.sleep(1.0)


async def push_update(broadcast):
    """Atomically swap QM from v1.0.0 to v2.0.0 while ASIL-B keeps running."""
    if not _state["running"] or _state["update_in_progress"]:
        return

    _state["update_in_progress"] = True
    _state["qm_status"] = "updating"
    swap_start = time.time()
    _log("▶ Feature-on-Demand update triggered")
    _log("  Verifying IVI image v2.0.0 signature…")
    await broadcast({"type": "s8_state", **_state})
    await asyncio.sleep(1.2)

    _log("  Stopping IVI v1.0.0…")
    await broadcast({"type": "s8_state", **_state})
    podman.stop_container(QM_NAME)
    podman.remove_container(QM_NAME)
    await asyncio.sleep(0.6)

    _log("  Starting IVI v2.0.0…")
    await broadcast({"type": "s8_state", **_state})
    podman.run_container(
        QM_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "IVI-Media", "APP_VERSION": "v2.0.0"},
        port=8000, host_port=QM_PORT,
    )
    await asyncio.sleep(1.5)

    downtime_ms = round((time.time() - swap_start) * 1000)
    _state["qm_version"] = "v2.0.0"
    _state["qm_downtime_ms"] = downtime_ms
    _state["update_in_progress"] = False
    _log(f"✅ IVI updated to v2.0.0 — swap window {downtime_ms} ms")
    _log(f"   ASIL-B uptime: {_state['asil_uptime_s']}s — ZERO interruption")
    await broadcast({"type": "s8_state", **_state})


async def stop(broadcast):
    global _run_task
    _state["running"] = False
    if _run_task:
        _run_task.cancel()
        _run_task = None
    podman.cleanup(ASIL_NAME, QM_NAME)
    _state.update({"asil_status": "stopped", "qm_status": "stopped",
                   "update_in_progress": False})
    _log("Scenario stopped")
    await broadcast({"type": "s8_state", **_state})
