#!/bin/bash

echo "=== Netplan Version and Behavior Analysis ==="

# Check netplan version
echo "Netplan version:"
netplan --version
echo

# Check systemd version (affects netplan behavior)
echo "Systemd version:"
systemctl --version | head -1
echo

# Test different timeout scenarios to understand the behavior
echo "Testing netplan try with different approaches..."

# Create a test config
cat > /tmp/test-netplan-behavior.yaml << 'EOF'
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: true
      # Test change
EOF

# Backup and apply test config
sudo cp /etc/netplan/99-cockpit.yaml /tmp/netplan-backup-$(date +%s).yaml 2>/dev/null || echo "No existing 99-cockpit.yaml"
sudo cp /tmp/test-netplan-behavior.yaml /etc/netplan/99-cockpit.yaml

echo "Test 1: netplan try with timeout and output capture"
# Capture both stdout and stderr, and the exit code
sudo timeout 7s netplan try --timeout 3 > /tmp/netplan-output.txt 2>&1
EXIT_CODE=$?
echo "Exit code: $EXIT_CODE"
echo "Output:"
cat /tmp/netplan-output.txt
echo
echo "---"

echo "Test 2: Check if 'Reverting' appears in output"
if grep -q "Reverting" /tmp/netplan-output.txt; then
    echo "✓ Found 'Reverting' in output - configuration was reverted"
else
    echo "✗ No 'Reverting' found in output"
fi
echo

echo "Test 3: Check for timeout-related messages"
if grep -q -i "timeout\|revert" /tmp/netplan-output.txt; then
    echo "✓ Found timeout/revert keywords in output"
else
    echo "✗ No timeout/revert keywords found"
fi
echo

echo "=== Analysis Complete ==="
