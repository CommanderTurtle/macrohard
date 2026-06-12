import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Grid3X3, Copy, Check } from "lucide-react";
import type { DataGridConfig, GridCell } from "@/types/workflow";
import { useState } from "react";

interface Props {
  config: DataGridConfig;
  onChange: (config: DataGridConfig) => void;
}

export default function DataGridEditor({ config, onChange }: Props) {
  const [copied, setCopied] = useState(false);

  function updateCell(index: number, patch: Partial<GridCell>) {
    const cells = config.cells.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...config, cells });
  }

  function updateName(name: string) {
    onChange({ ...config, name });
  }

  function copyGrid() {
    const data = config.cells.map((c) => `${c.label}: ${c.value || "(empty)"}`).join("\n");
    navigator.clipboard.writeText(data).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Grid3X3 size={16} className="text-orange-400" />
          <h3 className="text-sm font-semibold text-white">Data Grid</h3>
        </div>
        <button
          onClick={copyGrid}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-white/5 hover:bg-white/10 text-white/60 transition-colors"
        >
          {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy All"}
        </button>
      </div>

      <div>
        <Label className="text-white/60 text-xs">Grid Name</Label>
        <Input
          value={config.name}
          onChange={(e) => updateName(e.target.value)}
          className="mt-1 bg-white/5 border-white/10 text-white text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {config.cells.map((cell, i) => (
          <div key={cell.id} className="space-y-0.5">
            <Label className="text-[9px] text-white/30">{cell.label}</Label>
            <Input
              value={cell.value}
              onChange={(e) => updateCell(i, { value: e.target.value })}
              className="h-7 bg-white/5 border-white/10 text-white text-[11px] font-mono"
              placeholder="..."
            />
          </div>
        ))}
      </div>

      <div className="text-[10px] text-white/30">
        Values persist across runs until manually cleared. Click &quot;Copy All&quot; to export to clipboard.
      </div>
    </div>
  );
}
