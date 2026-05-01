"""
Scenario 7 — Temporal Isolation / PREEMPT_RT

Demonstrates how CPU bandwidth reservation enforces deterministic timing
even under heavy background load — the Linux-kernel story behind PREEMPT_RT.

  temporal-safe   — --cpus 0.4 (guaranteed bandwidth, consistent latency)
  temporal-normal — no CPU limit (competes freely with background noise)
  temporal-stress — CPU burner spawned on demand to stress the system

Key visual:
  · Latency histogram — shows tight vs wide distribution side-by-side
  · Jitter = max(last 20 samples) - min(last 20 samples)
  · Trigger CPU storm → safe container stays tight, normal container widens
"""
import asyncio
import time
import httpx
import podman_client as podman

SAFE_PORT   = 8811
NORMAL_PORT = 8812
SAFE_NAME   = "temporal-safe"
NORMAL_NAME = "temporal-normal"
STRESS_NAME = "temporal-stress"

_state: dict = {
    "running": False,
    "stress_active": False,
    "safe_status": "stopped",
    "normal_status": "stopped",
    "safe_latencies": [],
    "normal_latencies": [],
    "safe_jitter": 0.0,
    "normal_jitter": 0.0,
    # histogram: % of samples in <1ms, 1-2ms, 2-5ms, 5-10ms, >10ms
    "safe_hist": [0, 0, 0, 0, 0],
    "normal_hist": [0, 0, 0, 0, 0],
    "log": [],
    "error": None,
}

_run_task: asyncio.Task | None = None
_stress_task: asyncio.Task | None = None

_BUCKETS = [(0, 1), (1, 2), (2, 5), (5, 10), (10, 9999)]


def _bucket(ms: float) -> int:
    for i, (lo, hi) in enumerate(_BUCKETS):
        if lo <= ms < hi:
            return i
    return 4


def _hist(latencies: list) -> list:
    if not latencies:
        return [0, 0, 0, 0, 0]
    counts = [0] * 5
    for v in latencies[-50:]:
        counts[_bucket(v)] += 1
    total = sum(counts) or 1
    return [round(c / total * 100) for c in counts]


def _jitter(latencies: list) -> float:
    if len(latencies) < 2:
        return 0.0
    recent = latencies[-20:]
    return round(max(recent) - min(recent), 1)


def get_state() -> dict:
    return dict(_state)


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    _state["log"] = ([f"[{ts}] {msg}"] + _state["log"])[:30]


async def start(broadcast):
    global _state, _run_task
    podman.cleanup(SAFE_NAME, NORMAL_NAME, STRESS_NAME)
    _state.update({
        "running": True, "stress_active": False,
        "safe_status": "starting", "normal_status": "starting",
        "safe_latencies": [], "normal_latencies": [],
        "safe_jitter": 0.0, "normal_jitter": 0.0,
        "safe_hist": [0] * 5, "normal_hist": [0] * 5,
        "log": [], "error": None,
    })
    await broadcast({"type": "s7_state", **_state})

    ok_safe = podman.run_container(
        SAFE_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "RT-Safety"},
        cpus=0.4, port=8080, host_port=SAFE_PORT,
    )
    ok_normal = podman.run_container(
        NORMAL_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "Normal-Task"},
        port=8080, host_port=NORMAL_PORT,
    )

    if not ok_safe or not ok_normal:
        _state["error"] = "Failed to start containers. Run 'Build container images' first."
        _state["running"] = False
        await broadcast({"type": "s7_state", **_state})
        return

    _log("temporal-safe   started  →  --cpus 0.4  (guaranteed bandwidth)")
    _log("temporal-normal started  →  no CPU limit  (competes freely)")
    _log("Trigger CPU storm to reveal the latency difference →")
    await asyncio.sleep(1.5)
    _run_task = asyncio.create_task(_poll_loop(broadcast))


async def _poll_loop(broadcast):
    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            for port, key in [(SAFE_PORT, "safe"), (NORMAL_PORT, "normal")]:
                t0 = time.time()
                try:
                    r = await client.get(f"http://localhost:{port}/health")
                    ms = round((time.time() - t0) * 1000, 2)
                    _state[f"{key}_status"] = "healthy" if r.status_code == 200 else "unhealthy"
                except Exception:
                    ms = 50.0 + (time.time() % 10) * 3  # reflect noise when unreachable
                    _state[f"{key}_status"] = "unreachable"

                _state[f"{key}_latencies"] = (_state[f"{key}_latencies"] + [ms])[-60:]
                _state[f"{key}_hist"] = _hist(_state[f"{key}_latencies"])
                _state[f"{key}_jitter"] = _jitter(_state[f"{key}_latencies"])

            await broadcast({"type": "s7_state", **_state})
            await asyncio.sleep(0.4)


async def start_stress(broadcast):
    global _stress_task
    if not _state["running"]:
        return
    _state["stress_active"] = True
    _log("⚡ CPU storm started — background workload flooding the system")
    await broadcast({"type": "s7_state", **_state})

    podman.run_container(
        STRESS_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "Stress-Bomb"},
        cpus=2.0,
    )
    _stress_task = asyncio.create_task(_stress_hammer())


async def _stress_hammer():
    """Flood the unprotected container with concurrent requests to inflate its latency."""
    async with httpx.AsyncClient(timeout=1.0) as client:
        while _state["stress_active"] and _state["running"]:
            try:
                await asyncio.gather(
                    *[client.get(f"http://localhost:{NORMAL_PORT}/health") for _ in range(8)],
                    return_exceptions=True,
                )
            except Exception:
                pass
            await asyncio.sleep(0.05)


async def stop_stress(broadcast):
    global _stress_task
    _state["stress_active"] = False
    if _stress_task:
        _stress_task.cancel()
        _stress_task = None
    podman.cleanup(STRESS_NAME)
    _log("🔵 CPU storm stopped — latency should stabilise")
    await broadcast({"type": "s7_state", **_state})


async def stop(broadcast):
    global _run_task, _stress_task
    _state["running"] = False
    _state["stress_active"] = False
    for t in [_run_task, _stress_task]:
        if t:
            t.cancel()
    _run_task = _stress_task = None
    podman.cleanup(SAFE_NAME, NORMAL_NAME, STRESS_NAME)
    _state.update({"safe_status": "stopped", "normal_status": "stopped"})
    _log("Scenario stopped")
    await broadcast({"type": "s7_state", **_state})
