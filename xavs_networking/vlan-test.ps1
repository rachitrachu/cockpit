# VLAN Testing PowerShell Script for Windows Development
# Run this from your Windows development machine

param(
    [string]$ServerIP = "",
    [string]$Username = "ubuntu",
    [string]$Command = "help"
)

function Show-Help {
    Write-Host "🔧 VLAN Testing PowerShell Script" -ForegroundColor Cyan
    Write-Host "=================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage: .\vlan-test.ps1 -ServerIP <IP> -Username <user> -Command <cmd>" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Green
    Write-Host "  check       - Check current VLAN state on server" -ForegroundColor White
    Write-Host "  monitor     - Start monitoring VLAN changes" -ForegroundColor White
    Write-Host "  backup      - Backup current netplan config" -ForegroundColor White
    Write-Host "  restore     - Restore netplan backup" -ForegroundColor White
    Write-Host "  deploy      - Deploy VLAN fixes to server" -ForegroundColor White
    Write-Host "  test-edit   - Run automated VLAN edit test" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\vlan-test.ps1 -ServerIP 192.168.1.100 -Command check"
    Write-Host "  .\vlan-test.ps1 -ServerIP 192.168.1.100 -Command deploy"
    Write-Host "  .\vlan-test.ps1 -ServerIP 192.168.1.100 -Command test-edit"
}

function Invoke-SSHCommand {
    param([string]$Command)
    
    if ([string]::IsNullOrEmpty($ServerIP)) {
        Write-Host "❌ ServerIP is required" -ForegroundColor Red
        return
    }
    
    Write-Host "🔗 Executing on ${ServerIP}: $Command" -ForegroundColor Cyan
    
    # Using built-in SSH (Windows 10+) or provide alternative
    try {
        ssh "${Username}@${ServerIP}" $Command
    } catch {
        Write-Host "❌ SSH failed. Ensure SSH is available or use PuTTY/WSL" -ForegroundColor Red
        Write-Host "Alternative: Use Windows Subsystem for Linux (WSL)" -ForegroundColor Yellow
    }
}

function Publish-VlanFixes {
    Write-Host "📦 Deploying VLAN fixes to server..." -ForegroundColor Green
    
    $cockpitPath = "/usr/share/cockpit/xavs_networking"
    
    # Copy JS files
    Write-Host "📁 Copying JavaScript files..."
    scp "xavs_networking\js\netplan-js-manager.js" "${Username}@${ServerIP}:${cockpitPath}/js/"
    scp "xavs_networking\js\vlan-debug-fix.js" "${Username}@${ServerIP}:${cockpitPath}/js/"
    scp "xavs_networking\js\vlan-test-hybrid.js" "${Username}@${ServerIP}:${cockpitPath}/js/"
    
    # Copy scripts
    Write-Host "📁 Copying test scripts..."
    scp "xavs_networking\ssh-vlan-test.sh" "${Username}@${ServerIP}:/tmp/"
    scp "xavs_networking\validate-vlan-fixes.sh" "${Username}@${ServerIP}:/tmp/"
    
    # Make scripts executable
    Invoke-SSHCommand "chmod +x /tmp/ssh-vlan-test.sh /tmp/validate-vlan-fixes.sh"
    
    # Restart cockpit
    Write-Host "🔄 Restarting cockpit service..."
    Invoke-SSHCommand "sudo systemctl restart cockpit"
    
    Write-Host "✅ Deployment complete!" -ForegroundColor Green
}

function Test-VlanEdit {
    Write-Host "🧪 Running automated VLAN edit test..." -ForegroundColor Green
    
    # Backup current state
    Invoke-SSHCommand "/tmp/ssh-vlan-test.sh backup"
    
    # Check initial state
    Write-Host "📸 Initial VLAN state:" -ForegroundColor Yellow
    Invoke-SSHCommand "/tmp/ssh-vlan-test.sh check"
    
    Write-Host ""
    Write-Host "🌐 Now perform VLAN edit in cockpit web interface:" -ForegroundColor Yellow
    Write-Host "   1. Open http://${ServerIP}:9090" -ForegroundColor White
    Write-Host "   2. Go to XAVS Networking" -ForegroundColor White
    Write-Host "   3. Edit a VLAN IP address" -ForegroundColor White
    Write-Host "   4. Press Enter when done..." -ForegroundColor White
    Read-Host
    
    # Check post-edit state
    Write-Host "📸 Post-edit VLAN state:" -ForegroundColor Yellow
    Invoke-SSHCommand "/tmp/ssh-vlan-test.sh check"
    
    Write-Host ""
    Write-Host "🔍 Would you like to restore the backup? (y/n):" -ForegroundColor Yellow
    $restore = Read-Host
    if ($restore -eq 'y' -or $restore -eq 'Y') {
        Invoke-SSHCommand "/tmp/ssh-vlan-test.sh restore"
        Write-Host "✅ Configuration restored" -ForegroundColor Green
    }
}

function Start-VlanMonitoring {
    Write-Host "🔍 Starting VLAN monitoring (Ctrl+C to stop)..." -ForegroundColor Green
    Write-Host "Open cockpit in another window and edit VLANs" -ForegroundColor Yellow
    
    Invoke-SSHCommand "/tmp/ssh-vlan-test.sh monitor"
}

# Main execution
switch ($Command.ToLower()) {
    "check" {
        Invoke-SSHCommand "/tmp/ssh-vlan-test.sh check"
    }
    "monitor" {
        Start-VlanMonitoring
    }
    "backup" {
        Invoke-SSHCommand "/tmp/ssh-vlan-test.sh backup"
    }
    "restore" {
        Invoke-SSHCommand "/tmp/ssh-vlan-test.sh restore"
    }
    "deploy" {
        Publish-VlanFixes
    }
    "test-edit" {
        Test-VlanEdit
    }
    default {
        Show-Help
    }
}

# Quick setup instructions
if ($Command -eq "help") {
    Write-Host ""
    Write-Host "🚀 Quick Setup:" -ForegroundColor Cyan
    Write-Host "1. Ensure SSH key authentication is set up" -ForegroundColor White
    Write-Host "2. Run: .\vlan-test.ps1 -ServerIP <your-server-ip> -Command deploy" -ForegroundColor White
    Write-Host "3. Run: .\vlan-test.ps1 -ServerIP <your-server-ip> -Command test-edit" -ForegroundColor White
}
