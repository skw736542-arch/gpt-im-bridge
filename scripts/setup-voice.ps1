$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot/..
python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed' }
& ./.venv/Scripts/python.exe -m pip install -r requirements-voice.txt
if ($LASTEXITCODE -ne 0) { throw 'Voice dependencies installation failed' }
'{"action":"download"}' | & ./.venv/Scripts/python.exe scripts/voice-engine.py
if ($LASTEXITCODE -ne 0) { throw 'Speech recognition model download failed' }
