export type PasteSlot = "Z" | "X" | "C" | "V";
export type VarSlot = "A" | "S" | "D" | "F";
export type PointSlot = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12" | "13" | "14" | "15" | "16";
export type ShellSlot = "X" | "C" | "G" | "P" | "T";
export type NodeKind = "paths" | "script" | "vars" | "pastes" | "zones" | "points" | "shells" | "view" | "daemon" | "output";
export type AppView = "builder" | "host";

export interface HostTask {
  name: string;
  delay?: string;
  detail?: string;
}

export interface ZoneValue {
  set: boolean;
  value: string;
}

export interface PointValue {
  set: boolean;
  value: string;
}

export interface MacrohelpEnvironment {
  extra: Record<string, string>;
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
    cursorCoordinatesVisible: boolean;
    keyHudVisible: boolean;
    gridVisible: boolean;
    coordinatesOnlyMode: boolean;
  };
  vars: Record<VarSlot, string>;
  pastes: Record<PasteSlot, string>;
  zones: Record<PasteSlot, ZoneValue>;
  points: Record<PointSlot, PointValue>;
}

export const pasteSlots: PasteSlot[] = ["Z", "X", "C", "V"];
export const varSlots: VarSlot[] = ["A", "S", "D", "F"];
export const pointSlots = Array.from({ length: 16 }, (_, index) => String(index + 1) as PointSlot);
export const shellSlots: ShellSlot[] = ["X", "C", "G", "P", "T"];
const defaultPath = "%USERPROFILE%\\Desktop\\temps\\macrohelp-registry-hub-environment.txt";

export function emptyPoints(): Record<PointSlot, PointValue> {
  return Object.fromEntries(pointSlots.map((slot) => [slot, { set: false, value: "" }])) as Record<PointSlot, PointValue>;
}

export const initialEnv: MacrohelpEnvironment = {
  extra: {},
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
    P: "pwsh",
    T: "",
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
    cursorCoordinatesVisible: true,
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

export function cloneEnv(env: MacrohelpEnvironment): MacrohelpEnvironment {
  return JSON.parse(JSON.stringify(env)) as MacrohelpEnvironment;
}

export function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

export function unescapeValue(value: string): string {
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

export function b(value: boolean): string {
  return value ? "1" : "0";
}

export function parseBool(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

export function asPointSlot(value: string): PointSlot | null {
  return pointSlots.includes(value as PointSlot) ? (value as PointSlot) : null;
}

export function line(key: string, value: string): string {
  return `${key}=${escapeValue(value)}`;
}

export function serializeEnv(env: MacrohelpEnvironment): string {
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
    line("ShellAliasP", env.shellAliases.P),
    line("ShellAliasT", env.shellAliases.T),
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
    line("CursorCoordinatesVisible", b(env.toggles.cursorCoordinatesVisible)),
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

  for (const [key, value] of Object.entries(env.extra)) rows.push(line(key, value));
  return `${rows.join("\n")}\n`;
}

export function parseEnv(text: string): MacrohelpEnvironment {
  const next = cloneEnv(initialEnv);
  const explicit = new Set<string>();
  for (const row of text.split(/\r?\n/)) { const key = row.slice(0, row.indexOf("=")).trim().toLowerCase(); if (/^(zone[zxcv]|point\d+)set$/.test(key)) explicit.add(key); }
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
    else if (key === "shellaliasp") next.shellAliases.P = value;
    else if (key === "shellaliast") next.shellAliases.T = value;
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
    else if (key === "cursorcoordinatesvisible") next.toggles.cursorCoordinatesVisible = parseBool(value);
    else if (key === "keyhudvisible") next.toggles.keyHudVisible = parseBool(value);
    else if (key === "gridvisible") next.toggles.gridVisible = parseBool(value);
    else if (key === "coordinatesonlymode") next.toggles.coordinatesOnlyMode = parseBool(value);
    else if (/^var[asdf]$/.test(key)) next.vars[name.slice(3).toUpperCase() as VarSlot] = value;
    else if (/^paste[zxcv]$/.test(key)) next.pastes[name.slice(5).toUpperCase() as PasteSlot] = value;
    else if (/^zone[zxcv]set$/.test(key)) next.zones[name.slice(4, 5).toUpperCase() as PasteSlot].set = parseBool(value);
    else if (/^zone[zxcv]$/.test(key)) {
      const slot = name.slice(4).toUpperCase() as PasteSlot;
      next.zones[slot].value = value;
      if (value.trim() && !explicit.has(key + "set")) next.zones[slot].set = true;
    } else if (/^point\d{1,2}set$/.test(key)) {
      const slot = asPointSlot(name.slice(5, -3));
      if (slot) next.points[slot].set = parseBool(value);
    } else if (/^point\d{1,2}$/.test(key)) {
      const slot = asPointSlot(name.slice(5));
      if (slot) {
        next.points[slot].value = value;
        if (value.trim() && !explicit.has(key + "set")) next.points[slot].set = true;
      }
    } else next.extra[name] = value;
  }
  return next;
}
