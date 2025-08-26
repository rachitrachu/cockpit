# XAVS Globals Configuration

A comprehensive Cockpit-based web interface for managing OpenStack global configuration settings. This tool provides a user-friendly interface for configuring all aspects of OpenStack deployment through the XAVS system.

## Features

### Comprehensive Configuration Management
- **Network Configuration**: Manage network interfaces, VIP addresses, and network plugins
- **Container Configuration**: Control container engine settings, registries, and policies  
- **OpenStack Configuration**: Set OpenStack release, region, and global parameters
- **Database Configuration**: Configure MariaDB/MySQL settings and connection pools
- **Messaging Configuration**: Manage RabbitMQ and oslo.messaging parameters
- **Security Configuration**: Control TLS settings and certificate management
- **Storage Configuration**: Configure Cinder, Swift, and Manila storage backends
- **Monitoring Configuration**: Set up Prometheus, Grafana, and health checking
- **Service Ports**: Customize API endpoints and service ports
- **Advanced Configuration**: Fine-tune performance and operational parameters

### Service Management
- **Core Services**: OpenStack identity, compute, networking, image, orchestration, and dashboard
- **Storage Services**: Block storage (Cinder), object storage (Swift), shared filesystems (Manila)
- **Network Services**: Load balancing (Octavia), VPN, firewall, and advanced networking features
- **Additional Services**: Key management (Barbican), DNS (Designate), containers (Zun), bare metal (Ironic)
- **Monitoring Services**: Prometheus metrics, Grafana dashboards, centralized logging
- **Infrastructure Services**: Load balancers, databases, message queues, caching

### Smart Configuration Features
- **Tabbed Interface**: Organized configuration sections for easy navigation
- **Dynamic Form Generation**: Automatically generates forms based on configuration schema
- **Dependency Management**: Automatically enables required dependencies for services
- **Validation**: Real-time form validation with helpful error messages
- **Override System**: Generates minimal configuration files that override defaults
- **Service Categorization**: Services grouped by function for better organization

## Architecture

### File Structure
```
xavs-globals/
├── app.js                 # Main application logic
├── config-schema.js       # Comprehensive configuration schema
├── form-generator.js      # Dynamic form generation engine
├── index.html            # Modern Bootstrap-based interface
├── style.css             # Custom styling and enhancements
├── manifest.json         # Cockpit module manifest
└── README.md             # This documentation
```

### Configuration Schema
The system uses a comprehensive schema that covers all major OpenStack configuration categories:

#### Configuration Sections
1. **Network Configuration** - Interfaces, VIPs, neutron settings
2. **Container Configuration** - Docker/Podman, registries, policies
3. **OpenStack Configuration** - Release, region, global settings
4. **Database Configuration** - MariaDB settings and tuning
5. **Messaging Configuration** - RabbitMQ and oslo.messaging
6. **Security Configuration** - TLS, certificates, authentication
7. **Storage Configuration** - Block, object, and shared storage
8. **Monitoring Configuration** - Metrics, dashboards, health checks
9. **Service Ports** - API endpoints and custom ports
10. **Advanced Configuration** - Performance and operational tuning

#### Service Categories
1. **Core Services** - Essential OpenStack components
2. **Storage Services** - Persistent and object storage
3. **Network Services** - Advanced networking features
4. **Additional Services** - Extended OpenStack services
5. **Monitoring Services** - Observability and logging
6. **Infrastructure Services** - Supporting components

## Technical Details

### Override System
The application generates configuration files at `/etc/xavs/globals.d/99_xavs.yml` that:
- Contain only user-configured overrides (not defaults)
- Take precedence over `all.yml` due to the `99_` prefix
- Are minimal and focused on actual changes
- Include clear documentation and comments

### Form Generation
The `FormGenerator` class dynamically creates forms based on the schema:
- Supports text, number, select, and boolean field types
- Handles validation with regex patterns and required fields
- Manages service dependencies automatically
- Provides contextual help and descriptions

### Configuration Loading Order
```
1. all.yml (default OpenStack configuration)
2. globals.yml (site-specific overrides)  
3. /etc/xavs/globals.d/*.yml (additional overrides, sorted alphabetically)
4. /etc/xavs/globals.d/99_xavs.yml (XAVS GUI overrides, highest precedence)
```

## Usage

### Basic Configuration
1. **Access Interface**: Navigate to the XAVS Globals module in Cockpit
2. **Configure Network**: Set management interface and VIP addresses in Network tab
3. **Select Services**: Enable required OpenStack services in service tabs
4. **Customize Settings**: Adjust ports, security, and advanced options as needed
5. **Save Configuration**: Generate and save the override configuration

### Advanced Configuration
- **Service Dependencies**: The system automatically enables dependencies when you select services
- **Port Customization**: Modify default ports for services in the Service Ports tab
- **Security Hardening**: Enable TLS and configure certificates in Security tab
- **Performance Tuning**: Adjust worker counts and timeouts in Advanced tab

### Configuration Management
- **Preview**: Generate YAML preview before saving
- **View Saved**: Examine the current saved configuration
- **Reset**: Return all settings to defaults
- **Validation**: Real-time validation with error highlighting

## Integration

### Cockpit Integration
- Fully compatible with Cockpit security model
- Uses Cockpit file API for configuration management
- Supports superuser privilege escalation for system files
- Integrates with Cockpit navigation and theming

### OpenStack Integration
- Compatible with Kolla-Ansible deployment patterns
- Follows OpenStack configuration best practices
- Supports all major OpenStack releases (Antelope through Dalmatian)
- Integrates with existing configuration management

### XAVS Integration
- Designed specifically for XAVS deployment workflows
- Supports XAVS-specific configuration requirements
- Compatible with XAVS infrastructure patterns
- Optimized for XAVS operational procedures

## Configuration Examples

### Basic Cloud Setup
```yaml
# Network Configuration
network_interface: "eth0"
kolla_internal_vip_address: "192.168.1.100"

# Enabled Services
enable_openstack_core: yes  # Core OpenStack Services
enable_cinder: yes          # Block Storage Service
enable_swift: yes           # Object Storage Service
```

### Production Cloud with Monitoring
```yaml
# Network Configuration  
network_interface: "bond0"
kolla_internal_vip_address: "10.0.1.100"
kolla_external_vip_address: "203.0.113.100"

# Security Configuration
kolla_enable_tls_external: yes

# Enabled Services
enable_openstack_core: yes      # Core OpenStack Services
enable_cinder: yes              # Block Storage Service
enable_octavia: yes             # Load Balancing Service
enable_prometheus: yes          # Prometheus Monitoring
enable_grafana: yes             # Grafana Dashboard
enable_central_logging: yes     # Central Logging
```

## Troubleshooting

### Common Issues
1. **Permission Errors**: Ensure proper Cockpit privileges for system file access
2. **Validation Errors**: Check required fields and format requirements
3. **Service Dependencies**: Review automatic dependency enablement
4. **Configuration Conflicts**: Use preview to validate YAML before saving

### Support
- Configuration validation provides specific error messages
- Preview functionality allows validation before deployment
- Comprehensive logging for debugging
- Fallback to backup locations if primary save fails

## Development

### Extending Configuration
1. **Add Schema Entries**: Extend `CONFIG_SCHEMA` in `config-schema.js`
2. **Add Service Definitions**: Extend `SERVICE_SCHEMA` for new services  
3. **Update Categorization**: Modify `generateYamlContent()` for new categories
4. **Test Integration**: Verify with actual OpenStack deployments

### Contributing
- Follow existing code patterns and documentation standards
- Test with multiple OpenStack configurations
- Ensure Cockpit compatibility across versions
- Validate with XAVS deployment procedures
