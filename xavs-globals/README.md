# XAVS Globals Configuration Module for Cockpit

A comprehensive web-based interface for managing OpenStack-Ansible global configuration through the Cockpit web console. This production-ready module provides a complete solution for configuring all aspects of an OpenStack deployment.

## Features

### Core Functionality
- **Complete OpenStack Configuration**: 34 configuration options across 8 categories
- **Professional Tabbed Interface**: Organized sections for Network, Compute, Storage, Database, Messaging, Monitoring, Security, and Advanced settings
- **YAML Configuration Management**: Full support for OpenStack-Ansible YAML format with parsing and generation
- **File Operations**: Save, load, backup, and restore configurations with automatic timestamping
- **Form Validation**: Real-time validation with dependency checking and error handling
- **Export/Import**: Download configurations and preview changes before applying

### Advanced Features
- **Dynamic Form Generation**: Automatically builds forms from configuration schema
- **Configuration Preview**: Modal dialogs to review changes before saving
- **Backup Management**: Automatic backup creation with timestamp tracking
- **Reset Functionality**: Quick reset to default values with confirmation
- **Help Documentation**: Comprehensive help for all configuration options
- **Error Handling**: Robust error handling with user-friendly messages

## Production Installation

1. Copy the entire `xavs-globals` directory to `/usr/share/cockpit/`
   ```bash
   sudo cp -r xavs-globals /usr/share/cockpit/
   sudo chown -R root:root /usr/share/cockpit/xavs-globals
   sudo chmod 644 /usr/share/cockpit/xavs-globals/*
   ```

2. Restart Cockpit service:
   ```bash
   sudo systemctl restart cockpit
   ```

3. Access through Cockpit web interface at: `https://your-server:9090`

## Configuration Management

The module manages OpenStack-Ansible configuration files at:
- **Primary Config**: `/etc/xavs/globals.d/_99_xavs.yml`
- **Backup Directory**: `/etc/xavs/globals.d/backups/`
- **Sample Config**: `/etc/xavs/globals.d/all.yml`

## Configuration Categories

### Network Configuration
- Management Network CIDR, Internal API Network, External Network
- Neutron Network Type, VLAN Ranges, Provider Networks

### Compute Configuration  
- Nova CPU Allocation Ratio, RAM Allocation Ratio, Disk Allocation Ratio
- Compute Driver, Scheduler Filters

### Storage Configuration
- Cinder Volume Driver, Volume Group, NFS Shares
- Swift Storage Policy, Object Servers

### Database Configuration
- Galera Cluster Size, Buffer Pool Size, Max Connections
- Backup Retention

### Messaging Configuration
- RabbitMQ Cluster Size, Memory High Watermark
- Redis Max Memory, Persistence

### Monitoring Configuration
- Prometheus Retention, Grafana Admin Password
- Alertmanager Configuration, Log Level

### Security Configuration
- Keystone Token Expiration, Password Policies
- SSL/TLS Settings, Firewall Rules

### Advanced Configuration
- Debug Mode, API Workers, Database Connections
- Custom Configuration Options

## Production Files

- **`app-allinone.js`** - Complete application with all functionality (945+ lines)
- **`index.html`** - Professional tabbed interface with all controls
- **`style.css`** - Production styling with responsive design
- **`manifest.json`** - Cockpit module definition with CSP policies
- **`README.md`** - This production documentation
- **`all.yml`** - Sample OpenStack-Ansible configuration file

## Technical Architecture

- **Single-File Application**: All functionality embedded in `app-allinone.js` for maximum reliability
- **CSP Compliant**: Full Content Security Policy compliance for security
- **Modern JavaScript**: Promise-based APIs with proper error handling
- **Bootstrap-like Styling**: Professional appearance without external dependencies
- **YAML Processing**: Custom parser for OpenStack-Ansible format compatibility
- **Bash Integration**: Proven file operations using bash commands for reliability

## Requirements

- **Cockpit**: Version 200+ with web console enabled
- **Browser**: Modern browser with JavaScript ES6+ support  
- **Permissions**: Write access to `/etc/xavs/globals.d/` directory
- **System**: Linux system with bash shell support

## Support

This is a production-ready module with comprehensive error handling and validation. All 34 configuration options are fully implemented and tested for OpenStack-Ansible compatibility.
