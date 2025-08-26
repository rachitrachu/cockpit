# XAVS Globals OpenStack Configuration Generator

A comprehensive web application for generating OpenStack-Ansible configuration files based on the complete all.yml template. This tool provides a dynamic, user-friendly interface for configuring all aspects of an OpenStack deployment.

## Features

### ✨ Comprehensive Configuration Coverage
- **Network Configuration**: Management networks, tenant networks, provider networks, overlay networks
- **Container Configuration**: LXC settings, container networking, security configurations  
- **OpenStack Services**: Complete service catalog with dependencies and advanced options
- **Database Configuration**: MariaDB/Galera clustering, backup, performance tuning
- **Messaging Configuration**: RabbitMQ clustering, SSL, monitoring
- **Security Configuration**: SSL/TLS, Keystone, security groups, compliance settings
- **Storage Configuration**: Cinder, Swift, Ceph integration, backup policies
- **Monitoring Configuration**: Logging, metrics, alerting, performance monitoring
- **Service Port Configuration**: Complete port mapping for all OpenStack services
- **Advanced Configuration**: Performance tuning, debugging, development settings

### 🎛️ Dynamic Interface
- **Tabbed Organization**: Logically organized configuration sections
- **Smart Forms**: Dynamic form generation based on configuration schema
- **Real-time Validation**: Input validation with immediate feedback
- **Service Dependencies**: Automatic handling of service interdependencies
- **Responsive Design**: Mobile-friendly interface with Bootstrap 5

### 📋 Service Management
Organized into logical categories:
- **Core Services**: Essential OpenStack components (Keystone, Nova, Neutron, etc.)
- **Storage Services**: Cinder, Swift, Manila, Barbican
- **Network Services**: Neutron plugins, LBaaS, VPNaaS, FWaaS
- **Additional Services**: Heat, Horizon, Magnum, Octavia, etc.
- **Monitoring Services**: Gnocchi, Aodh, Ceilometer, Panko
- **Infrastructure Services**: HAProxy, Memcached, RabbitMQ, MariaDB

## Architecture

### Core Components

#### 1. Configuration Schema (`config-schema.js`)
- Comprehensive schema defining all OpenStack configuration options
- Service definitions with dependencies and requirements
- Validation patterns and data types
- Default values and constraints

#### 2. Form Generator (`form-generator.js`)
- Dynamic form generation engine
- Handles complex form layouts and validation
- Manages service dependencies and conditional fields
- Creates tabbed interface for organized configuration

#### 3. Main Application (`app.js`)
- Orchestrates the configuration process
- Integrates form generation with YAML output
- Handles file parsing and data management
- Generates categorized YAML configurations

#### 4. User Interface (`index.html`)
- Modern Bootstrap 5 interface
- Responsive design for all devices
- Dynamic content areas for forms and previews
- Accessible navigation and controls

## Getting Started

### Prerequisites
- Modern web browser with JavaScript enabled
- Web server for local development (optional)

### Installation
1. Clone or download the project files
2. Open `index.html` in a web browser
3. Start configuring your OpenStack deployment

### Usage

#### 1. **Parse Existing Configuration**
- Upload an existing `all.yml` file to populate the form
- The system will automatically categorize and display current settings
- Override specific values as needed

#### 2. **Configure Services**
- Navigate through the tabbed interface
- Configure each section according to your requirements
- The system validates inputs and shows dependencies

#### 3. **Generate Configuration**
- Click "Generate YAML" to create your configuration
- The output is organized into logical sections
- Download or copy the generated configuration

#### 4. **Validate and Deploy**
- Use the built-in validation features
- Export for use with OpenStack-Ansible deployment tools

## Configuration Sections

### Network Configuration
- **Management Networks**: Control plane networking
- **Tunnel Networks**: Overlay network configuration  
- **Storage Networks**: Storage traffic isolation
- **Provider Networks**: External connectivity

### OpenStack Services
- **Identity (Keystone)**: Authentication and authorization
- **Compute (Nova)**: Virtual machine management
- **Networking (Neutron)**: Software-defined networking
- **Storage (Cinder/Swift)**: Block and object storage
- **Orchestration (Heat)**: Infrastructure as code
- **Dashboard (Horizon)**: Web-based management interface

### Advanced Configuration
- **High Availability**: Clustering and failover
- **Security**: SSL/TLS, encryption, compliance
- **Performance**: Tuning and optimization
- **Monitoring**: Logging, metrics, and alerting

## File Structure

```
xavs-globals/
├── index.html              # Main application interface
├── app.js                  # Core application logic
├── config-schema.js        # Configuration schema definitions
├── form-generator.js       # Dynamic form generation engine
├── style.css              # Enhanced styling and responsive design
├── README.md              # This documentation
└── all.yml               # Sample OpenStack-Ansible configuration
```

## Configuration Schema

The application uses a comprehensive schema that covers:

- **10 Major Configuration Categories**: Network, Container, OpenStack, Database, Messaging, Security, Storage, Monitoring, Ports, Advanced
- **6 Service Categories**: Core, Storage, Network, Additional, Monitoring, Infrastructure
- **300+ Configuration Options**: Covering all aspects of OpenStack deployment
- **Validation Rules**: Ensuring configuration integrity
- **Dependency Management**: Handling service interdependencies

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Development

### Adding New Configuration Options
1. Update `config-schema.js` with new options
2. Add validation rules and dependencies
3. The form generator will automatically create the interface

### Customizing the Interface
1. Modify `style.css` for styling changes
2. Update `form-generator.js` for layout modifications
3. Extend `app.js` for additional functionality

### Extending Service Support
1. Add service definitions to the SERVICE_SCHEMA
2. Define dependencies and requirements
3. Update validation logic as needed

## Contributing

1. Follow the existing code structure and naming conventions
2. Add validation for new configuration options
3. Update documentation for new features
4. Test with various OpenStack deployment scenarios

## License

This project is part of the Cockpit project and follows the same licensing terms.

## Support

For issues and questions:
1. Check the configuration schema for validation rules
2. Verify service dependencies are met
3. Ensure input formats match expected patterns
4. Review browser console for detailed error messages

## Version History

- **v2.0.0**: Complete rewrite with comprehensive configuration support
  - Dynamic form generation
  - Full all.yml coverage
  - Modern responsive interface
  - Service dependency management
  
- **v1.0.0**: Initial basic service configuration
  - Simple service toggles
  - Basic YAML generation
  - Static form interface

---

**Note**: This application generates configuration files for OpenStack-Ansible deployments. Always validate generated configurations in a test environment before production deployment.
