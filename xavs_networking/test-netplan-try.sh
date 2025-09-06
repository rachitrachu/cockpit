#!/bin/bash

# Test script to understand netplan try behavior
# This script will help debug why the 10s timeout/revert isn't working

echo "=== Netplan Try Test Script ==="
echo "This script tests netplan try timeout behavior"
echo

# Show current IP configuration
echo "Current IP configuration:"
ip addr show | grep -E "(inet |UP|DOWN)" | head -20
echo

# Show current netplan files
echo "Current netplan files:"
ls -la /etc/netplan/
echo

# Create a test config that should be safe but different
echo "Creating test netplan configuration..."
cat > /tmp/test-netplan.yaml << 'EOF'
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: true
      # Adding a harmless comment change to trigger reconfig
EOF

# Backup current config
echo "Backing up current config..."
sudo cp /etc/netplan/99-cockpit.yaml /tmp/netplan-backup-$(date +%s).yaml 2>/dev/null || echo "No existing 99-cockpit.yaml"

# Copy test config
echo "Applying test config..."
sudo cp /tmp/test-netplan.yaml /etc/netplan/99-cockpit.yaml

# Test netplan generate
echo "Testing netplan generate..."
sudo netplan generate
echo "Generate result: $?"

# Test netplan try with 5 second timeout
echo "Testing netplan try with 5 second timeout..."
echo "This should timeout and revert if not manually confirmed"
echo "Exit codes: 0=success, 78=timeout/revert, other=error"

# Run netplan try and capture the exit code
sudo netplan try --timeout 5
EXIT_CODE=$?

echo "netplan try exit code: $EXIT_CODE"

case $EXIT_CODE in
    0)
        echo "✓ Configuration was successfully applied"
        ;;
    78)
        echo "⚠ Configuration was reverted due to timeout (this is expected safety behavior)"
        ;;
    *)
        echo "✗ Unexpected error occurred (exit code: $EXIT_CODE)"
        ;;
esac

echo
echo "Final IP configuration:"
ip addr show | grep -E "(inet |UP|DOWN)" | head -20

echo
echo "=== Test Complete ==="
