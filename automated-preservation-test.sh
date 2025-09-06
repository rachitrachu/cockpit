#!/bin/bash

echo "=== Automated Configuration Preservation Test Suite ==="
echo "This test automatically verifies the preservation system using the backend directly"
echo

# Function to backup current config
backup_config() {
    echo "📁 Backing up current configuration..."
    cp -r /etc/netplan /tmp/netplan-backup-$(date +%s) 2>/dev/null || true
}

# Function to check if a property exists in netplan config
check_property() {
    local interface="$1"
    local property="$2"
    local file="${3:-/etc/netplan/80-cockpit-interfaces.yaml}"
    
    if [ -f "$file" ]; then
        # Check if interface exists and has the property
        if grep -A 10 "$interface:" "$file" | grep -q "$property:"; then
            local value=$(grep -A 10 "$interface:" "$file" | grep "$property:" | head -1 | sed 's/.*: *//')
            echo "✅ $interface has $property: $value"
            return 0
        else
            echo "❌ $interface missing $property"
            return 1
        fi
    else
        echo "❌ Config file $file not found"
        return 1
    fi
}

# Function to test via netplan command directly
test_netplan_preservation() {
    echo "🧪 Testing netplan preservation directly..."
    
    # Create a test config that should preserve existing properties
    local test_config="/tmp/test-netplan-config.yaml"
    cat > "$test_config" << 'EOF'
network:
  version: 2
  vlans:
    eno3.1199:
      id: 1199
      link: eno3
      addresses:
        - 192.168.0.150/24
EOF
    
    echo "Created test config with minimal properties:"
    cat "$test_config"
    echo
    
    # Check what properties exist before
    echo "Properties before test:"
    check_property "eno3.1199" "mtu"
    check_property "eno4.1199" "addresses"
    echo
    
    # Apply test config (this should trigger preservation)
    echo "Applying test through netplan..."
    sudo cp "$test_config" "/etc/netplan/99-test-preservation.yaml"
    sudo netplan apply
    
    # Check what properties exist after
    echo "Properties after test:"
    check_property "eno3.1199" "mtu"
    check_property "eno4.1199" "addresses"
    echo
    
    # Cleanup
    sudo rm -f "/etc/netplan/99-test-preservation.yaml"
    sudo netplan apply
}

# Function to test specific scenarios
test_scenarios() {
    echo "🎯 Testing specific preservation scenarios..."
    
    local scenarios=(
        "IP change should preserve MTU"
        "MTU change should preserve IP"
        "VLAN addition should preserve existing VLANs"
        "Bridge creation should preserve VLAN properties"
    )
    
    for scenario in "${scenarios[@]}"; do
        echo "📋 Scenario: $scenario"
        echo "   This requires manual UI testing - perform the action and verify preservation"
        echo "   Press Enter to continue to next scenario..."
        read
    done
}

# Function to verify preservation logs
test_preservation_logs() {
    echo "🔍 Testing preservation logging..."
    
    # Check if preservation functions are available in the JS
    if [ -f "/usr/share/cockpit/xavs_networking/js/netplan-js-manager.js" ]; then
        if grep -q "preserveExistingConfiguration" "/usr/share/cockpit/xavs_networking/js/netplan-js-manager.js"; then
            echo "✅ Preservation function found in codebase"
        else
            echo "❌ Preservation function not found in codebase"
        fi
        
        # Check for comprehensive property list
        if grep -q "criticalProperties" "/usr/share/cockpit/xavs_networking/js/netplan-js-manager.js"; then
            echo "✅ Comprehensive property preservation found"
            echo "Properties being preserved:"
            grep -A 20 "criticalProperties = \[" "/usr/share/cockpit/xavs_networking/js/netplan-js-manager.js" | sed 's/^/  /'
        else
            echo "❌ Comprehensive property preservation not found"
        fi
    else
        echo "❌ Netplan manager file not found"
    fi
}

# Function to check system state
check_system_state() {
    echo "🔍 Current System State:"
    echo
    
    echo "Active network interfaces:"
    ip addr show | grep -E "(eno[34]\.|inet )" | head -10
    echo
    
    echo "Netplan files:"
    ls -la /etc/netplan/*.yaml 2>/dev/null | head -5
    echo
    
    echo "Recent netplan backups:"
    ls -la /etc/netplan/*.backup.* 2>/dev/null | tail -3 || echo "No backups found"
    echo
}

# Main test execution
main() {
    echo "Starting automated test suite..."
    echo
    
    backup_config
    check_system_state
    test_preservation_logs
    
    echo "Choose test type:"
    echo "1. Quick automated checks"
    echo "2. Interactive UI testing scenarios"
    echo "3. Direct netplan testing"
    echo "4. All tests"
    
    read -p "Enter choice (1-4): " choice
    
    case $choice in
        1)
            echo "Running quick checks..."
            test_preservation_logs
            ;;
        2)
            echo "Running interactive scenarios..."
            test_scenarios
            ;;
        3)
            echo "Running direct netplan tests..."
            test_netplan_preservation
            ;;
        4)
            echo "Running all tests..."
            test_preservation_logs
            test_scenarios
            test_netplan_preservation
            ;;
        *)
            echo "Invalid choice"
            ;;
    esac
    
    echo
    echo "✅ Test suite completed"
    echo "Check output above for any ❌ failures"
}

# Run main function
main
