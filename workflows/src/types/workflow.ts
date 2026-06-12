// ============================================================================
// Tasket++ Workflows — Core Type System
// ============================================================================

export type ValueType = "string" | "bool" | "float";

// ---------------------------------------------------------------------------
// Checkpoint System
// ---------------------------------------------------------------------------

export type StringOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "regex"
  | "notContains"
  | "notEquals";

export type BoolOperator = "isTrue" | "isFalse";

export type FloatOperator =
  | "equals"
  | "greaterThan"
  | "lessThan"
  | "greaterOrEqual"
  | "lessOrEqual"
  | "notEqual";

export type LogicConnector = "and" | "or" | "xor";

export interface CheckpointCondition {
  id: string;
  sourceId: string;
  type: ValueType;
  operator: StringOperator | BoolOperator | FloatOperator;
  compareValue: string;
  caseSensitive?: boolean;
  logic?: LogicConnector;
}

export interface CheckpointConfig {
  name: string;
  conditions: CheckpointCondition[];
}

// ---------------------------------------------------------------------------
// Data Grid (3x3 temporary variable array)
// ---------------------------------------------------------------------------

export interface GridCell {
  id: string;
  row: number;
  col: number;
  label: string;
  value: string;
  updatedAt: string | null;
}

export interface DataGridConfig {
  name: string;
  cells: GridCell[];
}

// ---------------------------------------------------------------------------
// Macro Module
// ---------------------------------------------------------------------------

export interface MacroConfig {
  name: string;
  macroId?: string;
  delay: number;
  loop: number;
  actions?: MacroAction[];
}

export type MacroActionType =
  | "paste"
  | "wait"
  | "keys"
  | "cursor"
  | "system"
  | "runOther";

export interface MacroAction {
  id: string;
  type: MacroActionType;
  params: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

export interface EntrypointConfig {
  name: string;
  valueType: ValueType;
  defaultValue: string;
  description: string;
  useOcr: boolean;
}

// ---------------------------------------------------------------------------
// Output / Result
// ---------------------------------------------------------------------------

export interface OutputConfig {
  name: string;
  sourceIds: string[];
}

// ---------------------------------------------------------------------------
// Node Types
// ---------------------------------------------------------------------------

export type NodeType =
  | "entrypoint"
  | "checkpoint"
  | "macro"
  | "datagrid"
  | "output";

export interface WorkflowNodeData {
  label: string;
  config: EntrypointConfig | CheckpointConfig | MacroConfig | DataGridConfig | OutputConfig;
  runtime?: {
    status: "idle" | "running" | "completed" | "failed" | "skipped";
    startedAt?: string;
    finishedAt?: string;
    output?: string;
    error?: string;
  };
}

// ---------------------------------------------------------------------------
// Edge Types
// ---------------------------------------------------------------------------

export interface WorkflowEdgeData extends Record<string, unknown> {
  label?: string;
  conditionResult?: boolean;
}

// ---------------------------------------------------------------------------
// Full Workflow
// ---------------------------------------------------------------------------

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: WorkflowEdgeData;
}

// ---------------------------------------------------------------------------
// Runtime State
// ---------------------------------------------------------------------------

export interface WorkflowRuntime {
  workflowId: string;
  status: "idle" | "running" | "paused" | "completed" | "failed" | "stopped";
  currentNodeId?: string;
  entrypointValues: Record<string, string>;
  gridValues: Record<string, string>;
  checkpointResults: Record<string, boolean>;
  logs: RuntimeLog[];
  startedAt?: string;
  finishedAt?: string;
}

export interface RuntimeLog {
  timestamp: string;
  level: "info" | "warn" | "error";
  nodeId: string;
  nodeName: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Macro Library Item
// ---------------------------------------------------------------------------

export interface MacroLibraryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  delay: number;
  icon?: string;
}
