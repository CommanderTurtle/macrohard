# Tasket++ HTTP Trigger Daemon v2

> **A fully-typed, LAN-only HTTP extension for [Tasket++](https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys).**
>
> Schedule saved automations with configurable delays, track them by number,  
> and query their status in real time. **No cloud. No NAT. Sovereign control.**

---

## What's New in v2

| Feature | Description |
|---|---|
| **Task Numbering** | Every `/run` call assigns a monotonic ID (`#1`, `#2`, `#3`...) |
| **Configurable Delays** | Each macro can define its own delay; override per-request |
| **`GET /check?id=N`** | Query any task by number for state + remaining time |
| **Lifecycle Messages** | `"scheduled to run in 10s"` -> `"is still running"` -> `"has finished"` |
| **Full Type Safety** | Strong enums for `TaskState`, `HttpStatusCode`, typed `ApiResponse` |
| **Per-Task Stop** | `POST /stop?id=3` stops a single task without affecting others |
| **Tool Inventory** | `GET /` returns a complete catalog of every available endpoint |

---

## One-Line Usage

```bash
# Schedule HelloWorld with its default delay
curl "http://192.168.1.50:7777/run?task=HelloWorld"
# -> "'HelloWorld' scheduled to run in 10s : success"  (task #1)

# Check if it's still waiting
curl "http://192.168.1.50:7777/check?id=1"
# -> "'HelloWorld' is scheduled to run in ~7s"

# Check while running
curl "http://192.168.1.50:7777/check?id=1"
# -> "'HelloWorld' is currently running (elapsed 2s)"

# Check when done
curl "http://192.168.1.50:7777/check?id=1"
# -> "'HelloWorld' has finished"
```

---

## Architecture

```
Client ──HTTP──> HttpServer (cpp-httplib in QThread)
                      │  QueuedConnection
                      v
              TaskRegistry (numbered instances)
                      │  QTimer::singleShot(delay)
                      v
              TaskRunner (TaskThread + Tasket++ engine)
                      │
                      v
              Win32 APIs (SendInput, clipboard, ...)
```

- **`TaskRegistry`** — Owns every task instance. Assigns numbers, manages `QTimer` delays, tracks lifecycle.
- **`TaskRunner`** — Bridges the registry to Tasket++ `TaskThread`. Loads `.scht` via `TaskJsonLoader`.
- **`HttpServer`** — Typed endpoints. All responses use `ApiResponse` (success, message, data).
- **`MainWindow` stub** — Satisfies `SystemCommandsAction` and `RunningOtherTaskAction` without GUI.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full blueprint.

---

## API Reference

### `GET /`
Complete tool inventory with descriptions, endpoints, and examples.

```json
{
  "success": true,
  "message": "Tasket++ HTTP Trigger Daemon",
  "data": {
    "name": "Tasket++ HTTP Trigger",
    "version": "1.7.1",
    "default_delay_seconds": 10,
    "tools": [
      { "name": "Run Task (GET)",   "endpoint": "/run?task=<name>&delay=<sec>&loop=<n>", ... },
      { "name": "Check Task",       "endpoint": "/check?id=<number>", ... },
      ...
    ]
  }
}
```

### `GET /tasks`
List all `.scht` files with their per-task default delays and descriptions.

### `GET /run?task=<name>&delay=<sec>&loop=<n>`
Schedule a macro. Returns a task number.

| Param | Required | Default | Description |
|---|---|---|---|
| `task` | **Yes** | — | Macro name (no `.scht` extension) |
| `delay` | No | from `.scht` `http_delay` or 10s | Seconds to wait before executing |
| `loop` | No | 1 | Executions. `inf` or `infinite` = endless |

**Response:**
```json
{
  "success": true,
  "message": "'HelloWorld' scheduled to run in 10s : success",
  "data": {
    "task_number": 1,
    "name": "HelloWorld",
    "state": "scheduled",
    "delay_seconds": 10,
    "scheduled_at": "2026-05-25T14:30:00"
  }
}
```

### `POST /run`
Same as above but via JSON body:
```json
{ "task": "HelloWorld", "delay": 15, "loop": 3 }
```

### `GET /check?id=<number>`
Query a specific task by its assigned number.

**States & messages:**
| State | Example Message |
|---|---|
| `scheduled` | `'HelloWorld' is scheduled to run in ~7s` |
| `running` | `'HelloWorld' is currently running (elapsed 2s)` |
| `finished` | `'HelloWorld' has finished` |
| `stopped` | `'HelloWorld' was stopped before completion` |
| `failed` | `'HelloWorld' failed: <error>` |

### `GET /status`
Global overview with `scheduled`, `running`, and `finished` arrays.

### `POST /stop?id=<number>`
Stop a single task.

### `POST /stop`
Stop all active tasks.

---

## Per-Task Delay Configuration

Each `.scht` file can include an `http_delay` field:

```json
{
  "docType": "ScheduleTask File",
  "description": "Opens my app",
  "http_delay": 5,
  "actions": [ ... ]
}
```

Priority: `?delay=` query param > `http_delay` in file > global default (`-D 10`).

---

## Build (Windows)

**Prerequisites:** Qt 6.x, CMake 3.16+, Tasket++ cloned as sibling `../tasketpp`

```powershell
git clone https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys.git tasketpp
# place this project next to it
cmake -B build -G "MinGW Makefiles" `
      -DCMAKE_PREFIX_PATH="C:\Qt\6.8.0\mingw_64" `
      -DTASKETPP_ROOT="..\tasketpp"
cmake --build build --parallel
```

Or use `build_windows.bat`.

---

## Run

```powershell
.\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\saved_tasks" -k "MySecret123"
```

| Flag | Description |
|---|---|
| `-p, --port` | TCP port (default 7777) |
| `-b, --bind` | Bind address (default 0.0.0.0) |
| `-d, --dir` | Path to `.scht` directory |
| `-k, --key` | API key for `X-Tasket-Key` header |
| `-D, --default-delay` | Default seconds before running (default 10) |

---

## Android / Tasker Integration

### 30-Second Setup

1. **Task** → `HTTP Request`
   - Method: `GET`
   - URL: `http://192.168.1.50:7777/run?task=%par1`
   - Headers: `X-Tasket-Key: MySecret123`
2. **Call it** from any profile with `%par1` = macro name.

Full recipes (AutoRemote, Home Assistant, PowerShell, Python, Node-RED) in [`docs/INTEGRATION.md`](docs/INTEGRATION.md).

---

## Firewall

```powershell
New-NetFirewallRule -DisplayName "Tasket HTTP Trigger" `
  -Direction Inbound -LocalPort 7777 -Protocol TCP -Action Allow
```

See [`docs/FIREWALL.md`](docs/FIREWALL.md) for LAN-only and private-profile rules.

---

## Project Structure

```
tasket-http-trigger/
├── CMakeLists.txt                 # Windows build
├── build_windows.bat              # One-click build
├── include/
│   ├── Types.h                    # TaskState, HttpStatusCode, ApiResponse, TaskInstance
│   ├── TaskRegistry.h             # Numbered task lifecycle tracker
│   ├── TaskRunner.h               # TaskThread bridge
│   ├── HttpServer.h               # Typed HTTP daemon
│   ├── TaskJsonLoader.h           # .scht parser
│   ├── mainwindow.h               # UI stub
│   └── httplib.h                  # cpp-httplib (single header)
├── src/
│   ├── main.cpp                   # Entry point + CLI
│   ├── HttpServer.cpp             # All typed endpoints
│   ├── TaskRegistry.cpp           # QTimer delays + state machine
│   ├── TaskRunner.cpp             # TaskThread execution
│   ├── TaskJsonLoader.cpp         # JSON -> Task engine
│   └── mainwindow.cpp             # Stub for action dependencies
├── saved_tasks/                   # Sample .scht macros
│   ├── HelloWorld.scht            (http_delay: 10)
│   └── OpenRepo.scht              (http_delay: 5)
├── test/
│   └── test_http_api.py           # 63-test validation suite
└── docs/
    ├── ARCHITECTURE.md
    ├── INTEGRATION.md
    ├── QUICKSTART.md
    └── FIREWALL.md
```

---

## License

GPL v3 (same as Tasket++). `cpp-httplib` is MIT.

**Built for sovereign automation. No cloud required.**
