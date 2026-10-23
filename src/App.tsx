import { createContext, memo, useCallback, useContext, useMemo, useRef, useState } from "react";
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

type PasteSlot = "Z" | "X" | "C" | "V";
type VarSlot = "A" | "S" | "D" | "F";
type PointSlot = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "15" | "16";
type ShellSlot = "X" | "C" | "G";
type NodeKind = "paths" | "script" | "vars" | "pastes" | "zones" | "points" | "shells" | "view" | "daemon" | "output";
type AppView = "builder" | "host";

interface HostTask {
  name: string;
  delay?: string;
  detail?: string;
}

interface ZoneValue {
  set: boolean;
  value: string;
}

interface PointValue {
  set: boolean;
  value: string;
}

interface MacrohelpEnvironment {
  version: string;
  generatedLocal: string;
  exportPath: string;
  importPath: string;
  resolvedExportPath: string;
  resolvedImportPath: string;
  statePath: string;
  registryFilePath: string;
  shellAliases: Record<ShellSlot, string>;
  script: string;
  status: string;
  lastTasket: {
    number: string;
    state: string;
    message: string;
  };
  runtime: {
    registryHubStage: string;
    activeVar: string;
    activePasteSlot: string;
    activeZoneSlot: string;
    activePoint: string;
    visibleLines: string;
  };
  toggles: {
    crosshairVisible: boolean;
    coordinatePanelVisible: boolean;
    keyHudVisible: boolean;
    gridVisible: boolean;
    coordinatesOnlyMode: boolean;
  };
  vars: Record<VarSlot, string>;
  pastes: Record<PasteSlot, string>;
  zones: Record<PasteSlot, ZoneValue>;
  points: Record<PointSlot, PointValue>;
}

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

const pasteSlots: PasteSlot[] = ["Z", "X", "C", "V"];
const varSlots: VarSlot[] = ["A", "S", "D", "F"];
const pointSlots = Array.from({ length: 16 }, (_, index) => String(index + 1) as PointSlot);
const shellSlots: ShellSlot[] = ["X", "C", "G"];
const defaultPath = "%USERPROFILE%\\Desktop\\temps\\macrohelp-registry-hub-environment.txt";

function emptyPoints(): Record<PointSlot, PointValue> {
  return Object.fromEntries(pointSlots.map((slot) => [slot, { set: false, value: "" }])) as Record<PointSlot, PointValue>;
}

const initialEnv: MacrohelpEnvironment = {
  version: "1",
  generatedLocal: "",
  exportPath: defaultPath,
  importPath: defaultPath,
  resolvedExportPath: defaultPath,
  resolvedImportPath: defaultPath,
  statePath: "",
  registryFilePath: "%USERPROFILE%\\Desktop\\New Text Document.txt",
  shellAliases: {
    X: "powershell",
    C: "cmd",
    G: "uv run python",
  },
  script: [
    "{powershell}{wait 700}{paste A}{ENTER}{wait 300}{ALT_LEFT F4}",
    "{powershell}{wait 700}{buf A}{ctrlmod right 3}{shiftmod up 2}{ALT_LEFT F4}",
    "{set A $Z}{if A contains waterfront}{enter A}{else}{enter D}{endif}",
    "{set zone Z 100,100,600,400}{zonebuf Z,C,V}{if V contains approved}{play FollowupTask}{endif}",
    "{if saved-task OpenDailyFocus exists}{play OpenDailyFocus}{endif}",
  ].join("\n"),
  status: "Designed in Macrohelp Visual Assembly.",
  lastTasket: {
    number: "-1",
    state: "",
    message: "",
  },
  runtime: {
    registryHubStage: "Script",
    activeVar: "-1",
    activePasteSlot: "-1",
    activeZoneSlot: "-1",
    activePoint: "-1",
    visibleLines: "3",
  },
  toggles: {
    crosshairVisible: true,
    coordinatePanelVisible: true,
    keyHudVisible: true,
    gridVisible: false,
    coordinatesOnlyMode: false,
  },
  vars: {
    A: "$ErrorActionPreference = 'Stop'\nWrite-Output 'visible shell buffer ok'",
    S: "uv run python -c \"print('uv python ok')\"",
    D: "echo fallback branch",
    F: "",
  },
  pastes: { Z: "", X: "", C: "", V: "" },
  zones: {
    Z: { set: true, value: "100,100,600,400" },
    X: { set: false, value: "" },
    C: { set: false, value: "" },
    V: { set: false, value: "" },
  },
  points: emptyPoints(),
};

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
  { category: "Regedited", label: "Copy Zone", token: "{rgdclip i6z6}", detail: "Run rgd rg <RegistryFilePath> i6z6 --clip through a native Tasket system-command action." },
  { category: "Regedited", label: "Copy String", token: "{rgdclip i6s6}", detail: "Copy a Regedited string reference from the configured registry file." },
  { category: "Regedited", label: "Append Zone", token: "{rgdappend i6z6}", detail: "Pipe the current multiline clipboard to rgd rs <RegistryFilePath> i6z6 --append." },
  { category: "Regedited", label: "Append DB Line", token: "{rgdappend i6dbl}", detail: "Pass a DB-line reference verbatim to Regedited; Regedited owns relocation and index updates." },
  { category: "Zone", label: "Image Zone", token: "{zone Z,Z}", detail: "Zone buffer Z, image snip/copy method Z." },
  { category: "Zone", label: "Text Zone", token: "{zone Z,X}", detail: "Zone buffer Z, text extractor method X." },
  { category: "Zone", label: "Single Line", token: "{zone Z,C}", detail: "Zone buffer Z, single-line text extractor method C." },
  { category: "Zone", label: "Drag Copy", token: "{zone V,V}", detail: "Drag-copy zone V with method V." },
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

function cloneEnv(env: MacrohelpEnvironment): MacrohelpEnvironment {
  return JSON.parse(JSON.stringify(env)) as MacrohelpEnvironment;
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function unescapeValue(value: string): string {
  let out = "";
  let escaped = false;
  for (const ch of value) {
    if (!escaped) {
      if (ch === "\\") escaped = true;
      else out += ch;
      continue;
    }
    if (ch === "r") out += "\r";
    else if (ch === "n") out += "\n";
    else if (ch === "t") out += "\t";
    else if (ch === "\\") out += "\\";
    else out += `\\${ch}`;
    escaped = false;
  }
  if (escaped) out += "\\";
  return out;
}

function b(value: boolean): string {
  return value ? "1" : "0";
}

function parseBool(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function asPointSlot(value: string): PointSlot | null {
  return pointSlots.includes(value as PointSlot) ? (value as PointSlot) : null;
}

function line(key: string, value: string): string {
  return `${key}=${escapeValue(value)}`;
}

function serializeEnv(env: MacrohelpEnvironment): string {
  const rows = [
    line("MacrohelpRegistryHubExportVersion", env.version),
    line("GeneratedLocal", env.generatedLocal),
    line("ExportPath", env.exportPath),
    line("ImportPath", env.importPath),
    line("ResolvedExportPath", env.resolvedExportPath),
    line("ResolvedImportPath", env.resolvedImportPath),
    line("StatePath", env.statePath),
    line("RegistryFilePath", env.registryFilePath),
    line("ShellAliasX", env.shellAliases.X),
    line("ShellAliasC", env.shellAliases.C),
    line("ShellAliasG", env.shellAliases.G),
    line("Script", env.script),
    line("Status", env.status),
    line("LastTasketTaskNumber", env.lastTasket.number),
    line("LastTasketTaskState", env.lastTasket.state),
    line("LastTasketTaskMessage", env.lastTasket.message),
    line("RegistryHubStage", env.runtime.registryHubStage),
    line("ActiveVar", env.runtime.activeVar),
    line("ActivePasteSlot", env.runtime.activePasteSlot),
    line("ActiveZoneSlot", env.runtime.activeZoneSlot),
    line("ActivePoint", env.runtime.activePoint),
    line("VisibleLines", env.runtime.visibleLines),
    line("CrosshairVisible", b(env.toggles.crosshairVisible)),
    line("CoordinatePanelVisible", b(env.toggles.coordinatePanelVisible)),
    line("KeyHudVisible", b(env.toggles.keyHudVisible)),
    line("GridVisible", b(env.toggles.gridVisible)),
    line("CoordinatesOnlyMode", b(env.toggles.coordinatesOnlyMode)),
  ];

  for (const slot of varSlots) rows.push(line(`Var${slot}`, env.vars[slot]));
  for (const slot of pasteSlots) rows.push(line(`Paste${slot}`, env.pastes[slot]));
  for (const slot of pasteSlots) {
    rows.push(line(`Zone${slot}Set`, b(env.zones[slot].set)));
    rows.push(line(`Zone${slot}`, env.zones[slot].value));
  }
  for (const slot of pointSlots) {
    rows.push(line(`Point${slot}Set`, b(env.points[slot].set)));
    rows.push(line(`Point${slot}`, env.points[slot].value));
  }

  return `${rows.join("\n")}\n`;
}

function parseEnv(text: string): MacrohelpEnvironment {
  const next = cloneEnv(initialEnv);
  for (const raw of text.split("\n")) {
    const lineText = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = lineText.indexOf("=");
    if (eq < 0) continue;
    const name = lineText.slice(0, eq).trim();
    const key = name.toLowerCase();
    const value = unescapeValue(lineText.slice(eq + 1));

    if (key === "macrohelpregistryhubexportversion") next.version = value || "1";
    else if (key === "generatedlocal") next.generatedLocal = value;
    else if (key === "exportpath") next.exportPath = value;
    else if (key === "importpath") next.importPath = value;
    else if (key === "resolvedexportpath") next.resolvedExportPath = value;
    else if (key === "resolvedimportpath") next.resolvedImportPath = value;
    else if (key === "statepath") next.statePath = value;
    else if (key === "registryfilepath") next.registryFilePath = value;
    else if (key === "shellaliasx") next.shellAliases.X = value;
    else if (key === "shellaliasc") next.shellAliases.C = value;
    else if (key === "shellaliasg") next.shellAliases.G = value;
    else if (key === "script") next.script = value;
    else if (key === "status") next.status = value;
    else if (key === "lasttaskettasknumber") next.lastTasket.number = value;
    else if (key === "lasttaskettaskstate") next.lastTasket.state = value;
    else if (key === "lasttaskettaskmessage") next.lastTasket.message = value;
    else if (key === "registryhubstage") next.runtime.registryHubStage = value;
    else if (key === "activevar") next.runtime.activeVar = value;
    else if (key === "activepasteslot") next.runtime.activePasteSlot = value;
    else if (key === "activezoneslot") next.runtime.activeZoneSlot = value;
    else if (key === "activepoint") next.runtime.activePoint = value;
    else if (key === "visiblelines") next.runtime.visibleLines = value;
    else if (key === "crosshairvisible") next.toggles.crosshairVisible = parseBool(value);
    else if (key === "coordinatepanelvisible") next.toggles.coordinatePanelVisible = parseBool(value);
    else if (key === "keyhudvisible") next.toggles.keyHudVisible = parseBool(value);
    else if (key === "gridvisible") next.toggles.gridVisible = parseBool(value);
    else if (key === "coordinatesonlymode") next.toggles.coordinatesOnlyMode = parseBool(value);
    else if (/^var[asdf]$/.test(key)) next.vars[name.slice(3).toUpperCase() as VarSlot] = value;
    else if (/^paste[zxcv]$/.test(key)) next.pastes[name.slice(5).toUpperCase() as PasteSlot] = value;
    else if (/^zone[zxcv]set$/.test(key)) next.zones[name.slice(4, 5).toUpperCase() as PasteSlot].set = parseBool(value);
    else if (/^zone[zxcv]$/.test(key)) {
      const slot = name.slice(4).toUpperCase() as PasteSlot;
      next.zones[slot].value = value;
      if (value.trim()) next.zones[slot].set = true;
    } else if (/^point\d{1,2}set$/.test(key)) {
      const slot = asPointSlot(name.slice(5, -3));
      if (slot) next.points[slot].set = parseBool(value);
    } else if (/^point\d{1,2}$/.test(key)) {
      const slot = asPointSlot(name.slice(5));
      if (slot) {
        next.points[slot].value = value;
        if (value.trim()) next.points[slot].set = true;
      }
    }
  }
  return next;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function taskFromRecord(value: Record<string, unknown>): HostTask | null {
  const name = toText(value.name ?? value.task ?? value.macro ?? value.title ?? value.file);
  if (!name?.trim()) return null;
  const delay = toText(value.delay_seconds ?? value.default_delay ?? value.delay ?? value.seconds);
  const detail = toText(value.description ?? value.detail ?? value.status ?? value.state);
  return { name: name.trim().replace(/\.scht$/i, ""), delay, detail };
}

function extractTasks(payload: unknown): HostTask[] {
  const tasks: HostTask[] = [];
  const seen = new Set<string>();
  const add = (task: HostTask | null) => {
    if (!task?.name) return;
    const key = task.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tasks.push(task);
  };
  const addLine = (line: string) => {
    const trimmed = line.trim().replace(/^[-*]\s*/, "").replace(/\.scht$/i, "");
    if (!trimmed || trimmed.startsWith("{") || trimmed.includes("://")) return;
    add({ name: trimmed });
  };
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === "string") addLine(item);
        else visit(item);
      });
      return;
    }
    if (!isRecord(value)) return;
    add(taskFromRecord(value));
    Object.values(value).forEach((child) => {
      if (Array.isArray(child) || isRecord(child)) visit(child);
    });
  };
  if (typeof payload === "string") payload.split(/\r?\n/).forEach(addLine);
  else visit(payload);
  return tasks;
}

function extractTaskId(payload: unknown): string {
  if (typeof payload === "string") {
    const match = payload.match(/(?:task(?:_number)?|id|#)\D{0,8}(\d+)/i);
    return match?.[1] ?? "";
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractTaskId(item);
      if (found) return found;
    }
    return "";
  }
  if (!isRecord(payload)) return "";
  for (const key of ["task_number", "taskNumber", "task_id", "taskId", "id", "number"]) {
    const value = payload[key];
    if (typeof value === "number" || typeof value === "string") return String(value);
  }
  for (const child of Object.values(payload)) {
    const found = extractTaskId(child);
    if (found) return found;
  }
  return "";
}

function formatDaemonBody(payload: unknown) {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
}

function HostMacroTest() {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:7777");
  const [macroName, setMacroName] = useState("Move cursor example for codex");
  const [delay, setDelay] = useState("1");
  const [loop, setLoop] = useState("1");
  const [lastTaskId, setLastTaskId] = useState("");
  const [tasks, setTasks] = useState<HostTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [responseText, setResponseText] = useState("No host request sent yet.");

  const daemonUrl = useCallback(
    (path: string, params?: Record<string, string>) => {
      const normalized = baseUrl.trim().replace(/\/+$/, "");
      const url = new URL(path, `${normalized || "http://127.0.0.1:7777"}/`);
      for (const [key, value] of Object.entries(params ?? {})) {
        if (value.trim()) url.searchParams.set(key, value.trim());
      }
      return url.toString();
    },
    [baseUrl],
  );

  const callDaemon = useCallback(
    async (label: string, path: string, params?: Record<string, string>) => {
      let url = "";
      setBusy(true);
      setStatus(`${label}...`);
      try {
        url = daemonUrl(path, params);
        setResponseText(`GET ${url}`);
        const response = await fetch(url, { method: "GET", cache: "no-store" });
        const text = await response.text();
        let payload: unknown = text;
        try {
          payload = text ? JSON.parse(text) : "";
        } catch {
          payload = text;
        }
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}\n${formatDaemonBody(payload)}`);
        const foundTasks = path === "/tasks" ? extractTasks(payload) : [];
        if (foundTasks.length) setTasks(foundTasks);
        const taskId = extractTaskId(payload);
        if (taskId) setLastTaskId(taskId);
        setStatus(`${label} complete.`);
        setResponseText([`GET ${url}`, "", formatDaemonBody(payload)].join("\n"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`${label} blocked or failed.`);
        setResponseText([`GET ${url}`, "", message, "", "If this was a local browser/CORS block, the GET may still have reached the daemon. Use Run for the one-way macro trigger; use readable calls only when the daemon exposes browser-safe headers."].join("\n"));
      } finally {
        setBusy(false);
      }
    },
    [daemonUrl],
  );

  const triggerOpaque = useCallback(async () => {
    const params: Record<string, string> = { task: macroName };
    if (delay.trim()) params.delay = delay;
    if (loop.trim()) params.loop = loop;
    let url = "";
    setBusy(true);
    setStatus("Opaque trigger...");
    try {
      url = daemonUrl("/run", params);
      setResponseText(`GET ${url}`);
      await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" });
      setStatus("Run request sent.");
      setResponseText([`GET ${url}`, "", "Browser accepted the one-way macro request. The response is intentionally unreadable in no-cors mode; check Tasket or the daemon log for the run result."].join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus("Opaque trigger failed.");
      setResponseText([`GET ${url}`, "", message].join("\n"));
    } finally {
      setBusy(false);
    }
  }, [daemonUrl, delay, loop, macroName]);

  const runParams = useMemo(() => {
    const params: Record<string, string> = { task: macroName };
    if (delay.trim()) params.delay = delay;
    if (loop.trim()) params.loop = loop;
    return params;
  }, [delay, loop, macroName]);

  return (
    <section className="host-test">
      <div className="host-grid">
        <section className="host-panel host-control">
          <header>
            <div>
              <strong>Tasket Host Test</strong>
              <span>current Tasket v2 GET routes on the local daemon</span>
            </div>
            <span className={`status-pill ${busy ? "busy" : "idle"}`}>{busy ? "calling" : status}</span>
          </header>
          <div className="host-form">
            <label>
              <span>Daemon URL</span>
              <input className="mono" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} />
            </label>
            <label>
              <span>Tasket Macro</span>
              <input className="mono" value={macroName} onChange={(event) => setMacroName(event.target.value)} spellCheck={false} />
            </label>
            <label>
              <span>Delay Seconds</span>
              <input className="mono" value={delay} onChange={(event) => setDelay(event.target.value)} spellCheck={false} />
            </label>
            <label>
              <span>Loop Count</span>
              <input className="mono" value={loop} onChange={(event) => setLoop(event.target.value)} spellCheck={false} />
            </label>
          </div>
          <div className="host-actions">
            <button type="button" disabled={busy} onClick={() => callDaemon("Health", "/health")}>
              <Check size={15} /> Health
            </button>
            <button type="button" disabled={busy} onClick={() => callDaemon("Task list", "/tasks")}>
              <Search size={15} /> Tasks
            </button>
            <button type="button" disabled={busy} onClick={() => callDaemon("Daemon status", "/status")}>
              <Database size={15} /> Status
            </button>
            <button type="button" disabled={busy || !macroName.trim()} onClick={triggerOpaque}>
              <Play size={15} /> Run
            </button>
            <button type="button" disabled={busy || !macroName.trim()} onClick={() => callDaemon("Run + read", "/run", runParams)}>
              <Upload size={15} /> Run + Read
            </button>
            <button type="button" disabled={busy || !lastTaskId.trim()} onClick={() => callDaemon("Check task", "/check", { id: lastTaskId })}>
              <FileText size={15} /> Check
            </button>
          </div>
        </section>

        <section className="host-panel">
          <header>
            <div>
              <strong>Saved Tasks</strong>
              <span>{tasks.length ? `${tasks.length} loaded from daemon` : "load /tasks or type a macro name"}</span>
            </div>
          </header>
          <div className="task-list">
            {tasks.length ? (
              tasks.map((task) => (
                <button key={task.name} type="button" onClick={() => setMacroName(task.name)} className={macroName === task.name ? "selected" : ""}>
                  <strong>{task.name}</strong>
                  <span>{task.delay ? `${task.delay}s` : "delay from macro"}</span>
                  {task.detail && <small>{task.detail}</small>}
                </button>
              ))
            ) : (
              <div className="empty-state">No task inventory loaded.</div>
            )}
          </div>
        </section>

        <section className="host-panel host-output">
          <header>
            <div>
              <strong>Daemon Response</strong>
              <span>{lastTaskId ? `last task #${lastTaskId}` : "no task number captured yet"}</span>
            </div>
          </header>
          <pre>{responseText}</pre>
        </section>
      </div>
    </section>
  );
}

function App() {
  const [env, setEnv] = useState<MacrohelpEnvironment>(initialEnv);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [tokenSearch, setTokenSearch] = useState("");
  const [rawOpen, setRawOpen] = useState(false);
  const [rawImport, setRawImport] = useState("");
  const [copied, setCopied] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("builder");
  const fileRef = useRef<HTMLInputElement>(null);

  const output = useMemo(() => serializeEnv(env), [env]);
  const stable = useMemo(() => serializeEnv(parseEnv(output)) === output, [output]);
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
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [output]);

  const downloadOutput = useCallback(() => {
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "macrohelp-registry-hub-environment.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [output]);

  const importFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setEnv(parseEnv(text));
    setRawImport(text);
    event.target.value = "";
  }, []);

  const applyRaw = useCallback(() => {
    setEnv(parseEnv(rawImport));
  }, [rawImport]);

  const reset = useCallback(() => {
    setEnv(initialEnv);
    setNodes(initialNodes);
    setEdges(initialEdges);
    setRawImport("");
  }, [setEdges, setNodes]);

  const context = useMemo<EditorContextValue>(() => ({ env, setEnv, appendScript, output, openExport: () => setRawOpen(true) }), [appendScript, env, output]);

  return (
    <EditorContext.Provider value={context}>
      <main className="app-shell">
        <input ref={fileRef} className="hidden" type="file" accept=".txt,.env,.md,text/plain" onChange={importFile} />
        <nav className="topbar">
          <div className="brand">
            <Workflow size={21} />
            <div>
              <strong>Macrohelp Visual Assembly</strong>
              <span>Tasket v2 + Regedited command graph</span>
            </div>
          </div>
          <div className="view-tabs" role="tablist" aria-label="Macrohelp views">
            <button className={activeView === "builder" ? "active" : ""} type="button" onClick={() => setActiveView("builder")}>
              Builder
            </button>
            <button className={activeView === "host" ? "active" : ""} type="button" onClick={() => setActiveView("host")}>
              Host Test
            </button>
          </div>
          <div className="toolbar-group">
            {activeView === "builder" ? (
              <>
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
              <span className="toolbar-note">local daemon request lab</span>
            )}
          </div>
          <div className={`status ${stable ? "ok" : "bad"}`}>{stable ? "canonical" : "roundtrip drift"}</div>
        </nav>

        {activeView === "builder" ? (
          <div className="workspace">
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
                  <button className="token-item" key={`${token.category}-${token.label}`} onClick={() => appendScript(token.token)} type="button">
                    <span>{token.category}</span>
                    <strong>{token.label}</strong>
                    <code>{token.token}</code>
                    <small>{token.detail}</small>
                  </button>
                ))}
              </div>
            </aside>

            <section className="flow-wrap">
              <ReactFlow
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
              </ReactFlow>
            </section>
          </div>
        ) : (
          <HostMacroTest />
        )}

        {activeView === "builder" && rawOpen && (
          <section className="raw-drawer" role="dialog" aria-modal="true">
            <div className="raw-head">
              <div>
                <strong>Macrohelp Text</strong>
                <span>{output.length.toLocaleString()} characters</span>
              </div>
              <button type="button" onClick={() => setRawOpen(false)} title="Close">
                <X size={18} />
              </button>
            </div>
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
                <textarea data-testid="raw-export" value={output} readOnly spellCheck={false} />
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
