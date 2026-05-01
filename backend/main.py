"""
RHIVOS Demo — FastAPI backend
WebSocket hub + REST endpoints for all three scenarios.
"""
import asyncio
import json
import sys
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# add backend dir to path so scenarios can import podman_client
sys.path.insert(0, os.path.dirname(__file__))

from scenarios import mixed_criticality, bluechi, ota

app = FastAPI(title="RHIVOS Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── WebSocket connection manager ──────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket):
        self._connections.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self._connections:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.remove(ws)


manager = ConnectionManager()


async def broadcast(data: dict):
    await manager.broadcast(data)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        # send initial state on connect
        await ws.send_text(json.dumps({
            "type": "init",
            "scenario1": mixed_criticality.get_state(),
            "scenario2": bluechi.get_state(),
            "scenario3": ota.get_state(),
        }))
        while True:
            # just keep alive — all actions go through REST
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ── build images ──────────────────────────────────────────────────────────────

@app.post("/build")
async def build_all():
    """Build all container images. Run once before starting scenarios."""
    asyncio.create_task(_build_task())
    return {"status": "building"}


async def _build_task():
    await broadcast({"type": "build_start"})
    await mixed_criticality.build_images()
    # bluechi reuses same images; ota builds its own
    import podman_client as podman
    loop = asyncio.get_event_loop()
    podman.build_image("demo-ota:v1",
                       "/Users/abhi/projects/automotive-demo/containers/ota-v1")
    podman.build_image("demo-ota:v2",
                       "/Users/abhi/projects/automotive-demo/containers/ota-v2")
    await broadcast({"type": "build_complete"})


# ── Scenario 1 endpoints ──────────────────────────────────────────────────────

@app.post("/scenario1/start")
async def s1_start():
    asyncio.create_task(mixed_criticality.start(broadcast))
    return {"status": "starting"}

@app.post("/scenario1/stop")
async def s1_stop():
    asyncio.create_task(mixed_criticality.stop(broadcast))
    return {"status": "stopping"}

@app.post("/scenario1/storm/start")
async def s1_storm_start():
    asyncio.create_task(mixed_criticality.trigger_storm(broadcast))
    return {"status": "storm starting"}

@app.post("/scenario1/storm/stop")
async def s1_storm_stop():
    asyncio.create_task(mixed_criticality.stop_storm(broadcast))
    return {"status": "storm stopping"}

@app.get("/scenario1/state")
async def s1_state():
    return mixed_criticality.get_state()


# ── Scenario 2 endpoints ──────────────────────────────────────────────────────

@app.post("/scenario2/start")
async def s2_start():
    asyncio.create_task(bluechi.start(broadcast))
    return {"status": "starting"}

@app.post("/scenario2/stop")
async def s2_stop():
    asyncio.create_task(bluechi.stop(broadcast))
    return {"status": "stopping"}

@app.post("/scenario2/crash/{chip_id}")
async def s2_crash(chip_id: str):
    asyncio.create_task(bluechi.crash_container(chip_id, broadcast))
    return {"status": f"crashing {chip_id}"}

@app.post("/scenario2/recover/{chip_id}")
async def s2_recover(chip_id: str):
    asyncio.create_task(bluechi.recover_safe_state(chip_id, broadcast))
    return {"status": f"recovering {chip_id}"}

@app.get("/scenario2/state")
async def s2_state():
    return bluechi.get_state()


# ── Scenario 3 endpoints ──────────────────────────────────────────────────────

@app.post("/scenario3/start")
async def s3_start():
    asyncio.create_task(ota.start(broadcast))
    return {"status": "starting"}

@app.post("/scenario3/stop")
async def s3_stop():
    asyncio.create_task(ota.stop(broadcast))
    return {"status": "stopping"}

@app.post("/scenario3/update")
async def s3_update():
    asyncio.create_task(ota.push_update(broadcast))
    return {"status": "update starting"}

@app.post("/scenario3/fault")
async def s3_fault():
    asyncio.create_task(ota.stage_fault(broadcast))
    return {"status": "fault staged"}

@app.get("/scenario3/state")
async def s3_state():
    return ota.get_state()


# ── health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}
