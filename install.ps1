#requires -RunAsAdministrator
<#
.SYNOPSIS
    Tasket++ Ecosystem Installer
.DESCRIPTION
    One-click installer for the complete Tasket++ automation platform.
    Builds the C++ daemon, installs the workflow editor, and configures
    the PI agent extension.
.PARAMETER QtPath
    Path to Qt installation (e.g., C:\Qt\6.8.0\mingw_64)
.PARAMETER TasketppRoot
    Path to upstream Tasket++ source (will clone if not found)
.PARAMETER Port
    HTTP daemon port (default: 7777)
.PARAMETER SkipDaemon
    Skip C++ daemon build (if already built)
.PARAMETER SkipWorkflows
    Skip workflow editor build
.PARAMETER SkipPiExtension
    Skip PI agent extension install
.EXAMPLE
    .\install.ps1 -QtPath "C:\Qt\6.8.0\mingw_64"
.EXAMPLE
    .\install.ps1 -QtPath "C:\Qt\6.8.0\mingw_64" -Port 8080
#>
param(
    [string]$QtPath = "",
    [string]$TasketppRoot = "",
    [int]$Port = 7777,
    [switch]$SkipDaemon,
    [switch]$SkipWorkflows,
    [switch]$SkipPiExtension
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ============================================================================
# Banner
# ============================================================================
Write-Host @"
============================================================
   ___      _     _   _     ____
  / _ \__ _| |_  | |_| |__ |___ \ _   _ ___
 | | | / _' | __| | __| '_ \  __) | | | / __|
 | |_| | (_| | |_  | |_| | | |/ __/| |_| \__ \
  \___/ \__,_|\__|  \__|_| |_|_____|\__, |___/
                                    |___/
============================================================
   Complete Ecosystem Installer for Windows
   Daemon + Workflow Editor + PI Agent Extension
============================================================
"@ -ForegroundColor Cyan

# ============================================================================
# Helper Functions
# ============================================================================
function Test-Command($cmd) {
    return [bool](Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Write-Step($msg) {
    Write-Host "`n[STEP] $msg" -ForegroundColor Yellow
}

function Write-Ok($msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  [WARN] $msg" -ForegroundColor DarkYellow
}

function Write-Err($msg) {
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
}

function Exit-WithError($msg) {
    Write-Err $msg
    Write-Host "`nInstallation failed. See errors above." -ForegroundColor Red
    exit 1
}

# ============================================================================
# Phase 0: Detect Qt
# ============================================================================
Write-Step "Detecting Qt installation"

if ($QtPath -and (Test-Path "$QtPath\bin\qmake.exe")) {
    Write-Ok "Qt found at $QtPath"
} elseif (Test-Path "$env:QT_DIR\bin\qmake.exe") {
    $QtPath = $env:QT_DIR
    Write-Ok "Qt found via QT_DIR: $QtPath"
} else {
    # Auto-detect common locations
    $candidates = @(
        "C:\Qt\6.8.2\mingw_64",
        "C:\Qt\6.8.1\mingw_64",
        "C:\Qt\6.8.0\mingw_64",
        "C:\Qt\6.7.3\mingw_64",
        "C:\Qt\6.7.2\mingw_64",
        "C:\Qt\6.6.3\mingw_64",
        "C:\Qt\6.5.3\mingw_64",
        "C:\Qt\6.8.2\msvc2019_64",
        "C:\Qt\6.8.1\msvc2019_64",
        "C:\Qt\6.8.0\msvc2019_64"
    )
    $found = $false
    foreach ($c in $candidates) {
        if (Test-Path "$c\bin\qmake.exe") {
            $QtPath = $c
            Write-Ok "Qt auto-detected at $QtPath"
            $found = $true
            break
        }
    }
    if (-not $found) {
        Exit-WithError "Qt not found. Install Qt 6.x from https://www.qt.io/download or specify -QtPath"
    }
}

$env:PATH = "$QtPath\bin;$env:PATH"

# Detect compiler
$isMsvc = $QtPath -match "msvc"
$isMingw = $QtPath -match "mingw"

if ($isMingw -and -not (Test-Command "g++")) {
    $env:PATH = "$QtPath\bin;$env:PATH"
}

# ============================================================================
# Phase 1: Prerequisites
# ============================================================================
Write-Step "Checking prerequisites"

# CMake
if (-not (Test-Command "cmake")) {
    Write-Warn "CMake not found. Attempting to install via winget..."
    winget install -e --id Kitware.CMake --accept-source-agreements --accept-package-agreements 2>$null
    if (-not (Test-Command "cmake")) {
        Exit-WithError "CMake installation failed. Download from https://cmake.org/download/"
    }
}
$cmakeVersion = (cmake --version)[0]
Write-Ok "CMake: $cmakeVersion"

# Git
if (-not (Test-Command "git")) {
    Exit-WithError "Git not found. Install from https://git-scm.com/download/win"
}
Write-Ok "Git: $((git --version))"

# Bun (for workflows)
if (-not (Test-Command "bun")) {
    Write-Warn "bun not found. Workflows editor requires bun."
    Write-Host "  Install with: powershell -c `"irm bun.sh/install.ps1|iex`""
    if (-not $SkipWorkflows) {
        Write-Warn "Will skip workflow editor build. Re-run with bun installed to build."
        $SkipWorkflows = $true
    }
} else {
    Write-Ok "bun: $((bun --version))"
}

# Node.js (fallback for workflows)
if ($SkipWorkflows -and -not (Test-Command "npm") -and -not $SkipWorkflows) {
    $SkipWorkflows = $true
} elseif (Test-Command "npm") {
    Write-Ok "npm: $((npm --version))"
}

# ============================================================================
# Phase 2: Clone Tasket++ upstream
# ============================================================================
if (-not $SkipDaemon) {
    Write-Step "Setting up Tasket++ upstream source"

    if (-not $TasketppRoot) {
        $TasketppRoot = Join-Path $RepoRoot "upstream"
    }

    if (Test-Path "$TasketppRoot\Task.cpp") {
        Write-Ok "Tasket++ source already exists at $TasketppRoot"
    } else {
        Write-Host "  Cloning AmirHammouteneEI/ScheduledPasteAndKeys..."
        git clone --depth 1 https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys.git "$TasketppRoot"
        if (-not $?) {
            Exit-WithError "Failed to clone Tasket++ repository"
        }
        Write-Ok "Cloned to $TasketppRoot"
    }
}

# ============================================================================
# Phase 3: Build C++ Daemon
# ============================================================================
if (-not $SkipDaemon) {
    Write-Step "Building C++ HTTP daemon"

    $daemonDir = Join-Path $RepoRoot "daemon"
    $buildDir = Join-Path $daemonDir "build"

    if (-not (Test-Path $buildDir)) {
        New-Item -ItemType Directory -Path $buildDir | Out-Null
    }

    # Determine CMake generator
    if ($isMsvc) {
        $generator = "Visual Studio 17 2022"
        $archFlag = "-A x64"
    } else {
        $generator = "MinGW Makefiles"
        $archFlag = ""
    }

    Write-Host "  Configuring with CMake (Qt: $QtPath)..."
    $cmakeArgs = @(
        "-B", $buildDir
        "-G", $generator
        "-DCMAKE_PREFIX_PATH=$QtPath"
        "-DTASKETPP_ROOT=$TasketppRoot"
        "-DCMAKE_BUILD_TYPE=Release"
        "-DTASKET_HTTP_PORT=$Port"
    )
    if ($archFlag) { $cmakeArgs += $archFlag.Split() }

    & cmake $cmakeArgs 2>&1 | ForEach-Object { "    $_" }
    if ($LASTEXITCODE -ne 0) {
        Exit-WithError "CMake configuration failed. Check Qt path and compiler."
    }
    Write-Ok "CMake configured"

    Write-Host "  Building..."
    & cmake --build $buildDir --parallel 2>&1 | ForEach-Object { "    $_" }
    if ($LASTEXITCODE -ne 0) {
        Exit-WithError "Build failed. Check compiler output above."
    }
    Write-Ok "Daemon built successfully"

    $exePath = Join-Path $buildDir "tasket-httpd.exe"
    if (Test-Path $exePath) {
        Write-Ok "Executable: $exePath"
    } else {
        Write-Warn "Executable not found at expected path. Check build directory."
    }
}

# ============================================================================
# Phase 4: Build Workflow Editor
# ============================================================================
if (-not $SkipWorkflows) {
    Write-Step "Building Workflow Editor (React app)"

    $wfDir = Join-Path $RepoRoot "workflows"
    Set-Location $wfDir

    Write-Host "  Installing dependencies..."
    if (Test-Command "bun") {
        bun install 2>&1 | ForEach-Object { "    $_" }
    } else {
        npm install 2>&1 | ForEach-Object { "    $_" }
    }

    Write-Host "  Building for production..."
    if (Test-Command "bun") {
        bun run build 2>&1 | ForEach-Object { "    $_" }
    } else {
        npm run build 2>&1 | ForEach-Object { "    $_" }
    }

    if (Test-Path "$wfDir\dist\index.html") {
        Write-Ok "Workflow editor built: $wfDir\dist\index.html"
    } else {
        Write-Warn "Build may have failed. Check output above."
    }
    Set-Location $RepoRoot
}

# ============================================================================
# Phase 5: Install PI Agent Extension
# ============================================================================
if (-not $SkipPiExtension) {
    Write-Step "Installing PI Agent Extension"

    $piDir = Join-Path $RepoRoot "pi-extension"

    if (Test-Command "npm") {
        Set-Location $piDir
        Write-Host "  Installing TypeScript dependencies..."
        npm install 2>&1 | ForEach-Object { "    $_" }
        Set-Location $RepoRoot
        Write-Ok "PI extension ready at $piDir"
    } else {
        Write-Warn "npm not found. PI extension requires npm."
    }
}

# ============================================================================
# Phase 6: Windows Firewall
# ============================================================================
Write-Step "Configuring Windows Firewall"

$ruleName = "Tasket++ HTTP Trigger"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existing) {
    Write-Ok "Firewall rule already exists"
} else {
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -LocalPort $Port `
        -Protocol TCP `
        -Action Allow `
        -Profile Private `
        -Description "Allow LAN devices to trigger Tasket++ automations via HTTP" 2>&1 | Out-Null
    Write-Ok "Created firewall rule for port $Port (Private networks only)"
}

# ============================================================================
# Phase 7: Create config file
# ============================================================================
Write-Step "Creating configuration"

$configFile = Join-Path $RepoRoot ".tasketconfig.json"
$config = @{
    version    = "2.0.0"
    port       = $Port
    bind       = "0.0.0.0"
    tasksDir   = if ($SkipDaemon) { "" } else { "$RepoRoot\daemon\saved_tasks" }
    daemonExe  = if ($SkipDaemon) { "" } else { "$RepoRoot\daemon\build\tasket-httpd.exe" }
    workflowDist = "$RepoRoot\workflows\dist"
    piExtension  = "$RepoRoot\pi-extension"
    qtPath       = $QtPath
    upstreamPath = $TasketppRoot
} | ConvertTo-Json

$config | Set-Content $configFile -Encoding UTF8
Write-Ok "Configuration saved to $configFile"

# ============================================================================
# Summary
# ============================================================================
Write-Host @"

============================================================
   INSTALLATION COMPLETE
============================================================
"@ -ForegroundColor Green

$items = @(
    @("HTTP Daemon",      (not $SkipDaemon),     "daemon\build\tasket-httpd.exe"),
    @("Workflow Editor",  (not $SkipWorkflows),  "workflows\dist\index.html"),
    @("PI Extension",     (not $SkipPiExtension),"pi-extension\src\index.ts"),
    @("Firewall Rule",    $true,                 "Port $Port (Private)"),
    @("Config File",      $true,                 ".tasketconfig.json")
)

foreach ($item in $items) {
    $name = $item[0]
    $ok = $item[1]
    $path = $item[2]
    if ($ok) {
        Write-Host "  [INSTALLED] $name" -ForegroundColor Green -NoNewline
        Write-Host " -> $path"
    } else {
        Write-Host "  [SKIPPED] $name" -ForegroundColor DarkYellow
    }
}

Write-Host @"

Next steps:
  1. Start the daemon:     .\run.ps1
  2. Or start manually:    daemon\build\tasket-httpd.exe -p $Port -b 0.0.0.0 -d daemon\saved_tasks
  3. Open workflows:       (built-in web server, or serve workflows\dist\)
  4. Install PI extension: Follow docs\PI_AGENT.md

For help: .\run.ps1 -Help
"@ -ForegroundColor Cyan
