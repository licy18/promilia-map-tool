param(
    [string]$Url = ''
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 8766

try {
    $listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
        Where-Object { $_.State -eq 'Listen' } |
        Select-Object -First 1
    if ($listener) {
        exit 0
    }
} catch {
    # Continue and try to start the control service.
}

$runtimeDir = Join-Path $projectRoot 'overlay\runtime'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

$stdoutPath = Join-Path $runtimeDir 'control.log'
$stderrPath = Join-Path $runtimeDir 'control.err.log'

Start-Process `
    -FilePath 'python' `
    -ArgumentList @('tracker.py', '--control-only') `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath |
    Out-Null
