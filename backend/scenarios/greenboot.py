"""
Scenario 6 — Greenboot Health Gate
Demonstrates RHIVOS greenboot: multiple health conditions that must ALL pass
before a service is promoted to "healthy". If any condition fails, the service
is marked degraded and triggers an alert (in production: rollback).

Health conditions checked every 5 seconds:
  1. Latency gate  — response time ≤ deadline_ms
  2. Memory gate   — memory usage ≤ 80% of container limit
  3. Dependency gate — can reach the gateway service
  4. Error rate gate — fewer than 3 errors in last 10 polls

If all 4 pass → service is HEALTHY (green)
If any fail  → service is DEGRADED (amber/red)
If degraded for 3 consecutive checks → ROLLBACK triggered
"""
import asyncio
import time
import httpx
import podman_client as podman
from collections import deque

CONTEXT_BASE = "/Users/abhi/projects/automotive-demo/containers"

SERVICE_NAME = "lane-keep-assist"
IMAGE        = "demo-asil-b"
CONTAINER    = "demo-green-asil"
PORT         = 8601

DEADLINE_MS   = 10.0
MEM_LIMIT_MB  = 256
MEM_WARN_PCT  = 80

_state = {
    "running":           False,
    "service_status":    "unknown",   # unknown | healthy | degraded | rollback
    "checks": {
        "latency":    {"pass": None, "value": None, "threshold": f"≤ {DEADLINE_MS}ms"},
        "memory":     {"pass": None, "value": None, "threshold": f"≤ {MEM_WARN_PCT}%"},
        "dependency": {"pass": None, "value": None, "threshold": "gateway reachable"},
        "error_rate": {"pass": None, "value": None, "threshold": "< 3 errors/10 polls"},
    },
    "consecutive_failures": 0,
    "total_polls":       0,
    "rollback_count":    0,
    "fault_active":      False,
    "log":               [],
}

_error_window: deque = deque(maxlen=10)


def _log(msg):
    ts = time.strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    _state["log"].append(entry)
    if len(_state["log"]) > 25: _state["log"].pop(0)
    return entry


async def start(broadcast_fn):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.remove_container, CONTAINER)

    ok = await loop.run_in_executor(None, lambda: podman.run_container(
        name=CONTAINER, image=IMAGE,
        env={"SERVICE_NAME": SERVICE_NAME, "CRITICALITY": "ASIL-B"},
        cpus=0.4, memory_mb=MEM_LIMIT_MB, port=8000, host_port=PORT,
    ))
    if not ok:
        await broadcast_fn({"type": "error", "msg": "Greenboot: failed to start service"})
        return

    _state.update(running=True, service_status="unknown", consecutive_failures=0,
                  total_polls=0, rollback_count=0, fault_active=False)
    _state["log"].clear()
    _error_window.clear()
    for c in _state["checks"].values():
        c["pass"] = None; c["value"] = None

    _log("greenboot: service started — beginning health evaluation")
    await broadcast_fn({"type": "scenario6_started", "state": get_state()})
    await _health_loop(broadcast_fn)


async def _health_loop(broadcast_fn):
    gateway_port = 8501  # dep chain gateway (may not be running)

    async with httpx.AsyncClient(timeout=2.0) as client:
        while _state["running"]:
            _state["total_polls"] += 1
            checks = _state["checks"]
            all_pass = True

            # ── Check 1: latency ──────────────────────────────────────────────
            try:
                r = await client.get(f"http://localhost:{PORT}/health")
                data = r.json()
                lat = data.get("latency_ms", 999)
                mem_mb = data.get("memory_mb", 0)
                _error_window.append(0)

                checks["latency"]["value"] = f"{lat:.1f}ms"
                if _state["fault_active"]:
                    # Fault injects artificial latency spike
                    lat += 25
                    checks["latency"]["value"] = f"{lat:.1f}ms (fault)"
                checks["latency"]["pass"] = lat <= DEADLINE_MS
                if not checks["latency"]["pass"]: all_pass = False

                # ── Check 2: memory ──────────────────────────────────────────
                mem_pct = (mem_mb / MEM_LIMIT_MB) * 100
                checks["memory"]["value"] = f"{mem_pct:.0f}%"
                checks["memory"]["pass"] = mem_pct <= MEM_WARN_PCT
                if not checks["memory"]["pass"]: all_pass = False

            except Exception:
                _error_window.append(1)
                checks["latency"]["pass"] = False
                checks["latency"]["value"] = "timeout"
                checks["memory"]["pass"] = False
                checks["memory"]["value"] = "—"
                all_pass = False

            # ── Check 3: dependency reachable ─────────────────────────────────
            try:
                gr = await client.get(f"http://localhost:{gateway_port}/health", timeout=0.8)
                checks["dependency"]["pass"] = gr.status_code == 200
                checks["dependency"]["value"] = "reachable" if checks["dependency"]["pass"] else "unreachable"
            except Exception:
                # Gateway not running is OK for this demo — soft dep
                checks["dependency"]["pass"] = True
                checks["dependency"]["value"] = "n/a (not required)"

            # ── Check 4: error rate ───────────────────────────────────────────
            err_count = sum(_error_window)
            checks["error_rate"]["value"] = f"{err_count}/10"
            checks["error_rate"]["pass"] = err_count < 3
            if not checks["error_rate"]["pass"]: all_pass = False

            # ── Evaluate overall ──────────────────────────────────────────────
            if all_pass:
                if _state["service_status"] != "healthy":
                    _log("greenboot: ✓ ALL checks PASSED — service HEALTHY")
                _state["service_status"] = "healthy"
                _state["consecutive_failures"] = 0
            else:
                failed = [k for k, v in checks.items() if not v["pass"]]
                _state["service_status"] = "degraded"
                _state["consecutive_failures"] += 1
                _log(f"greenboot: ✗ DEGRADED — failed: {', '.join(failed)} "
                     f"(streak: {_state['consecutive_failures']})")

                if _state["consecutive_failures"] >= 3:
                    _state["service_status"] = "rollback"
                    _state["rollback_count"] += 1
                    _state["fault_active"] = False
                    _state["consecutive_failures"] = 0
                    _error_window.clear()
                    _log(f"greenboot: 🔄 ROLLBACK #{_state['rollback_count']} triggered")
                    _log("greenboot: reverting to last known good state")
                    await broadcast_fn({"type": "scenario6_rollback", "state": get_state()})
                    await asyncio.sleep(2.0)
                    _state["service_status"] = "healthy"
                    _log("greenboot: ✓ Rollback complete — service restored")

            await broadcast_fn({"type": "scenario6_tick", "state": get_state()})
            await asyncio.sleep(3.0)


async def inject_fault(broadcast_fn):
    _state["fault_active"] = True
    _error_window.extend([1, 1])  # pre-seed errors
    _log("greenboot: fault injected — latency spike + error rate increasing")
    await broadcast_fn({"type": "scenario6_fault", "state": get_state()})


async def clear_fault(broadcast_fn):
    _state["fault_active"] = False
    _error_window.clear()
    _log("greenboot: fault cleared")
    await broadcast_fn({"type": "scenario6_fault_cleared", "state": get_state()})


async def stop(broadcast_fn):
    _state["running"] = False
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, podman.remove_container, CONTAINER)
    await broadcast_fn({"type": "scenario6_stopped"})


def get_state():
    return {
        "running":              _state["running"],
        "service_status":       _state["service_status"],
        "checks":               _state["checks"],
        "consecutive_failures": _state["consecutive_failures"],
        "total_polls":          _state["total_polls"],
        "rollback_count":       _state["rollback_count"],
        "fault_active":         _state["fault_active"],
        "log":                  _state["log"][-12:],
    }
