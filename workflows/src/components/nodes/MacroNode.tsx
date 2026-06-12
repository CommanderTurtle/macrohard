import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Play, Clock, Repeat } from "lucide-react";
import NodeActions from "./NodeActions";

interface Props {
  id: string;
  data: {
    config: { name: string; macroId?: string; delay: number; loop: number };
    label: string;
    runtime?: any;
    _showActions?: boolean;
    _onCopy?: (id: string) => void;
    _onDuplicate?: (id: string) => void;
    _onDelete?: (id: string) => void;
  };
  selected: boolean;
}

function MacroNode({ id, data, selected }: Props) {
  const config = data.config;
  const runtime = data.runtime;

  const statusColor = runtime?.status === "running" ? "border-l-amber-500" :
    runtime?.status === "completed" ? "border-l-emerald-500" :
    runtime?.status === "failed" ? "border-l-red-500" :
    "border-l-cyan-500";

  return (
    <div className="relative min-w-[180px]">
      <NodeActions
        nodeId={id}
        visible={!!(data._showActions || selected)}
        onCopy={data._onCopy ?? (() => {})}
        onDuplicate={data._onDuplicate ?? (() => {})}
        onDelete={data._onDelete ?? (() => {})}
      />

      <div
        className={`min-w-[180px] rounded-xl border border-white/10 bg-[#1a1a2e]/95 shadow-lg backdrop-blur
          ${selected ? "ring-2 ring-cyan-400/60" : ""}
          ${statusColor} border-l-[3px] transition-shadow duration-150`}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <Play size={14} className="text-cyan-400" />
          <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">Macro</span>
          {runtime?.status === "running" && (
            <span className="ml-auto flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          )}
        </div>

        <div className="px-3 py-2.5">
          <div className="text-sm font-medium text-white">{config.name}</div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex items-center gap-1 text-[10px] text-white/40"><Clock size={10} />{config.delay}s</div>
            <div className="flex items-center gap-1 text-[10px] text-white/40"><Repeat size={10} />{config.loop < 0 ? "inf" : config.loop}</div>
          </div>
          {runtime?.output && <div className="mt-1.5 text-[10px] text-cyan-400 font-mono truncate">{runtime.output}</div>}
          {config.macroId && config.macroId !== config.name && <div className="mt-1 text-[10px] text-white/30">ref: {config.macroId}</div>}
        </div>

        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-cyan-400 !border !border-[#1a1a2e]" />
        <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-cyan-400 !border !border-[#1a1a2e]" />
      </div>
    </div>
  );
}

export default memo(MacroNode);
