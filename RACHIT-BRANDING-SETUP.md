# Rachit Branding - Manual Setup Guide

## Overview
This guide helps you apply custom "Rachit" branding to Cockpit so your modules appear under the Rachit brand.

## Files to Copy via WinSCP

### 1. Copy Branding Directory
**From:** `C:\Users\Ankit2\Documents\GitHub\cockpit\branding\rachit\`
**To:** `/usr/share/cockpit/branding/rachit/` on your server

**Files in the rachit directory:**
- `branding.css` - Custom CSS styling
- `brand-large.svg` - "Rachit" logo for header
- `logo.svg` - "R" logo for favicon area
- `favicon.svg` - Favicon

### 2. Manual Commands (via SSH)

After copying files, run these commands:

```bash
# Set proper permissions
chmod 644 /usr/share/cockpit/branding/rachit/*
chown -R root:root /usr/share/cockpit/branding/rachit/

# Backup original default branding
mv /usr/share/cockpit/branding/default /usr/share/cockpit/branding/default.original

# Set Rachit branding as default
ln -s rachit /usr/share/cockpit/branding/default

# Restart Cockpit
systemctl restart cockpit
```

### 3. Verify Branding

1. Open https://192.168.0.25:9090
2. Hard refresh (Ctrl+F5)
3. You should see:
   - "Rachit" text in the header
   - Blue "R" logo
   - Blue color scheme
   - Your XAVS modules under the Rachit-branded interface

### 4. Rollback (if needed)

To restore original branding:

```bash
# Remove custom branding link
rm /usr/share/cockpit/branding/default

# Restore original
mv /usr/share/cockpit/branding/default.original /usr/share/cockpit/branding/default

# Restart Cockpit
systemctl restart cockpit
```

## What This Changes

- **Header Logo:** Shows "Rachit" instead of system name
- **Favicon:** Custom "R" logo
- **Color Scheme:** Professional blue theme
- **Navigation:** Your modules appear under Rachit branding
- **Overall Look:** Clean, professional appearance

## Directory Structure After Setup

```
/usr/share/cockpit/branding/
├── default -> rachit (symlink)
├── default.original/ (backup)
└── rachit/
    ├── branding.css
    ├── brand-large.svg
    ├── logo.svg
    └── favicon.svg
```

The branding will apply to the entire Cockpit interface, making it appear as the "Rachit" system platform.