"""
Scenario 5 — Startup Dependency Chain
Demonstrates how RHIVOS/systemd enforces vehicle boot ordering.

Boot order:
  1. hardware-init  (simulated — always succeeds quickly)
  2. can-gateway    (Requires: hardware-init)
  3. lane-keep      (Requires: can-gateway, ASIL-B)
  4. media-player   (Wants: can-gateway, QM — soft dependency)

If can-gateway fails to start:
  - lane-keep is BLOCKED (hard dependency)
  - media-player is DEGRADED (soft dependency — still starts but logs warning)

This is why systemd dependency ordering matters in vehicles:
safety-critical services must not start if their dependencies are unavailable.
"""
import asyncio
import time
import httpx
import podman_client as podman

CONTEXT_BASE = "/Users/abhi/projects/automotive-demo/containers"

SERVICES = [
    {
        "id": "hw",
        "label": "hardware-init",
        "desc": "Board bring-up, kernel drivers",
        "criticality": "ASIL-B",
        "deps": [],
        "dep_type": {},   # hard/soft per dep
        "image": None,    # simulated, no container
        "port": None,
        "host_port": None,
        "boot_time_s": 1.2,
        "icon": "🔧",
    },
    {
        "id": "gateway",
        "label": "can-gateway",
        "desc": "CAN bus routing, vehicle network",
        "criticality": "QM",
        "deps": ["hw"],
        "dep_type": {"hw": "hard"},
        "image": "demo-qm",
        "env": {"SERVICE_NAME": "can-gateway", "CRITICALITY": "QM"},
        "port": 8000,
        "host_port": 8501,
        "cpus": 0.3,
        "boot_time_s": 1.5,
        "icon": "🔌",
    },
    {
        "id": "adas",
        "label": "lane-keep-assist",
        "desc": "Safety-critical ADAS function",
        "criticality": "ASIL-B",
        "deps": ["hw", "gateway"],
        "dep_type": {"hw": "hard", "gateway": "hard"},
        "image": "demo-asil-b",
        "env": {"SERVICE_NAME": "lane-keep-assist", "CRITICALITY": "ASIL-B"},
        "port": 8000,
        "host_port": 8502,
        "cpus": 0.4,
        "boot_time_s": 0.8,
        "icon": "🚗",
    },
    {
        "id": "ivi",
        "label": "media-player",
        "desc": "Infotainment, non-safety",
        "criticality": "QM",
        "deps": ["hw", "gateway"],
        "dep_type": {"hw": "hard", "gateway": "soft"},
        "image": "demo-qm",
        "env": {"SERVICE_NAME": "media-player", "CRITICALITY": "QM"},
        "port": 8000,
        "host_port": 8503,
        "cpus": 0.5,
        "boot_time_s": 0.6,
        "icon": "🎵",
    },
]

_state = {
    "running": False,
    "services": {},   # id -> {status, started_at, blocked_by, warning}
    "log": [],
    "gateway_killed": False,
}


def _svc(sid): return next(s for s in SERVICES if s["id"] == sid)

def _log(msg):
    ts = time.strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    _state["log"].append(entry)
    if len(_state["log"]) > 30: _state["log"].pop(0)
    return entry


async def start(broadcast_fn):
    loop = asyncio.get_event_loop()

    # cleanup
    for s in SERVICES:
        if s["image"]:
            await loop.run_in_executor(None, podman.remove_container, f"demo-dep-{s['id']}")

    _state["running"] = True
    _state["gateway_killed"] = False
    _state["log"].clear()
    _state["services"] = {
        s["id"]: {"status": "pending", "started_at": None, "blocked_by": None, "warning": None}
        for s in SERVICES
    }

    _log("systemd: starting vehicle target")
    await broadcast_fn({"type": "scenario5_started", "state": get_state()})
    await _boot_sequence(broadcast_fn, kill_gateway=False)


async def start_with_fault(broadcast_fn):
    """Demo: kill gateway during boot to show dependency blocking."""
    loop = asyncio.get_event_loop()
    for s in SERVICES:
        if s["image"]:
            await loop.run_in_executor(None, podman.remove_container, f"demo-dep-{s['id']}")

    _state["running"] = True
    _state["gateway_killed"] = True
    _state["log"].clear()
    _state["services"] = {
        s["id"]: {"status": "pending", "started_at": None, "blocked_by": None, "warning": None}
        for s in SERVICES
    }

    _log("systemd: starting vehicle target (with gateway fault)")
    await broadcast_fn({"type": "scenario5_started", "state": get_state()})
    await _boot_sequence(broadcast_fn, kill_gateway=True)


async def _boot_sequence(broadcast_fn, kill_gateway: bool):
    loop = asyncio.get_event_loop()

    for svc in SERVICES:
        sid = svc["id"]
        cs = _state["services"][sid]

        # Check hard dependencies
        blocked_by = None
        for dep_id, dep_type in svc["dep_type"].items():
            dep_status = _state["services"][dep_id]["status"]
            if dep_status != "running" and dep_type == "hard":
                blocked_by = dep_id
                break

        if blocked_by:
            cs["status"] = "blocked"
            cs["blocked_by"] = blocked_by
            _log(f"systemd: {svc['label']} BLOCKED — dependency '{_svc(blocked_by)['label']}' not running")
            await broadcast_fn({"type": "scenario5_tick", "state": get_state()})
            continue

        # Check soft dependencies
        for dep_id, dep_type in svc["dep_type"].items():
            dep_status = _state["services"][dep_id]["status"]
            if dep_status != "running" and dep_type == "soft":
                cs["warning"] = f"soft dep '{_svc(dep_id)['label']}' unavailable — degraded mode"

        cs["status"] = "starting"
        _log(f"systemd: starting {svc['label']} ({svc['criticality']})")
        await broadcast_fn({"type": "scenario5_tick", "state": get_state()})

        await asyncio.sleep(svc["boot_time_s"])

        # For gateway fault demo: fail the gateway
        if kill_gateway and sid == "gateway":
            cs["status"] = "failed"
            _log(f"systemd: {svc['label']} FAILED (fault injected)")
            await broadcast_fn({"type": "scenario5_tick", "state": get_state()})
            continue

        # Simulated service (no container)
        if svc["image"] is None:
            cs["status"] = "running"
            cs["started_at"] = time.strftime("%H:%M:%S")
            _log(f"systemd: {svc['label']} started (simulated)")
            await broadcast_fn({"type": "scenario5_tick", "state": get_state()})
            continue

        # Real container
        kwargs = dict(
            name=f"demo-dep-{sid}", image=svc["image"],
            env=svc["env"], port=svc["port"], host_port=svc["host_port"],
            cpus=svc.get("cpus"),
        )
        ok = await loop.run_in_executor(None, lambda k=kwargs: podman.run_container(**k))

        if ok:
            cs["status"] = "running"
            cs["started_at"] = time.strftime("%H:%M:%S")
            msg = f"systemd: {svc['label']} active (running)"
            if cs["warning"]: msg += f" ⚠ {cs['warning']}"
            _log(msg)
        else:
            cs["status"] = "failed"
            _log(f"systemd: {svc['label']} FAILED to start")

        await broadcast_fn({"type": "scenario5_tick", "state": get_state()})

    running_count = sum(1 for s in _state["services"].values() if s["status"] == "running")
    _log(f"systemd: boot complete — {running_count}/{len(SERVICES)} services running")
    await broadcast_fn({"type": "scenario5_complete", "state": get_state()})


async def stop(broadcast_fn):
    _state["running"] = False
    loop = asyncio.get_event_loop()
    for s in SERVICES:
        if s["image"]:
            await loop.run_in_executor(None, podman.remove_container, f"demo-dep-{s['id']}")
    await broadcast_fn({"type": "scenario5_stopped"})


def get_state():
    return {
        "running": _state["running"],
        "services": _state["services"],
        "log": _state["log"][-15:],
        "gateway_killed": _state["gateway_killed"],
        "service_defs": [
            {"id": s["id"], "label": s["label"], "desc": s["desc"],
             "criticality": s["criticality"], "deps": s["deps"],
             "dep_type": s["dep_type"], "icon": s["icon"]}
            for s in SERVICES
        ],
    }
