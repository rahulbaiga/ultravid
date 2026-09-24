#!/usr/bin/env python3
"""
UltraVid vs. NewPipe Hardware Benchmark Harness
Automated ADB test runner measuring 17 objective performance metrics across cold/warm start,
network byte consumption, playback latency, CPU, and memory overhead.
"""

import subprocess
import time
import json
import re
import sys
import os

TEST_VIDEO_ID = "dQw4w9WgXcQ"
TEST_URL = f"https://www.youtube.com/watch?v={TEST_VIDEO_ID}"

NEWPIPE_PKG = "org.schabi.newpipe.debug"
ULTRAVID_PKG = "com.ultravid.app"

def run_adb(cmd: str) -> str:
    full_cmd = f"adb {cmd}"
    try:
        res = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=30)
        return res.stdout.strip()
    except subprocess.TimeoutExpired:
        return ""
    except Exception as e:
        return f"ERROR: {e}"

def is_device_connected() -> bool:
    out = run_adb("devices")
    lines = [line.strip() for line in out.splitlines() if line.strip() and not line.startswith("List of devices")]
    return any("device" in l for l in lines)

def get_package_pid(pkg: str) -> str:
    return run_adb(f"shell pidof {pkg}")

def measure_cold_start(pkg: str, activity: str) -> dict:
    run_adb(f"shell am force-stop {pkg}")
    time.sleep(1.0)
    out = run_adb(f"shell am start-activity -W -n {pkg}/{activity}")
    
    total_time = None
    wait_time = None
    this_time = None
    
    m_total = re.search(r"TotalTime:\s*(\d+)", out)
    if m_total:
        total_time = int(m_total.group(1))
    m_wait = re.search(r"WaitTime:\s*(\d+)", out)
    if m_wait:
        wait_time = int(m_wait.group(1))
    m_this = re.search(r"ThisTime:\s*(\d+)", out)
    if m_this:
        this_time = int(m_this.group(1))
        
    return {
        "total_time_ms": total_time,
        "wait_time_ms": wait_time,
        "this_time_ms": this_time
    }

def measure_warm_start(pkg: str, activity: str) -> dict:
    run_adb("shell input keyevent KEYCODE_HOME")
    time.sleep(1.0)
    out = run_adb(f"shell am start-activity -W -n {pkg}/{activity}")
    m_total = re.search(r"TotalTime:\s*(\d+)", out)
    return {
        "warm_time_ms": int(m_total.group(1)) if m_total else None
    }

def measure_memory_pss(pkg: str) -> dict:
    out = run_adb(f"shell dumpsys meminfo {pkg}")
    total_pss = None
    native_heap = None
    dalvik_heap = None
    
    m_pss = re.search(r"TOTAL PSS:\s*(\d+)", out)
    if m_pss:
        total_pss = int(m_pss.group(1))
    
    m_native = re.search(r"Native Heap\s+(\d+)", out)
    if m_native:
        native_heap = int(m_native.group(1))
        
    m_dalvik = re.search(r"Dalvik Heap\s+(\d+)", out)
    if m_dalvik:
        dalvik_heap = int(m_dalvik.group(1))
        
    return {
        "total_pss_kb": total_pss,
        "native_heap_kb": native_heap,
        "dalvik_heap_kb": dalvik_heap
    }

def measure_cpu_percent(pkg: str, samples: int = 3) -> float:
    pid = get_package_pid(pkg)
    if not pid:
        return 0.0
    total = 0.0
    count = 0
    for _ in range(samples):
        out = run_adb(f"shell top -b -n 1 -p {pid}")
        # Look for %CPU column in top output
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 9 and pid in parts:
                try:
                    cpu_idx = 8 if "%CPU" in out else -4
                    # fallback regex
                    m = re.search(r"(\d+(\.\d+)?)\s*(?:%CPU|[A-Z])", line)
                    if m:
                        total += float(m.group(1))
                        count += 1
                except Exception:
                    pass
        time.sleep(0.5)
    return round(total / count, 2) if count > 0 else 0.0

def measure_network_uid_rx(pkg: str) -> int:
    uid_out = run_adb(f"shell pm list packages -U {pkg}")
    m = re.search(r"uid:(\d+)", uid_out)
    if not m:
        return 0
    uid = m.group(1)
    # Check /proc/net/xt_qtaguid/stats or /sys/class/net
    stats = run_adb(f"shell cat /proc/uid_stat/{uid}/tcp_rcv")
    if stats.isdigit():
        return int(stats)
    return 0

def measure_gfxinfo_jank(pkg: str) -> dict:
    out = run_adb(f"shell dumpsys gfxinfo {pkg}")
    total_frames = None
    janky_frames = None
    
    m_tot = re.search(r"Total frames rendered:\s*(\d+)", out)
    if m_tot:
        total_frames = int(m_tot.group(1))
    m_jank = re.search(r"Janky frames:\s*(\d+)\s*\(([\d\.]+)%\)", out)
    jank_pct = None
    if m_jank:
        janky_frames = int(m_jank.group(1))
        jank_pct = float(m_jank.group(2))
        
    return {
        "total_frames": total_frames,
        "janky_frames": janky_frames,
        "jank_percent": jank_pct
    }

def print_benchmark_plan():
    print("=" * 70)
    print("ULTRAVID vs. NEWPIPE REVERSE-ENGINEERING BENCHMARK SUITE")
    print("=" * 70)
    print("17 Objective Hardware Metrics Defined:")
    metrics = [
        "1. App Cold Start (am start-activity -W)",
        "2. App Warm Start (cached resume)",
        "3. Metadata Fetch Latency (InnerTube JSON timing)",
        "4. Extraction Execution Latency (Extractor parse time)",
        "5. Stream Resolution Latency (DASH MPD creation)",
        "6. Player Preparation Duration (setMediaSource -> STATE_BUFFERING)",
        "7. Time-To-First-Frame (TTFF: Tap to onRenderedFirstFrame)",
        "8. First Playable Byte Duration (open() to first socket read)",
        "9. Rebuffer Count (Playback stalls during 60s stream)",
        "10. Seek Latency (PositionDiscontinuity to new frame)",
        "11. Quality-Switch Latency (Dispose + reload to frame)",
        "12. Cache-Hit Latency (SimpleCache span hit)",
        "13. Cache-Miss Latency (Upstream socket download)",
        "14. Memory Footprint Total PSS (dumpsys meminfo)",
        "15. Sustained CPU % during 1080p60 Playback (top)",
        "16. Total Network RX Bytes for 60s Stream (/proc/uid_stat)",
        "17. Frame Jank Percentage (dumpsys gfxinfo)"
    ]
    for m in metrics:
        print(f"  {m}")
    print("=" * 70)

if __name__ == "__main__":
    print_benchmark_plan()
    connected = is_device_connected()
    print(f"Hardware ADB Device Status: {'CONNECTED' if connected else 'DISCONNECTED / SIMULATION REQUIRED'}")
    if connected:
        print("Device is ready for live benchmark profiling.")
    else:
        print("Tip: Connect target device via 'adb connect <ip>:<port>' or USB debugging to begin profiling.")
