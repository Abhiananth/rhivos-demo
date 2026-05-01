# RHIVOS Demo

A real-time web dashboard backed by actual Podman containers demonstrating how **Red Hat In-Vehicle OS (RHIVOS)** works — mixed criticality isolation, multi-chip container orchestration (BlueChi), and OTA updates with automatic rollback.

> Built to understand and demonstrate [RHIVOS](https://www.redhat.com/en/technologies/automotive) — Red Hat's ISO 26262 ASIL-B certified Linux OS for automotive high-performance compute units.

👉 **[automotive-linux-simulations](https://github.com/Abhiananth/automotive-linux-simulations)** — the terminal simulation series this builds on.

---

## AutoSD and RHIVOS — the relationship

```
AutoSD  ──────────────────────────►  RHIVOS
(open-source upstream)               (ASIL-B certified product)

Like Fedora → RHEL, but for cars.
```

| | AutoSD | RHIVOS |
|---|---|---|
| **What it is** | Open-source community distribution for automotive Linux | Commercial, hardened, ISO 26262 ASIL-B certified product |
| **Who uses it** | Developers, researchers, OEM evaluation teams | Production vehicle ECUs / HPCs |
| **Kernel** | PREEMPT_RT patched, automotive-tuned | Same kernel + additional safety certifications |
| **BlueChi** | Developed here first | Shipped and supported |
| **OTA** | rpm-ostree based | rpm-ostree + ComposeFS + dual-slot |
| **Where to get it** | [autosd.redhat.com](https://autosd.redhat.com) | Via Red Hat subscription |

**This demo** simulates the RHIVOS runtime model (cgroup isolation, BlueChi orchestration, atomic OTA) using real Podman containers. The containers run a lightweight Python service — in production these would be containerised workloads on an actual RHIVOS/AutoSD image.

---

## What the demo shows

### Scenario 1 — Mixed Criticality

> *"Traditional automotive architecture uses separate chips for safety and non-safety software. RHIVOS runs both on one kernel. Here's how the isolation is enforced."*

- Two real Podman containers on the same kernel
- **ASIL-B** (`lane-keep-assist`): `--cpus 0.4` — 40% CPU hard reservation, kernel-enforced
- **QM** (`media-player`): `--cpus 0.6` — 60% ceiling, kernel-throttled above
- Trigger a CPU storm inside QM — watch ASIL-B latency stay flat
- That is **Freedom from Interference (FFI)** — the core ASIL-B guarantee

**What you see:** live circular CPU gauges, storm indicator banner, latency chart with deadline line.

### Scenario 2 — BlueChi Orchestration

> *"BlueChi is like Kubernetes for vehicles — but deterministic, built on systemd, and designed for multi-chip HPCs."*

- Python controller manages 3 Podman containers (one per simulated "chip")
- Crash a **QM** container → BlueChi auto-restarts it (3-second policy)
- Crash an **ASIL-B** container → system enters **safe state** — no auto-restart, deliberate recovery required (ISO 26262 §10)
- Real container supervision via Podman events

**What you see:** controller→chip architecture diagram, pulse heartbeat dots, safe-state banners, crash/recover buttons per chip.

### Scenario 3 — OTA Update (rpm-ostree model)

> *"rpm-ostree gives you two OS image slots on disk. Updates happen to the standby slot while the car keeps driving. A health check gates activation — fail it and the system rolls back automatically."*

- Runs OTA service `v1.0.0`, atomically swaps to `v2.0.0`
- Health check gates the activation
- Inject a fault → health check fails → automatic rollback to v1
- `/var` partition survives every update and every rollback

**What you see:** dual A/B slot diagram with live progress bar, health-check spinner, rollback banner, `/var` log counter.

---

## Prerequisites

- macOS with [Podman Desktop](https://podman-desktop.io) installed (arm64 native)
- Python 3.11+
- Node.js 18+ (installed via `fnm`)

---

## Running the demo

```bash
git clone https://github.com/Abhiananth/rhivos-demo.git
cd rhivos-demo

# start everything (Podman machine + backend + frontend)
./start.sh
```

Open **http://localhost:5173** in your browser.

**First time:** click **Build container images** in the top-right before starting any scenario.

---

## Architecture

```
Browser (React + Vite)
    │  WebSocket + REST (/api/...)
    ▼
FastAPI backend  (Python, port 8000)
    │  subprocess
    ▼
Podman CLI  →  Podman Machine (Linux VM on macOS)
                   │
                   ├── demo-asil-b    (--cpus 0.4)
                   ├── demo-qm        (--cpus 0.6)
                   ├── demo-adas      (ASIL-B, BlueChi chip)
                   ├── demo-ivi       (QM, BlueChi chip)
                   ├── demo-gateway   (QM, BlueChi chip)
                   └── demo-ota-active
```

---

## Tech stack

| Layer | Technology | RHIVOS equivalent |
|---|---|---|
| OS concepts | Podman containers (macOS) | RHIVOS / AutoSD |
| Orchestration | Python controller + Podman events | BlueChi (systemd-based) |
| CPU isolation | cgroups v2 `--cpus` | cgroup `cpu.min` / `cpu.max` |
| OTA model | Image swap + health check | rpm-ostree + ComposeFS |
| Persistent data | `/var` concept | `/var` writable partition |
| Dashboard | React + Vite + Recharts | — |
| API | FastAPI + WebSockets | — |

---

## Demo walkthrough (8 minutes)

### Opening (30 s)
*"This demo runs real Linux containers on your laptop to show how RHIVOS — Red Hat's ASIL-B certified automotive OS — solves the three hardest problems in modern vehicle software."*

Click **Build container images** and wait ~30 s.

### Scenario 1 — Mixed Criticality (2 min)
1. Click **Start scenario**
2. Point to the two CPU gauges: *"ASIL-B (lane keep assist) has a 40% CPU reservation the kernel guarantees. Infotainment has a 60% ceiling."*
3. Click **Trigger QM CPU storm**
4. Watch the QM gauge spike red, ASIL-B stays flat
5. *"The kernel enforces this in hardware. Even if infotainment goes rogue, safety software is untouched. That's Freedom from Interference — the core ASIL-B requirement."*

### Scenario 2 — BlueChi (2.5 min)
1. Click **Start scenario**
2. Show the three chip cards connected to the controller
3. Click **Crash** on the Infotainment chip
4. Watch it restart automatically: *"QM policy — BlueChi restarts it, like a kubelet restarting a pod."*
5. Click **Crash** on the ADAS chip
6. Watch safe state activate: *"ASIL-B policy — NO auto-restart. ISO 26262 says you must understand why it crashed before you restart. A human or a diagnostic routine must sign off. Click recover to simulate that."*

### Scenario 3 — OTA (2.5 min)
1. Click **Start scenario** (shows v1.0.0 active in Slot A)
2. Click **Push OTA update**
3. Watch Slot B fill with the progress bar: *"The car keeps running on Slot A while the new image writes to Slot B."*
4. Watch health check run, then activation: *"Health check passed — Slot B becomes active."*
5. Now click **Inject fault**, then **Push OTA update** again
6. Watch health check fail and automatic rollback: *"Health check failed. System rolled back to Slot A automatically. Zero downtime, zero manual intervention."*
7. Point to `/var` counter: *"Driver preferences, nav history, logs — all still there. `/var` survives every update."*

### Close (30 s)
*"Everything you just saw — CPU isolation, orchestration policies, atomic OTA — is what RHIVOS ships in production vehicles. AutoSD is the open-source upstream where all of this is developed. You can download AutoSD today and run the same stack."*

---

## Runs locally

This demo runs entirely on your laptop using a Podman VM — no cloud account or hardware required. It is intentionally self-contained so you can walk a customer through it anywhere.

To share it remotely: `ngrok http 5173` gives a public URL in one command.

---

## What's next — three phases

This demo is **Phase 1**. Here is the full roadmap we are building toward:

### Phase 1 — Laptop demo ✅ (this repo)
Podman containers on macOS, simulating the RHIVOS runtime model. Demonstrates the three core concepts with a live web dashboard.

### Phase 2 — Real hardware
Run the same stack on an actual automotive-grade board.

| Step | What | Why |
|---|---|---|
| Flash AutoSD | Boot AutoSD on a Raspberry Pi 4 or an NXP i.MX8 board | Shows RHIVOS concepts on real hardware, not a VM |
| Real BlueChi | Replace the Python controller with actual `bluechi-controller` + `bluechi-agent` systemd units | Real multi-chip orchestration, not a simulation |
| Real cgroups | `cpu.min` / `cpu.max` in the kernel cgroup hierarchy | Stronger than `--cpus`; how production RHIVOS enforces FFI |
| Hardware watchdog | Connect to the board's hardware watchdog timer | ASIL-B requirement: hw watchdog triggers safe state if kernel hangs |

> AutoSD images for Raspberry Pi 4 and NXP i.MX8 are available at [autosd.redhat.com](https://autosd.redhat.com).

### Phase 3 — Car to cloud (OpenShift)
Show the full vehicle lifecycle managed from a central cloud platform.

```
OpenShift (cloud)
    │
    │  OTA image push  (ORAS / Quay.io registry)
    ▼
RHIVOS vehicle  (AutoSD board)
    │
    └── rpm-ostree pulls new image → dual-slot swap → health check → activate
```

| Step | What |
|---|---|
| Quay.io registry | Push `v1` and `v2` OTA container images to a Red Hat registry |
| OpenShift GitOps | Trigger an OTA update from an OpenShift pipeline (ArgoCD / Tekton) |
| Vehicle agent | `greenboot` or a custom health-check agent on the AutoSD board phones home after activation |
| Fleet view | OpenShift ACM (Advanced Cluster Management) shows all vehicles, their OS version, and update status on a single pane |
| Rollback visibility | Failed health check on the vehicle triggers automatic rollback; OpenShift fleet view shows the vehicle as "rolled back" in real time |

> This is the demo that answers *"how does a car get a software update the same way a Kubernetes workload does?"*

---

*Part of a series. See also: [automotive-linux-simulations](https://github.com/Abhiananth/automotive-linux-simulations)*

