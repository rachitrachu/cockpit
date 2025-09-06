#!/bin/bash

# Test script to verify VLAN preservation fix
echo "🔧 Testing VLAN preservation fix..."
echo "=================================================="

# First, show current config
echo "📋 Current netplan configuration:"
cat /etc/netplan/*.yaml 2>/dev/null | grep -E "(vlans:|addresses:|dhcp4:|id:|link:)" | head -20

echo ""
echo "🔍 Checking which VLANs have IP addresses currently:"
for config_file in /etc/netplan/*.yaml; do
    if [[ -f "$config_file" ]]; then
        echo "File: $config_file"
        # Extract VLAN configs with addresses
        awk '
        /vlans:/ { in_vlans = 1; next }
        /^[a-zA-Z]/ && !/^  / { in_vlans = 0 }
        in_vlans && /^  [^[:space:]]/ { 
            current_vlan = $1
            gsub(/:$/, "", current_vlan)
        }
        in_vlans && /addresses:/ { 
            getline
            while ($0 ~ /^      -/) {
                ip = $2
                gsub(/^\[|\]$/, "", ip)
                gsub(/,$/, "", ip)
                print "  " current_vlan " has IP: " ip
                getline
            }
        }
        ' "$config_file"
    fi
done

echo ""
echo "🧪 Test complete. Now you can test setting an IP on a VLAN and verify others are preserved."
echo ""
echo "To test manually:"
echo "1. Note the IP addresses shown above"
echo "2. Set a new IP on one VLAN via the UI"
echo "3. Run this script again to see if other VLANs kept their IPs"
echo "4. Check browser console for preservation debug messages"
