# Second Brain agent installer for Windows. No admin needed.
# The You page in your dashboard gives you the one line that runs this, with your pairing code.
#   1. Installs Node.js (free) with winget if it's missing
#   2. Downloads the agent to %LOCALAPPDATA%\SecondBrainAgent
#   3. Pairs it with your dashboard
#   4. Starts it now, and on every login (hidden, from your Startup folder)
# Uninstall: delete %LOCALAPPDATA%\SecondBrainAgent and "SecondBrainAgent.vbs" in shell:startup.

$ErrorActionPreference = 'Stop'
if (-not $env:SB_PAIR -or -not $env:SB_APP) { throw 'Copy the full command from the You page in your dashboard.' }

$dir = Join-Path $env:LOCALAPPDATA 'SecondBrainAgent'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host 'Installing Node.js (free)...'
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements | Out-Null
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { throw 'Node.js did not install. Get it free from nodejs.org, then run this again.' }
}

# Stop an older copy before replacing it.
$pidFile = Join-Path $dir 'agent.pid'
if (Test-Path $pidFile) { Stop-Process -Id ([int](Get-Content $pidFile)) -Force -ErrorAction SilentlyContinue; Remove-Item $pidFile -Force }

$agent = Join-Path $dir 'second-brain-agent.mjs'
Invoke-WebRequest -UseBasicParsing -Uri "$($env:SB_APP.TrimEnd('/'))/agent/second-brain-agent.mjs" -OutFile $agent
& $node $agent pair $env:SB_PAIR
if ($LASTEXITCODE -ne 0) { throw 'Pairing failed. Make a new code on the You page and try again.' }

$vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'SecondBrainAgent.vbs'
Set-Content -Path $vbs -Encoding ASCII -Value "CreateObject(""WScript.Shell"").Run """"""$node"""" """"$agent"""" start"", 0, False"
Start-Process wscript.exe -ArgumentList "`"$vbs`""

Remove-Item Env:SB_PAIR
Write-Host ''
Write-Host 'Done. Your laptop is connected and the agent starts on every login.' -ForegroundColor Green
Write-Host 'Approve or say no to its suggestions on the Today page.'
