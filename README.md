# automotive-linux-demo

A real-time web dashboard backed by actual Podman containers demonstrating how automotive Linux works — mixed criticality isolation, multi-chip container orchestration, and OTA updates with automatic rollback.

**Not a simulation.** Real containers. Real cgroup enforcement. Real process supervision. Runs on your Mac in under 5 minutes.

> **Runs locally.** This is a local demo — `http://localhost:5173` only. It requires your Mac to host both the Podman containers and the web server. To share it remotely, use [ngrok](https://ngrok.com/) to tunnel the port, or deploy to a Linux cloud VM. A hosted version via MicroShift + OpenShift is planned for Phase 2.

Built to understand and demonstrate [RHIVOS](https://www.redhat.com/en/technologies/automotive) — Red Hat's ISO 26262 ASIL-B certified Linux OS for automotive HPC units.

👉 **[automotive-linux-simulations](https://github.com/Abhiananth/automotive-linux-simulations)** — the terminal simulation series this builds on.

---

## Quick start

```bash
# 1. Start the Podman machine (one-time setup)
podman machine init --cpus 4 --memory 4096 --disk-size 20
podman machine start

# 2. Clone and run
git clone https://github.com/Abhiananth/automotive-linux-demo.git
cd automotive-linux-demo
./start.sh
```

Open **http://localhost:5173** — then click **Build container images** before starting any scenario.

---

## The three scenarios

### Scenario 1 — Mixed Criticality

**The problem:** A modern car consolidates ADAS (safety-critical) and infotainment (non-safety) onto one chip. How do you prevent infotainment from stealing CPU from the ADAS system?

**What this shows:**
- Two real Podman containers start side by side
- **ASIL-B container** (`lane-keep-assist`): `--cpuset-cpus 0` — dedicated CPU core, physically isolated from all other workloads
- **QM container** (`media-player`): `--cpus 0.6` — 60% ceiling enforced by Linux cgroup `cpu.max`
- Hit **Trigger QM CPU storm** — the infotainment container spins its CPU to 100%
- Watch the live latency chart: QM latency spikes, ASIL-B latency **doesn't move**

That flat ASIL-B line is Freedom from Interference — the property Red Hat proved to [exida](https://www.exida.com/) to earn the ISO 26262 ASIL-B certificate for RHIVOS.

### Scenario 2 — BlueChi-style Orchestration

**The problem:** A car has multiple chips (ADAS, Infotainment, Gateway). Who starts containers, monitors them, and recovers when they crash?

**What this shows:**
- A Python controller manages 3 real Podman containers — one per "chip"
- Hit **crash** on the IVI chip (QM) → controller auto-restarts it in 3 seconds via restart policy
- Hit **crash** on the ADAS chip (ASIL-B) → **safe state activates**, no auto-restart, a recovery button appears
- Hit **recover (deliberate)** → 2-second self-check runs, then the container comes back

Why no auto-restart for ASIL-B? ISO 26262 requires it. A blind restart of a safety service could mask the root cause of a crash and return the system to a dangerous state. The restart must be deliberate and preceded by a health check. [BlueChi](https://bluechi.readthedocs.io/) — Red Hat's real orchestrator built on systemd — enforces exactly this distinction.

### Scenario 3 — OTA Update

**The problem:** How do you update a car's software over the air without risking a bricked vehicle?

**What this shows:**
- v1.0.0 running in Slot A
- Hit **Push OTA update** — v2.0.0 is pulled into Slot B while v1.0.0 keeps running
- A health check gates activation — if it passes, Slot B becomes active
- The `/var` log counter goes up through every update — simulating runtime data (logs, nav cache, user prefs) that lives on a separate partition and **survives every image swap**
- Hit **Inject fault** then **Push OTA update** — health check fails, automatic rollback to Slot A, no human involved

This models [rpm-ostree](https://coreos.github.io/rpm-ostree/) (dual-slot atomic OS updates) and [ComposeFS](https://github.com/containers/composefs) (immutable read-only OS filesystem) — both core to RHIVOS.

---

## Demo walkthrough (8 minutes)

Use this sequence when showing to a customer or colleague.

**Step 1 — Mixed Criticality (~3 min)**
> *"Traditional automotive architecture needs separate chips for safety and non-safety software. RHIVOS runs both on one kernel. Here's how the isolation is enforced."*

1. Start scenario → two containers appear, latency chart shows both flat ~3-5ms
2. Trigger QM CPU storm → QM latency spikes to 30-50ms
3. Point at the ASIL-B line: it doesn't move
4. Say: *"That flat line is what Red Hat proved to exida. The kernel guaranteed that CPU core regardless of what QM does. No hypervisor, no separate chip — just Linux cgroups."*

**Step 2 — BlueChi Orchestration (~3 min)**
> *"Now we have multiple chips. BlueChi is what manages containers across all of them."*

1. Start scenario → 3 containers across 3 chips
2. Crash the IVI chip → auto-restart in 3s, restart counter goes up
3. Crash the ADAS chip → safe state banner, no restart
4. Say: *"Kubernetes would restart both. BlueChi knows the difference. ISO 26262 doesn't allow a blind restart of a safety service — you have to know why it crashed first."*
5. Hit recover → self-check, service back online

**Step 3 — OTA Update (~2 min)**
> *"No recalls. Software updates pushed over the air, with automatic rollback if something goes wrong."*

1. Start scenario → v1.0.0 in Slot A
2. Push update → progress bar, reboot, v2.0.0 active. Point at /var log count surviving
3. Inject fault → Push update → rollback fires automatically
4. Say: *"That rollback needs zero human involvement. The car wakes up on the previous known-good image. That's why this is safe to push at 2am while the car is parked."*

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| macOS Apple Silicon (arm64) | arm64 Podman required |
| [Podman 5.4+](https://podman.io/) | `/opt/podman/bin/podman` |
| Python 3.12+ | For the FastAPI backend |
| Node 22+ | Via [fnm](https://github.com/Schniz/fnm) or similar |

---

## Architecture

```
frontend/              React + Vite + Recharts
  src/components/
    MixedCriticality.tsx   Live latency chart + storm control
    BlueChi.tsx            Chip cards + controller log
    OTAUpdate.tsx          Slot display + progress + log

backend/
  main.py                FastAPI + WebSocket broadcast hub
  podman_client.py       Thin wrapper around podman CLI
  scenarios/
    mixed_criticality.py  Start/stop containers, poll /health, stream latency
    bluechi.py            Controller loop, crash detection, restart policy
    ota.py                Image pull, slot swap, health-check, rollback

containers/
  asil-b/                Python FastAPI service (stress-protected)
  qm-service/            Python FastAPI service (CPU stress endpoint)
  ota-v1/                Versioned service v1.0.0 (blue)
  ota-v2/                Versioned service v2.0.0 (green)
```

---

## What's next

| Phase | What | Why |
|-------|------|-----|
| Phase 2 | MicroShift on-device + OpenShift in cloud | Real car-to-cloud GitOps — push a config change in OpenShift, it propagates to the "vehicle" |
| Phase 3 | Actual hardware (Raspberry Pi / Renesas R-Car) | Full end-to-end with real embedded Linux |

---

## Background

Cars are consolidating from 100+ separate ECUs onto a small number of HPC chips. That creates a hard problem: ADAS software certified to ISO 26262 ASIL-B has to coexist with non-safety infotainment software on the same silicon, without interference.

RHIVOS solves this with Linux containers and cgroups — the same technology that powers cloud infrastructure — independently certified to ASIL-B by exida. This project models the key mechanisms that make that certification possible.

*Part of a series. See also: [automotive-linux-simulations](https://github.com/Abhiananth/automotive-linux-simulations)*
