import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { GitFork } from "lucide-react";
import type { CheckpointConfig } from "@/types/workflow";
import NodeActions from "./NodeActions";

interface Props {
  id: string;
  data: {
    config: CheckpointConfig;
    label: string;
    runtime?: any;
    _showActions?: boolean;
    _onCopy?: (id: string) => void;
    _onDuplicate?: (id: string) => void;
    _onDelete?: (id: string) => void;
  };
  selected: boolean;
}

function CheckpointNode({ id, data, selected }: Props) {
  const config = data.config;
  const runtime = data.runtime;
  const result = runtime?.output;
  const resultColor = result === "true" ? "text-emerald-400" : result === "false" ? "text-red-400" : "text-white/50";

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
        className={`min-w-[220px] max-w-[280px] rounded-xl border border-white/10 bg-[#1a1a2e]/95 shadow-lg backdrop-blur
          ${selected ? "ring-2 ring-purple-400/60" : ""}
          border-l-[3px] border-l-purple-500 transition-shadow duration-150`}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <GitFork size={14} className="text-purple-400" />
          <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">Checkpoint</span>
          {result && <span className={`ml-auto text-[10px] font-bold ${resultColor}`}>{result.toUpperCase()}</span>}
        </div>

        <div className="px-3 py-2.5">
          <div className="text-sm font-medium text-white mb-1.5">{config.name}</div>
          <div className="space-y-1">
            {config.conditions.map((cond, i) => (
              <div key={cond.id} className="text-[10px] text-white/50 leading-tight font-mono">
                {i === 0 ? "IF" : cond.logic?.toUpperCase() ?? "AND"}{" "}
                <span className="text-white/70">{cond.sourceId || "?"}</span>{" "}
                <span className="text-purple-300/70">{cond.operator}</span>{" "}
                <span className="text-amber-300/70">&ldquo;{cond.compareValue}&rdquo;</span>
              </div>
            ))}
          </div>
          {config.conditions.length === 0 && <div className="text-[10px] text-white/30 italic">No conditions set</div>}
        </div>

        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-purple-400 !border !border-[#1a1a2e]" />
        <Handle id="true" type="source" position={Position.Right} style={{ top: "35%" }} className="!w-2.5 !h-2.5 !bg-emerald-400 !border !border-[#1a1a2e]" />
        <Handle id="false" type="source" position={Position.Right} style={{ top: "65%" }} className="!w-2.5 !h-2.5 !bg-red-400 !border !border-[#1a1a2e]" />
      </div>
    </div>
  );
}

export default memo(CheckpointNode);
