// ============================================================================
// Checkpoint Evaluation Engine
// ============================================================================
// Evaluates IF/THEN/ELSE conditions with string/bool/float support,
// AND/OR/XOR logic connectors, and case sensitivity options.

import type {
  CheckpointCondition,
  CheckpointConfig,
  ValueType,
  StringOperator,
  BoolOperator,
  FloatOperator,
  LogicConnector,
} from "@/types/workflow";

export interface EvaluationContext {
  /** entrypoint_id -> current value (string) */
  entrypoints: Record<string, string>;
  /** grid_cell_id -> current value */
  grid: Record<string, string>;
}

/**
 * Parse a value from its string representation based on its ValueType.
 */
function parseValue(raw: string, type: ValueType): string | boolean | number {
  switch (type) {
    case "bool":
      return raw.trim().toLowerCase() === "true" || raw.trim() === "1";
    case "float": {
      const n = parseFloat(raw);
      return isNaN(n) ? 0 : n;
    }
    case "string":
    default:
      return raw;
  }
}

/**
 * Evaluate a single condition against the context.
 */
function evaluateCondition(
  cond: CheckpointCondition,
  ctx: EvaluationContext
): boolean {
  // Resolve the source value
  let rawValue: string;
  if (cond.sourceId.startsWith("grid-")) {
    rawValue = ctx.grid[cond.sourceId] ?? "";
  } else {
    rawValue = ctx.entrypoints[cond.sourceId] ?? "";
  }

  const actual = parseValue(rawValue, cond.type);
  const compareStr = cond.compareValue;

  switch (cond.type) {
    case "string": {
      const op = cond.operator as StringOperator;
      const a = cond.caseSensitive
        ? String(actual)
        : String(actual).toLowerCase();
      const b = cond.caseSensitive
        ? compareStr
        : compareStr.toLowerCase();

      switch (op) {
        case "contains":
          return a.includes(b);
        case "notContains":
          return !a.includes(b);
        case "equals":
          return a === b;
        case "notEquals":
          return a !== b;
        case "startsWith":
          return a.startsWith(b);
        case "endsWith":
          return a.endsWith(b);
        case "regex": {
          try {
            const flags = cond.caseSensitive ? "" : "i";
            return new RegExp(compareStr, flags).test(String(actual));
          } catch {
            return false;
          }
        }
        default:
          return false;
      }
    }

    case "bool": {
      const op = cond.operator as BoolOperator;
      const val = Boolean(actual);
      switch (op) {
        case "isTrue":
          return val === true;
        case "isFalse":
          return val === false;
        default:
          return false;
      }
    }

    case "float": {
      const op = cond.operator as FloatOperator;
      const val = typeof actual === "number" ? actual : parseFloat(String(actual));
      const cmp = parseFloat(compareStr);
      if (isNaN(cmp)) return false;

      switch (op) {
        case "equals":
          return Math.abs(val - cmp) < 1e-9;
        case "greaterThan":
          return val > cmp;
        case "lessThan":
          return val < cmp;
        case "greaterOrEqual":
          return val >= cmp;
        case "lessOrEqual":
          return val <= cmp;
        case "notEqual":
          return Math.abs(val - cmp) >= 1e-9;
        default:
          return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Evaluate an entire checkpoint config with AND/OR/XOR logic.
 *
 * Algorithm:
 *   1. Evaluate each condition individually.
 *   2. Combine using the logic connector to the next condition.
 *   3. AND: both must be true
 *   4. OR:  at least one true
 *   5. XOR: exactly one true
 */
export function evaluateCheckpoint(
  config: CheckpointConfig,
  ctx: EvaluationContext
): { result: boolean; details: Array<{ conditionId: string; passed: boolean; logic?: LogicConnector }> } {
  const details: Array<{ conditionId: string; passed: boolean; logic?: LogicConnector }> = [];

  if (config.conditions.length === 0) {
    return { result: false, details };
  }

  // Single condition — simple case
  if (config.conditions.length === 1) {
    const passed = evaluateCondition(config.conditions[0], ctx);
    details.push({ conditionId: config.conditions[0].id, passed });
    return { result: passed, details };
  }

  // Multi-condition with logic connectors
  // Process left-to-right with proper precedence
  let currentResult = evaluateCondition(config.conditions[0], ctx);
  details.push({
    conditionId: config.conditions[0].id,
    passed: currentResult,
    logic: config.conditions[0].logic,
  });

  for (let i = 1; i < config.conditions.length; i++) {
    const cond = config.conditions[i];
    const passed = evaluateCondition(cond, ctx);
    const logic = config.conditions[i - 1].logic ?? "and";

    details.push({ conditionId: cond.id, passed, logic: cond.logic });

    switch (logic) {
      case "and":
        currentResult = currentResult && passed;
        break;
      case "or":
        currentResult = currentResult || passed;
        break;
      case "xor":
        currentResult = currentResult !== passed; // true XOR true = false
        break;
    }
  }

  return { result: currentResult, details };
}

/**
 * Build a human-readable description of a checkpoint condition.
 */
export function describeCondition(cond: CheckpointCondition): string {
  const source = cond.sourceId;
  const op = cond.operator;
  const val = cond.compareValue;
  const logic = cond.logic ? ` ${cond.logic.toUpperCase()} ` : "";

  switch (cond.type) {
    case "string":
      return `${logic}if "${source}" ${op} "${val}"${cond.caseSensitive ? " (case-sensitive)" : ""}`;
    case "bool":
      return `${logic}if "${source}" ${op}`;
    case "float":
      return `${logic}if "${source}" ${op} ${val}`;
    default:
      return `${logic}unknown condition`;
  }
}
