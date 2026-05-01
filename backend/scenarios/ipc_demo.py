"""
Scenario 10 — Controlled IPC (QM ↔ ASIL-B)

Demonstrates RHIVOS inter-process communication policy:
  · ASIL-B publishes vehicle state on a safety bus (read-only)
  · QM can READ from the bus — approved, low-latency channel
  · QM cannot WRITE to ASIL-B state — rejected at the policy layer

Backend acts as a controlled message broker (simulating D-Bus / VSOMEIP ACL policy).
"""
import asyncio
import math
import time
import httpx
import podman_client as podman

ASIL_PORT = 8831
ASIL_NAME = "ipc-asil"

_state: dict = {
    "running": False,
    "asil_status": "stopped",
    "vehicle_state": {
        "speed_kmh": 0.0,
        "steering_deg": 0.0,
        "brake_pct": 0.0,
        "lane_deviation": 0.0,
        "safe_state": False,
    },
    "messages": [],
    "write_attempt": None,   # None | "rejected"
    "read_count": 0,
    "write_rejected_count": 0,
    "log": [],
    "error": None,
}

_run_task: asyncio.Task | None = None
_msg_id = 0


def get_state() -> dict:
    return dict(_state)


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    _state["log"] = ([f"[{ts}] {msg}"] + _state["log"])[:30]


def _add_message(direction: str, topic: str, payload: str, allowed: bool):
    global _msg_id
    _msg_id += 1
    _state["messages"] = ([{
        "id": _msg_id,
        "ts": time.strftime("%H:%M:%S"),
        "direction": direction,
        "topic": topic,
        "payload": payload,
        "allowed": allowed,
    }] + _state["messages"])[:20]


async def start(broadcast):
    global _state, _run_task
    podman.cleanup(ASIL_NAME)
    _state.update({
        "running": True, "asil_status": "starting",
        "vehicle_state": {"speed_kmh": 0.0, "steering_deg": 0.0,
                          "brake_pct": 0.0, "lane_deviation": 0.0, "safe_state": False},
        "messages": [], "write_attempt": None,
        "read_count": 0, "write_rejected_count": 0,
        "log": [], "error": None,
    })
    await broadcast({"type": "s10_state", **_state})

    ok = podman.run_container(
        ASIL_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "ADAS-Publisher"},
        cpus=0.4, port=8000, host_port=ASIL_PORT,
    )
    if not ok:
        _state["error"] = "Failed to start ASIL-B container. Run 'Build container images' first."
        _state["running"] = False
        await broadcast({"type": "s10_state", **_state})
        return

    _log("IPC bus started — ASIL-B publishing vehicle state")
    _log("QM has READ-ONLY access. Use buttons to test permissions.")
    await asyncio.sleep(1.5)
    _run_task = asyncio.create_task(_poll_loop(broadcast))


async def _poll_loop(broadcast):
    t = 0
    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            t += 1
            speed = 62 + 15 * math.sin(t * 0.12)
            steering = 7 * math.sin(t * 0.09)
            brake = max(0.0, 4 * math.sin(t * 0.18))
            lane_dev = round(0.25 * math.sin(t * 0.07), 2)
            _state["vehicle_state"] = {
                "speed_kmh": round(speed, 1),
                "steering_deg": round(steering, 1),
                "brake_pct": round(brake, 1),
                "lane_deviation": lane_dev,
                "safe_state": False,
            }

            try:
                r = await client.get(f"http://localhost:{ASIL_PORT}/health")
                _state["asil_status"] = "healthy" if r.status_code == 200 else "unhealthy"
            except Exception:
                _state["asil_status"] = "unreachable"

            # auto-publish QM read every ~3s
            if t % 3 == 0:
                _state["read_count"] += 1
                v = _state["vehicle_state"]
                _add_message(
                    "ASIL-B → Bus → QM", "vehicle.state",
                    f"speed={v['speed_kmh']} km/h  steer={v['steering_deg']}°  "
                    f"brake={v['brake_pct']}%",
                    allowed=True,
                )

            await broadcast({"type": "s10_state", **_state})
            await asyncio.sleep(1.0)


async def qm_read(broadcast):
    """Simulate QM explicitly reading vehicle state — always allowed."""
    _state["read_count"] += 1
    v = _state["vehicle_state"]
    _add_message("QM → Bus", "vehicle.state.REQUEST", "read", allowed=True)
    _add_message(
        "Bus → QM", "vehicle.state.RESPONSE",
        f"speed={v['speed_kmh']} km/h  steer={v['steering_deg']}°",
        allowed=True,
    )
    _log("QM read request: ALLOWED ✅")
    _state["write_attempt"] = None
    await broadcast({"type": "s10_state", **_state})


async def qm_write_attempt(broadcast):
    """Simulate QM trying to write to ASIL-B state — always rejected."""
    _state["write_rejected_count"] += 1
    _add_message(
        "QM → Bus", "vehicle.state.WRITE",
        "override_steering=45°  (UNSAFE command)",
        allowed=False,
    )
    _log("QM write attempt REJECTED ✅  — QM has no write permission on safety bus")
    _state["write_attempt"] = "rejected"
    await broadcast({"type": "s10_state", **_state})
    await asyncio.sleep(3)
    _state["write_attempt"] = None
    await broadcast({"type": "s10_state", **_state})


async def stop(broadcast):
    global _run_task
    _state["running"] = False
    if _run_task:
        _run_task.cancel()
        _run_task = None
    podman.cleanup(ASIL_NAME)
    _state["asil_status"] = "stopped"
    _log("Scenario stopped")
    await broadcast({"type": "s10_state", **_state})
