// ============================================================================
// Floating Node Action Buttons
// ============================================================================
// Appears on the top-right of each node on hover. Provides quick access to
// copy, duplicate, and delete — so you never have to go to the sidebar.

import { memo } from "react";
import { Copy, Layers, Trash2 } from "lucide-react";

interface Props {
  nodeId: string;
  visible: boolean;
  onCopy: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

function NodeActions({ nodeId, visible, onCopy, onDuplicate, onDelete }: Props) {
  if (!visible) return null;

  return (
    <div
      className="absolute -top-3 -right-3 flex items-center gap-0.5 p-0.5 rounded-lg 
                 bg-[#12121e] border border-white/10 shadow-lg shadow-black/50
                 z-50 animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => onCopy(nodeId)}
        title="Copy"
        className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-blue-400 transition-colors"
      >
        <Copy size={12} />
      </button>
      <button
        onClick={() => onDuplicate(nodeId)}
        title="Duplicate"
        className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-purple-400 transition-colors"
      >
        <Layers size={12} />
      </button>
      <div className="w-px h-3 bg-white/10 mx-0.5" />
      <button
        onClick={() => onDelete(nodeId)}
        title="Delete"
        className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-red-400 transition-colors"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

export default memo(NodeActions);
