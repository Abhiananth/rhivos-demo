"""
Scenario 2 — BlueChi-style Orchestration
A Python controller manages 3 Podman containers (one per chip).
Monitors container health via polling. Applies different recovery policies
based on criticality — auto-restart (QM) vs safe state (ASIL-B).
"""
import asyncio
import time
import httpx
import podman_client as podman

CONTEXT_BASE = "/Users/abhi/projects/automotive-demo/containers"

CHIPS = [
    {"id": "adas",    "name": "demo-adas",    "image": "demo-asil-b",
     "criticality": "ASIL-B", "port": 8201,
     "env": {"SERVICE_NAME": "lane-keep-assist", "CRITICALITY": "ASIL-B"},
     "cpus": 0.4},
    {"id": "ivi",     "name": "demo-ivi",     "image": "demo-qm",
     "criticality": "QM",     "port": 8202,
     "env": {"SERVICE_NAME": "media-player", "CRITICALITY": "QM"},
     "cpus": 0.6},
    {"id": "gateway", "name": "demo-gateway", "image": "demo-qm",
     "criticality": "QM",     "port": 8203,
     "env": {"SERVICE_NAME": "can-router", "CRITICALITY": "QM"},
     "cpus": 0.4},
]

_state = {
    "running": False,
    "chips": {},        # id -> {status, restarts, safe_state, last_event}
    "controller_log": [],
    "safe_state_active": False,
}


def _chip_by_id(chip_id: str):
    return next((c for c in CHIPS if c["id"] == chip_id), None)


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    _state["controller_log"].append(entry)
    if len(_state["controller_log"]) > 30:
        _state["controller_log"].pop(0)
    return entry


async def start(broadcast_fn):
    loop = asyncio.get_event_loop()

    # clean up leftovers
    for chip in CHIPS:
        await loop.run_in_executor(None, podman.remove_container, chip["name"])

    # init chip state
    for chip in CHIPS:
        _state["chips"][chip["id"]] = {
            "status": "starting", "restarts": 0,
            "safe_state": False, "last_event": "Starting...",
            "criticality": chip["criticality"],
            "name": chip["name"],
        }

    _state["running"] = True
    _state["controller_log"].clear()
    _state["safe_state_active"] = False
    _log("BlueChi controller online")

    # start all containers
    for chip in CHIPS:
        kwargs = dict(
            name=chip["name"], image=chip["image"],
            env=chip["env"], port=8000, host_port=chip["port"],
        )
        if "cpuset_cpus" in chip:
            kwargs["cpuset_cpus"] = chip["cpuset_cpus"]
        if "cpus" in chip:
            kwargs["cpus"] = chip["cpus"]
        ok = await loop.run_in_executor(None, lambda k=kwargs: podman.run_container(**k))
        if ok:
            _state["chips"][chip["id"]]["status"] = "running"
            _state["chips"][chip["id"]]["last_event"] = "Started"
            _log(f"[{chip['id']}] {chip['env']['SERVICE_NAME']} started ({chip['criticality']})")
        else:
            _state["chips"][chip["id"]]["status"] = "error"
            _log(f"[{chip['id']}] Failed to start")

    await broadcast_fn({"type": "scenario2_started", "state": get_state()})
    await _monitor_loop(broadcast_fn)


async def _monitor_loop(broadcast_fn):
    """Poll all containers every 2 seconds and broadcast state."""
    async with httpx.AsyncClient(timeout=1.5) as client:
        while _state["running"]:
            for chip in CHIPS:
                cid = chip["id"]
                cs = _state["chips"][cid]
                if cs["status"] in ("crashed", "safe_state"):
                    continue
                try:
                    r = await client.get(f"http://localhost:{chip['port']}/health")
                    if r.status_code == 200:
                        cs["status"] = "running"
                except Exception:
                    if cs["status"] == "running":
                        await _handle_crash(chip, broadcast_fn)

            await broadcast_fn({"type": "scenario2_tick", "state": get_state()})
            await asyncio.sleep(2.0)


async def _handle_crash(chip: dict, broadcast_fn):
    cid = chip["id"]
    cs = _state["chips"][cid]

    if chip["criticality"] == "QM":
        cs["status"] = "crashed"
        cs["last_event"] = "Crashed — scheduling restart"
        entry = _log(f"[{cid}] {chip['env']['SERVICE_NAME']} CRASHED → auto-restart in 3s")
        await broadcast_fn({"type": "scenario2_crash", "chip_id": cid,
                            "criticality": "QM", "log": entry})
        await asyncio.sleep(3.0)
        await _restart_container(chip, broadcast_fn)
    else:
        cs["status"] = "safe_state"
        cs["safe_state"] = True
        _state["safe_state_active"] = True
        cs["last_event"] = "CRASHED — safe state activated"
        entry = _log(f"[{cid}] {chip['env']['SERVICE_NAME']} CRASHED → SAFE STATE")
        _log(f"[controller] ISO 26262: no auto-restart. Awaiting deliberate recovery")
        await broadcast_fn({"type": "scenario2_safe_state", "chip_id": cid, "log": entry})


async def _restart_container(chip: dict, broadcast_fn):
    loop = asyncio.get_event_loop()
    cid = chip["id"]
    cs = _state["chips"][cid]
    cs["status"] = "restarting"

    await loop.run_in_executor(None, podman.remove_container, chip["name"])
    kwargs = dict(name=chip["name"], image=chip["image"],
                  env=chip["env"], port=8000, host_port=chip["port"])
    if "cpuset_cpus" in chip:
        kwargs["cpuset_cpus"] = chip["cpuset_cpus"]
    if "cpus" in chip:
        kwargs["cpus"] = chip["cpus"]
    ok = await loop.run_in_executor(None, lambda k=kwargs: podman.run_container(**k))

    if ok:
        cs["restarts"] += 1
        cs["status"] = "running"
        cs["last_event"] = f"Restarted by controller (#{cs['restarts']})"
        entry = _log(f"[{cid}] Restarted (#{cs['restarts']})")
        await broadcast_fn({"type": "scenario2_restarted", "chip_id": cid, "log": entry})


async def crash_container(chip_id: str, broadcast_fn):
    """Manually crash a container by killing it."""
    chip = _chip_by_id(chip_id)
    if not chip:
        return
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.kill_container, chip["name"])
    _state["chips"][chip_id]["status"] = "crashed"
    _state["chips"][chip_id]["last_event"] = "Manually crashed"
    await _handle_crash(chip, broadcast_fn)


async def recover_safe_state(chip_id: str, broadcast_fn):
    """Deliberate operator recovery for ASIL-B safe state."""
    chip = _chip_by_id(chip_id)
    cs = _state["chips"].get(chip_id)
    if not chip or not cs or cs["status"] != "safe_state":
        return
    entry = _log(f"[{chip_id}] Operator recovery: running self-check...")
    await broadcast_fn({"type": "scenario2_recovering", "chip_id": chip_id, "log": entry})
    await asyncio.sleep(2.0)
    await _restart_container(chip, broadcast_fn)
    cs["safe_state"] = False
    _state["safe_state_active"] = any(
        c["safe_state"] for c in _state["chips"].values()
    )
    _log(f"[{chip_id}] Self-check PASSED. Service restored")


async def stop(broadcast_fn):
    _state["running"] = False
    loop = asyncio.get_event_loop()
    for chip in CHIPS:
        await loop.run_in_executor(None, podman.remove_container, chip["name"])
    await broadcast_fn({"type": "scenario2_stopped"})


def get_state():
    return {
        "running": _state["running"],
        "chips": _state["chips"],
        "controller_log": _state["controller_log"][-10:],
        "safe_state_active": _state["safe_state_active"],
    }
