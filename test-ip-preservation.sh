#!/bin/bash

echo "=== Testing IP Address Preservation ==="
echo "This test verifies that setting an IP on one VLAN doesn't remove IPs from other VLANs"
echo

# First, let's see the current state
echo "1. Current netplan configuration:"
cat /etc/netplan/80-cockpit-interfaces.yaml
echo

echo "2. Current interface status:"
ifconfig eno3.1199 | grep "inet " || echo "eno3.1199 has no IPv4"
ifconfig eno4.1199 | grep "inet " || echo "eno4.1199 has no IPv4"
echo

# Step 3: Add an IP to eno4.1199 (should not affect eno3.1199)
echo "3. Testing: Adding IP 192.168.0.198/24 to eno4.1199..."
echo "   This should NOT remove the existing IP from eno3.1199"
echo

# We'll need to simulate this through the UI or direct API call
echo "Please run this command through the Cockpit UI:"
echo "  Interface: eno4.1199"
echo "  IP: 192.168.0.198/24"
echo
echo "After running the command, check:"
echo "  - eno3.1199 should still have 192.168.0.199/24"
echo "  - eno4.1199 should now have 192.168.0.198/24"
echo "  - Both should be present in the netplan config"
echo

echo "Press Enter to continue and check the results..."
read

echo "4. Results after IP assignment:"
echo "Netplan config:"
cat /etc/netplan/80-cockpit-interfaces.yaml
echo

echo "Interface status:"
ifconfig eno3.1199 | grep "inet " || echo "eno3.1199 has no IPv4 (THIS IS A PROBLEM!)"
ifconfig eno4.1199 | grep "inet " || echo "eno4.1199 has no IPv4"
echo

echo "=== Test Complete ==="
