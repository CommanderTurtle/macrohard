import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { LogOut } from "lucide-react";
import type { OutputConfig } from "@/types/workflow";
import NodeActions from "./NodeActions";

interface Props {
  id: string;
  data: {
    config: OutputConfig;
    label: string;
    runtime?: any;
    _showActions?: boolean;
    _onCopy?: (id: string) => void;
    _onDuplicate?: (id: string) => void;
    _onDelete?: (id: string) => void;
  };
  selected: boolean;
}

function OutputNode({ id, data, selected }: Props) {
  const config = data.config;
  const runtime = data.runtime;

  return (
    <div className="relative min-w-[160px]">
      <NodeActions
        nodeId={id}
        visible={!!(data._showActions || selected)}
        onCopy={data._onCopy ?? (() => {})}
        onDuplicate={data._onDuplicate ?? (() => {})}
        onDelete={data._onDelete ?? (() => {})}
      />

      <div
        className={`min-w-[160px] rounded-xl border border-white/10 bg-[#1a1a2e]/95 shadow-lg backdrop-blur
          ${selected ? "ring-2 ring-rose-400/60" : ""}
          border-l-[3px] border-l-rose-500 transition-shadow duration-150`}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          <LogOut size={14} className="text-rose-400" />
          <span className="text-xs font-semibold text-white/90 uppercase tracking-wider">Output</span>
          {runtime?.status === "completed" && <span className="ml-auto text-[10px] text-emerald-400 font-bold">DONE</span>}
        </div>
        <div className="px-3 py-2.5">
          <div className="text-sm font-medium text-white">{config.name}</div>
          {runtime?.output && (
            <div className="mt-1 text-[10px] text-white/50 font-mono max-w-[200px] break-words">{JSON.stringify(runtime.output)}</div>
          )}
        </div>
        <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-rose-400 !border !border-[#1a1a2e]" />
      </div>
    </div>
  );
}

export default memo(OutputNode);
