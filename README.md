# Macrohard

Static visual editor for Macrohelp Registry Hub. Uses the existing Tasket/Omarsket daemons; the site contains no automation engine, telemetry or proxy.

```sh
bun install
bun run dev
bun run build
bun test
```

The built `dist/` uses relative assets and works at a domain root or nested static route.

## Editor

Workflow shows individual brace commands with an editable inspector. Double-click the canvas or drag from the library to add commands. Duplicate/delete, undo/redo, zoom, minimap and layout controls are available. Environment retains the original field-node editor.

F fits the canvas, G toggles the grid, M toggles the minimap. Ctrl+Z / Ctrl+Shift+Z undo/redo configuration edits. Ctrl+S downloads the selected export. Syntax checks understand balanced nested braces; they do not replace native runtime validation.

Text exports: Macrohelp environment, script-only `registry.txt`, project JSON with command positions, or a Regedited document. The latter contains index 1 with explicit, zero-based inclusive zones: `i1z1` script, `i1z2` environment, `i1z3` project. Import supports all four. Unknown environment fields and literal newlines/backslashes survive roundtrips.

## Local control

Connect uses the overlay API (`127.0.0.1:7778`, Bearer token) for the same health/state/schema/help/coordinates/control/stop routes as MCP. Requests may be edited as JSON; current-workflow requests default to temporary `no_replace` configuration. Send control executes real actions, not a dry run.

Tasks (`127.0.0.1:7777`, `X-Tasket-Key`) lists and runs saved schedules or inserts their play command. Optional five-second refresh pauses when the page is hidden. No requests occur on startup. Keys remain in component memory and are never exported or saved to browser storage.

After rebuilding the local Macrohelp listeners, start them with `MACROHELP_CORS=true` for browser access. Windows' execution daemon additionally needs `--key` and `--bind 127.0.0.1`. CORS accepts any origin but retains token authentication, omits cookies, and does not replace the browser's local-network permission. The site never retries uncertain actions automatically.
