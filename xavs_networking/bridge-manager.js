// Bridge Management Module

const BridgeManager = {
    bridges: [],
    
    // Load bridge configurations
    async loadBridges() {
        const listElement = document.getElementById('bridge-list');
        listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading bridges...</div>';
        
        try {
            this.bridges = await this.fetchBridges();
            this.renderBridges();
        } catch (error) {
            listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load bridges</div>';
        }
    },
    
    // Fetch real bridges from system using Cockpit APIs
    async fetchBridges() {
        console.log('BridgeManager: Fetching real bridges from system...');
        
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
                            console.warn(`BridgeManager: Could not get details for bridge ${interfaceName}:`, error);
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
            
            console.log('BridgeManager: Found bridges:', bridges);
            return bridges;
            
        } catch (error) {
            console.error('BridgeManager: Error fetching bridges:', error);
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
                console.warn(`BridgeManager: Could not check if ${interfaceName} is a bridge:`, error2);
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
                    console.warn(`BridgeManager: Could not get bridge members for ${interfaceName}:`, bridgeError);
                }
            }

            // Try to get STP information
            try {
                const stpOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/bridge/stp_state`], 
                    { superuser: 'try' });
                details.stp = stpOutput.trim() === '1';
            } catch (stpError) {
                console.warn(`BridgeManager: Could not get STP state for ${interfaceName}:`, stpError);
            }

            // Try to get forward delay
            try {
                const delayOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/bridge/forward_delay`], 
                    { superuser: 'try' });
                const delayMs = parseInt(delayOutput.trim());
                details.forwardDelay = `${Math.round(delayMs / 100)}s`;
            } catch (delayError) {
                console.warn(`BridgeManager: Could not get forward delay for ${interfaceName}:`, delayError);
            }

            // Try to get route information for gateway
            const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'dev', interfaceName], 
                { superuser: 'try' });
            const gatewayMatch = routeOutput.match(/default via ([^\s]+)/);
            if (gatewayMatch) {
                details.gateway = gatewayMatch[1];
            }

        } catch (error) {
            console.warn(`BridgeManager: Error getting details for ${interfaceName}:`, error);
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

// Bridge Functions
function addBridge() {
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
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;" id="selected-interfaces">
                    <!-- Selected interfaces will appear here -->
                </div>
                <select id="bridge-interfaces" class="form-control" multiple>
                    <option value="eth0">eth0</option>
                    <option value="eth1">eth1</option>
                    <option value="eth2">eth2</option>
                    <option value="eth3">eth3</option>
                </select>
                <div class="hint">Hold Ctrl/Cmd to select multiple interfaces</div>
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
                <div class="form-group">
                    <label class="form-label" for="bridge-ip">IP Address</label>
                    <input type="text" id="bridge-ip" class="form-control" placeholder="192.168.1.50/24">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="bridge-gateway">Gateway</label>
                    <input type="text" id="bridge-gateway" class="form-control" placeholder="192.168.1.1">
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
    
    // Setup toggle functionality
    setupBridgeToggle();
    setupInterfaceSelection();
}

function editBridge(bridgeName) {
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
                <label class="form-label">Current Member Interfaces</label>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                    ${bridge.interfaces.map(iface => `
                        <span class="bridge-interface" style="position: relative;">
                            ${iface}
                            <button type="button" onclick="removeInterfaceFromBridge('${iface}')" 
                                    style="margin-left: 8px; background: none; border: none; color: white; cursor: pointer;">×</button>
                        </span>
                    `).join('')}
                </div>
                <select id="edit-bridge-interfaces" class="form-control">
                    <option value="">Add interface...</option>
                    <option value="eth0">eth0</option>
                    <option value="eth1">eth1</option>
                    <option value="eth2">eth2</option>
                    <option value="eth3">eth3</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-bridge-ip">IP Address</label>
                <input type="text" id="edit-bridge-ip" class="form-control" value="${bridge.ip}">
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

function setupInterfaceSelection() {
    const select = document.getElementById('bridge-interfaces');
    const selectedDiv = document.getElementById('selected-interfaces');
    
    if (select) {
        select.addEventListener('change', () => {
            const selected = Array.from(select.selectedOptions);
            selectedDiv.innerHTML = selected.map(option => `
                <span class="bridge-interface">${option.value}</span>
            `).join('');
        });
    }
}

function addInterfaceToBridge(bridgeName) {
    const modalContent = `
        <form id="add-interface-form">
            <div class="form-group">
                <label class="form-label" for="new-interface">Select Interface to Add</label>
                <select id="new-interface" class="form-control" required>
                    <option value="">Select interface</option>
                    <option value="eth0">eth0</option>
                    <option value="eth1">eth1</option>
                    <option value="eth2">eth2</option>
                    <option value="eth3">eth3</option>
                </select>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="addInterfaceToExistingBridge('${bridgeName}')">Add Interface</button>
    `;
    
    NetworkManager.createModal(`Add Interface to ${bridgeName}`, modalContent, modalFooter);
}

function saveBridge() {
    const formData = {
        name: document.getElementById('bridge-name').value,
        type: document.getElementById('bridge-type').value,
        description: document.getElementById('bridge-description').value
    };
    
    if (!formData.name || !formData.type) {
        NetworkManager.showError('Please fill in all required fields');
        return;
    }
    
    NetworkManager.showSuccess(`Bridge ${formData.name} created successfully`);
    NetworkManager.closeModal();
    BridgeManager.loadBridges();
}

function updateBridge(bridgeName) {
    NetworkManager.showSuccess(`Bridge ${bridgeName} updated successfully`);
    NetworkManager.closeModal();
    BridgeManager.loadBridges();
}

function toggleBridge(bridgeName, currentStatus) {
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    if (confirm(`Are you sure you want to ${action} bridge ${bridgeName}?`)) {
        NetworkManager.showSuccess(`Bridge ${bridgeName} ${action}d successfully`);
        BridgeManager.loadBridges();
    }
}

function deleteBridge(bridgeName) {
    if (confirm(`Are you sure you want to delete bridge ${bridgeName}? This action cannot be undone.`)) {
        NetworkManager.showSuccess(`Bridge ${bridgeName} deleted successfully`);
        BridgeManager.loadBridges();
    }
}

function addInterfaceToExistingBridge(bridgeName) {
    const interfaceName = document.getElementById('new-interface').value;
    if (!interfaceName) {
        NetworkManager.showError('Please select an interface');
        return;
    }
    
    NetworkManager.showSuccess(`Interface ${interfaceName} added to bridge ${bridgeName}`);
    NetworkManager.closeModal();
    BridgeManager.loadBridges();
}

function refreshBridges() {
    BridgeManager.loadBridges();
}

// Update the main NetworkManager to use BridgeManager
NetworkManager.loadBridges = function() {
    BridgeManager.loadBridges();
};
