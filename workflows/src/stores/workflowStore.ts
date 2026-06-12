// ============================================================================
// Workflow Store (Zustand)
// ============================================================================

import { create } from "zustand";
import type { Workflow, WorkflowRuntime, MacroLibraryItem, NodeType } from "@/types/workflow";
import type { Node, Edge, Viewport } from "@xyflow/react";

interface ClipboardEntry {
  type: NodeType;
  data: Record<string, unknown>;
  timestamp: number;
}

interface WorkflowState {
  // Current workflow
  workflow: Workflow | null;
  // Runtime
  runtime: WorkflowRuntime | null;
  // Execution status
  isExecuting: boolean;
  // Selected node (for editing)
  selectedNodeId: string | null;
  // Sidebar panel
  sidebarOpen: boolean;
  sidebarTab: "library" | "properties" | "runtime";
  // Settings
  tasketUrl: string;
  tasketKey: string;
  autoSaveEnabled: boolean;
  // Clipboard (copy/paste)
  clipboard: ClipboardEntry | null;
  // Actions
  setWorkflow: (w: Workflow) => void;
  createWorkflow: (name: string, description?: string) => void;
  addNode: (type: NodeType, position: { x: number; y: number }) => void;
  addNodeWithData: (type: NodeType, position: { x: number; y: number }, data: Record<string, unknown>) => string;
  updateNode: (id: string, updates: Partial<{ data: Record<string, unknown> }>) => void;
  removeNode: (id: string) => void;
  copyNode: (id: string) => void;
  pasteNode: (position?: { x: number; y: number }) => string | null;
  cutNode: (id: string) => void;
  duplicateNode: (id: string) => string | null;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setViewport: (v: Viewport) => void;
  selectNode: (id: string | null) => void;
  setSidebar: (open: boolean, tab?: "library" | "properties" | "runtime") => void;
  setRuntime: (r: WorkflowRuntime | null) => void;
  setExecuting: (v: boolean) => void;
  setTasketUrl: (url: string) => void;
  setTasketKey: (key: string) => void;
  setAutoSave: (v: boolean) => void;
  importWorkflow: (json: string) => boolean;
  exportWorkflow: () => string | null;
}

let _idCounter = 0;
function uid(prefix = "node"): string {
  return `${prefix}-${Date.now()}-${++_idCounter}`;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: null,
  runtime: null,
  isExecuting: false,
  selectedNodeId: null,
  sidebarOpen: true,
  sidebarTab: "library",
  tasketUrl: "http://192.168.1.50:7777",
  tasketKey: "",
  autoSaveEnabled: true,
  clipboard: null,

  setWorkflow: (w) => set({ workflow: w }),

  createWorkflow: (name, description = "") => {
    const w: Workflow = {
      id: uid("wf"),
      name,
      description,
      version: "2.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    set({ workflow: w, selectedNodeId: null, runtime: null });
  },

  addNode: (type, position) => {
    const { workflow } = get();
    if (!workflow) return;

    const id = uid(type);
    const data = createDefaultNodeData(type, id);

    const node = {
      id,
      type,
      position,
      data,
    };

    set({
      workflow: {
        ...workflow,
        nodes: [...workflow.nodes, node],
        updatedAt: new Date().toISOString(),
      },
      selectedNodeId: id,
      sidebarOpen: true,
      sidebarTab: "properties",
    });
  },

  updateNode: (id, updates) => {
    const { workflow } = get();
    if (!workflow) return;

    const nodes = workflow.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...(updates.data ?? {}) } } : n
    );

    set({
      workflow: { ...workflow, nodes, updatedAt: new Date().toISOString() },
    });
  },

  removeNode: (id) => {
    const { workflow } = get();
    if (!workflow) return;

    set({
      workflow: {
        ...workflow,
        nodes: workflow.nodes.filter((n) => n.id !== id),
        edges: workflow.edges.filter((e) => e.source !== id && e.target !== id),
        updatedAt: new Date().toISOString(),
      },
      selectedNodeId: null,
    });
  },

  addNodeWithData: (type, position, data) => {
    const { workflow } = get();
    if (!workflow) return "";

    const id = uid(type);
    const node = { id, type, position, data: { ...data } };

    set({
      workflow: {
        ...workflow,
        nodes: [...workflow.nodes, node],
        updatedAt: new Date().toISOString(),
      },
      selectedNodeId: id,
      sidebarOpen: true,
      sidebarTab: "properties",
    });

    return id;
  },

  copyNode: (id) => {
    const { workflow } = get();
    if (!workflow) return;
    const node = workflow.nodes.find((n) => n.id === id);
    if (!node) return;

    set({
      clipboard: {
        type: node.type as NodeType,
        data: JSON.parse(JSON.stringify(node.data)),
        timestamp: Date.now(),
      },
    });
  },

  pasteNode: (position) => {
    const { workflow, clipboard } = get();
    if (!workflow || !clipboard) return null;

    // Offset position to avoid stacking
    const pos = position ?? {
      x: 50 + Math.random() * 60,
      y: 50 + Math.random() * 60,
    };

    const id = uid(clipboard.type);
    const newData = JSON.parse(JSON.stringify(clipboard.data));

    // Update IDs in pasted data to avoid conflicts
    if (newData.config) {
      if (clipboard.type === "datagrid" && newData.config.cells) {
        newData.config.cells = newData.config.cells.map((cell: any, i: number) => ({
          ...cell,
          id: `${id}-cell-${i}`,
          row: Math.floor(i / 3),
          col: i % 3,
        }));
      }
      if (clipboard.type === "checkpoint" && newData.config.conditions) {
        newData.config.conditions = newData.config.conditions.map((cond: any, i: number) => ({
          ...cond,
          id: `${id}-cond-${i + 1}`,
        }));
      }
    }

    const node = {
      id,
      type: clipboard.type,
      position: pos,
      data: newData,
    };

    set({
      workflow: {
        ...workflow,
        nodes: [...workflow.nodes, node],
        updatedAt: new Date().toISOString(),
      },
      selectedNodeId: id,
    });

    return id;
  },

  cutNode: (id) => {
    const { workflow } = get();
    if (!workflow) return;
    const node = workflow.nodes.find((n) => n.id === id);
    if (!node) return;

    set({
      clipboard: {
        type: node.type as NodeType,
        data: JSON.parse(JSON.stringify(node.data)),
        timestamp: Date.now(),
      },
      workflow: {
        ...workflow,
        nodes: workflow.nodes.filter((n) => n.id !== id),
        edges: workflow.edges.filter((e) => e.source !== id && e.target !== id),
        updatedAt: new Date().toISOString(),
      },
      selectedNodeId: null,
    });
  },

  duplicateNode: (id) => {
    const { workflow } = get();
    if (!workflow) return null;
    const node = workflow.nodes.find((n) => n.id === id);
    if (!node) return null;

    const newId = uid(node.type as NodeType);
    const newData = JSON.parse(JSON.stringify(node.data));

    // Update nested IDs
    if (newData.config) {
      if (node.type === "datagrid" && newData.config.cells) {
        newData.config.cells = newData.config.cells.map((cell: any, i: number) => ({
          ...cell,
          id: `${newId}-cell-${i}`,
          row: Math.floor(i / 3),
          col: i % 3,
        }));
      }
      if (node.type === "checkpoint" && newData.config.conditions) {
        newData.config.conditions = newData.config.conditions.map((cond: any, i: number) => ({
          ...cond,
          id: `${newId}-cond-${i + 1}`,
        }));
      }
    }

    const newNode = {
      id: newId,
      type: node.type,
      position: { x: node.position.x + 30, y: node.position.y + 30 },
      data: newData,
    };

    set({
      workflow: {
        ...workflow,
        nodes: [...workflow.nodes, newNode],
        updatedAt: new Date().toISOString(),
      },
      selectedNodeId: newId,
    });

    return newId;
  },

  setNodes: (nodes) => {
    const { workflow } = get();
    if (!workflow) return;
    set({
      workflow: {
        ...workflow,
        nodes: nodes.map((n: any) => ({ id: n.id, type: n.type ?? "", position: n.position, data: n.data as Record<string, unknown> })),
        updatedAt: new Date().toISOString(),
      },
    });
  },

  setEdges: (edges) => {
    const { workflow } = get();
    if (!workflow) return;
    set({
      workflow: {
        ...workflow,
        edges: edges as any,
        updatedAt: new Date().toISOString(),
      },
    });
  },

  setViewport: (v) => {
    const { workflow } = get();
    if (!workflow) return;
    set({ workflow: { ...workflow, viewport: { x: v.x, y: v.y, zoom: v.zoom } } });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  setSidebar: (open, tab) =>
    set((s) => ({
      sidebarOpen: open,
      sidebarTab: tab ?? s.sidebarTab,
    })),

  setRuntime: (r) => set({ runtime: r }),
  setExecuting: (v) => set({ isExecuting: v }),
  setTasketUrl: (url) => set({ tasketUrl: url }),
  setTasketKey: (key) => set({ tasketKey: key }),
  setAutoSave: (v) => set({ autoSaveEnabled: v }),

  importWorkflow: (json) => {
    try {
      const w = JSON.parse(json) as Workflow;
      if (!w.id || !w.nodes || !w.edges) return false;
      set({
        workflow: w,
        selectedNodeId: null,
        runtime: null,
      });
      return true;
    } catch {
      return false;
    }
  },

  exportWorkflow: () => {
    const { workflow } = get();
    if (!workflow) return null;
    return JSON.stringify(workflow, null, 2);
  },
}));

function createDefaultNodeData(type: NodeType, id: string) {
  switch (type) {
    case "entrypoint":
      return {
        label: "Entrypoint",
        config: {
          name: "Input",
          valueType: "string" as const,
          defaultValue: "",
          description: "User input value",
          useOcr: false,
        },
      };
    case "checkpoint":
      return {
        label: "Checkpoint",
        config: {
          name: "Check",
          conditions: [
            {
              id: `${id}-cond-1`,
              sourceId: "",
              type: "string" as const,
              operator: "contains" as const,
              compareValue: "",
              caseSensitive: false,
            },
          ],
        },
      };
    case "macro":
      return {
        label: "Macro",
        config: {
          name: "New Macro",
          delay: 10,
          loop: 1,
        },
      };
    case "datagrid":
      return {
        label: "Data Grid",
        config: {
          name: "Variables",
          cells: Array.from({ length: 9 }, (_, i) => ({
            id: `${id}-cell-${i}`,
            row: Math.floor(i / 3),
            col: i % 3,
            label: `V${i + 1}`,
            value: "",
            updatedAt: null,
          })),
        },
      };
    case "output":
      return {
        label: "Output",
        config: {
          name: "Result",
          sourceIds: [],
        },
      };
  }
}

// Macro library (built-in + user-defined)
export const BUILTIN_MACROS: MacroLibraryItem[] = [
  { id: "HelloWorld", name: "HelloWorld", description: "Opens Notepad, types greeting", category: "Demo", delay: 10 },
  { id: "OpenRepo", name: "OpenRepo", description: "Opens Tasket++ GitHub page", category: "Demo", delay: 5 },
  { id: "screenshot", name: "Screenshot", description: "Take a full-screen screenshot", category: "System", delay: 0 },
  { id: "open-browser", name: "Open Browser", description: "Open default browser", category: "System", delay: 0 },
  { id: "alt-tab", name: "Alt+Tab", description: "Switch to next window", category: "Keys", delay: 0 },
  { id: "ctrl-c", name: "Copy", description: "Ctrl+C keystroke", category: "Keys", delay: 0 },
  { id: "ctrl-v", name: "Paste", description: "Ctrl+V keystroke", category: "Keys", delay: 0 },
  { id: "win-r", name: "Run Dialog", description: "Open Windows Run dialog", category: "Keys", delay: 0 },
  { id: "wait-1s", name: "Wait 1s", description: "Pause for 1 second", category: "Timing", delay: 0 },
  { id: "wait-5s", name: "Wait 5s", description: "Pause for 5 seconds", category: "Timing", delay: 0 },
  { id: "mouse-center", name: "Move to Center", description: "Move cursor to screen center", category: "Cursor", delay: 0 },
  { id: "kill-notepad", name: "Kill Notepad", description: "Kill notepad.exe process", category: "System", delay: 0 },
];
