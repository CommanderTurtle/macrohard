import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Undo2,
  Redo2,
  PanelLeft,
  Braces,
  Check,
  Copy,
  Database,
  Download,
  FileInput,
  FileText,
  Grid3X3,
  Import,
  Keyboard,
  Maximize2,
  MousePointer2,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Terminal,
  ToggleLeft,
  Upload,
  Workflow,
  X,
} from "lucide-react";

import { initialEnv, pasteSlots, varSlots, pointSlots, shellSlots, serializeEnv, parseEnv, type PasteSlot, type VarSlot, type NodeKind, type MacrohelpEnvironment, type AppView } from "./environment";

interface TokenItem {
  category: string;
  label: string;
  token: string;
  detail: string;
}

interface MacroNodeData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  caption: string;
  tone: string;
}

interface EditorContextValue {
  env: MacrohelpEnvironment;
  setEnv: React.Dispatch<React.SetStateAction<MacrohelpEnvironment>>;
  appendScript: (token: string) => void;
  output: string;
  openExport: () => void;
}

const tokens: TokenItem[] = [
  { category: "Shell", label: "PowerShell", token: "{powershell}", detail: "Open the visible PowerShell entry route." },
  { category: "Shell", label: "Shell X", token: "{shell X}", detail: "Paste alias X into the visible shell and press Enter." },
  { category: "Shell", label: "Shell C", token: "{shell C}", detail: "Paste alias C into the visible shell and press Enter." },
  { category: "Shell", label: "Shell G", token: "{shell G}", detail: "Paste alias G into the visible shell and press Enter." },
  { category: "Shell", label: "cmd", token: "{cmd}", detail: "Shortcut for configured shell alias C." },
  { category: "Shell", label: "bash", token: "{bash}", detail: "Shortcut for configured shell alias X." },
  { category: "Shell", label: "python", token: "{python}", detail: "Shortcut for configured shell alias G." },
  { category: "Shell", label: "Regedited Alias", token: "{regedited}", detail: "Open the visible shell and run configured alias G; regbin and py are equivalent shortcuts." },
  { category: "Paste", label: "Paste A", token: "{paste A}", detail: "Explicit no-click paste into the currently focused target." },
  { category: "Paste", label: "Buffer List", token: "{buf A,Z,C}", detail: "Paste listed buffers with Tasket waits. Bare {A,Z,C} is a keyboard chord, not stored text." },
  { category: "Paste", label: "Paste Enter", token: "{enter A,Z}", detail: "Paste focused buffers, then Enter. Add click on/off only if the target needs focus." },
  { category: "Paste", label: "Literal Text", token: "{type literal text}", detail: "Send the literal remainder through Tasket's native paste action." },
  { category: "Paste", label: "Registry Path", token: "{paste REGISTRY}", detail: "Paste the configured RegistryFilePath without opening a shell." },
  { category: "Paste", label: "Alias G Text", token: "{paste REGEDITED}", detail: "Paste configured shell alias G without opening a shell." },
  { category: "Paste", label: "Click On", token: "{click on}", detail: "Enable prepended focus-clicks for following paste tokens." },
  { category: "Paste", label: "Click Off", token: "{click off}", detail: "Return paste tokens to shell-safe no-click mode." },
  { category: "Paste", label: "Click Paste", token: "{click on}{buf A,Z,C}{click off}", detail: "Enable focus-clicks, paste buffers in order, then return to shell-safe no-click mode." },
  { category: "Set", label: "Set Var", token: "{set A $Z}", detail: "Copy a paste buffer into a script var." },
  { category: "Set", label: "Literal Var", token: "{set A literal text}", detail: "Write literal text into script variable A." },
  { category: "Set", label: "Set Paste", token: "{set paste Z literal text}", detail: "Write literal text to a paste buffer." },
  { category: "Set", label: "Paste Alias", token: "{set Z $A}", detail: "Set paste buffer Z from script variable A." },
  { category: "Set", label: "Zone Coords", token: "{set zone Z 100,200,500,600}", detail: "Store x1,y1,x2,y2 in physical zone Z." },
  { category: "Set", label: "Zone Points", token: "{set zone Z 1,2}", detail: "Store zone Z from important point 1 to important point 2." },
  { category: "Set", label: "Zone Copy", token: "{set zone Z X}", detail: "Copy physical zone X into physical zone Z." },
  { category: "Set", label: "Point Coords", token: "{set point 1 1200,700}", detail: "Store important point 1 as x,y." },
  { category: "Set", label: "Point Copy", token: "{set point 4 3}", detail: "Copy important point 3 into point 4." },
  { category: "Set", label: "Point Var", token: "{set point 5 $3}", detail: "$1 through $16 resolve to important point coordinates." },
  { category: "Set", label: "Registry", token: "{set registry %USERPROFILE%\\Desktop\\New Text Document.txt}", detail: "Set registry file path for exported state and scripts." },
  { category: "Set", label: "Shell Alias", token: "{set shell G uv run python}", detail: "Set a visible-shell alias used by {shell G}, {python}, and {py}." },
  { category: "Branch", label: "Contains", token: "{if A contains waterfront}{enter A}{else}{enter D}{endif}", detail: "Branch from a string contains check." },
  { category: "Branch", label: "Not Contains", token: "{if A notcontains done}{enter A}{endif}", detail: "Branch when text does not contain a literal." },
  { category: "Branch", label: "Equal", token: "{if A == $Z}{enter A}{endif}", detail: "Compare buffers, vars, or literal text." },
  { category: "Branch", label: "Not Equal", token: "{if A != text}{enter D}{endif}", detail: "Negated equality branch." },
  { category: "Branch", label: "Float >=", token: "{if A >= 5}{play MorningStartup}{endif}", detail: "Numeric branch over a buffer or literal." },
  { category: "Branch", label: "Float <=", token: "{if A <= 5}{enter D}{endif}", detail: "Numeric branch with less-than or equal." },
  { category: "Branch", label: "Empty", token: "{if A empty}{enter D}{endif}", detail: "True when the resolved value is blank." },
  { category: "Branch", label: "Not Empty", token: "{if A notempty}{enter A}{endif}", detail: "True when the resolved value has content." },
  { category: "Daemon", label: "Task Finished", token: "{if task last is finished}{enter S}{else}{enter D}{endif}", detail: "Branch over the newest task_number returned by tasket-httpd." },
  { category: "Daemon", label: "Task State", token: "{if task 12 state == failed}{enter D}{endif}", detail: "Check a specific daemon task state." },
  { category: "Daemon", label: "Task Remaining", token: "{if task 12 remaining <= 2}{enter S}{endif}", detail: "Compare a daemon task remaining-time number." },
  { category: "Daemon", label: "Task Message", token: "{if task 12 message contains finished}{enter S}{endif}", detail: "Search a daemon task status message." },
  { category: "Daemon", label: "Saved Exists", token: "{if saved-task OpenDailyFocus exists}{play OpenDailyFocus}{endif}", detail: "Guard a play token against the live saved-task list." },
  { category: "Daemon", label: "Saved Missing", token: "{if saved-task OpenDailyFocus missing}{enter D}{endif}", detail: "Branch when a saved task is absent." },
  { category: "Daemon", label: "Saved Count", token: "{if saved-tasks count > 10}{play MorningStartup}{else}{enter D}{endif}", detail: "Sanity gate against the live saved-task count." },
  { category: "Task", label: "Play Task", token: "{play SomeTask}", detail: "Emit a saved Tasket task play token." },
  { category: "Task", label: "Play .scht", token: "{play SomeTask.scht}", detail: "The .scht suffix is accepted and normalized for Tasket." },
  { category: "Regedited", label: "Copy Zone", token: "{rgdclip i1z1}", detail: "Run rgd rg <RegistryFilePath> i1z1 --clip through a native Tasket system-command action." },
  { category: "Regedited", label: "Copy String", token: "{rgdclip i1s1}", detail: "Copy a Regedited string reference from the configured registry file." },
  { category: "Regedited", label: "Append Zone", token: "{rgdappend i1z1}", detail: "Pipe the current multiline clipboard to rgd rs <RegistryFilePath> i1z1 --append." },
  { category: "Regedited", label: "Append DB Line", token: "{rgdappend i6dbl}", detail: "Pass a DB-line reference verbatim to Regedited; Regedited owns relocation and index updates." },
  { category: "Zone", label: "Image Zone", token: "{zone Z,Z}", detail: "Zone buffer Z, image snip/copy method Z." },
  { category: "Zone", label: "Drag Copy", token: "{zone V,V}", detail: "Drag-copy zone V with method V; uses the native universal copy binding on Omarchy." },
  { category: "Zone", label: "Text Zone", token: "{zone Z,X}", detail: "Zone buffer Z, text extractor method X." },
  { category: "Zone", label: "Single Line", token: "{zone Z,C}", detail: "Single-line OCR; on Omarchy uses a native shortcut or configured PowerShell starter P to replace clipboard line breaks with spaces." },
  { category: "Zone", label: "Screenshot Picker", token: "{screen}", detail: "Open the native screenshot picker without an automatic zone drag." },
  { category: "Zone", label: "Buffered Single Line", token: "{zonebuf Z,C,V}", detail: "OCR single line into paste V." },
  { category: "Zone", label: "Text Buffer Zone", token: "{zonebuf Z,X,V}", detail: "Capture zone Z with method X, then save clipboard text into paste V." },
  { category: "Pointer", label: "Point 1", token: "{pt 1}", detail: "Move cursor to important point 1. {point 1} remains the long alias." },
  { category: "Pointer", label: "Point 16", token: "{pt 16}", detail: "Move cursor to important point 16. {point 16} remains the long alias." },
  { category: "Pointer", label: "Click", token: "{click}", detail: "Left click through Tasket." },
  { category: "Pointer", label: "Right Click", token: "{right}", detail: "Right click through Tasket." },
  { category: "Pointer", label: "Middle Click", token: "{middle}", detail: "Middle click through Tasket." },
  { category: "Keys", label: "Alt F4", token: "{ALT_LEFT F4}", detail: "Raw Tasket key chord." },
  { category: "Keys", label: "Multi-key Chord", token: "{A G SHIFT LEFT ALT 6 E CTRL WIN 9}", detail: "Unknown brace tokens become one simultaneous Tasket key chord after alias normalization." },
  { category: "Keys", label: "Ctrl Right", token: "{ctrlmod right 3}", detail: "Hold Ctrl while pressing Right three times." },
  { category: "Keys", label: "Shift Up", token: "{shiftmod up 3}", detail: "Hold Shift while pressing Up three times." },
  { category: "Wheel", label: "Wheel Up", token: "{wheelup}", detail: "Emit one native Tasket MOUSE_WHEEL_UP stroke." },
  { category: "Wheel", label: "Wheel Down x2", token: "{wheeldown 2}", detail: "Emit two separate native Tasket MOUSE_WHEEL_DOWN strokes." },
  { category: "Regedited", label: "Include workflow", token: "{rgd i1z1}", detail: "Include a workflow from a Regedited zone through the backend Run Command." },
  { category: "Task", label: "Profile", token: "{profile example}", detail: "Merge and run a saved Macrohelp profile." },
  { category: "Keys", label: "Press", token: "{press Shift &amp; 3}", detail: "Hold Shift while tapping ampersand three times." },
  { category: "Shell", label: "PowerShell alias", token: "{pwsh}", detail: "Open the configured terminal and run alias P on Linux." },
  { category: "Shell", label: "Terminal", token: "{terminal}", detail: "Native terminal shortcut on Linux." },
  { category: "Timing", label: "Wait", token: "{wait 200}", detail: "Wait in milliseconds." },
];

const nodeDetails: Array<MacroNodeData & { position: { x: number; y: number } }> = [
  { kind: "paths", title: "Paths", caption: "registry hub source", tone: "blue", position: { x: 0, y: 0 } },
  { kind: "shells", title: "Shell Aliases", caption: "visible shell entrypoints", tone: "cyan", position: { x: 540, y: 0 } },
  { kind: "view", title: "Display", caption: "Q HUD defaults", tone: "green", position: { x: 1080, y: 0 } },
  { kind: "script", title: "Script", caption: "brace-token assembly", tone: "violet", position: { x: 540, y: 330 } },
  { kind: "daemon", title: "Ledger", caption: "stored status text", tone: "pink", position: { x: 1080, y: 330 } },
  { kind: "vars", title: "A/S/D/F Vars", caption: "script-local text", tone: "amber", position: { x: 0, y: 560 } },
  { kind: "output", title: "Text Output", caption: "canonical export", tone: "blue", position: { x: 1080, y: 700 } },
  { kind: "pastes", title: "Z/X/C/V Pastes", caption: "buffer bank", tone: "green", position: { x: 540, y: 780 } },
  { kind: "zones", title: "Zones", caption: "coords, point pairs, or copies", tone: "cyan", position: { x: 0, y: 1030 } },
  { kind: "points", title: "Points", caption: "important cursor marks 1-16", tone: "rose", position: { x: 540, y: 1210 } },
];

const initialNodes: Node<MacroNodeData>[] = nodeDetails.map((node) => ({
  id: node.kind,
  type: "macroNode",
  position: node.position,
  data: {
    kind: node.kind,
    title: node.title,
    caption: node.caption,
    tone: node.tone,
  },
}));

const initialEdges: Edge[] = [
  { id: "paths-script", source: "paths", target: "script", animated: true },
  { id: "shells-script", source: "shells", target: "script", animated: true },
  { id: "script-vars", source: "script", target: "vars" },
  { id: "script-pastes", source: "script", target: "pastes" },
  { id: "script-output", source: "script", target: "output", animated: true },
  { id: "zones-output", source: "zones", target: "output" },
  { id: "points-output", source: "points", target: "output" },
  { id: "daemon-output", source: "daemon", target: "output" },
];

const EditorContext = createContext<EditorContextValue | null>(null);

function useEditor() {
  const value = useContext(EditorContext);
  if (!value) throw new Error("Editor context missing");
  return value;
}

function setNested<K extends keyof MacrohelpEnvironment>(
  setEnv: React.Dispatch<React.SetStateAction<MacrohelpEnvironment>>,
  key: K,
  value: MacrohelpEnvironment[K],
) {
  setEnv((prev) => ({ ...prev, [key]: value }));
}

function Field({ label, value, onChange, mono = false }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <label className="field-line">
      <span>{label}</span>
      <input className={mono ? "mono" : ""} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Area({ label, value, onChange, minRows = 4 }: { label: string; value: string; onChange: (v: string) => void; minRows?: number }) {
  return (
    <label className="area-line">
      <span>{label}</span>
      <textarea rows={minRows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${value ? "on" : ""}`} onClick={() => onChange(!value)} type="button">
      <span>{label}</span>
      <strong>{value ? "1" : "0"}</strong>
    </button>
  );
}

function MacroNode({ data, selected }: NodeProps<Node<MacroNodeData>>) {
  const { env, setEnv, appendScript, output, openExport } = useEditor();

  const body = (() => {
    switch (data.kind) {
      case "paths":
        return (
          <>
            <Field label="ExportPath" value={env.exportPath} onChange={(v) => setNested(setEnv, "exportPath", v)} mono />
            <Field label="ImportPath" value={env.importPath} onChange={(v) => setNested(setEnv, "importPath", v)} mono />
            <Field label="ResolvedExportPath" value={env.resolvedExportPath} onChange={(v) => setNested(setEnv, "resolvedExportPath", v)} mono />
            <Field label="ResolvedImportPath" value={env.resolvedImportPath} onChange={(v) => setNested(setEnv, "resolvedImportPath", v)} mono />
            <Field label="StatePath" value={env.statePath} onChange={(v) => setNested(setEnv, "statePath", v)} mono />
            <Field label="RegistryFilePath" value={env.registryFilePath} onChange={(v) => setNested(setEnv, "registryFilePath", v)} mono />
          </>
        );
      case "shells":
        return (
          <>
            {shellSlots.map((slot) => (
              <Field
                key={slot}
                label={`ShellAlias${slot}`}
                value={env.shellAliases[slot]}
                onChange={(v) => setEnv((prev) => ({ ...prev, shellAliases: { ...prev.shellAliases, [slot]: v } }))}
                mono
              />
            ))}
          </>
        );
      case "script":
        return (
          <>
            <Area label="Script" value={env.script} minRows={10} onChange={(v) => setNested(setEnv, "script", v)} />
            <div className="node-token-row">
              {["{powershell}", "{paste A}", "{if A contains text}{enter A}{endif}", "{wait 200}"].map((token) => (
                <button key={token} onClick={() => appendScript(token)} type="button">
                  {token}
                </button>
              ))}
            </div>
          </>
        );
      case "vars":
        return (
          <>
            {varSlots.map((slot) => (
              <Area
                key={slot}
                label={`Var${slot}`}
                value={env.vars[slot]}
                minRows={3}
                onChange={(v) => setEnv((prev) => ({ ...prev, vars: { ...prev.vars, [slot]: v } }))}
              />
            ))}
          </>
        );
      case "pastes":
        return (
          <>
            {pasteSlots.map((slot) => (
              <Area
                key={slot}
                label={`Paste${slot}`}
                value={env.pastes[slot]}
                minRows={3}
                onChange={(v) => setEnv((prev) => ({ ...prev, pastes: { ...prev.pastes, [slot]: v } }))}
              />
            ))}
          </>
        );
      case "zones":
        return (
          <>
            {pasteSlots.map((slot) => (
              <div className="compound-row" key={slot}>
                <Toggle
                  label={`Zone${slot}Set`}
                  value={env.zones[slot].set}
                  onChange={(v) => setEnv((prev) => ({ ...prev, zones: { ...prev.zones, [slot]: { ...prev.zones[slot], set: v } } }))}
                />
                <input
                  className="mono"
                  value={env.zones[slot].value}
                  onChange={(event) => setEnv((prev) => ({ ...prev, zones: { ...prev.zones, [slot]: { ...prev.zones[slot], value: event.target.value } } }))}
                  placeholder="x1,y1,x2,y2 | pointA,pointB | Z/X/C/V"
                />
              </div>
            ))}
          </>
        );
      case "points":
        return (
          <>
            {pointSlots.map((slot) => (
              <div className="compound-row" key={slot}>
                <Toggle
                  label={`Point${slot}Set`}
                  value={env.points[slot].set}
                  onChange={(v) => setEnv((prev) => ({ ...prev, points: { ...prev.points, [slot]: { ...prev.points[slot], set: v } } }))}
                />
                <input
                  className="mono"
                  value={env.points[slot].value}
                  onChange={(event) => setEnv((prev) => ({ ...prev, points: { ...prev.points, [slot]: { ...prev.points[slot], value: event.target.value } } }))}
                  placeholder="x,y"
                />
              </div>
            ))}
          </>
        );
      case "view":
        return (
          <>
            <Toggle label="CrosshairVisible" value={env.toggles.crosshairVisible} onChange={(v) => setEnv((p) => ({ ...p, toggles: { ...p.toggles, crosshairVisible: v } }))} />
            <Toggle label="CursorCoordinatesVisible" value={env.toggles.cursorCoordinatesVisible} onChange={(v)=>setEnv(p=>({...p,toggles:{...p.toggles,cursorCoordinatesVisible:v}}))}/>
            <Toggle label="CoordinatePanelVisible" value={env.toggles.coordinatePanelVisible} onChange={(v) => setEnv((p) => ({ ...p, toggles: { ...p.toggles, coordinatePanelVisible: v } }))} />
            <Toggle label="KeyHudVisible" value={env.toggles.keyHudVisible} onChange={(v) => setEnv((p) => ({ ...p, toggles: { ...p.toggles, keyHudVisible: v } }))} />
            <Toggle label="GridVisible" value={env.toggles.gridVisible} onChange={(v) => setEnv((p) => ({ ...p, toggles: { ...p.toggles, gridVisible: v } }))} />
            <Toggle label="CoordinatesOnlyMode" value={env.toggles.coordinatesOnlyMode} onChange={(v) => setEnv((p) => ({ ...p, toggles: { ...p.toggles, coordinatesOnlyMode: v } }))} />
            <Field label="RegistryHubStage" value={env.runtime.registryHubStage} onChange={(v) => setEnv((p) => ({ ...p, runtime: { ...p.runtime, registryHubStage: v } }))} />
            <Field label="VisibleLines" value={env.runtime.visibleLines} onChange={(v) => setEnv((p) => ({ ...p, runtime: { ...p.runtime, visibleLines: v } }))} />
          </>
        );
      case "daemon":
        return (
          <>
            <Field label="LastTasketTaskNumber" value={env.lastTasket.number} onChange={(v) => setEnv((p) => ({ ...p, lastTasket: { ...p.lastTasket, number: v } }))} />
            <Field label="LastTasketTaskState" value={env.lastTasket.state} onChange={(v) => setEnv((p) => ({ ...p, lastTasket: { ...p.lastTasket, state: v } }))} />
            <Area label="LastTasketTaskMessage" value={env.lastTasket.message} onChange={(v) => setEnv((p) => ({ ...p, lastTasket: { ...p.lastTasket, message: v } }))} minRows={3} />
            {(["activeVar", "activePasteSlot", "activeZoneSlot", "activePoint"] as const).map((key) => (
              <Field key={key} label={key} value={env.runtime[key]} onChange={(v) => setEnv((p) => ({ ...p, runtime: { ...p.runtime, [key]: v } }))} />
            ))}
          </>
        );
      case "output":
        return (
          <>
            <Area label="Status" value={env.status} onChange={(v) => setNested(setEnv, "status", v)} minRows={2} />
            <div className="export-card">
              <strong>{output.split("\n").filter(Boolean).length}</strong>
              <span>canonical lines, including 16 points</span>
              <button type="button" onClick={openExport}>
                Review text
              </button>
            </div>
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <section className={`macro-node tone-${data.tone} ${selected ? "selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <header>
        <NodeIcon kind={data.kind} />
        <div>
          <strong>{data.title}</strong>
          <span>{data.caption}</span>
        </div>
      </header>
      <div className="macro-node-body">{body}</div>
      <Handle type="source" position={Position.Right} />
    </section>
  );
}

const MemoNode = memo(MacroNode);

function NodeIcon({ kind }: { kind: NodeKind }) {
  const size = 17;
  if (kind === "paths") return <Database size={size} />;
  if (kind === "script") return <Braces size={size} />;
  if (kind === "vars") return <Terminal size={size} />;
  if (kind === "pastes") return <Keyboard size={size} />;
  if (kind === "zones") return <MousePointer2 size={size} />;
  if (kind === "points") return <Grid3X3 size={size} />;
  if (kind === "shells") return <Terminal size={size} />;
  if (kind === "view") return <ToggleLeft size={size} />;
  if (kind === "daemon") return <Play size={size} />;
  return <FileText size={size} />;
}

import WorkflowCanvas from "./WorkflowCanvas";
import HostPanel from "./HostPanel";
import { useHistory } from "./useHistory";
import { commands, download, importDocument, registryDocument, projectLayout, type Layout } from "./workflow";

function App() {
  const history = useHistory<MacrohelpEnvironment>(initialEnv);
  const env = history.value, setEnv = history.change;
  const [board, setBoard] = useState<"commands"|"environment">("commands");
  const [libraryOpen,setLibraryOpen]=useState(true);
  const [format, setFormat] = useState<"environment"|"script"|"registry"|"project">("environment");
  const [notice, setNotice] = useState("");
  const [layout,setLayout]=useState<Layout>({});
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [tokenSearch, setTokenSearch] = useState("");
  const [rawOpen, setRawOpen] = useState(false);
  const [rawImport, setRawImport] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("builder");
  const fileRef = useRef<HTMLInputElement>(null);

  const output = useMemo(() => serializeEnv(env), [env]);
  const exported = useMemo(()=>{try{return {text:format==="script"?env.script:format==="registry"?registryDocument(env,1,layout):format==="project"?JSON.stringify({format:"macrohard",version:1,environment:env,layout},null,2):output,error:""}}catch(e){return {text:"",error:e instanceof Error?e.message:String(e)}}},[env,format,output,layout]);
  const filename = format==="script"?"registry.txt":format==="registry"?"macrohelp.regd.txt":format==="project"?"macrohard.json":"macrohelp-registry-hub-environment.txt";
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.target as HTMLElement).closest("input,textarea,[contenteditable=true]"))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="z"){event.preventDefault();event.shiftKey?history.redo():history.undo()}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();if(!exported.error)download(exported.text,filename)}};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler)},[history.undo,history.redo,exported,filename]);
  const stable = useMemo(() => serializeEnv(parseEnv(output)) === output, [output]);
  const lint = useMemo(()=>commands(env.script).errors,[env.script]);
  const nodeTypes = useMemo(() => ({ macroNode: MemoNode }), []);
  const categories = useMemo(() => ["All", ...Array.from(new Set(tokens.map((t) => t.category)))], []);
  const [category, setCategory] = useState("All");
  const filteredTokens = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();
    return tokens.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!q) return true;
      return `${t.category} ${t.label} ${t.token} ${t.detail}`.toLowerCase().includes(q);
    });
  }, [category, tokenSearch]);

  const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)), [setEdges]);
  const appendScript = useCallback((token: string) => {
    setEnv((prev) => ({
      ...prev,
      script: prev.script.trimEnd() ? `${prev.script.trimEnd()}\n${token}` : token,
      runtime: { ...prev.runtime, visibleLines: String(Math.max(1, prev.script.split(/\r?\n/).length + 1)) },
    }));
  }, []);

  const copyOutput = useCallback(async () => {
    if(exported.error){setNotice(exported.error);return}
    try { await navigator.clipboard.writeText(exported.text); } catch { setNotice("Clipboard unavailable. Select and copy the export in Text."); setRawOpen(true); return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [exported]);

  const downloadOutput = useCallback(() => { if(exported.error){setNotice(exported.error);return}download(exported.text,filename); }, [exported,filename]);

  const importFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try { const next=importDocument(text,env), positions=projectLayout(text);setEnv(next);setLayout(positions); setNotice(""); setRawImport(text); } catch(e) { setNotice(e instanceof Error?e.message:String(e)); }
    event.target.value = "";
  }, [env,setEnv]);

  const applyRaw = useCallback(() => {
    try { const next=importDocument(rawImport,env), positions=projectLayout(rawImport);setEnv(next);setLayout(positions); setNotice(""); } catch(e) { setNotice(e instanceof Error?e.message:String(e)); }
  }, [rawImport,env,setEnv]);

  const reset = useCallback(() => {
    setEnv(initialEnv);
    setLayout({});
    setNodes(initialNodes);
    setEdges(initialEdges);
    setRawImport("");
  }, [setEdges, setNodes]);

  const context = useMemo<EditorContextValue>(() => ({ env, setEnv, appendScript, output, openExport: () => setRawOpen(true) }), [appendScript, env, output]);

  return (
    <EditorContext.Provider value={context}>
      <main className="app-shell">
        <input ref={fileRef} className="hidden" type="file" accept=".txt,.env,.md,.json,text/plain,application/json" onChange={importFile} />
        <nav className="topbar">
          <div className="brand">
            <Workflow size={21} />
            <div>
              <strong>Macrohard</strong>
              <span>Registry workspace</span>
            </div>
          </div>
          <div className="view-tabs" role="tablist" aria-label="Macrohelp views">
            <button className={activeView === "builder" && board === "commands" ? "active" : ""} type="button" onClick={() => {setActiveView("builder");setBoard("commands")}}>
              Workflow
            </button>
            <button className={activeView==="builder"&&board==="environment"?"active":""} type="button" onClick={()=>{setActiveView("builder");setBoard("environment")}}>Environment</button>
            <button className={activeView === "host" ? "active" : ""} type="button" onClick={() => setActiveView("host")}>
              Connect
            </button>
          </div>
          <div className="toolbar-group">
            {activeView === "builder" ? (
              <>
                <button onClick={()=>setLibraryOpen(v=>!v)} title="Toggle command library"><PanelLeft size={16}/></button>
                <button disabled={!history.canUndo} onClick={history.undo} title="Undo (Ctrl+Z)"><Undo2 size={16}/></button>
                <button disabled={!history.canRedo} onClick={history.redo} title="Redo (Ctrl+Shift+Z)"><Redo2 size={16}/></button>
                <button data-testid="toolbar-import" type="button" onClick={() => fileRef.current?.click()} title="Import text file">
                  <FileInput size={16} /> Import
                </button>
                <button data-testid="toolbar-text" type="button" onClick={() => setRawOpen(true)} title="Review raw text">
                  <FileText size={16} /> Text
                </button>
                <button data-testid="toolbar-copy" type="button" onClick={copyOutput} title="Copy export text">
                  {copied ? <Check size={16} /> : <Copy size={16} />} Copy
                </button>
                <button data-testid="toolbar-save" type="button" onClick={downloadOutput} title="Download export text">
                  <Download size={16} /> Save
                </button>
                <button data-testid="toolbar-reset" type="button" onClick={reset} title="Reset state">
                  <RotateCcw size={16} /> Reset
                </button>
              </>
            ) : (
              <span className="toolbar-note">local HTTP control</span>
            )}
          </div>
          <div className={`status ${stable&&!lint.length ? "ok" : "bad"}`} title={lint.join("\n")}>{lint.length?`${lint.length} syntax issues`:stable?"canonical":"roundtrip drift"}</div>
        </nav>

        {activeView === "builder" ? (
          <div className={`workspace ${libraryOpen?"":"library-closed"}`}>
            <aside className="library">
              <div className="search">
                <Search size={16} />
                <input value={tokenSearch} onChange={(event) => setTokenSearch(event.target.value)} placeholder="Search tokens" />
              </div>
              <div className="chips">
                {categories.map((name) => (
                  <button key={name} className={category === name ? "active" : ""} onClick={() => setCategory(name)} type="button">
                    {name}
                  </button>
                ))}
              </div>
              <div className="token-list">
                {filteredTokens.map((token) => (
                  <button className="token-item" key={`${token.category}-${token.token}`} draggable onDragStart={e=>e.dataTransfer.setData("application/x-macrohard-token",token.token)} onClick={() => appendScript(token.token)} type="button">
                    <span>{token.category}</span>
                    <strong>{token.label}</strong>
                    <code>{token.token}</code>
                    <small>{token.detail}</small>
                  </button>
                ))}
              </div>
            </aside>

            <section className="flow-wrap">
              {board==="commands"?<WorkflowCanvas script={env.script} change={script=>setEnv(prev=>({...prev,script}))} palette={tokens} positions={layout} setPositions={setLayout}/>:<ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                defaultViewport={{ x: 28, y: 26, zoom: 0.86 }}
                minZoom={0.25}
                maxZoom={1.7}
                panOnScroll
                snapToGrid
                snapGrid={[16, 16]}
                proOptions={{ hideAttribution: true }}
              >
                <Background color="rgba(148, 163, 184, 0.28)" gap={22} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(node) => {
                  const tone = (node.data as MacroNodeData).tone;
                  if (tone === "violet") return "#8b5cf6";
                  if (tone === "green") return "#22c55e";
                  if (tone === "amber") return "#f59e0b";
                  if (tone === "rose") return "#f43f5e";
                  if (tone === "pink") return "#ec4899";
                  if (tone === "cyan") return "#06b6d4";
                  return "#3b82f6";
                }} />
                <Panel position="top-left" className="flow-panel">
                  <Maximize2 size={15} />
                  <span>{nodes.length} editable nodes</span>
                </Panel>
              </ReactFlow>}
            </section>
          </div>
        ) : (
          <HostPanel env={env} append={appendScript} capture={(slot,x,y)=>setEnv(prev=>({...prev,points:{...prev.points,[slot]:{set:true,value:`${x},${y}`}}}))}/>
        )}

        {notice&&<div className="toast" role="alert">{notice}<button onClick={()=>setNotice("")} title="Dismiss"><X size={14}/></button></div>}
        {activeView === "builder" && rawOpen && (
          <section className="raw-drawer" role="dialog" aria-modal="true">
            <div className="raw-head">
              <div>
                <strong>Export</strong>
                <span>{exported.text.length.toLocaleString()} characters</span>
              </div>
              <button type="button" onClick={() => setRawOpen(false)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="export-options"><select aria-label="Export format" value={format} onChange={e=>setFormat(e.target.value as typeof format)}><option value="environment">Macrohelp environment · .txt</option><option value="script">Script only · registry.txt</option><option value="registry">Regedited · 3 indexed zones</option><option value="project">Project · .json</option></select><span>{format==="registry"?"i1z1 script · i1z2 environment · i1z3 project":filename}</span>{exported.error&&<span role="alert">{exported.error}</span>}</div>
            <div className="raw-grid">
              <label>
                <span>Import</span>
                <textarea data-testid="raw-import" value={rawImport} onChange={(event) => setRawImport(event.target.value)} spellCheck={false} />
                <button data-testid="raw-apply" type="button" onClick={applyRaw}>
                  <Import size={15} /> Apply
                </button>
              </label>
              <label>
                <span>Export</span>
                <textarea data-testid="raw-export" value={exported.text} readOnly spellCheck={false} />
                <div className="raw-actions">
                  <button data-testid="raw-copy" type="button" onClick={copyOutput}>
                    <Copy size={15} /> Copy
                  </button>
                  <button data-testid="raw-download" type="button" onClick={downloadOutput}>
                    <Download size={15} /> Download
                  </button>
                </div>
              </label>
            </div>
          </section>
        )}
      </main>
    </EditorContext.Provider>
  );
}

export default App;
