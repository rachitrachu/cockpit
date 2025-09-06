#!/bin/bash

echo "=== Comprehensive Network Configuration Preservation Test ==="
echo "Testing preservation of ALL network properties: IP, MTU, routes, DNS, VLAN settings, bridge/bond parameters, etc."
echo

# Function to extract all interface properties from netplan files
analyze_interface_config() {
    local description="$1"
    echo "=== $description ==="
    
    for file in /etc/netplan/80-cockpit-interfaces.yaml /etc/netplan/81-cockpit-routes.yaml /etc/netplan/82-cockpit-overrides.yaml /etc/netplan/99-cockpit.yaml; do
        if [ -f "$file" ]; then
            echo "📄 Analyzing $file:"
            
            # Check for various network properties
            echo "   🔍 Properties found:"
            
            # IP configuration
            if grep -q "addresses:" "$file" 2>/dev/null; then
                echo "     • IP Addresses:"
                grep -A 3 "addresses:" "$file" | grep -E "^\s*-\s*[0-9]+\." | sed 's/^/       /'
            fi
            
            # MTU settings
            if grep -q "mtu:" "$file" 2>/dev/null; then
                echo "     • MTU:"
                grep "mtu:" "$file" | sed 's/^/       /'
            fi
            
            # Gateway settings
            if grep -q "gateway[46]:" "$file" 2>/dev/null; then
                echo "     • Gateways:"
                grep -E "gateway[46]:" "$file" | sed 's/^/       /'
            fi
            
            # DNS settings
            if grep -q "nameservers:" "$file" 2>/dev/null; then
                echo "     • DNS:"
                grep -A 5 "nameservers:" "$file" | sed 's/^/       /'
            fi
            
            # VLAN properties
            if grep -q -E "(id:|link:)" "$file" 2>/dev/null; then
                echo "     • VLAN Properties:"
                grep -E "(id:|link:)" "$file" | sed 's/^/       /'
            fi
            
            # Bridge properties
            if grep -q -E "(stp:|forward-delay:|interfaces:)" "$file" 2>/dev/null; then
                echo "     • Bridge Properties:"
                grep -E "(stp:|forward-delay:|interfaces:)" "$file" | sed 's/^/       /'
            fi
            
            # Bond properties
            if grep -q -E "(mode:|primary:|mii-monitor-interval:)" "$file" 2>/dev/null; then
                echo "     • Bond Properties:"
                grep -E "(mode:|primary:|mii-monitor-interval:)" "$file" | sed 's/^/       /'
            fi
            
            # Routes
            if grep -q "routes:" "$file" 2>/dev/null; then
                echo "     • Routes:"
                grep -A 3 "routes:" "$file" | sed 's/^/       /'
            fi
            
            # Optional flag
            if grep -q "optional:" "$file" 2>/dev/null; then
                echo "     • Optional flag:"
                grep "optional:" "$file" | sed 's/^/       /'
            fi
            
            echo
        fi
    done
    
    echo "Active interface status:"
    for iface in eno3.1199 eno4.1199; do
        if ifconfig "$iface" >/dev/null 2>&1; then
            ip_info=$(ifconfig "$iface" | grep "inet " | awk '{print $2}' || echo "No IP")
            mtu_info=$(ifconfig "$iface" | grep "mtu " | sed 's/.*mtu \([0-9]*\).*/\1/' || echo "Unknown")
            echo "   $iface: IP=$ip_info, MTU=$mtu_info"
        else
            echo "   $iface: Interface not found"
        fi
    done
    echo
}

# Function to simulate property setup
setup_test_properties() {
    echo "🔧 Setting up test properties for comprehensive testing..."
    echo "Please ensure the following are configured through Cockpit UI:"
    echo "1. eno3.1199: IP=192.168.0.199/24, MTU=1500"
    echo "2. eno4.1199: IP=192.168.0.198/24, MTU=9000"
    echo "3. Any additional VLANs with custom MTU"
    echo "4. Any bridges with STP enabled"
    echo "5. Any routes or DNS settings"
    echo
    echo "Press Enter when setup is complete..."
    read
}

# Initial setup
setup_test_properties

# Initial state analysis
analyze_interface_config "Initial Configuration State"

echo "🧪 Testing comprehensive preservation across different operations..."
echo

echo "Test 1: Add a new VLAN"
echo "This should preserve ALL existing properties (IP, MTU, routes, DNS, etc.) on other interfaces"
echo "Please add a new VLAN (e.g., eno3.1201) through Cockpit UI"
echo "Press Enter when done..."
read

analyze_interface_config "After Adding New VLAN"

echo "Test 2: Modify MTU on one interface"
echo "This should preserve ALL other properties on all interfaces"
echo "Please change MTU on any interface through Cockpit UI"
echo "Press Enter when done..."
read

analyze_interface_config "After MTU Modification"

echo "Test 3: Add/modify bridge settings"
echo "This should preserve ALL VLAN and ethernet properties"
echo "Please create or modify a bridge through Cockpit UI"
echo "Press Enter when done..."
read

analyze_interface_config "After Bridge Operation"

echo "Test 4: Change IP on one interface"
echo "This should preserve MTU, routes, DNS, and all other properties on all interfaces"
echo "Please change IP on one interface through Cockpit UI"
echo "Press Enter when done..."
read

analyze_interface_config "After IP Change"

echo "Test 5: Remove an interface"
echo "This should preserve ALL properties on remaining interfaces"
echo "Please remove a test interface through Cockpit UI (not the main test interfaces!)"
echo "Press Enter when done..."
read

analyze_interface_config "After Interface Removal"

echo "=== Comprehensive Test Results ==="
echo
echo "✅ PASS criteria:"
echo "  • IP addresses preserved across all operations"
echo "  • MTU settings preserved across all operations"
echo "  • VLAN properties (id, link) preserved"
echo "  • Bridge/Bond parameters preserved"
echo "  • Routes and DNS settings preserved"
echo "  • Optional flags and other settings preserved"
echo
echo "❌ FAIL indicators:"
echo "  • Any property unexpectedly lost during unrelated operations"
echo "  • MTU reset to default when modifying IP"
echo "  • VLAN ID or link properties lost"
echo "  • Bridge STP or other parameters reset"
echo "  • Routes or DNS settings disappeared"
echo
echo "📊 Summary: Check the analysis above to verify all properties were maintained"
echo "   during each operation. The preservation system should protect ALL"
echo "   network configuration, not just IP addresses."
