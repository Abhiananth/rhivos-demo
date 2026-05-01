"""
Scenario 3 — OTA Update
Real container image swap with health-check gating and automatic rollback.

  Slot A (active):  demo-ota:v1  running on port 8301
  Slot B (standby): demo-ota:v2  pulled in background, swapped atomically

If health check fails after swap → automatic rollback to v1.
/var data (represented by a persistent volume) survives the swap.
"""
import asyncio
import time
import httpx
import podman_client as podman

CONTEXT_BASE = "/Users/abhi/projects/automotive-demo/containers"
IMAGE_V1     = "demo-ota:v1"
IMAGE_V2     = "demo-ota:v2"
CONTAINER    = "demo-ota-active"
PORT         = 8301

_state = {
    "running": False,
    "active_version": None,
    "active_slot": None,
    "standby_version": None,
    "status": "idle",          # idle | pulling | writing | rebooting | rollback | active
    "progress": 0,
    "boot_count": 0,
    "fault_staged": False,
    "log": [],
    "var_log_count": 4,        # simulates /var log entry count persisting across swaps
}


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    _state["log"].append(entry)
    if len(_state["log"]) > 20:
        _state["log"].pop(0)
    return entry


async def start(broadcast_fn):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.remove_container, CONTAINER)

    _state["running"] = True
    _state["boot_count"] = 1
    _state["status"] = "active"
    _state["active_version"] = "1.0.0"
    _state["active_slot"] = "A"
    _state["standby_version"] = None
    _state["fault_staged"] = False
    _state["log"].clear()

    ok = await loop.run_in_executor(None, lambda: podman.run_container(
        name=CONTAINER, image=IMAGE_V1,
        env={"VERSION": "1.0.0", "BUILD_COLOR": "blue", "SERVICE_NAME": "ota-service"},
        port=8000, host_port=PORT,
    ))

    if not ok:
        _log("Failed to start v1 container — check image build")
        await broadcast_fn({"type": "error", "msg": "OTA: failed to start v1"})
        return

    _log(f"Slot A active: ota-service v1.0.0")
    _log("ComposeFS: / mounted read-only")
    _log("/var mounted read-write — persists across updates")
    await broadcast_fn({"type": "scenario3_started", "state": get_state()})


async def push_update(broadcast_fn):
    """Pull v2, write to standby slot, reboot, health-check, commit or rollback."""
    if _state["status"] != "active":
        await broadcast_fn({"type": "error", "msg": "Update already in progress"})
        return

    fault = _state["fault_staged"]
    _state["fault_staged"] = False

    # Stage 1: pull image (simulate progress)
    _state["status"] = "pulling"
    _state["standby_version"] = "2.0.0"
    _log(f"Pulling demo-ota:v2 into standby slot B...")
    await broadcast_fn({"type": "scenario3_tick", "state": get_state()})

    loop = asyncio.get_event_loop()
    # Build v2 image (using local context) in background
    await loop.run_in_executor(None, podman.build_image, IMAGE_V2,
                               f"{CONTEXT_BASE}/ota-v2")

    for i in range(1, 11):
        _state["progress"] = i * 10
        await broadcast_fn({"type": "scenario3_tick", "state": get_state()})
        await asyncio.sleep(0.4)

    # Stage 2: writing
    _state["status"] = "writing"
    _log("Image written to slot B — active slot A still running")
    await broadcast_fn({"type": "scenario3_tick", "state": get_state()})
    await asyncio.sleep(1.5)

    # Stage 3: reboot into new image
    _state["status"] = "rebooting"
    _state["boot_count"] += 1
    _log(f"--- REBOOT #{_state['boot_count']} --- booting from slot B (v2.0.0)")
    await broadcast_fn({"type": "scenario3_tick", "state": get_state()})

    # Stop v1, start v2
    await loop.run_in_executor(None, podman.remove_container, CONTAINER)
    await asyncio.sleep(1.0)

    if fault:
        # Inject fault: start v2 but immediately mark it broken
        ok = await loop.run_in_executor(None, lambda: podman.run_container(
            name=CONTAINER, image=IMAGE_V2,
            env={"VERSION": "2.0.0", "BUILD_COLOR": "green", "SERVICE_NAME": "ota-service"},
            port=8000, host_port=PORT,
        ))
        await asyncio.sleep(2.0)
        # Break it via API so health check fails
        async with httpx.AsyncClient(timeout=2.0) as client:
            try:
                await client.post(f"http://localhost:{PORT}/break")
            except Exception:
                pass

    else:
        ok = await loop.run_in_executor(None, lambda: podman.run_container(
            name=CONTAINER, image=IMAGE_V2,
            env={"VERSION": "2.0.0", "BUILD_COLOR": "green", "SERVICE_NAME": "ota-service"},
            port=8000, host_port=PORT,
        ))
        await asyncio.sleep(2.0)

    # Stage 4: health check
    healthy = await _health_check()

    if healthy:
        _state["status"] = "active"
        _state["active_version"] = "2.0.0"
        _state["active_slot"] = "B"
        _state["standby_version"] = "1.0.0"
        _state["progress"] = 0
        _state["var_log_count"] += 2
        _log("Self-check PASSED — v2.0.0 active")
        _log(f"Slot A retained as rollback target (v1.0.0)")
        _log(f"/var intact — {_state['var_log_count']} log entries survived update")
        await broadcast_fn({"type": "scenario3_updated", "state": get_state()})
    else:
        # Rollback
        _state["status"] = "rollback"
        _log("Self-check FAILED — rolling back to slot A (v1.0.0)")
        await broadcast_fn({"type": "scenario3_tick", "state": get_state()})
        await loop.run_in_executor(None, podman.remove_container, CONTAINER)
        await asyncio.sleep(1.0)
        await loop.run_in_executor(None, lambda: podman.run_container(
            name=CONTAINER, image=IMAGE_V1,
            env={"VERSION": "1.0.0", "BUILD_COLOR": "blue", "SERVICE_NAME": "ota-service"},
            port=8000, host_port=PORT,
        ))
        _state["status"] = "active"
        _state["active_version"] = "1.0.0"
        _state["active_slot"] = "A"
        _state["standby_version"] = None
        _state["progress"] = 0
        _state["var_log_count"] += 1
        _log(f"Rollback complete — v1.0.0 active")
        _log(f"/var intact — {_state['var_log_count']} log entries survived rollback")
        await broadcast_fn({"type": "scenario3_rollback", "state": get_state()})


async def _health_check() -> bool:
    async with httpx.AsyncClient(timeout=2.0) as client:
        for _ in range(3):
            try:
                r = await client.get(f"http://localhost:{PORT}/health")
                if r.status_code == 200:
                    data = r.json()
                    if data.get("status") == "ok":
                        return True
            except Exception:
                pass
            await asyncio.sleep(0.5)
    return False


async def stage_fault(broadcast_fn):
    _state["fault_staged"] = True
    _log("Fault staged — next update will fail self-check → rollback demo")
    await broadcast_fn({"type": "scenario3_fault_staged", "state": get_state()})


async def stop(broadcast_fn):
    _state["running"] = False
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.remove_container, CONTAINER)
    await broadcast_fn({"type": "scenario3_stopped"})


def get_state():
    return {
        "running": _state["running"],
        "active_version": _state["active_version"],
        "active_slot": _state["active_slot"],
        "standby_version": _state["standby_version"],
        "status": _state["status"],
        "progress": _state["progress"],
        "boot_count": _state["boot_count"],
        "fault_staged": _state["fault_staged"],
        "log": _state["log"][-10:],
        "var_log_count": _state["var_log_count"],
    }
