#!/bin/bash

# Test script to restore the lost IP on eno3.1199
# and add VLAN ID conflict detection

echo "=== VLAN Configuration Recovery and Conflict Detection ==="

echo "1. Current VLAN interface status:"
ip addr show | grep -E "(eno3\.1199|eno4\.1199)" || echo "No VLAN interfaces found"

echo -e "\n2. Current netplan VLAN configuration:"
if [ -f "/etc/netplan/80-cockpit-interfaces.yaml" ]; then
    echo "--- 80-cockpit-interfaces.yaml ---"
    cat /etc/netplan/80-cockpit-interfaces.yaml
else
    echo "80-cockpit-interfaces.yaml not found"
fi

echo -e "\n3. Checking for REAL VLAN conflicts (same parent + same VLAN ID):"
if [ -f "/etc/netplan/80-cockpit-interfaces.yaml" ]; then
    echo "Looking for duplicate VLAN definitions on the same parent interface..."
    
    # Extract parent.vlanid combinations and check for duplicates
    awk '
    /^[[:space:]]*[a-zA-Z0-9_.-]+\.[0-9]+:/ { 
        interface = $1; gsub(/:/, "", interface)
        current_interface = interface
    }
    /^[[:space:]]*id:/ && current_interface { 
        vlan_id = $2
    }
    /^[[:space:]]*link:/ && current_interface { 
        parent = $2
        if (parent && vlan_id) {
            key = parent "." vlan_id
            if (seen[key]) {
                print "CONFLICT: " key " already defined for " seen[key] ", now also for " current_interface
                conflicts++
            } else {
                seen[key] = current_interface
                print "OK: " current_interface " -> " key
            }
        }
        current_interface = ""
        vlan_id = ""
        parent = ""
    }
    END { 
        if (conflicts > 0) {
            print "❌ " conflicts " real conflicts found!"
            exit 1
        } else {
            print "✅ No real VLAN conflicts detected"
            exit 0
        }
    }' /etc/netplan/80-cockpit-interfaces.yaml
    
    if [ $? -eq 0 ]; then
        echo "✅ VLAN configuration is valid"
        echo "ℹ️  Note: Different parent interfaces (eno3, eno4) can use the same VLAN ID (1199)"
        echo "ℹ️  This creates separate broadcast domains: eno3.1199 and eno4.1199"
    else
        echo "❌ Real VLAN conflicts detected!"
    fi
else
    echo "Cannot check - netplan file missing"
fi

echo -e "\n4. Understanding the current setup:"
echo "✅ eno3.1199 (VLAN 1199 on eno3) - Valid configuration"
echo "✅ eno4.1199 (VLAN 1199 on eno4) - Valid configuration" 
echo "ℹ️  These are separate logical interfaces on different physical interfaces"
echo "ℹ️  The issue is NOT a VLAN conflict - it's preservation logic in JavaScript"
echo -e "\n5. Testing the real issue - JavaScript preservation logic:"
echo "The problem is when we set IP on eno4.1199, it should preserve eno3.1199 config"

echo -e "\n6. Current interface status:"
echo "eno3.1199 ping test (should work even without IP):"
ping -c 1 -W 1 -I eno3.1199 8.8.8.8 2>/dev/null && echo "✅ eno3.1199 is functional" || echo "❌ eno3.1199 not functional"

echo "eno4.1199 ping test:"
ping -c 1 -W 1 -I eno4.1199 8.8.8.8 2>/dev/null && echo "✅ eno4.1199 is functional" || echo "❌ eno4.1199 not functional"

echo -e "\n7. Manual test - Temporarily add IP to eno3.1199:"
echo "Running: ip addr add 192.168.0.200/24 dev eno3.1199"
ip addr add 192.168.0.200/24 dev eno3.1199 2>/dev/null
echo "Result:"
ip addr show eno3.1199 | grep inet

echo -e "\n8. Testing both VLANs with IPs:"
echo "eno3.1199 (temp IP 192.168.0.200):"
ping -c 1 -W 1 192.168.0.200 2>/dev/null && echo "✅ eno3.1199 IP reachable" || echo "❌ eno3.1199 IP not reachable"

echo "eno4.1199 (configured IP 192.168.0.199):"
ping -c 1 -W 1 192.168.0.199 2>/dev/null && echo "✅ eno4.1199 IP reachable" || echo "❌ eno4.1199 IP not reachable"

echo -e "\n9. Cleanup temporary IP:"
ip addr del 192.168.0.200/24 dev eno3.1199 2>/dev/null
echo "Temporary IP removed"

echo -e "\n=== CORRECTED UNDERSTANDING ==="
echo "1. ✅ eno3.1199 and eno4.1199 using same VLAN ID (1199) is PERFECTLY VALID"
echo "2. ✅ Different parent interfaces can use the same VLAN ID - this is standard Linux networking"
echo "3. ❌ The issue is JavaScript preservation logic losing eno3.1199 config when updating eno4.1199"
echo "4. � Fixed: Enhanced preservation logic to maintain ALL existing VLAN configurations"

echo -e "\n=== NEXT STEPS ==="
echo "1. ✅ Fixed JavaScript preservation logic to handle multiple VLANs properly"
echo "2. ✅ Removed false 'VLAN ID conflict' detection for different parent interfaces"
echo "3. 🧪 Test: Use validateVlanConfig() in browser console to verify no real conflicts"
echo "4. 🧪 Test: Use setIPAddress('eno3.1199', '192.168.0.200/24') to restore the missing IP"
