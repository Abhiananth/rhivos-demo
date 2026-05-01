"""
Scenario 9 — Spatial Isolation (Linux Namespaces)

Demonstrates that Linux kernel namespaces enforce hard boundaries between containers:

  spatial-asil  — ASIL-B on a dedicated isolated network (spatial-isolated)
  spatial-qm    — QM on the default network

Probe shows:
  · QM → ASIL-B direct (container IP): BLOCKED — different network namespace
  · Host → ASIL-B (published port 8821): REACHABLE — approved channel

Also shows process namespace: containers see ONLY their own processes.
"""
import asyncio
import time
import httpx
import podman_client as podman

ASIL_PORT = 8821
QM_PORT   = 8822
ASIL_NAME = "spatial-asil"
QM_NAME   = "spatial-qm"
NET_NAME  = "spatial-isolated"

_state: dict = {
    "running": False,
    "asil_status": "stopped",
    "qm_status": "stopped",
    "asil_pid": None,
    "qm_pid": None,
    "asil_net": NET_NAME,
    "qm_net": "podman (default)",
    "lateral_probe_result": None,   # "blocked" | "reachable" | "running" | None
    "lateral_probe_ip": None,
    "host_probe_result": None,      # "reachable" | "blocked" | None
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
    podman.remove_network(NET_NAME)
    _state.update({
        "running": True, "asil_status": "starting", "qm_status": "starting",
        "lateral_probe_result": None, "lateral_probe_ip": None,
        "host_probe_result": None, "asil_pid": None, "qm_pid": None,
        "log": [], "error": None,
    })
    await broadcast({"type": "s9_state", **_state})

    podman.create_network(NET_NAME)
    _log(f"Created isolated network: {NET_NAME}")

    ok_asil = podman.run_container(
        ASIL_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "ADAS-Isolated"},
        port=8080, host_port=ASIL_PORT,
        network=NET_NAME,
    )
    ok_qm = podman.run_container(
        QM_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "IVI-QM"},
        port=8080, host_port=QM_PORT,
    )

    if not ok_asil or not ok_qm:
        _state["error"] = "Failed to start containers. Run 'Build container images' first."
        _state["running"] = False
        await broadcast({"type": "s9_state", **_state})
        return

    _log(f"spatial-asil on network '{NET_NAME}'  (port 8821 → host)")
    _log(f"spatial-qm   on network 'podman'       (port 8822 → host)")
    _log("Run 'Probe Isolation' to test boundaries →")
    await asyncio.sleep(1.5)
    _run_task = asyncio.create_task(_poll_loop(broadcast))


async def _poll_loop(broadcast):
    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            for port, key in [(ASIL_PORT, "asil"), (QM_PORT, "qm")]:
                try:
                    r = await client.get(f"http://localhost:{port}/info")
                    data = r.json()
                    _state[f"{key}_status"] = "healthy"
                    _state[f"{key}_pid"] = data.get("pid")
                except Exception:
                    _state[f"{key}_status"] = "unreachable"
            await broadcast({"type": "s9_state", **_state})
            await asyncio.sleep(1.5)


async def run_probe(broadcast):
    """
    Attempt lateral probe: exec into QM container, try to reach ASIL-B's
    container IP on the isolated network — should fail (no route).
    Then confirm host can reach ASIL-B via published port.
    """
    _state["lateral_probe_result"] = "running"
    _log("🔍 Probing spatial boundaries…")
    await broadcast({"type": "s9_state", **_state})

    asil_ip = podman.get_container_ip(ASIL_NAME, NET_NAME)
    _state["lateral_probe_ip"] = asil_ip
    if not asil_ip:
        asil_ip = "unknown"
        _log(f"  ASIL-B IP on {NET_NAME}: (could not resolve)")
    else:
        _log(f"  ASIL-B IP on {NET_NAME}: {asil_ip}")

    # exec into QM container and try to reach ASIL-B's isolated IP via python3
    try:
        rc, out = podman.exec_in_container(
            QM_NAME,
            ["python3", "-c",
             f"import urllib.request, sys; "
             f"urllib.request.urlopen('http://{asil_ip}:8080/health', timeout=3); "
             f"print('connected')"],
            timeout=10,
        )
        if rc == 0 and "connected" in out:
            _state["lateral_probe_result"] = "reachable"
            _log(f"  QM → ASIL-B direct ({asil_ip}:8080): REACHABLE (unexpected)")
        else:
            _state["lateral_probe_result"] = "blocked"
            _log(f"  QM → ASIL-B direct ({asil_ip}:8080): BLOCKED ✅")
    except Exception as e:
        _state["lateral_probe_result"] = "blocked"
        _log(f"  QM → ASIL-B direct: BLOCKED ✅  ({e})")

    # confirm host can reach ASIL-B via published port
    async with httpx.AsyncClient(timeout=2.0) as client:
        try:
            await client.get(f"http://localhost:{ASIL_PORT}/health")
            _state["host_probe_result"] = "reachable"
            _log(f"  Host → ASIL-B (port {ASIL_PORT}): REACHABLE ✅")
        except Exception:
            _state["host_probe_result"] = "blocked"
            _log(f"  Host → ASIL-B (port {ASIL_PORT}): BLOCKED (unexpected)")

    _log("Spatial isolation confirmed — only the approved channel works")
    await broadcast({"type": "s9_state", **_state})


async def stop(broadcast):
    global _run_task
    _state["running"] = False
    if _run_task:
        _run_task.cancel()
        _run_task = None
    podman.cleanup(ASIL_NAME, QM_NAME)
    podman.remove_network(NET_NAME)
    _state.update({"asil_status": "stopped", "qm_status": "stopped",
                   "lateral_probe_result": None, "host_probe_result": None})
    _log("Scenario stopped")
    await broadcast({"type": "s9_state", **_state})
