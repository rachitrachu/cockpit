# XAVS Static Directory

This is the **single source of truth** for shared JavaScript modules accessible across all XAVS Cockpit modules.

## Directory Structure

```
cockpit/static/xavs/
├── state-manager.js      # Core state management system
├── wizard-state.js       # Wizard-specific state management
├── wizard-navigation.js  # Step navigation controller
├── module-interface.js   # Standardized module interface API
└── module-manager.js     # Dynamic module loading system
```

## Usage

These files are accessible from any XAVS module using the relative path `../static/xavs/`:

```html
<!-- Load XAVS common modules -->
<script src="../static/xavs/state-manager.js"></script>
<script src="../static/xavs/wizard-state.js"></script>
<script src="../static/xavs/wizard-navigation.js"></script>
<script src="../static/xavs/module-interface.js"></script>
<script src="../static/xavs/module-manager.js"></script>
```

## Global Objects

After loading, these modules provide global objects:

- `window.XAVSStateManager` / `window.xavsState`
- `window.XAVSWizardState` / `window.xavsWizardState`
- `window.XAVSWizardNavigation` / `window.xavsNavigation`
- `window.ModuleInterface` / `window.XAVSModuleInterface`
- `window.XAVSModuleManager` / `window.xavsModules`

## Deployment

To deploy to production Cockpit:

```bash
# Sync the static directory to Cockpit's static directory
sudo rsync -av cockpit/static/ /usr/share/cockpit/static/

# Restart Cockpit to ensure changes take effect
sudo systemctl restart cockpit
```

## Architecture Benefits

✅ **Single Source of Truth**: All common code in one location  
✅ **No File Duplication**: Eliminates redundant copies  
✅ **Clean Module Structure**: Each module focuses on its specific functionality  
✅ **Easy Maintenance**: Update once, affects all modules  
✅ **Proper Cockpit Integration**: Uses standard Cockpit static file serving  

## Testing

- Use `xavs-main/test-static.html` to verify module loading
- Use `xavs-main/diagnostic.html` for comprehensive module diagnostics
- Use `xavs-main/wizard.html` for the main wizard interface