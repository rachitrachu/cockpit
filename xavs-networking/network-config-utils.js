// Shared Network Configuration Utilities
// This module contains reusable functions for safe netplan operations
// Used by VLAN, Bond, and Bridge managers

// Apply netplan configuration with user confirmation and automatic revert protection
async function applyNetplanWithConfirmation(timeout = 120) {
    return new Promise(async (resolve, reject) => {
        try {
            NetworkLogger.info('Testing Netplan configuration...');
            
            // Show initial auto-revert information modal
            showNetplanAutoRevertInfo(timeout);
            
            // Run netplan try with timeout
            NetworkLogger.info('Running netplan try to test configuration...');
            
            // Start netplan try in background with timeout
            const netplanProcess = cockpit.spawn(['netplan', 'try', '--timeout=' + timeout], { superuser: 'try' });
            
            // Set up timeout handler
            const timeoutId = setTimeout(() => {
                NetworkLogger.warning('Netplan try timeout reached - configuration will auto-revert');
                NetworkManager.closeModal();
                showNetplanTimeoutRevertModal(reject);
            }, (timeout + 5) * 1000); // Add 5 seconds buffer
            
            try {
                // Wait for netplan try to complete
                await netplanProcess;
                
                // Clear timeout since netplan try completed
                clearTimeout(timeoutId);
                
                NetworkLogger.info('Netplan try completed - configuration test was successful');
                
                // Close the auto-revert info modal
                NetworkManager.closeModal();
                
                // Show confirmation dialog
                showNetplanApplyConfirmation(resolve, reject);
                
            } catch (netplanError) {
                clearTimeout(timeoutId);
                NetworkManager.closeModal();
                NetworkLogger.error('Netplan try failed:', netplanError);
                NetworkLogger.error('Netplan error details:', {
                    message: netplanError.message,
                    exit_status: netplanError.exit_status,
                    stderr: netplanError.stderr || netplanError.message,
                    stdout: netplanError.stdout
                });
                showNetplanErrorModal(netplanError, reject);
            }
            
        } catch (error) {
            NetworkLogger.error('Failed to start netplan try:', error);
            NetworkManager.closeModal();
            showNetplanErrorModal(error, reject);
        }
    });
}

// Show information modal about netplan try with auto-revert
function showNetplanAutoRevertInfo(timeout) {
    const modalContent = `
        <div class="netplan-auto-revert-content">
            <div class="alert alert-info">
                <i class="fas fa-shield-alt"></i>
                <strong>Safe Network Configuration Test</strong>
            </div>
            
            <p>The system is testing your network configuration with <strong>automatic safety protection</strong>.</p>
            
            <div class="safety-info">
                <div class="safety-step">
                    <i class="fas fa-play-circle text-primary"></i>
                    <div class="step-content">
                        <strong>Testing in Progress</strong>
                        <p>The new configuration is being applied temporarily for testing</p>
                    </div>
                </div>
                <div class="safety-step active">
                    <i class="fas fa-shield-alt text-success"></i>
                    <div class="step-content">
                        <strong>Automatic Safety Revert</strong>
                        <p>If network connectivity is lost, the configuration will automatically revert in ${timeout} seconds</p>
                    </div>
                </div>
                <div class="safety-step">
                    <i class="fas fa-check-circle text-info"></i>
                    <div class="step-content">
                        <strong>Manual Confirmation</strong>
                        <p>If connectivity is maintained, you'll be prompted to make changes permanent</p>
                    </div>
                </div>
            </div>
            
            <div class="connection-status">
                <div class="status-item">
                    <i class="fas fa-wifi text-success"></i>
                    <strong>Connection Test:</strong> If you can see this message, your connection is working
                </div>
                <div class="status-item">
                    <i class="fas fa-clock text-warning"></i>
                    <strong>Timeout Protection:</strong> Configuration will auto-revert if no response in ${timeout} seconds
                </div>
                <div class="status-item">
                    <i class="fas fa-undo text-info"></i>
                    <strong>No Risk:</strong> Your original configuration will be restored automatically if needed
                </div>
            </div>
            
            <div class="waiting-indicator">
                <div class="spinner-border text-primary" role="status">
                    <span class="sr-only">Testing configuration...</span>
                </div>
                <p><strong>Please wait while the configuration is tested...</strong></p>
                <p class="text-muted">This window will update automatically when testing is complete.</p>
            </div>
        </div>
        
        <style>
            .netplan-auto-revert-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; }
            .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
            .safety-info { margin: 20px 0; }
            .safety-step { display: flex; align-items: flex-start; gap: 12px; margin: 16px 0; padding: 12px; border-radius: 6px; background: #f8f9fa; }
            .safety-step.active { background: #e7f3ff; border: 1px solid #b8daff; }
            .safety-step i { font-size: 16px; margin-top: 2px; }
            .step-content strong { display: block; margin-bottom: 4px; color: #333; }
            .step-content p { margin: 0; color: #666; font-size: 14px; }
            .connection-status { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 20px 0; }
            .status-item { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
            .status-item i { font-size: 14px; }
            .text-primary { color: #007bff !important; }
            .text-success { color: #28a745 !important; }
            .text-warning { color: #ffc107 !important; }
            .text-info { color: #17a2b8 !important; }
            .text-muted { color: #6c757d !important; }
            .waiting-indicator { text-align: center; margin: 20px 0; }
            .spinner-border { width: 2rem; height: 2rem; margin-bottom: 12px; }
            .spinner-border { border: 0.25em solid rgba(0, 123, 255, 0.25); border-right-color: #007bff; border-radius: 50%; animation: spinner-border 0.75s linear infinite; }
            @keyframes spinner-border { to { transform: rotate(360deg); } }
        </style>
    `;
    
    // No footer buttons - this is an informational modal
    const modalFooter = ``;
    
    // Create modal without close option
    NetworkManager.createModal('Network Configuration Safety Test', modalContent, modalFooter, { 
        allowClose: false 
    });
}

// Show modal when netplan try times out and reverts automatically
function showNetplanTimeoutRevertModal(reject) {
    const modalContent = `
        <div class="netplan-timeout-revert-content">
            <div class="alert alert-success">
                <i class="fas fa-shield-alt"></i>
                <strong>Configuration Automatically Reverted</strong>
            </div>
            
            <p>The network configuration test timed out, and <strong>your original configuration has been automatically restored</strong> to prevent network lockout.</p>
            
            <div class="revert-info">
                <div class="info-item success">
                    <i class="fas fa-check-circle text-success"></i>
                    <strong>Safety Protection Activated:</strong> The automatic revert feature prevented potential network isolation.
                </div>
                <div class="info-item">
                    <i class="fas fa-undo text-info"></i>
                    <strong>Configuration Restored:</strong> Your network settings have been returned to their previous working state.
                </div>
                <div class="info-item">
                    <i class="fas fa-network-wired text-primary"></i>
                    <strong>Connectivity Preserved:</strong> Your network connection should now be fully restored.
                </div>
            </div>
            
            <div class="what-happened">
                <h4>What happened?</h4>
                <p>The new network configuration may have caused connectivity issues or conflicts. Common causes include:</p>
                <ul>
                    <li>IP address conflicts with existing network infrastructure</li>
                    <li>Incorrect gateway or routing configuration</li>
                    <li>Bond/Bridge configuration incompatible with network settings</li>
                    <li>Parent interface or dependency issues</li>
                </ul>
            </div>
            
            <div class="next-steps">
                <h4>Recommended next steps:</h4>
                <ul>
                    <li>Review the configuration for conflicts or errors</li>
                    <li>Verify all interfaces are properly configured</li>
                    <li>Check network infrastructure compatibility</li>
                    <li>Consider testing with different settings</li>
                </ul>
            </div>
        </div>
        
        <style>
            .netplan-timeout-revert-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .revert-info { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 16px 0; }
            .info-item { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
            .info-item i { font-size: 14px; }
            .what-happened, .next-steps { background: #fff3cd; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #ffc107; }
            .what-happened h4, .next-steps h4 { margin-top: 0; color: #856404; }
            ul { margin-bottom: 0; }
            .text-success { color: #28a745 !important; }
            .text-info { color: #17a2b8 !important; }
            .text-primary { color: #007bff !important; }
        </style>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal();">Close</button>
    `;
    
    // Create modal
    NetworkManager.createModal('Network Configuration Auto-Reverted', modalContent, modalFooter);
    
    setTimeout(() => {
        reject(new Error('Network configuration test timed out and was automatically reverted for safety'));
    }, 100);
}

// Show confirmation dialog after successful netplan try
function showNetplanApplyConfirmation(resolve, reject) {
    const modalContent = `
        <div class="netplan-confirmation-content">
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                <strong>Configuration Test Successful</strong>
            </div>
            
            <p>The network configuration has been tested successfully! <strong>Your network connection is working properly with the new configuration.</strong></p>
            
            <div class="test-results">
                <div class="test-result success">
                    <i class="fas fa-check text-success"></i>
                    <strong>Configuration Valid:</strong> The new network configuration is syntactically correct and compatible.
                </div>
                <div class="test-result success">
                    <i class="fas fa-check text-success"></i>
                    <strong>Network Connectivity:</strong> You can still access this interface, indicating network connectivity is maintained.
                </div>
                <div class="test-result success">
                    <i class="fas fa-check text-success"></i>
                    <strong>Interface Status:</strong> The network interface has been created and configured successfully.
                </div>
            </div>
            
            <div class="apply-options">
                <h4>Do you want to make these changes permanent?</h4>
                <p>You can choose to:</p>
                <ul>
                    <li><strong>Apply Permanently:</strong> Run <code>netplan apply</code> to make the configuration persistent across reboots</li>
                    <li><strong>Keep Temporary:</strong> Keep the current working configuration but don't make it permanent (will revert on reboot)</li>
                    <li><strong>Revert Changes:</strong> Undo the configuration changes and return to the previous state</li>
                </ul>
            </div>
        </div>
        
        <style>
            .netplan-confirmation-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; }
            .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .test-results { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 16px 0; }
            .test-result { margin: 12px 0; padding: 8px 0; }
            .test-result i { margin-right: 8px; }
            .apply-options { background: #e7f3ff; padding: 12px; border-radius: 6px; margin: 16px 0; border: 1px solid #b8daff; }
            .apply-options h4 { margin-top: 0; color: #004085; }
            .apply-options ul { margin-bottom: 0; }
            .text-success { color: #28a745 !important; }
            code { background: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
        </style>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="revertNetplanConfig();">Revert Changes</button>
        <button class="btn btn-outline-primary" onclick="keepTemporaryConfig();">Keep Temporary</button>
        <button class="btn btn-success" onclick="applyNetplanPermanently();">Apply Permanently</button>
    `;
    
    // Global functions for modal buttons
    window.applyNetplanPermanently = async () => {
        try {
            NetworkManager.closeModal();
            NetworkLogger.info('User chose to apply configuration permanently');
            
            // Show progress
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', 'Applying configuration permanently...');
            }
            
            // Run netplan apply
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            NetworkLogger.info('Netplan apply completed successfully');
            
            // Restore critical system routes if they were preserved
            await restoreSystemRoutes();
            
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('success', 'Configuration applied permanently');
            }
            resolve(true);
        } catch (error) {
            NetworkLogger.error('Netplan apply failed:', error);
            NetworkManager.showError(`Failed to apply configuration permanently: ${error.message || error}`);
            reject(error);
        }
    };
    
    window.keepTemporaryConfig = async () => {
        try {
            NetworkManager.closeModal();
            NetworkLogger.info('User chose to keep temporary configuration');
            
            // Restore critical system routes if they were preserved
            await restoreSystemRoutes();
            
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('warning', 'Configuration is temporary - will revert on reboot');
            }
            resolve(true);
        } catch (error) {
            NetworkLogger.error('Failed to restore routes after keeping temporary config:', error);
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('warning', 'Configuration kept but some routes may need manual restoration');
            }
            resolve(true); // Don't fail the operation just for route restoration
        }
    };
    
    window.revertNetplanConfig = async () => {
        try {
            NetworkManager.closeModal();
            NetworkLogger.info('User chose to revert configuration');
            
            // Show progress
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', 'Reverting configuration...');
            }
            
            // Reload previous configuration
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            NetworkLogger.info('Configuration reverted successfully');
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', 'Configuration reverted to previous state');
            }
            reject(new Error('User chose to revert configuration'));
        } catch (error) {
            NetworkLogger.error('Failed to revert configuration:', error);
            NetworkManager.showError(`Failed to revert configuration: ${error.message || error}`);
            reject(error);
        }
    };
    
    // Create modal
    NetworkManager.createModal('Apply Network Configuration', modalContent, modalFooter);
}

// Show error modal when netplan try fails
function showNetplanErrorModal(error, reject) {
    const modalContent = `
        <div class="netplan-error-content">
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Configuration Test Failed</strong>
            </div>
            
            <p>The network configuration test failed. <strong>This indicates there may be issues with the configuration that could cause network problems.</strong></p>
            
            <div class="error-details">
                <h4>Error Details:</h4>
                <div class="error-message">
                    <code>${error.message || error}</code>
                </div>
            </div>
            
            <div class="error-implications">
                <h4>What this means:</h4>
                <ul>
                    <li>The configuration has syntax errors or conflicts</li>
                    <li>Applying this configuration could break network connectivity</li>
                    <li>The system has prevented applying the problematic configuration</li>
                </ul>
            </div>
            
            <div class="recommendations">
                <h4>Recommendations:</h4>
                <ul>
                    <li>Review the configuration for errors</li>
                    <li>Check for IP address conflicts or invalid settings</li>
                    <li>Verify parent interfaces exist and are properly configured</li>
                    <li>Consult the system logs for more detailed error information</li>
                </ul>
            </div>
        </div>
        
        <style>
            .netplan-error-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert-danger { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            .error-details, .error-implications, .recommendations { background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 16px 0; }
            .error-message { background: #fff; padding: 8px; border-radius: 4px; margin-top: 8px; }
            .error-message code { background: transparent; color: #d63384; font-family: monospace; }
            h4 { margin-top: 0; color: #495057; }
            ul { margin-bottom: 0; }
        </style>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal();">Close</button>
    `;
    
    // Create modal
    NetworkManager.createModal('Configuration Test Failed', modalContent, modalFooter);
    
    setTimeout(() => {
        reject(error);
    }, 100);
}

// Backup system routes for restoration after netplan operations
async function backupSystemRoutes() {
    try {
        NetworkLogger.info('Backing up ALL system routes for preservation...');
        
        const routesOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
        const routes = routesOutput.trim().split('\n').filter(line => line.trim());
        
        // Store routes globally for restoration
        window.preservedSystemRoutes = routes;
        
        NetworkLogger.info('Saved all system routes:', routes);
        NetworkLogger.info('System routes stored for post-netplan restoration');
        
        return routes;
    } catch (error) {
        NetworkLogger.error('Failed to backup system routes:', error);
        window.preservedSystemRoutes = [];
        throw error;
    }
}

// Restore critical system routes after netplan operations
async function restoreSystemRoutes() {
    if (!window.preservedSystemRoutes || window.preservedSystemRoutes.length === 0) {
        NetworkLogger.info('No preserved system routes to restore');
        return;
    }
    
    try {
        NetworkLogger.info('Restoring critical system routes...');
        
        // Get current routes to see what's missing
        const currentRoutesOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
        const currentRoutes = currentRoutesOutput.trim().split('\n').filter(line => line.trim());
        
        // Find routes that need to be restored
        const routesToRestore = window.preservedSystemRoutes.filter(route => {
            // Focus on critical routes: default routes and static routes
            if (route.includes('default via') || (route.includes('via') && !route.includes('proto kernel'))) {
                // Check if this route is missing from current routes
                return !currentRoutes.some(currentRoute => 
                    currentRoute.trim() === route.trim() || 
                    currentRoute.includes(route.split(' ')[0]) // Check destination
                );
            }
            return false;
        });
        
        NetworkLogger.info('Routes to restore:', routesToRestore);
        
        // Restore missing critical routes
        for (const route of routesToRestore) {
            if (!route.trim()) continue;
            
            try {
                NetworkLogger.info('Attempting to restore route:', route);
                
                // Parse route components
                const parts = route.trim().split(/\s+/);
                const routeCmd = ['ip', 'route', 'add'];
                
                // Build route command from parts
                let i = 0;
                while (i < parts.length) {
                    const part = parts[i];
                    
                    if (part === 'default') {
                        routeCmd.push('default');
                    } else if (part === 'via') {
                        routeCmd.push('via', parts[i + 1]);
                        i++; // skip next part as it's the gateway
                    } else if (part === 'dev') {
                        routeCmd.push('dev', parts[i + 1]);
                        i++; // skip next part as it's the device
                    } else if (part === 'proto') {
                        routeCmd.push('proto', parts[i + 1]);
                        i++; // skip next part as it's the protocol
                    } else if (part.includes('/') || /^\d+\.\d+\.\d+\.\d+$/.test(part)) {
                        // This is a destination
                        if (routeCmd.length === 3) { // Only add if it's the first destination
                            routeCmd.push(part);
                        }
                    }
                    i++;
                }
                
                // Only execute if we have a valid route command
                if (routeCmd.length > 3) {
                    NetworkLogger.info('Executing route restore command:', routeCmd);
                    await cockpit.spawn(routeCmd, { superuser: 'try' });
                    NetworkLogger.info('Successfully restored route:', route);
                } else {
                    NetworkLogger.warning('Could not parse route for restoration:', route);
                }
                
            } catch (routeError) {
                NetworkLogger.warning('Could not restore route:', route, routeError);
                // Continue with other routes - don't fail the entire operation
            }
        }
        
        // Clean up the preserved routes
        window.preservedSystemRoutes = null;
        NetworkLogger.info('System route restoration completed');
        
    } catch (error) {
        NetworkLogger.error('Failed to restore system routes:', error);
        throw error;
    }
}

// Safe chmod operation that doesn't fail if file doesn't exist
async function safeChmod(filePath, permissions = '600') {
    try {
        await cockpit.spawn(['chmod', permissions, filePath], { superuser: 'try' });
        NetworkLogger.info(`File permissions set to ${permissions} for ${filePath}`);
    } catch (chmodError) {
        NetworkLogger.warn(`Could not set file permissions for ${filePath}:`, chmodError.message);
    }
}

// Get the appropriate file prefix based on network topology
function getNetplanFilePrefix(objectType, parentInfo = {}) {
    // Define the priority system - lower numbers load first (higher priority)
    const priorities = {
        // Physical interfaces - highest priority (load first)
        physical: 80,
        
        // VLANs on physical interfaces
        vlan_on_physical: 85,
        
        // Bonds on physical interfaces
        bond_on_physical: 87,
        
        // Bridges on physical interfaces
        bridge_on_physical: 89,
        
        // VLANs on bonds
        vlan_on_bond: 90,
        
        // Bridges on bonds
        bridge_on_bond: 92,
        
        // VLANs on bridges
        vlan_on_bridge: 94,
        
        // Bonds on VLANs (complex scenario)
        bond_on_vlan: 96,
        
        // Bridges on VLANs (complex scenario)
        bridge_on_vlan: 97,
        
        // Complex nested scenarios
        vlan_on_bond_on_vlan: 98,
        bridge_on_bond_on_vlan: 99
    };
    
    // Determine the scenario based on object type and parent information
    let scenario;
    
    switch (objectType) {
        case 'vlan':
            if (parentInfo.parentType === 'physical' || !parentInfo.parentType) {
                scenario = 'vlan_on_physical';
            } else if (parentInfo.parentType === 'bond') {
                scenario = 'vlan_on_bond';
            } else if (parentInfo.parentType === 'bridge') {
                scenario = 'vlan_on_bridge';
            } else if (parentInfo.parentType === 'vlan') {
                // VLAN on VLAN - treat as complex
                scenario = 'vlan_on_bond_on_vlan';
            } else {
                scenario = 'vlan_on_physical'; // default
            }
            break;
            
        case 'bond':
            if (parentInfo.parentType === 'physical' || !parentInfo.parentType) {
                scenario = 'bond_on_physical';
            } else if (parentInfo.parentType === 'vlan') {
                scenario = 'bond_on_vlan';
            } else {
                scenario = 'bond_on_physical'; // default
            }
            break;
            
        case 'bridge':
            if (parentInfo.parentType === 'physical' || !parentInfo.parentType) {
                scenario = 'bridge_on_physical';
            } else if (parentInfo.parentType === 'bond') {
                scenario = 'bridge_on_bond';
            } else if (parentInfo.parentType === 'vlan') {
                scenario = 'bridge_on_vlan';
            } else if (parentInfo.parentType === 'bond_on_vlan') {
                scenario = 'bridge_on_bond_on_vlan';
            } else {
                scenario = 'bridge_on_physical'; // default
            }
            break;
            
        case 'physical':
        default:
            scenario = 'physical';
            break;
    }
    
    const priority = priorities[scenario] || priorities.physical;
    return priority;
}

// Generate the complete filename for a network configuration
function generateNetplanFilename(interfaceName, objectType, parentInfo = {}) {
    const prefix = getNetplanFilePrefix(objectType, parentInfo);
    return `${prefix}-xavs-${interfaceName}.yaml`;
}

// Analyze an interface name to determine its type and parent relationships
function analyzeInterfaceStructure(interfaceName) {
    const analysis = {
        interfaceName: interfaceName,
        objectType: 'physical',
        parentInfo: {},
        isComplex: false
    };
    
    // Check for VLAN patterns (interface.vlanid or vlan-style naming)
    if (interfaceName.includes('.') && /\.\d+$/.test(interfaceName)) {
        const parts = interfaceName.split('.');
        const parentInterface = parts[0];
        const vlanId = parts[1];
        
        analysis.objectType = 'vlan';
        analysis.parentInfo = {
            parentInterface: parentInterface,
            vlanId: vlanId,
            parentType: analyzeInterfaceStructure(parentInterface).objectType
        };
        analysis.isComplex = analysis.parentInfo.parentType !== 'physical';
    }
    // Check for bond patterns
    else if (interfaceName.startsWith('bond') || interfaceName.includes('bond')) {
        analysis.objectType = 'bond';
        
        // Check if this bond might be on a VLAN
        if (interfaceName.includes('.')) {
            analysis.isComplex = true;
            analysis.parentInfo.parentType = 'vlan';
        } else {
            analysis.parentInfo.parentType = 'physical';
        }
    }
    // Check for bridge patterns
    else if (interfaceName.startsWith('br-') || interfaceName.startsWith('bridge') || interfaceName.includes('br')) {
        analysis.objectType = 'bridge';
        
        // Check if this bridge might be on a complex setup
        if (interfaceName.includes('.') || interfaceName.includes('bond')) {
            analysis.isComplex = true;
            analysis.parentInfo.parentType = interfaceName.includes('.') ? 'vlan' : 'bond';
        } else {
            analysis.parentInfo.parentType = 'physical';
        }
    }
    
    return analysis;
}

// Ensure a Netplan configuration includes the renderer setting for compatibility
function ensureNetplanRenderer(yamlContent, renderer = 'networkd') {
    // Check if the YAML already contains a renderer setting
    if (yamlContent.includes('renderer:')) {
        return yamlContent; // Already has renderer, don't modify
    }
    
    // Add renderer to the network section
    const lines = yamlContent.split('\n');
    const networkLineIndex = lines.findIndex(line => line.trim() === 'network:');
    
    if (networkLineIndex !== -1) {
        // Insert renderer after the network: line
        lines.splice(networkLineIndex + 1, 0, `  renderer: ${renderer}`);
        return lines.join('\n');
    } else {
        // No network section found, add it
        return `network:\n  renderer: ${renderer}\n${yamlContent}`;
    }
}

// Clean up all possible configuration files for an interface (both old and new naming systems)
async function cleanupAllConfigFiles(interfaceName, objectType) {
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    const configFilesToRemove = [];
    
    // Add old system file patterns
    const oldPrefixes = ['90-xavs', '91-xavs', '92-xavs', '95-xavs'];
    for (const prefix of oldPrefixes) {
        configFilesToRemove.push(`/etc/netplan/${prefix}-${interfaceName}.yaml`);
    }
    
    // Add new system file variants
    const possibleParentTypes = ['physical', 'bond', 'bridge', 'vlan'];
    for (const parentType of possibleParentTypes) {
        const parentInfo = { parentType: parentType };
        const filename = generateNetplanFilename(interfaceName, objectType, parentInfo);
        const configPath = `/etc/netplan/${filename}`;
        if (!configFilesToRemove.includes(configPath)) {
            configFilesToRemove.push(configPath);
        }
    }
    
    // Remove all possible files
    const removedFiles = [];
    for (const configFile of configFilesToRemove) {
        try {
            await cockpit.spawn(['rm', '-f', configFile], { superuser: 'try' });
            removedFiles.push(configFile);
        } catch (rmError) {
            // File doesn't exist, continue
        }
    }
    
    NetworkLogger.info(`Cleaned up configuration files for ${interfaceName}:`, removedFiles);
    return removedFiles;
}

// Export functions globally for use by other modules
window.NetworkConfigUtils = {
    applyNetplanWithConfirmation,
    showNetplanAutoRevertInfo,
    showNetplanTimeoutRevertModal,
    showNetplanApplyConfirmation,
    showNetplanErrorModal,
    backupSystemRoutes,
    restoreSystemRoutes,
    safeChmod,
    getNetplanFilePrefix,
    generateNetplanFilename,
    analyzeInterfaceStructure,
    ensureNetplanRenderer,
    cleanupAllConfigFiles
};
