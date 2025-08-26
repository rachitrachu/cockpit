# XOS Networking VLAN MTU Fix

## Issue Description
The "set MTU not working with VLAN" issue was caused by several problems in the VLAN MTU handling:

1. **Missing immediate MTU application**: The system only wrote MTU to netplan but didn't apply it immediately
2. **VLAN interface timing issues**: MTU was being set before VLAN interfaces were properly created
3. **Incomplete error handling**: No proper handling for cases where VLAN interfaces don't exist yet
4. **Missing validation**: No checks for parent interface MTU compatibility

## Fixes Implemented

### 1. Enhanced Backend (netplan_manager.py)

#### Added immediate MTU application functions:
- `set_interface_mtu_immediately()`: Applies MTU via `ip link set dev <interface> mtu <value>`
- `ensure_vlan_exists()`: Creates VLAN interfaces if they don't exist before setting MTU

#### Improved VLAN MTU handling in `set_mtu` action:
- **Better VLAN detection**: Enhanced logic to detect VLAN interfaces (contains '.' and not bridge)
- **Parent interface validation**: Ensures parent interface exists in ethernets section
- **Immediate application**: Tries to set MTU immediately before netplan apply
- **Post-netplan application**: Retries MTU setting after netplan apply for newly created interfaces
- **Comprehensive logging**: Added debug logging for troubleshooting

#### Enhanced VLAN creation in `add_vlan` action:
- **MTU support in creation**: Now accepts MTU parameter during VLAN creation
- **Proper configuration structure**: Adds MTU to VLAN config in netplan

### 2. Enhanced Frontend (main.js)

#### Improved VLAN creation form:
- **MTU validation**: Validates MTU range (68-9000) during VLAN creation
- **Dual MTU application**: Applies MTU both during creation and as separate action for reliability
- **Better error handling**: More specific error messages for VLAN creation failures

#### Enhanced MTU setting modal:
- **VLAN-specific warnings**: Shows special notice for VLAN interfaces
- **Parent MTU validation**: Checks parent interface MTU and warns if VLAN MTU is higher
- **Improved user experience**: Better validation and error messages
- **Debug logging**: Added console logging for troubleshooting

### 3. Test Infrastructure

#### Created test script (test_mtu_vlan.py):
- Tests VLAN creation with custom MTU
- Tests MTU setting on existing VLANs
- Tests MTU setting on non-existent VLANs (auto-creation)
- Tests invalid MTU value handling

## Technical Details

### MTU Setting Flow for VLAN Interfaces:

1. **Detection**: System detects VLAN interface by checking if name contains '.' and doesn't start with 'br'
2. **Parent validation**: Ensures parent interface exists and is properly configured
3. **Interface creation**: If VLAN doesn't exist, creates it using `ip link add link <parent> name <vlan> type vlan id <id>`
4. **Immediate application**: Sets MTU immediately using `ip link set dev <vlan> mtu <mtu>`
5. **Netplan persistence**: Writes configuration to netplan for persistence across reboots
6. **Netplan apply**: Applies netplan configuration
7. **Post-apply verification**: Retries MTU setting if needed after netplan apply

### VLAN Interface Naming:
- Standard format: `parent.vlanid` (e.g., `eth0.100`)
- Custom names supported (user can override default naming)

### MTU Validation:
- **Range**: 68 - 9000 bytes (standard Linux range)
- **Parent compatibility**: Warns if VLAN MTU > Parent MTU
- **Common values**: UI provides suggestions (1500 for standard, 9000 for jumbo frames)

## Error Handling Improvements

### Backend Error Handling:
- Graceful handling of non-existent interfaces
- Proper error messages for netplan failures
- Fallback mechanisms for MTU application

### Frontend Error Handling:
- Input validation before submission
- Specific error messages for VLAN issues
- User-friendly warnings for potential problems

## Usage Instructions

### Setting MTU on VLAN Interfaces:
1. Navigate to the Interfaces tab
2. Find your VLAN interface (e.g., eth0.100)
3. Click "Set MTU" button
4. Enter desired MTU value (consider parent interface MTU)
5. Choose whether to persist configuration
6. Click "Apply MTU"

### Creating VLAN with Custom MTU:
1. Navigate to "VLAN / Bridge / Bond" tab
2. Select parent interface
3. Enter VLAN ID
4. Expand "Advanced Options"
5. Set desired MTU
6. Click "Create VLAN"

## Troubleshooting

### Common Issues and Solutions:

1. **"Interface does not exist" error**:
   - Check if parent interface exists and is up
   - Verify VLAN ID is not already in use

2. **MTU setting fails**:
   - Ensure parent interface MTU >= VLAN MTU
   - Check if interface is administratively up
   - Verify sufficient privileges (running as root)

3. **Configuration not persistent**:
   - Ensure "Persist configuration" is checked
   - Verify netplan files are writable
   - Check /etc/netplan/99-cockpit.yaml for changes

### Debug Information:
- Check browser console for JavaScript errors
- Review netplan_manager.py stderr output for backend issues
- Use the debug.html page for basic connectivity testing

## Files Modified

1. **xos-networking/netplan_manager.py**: Backend Python script for netplan management
2. **xos-networking/main.js**: Frontend JavaScript for UI interactions
3. **xos-networking/test_mtu_vlan.py**: Test script for validation (new file)

## Compatibility

- **Linux distributions**: Ubuntu 18.04+, Debian 10+, other systemd-networkd based systems
- **Netplan versions**: 0.95+
- **Network interfaces**: Physical ethernet, bonds, bridges, VLANs
- **Cockpit versions**: 220+