#requires -Version 5.1
<#
.SYNOPSIS
    Tasket++ Runtime Launcher
.DESCRIPTION
    Unified runtime launcher for the Tasket++ ecosystem.
    Starts/stops/manages the HTTP daemon, workflow editor server,
    and shows status of all components.
.PARAMETER Action
    Action to perform: start, stop, restart, status, daemon, workflows, logs
.PARAMETER Port
    Override the daemon port (default reads from .tasketconfig.json)
.PARAMETER ApiKey
    Set API key for daemon authentication
.PARAMETER WorkflowPort
    Port for the workflow editor web server (default: 3000)
.PARAMETER NoWorkflows
    Do not start the workflow editor
.PARAMETER NoDaemon
    Do not start the HTTP daemon
.PARAMETER DaemonOnly
    Start only the HTTP daemon (headless mode)
.PARAMETER Help
    Show detailed help
.EXAMPLE
    .\run.ps1                    # Start everything
    .\run.ps1 start              # Start everything
    .\run.ps1 daemon             # Start only daemon
    .\run.ps1 stop               # Stop all services
    .\run.ps1 status             # Show status
    .\run.ps1 logs               # Show daemon logs
    .\run.ps1 restart            # Restart all
    .\run.ps1 -DaemonOnly -Port 8080 -ApiKey "MyKey"
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "restart", "status", "daemon", "workflows", "logs", "")]
    [string]$Action = "",
    [int]$Port = 0,
    [string]$ApiKey = "",
    [int]$WorkflowPort = 3000,
    [switch]$NoWorkflows,
    [switch]$NoDaemon,
    [switch]$DaemonOnly,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = Join-Path $RepoRoot ".tasketconfig.json"
$PidFile = Join-Path $RepoRoot ".tasketpids.json"

# ============================================================================
# Load Config
# ============================================================================
$Config = @{ port = 7777; bind = "0.0.0.0"; tasksDir = "$RepoRoot\daemon\saved_tasks"; daemonExe = "$RepoRoot\daemon\build\tasket-httpd.exe" }

if (Test-Path $ConfigFile) {
    try {
        $loaded = Get-Content $ConfigFile -Raw | ConvertFrom-Json
        if ($loaded.port) { $Config.port = $loaded.port }
        if ($loaded.bind) { $Config.bind = $loaded.bind }
        if ($loaded.tasksDir) { $Config.tasksDir = $loaded.tasksDir }
        if ($loaded.daemonExe) { $Config.daemonExe = $loaded.daemonExe }
    } catch {}
}

if ($Port -gt 0) { $Config.port = $Port }
$daemonPort = $Config.port

# ============================================================================
# Help
# ============================================================================
if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Full
    exit 0
}

# ============================================================================
# Visual Helpers
# ============================================================================
function Write-Banner() {
    Write-Host @"
============================================================
   ___      _     _   _     ____
  / _ \__ _| |_  | |_| |__ |___ \ _   _ ___
 | | | / _' | __| | __| '_ \  __) | | | / __|
 | |_| | (_| | |_  | |_| | | |/ __/| |_| \__ \
  \___/ \__,_|\__|  \__|_| |_|_____|\__, |___/
                                    |___/
============================================================
"@ -ForegroundColor Cyan
}

function Write-Section($title) {
    Write-Host "`n  --- $title ---" -ForegroundColor Yellow
}

function Write-StatusLine($name, $status, $detail = "") {
    $color = switch ($status) {
        "RUNNING"   { "Green" }
        "STOPPED"   { "DarkGray" }
        "ERROR"     { "Red" }
        "READY"     { "Cyan" }
        default     { "White" }
    }
    $pad = " " * (20 - $name.Length)
    Write-Host "    $name$pad" -NoNewline
    Write-Host "[$status]" -ForegroundColor $color -NoNewline
    if ($detail) { Write-Host " $detail" -ForegroundColor DarkGray }
    else { Write-Host "" }
}

# ============================================================================
# PID Management
# ============================================================================
function Load-Pids() {
    if (Test-Path $PidFile) {
        try { return Get-Content $PidFile -Raw | ConvertFrom-Json } catch { return @{} }
    }
    return @{}
}

function Save-Pids($pids) {
    $pids | ConvertTo-Json | Set-Content $PidFile -Encoding UTF8
}

function Clear-Pids() {
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
}

# ============================================================================
# Status Command
# ============================================================================
function Show-Status() {
    Write-Banner
    Write-Host "  RUNTIME STATUS" -ForegroundColor White
    Write-Host "  " + ("=" * 56)

    $pids = Load-Pids

    # Daemon status
    $daemonRunning = $false
    if ($pids.daemon -and (Get-Process -Id $pids.daemon -ErrorAction SilentlyContinue)) {
        $daemonRunning = $true
    }
    # Also check by port
    if (-not $daemonRunning) {
        try {
            $tcp = Get-NetTCPConnection -LocalPort $daemonPort -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
            if ($tcp) { $daemonRunning = $true }
        } catch {}
    }
    Write-StatusLine "HTTP Daemon" ($daemonRunning ? "RUNNING" : "STOPPED") "port=$daemonPort"

    # Workflow server status
    $wfRunning = $false
    if ($pids.workflows -and (Get-Process -Id $pids.workflows -ErrorAction SilentlyContinue)) {
        $wfRunning = $true
    }
    try {
        $tcp2 = Get-NetTCPConnection -LocalPort $WorkflowPort -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        if ($tcp2) { $wfRunning = $true }
    } catch {}
    Write-StatusLine "Workflow Editor" ($wfRunning ? "RUNNING" : "STOPPED") "port=$WorkflowPort"

    # Config
    Write-Section "Configuration"
    Write-Host "    Port:        $daemonPort" -ForegroundColor DarkGray
    Write-Host "    Bind:        $($Config.bind)" -ForegroundColor DarkGray
    Write-Host "    Tasks Dir:   $($Config.tasksDir)" -ForegroundColor DarkGray
    Write-Host "    Daemon Exe:  $($Config.daemonExe)" -ForegroundColor DarkGray
    Write-Host "    API Key:     $(if ($ApiKey) { "(set)" } else { "(none)" })" -ForegroundColor DarkGray

    # Endpoints
    Write-Section "Quick Commands"
    Write-Host "    List tasks:   curl http://localhost:$daemonPort/tasks" -ForegroundColor DarkGray
    Write-Host "    Run task:     curl 'http://localhost:$daemonPort/run?task=HelloWorld'" -ForegroundColor DarkGray
    Write-Host "    Check task:   curl 'http://localhost:$daemonPort/check?id=1'" -ForegroundColor DarkGray
    Write-Host "    Workflows:    http://localhost:$WorkflowPort" -ForegroundColor DarkGray
    Write-Host ""
}

# ============================================================================
# Start Daemon
# ============================================================================
function Start-Daemon() {
    if (-not (Test-Path $Config.daemonExe)) {
        Write-Host "  Daemon not found. Run install.ps1 first." -ForegroundColor Red
        return $false
    }

    # Check if already running
    $pids = Load-Pids
    if ($pids.daemon -and (Get-Process -Id $pids.daemon -ErrorAction SilentlyContinue)) {
        Write-Host "  Daemon already running (PID: $($pids.daemon))" -ForegroundColor Green
        return $true
    }

    # Kill any existing process on the port
    try {
        $existing = Get-NetTCPConnection -LocalPort $daemonPort -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
        if ($existing) {
            $proc = Get-Process -Id $existing.OwningProcess -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -eq "tasket-httpd") {
                Write-Host "  Stopping old daemon instance..."
                $proc | Stop-Process -Force
                Start-Sleep -Seconds 1
            }
        }
    } catch {}

    $tasksDir = $Config.tasksDir
    if (-not (Test-Path $tasksDir)) {
        New-Item -ItemType Directory -Path $tasksDir -Force | Out-Null
    }

    $args = @("-p", $daemonPort, "-b", $Config.bind, "-d", $tasksDir)
    if ($ApiKey) { $args += @("-k", $ApiKey) }

    Write-Host "  Starting daemon: $($Config.daemonExe) $args" -ForegroundColor DarkGray

    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $Config.daemonExe
    $pinfo.Arguments = $args -join " "
    $pinfo.WorkingDirectory = $RepoRoot
    $pinfo.UseShellExecute = $false
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::Start($pinfo)
    Start-Sleep -Milliseconds 500

    if ($process -and -not $process.HasExited) {
        $pids = Load-Pids
        $pids.daemon = $process.Id
        Save-Pids $pids
        Write-Host "  Daemon started (PID: $($process.Id))" -ForegroundColor Green

        # Show first output lines
        Start-Sleep -Seconds 1
        $stdout = $process.StandardOutput.ReadToEnd()
        if ($stdout) {
            $stdout.Split("`n") | Select-Object -First 8 | ForEach-Object {
                if ($_.Trim()) { Write-Host "    $_" -ForegroundColor DarkGray }
            }
        }
        return $true
    } else {
        Write-Host "  Daemon failed to start!" -ForegroundColor Red
        return $false
    }
}

# ============================================================================
# Start Workflows
# ============================================================================
function Start-Workflows() {
    $wfDir = Join-Path $RepoRoot "workflows"
    $distDir = Join-Path $wfDir "dist"

    if (-not (Test-Path "$distDir\index.html")) {
        Write-Host "  Workflow editor not built. Run install.ps1 first." -ForegroundColor Red
        return $false
    }

    # Check if already running
    $pids = Load-Pids
    if ($pids.workflows -and (Get-Process -Id $pids.workflows -ErrorAction SilentlyContinue)) {
        Write-Host "  Workflow editor already running (PID: $($pids.workflows))" -ForegroundColor Green
        return $true
    }

    # Use bun or npx serve
    if (Get-Command "bun" -ErrorAction SilentlyContinue) {
        $pinfo = New-Object System.Diagnostics.ProcessStartInfo
        $pinfo.FileName = "bun"
        $pinfo.Arguments = "run serve $distDir -p $WorkflowPort"
        $pinfo.WorkingDirectory = $wfDir
        $pinfo.UseShellExecute = $false
        $pinfo.RedirectStandardOutput = $true
        $pinfo.RedirectStandardError = $true

        $process = [System.Diagnostics.Process]::Start($pinfo)
    } else {
        # Fallback: use npx serve
        $pinfo = New-Object System.Diagnostics.ProcessStartInfo
        $pinfo.FileName = "npx"
        $pinfo.Arguments = "serve -l $WorkflowPort -s $distDir"
        $pinfo.WorkingDirectory = $wfDir
        $pinfo.UseShellExecute = $false
        $pinfo.RedirectStandardOutput = $true
        $pinfo.RedirectStandardError = $true

        $process = [System.Diagnostics.Process]::Start($pinfo)
    }

    Start-Sleep -Seconds 2
    if ($process -and -not $process.HasExited) {
        $pids = Load-Pids
        $pids.workflows = $process.Id
        Save-Pids $pids
        Write-Host "  Workflow editor started (PID: $($process.Id))" -ForegroundColor Green
        Write-Host "  Open: http://localhost:$WorkflowPort" -ForegroundColor Cyan
        return $true
    } else {
        Write-Host "  Workflow editor failed to start!" -ForegroundColor Red
        return $false
    }
}

# ============================================================================
# Stop Services
# ============================================================================
function Stop-All() {
    Write-Host "`n  Stopping all services..." -ForegroundColor Yellow
    $pids = Load-Pids

    if ($pids.daemon) {
        $proc = Get-Process -Id $pids.daemon -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Stopping daemon (PID: $($pids.daemon))..." -ForegroundColor DarkGray
            $proc | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }

    if ($pids.workflows) {
        $proc = Get-Process -Id $pids.workflows -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Stopping workflow editor (PID: $($pids.workflows))..." -ForegroundColor DarkGray
            $proc | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    }

    # Also kill any orphan tasket-httpd processes
    Get-Process -Name "tasket-httpd" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "  Stopping orphan daemon (PID: $($_.Id))..." -ForegroundColor DarkGray
        $_ | Stop-Process -Force -ErrorAction SilentlyContinue
    }

    Clear-Pids
    Write-Host "  All services stopped." -ForegroundColor Green
}

# ============================================================================
# Show Logs
# ============================================================================
function Show-Logs() {
    $pids = Load-Pids
    if (-not $pids.daemon) {
        Write-Host "  No daemon running. Start with .\run.ps1 start" -ForegroundColor Yellow
        return
    }
    Write-Host "  Tailing daemon output (Ctrl+C to exit)..." -ForegroundColor DarkGray
    $proc = Get-Process -Id $pids.daemon -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "  PID: $($proc.Id), CPU: $($proc.CPU), Memory: $([math]::Round($proc.WorkingSet64 / 1MB, 1)) MB" -ForegroundColor DarkGray
    }
}

# ============================================================================
# Main Dispatch
# ============================================================================
Write-Banner

switch ($Action) {
    "status"  { Show-Status; exit 0 }
    "logs"    { Show-Logs; exit 0 }
    "stop"    { Stop-All; exit 0 }
    "restart" { Stop-All; Start-Sleep 2; $Action = "start" }
    ""        { $Action = "start" }
}

# Start services
if ($Action -in @("start", "daemon")) {
    if (-not $NoDaemon) {
        Write-Section "Starting HTTP Daemon"
        $ok = Start-Daemon
        if (-not $ok -and $DaemonOnly) { exit 1 }
    }

    if ($DaemonOnly) { exit 0 }

    if (-not $NoWorkflows -and $Action -eq "start") {
        Write-Section "Starting Workflow Editor"
        Start-Workflows | Out-Null
    }
}

# Final status
Start-Sleep -Seconds 1
Show-Status

Write-Host "`n  Press Ctrl+C to stop, or run .\run.ps1 stop" -ForegroundColor DarkGray
Write-Host "  Monitor: .\run.ps1 logs" -ForegroundColor DarkGray

# Keep running and watch for Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 5
        $pids = Load-Pids
        if ($pids.daemon -and -not (Get-Process -Id $pids.daemon -ErrorAction SilentlyContinue)) {
            Write-Host "`n  [WARN] Daemon stopped unexpectedly!" -ForegroundColor Red
            break
        }
    }
} catch {
    # Ctrl+C pressed
    Write-Host "`n  Shutting down..." -ForegroundColor Yellow
    Stop-All
}
