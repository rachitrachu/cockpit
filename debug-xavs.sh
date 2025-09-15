#!/bin/bash

# XAVS Platform Debug Script
# Run this on the server to check for common issues

echo "🔍 XAVS Platform Debug Information"
echo "=================================="

# Check if modules exist
echo "📁 Checking XAVS modules..."
for module in xavs-main xavs-common xavs-welcome; do
    if [ -d "/usr/share/cockpit/$module" ]; then
        echo "✅ $module: EXISTS"
        echo "   Files: $(ls -1 /usr/share/cockpit/$module | wc -l)"
    else
        echo "❌ $module: MISSING"
    fi
done

# Check manifest files
echo ""
echo "📋 Checking manifest files..."
if [ -f "/usr/share/cockpit/xavs-main/manifest.json" ]; then
    echo "✅ xavs-main manifest.json exists"
    echo "   Content preview:"
    head -10 /usr/share/cockpit/xavs-main/manifest.json | sed 's/^/     /'
else
    echo "❌ xavs-main manifest.json MISSING"
fi

# Check file permissions
echo ""
echo "🔒 Checking file permissions..."
ls -la /usr/share/cockpit/xavs-main/ | head -5

# Check Cockpit service
echo ""
echo "🔧 Checking Cockpit service..."
systemctl is-active cockpit
systemctl is-enabled cockpit

# Check for JavaScript errors in logs
echo ""
echo "📝 Recent Cockpit logs (last 20 lines)..."
journalctl -u cockpit --no-pager -n 20 | grep -E "(error|Error|ERROR|warning|Warning)" || echo "No recent errors found"

# Check if XAVS directories exist
echo ""
echo "📁 Checking XAVS system directories..."
for dir in "/etc/xavs" "/var/log/xavs"; do
    if [ -d "$dir" ]; then
        echo "✅ $dir: EXISTS ($(ls -la $dir | wc -l) items)"
    else
        echo "❌ $dir: MISSING"
    fi
done

# Check Cockpit accessibility
echo ""
echo "🌐 Checking Cockpit accessibility..."
if ss -tlnp | grep -q ":9090"; then
    echo "✅ Cockpit is listening on port 9090"
else
    echo "❌ Cockpit is NOT listening on port 9090"
fi

# List all Cockpit modules
echo ""
echo "📦 All available Cockpit modules:"
ls -1 /usr/share/cockpit/ | grep -v "^base1$" | grep -v "^static$" | sort

echo ""
echo "🔗 Access XAVS at: https://$(hostname -I | awk '{print $1}'):9090"
echo "   Look for 'XAVS OpenStack Platform' in the tools menu"