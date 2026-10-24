$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24.15 or newer first.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } }
node scripts/setup.mjs
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
$localVoiceSettings = Join-Path $PSScriptRoot 'data/local-tts/settings.json'
if (Test-Path -LiteralPath $localVoiceSettings) {
  $localVoice = Get-Content -LiteralPath $localVoiceSettings -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($localVoice.enabled -and -not (Get-NetTCPConnection -LocalPort 8790 -State Listen -ErrorAction SilentlyContinue)) {
    & (Join-Path $PSScriptRoot 'scripts/start-local-tts.ps1')
  }
}
Write-Host 'Open http://127.0.0.1:8787 and sign in using ADMIN_PASSWORD from .env.'
npm start
