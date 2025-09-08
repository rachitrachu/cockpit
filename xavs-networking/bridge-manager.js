// Bridge Management Module

// Validate interface name to prevent command injection
function assertValidInterfaceName(name) {
    if (!name || typeof name !== 'string') {
        throw new Error(`Invalid interface name: ${name}`);
    }
    if (!INTERFACE_NAME_REGEX.test(name)) {
        throw new Error(`Invalid interface name format: ${name}`);
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
                    
                    // Check if this is a bridge interface
                    if (interfaceName.startsWith('br-') || interfaceName.startsWith('bridge') || 
                        await this.isBridgeInterface(interfaceName)) {
                        
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
            const bridgeOutput = await cockpit.spawn(['brctl', 'show'], { superuser: 'try' });
            return bridgeOutput.includes(interfaceName);
        } catch (error) {
            // brctl might not be available, try alternative
            try {
                const bridgeOutput = await cockpit.spawn(['bridge', 'link', 'show'], { superuser: 'try' });
                return bridgeOutput.includes(`master ${interfaceName}`);
            } catch (error2) {
                NetworkLogger.warning(`BridgeManager: Could not check if ${interfaceName} is a bridge:`, error2);
                return false;
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

            // Try to get STP information
            try {
                const stpOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/bridge/stp_state`], 
                    { superuser: 'try' });
                details.stp = stpOutput.trim() === '1';
            } catch (stpError) {
                NetworkLogger.warning(`BridgeManager: Could not get STP state for ${interfaceName}:`, stpError);
            }

            // Try to get forward delay
            try {
                const delayOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/bridge/forward_delay`], 
                    { superuser: 'try' });
                const delayMs = parseInt(delayOutput.trim());
                details.forwardDelay = `${Math.round(delayMs / 100)}s`;
            } catch (delayError) {
                NetworkLogger.warning(`BridgeManager: Could not get forward delay for ${interfaceName}:`, delayError);
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
    NetworkLogger.info(' Creating new bridge...');
    NetworkLogger.info('Creating new bridge...');
    
    const modal = document.querySelector('.modal');
    const form = document.getElementById('bridge-form');
    
    // Get the save button and show progress
    const saveButton = modal.querySelector('.btn-brand');
    ButtonProgress.setLoading(saveButton, '<i class="fas fa-plus"></i> Create Bridge');
    
    // Clear any existing modal messages
    if (typeof clearModalMessages === 'function') {
        clearModalMessages(modal);
    }
    
    // Validate form using live validation
    if (typeof validateForm === 'function') {
        if (!validateForm(form)) {
            ButtonProgress.clearLoading(saveButton);
            if (typeof showModalError === 'function') {
                showModalError(modal, 'Please correct the errors in the form before continuing.');
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
        gateway: document.getElementById('bridge-gateway')?.value || '',
        stp: document.getElementById('bridge-stp')?.checked || false,
        forwardDelay: document.getElementById('bridge-forward-delay')?.value || '4s'
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
async function createRealBridge(config) {
    NetworkLogger.info(' Creating real bridge with config:', config);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available. Please ensure this module is running within Cockpit.');
    }
    
    try {
        // Generate Netplan configuration for the bridge
        const netplanConfig = generateBridgeNetplanConfig(config);
        NetworkLogger.info(' Generated Netplan config:', netplanConfig);
        
        // Write Netplan configuration file
        const configFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
        NetworkLogger.info(`BridgeManager: Writing configuration to ${configFile}`);
        
        await cockpit.file(configFile, { superuser: 'require' }).replace(netplanConfig);
        NetworkLogger.info(' Netplan configuration written successfully');
        
        // Set proper permissions
        await cockpit.spawn(['chmod', '600', configFile], { superuser: 'require' });
        
        // Test the configuration first with netplan try
        NetworkLogger.info(' Testing Netplan configuration with netplan --debug try...');
        try {
            const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
            NetworkLogger.info(' Netplan debug output:', debugOutput);
        } catch (tryError) {
            NetworkLogger.error(' Netplan try failed:', tryError);
            
            // Check if this is just the bridge revert warning (exit status 78)
            if (tryError.exit_status === 78) {
                NetworkLogger.info(' Netplan try exit 78: bridge change warning in non-interactive session; proceeding to apply');
            } else {
                // Fallback: try preflight validation with netplan generate
                NetworkLogger.info(' Attempting fallback preflight validation...');
                try {
                    await cockpit.spawn(['netplan', 'generate'], { superuser: 'require' });
                    NetworkLogger.info(' Preflight validation passed, proceeding to apply');
                } catch (generateError) {
                    NetworkLogger.error(' Preflight validation failed:', generateError);
                    throw new Error(`Configuration validation failed: ${tryError.message || tryError}. The bridge configuration has not been applied.`);
                }
            }
        }
        
        // Apply Netplan configuration permanently
        NetworkLogger.info(' Applying Netplan configuration permanently...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        NetworkLogger.info(' Netplan applied successfully');
        
        // Verify bridge creation
        NetworkLogger.info(' Verifying bridge creation...');
        await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
        NetworkLogger.info(' Bridge interface verified');
        
    } catch (error) {
        NetworkLogger.error(' Error creating bridge:', error);
        throw new Error(`Failed to create bridge interface: ${error.message}`);
    }
}

// Generate Netplan configuration for bridge with modern features
function generateBridgeNetplanConfig(config) {
    NetworkLogger.info(' Generating Netplan config for bridge:', config.name);
    
    // Build configuration object for better structure
    let yamlContent = `network:
  version: 2
  renderer: networkd
  bridges:
    ${config.name}:
`;
    
    // Add bridge parameters
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
        
        // Add gateway using modern routes format with legacy fallback
        if (config.gateway && config.gateway.trim() && 
            !['N/A', 'Auto', 'null', 'undefined'].includes(config.gateway)) {
            yamlContent += `      routes:
        - to: default
          via: ${config.gateway}
      gateway4: ${config.gateway}
`;
        }
    } else if (config.configType === 'dhcp') {
        yamlContent += `      dhcp4: true
`;
    }
    
    NetworkLogger.info(' Generated Netplan YAML:', yamlContent);
    return yamlContent;
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
        type: document.getElementById('edit-bridge-type')?.value || '',
        description: document.getElementById('edit-bridge-description')?.value || '',
        interfaces: window.editSelectedBridgeInterfaces ? 
            Array.from(window.editSelectedBridgeInterfaces) : [],
        ipAddresses: collectEditBridgeIpAddresses(),
        ip: collectEditBridgeIpAddresses()[0] || '', // Backward compatibility
        gateway: document.getElementById('edit-bridge-gateway')?.value || '',
        stp: document.getElementById('edit-bridge-stp')?.checked || false,
        forwardDelay: document.getElementById('edit-bridge-forward-delay')?.value || '4s'
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
        // Read existing configuration
        const configFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
        NetworkLogger.info(`BridgeManager: Reading existing config from ${configFile}`);
        
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
        const newNetplanConfig = generateBridgeNetplanConfig(updatedConfig);
        NetworkLogger.info(' Generated updated Netplan config:', newNetplanConfig);
        
        // Write updated configuration
        await cockpit.file(configFile, { superuser: 'require' }).replace(newNetplanConfig);
        NetworkLogger.info(' Updated configuration written');
        
        // Apply changes
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        NetworkLogger.info(' Configuration applied successfully');
        
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
        
        // Remove the XAVS configuration file
        const configFile = `/etc/netplan/90-xavs-${bridgeName}.yaml`;
        NetworkLogger.info(`BridgeManager: Removing configuration file ${configFile}`);
        
        try {
            await cockpit.spawn(['rm', '-f', configFile], { superuser: 'require' });
            NetworkLogger.info(' Configuration file removed');
        } catch (rmError) {
            NetworkLogger.warning(' Could not remove configuration file:', rmError);
        }
        
        // Apply Netplan to remove the bridge from system
        NetworkLogger.info(' Applying Netplan to remove bridge...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        NetworkLogger.info(' Netplan applied - bridge should be removed');
        
        // Verify bridge is gone
        try {
            await cockpit.spawn(['ip', 'link', 'show', bridgeName], { superuser: 'try' });
            NetworkLogger.warning(`BridgeManager: Bridge ${bridgeName} still exists after deletion attempt`);
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
        // First, ensure the interface is down
        NetworkLogger.info(`BridgeManager: Bringing interface ${interfaceName} down...`);
        await cockpit.spawn(['ip', 'link', 'set', interfaceName, 'down'], { superuser: 'require' });
        
        // Add interface to bridge
        NetworkLogger.info(`BridgeManager: Adding ${interfaceName} to bridge ${bridgeName}...`);
        await cockpit.spawn(['ip', 'link', 'set', interfaceName, 'master', bridgeName], { superuser: 'require' });
        
        // Bring the interface back up
        NetworkLogger.info(`BridgeManager: Bringing interface ${interfaceName} up...`);
        await cockpit.spawn(['ip', 'link', 'set', interfaceName, 'up'], { superuser: 'require' });
        
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
