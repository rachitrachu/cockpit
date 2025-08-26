#!/bin/bash

echo "?? Testing Netplan File Writing..."

# Check if the netplan file exists
if [ -f "/etc/netplan/99-cockpit.yaml" ]; then
    echo "? Netplan file exists at /etc/netplan/99-cockpit.yaml"
    echo "?? Current contents:"
    cat /etc/netplan/99-cockpit.yaml
    echo ""
    echo "?? File permissions:"
    ls -la /etc/netplan/99-cockpit.yaml
else
    echo "? Netplan file does not exist at /etc/netplan/99-cockpit.yaml"
    echo "?? Checking what files exist in /etc/netplan/:"
    ls -la /etc/netplan/
fi

echo ""
echo "?? Testing Python script directly..."

# Test the Python script with a sample IP configuration
TEST_JSON='{"action": "set_ip", "config": {"name": "eth0", "static_ip": "192.168.1.100/24", "gateway": "192.168.1.1", "dns": "8.8.8.8,1.1.1.1"}}'

echo "?? Sending test JSON:"
echo "$TEST_JSON"
echo ""

echo "?? Running netplan_manager.py..."
cd /usr/share/cockpit/xos-networking
echo "$TEST_JSON" | python3 netplan_manager.py

echo ""
echo "? Test completed. Check above for any errors."