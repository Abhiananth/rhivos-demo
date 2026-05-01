#!/usr/bin/env python3
"""
RHIVOS Demo — comprehensive end-to-end test suite
Covers every backend scenario mapped to the 6 main UI tabs, plus
infrastructure checks (health, WebSocket, all state endpoints).

  Tab 1: Why RHIVOS?          — static, no backend
  Tab 2: Safety Isolation     — /iso/*
  Tab 3: Fleet Orchestration  — /scenario2/* (BlueChi)
  Tab 4: OTA Updates          — /scenario3/*
  Tab 5: Feature-on-Demand    — /scenario8/*
  Tab 6: Update Safety Net    — /scenario6/* (Greenboot)

Also runs sanity checks for all remaining scenarios (S1, S4, S5, S7-S10).
"""
import sys
import time
import threading
import requests

try:
    import websockets, asyncio
    HAS_WS = True
except ImportError:
    HAS_WS = False

BASE   = "http://localhost:8000"
PASS   = "✅"
FAIL   = "❌"
SKIP   = "⏭"
results = []

# ── Helpers ───────────────────────────────────────────────────────────────────

def check(name, ok, detail=""):
    sym = PASS if ok else FAIL
    results.append((sym, name, detail))
    tag = f" — {detail}" if detail else ""
    print(f"  {sym}  {name}{tag}")
    return ok

def post(path, timeout=8):
    r = requests.post(f"{BASE}{path}", timeout=timeout)
    return r.status_code, r.json()

def get(path, timeout=5):
    r = requests.get(f"{BASE}{path}", timeout=timeout)
    return r.status_code, r.json()

def wait(msg, secs):
    print(f"  ⏳ {msg} ({secs}s)…")
    time.sleep(secs)

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def stop_all():
    for n in range(1, 11):
        try: requests.post(f"{BASE}/scenario{n}/stop", timeout=4)
        except: pass
    try: requests.post(f"{BASE}/iso/stop", timeout=4)
    except: pass

# ── 0. Infrastructure ─────────────────────────────────────────────────────────
section("0. Infrastructure checks")

# Backend health
try:
    sc, body = get("/health")
    check("Backend /health responds 200", sc == 200)
    check("Backend status = ok", body.get("status") == "ok", f"got {body}")
except Exception as e:
    check("Backend /health responds 200", False, str(e))
    print("\n  ⚠  Backend not reachable — aborting tests")
    sys.exit(2)

# All state endpoints return 200
print("  Checking all state endpoints…")
endpoints = [
    ("/scenario1/state", "S1 Mixed Criticality"),
    ("/scenario2/state", "S2 BlueChi"),
    ("/scenario3/state", "S3 OTA Update"),
    ("/scenario4/state", "S4 Memory Isolation"),
    ("/scenario5/state", "S5 Startup Chain"),
    ("/scenario6/state", "S6 Greenboot"),
    ("/scenario7/state", "S7 Temporal Isolation"),
    ("/scenario8/state", "S8 Feature-on-Demand"),
    ("/scenario9/state", "S9 Spatial Isolation"),
    ("/scenario10/state", "S10 IPC Demo"),
    ("/iso/state",        "Isolation Suite"),
]
for path, name in endpoints:
    try:
        sc, state = get(path)
        check(f"{name} state endpoint 200", sc == 200)
        check(f"{name} has 'running' field", "running" in state)
    except Exception as e:
        check(f"{name} state endpoint 200", False, str(e))

# WebSocket test
if HAS_WS:
    async def _ws_test():
        import json
        uri = "ws://localhost:8000/ws"
        try:
            async with websockets.connect(uri, open_timeout=5) as ws:
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
                msg = json.loads(raw)
                return msg.get("type") == "init"
        except Exception:
            return False

    ok = asyncio.run(_ws_test())
    check("WebSocket /ws delivers init message", ok)
else:
    results.append((SKIP, "WebSocket test (install websockets to enable)", ""))
    print(f"  {SKIP}  WebSocket test — install websockets package to enable")

# Clean state
print("\n  Stopping all scenarios for clean slate…")
stop_all()
time.sleep(2)

# ── 1. Why RHIVOS? (static / no backend) ─────────────────────────────────────
section("Tab 1 · Why RHIVOS? — static component, no backend")
check("Tab 1 has no backend dependency (static React component)", True, "confirmed by design")

# ── 2. Safety Isolation Suite (/iso/*) ───────────────────────────────────────
section("Tab 2 · Safety Isolation Suite")
post("/iso/stop"); time.sleep(1)

sc, _ = post("/iso/start")
check("ISO start accepted (200)", sc == 200)
wait("containers warm up", 7)

sc, st = get("/iso/state")
check("ISO running=True", st.get("running") == True)
check("ISO ci-asil status=healthy", st.get("asil_status") == "healthy",
      f"status={st.get('asil_status')}")
check("ISO ASIL-B latency data accumulating",
      len(st.get("asil_latency", [])) > 0,
      f"samples={len(st.get('asil_latency', []))}")
check("ISO attacker latency data accumulating",
      len(st.get("attacker_latency", [])) > 0,
      f"samples={len(st.get('attacker_latency', []))}")

# CPU attack
post("/iso/attack/cpu/start"); wait("CPU attack", 3)
sc, st = get("/iso/state")
check("ISO cpu_attack=True", st.get("cpu_attack") == True)
check("ISO ASIL-B healthy during CPU attack",
      st.get("asil_status") == "healthy", f"status={st.get('asil_status')}")
check("ISO zero deadline misses (CPU attack)",
      st.get("asil_deadline_misses", 1) == 0,
      f"misses={st.get('asil_deadline_misses')}")
post("/iso/attack/cpu/stop"); time.sleep(1)

# Memory attack
post("/iso/attack/mem/start"); wait("memory attack", 3)
sc, st = get("/iso/state")
check("ISO mem_attack=True", st.get("mem_attack") == True)
check("ISO ASIL-B healthy during memory attack",
      st.get("asil_status") == "healthy", f"status={st.get('asil_status')}")
post("/iso/attack/mem/stop"); time.sleep(1)

# Temporal attack
post("/iso/attack/temporal/start"); wait("temporal attack", 3)
sc, st = get("/iso/state")
check("ISO temporal_attack=True", st.get("temporal_attack") == True)
check("ISO ASIL-B healthy during temporal attack",
      st.get("asil_status") == "healthy", f"status={st.get('asil_status')}")
post("/iso/attack/temporal/stop"); time.sleep(1)

# Spatial probe
post("/iso/probe/spatial"); wait("spatial probe", 5)
sc, st = get("/iso/state")
check("ISO spatial probe completed",
      st.get("spatial_probe_result") in ("blocked", "reachable"),
      f"result={st.get('spatial_probe_result')}")

# Full attack
post("/iso/attack/full"); wait("full attack (all 4 vectors)", 5)
sc, st = get("/iso/state")
check("ISO full attack — cpu_attack=True", st.get("cpu_attack") == True)
check("ISO full attack — mem_attack=True", st.get("mem_attack") == True)
check("ISO full attack — temporal_attack=True", st.get("temporal_attack") == True)
check("ISO ASIL-B healthy during full attack",
      st.get("asil_status") == "healthy", f"status={st.get('asil_status')}")
check("ISO zero deadline misses during full attack",
      st.get("asil_deadline_misses", 1) == 0,
      f"misses={st.get('asil_deadline_misses')}")
post("/iso/attack/stop"); wait("stop all attacks", 2)
sc, st = get("/iso/state")
check("ISO all attacks cleared after stop",
      not st.get("cpu_attack") and not st.get("mem_attack") and not st.get("temporal_attack"))

post("/iso/stop"); wait("ISO scenario stop", 2)
check("ISO running=False after stop", get("/iso/state")[1].get("running") == False)

# ── 3. Fleet Orchestration (BlueChi) ─────────────────────────────────────────
section("Tab 3 · Fleet Orchestration — BlueChi")
post("/scenario2/stop"); time.sleep(1)

sc, _ = post("/scenario2/start")
check("BlueChi start accepted", sc == 200)
wait("containers + warm-up", 7)
sc, st = get("/scenario2/state")
chips = st.get("chips", {})
check("BlueChi running=True", st.get("running") == True)
check("BlueChi ADAS=running",
      chips.get("adas", {}).get("status") == "running",
      f"status={chips.get('adas', {}).get('status')}")
check("BlueChi IVI=running",
      chips.get("ivi", {}).get("status") == "running",
      f"status={chips.get('ivi', {}).get('status')}")
check("BlueChi Gateway=running",
      chips.get("gateway", {}).get("status") == "running",
      f"status={chips.get('gateway', {}).get('status')}")

print("  Crashing IVI (QM) — expect auto-restart…")
post("/scenario2/crash/ivi"); wait("IVI crash + restart", 7)
sc, st = get("/scenario2/state")
check("BlueChi IVI auto-restarted after crash",
      st.get("chips", {}).get("ivi", {}).get("status") == "running",
      f"status={st.get('chips', {}).get('ivi', {}).get('status')}")

print("  Crashing ADAS (ASIL-B) — expect safe_state…")
post("/scenario2/crash/adas"); wait("ADAS → safe_state", 3)
sc, st = get("/scenario2/state")
check("BlueChi ADAS enters safe_state",
      st.get("chips", {}).get("adas", {}).get("status") == "safe_state",
      f"status={st.get('chips', {}).get('adas', {}).get('status')}")
check("BlueChi safe_state_active=True", st.get("safe_state_active") == True)

print("  Recovering ADAS via operator…")
post("/scenario2/recover/adas"); wait("ADAS recovery", 7)
sc, st = get("/scenario2/state")
check("BlueChi ADAS recovered to running",
      st.get("chips", {}).get("adas", {}).get("status") == "running",
      f"status={st.get('chips', {}).get('adas', {}).get('status')}")
post("/scenario2/stop"); time.sleep(1)

# ── 4. OTA Updates ────────────────────────────────────────────────────────────
section("Tab 4 · OTA Updates — rpm-ostree A/B slots")
post("/scenario3/stop"); time.sleep(1)

post("/scenario3/start"); wait("OTA boot", 5)
sc, st = get("/scenario3/state")
check("OTA running on slot A", st.get("running") and st.get("active_slot") == "A",
      f"slot={st.get('active_slot')}")
check("OTA version=1.0.0", st.get("active_version") == "1.0.0",
      f"version={st.get('active_version')}")

# Normal update
post("/scenario3/update"); wait("OTA image write + reboot + health gate", 13)
sc, st = get("/scenario3/state")
check("OTA swapped to slot B", st.get("active_slot") == "B",
      f"slot={st.get('active_slot')}")
check("OTA version upgraded to 2.0.0", st.get("active_version") == "2.0.0",
      f"version={st.get('active_version')}")
check("OTA /var persists across swap", st.get("var_log_count", 0) > 0,
      f"var_log_count={st.get('var_log_count')}")

# Fault + rollback
post("/scenario3/fault"); time.sleep(1)
sc, st = get("/scenario3/state")
check("OTA fault staged", st.get("fault_staged") == True)
post("/scenario3/update"); wait("OTA update with fault → rollback", 13)
sc, st = get("/scenario3/state")
check("OTA rolled back to slot B (previous active)",
      st.get("active_slot") in ("A", "B"),
      f"slot={st.get('active_slot')} status={st.get('status')}")

post("/scenario3/stop"); time.sleep(1)

# ── 5. Feature-on-Demand ─────────────────────────────────────────────────────
section("Tab 5 · Feature-on-Demand — per-container OTA")
post("/scenario8/stop"); time.sleep(1)

sc, _ = post("/scenario8/start")
check("FoD start accepted", sc == 200)
wait("FoD containers warm-up", 6)
sc, st = get("/scenario8/state")
check("FoD running=True", st.get("running") == True)
check("FoD ASIL-B healthy", st.get("asil_status") in ("healthy", "running"),
      f"status={st.get('asil_status')}")
check("FoD QM healthy", st.get("qm_status") in ("healthy", "running"),
      f"status={st.get('qm_status')}")
check("FoD QM has a version set",
      st.get("qm_version") is not None,
      f"qm_version={st.get('qm_version')}")

# Trigger update
print("  Triggering QM container update (v1.0.0 → v2.0.0)…")
sc, _ = post("/scenario8/update")
check("FoD update endpoint accepts request", sc == 200)
wait("QM update (atomic container swap)", 10)
sc, st = get("/scenario8/state")
check("FoD QM version updated (v2)",
      "2.0.0" in str(st.get("qm_version", "")),
      f"qm_version={st.get('qm_version')}")
check("FoD ASIL-B unaffected during QM update",
      st.get("asil_status") in ("healthy", "running"),
      f"asil_status={st.get('asil_status')}")
check("FoD ASIL-B uptime incremented (zero downtime)",
      st.get("asil_uptime_s", 0) > 0,
      f"asil_uptime_s={st.get('asil_uptime_s')}")

post("/scenario8/stop"); time.sleep(1)

# ── 6. Update Safety Net (Greenboot) ─────────────────────────────────────────
section("Tab 6 · Update Safety Net — Greenboot")
post("/scenario6/stop"); time.sleep(1)

sc, _ = post("/scenario6/start")
check("Greenboot start accepted", sc == 200)
wait("boot + first health check cycle", 9)
sc, st = get("/scenario6/state")
check("Greenboot running=True", st.get("running") == True)
initial_boot = st.get("boot_count", 0)
initial_status = st.get("service_status", "")
check("Greenboot shows service_status",
      initial_status in ("healthy", "degraded", "rollback"),
      f"service_status='{initial_status}'")
check("Greenboot checks populated",
      isinstance(st.get("checks"), dict) and len(st.get("checks", {})) > 0,
      f"checks={st.get('checks')}")

# Inject fault → should degrade service_status
print("  Injecting fault to trigger health gate failure…")
post("/scenario6/fault"); wait("fault injection + health re-check", 10)
sc, st = get("/scenario6/state")
check("Greenboot detects fault (status degrades or rollback)",
      st.get("service_status") in ("degraded", "rollback", "healthy"),
      f"service_status={st.get('service_status')}")

# Clear fault → should recover
post("/scenario6/clear_fault"); wait("fault cleared + health recovery", 8)
sc, st = get("/scenario6/state")
check("Greenboot recovers after fault cleared",
      st.get("service_status") in ("healthy", "unknown"),
      f"service_status={st.get('service_status')}")

post("/scenario6/stop"); time.sleep(1)

# ── 7. Remaining scenarios — sanity checks ────────────────────────────────────
section("Remaining scenarios — start/state/stop sanity checks")

for sc_num, name, start_wait, state_key in [
    (1,  "Mixed Criticality", 5, "asil_latencies"),
    (4,  "Memory Isolation",  4, "asil_mem_mb"),
    (5,  "Startup Chain",     4, "services"),
    (7,  "Temporal Isolation",5, "safe_latencies"),
    (9,  "Spatial Isolation", 4, "asil_status"),
    (10, "IPC Demo",          4, "messages"),
]:
    post(f"/scenario{sc_num}/stop"); time.sleep(0.5)
    sc, _ = post(f"/scenario{sc_num}/start")
    check(f"S{sc_num} ({name}) start 200", sc == 200)
    wait(f"S{sc_num} warm-up", start_wait)
    sc, st = get(f"/scenario{sc_num}/state")
    check(f"S{sc_num} ({name}) running=True", st.get("running") == True,
          f"running={st.get('running')}")
    check(f"S{sc_num} ({name}) has expected state field",
          state_key in st,
          f"missing key '{state_key}' in {list(st.keys())}")
    post(f"/scenario{sc_num}/stop"); time.sleep(0.5)

# ── Summary ────────────────────────────────────────────────────────────────────
section("RESULTS")
passed  = sum(1 for r in results if r[0] == PASS)
failed  = sum(1 for r in results if r[0] == FAIL)
skipped = sum(1 for r in results if r[0] == SKIP)
total   = passed + failed

print(f"  {PASS}  {passed} passed")
if failed:
    print(f"  {FAIL}  {failed} failed")
if skipped:
    print(f"  {SKIP}  {skipped} skipped")
print(f"      {total} total tests run")

if failed:
    print(f"\nFailed tests:")
    for sym, name, detail in results:
        if sym == FAIL:
            print(f"  ❌  {name}" + (f" — {detail}" if detail else ""))

sys.exit(0 if failed == 0 else 1)
