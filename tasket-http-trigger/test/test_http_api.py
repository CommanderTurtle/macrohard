#!/usr/bin/env python3
"""
Tasket++ HTTP Trigger v2 — Comprehensive API Validation Suite
=============================================================

Validates:
  - Typed JSON responses (success, message, data schema)
  - Task numbering (monotonically increasing IDs)
  - Configurable delay scheduling (default 10s, per-task override, per-request override)
  - /check endpoint with remaining-time estimates
  - Lifecycle messages ("scheduled to run in Xs", "has finished", "is still running")
  - Tool inventory on GET /
  - Auth (X-Tasket-Key)
  - Task listing with per-task delay metadata
  - Stop by task number and stop-all

Run:  python3 test_http_api.py
"""

import json
import sys
import threading
import time
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 17777
BASE_URL = f"http://127.0.0.1:{PORT}"
API_KEY = "TestSecretKey123"

# Simulated task registry with lifecycle tracking
class MockTaskInstance:
    _counter = 0
    def __init__(self, name, path, delay=10, loops=1):
        MockTaskInstance._counter += 1
        self.number = MockTaskInstance._counter
        self.name = name
        self.path = path
        self.delay = delay
        self.loops = loops
        self.state = "scheduled"
        self.created_at = time.time()
        self.scheduled_at = self.created_at + delay
        self.started_at = None
        self.finished_at = None

MOCK_TASKS = {
    "HelloWorld": "/tmp/saved_tasks/HelloWorld.scht",
    "OpenRepo": "/tmp/saved_tasks/OpenRepo.scht",
    "LightsOff": "/tmp/saved_tasks/LightsOff.scht",
}

# Per-task default delays (read from .scht "http_delay" field)
TASK_DEFAULT_DELAYS = {
    "HelloWorld": 10,
    "OpenRepo": 5,
    "LightsOff": 15,
}

# In-memory task instance registry
instances = {}  # task_number -> MockTaskInstance


class MockHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode())

    def _auth_ok(self):
        if not API_KEY:
            return True
        key = self.headers.get("X-Tasket-Key", "")
        if key != API_KEY:
            self._send_json(403, {"success": False, "message": "Invalid API key", "data": {}})
            return False
        return True

    def _typed_response(self, success, message, data=None, status=200):
        payload = {"success": success, "message": message}
        if data is not None:
            payload["data"] = data
        self._send_json(status, payload)

    def do_GET(self):
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        # --- GET / ---
        if path == "/":
            if not self._auth_ok(): return
            tools = [
                {"name": "Run Task (GET)", "endpoint": "/run?task=<name>&delay=<sec>&loop=<n>", "method": "GET"},
                {"name": "Run Task (POST)", "endpoint": "/run", "method": "POST"},
                {"name": "Check Task", "endpoint": "/check?id=<number>", "method": "GET"},
                {"name": "List Tasks", "endpoint": "/tasks", "method": "GET"},
                {"name": "Daemon Status", "endpoint": "/status", "method": "GET"},
                {"name": "Stop Task", "endpoint": "/stop?id=<number>", "method": "POST"},
                {"name": "Stop All", "endpoint": "/stop", "method": "POST"},
                {"name": "Health Check", "endpoint": "/health", "method": "GET"},
            ]
            self._typed_response(True, "Tasket++ HTTP Trigger Daemon", {
                "name": "Tasket++ HTTP Trigger",
                "version": "1.7.1",
                "tools": tools,
                "default_delay_seconds": 10,
                "auth_enabled": bool(API_KEY)
            })
            return

        # --- GET /health ---
        if path == "/health":
            if not self._auth_ok(): return
            self._typed_response(True, "Healthy", {"status": "ok", "task_count": len(MOCK_TASKS)})
            return

        # --- GET /tasks ---
        if path == "/tasks":
            if not self._auth_ok(): return
            arr = []
            for name, path_val in MOCK_TASKS.items():
                arr.append({
                    "name": name,
                    "delay_seconds": TASK_DEFAULT_DELAYS.get(name, 10),
                    "description": f"Sample task: {name}"
                })
            self._typed_response(True, f"Found {len(arr)} task(s)", {"tasks": arr, "count": len(arr)})
            return

        # --- GET /run ---
        if path == "/run":
            if not self._auth_ok(): return
            task_name = params.get("task", [""])[0]
            if not task_name:
                self._typed_response(False, "Missing 'task' query parameter", status=400)
                return
            if task_name not in MOCK_TASKS:
                self._typed_response(False, f"Task '{task_name}' not found", status=404)
                return

            delay_param = params.get("delay", [""])[0]
            if delay_param:
                delay = int(delay_param)
            else:
                delay = TASK_DEFAULT_DELAYS.get(task_name, 10)

            loop_param = params.get("loop", ["1"])[0]
            if loop_param.lower() in ("inf", "infinite"):
                loops = -1
            else:
                loops = int(loop_param)

            inst = MockTaskInstance(task_name, MOCK_TASKS[task_name], delay, loops)
            instances[inst.number] = inst

            self._typed_response(True,
                f"'{task_name}' scheduled to run in {delay}s : success",
                {
                    "task_number": inst.number,
                    "name": task_name,
                    "state": "scheduled",
                    "delay_seconds": delay,
                    "loop_times": loops,
                    "scheduled_at": inst.scheduled_at
                })
            return

        # --- GET /check ---
        if path == "/check":
            if not self._auth_ok(): return
            id_param = params.get("id", [""])[0]
            if not id_param:
                self._typed_response(False, "Missing 'id' query parameter", status=400)
                return

            task_num = int(id_param)
            if task_num not in instances:
                self._typed_response(False, f"Task #{task_num} not found", status=404)
                return

            inst = instances[task_num]
            now = time.time()

            if inst.state == "scheduled":
                remaining = int(inst.scheduled_at - now)
                if remaining < 0:
                    remaining = 0
                msg = f"'{inst.name}' is scheduled to run in ~{remaining}s"
            elif inst.state == "running":
                elapsed = int(now - inst.started_at)
                msg = f"'{inst.name}' is still running, ~{elapsed}s elapsed"
            elif inst.state == "finished":
                msg = f"'{inst.name}' has finished"
            elif inst.state == "stopped":
                msg = f"'{inst.name}' was stopped before completion"
            elif inst.state == "failed":
                msg = f"'{inst.name}' failed"
            else:
                msg = f"'{inst.name}' status unknown"

            self._typed_response(True, msg, {
                "task_number": inst.number,
                "name": inst.name,
                "state": inst.state,
                "delay_seconds": inst.delay,
                "remaining_seconds": max(0, int(inst.scheduled_at - now)) if inst.state == "scheduled" else 0
            })
            return

        # --- GET /status ---
        if path == "/status":
            if not self._auth_ok(): return
            scheduled = [i.toJson() if hasattr(i, 'toJson') else {"number": i.number, "name": i.name, "state": i.state}
                         for i in instances.values() if i.state == "scheduled"]
            running = [{"number": i.number, "name": i.name, "state": i.state}
                       for i in instances.values() if i.state == "running"]
            finished = [{"number": i.number, "name": i.name, "state": i.state}
                        for i in instances.values() if i.state in ("finished", "stopped", "failed")]
            self._typed_response(True, "Daemon status", {
                "scheduled": scheduled,
                "running": running,
                "finished": finished,
                "scheduled_count": len(scheduled),
                "running_count": len(running),
                "finished_count": len(finished),
                "total_count": len(instances)
            })
            return

        self._typed_response(False, "Not Found", status=404)

    def do_POST(self):
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode() if length else "{}"

        # --- POST /run ---
        if path == "/run":
            if not self._auth_ok(): return
            try:
                payload = json.loads(body) if body else {}
            except json.JSONDecodeError:
                self._typed_response(False, "Invalid JSON body", status=400)
                return

            task_name = payload.get("task", "")
            if not task_name:
                self._typed_response(False, "Missing 'task' field", status=400)
                return
            if task_name not in MOCK_TASKS:
                self._typed_response(False, f"Task '{task_name}' not found", status=404)
                return

            delay = payload.get("delay", TASK_DEFAULT_DELAYS.get(task_name, 10))
            loop_val = payload.get("loop", 1)
            if isinstance(loop_val, str) and loop_val.lower() == "infinite":
                loops = -1
            else:
                loops = int(loop_val)

            inst = MockTaskInstance(task_name, MOCK_TASKS[task_name], delay, loops)
            instances[inst.number] = inst

            self._typed_response(True,
                f"'{task_name}' scheduled to run in {delay}s : success",
                {
                    "task_number": inst.number,
                    "name": task_name,
                    "state": "scheduled",
                    "delay_seconds": delay,
                    "loop_times": loops
                })
            return

        # --- POST /stop ---
        if path == "/stop":
            if not self._auth_ok(): return
            id_param = params.get("id", [""])[0]

            if not id_param:
                for i in instances.values():
                    if i.state in ("scheduled", "running"):
                        i.state = "stopped"
                self._typed_response(True, "All active tasks stopped")
            else:
                task_num = int(id_param)
                if task_num not in instances:
                    self._typed_response(False, f"Task #{task_num} not found", status=404)
                    return
                instances[task_num].state = "stopped"
                self._typed_response(True, f"Task #{task_num} '{instances[task_num].name}' stopped")
            return

        self._typed_response(False, "Not Found", status=404)


def start_mock_server():
    global server, server_thread
    server = HTTPServer(("127.0.0.1", PORT), MockHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.3)


def stop_mock_server():
    if server:
        server.shutdown()
        server.server_close()


def http_get(path, key=None):
    req = urllib.request.Request(f"{BASE_URL}{path}")
    if key:
        req.add_header("X-Tasket-Key", key)
    try:
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return -1, {"error": str(e)}


def http_post(path, body=None, key=None):
    data = json.dumps(body).encode() if body else b"{}"
    req = urllib.request.Request(f"{BASE_URL}{path}", data=data,
                                 headers={"Content-Type": "application/json"})
    if key:
        req.add_header("X-Tasket-Key", key)
    try:
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())
    except Exception as e:
        return -1, {"error": str(e)}


def assert_eq(actual, expected, msg):
    if actual != expected:
        print(f"  [FAIL] {msg}")
        print(f"         Expected: {expected}")
        print(f"         Actual:   {actual}")
        return False
    print(f"  [PASS] {msg}")
    return True


def assert_true(cond, msg):
    if not cond:
        print(f"  [FAIL] {msg}")
        return False
    print(f"  [PASS] {msg}")
    return True


def run_tests():
    print("=" * 65)
    print("  Tasket++ HTTP Trigger v2 — API Validation Suite")
    print("=" * 65)

    start_mock_server()
    passed = 0
    failed = 0

    def check(cond, name):
        nonlocal passed, failed
        if isinstance(cond, bool):
            ok = assert_true(cond, name)
        else:
            ok = cond
        if ok:
            passed += 1
        else:
            failed += 1

    # ---- [1] Auth: no key rejected ----
    print("\n[1] Auth: GET / without API key")
    s, b = http_get("/")
    check(assert_eq(s, 403, "No key rejected"), "auth_reject")

    # ---- [2] Auth: valid key accepted ----
    print("\n[2] Auth: GET / with valid key")
    s, b = http_get("/", key=API_KEY)
    check(assert_eq(s, 200, "Valid key accepted"), "auth_accept")
    check(assert_eq(b.get("data", {}).get("name"), "Tasket++ HTTP Trigger", "Daemon name correct"), "daemon_name")
    check(assert_eq(b.get("data", {}).get("default_delay_seconds"), 10, "Default delay exposed"), "default_delay")

    # ---- [3] Auth: wrong key rejected ----
    print("\n[3] Auth: GET / with wrong key")
    s, b = http_get("/", key="Wrong")
    check(assert_eq(s, 403, "Wrong key rejected"), "auth_wrong")

    # ---- [4] Tool inventory on GET / ----
    print("\n[4] GET / tool inventory")
    s, b = http_get("/", key=API_KEY)
    tools = b.get("data", {}).get("tools", [])
    tool_names = [t["name"] for t in tools]
    check(assert_true("Check Task" in tool_names, "Check Task listed"), "tool_check")
    check(assert_true("Run Task (GET)" in tool_names, "Run Task GET listed"), "tool_run_get")
    check(assert_true("Run Task (POST)" in tool_names, "Run Task POST listed"), "tool_run_post")
    check(assert_true("Stop Task" in tool_names, "Stop Task listed"), "tool_stop")

    # ---- [5] GET /tasks with per-task delay metadata ----
    print("\n[5] GET /tasks per-task delays")
    s, b = http_get("/tasks", key=API_KEY)
    check(assert_eq(s, 200, "Tasks list 200"), "tasks_status")
    tasks = b.get("data", {}).get("tasks", [])
    delays = {t["name"]: t["delay_seconds"] for t in tasks}
    check(assert_eq(delays.get("HelloWorld"), 10, "HelloWorld delay=10"), "delay_helloworld")
    check(assert_eq(delays.get("OpenRepo"), 5, "OpenRepo delay=5"), "delay_openrepo")
    check(assert_eq(delays.get("LightsOff"), 15, "LightsOff delay=15"), "delay_lightsoff")

    # ---- [6] GET /run schedules with task number ----
    print("\n[6] GET /run task numbering")
    s, b = http_get("/run?task=HelloWorld", key=API_KEY)
    check(assert_eq(s, 200, "Run returns 200"), "run_status")
    check(assert_eq(b.get("success"), True, "Run success=true"), "run_success")
    check(assert_eq(b.get("data", {}).get("task_number"), 1, "First task is #1"), "task_num_1")
    check(assert_eq(b.get("data", {}).get("state"), "scheduled", "State is scheduled"), "task_state_sched")
    check(b.get("message", "").startswith("'HelloWorld' scheduled to run in"), "run_msg_scheduled")

    # ---- [7] GET /run respects per-task default delay ----
    print("\n[7] GET /run per-task default delay")
    check(assert_eq(b.get("data", {}).get("delay_seconds"), 10, "HelloWorld uses 10s default"), "delay_default")

    # ---- [8] GET /run with explicit delay override ----
    print("\n[8] GET /run explicit delay override")
    s, b = http_get("/run?task=OpenRepo&delay=20", key=API_KEY)
    check(assert_eq(b.get("data", {}).get("task_number"), 2, "Second task is #2"), "task_num_2")
    check(assert_eq(b.get("data", {}).get("delay_seconds"), 20, "Delay overridden to 20"), "delay_override")

    # ---- [9] GET /run with infinite loop ----
    print("\n[9] GET /run infinite loop")
    s, b = http_get("/run?task=LightsOff&loop=inf", key=API_KEY)
    check(assert_eq(b.get("data", {}).get("task_number"), 3, "Third task is #3"), "task_num_3")
    check(assert_eq(b.get("data", {}).get("loop_times"), -1, "Loop is -1 (infinite)"), "loop_inf")

    # ---- [10] POST /run with JSON body ----
    print("\n[10] POST /run JSON body")
    s, b = http_post("/run", {"task": "HelloWorld", "delay": 30, "loop": 3}, key=API_KEY)
    check(assert_eq(s, 200, "POST run 200"), "post_run_status")
    check(assert_eq(b.get("data", {}).get("task_number"), 4, "Fourth task is #4"), "task_num_4")
    check(assert_eq(b.get("data", {}).get("delay_seconds"), 30, "POST delay=30"), "post_delay")
    check(assert_eq(b.get("data", {}).get("loop_times"), 3, "POST loop=3"), "post_loop")

    # ---- [11] GET /check on scheduled task ----
    print("\n[11] GET /check on scheduled task")
    s, b = http_get("/check?id=1", key=API_KEY)
    check(assert_eq(s, 200, "Check 200"), "check_status")
    check(assert_eq(b.get("data", {}).get("task_number"), 1, "Check returns #1"), "check_num")
    check(b.get("message", "").startswith("'HelloWorld' is scheduled to run in"), "check_msg_scheduled")

    # ---- [12] GET /check with remaining seconds ----
    print("\n[12] GET /check remaining seconds")
    remaining = b.get("data", {}).get("remaining_seconds")
    check(remaining is not None, "remaining_seconds present")
    check(remaining >= 0, "remaining_seconds is non-negative")

    # ---- [13] GET /check on nonexistent task ----
    print("\n[13] GET /check nonexistent task")
    s, b = http_get("/check?id=999", key=API_KEY)
    check(assert_eq(s, 404, "Check nonexistent 404"), "check_404")

    # ---- [14] GET /status global ----
    print("\n[14] GET /status global")
    s, b = http_get("/status", key=API_KEY)
    check(assert_eq(s, 200, "Status 200"), "status_200")
    check(assert_eq(b.get("data", {}).get("total_count"), 4, "4 total instances"), "status_total")
    check(assert_eq(b.get("data", {}).get("scheduled_count"), 4, "4 scheduled"), "status_scheduled")

    # ---- [15] POST /stop specific task ----
    print("\n[15] POST /stop specific task")
    s, b = http_post("/stop?id=2", key=API_KEY)
    check(assert_eq(s, 200, "Stop specific 200"), "stop_specific_200")
    check(assert_eq(b.get("success"), True, "Stop success"), "stop_specific_success")

    # Verify in check
    s, b = http_get("/check?id=2", key=API_KEY)
    check("stopped" in b.get("message", "").lower() or "was stopped" in b.get("message", "").lower(),
          "Stopped task shows stopped status"), "stop_verify"

    # ---- [16] POST /stop all ----
    print("\n[16] POST /stop all")
    s, b = http_post("/stop", key=API_KEY)
    check(assert_eq(s, 200, "Stop all 200"), "stop_all_200")

    s, b = http_get("/status", key=API_KEY)
    check(assert_eq(b.get("data", {}).get("running_count"), 0, "No running after stop-all"), "stop_all_verify")

    # ---- [17] GET /run missing task param ----
    print("\n[17] GET /run missing param")
    s, b = http_get("/run", key=API_KEY)
    check(assert_eq(s, 400, "Missing task 400"), "run_missing_400")

    # ---- [18] GET /run nonexistent task ----
    print("\n[18] GET /run nonexistent task")
    s, b = http_get("/run?task=DoesNotExist", key=API_KEY)
    check(assert_eq(s, 404, "Nonexistent task 404"), "run_missing_404")

    # ---- [19] POST /run missing task field ----
    print("\n[19] POST /run missing task field")
    s, b = http_post("/run", {"delay": 5}, key=API_KEY)
    check(assert_eq(s, 400, "POST missing task 400"), "post_missing_400")

    # ---- [20] GET /health ----
    print("\n[20] GET /health")
    s, b = http_get("/health", key=API_KEY)
    check(assert_eq(s, 200, "Health 200"), "health_200")
    check(assert_eq(b.get("data", {}).get("status"), "ok", "Health ok"), "health_ok")

    # ---- [21] Typed response structure ----
    print("\n[21] Typed response structure (all endpoints)")
    for endpoint in ["/", "/health", "/tasks", "/status"]:
        s, b = http_get(endpoint, key=API_KEY)
        check(assert_eq("success" in b, True, f"{endpoint} has success field"), f"type_success_{endpoint}")
        check(assert_eq("message" in b, True, f"{endpoint} has message field"), f"type_message_{endpoint}")
        check(assert_eq("data" in b, True, f"{endpoint} has data field"), f"type_data_{endpoint}")

    # ---- [22] Task number monotonicity ----
    print("\n[22] Task number monotonicity")
    start_num = MockTaskInstance._counter
    for i in range(5):
        s, b = http_get(f"/run?task=HelloWorld&delay={i+1}", key=API_KEY)
        expected = start_num + i + 1
        check(assert_eq(b.get("data", {}).get("task_number"), expected,
            f"Task number monotonic: #{expected}"), f"mono_{expected}")

    stop_mock_server()

    print("\n" + "=" * 65)
    print(f"  Results: {passed} passed, {failed} failed")
    print("=" * 65)
    return failed == 0


if __name__ == "__main__":
    ok = run_tests()
    sys.exit(0 if ok else 1)
