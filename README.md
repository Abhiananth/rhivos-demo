# RHIVOS Demo

A live interactive dashboard backed by **real Podman containers** demonstrating how [Red Hat In-Vehicle OS (RHIVOS)](https://www.redhat.com/en/technologies/automotive) works — safety isolation, multi-chip orchestration, and over-the-air updates with automatic rollback.

> **95/95 end-to-end tests passing.** Every button triggers actual containers with real cgroup enforcement, real kernel isolation, real port mappings. No slideware.

---

## AutoSD and RHIVOS — the relationship

```
AutoSD  ──────────────────────────►  RHIVOS
(open-source upstream · autosd.redhat.com)    (ISO 26262 ASIL-B certified product)

Like Fedora → RHEL, but for vehicles.
```

| | AutoSD | RHIVOS |
|---|---|---|
| **What it is** | Open-source community distribution for automotive Linux | Commercial, ISO 26262 ASIL-B certified OS (SEooC) |
| **Who uses it** | Developers, researchers, OEM evaluation | Production vehicle ECUs / HPCs |
| **Certification** | None — experimental upstream | Certified by exida · May 2025 (1.0), Oct 2025 (1.0 update) |
| **Kernel** | PREEMPT_RT, automotive-tuned | Same + continuous certification artifacts |
| **BlueChi** | Developed here first | Shipped and supported |
| **OTA** | rpm-ostree based | rpm-ostree + ComposeFS + dual A/B slot |
| **Access** | [autosd.redhat.com](https://autosd.redhat.com) | Red Hat subscription |

---

## What the demo shows

Six tabs, each answering a question an automaker would ask before committing to a platform.

---

### ① Why RHIVOS?

> *"Why replace dedicated ECUs at all?"*

Three-era comparison: dedicated ECUs → hypervisor + VMs → RHIVOS containers. Clickable architecture diagrams for each era, side-by-side comparison table covering isolation mechanism, OTA approach, certification path, and how to add a new feature. No backend — intentionally illustrative and directional.

**Key message:** Every new ECU feature today means new hardware, new supply chain, new software team. RHIVOS consolidates them onto one kernel with one certification path.

---

### ② Safety Isolation

> *"Is ASIL-B software actually protected from QM bugs — and can you prove it?"*

One ASIL-B container (`ci-asil`, `--cpus 0.4`, `--memory 384m`) attacked from four simultaneous directions. A live **dual area chart** shows ASIL-B latency (green) staying flat below the 10 ms safety deadline while the attacker (red) spikes. An animated preview runs even before you click Start.

| Attack | Mechanism | What the kernel does |
|---|---|---|
| **CPU** | Attacker burns 100% CPU | cgroups v2 throttles it; ASIL-B keeps its 40% slice |
| **Memory** | Attacker leaks to OOM limit | Kernel OOM-kills attacker at 160 MB; ASIL-B 384 MB intact |
| **Scheduling flood** | 8 concurrent requests / 50 ms | PREEMPT_RT keeps ASIL-B response deterministic |
| **Network namespace** | Attacker probes ASIL-B container IP | Different Linux namespace = no route |

**Full Attack** fires all four simultaneously. The green line doesn't move.

**Key message:** The kernel enforces this — not application logic, not trust. This is Freedom from Interference (FFI), the ASIL-B core requirement.

---

### ③ Fleet Orchestration (BlueChi)

> *"What happens if a safety service crashes at 3 am on a highway?"*

Three containers simulating chips: ADAS (ASIL-B), IVI (QM), Gateway (QM). BlueChi monitors their health continuously.

- **Crash IVI (QM):** BlueChi auto-restarts it within seconds. No human needed.
- **Crash ADAS (ASIL-B):** System enters **safe state** — brakes stay applied, ADAS stops making decisions. No auto-restart. ISO 26262 §10 requires a deliberate recovery: you must understand why it crashed before restarting.
- **Recover ADAS:** Operator command acknowledges the fault and restores service.

**Key message:** The difference between "auto-restart QM" and "safe-state ASIL-B" is not a policy config — it is the architectural distinction between non-safety and safety-critical software lifecycle management.

---

### ④ OTA Updates

> *"How do you update 2 million cars safely without a recall?"*

A visual 6-step pipeline: `Idle → Pull image → Write to standby → Health gate → Activate` (or `Rollback`).

- `rpm-ostree` writes the new OS image to the **standby A/B slot** while the car keeps running on the active slot
- Root filesystem is **read-only (ComposeFS)** — the OS cannot corrupt itself
- **Greenboot** runs health scripts before the new image becomes active
- Fail the health gate → system rolls back to previous slot automatically, zero human intervention
- `/var` (user data, logs, configs, nav history) survives every update and every rollback

**Key message:** Atomic, reversible, health-gated. If something goes wrong on 50,000 cars simultaneously they all recover automatically before a driver notices.

---

### ⑤ Feature-on-Demand

> *"Can you sell new features after the car leaves the factory?"*

ASIL-B and QM containers running side by side. Trigger a QM container update (v1.0.0 → v2.0.0) — an atomic container swap happens while ASIL-B keeps running. ASIL-B uptime counter keeps incrementing. QM has brief downtime. ASIL-B has zero.

**Key message:** Because features are containers, they can be updated independently — no full OS image swap, no safety partition restart. An automaker can ship "enhanced parking assistant" or "highway pilot upgrade" as a downloadable feature six months after a car leaves the factory. This is the post-sale revenue model.

---

### ⑥ Update Safety Net (Greenboot)

> *"What if an OTA update breaks something critical?"*

Greenboot runs three health checks on every boot: latency (≤10 ms), memory usage (≤80%), and dependency availability. Inject a fault — health check degrades. Clear it — system recovers. In production, a failed health gate triggers `rpm-ostree rollback` automatically before the driver notices anything.

**Key message:** OTA at scale is only safe if you have a safety net. This is that net. The answer to the question: "What if your OTA breaks 50,000 cars simultaneously?"

---

## Prerequisites

- macOS with [Podman Desktop](https://podman-desktop.io) installed (arm64 native)
- Python 3.11+
- Node.js 18+ (installed automatically via `fnm`)

---

## Running the demo

```bash
git clone https://github.com/Abhiananth/rhivos-demo.git
cd rhivos-demo

# Start everything: Podman machine + FastAPI backend + React frontend
./start.sh
```

Open **http://localhost:5173** in your browser.

> **First time:** click **Build container images** in the top-right corner before starting any scenario. This builds the two container images (`demo-asil-b`, `demo-qm`) that all scenarios use.

---

## Architecture

```
Browser  (React + Vite + Recharts)
    │  WebSocket  (live state push)
    │  REST /api/...
    ▼
FastAPI backend  (Python, port 8000)
    │  subprocess  (podman CLI)
    ▼
Podman Machine  (Linux VM on macOS)
    │
    ├── ci-asil          --cpus 0.4  --memory 384m  (Isolation Suite: ASIL-B)
    ├── ci-attacker       --memory 160m             (Isolation Suite: QM attacker)
    ├── bluechi-adas      --cpus 0.4                (Fleet Orchestration: ASIL-B chip)
    ├── bluechi-ivi                                  (Fleet Orchestration: QM chip)
    ├── bluechi-gateway                              (Fleet Orchestration: QM chip)
    ├── ota-active                                   (OTA Updates: active service)
    ├── fod-asil          --cpus 0.4                (Feature-on-Demand: ASIL-B)
    ├── fod-qm                                       (Feature-on-Demand: QM)
    └── greenboot-service                            (Update Safety Net)
```

---

## Tech stack

| Layer | In this demo | RHIVOS / production equivalent |
|---|---|---|
| Container runtime | Podman (rootless, macOS) | Podman (crun, no daemon) |
| CPU isolation | cgroups v2 `--cpus` flag | `cpu.min` / `cpu.max` in kernel cgroup hierarchy |
| Memory isolation | cgroups v2 `--memory` flag | `memory.max` + OOM killer |
| Network isolation | Podman network namespaces | Linux net namespaces, SELinux policies |
| Temporal isolation | PREEMPT_RT scheduling (shared kernel) | PREEMPT_RT configured by default in RHIVOS |
| Orchestration | Python controller + Podman events | BlueChi (systemd-based, deterministic) |
| OTA model | Image swap + health check | rpm-ostree + ComposeFS + Greenboot |
| OS images | Immutable concept via read-only layers | ComposeFS (read-only root, `/var` writable) |
| Dashboard | React + Vite + Recharts | — |
| API | FastAPI + WebSockets | — |

---

## Test suite

```bash
cd backend
.venv/bin/python test_e2e.py
```

**95 tests, all passing.** Covers:

- Infrastructure: backend health, all 11 state endpoints, WebSocket init message
- Tab 2 (Safety Isolation): start, all 4 attack vectors independently, Full Attack, zero deadline misses throughout, stop
- Tab 3 (Fleet Orchestration): start, 3 chips healthy, IVI crash→restart, ADAS→safe_state, ADAS→recover
- Tab 4 (OTA Updates): slot A boot, update→slot B, `/var` persistence, fault injection→rollback
- Tab 5 (Feature-on-Demand): start, ASIL-B healthy, QM update v1→v2, zero ASIL-B downtime
- Tab 6 (Greenboot): start, health checks run, fault degrades status, fault cleared→recovery
- All remaining scenarios (S1, S4, S5, S7-S10): start/running/stop sanity checks

---

## Demo script (10 minutes)

### Opening (30 s)
*"This runs real Linux containers on a laptop to answer five questions every automaker has to answer before they can commit to a software-defined vehicle platform."*

Click **Build container images** → wait ~30 s.

### Tab 1 — Why RHIVOS? (1 min)
Walk through the three eras. Point to the comparison table.
*"Every new feature today means new hardware. With RHIVOS: new container. Same kernel, same certification, new container image pushed OTA."*

### Tab 2 — Safety Isolation (2.5 min)
1. The animated preview is already running — point to the green and red lines.
*"Green = ASIL-B safety process. Red = QM application. Even in the preview you can see what happens under attack."*
2. Click **Start Scenario**
3. Click **Full Attack**
4. Watch the red line spike. Watch the green line do nothing.
*"Four attack vectors simultaneously. CPU, memory, scheduling, network. The green line never moves. The kernel enforces this — not application logic."*
5. Point to the deadline misses counter: *"Zero misses. That is Freedom from Interference — the ASIL-B certification requirement."*

### Tab 3 — Fleet Orchestration (2 min)
1. Click **Start Scenario** — three chips come up
2. Click **Crash** on IVI (QM)
3. Watch auto-restart: *"QM policy — back in 3 seconds, like a Kubernetes pod restart."*
4. Click **Crash** on ADAS
5. Watch safe state: *"ASIL-B policy — ISO 26262 says no auto-restart. You must understand why it crashed first. That's why the car is now in a controlled degraded state, not just rebooting the brakes."*
6. Click **Recover** to resolve it.

### Tab 4 — OTA Updates (2 min)
1. Click **Start Scenario** — v1.0.0 running in Slot A
2. Click **Push OTA update**
3. Watch the pipeline steps light up, Slot B filling.
*"Car keeps running on Slot A while Slot B is being written. Zero downtime."*
4. Health gate passes → Slot B activates: *"Greenboot ran health scripts, passed, Slot B is now active."*
5. Click **Inject fault**, then **Push OTA update** again
6. Watch health gate fail → rollback: *"Health scripts failed. Rolled back to Slot A automatically. No recall. No manual intervention."*

### Tab 5 — Feature-on-Demand (1 min)
1. Click **Start Scenario**, then **Trigger QM update**
2. Watch QM briefly go down and come back at v2.0.0. ASIL-B uptime keeps incrementing.
*"QM features update independently of the safety OS. The car gets new features over the air. That's your post-sale revenue model."*

### Close (30 s)
*"Everything you saw — kernel-enforced isolation, deterministic orchestration, atomic OTA with automatic rollback, per-container feature updates — ships in RHIVOS today. AutoSD is the open-source upstream where all of it is built. You can run it on a Raspberry Pi 4 or a Qualcomm SA8775 this afternoon."*

---

## Runs entirely locally

No cloud account, no hardware, no internet connection required after `git clone`. The demo runs inside a Podman VM on your laptop.

To share remotely: `ngrok http 5173` gives a public URL in one command.

---

## What's next — three phases

### Phase 1 — Laptop demo ✅ (this repo)
Podman containers on macOS. Real cgroups, real kernel isolation, real port mappings. All concepts demonstrated with live data.

### Phase 2 — Real hardware
Same stack on actual automotive-grade boards.

| What | Why |
|---|---|
| Flash AutoSD | Real RHIVOS kernel, real PREEMPT_RT scheduling |
| Real BlueChi | `bluechi-controller` + `bluechi-agent` systemd units instead of Python controller |
| Real cgroup hierarchy | `cpu.min` / `cpu.max` rather than `--cpus` flag |
| Hardware watchdog | ASIL-B requirement: hw watchdog triggers safe state if kernel hangs |
| SELinux policies | Container security enforcement beyond just resource limits |

**Boards with published AutoSD images** ([autosd.redhat.com](https://autosd.redhat.com)):

| Vendor | Board | Use case |
|---|---|---|
| **Raspberry Pi** | Pi 4 | Easiest entry point, SD card flash |
| **NXP** | S32G-VNP-RDB3 (S32G274A) | Automotive networking, gateway ECU |
| **Qualcomm** | SA8775P / SA8650P | ADAS + cockpit compute |
| **Renesas** | R-Car S4 | ADAS, instrument cluster, zone controller |
| **Texas Instruments** | SK-AM62x Sitara | Low-power body / gateway |
| **Texas Instruments** | TDA4 EVM | Production ADAS domain controller |
| **Virtual** | QEMU, AWS, Azure | Cloud CI / no-hardware development |

### Phase 3 — Car to cloud (OpenShift)

```
OpenShift (cloud)  ──OTA push via Quay.io──►  RHIVOS vehicle (AutoSD board)
     │                                              │
     │  ArgoCD / Tekton pipeline                   │  rpm-ostree pull
     │  triggers image build + push                │  dual-slot swap
     │                                              │  Greenboot health check
     ▼                                              ▼
ACM fleet view                              automatic rollback if failed
(all vehicles, OS version, update status)
```

Shows: *"How does a car get a software update the same way a Kubernetes workload does?"*

---



*Part of a series. See also: [automotive-linux-simulations](https://github.com/Abhiananth/automotive-linux-simulations)*
