# XAVS Globals Configuration Module

A Cockpit module for configuring OpenStack XAVS global settings.

## Overview

This module provides a web-based interface for managing OpenStack service configurations through the `/etc/xavs/globals.d/99_xavs.yml` override file. This file contains only user-configured settings that **override** the default OpenStack configuration files (like `all.yml`). The `99_` prefix ensures it loads last and takes precedence over other configuration files. It integrates seamlessly with the Cockpit web console for server administration.

## Features

- **Override Configuration**: Creates override files that take precedence over default configs
- **Service Toggle Management**: Enable/disable OpenStack services (only enabled services are saved)
- **Network Configuration**: Override VIP addresses, network interfaces, and external access
- **Dependency Management**: Automatic handling of service dependencies
- **Configuration Preview**: YAML preview showing only your override customizations
- **Minimal Override Files**: Generates clean files with only user changes that differ from defaults
- **Priority Loading**: Uses `99_` prefix to ensure overrides load last and take precedence
- **Auto-directory Creation**: Creates `/etc/xavs/globals.d/` if it doesn't exist
- **Content Security Policy Compliant**: Follows security best practices

## Files

- `app.js` - Main application logic (446 lines)
- `index.html` - User interface
- `style.css` - Styling with CSP compliance
- `manifest.json` - Cockpit module manifest with CSP policy
- `all.yml` - Sample configuration file

## Installation

1. Copy the module directory to `/usr/share/cockpit/xavs-globals/`
2. Ensure proper permissions for `/etc/xavs/globals.d/99_xavs.yml`
3. Create the XAVS configuration directory: `sudo mkdir -p /etc/xavs/globals.d/`
4. Restart Cockpit service: `systemctl restart cockpit`

## How Override System Works

The XAVS Globals module creates **override configuration files** that work with OpenStack's configuration hierarchy:

### **Configuration Loading Order:**
1. **Base configs**: `/etc/kolla/all.yml` (default OpenStack settings)
2. **Site configs**: `/etc/kolla/globals.yml` (site-specific settings)
3. **XAVS overrides**: `/etc/xavs/globals.d/99_xavs.yml` (your customizations) ← **Takes precedence**

### **Override Behavior:**
- **Matching keys**: Your values override default values
- **New keys**: Your additional settings are added
- **Disabled services**: Not included in override file (uses defaults)
- **Default values**: Skipped to keep override file minimal

### **Example:**
If `all.yml` has:
```yaml
enable_horizon: no
kolla_internal_vip_address: "192.168.1.10"
```

And your override has:
```yaml
enable_horizon: yes
kolla_internal_vip_address: "10.0.1.1"
enable_cinder: yes
```

**Final result**: Horizon enabled, VIP changed to 10.0.1.1, Cinder enabled, all other defaults preserved.

## Usage

1. Access through Cockpit web interface at `https://server:9090/`
2. Navigate to "XAVS Globals" in the sidebar
3. Configure services and network settings (only your overrides will be saved)
4. Preview changes to see the minimal override configuration that will take precedence
5. Save to create/update `/etc/xavs/globals.d/99_xavs.yml` with only your override customizations

## Technical Details

- **Architecture**: Self-contained JavaScript module
- **Dependencies**: None (uses Cockpit API)
- **Compatibility**: Cockpit-compatible with proper CSP headers
- **Override System**: Uses numbered priority (99_) to ensure precedence over other config files
- **Configuration Merge**: Your overrides will merge with and take precedence over `all.yml` and other configs
- **Error Handling**: Graceful fallbacks for missing dependencies

## Development

The module follows Cockpit development best practices:
- No inline styles (CSP compliant)
- Proper error handling
- Clean separation of concerns
- Self-contained with no external dependencies
