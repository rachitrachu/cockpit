#!/bin/bash

echo "=== Comprehensive Configuration Preservation Test ==="
echo "Test using system outputs and browser console verification"
echo "Location: xavs_networking directory"
echo

# Function to check current configuration
check_config() {
    local step="$1"
    echo "📊 === $step ==="
    
    echo "🔍 Current netplan configuration:"
    if [ -f "/etc/netplan/80-cockpit-interfaces.yaml" ]; then
        echo "   📄 Main interfaces file:"
        cat /etc/netplan/80-cockpit-interfaces.yaml | grep -E "(addresses|mtu|gateway|id:|link:|stp|dhcp)" | sed 's/^/      /'
    else
        echo "   📄 No cockpit interfaces file found"
    fi
    
    echo
    echo "🌐 Current interface status:"
    for iface in eno3.1199 eno4.1199; do
        if ip addr show "$iface" >/dev/null 2>&1; then
            ip_info=$(ip addr show "$iface" | grep 'inet ' | awk '{print $2}' | head -1 || echo "No IP")
            mtu_info=$(ip link show "$iface" | grep -o 'mtu [0-9]*' | cut -d' ' -f2 || echo "Unknown")
            state_info=$(ip link show "$iface" | grep -o 'state [A-Z]*' | cut -d' ' -f2 || echo "Unknown")
            echo "   🔗 $iface: IP=$ip_info, MTU=$mtu_info, State=$state_info"
        else
            echo "   🔗 $iface: Interface not found"
        fi
    done
    echo
}

# Initial state
check_config "Initial State"

echo "🧪 === TEST INSTRUCTIONS ==="
echo
echo "Open Cockpit in your browser and follow these steps:"
echo "Each step tests if the preservation system protects ALL properties"
echo

echo "📋 Test 1: IP Address Change"
echo "   1. Open XAVS Networking in browser"
echo "   2. Change IP on eno3.1199 to something different (e.g., 192.168.0.200/24)"
echo "   3. Check browser console for preservation logs"
echo "   4. Look for: '🔒 Preserving ... for eno4.1199'"
echo "   5. Press Enter here when done..."
read

check_config "After IP Change Test"

echo "📋 Test 2: MTU Modification"
echo "   1. In Cockpit, modify MTU on any interface"
echo "   2. Check browser console for: '🔒 Comprehensive Configuration Preservation Summary'"
echo "   3. Verify it shows preserved properties for other interfaces"
echo "   4. Press Enter here when done..."
read

check_config "After MTU Change Test"

echo "📋 Test 3: VLAN Creation"
echo "   1. In Cockpit, create a new VLAN (e.g., eno3.1201)"
echo "   2. Check browser console for preservation logs"
echo "   3. Look for: 'Properties preserved: addresses, mtu, id, link' etc."
echo "   4. Press Enter here when done..."
read

check_config "After VLAN Creation Test"

echo "📋 Test 4: Bridge Operations"
echo "   1. In Cockpit, create or modify a bridge"
echo "   2. Check browser console for comprehensive preservation logs"
echo "   3. Verify VLAN properties are preserved"
echo "   4. Press Enter here when done..."
read

check_config "After Bridge Operation Test"

echo "🎯 === VERIFICATION CHECKLIST ==="
echo
echo "✅ What to look for in browser console:"
echo "   • '🔒 Starting comprehensive network configuration preservation'"
echo "   • '🔒 Preserving [property] for [interface]: [value]'"
echo "   • '🔒 Comprehensive Configuration Preservation Summary'"
echo "   • 'Properties preserved: addresses, mtu, gateway4, id, link' etc."
echo "   • '✅ Network configuration preserved'"
echo
echo "✅ What to verify in system output above:"
echo "   • IP addresses maintained on unmodified interfaces"
echo "   • MTU values preserved on unmodified interfaces"
echo "   • VLAN properties (id, link) intact"
echo "   • Interface states remain UP"
echo
echo "❌ Signs of problems:"
echo "   • IP addresses lost from unmodified interfaces"
echo "   • MTU reset to default values"
echo "   • VLAN interfaces showing 'Interface not found'"
echo "   • Missing preservation logs in browser console"
echo

echo "🔍 === DETAILED VERIFICATION ==="
echo
echo "Run these commands to verify preservation worked:"
echo

echo "# Check for any IP loss:"
echo "ip addr show | grep -E 'eno[34]\.1199.*inet'"
ip addr show | grep -E 'eno[34]\.1199.*inet' || echo "No VLAN IPs found - this might indicate a problem!"

echo
echo "# Check MTU preservation:"
echo "ip link show | grep -E 'eno[34]\.1199.*mtu' | grep -o 'mtu [0-9]*'"
ip link show | grep -E 'eno[34]\.1199.*mtu' | grep -o 'mtu [0-9]*' || echo "No VLAN interfaces found!"

echo
echo "# Check netplan config completeness:"
echo "grep -E '(eno3\.1199|eno4\.1199)' /etc/netplan/80-cockpit-interfaces.yaml -A 5 -B 1"
if [ -f "/etc/netplan/80-cockpit-interfaces.yaml" ]; then
    grep -E '(eno3\.1199|eno4\.1199)' /etc/netplan/80-cockpit-interfaces.yaml -A 5 -B 1 || echo "VLANs not found in netplan config!"
else
    echo "Netplan config file not found!"
fi

echo
echo "🏁 === TEST COMPLETE ==="
echo
echo "The comprehensive preservation system should:"
echo "1. ✅ Preserve IP addresses on all unmodified interfaces"
echo "2. ✅ Preserve MTU settings on all unmodified interfaces"  
echo "3. ✅ Preserve VLAN properties (id, link) on all VLANs"
echo "4. ✅ Preserve gateway, DNS, and routing settings"
echo "5. ✅ Show detailed preservation logs in browser console"
echo "6. ✅ Work across all operations (IP change, MTU, VLAN creation, bridge ops)"
echo
echo "If any of the above failed, there may be an issue with the preservation logic."
