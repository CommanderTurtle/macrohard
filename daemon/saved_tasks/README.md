# saved_tasks Folder

Place your Tasket++ `.scht` task files in this directory.

The HTTP daemon scans this folder on every request, so new tasks are available immediately without restarting the server.

## Naming

- Files must have the `.scht` extension.
- The task name used in HTTP requests is the filename **without** `.scht`.
  - Example: `HelloWorld.scht` → request with `?task=HelloWorld`
- Names are case-insensitive.

## Creating Tasks

1. Open **Tasket++ GUI**.
2. Build your automation sequence.
3. Save the task. It will be written to `saved_tasks/<Name>.scht`.
4. The HTTP daemon can now trigger it.

## File Format

`.scht` files are JSON with a specific schema:

```json
{
  "docType": "ScheduleTask File",
  "description": "Human-readable description",
  "actions": [
    { "type": "paste", "content": "Hello", "contentId": "", "loop": 1 },
    { "type": "wait", "duration": 1.5 },
    { "type": "keyssequence", "keysmap": { ... }, "keysSeqId": "", "loop": 1 },
    { "type": "systemcommand", "sysCommandType": "openurl", "sysCommandParam1": "...", "sysCommandParam2": "" },
    { "type": "cursormovements", "cursormovsmap": [...], "cursorMovsId": "", "loop": 1 },
    { "type": "runningothertask", "otherTaskName": "AnotherTask", "otherTaskDelay": 0, "otherTaskLoops": 1 }
  ]
}
```

You can also create these files by hand or generate them from other tools.

## Validation

You can validate a `.scht` file with the test loader:

```bash
# Not yet implemented — planned CLI validation tool
```

For now, attempt to run it via `GET /run?task=Name` and check the HTTP response.
