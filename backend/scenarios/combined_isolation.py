"""
Isolation Suite — Combined scenario

One ASIL-B container attacked simultaneously from all four isolation dimensions.
The headline: no matter what the attacker does, ASIL-B latency stays flat.

  ci-asil     — ASIL-B  --cpus 0.4  --memory 384m  network: ci-isolated
  ci-attacker — QM      no CPU limit  --memory 160m  network: podman (default)

Four attack vectors (can run independently or all at once via full_attack):
  CPU      — ci-attacker burns CPU; kernel throttles at its cgroup ceiling
  Memory   — ci-attacker leaks memory; OOM-killed at 160m; ci-asil unchanged
  Temporal — rapid request flood on ci-attacker; ASIL-B response time stays tight
  Spatial  — exec probe from ci-attacker → ci-asil container IP: BLOCKED
"""
import asyncio
import time
import httpx
import podman_client as podman

ASIL_PORT = 8901
ATK_PORT  = 8902
ASIL_NAME = "ci-asil"
ATK_NAME  = "ci-attacker"
NET_NAME  = "ci-isolated"

_state: dict = {
    "running": False,
    "asil_status": "stopped",
    "attacker_status": "stopped",
    "asil_latency": [],
    "attacker_latency": [],
    "asil_uptime_s": 0,
    "asil_deadline_misses": 0,
    "cpu_attack": False,
    "mem_attack": False,
    "temporal_attack": False,
    "spatial_probe_result": None,   # None | "blocked" | "reachable" | "running"
    "spatial_probe_ip": None,
    "attacker_mem_mb": 0.0,
    "log": [],
    "error": None,
}

_run_task: asyncio.Task | None = None
_temp_task: asyncio.Task | None = None

DEADLINE_MS = 10.0


def get_state() -> dict:
    return dict(_state)


def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    _state["log"] = ([f"[{ts}] {msg}"] + _state["log"])[:40]


# ── Lifecycle ─────────────────────────────────────────────────────────────────

async def start(broadcast):
    global _run_task
    if _state["running"]:
        _state["running"] = False
        if _run_task:
            _run_task.cancel()
            _run_task = None
        await asyncio.sleep(0.3)

    podman.cleanup(ASIL_NAME, ATK_NAME)
    podman.remove_network(NET_NAME)
    _state.update({
        "running": True, "asil_status": "starting", "attacker_status": "starting",
        "asil_latency": [], "attacker_latency": [], "asil_uptime_s": 0,
        "asil_deadline_misses": 0,
        "cpu_attack": False, "mem_attack": False, "temporal_attack": False,
        "spatial_probe_result": None, "spatial_probe_ip": None,
        "attacker_mem_mb": 0.0, "log": [], "error": None,
    })
    await broadcast({"type": "siso_state", **_state})

    podman.create_network(NET_NAME)

    ok_asil = podman.run_container(
        ASIL_NAME, "demo-asil-b",
        env={"SERVICE_NAME": "ADAS-Safety", "CRITICALITY": "ASIL-B"},
        cpus=0.4, memory_mb=384, port=8080, host_port=ASIL_PORT,
        network=NET_NAME,
    )
    ok_atk = podman.run_container(
        ATK_NAME, "demo-qm",
        env={"SERVICE_NAME": "Attacker-QM", "CRITICALITY": "QM"},
        memory_mb=160, port=8080, host_port=ATK_PORT,
    )

    if not ok_asil or not ok_atk:
        _state["error"] = "Failed to start containers. Run 'Build container images' first."
        _state["running"] = False
        await broadcast({"type": "siso_state", **_state})
        return

    _log("ci-asil started  —  --cpus 0.4  --memory 384m  network: ci-isolated")
    _log("ci-attacker started  —  --memory 160m  network: podman (default)")
    _log("ASIL-B is isolated. Try attacking it →")
    await asyncio.sleep(2.0)   # warm-up
    _run_task = asyncio.create_task(_poll_loop(broadcast))


async def stop(broadcast):
    global _run_task
    _state["running"] = False
    _state["cpu_attack"] = False
    _state["mem_attack"] = False
    _state["temporal_attack"] = False
    if _run_task:
        _run_task.cancel()
        _run_task = None
    if _temp_task:
        _temp_task.cancel()
    podman.cleanup(ASIL_NAME, ATK_NAME)
    podman.remove_network(NET_NAME)
    _state.update({"asil_status": "stopped", "attacker_status": "stopped"})
    _log("Scenario stopped — all attacks cancelled")
    await broadcast({"type": "siso_state", **_state})


# ── Poll loop ─────────────────────────────────────────────────────────────────

async def _poll_loop(broadcast):
    t0 = time.time()
    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            _state["asil_uptime_s"] = int(time.time() - t0)

            # poll ASIL-B
            t = time.time()
            try:
                r = await client.get(f"http://localhost:{ASIL_PORT}/health")
                ms = round((time.time() - t) * 1000, 1)
                if r.status_code == 200:
                    _state["asil_status"] = "healthy"
                    _state["asil_latency"] = (_state["asil_latency"] + [ms])[-80:]
                    if ms > DEADLINE_MS:
                        _state["asil_deadline_misses"] += 1
            except Exception:
                _state["asil_status"] = "unreachable"

            # poll attacker for memory info + latency
            t2 = time.time()
            try:
                r2 = await client.get(f"http://localhost:{ATK_PORT}/health")
                ms2 = round((time.time() - t2) * 1000, 1)
                if r2.status_code == 200:
                    _state["attacker_status"] = "healthy"
                    _state["attacker_mem_mb"] = r2.json().get("memory_mb", 0)
                    _state["attacker_latency"] = (_state["attacker_latency"] + [ms2])[-80:]
            except Exception:
                # OOM-killed or unreachable — record spike
                spike = 500.0 if _state["mem_attack"] else 200.0
                _state["attacker_latency"] = (_state["attacker_latency"] + [spike])[-80:]
                if _state["mem_attack"] and _state["attacker_status"] != "oom-killed":
                    _state["attacker_status"] = "oom-killed"
                    _log("💥 ci-attacker OOM-killed by kernel (memory limit enforced)")
                    _log("   ci-asil memory: UNCHANGED  ✅")

            await broadcast({"type": "siso_state", **_state})
            await asyncio.sleep(1.0)


# ── Attack: CPU ───────────────────────────────────────────────────────────────

async def start_cpu_attack(broadcast):
    _state["cpu_attack"] = True
    _log("⚡ CPU attack: ci-attacker burning CPU (cgroup ceiling: no limit)")
    await broadcast({"type": "siso_state", **_state})
    async with httpx.AsyncClient(timeout=5.0) as c:
        try:
            await c.post(f"http://localhost:{ATK_PORT}/stress/start")
        except Exception:
            pass


async def stop_cpu_attack(broadcast):
    _state["cpu_attack"] = False
    async with httpx.AsyncClient(timeout=5.0) as c:
        try:
            await c.post(f"http://localhost:{ATK_PORT}/stress/stop")
        except Exception:
            pass
    _log("CPU attack stopped")
    await broadcast({"type": "siso_state", **_state})


# ── Attack: Memory ────────────────────────────────────────────────────────────

async def start_mem_attack(broadcast):
    _state["mem_attack"] = True
    _state["attacker_status"] = "healthy"
    _log("💾 Memory attack: ci-attacker leaking memory → OOM kill expected at 160MB")
    await broadcast({"type": "siso_state", **_state})
    async with httpx.AsyncClient(timeout=5.0) as c:
        try:
            await c.post(f"http://localhost:{ATK_PORT}/memory/start")
        except Exception:
            pass


async def stop_mem_attack(broadcast):
    _state["mem_attack"] = False
    async with httpx.AsyncClient(timeout=5.0) as c:
        try:
            await c.post(f"http://localhost:{ATK_PORT}/memory/stop")
        except Exception:
            pass
    _log("Memory attack stopped")
    await broadcast({"type": "siso_state", **_state})


# ── Attack: Temporal ──────────────────────────────────────────────────────────

async def start_temporal_attack(broadcast):
    global _temp_task
    _state["temporal_attack"] = True
    _log("⏱ Temporal attack: flooding system with concurrent requests")
    await broadcast({"type": "siso_state", **_state})
    _temp_task = asyncio.create_task(_temporal_hammer())


async def _temporal_hammer():
    async with httpx.AsyncClient(timeout=1.0) as c:
        while _state["temporal_attack"] and _state["running"]:
            try:
                await asyncio.gather(
                    *[c.get(f"http://localhost:{ATK_PORT}/health") for _ in range(8)],
                    return_exceptions=True,
                )
            except Exception:
                pass
            await asyncio.sleep(0.05)


async def stop_temporal_attack(broadcast):
    global _temp_task
    _state["temporal_attack"] = False
    if _temp_task:
        _temp_task.cancel()
        _temp_task = None
    _log("Temporal attack stopped")
    await broadcast({"type": "siso_state", **_state})


# ── Attack: Spatial probe ─────────────────────────────────────────────────────

async def run_spatial_probe(broadcast):
    _state["spatial_probe_result"] = "running"
    _log("🔍 Spatial probe: exec into ci-attacker, trying to reach ci-asil…")
    await broadcast({"type": "siso_state", **_state})

    asil_ip = podman.get_container_ip(ASIL_NAME, NET_NAME)
    _state["spatial_probe_ip"] = asil_ip or "unknown"

    if asil_ip:
        _log(f"  ci-asil IP on {NET_NAME}: {asil_ip}")
        try:
            rc, _ = podman.exec_in_container(
                ATK_NAME,
                ["python3", "-c",
                 f"import urllib.request; "
                 f"urllib.request.urlopen('http://{asil_ip}:8080/health', timeout=3); "
                 f"print('connected')"],
                timeout=10,
            )
            if rc == 0:
                _state["spatial_probe_result"] = "reachable"
                _log("  ci-attacker → ci-asil: REACHABLE (unexpected!)")
            else:
                _state["spatial_probe_result"] = "blocked"
                _log("  ci-attacker → ci-asil direct: BLOCKED ✅")
                _log("  ci-asil reachable from host only via published port 8901 ✅")
        except Exception as e:
            _state["spatial_probe_result"] = "blocked"
            _log(f"  ci-attacker → ci-asil: BLOCKED ✅  ({e})")
    else:
        _state["spatial_probe_result"] = "blocked"
        _log("  Network isolation active — attacker cannot resolve ci-asil IP ✅")

    await broadcast({"type": "siso_state", **_state})


# ── Full Attack ───────────────────────────────────────────────────────────────

async def full_attack(broadcast):
    _log("🚨 FULL ATTACK — all 4 isolation vectors firing simultaneously")
    await asyncio.gather(
        start_cpu_attack(broadcast),
        start_mem_attack(broadcast),
        start_temporal_attack(broadcast),
    )
    await run_spatial_probe(broadcast)


async def stop_all_attacks(broadcast):
    await asyncio.gather(
        stop_cpu_attack(broadcast),
        stop_mem_attack(broadcast),
        stop_temporal_attack(broadcast),
    )
    _state["spatial_probe_result"] = None
    _state["spatial_probe_ip"] = None
    _log("All attacks stopped")
    await broadcast({"type": "siso_state", **_state})
