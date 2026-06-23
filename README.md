# Macrohard — Assembly tree (in active development)

![](https://github.com/CommanderTurtle/macrohard/blob/main/examples/Screenshot.png?raw=true)

> **A complete rewrite and extension of Tasket++ with a ComfyUI-style node editor,
> IF/THEN/ELSE checkpoints, and a typed HTTP trigger daemon.**
>
> Extension for [AmirHammouteneEI/ScheduledPasteAndKeys](https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys) (tested against v1.8, June 2026)
>
> Three components, one ecosystem: **Daemon** (C++) | **Workflows** (React) | **PI Agent** (TypeScript)

---

This is the non-comfy backend. A native HTTP server sidecar for tasket++. Synced with a pi skill

Main frontend exceeds 2MB post-build. (Comfy+Node)

This file tree is the initial design for the HTTP sidecar, written completely in C. Allowing automation of existing flows natively without a database through MCP.

800kb built HTTP-server and only 3 js files for pi (node_modules). Mostly typescript for the pi tooling (42kb)

All beta, but groundwork for eventual update for a lightweight standard version without an entire browser host.

---

Comfy (main) readme:


## What's New

| Feature | Before (Tasket++) | After (This Fork) |
|---|---|---|
| **Editing** | Tab-based action list | ComfyUI-style drag-and-drop node editor |
| **Logic** | None — linear execution only | IF/THEN/ELSE checkpoints with AND/OR/XOR |
| **Types** | String paste only | String / Bool / Float entrypoints + conditions |
| **Reusability** | Copy-paste between tabs | Drag macro modules from library + copy/paste/delete nodes |
| **Variables** | None | 3x3 data grid with inline editing (persists across runs) |
| **Remote** | GUI only | Full HTTP API with task numbering + writeable entrypoints/grid |
| **Scheduling** | Fixed delay per task | Configurable per-task delays + loop control |
| **Safety** | No emergency stop | Giant pulsing STOP button |
| **Persistence** | Manual save | Auto-save every 3s to localStorage + JSON export/import |
| **Execution** | HTTP daemon only | Native fallback execution when daemon offline |
| **Undo/Redo** | None | Full history stack (Ctrl+Z / Ctrl+Y) |
| **Node Actions** | None | Floating copy/duplicate/delete buttons on every node |
| **Add Nodes** | Drag from sidebar only | "Just start typing" command palette (double-click / Ctrl+K) |
| **Save/Load** | None | Browse saved workflows on welcome screen + instant localStorage access |

---

## Quick Start (Windows)

### Prerequisites

- **Windows 10/11**
- **Qt 6.9.3** with MinGW or MSVC — [download](https://www.qt.io/download-qt-installer)
- **CMake 3.16+** — [download](https://cmake.org/download/)
- **bun** — `powershell -c "irm bun.sh/install.ps1|iex"`

### One-Command Install

```powershell
# Clone this repo
git clone https://github.com/CommanderTurtle/macrohard
cd tasketpp

# Also clone the original Tasket++ source (required for daemon build)
git clone https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys.git original

# Apply the one-line patch needed for daemon compilation
copy daemon\patches\Task.h.patch original\
cd original && git apply Task.h.patch && cd ..

# Install everything (as Administrator)
.\install.ps1 -QtPath "C:\Qt\6.9.3\mingw_64"
```

This builds the C++ daemon, installs the workflow editor, configures the firewall,
and creates a `.tasketconfig.json` for the runtime.

### Run Everything

```powershell
.\run.ps1        # Start daemon + workflow editor
.\run.ps1 daemon  # Start daemon only
.\run.ps1 status  # Show all service status
.\run.ps1 stop    # Stop all services
```

---

## Architecture

```
 +------------------+     HTTP      +-----------------------+
 |  Android/Tasker  | <-----------> |  tasket-httpd.exe     |
 |  Home Assistant  |   port 7777   |  (C++ daemon)         |
 |  curl/any client |               |  - TaskExecutor*      |
 +------------------+               |  - TaskRegistry       |
                                    |  - cpp-httplib        |
                                    |  - Entrypoint store   |
                                    |  - Grid cell store    |
                                    +----------+------------+
                                               |
                                               | loads .scht
                                               v
                                    +-----------------------+
                                    |  Tasket++ Engine      |
                                    |  (PasteAction,        |
                                    |   KeysSequenceAction, |
                                    |   SystemCommands,     |
                                    |   CursorMovements,    |
                                    |   RunningOtherTask)   |
                                    +-----------------------+

 +------------------+     HTTP      +-----------------------+
 |  Browser         | <-----------> |  Workflow Editor      |
 |  (localhost:3000)|               |  (React + React Flow) |
 +------------------+               |  - Node editor        |
                                    |  - Checkpoint editor  |
                                    |  - Macro library      |
                                    |  - Inline grid edit   |
                                    |  - Inline entrypoint  |
                                    |  - Copy/paste/delete  |
                                    +----------+------------+
                                               |
                                               | JSON workflow
                                               v
                                    +-----------------------+
                                    |  PI Agent Extension   |
                                    |  (@pi-extensions/     |
                                    |   pi-tasket-http)     |
                                    +-----------------------+

*TaskExecutor replaces TaskThread (avoids private copyActionsList() API)
```

---

## Repository Structure

```
tasketpp/
|                   # ---- Root ----
| README.md         # This file
| install.ps1       # One-click Windows installer (Administrator)
| run.ps1           # Runtime launcher (start/stop/status/logs)
| .tasketconfig.json # Generated config (port, paths, etc.)
|
|                   # ---- Original Tasket++ Source ----
+-- original/       # Cloned from github.com/AmirHammouteneEI/ScheduledPasteAndKeys
|    (patched with daemon/patches/Task.h.patch)
|
|                   # ---- C++ HTTP Daemon ----
+-- daemon/
|    CMakeLists.txt
|    build_windows.bat
|    +-- patches/       # Patches for original Tasket++ source
|    |    Task.h.patch  # Adds friend class TaskExecutor
|    +-- include/       # Headers (Types.h, TaskExecutor.h, etc.)
|    +-- src/           # C++ sources (TaskExecutor.cpp replaces TaskThread)
|    +-- saved_tasks/   # .scht macro files
|    +-- test/          # Python API validation (63 tests)
|    +-- docs/          # Daemon-specific docs
|
|                   # ---- Workflow Editor ----
+-- workflows/
|    package.json
|    vite.config.ts
|    +-- src/
|         +-- types/workflow.ts      # Complete type system
|         +-- engine/checkpoint.ts   # IF/THEN/ELSE evaluator
|         +-- engine/workflowEngine.ts # Graph traversal + native execution
|         +-- stores/workflowStore.ts  # Zustand state + clipboard
|         +-- components/nodes/      # 5 custom React Flow nodes
|         |    EntrypointNode.tsx    # Inline value editing (string/bool/float)
|         |    DataGridNode.tsx      # Inline 3x3 cell editing
|         |    CheckpointNode.tsx
|         |    MacroNode.tsx
|         |    OutputNode.tsx
|         +-- components/editors/    # Property panels
|         +-- components/shell/WorkflowCanvas.tsx # Main canvas + keyboard shortcuts
|
|                   # ---- PI Agent Extension ----
+-- pi-extension/
|    package.json
|    +-- src/
|         +-- client/tasket-client.ts  # Typed HTTP client
|         +-- tools/tasket-http.ts     # 6 PI tool registrations
|         +-- index.ts                 # Extension entry point
|    +-- skills/pi-tasket-http/SKILL.md # LLM skill documentation
|    +-- __tests__/                    # Unit tests
|
|                   # ---- Docs ----
+-- docs/
     INSTALL.md        # Detailed installation guide
     API.md            # HTTP API reference
     PI_AGENT.md       # PI agent integration
     ARCHITECTURE.md   # Design rationale
```

---

## Component Details

### 1. HTTP Daemon (`daemon/`)

Built with Qt + cpp-httplib. Exposes Tasket++ macros over HTTP.

```powershell
# Build
cmake -B daemon/build -G "MinGW Makefiles" -DCMAKE_PREFIX_PATH="C:\Qt\6.9.3\mingw_64"
cmake --build daemon/build --parallel

# Run
daemon\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d daemon\saved_tasks
```

**API Endpoints:**

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Full tool inventory |
| `/health` | GET | Health check |
| `/tasks` | GET | List macros + default delays |
| `/run?task=X&delay=N` | GET | Schedule macro, returns task # |
| `/run` | POST | Same via JSON body |
| `/check?id=N` | GET | Task status + remaining time |
| `/status` | GET | Global daemon status |
| `/stop?id=N` | POST | Stop one task |
| `/stop` | POST | Stop all tasks |
| `/entrypoint` | POST | Set workflow entrypoint value (string/bool/float) |
| `/entrypoints` | GET | List all entrypoint values |
| `/grid` | POST | Set data grid cell value |
| `/grid` | GET | List all grid cell values |

**Key Design Decision:** `TaskExecutor` (our own QThread) replaces `TaskThread`
from Tasket++ because `TaskThread::copyActionsList()` is a **private** method
(friend = `TaskTab` only). `TaskExecutor` uses only public `AbstractAction` APIs:
`deepCopy()`, `runAction()`, `getRefID()`.

**Patch Required:** `daemon/patches/Task.h.patch` adds `friend class TaskExecutor;`
to `Task.h` so our executor can access the action list. This is a one-line,
non-breaking change.

### 2. Workflow Editor (`workflows/`)

ComfyUI-style node editor for building automation workflows visually.

**5 Node Types:**

| Node | Purpose |
|---|---|
| **Entrypoint** | User input (string / bool / float). Click to edit inline. OCR-capable. |
| **Checkpoint** | IF/THEN/ELSE with string/bool/float conditions + AND/OR/XOR |
| **Macro** | Execute a Tasket++ .scht macro with delay/loop |
| **Data Grid** | 3x3 variable array — click any cell to edit inline |
| **Output** | Workflow result / terminal node |

**Keyboard Shortcuts:**

| Key | Action |
|---|---|
| `Ctrl+C` | Copy selected node |
| `Ctrl+V` | Paste node |
| `Ctrl+X` | Cut node |
| `Ctrl+D` | Duplicate node |
| `Delete` | Remove selected node |

**Checkpoint Operators:**

- **String:** `contains`, `equals`, `startsWith`, `endsWith`, `regex`, `notContains`, `notEquals`
  - Case sensitive/insensitive toggle
- **Bool:** `isTrue`, `isFalse` (reads "true"/"false" text)
- **Float:** `=`, `!=`, `<`, `>`, `<=`, `>=`
- **Logic:** `AND`, `OR`, `XOR` connectors between conditions

### 3. PI Agent Extension (`pi-extension/`)

TypeScript extension for `pi-coding-agent`. Provides 6 tools for remote control.

```bash
# Install in PI agent
pi install @pi-extensions/pi-tasket-http
```

**Tools:** `tasket-ping`, `tasket-list`, `tasket-run`, `tasket-check`, `tasket-status`, `tasket-stop`

---

## Workflow Editor UX

### "Just Start Typing" Command Palette

Double-click anywhere on the canvas or press **Ctrl+K** to open the command palette.
Type to filter nodes and built-in macros. Press **Enter** to add at the cursor position.

**Categories:** Input (Entrypoint) → Logic (Checkpoint) → Action (Macro) → Variables (Data Grid) → Result (Output)

### Floating Node Actions

Hover or select any node to reveal three buttons on its top-right corner:
- **Copy** — copy node to clipboard
- **Duplicate** — create a copy offset by (30, 30)
- **Delete** — remove the node and its edges

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Ctrl+K` | Open command palette |
| `Double-click canvas` | Open command palette |
| `Ctrl+C` | Copy selected node |
| `Ctrl+V` | Paste node |
| `Ctrl+X` | Cut node |
| `Ctrl+D` | Duplicate node |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |
| `Delete` | Remove selected node |

### Inline Editing

- **Entrypoints:** Click the value area to edit string/float/bool directly in the node
- **Data Grid:** Click any of the 9 cells to edit inline (Enter to save, Escape to cancel)
- **Checkpoints:** Edit conditions, operators, and logic in the sidebar

### Save & Load — Two Mechanisms, One Format

Every workflow is stored as clean JSON. Both auto-save and manual export use the exact same format.

**Auto-save** (every 3 seconds):
- Saves to `localStorage` under key `tasket-workflows-<workflow-id>`
- Maintains an index at `tasket-workflows-index` for browsing
- Survives browser refreshes and crashes

**Manual export** (Save button or Ctrl+S):
- Downloads `.json` file to disk
- Also persists to `localStorage` immediately
- Defensive cleaner strips any internal UI fields (e.g., `_showActions`) before export

**Loading workflows:**
- **Welcome screen** shows all saved workflows from localStorage — click to resume
- **Open File** button imports any `.json` workflow file
- **Drag & drop** a `.json` file directly onto the canvas

**JSON format** (round-trip safe):
```json
{
  "id": "wf-...",
  "name": "My Workflow",
  "version": "2.1",
  "nodes": [...],
  "edges": [...],
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "createdAt": "...",
  "updatedAt": "..."
}
```

All node data, edge connections, checkpoint conditions, grid cell values, and viewport position are preserved identically through export → import cycles.

---

## From Another Device

```bash
# List macros
curl http://192.168.1.50:7777/tasks

# Schedule HelloWorld (uses its default delay from .scht)
curl "http://192.168.1.50:7777/run?task=HelloWorld"
# -> "'HelloWorld' scheduled to run in 10s : success" (task #1)

# Check status
curl "http://192.168.1.50:7777/check?id=1"
# -> "'HelloWorld' is scheduled to run in ~7s"
# -> (later) "'HelloWorld' has finished"

# Set a workflow entrypoint
curl -X POST "http://192.168.1.50:7777/entrypoint" \
  -H "Content-Type: application/json" \
  -d '{"id": "ep1", "value": "hello world", "type": "string"}'

# Set a grid cell
curl -X POST "http://192.168.1.50:7777/grid" \
  -H "Content-Type: application/json" \
  -d '{"id": "grid-0", "value": "42"}'
```

---

## Version History

- **2.1.1** — Synced with Tasket++ v1.8 upstream: infinite-loop guard fix (`loop != 0` check), negative loop value handling in native execution, parameter validation on both GET/POST /run
- **2.1.0** — Full ComfyUI-style UX: undo/redo history, "just start typing" command palette, floating node action buttons (copy/duplicate/delete), keyboard-first workflow
- **2.0.0** — Workflow editor v2: copy/paste/delete, inline grid/entrypoint editing, native fallback execution, POST /entrypoint + /grid endpoints
- **1.8.0** — Aligned with Tasket++ v1.8 (Qt 6.9.3): TaskExecutor friend patch, RunningOtherTask action support
- **1.7.2** — TaskExecutor replaces TaskThread (avoids private API), signal-safe registry
- **1.7.1** — Typed API with task numbering, configurable delays, /check endpoint
- **1.0.0** — Original proof-of-concept

---

## License

GPL v3 (same as upstream Tasket++). `cpp-httplib` is MIT.
