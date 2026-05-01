"""
Podman client — thin wrapper around the podman CLI.
Uses subprocess so we don't need the podman-py SDK.
"""
import subprocess
import json
import shlex
from typing import Optional


def _run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, capture_output=True, text=True, check=check
    )


def build_image(tag: str, context_dir: str) -> bool:
    r = _run(["podman", "build", "-t", tag, context_dir], check=False)
    return r.returncode == 0


def run_container(
    name: str,
    image: str,
    env: Optional[dict] = None,
    cpuset_cpus: Optional[str] = None,
    cpus: Optional[float] = None,
    port: Optional[int] = None,
    host_port: Optional[int] = None,
    detach: bool = True,
) -> bool:
    cmd = ["podman", "run", "--name", name, "--rm"]
    if detach:
        cmd.append("-d")
    if env:
        for k, v in env.items():
            cmd += ["-e", f"{k}={v}"]
    if cpuset_cpus is not None:
        cmd += ["--cpuset-cpus", cpuset_cpus]
    if cpus is not None:
        cmd += ["--cpus", str(cpus)]
    if port and host_port:
        cmd += ["-p", f"{host_port}:{port}"]
    cmd.append(image)
    r = _run(cmd, check=False)
    return r.returncode == 0


def stop_container(name: str) -> bool:
    r = _run(["podman", "stop", name], check=False)
    return r.returncode == 0


def kill_container(name: str) -> bool:
    r = _run(["podman", "kill", name], check=False)
    return r.returncode == 0


def container_exists(name: str) -> bool:
    r = _run(["podman", "ps", "-a", "--format", "json"], check=False)
    if r.returncode != 0:
        return False
    containers = json.loads(r.stdout or "[]")
    for c in containers:
        names = c.get("Names", [])
        if name in names or f"/{name}" in names:
            return True
    return False


def container_running(name: str) -> bool:
    r = _run(["podman", "ps", "--format", "json"], check=False)
    if r.returncode != 0:
        return False
    containers = json.loads(r.stdout or "[]")
    for c in containers:
        names = c.get("Names", [])
        if name in names or f"/{name}" in names:
            return True
    return False


def get_container_stats(name: str) -> Optional[dict]:
    r = _run(["podman", "stats", "--no-stream", "--format", "json", name], check=False)
    if r.returncode != 0:
        return None
    try:
        stats = json.loads(r.stdout)
        if stats:
            return stats[0]
    except (json.JSONDecodeError, IndexError):
        pass
    return None


def pull_image(image: str) -> bool:
    r = _run(["podman", "pull", image], check=False)
    return r.returncode == 0


def image_exists(tag: str) -> bool:
    r = _run(["podman", "image", "exists", tag], check=False)
    return r.returncode == 0


def remove_container(name: str) -> bool:
    r = _run(["podman", "rm", "-f", name], check=False)
    return r.returncode == 0


def cleanup(*names: str):
    for name in names:
        remove_container(name)
