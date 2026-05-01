"""
RHIVOS Demo — full functional test suite
Covers S1/S2/S3 (existing) + Isolation Suite (/iso/*) + S7-S10 smoke tests.
Stops all scenarios before testing for a clean state.
"""
import requests, time, sys

BASE = "http://localhost:8000"
PASS = "✅"; FAIL = "❌"
results = []

def check(name, ok, detail=""):
    sym = PASS if ok else FAIL
    results.append((sym, name, detail))
    print(f"  {sym}  {name}{' — ' + detail if detail else ''}")

def post(path, timeout=8):
    r = requests.post(f"{BASE}{path}", timeout=timeout)
    return r.status_code, r.json()

def get(path, timeout=5):
    r = requests.get(f"{BASE}{path}", timeout=timeout)
    return r.status_code, r.json()

def wait(msg, secs):
    print(f"  ⏳ {msg} ({secs}s)…")
    time.sleep(secs)

# ── Clean slate ───────────────────────────────────────────────────────────────
print("\n=== Stopping all scenarios for clean state ===")
for n in range(1, 11):
    try: requests.post(f"{BASE}/scenario{n}/stop", timeout=5)
    except: pass
try: requests.post(f"{BASE}/iso/stop", timeout=5)
except: pass
time.sleep(2)

# ── S1: Mixed Criticality + CPU storm ────────────────────────────────────────
print("\n=== Scenario 1: Mixed Criticality + CPU Storm ===")
post("/scenario1/stop"); time.sleep(1)
sc, _ = post("/scenario1/start")
check("S1 start accepted", sc == 200)
wait("containers start", 5)
sc, state = get("/scenario1/state")
check("S1 running", state.get("running") == True)
check("S1 has latency data", len(state.get("asil_latencies", [])) > 0,
      f"samples={len(state.get('asil_latencies', []))}")

sc, _ = post("/scenario1/storm/start")
check("S1 storm trigger accepted", sc == 200)
wait("storm runs", 4)
sc, state = get("/scenario1/state")
check("S1 storm_active during storm", state.get("storm_active") == True)

post("/scenario1/storm/stop")
wait("storm stops", 2)
sc, state = get("/scenario1/state")
check("S1 storm_active=False after stop", state.get("storm_active") == False)
check("S1 ASIL-B 0 deadline misses", state.get("asil_deadline_misses", 1) == 0,
      f"misses={state.get('asil_deadline_misses')}")

post("/scenario1/stop"); time.sleep(1)
sc, state = get("/scenario1/state")
check("S1 not running after stop", state.get("running") == False)

# ── S2: BlueChi ───────────────────────────────────────────────────────────────
print("\n=== Scenario 2: BlueChi Orchestration ===")
sc, _ = post("/scenario2/start")
check("S2 start accepted", sc == 200)
wait("containers + warm-up", 7)
sc, state = get("/scenario2/state")
chips = state.get("chips", {})
check("S2 running", state.get("running"))
check("S2 ADAS running", chips.get("adas", {}).get("status") == "running",
      f"status={chips.get('adas', {}).get('status')}")
check("S2 IVI running",  chips.get("ivi",  {}).get("status") == "running",
      f"status={chips.get('ivi', {}).get('status')}")
check("S2 Gateway running", chips.get("gateway", {}).get("status") == "running",
      f"status={chips.get('gateway', {}).get('status')}")

print("  Crashing IVI (QM) — expect auto-restart…")
post("/scenario2/crash/ivi"); wait("IVI restart", 7)
sc, state = get("/scenario2/state")
check("S2 IVI auto-restarted",
      state.get("chips", {}).get("ivi", {}).get("status") == "running",
      f"status={state.get('chips', {}).get('ivi', {}).get('status')}")

print("  Crashing ADAS (ASIL-B) — expect safe_state…")
post("/scenario2/crash/adas"); wait("ADAS safe state", 3)
sc, state = get("/scenario2/state")
check("S2 ADAS in safe_state",
      state.get("chips", {}).get("adas", {}).get("status") == "safe_state",
      f"status={state.get('chips', {}).get('adas', {}).get('status')}")
check("S2 safe_state_active", state.get("safe_state_active") == True)

print("  Recovering ADAS…")
post("/scenario2/recover/adas"); wait("ADAS recovery", 7)
sc, state = get("/scenario2/state")
check("S2 ADAS running after recovery",
      state.get("chips", {}).get("adas", {}).get("status") == "running",
      f"status={state.get('chips', {}).get('adas', {}).get('status')}")
post("/scenario2/stop"); time.sleep(1)

# ── S3: OTA Update ────────────────────────────────────────────────────────────
print("\n=== Scenario 3: OTA Update ===")
post("/scenario3/stop"); time.sleep(1)
post("/scenario3/start"); wait("OTA boot", 5)
sc, state = get("/scenario3/state")
check("S3 running on slot A", state.get("running") and state.get("active_slot") == "A",
      f"slot={state.get('active_slot')}")
post("/scenario3/update"); wait("OTA swap", 12)
sc, state = get("/scenario3/state")
check("S3 swapped to slot B", state.get("active_slot") == "B",
      f"slot={state.get('active_slot')} version={state.get('active_version')}")
post("/scenario3/stop"); time.sleep(1)

# ── Isolation Suite (/iso/*) ─────────────────────────────────────────────────
print("\n=== Isolation Suite: all 4 vectors ===")
post("/iso/stop"); time.sleep(1)

sc, _ = post("/iso/start")
check("ISO start accepted", sc == 200)
wait("containers + warm-up", 6)

sc, state = get("/iso/state")
check("ISO running", state.get("running") == True, f"running={state.get('running')}")
check("ISO ci-asil healthy", state.get("asil_status") == "healthy",
      f"status={state.get('asil_status')}")
check("ISO has ASIL-B latency data", len(state.get("asil_latency", [])) > 0,
      f"samples={len(state.get('asil_latency', []))}")

# Individual attacks
print("  Launching CPU attack…")
sc, _ = post("/iso/attack/cpu/start")
check("ISO CPU attack accepted", sc == 200)
wait("CPU attack runs", 3)
sc, state = get("/iso/state")
check("ISO cpu_attack=True", state.get("cpu_attack") == True)
check("ISO ASIL-B still healthy during CPU attack",
      state.get("asil_status") == "healthy", f"status={state.get('asil_status')}")
check("ISO 0 deadline misses during CPU attack",
      state.get("asil_deadline_misses", 1) == 0,
      f"misses={state.get('asil_deadline_misses')}")
post("/iso/attack/cpu/stop"); time.sleep(1)

print("  Launching temporal attack…")
post("/iso/attack/temporal/start"); wait("temporal attack runs", 3)
sc, state = get("/iso/state")
check("ISO temporal_attack=True", state.get("temporal_attack") == True)
check("ISO ASIL-B healthy during temporal attack",
      state.get("asil_status") == "healthy", f"status={state.get('asil_status')}")
post("/iso/attack/temporal/stop"); time.sleep(1)

print("  Running spatial probe…")
post("/iso/probe/spatial"); wait("spatial probe", 6)
sc, state = get("/iso/state")
check("ISO spatial probe ran", state.get("spatial_probe_result") in ("blocked", "reachable"),
      f"result={state.get('spatial_probe_result')}")
check("ISO ASIL-B healthy after probe",
      state.get("asil_status") == "healthy", f"status={state.get('asil_status')}")

print("  Launching FULL ATTACK (all vectors)…")
post("/iso/attack/full"); wait("full attack runs", 4)
sc, state = get("/iso/state")
check("ISO cpu_attack active in full attack", state.get("cpu_attack") == True)
check("ISO mem_attack active in full attack", state.get("mem_attack") == True)
check("ISO temporal_attack active in full attack", state.get("temporal_attack") == True)
check("ISO ASIL-B healthy during full attack",
      state.get("asil_status") == "healthy", f"status={state.get('asil_status')}")
check("ISO 0 deadline misses during full attack",
      state.get("asil_deadline_misses", 1) == 0,
      f"misses={state.get('asil_deadline_misses')}")

post("/iso/attack/stop"); wait("attacks stop", 2)
sc, state = get("/iso/state")
check("ISO all attacks cleared", not state.get("cpu_attack") and not state.get("mem_attack") and not state.get("temporal_attack"),
      f"cpu={state.get('cpu_attack')} mem={state.get('mem_attack')} temp={state.get('temporal_attack')}")

post("/iso/stop"); wait("ISO stop", 2)
sc, state = get("/iso/state")
check("ISO not running after stop", state.get("running") == False)

# ── S7-S10: smoke tests ───────────────────────────────────────────────────────
print("\n=== Scenarios 7-10: Endpoint smoke test ===")
for n, name in [(7, "Temporal"), (8, "FoD"), (9, "Spatial"), (10, "IPC")]:
    sc, state = get(f"/scenario{n}/state")
    check(f"S{n} ({name}) state endpoint OK", sc == 200)

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
passed = sum(1 for r in results if r[0] == PASS)
failed = sum(1 for r in results if r[0] == FAIL)
print(f"RESULTS: {passed} passed  {failed} failed  ({len(results)} total)")
if failed:
    print("\nFailed tests:")
    for sym, name, detail in results:
        if sym == FAIL: print(f"  ❌ {name} — {detail}")
sys.exit(0 if failed == 0 else 1)
