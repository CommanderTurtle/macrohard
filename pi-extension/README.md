# pi-tasket-http

> **Tasket++ HTTP Trigger tools for [pi-coding-agent](https://github.com/earendil-works/pi).**
>
> Remotely control a [Tasket++ HTTP Daemon](https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys)
> from your PI agent. Schedule Windows automation macros, track them by number, and query
> their lifecycle status — all over HTTP.

---

## What This Gives Your Agent

6 tools that let the agent dynamically call a Tasket++ HTTP Trigger daemon running on any Windows PC:

| Tool | What It Does |
|---|---|
| `tasket-ping` | Discover the daemon, verify connectivity, list endpoints |
| `tasket-list` | Browse all available `.scht` macros with their default delays |
| `tasket-run` | Schedule a macro (returns a task number for tracking) |
| `tasket-check` | Query a task by number — remaining time, state, elapsed |
| `tasket-status` | Full daemon overview: scheduled / running / finished counts |
| `tasket-stop` | Stop one task by number, or stop all active tasks |

---

## Installation

```bash
# Via pi package manager (recommended)
pi install @pi-extensions/pi-tasket-http

# Or clone into your pi extensions directory
git clone https://github.com/pi-extensions/pi-tasket-http.git ~/.config/pi/extensions/pi-tasket-http
```

Requires `@mariozechner/pi-coding-agent >= 0.50.0` as a peer dependency.

---

## Configuration

Set environment variables so tools know where the daemon lives:

```bash
export TASKET_HTTP_URL="http://192.168.1.50:7777"    # Windows PC IP + port
export TASKET_HTTP_KEY="MySecretKey"                    # If auth is enabled
```

Or pass `baseUrl` and `apiKey` explicitly to any tool call.

---

## Agent Usage Examples

### Discover what's available

```
> tasket-ping
Tasket++ HTTP Trigger 1.7.1 at http://192.168.1.50:7777
Tasks dir: ./saved_tasks  Auth: enabled  Default delay: 10s

Available endpoints:
  • Run Task (GET) — /run?task=<name>&delay=<sec>&loop=<n>
  • Check Task — /check?id=<number>
  • List Tasks — /tasks
...
```

### Browse macros

```
> tasket-list
3 macro(s) available:
  • HelloWorld (delay: 10s) — Opens Notepad, types greeting
  • OpenRepo (delay: 5s) — Opens GitHub in browser
  • LightsOff (delay: 15s) — Shuts off smart lights
```

### Schedule a macro

```
> tasket-run task="HelloWorld"
Scheduled 'HelloWorld' (#1) — state: scheduled, delay: 10s
Use tasket-check task_number=1 to monitor.

> tasket-run task="HelloWorld" delay=0
Scheduled 'HelloWorld' (#2) — state: scheduled, delay: 0s
Runs immediately.

> tasket-run task="TypeReport" delay=5 loop=3
Scheduled 'TypeReport' (#3) — state: scheduled, delay: 5s, loop: 3
```

### Monitor progress

```
> tasket-check task_number=1
Task #1 'HelloWorld' — scheduled (~7s remaining)

> tasket-check task_number=1
Task #1 'HelloWorld' — running

> tasket-check task_number=1
Task #1 'HelloWorld' — finished
```

### Stop tasks

```
> tasket-stop task_number=3
Stopped task #3 'TypeReport'

> tasket-stop
All active tasks stopped
```

---

## What Tasket++ Can Automate

The daemon runs `.scht` files — JSON-defined action chains that simulate:

- **Paste text** — type arbitrary text into the focused window
- **Keys sequence** — simulate any key combo (Ctrl+V, Alt+F4, Win+R...)
- **Cursor movements** — move mouse to screen coordinates with timing
- **System commands** — open URLs, run programs, screenshots, kill processes, shutdown
- **Wait** — pause N seconds between actions
- **Run another task** — chain macros together

This is perfect for:
- Opening an app and navigating it automatically
- Filling forms with paste + keystrokes
- Taking screenshots after UI changes
- Running dev servers and opening browsers
- Any Windows GUI automation triggered remotely

---

## Package Structure

```
pi-tasket-http/
├── src/
│   ├── index.ts                    # Extension entry point (activate)
│   ├── client/
│   │   └── tasket-client.ts        # Typed HTTP client for the daemon
│   └── tools/
│       └── tasket-http.ts          # 6 PI tool registrations
├── skills/
│   └── pi-tasket-http/
│       └── SKILL.md                # Skill doc for the LLM
├── __tests__/
│   └── tasket-client.test.ts       # Unit tests (mocked HTTP)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Compatibility

| Dependency | Version |
|---|---|
| `@mariozechner/pi-coding-agent` | `>= 0.50.0` |
| `@sinclair/typebox` | (via peer, for parameter schemas) |
| `@mariozechner/pi-tui` | (via peer, for rendering) |
| Node.js | `>= 18` (for native fetch) |

The daemon side requires **Windows** (Tasket++ uses Win32 APIs). This PI package runs anywhere Node.js runs — it just makes HTTP calls.

---

## License

MIT. Same as the [pi-powershell](https://github.com/marcfargas/pi-powershell) reference package.

**Built for sovereign automation. No cloud required.**
