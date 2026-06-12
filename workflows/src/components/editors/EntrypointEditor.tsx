import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Type, ScanEye } from "lucide-react";
import type { EntrypointConfig, ValueType } from "@/types/workflow";

interface Props {
  config: EntrypointConfig;
  onChange: (config: EntrypointConfig) => void;
}

const VALUE_TYPES: { value: ValueType; label: string; color: string }[] = [
  { value: "string", label: "String", color: "bg-blue-500/20 border-blue-500/40 text-blue-300" },
  { value: "bool", label: "Boolean", color: "bg-green-500/20 border-green-500/40 text-green-300" },
  { value: "float", label: "Float", color: "bg-amber-500/20 border-amber-500/40 text-amber-300" },
];

export default function EntrypointEditor({ config, onChange }: Props) {
  function patch(p: Partial<EntrypointConfig>) {
    onChange({ ...config, ...p });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <Type size={16} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-white">Entrypoint</h3>
      </div>

      <div>
        <Label className="text-white/60 text-xs">Name</Label>
        <Input
          value={config.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="mt-1 bg-white/5 border-white/10 text-white text-sm"
        />
      </div>

      <div>
        <Label className="text-white/60 text-xs">Value Type</Label>
        <div className="flex gap-1 mt-1">
          {VALUE_TYPES.map((vt) => (
            <button
              key={vt.value}
              onClick={() => patch({ valueType: vt.value })}
              className={`flex-1 py-1 px-2 rounded text-[10px] font-medium transition-colors border
                ${config.valueType === vt.value ? vt.color : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
            >
              {vt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-white/60 text-xs">Default Value</Label>
        <Input
          value={config.defaultValue}
          onChange={(e) => patch({ defaultValue: e.target.value })}
          className="mt-1 bg-white/5 border-white/10 text-white text-sm"
          placeholder={config.valueType === "float" ? "0.0" : config.valueType === "bool" ? "true/false" : "default text"}
        />
      </div>

      <div>
        <Label className="text-white/60 text-xs">Description</Label>
        <Input
          value={config.description}
          onChange={(e) => patch({ description: e.target.value })}
          className="mt-1 bg-white/5 border-white/10 text-white text-sm"
          placeholder="What this entrypoint is for"
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-white/5">
        <Switch
          checked={config.useOcr}
          onCheckedChange={(v) => patch({ useOcr: v })}
          className="data-[state=checked]:bg-purple-500"
        />
        <div>
          <Label className="text-white/60 text-xs flex items-center gap-1">
            <ScanEye size={12} className="text-purple-400" />
            Use OCR
          </Label>
          <div className="text-[10px] text-white/30">Auto-fill from screen capture</div>
        </div>
      </div>
    </div>
  );
}
