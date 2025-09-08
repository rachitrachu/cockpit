# VLAN Edit IP Display Fix

## Issue Description
The VLAN edit function was not displaying all IP addresses correctly. While the system detected 2 IP addresses (`22.22.22.11/24` and `11.11.11.11/24`), only 1 input field was being created in the edit form.

## Root Cause
The `populateEditIpAddresses()` function had flawed logic:
1. For the first IP (index 0), it created the entry directly
2. For additional IPs, it called `addEditIpAddress()` which incremented a counter
3. It then tried to find inputs using the counter value instead of the actual index
4. This caused a mismatch between the counter and the actual IP index

## Fix Applied
Restructured the `populateEditIpAddresses()` function to:
1. Use a consistent approach for all IP entries
2. Create all entries with proper sequential indexing (0, 1, 2, ...)
3. Set the counter to the correct value for future additions
4. Ensure the first entry (index 0) always has its remove button hidden

## Key Changes
- **Consistent Entry Creation**: All IP entries are now created using the same HTML structure
- **Proper Indexing**: Each entry uses its actual index (0, 1, 2, ...) instead of counter-based IDs
- **Counter Management**: The `editIpAddressCounter` is set to the highest index after population
- **Remove Button Logic**: Enhanced to properly handle the first entry visibility

## Testing
After this fix, the VLAN edit dialog should properly display:
- First IP field: `22.22.22.11/24` (remove button hidden)
- Second IP field: `11.11.11.11/24` (remove button visible)
- Proper indexing for any additional IP addresses

## Files Modified
- `vlan-manager.js`: Updated `populateEditIpAddresses()` and `updateEditRemoveButtonVisibility()` functions

## Status
✅ **FIXED** - All IP addresses should now be properly displayed in the VLAN edit form
