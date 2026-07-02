$ErrorActionPreference = 'Stop'

$protocol = 'azpr-overlay-control'
$scriptPath = Join-Path $PSScriptRoot 'start-overlay-control-protocol.ps1'
$protocolKey = "HKCU:\Software\Classes\$protocol"
$commandKey = Join-Path $protocolKey 'shell\open\command'
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '" "%1"'

New-Item -Path $protocolKey -Force | Out-Null
Set-Item -Path $protocolKey -Value 'URL:Azur Promilia Overlay Control'
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null

New-Item -Path $commandKey -Force | Out-Null
Set-Item -Path $commandKey -Value $command

Write-Host "Registered $protocol for $scriptPath"
