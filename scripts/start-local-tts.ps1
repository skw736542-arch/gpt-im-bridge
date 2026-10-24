$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$python = Join-Path $project '.venv-qwen/Scripts/python.exe'
$dataDir = Join-Path $project 'data/local-tts'
if (-not (Test-Path $python)) { throw 'Install the Qwen virtual environment first.' }
if (-not (Test-Path (Join-Path $dataDir 'model-ms/model.safetensors'))) { throw 'Download the model first.' }
$listener = Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction SilentlyContinue
if ($listener) { throw 'Port 8790 is already in use. Do not start a duplicate worker.' }
$worker = Start-Process -FilePath $python -ArgumentList 'scripts/local-tts-server.py' -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDir 'worker.out.log') -RedirectStandardError (Join-Path $dataDir 'worker.err.log') -PassThru
Set-Content (Join-Path $dataDir 'worker.pid') $worker.Id
Write-Output 'Worker starting. Check data/local-tts/worker.out.log for LOCAL_TTS_READY.'
