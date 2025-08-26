// XAVS Globals Configuration Application for Cockpit
// Using proven xos-networking file save pattern

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

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    console.log('XAVS Globals Configuration App starting...');
    showStatus('Loading OpenStack configuration schema...', 'info');
    
    try {
        if (typeof FormGenerator === 'undefined') {
            throw new Error('FormGenerator class not loaded');
        }
        
        if (typeof CONFIG_SCHEMA === 'undefined') {
            throw new Error('Configuration schema not loaded');
        }
        
        // Initialize form generator
        formGenerator = new FormGenerator('config_form', CONFIG_SCHEMA);
        await formGenerator.generateForm();
        
        console.log('Form generated successfully');
        showStatus('Configuration form loaded successfully', 'success');
        
    } catch (error) {
        console.error('Failed to initialize app:', error);
        showStatus('Failed to load configuration: ' + error.message, 'danger');
    }
});

// Save configuration using xos-networking proven pattern
async function saveConfiguration() {
    console.log('Starting save configuration process...');
    showStatus('Preparing to save configuration...', 'info');
    
    try {
        if (!formGenerator) {
            throw new Error('Form generator not initialized');
        }
        
        // Get configuration data from form
        const config = formGenerator.getFormData();
        console.log('Configuration data collected:', Object.keys(config).length, 'sections');
        
        // Generate YAML content
        const yamlContent = generateYamlContent(config);
        console.log('Generated YAML content, length:', yamlContent.length);
        
        // Define file path for globals configuration
        const filePath = '/etc/openstack_deploy/user_variables.yml';
        
        // Use the proven xos-networking pattern for file operations
        console.log('Attempting to save configuration using xos-networking pattern...');
        
        // Escape single quotes for bash command
        const escapedContent = yamlContent.replace(/'/g, "'\\''");
        const command = `mkdir -p "/etc/openstack_deploy" && echo '${escapedContent}' > "${filePath}"`;
        
        console.log('Executing file write command...');
        showStatus('Writing configuration file...', 'info');
        
        // Use the exact same pattern as xos-networking/js/run.js
        await cockpit.spawn(['bash', '-c', command], {
            superuser: 'require',
            err: 'out'
        });
        
        console.log('File write completed successfully');
        showStatus('Verifying saved configuration...', 'info');
        
        // Verify the file was written correctly
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const yamlFile = cockpit.file(filePath);
        const readContent = await yamlFile.read();
        
        if (readContent && readContent.length > 0) {
            console.log('SUCCESS! Configuration saved successfully');
            console.log('Saved file size:', readContent.length, 'characters');
            console.log('File preview:', readContent.substring(0, 200));
            showStatus(`Configuration saved successfully to ${filePath}`, 'success');
            
            // Update current config
            currentConfig = config;
            
            return filePath;
        } else {
            throw new Error('File was created but appears to be empty');
        }
        
    } catch (error) {
        console.error('Save configuration failed:', error);
        showStatus('Failed to save configuration: ' + error.message, 'danger');
        throw error;
    }
}

// Test file write functionality
async function testFileWrite() {
    console.log('Starting test file write...');
    showStatus('Testing file write capability...', 'info');
    
    try {
        const testContent = `# Test configuration file
# Generated on: ${new Date().toISOString()}
# This is a test to verify file operations work correctly

test:
  timestamp: "${new Date().toISOString()}"
  message: "File write test successful"
  content_length: 42
`;
        
        const testPath = '/tmp/xavs-globals-test.yml';
        
        console.log('Writing test file to:', testPath);
        console.log('Test content length:', testContent.length);
        
        // Use the exact same pattern as xos-networking
        const escapedContent = testContent.replace(/'/g, "'\\''");
        const command = `echo '${escapedContent}' > "${testPath}"`;
        
        await cockpit.spawn(['bash', '-c', command], {
            superuser: 'try',
            err: 'out'
        });
        
        console.log('Test file write completed');
        
        // Verify the test file
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const testFile = cockpit.file(testPath);
        const readContent = await testFile.read();
        
        if (readContent && readContent.length > 0) {
            console.log('Test file verification successful');
            console.log('Read back content length:', readContent.length);
            showStatus('Test file write successful! File operations are working.', 'success');
            
            // Clean up test file
            try {
                await cockpit.spawn(['rm', '-f', testPath], { superuser: 'try' });
                console.log('Test file cleaned up');
            } catch (cleanupErr) {
                console.log('Test file cleanup failed (not critical):', cleanupErr);
            }
            
            return true;
        } else {
            throw new Error('Test file was created but is empty');
        }
        
    } catch (error) {
        console.error('Test file write failed:', error);
        showStatus('Test file write failed: ' + error.message, 'danger');
        throw error;
    }
}

// Generate YAML content from configuration
function generateYamlContent(config) {
    let yamlContent = '---\n';
    yamlContent += '# OpenStack-Ansible User Variables\n';
    yamlContent += `# Generated by XAVS Globals Configuration\n`;
    yamlContent += `# Generated on: ${new Date().toISOString()}\n\n`;
    
    function processValue(value, indent = 0) {
        const spaces = '  '.repeat(indent);
        
        if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                if (value.length === 0) return '[]';
                return value.map(item => `\n${spaces}- ${processValue(item, indent + 1).trim()}`).join('');
            } else {
                const entries = Object.entries(value)
                    .filter(([key, val]) => val !== undefined && val !== null && val !== '');
                
                if (entries.length === 0) return '{}';
                
                return entries.map(([key, val]) => {
                    const processedValue = processValue(val, indent + 1);
                    if (typeof val === 'object' && val !== null) {
                        return `\n${spaces}${key}:${processedValue}`;
                    } else {
                        return `\n${spaces}${key}: ${processedValue}`;
                    }
                }).join('');
            }
        } else if (typeof value === 'string') {
            if (value.includes('\n') || value.includes('"') || value.includes("'")) {
                return `|\n${spaces}  ${value.split('\n').join(`\n${spaces}  `)}`;
            }
            return `"${value}"`;
        } else if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        } else {
            return String(value);
        }
    }
    
    const filteredConfig = Object.fromEntries(
        Object.entries(config).filter(([key, value]) => 
            value !== undefined && value !== null && value !== '' &&
            !(typeof value === 'object' && Object.keys(value).length === 0)
        )
    );
    
    for (const [sectionKey, sectionValue] of Object.entries(filteredConfig)) {
        yamlContent += `${sectionKey}:${processValue(sectionValue, 1)}\n\n`;
    }
    
    return yamlContent;
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
    
    const filePath = '/etc/openstack_deploy/user_variables.yml';
    const yamlFile = cockpit.file(filePath);
    
    yamlFile.read()
        .then(content => {
            if (content) {
                const previewPanel = document.getElementById('yaml_preview_panel');
                const previewContent = document.getElementById('yaml_preview');
                
                if (previewPanel && previewContent) {
                    previewContent.textContent = content;
                    previewPanel.style.display = 'block';
                    previewPanel.classList.remove('hidden');
                }
                
                showStatus('Saved configuration loaded successfully', 'success');
            } else {
                showStatus('No saved configuration found', 'warning');
            }
        })
        .catch(error => {
            console.error('Error reading saved file:', error);
            showStatus('Error reading saved configuration: ' + error.message, 'danger');
        });
}

// Load configuration from file
function loadConfiguration() {
    showStatus('Loading configuration from file...', 'info');
    
    const filePath = '/etc/openstack_deploy/user_variables.yml';
    const yamlFile = cockpit.file(filePath);
    
    yamlFile.read()
        .then(content => {
            if (content && formGenerator) {
                try {
                    // This would need a YAML parser to fully implement
                    showStatus('Configuration loaded (basic implementation)', 'info');
                } catch (parseError) {
                    showStatus('Error parsing configuration: ' + parseError.message, 'danger');
                }
            } else {
                showStatus('No configuration file found', 'warning');
            }
        })
        .catch(error => {
            console.error('Error loading configuration:', error);
            showStatus('Error loading configuration: ' + error.message, 'danger');
        });
}

// Export functions for global access
window.saveConfiguration = saveConfiguration;
window.testFileWrite = testFileWrite;
window.previewConfiguration = previewConfiguration;
window.viewSavedFile = viewSavedFile;
window.loadConfiguration = loadConfiguration;
