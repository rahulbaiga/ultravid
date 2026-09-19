#!/bin/bash
# UltraVid launcher - serves on 0.0.0.0:8000
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null || true
./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
