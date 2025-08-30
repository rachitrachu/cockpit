# XAVS Deploy - Kolla Ansible GUI

## Overview

XAVS Deploy is a comprehensive web-based GUI for managing Kolla-Ansible deployments with complete Standard Operating Procedure (SOP) integration. This production-ready application provides real-time progress tracking, safety features, and a modern responsive interface.

## Features

### 🎯 Complete SOP Integration
- **35+ Commands**: Full coverage of all Kolla-Ansible operations from the official SOP
- **Command Categories**: Organized by workflow (Installation, Deployment, Maintenance, etc.)
- **Parameter Support**: Complete implementation of --check, --limit, --tags, and safety flags
- **Service Tags**: 20+ service selections (nova, neutron, keystone, etc.)
- **Host Targeting**: Individual host selection and group targeting

### 🛡️ Safety Features  
- **Danger Warnings**: Clear alerts for destructive operations (stop, destroy, prune-images)
- **Dry Run Mode**: --check flag support for safe testing
- **Backup Integration**: Automated backup recommendations before dangerous operations
- **Confirmation Dialogs**: Additional safety prompts for critical commands

### 📊 Real-Time Progress Tracking
- **Task Progress**: Visual tracking of individual Ansible tasks with status indicators
- **Summary Statistics**: Live counters for success/failure/skipped tasks
- **Playbook Status**: Current operation status and host information
- **Raw Output**: Full console output with proper scrolling for debugging

### 🎨 Modern Interface
- **XAVS Branding**: Professional styling with brand-consistent colors (#197560)
- **Responsive Layout**: Optimized for desktop, tablet, and mobile devices
- **Collapsible Sections**: Minimize/expand Task Progress and Raw Output
- **Tabbed Interface**: Clean organization of commands, services, and hosts

## Quick Start

### Prerequisites
- Cockpit web console installed and running
- Kolla-Ansible environment configured
- Inventory file at `/root/xdeploy/nodes`
- Python virtual environment at `/opt/xenv/`

### Installation
1. Copy the `xavs-deploy` directory to your Cockpit modules directory:
   ```bash
   sudo cp -r xavs-deploy /usr/share/cockpit/
   ```

2. Access via Cockpit web interface:
   ```
   https://your-server:9090/xavs-deploy
   ```

### Configuration
The application automatically detects:
- **Inventory File**: `/root/xdeploy/nodes` (configurable)
- **Virtual Environment**: `/opt/xenv/bin/activate`
- **Available Hosts**: Parsed from inventory file
- **Available Services**: Pre-configured service tags

## Command Reference

### Installation & Setup
- `install-deps` - Install deployment dependencies
- `bootstrap-servers` - Bootstrap deployment servers

### Deployment Operations  
- `deploy` - Full OpenStack deployment
- `deploy-containers` - Deploy specific containers
- `deploy-servers` - Deploy bare-metal servers
- `reconfigure` - Reconfigure existing services

### Maintenance & Operations
- `upgrade` - Upgrade OpenStack services
- `stop` - Stop all services (⚠️ Destructive)
- `destroy` - Destroy deployment (⚠️ Destructive)
- `prune-images` - Remove unused images (⚠️ Destructive)

### Database Operations
- `mariadb_backup` - Backup MariaDB
- `mariadb_recovery` - Recover MariaDB

### Certificate Management  
- `certificates` - Manage TLS certificates
- `octavia-certificates` - Octavia certificate management

### Troubleshooting
- `gather-facts` - Collect system information
- `validate-config` - Validate configuration
- `genconfig` - Generate configuration files

## Service Tags

The application supports all major OpenStack services:
- **Core Services**: keystone, glance, nova, neutron, cinder
- **Additional Services**: heat, horizon, swift, octavia
- **Infrastructure**: mariadb, memcached, rabbitmq, redis  
- **Monitoring**: prometheus, grafana, fluentd
- **Networking**: openvswitch, linuxbridge
- **Storage**: ceph, nfs, manila

## Host Management

### All Hosts Mode
- Deploy to all hosts in inventory
- Default and recommended mode

### Limit Hosts Mode  
- Target specific hosts using `--limit`
- Individual host selection
- Group targeting support

### Tag-Based Selection
- Use service tags for targeted deployments
- Multiple tag selection supported
- Automatic tag validation

## Safety Guidelines

### ⚠️ Dangerous Commands
The following commands require extra confirmation:
- **stop**: Stops all OpenStack services
- **destroy**: Completely removes the deployment  
- **prune-images**: Removes unused Docker images

### 🔄 Backup Recommendations
Before performing destructive operations:
1. Run database backup: `mariadb_backup`
2. Create configuration backup
3. Document current deployment state
4. Test restore procedures

### ✅ Best Practices
- Always use `--check` for dry runs first
- Start with limited hosts for testing
- Monitor progress in real-time
- Keep backups current
- Follow the official SOP documentation

## Technical Details

### File Structure
```
xavs-deploy/
├── index.html          # Main application interface
├── app.js             # Core application logic  
├── style.css          # XAVS styling and responsive design
├── manifest.json      # Cockpit module configuration
├── README.md          # This documentation
└── sample-inventory.ini # Example inventory format
```

### Browser Compatibility
- Modern browsers with ES6+ support
- Chrome 60+, Firefox 55+, Safari 12+, Edge 79+
- Mobile browser support included

### Performance
- Efficient real-time parsing of Ansible output
- Minimal memory footprint
- Responsive UI updates
- Optimized for long-running deployments

## Troubleshooting

### Common Issues
1. **"No hosts found"**: Check inventory file path and format
2. **Permission errors**: Ensure proper sudo/superuser access
3. **Command not found**: Verify virtual environment activation
4. **Service unavailable**: Check Cockpit service status

### Debug Mode
For troubleshooting, check browser developer console for:
- Network requests
- JavaScript errors  
- WebSocket connection status
- API response details

### Support
- Review Kolla-Ansible official documentation
- Check deployment logs in `/var/log/`
- Verify system requirements and dependencies
- Ensure proper network connectivity

## Version History

### v2.0 (Production)
- Complete SOP integration with 35+ commands
- Enhanced safety features and warnings
- Improved progress tracking and UI
- Production-ready optimization

### v1.0 (Initial)
- Basic Kolla-Ansible command execution
- Simple progress tracking
- Initial Cockpit integration

---

**XAVS Deploy** - Streamlined OpenStack deployment management
```bash
ANSIBLE_STDOUT_CALLBACK=json kolla-ansible ...
```

### Fallback Text Parsing
When JSON output is not available, the system parses standard Ansible text output for:
- Task names from `TASK [...]` lines
- Play names from `PLAY [...]` lines  
- Task results from `ok:`, `changed:`, `failed:`, etc. lines

### Progress State Management
The application tracks:
- Current playbook name
- Task completion statistics
- Individual task results with metadata
- Overall deployment status

## Configuration

### Dynamic Host Loading
The inventory file path is set to `/root/xdeploy/nodes` and the system automatically:
- **Parses inventory file** on startup to extract all available hosts
- **Groups hosts by sections** (control, compute, network, storage, etc.)
- **Provides host selection UI** with individual checkboxes for targeted deployments
- **Includes refresh functionality** to reload hosts without restarting the application
- **Shows host count** to indicate how many hosts were found
- **Graceful fallback** to "All hosts" mode if inventory parsing fails

#### Inventory File Support
The system parses standard Ansible inventory format including:
- All section types (`[control]`, `[compute]`, `[network]`, etc.)
- Host entries with ansible variables (`host ansible_host=IP ansible_user=user`)
- Automatic filtering of special sections (`:children`, `:vars`)
- Comments and empty line handling
- Error recovery for malformed files

### Host Selection Options
- **All Hosts Mode** (default): Uses all hosts in inventory
- **Individual Selection**: Choose specific hosts for targeted operations
- **Visual Feedback**: Selected hosts shown as removable pills
- **Dynamic Updates**: Host list updates when inventory file changes

### Hardcoded Inventory
The inventory file path is hardcoded to `/root/xdeploy/nodes` as requested.

### Supported Commands
All standard Kolla Ansible commands are supported:
- bootstrap-servers (default)
- prechecks, deploy, post-deploy
- pull, reconfigure, upgrade, stop
- And others...

### Service Targeting
Commands that support the `-t` flag will show service selection options.
Commands like `bootstrap-servers` automatically disable service selection.

## UI Components

### Progress Section
- **Playbook Progress**: Shows current playbook and status
- **Summary Stats**: Live counters with color coding
- **Tasks List**: Scrollable list of completed tasks with details

### Raw Output
- Collapsible section showing full Ansible output
- Useful for debugging and detailed troubleshooting
- Maintains all original console functionality

## Usage

1. **Select Action**: Choose the Kolla Ansible command to run
2. **Choose Services** (if applicable): Select specific OpenStack services to target
3. **Select Hosts**: Choose specific hosts or use "All hosts"
4. **Run**: Click Run to start the deployment
5. **Monitor**: Watch the structured progress display for real-time updates
6. **Review**: Check the raw output section for detailed logs if needed

## Benefits

- **Better User Experience**: Clear visual feedback on deployment progress
- **Easier Troubleshooting**: Quickly identify failed tasks and their reasons
- **Professional Interface**: Modern, responsive design with meaningful status indicators
- **Backwards Compatibility**: Falls back gracefully to text parsing when needed
- **Complete Information**: Maintains access to full console output when needed

## Demo

See `demo.html` for a visual preview of what the progress display looks like with sample data.
