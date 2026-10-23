# Macrohard Visual Assembly

Stateless React/Vite editor for Macrohelp Registry Hub import/export text.

It has no daemon, no HTTP calls, and no live runtime communication. The app only edits a local in-memory model, imports plaintext, and exports Macrohelp-compatible plaintext.

```powershell
bun install
bun run build
bun run dev
```

The editor is a visual builder for the same text file Macrohelp imports:

- Drag and zoom the node canvas to arrange the workflow visually.
- Edit paths, shell aliases, script text, A/S/D/F variables, Z/X/C/V paste buffers, physical Z/X/C/V zones, important points 1-16, Q visibility defaults, and status ledger fields.
- Use the token library to append valid brace commands into the script.
- Use `Text` to paste an existing Macrohelp export, apply it, review the canonical output, copy it, or download it.

The canonical text serializer mirrors Macrohelp's key order and escaping rules for backslashes, carriage returns, newlines, and tabs. A serialize -> parse -> serialize roundtrip should produce identical text.

## Coverage

The current schema tracks:

- `MacrohelpRegistryHubExportVersion`, generated/path metadata, `RegistryFilePath`, `ShellAliasX/C/G`, `Script`, status, last Tasket ledger fields, runtime stage fields, and visible line count.
- Q display toggles: `CrosshairVisible`, `CoordinatePanelVisible`, `KeyHudVisible`, `GridVisible`, and `CoordinatesOnlyMode`.
- `VarA/S/D/F`, `PasteZ/X/C/V`, `ZoneZ/X/C/V` plus `Zone*Set`, and `Point1..Point16` plus `Point*Set`.

The token library includes shell entry, paste/click mode, value-setting, boolean branches, daemon-backed branches, saved-task checks, schedule playback, zone capture, points, clicks, waits, raw Tasket chords, `ctrlmod`, and `shiftmod`.

## Verified

Latest local sweep:

- `bun run build` passed.
- Browser export contained `ZoneZSet`, `Point1Set`, `Point16Set`, `Point16`, `CoordinatesOnlyMode`, shell aliases, vars, pastes, and zones.
- Raw import mutation preserved `CoordinatesOnlyMode=1`, `Point16=333,444`, `ZoneX=1,2`, and a daemon branch in `VarF`.
