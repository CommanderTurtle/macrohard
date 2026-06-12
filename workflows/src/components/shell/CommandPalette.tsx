// ============================================================================
// Command Palette — ComfyUI-style "just start typing" node search
// ============================================================================
// Double-click canvas or press Ctrl+K to open. Type to filter nodes & macros.
// Press Enter or click to add at the cursor position.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Type, GitFork, PlayCircle, Grid3X3, LogOut, Plus, Keyboard,
} from "lucide-react";
import { BUILTIN_MACROS, useWorkflowStore } from "@/stores/workflowStore";
import type { NodeType } from "@/types/workflow";

interface PaletteItem {
  id: string;
  label: string;
  type: "node" | "macro";
  nodeType?: NodeType;
  macroId?: string;
  category: string;
  icon: React.ElementType;
  color: string;
  keywords: string;
}

interface Props {
  isOpen: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
}

const NODE_ITEMS: PaletteItem[] = [
  {
    id: "node-entrypoint",
    label: "Entrypoint",
    type: "node",
    nodeType: "entrypoint",
    category: "Input",
    icon: Type,
    color: "text-blue-400",
    keywords: "input variable string bool float entry point parameter argument",
  },
  {
    id: "node-checkpoint",
    label: "Checkpoint",
    type: "node",
    nodeType: "checkpoint",
    category: "Logic",
    icon: GitFork,
    color: "text-purple-400",
    keywords: "if then else condition check logic branch decision compare",
  },
  {
    id: "node-macro",
    label: "Macro",
    type: "node",
    nodeType: "macro",
    category: "Action",
    icon: PlayCircle,
    color: "text-cyan-400",
    keywords: "action run execute task automation script bot keystroke paste",
  },
  {
    id: "node-datagrid",
    label: "Data Grid",
    type: "node",
    nodeType: "datagrid",
    category: "Variables",
    icon: Grid3X3,
    color: "text-orange-400",
    keywords: "grid table data variables cells array matrix storage",
  },
  {
    id: "node-output",
    label: "Output",
    type: "node",
    nodeType: "output",
    category: "Result",
    icon: LogOut,
    color: "text-rose-400",
    keywords: "result end finish terminal return output done",
  },
];

export default function CommandPalette({ isOpen, position, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const addNode = useWorkflowStore((s) => s.addNode);

  // Build full item list (nodes + macros)
  const allItems = useMemo<PaletteItem[]>(() => {
    const macroItems: PaletteItem[] = BUILTIN_MACROS.map((m) => ({
      id: `macro-${m.id}`,
      label: m.name,
      type: "macro" as const,
      macroId: m.id,
      category: m.category,
      icon: PlayCircle,
      color: "text-cyan-400/60",
      keywords: `${m.name} ${m.description} ${m.category} macro`.toLowerCase(),
    }));
    return [...NODE_ITEMS, ...macroItems];
  }, []);

  // Filter by query
  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase().trim();
    const scored = allItems
      .map((item) => {
        const text = `${item.label} ${item.keywords} ${item.category}`.toLowerCase();
        let score = 0;
        // Exact label match gets highest score
        if (item.label.toLowerCase() === q) score += 100;
        // Starts with query
        else if (item.label.toLowerCase().startsWith(q)) score += 50;
        // Contains query
        else if (text.includes(q)) score += 20;
        // Keywords contain query
        else if (item.keywords.includes(q)) score += 10;
        return { item, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
    return scored;
  }, [query, allItems]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[selectedIndex];
        if (item && position) {
          executeItem(item, position, addNode);
          onClose();
        }
        return;
      }
    },
    [filtered, selectedIndex, position, addNode, onClose]
  );

  if (!isOpen || !position) return null;

  return (
    <div
      className="fixed z-[1000] flex flex-col w-[320px] rounded-xl border border-white/10 
                 bg-[#12121e]/98 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden"
      style={{ left: position.x, top: position.y }}
      onKeyDown={handleKeyDown}
    >
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
        <Keyboard size={14} className="text-white/40 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes & macros..."
          className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none"
          spellCheck={false}
          autoComplete="off"
        />
        <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono">
          Esc
        </kbd>
      </div>

      {/* Results */}
      <div className="max-h-[360px] overflow-auto py-1">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-white/30">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Group by category */}
        {groupByCategory(filtered).map((group) => (
          <div key={group.category}>
            <div className="px-3 py-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
              {group.category}
            </div>
            {group.items.map((item) => {
              const globalIdx = filtered.indexOf(item);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    executeItem(item, position, addNode);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(globalIdx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                    ${globalIdx === selectedIndex ? "bg-white/10" : "hover:bg-white/[0.03]"}`}
                >
                  <Icon size={15} className={item.color + " shrink-0"} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-white/90 truncate">
                      {highlightMatch(item.label, query)}
                    </div>
                    {item.type === "macro" && (
                      <div className="text-[10px] text-white/30 truncate">
                        {BUILTIN_MACROS.find((m) => m.id === item.macroId)?.description}
                      </div>
                    )}
                  </div>
                  <Plus
                    size={12}
                    className={`shrink-0 transition-opacity
                      ${globalIdx === selectedIndex ? "text-white/60 opacity-100" : "text-white/20 opacity-0"}`}
                  />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/10 text-[10px] text-white/20">
        <span>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        <span className="flex items-center gap-1.5">
          <span>
            <kbd className="px-1 rounded bg-white/10">&#8593;&#8595;</kbd> navigate
          </span>
          <span>
            <kbd className="px-1 rounded bg-white/10">Enter</kbd> add
          </span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByCategory(items: PaletteItem[]) {
  const map = new Map<string, PaletteItem[]>();
  for (const item of items) {
    const existing = map.get(item.category) ?? [];
    existing.push(item);
    map.set(item.category, existing);
  }
  // Return in consistent order
  const order = ["Input", "Logic", "Action", "Variables", "Result"];
  const result: { category: string; items: PaletteItem[] }[] = [];
  for (const cat of order) {
    if (map.has(cat)) result.push({ category: cat, items: map.get(cat)! });
  }
  // Add any remaining categories
  for (const [cat, items] of map) {
    if (!order.includes(cat)) result.push({ category: cat, items });
  }
  return result;
}

function executeItem(
  item: PaletteItem,
  position: { x: number; y: number },
  addNode: (type: NodeType, pos: { x: number; y: number }) => void
) {
  if (item.type === "node" && item.nodeType) {
    addNode(item.nodeType, position);
  } else if (item.type === "macro" && item.macroId) {
    useWorkflowStore.getState().addNode("macro", position);
    // Pre-configure the macro with the selected built-in
    const workflow = useWorkflowStore.getState().workflow;
    if (workflow) {
      const macroNode = workflow.nodes[workflow.nodes.length - 1];
      if (macroNode) {
        const macro = BUILTIN_MACROS.find((m) => m.id === item.macroId);
        if (macro) {
          useWorkflowStore.getState().updateNode(macroNode.id, {
            data: {
              ...macroNode.data,
              config: {
                ...(macroNode.data as any).config,
                name: macro.name,
                macroId: macro.id,
                delay: macro.delay,
              },
            },
          });
        }
      }
    }
  }
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <span>{text}</span>;
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <span className="text-white font-semibold bg-white/10 rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </span>
  );
}
