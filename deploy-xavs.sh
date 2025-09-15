#!/bin/bash

# XAVS Platform Deployment Script
# Deploys XAVS modules to a remote Cockpit server

SERVER="root@192.168.0.25"
COCKPIT_DIR="/usr/share/cockpit"
LOCAL_DIR="."

echo "🚀 XAVS Platform Deployment Script"
echo "=================================="
echo "Target Server: $SERVER"
echo "Cockpit Directory: $COCKPIT_DIR"
echo ""

# Function to deploy a module
deploy_module() {
    local module_name=$1
    local local_path=$2
    local remote_path="$COCKPIT_DIR/$module_name"
    
    echo "📦 Deploying $module_name..."
    
    # Create remote directory
    ssh $SERVER "mkdir -p $remote_path"
    
    # Copy files
    scp -r $local_path/* $SERVER:$remote_path/
    
    # Set permissions
    ssh $SERVER "chown -R root:root $remote_path && chmod -R 644 $remote_path && find $remote_path -name '*.js' -exec chmod 755 {} \;"
    
    echo "✅ $module_name deployed successfully"
}

# Deploy modules
echo "Starting deployment..."
echo ""

# Deploy common modules
deploy_module "xavs-common" "xavs-common"
deploy_module "xavs-main" "xavs-main"
deploy_module "xavs-welcome" "xavs-welcome"

# Create XAVS directories on server
echo "📁 Creating XAVS system directories..."
ssh $SERVER "mkdir -p /etc/xavs /var/log/xavs /etc/xavs/inventory /etc/xavs/backups"
ssh $SERVER "touch /var/log/xavs/audit.log"
ssh $SERVER "chmod 755 /etc/xavs /var/log/xavs"
ssh $SERVER "chmod 644 /var/log/xavs/audit.log"

# Restart Cockpit to reload modules
echo "🔄 Restarting Cockpit service..."
ssh $SERVER "systemctl restart cockpit"

echo ""
echo "🎉 XAVS Platform deployment completed!"
echo "Access your XAVS platform at: https://192.168.0.25:9090"
echo ""
echo "📋 Deployment Summary:"
echo "- XAVS Common: Centralized state management and module loader"
echo "- XAVS Main: Main application entry point"
echo "- XAVS Welcome: Welcome and deployment mode selection"
echo "- System directories created for state and audit logging"
echo ""
echo "🔧 Next Steps:"
echo "1. Open Cockpit web interface"
echo "2. Navigate to XAVS Platform"
echo "3. Follow the deployment wizard"