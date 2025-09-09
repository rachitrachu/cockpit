// Bridge Management Module

// Validate interface name to prevent command injection
// Helper function to clear loading state and re-enable button
function clearButtonLoading(button) {
    ButtonProgress.clearLoading(button);
    button.disabled = false;
}

function assertValidInterfaceName(name) {
    if (!name || typeof name !== 'string') {
        throw new Error(`Invalid interface name: ${name}`);
    }
    if (!INTERFACE_NAME_REGEX.test(name)) {
        throw new Error(`Invalid interface name format: ${name}. Allowed: bridge names (br-xxx), physical interfaces (enoxxx), VLANs (eno1.123, vlan123), bonds (bondX).`);
    }
}

const BridgeManager = {
    bridges: [],
    isLoading: false, // Flag to prevent concurrent loading
    
    // Load bridge configurations
    async loadBridges() {
        if (this.isLoading) {
            return;
        }
        
        this.isLoading = true;
        NetworkLogger.info('Loading bridge configurations...');
        const listElement = document.getElementById('bridge-list');
        if (listElement) {
            listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading bridges...</div>';
        }
        
        try {
            this.bridges = await this.fetchBridges();
            this.renderBridges();
            NetworkLogger.success(`Loaded ${this.bridges.length} bridge(s)`);
        } catch (error) {
            NetworkLogger.error(' Failed to load bridges:', error);
            NetworkLogger.error(`Failed to load bridges: ${error.message}`);
            if (listElement) {
                listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load bridges</div>';
            }
        } finally {
            this.isLoading = false;
        }
    },
    
    // Fetch real bridges from system using Cockpit APIs
    async fetchBridges() {
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available');
        }

        const bridges = [];
        
        try {
            // Get all network interfaces to find bridges
            const ipOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
            const lines = ipOutput.split('\n');
            
            for (const line of lines) {
                const match = line.match(/^\d+:\s+([^:]+):/);
                if (match) {
                    const interfaceName = match[1].trim();
                    
                    // Check if this is a bridge interface (more robust detection)
                    let isBridge = false;
                    
                    // Method 1: Check name patterns (quick filter)
                    if (interfaceName.startsWith('br-') || interfaceName.startsWith('bridge')) {
                        isBridge = await this.isBridgeInterface(interfaceName);
                    }
                    // Method 2: Check if it's actually a bridge (for other names)
                    else {
                        isBridge = await this.isBridgeInterface(interfaceName);
                    }
                    
                    if (isBridge) {
                        try {
                            // Get bridge details
                            const details = await this.getBridgeDetails(interfaceName);
                            
                            bridges.push({
                                name: interfaceName,
                                description: details.description || `Bridge ${interfaceName}`,
                                interfaces: details.interfaces || [],
                                ip: details.ip || 'Not configured',
                                gateway: details.gateway || 'Not configured',
                                stp: details.stp || false,
                                forwardDelay: details.forwardDelay || '0s',
                                status: details.status || 'unknown',
                                type: this.determineBridgeType(interfaceName, details)
                            });
                        } catch (error) {
                            NetworkLogger.warning(`BridgeManager: Could not get details for bridge ${interfaceName}:`, error);
                            // Only add to list if we're sure it's a bridge, even if details fail
                            bridges.push({
                                name: interfaceName,
                                description: `Bridge ${interfaceName}`,
                                interfaces: [],
                                ip: 'Not configured',
                                gateway: 'Not configured',
                                stp: false,
                                forwardDelay: '0s',
                                status: 'unknown',
                                type: 'custom'
                            });
                        }
                    }
                }
            }
            
            return bridges;
            
        } catch (error) {
            NetworkLogger.error(' Error fetching bridges:', error);
            return [];
        }
    },

    // Check if an interface is a bridge
    async isBridgeInterface(interfaceName) {
        try {
            // First, check if the bridge directory exists (most reliable method)
            try {
                await cockpit.spawn(['test', '-d', `/sys/class/net/${interfaceName}/bridge`], { superuser: 'try' });
                return true;
            } catch (testError) {
                // Bridge directory doesn't exist, so it's not a bridge
                return false;
            }
        } catch (error) {
            // Fallback to brctl/bridge commands if sys check fails
            try {
                const bridgeOutput = await cockpit.spawn(['brctl', 'show'], { superuser: 'try' });
                const lines = bridgeOutput.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith(interfaceName + '\t') || 
                        line.trim().startsWith(interfaceName + ' ')) {
                        return true;
                    }
                }
                return false;
            } catch (brctlError) {
                // brctl might not be available, try alternative
                try {
                    const bridgeOutput = await cockpit.spawn(['bridge', 'link', 'show'], { superuser: 'try' });
                    return bridgeOutput.includes(`master ${interfaceName}`);
                } catch (error2) {
                    NetworkLogger.warning(`BridgeManager: Could not check if ${interfaceName} is a bridge:`, error2);
                    return false;
                }
            }
        }
    },

    // Get detailed information about a bridge interface
    async getBridgeDetails(interfaceName) {
        const details = {
            ip: 'Not configured',
            gateway: 'Not configured',
            interfaces: [],
            status: 'down',
            stp: false,
            forwardDelay: '0s',
            description: `Bridge ${interfaceName}`
        };

        try {
            // First verify this is actually a bridge before trying to get bridge-specific details
            const isBridge = await this.isBridgeInterface(interfaceName);
            if (!isBridge) {
                NetworkLogger.warning(`BridgeManager: ${interfaceName} is not a bridge, skipping bridge-specific details`);
                return details;
            }

            // Get IP address information
            const ipAddrOutput = await cockpit.spawn(['ip', 'addr', 'show', interfaceName], 
                { superuser: 'try' });
            
            // Parse IP addresses
            const ipMatches = ipAddrOutput.match(/inet\s+([^\s]+)/g);
            if (ipMatches && ipMatches.length > 0) {
                details.ip = ipMatches[0].replace('inet ', '');
            }

            // Get interface status
            if (ipAddrOutput.includes('state UP')) {
                details.status = 'up';
            } else if (ipAddrOutput.includes('state DOWN')) {
                details.status = 'down';
            }

            // Try to get bridge member interfaces
            try {
                const bridgeOutput = await cockpit.spawn(['brctl', 'show', interfaceName], { superuser: 'try' });
                const lines = bridgeOutput.split('\n');
                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].trim().split(/\s+/);
                    if (parts.length > 0 && parts[0] && !parts[0].startsWith('bridge')) {
                        details.interfaces.push(parts[0]);
                    }
                }
            } catch (brctlError) {
                // Try alternative method
                try {
                    const bridgeOutput = await cockpit.spawn(['bridge', 'link', 'show'], { superuser: 'try' });
                    const lines = bridgeOutput.split('\n');
                    for (const line of lines) {
                        const match = line.match(/^\d+:\s+([^:]+):.*master\s+(\w+)/);
                        if (match && match[2] === interfaceName) {
                            details.interfaces.push(match[1]);
                        }
                    }
                } catch (bridgeError) {
                    NetworkLogger.warning(`BridgeManager: Could not get bridge members for ${interfaceName}:`, bridgeError);
                }
            }

            // Try to get STP information - only if bridge directory exists
            try {
                const stpOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/bridge/stp_state`], 
                    { superuser: 'try' });
                details.stp = stpOutput.trim() === '1';
            } catch (stpError) {
                // This is expected if not a bridge or bridge properties are not available
                NetworkLogger.debug(`BridgeManager: Could not get STP state for ${interfaceName} (this is normal for non-bridges):`, stpError.message);
            }

            // Try to get forward delay - only if bridge directory exists
            try {
                const delayOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/bridge/forward_delay`], 
                    { superuser: 'try' });
                const delayMs = parseInt(delayOutput.trim());
                details.forwardDelay = `${Math.round(delayMs / 100)}s`;
            } catch (delayError) {
                // This is expected if not a bridge or bridge properties are not available
                NetworkLogger.debug(`BridgeManager: Could not get forward delay for ${interfaceName} (this is normal for non-bridges):`, delayError.message);
            }

            // Try to get route information for gateway (use global default route)
            try {
                const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'default'], { superuser: 'try' });
                const defaultRoute = routeOutput.trim();
                if (defaultRoute) {
                    const gatewayMatch = defaultRoute.match(/default via\s+([^\s]+)/);
                    if (gatewayMatch) {
                        details.gateway = gatewayMatch[1];
                    }
                }
            } catch (routeError) {
                NetworkLogger.warning(`BridgeManager: Could not get default route info:`, routeError);
            }

        } catch (error) {
            NetworkLogger.warning(`BridgeManager: Error getting details for ${interfaceName}:`, error);
        }

        return details;
    },

    // Determine bridge type based on name and configuration
    determineBridgeType(interfaceName, details) {
        const name = interfaceName.toLowerCase();
        if (name.includes('mgmt') || name.includes('management')) {
            return 'management';
        } else if (name.includes('vm') || name.includes('virtual')) {
            return 'vm';
        } else if (name.includes('storage') || name.includes('store')) {
            return 'storage';
        } else {
            return 'custom';
        }
    },
    
    // Render bridges
    renderBridges() {
        const listElement = document.getElementById('bridge-list');
        
        if (this.bridges.length === 0) {
            listElement.innerHTML = `
                <div class="alert">
                    <p>No bridges configured. Create your first bridge to enable VM hosting or network segmentation.</p>
                    <button class="btn btn-brand" onclick="addBridge()">
                        <i class="fas fa-plus"></i> Add Bridge
                    </button>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = this.bridges.map(bridge => `
            <div class="bridge-card">
                <div class="vlan-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-bridge" style="font-size: 20px; color: var(--brand);"></i>
                        <div>
                            <h3 style="margin: 0; font-size: 18px;">${bridge.name}</h3>
                            <p style="margin: 4px 0 0; color: var(--muted); font-size: 14px;">${bridge.description}</p>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="status-dot ${bridge.status === 'up' ? 'ok' : 'bad'}"></span>
                        <span style="font-weight: 600; color: var(--text);">${bridge.status.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="vlan-config">
                    <div>
                        <span class="detail-label">IP Configuration</span>
                        <div class="detail-value">${bridge.ip}</div>
                    </div>
                    <div>
                        <span class="detail-label">Gateway</span>
                        <div class="detail-value">${bridge.gateway}</div>
                    </div>
                    <div>
                        <span class="detail-label">STP Enabled</span>
                        <div class="detail-value">${bridge.stp ? 'Yes' : 'No'}</div>
                    </div>
                    <div>
                        <span class="detail-label">Forward Delay</span>
                        <div class="detail-value">${bridge.forwardDelay}</div>
                    </div>
                </div>
                
                <div class="bridge-topology">
                    <h4 style="margin: 0 0 12px; font-size: 14px; color: var(--text);">Bridge Interfaces</h4>
                    <div class="bridge-interfaces">
                        ${bridge.interfaces.map(iface => `<span class="bridge-interface">${iface}</span>`).join('')}
                        <button class="btn btn-sm btn-outline-brand" onclick="addInterfaceToBridge('${bridge.name}')" style="font-size: 12px; padding: 2px 8px;">
                            <i class="fas fa-plus"></i> Add Interface
                        </button>
                    </div>
                </div>
                
                <div class="interface-actions" style="margin-top: 16px;">
                    <button class="btn btn-sm btn-outline-brand" onclick="editBridge('${bridge.name}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleBridge('${bridge.name}', '${bridge.status}')">
                        <i class="fas fa-power-off"></i> ${bridge.status === 'up' ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteBridge('${bridge.name}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// Get available interfaces for bridging (exclude already bridged, system interfaces, etc.)
async function getAvailableInterfacesForBridging() {
    NetworkLogger.info(' Getting available interfaces for bridging...');
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    const availableInterfaces = [];
    
    try {
        // Get all network interfaces
        const allInterfacesOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
        const lines = allInterfacesOutput.split('\n');
        
        for (const line of lines) {
            const match = line.match(/(\d+):\s+([^:@]+)/);
            if (match) {
                const ifaceName = match[2].trim();
                
                // Skip system interfaces, already bridged interfaces, etc.
                if (!isSystemInterfaceForBridge(ifaceName) && 
                    !ifaceName.startsWith('br') && 
                    !ifaceName.startsWith('bond') &&
                    !ifaceName.startsWith('vlan') &&
                    !ifaceName.includes('@') &&
                    ifaceName !== 'lo') {
                    
                    // Check if interface is not already a member of a bridge
                    const isAlreadyBridged = await isInterfaceAlreadyBridged(ifaceName);
                    if (!isAlreadyBridged) {
                        availableInterfaces.push(ifaceName);
                    }
                }
            }
        }
        
    } catch (error) {
        NetworkLogger.error(' Error getting available interfaces:', error);
        throw error;
    }
    
    NetworkLogger.info(' Available interfaces for bridging:', availableInterfaces);
    return availableInterfaces;
}

// Check if an interface is already part of a bridge
async function isInterfaceAlreadyBridged(interfaceName) {
    try {
        // Use readlink -f to properly resolve the master symlink
        const masterOutput = await cockpit.spawn(['readlink', '-f', `/sys/class/net/${interfaceName}/master`], { superuser: 'try' });
        const master = masterOutput.trim();
        // Check if the resolved path contains a bridge interface and verify it's actually a bridge
        if (master && /\/br\w*$/.test(master)) {
            const bridgeName = master.split('/').pop();
            try {
                await cockpit.spawn(['test', '-d', `/sys/class/net/${bridgeName}/bridge`], { superuser: 'try' });
                return true; // Master exists and is a bridge
            } catch (bridgeTestError) {
                return false; // Master exists but is not a bridge
            }
        }
        return false;
    } catch (error) {
        // If the symlink doesn't exist or can't be resolved, interface is not bridged
        return false;
    }
}

// Helper function to check if interface is a system interface for bridging
function isSystemInterfaceForBridge(name) {
    const systemPrefixes = ['lo', 'docker', 'veth', 'br-', 'virbr', 'tap', 'tun', 'npn'];
    const systemPatterns = [
        /^vlan\d+$/,      // VLAN interfaces
        /^bond\d+$/,      // Bond interfaces
        /^wl\w+$/         // Wireless interfaces (optional to exclude)
    ];
    
    // Check prefixes
    if (systemPrefixes.some(prefix => name.startsWith(prefix))) {
        return true;
    }
    
    // Check patterns
    if (systemPatterns.some(pattern => pattern.test(name))) {
        return true;
    }
    
    return false;
}

// Bridge Functions
async function addBridge() {
    // Get available interfaces for bridging
    let availableInterfaces = [];
    try {
        availableInterfaces = await getAvailableInterfacesForBridging();
    } catch (error) {
        NetworkLogger.warning('Could not get available interfaces for bridging:', error);
        NetworkManager.showError('Cannot load network interfaces. Please ensure Cockpit is running properly and try again.');
        return;
    }
    
    const interfaceOptions = availableInterfaces.map(iface => 
        `<option value="${iface}">${iface}</option>`
    ).join('');
    
    const modalContent = `
        <form id="bridge-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="bridge-name">Bridge Name</label>
                <input type="text" id="bridge-name" class="form-control" placeholder="br-vm" required>
                <div class="hint">Bridge interface name (e.g., br-vm, br-mgmt)</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="bridge-type">Bridge Type</label>
                <select id="bridge-type" class="form-control" required>
                    <option value="">Select type</option>
                    <option value="vm">Virtual Machine Bridge</option>
                    <option value="management">Management Bridge</option>
                    <option value="storage">Storage Bridge</option>
                    <option value="custom">Custom Bridge</option>
                </select>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="bridge-description">Description</label>
                <input type="text" id="bridge-description" class="form-control" placeholder="Virtual Machine Bridge">
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">Member Interfaces</label>
                <div class="interface-selection-container">
                    <div class="selected-interfaces" id="selected-bridge-interfaces">
                        <!-- Selected interfaces will appear here -->
                    </div>
                    <div class="available-interfaces">
                        <label class="form-label" style="font-size: 14px; margin-bottom: 8px;">Available Interfaces:</label>
                        <div class="interface-grid" id="bridge-interface-grid">
                            ${availableInterfaces.map(iface => `
                                <div class="interface-card" data-interface="${iface}" onclick="toggleBridgeInterface('${iface}')">
                                    <div class="interface-info">
                                        <span class="interface-name">${iface}</span>
                                        <span class="interface-status">Available</span>
                                    </div>
                                    <div class="interface-checkbox">
                                        <input type="checkbox" id="bridge-${iface}" value="${iface}">
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="hint">Select interfaces to add to the bridge. Click on interfaces to add/remove them.</div>
                <div class="alert alert-info" style="margin-top: 8px; padding: 8px 12px; font-size: 13px;">
                    <i class="fas fa-info-circle"></i> 
                    <strong>Note:</strong> If you want to use VLAN interfaces (e.g., eno1.100), create them first in the VLAN configuration section before adding them to a bridge.
                </div>
                <div class="alert alert-warning" style="margin-top: 8px; padding: 8px 12px; font-size: 13px;">
                    <i class="fas fa-exclamation-triangle"></i> 
                    <strong>Important:</strong> Creating bridges may temporarily affect network connectivity. System routes will be preserved and restored automatically, but ensure you have console access if needed.
                </div>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">IP Configuration</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg active" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg" data-config="dhcp">DHCP</button>
                    <button type="button" class="toggle-seg" data-config="none">No IP</button>
                </div>
            </div>
            
            <div id="bridge-static-config" class="static-config">
                <div class="form-group full-width">
                    <label class="form-label">IP Addresses</label>
                    <div id="bridge-ip-addresses-container">
                        <div class="ip-address-entry" data-index="0">
                            <div style="display: flex; gap: 8px; align-items: flex-end;">
                                <div style="flex: 1;">
                                    <input type="text" id="bridge-ip-0" class="form-control bridge-ip-address-input" placeholder="192.168.1.50 (default /24)" data-validate="cidr">
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-danger remove-bridge-ip-btn" onclick="removeBridgeIpAddress(0)" style="display: none;">
                                    <i class="fas fa-minus"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-brand" onclick="addBridgeIpAddress()" style="margin-top: 8px;">
                        <i class="fas fa-plus"></i> Add IP Address
                    </button>
                    <div class="hint">Enter IP addresses in CIDR notation (e.g., 192.168.1.50/24)</div>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="bridge-gateway">Gateway</label>
                    <input type="text" id="bridge-gateway" class="form-control" placeholder="192.168.1.1" data-validate="ipAddress">
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label">Bridge Parameters</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="bridge-stp" checked>
                        Enable STP (Spanning Tree Protocol)
                    </label>
                    <div>
                        <label class="form-label" for="bridge-forward-delay">Forward Delay</label>
                        <input type="text" id="bridge-forward-delay" class="form-control" value="4s" placeholder="4s">
                    </div>
                </div>
                <div style="margin-top: 12px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="bridge-preserve-routes" checked>
                        Preserve system routes during configuration
                    </label>
                    <div class="hint" style="margin-top: 4px; margin-left: 20px;">Recommended to maintain network connectivity</div>
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveBridge()">Create Bridge</button>
    `;
    
    NetworkManager.createModal('Add Bridge Configuration', modalContent, modalFooter);
    
    // Setup live validation for the form
    const form = document.getElementById('bridge-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(form);
    }
    
    // Setup toggle functionality
    setupBridgeToggle();
    setupBridgeInterfaceSelection();
    
    // Initialize IP address management
    updateBridgeRemoveButtonVisibility();
}

async function editBridge(bridgeName) {
    const bridge = BridgeManager.bridges.find(b => b.name === bridgeName);
    if (!bridge) return;
    
    const modalContent = `
        <form id="bridge-edit-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="edit-bridge-name">Bridge Name</label>
                <input type="text" id="edit-bridge-name" class="form-control" value="${bridge.name}" readonly>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-bridge-type">Bridge Type</label>
                <select id="edit-bridge-type" class="form-control">
                    <option value="vm" ${bridge.type === 'vm' ? 'selected' : ''}>Virtual Machine Bridge</option>
                    <option value="management" ${bridge.type === 'management' ? 'selected' : ''}>Management Bridge</option>
                    <option value="storage" ${bridge.type === 'storage' ? 'selected' : ''}>Storage Bridge</option>
                    <option value="custom" ${bridge.type === 'custom' ? 'selected' : ''}>Custom Bridge</option>
                </select>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="edit-bridge-description">Description</label>
                <input type="text" id="edit-bridge-description" class="form-control" value="${bridge.description}">
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">Member Interfaces</label>
                <div class="interface-selection-container">
                    <div class="selected-interfaces" id="edit-selected-bridge-interfaces">
                        ${bridge.interfaces.map(iface => `
                            <div class="selected-interface-tag">
                                <span>${iface}</span>
                                <button type="button" class="remove-interface" onclick="removeEditBridgeInterface('${iface}')" title="Remove interface">
                                    ×
                                </button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="available-interfaces">
                        <label class="form-label" style="font-size: 14px; margin-bottom: 8px;">Available Interfaces:</label>
                        <div class="interface-grid" id="edit-bridge-interface-grid">
                            <!-- Available interfaces will be loaded dynamically -->
                        </div>
                    </div>
                </div>
                <div class="hint">Click on interfaces below to add them to the bridge.</div>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">IP Addresses</label>
                <div id="edit-bridge-ip-addresses-container">
                    <!-- IP addresses will be populated by populateEditBridgeIpAddresses() -->
                </div>
                <button type="button" class="btn btn-sm btn-outline-brand" onclick="addEditBridgeIpAddress()">
                    <i class="fas fa-plus"></i> Add IP Address
                </button>
                <div class="hint">Enter IP addresses in CIDR notation (e.g., 192.168.1.10/24)</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-bridge-gateway">Gateway</label>
                <input type="text" id="edit-bridge-gateway" class="form-control" value="${bridge.gateway}">
            </div>
            
            <div class="form-group">
                <label class="form-label">Bridge Parameters</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="edit-bridge-stp" ${bridge.stp ? 'checked' : ''}>
                        Enable STP
                    </label>
                    <div>
                        <label class="form-label" for="edit-bridge-forward-delay">Forward Delay</label>
                        <input type="text" id="edit-bridge-forward-delay" class="form-control" value="${bridge.forwardDelay}">
                    </div>
                </div>
                <div style="margin-top: 12px;">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="edit-bridge-preserve-routes" checked>
                        Preserve system routes during configuration
                    </label>
                    <div class="hint" style="margin-top: 4px; margin-left: 20px;">Recommended to maintain network connectivity</div>
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="updateBridge('${bridgeName}')">Update Bridge</button>
    `;
    
    NetworkManager.createModal(`Edit Bridge: ${bridgeName}`, modalContent, modalFooter);
    
    // Populate IP addresses for editing
    const ipAddresses = [];
    if (bridge.ipAddresses && Array.isArray(bridge.ipAddresses) && bridge.ipAddresses.length > 0) {
        // Use the stored IP addresses array
        ipAddresses.push(...bridge.ipAddresses);
    } else if (bridge.ip && bridge.ip !== 'Not configured' && bridge.ip !== 'DHCP') {
        // Fallback to single IP field if ipAddresses not available
        if (bridge.ip.includes(',')) {
            ipAddresses.push(...bridge.ip.split(',').map(ip => ip.trim()));
        } else {
            ipAddresses.push(bridge.ip);
        }
    }
    
    NetworkLogger.info(`BridgeManager: Populating edit form with IP addresses:`, ipAddresses);
    populateEditBridgeIpAddresses(ipAddresses);
    
    // Setup live validation for the edit form
    const editForm = document.getElementById('bridge-edit-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(editForm);
    }
    
    // Initialize edit interface selection
    setupEditBridgeInterfaceSelection(bridge);
    
    // Load available interfaces dynamically after modal is created
    loadAvailableInterfacesForEdit();
}

function setupBridgeToggle() {
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfig = document.getElementById('bridge-static-config');
            
            if (configType === 'static') {
                staticConfig.style.display = 'contents';
            } else {
                staticConfig.style.display = 'none';
            }
        });
    });
}

// Enhanced interface selection system for bridges
function setupBridgeInterfaceSelection() {
    // Initialize selected interfaces tracking
    window.selectedBridgeInterfaces = new Set();
    
    // Update the display
    updateSelectedBridgeInterfacesDisplay();
}

function toggleBridgeInterface(interfaceName) {
    NetworkLogger.info(`BridgeManager: Toggling interface ${interfaceName}`);
    
    const interfaceCard = document.querySelector(`[data-interface="${interfaceName}"]`);
    const checkbox = document.getElementById(`bridge-${interfaceName}`);
    
    if (!window.selectedBridgeInterfaces) {
        window.selectedBridgeInterfaces = new Set();
    }
    
    if (window.selectedBridgeInterfaces.has(interfaceName)) {
        // Remove interface
        window.selectedBridgeInterfaces.delete(interfaceName);
        interfaceCard.classList.remove('selected');
        checkbox.checked = false;
    } else {
        // Add interface
        window.selectedBridgeInterfaces.add(interfaceName);
        interfaceCard.classList.add('selected');
        checkbox.checked = true;
    }
    
    // Update the selected interfaces display
    updateSelectedBridgeInterfacesDisplay();
}

function removeBridgeInterface(interfaceName) {
    NetworkLogger.info(`BridgeManager: Removing interface ${interfaceName}`);
    
    if (window.selectedBridgeInterfaces) {
        window.selectedBridgeInterfaces.delete(interfaceName);
    }
    
    // Update interface card
    const interfaceCard = document.querySelector(`[data-interface="${interfaceName}"]`);
    const checkbox = document.getElementById(`bridge-${interfaceName}`);
    
    if (interfaceCard) {
        interfaceCard.classList.remove('selected');
    }
    if (checkbox) {
        checkbox.checked = false;
    }
    
    // Update displays
    updateSelectedBridgeInterfacesDisplay();
}

function updateSelectedBridgeInterfacesDisplay() {
    const selectedDiv = document.getElementById('selected-bridge-interfaces');
    
    if (!window.selectedBridgeInterfaces || window.selectedBridgeInterfaces.size === 0) {
        selectedDiv.innerHTML = '';
        return;
    }
    
    selectedDiv.innerHTML = Array.from(window.selectedBridgeInterfaces).map(interfaceName => `
        <div class="selected-interface-tag">
            <span>${interfaceName}</span>
            <button type="button" class="remove-interface" onclick="removeBridgeInterface('${interfaceName}')" title="Remove interface">
                ×
            </button>
        </div>
    `).join('');
}

// Edit Bridge Interface Selection Functions
function setupEditBridgeInterfaceSelection(bridge) {
    // Initialize selected interfaces tracking for edit mode
    window.editSelectedBridgeInterfaces = new Set(bridge.interfaces);
}

async function loadAvailableInterfacesForEdit() {
    try {
        const availableInterfaces = await getAvailableInterfacesForBridging();
        const gridElement = document.getElementById('edit-bridge-interface-grid');
        
        if (gridElement && availableInterfaces.length > 0) {
            gridElement.innerHTML = availableInterfaces.map(iface => `
                <div class="interface-card" data-interface="${iface}" onclick="toggleEditBridgeInterface('${iface}')">
                    <div class="interface-info">
                        <span class="interface-name">${iface}</span>
                        <span class="interface-status">Available</span>
                    </div>
                    <div class="interface-checkbox">
                        <input type="checkbox" id="edit-bridge-${iface}" value="${iface}">
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        NetworkLogger.warning('Could not load available interfaces for bridge editing:', error);
    }
}

function toggleEditBridgeInterface(interfaceName) {
    NetworkLogger.info(`BridgeManager: Toggling edit interface ${interfaceName}`);
    
    const interfaceCard = document.querySelector(`[data-interface="${interfaceName}"]`);
    const checkbox = document.getElementById(`edit-bridge-${interfaceName}`);
    
    if (!window.editSelectedBridgeInterfaces) {
        window.editSelectedBridgeInterfaces = new Set();
    }
    
    if (window.editSelectedBridgeInterfaces.has(interfaceName)) {
        // Remove interface
        window.editSelectedBridgeInterfaces.delete(interfaceName);
        interfaceCard.classList.remove('selected');
        checkbox.checked = false;
    } else {
        // Add interface
        window.editSelectedBridgeInterfaces.add(interfaceName);
        interfaceCard.classList.add('selected');
        checkbox.checked = true;
    }
    
    // Update the selected interfaces display
    updateEditSelectedBridgeInterfacesDisplay();
}

function removeEditBridgeInterface(interfaceName) {
    NetworkLogger.info(`BridgeManager: Removing edit interface ${interfaceName}`);
    
    if (window.editSelectedBridgeInterfaces) {
        window.editSelectedBridgeInterfaces.delete(interfaceName);
    }
    
    // Update interface card
    const interfaceCard = document.querySelector(`[data-interface="${interfaceName}"]`);
    const checkbox = document.getElementById(`edit-bridge-${interfaceName}`);
    
    if (interfaceCard) {
        interfaceCard.classList.remove('selected');
    }
    if (checkbox) {
        checkbox.checked = false;
    }
    
    // Update displays
    updateEditSelectedBridgeInterfacesDisplay();
}

function updateEditSelectedBridgeInterfacesDisplay() {
    const selectedDiv = document.getElementById('edit-selected-bridge-interfaces');
    
    if (!window.editSelectedBridgeInterfaces || window.editSelectedBridgeInterfaces.size === 0) {
        selectedDiv.innerHTML = '';
        return;
    }
    
    selectedDiv.innerHTML = Array.from(window.editSelectedBridgeInterfaces).map(interfaceName => `
        <div class="selected-interface-tag">
            <span>${interfaceName}</span>
            <button type="button" class="remove-interface" onclick="removeEditBridgeInterface('${interfaceName}')" title="Remove interface">
                ×
            </button>
        </div>
    `).join('');
}

async function addInterfaceToBridge(bridgeName) {
    // Get available interfaces
    let availableInterfaces = [];
    try {
        availableInterfaces = await getAvailableInterfacesForBridging();
    } catch (error) {
        NetworkLogger.warning('Could not get available interfaces:', error);
        NetworkManager.showError('Cannot load network interfaces. Please try again.');
        return;
    }
    
    const interfaceOptions = availableInterfaces.map(iface => 
        `<option value="${iface}">${iface}</option>`
    ).join('');
    
    const modalContent = `
        <form id="add-interface-form">
            <div class="form-group">
                <label class="form-label" for="new-interface">Select Interface to Add</label>
                <select id="new-interface" class="form-control" required>
                    <option value="">Select interface</option>
                    ${interfaceOptions}
                </select>
                <div class="hint">Only available interfaces are shown</div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="addInterfaceToExistingBridge('${bridgeName}')">Add Interface</button>
    `;
    
    NetworkManager.createModal(`Add Interface to ${bridgeName}`, modalContent, modalFooter);
}

async function saveBridge() {
    NetworkLogger.info('Creating new bridge...');
    
    const modal = document.querySelector('.modal');
    const form = document.getElementById('bridge-form');
    
    // Get the save button and show progress
    const saveButton = modal.querySelector('.btn-brand');
    
    // Prevent multiple submissions
    if (saveButton.disabled) {
        NetworkLogger.warning('Bridge creation already in progress, ignoring duplicate submission');
        return;
    }
    
    ButtonProgress.setLoading(saveButton, '<i class="fas fa-plus"></i> Create Bridge');
    saveButton.disabled = true;
    
    // Clear any existing modal messages
    if (typeof clearModalMessages === 'function') {
        clearModalMessages(modal);
    }
    
    // Validate form using live validation
    if (typeof validateForm === 'function') {
        if (!validateForm(form)) {
            clearButtonLoading(saveButton);
            if (typeof showModalError === 'function') {
                // Get specific validation errors
                const invalidFields = form.querySelectorAll('.form-group.has-error');
                let errorMessage = 'Please correct the following errors:\n';
                invalidFields.forEach(fieldGroup => {
                    const label = fieldGroup.querySelector('label');
                    const errorMsg = fieldGroup.querySelector('.validation-message');
                    if (label && errorMsg) {
                        errorMessage += `• ${label.textContent}: ${errorMsg.textContent}\n`;
                    } else if (label) {
                        errorMessage += `• ${label.textContent}: Required field\n`;
                    }
                });
                if (invalidFields.length === 0) {
                    errorMessage = 'Please fill in all required fields before continuing.';
                }
                showModalError(modal, errorMessage);
            }
            return;
        }
    }
    
    // Get selected interfaces from the new interface selection system
    const selectedInterfaces = window.selectedBridgeInterfaces ? 
        Array.from(window.selectedBridgeInterfaces) : [];
    
    const formData = {
        name: document.getElementById('bridge-name').value,
        type: document.getElementById('bridge-type').value,
        description: document.getElementById('bridge-description').value,
        interfaces: selectedInterfaces,
        configType: document.querySelector('.toggle-seg.active').getAttribute('data-config'),
        ipAddresses: collectBridgeIpAddresses(),
        ip: collectBridgeIpAddresses()[0] || '', // Backward compatibility
        gateway: (document.getElementById('bridge-gateway') && document.getElementById('bridge-gateway').value) || '',
        stp: (document.getElementById('bridge-stp') && document.getElementById('bridge-stp').checked) || false,
        forwardDelay: (document.getElementById('bridge-forward-delay') && document.getElementById('bridge-forward-delay').value) || '4s',
        preserveRoutes: (document.getElementById('bridge-preserve-routes') && document.getElementById('bridge-preserve-routes').checked) !== false
    };
    
    NetworkLogger.info(' Form data collected:', formData);
    NetworkLogger.info(`Creating bridge ${formData.name} with ${formData.interfaces.length} interfaces`);
    
    // Basic validation
    if (!formData.name || !formData.type) {
        NetworkLogger.error(' Validation failed - insufficient data');
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Please fill in all required fields.');
        } else {
            NetworkManager.showError('Please fill in all required fields');
        }
        return;
    }
    
    // Validate bridge name format
    if (!/^br[\w-]*$/.test(formData.name)) {
        NetworkLogger.error(' Invalid bridge name format');
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Bridge name must start with "br" (e.g., br-vm, br-mgmt).');
        } else {
            NetworkManager.showError('Bridge name must start with "br" (e.g., br-vm, br-mgmt)');
        }
        return;
    }
    
    // Validate interface names for security
    try {
        assertValidInterfaceName(formData.name);
        formData.interfaces.forEach(assertValidInterfaceName);
    } catch (validationError) {
        NetworkLogger.error(' Interface name validation failed:', validationError);
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, `Invalid interface name: ${validationError.message}`);
        } else {
            NetworkManager.showError(`Invalid interface name: ${validationError.message}`);
        }
        return;
    }
    
    NetworkLogger.info(' Validation passed, creating bridge configuration...');
    NetworkLogger.info(`Applying bridge configuration for ${formData.name}...`);
    
    // Create bridge using real system calls
    createRealBridge(formData)
        .then(() => {
            NetworkLogger.info(' Bridge created successfully');
            NetworkLogger.success(`Bridge ${formData.name} created successfully`);
            ButtonProgress.clearLoading(saveButton);
            if (typeof showModalSuccess === 'function') {
                showModalSuccess(modal, `Bridge ${formData.name} created successfully! The configuration has been applied.`);
                setTimeout(() => {
                    NetworkManager.closeModal();
                    BridgeManager.loadBridges();
                }, 2000);
            } else {
                NetworkManager.showSuccess(`Bridge ${formData.name} created successfully`);
                NetworkManager.closeModal();
                BridgeManager.loadBridges();
            }
        })
        .catch((error) => {
            NetworkLogger.error(' Error creating bridge:', error);
            NetworkLogger.error(`Failed to create bridge ${formData.name}: ${error.message}`);
            ButtonProgress.clearLoading(saveButton);
            if (typeof showModalError === 'function') {
                showModalError(modal, `Failed to create bridge: ${error.message}`);
            } else {
                NetworkManager.showError(`Failed to create bridge: ${error.message}`);
            }
        });
}

// Create real bridge configuration
// Check for existing default gateway conflicts before creating bridge
async function checkForBridgeGatewayConflicts(config) {
    NetworkLogger.info('Checking for existing default gateway conflicts...');
    
    try {
        // Get all existing Netplan configurations
        const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
        const files = netplanFiles.trim().split('\n').filter(f => f.trim());
        
        const existingGateways = [];
        const filesToFix = [];
        
        for (const file of files) {
            try {
                const content = await cockpit.file(file, { superuser: 'try' }).read();
                if (content) {
                    // Check for deprecated gateway4 usage
                    const hasGateway4 = content.includes('gateway4:');
                    
                    // Check for gateway4 (deprecated) or default routes
                    const gateway4Matches = content.match(/gateway4:\s*([^\s\n]+)/g);
                    const defaultRouteMatches = content.match(/- to: (default|0\.0\.0\.0\/0)/g);
                    
                    if (hasGateway4) {
                        filesToFix.push({
                            file: file,
                            content: content,
                            hasGateway4: true
                        });
                    }
                    
                    if (gateway4Matches || defaultRouteMatches) {
                        // Extract interface name from the file content
                        const interfaceMatches = content.match(/^\s*([a-zA-Z0-9.-]+):/gm);
                        if (interfaceMatches) {
                            interfaceMatches.forEach(match => {
                                const interfaceName = match.replace(':', '').trim();
                                if (interfaceName && !['network', 'version', 'renderer', 'ethernets', 'bonds', 'bridges', 'vlans'].includes(interfaceName)) {
                                    existingGateways.push({
                                        interface: interfaceName,
                                        file: file,
                                        hasGateway4: !!gateway4Matches,
                                        hasDefaultRoute: !!defaultRouteMatches
                                    });
                                }
                            });
                        }
                    }
                }
            } catch (fileError) {
                NetworkLogger.warning(`Could not read netplan file ${file}:`, fileError.message);
            }
        }
        
        // Show warning about deprecated gateway4 usage and offer to fix
        if (filesToFix.length > 0) {
            NetworkLogger.warning(`Found ${filesToFix.length} file(s) using deprecated gateway4. This may cause conflicts.`);
            
            const affectedFiles = filesToFix.map(f => f.file).join(', ');
            NetworkLogger.info(`Files with deprecated gateway4: ${affectedFiles}`);
            NetworkLogger.info('Automatically removing deprecated gateway4 configurations to prevent conflicts...');
            
            // Automatically fix deprecated gateway4 configurations
            for (const fileToFix of filesToFix) {
                try {
                    let updatedContent = fileToFix.content;
                    
                    // Remove gateway4 lines and replace with equivalent routes if needed
                    const gateway4Lines = updatedContent.match(/^\s*gateway4:\s*([^\s\n]+).*$/gm);
                    if (gateway4Lines) {
                        for (const line of gateway4Lines) {
                            const gatewayMatch = line.match(/gateway4:\s*([^\s\n]+)/);
                            if (gatewayMatch) {
                                const gatewayIp = gatewayMatch[1];
                                NetworkLogger.info(`Removing deprecated gateway4: ${gatewayIp} from ${fileToFix.file}`);
                                
                                // Simply remove the gateway4 line to prevent conflicts
                                // Don't add default routes as they may conflict with other interfaces
                                updatedContent = updatedContent.replace(line + '\n', '');
                                updatedContent = updatedContent.replace(line, '');
                            }
                        }
                        
                        // Write the updated content back to the file
                        await cockpit.file(fileToFix.file, { superuser: 'try' }).replace(updatedContent);
                        NetworkLogger.info(`Updated ${fileToFix.file} to remove deprecated gateway4 configuration`);
                    }
                } catch (fixError) {
                    NetworkLogger.warning(`Could not fix deprecated gateway4 in ${fileToFix.file}:`, fixError.message);
                }
            }
        }
        
        if (existingGateways.length > 0) {
            NetworkLogger.warning('Found existing interfaces with default gateways:', existingGateways);
            
            // Check if any interface has a default gateway and we're trying to add one
            if (config.gateway && existingGateways.length > 0) {
                const conflictingInterfaces = existingGateways.map(gw => gw.interface).join(', ');
                NetworkLogger.warning(`Multiple default gateways detected. Existing: ${conflictingInterfaces}. Removing gateway from bridge ${config.name} to prevent conflicts.`);
                // Remove gateway to prevent conflicts
                delete config.gateway;
            }
        }
        
        // Always remove gateway from bridge config as a precaution to prevent route conflicts
        if (config.gateway) {
            NetworkLogger.info(`Removing gateway ${config.gateway} from bridge ${config.name} configuration to prevent route table conflicts`);
            delete config.gateway;
        }
        
    } catch (error) {
        NetworkLogger.warning('Could not check for gateway conflicts:', error.message);
        // Continue anyway, but remove gateway as a precaution
        if (config.gateway) {
            NetworkLogger.info('Removing gateway as precaution due to conflict check failure');
            delete config.gateway;
        }
    }
}

// Clean up conflicting default routes from existing Netplan files (bridge version)
async function cleanupBridgeConflictingRoutes() {
    NetworkLogger.info('Cleaning up potentially conflicting default routes...');
    
    try {
        // Get all existing Netplan configurations
        const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
        const files = netplanFiles.trim().split('\n').filter(f => f.trim());
        
        let defaultRouteFound = false;
        let defaultRouteInterface = null;
        
        // First pass: identify which interface should keep the default route
        for (const file of files) {
            try {
                const content = await cockpit.file(file, { superuser: 'try' }).read();
                if (content) {
                    // Check for default routes
                    const defaultRouteMatches = content.match(/- to: (default|0\.0\.0\.0\/0)/g);
                    if (defaultRouteMatches && !defaultRouteFound) {
                        // Keep the first valid default route we find (usually from main config)
                        const interfaceMatches = content.match(/^\s*([a-zA-Z0-9.-]+):/gm);
                        if (interfaceMatches) {
                            for (const match of interfaceMatches) {
                                const interfaceName = match.replace(':', '').trim();
                                if (interfaceName && !['network', 'version', 'renderer', 'ethernets', 'bonds', 'bridges', 'vlans'].includes(interfaceName)) {
                                    defaultRouteInterface = interfaceName;
                                    defaultRouteFound = true;
                                    NetworkLogger.info(`Keeping default route on interface: ${interfaceName} (file: ${file})`);
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (fileError) {
                NetworkLogger.warning(`Could not read file ${file}:`, fileError.message);
            }
        }
        
        // Second pass: remove conflicting routes and gateway4 from other files
        for (const file of files) {
            try {
                const content = await cockpit.file(file, { superuser: 'try' }).read();
                if (content) {
                    let updatedContent = content;
                    let contentChanged = false;
                    
                    // Remove deprecated gateway4 lines
                    const gateway4Lines = content.match(/^\s*gateway4:.*$/gm);
                    if (gateway4Lines && gateway4Lines.length > 0) {
                        NetworkLogger.info(`Removing deprecated gateway4 from ${file}`);
                        for (const line of gateway4Lines) {
                            updatedContent = updatedContent.replace(line + '\n', '');
                            updatedContent = updatedContent.replace(line, '');
                            contentChanged = true;
                        }
                    }
                    
                    // Check if this file contains the interface that should keep the default route
                    const shouldKeepDefaultRoute = defaultRouteInterface && content.includes(`${defaultRouteInterface}:`);
                    
                    if (!shouldKeepDefaultRoute) {
                        // Remove default routes from files that shouldn't have them
                        const defaultRouteLines = content.match(/^\s*- to: (default|0\.0\.0\.0\/0).*$/gm);
                        if (defaultRouteLines && defaultRouteLines.length > 0) {
                            NetworkLogger.info(`Removing conflicting default route(s) from ${file}`);
                            
                            for (const line of defaultRouteLines) {
                                updatedContent = updatedContent.replace(line + '\n', '');
                                updatedContent = updatedContent.replace(line, '');
                                contentChanged = true;
                            }
                        }
                        
                        // Also remove the entire routes section if it becomes empty
                        updatedContent = updatedContent.replace(/^\s*routes:\s*$/gm, '');
                        
                        // Remove any "via:" lines that are orphaned after route removal
                        updatedContent = updatedContent.replace(/^\s*via:.*$/gm, '');
                    }
                    
                    // Fix incorrect bridge interface configuration (bridge referencing itself)
                    const selfReferencingBridge = content.match(/^\s*([a-zA-Z0-9.-]+):\s*$[\s\S]*?interfaces:\s*\n\s*-\s*\1\s*$/gm);
                    if (selfReferencingBridge) {
                        NetworkLogger.info(`Fixing self-referencing bridge interface in ${file}`);
                        // Remove the self-referencing interface line
                        updatedContent = updatedContent.replace(/^\s*-\s*([a-zA-Z0-9.-]+)\s*$/gm, (match, interfaceName) => {
                            // Check if this interface name matches any bridge name in the same file
                            const bridgeNames = content.match(/^\s*([a-zA-Z0-9.-]+):\s*$/gm);
                            if (bridgeNames) {
                                for (const bridgeLine of bridgeNames) {
                                    const bridgeName = bridgeLine.replace(':', '').trim();
                                    if (bridgeName === interfaceName && !['network', 'version', 'renderer', 'ethernets', 'bonds', 'bridges', 'vlans'].includes(bridgeName)) {
                                        NetworkLogger.info(`Removing self-reference: ${interfaceName}`);
                                        contentChanged = true;
                                        return ''; // Remove the self-referencing line
                                    }
                                }
                            }
                            return match; // Keep other interface references
                        });
                    }
                    
                    // Clean up any empty lines and sections
                    updatedContent = updatedContent.replace(/\n\n\n+/g, '\n\n');
                    updatedContent = updatedContent.replace(/^\s*interfaces:\s*$/gm, ''); // Remove empty interfaces sections
                    
                    if (contentChanged) {
                        await cockpit.file(file, { superuser: 'try' }).replace(updatedContent);
                        NetworkLogger.info(`Cleaned up conflicting configurations in ${file}`);
                    }
                }
            } catch (fileError) {
                NetworkLogger.warning(`Could not process file ${file}:`, fileError.message);
            }
        }
        
    } catch (error) {
        NetworkLogger.warning('Could not clean up conflicting routes:', error.message);
    }
}

async function createRealBridge(config) {
    NetworkLogger.info('Creating real bridge with config:', config);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available. Please ensure this module is running within Cockpit.');
    }
    
    try {
        // Check for existing default gateway conflicts before creating bridge
        await checkForBridgeGatewayConflicts(config);
        
        // Additional cleanup: remove any conflicting default routes from other files
        await cleanupBridgeConflictingRoutes();
        
        // Backup system routes before making changes if route preservation is enabled
        if (config.preserveRoutes !== false) {
            NetworkLogger.info('Backing up system routes before bridge creation...');
            await NetworkConfigUtils.backupSystemRoutes();
        } else {
            NetworkLogger.info('Route preservation disabled by user');
        }
        
        // Validate that referenced interfaces exist before proceeding
        NetworkLogger.info('Validating bridge interfaces availability...');
        await validateBridgeInterfaces(config.interfaces);
        
        // Generate Netplan configuration for the bridge
        const netplanConfigResult = generateBridgeNetplanConfig(config);
        const { yamlContent: netplanConfig, hasVlanReferences, vlanInterfaces } = netplanConfigResult;
        NetworkLogger.info('Generated Netplan config:', netplanConfig);
        
        // Determine config file name using comprehensive dependency-aware system
        // Analyze the bridge interfaces to determine parent types
        let parentInfo = { parentType: 'physical' };
        let isComplex = false;
        
        // Check if any interfaces are VLANs, bonds, or other complex types
        for (const interfaceName of config.interfaces) {
            const analysis = NetworkConfigUtils.analyzeInterfaceStructure(interfaceName);
            if (analysis.objectType !== 'physical') {
                parentInfo.parentType = analysis.objectType;
                parentInfo.isComplex = true;
                isComplex = true;
                break; // Found complex interface, use it for priority
            }
        }
        
        // Generate filename using the comprehensive system
        const filename = NetworkConfigUtils.generateNetplanFilename(config.name, 'bridge', parentInfo);
        const configFile = `/etc/netplan/${filename}`;
        
        NetworkLogger.info(`BridgeManager: Writing configuration to ${configFile} (${isComplex ? 'complex topology priority' : 'standard priority'})`);
        
        if (hasVlanReferences) {
            NetworkLogger.info(`Bridge references ${vlanInterfaces.length} VLAN interface(s): ${vlanInterfaces.map(v => v.name).join(', ')}`);
        }
        
        // Validate the configuration before writing it
        NetworkLogger.info('Validating Netplan configuration before applying...');
        await validateNetplanConfig(netplanConfig);
        
        await cockpit.file(configFile, { superuser: 'require' }).replace(netplanConfig);
        
        // Set proper file permissions (ignore errors if file doesn't exist)
        await NetworkConfigUtils.safeChmod(configFile, '600');
        
        NetworkLogger.info('Netplan configuration written successfully');
        
        // Apply the configuration directly with netplan apply for bridges
        NetworkLogger.info('Applying bridge configuration directly with netplan apply...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        NetworkLogger.info('Bridge configuration applied successfully');
        
        // Explicitly restore system routes as an additional safety measure if preservation is enabled
        if (config.preserveRoutes !== false) {
            NetworkLogger.info('Ensuring system routes are properly restored...');
            try {
                await NetworkConfigUtils.restoreSystemRoutes();
                NetworkLogger.info('System routes restoration completed');
            } catch (routeError) {
                NetworkLogger.warning('Route restoration had issues, but continuing:', routeError);
                // Don't fail the entire operation for route restoration issues
            }
        } else {
            NetworkLogger.info('Route preservation was disabled, skipping route restoration');
        }
        
        // Verify bridge creation
        NetworkLogger.info('Verifying bridge creation...');
        try {
            await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
            NetworkLogger.info('Bridge interface verified successfully');
        } catch (verifyError) {
            NetworkLogger.warning('Could not verify bridge interface, but configuration was applied:', verifyError);
        }
        
    } catch (error) {
        NetworkLogger.error('Error creating bridge:', error);
        throw new Error(`Failed to create bridge interface: ${error.message}`);
    }
}

// Helper function to validate Netplan configuration before applying
async function validateNetplanConfig(yamlContent) {
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    const tempFile = `/tmp/netplan-validate-${Date.now()}.yaml`;
    
    try {
        // Write temporary config file for validation
        NetworkLogger.info('Creating temporary config file for validation...');
        await cockpit.file(tempFile, { superuser: 'require' }).replace(yamlContent);
        
        // Set proper file permissions to avoid Netplan warnings/errors
        NetworkLogger.info('Setting secure permissions on temporary config file...');
        await cockpit.spawn(['chmod', '600', tempFile], { superuser: 'require' });
        
        // Basic YAML syntax validation using python
        NetworkLogger.info('Validating YAML syntax...');
        await cockpit.spawn(['python3', '-c', `
import yaml
import sys
try:
    with open('${tempFile}', 'r') as f:
        config = yaml.safe_load(f)
    # Basic structure validation
    if not isinstance(config, dict):
        raise ValueError("Configuration must be a YAML object")
    if 'network' not in config:
        raise ValueError("Configuration must contain 'network' section")
    if not isinstance(config['network'], dict):
        raise ValueError("'network' must be an object")
    if 'bridges' not in config['network']:
        raise ValueError("Configuration must contain 'bridges' section")
    print("YAML syntax and basic structure are valid")
except Exception as e:
    print(f"Configuration error: {e}")
    sys.exit(1)
`], { superuser: 'require' });
        
        NetworkLogger.info('Configuration validation completed successfully');
        return true;
    } catch (error) {
        NetworkLogger.error('Configuration validation failed:', error);
        throw new Error(`Invalid configuration: ${error.message}`);
    } finally {
        // Always clean up temp file, regardless of success or failure
        try {
            NetworkLogger.info('Cleaning up temporary validation file...');
            await cockpit.spawn(['rm', '-f', tempFile], { superuser: 'require' });
        } catch (cleanupError) {
            NetworkLogger.warning('Could not clean up temporary file:', cleanupError);
        }
    }
}

// Helper function to validate that referenced interfaces exist
async function validateBridgeInterfaces(interfaces) {
    if (!interfaces || interfaces.length === 0) {
        return true; // Empty bridge is valid
    }
    
    const missingInterfaces = [];
    const conflictInterfaces = [];
    
    for (const iface of interfaces) {
        try {
            // Check if interface exists in the system
            await cockpit.spawn(['ip', 'link', 'show', iface], { superuser: 'try' });
            NetworkLogger.info(`Interface ${iface} exists and is available for bridging`);
            
            // Check if interface is already assigned to a bond
            try {
                const bondFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*bond*.yaml'], { superuser: 'try' });
                const files = bondFiles.trim().split('\n').filter(f => f.trim());
                
                for (const file of files) {
                    try {
                        const content = await cockpit.file(file, { superuser: 'try' }).read();
                        if (content && content.includes(`- ${iface}`)) {
                            // Interface is already assigned to a bond
                            const bondMatch = content.match(/(\w+):\s*\n.*interfaces:/s);
                            const bondName = bondMatch ? bondMatch[1] : 'unknown bond';
                            conflictInterfaces.push({
                                name: iface,
                                type: 'bond_conflict',
                                message: `Interface ${iface} is already assigned to ${bondName}`
                            });
                            break;
                        }
                    } catch (fileError) {
                        // Skip unreadable files
                    }
                }
            } catch (bondCheckError) {
                NetworkLogger.warning('Could not check for bond conflicts:', bondCheckError);
            }
            
        } catch (error) {
            // Interface doesn't exist - could be a VLAN that needs to be created first
            const interfaceAnalysis = analyzeInterfacesForBridge([iface]);
            
            if (interfaceAnalysis.vlanInterfaces.length > 0) {
                // This is a VLAN interface that should be defined elsewhere
                missingInterfaces.push({
                    name: iface,
                    type: 'vlan',
                    message: `VLAN interface ${iface} must be created first in VLAN configuration`
                });
            } else {
                // Regular interface that doesn't exist
                missingInterfaces.push({
                    name: iface,
                    type: 'physical',
                    message: `Physical interface ${iface} not found in system`
                });
            }
        }
    }
    
    // Check for conflicts first (higher priority error)
    if (conflictInterfaces.length > 0) {
        const errorMessages = conflictInterfaces.map(iface => iface.message).join('; ');
        throw new Error(`Interface conflicts: ${errorMessages}`);
    }
    
    if (missingInterfaces.length > 0) {
        const errorMessages = missingInterfaces.map(iface => iface.message).join('; ');
        throw new Error(`Missing interfaces for bridge: ${errorMessages}`);
    }
    
    return true;
}

// Helper function to analyze and categorize interfaces for bridge configuration
function analyzeInterfacesForBridge(interfaces) {
    const result = {
        vlanInterfaces: [],
        physicalInterfaces: [],
        parentInterfaces: new Set()
    };
    
    if (!interfaces || interfaces.length === 0) {
        return result;
    }
    
    interfaces.forEach(iface => {
        // Check if this is a VLAN interface (format: parent.vlanid or vlan123)
        const dotVlanMatch = iface.match(/^(.+)\.(\d+)$/);
        const namedVlanMatch = iface.match(/^vlan(\d+)$/);
        
        if (dotVlanMatch) {
            // Format: eno1.100, eth0.200
            const parentInterface = dotVlanMatch[1];
            const vlanId = parseInt(dotVlanMatch[2]);
            result.vlanInterfaces.push({
                name: iface,
                parent: parentInterface,
                vlanId: vlanId,
                type: 'dot-notation'
            });
            result.parentInterfaces.add(parentInterface);
            NetworkLogger.info(`Detected VLAN interface: ${iface} (parent: ${parentInterface}, VLAN ID: ${vlanId})`);
        } else if (namedVlanMatch) {
            // Format: vlan100, vlan200
            const vlanId = parseInt(namedVlanMatch[1]);
            result.vlanInterfaces.push({
                name: iface,
                parent: null, // Will be determined later
                vlanId: vlanId,
                type: 'named'
            });
            NetworkLogger.info(`Detected named VLAN interface: ${iface} (VLAN ID: ${vlanId}, parent TBD)`);
        } else {
            // Regular physical interface
            result.physicalInterfaces.push(iface);
            NetworkLogger.info(`Detected physical interface: ${iface}`);
        }
    });
    
    // For named VLANs without explicit parent, try to assign a suitable parent
    result.vlanInterfaces.forEach(vlan => {
        if (vlan.type === 'named' && !vlan.parent) {
            if (result.physicalInterfaces.length > 0) {
                // Use the first physical interface as parent
                vlan.parent = result.physicalInterfaces[0];
                result.parentInterfaces.add(vlan.parent);
                NetworkLogger.info(`Assigned parent ${vlan.parent} to VLAN ${vlan.name}`);
            } else {
                // Fallback to a common interface name
                vlan.parent = 'eth0';
                result.parentInterfaces.add(vlan.parent);
                NetworkLogger.warning(`Using fallback parent eth0 for VLAN ${vlan.name}`);
            }
        }
    });
    
    return result;
}

// Generate Netplan configuration for bridge with modern features
// This function creates a bridge-only Netplan YAML configuration that references existing interfaces
// VLAN and ethernet interfaces should be defined in their respective configuration files
// Example output for bridge referencing existing VLANs:
//   network:
//     version: 2
//     renderer: networkd
//     bridges:
//       br-vm:
//         interfaces:
//           - eno1.100
//           - eno2
//         parameters:
//           stp: true
//         addresses:
//           - 192.168.100.10/24
function generateBridgeNetplanConfig(config) {
    NetworkLogger.info(' Generating Netplan config for bridge:', config.name);
    
    // Analyze interfaces to identify VLANs and their parents for logging purposes
    const interfaceAnalysis = analyzeInterfacesForBridge(config.interfaces);
    const { vlanInterfaces, physicalInterfaces, parentInterfaces } = interfaceAnalysis;
    
    // Build configuration object - bridge only, references existing interfaces
    let yamlContent = `network:
  version: 2
  renderer: networkd
  bridges:
    ${config.name}:
`;
    
    // Add bridge interfaces (reference existing interfaces, don't redefine them)
    if (config.interfaces && config.interfaces.length > 0) {
        yamlContent += `      interfaces:
`;
        config.interfaces.forEach(iface => {
            yamlContent += `        - ${iface}
`;
        });
    }
    
    // Add bridge-specific parameters
    yamlContent += `      parameters:
`;
    
    if (config.stp !== undefined) {
        yamlContent += `        stp: ${config.stp}
`;
    }
    
    if (config.forwardDelay && config.forwardDelay !== '4s') {
        // Convert delay to milliseconds for Netplan
        const delayMs = parseFloat(config.forwardDelay) * 1000;
        yamlContent += `        forward-delay: ${delayMs}
`;
    }
    
    // Add IP configuration
    if (config.configType === 'static') {
        // Handle multiple IP addresses
        const ipAddresses = config.ipAddresses || (config.ip ? [config.ip] : []);
        if (ipAddresses.length > 0) {
            yamlContent += `      addresses:
`;
            ipAddresses.forEach(ip => {
                yamlContent += `        - ${ip}
`;
            });
        }
        
        // Gateway configuration is intentionally disabled to prevent automatic route conflicts
        // The gateway value is preserved in the configuration for reference but not applied as routes
        // Routes are managed automatically by the system based on IP address configuration
        // Users can manually configure custom routes after bridge creation if needed
        if (config.gateway && config.gateway.trim() && 
            !['N/A', 'Auto', 'null', 'undefined'].includes(config.gateway)) {
            NetworkLogger.info(`Bridge gateway ${config.gateway} specified but not added to prevent automatic route conflicts`);
            // Gateway is stored in the form but not written to Netplan to avoid route management issues
        }
    } else if (config.configType === 'dhcp') {
        yamlContent += `      dhcp4: true
`;
    }
    
    NetworkLogger.info(' Generated Netplan YAML (bridge-only):');
    NetworkLogger.info('--- START YAML ---');
    NetworkLogger.info(yamlContent);
    NetworkLogger.info('--- END YAML ---');
    NetworkLogger.info(` Bridge analysis: ${vlanInterfaces.length} VLAN interface(s), ${physicalInterfaces.length} physical interface(s), ${parentInterfaces.size} parent interface(s)`);
    if (vlanInterfaces.length > 0) {
        NetworkLogger.info(' Note: Bridge references VLANs - will use higher priority filename to load after VLAN configurations');
    } else {
        NetworkLogger.info(' Note: Bridge contains only physical interfaces - using standard priority filename');
    }
    
    return {
        yamlContent,
        hasVlanReferences: vlanInterfaces.length > 0,
        vlanInterfaces,
        physicalInterfaces
    };
}

async function updateBridge(bridgeName) {
    NetworkLogger.info(`BridgeManager: Updating bridge ${bridgeName}...`);
    NetworkLogger.info(`Updating bridge ${bridgeName}...`);
    
    const modal = document.querySelector('.modal');
    
    // Get the update button and show progress
    const updateButton = modal.querySelector('.btn-brand');
    ButtonProgress.setLoading(updateButton, '<i class="fas fa-save"></i> Update Bridge');
    
    const formData = {
        name: bridgeName,
        type: (document.getElementById('edit-bridge-type') && document.getElementById('edit-bridge-type').value) || '',
        description: (document.getElementById('edit-bridge-description') && document.getElementById('edit-bridge-description').value) || '',
        interfaces: window.editSelectedBridgeInterfaces ? 
            Array.from(window.editSelectedBridgeInterfaces) : [],
        ipAddresses: collectEditBridgeIpAddresses(),
        ip: collectEditBridgeIpAddresses()[0] || '', // Backward compatibility
        gateway: (document.getElementById('edit-bridge-gateway') && document.getElementById('edit-bridge-gateway').value) || '',
        stp: (document.getElementById('edit-bridge-stp') && document.getElementById('edit-bridge-stp').checked) || false,
        forwardDelay: (document.getElementById('edit-bridge-forward-delay') && document.getElementById('edit-bridge-forward-delay').value) || '4s',
        preserveRoutes: (document.getElementById('edit-bridge-preserve-routes') && document.getElementById('edit-bridge-preserve-routes').checked) !== false
    };
    
    NetworkLogger.info(' Update form data:', formData);
    
    // Update bridge configuration using real system calls
    updateRealBridge(formData)
        .then(() => {
            NetworkLogger.info(' Bridge updated successfully');
            NetworkLogger.success(`Bridge ${bridgeName} updated successfully`);
            ButtonProgress.clearLoading(updateButton);
            if (typeof showModalSuccess === 'function') {
                showModalSuccess(modal, `Bridge ${bridgeName} updated successfully`);
                setTimeout(() => {
                    NetworkManager.closeModal();
                    BridgeManager.loadBridges();
                }, 2000);
            } else {
                NetworkManager.showSuccess(`Bridge ${bridgeName} updated successfully`);
                NetworkManager.closeModal();
                BridgeManager.loadBridges();
            }
        })
        .catch((error) => {
            NetworkLogger.error(' Failed to update bridge:', error);
            NetworkLogger.error(`Failed to update bridge ${bridgeName}: ${error.message}`);
            ButtonProgress.clearLoading(updateButton);
            if (typeof showModalError === 'function') {
                showModalError(modal, `Failed to update bridge: ${error.message}`);
            } else {
                NetworkManager.showError(`Failed to update bridge: ${error.message}`);
            }
        });
}

// Update real bridge configuration
async function updateRealBridge(config) {
    NetworkLogger.info(' Updating real bridge configuration:', config);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // Check for existing default gateway conflicts before updating bridge
        await checkForBridgeGatewayConflicts(config);
        
        // Additional cleanup: remove any conflicting default routes from other files
        await cleanupBridgeConflictingRoutes();
        
        // Backup system routes before making changes if route preservation is enabled
        if (config.preserveRoutes !== false) {
            NetworkLogger.info('Backing up system routes before bridge update...');
            await NetworkConfigUtils.backupSystemRoutes();
        } else {
            NetworkLogger.info('Route preservation disabled by user for bridge update');
        }
        // Find bridge in current configuration
        const bridge = BridgeManager.bridges.find(b => b.name === config.name);
        if (!bridge) {
            throw new Error(`Bridge ${config.name} not found`);
        }
        
        // Create updated configuration
        const updatedConfig = {
            name: config.name,
            type: config.type || bridge.type,
            description: config.description || bridge.description,
            interfaces: config.interfaces || bridge.interfaces, // Use updated interfaces
            configType: config.ip === 'Not configured' || !config.ip ? 'none' : 'static',
            ip: config.ip === 'Not configured' ? '' : config.ip,
            gateway: config.gateway === 'Not configured' ? '' : config.gateway,
            stp: config.stp,
            forwardDelay: config.forwardDelay || bridge.forwardDelay
        };
        
        // Generate updated Netplan configuration
        const netplanConfigResult = generateBridgeNetplanConfig(updatedConfig);
        const { yamlContent: newNetplanConfig, hasVlanReferences } = netplanConfigResult;
        NetworkLogger.info(' Generated updated Netplan config:', newNetplanConfig);
        
        // Determine parent types for comprehensive filename system
        let parentInfo = { parentType: 'physical' };
        let isComplex = false;
        
        // Check if any interfaces are VLANs, bonds, or other complex types
        for (const interfaceName of updatedConfig.interfaces) {
            const analysis = NetworkConfigUtils.analyzeInterfaceStructure(interfaceName);
            if (analysis.objectType !== 'physical') {
                parentInfo.parentType = analysis.objectType;
                parentInfo.isComplex = true;
                isComplex = true;
                break; // Found complex interface, use it for priority
            }
        }
        
        // Generate new filename using comprehensive system
        const newFilename = NetworkConfigUtils.generateNetplanFilename(config.name, 'bridge', parentInfo);
        const configFile = `/etc/netplan/${newFilename}`;
        
        // Check for old files that need cleanup (both old and new systems)
        const oldConfigFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
        const oldHighPriorityFile = `/etc/netplan/91-xavs-${config.name}.yaml`;
        
        // Generate old filename using new system (in case it was previously created with new system)
        const oldParentInfo = { parentType: 'physical' }; // Default for existing bridges
        const oldNewSystemFilename = NetworkConfigUtils.generateNetplanFilename(config.name, 'bridge', oldParentInfo);
        const oldNewSystemFile = `/etc/netplan/${oldNewSystemFilename}`;
        
        try {
            // Clean up old configuration files (all possible old naming schemes)
            NetworkLogger.info('Cleaning up old bridge configuration files...');
            await cockpit.spawn(['rm', '-f', oldConfigFile], { superuser: 'try' });
            await cockpit.spawn(['rm', '-f', oldHighPriorityFile], { superuser: 'try' });
            if (oldNewSystemFile !== configFile) {
                await cockpit.spawn(['rm', '-f', oldNewSystemFile], { superuser: 'try' });
            }
        } catch (cleanupError) {
            NetworkLogger.warning('Error during old file cleanup:', cleanupError);
        }
        
        NetworkLogger.info(`BridgeManager: Writing updated configuration to ${configFile}`);
        
        // Write updated configuration
        await cockpit.file(configFile, { superuser: 'require' }).replace(newNetplanConfig);
        NetworkLogger.info(' Updated configuration written');
        
        // Apply changes directly with netplan apply for bridges
        NetworkLogger.info('Applying updated bridge configuration directly with netplan apply...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        NetworkLogger.info(' Configuration applied successfully');
        
        // Explicitly restore system routes as an additional safety measure if preservation is enabled
        if (config.preserveRoutes !== false) {
            NetworkLogger.info('Ensuring system routes are properly restored...');
            try {
                await NetworkConfigUtils.restoreSystemRoutes();
                NetworkLogger.info('System routes restoration completed');
            } catch (routeError) {
                NetworkLogger.warning('Route restoration had issues, but continuing:', routeError);
                // Don't fail the entire operation for route restoration issues
            }
        } else {
            NetworkLogger.info('Route preservation was disabled, skipping route restoration');
        }
        
    } catch (error) {
        NetworkLogger.error(' Error updating bridge:', error);
        throw error;
    }
}

async function toggleBridge(bridgeName, currentStatus) {
    NetworkLogger.info(`BridgeManager: Toggling bridge ${bridgeName} from ${currentStatus}`);
    NetworkLogger.info(`${currentStatus === 'up' ? 'Disabling' : 'Enabling'} bridge ${bridgeName}...`);
    
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    if (confirm(`Are you sure you want to ${action} bridge ${bridgeName}?`)) {
        NetworkLogger.info(`BridgeManager: User confirmed ${action} for bridge ${bridgeName}`);
        
        // Use real system command to toggle bridge
        toggleRealBridge(bridgeName, newStatus)
            .then(() => {
                NetworkLogger.success(`Bridge ${bridgeName} ${action}d successfully`);
                NetworkManager.showSuccess(`Bridge ${bridgeName} ${action}d successfully`);
                BridgeManager.loadBridges();
            })
            .catch((error) => {
                NetworkLogger.error(' Failed to toggle bridge:', error);
                NetworkLogger.error(`Failed to ${action} bridge ${bridgeName}: ${error.message}`);
                NetworkManager.showError(`Failed to ${action} bridge: ${error.message}`);
            });
    }
}

// Toggle real bridge interface
async function toggleRealBridge(bridgeName, targetStatus) {
    NetworkLogger.info(`BridgeManager: Setting bridge ${bridgeName} to ${targetStatus}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    // Validate interface name for security
    assertValidInterfaceName(bridgeName);
    
    try {
        const command = targetStatus === 'up' ? 'up' : 'down';
        NetworkLogger.info(`BridgeManager: Running: ip link set ${bridgeName} ${command}`);
        
        await cockpit.spawn(['ip', 'link', 'set', bridgeName, command], { superuser: 'require' });
        NetworkLogger.info(`BridgeManager: Bridge ${bridgeName} set to ${targetStatus} successfully`);
        
    } catch (error) {
        NetworkLogger.error(`BridgeManager: Error toggling bridge ${bridgeName}:`, error);
        throw new Error(`Failed to set bridge ${bridgeName} to ${targetStatus}: ${error.message}`);
    }
}

async function deleteBridge(bridgeName) {
    NetworkLogger.info(`BridgeManager: Delete bridge ${bridgeName} requested`);
    NetworkLogger.warning(`Bridge deletion requested for ${bridgeName}`);
    
    if (confirm(`Are you sure you want to delete bridge ${bridgeName}? This will remove the bridge interface and its configuration. This action cannot be undone.`)) {
        NetworkLogger.info(`BridgeManager: User confirmed deletion of bridge ${bridgeName}`);
        NetworkLogger.info(`Deleting bridge ${bridgeName}...`);
        
        // Use real system commands to delete bridge
        deleteRealBridge(bridgeName)
            .then(() => {
                NetworkLogger.success(`Bridge ${bridgeName} deleted successfully`);
                NetworkManager.showSuccess(`Bridge ${bridgeName} deleted successfully`);
                BridgeManager.loadBridges();
            })
            .catch((error) => {
                NetworkLogger.error(' Failed to delete bridge:', error);
                NetworkLogger.error(`Failed to delete bridge ${bridgeName}: ${error.message}`);
                NetworkManager.showError(`Failed to delete bridge: ${error.message}`);
            });
    }
}

// Delete real bridge interface and configuration
async function deleteRealBridge(bridgeName) {
    NetworkLogger.info(`BridgeManager: Deleting real bridge ${bridgeName}`);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available');
    }
    
    // Validate interface name for security
    assertValidInterfaceName(bridgeName);
    
    try {
        // First, bring the bridge down
        NetworkLogger.info(`BridgeManager: Bringing bridge ${bridgeName} down...`);
        try {
            await cockpit.spawn(['ip', 'link', 'set', bridgeName, 'down'], { superuser: 'require' });
        } catch (downError) {
            NetworkLogger.warning(`BridgeManager: Could not bring bridge down (may not exist):`, downError);
        }
        
        // Remove configuration files (both old and new system naming)
        const oldStandardFile = `/etc/netplan/90-xavs-${bridgeName}.yaml`;
        const oldHighPriorityFile = `/etc/netplan/91-xavs-${bridgeName}.yaml`;
        
        // Generate possible new system filenames to clean up
        const possibleParentTypes = ['physical', 'bond', 'vlan'];
        const configFilesToRemove = [oldStandardFile, oldHighPriorityFile];
        
        for (const parentType of possibleParentTypes) {
            const parentInfo = { parentType: parentType };
            const filename = NetworkConfigUtils.generateNetplanFilename(bridgeName, 'bridge', parentInfo);
            const configPath = `/etc/netplan/${filename}`;
            if (!configFilesToRemove.includes(configPath)) {
                configFilesToRemove.push(configPath);
            }
        }
        
        NetworkLogger.info(`BridgeManager: Removing configuration files for ${bridgeName}...`);
        
        for (const configFile of configFilesToRemove) {
            try {
                await cockpit.spawn(['rm', '-f', configFile], { superuser: 'try' });
                NetworkLogger.info(`Removed configuration file: ${configFile}`);
            } catch (rmError) {
                NetworkLogger.info(`Configuration file ${configFile} does not exist or could not be removed`);
            }
        }
        
        // Backup system routes before applying netplan changes
        NetworkLogger.info('Backing up system routes before bridge deletion...');
        await NetworkConfigUtils.backupSystemRoutes();
        
        // Clean up any remaining gateway conflicts and deprecated configs before applying
        NetworkLogger.info('Cleaning up gateway conflicts and deprecated configs before bridge deletion...');
        try {
            await checkForBridgeGatewayConflicts();
            await cleanupBridgeConflictingRoutes();
        } catch (cleanupError) {
            NetworkLogger.warning('Cleanup failed during bridge deletion:', cleanupError);
            // Continue with netplan apply even if cleanup fails
        }
        
        // Apply Netplan to remove the bridge from system directly
        NetworkLogger.info('Applying Netplan bridge removal directly with netplan apply...');
        try {
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            NetworkLogger.info('Netplan applied - bridge removal completed successfully');
        } catch (netplanError) {
            NetworkLogger.warning('Netplan apply failed during bridge removal:', netplanError);
            // If netplan fails due to conflicts, try manual bridge deletion
            NetworkLogger.info(`Attempting manual deletion of bridge ${bridgeName}...`);
            try {
                await cockpit.spawn(['ip', 'link', 'delete', bridgeName], { superuser: 'require' });
                NetworkLogger.info(`Manual bridge deletion successful for ${bridgeName}`);
            } catch (manualError) {
                NetworkLogger.warning(`Manual bridge deletion also failed for ${bridgeName}:`, manualError);
            }
        }
        
        // Verify bridge is gone
        try {
            await cockpit.spawn(['ip', 'link', 'show', bridgeName], { superuser: 'try' });
            NetworkLogger.warning(`BridgeManager: Bridge ${bridgeName} still exists after deletion attempt`);
            
            // Try one more manual deletion attempt
            try {
                NetworkLogger.info(`Final manual deletion attempt for ${bridgeName}...`);
                await cockpit.spawn(['ip', 'link', 'delete', bridgeName], { superuser: 'require' });
                NetworkLogger.info(`Final manual deletion successful for ${bridgeName}`);
            } catch (finalError) {
                NetworkLogger.warning(`Final manual deletion failed for ${bridgeName}:`, finalError);
            }
        } catch (verifyError) {
            NetworkLogger.info(`BridgeManager: Bridge ${bridgeName} successfully removed`);
        }
        
    } catch (error) {
        NetworkLogger.error(`BridgeManager: Error deleting bridge ${bridgeName}:`, error);
        throw new Error(`Failed to delete bridge ${bridgeName}: ${error.message}`);
    }
}

async function addInterfaceToExistingBridge(bridgeName) {
    NetworkLogger.info(`BridgeManager: Adding interface to bridge ${bridgeName}`);
    
    const interfaceName = document.getElementById('new-interface').value;
    if (!interfaceName) {
        if (typeof showModalError === 'function') {
            showModalError(document.querySelector('.modal'), 'Please select an interface');
        } else {
            NetworkManager.showError('Please select an interface');
        }
        return;
    }
    
    NetworkLogger.info(`BridgeManager: Adding interface ${interfaceName} to bridge ${bridgeName}`);
    
    // Add interface using real system commands
    addRealInterfaceToBridge(bridgeName, interfaceName)
        .then(() => {
            NetworkLogger.info(`BridgeManager: Interface ${interfaceName} added to bridge ${bridgeName} successfully`);
            if (typeof showModalSuccess === 'function') {
                showModalSuccess(document.querySelector('.modal'), `Interface ${interfaceName} added to bridge ${bridgeName}`);
                setTimeout(() => {
                    NetworkManager.closeModal();
                    BridgeManager.loadBridges();
                }, 2000);
            } else {
                NetworkManager.showSuccess(`Interface ${interfaceName} added to bridge ${bridgeName}`);
                NetworkManager.closeModal();
                BridgeManager.loadBridges();
            }
        })
        .catch((error) => {
            NetworkLogger.error(' Failed to add interface to bridge:', error);
            if (typeof showModalError === 'function') {
                showModalError(document.querySelector('.modal'), `Failed to add interface to bridge: ${error.message}`);
            } else {
                NetworkManager.showError(`Failed to add interface to bridge: ${error.message}`);
            }
        });
}

// Add real interface to bridge
async function addRealInterfaceToBridge(bridgeName, interfaceName) {
    NetworkLogger.info(`BridgeManager: Adding real interface ${interfaceName} to bridge ${bridgeName}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    // Validate interface names for security
    assertValidInterfaceName(bridgeName);
    assertValidInterfaceName(interfaceName);
    
    try {
        // Backup system routes before making changes
        NetworkLogger.info('Backing up system routes before adding interface to bridge...');
        await NetworkConfigUtils.backupSystemRoutes();
        
        // First, ensure the interface is down
        NetworkLogger.info(`BridgeManager: Bringing interface ${interfaceName} down...`);
        await cockpit.spawn(['ip', 'link', 'set', interfaceName, 'down'], { superuser: 'require' });
        
        // Add interface to bridge
        NetworkLogger.info(`BridgeManager: Adding ${interfaceName} to bridge ${bridgeName}...`);
        await cockpit.spawn(['ip', 'link', 'set', interfaceName, 'master', bridgeName], { superuser: 'require' });
        
        // Bring the interface back up
        NetworkLogger.info(`BridgeManager: Bringing interface ${interfaceName} up...`);
        await cockpit.spawn(['ip', 'link', 'set', interfaceName, 'up'], { superuser: 'require' });
        
        // Restore system routes
        try {
            await NetworkConfigUtils.restoreSystemRoutes();
            NetworkLogger.info('System routes restored successfully after adding interface to bridge');
        } catch (routeError) {
            NetworkLogger.warning('Could not restore system routes after adding interface to bridge:', routeError);
        }
        
        NetworkLogger.info(`BridgeManager: Interface ${interfaceName} added to bridge ${bridgeName} successfully`);
        
    } catch (error) {
        NetworkLogger.error(`BridgeManager: Error adding interface ${interfaceName} to bridge ${bridgeName}:`, error);
        throw new Error(`Failed to add ${interfaceName} to bridge ${bridgeName}: ${error.message}`);
    }
}

function refreshBridges() {
    BridgeManager.loadBridges();
}

// Update the main NetworkManager to use BridgeManager
NetworkManager.loadBridges = function() {
    BridgeManager.loadBridges();
};

// Bridge Edit IP Address Management Functions
function populateEditBridgeIpAddresses(ipAddresses) {
    const container = document.getElementById('edit-bridge-ip-addresses-container');
    
    // Clear existing entries
    container.innerHTML = '';
    window.editBridgeIpAddressCounter = 0;
    
    // Ensure we have at least one entry
    if (ipAddresses.length === 0) {
        ipAddresses = [''];
    }
    
    // Add entries for each IP address
    ipAddresses.forEach((ip, index) => {
        if (index === 0) {
            // First entry
            container.innerHTML = `
                <div class="ip-address-entry" data-index="0">
                    <div style="display: flex; gap: 8px; align-items: flex-end;">
                        <div style="flex: 1;">
                            <input type="text" id="edit-bridge-ip-0" class="form-control edit-bridge-ip-address-input" placeholder="192.168.1.50 (default /24)" data-validate="cidr" value="${ip}">
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger remove-edit-bridge-ip-btn" onclick="removeEditBridgeIpAddress(0)" style="display: none;">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Additional entries
            addEditBridgeIpAddress();
            const newInput = document.getElementById(`edit-bridge-ip-${window.editBridgeIpAddressCounter}`);
            if (newInput) {
                newInput.value = ip;
            }
        }
    });
    
    updateEditBridgeRemoveButtonVisibility();
}

function addEditBridgeIpAddress() {
    if (!window.editBridgeIpAddressCounter) window.editBridgeIpAddressCounter = 0;
    window.editBridgeIpAddressCounter++;
    
    const container = document.getElementById('edit-bridge-ip-addresses-container');
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', window.editBridgeIpAddressCounter);
    
    newEntry.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: flex-end; margin-top: 8px;">
            <div style="flex: 1;">
                <input type="text" id="edit-bridge-ip-${window.editBridgeIpAddressCounter}" class="form-control edit-bridge-ip-address-input" placeholder="192.168.1.51 (default /24)" data-validate="cidr">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-edit-bridge-ip-btn" onclick="removeEditBridgeIpAddress(${window.editBridgeIpAddressCounter})">
                <i class="fas fa-minus"></i>
            </button>
        </div>
    `;
    
    container.appendChild(newEntry);
    
    updateEditBridgeRemoveButtonVisibility();
    
    // Setup live validation for the new input
    const newInput = document.getElementById(`edit-bridge-ip-${window.editBridgeIpAddressCounter}`);
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(newInput.closest('form'));
    }
}

function removeEditBridgeIpAddress(index) {
    const container = document.getElementById('edit-bridge-ip-addresses-container');
    const entry = container.querySelector(`[data-index="${index}"]`);
    if (entry) {
        entry.remove();
    }
    
    // Ensure at least one IP address field remains
    const remainingEntries = container.querySelectorAll('.ip-address-entry');
    if (remainingEntries.length === 0) {
        addEditBridgeIpAddress();
    }
    
    updateEditBridgeRemoveButtonVisibility();
}

function updateEditBridgeRemoveButtonVisibility() {
    const container = document.getElementById('edit-bridge-ip-addresses-container');
    if (!container) return;
    
    const removeButtons = container.querySelectorAll('.remove-edit-bridge-ip-btn');
    
    // Hide remove button if only one IP address field, show otherwise
    if (removeButtons.length <= 1) {
        removeButtons.forEach(btn => btn.style.display = 'none');
    } else {
        removeButtons.forEach(btn => btn.style.display = 'inline-flex');
    }
}

function collectEditBridgeIpAddresses() {
    const inputs = document.querySelectorAll('#edit-bridge-ip-addresses-container .edit-bridge-ip-address-input');
    const ipAddresses = [];
    
    inputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
            // Add /24 as default CIDR if not provided
            if (!value.includes('/') && /^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
                ipAddresses.push(value + '/24');
            } else {
                ipAddresses.push(value);
            }
        }
    });
    
    return ipAddresses;
}

// Bridge Multiple IP Address Management Functions
let bridgeIpAddressCounter = 0;

function addBridgeIpAddress() {
    bridgeIpAddressCounter++;
    const container = document.getElementById('bridge-ip-addresses-container');
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', bridgeIpAddressCounter);
    
    newEntry.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: flex-end; margin-top: 8px;">
            <div style="flex: 1;">
                <input type="text" id="bridge-ip-${bridgeIpAddressCounter}" class="form-control bridge-ip-address-input" placeholder="192.168.1.51 (default /24)" data-validate="cidr">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-bridge-ip-btn" onclick="removeBridgeIpAddress(${bridgeIpAddressCounter})">
                <i class="fas fa-minus"></i>
            </button>
        </div>
    `;
    
    container.appendChild(newEntry);
    
    // Update remove button visibility
    updateBridgeRemoveButtonVisibility();
    
    // Setup live validation for the new input
    const newInput = document.getElementById(`bridge-ip-${bridgeIpAddressCounter}`);
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(newInput.closest('form'));
    }
}

function removeBridgeIpAddress(index) {
    const entry = document.querySelector(`#bridge-ip-addresses-container [data-index="${index}"]`);
    if (entry) {
        entry.remove();
        updateBridgeRemoveButtonVisibility();
    }
}

function updateBridgeRemoveButtonVisibility() {
    const entries = document.querySelectorAll('#bridge-ip-addresses-container .ip-address-entry');
    entries.forEach((entry, idx) => {
        const removeBtn = entry.querySelector('.remove-bridge-ip-btn');
        if (removeBtn) {
            // Show remove button only if there are multiple entries
            removeBtn.style.display = entries.length > 1 ? 'block' : 'none';
        }
    });
}

function collectBridgeIpAddresses() {
    const ipInputs = document.querySelectorAll('.bridge-ip-address-input');
    const ipAddresses = [];
    
    ipInputs.forEach(input => {
        if (input.value.trim()) {
            const ip = input.value.trim();
            // Add /24 as default CIDR if not provided
            if (!ip.includes('/') && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
                ipAddresses.push(ip + '/24');
            } else {
                ipAddresses.push(ip);
            }
        }
    });
    
    return ipAddresses;
}

// Make bridge functions globally accessible
window.addBridge = addBridge;
window.editBridge = editBridge;
window.addBridgeIpAddress = addBridgeIpAddress;
window.removeBridgeIpAddress = removeBridgeIpAddress;
window.updateBridgeRemoveButtonVisibility = updateBridgeRemoveButtonVisibility;
window.collectBridgeIpAddresses = collectBridgeIpAddresses;
window.toggleBridgeInterface = toggleBridgeInterface;
window.removeBridgeInterface = removeBridgeInterface;
window.toggleEditBridgeInterface = toggleEditBridgeInterface;
window.removeEditBridgeInterface = removeEditBridgeInterface;
window.updateBridge = updateBridge;
window.toggleBridge = toggleBridge;
window.deleteBridge = deleteBridge;
window.addInterfaceToBridge = addInterfaceToBridge;
window.addInterfaceToExistingBridge = addInterfaceToExistingBridge;
window.saveBridge = saveBridge;
window.addEditBridgeIpAddress = addEditBridgeIpAddress;
window.removeEditBridgeIpAddress = removeEditBridgeIpAddress;
window.collectEditBridgeIpAddresses = collectEditBridgeIpAddresses;
