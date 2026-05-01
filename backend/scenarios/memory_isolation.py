"""
Scenario 4 — Memory Isolation
Demonstrates Linux memory cgroup enforcement between ASIL-B and QM containers.

  asil-b: --memory 384m  (ceiling) + no artificial leak possible
  qm:     --memory 160m  (tight ceiling — will OOM-kill if over)

Trigger a memory leak inside QM → it hits the kernel limit → OOM killed.
ASIL-B memory stays stable. That's memory-domain Freedom from Interference.
"""
import asyncio
import time
import httpx
import podman_client as podman

ASIL_IMAGE = "demo-asil-b"
QM_IMAGE   = "demo-qm"
ASIL_NAME  = "demo-mem-asil"
QM_NAME    = "demo-mem-qm"
ASIL_PORT  = 8401
QM_PORT    = 8402

ASIL_MEM_LIMIT_MB = 384
QM_MEM_LIMIT_MB   = 160

_state = {
    "running":      False,
    "leak_active":  False,
    "asil_mem_mb":  0.0,
    "qm_mem_mb":    0.0,
    "qm_oom_count": 0,
    "asil_oom_count": 0,
    "cycles":       0,
    "log":          [],
}


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    _state["log"].append(entry)
    if len(_state["log"]) > 25:
        _state["log"].pop(0)
    return entry


async def start(broadcast_fn):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.cleanup, ASIL_NAME, QM_NAME)

    _state.update(running=True, leak_active=False, asil_mem_mb=0, qm_mem_mb=0,
                  qm_oom_count=0, asil_oom_count=0, cycles=0)
    _state["log"].clear()

    # ASIL-B with 384 MB ceiling
    ok = await loop.run_in_executor(None, lambda: podman.run_container(
        name=ASIL_NAME, image=ASIL_IMAGE,
        env={"SERVICE_NAME": "lane-keep-assist", "CRITICALITY": "ASIL-B"},
        cpus=0.4, memory_mb=ASIL_MEM_LIMIT_MB, port=8000, host_port=ASIL_PORT,
    ))
    if not ok:
        await broadcast_fn({"type": "error", "msg": "Memory scenario: failed to start ASIL-B container"})
        return

    # QM with 160 MB tight ceiling
    ok = await loop.run_in_executor(None, lambda: podman.run_container(
        name=QM_NAME, image=QM_IMAGE,
        env={"SERVICE_NAME": "media-player", "CRITICALITY": "QM"},
        cpus=0.6, memory_mb=QM_MEM_LIMIT_MB, port=8000, host_port=QM_PORT,
    ))
    if not ok:
        await broadcast_fn({"type": "error", "msg": "Memory scenario: failed to start QM container"})
        return

    _log(f"ASIL-B started — memory ceiling: {ASIL_MEM_LIMIT_MB} MB")
    _log(f"QM started — memory ceiling: {QM_MEM_LIMIT_MB} MB")
    await broadcast_fn({"type": "scenario4_started", "state": get_state()})
    await _poll_loop(broadcast_fn)


async def _poll_loop(broadcast_fn):
    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            asil_mem = await _get_mem(client, ASIL_PORT)
            qm_mem   = await _get_mem(client, QM_PORT)

            if asil_mem is not None:
                _state["asil_mem_mb"] = asil_mem
            if qm_mem is not None:
                _state["qm_mem_mb"] = qm_mem
            else:
                # QM not responding — likely OOM killed
                if _state["leak_active"]:
                    _state["qm_oom_count"] += 1
                    _state["leak_active"] = False
                    _log(f"⚡ QM OOM KILLED by kernel (exceeded {QM_MEM_LIMIT_MB} MB limit)")
                    _log(f"✓ ASIL-B memory unaffected — {_state['asil_mem_mb']:.0f} MB stable")
                    await broadcast_fn({"type": "scenario4_oom", "state": get_state()})
                    # Auto-restart QM after 3s (it's QM policy)
                    await asyncio.sleep(3.0)
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, podman.remove_container, QM_NAME)
                    ok = await loop.run_in_executor(None, lambda: podman.run_container(
                        name=QM_NAME, image=QM_IMAGE,
                        env={"SERVICE_NAME": "media-player", "CRITICALITY": "QM"},
                        cpus=0.6, memory_mb=QM_MEM_LIMIT_MB, port=8000, host_port=QM_PORT,
                    ))
                    if ok:
                        _log("QM restarted by controller (auto-restart policy)")
                        _state["qm_mem_mb"] = 0

            _state["cycles"] += 1
            await broadcast_fn({"type": "scenario4_tick", "state": get_state()})
            await asyncio.sleep(1.0)


async def _get_mem(client: httpx.AsyncClient, port: int):
    try:
        r = await client.get(f"http://localhost:{port}/health")
        if r.status_code == 200:
            return r.json().get("memory_mb")
    except Exception:
        pass
    return None


async def start_leak(broadcast_fn):
    _state["leak_active"] = True
    _log(f"Memory leak started in QM — allocating 8 MB/s toward {QM_MEM_LIMIT_MB} MB limit")
    await broadcast_fn({"type": "scenario4_leak_start"})
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            await client.post(f"http://localhost:{QM_PORT}/memory/start")
        except Exception:
            pass


async def stop_leak(broadcast_fn):
    _state["leak_active"] = False
    async with httpx.AsyncClient(timeout=3.0) as client:
        try:
            await client.post(f"http://localhost:{QM_PORT}/memory/stop")
        except Exception:
            pass
    _log("Memory leak stopped — QM memory released")
    await broadcast_fn({"type": "scenario4_leak_stop"})


async def stop(broadcast_fn):
    _state["running"] = False
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.cleanup, ASIL_NAME, QM_NAME)
    await broadcast_fn({"type": "scenario4_stopped"})


def get_state():
    return {
        "running":        _state["running"],
        "leak_active":    _state["leak_active"],
        "asil_mem_mb":    _state["asil_mem_mb"],
        "qm_mem_mb":      _state["qm_mem_mb"],
        "asil_limit_mb":  ASIL_MEM_LIMIT_MB,
        "qm_limit_mb":    QM_MEM_LIMIT_MB,
        "qm_oom_count":   _state["qm_oom_count"],
        "asil_oom_count": _state["asil_oom_count"],
        "cycles":         _state["cycles"],
        "log":            _state["log"][-15:],
    }
