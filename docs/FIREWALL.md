# Windows Firewall Setup for Tasket++ HTTP Trigger

Run these commands in an **Administrator PowerShell**.

## Add Inbound Rule

```powershell
$port = 7777
New-NetFirewallRule `
  -DisplayName "Tasket++ HTTP Trigger" `
  -Direction Inbound `
  -LocalPort $port `
  -Protocol TCP `
  -Action Allow `
  -Profile Domain,Private `
  -Description "Allow LAN devices to trigger Tasket++ automations via HTTP"
```

## Remove Rule (if needed)

```powershell
Remove-NetFirewallRule -DisplayName "Tasket++ HTTP Trigger"
```

## Restrict to Private Networks Only

If you want to block public/Wi-Fi hotspot networks:

```powershell
Set-NetFirewallRule -DisplayName "Tasket++ HTTP Trigger" -Profile Private
```

## Verify

```powershell
Get-NetFirewallRule -DisplayName "Tasket++ HTTP Trigger" | Format-Table
Test-NetConnection -ComputerName localhost -Port 7777
```
