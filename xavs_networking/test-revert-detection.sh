#!/bin/bash

echo "=== Updated Netplan Try Test - Output Detection ==="
echo "Testing the fixed revert detection logic"
echo

# Show current IP configuration
echo "Current IP configuration:"
ip addr show | grep -E "(inet |UP|DOWN)" | head -10
echo

# Create a test config
echo "Creating test netplan configuration..."
cat > /tmp/test-netplan-revert.yaml << 'EOF'
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: true
      # Test change to trigger netplan try
EOF

# Backup current config
echo "Backing up current config..."
sudo cp /etc/netplan/99-cockpit.yaml /tmp/netplan-backup-$(date +%s).yaml 2>/dev/null || echo "No existing 99-cockpit.yaml"

# Copy test config
echo "Applying test config..."
sudo cp /tmp/test-netplan-revert.yaml /etc/netplan/99-cockpit.yaml

# Test netplan generate
echo "Testing netplan generate..."
sudo netplan generate
echo "Generate result: $?"

# Test netplan try with output capture
echo "Testing netplan try with 3 second timeout..."
echo "Will capture output to detect revert behavior..."
echo

# Use timeout command to ensure it doesn't hang
sudo timeout 10s netplan try --timeout 3 > /tmp/netplan-try-output.txt 2>&1
EXIT_CODE=$?

echo "=== NETPLAN TRY RESULTS ==="
echo "Exit code: $EXIT_CODE"
echo
echo "Output:"
cat /tmp/netplan-try-output.txt
echo
echo "=== OUTPUT ANALYSIS ==="

# Check for revert indicators in output
if grep -q -i "revert" /tmp/netplan-try-output.txt; then
    echo "✅ FOUND: 'revert' text in output - this indicates configuration was reverted"
    echo "🔧 Our updated logic should now properly detect this as a revert scenario"
else
    echo "❌ NOT FOUND: 'revert' text in output"
fi

if grep -q -i "timeout" /tmp/netplan-try-output.txt; then
    echo "✅ FOUND: 'timeout' text in output"
else
    echo "❌ NOT FOUND: 'timeout' text in output"
fi

if grep -q "Changes will revert" /tmp/netplan-try-output.txt; then
    echo "✅ FOUND: 'Changes will revert' message"
else
    echo "❌ NOT FOUND: 'Changes will revert' message"
fi

echo
echo "=== EXPECTED BEHAVIOR ==="
echo "Based on your test output, our JavaScript should now:"
echo "1. Detect 'Reverting' in the netplan try output"
echo "2. Set reverted=true and exitCode=78 in executeCommand"
echo "3. Show 'Configuration was automatically reverted for safety' in UI"
echo "4. NOT treat this as a regular error"

echo
echo "=== Test Complete ==="
