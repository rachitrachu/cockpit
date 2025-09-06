#!/bin/bash

echo "=== Quick Configuration Preservation Test ==="
echo "This is a fast 5-minute test to verify the preservation system works"
echo

# Function to show current state
show_state() {
    local step="$1"
    echo "--- $step ---"
    echo "Netplan config:"
    if [ -f /etc/netplan/80-cockpit-interfaces.yaml ]; then
        cat /etc/netplan/80-cockpit-interfaces.yaml | grep -E "(eno[34]\.1199|addresses|mtu):" | head -10
    fi
    echo
    echo "Active interfaces:"
    ifconfig | grep -E "eno[34]\.1199" -A 1 | grep -E "(eno[34]\.1199|inet |mtu)" | tr '\n' ' ' | sed 's/eno/\neno/g'
    echo
    echo "Press Enter to continue..."
    read
}

echo "🔧 SETUP: Please configure through Cockpit UI:"
echo "1. Set eno3.1199 IP to 192.168.0.199/24 and MTU to 1500"
echo "2. Set eno4.1199 IP to 192.168.0.198/24 and MTU to 9000"
echo
show_state "Initial Setup"

echo "🧪 TEST 1: Change MTU on eno3.1199 to 1600"
echo "Expected: eno4.1199 should keep its IP (192.168.0.198) and MTU (9000)"
show_state "After MTU Change"

echo "🧪 TEST 2: Add a new VLAN (e.g., eno3.1201)"
echo "Expected: Both eno3.1199 and eno4.1199 should keep ALL their settings"
show_state "After Adding VLAN"

echo "🧪 TEST 3: Change IP on eno4.1199 to 192.168.0.197/24"
echo "Expected: eno3.1199 should keep its IP and MTU, eno4.1199 should keep its MTU"
show_state "Final State"

echo "✅ PASS if:"
echo "  • All interfaces kept their properties during unrelated changes"
echo "  • No unexpected property loss occurred"
echo "❌ FAIL if:"
echo "  • Any IP or MTU was lost during operations on other interfaces"
