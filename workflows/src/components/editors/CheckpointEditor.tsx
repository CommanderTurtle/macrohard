import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GitFork } from "lucide-react";
import type { CheckpointCondition, CheckpointConfig, ValueType } from "@/types/workflow";

const STRING_OPS = [
  { value: "contains", label: "contains" },
  { value: "notContains", label: "does not contain" },
  { value: "equals", label: "equals" },
  { value: "notEquals", label: "does not equal" },
  { value: "startsWith", label: "starts with" },
  { value: "endsWith", label: "ends with" },
  { value: "regex", label: "matches regex" },
];

const BOOL_OPS = [
  { value: "isTrue", label: "is TRUE" },
  { value: "isFalse", label: "is FALSE" },
];

const FLOAT_OPS = [
  { value: "equals", label: "=" },
  { value: "notEqual", label: "!=" },
  { value: "greaterThan", label: ">" },
  { value: "lessThan", label: "<" },
  { value: "greaterOrEqual", label: ">=" },
  { value: "lessOrEqual", label: "<=" },
];

const LOGIC_CONNECTORS = [
  { value: "and", label: "AND" },
  { value: "or", label: "OR" },
  { value: "xor", label: "XOR" },
];

const VALUE_TYPES: { value: ValueType; label: string }[] = [
  { value: "string", label: "String" },
  { value: "bool", label: "Boolean" },
  { value: "float", label: "Float" },
];

interface Props {
  config: CheckpointConfig;
  entrypointIds: string[];
  gridIds: string[];
  onChange: (config: CheckpointConfig) => void;
}

export default function CheckpointEditor({ config, entrypointIds, gridIds, onChange }: Props) {
  const [local, setLocal] = useState<CheckpointConfig>(JSON.parse(JSON.stringify(config)));

  const allSourceIds = [...entrypointIds, ...gridIds];

  function updateCondition(index: number, patch: Partial<CheckpointCondition>) {
    const conditions = local.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    setLocal({ ...local, conditions });
    onChange({ ...local, conditions });
  }

  function removeCondition(index: number) {
    const conditions = local.conditions.filter((_, i) => i !== index);
    // Update logic connectors
    if (conditions.length > 0) {
      const lastIndex = conditions.length - 1;
      conditions[lastIndex] = { ...conditions[lastIndex], logic: undefined };
    }
    setLocal({ ...local, conditions });
    onChange({ ...local, conditions });
  }

  function addCondition() {
    const newCond: CheckpointCondition = {
      id: `cond-${Date.now()}`,
      sourceId: allSourceIds[0] ?? "",
      type: "string",
      operator: "contains",
      compareValue: "",
      caseSensitive: false,
    };
    // Set logic on previous last condition
    const conditions = local.conditions.map((c, i) =>
      i === local.conditions.length - 1 ? { ...c, logic: "and" as const } : c
    );
    conditions.push(newCond);
    setLocal({ ...local, conditions });
    onChange({ ...local, conditions });
  }

  function updateName(name: string) {
    setLocal({ ...local, name });
    onChange({ ...local, name });
  }

  function getOperatorsForType(type: ValueType) {
    switch (type) {
      case "bool": return BOOL_OPS;
      case "float": return FLOAT_OPS;
      default: return STRING_OPS;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <GitFork size={16} className="text-purple-400" />
        <h3 className="text-sm font-semibold text-white">Checkpoint Configuration</h3>
      </div>

      <div>
        <Label className="text-white/60 text-xs">Name</Label>
        <Input
          value={local.name}
          onChange={(e) => updateName(e.target.value)}
          className="mt-1 bg-white/5 border-white/10 text-white text-sm"
          placeholder="Checkpoint name"
        />
      </div>

      <div className="space-y-3">
        {local.conditions.map((cond, i) => (
          <div
            key={cond.id}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2.5"
          >
            {/* Logic connector (shown for all but first) */}
            {i > 0 && (
              <div className="flex justify-center">
                <Select
                  value={local.conditions[i - 1].logic ?? "and"}
                  onValueChange={(v) => {
                    const conditions = local.conditions.map((c, idx) =>
                      idx === i - 1 ? { ...c, logic: v as "and" | "or" | "xor" } : c
                    );
                    setLocal({ ...local, conditions });
                    onChange({ ...local, conditions });
                  }}
                >
                  <SelectTrigger className="w-20 h-6 text-[10px] bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a2e] border-white/10">
                    {LOGIC_CONNECTORS.map((lc) => (
                      <SelectItem key={lc.value} value={lc.value} className="text-xs text-white">
                        {lc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 font-mono">Condition {i + 1}</span>
              {local.conditions.length > 1 && (
                <button
                  onClick={() => removeCondition(i)}
                  className="text-white/30 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {/* Source */}
            <div>
              <Label className="text-white/50 text-[10px]">Source</Label>
              <Select
                value={cond.sourceId}
                onValueChange={(v) => updateCondition(i, { sourceId: v })}
              >
                <SelectTrigger className="mt-1 h-8 bg-white/5 border-white/10 text-white text-xs">
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {allSourceIds.length === 0 && (
                    <SelectItem value="" disabled className="text-xs text-white/40">
                      No sources available — add entrypoints first
                    </SelectItem>
                  )}
                  {entrypointIds.map((id) => (
                    <SelectItem key={id} value={id} className="text-xs text-white">
                      {id} (entrypoint)
                    </SelectItem>
                  ))}
                  {gridIds.map((id) => (
                    <SelectItem key={id} value={id} className="text-xs text-white">
                      {id} (grid)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value type */}
            <div>
              <Label className="text-white/50 text-[10px]">Value Type</Label>
              <div className="flex gap-1 mt-1">
                {VALUE_TYPES.map((vt) => (
                  <button
                    key={vt.value}
                    onClick={() => updateCondition(i, { type: vt.value })}
                    className={`flex-1 py-1 px-2 rounded text-[10px] font-medium transition-colors border
                      ${cond.type === vt.value
                        ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                        : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                      }`}
                  >
                    {vt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Operator */}
            <div>
              <Label className="text-white/50 text-[10px]">Operator</Label>
              <Select
                value={cond.operator}
                onValueChange={(v) => updateCondition(i, { operator: v as any })}
              >
                <SelectTrigger className="mt-1 h-8 bg-white/5 border-white/10 text-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {getOperatorsForType(cond.type).map((op) => (
                    <SelectItem key={op.value} value={op.value} className="text-xs text-white">
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Compare value (not needed for bool) */}
            {cond.type !== "bool" && (
              <div>
                <Label className="text-white/50 text-[10px]">
                  {cond.type === "float" ? "Compare Number" : "Compare Text"}
                </Label>
                <Input
                  value={cond.compareValue}
                  onChange={(e) => updateCondition(i, { compareValue: e.target.value })}
                  className="mt-1 h-8 bg-white/5 border-white/10 text-white text-xs"
                  placeholder={cond.type === "float" ? "0.0" : "text to match"}
                />
              </div>
            )}

            {/* Case sensitive (strings only) */}
            {cond.type === "string" && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={cond.caseSensitive ?? false}
                  onCheckedChange={(v) => updateCondition(i, { caseSensitive: v })}
                  className="data-[state=checked]:bg-purple-500"
                />
                <Label className="text-white/50 text-[10px]">Case sensitive</Label>
              </div>
            )}
          </div>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={addCondition}
          className="w-full border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-xs"
        >
          <Plus size={12} className="mr-1" />
          Add Condition
        </Button>
      </div>

      {/* Preview */}
      {local.conditions.length > 0 && (
        <div className="rounded-md bg-purple-500/5 border border-purple-500/20 p-2.5">
          <div className="text-[10px] text-purple-300/60 font-mono">
            {local.conditions.map((c, i) => (
              <span key={c.id}>
                {i === 0 ? "IF " : ` ${c.logic?.toUpperCase() ?? "AND"} `}
                &quot;{c.sourceId || "?"}&quot; {c.operator}
                {c.type !== "bool" ? ` "${c.compareValue}"` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
