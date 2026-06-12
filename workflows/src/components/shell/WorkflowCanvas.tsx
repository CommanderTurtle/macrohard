import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  ConnectionMode,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore, BUILTIN_MACROS } from "@/stores/workflowStore";
import { historyStore, pushHistory } from "@/stores/historyStore";
import { executeWorkflow } from "@/engine/workflowEngine";
import type { EngineEvent } from "@/engine/workflowEngine";
import type { WorkflowRuntime, RuntimeLog } from "@/types/workflow";
import type { CheckpointConfig, MacroConfig, EntrypointConfig, DataGridConfig } from "@/types/workflow";
import { useAutoSave, loadSavedWorkflows } from "@/hooks/useAutoSave";

import EntrypointNode from "@/components/nodes/EntrypointNode";
import CheckpointNode from "@/components/nodes/CheckpointNode";
import MacroNode from "@/components/nodes/MacroNode";
import DataGridNode from "@/components/nodes/DataGridNode";
import OutputNode from "@/components/nodes/OutputNode";
import CheckpointEditor from "@/components/editors/CheckpointEditor";
import MacroEditor from "@/components/editors/MacroEditor";
import EntrypointEditor from "@/components/editors/EntrypointEditor";
import DataGridEditor from "@/components/editors/DataGridEditor";
import CommandPalette from "@/components/shell/CommandPalette";

import {
  Play, Square, FolderOpen, Save, Maximize,
  GitFork, PlayCircle, Grid3X3, LogOut, Type, FilePlus, Trash2,
  Copy, ClipboardPaste, Scissors, Layers, Undo2, Redo, Command,
} from "lucide-react";

const nodeTypes: any = {
  entrypoint: EntrypointNode,
  checkpoint: CheckpointNode,
  macro: MacroNode,
  datagrid: DataGridNode,
  output: OutputNode,
};

const edgeStyles: Record<string, any> = {
  true: { stroke: "#34d399", strokeWidth: 2 },
  false: { stroke: "#f87171", strokeWidth: 2 },
  default: { stroke: "rgba(148,163,184,0.4)", strokeWidth: 1.5 },
};

export default function WorkflowCanvas() {
  const store = useWorkflowStore();
  const {
    workflow, selectedNodeId, sidebarTab, isExecuting,
    tasketUrl, tasketKey,
    selectNode, setSidebar, setRuntime, setExecuting,
    addNode, updateNode: storeUpdateNode, removeNode,
    copyNode, pasteNode, cutNode, duplicateNode,
    setNodes: _setNodes, setEdges: _setEdges, createWorkflow, importWorkflow,
  } = store;

  const [nodes, rfSetNodes, onNodesChange] = useNodesState([] as any);
  const [edges, rfSetEdges, onEdgesChange] = useEdgesState([] as any);
  const [logsOpen, setLogsOpen] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Command palette
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palettePos, setPalettePos] = useState<{ x: number; y: number } | null>(null);

  // Undo/Redo tick (forces re-render of undo/redo buttons)
  const [, setHistoryTick] = useState(0);

  const reactFlowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync store -> ReactFlow
  useEffect(() => {
    if (workflow) {
      rfSetNodes(workflow.nodes);
      rfSetEdges(workflow.edges);
    }
  }, [workflow?.id]);

  // Sync ReactFlow -> store (immediate, no debounce — prevents desync)
  useEffect(() => {
    if (!workflow) return;
    useWorkflowStore.setState({
      workflow: { ...workflow, nodes: nodes as any, edges: edges as any, updatedAt: new Date().toISOString() },
    });
  }, [nodes, edges]);

  // ---- Undo/Redo ----
  const doUndo = useCallback(() => {
    if (!historyStore.canUndo() || !workflow) return;
    const currentSnapshot = JSON.parse(JSON.stringify(workflow));
    historyStore.future.push({ workflow: currentSnapshot, actionName: "undo-saved", timestamp: Date.now() });
    const restored = historyStore.undo();
    if (restored) {
      useWorkflowStore.setState({ workflow: restored, selectedNodeId: null });
      rfSetNodes(restored.nodes);
      rfSetEdges(restored.edges);
    }
    setHistoryTick((t) => t + 1);
  }, [workflow, rfSetNodes, rfSetEdges]);

  const doRedo = useCallback(() => {
    const restored = historyStore.redo();
    if (restored) {
      useWorkflowStore.setState({ workflow: restored, selectedNodeId: null });
      rfSetNodes(restored.nodes);
      rfSetEdges(restored.edges);
    }
    setHistoryTick((t) => t + 1);
  }, [rfSetNodes, rfSetEdges]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      // Command palette: Ctrl+K or Space (when not typing)
      if ((e.ctrlKey || e.metaKey) && e.key === "k" && !isTyping) {
        e.preventDefault();
        const rect = reactFlowRef.current?.getBoundingClientRect();
        if (rect) {
          setPalettePos({ x: rect.width / 2 - 160, y: rect.height / 2 - 150 });
          setPaletteOpen(true);
        }
        return;
      }

      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey && !isTyping) {
        e.preventDefault();
        doUndo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (((e.ctrlKey || e.metaKey) && e.key === "y" && !isTyping) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z" && !isTyping)) {
        e.preventDefault();
        doRedo();
        return;
      }

      // Copy/Paste/Cut/Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && selectedNodeId && !isTyping) {
        e.preventDefault();
        pushHistory(workflow, "copy");
        copyNode(selectedNodeId);
        setHistoryTick((t) => t + 1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "x" && selectedNodeId && !isTyping) {
        e.preventDefault();
        pushHistory(workflow, "cut");
        cutNode(selectedNodeId);
        setHistoryTick((t) => t + 1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !isTyping) {
        e.preventDefault();
        pushHistory(workflow, "paste");
        pasteNode();
        setHistoryTick((t) => t + 1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && selectedNodeId && !isTyping) {
        e.preventDefault();
        pushHistory(workflow, "duplicate");
        duplicateNode(selectedNodeId);
        setHistoryTick((t) => t + 1);
        return;
      }

      // Delete
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId && !isTyping) {
        e.preventDefault();
        pushHistory(workflow, "delete");
        removeNode(selectedNodeId);
        setHistoryTick((t) => t + 1);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeId, workflow, copyNode, pasteNode, cutNode, duplicateNode, removeNode, doUndo, doRedo]);

  // ---- Connections ----
  const onConnect = useCallback(
    (params: any) => {
      const sourceNode = (nodes as any[]).find((n: any) => n.id === params.source);
      const isCheckpoint = sourceNode?.type === "checkpoint";
      const handleId = params.sourceHandle;

      let label: string | undefined;
      let conditionResult: boolean | undefined;
      if (isCheckpoint) {
        if (handleId === "true") { label = "true"; conditionResult = true; }
        else if (handleId === "false") { label = "false"; conditionResult = false; }
      }

      const newEdge = {
        ...params,
        id: `e-${params.source}-${params.target}-${Date.now()}`,
        label,
        data: conditionResult !== undefined ? { conditionResult } : undefined,
        style: label === "true" ? edgeStyles.true : label === "false" ? edgeStyles.false : edgeStyles.default,
        animated: false,
        type: "smoothstep",
      };
      rfSetEdges((eds: any) => addEdge(newEdge, eds));
    },
    [nodes]
  );

  const onViewportChange = useCallback((v: any) => {
    const wf = useWorkflowStore.getState().workflow;
    if (wf) useWorkflowStore.setState({ workflow: { ...wf, viewport: { x: v.x, y: v.y, zoom: v.zoom } } });
  }, []);

  // ---- Drag & Drop ----
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType");
    if (!type || !workflow) return;
    const rect = (e.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    if (!rect) return;
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    pushHistory(workflow, `add ${type}`);
    addNode(type as any, pos);
    setHistoryTick((t) => t + 1);
  }, [workflow, addNode]);

  // ---- Double-click for command palette ----
  const onPaneClick = useCallback((e: React.MouseEvent) => {
    if ((e as any).detail === 2) {
      // Double-click: open command palette at cursor
      const rect = reactFlowRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e as any).clientX - rect.left;
        const y = (e as any).clientY - rect.top;
        setPalettePos({ x: Math.min(x, rect.width - 340), y: Math.min(y, rect.height - 400) });
        setPaletteOpen(true);
      }
      return;
    }
    selectNode(null);
  }, [selectNode]);

  // ---- Node hover for floating actions ----
  const onNodeMouseEnter: NodeMouseHandler = useCallback((_: any, node: any) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // ---- Node action handlers (with history) ----
  const handleCopy = useCallback((id: string) => {
    pushHistory(useWorkflowStore.getState().workflow, "copy");
    copyNode(id);
    setHistoryTick((t) => t + 1);
  }, [copyNode]);

  const handleDuplicate = useCallback((id: string) => {
    pushHistory(useWorkflowStore.getState().workflow, "duplicate");
    duplicateNode(id);
    setHistoryTick((t) => t + 1);
  }, [duplicateNode]);

  const handleDelete = useCallback((id: string) => {
    pushHistory(useWorkflowStore.getState().workflow, "delete");
    removeNode(id);
    setHistoryTick((t) => t + 1);
  }, [removeNode]);

  // ---- Execute ----
  const handleExecute = async () => {
    if (!workflow || isExecuting) return;
    setExecuting(true);
    setRuntime(null);

    const onEvent = (e: EngineEvent) => {
      if (e.type === "completed" || e.type === "stopped" || e.type === "failed") setExecuting(false);
      if (e.type === "log") {
        const current = useWorkflowStore.getState().runtime;
        if (current) useWorkflowStore.setState({ runtime: { ...current, logs: [...current.logs, e.log] } });
      }
    };

    const result = await executeWorkflow(workflow, { tasketUrl, tasketKey: tasketKey || undefined, onEvent });
    setRuntime(result);
    setExecuting(false);
  };

  const handleStop = () => {
    setExecuting(false);
    const r = useWorkflowStore.getState().runtime;
    if (r) useWorkflowStore.setState({ runtime: { ...r, status: "stopped" as const } });
  };

  // Strip any internal UI fields from node data before exporting
  function cleanWorkflowForExport(w: any): any {
    return {
      ...w,
      nodes: w.nodes.map((n: any) => ({
        ...n,
        data: Object.fromEntries(
          Object.entries(n.data).filter(([key]) => !key.startsWith("_"))
        ),
      })),
    };
  }

  const handleExport = () => {
    if (!workflow) return;
    // 1. Clean and export to JSON file
    const cleaned = cleanWorkflowForExport(workflow);
    const json = JSON.stringify(cleaned, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflow.name}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // 2. Also persist to localStorage immediately
    try {
      localStorage.setItem(`tasket-workflows-${workflow.id}`, json);
      const index = JSON.parse(localStorage.getItem("tasket-workflows-index") ?? "{}");
      index[workflow.id] = { name: workflow.name, updatedAt: new Date().toISOString() };
      localStorage.setItem("tasket-workflows-index", JSON.stringify(index));
    } catch {
      console.warn("LocalStorage save failed");
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!importWorkflow(ev.target?.result as string)) alert("Invalid workflow file");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { reactFlowRef.current?.requestFullscreen(); }
    else { document.exitFullscreen(); }
  };

  useAutoSave();

  // Derived
  const allNodes = nodes as any[];
  const selectedNode: any = allNodes.find((n: any) => n.id === selectedNodeId);
  const entrypointIds = allNodes.filter((n: any) => n.type === "entrypoint").map((n: any) => n.id);
  const gridIds = allNodes.filter((n: any) => n.type === "datagrid").flatMap((n: any) => (n.data?.config?.cells ?? []).map((c: any) => c.id));

  const canUndoNow = historyStore.canUndo();
  const canRedoNow = historyStore.canRedo();

  // ---- Nodes with floating actions ----
  const nodesWithActions = useMemo(() => {
    return allNodes.map((node: any) => ({
      ...node,
      data: {
        ...node.data,
        _showActions: hoveredNodeId === node.id || selectedNodeId === node.id,
        _onCopy: handleCopy,
        _onDuplicate: handleDuplicate,
        _onDelete: handleDelete,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, hoveredNodeId, selectedNodeId, handleCopy, handleDuplicate, handleDelete]);

  // ---- Saved workflows list ----
  const [savedWorkflows, setSavedWorkflows] = useState<Array<{ id: string; name: string; updatedAt: string }>>([]);
  useEffect(() => { setSavedWorkflows(loadSavedWorkflows()); }, []);

  const handleLoadSaved = (id: string) => {
    const json = localStorage.getItem(`tasket-workflows-${id}`);
    if (json) importWorkflow(json);
  };

  // Welcome screen
  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a14] text-white">
        <div className="text-center space-y-6 max-w-lg w-full px-6">
          <div className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Tasket++ Workflows
          </div>
          <p className="text-white/40 max-w-md mx-auto">
            Visual workflow automation with checkpoints, macros, and data grids.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => createWorkflow("New Workflow")} className="px-6 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30 transition-colors flex items-center gap-2">
              <FilePlus size={16} /> New Workflow
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="px-6 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 transition-colors flex items-center gap-2">
              <FolderOpen size={16} /> Open File
            </button>
          </div>

          {/* Saved workflows from localStorage */}
          {savedWorkflows.length > 0 && (
            <div className="text-left">
              <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2 text-center">Saved Workflows</div>
              <div className="space-y-1.5 max-h-[240px] overflow-auto">
                {savedWorkflows.map((sw) => (
                  <button key={sw.id} onClick={() => handleLoadSaved(sw.id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-white/10 transition-colors text-left">
                    <div>
                      <div className="text-sm text-white/80 font-medium">{sw.name}</div>
                      <div className="text-[10px] text-white/30">{new Date(sw.updatedAt).toLocaleString()}</div>
                    </div>
                    <FolderOpen size={14} className="text-white/30" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </div>
    );
  }

  return (
    <div ref={reactFlowRef} className="flex h-screen w-screen bg-[#0a0a14] overflow-hidden">
      <div className="flex-1 relative" onDragOver={onDragOver} onDrop={onDrop}>
        <ReactFlow
          nodes={nodesWithActions}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onViewportChange={onViewportChange}
          onNodeClick={(_: any, node: any) => selectNode(node.id)}
          onPaneClick={onPaneClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="bg-[#0a0a14]"
        >
          <Background color="#1e1e2e" gap={20} size={1} />
          <Controls className="!bg-[#1a1a2e]/80 !border-white/10 [&_button]:!text-white/60 [&_button]:hover:!text-white" />
          <MiniMap
            className="!bg-[#1a1a2e]/80 !border-white/10"
            nodeColor={(n: any) => {
              const c: Record<string, string> = { entrypoint: "#3b82f6", checkpoint: "#a855f7", macro: "#06b6d4", datagrid: "#f97316", output: "#f43f5e" };
              return c[n.type ?? ""] ?? "#64748b";
            }}
            maskColor="rgba(10,10,20,0.7)"
          />

          {/* Toolbar */}
          <Panel position="top-left" className="m-0">
            <div className="flex items-center gap-1 p-1.5 rounded-lg bg-[#1a1a2e]/90 border border-white/10 backdrop-blur">
              <button onClick={() => { pushHistory(workflow, "new"); createWorkflow("New Workflow"); setHistoryTick((t) => t + 1); }} title="New" className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                <FilePlus size={16} />
              </button>
              <button onClick={() => fileInputRef.current?.click()} title="Open" className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                <FolderOpen size={16} />
              </button>
              <button onClick={handleExport} title="Export" className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                <Save size={16} />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button onClick={handleExecute} disabled={isExecuting}
                className={`p-1.5 rounded transition-colors flex items-center gap-1 text-xs font-medium px-3
                  ${isExecuting ? "bg-amber-500/20 text-amber-300" : "hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300"}`}>
                {isExecuting ? <Square size={14} /> : <Play size={14} />}
                {isExecuting ? "Running..." : "Run"}
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              {/* Undo/Redo */}
              <button onClick={doUndo} disabled={!canUndoNow} title="Undo (Ctrl+Z)"
                className={`p-1.5 rounded transition-colors ${canUndoNow ? "hover:bg-white/10 text-white/60 hover:text-white" : "text-white/15 cursor-not-allowed"}`}>
                <Undo2 size={16} />
              </button>
              <button onClick={doRedo} disabled={!canRedoNow} title="Redo (Ctrl+Y)"
                className={`p-1.5 rounded transition-colors ${canRedoNow ? "hover:bg-white/10 text-white/60 hover:text-white" : "text-white/15 cursor-not-allowed"}`}>
                <Redo size={16} />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              {/* Command palette trigger */}
              <button onClick={() => {
                const rect = reactFlowRef.current?.getBoundingClientRect();
                if (rect) { setPalettePos({ x: rect.width / 2 - 160, y: 60 }); setPaletteOpen(true); }
              }} title="Add Node (Ctrl+K)" className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                <Command size={16} />
              </button>
              <button onClick={toggleFullscreen} title="Fullscreen" className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                <Maximize size={16} />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <span className="text-[10px] text-white/30 px-1 truncate max-w-[120px]">{workflow.name}</span>
            </div>
          </Panel>

          {/* Emergency Stop */}
          <Panel position="top-right" className="m-0">
            {isExecuting && (
              <button onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/90 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-500/30 animate-pulse">
                <Square size={16} fill="white" /> STOP
              </button>
            )}
          </Panel>

          {/* Help hint */}
          <Panel position="bottom-center" className="m-0 mb-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#1a1a2e]/80 border border-white/10 text-[10px] text-white/40">
              <span>Double-click canvas to add</span><span className="text-white/20">|</span>
              <span>Ctrl+K search</span><span className="text-white/20">|</span>
              <span>Ctrl+Z undo</span><span className="text-white/20">|</span>
              <span>Drag nodes from sidebar</span>
            </div>
          </Panel>
        </ReactFlow>

        {/* Command Palette */}
        <CommandPalette
          isOpen={paletteOpen}
          position={palettePos}
          onClose={() => setPaletteOpen(false)}
        />

        {/* Logs */}
        {store.runtime && (
          <button onClick={() => setLogsOpen(!logsOpen)}
            className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-[#1a1a2e]/90 border border-white/10 text-[10px] text-white/60 hover:text-white transition-colors">
            {store.runtime.status.toUpperCase()} — {store.runtime.logs.length} logs
          </button>
        )}
        {logsOpen && store.runtime && (
          <div className="absolute bottom-12 left-4 right-4 max-h-[200px] overflow-auto rounded-lg bg-[#1a1a2e]/95 border border-white/10 p-3 text-[10px] font-mono space-y-1">
            {store.runtime.logs.map((log: RuntimeLog, i: number) => (
              <div key={i} className={`${log.level === "error" ? "text-red-400" : log.level === "warn" ? "text-amber-400" : "text-white/60"}`}>
                <span className="text-white/30">{new Date(log.timestamp).toLocaleTimeString()}</span>{" "}
                <span className="text-white/40">[{log.nodeName}]</span>{" "}{log.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-[300px] border-l border-white/10 bg-[#12121e]/95 backdrop-blur flex flex-col">
        <div className="flex border-b border-white/10">
          {(["library", "properties", "runtime"] as const).map((tab) => (
            <button key={tab} onClick={() => setSidebar(true, tab)}
              className={`flex-1 py-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors
                ${sidebarTab === tab ? "text-white border-b-2 border-blue-400 bg-white/5" : "text-white/40 hover:text-white/60"}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {sidebarTab === "library" && <NodeLibrary />}
          {sidebarTab === "properties" && selectedNode && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">Properties</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => { pushHistory(workflow, "copy"); copyNode(selectedNode.id); setHistoryTick((t) => t + 1); }} className="p-1 rounded text-white/30 hover:text-blue-400 hover:bg-white/5 transition-colors" title="Copy (Ctrl+C)">
                    <Copy size={13} />
                  </button>
                  <button onClick={() => { pushHistory(workflow, "paste"); pasteNode(); setHistoryTick((t) => t + 1); }} className="p-1 rounded text-white/30 hover:text-green-400 hover:bg-white/5 transition-colors" title="Paste (Ctrl+V)">
                    <ClipboardPaste size={13} />
                  </button>
                  <button onClick={() => { pushHistory(workflow, "cut"); cutNode(selectedNode.id); setHistoryTick((t) => t + 1); }} className="p-1 rounded text-white/30 hover:text-amber-400 hover:bg-white/5 transition-colors" title="Cut (Ctrl+X)">
                    <Scissors size={13} />
                  </button>
                  <button onClick={() => { pushHistory(workflow, "duplicate"); duplicateNode(selectedNode.id); setHistoryTick((t) => t + 1); }} className="p-1 rounded text-white/30 hover:text-purple-400 hover:bg-white/5 transition-colors" title="Duplicate (Ctrl+D)">
                    <Layers size={13} />
                  </button>
                  <div className="w-px h-4 bg-white/10 mx-0.5" />
                  <button onClick={() => { pushHistory(workflow, "delete"); removeNode(selectedNode.id); setHistoryTick((t) => t + 1); }} className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-white/5 transition-colors" title="Delete (Del)">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {selectedNode.type === "entrypoint" && (
                <EntrypointEditor config={selectedNode.data.config as EntrypointConfig} onChange={(cfg) => storeUpdateNode(selectedNode.id, { data: { ...selectedNode.data, config: cfg } })} />
              )}
              {selectedNode.type === "checkpoint" && (
                <CheckpointEditor config={selectedNode.data.config as CheckpointConfig} entrypointIds={entrypointIds} gridIds={gridIds} onChange={(cfg) => storeUpdateNode(selectedNode.id, { data: { ...selectedNode.data, config: cfg } })} />
              )}
              {selectedNode.type === "macro" && (
                <MacroEditor config={selectedNode.data.config as MacroConfig} macroLibrary={BUILTIN_MACROS} onChange={(cfg) => storeUpdateNode(selectedNode.id, { data: { ...selectedNode.data, config: cfg } })} />
              )}
              {selectedNode.type === "datagrid" && (
                <DataGridEditor config={selectedNode.data.config as DataGridConfig} onChange={(cfg) => storeUpdateNode(selectedNode.id, { data: { ...selectedNode.data, config: cfg } })} />
              )}
              {selectedNode.type === "output" && <div className="text-sm text-white/40">Output node — no configuration needed</div>}
            </div>
          )}
          {sidebarTab === "properties" && !selectedNode && <div className="text-sm text-white/30 text-center mt-8">Select a node to edit its properties</div>}
          {sidebarTab === "runtime" && <RuntimePanel runtime={store.runtime} />}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
    </div>
  );
}

// ============================================================================
// Node Library (sidebar)
// ============================================================================

function NodeLibrary() {
  const items = [
    { type: "entrypoint", label: "Entrypoint", icon: Type, color: "text-blue-400", desc: "User input" },
    { type: "checkpoint", label: "Checkpoint", icon: GitFork, color: "text-purple-400", desc: "IF/THEN/ELSE" },
    { type: "macro", label: "Macro", icon: PlayCircle, color: "text-cyan-400", desc: "Run automation" },
    { type: "datagrid", label: "Data Grid", icon: Grid3X3, color: "text-orange-400", desc: "3x3 variables" },
    { type: "output", label: "Output", icon: LogOut, color: "text-rose-400", desc: "Result" },
  ];

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">Drag to Canvas</div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.type} draggable
            onDragStart={(e) => { e.dataTransfer.setData("nodeType", item.type); e.dataTransfer.effectAllowed = "move"; }}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-white/10 cursor-grab active:cursor-grabbing transition-colors">
            <Icon size={18} className={item.color} />
            <div>
              <div className="text-xs font-medium text-white">{item.label}</div>
              <div className="text-[10px] text-white/40">{item.desc}</div>
            </div>
          </div>
        );
      })}
      <div className="pt-4 border-t border-white/5">
        <div className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-2">Built-in Macros</div>
        <div className="space-y-1">
          {BUILTIN_MACROS.map((macro) => (
            <div key={macro.id} draggable
              onDragStart={(e) => { e.dataTransfer.setData("nodeType", "macro"); e.dataTransfer.setData("macroId", macro.id); e.dataTransfer.effectAllowed = "move"; }}
              className="flex items-center gap-2 p-2 rounded bg-white/[0.02] hover:bg-white/[0.05] cursor-grab transition-colors">
              <PlayCircle size={12} className="text-cyan-400/60" />
              <span className="text-[11px] text-white/60">{macro.name}</span>
              <span className="text-[9px] text-white/20 ml-auto">{macro.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Runtime Panel
// ============================================================================

function RuntimePanel({ runtime }: { runtime: WorkflowRuntime | null }) {
  if (!runtime) return <div className="text-sm text-white/30 text-center mt-8">No runtime data yet. Run a workflow.</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-white/80">Status</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          runtime.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
          runtime.status === "failed" ? "bg-red-500/20 text-red-400" :
          runtime.status === "running" ? "bg-amber-500/20 text-amber-400" :
          "bg-white/10 text-white/60"
        }`}>{runtime.status.toUpperCase()}</span>
      </div>
      {runtime.startedAt && <div className="text-[10px] text-white/40">Started: {new Date(runtime.startedAt).toLocaleTimeString()}</div>}
      {Object.keys(runtime.checkpointResults).length > 0 && (
        <div className="space-y-1 pt-2 border-t border-white/5">
          <div className="text-[10px] font-semibold text-white/60">Checkpoint Results</div>
          {Object.entries(runtime.checkpointResults).map(([id, result]) => (
            <div key={id} className="flex justify-between text-[10px]">
              <span className="text-white/40 truncate max-w-[150px]">{id}</span>
              <span className={result ? "text-emerald-400" : "text-red-400"}>{result ? "TRUE" : "FALSE"}</span>
            </div>
          ))}
        </div>
      )}
      {Object.keys(runtime.entrypointValues).length > 0 && (
        <div className="space-y-1 pt-2 border-t border-white/5">
          <div className="text-[10px] font-semibold text-white/60">Entrypoint Values</div>
          {Object.entries(runtime.entrypointValues).map(([id, val]) => (
            <div key={id} className="flex justify-between text-[10px]">
              <span className="text-white/40 truncate max-w-[150px]">{id}</span>
              <span className="text-blue-300 font-mono truncate max-w-[100px]">&quot;{val}&quot;</span>
            </div>
          ))}
        </div>
      )}
      <div className="pt-2 border-t border-white/5">
        <div className="text-[10px] font-semibold text-white/60 mb-1">Logs ({runtime.logs.length})</div>
        <div className="max-h-[300px] overflow-auto space-y-0.5">
          {runtime.logs.map((log: RuntimeLog, i: number) => (
            <div key={i} className={`text-[10px] font-mono ${log.level === "error" ? "text-red-400" : log.level === "warn" ? "text-amber-400" : "text-white/50"}`}>
              <span className="text-white/30">{new Date(log.timestamp).toLocaleTimeString()}</span>{" "}
              <span className="text-white/40">[{log.nodeName}]</span>{" "}{log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
