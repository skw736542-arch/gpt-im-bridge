param([string]$Python = 'python', [switch]$SkipModelDownload)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
# NVIDIA CUDA 12.4 build. This is an isolated environment, not --system-site-packages.
& $Python -m venv .venv-qwen
if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed; use Python 3.10.' }
$qwenPython = Join-Path (Get-Location) '.venv-qwen/Scripts/python.exe'
& $qwenPython -m pip install 'torch==2.6.0' 'torchaudio==2.6.0' --index-url https://download.pytorch.org/whl/cu124
if ($LASTEXITCODE -ne 0) { throw 'CUDA PyTorch installation failed.' }
& $qwenPython -m pip install -r requirements-qwen.txt
if ($LASTEXITCODE -ne 0) { throw 'Qwen dependency installation failed.' }
& $qwenPython -c 'import torch; assert torch.cuda.is_available(), "CUDA GPU is unavailable"; print("CUDA runtime available")'
if ($LASTEXITCODE -ne 0) { throw 'A compatible NVIDIA driver and CUDA GPU are required.' }
if (-not $SkipModelDownload) {
    & $qwenPython scripts/download-local-tts.py
    if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }
}
Write-Output 'Setup complete. Start scripts/start-local-tts.ps1, audition, then enable explicitly. No setting was changed.'
