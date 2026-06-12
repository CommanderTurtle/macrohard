import { useEffect, useRef } from "react";
import { useWorkflowStore } from "@/stores/workflowStore";

const STORAGE_KEY = "tasket-workflows";
const AUTOSAVE_INTERVAL = 3000;

export function useAutoSave() {
  const workflow = useWorkflowStore((s) => s.workflow);
  const autoSaveEnabled = useWorkflowStore((s) => s.autoSaveEnabled);
  const lastSavedRef = useRef<string>("");

  // Auto-save to localStorage
  useEffect(() => {
    if (!workflow || !autoSaveEnabled) return;

    const timer = setTimeout(() => {
      const json = JSON.stringify(workflow);
      if (json !== lastSavedRef.current) {
        try {
          localStorage.setItem(`${STORAGE_KEY}-${workflow.id}`, json);
          // Also save to index
          const index = getIndex();
          index[workflow.id] = {
            name: workflow.name,
            updatedAt: workflow.updatedAt,
          };
          localStorage.setItem(`${STORAGE_KEY}-index`, JSON.stringify(index));
          lastSavedRef.current = json;
        } catch {
          console.warn("Auto-save failed: localStorage full");
        }
      }
    }, AUTOSAVE_INTERVAL);

    return () => clearTimeout(timer);
  }, [workflow, autoSaveEnabled]);
}

export function loadSavedWorkflows(): Array<{ id: string; name: string; updatedAt: string }> {
  try {
    const index = getIndex();
    return Object.entries(index).map(([id, meta]) => ({
      id,
      name: (meta as any).name ?? "Untitled",
      updatedAt: (meta as any).updatedAt ?? new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export function loadWorkflow(id: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_KEY}-${id}`);
  } catch {
    return null;
  }
}

function getIndex(): Record<string, { name: string; updatedAt: string }> {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY}-index`) ?? "{}");
  } catch {
    return {};
  }
}
