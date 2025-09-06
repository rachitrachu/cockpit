#!/bin/bash

echo "=== Comprehensive IP Preservation Test ==="
echo "Testing IP preservation across all Cockpit-generated netplan files"
echo

# Function to check IP assignments
check_ips() {
    local description="$1"
    echo "=== $description ==="
    
    echo "Netplan files:"
    for file in /etc/netplan/80-cockpit-interfaces.yaml /etc/netplan/81-cockpit-routes.yaml /etc/netplan/82-cockpit-overrides.yaml /etc/netplan/99-cockpit.yaml; do
        if [ -f "$file" ]; then
            echo "📄 $file exists"
            # Check for IP addresses in the file
            if grep -q "addresses:" "$file" 2>/dev/null; then
                echo "   Contains IP addresses:"
                grep -A 1 "addresses:" "$file" | grep -E "^\s*-\s*[0-9]+\." | sed 's/^/     /'
            else
                echo "   No IP addresses found"
            fi
        else
            echo "📄 $file not found"
        fi
    done
    
    echo
    echo "Active interface IPs:"
    for iface in eno3.1199 eno4.1199; do
        ip_info=$(ifconfig "$iface" 2>/dev/null | grep "inet " | awk '{print $2}' || echo "No IP")
        echo "   $iface: $ip_info"
    done
    echo
}

# Initial state
check_ips "Initial State"

echo "Testing scenarios that could cause IP loss:"
echo

echo "1. Test Case: Add a VLAN"
echo "   This should NOT affect existing IP addresses on other VLANs"
echo "   Please add a new VLAN (e.g., eno3.1200) through the Cockpit UI"
echo "   Press Enter when done..."
read

check_ips "After Adding VLAN"

echo "2. Test Case: Modify Bridge settings"
echo "   This should NOT affect existing IP addresses on VLANs"
echo "   Please create or modify a bridge through the Cockpit UI"
echo "   Press Enter when done..."
read

check_ips "After Bridge Modification"

echo "3. Test Case: Set MTU on an interface"
echo "   This should NOT affect IP addresses on any interface"
echo "   Please change MTU on any interface through the Cockpit UI"
echo "   Press Enter when done..."
read

check_ips "After MTU Change"

echo "4. Test Case: Remove an interface"
echo "   This should NOT affect IP addresses on remaining interfaces"
echo "   Please remove a test interface (not eno3.1199 or eno4.1199!) through the Cockpit UI"
echo "   Press Enter when done..."
read

check_ips "After Interface Removal"

echo "=== Test Results Summary ==="
echo "Check the output above to verify:"
echo "✅ IP addresses were preserved across all operations"
echo "✅ Both eno3.1199 and eno4.1199 maintained their intended configuration"
echo "✅ No unintended IP loss occurred during any operation"
echo
echo "If any IPs were lost unexpectedly, there may be an issue with the preservation logic."

# Final verification
echo "Final verification - compare with ifconfig:"
ifconfig | grep -E "eno[34]\.1199|inet " | grep -v "inet6"
