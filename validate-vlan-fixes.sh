#!/bin/bash
# VLAN IP Edit Validation Script
# This script helps validate that the VLAN IP editing fixes are working correctly

echo "🔍 VLAN IP Edit Validation Script"
echo "=================================="

# Function to check VLAN count
check_vlan_count() {
    echo "📊 Checking VLAN count..."
    
    # Count VLANs in netplan
    NETPLAN_VLANS=$(find /etc/netplan -name "*.yaml" -exec grep -l "vlans:" {} \; 2>/dev/null | xargs grep -A 100 "vlans:" 2>/dev/null | grep -E "^\s+[a-zA-Z0-9.-]+:" | wc -l)
    
    # Count VLANs in system
    SYSTEM_VLANS=$(ip link show | grep -E "@|vlan" | grep -E ":\s+[^:]+\." | wc -l)
    
    echo "  - Netplan VLANs: $NETPLAN_VLANS"
    echo "  - System VLANs: $SYSTEM_VLANS"
    
    if [ "$NETPLAN_VLANS" -gt 0 ]; then
        echo "✅ VLANs found in netplan configuration"
    else
        echo "⚠️ No VLANs found in netplan configuration"
    fi
}

# Function to show VLAN details
show_vlan_details() {
    echo "📋 Current VLAN Details:"
    echo "------------------------"
    
    # Show netplan VLANs
    echo "Netplan VLANs:"
    find /etc/netplan -name "*.yaml" -exec grep -l "vlans:" {} \; 2>/dev/null | while read file; do
        echo "  File: $file"
        grep -A 20 "vlans:" "$file" 2>/dev/null | grep -E "^\s+[a-zA-Z0-9.-]+:|id:|link:|addresses:" | sed 's/^/    /'
    done
    
    echo
    echo "System VLANs:"
    ip link show | grep -E ":\s+[^:]+\." | while read line; do
        VLAN=$(echo "$line" | sed -n 's/.*: \([^:@]*\).*/\1/p')
        if [ -n "$VLAN" ]; then
            echo "  $VLAN"
            ip addr show "$VLAN" 2>/dev/null | grep "inet " | sed 's/^/    /'
        fi
    done
}

# Function to backup current configuration
backup_config() {
    BACKUP_DIR="/tmp/vlan_backup_$(date +%Y%m%d_%H%M%S)"
    echo "💾 Creating backup in $BACKUP_DIR..."
    mkdir -p "$BACKUP_DIR"
    cp -r /etc/netplan "$BACKUP_DIR/"
    echo "✅ Backup created: $BACKUP_DIR"
}

# Function to validate netplan syntax
validate_netplan() {
    echo "🔍 Validating netplan syntax..."
    
    if command -v netplan >/dev/null 2>&1; then
        if netplan generate >/dev/null 2>&1; then
            echo "✅ Netplan syntax is valid"
        else
            echo "❌ Netplan syntax errors detected:"
            netplan generate 2>&1 | sed 's/^/  /'
        fi
    else
        echo "⚠️ netplan command not available"
    fi
}

# Function to test VLAN IP edit
test_vlan_edit() {
    echo "🧪 VLAN Edit Test Instructions:"
    echo "------------------------------"
    echo "1. Note the current VLAN count above"
    echo "2. Open cockpit networking interface"
    echo "3. Edit a VLAN IP address"
    echo "4. Run this script again to check if VLAN count changed"
    echo ""
    echo "Expected behavior:"
    echo "  - VLAN count should remain the same"
    echo "  - Only the edited VLAN should have a new IP"
    echo "  - All other VLANs should keep their original IPs"
}

# Main execution
echo "Starting validation..."
echo

backup_config
echo

check_vlan_count
echo

show_vlan_details
echo

validate_netplan
echo

test_vlan_edit

echo
echo "🚀 Validation complete!"
echo "If you see any issues after editing VLAN IPs, run this script again to compare results."
