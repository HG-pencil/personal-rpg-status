$TaskName = "Antigravity_RPG_Sync"
$PythonPath = "python.exe"
$ScriptPath = "F:\Google Antigravity\projects\personal-rpg-status\status.py"
$Arguments = "--user kingo"

# Remove existing task if any
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

# Action
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$ScriptPath`" $Arguments" -WorkingDirectory "F:\Google Antigravity\projects\personal-rpg-status"

# Trigger (Run once starting now, repeat every 30 minutes infinitely)
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)

# Settings (allow run on battery)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Force
    Write-Host "[+] Task '$TaskName' registered successfully." -ForegroundColor Green
    Write-Host "[+] Sync runs every 30 minutes." -ForegroundColor Green
} catch {
    Write-Host "[!] Registration failed. Please run PowerShell as Administrator." -ForegroundColor Red
}
