# Architectural Blueprint — Tasket++ HTTP Trigger v2

## 1. Problem Statement

Tasket++ (v1.7) is a powerful native Windows automation engine with a Qt GUI. Users need to trigger saved `.scht` macros remotely from phones, VMs, Home Assistant, or other LAN devices — with **configurable delays, task tracking, and status queries**.

## 2. Solution: Sidecar Daemon with Typed Lifecycle

`tasket-httpd.exe` is a standalone console daemon that:
1. **Reuses Tasket++ engine** — `Task`, `TaskThread`, all action classes compile unchanged.
2. **Embeds cpp-httplib** — single-header HTTP server, zero external dependencies.
3. **Provides a MainWindow stub** — satisfies `SystemCommandsAction` / `RunningOtherTaskAction`.
4. **Tracks numbered task lifecycles** — every invocation gets an ID, state, timer, and callback.

## 3. Component Diagram

```
  HTTP Client
      |
      v
  [cpp-httplib Server]  <--- QThread, dedicated
      |  QueuedConnection ( QMetaObject::invokeMethod )
      v
  [HttpServer]  ---typed--->  ApiResponse { success, message, data }
      |
      |  scheduleTask(name, path, delay, loops)
      v
  [TaskRegistry]  <--- owns all TaskInstance objects
      |  QTimer::singleShot(delay * 1000)
      |  executeRequested(taskNumber, path, loops)
      v
  [TaskRunner]  ---loads--->  TaskJsonLoader (.scht -> Task)
      |  TaskThread::start()
      v
  [Tasket++ Engine]
      TaskThread::run() -> action.runAction() -> Win32 APIs
```

## 4. Type System

### TaskState (strong enum)
```
Idle -> Scheduled -> Running -> Finished
                          |-> Stopped
                          |-> Failed
```

### ApiResponse (structured)
Every endpoint returns:
```json
{ "success": bool, "message": string, "data": object }
```

Factory methods:
- `ApiResponse::ok(msg)`
- `ApiResponse::error(code, msg)`
- `ApiResponse::taskScheduled(task)`
- `ApiResponse::taskFinished(task)`
- `ApiResponse::taskCheck(task)`

## 5. Task Lifecycle & Numbering

```
1. Client: GET /run?task=HelloWorld
2. HttpServer reads HelloWorld.scht -> finds http_delay: 10
3. TaskRegistry::scheduleTask() -> creates TaskInstance #1
   - state = Scheduled
   - scheduledToRunAt = now + 10s
   - QTimer(10s) started
4. Response: "'HelloWorld' scheduled to run in 10s : success", task_number: 1
5. (10 seconds pass)
6. QTimer::timeout -> TaskRegistry::onDelayTimerExpired()
   - state = Running
   - emit executeRequested(1, path, loops)
7. TaskRunner::executeTask() -> load .scht, create TaskThread, start
8. TaskThread::sendFinishedAllLoops -> TaskRunner::onTaskThreadFinished()
   - TaskRegistry::markFinished(1)
   - emit taskFinished(1, "HelloWorld")
   - Console: "[FINISHED] Task #1 'HelloWorld' has finished"
```

### /check?id=1 Queries
| Time | State | Response |
|---|---|---|
| T+0s | Scheduled | `'HelloWorld' is scheduled to run in ~10s` |
| T+5s | Scheduled | `'HelloWorld' is scheduled to run in ~5s` |
| T+12s | Running | `'HelloWorld' is currently running (elapsed 2s)` |
| T+30s | Finished | `'HelloWorld' has finished` |

## 6. Delay Resolution Priority

1. `?delay=` query param or JSON body `delay` field
2. `"http_delay"` key inside the `.scht` file
3. Global `--default-delay` CLI flag (default 10)

## 7. Endpoint Design

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /` | Yes | Tool inventory + daemon info |
| `GET /health` | Yes | Lightweight ping |
| `GET /tasks` | Yes | List macros + per-task delays |
| `GET /run?task=X&delay=N&loop=M` | Yes | Schedule by query |
| `POST /run` | Yes | Schedule by JSON body |
| `GET /check?id=N` | Yes | Status of task #N |
| `GET /status` | Yes | Global breakdown |
| `POST /stop?id=N` | Yes | Stop task #N |
| `POST /stop` | Yes | Stop all |

## 8. Threading Model

| Thread | Owner | Responsibility |
|---|---|---|
| Main | QApplication | Event loop, TaskRegistry slots, TaskRunner slots |
| HTTP | QThread | `httplib::Server::listen()` blocking I/O |
| Timer N | QObject child | One QTimer per scheduled task (in main thread) |
| Task N | QThread | One TaskThread per running macro |

## 9. Why Sidecar > Plugin

| Criterion | Sidecar (chosen) | Plugin (rejected) |
|---|---|---|
| GUI impact | Zero | Must modify MainWindow |
| Deployability | Standalone .exe | Rebuild entire app |
| Update friction | Pull latest Tasket++ engine .cpp files | Merge into Qt project |
| Restartability | Restart daemon without closing GUI | Must restart whole app |
| Code size | ~1,300 lines | Would bloat main binary |

## 10. Extensibility

| Feature | Difficulty | Approach |
|---|---|---|
| Task parameter injection | 3/10 | Add `?vars={}` merged into action params before run |
| WebSocket push | 4/10 | Replace cpp-httplib with websocketpp |
| mDNS advertisement | 2/10 | Add `QDnsServiceDiscovery` |
| TLS/HTTPS | 5/10 | Reverse proxy (nginx/traefik) or cpp-httplib+OpenSSL |
| Execution log stream | 3/10 | Buffer logs, serve via `/events` SSE endpoint |
| Cron-style scheduling | 4/10 | Parse cron expr, use QTimer for next trigger |

## 11. Migration Path to Full Integration

If the Tasket++ author wants to merge this into the main app:
1. Move `HttpServer`, `TaskRegistry`, `TaskRunner` into the project.
2. Replace `MainWindow` stub with the real `MainWindow`.
3. Add menu item: **Tools > Start HTTP Trigger**.
4. Reuse the same `TaskJsonLoader`.

No rewrite needed — the sidecar code is architecturally ready.
