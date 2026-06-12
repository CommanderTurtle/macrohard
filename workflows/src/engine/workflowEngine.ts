// ============================================================================
// Workflow Execution Engine
// ============================================================================
// Traverses a workflow graph topologically, evaluates checkpoints,
// executes macros (via HTTP trigger), and manages runtime state.

import type {
  Workflow,
  WorkflowRuntime,
  RuntimeLog,
  MacroConfig,
  CheckpointConfig,
  DataGridConfig,
  EntrypointConfig,
  WorkflowEdge,
} from "@/types/workflow";
import { evaluateCheckpoint } from "./checkpoint";

export type EngineEvent =
  | { type: "nodeStart"; nodeId: string; nodeName: string }
  | { type: "nodeComplete"; nodeId: string; output?: string }
  | { type: "nodeFail"; nodeId: string; error: string }
  | { type: "checkpointResult"; nodeId: string; result: boolean; details: string }
  | { type: "macroScheduled"; nodeId: string; taskNumber: number }
  | { type: "log"; log: RuntimeLog }
  | { type: "completed" }
  | { type: "stopped" }
  | { type: "failed"; error: string };

export type EngineEventHandler = (event: EngineEvent) => void;

interface EngineState {
  workflow: Workflow;
  runtime: WorkflowRuntime;
  handlers: EngineEventHandler[];
  stopped: boolean;
  tasketUrl: string;
  tasketKey?: string;
  fallbackToNative: boolean;
}

// ---------------------------------------------------------------------------
// Adjacency helpers
// ---------------------------------------------------------------------------

function getOutgoingEdges(workflow: Workflow, nodeId: string): WorkflowEdge[] {
  return workflow.edges.filter((e) => e.source === nodeId);
}

function getIncomingEdges(workflow: Workflow, nodeId: string): WorkflowEdge[] {
  return workflow.edges.filter((e) => e.target === nodeId);
}

function getNode(workflow: Workflow, nodeId: string) {
  return workflow.nodes.find((n) => n.id === nodeId);
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function log(state: EngineState, level: RuntimeLog["level"], nodeId: string, message: string) {
  const node = getNode(state.workflow, nodeId);
  const nodeName = ((node?.data as any)?.label as string) ?? nodeId;
  const entry: RuntimeLog = {
    timestamp: new Date().toISOString(),
    level,
    nodeId,
    nodeName,
    message,
  };
  state.runtime.logs.push(entry);
  emit(state, { type: "log", log: entry });
}

function emit(state: EngineState, event: EngineEvent) {
  for (const h of state.handlers) {
    try {
      h(event);
    } catch {
      /* ignore handler errors */
    }
  }
}

// ---------------------------------------------------------------------------
// Node execution
// ---------------------------------------------------------------------------

async function executeNode(state: EngineState, nodeId: string): Promise<boolean> {
  if (state.stopped) return false;

  const node = getNode(state.workflow, nodeId);
  if (!node) {
    log(state, "error", nodeId, `Node ${nodeId} not found in workflow`);
    return false;
  }

  const data = node.data as any;
  state.runtime.currentNodeId = nodeId;
  emit(state, { type: "nodeStart", nodeId, nodeName: data.label ?? nodeId });
  log(state, "info", nodeId, `Starting: ${data.label ?? nodeId}`);

  try {
    switch (node.type) {
      case "entrypoint":
        return await executeEntrypoint(state, nodeId, data.config as EntrypointConfig);
      case "checkpoint":
        return await executeCheckpoint(state, nodeId, data.config as CheckpointConfig);
      case "macro":
        return await executeMacro(state, nodeId, data.config as MacroConfig);
      case "datagrid":
        return executeDataGrid(state, nodeId, data.config as DataGridConfig);
      case "output":
        return executeOutput(state, nodeId);
      default:
        log(state, "error", nodeId, `Unknown node type: ${node.type}`);
        return false;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(state, "error", nodeId, `Execution error: ${msg}`);
    emit(state, { type: "nodeFail", nodeId, error: msg });
    return false;
  }
}

async function executeEntrypoint(
  _state: EngineState,
  nodeId: string,
  config: EntrypointConfig
): Promise<boolean> {
  // Entrypoints are resolved before execution starts
  emit(_state, {
    type: "nodeComplete",
    nodeId,
    output: _state.runtime.entrypointValues[nodeId] ?? config.defaultValue,
  });
  return true;
}

async function executeCheckpoint(
  state: EngineState,
  nodeId: string,
  config: CheckpointConfig
): Promise<boolean> {
  const ctx = {
    entrypoints: state.runtime.entrypointValues,
    grid: state.runtime.gridValues,
  };

  const { result, details } = evaluateCheckpoint(config, ctx);
  state.runtime.checkpointResults[nodeId] = result;

  const detailStr = details.map((d) => `${d.passed ? "PASS" : "FAIL"}`).join(", ");
  log(state, "info", nodeId, `Checkpoint "${config.name}": ${result ? "TRUE" : "FALSE"} (${detailStr})`);
  emit(state, { type: "checkpointResult", nodeId, result, details: detailStr });
  emit(state, { type: "nodeComplete", nodeId, output: String(result) });

  return true;
}

async function executeMacro(
  state: EngineState,
  nodeId: string,
  config: MacroConfig
): Promise<boolean> {
  log(state, "info", nodeId, `Scheduling macro "${config.name}" (delay: ${config.delay}s, loop: ${config.loop})`);

  // Call the Tasket++ HTTP daemon
  try {
    const params = new URLSearchParams({
      task: config.macroId ?? config.name,
      delay: String(config.delay),
      loop: config.loop < 0 ? "inf" : String(config.loop),
    });

    const headers: Record<string, string> = { Accept: "application/json" };
    if (state.tasketKey) headers["X-Tasket-Key"] = state.tasketKey;

    const response = await fetch(`${state.tasketUrl}/run?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${response.status}`);
    }

    const body = await response.json();
    const taskNumber = body.data?.task_number ?? "?";
    log(state, "info", nodeId, `Macro scheduled as task #${taskNumber}`);
    emit(state, { type: "macroScheduled", nodeId, taskNumber });
    emit(state, { type: "nodeComplete", nodeId, output: `Task #${taskNumber}` });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (state.fallbackToNative) {
      // Native fallback: execute actions directly in browser
      log(state, "info", nodeId, `Daemon unreachable (${msg}). Falling back to native execution.`);
      return executeMacroNative(state, nodeId, config);
    }

    // If daemon unreachable and no fallback, log warning but don't fail
    log(state, "warn", nodeId, `Daemon unreachable (${msg}). Macro "${config.name}" would run here.`);
    emit(state, { type: "nodeComplete", nodeId, output: "offline" });
    return true;
  }
}

// ---------------------------------------------------------------------------
// Native macro execution (fallback when daemon is unreachable)
// ---------------------------------------------------------------------------

async function executeMacroNative(
  state: EngineState,
  nodeId: string,
  config: MacroConfig
): Promise<boolean> {
  const macroId = config.macroId ?? config.name;
  log(state, "info", nodeId, `[Native] Executing "${macroId}" (delay: ${config.delay}s)`);

  // Apply delay
  if (config.delay > 0) {
    log(state, "info", nodeId, `[Native] Waiting ${config.delay}s...`);
    await new Promise((r) => setTimeout(r, config.delay * 1000));
    if (state.stopped) return false;
  }

  // Execute based on macroId
  const actions = config.actions;
  if (actions && actions.length > 0) {
    // Execute custom actions
    for (const action of actions) {
      if (state.stopped) return false;
      await executeNativeAction(state, nodeId, action);
    }
  } else {
    // Execute built-in macro by name
    await executeBuiltInMacro(state, nodeId, macroId);
  }

  // Handle looping
  if (config.loop > 1) {
    for (let i = 1; i < config.loop; i++) {
      if (state.stopped) return false;
      log(state, "info", nodeId, `[Native] Loop ${i + 1}/${config.loop}`);
      await executeBuiltInMacro(state, nodeId, macroId);
    }
  }

  log(state, "info", nodeId, `[Native] Macro "${macroId}" completed`);
  emit(state, { type: "nodeComplete", nodeId, output: `[Native] ${macroId}` });
  return true;
}

async function executeNativeAction(
  state: EngineState,
  nodeId: string,
  action: { type: string; params: Record<string, unknown> }
): Promise<void> {
  switch (action.type) {
    case "paste": {
      const text = String(action.params.text ?? "");
      try {
        await navigator.clipboard.writeText(text);
        log(state, "info", nodeId, `[Native] Copied to clipboard: ${text.slice(0, 50)}`);
      } catch {
        log(state, "warn", nodeId, `[Native] Clipboard write failed (permission denied)`);
      }
      break;
    }
    case "wait": {
      const ms = Number(action.params.ms ?? 1000);
      await new Promise((r) => setTimeout(r, ms));
      break;
    }
    case "keys": {
      const keys = String(action.params.keys ?? "");
      log(state, "info", nodeId, `[Native] Keystroke: ${keys} (browser cannot simulate keys)`);
      break;
    }
    case "cursor": {
      const x = Number(action.params.x ?? 0);
      const y = Number(action.params.y ?? 0);
      log(state, "info", nodeId, `[Native] Cursor move to (${x}, ${y}) (browser cannot move cursor)`);
      break;
    }
    case "system": {
      const command = String(action.params.command ?? "");
      if (command.startsWith("http://") || command.startsWith("https://")) {
        window.open(command, "_blank");
        log(state, "info", nodeId, `[Native] Opened URL: ${command}`);
      } else {
        log(state, "info", nodeId, `[Native] System command: ${command}`);
      }
      break;
    }
    case "runOther": {
      const otherMacro = String(action.params.macroId ?? "");
      log(state, "info", nodeId, `[Native] Would run macro: ${otherMacro}`);
      break;
    }
    default:
      log(state, "warn", nodeId, `[Native] Unknown action type: ${action.type}`);
  }
}

async function executeBuiltInMacro(
  state: EngineState,
  nodeId: string,
  macroId: string
): Promise<void> {
  const macroActions: Record<string, () => Promise<void> | void> = {
    HelloWorld: async () => {
      const text = "Hello, World!";
      try { await navigator.clipboard.writeText(text); log(state, "info", nodeId, `[Native] "${text}" copied to clipboard`); }
      catch { log(state, "warn", nodeId, `[Native] Clipboard write failed`); }
    },
    OpenRepo: () => {
      window.open("https://github.com/igormundim/TicketPlusPlus", "_blank");
      log(state, "info", nodeId, `[Native] Opened Tasket++ GitHub repo`);
    },
    screenshot: () => {
      log(state, "info", nodeId, `[Native] Screenshot: use browser DevTools or Win+Shift+S`);
    },
    "open-browser": () => {
      window.open("https://www.google.com", "_blank");
      log(state, "info", nodeId, `[Native] Opened browser`);
    },
    "alt-tab": () => {
      log(state, "info", nodeId, `[Native] Alt+Tab: use keyboard (browser cannot simulate)`);
    },
    "ctrl-c": async () => {
      try { await navigator.clipboard.writeText(""); log(state, "info", nodeId, `[Native] Copy (Ctrl+C)`); }
      catch { log(state, "warn", nodeId, `[Native] Clipboard access denied`); }
    },
    "ctrl-v": async () => {
      try { const text = await navigator.clipboard.readText(); log(state, "info", nodeId, `[Native] Paste: "${text.slice(0, 50)}"`); }
      catch { log(state, "warn", nodeId, `[Native] Clipboard read denied`); }
    },
    "win-r": () => {
      log(state, "info", nodeId, `[Native] Win+R: use keyboard (browser cannot simulate)`);
    },
    "wait-1s": async () => { await new Promise((r) => setTimeout(r, 1000)); log(state, "info", nodeId, `[Native] Waited 1s`); },
    "wait-5s": async () => { await new Promise((r) => setTimeout(r, 5000)); log(state, "info", nodeId, `[Native] Waited 5s`); },
    "mouse-center": () => {
      log(state, "info", nodeId, `[Native] Move cursor to center (browser cannot move cursor)`);
    },
    "kill-notepad": () => {
      log(state, "info", nodeId, `[Native] Kill notepad (requires OS access)`);
    },
  };

  const action = macroActions[macroId];
  if (action) {
    await action();
  } else {
    log(state, "warn", nodeId, `[Native] Unknown macro "${macroId}" — define custom actions`);
  }
}

function executeDataGrid(
  state: EngineState,
  nodeId: string,
  config: DataGridConfig
): boolean {
  // Data grids are visual — their values are populated externally
  // Just log the current state
  const filled = config.cells.filter((c) => c.value).length;
  log(state, "info", nodeId, `Data grid "${config.name}": ${filled}/9 cells filled`);
  emit(state, { type: "nodeComplete", nodeId, output: `${filled}/9 filled` });
  return true;
}

function executeOutput(state: EngineState, nodeId: string): boolean {
  log(state, "info", nodeId, "Output node reached");
  emit(state, { type: "nodeComplete", nodeId });
  return true;
}

// ---------------------------------------------------------------------------
// Graph traversal
// ---------------------------------------------------------------------------

/**
 * Find entrypoint nodes (nodes with no incoming edges).
 */
function findStartNodes(workflow: Workflow): string[] {
  return workflow.nodes
    .filter((n) => getIncomingEdges(workflow, n.id).length === 0)
    .map((n) => n.id);
}

/**
 * Determine the next node(s) after a checkpoint based on evaluation result.
 * True -> edges labeled "true"
 * False -> edges labeled "false"
 */
function getNextAfterCheckpoint(
  workflow: Workflow,
  nodeId: string,
  result: boolean
): string[] {
  const outEdges = getOutgoingEdges(workflow, nodeId);
  const matching = outEdges.filter((e) => {
    const label = e.data?.conditionResult;
    if (label === undefined) return true; // unlabeled edges follow true path
    return label === result;
  });

  // If no explicitly labeled edges, use the first edge for true, second for false
  if (matching.length === 0 && outEdges.length >= 2) {
    return [outEdges[result ? 0 : 1].target];
  }
  if (matching.length === 0 && outEdges.length === 1) {
    return [outEdges[0].target];
  }

  return matching.map((e) => e.target);
}

/**
 * Execute a full workflow from start to finish.
 */
export async function executeWorkflow(
  workflow: Workflow,
  opts: {
    entrypointValues?: Record<string, string>;
    gridValues?: Record<string, string>;
    tasketUrl?: string;
    tasketKey?: string;
    fallbackToNative?: boolean;
    onEvent?: EngineEventHandler;
  } = {}
): Promise<WorkflowRuntime> {
  const runtime: WorkflowRuntime = {
    workflowId: workflow.id,
    status: "running",
    entrypointValues: opts.entrypointValues ?? {},
    gridValues: opts.gridValues ?? {},
    checkpointResults: {},
    logs: [],
    startedAt: new Date().toISOString(),
  };

  const state: EngineState = {
    workflow,
    runtime,
    handlers: opts.onEvent ? [opts.onEvent] : [],
    stopped: false,
    tasketUrl: opts.tasketUrl ?? "http://192.168.1.50:7777",
    tasketKey: opts.tasketKey,
    fallbackToNative: opts.fallbackToNative ?? true,
  };

  // Validate: need at least one start node
  const startNodes = findStartNodes(workflow);
  if (startNodes.length === 0) {
    runtime.status = "failed";
    runtime.finishedAt = new Date().toISOString();
    log(state, "error", "engine", "No start nodes found. Ensure at least one node has no incoming edges.");
    emit(state, { type: "failed", error: "No start nodes" });
    return runtime;
  }

  // Traverse using DFS from each start node
  const visited = new Set<string>();

  async function visit(nodeId: string): Promise<void> {
    if (state.stopped) return;
    if (visited.has(nodeId)) return; // avoid cycles
    visited.add(nodeId);

    await executeNode(state, nodeId);
    if (state.stopped) return;

    const node = getNode(workflow, nodeId);
    if (!node) return;

    // Determine next nodes
    let nextIds: string[] = [];

    if (node.type === "checkpoint") {
      const result = runtime.checkpointResults[nodeId] ?? false;
      nextIds = getNextAfterCheckpoint(workflow, nodeId, result);
    } else {
      const outEdges = getOutgoingEdges(workflow, nodeId);
      nextIds = outEdges.map((e) => e.target);
    }

    // Visit children
    for (const nextId of nextIds) {
      if (state.stopped) return;
      await visit(nextId);
    }
  }

  // Start from all entry points
  for (const startId of startNodes) {
    if (state.stopped) break;
    await visit(startId);
  }

  if (state.stopped) {
    runtime.status = "stopped";
    emit(state, { type: "stopped" });
  } else {
    runtime.status = "completed";
    emit(state, { type: "completed" });
  }
  runtime.finishedAt = new Date().toISOString();

  return runtime;
}

/**
 * Stop a running workflow.
 */
export function stopWorkflow(state: { stopped: boolean }): void {
  state.stopped = true;
}
