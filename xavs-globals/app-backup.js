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
    
    // Check permissions button
    const checkBtn = document.getElementById('check_permissions');
    if (checkBtn) {
        checkBtn.addEventListener('click', checkFileSystem);
    }
    
    const testBtn = document.getElementById('test_write');
    if (testBtn) {
        testBtn.addEventListener('click', testFileWrite);
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
        console.log('Generated YAML content preview (first 500 chars):', yamlContent.substring(0, 500));
        console.log('Full YAML content length:', yamlContent.length);
        console.log('YAML content type:', typeof yamlContent);
        
        if (!yamlContent || yamlContent.length === 0) {
            showStatus('Error: Generated YAML content is empty', 'danger');
            return;
        }
        
        showStatus('Saving configuration...', 'info');
        
        // BYPASS cockpit.file().replace() completely - it's buggy and creates empty files
        console.log('🔧 Skipping cockpit.file().replace() due to empty file bug, using direct write only...');
        
        tryDirectFileWrite('/etc/xavs/globals.d/99_xavs.yml', yamlContent)
            .then((savedPath) => {
                console.log('✅ Successfully saved using direct write to:', savedPath);
                showStatus(`Configuration saved successfully to ${savedPath}`, 'success');
                currentConfig = config;
            })
            .catch((directWriteErr) => {
                console.log('🔄 Direct write failed, trying alternative locations...');
                console.error('Direct write error:', directWriteErr);
                tryAlternativeLocations(yamlContent);
            });
            
    } catch (error) {
        console.error('Error in saveConfiguration:', error);
        showStatus('Error: ' + error.message, 'danger');
    }
}

// Helper function to try alternative save locations
function tryAlternativeLocations(yamlContent) {
    console.log('Trying alternative save locations...');
    
    // List of alternative locations to try
    const alternativeLocations = [
        '/tmp/xavs-globals.yml',               // Temporary location without superuser
        '~/xavs-globals-config.yml',           // User home directory
        '/var/tmp/xavs-globals.yml',           // Alternative temp location
        '/etc/kolla/globals.d/99_xavs.yml',    // Kolla's standard location
        './xavs-globals.yml'                   // Local directory (if accessible)
    ];
    
    let currentIndex = 0;
    
    function tryNextLocation() {
        if (currentIndex >= alternativeLocations.length) {
            showStatus('Failed to save configuration to any location', 'danger');
            return;
        }
        
        const location = alternativeLocations[currentIndex];
        console.log(`Trying location ${currentIndex + 1}/${alternativeLocations.length}: ${location}`);
        showStatus(`Trying alternative location: ${location}`, 'info');
        
        console.log(`🔧 Using direct write for ${location} (bypassing cockpit.file bug)...`);
        
        // Use direct write method to avoid the cockpit.file().replace() bug
        tryDirectFileWrite(location, yamlContent)
            .then(() => {
                console.log(`✅ Successfully saved to alternative location: ${location}`);
                showStatus(`Configuration saved successfully to: ${location}`, 'success');
                // Success! Configuration is now saved.
            })
            .catch((writeErr) => {
                console.log(`❌ Failed to save to ${location}:`, writeErr.message || writeErr);
                currentIndex++;
                tryNextLocation(); // Try the next location
            });
    }
    
    tryNextLocation();
}

// Try direct file write using cockpit.spawn (following xos-networking pattern)
function tryDirectFileWrite(filePath, content) {
    console.log(`Attempting direct file write to: ${filePath}`);
    showStatus(`Trying direct file write method...`, 'info');
    
    return new Promise((resolve, reject) => {
        console.log('🔧 Using xos-networking proven pattern...');
        
        // Use a simpler escaping pattern to avoid quote issues
        const escapedContent = content.replace(/'/g, "'\\''");
        const command = `mkdir -p "${filePath.substring(0, filePath.lastIndexOf('/'))}" && echo '${escapedContent}' > "${filePath}"`;
        
        console.log('� Writing file using proven bash pattern...');
        console.log('📁 Target file:', filePath);
        console.log('� Content length:', content.length);
        
        const writeCmd = cockpit.spawn(['bash', '-c', command], { 
            superuser: 'require',
            err: 'out'
        });
        
        // Use Promise-based API instead of .done()/.fail()
        writeCmd.then(() => {
            console.log('✅ Direct write completed successfully');
            showStatus('Direct write successful, verifying...', 'info');
            
            // Verify the file was written correctly
            setTimeout(() => {
                const yamlFile = cockpit.file(filePath);
                yamlFile.read()
                    .then(readContent => {
                        if (readContent && readContent.length > 0) {
                            console.log('✅ SUCCESS! File saved with content length:', readContent.length);
                            console.log('📄 First 100 chars:', readContent.substring(0, 100));
                            showStatus(`Configuration saved successfully to ${filePath}`, 'success');
                            resolve(filePath);
                        } else {
                            console.error('❌ File exists but is empty after write');
                            reject(new Error('File written but empty'));
                        }
                    })
                    .catch(readErr => {
                        console.error('❌ Cannot read back file:', readErr);
                        reject(readErr);
                    });
            }, 500);
        }).catch(writeErr => {
            console.error('❌ Direct write failed:', writeErr);
            console.error('❌ Error details:', writeErr.message || writeErr);
            console.error('❌ Exit status:', writeErr.exit_status);
            reject(writeErr);
        });
    });
}

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
    checkFileSystem,
    formGenerator: () => formGenerator
};

// Check file system permissions and directories
function checkFileSystem() {
    console.log('Starting file system diagnostic...');
    showStatus('Checking file system permissions and directories...', 'info');
    
    const locationsToCheck = [
        '/etc/xavs/globals.d/',
        '/etc/kolla/globals.d/',
        '/tmp/',
        '/etc/xavs/',
        '/etc/kolla/'
    ];
    
    let checkIndex = 0;
    const results = [];
    
    function checkNextLocation() {
        if (checkIndex >= locationsToCheck.length) {
            // Display results
            console.log('File system diagnostic complete:', results);
            
            const accessibleDirs = results.filter(r => r.accessible).map(r => r.path);
            const inaccessibleDirs = results.filter(r => !r.accessible).map(r => r.path);
            
            let message = 'File System Diagnostic Results:\n\n';
            if (accessibleDirs.length > 0) {
                message += 'Accessible directories:\n' + accessibleDirs.join('\n') + '\n\n';
            }
            if (inaccessibleDirs.length > 0) {
                message += 'Inaccessible directories:\n' + inaccessibleDirs.join('\n');
            }
            
            showStatus(message, accessibleDirs.length > 0 ? 'info' : 'warning');
            
            // Try to create a test file in an accessible directory
            if (accessibleDirs.length > 0) {
                testWriteAccess(accessibleDirs[0]);
            }
            return;
        }
        
        const location = locationsToCheck[checkIndex];
        console.log(`Checking location: ${location}`);
        
        // Simple directory check without complex API handling
        const checkCmd = cockpit.spawn(['test', '-d', location], { superuser: "try" });
        
        // Use a promise wrapper to avoid API differences
        const checkPromise = new Promise((resolve, reject) => {
            if (typeof checkCmd.done === 'function') {
                checkCmd.done(resolve).fail(reject);
            } else {
                checkCmd.then(resolve).catch(reject);
            }
        });
        
        checkPromise.then(() => {
            console.log(`✓ Directory accessible: ${location}`);
            results.push({ path: location, accessible: true });
            checkIndex++;
            checkNextLocation();
        }).catch(() => {
            console.log(`✗ Directory not accessible: ${location}`);
            results.push({ path: location, accessible: false });
            checkIndex++;
            checkNextLocation();
        });
    }
    
    checkNextLocation();
}

// Test write access to a directory
function testWriteAccess(directory) {
    console.log(`Testing write access to: ${directory}`);
    showStatus(`Testing write access to ${directory}...`, 'info');
    
    const testFileName = directory + (directory.endsWith('/') ? '' : '/') + 'test_write_access.tmp';
    const testContent = '# Test file created by XAVS Globals Configuration\n# This file can be safely deleted\n';
    
    const testFile = cockpit.file(testFileName);
    testFile.replace(testContent)
        .then(() => {
            console.log(`✓ Write access confirmed for: ${directory}`);
            showStatus(`Write access confirmed for ${directory}`, 'success');
            
            // Clean up test file
            setTimeout(() => {
                const deleteCmd = cockpit.spawn(['rm', '-f', testFileName], { superuser: "try" });
                deleteCmd.done(() => console.log('Test file cleaned up')).fail(err => console.log('Could not clean up test file:', err));
            }, 2000);
        })
        .catch(err => {
            console.error(`✗ Write access denied for ${directory}:`, err);
            showStatus(`Write access denied for ${directory}: ${err.message}`, 'danger');
        });
}

// Simple test function to verify file writing works
function testFileWrite() {
    console.log('🧪 Testing file write capability...');
    showStatus('Testing file write capability...', 'info');
    
    const testContent = `# XAVS Test File
# Created: ${new Date().toISOString()}
# This file tests whether the bash echo pattern works

test: true
message: "File writing test successful"
timestamp: ${Date.now()}
`;

    console.log('🔧 Testing write to /tmp/xavs-test.yml...');
    
    tryDirectFileWrite('/tmp/xavs-test.yml', testContent)
        .then((savedPath) => {
            console.log('✅ Test file write successful!');
            showStatus(`Test file saved successfully to ${savedPath}`, 'success');
            
            // Try to read it back to confirm
            setTimeout(() => {
                const testFile = cockpit.file(savedPath);
                testFile.read()
                    .then(content => {
                        if (content && content.length > 0) {
                            console.log('✅ Test file verification successful! Content length:', content.length);
                            console.log('📄 Content preview:', content.substring(0, 200));
                            showStatus('Test file write and verification successful! ✅', 'success');
                        } else {
                            console.error('❌ Test file exists but is empty');
                            showStatus('Test file created but empty ❌', 'danger');
                        }
                    })
                    .catch(err => {
                        console.error('❌ Cannot read test file:', err);
                        showStatus('Cannot read test file: ' + err.message, 'danger');
                    });
            }, 500);
        })
        .catch((err) => {
            console.error('❌ Test file write failed:', err);
            showStatus('Test file write failed: ' + (err.message || err), 'danger');
        });
}
