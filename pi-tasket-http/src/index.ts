/**
 * pi-tasket-http — Tasket++ HTTP Trigger tools for pi-coding-agent.
 *
 * Extension entry point. Registers 6 tools for remote control of a
 * Tasket++ HTTP Daemon: ping, list, run, check, stop, status.
 *
 * Tools use the TASKET_HTTP_URL and TASKET_HTTP_KEY environment variables
 * for default connectivity, or accept baseUrl/apiKey per-call.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  registerPingTool,
  registerListTool,
  registerRunTool,
  registerCheckTool,
  registerStopTool,
  registerStatusTool,
} from "./tools/tasket-http.js";

export default function activate(pi: ExtensionAPI): void {
  registerPingTool(pi);
  registerListTool(pi);
  registerRunTool(pi);
  registerCheckTool(pi);
  registerStopTool(pi);
  registerStatusTool(pi);
}

// Re-export types and client for programmatic use
export { TasketClient, getTasketClient, clearClientCache, TasketHttpError } from "./client/tasket-client.js";
export type {
  TasketDaemonInfo,
  TaskDescriptor,
  TaskListResponse,
  ScheduledTask,
  ScheduleResponse,
  CheckResponse,
  StatusResponse,
  TasketClientConfig,
} from "./client/tasket-client.js";
