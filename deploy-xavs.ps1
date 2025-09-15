# XAVS Platform Deployment Script (PowerShell)
# Deploys XAVS modules to a remote Cockpit server

$SERVER = "root@192.168.0.25"
$COCKPIT_DIR = "/usr/share/cockpit"
$LOCAL_DIR = "."

Write-Host "🚀 XAVS Platform Deployment Script" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Target Server: $SERVER" -ForegroundColor Yellow
Write-Host "Cockpit Directory: $COCKPIT_DIR" -ForegroundColor Yellow
Write-Host ""

# Function to deploy a module
function Deploy-Module {
    param(
        [string]$ModuleName,
        [string]$LocalPath
    )
    
    $RemotePath = "$COCKPIT_DIR/$ModuleName"
    
    Write-Host "📦 Deploying $ModuleName..." -ForegroundColor Green
    
    # Create remote directory
    ssh $SERVER "mkdir -p $RemotePath"
    
    # Copy files using SCP
    scp -r "$LocalPath/*" "${SERVER}:${RemotePath}/"
    
    # Set permissions
    ssh $SERVER "chown -R root:root $RemotePath && chmod -R 644 $RemotePath && find $RemotePath -name '*.js' -exec chmod 755 {} \;"
    
    Write-Host "✅ $ModuleName deployed successfully" -ForegroundColor Green
}

# Deploy modules
Write-Host "Starting deployment..." -ForegroundColor Cyan
Write-Host ""

try {
    # Deploy common modules
    Deploy-Module "xavs-common" "xavs-common"
    Deploy-Module "xavs-main" "xavs-main" 
    Deploy-Module "xavs-welcome" "xavs-welcome"

    # Create XAVS directories on server
    Write-Host "📁 Creating XAVS system directories..." -ForegroundColor Green
    ssh $SERVER "mkdir -p /etc/xavs /var/log/xavs /etc/xavs/inventory /etc/xavs/backups"
    ssh $SERVER "touch /var/log/xavs/audit.log"
    ssh $SERVER "chmod 755 /etc/xavs /var/log/xavs"
    ssh $SERVER "chmod 644 /var/log/xavs/audit.log"

    # Restart Cockpit to reload modules
    Write-Host "🔄 Restarting Cockpit service..." -ForegroundColor Yellow
    ssh $SERVER "systemctl restart cockpit"

    Write-Host ""
    Write-Host "🎉 XAVS Platform deployment completed!" -ForegroundColor Green
    Write-Host "Access your XAVS platform at: https://192.168.0.25:9090" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 Deployment Summary:" -ForegroundColor Yellow
    Write-Host "- XAVS Common: Centralized state management and module loader"
    Write-Host "- XAVS Main: Main application entry point"
    Write-Host "- XAVS Welcome: Welcome and deployment mode selection"
    Write-Host "- System directories created for state and audit logging"
    Write-Host ""
    Write-Host "🔧 Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Open Cockpit web interface"
    Write-Host "2. Navigate to XAVS Platform"
    Write-Host "3. Follow the deployment wizard"
}
catch {
    Write-Host "❌ Deployment failed: $_" -ForegroundColor Red
    exit 1
}