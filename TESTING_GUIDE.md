# Step-by-Step Testing Guide for Network Configuration Preservation

## Prerequisites
- Cockpit XAVS Networking module running
- Access to the web UI and terminal/SSH
- At least 2 network interfaces (eno3, eno4) for VLAN testing

## Test Setup

### 1. Initial Configuration Setup
Through Cockpit UI, set up:
```
eno3.1199: IP=192.168.0.199/24, MTU=1500
eno4.1199: IP=192.168.0.198/24, MTU=9000
```

### 2. Verify Initial State
```bash
# Check netplan config
cat /etc/netplan/80-cockpit-interfaces.yaml

# Check active interfaces
ifconfig eno3.1199
ifconfig eno4.1199
```

## Test Cases

### Test Case 1: IP Preservation During MTU Change
**Objective**: Verify that changing MTU on one interface doesn't affect IP on another

**Steps**:
1. Note current state: eno3.1199 (IP: 192.168.0.199, MTU: 1500), eno4.1199 (IP: 192.168.0.198, MTU: 9000)
2. Through Cockpit UI: Change MTU on eno3.1199 from 1500 to 1600
3. Verify results:
   ```bash
   # Should show eno3.1199 with MTU 1600, IP preserved
   ifconfig eno3.1199
   # Should show eno4.1199 unchanged (IP: 192.168.0.198, MTU: 9000)
   ifconfig eno4.1199
   ```

**Expected Result**: ✅ eno4.1199 keeps IP and MTU, eno3.1199 has new MTU but same IP

### Test Case 2: MTU Preservation During IP Change
**Objective**: Verify that changing IP on one interface doesn't affect MTU on another

**Steps**:
1. Through Cockpit UI: Change IP on eno4.1199 from 192.168.0.198 to 192.168.0.197
2. Verify results:
   ```bash
   ifconfig eno3.1199  # Should keep MTU 1600 and IP 192.168.0.199
   ifconfig eno4.1199  # Should have new IP but keep MTU 9000
   ```

**Expected Result**: ✅ Both interfaces preserve MTU, only target IP changes

### Test Case 3: VLAN Property Preservation
**Objective**: Verify VLAN ID and link properties are preserved during unrelated changes

**Steps**:
1. Check current VLAN properties:
   ```bash
   grep -A 5 "eno3.1199:" /etc/netplan/80-cockpit-interfaces.yaml
   grep -A 5 "eno4.1199:" /etc/netplan/80-cockpit-interfaces.yaml
   ```
2. Through Cockpit UI: Add a new VLAN (e.g., eno3.1201)
3. Verify existing VLANs preserved:
   ```bash
   # Should still show id: 1199, link: eno3/eno4
   grep -A 5 "eno3.1199:" /etc/netplan/80-cockpit-interfaces.yaml
   grep -A 5 "eno4.1199:" /etc/netplan/80-cockpit-interfaces.yaml
   ```

**Expected Result**: ✅ Existing VLAN properties (id, link) preserved

### Test Case 4: Bridge Operation Preservation
**Objective**: Verify VLAN properties preserved during bridge operations

**Steps**:
1. Through Cockpit UI: Create a bridge (any configuration)
2. Verify VLAN interfaces unaffected:
   ```bash
   ifconfig eno3.1199  # Should be unchanged
   ifconfig eno4.1199  # Should be unchanged
   cat /etc/netplan/80-cockpit-interfaces.yaml  # VLANs should be intact
   ```

**Expected Result**: ✅ All VLAN properties and settings preserved

### Test Case 5: Interface Removal Preservation
**Objective**: Verify remaining interfaces preserved when one is removed

**Steps**:
1. Create a temporary VLAN for removal (e.g., eno3.1202)
2. Note current state of main VLANs
3. Through Cockpit UI: Remove the temporary VLAN
4. Verify main VLANs preserved:
   ```bash
   ifconfig eno3.1199  # Should be unchanged
   ifconfig eno4.1199  # Should be unchanged
   ```

**Expected Result**: ✅ Remaining interfaces completely unaffected

## Console Monitoring

### Browser Console Verification
1. Open browser dev tools (F12) on Cockpit networking page
2. Watch for preservation logs during operations:
   - Look for `🔒` messages indicating what's preserved
   - Check for comprehensive property lists
   - Verify no unexpected errors

### System Log Monitoring
```bash
# Monitor system logs during operations
sudo journalctl -f | grep -E "(netplan|cockpit)"

# Check for netplan errors
sudo netplan --debug apply
```

## Automated Verification Scripts

### Quick Test (5 minutes)
```bash
chmod +x quick-preservation-test.sh
./quick-preservation-test.sh
```

### Comprehensive Test (15 minutes)
```bash
chmod +x test-comprehensive-preservation.sh
./test-comprehensive-preservation.sh
```

### Automated Backend Test
```bash
chmod +x automated-preservation-test.sh
sudo ./automated-preservation-test.sh
```

## Success Criteria

### ✅ PASS Indicators:
- All existing IP addresses preserved during unrelated operations
- All MTU settings preserved during unrelated operations
- VLAN properties (id, link) never lost
- Bridge/bond parameters preserved
- DNS and routing settings preserved
- Console shows comprehensive preservation logs

### ❌ FAIL Indicators:
- Any IP address lost during unrelated operations
- MTU reset to default unexpectedly
- VLAN ID or link properties lost (critical failure!)
- Bridge STP or bond parameters reset
- DNS settings disappearing
- Errors in browser console during operations

## Troubleshooting

### If Test Fails:
1. Check browser console for JavaScript errors
2. Verify preservation function exists: `typeof preserveExistingConfiguration`
3. Check netplan file syntax: `sudo netplan --debug apply`
4. Review system logs: `sudo journalctl -u cockpit`
5. Verify file permissions: `ls -la /etc/netplan/`

### Recovery:
```bash
# Restore from backup if needed
sudo cp /tmp/netplan-backup-*/80-cockpit-interfaces.yaml /etc/netplan/
sudo netplan apply
```

## Performance Testing

### Load Test:
1. Create 10+ VLANs with different properties
2. Perform various operations
3. Verify all properties preserved
4. Check operation completion time (should be < 5 seconds)

This comprehensive testing approach ensures the preservation system works reliably across all scenarios and edge cases.
