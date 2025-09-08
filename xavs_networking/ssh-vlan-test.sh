#!/bin/bash
# Remote VLAN Testing Script for SSH
# Run this on your Linux server to test VLAN configurations

echo "🔗 SSH-Based VLAN Testing Suite"
echo "==============================="

# Function to check current VLAN state
check_vlan_state() {
    echo "📊 Current VLAN State:"
    echo "---------------------"
    
    # Show all network interfaces
    echo "All interfaces:"
    ip link show | grep -E "^\d+:|@" | head -20
    
    echo
    echo "VLAN interfaces specifically:"
    ip link show | grep -E "\." | grep -v "lo\|docker"
    
    echo
    echo "IP addresses on VLANs:"
    ip addr show | grep -A2 -B1 "inet.*\." | grep -E "^\d+:|inet "
    
    echo
    echo "Netplan VLAN config:"
    find /etc/netplan -name "*.yaml" -exec grep -l "vlans:" {} \; 2>/dev/null | head -3 | while read file; do
        echo "File: $file"
        grep -A10 "vlans:" "$file" 2>/dev/null | head -15
    done
}

# Function to monitor VLAN changes in real-time
monitor_vlan_changes() {
    echo "🔍 Monitoring VLAN changes..."
    echo "Press Ctrl+C to stop monitoring"
    
    # Create baseline
    ip link show > /tmp/vlan_baseline_links.txt
    ip addr show > /tmp/vlan_baseline_addrs.txt
    
    while true; do
        sleep 2
        
        # Check for link changes
        if ! diff -q /tmp/vlan_baseline_links.txt <(ip link show) >/dev/null 2>&1; then
            echo "🔄 $(date): VLAN link changes detected!"
            diff /tmp/vlan_baseline_links.txt <(ip link show) | head -10
            ip link show > /tmp/vlan_baseline_links.txt
        fi
        
        # Check for address changes
        if ! diff -q /tmp/vlan_baseline_addrs.txt <(ip addr show) >/dev/null 2>&1; then
            echo "🔄 $(date): VLAN address changes detected!"
            diff /tmp/vlan_baseline_addrs.txt <(ip addr show) | grep -E "^\+|^\-" | head -10
            ip addr show > /tmp/vlan_baseline_addrs.txt
        fi
    done
}

# Function to create test VLANs for debugging
create_test_vlans() {
    echo "🧪 Creating test VLANs for debugging..."
    
    # Find primary interface
    PRIMARY_IF=$(ip route | grep default | head -1 | awk '{print $5}')
    echo "Primary interface: $PRIMARY_IF"
    
    # Create test netplan config
    cat > /etc/netplan/99-test-vlans.yaml << EOF
network:
  version: 2
  vlans:
    test-vlan10:
      id: 10
      link: $PRIMARY_IF
      addresses:
        - 192.168.10.100/24
    test-vlan20:
      id: 20
      link: $PRIMARY_IF
      addresses:
        - 192.168.20.100/24
    test-vlan30:
      id: 30
      link: $PRIMARY_IF
      addresses:
        - 192.168.30.100/24
EOF
    
    echo "✅ Test VLAN config created at /etc/netplan/99-test-vlans.yaml"
    echo "Run 'netplan apply' to activate test VLANs"
}

# Function to backup and restore configs
backup_netplan() {
    BACKUP_DIR="/tmp/netplan-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    cp -r /etc/netplan/* "$BACKUP_DIR/"
    echo "✅ Netplan backup created: $BACKUP_DIR"
    echo "$BACKUP_DIR" > /tmp/latest-netplan-backup.txt
}

restore_netplan() {
    if [ -f /tmp/latest-netplan-backup.txt ]; then
        BACKUP_DIR=$(cat /tmp/latest-netplan-backup.txt)
        if [ -d "$BACKUP_DIR" ]; then
            echo "🔄 Restoring from: $BACKUP_DIR"
            rm -rf /etc/netplan/*
            cp -r "$BACKUP_DIR"/* /etc/netplan/
            netplan apply
            echo "✅ Netplan restored"
        fi
    fi
}

# Main menu
case "${1:-menu}" in
    "check")
        check_vlan_state
        ;;
    "monitor")
        monitor_vlan_changes
        ;;
    "test-create")
        backup_netplan
        create_test_vlans
        ;;
    "backup")
        backup_netplan
        ;;
    "restore")
        restore_netplan
        ;;
    "menu"|*)
        echo "Usage: $0 [command]"
        echo "Commands:"
        echo "  check      - Check current VLAN state"
        echo "  monitor    - Monitor VLAN changes in real-time"
        echo "  test-create- Create test VLANs for debugging"
        echo "  backup     - Backup current netplan config"
        echo "  restore    - Restore last backup"
        echo
        echo "Example SSH testing workflow:"
        echo "1. ssh user@your-server"
        echo "2. ./ssh-vlan-test.sh backup"
        echo "3. ./ssh-vlan-test.sh check"
        echo "4. [Edit VLAN in cockpit web interface]"
        echo "5. ./ssh-vlan-test.sh check"
        echo "6. ./ssh-vlan-test.sh restore  # if needed"
        ;;
esac
