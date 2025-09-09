# XAVS Storage Module

This is a fully-featured Cockpit module for managing storage devices, filesystems, and related operations. It's based on the original storaged module but completely styled to match the XAVS platform design guidelines.

## Features

- **Complete XAVS Styling**: Identical header with logo, brand colors, and layout to xavs-globals
- **Storage Device Management**: Full disk and partition management
- **Filesystem Operations**: Mount, unmount, format with advanced options
- **RAID Configuration**: Create and monitor RAID arrays
- **LVM Support**: Logical Volume Management
- **NFS and iSCSI**: Network storage configuration
- **Real-time Status Bar**: Bottom status bar with activity logs
- **Interactive Logging**: View logs modal with timestamp details
- **Responsive Design**: Mobile and desktop optimized

## Files Structure

### Core Files
- `manifest.json` - Module manifest with metadata and configuration
- `index.html` - Main HTML entry point with XAVS layout
- `storaged.js` - Complete JavaScript functionality (from original storaged module)

### Styling & Assets
- `xavs-base.css` - Complete XAVS global styling (copied from xavs-globals)
- `storaged.css` - Storage-specific styles and bottom status bar
- `fontawesome/` - Complete FontAwesome icon library
- `logo-x.png` - XAVS logo for header

### Additional Scripts
- `xavs-status.js` - Status bar management and logging functionality
- `po.js` - Translation strings and internationalization support

### Documentation
- `README.md` - This documentation file

## XAVS Design Integration

### Header
- ✅ XAVS logo with "AVS Storage" title
- ✅ Help tooltip with storage-specific information
- ✅ Brand color (#197560) accent line

### Styling
- ✅ Tenorite font family with proper fallbacks
- ✅ Complete XAVS color scheme and variables
- ✅ Light/dark theme support
- ✅ PatternFly integration
- ✅ Consistent button and form styling

### Status Bar
- ✅ Fixed bottom status bar with brand accent
- ✅ Real-time activity updates
- ✅ Interactive "View Logs" button
- ✅ Activity log modal with timestamps

### Icons
- ✅ Complete FontAwesome library included
- ✅ All icons properly styled and sized
- ✅ Consistent icon usage throughout

## Dependencies

- Cockpit 266 or later
- UDisks2 system service
- Various storage-related system packages (defined in manifest.json)

## Installation

Place this module directory in the Cockpit modules directory (typically `/usr/share/cockpit/` on Linux systems).

## Browser Compatibility

- Modern browsers with CSS Grid and Flexbox support
- Chrome/Chromium 57+
- Firefox 52+
- Safari 10.1+
- Edge 16+

## Key Improvements Over Original

1. **Complete XAVS Branding**: Identical to xavs-globals styling
2. **Enhanced UX**: Bottom status bar with real-time updates
3. **Better Logging**: Interactive log viewer with filtering
4. **Mobile Responsive**: Optimized for all screen sizes
5. **Accessibility**: Keyboard navigation and screen reader support
6. **Modern Icons**: Full FontAwesome icon set included

## Development Notes

The module maintains 100% compatibility with the original storaged functionality while providing a completely branded XAVS experience. The modular CSS approach allows for easy maintenance and updates.

## License

Same as Cockpit - GNU Lesser General Public License version 2.1
