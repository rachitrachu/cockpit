#!/bin/bash

# Rachit Branding Setup Script
# Applies custom Rachit branding to Cockpit

echo "🎨 Setting up Rachit branding for Cockpit"
echo "========================================"

# Backup existing branding
echo "📋 Backing up existing branding..."
if [ -d "/usr/share/cockpit/branding" ]; then
    cp -r /usr/share/cockpit/branding /usr/share/cockpit/branding.backup.$(date +%Y%m%d)
    echo "✅ Backup created"
else
    echo "ℹ️  No existing branding to backup"
fi

# Create branding directory structure
echo "📁 Creating branding directory..."
mkdir -p /usr/share/cockpit/branding/rachit

# Copy branding files
echo "🎨 Installing Rachit branding files..."
cp branding/rachit/* /usr/share/cockpit/branding/rachit/

# Set proper permissions
echo "🔒 Setting permissions..."
chmod 644 /usr/share/cockpit/branding/rachit/*
chown -R root:root /usr/share/cockpit/branding/rachit/

# Create symlink to make it the default branding
echo "🔗 Setting Rachit as default branding..."
if [ -L "/usr/share/cockpit/branding/default" ]; then
    rm /usr/share/cockpit/branding/default
elif [ -d "/usr/share/cockpit/branding/default" ]; then
    mv /usr/share/cockpit/branding/default /usr/share/cockpit/branding/default.original
fi

ln -s rachit /usr/share/cockpit/branding/default

# Restart Cockpit to apply branding
echo "🔄 Restarting Cockpit..."
systemctl restart cockpit

echo ""
echo "🎉 Rachit branding applied successfully!"
echo "🌐 Refresh your browser to see the new branding"
echo "📍 Access at: https://$(hostname -I | awk '{print $1}'):9090"
echo ""
echo "📋 What changed:"
echo "   - Logo: Custom 'R' logo"
echo "   - Brand: 'Rachit' text branding"
echo "   - Colors: Blue theme (#0066cc)"
echo "   - Header: Custom gradient background"