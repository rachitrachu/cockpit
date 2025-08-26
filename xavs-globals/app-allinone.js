// XAVS Globals Configuration - Complete Production Version
// This version includes the full XAVS configuration schema

console.log('XAVS Globals Production app starting...');

// Complete CONFIG_SCHEMA for XAVS
const CONFIG_SCHEMA = {
    network: {
        title: 'Network Configuration',
        description: 'Core networking settings for XAVS deployment',
        fields: {
            network_interface: {
                type: 'select',
                label: 'Management Network Interface',
                description: 'Primary network interface for XAVS management traffic <button type="button" class="btn btn-sm btn-outline-secondary ms-2" onclick="refreshNetworkInterfaces()" title="Refresh available interfaces"></span>Refresh</button>',
                default: 'eth0',
                required: true,
                options: ['eth0'] // Will be populated by detectNetworkInterfaces
            },
            kolla_internal_vip_address: {
                type: 'text',
                label: 'Internal VIP Address',
                description: 'Virtual IP address for internal API communication',
                default: '10.0.1.100',
                required: true,
                validation: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
            },
                kolla_internal_fqdn: {
                type: 'text',
                label: 'Internal FQDN',
                description: 'Fully qualified domain name for internal access',
                default: '{{ kolla_internal_vip_address }}',
                required: false
            },    
            neutron_external_interface: {
                type: 'select',
                label: 'Neutron External Interface',
                description: 'Network interface for external/provider networks <button type="button" class="btn btn-sm btn-outline-secondary ms-2" onclick="refreshNetworkInterfaces()" title="Refresh available interfaces"></span>Refresh</button>',
                default: 'eth1',
                required: true,
                options: ['eth1'] // Will be populated by detectNetworkInterfaces
            },
            kolla_external_vip_address: {
                type: 'text',
                label: 'External VIP Address',
                description: 'Virtual IP address for external API access',
                default: '192.168.1.100',
                required: true,
                validation: /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/
            },
            kolla_external_fqdn: {
                type: 'text',
                label: 'External FQDN',
                description: 'Fully qualified domain name for external access',
                default: '{{ kolla_external_vip_address }}',
                required: false
            },
            enable_neutron_dvr: {
                type: 'select',
                label: 'Enable Neutron DVR',
                description: 'Enable Distributed Virtual Routing for better performance',
                options: ['yes', 'no'],
                default: 'no'
            }
        }
    },
    storage: {
        title: 'Storage Configuration',
        description: 'Cinder and storage backend settings',
        fields: {
            enable_cinder: {
                type: 'select',
                label: 'Enable Cinder',
                description: 'Enable block storage service',
                options: ['yes', 'no'],
                default: 'yes',
                required: true
            },
            enable_cinder_backup: {
                type: 'select',
                label: 'Enable Cinder Backup',
                description: 'Enable volume backup service',
                options: ['yes', 'no'],
                default: 'yes'
            },
            cinder_volume_driver: {
                type: 'select',
                label: 'Volume Driver',
                description: 'Backend driver for Cinder volumes',
                options: ['lvm', 'nfs', 'ceph', 'netapp'],
                default: 'lvm'
            },
            enable_swift: {
                type: 'select',
                label: 'Enable Swift',
                description: 'Enable object storage service',
                options: ['yes', 'no'],
                default: 'no'
            }
        }
    },

    database: {
        title: 'Database Configuration',
        description: 'MariaDB and database service settings',
        fields: {
              enable_proxysql: {
                type: 'select',
                label: 'Enable ProxySQL',
                description: 'Enable ProxySQL for database load balancing',
                options: ['yes', 'no'],
                default: 'no'
            },

        }
    },

    monitoring: {
        title: 'Monitoring & Logging',
        description: 'Monitoring and logging service configuration',
        fields: {
            enable_prometheus: {
                type: 'select',
                label: 'Enable Prometheus',
                description: 'Enable Prometheus monitoring',
                options: ['yes', 'no'],
                default: 'no'
            },
            enable_grafana: {
                type: 'select',
                label: 'Enable Grafana',
                description: 'Enable Grafana dashboards',
                options: ['yes', 'no'],
                default: 'no'
            },
            enable_central_logging: {
                type: 'select',
                label: 'Enable Central Logging',
                description: 'Enable centralized log collection',
                options: ['yes', 'no'],
                default: 'no'
            },
            enable_elasticsearch: {
                type: 'select',
                label: 'Enable Elasticsearch',
                description: 'Enable Elasticsearch for log storage',
                options: ['yes', 'no'],
                default: 'no'
            }
        }
    },
    security: {
        title: 'Security Configuration',
        description: 'Security and authentication settings',
        fields: {
            keystone_admin_user: {
                type: 'text',
                label: 'Keystone Admin User',
                description: 'Administrative username for OpenStack',
                default: 'admin',
                required: true
            },
            enable_barbican: {
                type: 'select',
                label: 'Enable Barbican',
                description: 'Enable key management service',
                options: ['yes', 'no'],
                default: 'no'
            },
            enable_horizon_ssl: {
                type: 'select',
                label: 'Enable Horizon SSL',
                description: 'Enable SSL/TLS for dashboard access',
                options: ['yes', 'no'],
                default: 'yes'
            },
            kolla_enable_tls_internal: {
                type: 'select',
                label: 'Enable TLS Internal',
                description: 'Enable TLS encryption for internal API communication',
                options: ['yes', 'no'],
                default: 'no'
            },
            kolla_enable_tls_external: {
                type: 'select',
                label: 'Enable TLS External',
                description: 'Enable TLS encryption for external API access',
                options: ['yes', 'no'],
                default: 'yes'
            },
            kolla_external_fqdn_cert: {
                type: 'text',
                label: 'External FQDN Certificate Path',
                description: 'Path to SSL certificate file for external FQDN',
                default: '/etc/kolla/certificates/xloud.pem',
                required: false
            }
        }
    },
    advanced: {
        title: 'Advanced Configuration',
        description: 'Advanced service and deployment settings',
        fields: {
            enable_keepalived: {
                type: 'select',
                label: 'Enable Keepalived',
                description: 'Enable Keepalived for high availability',
                options: ['yes', 'no'],
                default: 'yes'
            },
            enable_haproxy: {
                type: 'select',
                label: 'Enable HAProxy',
                description: 'Enable HAProxy load balancer',
                options: ['yes', 'no'],
                default: 'yes'
            },
            enable_memcached: {
                type: 'select',
                label: 'Enable Memcached',
                description: 'Enable Memcached caching service',
                options: ['yes', 'no'],
                default: 'yes'
            },
            enable_haproxy_memcached: {
                type: 'select',
                label: 'Enable HAProxy Memcached',
                description: 'Enable Memcached backend for HAProxy',
                options: ['yes', 'no'],
                default: 'yes'
            },

        }
    },
    custom: {
        title: 'Custom Configuration',
        description: 'Add your own custom YAML configuration that will be appended to the generated file',
        fields: {
            custom_yaml: {
                type: 'textarea',
                label: 'Custom YAML Configuration',
                description: `<div class="custom-config-help">
                    <h6>🔧 Custom YAML Guidelines:</h6>
                    <ul>
                        <li>Use proper YAML syntax with <code>key: value</code> format</li>
                        <li>Use 2 spaces for indentation (no tabs)</li>
                        <li>For lists, use <code>- item</code> format</li>
                        <li>Avoid duplicating keys from other sections</li>
                        <li>Test your YAML syntax before saving</li>
                    </ul>
                </div>`,
                placeholder: `# Add your custom configuration here
# Example - Custom service settings:
custom_service_enabled: yes
custom_database_settings:
  max_connections: 500
  timeout: 30

# Example - Additional variables:
custom_variables:
  - name: "custom_var1"
    value: "custom_value1"
  - name: "custom_var2"
    value: "custom_value2"

# Example - Environment overrides:
environment_overrides:
  CUSTOM_ENV_VAR: "production"
  DEBUG_MODE: "false"`,
                rows: 15,
                required: false,
                validation: null
            },
            custom_comments: {
                type: 'textarea',
                label: 'Documentation & Comments',
                description: 'Add documentation explaining what your custom configuration does. This will be added as comments in the YAML file.',
                placeholder: `Document your custom configuration here:
- What does this configuration do?
- Why was it added?
- Any special requirements or dependencies?
- Contact information for questions`,
                rows: 6,
                required: false
            }
        }
    }
};

// Enhanced FormGenerator class for complete OpenStack configuration
class FormGenerator {
    constructor(containerId, schema) {
        console.log('FormGenerator constructor called with:', containerId);
        this.container = document.getElementById(containerId);
        this.schema = schema;
        this.formData = {};
        
        if (!this.container) {
            throw new Error(`Container with id '${containerId}' not found`);
        }
        
        console.log('FormGenerator initialized successfully');
    }

    async generateForm() {
        console.log('Generating complete configuration form...');
        
        try {
            let formHtml = `
                <div class="row">
                    <div class="col-12 mb-4">
                        <div class="alert alert-info">
                            <h5 class="alert-heading">XAVS Configuration</h5>
                            <p class="mb-0">Configure your XAVS deployment settings. Required fields are marked with <span class="text-danger">*</span></p>
                        </div>
                    </div>
                </div>
                
                <!-- Navigation Tabs -->
                <ul class="nav nav-tabs mb-4" id="configTabs" role="tablist">
            `;
            
            // Generate tab headers
            let isFirst = true;
            for (const [sectionKey, section] of Object.entries(this.schema)) {
                const activeClass = isFirst ? 'active' : '';
                formHtml += `
                    <li class="nav-item" role="presentation">
                        <button class="nav-link ${activeClass}" id="${sectionKey}-tab" data-bs-toggle="tab" 
                                data-bs-target="#${sectionKey}-pane" type="button" role="tab">
                            ${section.title}
                        </button>
                    </li>
                `;
                isFirst = false;
            }
            
            formHtml += '</ul><div class="tab-content" id="configTabsContent">';
            
            // Generate tab content
            isFirst = true;
            for (const [sectionKey, section] of Object.entries(this.schema)) {
                const activeClass = isFirst ? 'show active' : '';
                formHtml += `
                    <div class="tab-pane fade ${activeClass}" id="${sectionKey}-pane" role="tabpanel">
                        <div class="card">
                            <div class="card-header">
                                <h5 class="card-title mb-1">${section.title}</h5>
                                ${section.description ? `<p class="text-muted mb-0">${section.description}</p>` : ''}
                            </div>
                            <div class="card-body">
                                <div class="row">
                `;
                
                // Generate fields in a responsive grid
                for (const [fieldKey, field] of Object.entries(section.fields)) {
                    const fieldId = `${sectionKey}_${fieldKey}`;
                    const requiredMark = field.required ? '<span class="text-danger">*</span>' : '';
                    
                    // Special handling for custom configuration section
                    if (sectionKey === 'custom') {
                        formHtml += `
                            <div class="col-12 mb-4">
                                <label for="${fieldId}" class="form-label fw-bold">${field.label} ${requiredMark}</label>
                        `;
                        
                        if (field.type === 'textarea') {
                            const rows = field.rows || 4;
                            const placeholder = field.placeholder ? `placeholder="${field.placeholder.replace(/"/g, '&quot;')}"` : '';
                            formHtml += `<textarea class="form-control font-monospace" id="${fieldId}" name="${fieldId}" 
                                                   rows="${rows}" ${placeholder}
                                                   ${field.required ? 'required' : ''}>${field.default || ''}</textarea>`;
                        } else {
                            formHtml += `<input type="text" class="form-control" id="${fieldId}" name="${fieldId}" 
                                               value="${field.default || ''}" ${field.required ? 'required' : ''}>`;
                        }
                        
                        // Add help text for custom section after the input
                        if (field.description && field.description.includes('<div class="custom-config-help">')) {
                            formHtml += `<div class="mt-3">${field.description}</div>`;
                        } else if (field.description) {
                            formHtml += `<div class="form-text">${field.description}</div>`;
                        }
                        
                        formHtml += `</div>`;
                    } else {
                        // Standard field handling for other sections
                        const colClass = field.type === 'textarea' ? 'col-12' : 'col-md-6';
                        
                        formHtml += `
                            <div class="${colClass} mb-3">
                                <label for="${fieldId}" class="form-label">${field.label} ${requiredMark}</label>
                        `;
                        
                        // Generate appropriate input based on field type
                        if (field.type === 'select') {
                            formHtml += `<select class="form-control" id="${fieldId}" name="${fieldId}" ${field.required ? 'required' : ''}>`;
                            for (const option of field.options) {
                                const selected = option === field.default ? 'selected' : '';
                                formHtml += `<option value="${option}" ${selected}>${option}</option>`;
                            }
                            formHtml += `</select>`;
                        } else if (field.type === 'number') {
                            const minAttr = field.min !== undefined ? `min="${field.min}"` : '';
                            const maxAttr = field.max !== undefined ? `max="${field.max}"` : '';
                            formHtml += `<input type="number" class="form-control" id="${fieldId}" name="${fieldId}" 
                                               value="${field.default || ''}" ${minAttr} ${maxAttr} 
                                               ${field.required ? 'required' : ''}>`;
                        } else if (field.type === 'textarea') {
                            const rows = field.rows || 4;
                            const placeholder = field.placeholder ? `placeholder="${field.placeholder.replace(/"/g, '&quot;')}"` : '';
                            formHtml += `<textarea class="form-control font-monospace" id="${fieldId}" name="${fieldId}" 
                                                   rows="${rows}" ${placeholder}
                                                   ${field.required ? 'required' : ''}>${field.default || ''}</textarea>`;
                        } else {
                            // Default to text input
                            formHtml += `<input type="text" class="form-control" id="${fieldId}" name="${fieldId}" 
                                               value="${field.default || ''}" ${field.required ? 'required' : ''}>`;
                        }
                        
                        if (field.description && !field.description.includes('<div class="custom-config-help">')) {
                            formHtml += `<div class="form-text">${field.description}</div>`;
                        }
                        
                        formHtml += `</div>`;
                    }
                }
                
                formHtml += `
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                isFirst = false;
            }
            
            formHtml += '</div>';
            
            this.container.innerHTML = formHtml;
            
            // Initialize Bootstrap tabs if available, otherwise use simple click handlers
            this.initializeTabs();
            
            console.log('Complete form generated successfully');
            
        } catch (error) {
            console.error('Error generating form:', error);
            throw error;
        }
    }

    initializeTabs() {
        // Simple tab functionality without Bootstrap JS dependency
        const tabButtons = this.container.querySelectorAll('[data-bs-toggle="tab"]');
        const tabPanes = this.container.querySelectorAll('.tab-pane');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remove active classes from all tabs and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => {
                    pane.classList.remove('show', 'active');
                });
                
                // Add active class to clicked tab
                button.classList.add('active');
                
                // Show corresponding pane
                const targetId = button.getAttribute('data-bs-target');
                const targetPane = this.container.querySelector(targetId);
                if (targetPane) {
                    targetPane.classList.add('show', 'active');
                }
            });
        });
    }

    getFormData() {
        const data = {};
        const inputs = this.container.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            const parts = input.name.split('_');
            const section = parts[0];
            const field = parts.slice(1).join('_');
            
            if (!data[section]) data[section] = {};
            
            // Convert number inputs to proper type
            if (input.type === 'number') {
                data[section][field] = input.value ? parseInt(input.value) : undefined;
            } else {
                data[section][field] = input.value;
            }
        });
        
        return data;
    }

    validateForm() {
        const requiredFields = this.container.querySelectorAll('[required]');
        const errors = [];
        
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                errors.push(`${field.labels[0]?.textContent || field.name} is required`);
                field.classList.add('is-invalid');
            } else {
                field.classList.remove('is-invalid');
            }
        });
        
        return errors;
    }
}

let formGenerator = null;
let currentConfig = {};

// Show status message
function showStatus(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    const statusElement = document.getElementById('status_panel');
    if (statusElement) {
        statusElement.className = `alert alert-${type}`;
        statusElement.textContent = message;
        statusElement.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    }
}

// Enhanced YAML generation for OpenStack-Ansible
function generateYamlContent(config) {
    let yamlContent = '---\n';
    yamlContent += '# XAVS Global Configuration Variables\n';
    yamlContent += '# Generated by XAVS Globals Configuration Manager\n';
    yamlContent += `# Generated on: ${new Date().toISOString()}\n`;
    yamlContent += `# Configuration version: 1.0\n\n`;
    
    // Add header comments for each section
    const sectionComments = {
        network: 'Network and connectivity configuration',
        compute: 'Nova compute service configuration', 
        storage: 'Storage services configuration',
        database: 'Database service configuration',
        messaging: 'Message queue configuration',
        monitoring: 'Monitoring and logging configuration',
        security: 'Security and authentication configuration',
        advanced: 'Advanced deployment configuration',
        custom: 'User-defined custom configuration'
    };
    
    // Process each section
    for (const [sectionKey, sectionValue] of Object.entries(config)) {
        if (!sectionValue || Object.keys(sectionValue).length === 0) continue;
        
        yamlContent += `# ${sectionComments[sectionKey] || sectionKey.toUpperCase() + ' Configuration'}\n`;
        
        for (const [key, value] of Object.entries(sectionValue)) {
            if (value === undefined || value === null || value === '') continue;
            
            // Handle different value types appropriately
            if (typeof value === 'string') {
                // Handle template variables
                if (value.includes('{{') && value.includes('}}')) {
                    yamlContent += `${key}: ${value}\n`;
                } else if (value === 'yes' || value === 'no') {
                    yamlContent += `${key}: ${value}\n`;
                } else {
                    yamlContent += `${key}: "${value}"\n`;
                }
            } else if (typeof value === 'number') {
                yamlContent += `${key}: ${value}\n`;
            } else if (typeof value === 'boolean') {
                yamlContent += `${key}: ${value ? 'yes' : 'no'}\n`;
            } else {
                yamlContent += `${key}: "${value}"\n`;
            }
        }
        yamlContent += '\n';
    }
    
    // Add custom configuration if provided
    if (config.custom && config.custom.custom_yaml && config.custom.custom_yaml.trim()) {
        yamlContent += '# Custom Configuration Section\n';
        if (config.custom.custom_comments && config.custom.custom_comments.trim()) {
            const comments = config.custom.custom_comments.trim().split('\n');
            for (const comment of comments) {
                yamlContent += `# ${comment}\n`;
            }
        }
        yamlContent += config.custom.custom_yaml.trim() + '\n\n';
    }
    
    // Add footer comment
    yamlContent += '# End of XAVS Globals Configuration\n';
    yamlContent += '# For more advanced settings, edit this file directly or use ansible-playbook\n';
    
    return yamlContent;
}

// Enhanced save configuration with validation
async function saveConfiguration() {
    console.log('Starting enhanced save configuration...');
    showStatus('Validating configuration...', 'info');
    
    try {
        if (!formGenerator) {
            throw new Error('Form generator not initialized');
        }
        
        // Validate form first
        const validationErrors = formGenerator.validateForm();
        if (validationErrors.length > 0) {
            const errorMsg = 'Please fix the following errors:\n• ' + validationErrors.join('\n• ');
            showStatus('Validation failed. Please check required fields.', 'danger');
            console.error('Validation errors:', validationErrors);
            return;
        }
        
        showStatus('Generating configuration file...', 'info');
        
        const config = formGenerator.getFormData();
        const yamlContent = generateYamlContent(config);
        
        console.log('Generated configuration:', config);
        console.log('YAML content length:', yamlContent.length);
        
        // Create backup of existing file if it exists
        const filePath = '/etc/xavs/globals.d/_99_xavs.yml';
        const backupPath = `/etc/xavs/globals.d/_99_xavs.yml.backup.${Date.now()}`;
        
        showStatus('Creating backup and saving configuration...', 'info');
        
        try {
            // Try to backup existing file (ignore errors if file doesn't exist)
            await cockpit.spawn(['cp', filePath, backupPath], {
                superuser: 'require',
                err: 'ignore'
            });
            console.log('Backup created at:', backupPath);
        } catch (backupErr) {
            console.log('No existing file to backup (this is normal for first-time setup)');
        }
        
        // Save the new configuration
        const escapedContent = yamlContent.replace(/'/g, "'\\''");
        const command = `mkdir -p "/etc/xavs/globals.d" && echo '${escapedContent}' > "${filePath}"`;
        
        await cockpit.spawn(['bash', '-c', command], {
            superuser: 'require',
            err: 'out'
        });
        
        // Verify the file was written correctly
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const yamlFile = cockpit.file(filePath);
        const readContent = await yamlFile.read();
        
        if (readContent && readContent.length > 0) {
            console.log('Configuration saved successfully!');
            console.log('File size:', readContent.length, 'characters');
            console.log('Configuration sections saved:', Object.keys(config).length);
            
            showStatus(`Configuration saved successfully to ${filePath}`, 'success');
            
            // Show summary of what was saved
            const summary = Object.entries(config)
                .map(([section, fields]) => `${section}: ${Object.keys(fields).length} settings`)
                .join(', ');
            console.log('Saved sections:', summary);
            
            return filePath;
        } else {
            throw new Error('Configuration file was created but appears to be empty');
        }
        
    } catch (error) {
        console.error('Save configuration failed:', error);
        showStatus('Failed to save configuration: ' + error.message, 'danger');
        throw error;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('All-in-one XAVS Globals app starting...');
    showStatus('Loading configuration interface...', 'info');
    
    // Wait for cockpit API to be ready
    try {
        console.log('Waiting for cockpit API...');
        if (typeof cockpit === 'undefined') {
            showStatus('Waiting for Cockpit API to load...', 'info');
            // Wait a bit for cockpit to load
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (typeof cockpit === 'undefined') {
            throw new Error('Cockpit API not available. Make sure this page is loaded within Cockpit.');
        }
        
        console.log('Cockpit API available, initializing...');
        
        console.log('Detecting network interfaces...');
        showStatus('Detecting network interfaces...', 'info');
        await updateNetworkInterfaceOptions();
        
        console.log('Creating form generator...');
        formGenerator = new FormGenerator('dynamic_form_container', CONFIG_SCHEMA);
        
        console.log('Generating form...');
        await formGenerator.generateForm();
        
        showStatus('Configuration loaded successfully!', 'success');
        
        // Setup event listeners for all buttons
        setupEventListeners();
        
        console.log('Application initialized successfully!');
        
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showStatus('Failed to load: ' + error.message, 'danger');
    }
});

// Setup all event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Primary action buttons
    const saveBtn = document.getElementById('save');
    
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveConfiguration().catch(console.error);
        });
        console.log('Save Configuration button listener added');
    }
    
    // Secondary action buttons
    const loadBtn = document.getElementById('load_config_btn');
    const previewBtn = document.getElementById('preview_config_btn');
    const downloadBtn = document.getElementById('download_config_btn');
    const resetBtn = document.getElementById('reset_config_btn');
    
    if (loadBtn) {
        loadBtn.addEventListener('click', () => {
            loadSavedConfiguration().catch(console.error);
        });
        console.log('Load Configuration button listener added');
    }
    
    if (previewBtn) {
        previewBtn.addEventListener('click', () => {
            previewConfiguration();
        });
        console.log('Preview Configuration button listener added');
    }
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log('Download button clicked directly');
            downloadConfiguration();
        });
        console.log('Download Configuration button listener added');
    } else {
        console.warn('Download button not found!');
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetToDefaults();
        });
        console.log('Reset Configuration button listener added');
    }
    
    console.log('All event listeners configured successfully');
}

// Additional utility functions for complete module

// Preview configuration in modal or panel
function previewConfiguration() {
    console.log('Generating configuration preview...');
    showStatus('Generating preview...', 'info');
    
    try {
        if (!formGenerator) {
            throw new Error('Form generator not initialized');
        }
        
        const config = formGenerator.getFormData();
        const yamlContent = generateYamlContent(config);
        
        // Create or update preview modal
        let previewModal = document.getElementById('previewModal');
        if (!previewModal) {
            // Create modal HTML
            const modalHtml = `
                <div class="modal fade" id="previewModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Configuration Preview</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <pre id="previewContent" class="bg-light p-3" style="max-height: 500px; overflow-y: auto;"></pre>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                                <button type="button" id="modal_download_btn" class="btn btn-primary">Download YAML</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            previewModal = document.getElementById('previewModal');
            
            // Add close button functionality for both close buttons
            const closeButtons = previewModal.querySelectorAll('[data-bs-dismiss="modal"], .btn-close');
            closeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    previewModal.style.display = 'none';
                    previewModal.classList.remove('show');
                });
            });
            
            // Add download button functionality
            const modalDownloadBtn = previewModal.querySelector('#modal_download_btn');
            if (modalDownloadBtn) {
                modalDownloadBtn.addEventListener('click', () => {
                    downloadConfiguration();
                });
            }
        }
        
        // Update content and show modal
        document.getElementById('previewContent').textContent = yamlContent;
        previewModal.style.display = 'block';
        previewModal.classList.add('show');
        
        showStatus('Preview generated successfully', 'success');
        
    } catch (error) {
        console.error('Preview generation failed:', error);
        showStatus('Failed to generate preview: ' + error.message, 'danger');
    }
}

// Download configuration as YAML file
function downloadConfiguration() {
    console.log('Download configuration started...');
    showStatus('Preparing configuration download...', 'info');
    
    try {
        if (!formGenerator) {
            throw new Error('Form generator not initialized');
        }
        
        console.log('Getting form data...');
        const config = formGenerator.getFormData();
        console.log('Form data retrieved:', Object.keys(config));
        
        console.log('Generating YAML content...');
        const yamlContent = generateYamlContent(config);
        console.log('YAML content generated, length:', yamlContent.length);
        
        // Create download with better browser compatibility
        console.log('Creating blob...');
        const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
        const url = window.URL.createObjectURL(blob);
        console.log('Blob URL created:', url);
        
        // Create temporary download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `xavs_globals_${new Date().toISOString().split('T')[0]}.yml`;
        downloadLink.style.display = 'none';
        
        console.log('Download link created:', downloadLink.download);
        
        // Add to document, click, and remove
        document.body.appendChild(downloadLink);
        console.log('Link added to document, triggering click...');
        downloadLink.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(downloadLink);
            window.URL.revokeObjectURL(url);
            console.log('Download cleanup completed');
        }, 100);
        
        showStatus('Configuration downloaded successfully', 'success');
        console.log('Download process completed successfully');
        
    } catch (error) {
        console.error('Download failed:', error);
        showStatus('Failed to download configuration: ' + error.message, 'danger');
    }
}

// Load configuration from saved file and populate form
async function loadSavedConfiguration() {
    console.log('Loading saved configuration...');
    showStatus('Loading saved configuration...', 'info');
    
    try {
        const filePath = '/etc/xavs/globals.d/_99_xavs.yml';
        const yamlFile = cockpit.file(filePath);
        const content = await yamlFile.read();
        
        if (content && content.trim().length > 0) {
            console.log('Loaded configuration length:', content.length);
            
            // Parse YAML content and populate form
            const parsedConfig = parseYamlToConfig(content);
            console.log('Parsed configuration:', parsedConfig);
            
            if (parsedConfig && Object.keys(parsedConfig).length > 0) {
                populateFormFromConfig(parsedConfig);
                showStatus('Configuration loaded and applied to form successfully', 'success');
                console.log('Form populated with loaded configuration');
            } else {
                // Fallback: show in preview if parsing failed
                showConfigPreview(content);
                showStatus('Configuration loaded in preview (could not auto-populate form)', 'warning');
            }
        } else {
            showStatus('No saved configuration found', 'warning');
        }
        
    } catch (error) {
        console.error('Failed to load configuration:', error);
        showStatus('Failed to load configuration: ' + error.message, 'danger');
    }
}

// Simple YAML parser for our specific format
function parseYamlToConfig(yamlContent) {
    console.log('Parsing YAML content...');
    const config = {};
    const lines = yamlContent.split('\n');
    let customYaml = [];
    let customComments = [];
    let inCustomSection = false;
    
    try {
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            
            // Check for custom configuration section
            if (line.includes('# Custom Configuration Section')) {
                inCustomSection = true;
                continue;
            }
            
            // Check for end of configuration
            if (line.includes('# End of XAVS Globals Configuration')) {
                inCustomSection = false;
                break;
            }
            
            // Handle custom section
            if (inCustomSection) {
                if (line.startsWith('#') && !line.includes('Custom Configuration Section')) {
                    // Collect custom comments
                    customComments.push(line.substring(1).trim());
                } else if (line !== '') {
                    // Collect custom YAML
                    customYaml.push(lines[i]); // Keep original indentation
                }
                continue;
            }
            
            // Skip comments, empty lines, and YAML document markers for standard config
            if (line.startsWith('#') || line === '' || line === '---') {
                continue;
            }
            
            // Parse key-value pairs
            if (line.includes(':')) {
                const colonIndex = line.indexOf(':');
                let key = line.substring(0, colonIndex).trim();
                let value = line.substring(colonIndex + 1).trim();
                
                // Remove quotes from value
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                
                // Skip template variables
                if (value.includes('{{') && value.includes('}}')) {
                    continue;
                }
                
                // Map keys to sections based on our schema
                const section = mapKeyToSection(key);
                if (section) {
                    if (!config[section]) {
                        config[section] = {};
                    }
                    config[section][key] = value;
                }
            }
        }
        
        // Add custom configuration if found
        if (customYaml.length > 0 || customComments.length > 0) {
            config.custom = {
                custom_yaml: customYaml.join('\n'),
                custom_comments: customComments.join('\n')
            };
        }
        
        console.log('YAML parsing completed, found sections:', Object.keys(config));
        return config;
        
    } catch (error) {
        console.error('YAML parsing failed:', error);
        return null;
    }
}

// Map configuration keys to their sections
function mapKeyToSection(key) {
    const keyMappings = {
        // Network section
        'network_interface': 'network',
        'kolla_internal_vip_address': 'network',
        'kolla_internal_fqdn': 'network',
        'kolla_external_vip_address': 'network',
        'kolla_external_fqdn': 'network',
        'neutron_external_interface': 'network',
        'enable_neutron_dvr': 'network',
        
        // Compute section
        'nova_compute_virt_type': 'compute',
        'nova_vncproxy_host': 'compute',
        'enable_nova_fake_driver': 'compute',
        
        // Storage section
        'enable_cinder': 'storage',
        'enable_cinder_backup': 'storage',
        'cinder_volume_driver': 'storage',
        'enable_swift': 'storage',
        
        // Database section
        'enable_mariadb': 'database',
        'enable_mariabackup': 'database',
        'enable_mariadb_clustercheck': 'database',
        'enable_proxysql': 'database',
        'database_max_timeout': 'database',
        'mariadb_server_id': 'database',
        
     
        // Monitoring section
        'enable_prometheus': 'monitoring',
        'enable_grafana': 'monitoring',
        'enable_central_logging': 'monitoring',
        'enable_elasticsearch': 'monitoring',
        
        // Security section
        'keystone_admin_user': 'security',
        'enable_barbican': 'security',
        'keystone_token_provider': 'security',
        'enable_horizon_ssl': 'security',
        'kolla_enable_tls_internal': 'security',
        'kolla_enable_tls_external': 'security',
        'kolla_external_fqdn_cert': 'security',
        
        // Advanced section
        'enable_haproxy': 'advanced',
        'enable_keepalived': 'advanced',
        'enable_memcached': 'advanced',
        'enable_haproxy_memcached': 'advanced'
    };
    
    return keyMappings[key] || null;
}

// Populate form fields from parsed configuration
function populateFormFromConfig(config) {
    console.log('Populating form from configuration...');
    
    if (!formGenerator || !formGenerator.container) {
        console.error('Form generator not available');
        return;
    }
    
    try {
        for (const [section, fields] of Object.entries(config)) {
            for (const [key, value] of Object.entries(fields)) {
                const fieldId = `${section}_${key}`;
                const field = formGenerator.container.querySelector(`#${fieldId}`);
                
                if (field) {
                    if (field.type === 'number') {
                        field.value = parseInt(value) || 0;
                    } else {
                        field.value = value;
                    }
                    console.log(`Set ${fieldId} = ${value}`);
                } else {
                    console.warn(`Field not found: ${fieldId}`);
                }
            }
        }
        
        console.log('Form population completed');
        
    } catch (error) {
        console.error('Form population failed:', error);
        throw error;
    }
}

// Show configuration in preview modal (fallback)
function showConfigPreview(content) {
    let previewModal = document.getElementById('previewModal');
    if (!previewModal) {
        previewConfiguration(); // Create the modal
        previewModal = document.getElementById('previewModal');
    }
    
    document.getElementById('previewContent').textContent = content;
    previewModal.style.display = 'block';
    previewModal.classList.add('show');
}

// Reset configuration to defaults
// Refresh network interfaces and update dropdowns
async function refreshNetworkInterfaces() {
    try {
        showStatus('Refreshing network interfaces...', 'info');
        console.log('Refreshing network interfaces...');
        
        // Detect interfaces again
        const interfaces = await detectNetworkInterfaces();
        
        // Update the CONFIG_SCHEMA
        await updateNetworkInterfaceOptions();
        
        // Update the dropdowns in the current form
        const networkInterfaceSelect = document.getElementById('network_network_interface');
        const neutronInterfaceSelect = document.getElementById('network_neutron_external_interface');
        
        if (networkInterfaceSelect) {
            const currentValue = networkInterfaceSelect.value;
            networkInterfaceSelect.innerHTML = '';
            
            interfaces.forEach(iface => {
                const option = document.createElement('option');
                option.value = iface;
                option.textContent = iface;
                option.selected = (iface === currentValue);
                networkInterfaceSelect.appendChild(option);
            });
            
            // If current value is not in new list, select first option
            if (!interfaces.includes(currentValue) && interfaces.length > 0) {
                networkInterfaceSelect.value = interfaces[0];
            }
        }
        
        if (neutronInterfaceSelect) {
            const currentValue = neutronInterfaceSelect.value;
            neutronInterfaceSelect.innerHTML = '';
            
            interfaces.forEach(iface => {
                const option = document.createElement('option');
                option.value = iface;
                option.textContent = iface;
                option.selected = (iface === currentValue);
                neutronInterfaceSelect.appendChild(option);
            });
            
            // If current value is not in new list, select first or second option
            if (!interfaces.includes(currentValue) && interfaces.length > 0) {
                neutronInterfaceSelect.value = interfaces[1] || interfaces[0];
            }
        }
        
        showStatus(`Network interfaces refreshed - ${interfaces.length} interfaces found`, 'success');
        console.log('Network interfaces refreshed successfully:', interfaces);
        
    } catch (error) {
        console.error('Failed to refresh network interfaces:', error);
        showStatus('Failed to refresh network interfaces: ' + error.message, 'danger');
    }
}

// Network Interface Detection
async function detectNetworkInterfaces() {
    try {
        console.log('Detecting network interfaces...');
        
        // Use multiple commands to get comprehensive interface information
        const result = await cockpit.spawn([
            'bash', '-c', 
            'ip link show | grep "^[0-9]" | awk -F": " \'{print $2}\' | grep -v "^lo$" | sort'
        ], { 
            superuser: 'try',
            err: 'message'
        });
        
        const interfaces = result.trim().split('\n').filter(iface => 
            iface && 
            iface.length > 0 && 
            !iface.includes('lo') && 
            !iface.includes('@')
        );
        
        console.log('Detected interfaces:', interfaces);
        
        // If no interfaces detected, provide common defaults
        if (interfaces.length === 0) {
            console.log('No interfaces detected, using defaults');
            return ['eth0', 'eth1', 'ens3', 'ens4', 'enp0s3', 'enp0s8'];
        }
        
        return interfaces;
    } catch (error) {
        console.error('Failed to detect network interfaces:', error);
        showStatus('Could not detect network interfaces, using defaults', 'warning');
        
        // Return common interface names as fallback
        return ['eth0', 'eth1', 'ens3', 'ens4', 'enp0s3', 'enp0s8', 'eno1', 'eno2'];
    }
}

// Update network interface options in CONFIG_SCHEMA
async function updateNetworkInterfaceOptions() {
    try {
        const interfaces = await detectNetworkInterfaces();
        
        // Update network_interface field
        if (CONFIG_SCHEMA.network && CONFIG_SCHEMA.network.fields && CONFIG_SCHEMA.network.fields.network_interface) {
            CONFIG_SCHEMA.network.fields.network_interface.type = 'select';
            CONFIG_SCHEMA.network.fields.network_interface.options = interfaces;
            CONFIG_SCHEMA.network.fields.network_interface.default = interfaces[0] || 'eth0';
        }
        
        // Update neutron_external_interface field
        if (CONFIG_SCHEMA.network && CONFIG_SCHEMA.network.fields && CONFIG_SCHEMA.network.fields.neutron_external_interface) {
            CONFIG_SCHEMA.network.fields.neutron_external_interface.type = 'select';
            CONFIG_SCHEMA.network.fields.neutron_external_interface.options = interfaces;
            CONFIG_SCHEMA.network.fields.neutron_external_interface.default = interfaces[1] || interfaces[0] || 'eth1';
        }
        
        console.log('Updated network interface options:', interfaces);
        return interfaces;
    } catch (error) {
        console.error('Failed to update network interface options:', error);
        return [];
    }
}

function resetToDefaults() {
    if (confirm('Are you sure you want to reset all settings to their default values? This action cannot be undone.')) {
        console.log('Resetting configuration to defaults...');
        showStatus('Resetting to defaults...', 'info');
        
        try {
            // Reload the form which will restore all default values
            if (formGenerator) {
                formGenerator.generateForm().then(() => {
                    showStatus('Configuration reset to defaults', 'success');
                });
            }
        } catch (error) {
            console.error('Reset failed:', error);
            showStatus('Failed to reset configuration: ' + error.message, 'danger');
        }
    }
}

// Export functions for global access
window.saveConfiguration = saveConfiguration;
window.previewConfiguration = previewConfiguration;
window.downloadConfiguration = downloadConfiguration;
window.loadSavedConfiguration = loadSavedConfiguration;
window.resetToDefaults = resetToDefaults;
window.detectNetworkInterfaces = detectNetworkInterfaces;
window.updateNetworkInterfaceOptions = updateNetworkInterfaceOptions;
window.refreshNetworkInterfaces = refreshNetworkInterfaces;
