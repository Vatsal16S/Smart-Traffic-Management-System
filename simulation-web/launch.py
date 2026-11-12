"""
launch.py — One-click launcher for Smart Traffic Management System.
Automatically frees ports 8000 & 8080, launches backend & frontend,
waits for health checks, opens browser, and cleanly shuts down on Ctrl+C.
"""

import sys
import os
import time
import signal
import subprocess
import urllib.request
import webbrowser
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"

def free_ports(ports=(8000, 8080)):
    """Terminate any stale processes occupying target ports."""
    ports_str = ", ".join(str(p) for p in ports)
    cmd = (
        f'powershell -NoProfile -Command "'
        f'Get-NetTCPConnection -LocalPort {ports_str} -ErrorAction SilentlyContinue | '
        f'ForEach-Object {{ try {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }} catch {{}} }}"'
    )
    try:
        subprocess.run(cmd, shell=True, capture_output=True, timeout=5)
    except Exception:
        pass

def wait_for_service(url, timeout=15):
    """Wait until an HTTP endpoint returns a 200 status."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.3)
    return False

def main():
    print("=" * 60)
    print("   Smart Traffic Management System — Capstone Simulation")
    print("=" * 60)
    
    print("\n[1/4] Checking and freeing ports 8000 & 8080...")
    free_ports()
    time.sleep(0.5)

    print("[2/4] Starting YOLO Backend on port 8000...")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"],
        cwd=str(BACKEND_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    print("[3/4] Starting Frontend No-Cache Server on port 8080...")
    frontend_proc = subprocess.Popen(
        [sys.executable, "serve.py"],
        cwd=str(BASE_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    print("[4/4] Verifying services health...")
    backend_ok = wait_for_service("http://localhost:8000/", timeout=12)
    frontend_ok = wait_for_service("http://localhost:8080/", timeout=12)

    if backend_ok and frontend_ok:
        print("\n" + "=" * 60)
        print("   STATUS: ALL SERVICES ONLINE & HEALTHY!")
        print("   Dashboard:  http://localhost:8080")
        print("   YOLO API:   http://localhost:8000")
        print("=" * 60)
        print("\nOpening web browser...")
        webbrowser.open("http://localhost:8080")
    else:
        print(f"\nWarning: Healthcheck status — Backend: {backend_ok}, Frontend: {frontend_ok}")
        webbrowser.open("http://localhost:8080")

    print("\nSimulation is actively running.")
    print("Press Ctrl+C at any time to cleanly stop all servers.\n")

    def cleanup(signum=None, frame=None):
        print("\nStopping services...")
        backend_proc.terminate()
        frontend_proc.terminate()
        time.sleep(0.5)
        free_ports()
        print("All servers stopped successfully. Goodbye!")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    try:
        while True:
            time.sleep(1)
            # Monitor if any subprocess unexpectedly exited
            if backend_proc.poll() is not None:
                print("Notice: Backend process stopped.")
                break
            if frontend_proc.poll() is not None:
                print("Notice: Frontend process stopped.")
                break
    except KeyboardInterrupt:
        cleanup()

if __name__ == "__main__":
    main()
