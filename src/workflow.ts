import { cloneEnv, initialEnv, parseEnv, serializeEnv, type MacrohelpEnvironment } from "./environment";

export interface Command { start: number; end: number; raw: string; op: string; body: string }
export type Layout = Record<string,{x:number;y:number}>;
export function commands(script: string): { items: Command[]; errors: string[] } {
  const items: Command[] = [], errors: string[] = [], branches: boolean[] = [];
  let depth = 0, start = 0;
  const issue = (at: number, text: string) => errors.push(`Line ${script.slice(0, at).split("\n").length}: ${text}`);
  for (let i = 0; i < script.length; i++) {
    const ch = script[i];
    if (ch === "{") { if (depth++ === 0) start = i; }
    else if (ch === "}") {
      if (!depth) { issue(i, "Unexpected closing brace"); continue; }
      if (--depth) continue;
      const raw = script.slice(start, i + 1), inner = raw.slice(1, -1).trim();
      const split = /^(\S+)(?:\s([\s\S]*))?$/.exec(inner), op = split?.[1].toLowerCase() || "", body = split?.[2] || "";
      items.push({ start, end: i + 1, raw, op, body });
      if (op === "shell" && body.trim() && !/^[XCGP]$/i.test(body.trim())) issue(start, "Shell alias must be X, C, G or P");
      if (op === "screen" && body.trim()) issue(start, "{screen} takes no arguments");
      if (op === "if") branches.push(false);
      if (op === "else") { if (!branches.length || branches.at(-1)) issue(start, "Unexpected else"); else branches[branches.length-1] = true; }
      if (op === "endif" || inner.toLowerCase() === "end if") { if (!branches.length) issue(start, "Unexpected endif"); else branches.pop(); }
    } else if (!depth && !/\s/.test(ch)) { issue(i, "Text outside a command"); while (i+1<script.length && !/[{}]/.test(script[i+1])) i++; }
  }
  if (depth) issue(start, "Missing closing brace");
  if (branches.length) errors.push("Missing endif");
  return { items, errors };
}
export function replaceCommand(script: string, command: Command, text: string) {
  return script.slice(0, command.start) + text + script.slice(command.end);
}
export function download(text: string, name: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function registryDocument(env: MacrohelpEnvironment, index = 1, layout: Layout = {}) {
  if (!Number.isSafeInteger(index) || index < 0) throw Error("Index must be a nonnegative safe integer");
  const payloads = [env.script, serializeEnv(env), JSON.stringify({ format: "macrohard", version: 1, environment: env, layout }, null, 2)];
  if (payloads.some(p => p.includes("regedited open"))) throw Error("Regedited reserves the literal ‘regedited open’ marker; use environment export for this content.");
  const rows = ["regedited open", `index: ${index}`, "", "0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0", "Macrohelp workflow", "Script / environment / project", "macrohard/1"];
  const pairs: string[] = [];
  for (const [i, payload] of payloads.entries()) {
    rows.push("", `# ${["Script", "Environment", "Project"][i]}`);
    const start = rows.length; rows.push(...payload.split("\n"));
    const hex = (n: number) => { if (n > 0xfffffff) throw Error("Registry document exceeds its line-address limit"); return `${i === 0 ? 1 : 3}x${n.toString(16).toUpperCase().padStart(7,"0")}`; };
    pairs.push(hex(start), hex(rows.length-1));
  }
  rows[2] = pairs.join(" : ");
  return rows.join("\n") + "\n";
}
export function importDocument(text: string, base = initialEnv): MacrohelpEnvironment {
  if (/^\s*\{\s*"/.test(text)) {
    const doc = JSON.parse(text);
    if (doc.format !== "macrohard" || doc.version !== 1 || !doc.environment || typeof doc.environment.script !== "string") throw Error("Not a Macrohard project");
    // Use the same field codec as text imports; don't trust imported prototypes.
    return parseEnv(serializeEnv({ ...doc.environment, extra: doc.environment.extra || {} }));
  }
  const rows = text.split(/\r?\n/);
  if (rows[0] === "regedited open" && rows[6] === "macrohard/1") {
    const words = rows[2]?.match(/[0-3]x[0-9a-fA-F]{7}/g);
    if (words?.length !== 6) throw Error("Invalid Regedited zone pointers");
    const start = parseInt(words[2].slice(2),16), end = parseInt(words[3].slice(2),16);
    if (start > end || end >= rows.length) throw Error("Regedited environment zone is outside the document");
    return parseEnv(rows.slice(start,end+1).join("\n"));
  }
  if (!/^MacrohelpRegistryHubExportVersion=/m.test(text)) {
    const parsed = commands(text);
    if (!parsed.items.length || parsed.errors.length) throw Error("Choose a Macrohelp environment, script, project JSON or Macrohard Regedited document");
    return {...cloneEnv(base),script:text};
  }
  return parseEnv(text);
}
export function projectLayout(text: string): Layout {
  let value: unknown;
  if (/^\s*\{\s*"/.test(text)) value=JSON.parse(text);
  else { const rows=text.split(/\r?\n/);if(rows[0]==="regedited open"&&rows[6]==="macrohard/1"){
    const words=rows[2].match(/[0-3]x[0-9a-fA-F]{7}/g);
    if(words?.length!==6)throw Error("Invalid project zone");
    const start=parseInt(words[4].slice(2),16),end=parseInt(words[5].slice(2),16);
    if(start>end||end>=rows.length)throw Error("Invalid project zone");
    value=JSON.parse(rows.slice(start,end+1).join("\n"));
  }}
  const layout=(value as {layout?:unknown}|undefined)?.layout;
  if(layout===undefined)return {};
  if(!layout||typeof layout!=="object"||Array.isArray(layout)||Object.keys(layout).length>10000)throw Error("Invalid project layout");
  const entries=Object.entries(layout);
  for(const [key,v] of entries)if(!/^step-\d+$/.test(key)||!v||![v.x,v.y].every(n=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<1e7))throw Error("Invalid project position");
  return Object.fromEntries(entries.map(([key,v])=>[key,{x:v.x,y:v.y}]));
}
export function controlConfig(env: MacrohelpEnvironment) {
  for (const [slot,value] of Object.entries(env.shellAliases)) {
    if (/[\r\n\x00-\x1f\x7f]/.test(value)) throw Error(`Shell ${slot} must be a single line`);
    if (slot !== 'T' && /^(type|press|set|wait|paste|buf|zone|zonebuf|screen)$/i.test(value.trim())) throw Error(`Shell ${slot}: choose a shell starter command, not a Registry Hub instruction`);
  }
  const coordinate = (value: string): number | string => {
    const board = /^(-?)_([a-z]+)$/i.exec(value);
    if (board) {
      let cell = 0;
      for (const letter of board[2].toLowerCase()) {
        cell = cell * 26 + letter.charCodeAt(0) - 96;
        if (cell > 2000) throw Error(`Board coordinate out of range: ${value}`);
      }
      return value;
    }
    const number = Number(value);
    if (!value || !Number.isFinite(number) || Math.abs(number) > 100000) throw Error(`Invalid coordinate: ${value}`);
    return number;
  };
  const coords = (value: string, count: number): (number | string)[] => {
    const parts = value.trim().split(/[,\s]+/);
    if (parts.length !== count) throw Error(`Expected ${count} coordinates: ${value}`);
    return parts.map(coordinate);
  };
  const points = Object.fromEntries(Object.entries(env.points).map(([n,p]) => [n, p.set ? coords(p.value,2) : null]));
  const zone = (slot: string, seen: string[] = []): (number | string)[] | null => {
    if (seen.includes(slot)) throw Error(`Cyclic zone ${slot}`);
    const item = env.zones[slot as keyof typeof env.zones];
    if (!item?.set) return null;
    const value = item.value.trim().toUpperCase();
    if (/^[ZXCV]$/.test(value)) return zone(value,seen.concat(slot));
    const pair = value.split(/[,\s]+/);
    if (pair.length === 2) {
      const point = (key: string) => points[/^[A-P]$/.test(key) ? String(key.charCodeAt(0) - 64) : key];
      const a = point(pair[0]), b = point(pair[1]);
      if (!a || !b) throw Error(`Zone ${slot} refers to an unset point`);
      return [...a,...b];
    }
    return coords(item.value,4);
  };
  return { script: env.script, registry: env.registryFilePath, vars: env.vars, buffers: env.pastes, shells: env.shellAliases,
    paths: { import: env.importPath, export: env.exportPath }, points,
    zones: Object.fromEntries(Object.keys(env.zones).map(s=>[s,zone(s)])),
    view: { crosshair: env.toggles.crosshairVisible, panel: env.toggles.coordinatePanelVisible, coordinates: env.toggles.cursorCoordinatesVisible, keys: env.toggles.keyHudVisible, grid: env.toggles.gridVisible, coordinates_only: env.toggles.coordinatesOnlyMode } };
}
