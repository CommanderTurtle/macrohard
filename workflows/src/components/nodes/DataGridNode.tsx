import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Grid3X3, Check, X } from "lucide-react";
import type { DataGridConfig } from "@/types/workflow";
import { useWorkflowStore } from "@/stores/workflowStore";
import NodeActions from "./NodeActions";

interface Props {
  id: string;
  data: {
    config: DataGridConfig;
    label: string;
    _showActions?: boolean;
    _onCopy?: (id: string) => void;
    _onDuplicate?: (id: string) => void;
    _onDelete?: (id: string) => void;
  };
  selected: boolean;
}

function DataGridNode({ id, data, selected }: Props) {
  const config = data.config as DataGridConfig;
  const [editingCell, setEditingCell] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const updateNode = useWorkflowStore((s) => s.updateNode);

  function updateCell(index: number, newValue: string) {
    const cells = config.cells.map((c, i) =>
      i === index ? { ...c, value: newValue, updatedAt: new Date().toISOString() } : c
    );
    updateNode(id, { data: { ...data, config: { ...config, cells } } });
  }

  function startEdit(index: number) {
    setEditingCell(index);
    setEditValue(config.cells[index]?.value ?? "");
  }

  function commitEdit(index: number) {
    updateCell(index, editValue);
    setEditingCell(null);
  }

  function cancelEdit() {
    setEditingCell(null);
  }

  return (
    <div className="relative min-w-[220px]">
      <NodeActions
        nodeId={id}
        visible={!!(data._showActions || selected)}
        onCopy={data._onCopy ?? (() => {})}
        onDuplicate={data._onDuplicate ?? (() => {})}
        onDelete={data._onDelete ?? (() => {})}
      />

      <div
        className={`min-w-[220px] rounded-xl border border-white/10 bg-[#1a1a2e]/95 shadow-lg backdrop-blur
          ${selected ? "ring-2 ring-orange-400/60" : ""}
          border-l-[3px] border-l-orange-500 transition-shadow duration-150`}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <Grid3X3 size={14} className="text-orange-400" />
          <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">Data Grid</span>
          <span className="ml-auto text-[10px] text-white/30">{config.cells.filter((c) => c.value).length}/9</span>
        </div>

        <div className="p-3">
          <div className="text-xs font-medium text-white/70 mb-2">{config.name}</div>
          <div className="grid grid-cols-3 gap-1">
            {config.cells.map((cell, i) => (
              <div key={cell.id} className="relative">
                {editingCell === i ? (
                  <div className="flex items-center gap-0.5">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitEdit(i); if (e.key === "Escape") cancelEdit(); }}
                      className="w-full h-7 px-1 rounded border border-orange-500/50 bg-[#12121e] text-white text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    <button onClick={() => commitEdit(i)} className="text-emerald-400 hover:text-emerald-300"><Check size={10} /></button>
                    <button onClick={cancelEdit} className="text-red-400 hover:text-red-300"><X size={10} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(i)}
                    className={`w-full h-8 rounded border flex items-center justify-center text-[10px] font-mono transition-colors hover:border-orange-400/50
                      ${cell.value ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/30"}`}
                    title={`${cell.label}${cell.value ? `: ${cell.value}` : " (click to edit)"}`}
                  >{cell.value || cell.label}</button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-orange-400 !border !border-[#1a1a2e]" />
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-orange-400 !border !border-[#1a1a2e]" />
      </div>
    </div>
  );
}

export default memo(DataGridNode);
