import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Type, ScanEye, ToggleLeft, ToggleRight } from "lucide-react";
import { useWorkflowStore } from "@/stores/workflowStore";
import NodeActions from "./NodeActions";

interface Props {
  id: string;
  data: {
    config: { name: string; valueType: string; useOcr: boolean; defaultValue: string; description: string };
    label: string;
    runtime?: any;
    _showActions?: boolean;
    _onCopy?: (id: string) => void;
    _onDuplicate?: (id: string) => void;
    _onDelete?: (id: string) => void;
  };
  selected: boolean;
}

function EntrypointNode({ id, data, selected }: Props) {
  const config = data.config;
  const runtime = data.runtime;
  const updateNode = useWorkflowStore((s) => s.updateNode);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(config.defaultValue);

  const typeColors: Record<string, string> = {
    string: "border-l-blue-500",
    bool: "border-l-green-500",
    float: "border-l-amber-500",
  };

  function commitValue(newVal: string) {
    setEditing(false);
    updateNode(id, {
      data: {
        ...data,
        config: { ...config, defaultValue: newVal },
      },
    });
  }

  return (
    <div className={`relative min-w-[200px] ${data._showActions || selected ? "" : ""}`}>
      {/* Floating action buttons */}
      <NodeActions
        nodeId={id}
        visible={!!(data._showActions || selected)}
        onCopy={data._onCopy ?? (() => {})}
        onDuplicate={data._onDuplicate ?? (() => {})}
        onDelete={data._onDelete ?? (() => {})}
      />

      <div
        className={`min-w-[200px] rounded-xl border border-white/10 bg-[#1a1a2e]/95 shadow-lg backdrop-blur
          ${selected ? "ring-2 ring-blue-400/60" : ""}
          ${typeColors[config.valueType] ?? "border-l-gray-500"} border-l-[3px]
          transition-shadow duration-150`}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <Type size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">Entrypoint</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 font-mono ml-auto">{config.valueType}</span>
          {config.useOcr && <ScanEye size={12} className="text-purple-400 ml-1" />}
        </div>

        <div className="px-3 py-2.5">
          <div className="text-sm font-medium text-white">{config.name}</div>
          {config.description && <div className="text-[9px] text-white/30 mb-1.5">{config.description}</div>}

          {/* Inline value editor */}
          <div className="mt-2">
            {editing ? (
              <div className="flex items-center gap-1">
                {config.valueType === "bool" ? (
                  <button onClick={() => { const newVal = editValue.toLowerCase() === "true" || editValue === "1" ? "false" : "true"; setEditValue(newVal); }} className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                    {editValue.toLowerCase() === "true" || editValue === "1" ? (
                      <><ToggleRight size={16} className="text-green-400" /><span className="text-[11px] text-green-300">true</span></>
                    ) : (
                      <><ToggleLeft size={16} className="text-white/30" /><span className="text-[11px] text-white/50">false</span></>
                    )}
                  </button>
                ) : config.valueType === "float" ? (
                  <input autoFocus type="number" step="0.01" value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitValue(editValue); if (e.key === "Escape") setEditing(false); }}
                    onBlur={() => commitValue(editValue)}
                    className="w-full h-7 px-2 rounded border border-blue-500/50 bg-[#12121e] text-white text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-400" />
                ) : (
                  <input autoFocus type="text" value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitValue(editValue); if (e.key === "Escape") setEditing(false); }}
                    onBlur={() => commitValue(editValue)}
                    className="w-full h-7 px-2 rounded border border-blue-500/50 bg-[#12121e] text-white text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-blue-400" />
                )}
              </div>
            ) : (
              <button onClick={() => { setEditing(true); setEditValue(config.defaultValue); }}
                className="w-full text-left px-2 py-1.5 rounded bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] hover:border-white/10 transition-colors"
                title="Click to edit value">
                {config.valueType === "bool" ? (
                  <span className="flex items-center gap-1.5">
                    {config.defaultValue.toLowerCase() === "true" || config.defaultValue === "1" ? (
                      <><ToggleRight size={14} className="text-green-400" /><span className="text-[11px] text-green-300">true</span></>
                    ) : (
                      <><ToggleLeft size={14} className="text-white/30" /><span className="text-[11px] text-white/50">false</span></>
                    )}
                  </span>
                ) : (
                  <span className="text-[11px] text-white/60 font-mono truncate">
                    {config.defaultValue ? `= ${config.defaultValue}` : "(no value — click to set)"}
                  </span>
                )}
              </button>
            )}
          </div>

          {runtime?.output && <div className="mt-1.5 text-[10px] text-emerald-400 font-mono truncate">= {runtime.output}</div>}
        </div>

        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-blue-400 !border !border-[#1a1a2e]" />
      </div>
    </div>
  );
}

export default memo(EntrypointNode);
