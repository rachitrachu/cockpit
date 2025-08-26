/* 
 * XAVS Globals Configuration
 * Cockpit-compatible version with comprehensive OpenStack configuration
 */

// Cockpit integration
const cockpit = typeof window.cockpit !== 'undefined' ? window.cockpit : {
    file: (path) => ({
        read: () => Promise.resolve(''),
        replace: (content) => Promise.resolve()
    }),
    spawn: (cmd, options) => ({
        done: () => Promise.resolve()
    })
};

// Global state
let currentConfig = {};
let allYmlContent = '';
let formGenerator = null;

// Initialize the application
function init() {
    console.log('XAVS Globals Configuration initializing...');
    
    // Check if schemas are loaded
    if (typeof CONFIG_SCHEMA === 'undefined' || typeof SERVICE_SCHEMA === 'undefined') {
        console.error('Configuration schemas not loaded. Please include config-schema.js');
        showStatus('Error: Configuration schemas not loaded', 'danger');
        return;
    }

    // Check if FormGenerator is available
    if (typeof FormGenerator === 'undefined') {
        console.error('FormGenerator not loaded. Please include form-generator.js');
        showStatus('Error: Form generator not loaded', 'danger');
        return;
    }

    try {
        // Initialize form generator
        formGenerator = new FormGenerator('dynamic_form_container', CONFIG_SCHEMA, SERVICE_SCHEMA);
        formGenerator.generateForm();
        
        // Load current configuration
        loadConfiguration();
        
        // Set up event handlers for action buttons
        setupEventHandlers();
        
        console.log('Initialization complete');
        showStatus('Application initialized successfully', 'success');
        
    } catch (error) {
        console.error('Error during initialization:', error);
        showStatus('Error during initialization: ' + error.message, 'danger');
    }
}

// Load configuration from all.yml
function loadConfiguration() {
    const yamlFile = cockpit.file('/etc/xavs/globals.d/99_xavs.yml');
    
    yamlFile.read()
        .then(content => {
            allYmlContent = content || '';
            parseAndPopulateForm(allYmlContent);
        })
        .catch(err => {
            console.log('Could not read /etc/xavs/globals.d/99_xavs.yml, using defaults:', err);
            setDefaultValues();
        });
}

// Parse YAML content and populate form (simplified parser)
function parseAndPopulateForm(yamlContent) {
    const lines = yamlContent.split('\n');
    const config = {};
    
    // Simple YAML parser for key: value pairs
    lines.forEach(line => {
        const match = line.match(/^([^#]+?):\s*(.+?)(?:\s*#.*)?$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            
            // Handle quoted strings
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                value = value.slice(1, -1);
            }
            
            // Handle boolean values
            if (value === 'yes' || value === 'true') {
                value = true;
            } else if (value === 'no' || value === 'false') {
                value = false;
            }
            
            config[key] = value;
        }
    });
    
    // Populate form using form generator
    if (formGenerator) {
        formGenerator.setFormData(config);
    }
    
    currentConfig = config;
    console.log('Configuration loaded:', config);
}

// Set default values
function setDefaultValues() {
    if (formGenerator) {
        formGenerator.resetForm();
    }
    
    console.log('Default values set');
}

// Set up event handlers
function setupEventHandlers() {
    // Save button
    const saveBtn = document.getElementById('save');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveConfiguration);
    }
    
    // Preview button
    const previewBtn = document.getElementById('preview');
    if (previewBtn) {
        previewBtn.addEventListener('click', previewConfiguration);
    }
    
    // View saved file button
    const viewBtn = document.getElementById('view_saved');
    if (viewBtn) {
        viewBtn.addEventListener('click', viewSavedFile);
    }
    
    // Reset button
    const resetBtn = document.getElementById('reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetForm);
    }
}

// Save configuration
function saveConfiguration() {
    try {
        if (!formGenerator) {
            throw new Error('Form generator not initialized');
        }

        // Validate form
        const validation = formGenerator.validateForm();
        if (!validation.isValid) {
            const errorMsg = 'Please fix the following errors:\n' + validation.errors.join('\n');
            showStatus(errorMsg, 'danger');
            return;
        }
        
        // Collect form data
        const config = formGenerator.getFormData();
        const yamlContent = generateYamlContent(config);
        
        console.log('Attempting to save configuration...', config);
        showStatus('Saving configuration...', 'info');
        
        // Create directory first if it doesn't exist
        const dirCommand = cockpit.spawn(['mkdir', '-p', '/etc/xavs/globals.d'], { superuser: "require" });
        
        dirCommand.done(() => {
            // Directory created or already exists, now save the file
            const yamlFile = cockpit.file('/etc/xavs/globals.d/99_xavs.yml');
            yamlFile.replace(yamlContent)
                .then(() => {
                    console.log('Configuration saved successfully');
                    showStatus('Configuration saved successfully to /etc/xavs/globals.d/99_xavs.yml', 'success');
                    currentConfig = config;
                    
                    // Also log the file path for easy reference
                    console.log('File saved to: /etc/xavs/globals.d/99_xavs.yml');
                    console.log('Generated YAML content length:', yamlContent.length);
                })
                .catch(err => {
                    console.error('Error saving configuration:', err);
                    showStatus('Error saving configuration: ' + err.message, 'danger');
                    
                    // Try alternative path if the primary fails
                    if (err.message.includes('Permission denied') || err.message.includes('not found')) {
                        showStatus('Trying alternative save location...', 'warning');
                        
                        // Try saving to a backup location
                        const backupFile = cockpit.file('/tmp/xavs-globals.yml.backup');
                        backupFile.replace(yamlContent)
                            .then(() => {
// Save configuration
function saveConfiguration() {
    try {
        if (!formGenerator) {
            throw new Error('Form generator not initialized');
        }

        // Validate form
        const validation = formGenerator.validateForm();
        if (!validation.isValid) {
            const errorMsg = 'Please fix the following errors:\n' + validation.errors.join('\n');
            showStatus(errorMsg, 'danger');
            return;
        }
        
        // Collect form data
        const config = formGenerator.getFormData();
        const yamlContent = generateYamlContent(config);
        
        console.log('Attempting to save configuration...', config);
        showStatus('Saving configuration...', 'info');
        
        // Create directory first if it doesn't exist
        const dirCommand = cockpit.spawn(['mkdir', '-p', '/etc/xavs/globals.d'], { superuser: "require" });
        
        dirCommand.done(() => {
            // Directory created or already exists, now save the file
            const yamlFile = cockpit.file('/etc/xavs/globals.d/99_xavs.yml');
            yamlFile.replace(yamlContent)
                .then(() => {
                    console.log('Configuration saved successfully');
                    showStatus('Configuration saved successfully to /etc/xavs/globals.d/99_xavs.yml', 'success');
                    currentConfig = config;
                    
                    // Also log the file path for easy reference
                    console.log('File saved to: /etc/xavs/globals.d/99_xavs.yml');
                    console.log('Generated YAML content length:', yamlContent.length);
                })
                .catch(err => {
                    console.error('Error saving configuration:', err);
                    showStatus('Error saving configuration: ' + err.message, 'danger');
                    
                    // Try alternative path if the primary fails
                    if (err.message.includes('Permission denied') || err.message.includes('not found')) {
                        showStatus('Trying alternative save location...', 'warning');
                        
                        // Try saving to a backup location
                        const backupFile = cockpit.file('/tmp/xavs-globals.yml.backup');
                        backupFile.replace(yamlContent)
                            .then(() => {
                                showStatus('Configuration saved to backup location: /tmp/xavs-globals.yml.backup', 'warning');
                            })
                            .catch(backupErr => {
                                console.error('Backup save also failed:', backupErr);
                                showStatus('Failed to save even to backup location', 'danger');
                            });
                    }
                });
        })
        .fail(dirErr => {
            console.error('Error creating directory:', dirErr);
            showStatus('Error creating directory /etc/xavs/globals.d: ' + dirErr.message, 'danger');
        });
            
    } catch (error) {
        console.error('Error in saveConfiguration:', error);
        showStatus('Error: ' + error.message, 'danger');
    }
}

// Preview configuration
function previewConfiguration() {
    try {
// Preview configuration
function previewConfiguration() {
    try {
        if (!formGenerator) {
            throw new Error('Form generator not initialized');
        }
        
        const config = formGenerator.getFormData();
        const yamlContent = generateYamlContent(config);
        
        const previewPanel = document.getElementById('yaml_preview_panel');
        const previewContent = document.getElementById('yaml_preview');
        
        if (previewPanel && previewContent) {
            previewContent.textContent = yamlContent;
            previewPanel.style.display = 'block';
            previewPanel.classList.remove('hidden');
        }
        
        showStatus('Configuration preview generated successfully', 'info');
        
    } catch (error) {
        showStatus('Error generating preview: ' + error.message, 'danger');
    }
}

// View the saved configuration file
function viewSavedFile() {
    showStatus('Loading saved configuration file...', 'info');
    
    const yamlFile = cockpit.file('/etc/xavs/globals.d/99_xavs.yml');
    yamlFile.read()
        .then(content => {
            const previewPanel = document.getElementById('yaml_preview_panel');
            const previewContent = document.getElementById('yaml_preview');
            
            if (previewPanel && previewContent) {
                if (content && content.trim()) {
                    previewContent.textContent = content;
                    previewPanel.style.display = 'block';
                    previewPanel.classList.remove('hidden');
                    showStatus('Showing current saved file: /etc/xavs/globals.d/99_xavs.yml', 'success');
                } else {
                    showStatus('No saved configuration found at /etc/xavs/globals.d/99_xavs.yml', 'warning');
                }
            }
        })
        .catch(err => {
            console.error('Error reading saved file:', err);
            showStatus('Error reading saved file: ' + err.message + '. File may not exist yet.', 'danger');
        });
}

// Reset form to defaults
function resetForm() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
        if (formGenerator) {
            formGenerator.resetForm();
        }
        showStatus('Form reset to defaults', 'info');
    }
}

// Generate YAML content (only user configurations)
function generateYamlContent(config) {
    let yaml = '---\n';
    yaml += '# XAVS Global Configuration Overrides\n';
    yaml += '# Generated by XAVS Globals Configuration Tool\n';
    yaml += '# File: /etc/xavs/globals.d/99_xavs.yml\n';
    yaml += '# Date: ' + new Date().toISOString() + '\n';
    yaml += '#\n';
    yaml += '# This file contains ONLY user-configured overrides.\n';
    yaml += '# It will override matching settings in all.yml and other config files.\n';
    yaml += '# The "99_" prefix ensures this loads last and takes precedence.\n';
    yaml += '# Only enabled services and custom values are included.\n';
    yaml += '#\n';
    yaml += '\n';
    
    // Organize configuration by sections
    const sections = {
        'OpenStack Configuration': [],
        'Network Configuration': [],
        'Container Configuration': [],
        'Database Configuration': [],
        'Messaging Configuration': [],
        'Security Configuration': [],
        'Storage Configuration': [],
        'Monitoring Configuration': [],
        'Service Ports': [],
        'Advanced Configuration': [],
        'Enabled Services': []
    };
    
    // Categorize configuration values
    Object.keys(config).forEach(key => {
        const value = config[key];
        if (!value) return; // Skip empty values
        
        // Skip boolean false values (only include enabled services)
        if (value === false || value === 'no') return;
        
        // Format value for YAML
        let yamlValue;
        if (typeof value === 'boolean' || value === 'yes' || value === 'no') {
            yamlValue = value === true || value === 'yes' ? 'yes' : 'no';
        } else if (typeof value === 'number') {
            yamlValue = value.toString();
        } else {
            yamlValue = `"${value}"`;
        }
        
        const line = `${key}: ${yamlValue}`;
        
        // Categorize by key patterns
        if (key.startsWith('enable_')) {
            sections['Enabled Services'].push(line);
        } else if (key.includes('network') || key.includes('interface') || key.includes('vip') || key.includes('neutron_external')) {
            sections['Network Configuration'].push(line);
        } else if (key.includes('docker') || key.includes('container') || key.includes('kolla_base') || key.includes('registry')) {
            sections['Container Configuration'].push(line);
        } else if (key.includes('database') || key.includes('mariadb')) {
            sections['Database Configuration'].push(line);
        } else if (key.includes('rabbit') || key.includes('om_rpc') || key.includes('om_notify')) {
            sections['Messaging Configuration'].push(line);
        } else if (key.includes('tls') || key.includes('cert') || key.includes('ssl')) {
            sections['Security Configuration'].push(line);
        } else if (key.includes('cinder') || key.includes('swift') || key.includes('manila') || key.includes('volume')) {
            sections['Storage Configuration'].push(line);
        } else if (key.includes('prometheus') || key.includes('grafana') || key.includes('healthcheck')) {
            sections['Monitoring Configuration'].push(line);
        } else if (key.includes('port') && !key.includes('support')) {
            sections['Service Ports'].push(line);
        } else if (key.includes('openstack') || key.includes('region')) {
            sections['OpenStack Configuration'].push(line);
        } else {
            sections['Advanced Configuration'].push(line);
        }
    });
    
    // Generate YAML sections
    Object.keys(sections).forEach(sectionName => {
        const sectionLines = sections[sectionName];
        if (sectionLines.length > 0) {
            yaml += `# ${sectionName}\n`;
            sectionLines.forEach(line => {
                yaml += `${line}\n`;
            });
            yaml += '\n';
        }
    });
    
    // Add footer
    yaml += '# End of XAVS Global Overrides\n';
    yaml += '# This file will be merged with other OpenStack configurations\n';
    yaml += '# Values here take precedence over defaults in all.yml\n';
    
    return yaml;
}

// Utility functions
function showStatus(message, type) {
    const statusDiv = document.getElementById('save_status');
    if (statusDiv) {
        statusDiv.className = `alert alert-${type}`;
        statusDiv.textContent = message;
        statusDiv.style.display = 'block';
        
        // Remove hidden class if present
        statusDiv.classList.remove('hidden');
        
        // Scroll to top to make status visible
        statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        console.log('Status displayed:', message, type);
        
        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
                statusDiv.classList.add('hidden');
            }, 5000);
        }
    } else {
        console.warn('Status div not found');
        // Fallback to console and alert
        console.log('Status:', message, type);
        if (type === 'danger') {
            alert('Error: ' + message);
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export functions for module interaction
window.XavsGlobals = {
    init,
    loadConfiguration,
    saveConfiguration,
    previewConfiguration,
    viewSavedFile,
    resetForm,
    formGenerator: () => formGenerator
};
