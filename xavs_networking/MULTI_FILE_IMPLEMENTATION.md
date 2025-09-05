# Multi-File Netplan Support Implementation

## Overview

The XAVS Networking module has been enhanced to support a multi-file netplan strategy, providing better organization, safety, and separation of concerns for network configuration management.

## Architecture Changes

### Backend Changes (netplan-js-manager.js)

#### 1. File Structure Definition
```javascript
const NETPLAN_FILES = {
  SYSTEM_BASE: '00-installer-config.yaml',      // System's original config (READ-ONLY)
  COCKPIT_ROUTES: '70-cockpit-routes.yaml',     // Route preservation
  COCKPIT_INTERFACES: '80-cockpit-interfaces.yaml', // Our interface management
  COCKPIT_OVERRIDES: '85-cockpit-overrides.yaml',   // System interface overrides
  COCKPIT_LEGACY: '99-cockpit.yaml'            // Legacy file (migration)
};
```

#### 2. Enhanced Configuration Functions

**loadNetplanConfig()** - Updated to read from multiple files
- Reads all Cockpit-managed files in priority order
- Merges configurations intelligently
- Maintains backward compatibility

**writeNetplanConfig()** - Updated for multi-file writing
- Separates configuration by type (routes, interfaces, overrides)
- Writes to appropriate files based on content
- Maintains legacy file for compatibility

#### 3. Configuration Separation Logic

**extractRouteConfig()** - Route-specific configurations
**extractInterfaceConfig()** - New interfaces (VLANs, bridges, bonds)
**extractOverrideConfig()** - Physical interface modifications

### Frontend Changes

#### 1. New Multi-File UI (multi-file-ui.js)
- **showNetplanFileDialog()** - File selection interface
- **showConfigModal()** - Enhanced config viewer with copy/download
- **convertConfigToYAML()** - JavaScript config to YAML converter
- **getNetplanFileStatus()** - File existence and status checking

#### 2. Enhanced User Interface
- File-specific viewing options
- Merged configuration display
- Copy/download functionality
- File status indicators

### UI Components

#### File Selection Dialog
```
┌─────────────────────────────────────────┐
│ View Netplan Configuration              │
├─────────────────────────────────────────┤
│ ○ 99-cockpit.yaml (Legacy/Complete)     │
│ ○ 80-cockpit-interfaces.yaml (New)      │
│ ○ 85-cockpit-overrides.yaml (Mods)      │
│ ○ 70-cockpit-routes.yaml (Routes)       │
│ ○ All Netplan Files                     │
│ ○ Merged Configuration                  │
└─────────────────────────────────────────┘
```

#### Configuration Viewer
- Syntax-highlighted display
- Line count indicator
- Copy to clipboard functionality
- Download as YAML file
- Responsive design (90vw × 80vh)

## File Organization Strategy

### Priority-Based Naming
```
00-installer-config.yaml    (System base - READ ONLY)
70-cockpit-routes.yaml      (Route management)
80-cockpit-interfaces.yaml  (Interface creation)
85-cockpit-overrides.yaml   (System overrides)
99-cockpit.yaml            (Legacy/fallback)
```

### Content Separation

#### 70-cockpit-routes.yaml
- Route preservation during netplan apply
- Dynamic route management
- Backup route configurations

#### 80-cockpit-interfaces.yaml
- User-created VLANs
- User-created bridges
- User-created bonds
- New interface definitions

#### 85-cockpit-overrides.yaml
- Physical interface IP changes
- MTU modifications
- DNS server overrides
- System interface modifications

#### 99-cockpit.yaml (Legacy)
- Complete configuration backup
- Migration compatibility
- Fallback for unsupported operations

## Benefits

### 1. Enhanced Safety
- **No system file modification** - Original configs remain untouched
- **Granular rollback** - Revert specific types of changes
- **Conflict detection** - Identify dual management scenarios

### 2. Better Organization
- **Clear separation** of interface types and modifications
- **Easier troubleshooting** - Focused file contents
- **Version control friendly** - Smaller, focused diffs

### 3. Improved User Experience
- **Visual file selection** - Choose what to view
- **Copy/download functionality** - Easy config export
- **File status indicators** - See which files exist
- **Merged view** - See effective configuration

### 4. Operational Benefits
- **Reduced complexity** - Smaller, focused files
- **Better debugging** - Issue isolation by file type
- **Migration path** - Gradual transition support

## Implementation Status

### ✅ Completed
- Multi-file reading capability
- Configuration separation logic
- Enhanced UI with file selection
- Copy/download functionality
- File status checking
- CSS styling for new components
- Integration with existing codebase

### 🔄 Current State
- **Hybrid mode**: Writing to multiple files + legacy file
- **Backward compatibility**: Full support for existing configs
- **Progressive enhancement**: New features use multi-file, existing features maintained

### 📋 Migration Path

#### Phase 1 (Current)
- Read from multiple files
- Write to both new files and legacy file
- UI supports both single and multi-file views

#### Phase 2 (Future)
- Route operations → 70-cockpit-routes.yaml
- Interface creation → 80-cockpit-interfaces.yaml
- System overrides → 85-cockpit-overrides.yaml

#### Phase 3 (Future)
- Legacy file becomes backup only
- Full multi-file operation
- Advanced conflict resolution

## Code Examples

### Reading Merged Configuration
```javascript
const config = await loadNetplanConfig();
// Returns merged config from all Cockpit files
```

### Viewing Specific File
```javascript
showNetplanFileDialog();
// Shows file selection UI
```

### Getting File Status
```javascript
const status = await getNetplanFileStatus();
// Returns existence and size info for all files
```

## Testing

### Validation Points
1. **File Reading** - Verify all files are read correctly
2. **Configuration Merging** - Ensure proper priority handling
3. **UI Functionality** - Test file selection and viewing
4. **Copy/Download** - Verify export functionality
5. **Backward Compatibility** - Ensure existing configs work

### Test Scenarios
- Empty netplan directory
- Legacy file only
- Mixed file scenarios
- Large configuration files
- Network connectivity during operations

## Future Enhancements

### Planned Features
1. **Advanced Conflict Resolution** - Detect and resolve config conflicts
2. **File Validation** - Syntax checking per file
3. **Change Tracking** - Monitor which files changed when
4. **Backup Integration** - Per-file backup strategies
5. **Performance Optimization** - Caching and lazy loading

### Integration Opportunities
1. **Git Integration** - Version control for netplan files
2. **Ansible Integration** - Template generation
3. **Cloud Integration** - Cloud-init compatibility
4. **Monitoring Integration** - Configuration drift detection

This implementation provides a robust foundation for advanced network configuration management while maintaining full backward compatibility and providing a smooth migration path for existing installations.
