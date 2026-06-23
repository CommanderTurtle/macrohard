/**
 * Tasket++ HTTP Trigger — typed HTTP client.
 *
 * Wraps fetch() with consistent error handling and typed responses
 * matching the daemon's ApiResponse format:
 *   { success: boolean, message: string, data?: Record<string, unknown> }
 */

export interface TasketDaemonInfo {
  name: string;
  version: string;
  listen_address: string;
  tasks_directory: string;
  auth_enabled: boolean;
  default_delay_seconds: number;
  tools: Array<{
    name: string;
    description: string;
    endpoint: string;
    method: string;
    example: string;
  }>;
}

export interface TaskDescriptor {
  name: string;
  delay_seconds: number;
  description: string;
}

export interface TaskListResponse {
  tasks: TaskDescriptor[];
  count: number;
}

export interface ScheduledTask {
  task_number: number;
  name: string;
  state: string;
  delay_seconds: number;
  loop_times: number;
  scheduled_at: string;
  remaining_seconds?: number;
}

export interface ScheduleResponse {
  task_number: number;
  name: string;
  state: string;
  delay_seconds: number;
  loop_times: number;
}

export interface CheckResponse {
  task_number: number;
  name: string;
  state: string;
  remaining_seconds?: number;
}

export interface StatusResponse {
  scheduled: Array<Record<string, unknown>>;
  running: Array<Record<string, unknown>>;
  finished: Array<Record<string, unknown>>;
  scheduled_count: number;
  running_count: number;
  finished_count: number;
  total_count: number;
}

export interface TasketClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

interface ApiEnvelope {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export class TasketClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;

  constructor(config: TasketClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  /** Build a URL from the daemon's info endpoint */
  static fromInfo(infoText: string, apiKey?: string): TasketClient | null {
    const m = infoText.match(/listen_address["']?\s*[:=]\s*["']([^"']+)["']/);
    if (m) return new TasketClient({ baseUrl: m[1], apiKey });
    // Fallback: try to detect a URL in the text
    const urlMatch = infoText.match(/(https?:\/\/[^\s"']+)/);
    if (urlMatch) return new TasketClient({ baseUrl: urlMatch[1], apiKey });
    return null;
  }

  /** Return headers common to all requests */
  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) h["X-Tasket-Key"] = this.apiKey;
    return h;
  }

  /** Execute fetch with timeout */
  private async fetch(path: string, init?: RequestInit): Promise<ApiEnvelope> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { ...this.headers(), ...(init?.headers ?? {}) },
      });
      clearTimeout(timeoutId);

      const body = (await response.json()) as ApiEnvelope;
      if (!response.ok || !body.success) {
        throw new TasketHttpError(
          body.message || `HTTP ${response.status}`,
          response.status,
          body
        );
      }
      return body;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof TasketHttpError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new TasketHttpError(
          `Request timed out after ${this.timeoutMs}ms`,
          0,
          undefined
        );
      }
      throw new TasketHttpError(
        err instanceof Error ? err.message : String(err),
        0,
        undefined
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** GET / — daemon info + tool inventory */
  async info(): Promise<TasketDaemonInfo> {
    const env = await this.fetch("/");
    return env.data as TasketDaemonInfo;
  }

  /** GET /health — lightweight ping */
  async health(): Promise<{ status: string }> {
    const env = await this.fetch("/health");
    return (env.data ?? {}) as { status: string };
  }

  /** GET /tasks — list macros + their default delays */
  async listTasks(): Promise<TaskListResponse> {
    const env = await this.fetch("/tasks");
    return env.data as TaskListResponse;
  }

  /** GET /run — schedule a macro */
  async schedule(
    name: string,
    opts: { delay?: number; loop?: number | "inf" } = {}
  ): Promise<ScheduleResponse> {
    const params = new URLSearchParams({ task: name });
    if (opts.delay !== undefined) params.set("delay", String(opts.delay));
    if (opts.loop !== undefined) {
      params.set("loop", typeof opts.loop === "string" ? opts.loop : String(opts.loop));
    }
    const env = await this.fetch(`/run?${params.toString()}`);
    return env.data as ScheduleResponse;
  }

  /** POST /run — schedule via JSON body */
  async schedulePost(
    name: string,
    opts: { delay?: number; loop?: number | "inf" } = {}
  ): Promise<ScheduleResponse> {
    const body: Record<string, unknown> = { task: name };
    if (opts.delay !== undefined) body.delay = opts.delay;
    if (opts.loop !== undefined) body.loop = opts.loop;
    const env = await this.fetch("/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return env.data as ScheduleResponse;
  }

  /** GET /check?id=N — query task status */
  async check(taskNumber: number): Promise<CheckResponse> {
    const env = await this.fetch(`/check?id=${taskNumber}`);
    return env.data as CheckResponse;
  }

  /** GET /status — global status */
  async status(): Promise<StatusResponse> {
    const env = await this.fetch("/status");
    return env.data as StatusResponse;
  }

  /** POST /stop — stop all tasks */
  async stopAll(): Promise<{ message: string }> {
    const env = await this.fetch("/stop", { method: "POST" });
    return { message: env.message };
  }

  /** POST /stop?id=N — stop one task */
  async stop(taskNumber: number): Promise<{ message: string }> {
    const env = await this.fetch(`/stop?id=${taskNumber}`, { method: "POST" });
    return { message: env.message };
  }
}

/** Typed error from the Tasket++ HTTP daemon */
export class TasketHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: ApiEnvelope | undefined
  ) {
    super(message);
    this.name = "TasketHttpError";
  }
}

/** Global client cache keyed by baseUrl so repeated tool calls reuse the same instance */
const clientCache = new Map<string, TasketClient>();

export function getTasketClient(config: TasketClientConfig): TasketClient {
  const key = `${config.baseUrl}::${config.apiKey ?? ""}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, new TasketClient(config));
  }
  return clientCache.get(key)!;
}

export function clearClientCache(): void {
  clientCache.clear();
}
