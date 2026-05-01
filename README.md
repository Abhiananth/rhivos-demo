# automotive-linux-demo

A real-time web dashboard backed by actual Podman containers demonstrating automotive Linux concepts — mixed criticality isolation, BlueChi-style orchestration, and OTA updates with automatic rollback.

Not a simulation. Real containers. Real cgroup enforcement. Real process supervision.

**[automotive-linux-simulations](https://github.com/Abhiananth/automotive-linux-simulations)** — the terminal simulations this builds on.

---

## What this demonstrates

### Scenario 1 — Mixed Criticality
Two Podman containers with real kernel-enforced CPU isolation:
- **ASIL-B container** (`lane-keep-assist`): `--cpuset-cpus 0` — dedicated CPU core, physically isolated
- **QM container** (`media-player`): `--cpus 0.6` — 60% ceiling enforced by cgroup `cpu.max`

Trigger a CPU storm inside the QM container. The live latency chart shows ASIL-B response time stays flat. That's Freedom from Interference — the property that got RHIVOS certified to ISO 26262 ASIL-B.

### Scenario 2 — BlueChi-style Orchestration
A Python controller manages 3 Podman containers (ADAS chip, IVI chip, Gateway chip) via Podman's event stream:
- Crash a **QM** container → controller auto-restarts it in 3 seconds
- Crash an **ASIL-B** container → safe state activates, no auto-restart, deliberate operator recovery required

ISO 26262 requires that difference. A blind restart of a safety-critical service could return the system to a dangerous state without knowing why it crashed.

### Scenario 3 — OTA Update
Real dual-slot container image swap:
- Active slot running v1, standby slot receives v2
- Health check gates the activation — must pass before v2 becomes active
- Inject a fault → push the update → health check fails → automatic rollback to v1
- `/var` log count increments through every update and every rollback — simulating runtime data that survives the OS image swap

---

## Prerequisites

- macOS with Apple Silicon (arm64)
- Podman 5.4+ via `/opt/podman/bin/podman`
- Python 3.12+
- Node 22+ (via fnm)

```bash
# One-time: start the Podman machine
podman machine init --cpus 4 --memory 4096 --disk-size 20
podman machine start
```

## Run

```bash
git clone https://github.com/Abhiananth/automotive-linux-demo.git
cd automotive-linux-demo
./start.sh
```

Open `http://localhost:5173`. First time — click **Build container images** before starting any scenario.

## Architecture

```
frontend/          React + Vite + Recharts (WebSocket client)
backend/
  main.py          FastAPI + WebSocket hub
  podman_client.py Podman CLI wrapper
  scenarios/
    mixed_criticality.py  Scenario 1 — cgroup isolation
    bluechi.py            Scenario 2 — container supervision
    ota.py                Scenario 3 — image swap + rollback
containers/
  asil-b/          Python HTTP service (ASIL-B, stress-protected)
  qm-service/      Python HTTP service (QM, stressable)
  ota-v1/          OTA service v1.0.0 (blue)
  ota-v2/          OTA service v2.0.0 (green)
```

---

## What's next

- **Phase 2**: MicroShift on-device + OpenShift in the cloud — real car-to-cloud OTA management via GitOps
- **Phase 3**: Actual automotive hardware (Raspberry Pi or Renesas R-Car dev board) running RHIVOS/MicroShift

*Part of a learning and demo project for automotive Linux and [RHIVOS](https://www.redhat.com/en/technologies/automotive) concepts.*
