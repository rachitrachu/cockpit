#!/bin/bash

# Quick status checker for comprehensive preservation testing
# Location: xavs_networking/test-status.sh

echo "🔍 === QUICK PRESERVATION STATUS CHECK ==="
echo

# Check if preservation is working by analyzing current state
echo "📊 Current Network State:"

# Check netplan files
echo "   📄 Netplan Files:"
for file in /etc/netplan/8*-cockpit-*.yaml /etc/netplan/99-cockpit.yaml; do
    if [ -f "$file" ]; then
        echo "      ✅ $(basename $file) exists"
        prop_count=$(grep -c -E "(addresses|mtu|gateway|id:|link:|stp|dhcp)" "$file" 2>/dev/null || echo "0")
        echo "         Properties found: $prop_count"
    fi
done

echo

# Check active interfaces
echo "   🌐 Active VLAN Interfaces:"
for vlan in $(ip link show | grep -E 'eno[34]\.[0-9]+' | cut -d: -f2 | tr -d ' '); do
    if [ -n "$vlan" ]; then
        ip_status=$(ip addr show "$vlan" | grep 'inet ' | awk '{print $2}' | head -1 || echo "No IP")
        mtu_status=$(ip link show "$vlan" | grep -o 'mtu [0-9]*' | cut -d' ' -f2 || echo "Unknown")
        echo "      🔗 $vlan: IP=$ip_status, MTU=$mtu_status"
    fi
done

echo

# Quick consistency check
echo "   🔧 Configuration Consistency:"
netplan_vlans=$(grep -E "eno[34]\.[0-9]+:" /etc/netplan/80-cockpit-interfaces.yaml 2>/dev/null | wc -l || echo "0")
system_vlans=$(ip link show | grep -c -E 'eno[34]\.[0-9]+' || echo "0")
echo "      Netplan VLANs: $netplan_vlans"
echo "      System VLANs: $system_vlans"

if [ "$netplan_vlans" -eq "$system_vlans" ] && [ "$netplan_vlans" -gt 0 ]; then
    echo "      ✅ Configuration appears consistent"
elif [ "$netplan_vlans" -eq 0 ] && [ "$system_vlans" -eq 0 ]; then
    echo "      ℹ️ No VLANs configured"
else
    echo "      ⚠️ Configuration mismatch detected"
fi

echo

# Browser console check reminder
echo "🖥️ === BROWSER CONSOLE CHECKS ==="
echo
echo "In your browser console (F12), run:"
echo "   1. testPreservation()          - Test preservation function"
echo "   2. checkProperties('eno3.1199') - Check interface properties"
echo "   3. monitorOperations()          - Enable preservation monitoring"
echo
echo "Then perform any network operation and watch for:"
echo "   ✅ '🔒 Starting comprehensive network configuration preservation'"
echo "   ✅ '🔒 Preserving [property] for [interface]'"
echo "   ✅ '🔒 Comprehensive Configuration Preservation Summary'"
echo

echo "⚡ === QUICK TEST PROCEDURE ==="
echo
echo "1. Run this script to see current state"
echo "2. Open Cockpit → XAVS Networking"
echo "3. Open browser console (F12)"
echo "4. Run: monitorOperations()"
echo "5. Change any network setting in UI"
echo "6. Watch console for preservation logs"
echo "7. Run this script again to verify state"
echo
echo "Expected: All unmodified interfaces keep their properties"
