# Physical Interface Edit Functionality

## Overview
Added edit functionality for physical network interfaces like `enp131s0f0` and `enp131s0f1` to allow users to configure IP addresses, MTU, and other network settings.

## What Was Added

### 1. Enhanced Interface Detection
**File**: `advanced-actions.js`
- Added detection for physical interfaces (starting with `en`, `eth`, or `wl`)
- Distinguished between constructed interfaces (VLANs, bridges, bonds) and physical interfaces

### 2. Edit Button for Physical Interfaces
**Behavior**:
- ✅ **Edit button added** for physical interfaces (`enp131s0f0`, `enp131s0f1`, etc.)
- ❌ **No delete button** (can't delete hardware interfaces)
- 🔧 **Configuration options**: IP address, MTU settings

### 3. Physical Interface Edit Modal
**Features**:
- **IP Address Configuration**: Support for static IP with CIDR notation or DHCP
- **MTU Settings**: Configurable from 1280 to 9000 bytes
- **System-Managed Warning**: Clear indication that interface may be system-managed
- **User-Friendly Interface**: Consistent with existing edit modals

### 4. Enhanced Notifications
**Success Notification**: 10-second duration green toast showing successful changes
**Error Handling**: Clear error messages for failed operations
**Info Messages**: Notification when no changes are made

## Interface Types and Actions

| Interface Type | Edit Button | Delete Button | Example |
|----------------|-------------|---------------|---------|
| **Physical** | ✅ Yes | ❌ No | `enp131s0f0`, `enp131s0f1` |
| **VLAN** | ✅ Yes | ✅ Yes | `eno1.1199`, `eno4.1199` |
| **Bridge** | ✅ Yes | ✅ Yes | `br0`, `br1` |
| **Bond** | ✅ Yes | ✅ Yes | `bond0`, `bond1` |

## Code Changes

### advanced-actions.js
```javascript
// Enhanced interface detection
const isPhysical = !isConstructed && (iface.dev.startsWith('en') || iface.dev.startsWith('eth') || iface.dev.startsWith('wl'));

// Add edit button for physical interfaces
if (isPhysical) {
  const btnEdit = createActionButton('Edit', '<i class="fas fa-edit"></i>', async () => {
    await editPhysicalInterface(iface);
  }, 'configure');
  actionsContainer.appendChild(btnEdit);
}
```

### New editPhysicalInterface() Function
- **IP Configuration**: Uses `netplanAction('set_ip')` for IP changes
- **MTU Configuration**: Uses `netplanAction('set_mtu')` for MTU changes
- **Validation**: Proper input validation and error handling
- **User Feedback**: Toast notifications for success/error states

### style.theme.css
- **Modal Styling**: Consistent with existing interface design
- **Info Panels**: Blue info box for interface description
- **Warning Panels**: Orange warning box for system-managed notice
- **Form Styling**: Consistent input fields and labels

## User Experience

### Before
- Physical interfaces had no configuration options
- Users couldn't modify IP addresses on hardware interfaces
- No way to change MTU settings on physical ports

### After
- ✅ Edit button available on all physical interfaces
- ✅ Easy IP address configuration with CIDR support
- ✅ MTU configuration for performance optimization
- ✅ Clear visual feedback for changes
- ✅ Safety protection (no delete button for hardware)

## Usage Instructions

1. **Find Physical Interface**: Look for interfaces like `enp131s0f0`, `enp131s0f1`
2. **Click Edit Button**: Blue "Edit" button in the actions column
3. **Configure Settings**:
   - **IP Address**: Enter static IP with CIDR (e.g., `192.168.1.100/24`) or leave empty for DHCP
   - **MTU**: Adjust for performance (1500 standard, up to 9000 for jumbo frames)
4. **Apply Changes**: Click "Apply Changes" button
5. **Confirmation**: Green success notification will show for 10 seconds

## Technical Notes

- **System-Managed Interfaces**: Changes are applied through Cockpit's netplan configuration
- **DHCP Support**: Leave IP field empty to enable DHCP
- **CIDR Notation**: IP addresses must include subnet mask (e.g., `/24`)
- **MTU Range**: 1280-9000 bytes supported
- **Route Preservation**: Existing route preservation logic protects connectivity

## Testing

Test the new functionality by:
1. Refreshing the Cockpit interface
2. Finding a physical interface like `enp131s0f0`
3. Clicking the new "Edit" button
4. Modifying IP address or MTU settings
5. Verifying the 10-second green success notification appears
