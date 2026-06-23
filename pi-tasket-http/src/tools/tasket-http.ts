/**
 * Tasket++ HTTP Trigger tools for pi-coding-agent.
 *
 * These tools allow the agent to remotely control a Tasket++ HTTP Daemon
 * running on a Windows machine. The daemon executes saved .scht automation
 * macros (keystrokes, pastes, mouse movements, system commands) via HTTP.
 *
 * 5 tools:
 *   tasket-ping    — discover / health-check the daemon
 *   tasket-list    — browse available macros
 *   tasket-run     — schedule a macro with optional delay
 *   tasket-check   — query task status by number
 *   tasket-stop    — stop a task or all tasks
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  AgentToolResult,
  AgentToolUpdateCallback,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import {
  TasketClient,
  getTasketClient,
  TasketHttpError,
} from "../client/tasket-client.js";

// ============================================================================
// Tool details interfaces
// ============================================================================

export interface TasketToolDetails {
  success: boolean;
  error?: string;
  baseUrl?: string;
  taskName?: string;
  taskNumber?: number;
  state?: string;
  message?: string;
}

// ============================================================================
// Shared helpers
// ============================================================================

/** Resolve baseUrl from explicit param, env var, or session tag */
function resolveBaseUrl(explicit?: string): string {
  if (explicit) return explicit;
  const env = process.env.TASKET_HTTP_URL;
  if (env) return env;
  // Default LAN assumption
  return "http://192.168.1.50:7777";
}

function resolveApiKey(explicit?: string): string | undefined {
  if (explicit) return explicit;
  return process.env.TASKET_HTTP_KEY;
}

function makeClient(
  baseUrl?: string,
  apiKey?: string
): { client: TasketClient; baseUrl: string; apiKey: string | undefined } {
  const url = resolveBaseUrl(baseUrl);
  const key = resolveApiKey(apiKey);
  return { client: getTasketClient({ baseUrl: url, apiKey: key }), baseUrl: url, apiKey: key };
}

function ok(text: string, details: TasketToolDetails): AgentToolResult<TasketToolDetails> {
  return { content: [{ type: "text", text }], details };
}

function fail(text: string, details: TasketToolDetails): AgentToolResult<TasketToolDetails> {
  return { content: [{ type: "text", text }], details: { ...details, success: false } };
}

/** Format a TasketHttpError into a friendly string */
function formatError(err: unknown): string {
  if (err instanceof TasketHttpError) {
    return `Tasket daemon error: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ============================================================================
// Render helpers (shared visual style)
// ============================================================================

function renderTitle(label: string, args: Record<string, unknown>, theme: Theme) {
  const detail = args.task
    ? theme.fg("accent", String(args.task))
    : args.task_number
      ? theme.fg("accent", `#${args.task_number}`)
      : "";
  return new Text(theme.fg("toolTitle", theme.bold(`${label} `)) + detail, 0, 0);
}

function renderResult(
  result: AgentToolResult<TasketToolDetails>,
  options: ToolRenderResultOptions,
  theme: Theme
) {
  const text = result.content[0]?.type === "text" ? result.content[0].text : "";
  if (!result.details?.success) return new Text(theme.fg("error", text), 0, 0);
  if (!options.expanded) {
    const first = text.split("\n")[0].slice(0, 120);
    const n = text.split("\n").length;
    return new Text(theme.fg("toolOutput", first) + (n > 1 ? theme.fg("muted", ` (${n} lines)`) : ""), 0, 0);
  }
  return new Text(theme.fg("toolOutput", text), 0, 0);
}

// ============================================================================
// Tool 1: tasket-ping
// ============================================================================

const pingParams = Type.Object({
  baseUrl: Type.Optional(Type.String({ description: "Daemon URL. Default: TASKET_HTTP_URL env var or http://192.168.1.50:7777" })),
  apiKey: Type.Optional(Type.String({ description: "X-Tasket-Key auth token. Default: TASKET_HTTP_KEY env var" })),
});

export function registerPingTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "tasket-ping",
    label: "Tasket Ping",
    description: `Ping a Tasket++ HTTP Trigger daemon to verify it is reachable and get its info.

Use this first when you need to interact with a Tasket daemon. It returns the daemon version, task count, and available endpoints. If no baseUrl is provided, the tool uses the TASKET_HTTP_URL environment variable, then falls back to the common LAN address.

Environment variables: TASKET_HTTP_URL, TASKET_HTTP_KEY`,
    parameters: pingParams,
    renderCall: (args, theme) => renderTitle("tasket-ping", args, theme),
    renderResult,

    async execute(_id, params, _signal, _onUpdate) {
      const { client, baseUrl } = makeClient(params.baseUrl, params.apiKey);
      try {
        const info = await client.info();
        const tasks = info.tools.map((t) => `  • ${t.name} — ${t.endpoint}`).join("\n");
        return ok(
          `Tasket++ HTTP Trigger ${info.version} at ${info.listen_address}\nTasks dir: ${info.tasks_directory}\nAuth: ${info.auth_enabled ? "enabled" : "none"}\nDefault delay: ${info.default_delay_seconds}s\n\nAvailable endpoints:\n${tasks}`,
          { success: true, baseUrl }
        );
      } catch (err) {
        return fail(`Cannot reach Tasket daemon at ${baseUrl}: ${formatError(err)}`, { success: false, baseUrl, error: formatError(err) });
      }
    },
  });
}

// ============================================================================
// Tool 2: tasket-list
// ============================================================================

const listParams = Type.Object({
  baseUrl: Type.Optional(Type.String({ description: "Daemon URL. Default: TASKET_HTTP_URL env var or http://192.168.1.50:7777" })),
  apiKey: Type.Optional(Type.String({ description: "X-Tasket-Key auth token. Default: TASKET_HTTP_KEY env var" })),
});

export function registerListTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "tasket-list",
    label: "Tasket List",
    description: `List all available automation macros (.scht files) on the Tasket daemon. Returns each macro's name, default delay, and description. Use this to discover what tasks can be run before calling tasket-run.`,
    parameters: listParams,
    renderCall: (args, theme) => renderTitle("tasket-list", args, theme),
    renderResult,

    async execute(_id, params, _signal, _onUpdate) {
      const { client, baseUrl } = makeClient(params.baseUrl, params.apiKey);
      try {
        const list = await client.listTasks();
        if (list.count === 0) {
          return ok("No macros found on the daemon.", { success: true, baseUrl });
        }
        const lines = list.tasks.map((t) => `  • ${t.name} (delay: ${t.delay_seconds}s) — ${t.description || "no description"}`).join("\n");
        return ok(`${list.count} macro(s) available:\n${lines}`, { success: true, baseUrl });
      } catch (err) {
        return fail(formatError(err), { success: false, baseUrl, error: formatError(err) });
      }
    },
  });
}

// ============================================================================
// Tool 3: tasket-run
// ============================================================================

const runParams = Type.Object({
  task: Type.String({ description: "Macro name to execute (without .scht extension)" }),
  delay: Type.Optional(Type.Number({ description: "Seconds to wait before running. Overrides the macro's default." })),
  loop: Type.Optional(Type.Union([
    Type.Number({ description: "Number of executions (default: 1)" }),
    Type.String({ description: 'Use "inf" for infinite loop' }),
  ])),
  baseUrl: Type.Optional(Type.String({ description: "Daemon URL. Default: TASKET_HTTP_URL env var or http://192.168.1.50:7777" })),
  apiKey: Type.Optional(Type.String({ description: "X-Tasket-Key auth token. Default: TASKET_HTTP_KEY env var" })),
});

export function registerRunTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "tasket-run",
    label: "Tasket Run",
    description: `Schedule a Tasket++ automation macro to run after its configured delay (default 10s, overridable). Returns a task number you can use with tasket-check to monitor progress.

DELAY: If you want the macro to run immediately, set delay=0. Otherwise the daemon waits N seconds before executing, giving you time to prepare the target window.

LOOP: Set loop=3 to run 3 times, or loop="inf" for infinite. Use tasket-stop to cancel.

The daemon must already be running. Use tasket-ping to verify connectivity.`,
    parameters: runParams,
    renderCall: (args, theme) => {
      const task = theme.fg("accent", args.task);
      const delay = args.delay !== undefined ? theme.fg("muted", ` delay=${args.delay}s`) : "";
      return new Text(theme.fg("toolTitle", theme.bold("tasket-run ")) + task + delay, 0, 0);
    },
    renderResult,

    async execute(_id, params, _signal, _onUpdate) {
      const { client, baseUrl } = makeClient(params.baseUrl, params.apiKey);
      try {
        const loopVal = params.loop;
        const loop: number | "inf" | undefined =
          typeof loopVal === "string" && loopVal.toLowerCase() === "inf"
            ? "inf"
            : typeof loopVal === "number"
              ? loopVal
              : undefined;

        const result = await client.schedule(params.task, {
          delay: params.delay,
          loop,
        });

        return ok(
          `Scheduled '${result.name}' (#${result.task_number}) — state: ${result.state}, delay: ${result.delay_seconds}s${result.loop_times < 0 ? ", loop: infinite" : result.loop_times > 1 ? ", loop: " + result.loop_times : ""}\n\nUse tasket-check task_number=${result.task_number} to monitor.`,
          { success: true, baseUrl, taskName: result.name, taskNumber: result.task_number, state: result.state }
        );
      } catch (err) {
        return fail(formatError(err), { success: false, baseUrl, error: formatError(err) });
      }
    },
  });
}

// ============================================================================
// Tool 4: tasket-check
// ============================================================================

const checkParams = Type.Object({
  task_number: Type.Number({ description: "Task number returned by tasket-run" }),
  baseUrl: Type.Optional(Type.String({ description: "Daemon URL. Default: TASKET_HTTP_URL env var or http://192.168.1.50:7777" })),
  apiKey: Type.Optional(Type.String({ description: "X-Tasket-Key auth token. Default: TASKET_HTTP_KEY env var" })),
});

export function registerCheckTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "tasket-check",
    label: "Tasket Check",
    description: `Check the status of a scheduled or running macro by its task number. Returns the current state (scheduled, running, finished, stopped, failed) and a human-readable message including remaining time if still waiting.

Call this after tasket-run to track progress. If the task is scheduled, the response includes approximately how many seconds remain. If running, it shows elapsed time. If finished, the macro completed successfully.

States:\n  scheduled — waiting for delay timer\n  running   — TaskThread is executing actions\n  finished  — all actions completed\n  stopped   — cancelled by user\n  failed    — error during execution`,
    parameters: checkParams,
    renderCall: (args, theme) => renderTitle("tasket-check", args, theme),
    renderResult,

    async execute(_id, params, _signal, _onUpdate) {
      const { client, baseUrl } = makeClient(params.baseUrl, params.apiKey);
      try {
        const result = await client.check(params.task_number);
        const remaining =
          result.remaining_seconds !== undefined
            ? ` (~${result.remaining_seconds}s remaining)`
            : "";
        return ok(
          `Task #${result.task_number} '${result.name}' — ${result.state}${remaining}`,
          { success: true, baseUrl, taskName: result.name, taskNumber: result.task_number, state: result.state }
        );
      } catch (err) {
        return fail(formatError(err), { success: false, baseUrl, error: formatError(err) });
      }
    },
  });
}

// ============================================================================
// Tool 5: tasket-stop
// ============================================================================

const stopParams = Type.Object({
  task_number: Type.Optional(Type.Number({ description: "Task number to stop. Omit to stop all active tasks." })),
  baseUrl: Type.Optional(Type.String({ description: "Daemon URL. Default: TASKET_HTTP_URL env var or http://192.168.1.50:7777" })),
  apiKey: Type.Optional(Type.String({ description: "X-Tasket-Key auth token. Default: TASKET_HTTP_KEY env var" })),
});

export function registerStopTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "tasket-stop",
    label: "Tasket Stop",
    description: `Stop a running or scheduled macro. Provide a task_number to stop a single task, or omit it to stop every active task on the daemon.

This is useful for cancelling long-running or infinite-loop macros. The stopped task's state becomes 'stopped' and can still be checked with tasket-check.`,
    parameters: stopParams,
    renderCall: (args, theme) => renderTitle("tasket-stop", args, theme),
    renderResult,

    async execute(_id, params, _signal, _onUpdate) {
      const { client, baseUrl } = makeClient(params.baseUrl, params.apiKey);
      try {
        if (params.task_number !== undefined) {
          const result = await client.stop(params.task_number);
          return ok(result.message, { success: true, baseUrl, taskNumber: params.task_number });
        } else {
          const result = await client.stopAll();
          return ok(result.message, { success: true, baseUrl });
        }
      } catch (err) {
        return fail(formatError(err), { success: false, baseUrl, error: formatError(err) });
      }
    },
  });
}

// ============================================================================
// Tool 6: tasket-status
// ============================================================================

const statusParams = Type.Object({
  baseUrl: Type.Optional(Type.String({ description: "Daemon URL. Default: TASKET_HTTP_URL env var or http://192.168.1.50:7777" })),
  apiKey: Type.Optional(Type.String({ description: "X-Tasket-Key auth token. Default: TASKET_HTTP_KEY env var" })),
});

export function registerStatusTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "tasket-status",
    label: "Tasket Status",
    description: `Get a full overview of all tasks on the daemon: scheduled (waiting), running (executing), and finished (completed or failed). Shows counts for each category. Use this for a bird's-eye view of daemon activity.`,
    parameters: statusParams,
    renderCall: (args, theme) => renderTitle("tasket-status", args, theme),
    renderResult,

    async execute(_id, params, _signal, _onUpdate) {
      const { client, baseUrl } = makeClient(params.baseUrl, params.apiKey);
      try {
        const s = await client.status();
        const lines: string[] = [
          `Total tasks: ${s.total_count}`,
          `  Scheduled: ${s.scheduled_count}`,
          `  Running:   ${s.running_count}`,
          `  Finished:  ${s.finished_count}`,
        ];
        if (s.running.length > 0) {
          lines.push("\nRunning tasks:");
          s.running.forEach((t: Record<string, unknown>) => {
            lines.push(`  #${t.task_number} '${t.name}'`);
          });
        }
        return ok(lines.join("\n"), { success: true, baseUrl });
      } catch (err) {
        return fail(formatError(err), { success: false, baseUrl, error: formatError(err) });
      }
    },
  });
}
