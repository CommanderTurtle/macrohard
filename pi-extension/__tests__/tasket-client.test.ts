/**
 * Unit tests for the Tasket HTTP client.
 *
 * These tests mock the daemon's HTTP responses so they run without
 * a real Tasket++ HTTP Trigger daemon.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TasketClient, TasketHttpError, getTasketClient, clearClientCache } from "../src/client/tasket-client.js";

describe("TasketClient", () => {
  let client: TasketClient;

  beforeEach(() => {
    client = new TasketClient({ baseUrl: "http://test:7777", apiKey: "test-key" });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearClientCache();
  });

  function mockFetch(response: { status: number; json: Record<string, unknown> }) {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.json,
    } as Response);
  }

  // ---------------------------------------------------------------------------
  // ping / info
  // ---------------------------------------------------------------------------

  it("info() returns daemon metadata", async () => {
    mockFetch({
      status: 200,
      json: {
        success: true,
        message: "ok",
        data: {
          name: "Tasket++ HTTP Trigger",
          version: "1.7.1",
          listen_address: "http://0.0.0.0:7777",
          tasks_directory: "./saved_tasks",
          auth_enabled: true,
          default_delay_seconds: 10,
          tools: [{ name: "Run Task", endpoint: "/run", method: "GET", description: "", example: "" }],
        },
      },
    });

    const info = await client.info();
    expect(info.name).toBe("Tasket++ HTTP Trigger");
    expect(info.version).toBe("1.7.1");
    expect(info.auth_enabled).toBe(true);
    expect(info.tools.length).toBe(1);
  });

  it("health() returns status", async () => {
    mockFetch({ status: 200, json: { success: true, message: "ok", data: { status: "ok" } } });
    const h = await client.health();
    expect(h.status).toBe("ok");
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------

  it("listTasks() returns task descriptors", async () => {
    mockFetch({
      status: 200,
      json: {
        success: true,
        message: "Found 2 task(s)",
        data: {
          tasks: [
            { name: "HelloWorld", delay_seconds: 10, description: "A greeting" },
            { name: "OpenRepo", delay_seconds: 5, description: "Open browser" },
          ],
          count: 2,
        },
      },
    });

    const list = await client.listTasks();
    expect(list.count).toBe(2);
    expect(list.tasks[0].name).toBe("HelloWorld");
    expect(list.tasks[0].delay_seconds).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // schedule
  // ---------------------------------------------------------------------------

  it("schedule() sends GET /run and returns task number", async () => {
    mockFetch({
      status: 200,
      json: {
        success: true,
        message: "'HelloWorld' scheduled to run in 10s : success",
        data: {
          task_number: 1,
          name: "HelloWorld",
          state: "scheduled",
          delay_seconds: 10,
          loop_times: 1,
        },
      },
    });

    const result = await client.schedule("HelloWorld", { delay: 10 });
    expect(result.task_number).toBe(1);
    expect(result.state).toBe("scheduled");
    expect(result.delay_seconds).toBe(10);

    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toContain("/run?task=HelloWorld&delay=10");
    expect((init?.headers as Record<string, string>)["X-Tasket-Key"]).toBe("test-key");
  });

  it("schedule() supports infinite loop", async () => {
    mockFetch({
      status: 200,
      json: {
        success: true,
        message: "ok",
        data: { task_number: 2, name: "Macro", state: "scheduled", delay_seconds: 10, loop_times: -1 },
      },
    });

    const result = await client.schedule("Macro", { loop: "inf" });
    expect(result.loop_times).toBe(-1);

    const [url] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toContain("loop=inf");
  });

  // ---------------------------------------------------------------------------
  // check
  // ---------------------------------------------------------------------------

  it("check() returns task status with remaining seconds", async () => {
    mockFetch({
      status: 200,
      json: {
        success: true,
        message: "'HelloWorld' is scheduled to run in ~5s",
        data: {
          task_number: 1,
          name: "HelloWorld",
          state: "scheduled",
          remaining_seconds: 5,
        },
      },
    });

    const result = await client.check(1);
    expect(result.state).toBe("scheduled");
    expect(result.remaining_seconds).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // stop
  // ---------------------------------------------------------------------------

  it("stop() stops a single task", async () => {
    mockFetch({
      status: 200,
      json: { success: true, message: "Task #3 'Macro' stopped" },
    });

    const result = await client.stop(3);
    expect(result.message).toContain("stopped");

    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toContain("/stop?id=3");
    expect(init?.method).toBe("POST");
  });

  it("stopAll() stops all tasks", async () => {
    mockFetch({
      status: 200,
      json: { success: true, message: "All active tasks stopped" },
    });

    const result = await client.stopAll();
    expect(result.message).toContain("All active");

    const [url] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toBe("http://test:7777/stop");
  });

  // ---------------------------------------------------------------------------
  // status
  // ---------------------------------------------------------------------------

  it("status() returns full daemon status", async () => {
    mockFetch({
      status: 200,
      json: {
        success: true,
        message: "ok",
        data: {
          scheduled: [{ task_number: 1, name: "A" }],
          running: [],
          finished: [{ task_number: 2, name: "B" }],
          scheduled_count: 1,
          running_count: 0,
          finished_count: 1,
          total_count: 2,
        },
      },
    });

    const s = await client.status();
    expect(s.total_count).toBe(2);
    expect(s.running_count).toBe(0);
    expect(s.scheduled_count).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // errors
  // ---------------------------------------------------------------------------

  it("throws TasketHttpError on HTTP error", async () => {
    mockFetch({
      status: 404,
      json: { success: false, message: "Task not found", data: {} },
    });

    await expect(client.check(999)).rejects.toBeInstanceOf(TasketHttpError);
  });

  it("throws TasketHttpError on fetch failure", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(client.health()).rejects.toBeInstanceOf(TasketHttpError);
  });

  // ---------------------------------------------------------------------------
  // client cache
  // ---------------------------------------------------------------------------

  it("getTasketClient returns cached client for same config", () => {
    clearClientCache();

    const a = getTasketClient({ baseUrl: "http://a:7777" });
    const b = getTasketClient({ baseUrl: "http://a:7777" });
    expect(a).toBe(b);

    const c = getTasketClient({ baseUrl: "http://b:7777" });
    expect(c).not.toBe(a);
  });

  it("getTasketClient caches separate instances for different apiKeys", () => {
    clearClientCache();

    const a = getTasketClient({ baseUrl: "http://a:7777", apiKey: "key1" });
    const b = getTasketClient({ baseUrl: "http://a:7777", apiKey: "key2" });
    expect(a).not.toBe(b);
  });
});
