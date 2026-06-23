# Quick Start (5 Minutes)

## 1. Build

```powershell
cmake -B build -G "MinGW Makefiles" -DCMAKE_PREFIX_PATH="C:\Qt\6.8.0\mingw_64" -DTASKETPP_ROOT="..\tasketpp"
cmake --build build --parallel
```

## 2. Copy your Tasket++ saved tasks

```powershell
Copy-Item -Path "tasketpp\saved_tasks\*" -Destination "tasket-http-trigger\saved_tasks\" -Recurse -Force
```

## 3. Run

```powershell
.\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\saved_tasks"
```

## 4. Test

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
```

## 5. Firewall

```powershell
New-NetFirewallRule -DisplayName "Tasket HTTP Trigger" -Direction Inbound -LocalPort 7777 -Protocol TCP -Action Allow
```

## 6. Enable API Key (optional)

```powershell
.\build\tasket-httpd.exe -p 7777 -b 0.0.0.0 -d ".\saved_tasks" -k "MySecret123"
```

Then add `-H "X-Tasket-Key: MySecret123"` to every curl request.
