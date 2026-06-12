import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import WorkflowCanvas from "@/components/shell/WorkflowCanvas";
import { useWorkflowStore } from "@/stores/workflowStore";
import { loadSavedWorkflows, loadWorkflow } from "@/hooks/useAutoSave";
import "./App.css";

function App() {
  const createWorkflow = useWorkflowStore((s) => s.createWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);

  // Try to restore last workflow on mount
  useEffect(() => {
    const saved = loadSavedWorkflows();
    if (saved.length > 0) {
      // Load most recently updated
      const mostRecent = saved.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      const json = loadWorkflow(mostRecent.id);
      if (json) {
        importWorkflow(json);
        return;
      }
    }
    // No saved workflow — create a demo one
    createDemoWorkflow();
  }, []);

  function createDemoWorkflow() {
    createWorkflow("Demo Workflow", "A sample workflow to get you started");
    const store = useWorkflowStore.getState();

    // Add demo nodes
    const workflow = store.workflow;
    if (!workflow) return;

    const nodes = [
      {
        id: "entry-search",
        type: "entrypoint" as const,
        position: { x: 50, y: 200 },
        data: {
          label: "Search Text",
          config: {
            name: "Search Query",
            valueType: "string" as const,
            defaultValue: "hello world",
            description: "Text to search for",
            useOcr: false,
          },
        },
      },
      {
        id: "entry-number",
        type: "entrypoint" as const,
        position: { x: 50, y: 400 },
        data: {
          label: "Threshold",
          config: {
            name: "Confidence Threshold",
            valueType: "float" as const,
            defaultValue: "0.8",
            description: "Minimum confidence score",
            useOcr: false,
          },
        },
      },
      {
        id: "cp-check-text",
        type: "checkpoint" as const,
        position: { x: 350, y: 200 },
        data: {
          label: "Has Text?",
          config: {
            name: "Check for text",
            conditions: [
              {
                id: "cond-1",
                sourceId: "entry-search",
                type: "string" as const,
                operator: "contains",
                compareValue: "hello",
                caseSensitive: false,
              },
            ],
          },
        },
      },
      {
        id: "macro-open-browser",
        type: "macro" as const,
        position: { x: 650, y: 150 },
        data: {
          label: "Open Browser",
          config: {
            name: "Open Browser",
            macroId: "open-browser",
            delay: 0,
            loop: 1,
          },
        },
      },
      {
        id: "macro-screenshot",
        type: "macro" as const,
        position: { x: 650, y: 350 },
        data: {
          label: "Screenshot",
          config: {
            name: "Take Screenshot",
            macroId: "screenshot",
            delay: 0,
            loop: 1,
          },
        },
      },
      {
        id: "output-result",
        type: "output" as const,
        position: { x: 950, y: 200 },
        data: {
          label: "Done",
          config: {
            name: "Result",
            sourceIds: [],
          },
        },
      },
    ];

    const edges = [
      {
        id: "e-entry-cp",
        source: "entry-search",
        target: "cp-check-text",
        data: undefined,
      },
      {
        id: "e-cp-true",
        source: "cp-check-text",
        target: "macro-open-browser",
        label: "true",
        data: { conditionResult: true },
      },
      {
        id: "e-cp-false",
        source: "cp-check-text",
        target: "macro-screenshot",
        label: "false",
        data: { conditionResult: false },
      },
      {
        id: "e-browser-out",
        source: "macro-open-browser",
        target: "output-result",
        data: undefined,
      },
      {
        id: "e-shot-out",
        source: "macro-screenshot",
        target: "output-result",
        data: undefined,
      },
    ];

    useWorkflowStore.setState({
      workflow: { ...workflow, nodes, edges },
    });
  }

  return (
    <ReactFlowProvider>
      <WorkflowCanvas />
    </ReactFlowProvider>
  );
}

export default App;
