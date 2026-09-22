"""Real-time Remote Client Observability & Telemetry Ingestion Router."""
import sys
import json
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Request

router = APIRouter(tags=["Telemetry"])

# ANSI Color codes for high-visibility terminal debugging
COLOR_RESET = "\033[0m"
COLOR_CYAN = "\033[96m"      # [CLIENT-LOG]
COLOR_MAGENTA = "\033[95m"   # [CLIENT-TOUCH]
COLOR_YELLOW = "\033[93m"    # [CLIENT-FETCH]
COLOR_GREEN = "\033[92m"     # [CLIENT-STATE]
COLOR_RED = "\033[91m"       # [CLIENT-ERROR]
COLOR_GRAY = "\033[90m"
COLOR_BOLD = "\033[1m"


def print_telemetry_entry(entry: Dict[str, Any]) -> None:
    tag = str(entry.get("tag", "LOG")).upper()
    level = str(entry.get("level", "info")).lower()
    msg = str(entry.get("message", ""))
    payload = entry.get("payload")
    ts = entry.get("timestamp")
    time_str = time.strftime("%H:%M:%S", time.localtime(ts)) if ts else time.strftime("%H:%M:%S")

    # Select color & banner
    if level == "error" or "ERROR" in tag:
        color = COLOR_RED
        banner = "[CLIENT-ERROR]"
    elif tag in ("PTR", "TOUCH", "GESTURE") or "TOUCH" in tag:
        color = COLOR_MAGENTA
        banner = "[CLIENT-TOUCH]"
    elif tag in ("FETCH", "NETWORK", "API") or "FETCH" in tag:
        color = COLOR_YELLOW
        banner = "[CLIENT-FETCH]"
    elif tag in ("STATE", "MUTATION", "REFRESH", "DOM") or "STATE" in tag:
        color = COLOR_GREEN
        banner = "[CLIENT-STATE]"
    else:
        color = COLOR_CYAN
        banner = f"[CLIENT-{tag}]" if tag else "[CLIENT-LOG]"

    payload_str = ""
    if payload is not None:
        try:
            if isinstance(payload, (dict, list)):
                payload_str = f" {COLOR_GRAY}{json.dumps(payload, default=str)}{COLOR_RESET}"
            else:
                payload_str = f" {COLOR_GRAY}{payload}{COLOR_RESET}"
        except Exception:
            payload_str = f" {COLOR_GRAY}{str(payload)}{COLOR_RESET}"

    out_line = f"{color}{COLOR_BOLD}{banner}{COLOR_RESET} {COLOR_GRAY}{time_str}{COLOR_RESET} {color}[{tag}]{COLOR_RESET} {msg}{payload_str}"
    sys.stdout.write(out_line + "\n")
    sys.stdout.flush()


@router.post("/telemetry")
async def ingest_telemetry(request: Request):
    """Ingest remote client telemetry and print to STDOUT with zero latency."""
    try:
        body = await request.json()
        if isinstance(body, list):
            for item in body:
                if isinstance(item, dict):
                    print_telemetry_entry(item)
        elif isinstance(body, dict):
            if "events" in body and isinstance(body["events"], list):
                for item in body["events"]:
                    if isinstance(item, dict):
                        print_telemetry_entry(item)
            else:
                print_telemetry_entry(body)
    except Exception:
        pass
    return {"ok": True}
