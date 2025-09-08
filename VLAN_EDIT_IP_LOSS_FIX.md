# VLAN Edit IP Loss Fix

## Issue Description
When adding new IP addresses in the VLAN edit dialog, existing IP addresses were being removed from the configuration file even though they were still visible in the GUI.

## Root Cause Analysis
The issue was likely caused by:
1. **Double collection**: The `saveVlanEdit` function was calling `collectEditIpAddresses()` twice - once for `ipAddresses` and once for `ip`, which could cause timing issues
2. **Insufficient debugging**: Lack of detailed logging made it difficult to track what IP addresses were being collected and processed
3. **DOM state issues**: Potential race conditions when adding new IP fields

## Fixes Implemented

### 1. Optimized IP Collection in saveVlanEdit()
**File**: `vlan-manager.js` (lines ~1740-1750)

**Before**:
```javascript
const formData = {
    // ...
    ipAddresses: collectEditIpAddresses(),
    ip: collectEditIpAddresses()[0] || '', // Called twice!
    // ...
};
```

**After**:
```javascript
// Collect IP addresses once to avoid potential issues
const collectedIpAddresses = collectEditIpAddresses();
NetworkLogger.info(`VlanManager: Collected IP addresses from form:`, collectedIpAddresses);

const formData = {
    // ...
    ipAddresses: collectedIpAddresses,
    ip: collectedIpAddresses[0] || '', // Use cached result
    // ...
};
```

### 2. Enhanced collectEditIpAddresses() Debugging
**File**: `vlan-manager.js` (lines ~2518-2540)

Added comprehensive logging to track:
- Number of IP input fields found
- Value and visibility of each input field
- Which inputs are skipped (empty) vs. added
- Final collected IP addresses

### 3. Enhanced addEditIpAddress() Debugging
**File**: `vlan-manager.js` (lines ~2490-2530)

Added logging to track:
- State before and after adding new IP fields
- Existing input count and values
- Successful addition of new input fields

### 4. Enhanced generateVlanNetplanConfig() Debugging
**File**: `vlan-manager.js` (lines ~1645-1665)

Added logging to track:
- IP addresses being processed for YAML generation
- Both `config.ipAddresses` and `config.ip` values
- Each IP address being added to the YAML configuration
- Warning when no IP addresses are found

## Expected Results
With these fixes:
1. **Single collection**: IP addresses are collected only once per save operation
2. **Better debugging**: Detailed logs help identify where IP addresses might be lost
3. **Consistent behavior**: Adding new IP fields shouldn't affect existing ones
4. **File integrity**: Configuration files should contain all IP addresses that are visible in the GUI

## Testing Recommendations
1. Open VLAN edit dialog for a VLAN with multiple IP addresses
2. Add a new IP address using the "Add IP Address" button
3. Save the configuration
4. Verify that both old and new IP addresses are preserved in:
   - The GUI after reload
   - The actual Netplan configuration file
   - The system's IP configuration (`ip a` output)

## Debugging Commands
To debug IP address collection issues:
1. Open browser console
2. Look for log messages starting with `VlanManager:`
3. Check the collected IP addresses in the form data
4. Verify the generated YAML configuration contains all expected IPs
