# Tasket++ HTTP Trigger — Integration Examples

## Quick curl Reference

```bash
# Schedule with default delay (from .scht file or global 10s)
curl "http://192.168.1.50:7777/run?task=HelloWorld"
# -> { "message": "'HelloWorld' scheduled to run in 10s : success", "data": { "task_number": 1 } }

# Override delay to 30 seconds
curl "http://192.168.1.50:7777/run?task=HelloWorld&delay=30"

# Infinite loop
curl "http://192.168.1.50:7777/run?task=HelloWorld&loop=inf"

# Check status of task #1
curl "http://192.168.1.50:7777/check?id=1"
# -> { "message": "'HelloWorld' is scheduled to run in ~7s" }

# Stop task #1 only
curl -X POST "http://192.168.1.50:7777/stop?id=1"

# List all macros with their default delays
curl "http://192.168.1.50:7777/tasks"
```

All requests support `X-Tasket-Key: <secret>` header when auth is enabled.

---

## Workflow Variable Stores

The daemon maintains two in-memory key-value stores for workflow integration:

### Entrypoints (typed variables)

```bash
# Set a string entrypoint
curl -X POST "http://192.168.1.50:7777/entrypoint" \
  -H "Content-Type: application/json" \
  -d '{"id": "search-query", "value": "hello world", "type": "string"}'

# Set a boolean entrypoint
curl -X POST "http://192.168.1.50:7777/entrypoint" \
  -H "Content-Type: application/json" \
  -d '{"id": "enable-feature", "value": "true", "type": "bool"}'

# Set a float entrypoint
curl -X POST "http://192.168.1.50:7777/entrypoint" \
  -H "Content-Type: application/json" \
  -d '{"id": "threshold", "value": "0.85", "type": "float"}'

# List all entrypoints
curl "http://192.168.1.50:7777/entrypoints"
# -> { "entrypoints": { "search-query": "hello world", "threshold": "0.85" }, "count": 2 }
```

### Data Grid (3x3 cells)

```bash
# Set grid cells
curl -X POST "http://192.168.1.50:7777/grid" \
  -H "Content-Type: application/json" \
  -d '{"id": "grid-0", "value": "username"}'

curl -X POST "http://192.168.1.50:7777/grid" \
  -H "Content-Type: application/json" \
  -d '{"id": "grid-1", "value": "password123"}'

# List all grid cells
curl "http://192.168.1.50:7777/grid"
# -> { "cells": { "grid-0": "username", "grid-1": "password123" }, "count": 2 }
```

---

## Android Tasker Integration

### Task: "RunTasket"

1. Create a new Task named `RunTasket`.
2. Add action: **Net > HTTP Request**
3. Configure:
   - **Method**: `GET`
   - **URL**: `http://192.168.1.50:7777/run?task=%par1`
   - **Headers**: `X-Tasket-Key: MySecret123`
4. Save.

### Usage from any Profile

From any profile (voice, time, NFC), use **Task > Perform Task**:
- **Name**: `RunTasket`
- **Parameter 1 (`%par1`)**: macro name, e.g. `HelloWorld`

### Reading the Response (Advanced)

Tasker can parse the JSON response to get the task number:
1. Set **Output File** to a temp file in the HTTP Request action.
2. Add **File > Read File** to read it.
3. Use **Variable > Variable Split** or **JavaScriptlet** to extract `task_number`.
4. Store it in a global variable for later `/check?id=%tasknum` calls.

### Check Task Status from Tasker

Create a second Task `CheckTasket`:
- **Method**: `GET`
- **URL**: `http://192.168.1.50:7777/check?id=%par1`
- Flash `%http_data` to see the status message.

---

## AutoRemote / Join

1. Create a command with action `HTTP Request`.
2. **URL**: `http://192.168.1.50:7777/run?task=%arcomm`
3. **Headers**: `X-Tasket-Key: MySecret123`
4. Sending `"HelloWorld"` from your phone triggers the PC macro.

---

## Home Assistant

```yaml
rest_command:
  run_tasket_macro:
    url: "http://192.168.1.50:7777/run"
    method: POST
    headers:
      X-Tasket-Key: "MySecret123"
      Content-Type: "application/json"
    payload: '{"task": "{{ task_name }}", "delay": {{ delay | default(10) }}, "loop": {{ loop | default(1) }}}'
```

Usage:
```yaml
action:
  - service: rest_command.run_tasket_macro
    data:
      task_name: "HelloWorld"
      delay: 5
```

---

## PowerShell

```powershell
# Schedule
Invoke-RestMethod -Uri "http://192.168.1.50:7777/run?task=HelloWorld&delay=10" -Headers @{"X-Tasket-Key"="MySecret123"}

# Check
Invoke-RestMethod -Uri "http://192.168.1.50:7777/check?id=1" -Headers @{"X-Tasket-Key"="MySecret123"}

# Stop specific
Invoke-RestMethod -Uri "http://192.168.1.50:7777/stop?id=1" -Method Post -Headers @{"X-Tasket-Key"="MySecret123"}
```

---

## Python

```python
import requests

BASE = "http://192.168.1.50:7777"
KEY = "MySecret123"
h = {"X-Tasket-Key": KEY}

# Schedule
r = requests.get(f"{BASE}/run", params={"task": "HelloWorld", "delay": 10}, headers=h)
task_num = r.json()["data"]["task_number"]
print(f"Scheduled as task #{task_num}")

# Check status
r = requests.get(f"{BASE}/check", params={"id": task_num}, headers=h)
print(r.json()["message"])

# Stop if needed
requests.post(f"{BASE}/stop", params={"id": task_num}, headers=h)
```

---

## Node-RED

Inject task name as `msg.payload`, then:
- **HTTP request** node, Method `GET`, URL:
  ```
  http://192.168.1.50:7777/run?task={{payload}}&delay=10
  ```
- Headers: `X-Tasket-Key`: `MySecret123`
- Parse response JSON to extract `task_number` for later checks.
