# Tasket++ HTTP Trigger — Complete Local Installation Guide

## Overview

This guide covers building, installing, and running the Tasket++ HTTP Trigger
Daemon on your local Windows machine. The daemon exposes Tasket++ automation
macros via HTTP so any device on your LAN can trigger them.

**What you get:**
- `tasket-httpd.exe` — console daemon with typed HTTP API
- Configurable delays, numbered task tracking, lifecycle monitoring
- Optional API key authentication
- Full Tasket++ action engine reuse (paste, keystrokes, cursor, system commands, run other tasks)
- Writeable entrypoint and data grid stores for workflow integration

**Prerequisites:**
- Windows 10 or 11 (64-bit)
- Qt 6.9.3 or Qt 5.15 (MinGW or MSVC)
- CMake 3.16+
- Git (to clone Tasket++)

---

## Step 1: Install Qt

### Option A: Qt Online Installer (recommended)

1. Download from https://www.qt.io/download-qt-installer
2. During installation, select:
   - **Qt 6.9.3** (matches Tasket++ v1.8) -> **MinGW 64-bit** (or MSVC 2019 64-bit)
   - **Qt 5 Compatibility Module** (if using Qt 6)
   - **Additional Libraries** -> Qt Network
3. Note the install path (e.g., `C:\Qt\6.9.3\mingw_64`)

### Option B: aqtinstall (command line)

```powershell
pip install aqtinstall
aqt install-qt windows desktop 6.9.3 win64_mingw --outputdir C:\Qt
```

---

## Step 2: Install CMake

Download from https://cmake.org/download/

Choose:
- **Windows x64 Installer**
- During install: **"Add CMake to system PATH"**

Verify:
```powershell
cmake --version  # Should show 3.16 or higher
```

---

## Step 3: Install MinGW (if not using MSVC)

If you installed Qt with MinGW, the compiler is already included at:
```
C:\Qt\6.9.3\mingw_64\bin\gcc.exe
```

Add to PATH:
```powershell
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Qt\6.9.3\mingw_64\bin", "User")
```

Verify:
```powershell
g++ --version
```

---

## Step 4: Clone Repositories

Open PowerShell and clone both repositories:

```powershell
cd C:\dev  # or your preferred directory

# Clone this project (contains daemon, workflows, pi-extension)
git clone https://github.com/YOUR_FORK/tasketpp.git
cd tasketpp

# Clone the original Tasket++ source (required for daemon build)
git clone https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys.git original

# Apply the required one-line patch
cd original
git apply ..\daemon\patches\Task.h.patch
cd ..
```

**Why the patch?** Tasket++'s `Task.h` declares `friend class TaskTab;` but our
daemon's `TaskExecutor` class also needs access to the private action list to
copy it via `deepCopy()`. The patch adds `friend class TaskExecutor;` — a
non-breaking, additive change that does not affect the original application.

Resulting structure:
```
C:\dev\tasketpp\               # This project
├── original\                  # Tasket++ source (patched)
│   ├── Task.cpp
│   ├── Task.h                  # <-- patched with friend class TaskExecutor
│   ├── actions/
│   └── saved_tasks/
├── daemon\                    # C++ HTTP daemon
│   ├── CMakeLists.txt
│   ├── include/
│   ├── src/
│   └── saved_tasks/
├── workflows\                 # React workflow editor
├── pi-extension\              # PI agent extension
└── docs/
```

---

## Step 5: Build

### Configure with CMake

```powershell
cd C:\dev\tasketpp

cmake -B daemon/build -G "MinGW Makefiles" `
    -DCMAKE_PREFIX_PATH="C:\Qt\6.9.3\mingw_64" `
    -DTASKETPP_ROOT="C:\dev\tasketpp\original" `
    -DCMAKE_BUILD_TYPE=Release
```

**For MSVC users:**
```powershell
cmake -B daemon/build -G "Visual Studio 17 2022" -A x64 `
    -DCMAKE_PREFIX_PATH="C:\Qt\6.9.3\msvc2019_64" `
    -DTASKETPP_ROOT="C:\dev\tasketpp\original"
```

### Compile

```powershell
cmake --build daemon/build --parallel
```

If successful, `tasket-httpd.exe` will be in `daemon\build\tasket-httpd.exe`.

---

## Step 6: Set Up Tasks

Copy your Tasket++ saved tasks or use the sample ones:

```powershell
# Copy from Tasket++ installation
Copy-Item -Path "C:\dev\tasketpp\original\saved_tasks\*" `
    -Destination "C:\dev\tasketpp\daemon\saved_tasks\" -Recurse

# Or use the included samples
dir daemon\saved_tasks\*.scht
```

---

## Step 7: Configure Windows Firewall

Run as Administrator:

```powershell
# Allow inbound connections on port 7777
New-NetFirewallRule `
    -DisplayName "Tasket++ HTTP Trigger" `
    -Direction Inbound `
    -LocalPort 7777 `
    -Protocol TCP `
    -Action Allow `
    -Profile Domain,Private `
    -Description "Allow LAN devices to trigger Tasket++ automations via HTTP"
```

**Restrict to Private networks only** (recommended for home LANs):
```powershell
Set-NetFirewallRule -DisplayName "Tasket++ HTTP Trigger" -Profile Private
```

Verify:
```powershell
Get-NetFirewallRule -DisplayName "Tasket++ HTTP Trigger" | Format-Table
Test-NetConnection -ComputerName localhost -Port 7777
```

---

## Step 8: Run the Daemon

### Basic (LAN access, no auth)

```powershell
.\daemon\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\daemon\saved_tasks"
```

### With API key (recommended)

```powershell
.\daemon\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\daemon\saved_tasks" -k "YourSecretKey123"
```

### With custom default delay

```powershell
.\daemon\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\daemon\saved_tasks" -k "YourSecretKey123" -D 5
```

**Output:**
```
================================================
   Tasket++ HTTP Trigger Daemon  v1.8.0
================================================
...
[READY] Server: http://0.0.0.0:7777
[CONFIG] Tasks: C:\dev\tasketpp\daemon\saved_tasks
[CONFIG] Default delay: 5s
[SECURITY] API key authentication enabled
```

---

## Step 9: Test from Another Device

From any device on your LAN (phone, another PC, VM):

```bash
# List available tasks
curl http://192.168.1.50:7777/tasks

# Schedule a task (with auth)
curl -H "X-Tasket-Key: YourSecretKey123" \
     "http://192.168.1.50:7777/run?task=HelloWorld"
# -> "'HelloWorld' scheduled to run in 5s : success" (task #1)

# Check status
curl -H "X-Tasket-Key: YourSecretKey123" \
     "http://192.168.1.50:7777/check?id=1"
# -> "'HelloWorld' is scheduled to run in ~3s"

# Set a workflow entrypoint
curl -X POST "http://192.168.1.50:7777/entrypoint" \
  -H "Content-Type: application/json" \
  -H "X-Tasket-Key: YourSecretKey123" \
  -d '{"id": "ep1", "value": "hello", "type": "string"}'

# List entrypoints
curl -H "X-Tasket-Key: YourSecretKey123" \
  "http://192.168.1.50:7777/entrypoints"

# Set a grid cell
curl -X POST "http://192.168.1.50:7777/grid" \
  -H "Content-Type: application/json" \
  -H "X-Tasket-Key: YourSecretKey123" \
  -d '{"id": "grid-0", "value": "42"}'
```

Replace `192.168.1.50` with your Windows PC's LAN IP.

---

## Step 10: Workflow Editor

```powershell
# Install dependencies
cd workflows
bun install

# Build for production
bun run build

# Or start dev server
bun run dev
```

Open http://localhost:3000 in your browser.

---

## Step 11: Android Tasker Integration

1. In Tasker, create a Task named `RunTasketMacro`
2. Add action: **Net > HTTP Request**
   - Method: `GET`
   - URL: `http://192.168.1.50:7777/run?task=%par1`
   - Headers:
     ```
     X-Tasket-Key: YourSecretKey123
     ```
3. From any profile, use **Task > Perform Task**
   - Name: `RunTasketMacro`
   - Parameter 1: macro name (e.g., `HelloWorld`)

---

## Running as a Windows Service (Optional)

For always-on operation, use NSSM (Non-Sucking Service Manager):

```powershell
# Download nssm from https://nssm.cc/download
nssm install TasketHttpTrigger
# Set path to: C:\dev\tasketpp\daemon\build\tasket-httpd.exe
# Set arguments: -p 7777 -b 0.0.0.0 -d "C:\dev\tasketpp\daemon\saved_tasks" -k "YourSecretKey123"
# Set working directory: C:\dev\tasketpp
nssm start TasketHttpTrigger
```

---

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| `Failed to bind` | Port in use | Change port: `-p 8080` |
| `Cannot open file` | Wrong tasks directory | Use absolute path with `-d` |
| `Task not found` | Case mismatch | Names are case-insensitive, but verify `.scht` exists |
| 403 Forbidden | Wrong API key | Match `-k` value exactly in `X-Tasket-Key` header |
| Task starts but no actions | Empty `.scht` | Open in Tasket++ GUI and re-save |
| `QuitSelfProgram` macro does nothing | Stub intercepts | By design — see mainwindow.cpp |
| `error: 'm_actionsOrderedList' is private` | Patch not applied | Run `cd original && git apply ..\daemon\patches\Task.h.patch` |

---

## Version History

- **1.8.0** — Aligned with Tasket++ v1.8 (Qt 6.9.3): POST /entrypoint + /grid endpoints, TaskExecutor friend patch, RunningOtherTask action support
- **1.7.2** — TaskExecutor replaces TaskThread (avoids private API), improved MainWindow stub, signal-safe registry
- **1.7.1** — Initial typed API with task numbering, configurable delays, /check endpoint
- **1.0.0** — Original proof-of-concept
