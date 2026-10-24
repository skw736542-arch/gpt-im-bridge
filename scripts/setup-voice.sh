#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-voice.txt
printf '%s' '{"action":"download"}' | .venv/bin/python scripts/voice-engine.py
