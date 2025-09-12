# XAVS Networking Module

A comprehensive network management interface for Ubuntu systems, built using the xavs-bootstrap CSS framework and integrating with Cockpit.

## Overview

The XAVS Networking module provides a modern, responsive web interface for managing network configurations on Ubuntu systems. It leverages the existing xavs-bootstrap framework to ensure consistency with other XAVS modules.

## Features

### 🔌 Interface Management
- **Real-time interface monitoring** - View all network interfaces with live status updates
- **Comprehensive interface details** - MAC addresses, IP configurations, MTU settings
- **Sortable interface table** - Click column headers to sort by different criteria
- **Advanced filtering** - Search interfaces by name, type, or status

### 🏗️ Network Constructs
- **VLAN Creation** - Create and manage VLANs with custom IDs and configurations
- **Bridge Management** - Set up network bridges with STP options
- **Bond Configuration** - Configure network bonding with multiple modes (active-backup, balance-rr, etc.)
- **Advanced Options** - Access detailed configuration options for each construct type

### 🩺 Network Diagnostics
- **Connectivity Testing** - Built-in ping and traceroute tools
- **Routing Analysis** - View and analyze routing table
- **DNS Configuration** - Monitor DNS settings and resolution

## Design Integration

### xavs-bootstrap Framework
The module fully integrates with the xavs-bootstrap CSS framework:

- **Consistent Branding** - Uses the #197560 brand color throughout
- **Responsive Design** - Mobile-friendly interface that adapts to screen sizes
- **Component Library** - Leverages pre-built buttons, cards, and form elements
- **Icon System** - FontAwesome icons for professional appearance

### Modern UI Elements
- **Professional Cards** - Clean card-based layout for different functions
- **Animated Interactions** - Smooth hover effects and transitions
- **Loading States** - Visual feedback during operations
- **Status Badges** - Color-coded status indicators
- **Toast Notifications** - Non-intrusive feedback messages

## Technical Architecture

### File Structure
```
xavs_networking/
├── index.html           # Main interface
├── style.theme.css      # Custom styles (inherits from xavs-bootstrap)
├── main.js              # Main initialization and tab management
├── manifest.json        # Cockpit module configuration
├── js/
│   ├── ui-utils.js      # UI utility functions
│   ├── utils.js         # Core utility functions
│   ├── interfaces.js    # Interface management logic
│   ├── constructs.js    # VLAN/Bridge/Bond creation
│   ├── events.js        # Event handling and diagnostics
│   └── ...              # Other specialized modules
└── assets/
    └── Logo/            # Logo assets
```

### Key Improvements Made

1. **CSS Framework Integration**
   - Imported xavs-bootstrap, xavs-globals, and FontAwesome
   - Custom CSS variables for network-specific theming
   - Responsive grid layouts and mobile optimization

2. **Icon Standardization**
   - Replaced emoji icons with FontAwesome icons
   - Consistent icon usage throughout the interface
   - Proper icon spacing and alignment

3. **Enhanced UI Components**
   - Professional button styles with hover effects
   - Improved table design with sorting indicators
   - Advanced accordion-style options panels
   - Modern card layouts for different sections

4. **Better User Experience**
   - Tab-based navigation with smooth transitions
   - Loading states and progress indicators
   - Error handling with user-friendly messages
   - Keyboard shortcuts for common actions

5. **Code Organization**
   - Separated UI utilities into dedicated module
   - Improved error handling and logging
   - Event-driven architecture for module communication
   - Proper initialization sequence

## Usage

### Installation
1. Place the module in the Cockpit modules directory
2. Ensure xavs-bootstrap and xavs-globals modules are available
3. Restart Cockpit service

### Navigation
- Use the top navigation tabs to switch between sections
- Click table headers to sort interface lists
- Use search boxes to filter results
- Access advanced options through expandable sections

### Creating Network Constructs
1. Navigate to "VLAN / Bridge / Bond" tab
2. Fill in required fields for your desired construct
3. Expand "Advanced Options" for additional settings
4. Click the respective "Create" button
5. Monitor output in the command result area

### Running Diagnostics
1. Go to "Diagnostics" tab
2. Enter target host/IP for connectivity tests
3. Use ping and traceroute tools
4. Review routing and DNS information

## Troubleshooting

### 🔧 Debug Mode
The module includes comprehensive debugging tools to help identify issues:

1. **Open browser console** (F12)
2. **Run debug check**: `debugNetworking.runDebugCheck()`
3. **Test specific features**:
   - `debugNetworking.testSearch()` - Test search functionality
   - `debugNetworking.testVlanCreation()` - Test VLAN form
   - `debugNetworking.testDiagnostics()` - Test ping/traceroute

### 🐛 Common Issues

#### Search Not Working
- **Check**: Search input element exists
- **Fix**: Ensure `#search-iface` element is present
- **Debug**: Run `debugNetworking.testSearch()`

#### VLAN Creation Fails
- **Check**: Form elements are populated
- **Fix**: Verify interface list loads properly
- **Debug**: Run `debugNetworking.testVlanCreation()`

#### Diagnostics Not Responding  
- **Check**: Ping/traceroute buttons exist
- **Fix**: Ensure proper event handlers are attached
- **Debug**: Run `debugNetworking.testDiagnostics()`

#### Buttons Not Clickable
- **Check**: JavaScript files loaded in correct order
- **Fix**: Verify all dependencies are available
- **Debug**: Run `debugNetworking.debugFunctionCheck()`

### 📋 Debug Output Example
```javascript
// Run this in browser console
debugNetworking.runDebugCheck();

// Example output:
// ✅ Search Input: Found
// ✅ Create VLAN Button: Found  
// ✅ Ping Button: Found
// ✅ setupEvents: function
// ✅ $ function works: true
```

## Compatibility

- **Cockpit**: Requires Cockpit 186 or newer
- **Ubuntu**: Optimized for Ubuntu systems with netplan
- **Dependencies**: xavs-bootstrap, xavs-globals modules
- **Browsers**: Modern browsers with ES6 support

## Security

- Uses Cockpit's built-in authentication and authorization
- Follows CSP (Content Security Policy) best practices
- Requires appropriate sudo privileges for network operations
- All network commands executed through Cockpit's secure channel

## Customization

The module can be customized by:
- Modifying CSS variables in `style.theme.css`
- Adding custom network construct types
- Extending diagnostic tools
- Implementing additional monitoring features

## Contributing

When contributing to the module:
1. Follow the xavs-bootstrap design patterns
2. Use FontAwesome icons consistently
3. Test on different screen sizes
4. Ensure proper error handling
5. Update documentation as needed
