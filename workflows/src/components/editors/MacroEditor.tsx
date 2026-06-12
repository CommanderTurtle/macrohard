import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayCircle } from "lucide-react";
import type { MacroConfig, MacroLibraryItem } from "@/types/workflow";

interface Props {
  config: MacroConfig;
  macroLibrary: MacroLibraryItem[];
  onChange: (config: MacroConfig) => void;
}

export default function MacroEditor({ config, macroLibrary, onChange }: Props) {
  function patch(p: Partial<MacroConfig>) {
    onChange({ ...config, ...p });
  }

  const selectedMacro = macroLibrary.find((m) => m.id === config.macroId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <PlayCircle size={16} className="text-cyan-400" />
        <h3 className="text-sm font-semibold text-white">Macro Configuration</h3>
      </div>

      {/* Name */}
      <div>
        <Label className="text-white/60 text-xs">Name</Label>
        <Input
          value={config.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="mt-1 bg-white/5 border-white/10 text-white text-sm"
        />
      </div>

      {/* Macro reference */}
      <div>
        <Label className="text-white/60 text-xs">Reference Macro</Label>
        <Select value={config.macroId ?? ""} onValueChange={(v) => {
          const macro = macroLibrary.find((m) => m.id === v);
          patch({ macroId: v, name: macro?.name ?? config.name, delay: macro?.delay ?? config.delay });
        }}>
          <SelectTrigger className="mt-1 bg-white/5 border-white/10 text-white text-xs">
            <SelectValue placeholder="Select or create new..." />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a2e] border-white/10">
            <SelectItem value="" className="text-xs text-white">(custom)</SelectItem>
            {macroLibrary.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs text-white">
                {m.name} ({m.category})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedMacro && (
          <div className="mt-1 text-[10px] text-white/40">{selectedMacro.description}</div>
        )}
      </div>

      {/* Delay */}
      <div>
        <Label className="text-white/60 text-xs">Delay (seconds)</Label>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="range"
            min={0}
            max={60}
            value={config.delay}
            onChange={(e) => patch({ delay: parseInt(e.target.value) })}
            className="flex-1 accent-cyan-500"
          />
          <span className="text-xs text-white/60 font-mono w-8 text-right">{config.delay}s</span>
        </div>
      </div>

      {/* Loop */}
      <div>
        <Label className="text-white/60 text-xs">Loop Count</Label>
        <div className="flex gap-1 mt-1">
          {[1, 2, 3, 5].map((n) => (
            <button
              key={n}
              onClick={() => patch({ loop: n })}
              className={`flex-1 py-1 px-2 rounded text-[10px] font-medium transition-colors border
                ${config.loop === n ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
            >
              {n}x
            </button>
          ))}
          <button
            onClick={() => patch({ loop: -1 })}
            className={`flex-1 py-1 px-2 rounded text-[10px] font-medium transition-colors border
              ${config.loop < 0 ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
          >
            inf
          </button>
        </div>
      </div>
    </div>
  );
}
