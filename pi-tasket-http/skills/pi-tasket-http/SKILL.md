---
name: pi-tasket-http
description: >-
  Remote control of Tasket++ HTTP Trigger — a Windows automation daemon that executes
  saved macros (keystrokes, paste, mouse, system commands) over HTTP. Use when the user
  wants to trigger Windows automations from the agent, run scheduled tasks on a PC,
  or remotely control a Windows machine from another device.
  Triggers: tasket, automation, macro, Windows, keystrokes, paste text, run task,
  scheduled task, remote control, SendInput, system command, cursor movement,
  .scht file, tasket++.
---

# Tasket++ HTTP Trigger Tools

6 tools for remote control of a Tasket++ HTTP Daemon running on Windows.

## Tools

| Tool | Purpose |
|------|---------|
| `tasket-ping` | Discover and health-check the daemon |
| `tasket-list` | Browse available macros with their default delays |
| `tasket-run` | Schedule a macro (returns a task number) |
| `tasket-check` | Query task status by number (remaining time, state) |
| `tasket-status` | Full daemon overview (scheduled / running / finished) |
| `tasket-stop` | Stop one task by number, or all tasks |

## Setup

The daemon runs on a Windows PC. Tell the user to set these environment variables
in the agent's shell, or pass `baseUrl` and `apiKey` to every tool call:

```bash
export TASKET_HTTP_URL="http://192.168.1.50:7777"
export TASKET_HTTP_KEY="MySecretKey"
```

Or use `tasket-ping baseUrl="http://192.168.1.50:7777"` to probe.

## Common Patterns

### Run a macro with default delay

```
tasket-run task="HelloWorld"
```
Response includes a task number, e.g. `#1`. Use `tasket-check task_number=1` to monitor.

### Run immediately (no delay)

```
tasket-run task="HelloWorld" delay=0
```

### Run 3 times

```
tasket-run task="TypeReport" delay=5 loop=3
```

### Check if a task is still running

```
tasket-check task_number=1
```
Returns: `'HelloWorld' is scheduled to run in ~7s` or `'HelloWorld' has finished`

### Stop a stuck task

```
tasket-stop task_number=1
```

### Stop everything

```
tasket-stop
```

### See all daemon activity

```
tasket-status
```

## Task States

| State | Meaning |
|---|---|
| `scheduled` | Waiting for delay timer to expire |
| `running` | TaskThread is executing actions |
| `finished` | All actions completed successfully |
| `stopped` | Cancelled by user before completion |
| `failed` | Error during load or execution |

## What Tasket++ Can Automate

The daemon executes `.scht` files containing chains of these actions:

- **Paste text** — type arbitrary text into the focused window
- **Keys sequence** — simulate any key combination (Ctrl+V, Alt+F4, etc.)
- **Cursor movements** — move mouse to specific screen coordinates
- **System commands** — open URLs, run programs, take screenshots, kill processes
- **Wait** — pause for N seconds between actions
- **Run another task** — chain macros together

This is ideal for:
- Opening an app and navigating it automatically
- Filling forms with paste + keystrokes
- Taking screenshots after UI changes
- Running a dev server and then opening the browser
- Any Windows GUI automation you need triggered remotely
