// ============================================================================
// Undo/Redo History System
// ============================================================================
// Captures workflow snapshots for full undo/redo support.
// Integrated with the workflow store — all mutating actions go through
// a dispatcher that automatically saves history entries.

import type { Workflow } from "@/types/workflow";

interface HistoryEntry {
  workflow: Workflow;
  actionName: string;
  timestamp: number;
}

interface HistoryState {
  // Stack
  past: HistoryEntry[];
  future: HistoryEntry[];
  maxSize: number;

  // Actions
  canUndo: () => boolean;
  canRedo: () => boolean;
  push: (workflow: Workflow, actionName: string) => void;
  undo: () => Workflow | null;
  redo: () => Workflow | null;
  clear: () => void;
  getHistoryLabel: () => string;
}

const MAX_HISTORY_SIZE = 50;

export const historyStore: HistoryState = {
  past: [],
  future: [],
  maxSize: MAX_HISTORY_SIZE,

  canUndo() {
    return this.past.length > 0;
  },

  canRedo() {
    return this.future.length > 0;
  },

  push(workflow, actionName) {
    // Don't push identical states
    const last = this.past[this.past.length - 1];
    if (last) {
      const lastJson = JSON.stringify(last.workflow);
      const newJson = JSON.stringify(workflow);
      if (lastJson === newJson) return;
    }

    this.past.push({
      workflow: JSON.parse(JSON.stringify(workflow)),
      actionName,
      timestamp: Date.now(),
    });

    // Trim if too large
    if (this.past.length > this.maxSize) {
      this.past.shift();
    }

    // Clear future on new action
    this.future = [];
  },

  undo() {
    if (this.past.length === 0) return null;
    const entry = this.past.pop()!;
    // Current state goes to future
    // (caller provides current state)
    this.future.push(entry);
    return entry.workflow;
  },

  redo() {
    if (this.future.length === 0) return null;
    const entry = this.future.pop()!;
    this.past.push(entry);
    return entry.workflow;
  },

  clear() {
    this.past = [];
    this.future = [];
  },

  getHistoryLabel() {
    const count = this.past.length;
    if (count === 0) return "No history";
    const last = this.past[count - 1];
    return `${count} step${count > 1 ? "s" : ""} — last: ${last.actionName}`;
  },
};

// Helper: push current workflow state to history before a mutating action
export function pushHistory(workflow: Workflow | null, actionName: string) {
  if (!workflow) return;
  historyStore.push(workflow, actionName);
}
