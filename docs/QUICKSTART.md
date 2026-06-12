# Quick Start (5 Minutes)

## Prerequisites

- Windows 10/11
- Qt 6.9.3 with MinGW or MSVC
- CMake 3.16+
- Original Tasket++ source cloned to `original/` and patched

## 1. Clone and Patch

```powershell
git clone https://github.com/AmirHammouteneEI/ScheduledPasteAndKeys.git original
cd original && git apply ..\daemon\patches\Task.h.patch && cd ..
```

## 2. Build

```powershell
cmake -B daemon/build -G "MinGW Makefiles" `
    -DCMAKE_PREFIX_PATH="C:\Qt\6.9.3\mingw_64" `
    -DTASKETPP_ROOT="C:\dev\tasketpp\original" `
    -DCMAKE_BUILD_TYPE=Release
cmake --build daemon/build --parallel
```

## 3. Copy your Tasket++ saved tasks

```powershell
Copy-Item -Path "original\saved_tasks\*" -Destination "daemon\saved_tasks\" -Recurse -Force
```

## 4. Run

```powershell
.\daemon\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\daemon\saved_tasks"
```

## 5. Test

```bash
# See all available tools
curl http://<windows-ip>:7777/

# List macros and their default delays
curl http://<windows-ip>:7777/tasks

# Schedule HelloWorld (uses its 10s default delay)
curl "http://<windows-ip>:7777/run?task=HelloWorld"
# -> returns task_number: 1

# Check its status
curl "http://<windows-ip>:7777/check?id=1"

# Schedule another with 30s delay override
curl "http://<windows-ip>:7777/run?task=OpenRepo&delay=30"
# -> returns task_number: 2

# Set a workflow entrypoint
curl -X POST "http://<windows-ip>:7777/entrypoint" \
  -H "Content-Type: application/json" \
  -d '{"id": "ep1", "value": "hello", "type": "string"}'

# Set a grid cell
curl -X POST "http://<windows-ip>:7777/grid" \
  -H "Content-Type: application/json" \
  -d '{"id": "grid-0", "value": "42"}'
```

## 6. Firewall

```powershell
New-NetFirewallRule -DisplayName "Tasket HTTP Trigger" -Direction Inbound -LocalPort 7777 -Protocol TCP -Action Allow
```

## 7. Enable API Key (optional)

```powershell
.\daemon\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\daemon\saved_tasks" -k "MySecret123"
```

Then add `-H "X-Tasket-Key: MySecret123"` to every curl request.
