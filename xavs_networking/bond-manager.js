// Bond Management Module

const BondManager = {
    bonds: [],
    
    // Fix permissions for all XAVS Netplan files
    async fixNetplanPermissions() {
        try {
            console.log('BondManager: Checking and fixing Netplan file permissions...');
            const xavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-*.yaml'], { superuser: 'try' });
            const files = xavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    await cockpit.spawn(['chmod', '600', file], { superuser: 'try' });
                    console.log(`BondManager: Fixed permissions for ${file}`);
                } catch (error) {
                    console.warn(`BondManager: Could not fix permissions for ${file}:`, error);
                }
            }
        } catch (error) {
            console.warn('BondManager: Error fixing Netplan permissions:', error);
        }
    },
    
    // Load bond configurations from real system
    async loadBonds() {
        console.log('BondManager: Loading real bond configurations...');
        const listElement = document.getElementById('bond-list');
        listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading bonds...</div>';
        
        // Fix permissions on first load
        if (!this.permissionsFixed) {
            await this.fixNetplanPermissions();
            this.permissionsFixed = true;
        }
        
        try {
            this.bonds = await this.fetchBonds();
            this.renderBonds();
        } catch (error) {
            console.error('BondManager: Failed to load bonds:', error);
            listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load bonds</div>';
        }
    },
    
    // Fetch real bond configurations from system
    async fetchBonds() {
        console.log('BondManager: Fetching bonds from system...');
        
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available. Please ensure this module is running within Cockpit.');
        }
        
        const bonds = [];
        
        try {
            // Get bond interfaces using ip command
            console.log('BondManager: Running ip link show type bond...');
            const ipOutput = await cockpit.spawn(['ip', 'link', 'show', 'type', 'bond'], { superuser: 'try' });
            
            if (ipOutput.trim()) {
                const lines = ipOutput.trim().split('\n');
                for (const line of lines) {
                    const match = line.match(/(\d+):\s+([^:]+):/);
                    if (match) {
                        const bondName = match[2];
                        console.log(`BondManager: Processing bond interface: ${bondName}`);
                        
                        const bondInfo = await this.getBondDetails(bondName);
                        bonds.push(bondInfo);
                    }
                }
            }
        } catch (error) {
            console.warn('BondManager: Failed to get bond interfaces via type filter:', error);
            
            // Fallback: check all interfaces for bond patterns
            try {
                console.log('BondManager: Fallback - scanning all interfaces for bonds...');
                const allInterfacesOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
                const lines = allInterfacesOutput.split('\n');
                
                for (const line of lines) {
                    if (line.includes(':') && (line.includes('bond') || line.includes('team'))) {
                        const match = line.match(/(\d+):\s+([^:]+):/);
                        if (match) {
                            const ifaceName = match[2].trim();
                            if (ifaceName.startsWith('bond') || ifaceName.includes('team')) {
                                console.log(`BondManager: Found potential bond interface: ${ifaceName}`);
                                
                                // Verify it's actually a bond
                                try {
                                    const bondInfo = await this.getBondDetails(ifaceName);
                                    bonds.push(bondInfo);
                                } catch (bondError) {
                                    console.warn(`BondManager: Interface ${ifaceName} is not a valid bond:`, bondError);
                                }
                            }
                        }
                    }
                }
            } catch (fallbackError) {
                console.warn('BondManager: Fallback bond detection failed:', fallbackError);
            }
        }
        
        console.log(`BondManager: Found ${bonds.length} bond interfaces:`, bonds);
        return bonds;
    },

    // Get detailed information about a specific bond
    async getBondDetails(bondName) {
        console.log(`BondManager: Getting details for bond: ${bondName}`);
        
        const bondInfo = {
            name: bondName,
            status: 'unknown',
            mode: 'unknown',
            slaves: [],
            activeSlaves: [],
            inactiveSlaves: [],
            primary: null,
            miiMonitorInterval: 100,
            upDelay: 0,
            downDelay: 0,
            ip: 'N/A',
            gateway: 'N/A',
            description: `Bond interface ${bondName}`
        };
        
        try {
            // Get bond status from ip link
            const ipLinkOutput = await cockpit.spawn(['ip', 'link', 'show', bondName], { superuser: 'try' });
            bondInfo.status = ipLinkOutput.includes('UP') ? 'up' : 'down';
            
            // Get bond configuration from /proc/net/bonding if available
            try {
                const bondingInfo = await cockpit.spawn(['cat', `/proc/net/bonding/${bondName}`], { superuser: 'try' });
                this.parseBondingInfo(bondInfo, bondingInfo);
            } catch (procError) {
                console.warn(`BondManager: Could not read /proc/net/bonding/${bondName}:`, procError);
                
                // Try alternative method using sysfs
                try {
                    await this.getBondInfoFromSysfs(bondInfo);
                } catch (sysfsError) {
                    console.warn(`BondManager: Could not get bond info from sysfs:`, sysfsError);
                }
            }
            
            // Get IP configuration
            try {
                const ipAddrOutput = await cockpit.spawn(['ip', 'addr', 'show', bondName], { superuser: 'try' });
                this.parseIpAddr(bondInfo, ipAddrOutput);
            } catch (ipError) {
                console.warn(`BondManager: Could not get IP info for ${bondName}:`, ipError);
            }
            
            // Get route information for gateway
            try {
                const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'dev', bondName], { superuser: 'try' });
                const defaultRoute = routeOutput.split('\n').find(line => line.includes('default'));
                if (defaultRoute) {
                    const gatewayMatch = defaultRoute.match(/via\s+([^\s]+)/);
                    if (gatewayMatch) {
                        bondInfo.gateway = gatewayMatch[1];
                    }
                }
            } catch (routeError) {
                console.warn(`BondManager: Could not get route info for ${bondName}:`, routeError);
            }
            
        } catch (error) {
            console.error(`BondManager: Error getting bond details for ${bondName}:`, error);
        }
        
        console.log(`BondManager: Bond details for ${bondName}:`, bondInfo);
        return bondInfo;
    },

    // Parse bonding information from /proc/net/bonding
    parseBondingInfo(bondInfo, bondingData) {
        const lines = bondingData.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.includes('Bonding Mode:')) {
                const modeMatch = trimmed.match(/Bonding Mode:\s+(.+)/);
                if (modeMatch) {
                    bondInfo.mode = modeMatch[1].trim().split(' ')[0]; // Get just the mode name
                }
            }
            
            if (trimmed.includes('Primary Slave:')) {
                const primaryMatch = trimmed.match(/Primary Slave:\s+(\w+)/);
                if (primaryMatch && primaryMatch[1] !== 'None') {
                    bondInfo.primary = primaryMatch[1];
                }
            }
            
            if (trimmed.includes('MII Polling Interval (ms):')) {
                const intervalMatch = trimmed.match(/MII Polling Interval \(ms\):\s+(\d+)/);
                if (intervalMatch) {
                    bondInfo.miiMonitorInterval = parseInt(intervalMatch[1]);
                }
            }
            
            if (trimmed.includes('Up Delay (ms):')) {
                const upDelayMatch = trimmed.match(/Up Delay \(ms\):\s+(\d+)/);
                if (upDelayMatch) {
                    bondInfo.upDelay = parseInt(upDelayMatch[1]);
                }
            }
            
            if (trimmed.includes('Down Delay (ms):')) {
                const downDelayMatch = trimmed.match(/Down Delay \(ms\):\s+(\d+)/);
                if (downDelayMatch) {
                    bondInfo.downDelay = parseInt(downDelayMatch[1]);
                }
            }
            
            if (trimmed.includes('Slave Interface:')) {
                const slaveMatch = trimmed.match(/Slave Interface:\s+(\w+)/);
                if (slaveMatch) {
                    const slaveName = slaveMatch[1];
                    bondInfo.slaves.push(slaveName);
                    
                    // Check if slave is active (look for the next few lines)
                    // This is a simplified check - in reality you'd need to parse more carefully
                    if (bondingData.includes(`Slave Interface: ${slaveName}`) && 
                        bondingData.includes('MII Status: up')) {
                        bondInfo.activeSlaves.push(slaveName);
                    } else {
                        bondInfo.inactiveSlaves.push(slaveName);
                    }
                }
            }
        }
    },

    // Get bond information from sysfs as fallback
    async getBondInfoFromSysfs(bondInfo) {
        try {
            // Get bonding mode
            const modeContent = await cockpit.spawn(['cat', `/sys/class/net/${bondInfo.name}/bonding/mode`], { superuser: 'try' });
            bondInfo.mode = modeContent.trim().split(' ')[0];
            
            // Get slaves
            const slavesContent = await cockpit.spawn(['cat', `/sys/class/net/${bondInfo.name}/bonding/slaves`], { superuser: 'try' });
            bondInfo.slaves = slavesContent.trim().split(/\s+/).filter(s => s.trim());
            
            // For simplicity, assume all slaves are active if bond is up
            if (bondInfo.status === 'up') {
                bondInfo.activeSlaves = [...bondInfo.slaves];
                bondInfo.inactiveSlaves = [];
            } else {
                bondInfo.activeSlaves = [];
                bondInfo.inactiveSlaves = [...bondInfo.slaves];
            }
            
            // Get MII monitoring interval
            try {
                const miimonContent = await cockpit.spawn(['cat', `/sys/class/net/${bondInfo.name}/bonding/miimon`], { superuser: 'try' });
                bondInfo.miiMonitorInterval = parseInt(miimonContent.trim()) || 100;
            } catch (miiError) {
                console.warn('Could not get MII monitor interval from sysfs');
            }
            
        } catch (error) {
            console.warn(`Could not get bond info from sysfs for ${bondInfo.name}:`, error);
        }
    },

    // Parse IP address information
    parseIpAddr(bondInfo, ipAddrData) {
        const lines = ipAddrData.split('\n');
        const ipAddresses = [];
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Look for inet addresses
            if (trimmed.startsWith('inet ')) {
                const ipMatch = trimmed.match(/inet\s+([^\s]+)/);
                if (ipMatch) {
                    ipAddresses.push(ipMatch[1]);
                }
            }
        }
        
        if (ipAddresses.length > 0) {
            bondInfo.ip = ipAddresses[0];
        } else {
            // Check if this might be a DHCP interface
            bondInfo.ip = 'DHCP';
        }
    },
    
    // Render bonds
    renderBonds() {
        const listElement = document.getElementById('bond-list');
        
        if (this.bonds.length === 0) {
            listElement.innerHTML = `
                <div class="alert">
                    <p>No network bonds configured. Create bonds for high availability and increased bandwidth.</p>
                    <button class="btn btn-brand" onclick="addBond()">
                        <i class="fas fa-plus"></i> Add Bond
                    </button>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = this.bonds.map(bond => `
            <div class="bond-card">
                <div class="vlan-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-link" style="font-size: 20px; color: var(--brand);"></i>
                        <div>
                            <h3 style="margin: 0; font-size: 18px;">${bond.name}</h3>
                            <p style="margin: 4px 0 0; color: var(--muted); font-size: 14px;">${bond.description}</p>
                        </div>
                        <span class="bond-mode ${bond.mode.replace(/[^a-zA-Z]/g, '-')}">${bond.mode}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="status-dot ${bond.status === 'up' ? 'ok' : 'bad'}"></span>
                        <span style="font-weight: 600; color: var(--text);">${bond.status.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="vlan-config">
                    <div>
                        <span class="detail-label">IP Configuration</span>
                        <div class="detail-value">${bond.ip}</div>
                    </div>
                    <div>
                        <span class="detail-label">Gateway</span>
                        <div class="detail-value">${bond.gateway}</div>
                    </div>
                    <div>
                        <span class="detail-label">MII Monitor</span>
                        <div class="detail-value">${bond.miiMonitorInterval}ms</div>
                    </div>
                    <div>
                        <span class="detail-label">${bond.mode === 'active-backup' ? 'Primary' : 'Hash Policy'}</span>
                        <div class="detail-value">${bond.primary || bond.transmitHashPolicy || 'N/A'}</div>
                    </div>
                </div>
                
                <div class="bridge-topology">
                    <h4 style="margin: 0 0 12px; font-size: 14px; color: var(--text);">Bond Slaves</h4>
                    <div style="margin-bottom: 8px;">
                        <span style="font-size: 12px; color: var(--muted); font-weight: 600;">Active:</span>
                        <div class="bond-slaves" style="margin-top: 4px;">
                            ${bond.activeSlaves.map(slave => `<span class="bond-slave ${bond.primary === slave ? 'primary' : ''}">${slave}</span>`).join('')}
                            ${bond.activeSlaves.length === 0 ? '<span style="color: var(--muted); font-size: 12px;">None</span>' : ''}
                        </div>
                    </div>
                    ${bond.inactiveSlaves.length > 0 ? `
                    <div>
                        <span style="font-size: 12px; color: var(--muted); font-weight: 600;">Inactive:</span>
                        <div class="bond-slaves" style="margin-top: 4px;">
                            ${bond.inactiveSlaves.map(slave => `<span class="bond-slave">${slave}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                    <button class="btn btn-sm btn-outline-brand" onclick="manageBondSlaves('${bond.name}')" style="font-size: 12px; padding: 4px 8px; margin-top: 8px;">
                        <i class="fas fa-cog"></i> Manage Slaves
                    </button>
                </div>
                
                <div class="interface-actions" style="margin-top: 16px;">
                    <button class="btn btn-sm btn-outline-brand" onclick="editBond('${bond.name}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleBond('${bond.name}', '${bond.status}')">
                        <i class="fas fa-power-off"></i> ${bond.status === 'up' ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteBond('${bond.name}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// Bond Functions
async function addBond() {
    console.log('BondManager: Opening add bond dialog...');
    
    // Get available interfaces for bonding
    let availableInterfaces = [];
    try {
        console.log('BondManager: Getting available interfaces...');
        availableInterfaces = await getAvailableInterfacesForBonding();
    } catch (error) {
        console.warn('BondManager: Could not get available interfaces:', error);
        availableInterfaces = ['eth0', 'eth1', 'eth2', 'eth3', 'eth4', 'eth5']; // Fallback
    }
    
    const interfaceOptions = availableInterfaces.map(iface => 
        `<option value="${iface}">${iface}</option>`
    ).join('');
    
    const modalContent = `
        <form id="bond-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="bond-name">Bond Name</label>
                <input type="text" id="bond-name" class="form-control" placeholder="bond0" required data-validate="interfaceName">
                <div class="hint">Bond interface name (e.g., bond0, bond1)</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="bond-mode">Bonding Mode</label>
                <select id="bond-mode" class="form-control" required onchange="updateBondModeOptions()">
                    <option value="">Select mode</option>
                    <option value="active-backup">Active-Backup (Failover)</option>
                    <option value="802.3ad">802.3ad (LACP)</option>
                    <option value="balance-rr">Balance Round-Robin</option>
                    <option value="balance-xor">Balance XOR</option>
                    <option value="broadcast">Broadcast</option>
                    <option value="balance-tlb">Balance TLB</option>
                    <option value="balance-alb">Balance ALB</option>
                </select>
                <div class="hint">Choose based on switch support and requirements</div>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="bond-description">Description</label>
                <input type="text" id="bond-description" class="form-control" placeholder="Primary Network Bond">
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">Slave Interfaces</label>
                <div class="interface-selection-container">
                    <div class="selected-interfaces" id="selected-slaves">
                        <!-- Selected slaves will appear here -->
                    </div>
                    <div class="available-interfaces">
                        <label class="form-label" style="font-size: 14px; margin-bottom: 8px;">Available Interfaces:</label>
                        <div class="interface-grid" id="interface-grid">
                            ${availableInterfaces.map(iface => `
                                <div class="interface-card" data-interface="${iface}" onclick="toggleSlaveInterface('${iface}')">
                                    <div class="interface-info">
                                        <span class="interface-name">${iface}</span>
                                        <span class="interface-status">Available</span>
                                    </div>
                                    <div class="interface-checkbox">
                                        <input type="checkbox" id="slave-${iface}" value="${iface}">
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="hint">Select at least 2 interfaces for bonding. Click on interfaces to add/remove them.</div>
            </div>
            
            <div id="primary-interface-group" class="form-group" style="display: none;">
                <label class="form-label" for="bond-primary">Primary Interface</label>
                <select id="bond-primary" class="form-control">
                    <option value="">Select primary interface</option>
                </select>
                <div class="hint">Primary interface for active-backup mode</div>
            </div>
            
            <div id="lacp-options" class="form-group" style="display: none;">
                <label class="form-label" for="lacp-rate">LACP Rate</label>
                <select id="lacp-rate" class="form-control">
                    <option value="slow">Slow (30 seconds)</option>
                    <option value="fast" selected>Fast (1 second)</option>
                </select>
            </div>
            
            <div id="hash-policy-group" class="form-group" style="display: none;">
                <label class="form-label" for="hash-policy">Transmit Hash Policy</label>
                <select id="hash-policy" class="form-control">
                    <option value="layer2">Layer 2 (MAC)</option>
                    <option value="layer2+3">Layer 2+3 (MAC + IP)</option>
                    <option value="layer3+4" selected>Layer 3+4 (IP + Port)</option>
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="mii-monitor">MII Monitor Interval (ms)</label>
                <input type="number" id="mii-monitor" class="form-control" value="100" min="0" max="1000">
                <div class="hint">Link monitoring interval in milliseconds</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="up-delay">Up Delay (ms)</label>
                <input type="number" id="up-delay" class="form-control" value="200" min="0" max="5000">
                <div class="hint">Delay before enabling interface after link up</div>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">IP Configuration</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg active" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg" data-config="dhcp">DHCP</button>
                </div>
            </div>
            
            <div id="bond-static-config" class="static-config">
                <div class="form-group">
                    <label class="form-label" for="bond-ip">IP Address</label>
                    <input type="text" id="bond-ip" class="form-control" placeholder="192.168.1.100/24" data-validate="cidr">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="bond-gateway">Gateway</label>
                    <input type="text" id="bond-gateway" class="form-control" placeholder="192.168.1.1" data-validate="ipAddress">
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveBond()">Create Bond</button>
    `;
    
    NetworkManager.createModal('Add Bond Configuration', modalContent, modalFooter);
    
    // Setup live validation for the form
    const form = document.getElementById('bond-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(form);
    }
    
    // Setup form functionality
    setupBondForm();
}

// Get available interfaces for bonding (exclude already bonded, system interfaces, etc.)
async function getAvailableInterfacesForBonding() {
    console.log('BondManager: Getting available interfaces for bonding...');
    
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
                
                // Skip system interfaces, already bonded interfaces, etc.
                if (!isSystemInterface(ifaceName) && 
                    !ifaceName.startsWith('bond') && 
                    !ifaceName.startsWith('br-') &&
                    !ifaceName.startsWith('vlan') &&
                    !ifaceName.includes('@') &&
                    ifaceName !== 'lo') {
                    
                    // Check if interface is not already a slave of another bond
                    const isAlreadyBonded = await isInterfaceAlreadyBonded(ifaceName);
                    if (!isAlreadyBonded) {
                        availableInterfaces.push(ifaceName);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('BondManager: Error getting available interfaces:', error);
        throw error;
    }
    
    console.log('BondManager: Available interfaces for bonding:', availableInterfaces);
    return availableInterfaces;
}

// Check if an interface is already bonded
async function isInterfaceAlreadyBonded(interfaceName) {
    try {
        // Check if interface has a master
        const masterOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/master`], { superuser: 'try' });
        return masterOutput.trim().length > 0;
    } catch (error) {
        // If the file doesn't exist, interface is not bonded
        return false;
    }
}

// Helper function to check if interface is a system interface
function isSystemInterface(name) {
    const systemPrefixes = ['lo', 'docker', 'veth', 'br-', 'virbr'];
    return systemPrefixes.some(prefix => name.startsWith(prefix));
}

function editBond(bondName) {
    const bond = BondManager.bonds.find(b => b.name === bondName);
    if (!bond) return;
    
    const modalContent = `
        <form id="bond-edit-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="edit-bond-name">Bond Name</label>
                <input type="text" id="edit-bond-name" class="form-control" value="${bond.name}" readonly>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-bond-mode">Bonding Mode</label>
                <select id="edit-bond-mode" class="form-control" disabled>
                    <option value="${bond.mode}" selected>${bond.mode}</option>
                </select>
                <div class="hint">Bond mode cannot be changed after creation</div>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="edit-bond-description">Description</label>
                <input type="text" id="edit-bond-description" class="form-control" value="${bond.description}">
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-bond-ip">IP Address</label>
                <input type="text" id="edit-bond-ip" class="form-control" value="${bond.ip}">
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-bond-gateway">Gateway</label>
                <input type="text" id="edit-bond-gateway" class="form-control" value="${bond.gateway}">
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-mii-monitor">MII Monitor Interval (ms)</label>
                <input type="number" id="edit-mii-monitor" class="form-control" value="${bond.miiMonitorInterval}">
            </div>
            
            ${bond.primary ? `
            <div class="form-group">
                <label class="form-label" for="edit-bond-primary">Primary Interface</label>
                <select id="edit-bond-primary" class="form-control">
                    ${bond.slaves.map(slave => `<option value="${slave}" ${bond.primary === slave ? 'selected' : ''}>${slave}</option>`).join('')}
                </select>
            </div>
            ` : ''}
            
            ${bond.upDelay ? `
            <div class="form-group">
                <label class="form-label" for="edit-up-delay">Up Delay (ms)</label>
                <input type="number" id="edit-up-delay" class="form-control" value="${bond.upDelay}">
            </div>
            ` : ''}
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="updateBond('${bondName}')">Update Bond</button>
    `;
    
    NetworkManager.createModal(`Edit Bond: ${bondName}`, modalContent, modalFooter);
}

function setupBondForm() {
    // Setup IP configuration toggle
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfig = document.getElementById('bond-static-config');
            
            if (configType === 'static') {
                staticConfig.style.display = 'contents';
            } else {
                staticConfig.style.display = 'none';
            }
        });
    });
    
    // Setup the new interface selection system
    setupInterfaceSelection();
}

// Enhanced interface selection system
function setupInterfaceSelection() {
    // Initialize selected interfaces tracking
    window.selectedSlaveInterfaces = new Set();
    
    // Update the display
    updateSelectedInterfacesDisplay();
}

function toggleSlaveInterface(interfaceName) {
    console.log(`BondManager: Toggling interface ${interfaceName}`);
    
    const interfaceCard = document.querySelector(`[data-interface="${interfaceName}"]`);
    const checkbox = document.getElementById(`slave-${interfaceName}`);
    
    if (!window.selectedSlaveInterfaces) {
        window.selectedSlaveInterfaces = new Set();
    }
    
    if (window.selectedSlaveInterfaces.has(interfaceName)) {
        // Remove interface
        window.selectedSlaveInterfaces.delete(interfaceName);
        interfaceCard.classList.remove('selected');
        checkbox.checked = false;
    } else {
        // Add interface
        window.selectedSlaveInterfaces.add(interfaceName);
        interfaceCard.classList.add('selected');
        checkbox.checked = true;
    }
    
    // Update the selected interfaces display
    updateSelectedInterfacesDisplay();
    
    // Update primary interface options if this is for active-backup mode
    updatePrimaryOptions(Array.from(window.selectedSlaveInterfaces));
}

function removeSlaveInterface(interfaceName) {
    console.log(`BondManager: Removing interface ${interfaceName}`);
    
    if (window.selectedSlaveInterfaces) {
        window.selectedSlaveInterfaces.delete(interfaceName);
    }
    
    // Update interface card
    const interfaceCard = document.querySelector(`[data-interface="${interfaceName}"]`);
    const checkbox = document.getElementById(`slave-${interfaceName}`);
    
    if (interfaceCard) {
        interfaceCard.classList.remove('selected');
    }
    if (checkbox) {
        checkbox.checked = false;
    }
    
    // Update displays
    updateSelectedInterfacesDisplay();
    updatePrimaryOptions(Array.from(window.selectedSlaveInterfaces));
}

function updateSelectedInterfacesDisplay() {
    const selectedDiv = document.getElementById('selected-slaves');
    
    if (!window.selectedSlaveInterfaces || window.selectedSlaveInterfaces.size === 0) {
        selectedDiv.innerHTML = '';
        return;
    }
    
    selectedDiv.innerHTML = Array.from(window.selectedSlaveInterfaces).map(interfaceName => `
        <div class="selected-interface-tag">
            <span>${interfaceName}</span>
            <button type="button" class="remove-interface" onclick="removeSlaveInterface('${interfaceName}')" title="Remove interface">
                ×
            </button>
        </div>
    `).join('');
}

function updateBondModeOptions() {
    const mode = document.getElementById('bond-mode').value;
    const primaryGroup = document.getElementById('primary-interface-group');
    const lacpOptions = document.getElementById('lacp-options');
    const hashPolicyGroup = document.getElementById('hash-policy-group');
    
    // Hide all mode-specific options
    primaryGroup.style.display = 'none';
    lacpOptions.style.display = 'none';
    hashPolicyGroup.style.display = 'none';
    
    // Show relevant options based on mode
    switch(mode) {
        case 'active-backup':
            primaryGroup.style.display = 'block';
            break;
        case '802.3ad':
            lacpOptions.style.display = 'block';
            hashPolicyGroup.style.display = 'block';
            break;
        case 'balance-xor':
            hashPolicyGroup.style.display = 'block';
            break;
    }
}

function updatePrimaryOptions(slaves) {
    const primarySelect = document.getElementById('bond-primary');
    if (primarySelect) {
        primarySelect.innerHTML = '<option value="">Select primary interface</option>' +
            slaves.map(slave => `<option value="${slave}">${slave}</option>`).join('');
    }
}

function manageBondSlaves(bondName) {
    const bond = BondManager.bonds.find(b => b.name === bondName);
    if (!bond) return;
    
    const modalContent = `
        <div>
            <h4>Current Bond Configuration</h4>
            <p>Bond: <strong>${bondName}</strong> (${bond.mode})</p>
            
            <div style="margin: 20px 0;">
                <h5>Active Slaves</h5>
                <div class="bond-slaves">
                    ${bond.activeSlaves.map(slave => `
                        <span class="bond-slave ${bond.primary === slave ? 'primary' : ''}">${slave}</span>
                    `).join('')}
                </div>
            </div>
            
            ${bond.inactiveSlaves.length > 0 ? `
            <div style="margin: 20px 0;">
                <h5>Inactive Slaves</h5>
                <div class="bond-slaves">
                    ${bond.inactiveSlaves.map(slave => `
                        <span class="bond-slave">${slave}</span>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <div style="margin: 20px 0;">
                <h5>Add New Slave</h5>
                <select id="new-slave" class="form-control">
                    <option value="">Select interface to add</option>
                    <option value="eth6">eth6</option>
                    <option value="eth7">eth7</option>
                </select>
            </div>
        </div>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Close</button>
        <button class="btn btn-outline-brand" onclick="addSlaveToBond('${bondName}')">Add Slave</button>
        <button class="btn btn-outline-danger" onclick="removeBondSlave('${bondName}')">Remove Slave</button>
    `;
    
    NetworkManager.createModal(`Manage Bond Slaves: ${bondName}`, modalContent, modalFooter);
}

function saveBond() {
    console.log('BondManager: Creating new bond...');
    
    const modal = document.querySelector('.modal');
    const form = document.getElementById('bond-form');
    
    // Clear any existing modal messages
    if (typeof clearModalMessages === 'function') {
        clearModalMessages(modal);
    }
    
    // Validate form using live validation
    if (typeof validateForm === 'function') {
        if (!validateForm(form)) {
            if (typeof showModalError === 'function') {
                showModalError(modal, 'Please correct the errors in the form before continuing.');
            }
            return;
        }
    }
    
    // Get selected slave interfaces from the new selection system
    const selectedSlaves = window.selectedSlaveInterfaces ? Array.from(window.selectedSlaveInterfaces) : [];
    
    const formData = {
        name: document.getElementById('bond-name').value,
        mode: document.getElementById('bond-mode').value,
        slaves: selectedSlaves,
        description: document.getElementById('bond-description').value,
        primary: document.getElementById('bond-primary')?.value || null,
        lacpRate: document.getElementById('lacp-rate')?.value || null,
        hashPolicy: document.getElementById('hash-policy')?.value || null,
        miiMonitor: document.getElementById('mii-monitor').value || '100',
        upDelay: document.getElementById('up-delay').value || '200',
        configType: document.querySelector('.toggle-seg.active').getAttribute('data-config'),
        ip: document.getElementById('bond-ip')?.value || '',
        gateway: document.getElementById('bond-gateway')?.value || ''
    };
    
    console.log('BondManager: Form data collected:', formData);
    
    // Basic validation fallback
    if (!formData.name || !formData.mode || formData.slaves.length < 2) {
        console.error('BondManager: Validation failed - insufficient data');
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Please fill in all required fields and select at least 2 slave interfaces.');
        } else {
            NetworkManager.showError('Please fill in all required fields and select at least 2 slave interfaces');
        }
        return;
    }
    
    // Check for valid bond name
    if (!/^bond\d+$/.test(formData.name)) {
        console.error('BondManager: Invalid bond name format');
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Bond name must be in format: bond0, bond1, etc.');
        } else {
            NetworkManager.showError('Bond name must be in format: bond0, bond1, etc.');
        }
        return;
    }
    
    console.log('BondManager: Validation passed, creating bond configuration...');
    
    // Create bond using real system calls
    createRealBond(formData)
        .then(() => {
            console.log('BondManager: Bond created successfully');
            if (typeof showModalSuccess === 'function') {
                showModalSuccess(modal, `Bond ${formData.name} created and tested successfully! The configuration has been applied.`);
                // Close modal after showing success
                setTimeout(() => {
                    NetworkManager.closeModal();
                    BondManager.loadBonds();
                }, 2000);
            } else {
                NetworkManager.showSuccess(`Bond ${formData.name} created successfully`);
                NetworkManager.closeModal();
                BondManager.loadBonds();
            }
        })
        .catch((error) => {
            console.error('BondManager: Error creating bond:', error);
            if (typeof showModalError === 'function') {
                showModalError(modal, `Failed to create bond: ${error.message || error}`);
            } else {
                NetworkManager.showError(`Failed to create bond: ${error.message || error}`);
            }
        });
}

// Create real bond configuration
async function createRealBond(config) {
    console.log('BondManager: Creating real bond with config:', config);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available. Please ensure this module is running within Cockpit.');
    }
    
    try {
        // Generate Netplan configuration for the bond
        const netplanConfig = generateBondNetplanConfig(config);
        console.log('BondManager: Generated Netplan config:', netplanConfig);
        
        // Write Netplan configuration file
        const configFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
        console.log(`BondManager: Writing configuration to ${configFile}`);
        
        await cockpit.file(configFile, { superuser: 'require' }).replace(netplanConfig);
        console.log('BondManager: Netplan configuration written successfully');
        
        // Test the configuration first with netplan try
        console.log('BondManager: Testing Netplan configuration with netplan try...');
        try {
            await cockpit.spawn(['netplan', 'try', '--timeout=30'], { superuser: 'require' });
            console.log('BondManager: Netplan try completed successfully');
        } catch (tryError) {
            console.error('BondManager: Netplan try failed:', tryError);
            throw new Error(`Configuration test failed: ${tryError.message || tryError}. The bond configuration has not been applied.`);
        }
        
        // Apply Netplan configuration permanently
        console.log('BondManager: Applying Netplan configuration permanently...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        console.log('BondManager: Netplan applied successfully');
        
        // Verify bond creation
        console.log('BondManager: Verifying bond creation...');
        await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
        console.log('BondManager: Bond interface verified');
        
    } catch (error) {
        console.error('BondManager: Error creating bond:', error);
        throw new Error(`Failed to create bond interface: ${error.message}`);
    }
}

// Generate Netplan configuration for bond
function generateBondNetplanConfig(config) {
    console.log('BondManager: Generating Netplan config for bond:', config.name);
    
    let yamlContent = `network:
  version: 2
  bonds:
    ${config.name}:
      interfaces:
`;
    
    // Add slave interfaces
    config.slaves.forEach(slave => {
        yamlContent += `        - ${slave}
`;
    });
    
    // Add bond parameters
    yamlContent += `      parameters:
        mode: ${config.mode}
`;
    
    if (config.primary && config.mode === 'active-backup') {
        yamlContent += `        primary: ${config.primary}
`;
    }
    
    if (config.miiMonitor) {
        yamlContent += `        mii-monitor-interval: ${config.miiMonitor}
`;
    }
    
    if (config.upDelay) {
        yamlContent += `        up-delay: ${config.upDelay}
`;
    }
    
    if (config.lacpRate && config.mode === '802.3ad') {
        yamlContent += `        lacp-rate: ${config.lacpRate}
`;
    }
    
    if (config.hashPolicy && (config.mode === '802.3ad' || config.mode === 'balance-xor')) {
        yamlContent += `        transmit-hash-policy: ${config.hashPolicy}
`;
    }
    
    // Add IP configuration
    if (config.configType === 'static' && config.ip) {
        yamlContent += `      addresses:
        - ${config.ip}
`;
        
        if (config.gateway) {
            yamlContent += `      gateway4: ${config.gateway}
`;
        }
    } else if (config.configType === 'dhcp') {
        yamlContent += `      dhcp4: true
`;
    }
    
    console.log('BondManager: Generated Netplan YAML:', yamlContent);
    return yamlContent;
}

function updateBond(bondName) {
    console.log(`BondManager: Updating bond ${bondName}...`);
    
    const formData = {
        name: bondName,
        description: document.getElementById('edit-bond-description')?.value || '',
        ip: document.getElementById('edit-bond-ip')?.value || '',
        gateway: document.getElementById('edit-bond-gateway')?.value || '',
        miiMonitor: document.getElementById('edit-mii-monitor')?.value || '100',
        primary: document.getElementById('edit-bond-primary')?.value || null,
        upDelay: document.getElementById('edit-up-delay')?.value || null
    };
    
    console.log('BondManager: Update form data:', formData);
    
    // Update bond configuration using real system calls
    updateRealBond(formData)
        .then(() => {
            console.log('BondManager: Bond updated successfully');
            NetworkManager.showSuccess(`Bond ${bondName} updated successfully`);
            NetworkManager.closeModal();
            BondManager.loadBonds();
        })
        .catch((error) => {
            console.error('BondManager: Failed to update bond:', error);
            NetworkManager.showError(`Failed to update bond: ${error.message}`);
        });
}

// Update real bond configuration
async function updateRealBond(config) {
    console.log('BondManager: Updating real bond configuration:', config);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // Read existing configuration
        const configFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
        console.log(`BondManager: Reading existing config from ${configFile}`);
        
        let existingConfig;
        try {
            existingConfig = await cockpit.file(configFile).read();
        } catch (readError) {
            throw new Error(`Configuration file not found for bond ${config.name}. Please recreate the bond.`);
        }
        
        // Parse and update the configuration
        // For simplicity, we'll regenerate the configuration with updated values
        // In a production environment, you might want to use a YAML parser
        
        const bond = BondManager.bonds.find(b => b.name === config.name);
        if (!bond) {
            throw new Error(`Bond ${config.name} not found in current configuration`);
        }
        
        // Create updated configuration
        const updatedConfig = {
            name: config.name,
            mode: bond.mode, // Mode cannot be changed
            slaves: bond.slaves, // Slaves managed separately
            description: config.description,
            primary: config.primary || bond.primary,
            miiMonitor: config.miiMonitor || bond.miiMonitorInterval,
            upDelay: config.upDelay || bond.upDelay,
            configType: config.ip.toLowerCase() === 'dhcp' ? 'dhcp' : 'static',
            ip: config.ip === 'DHCP' ? '' : config.ip,
            gateway: config.gateway === 'Auto' ? '' : config.gateway
        };
        
        // Generate updated Netplan configuration
        const newNetplanConfig = generateBondNetplanConfig(updatedConfig);
        console.log('BondManager: Generated updated Netplan config:', newNetplanConfig);
        
        // Write updated configuration
        await cockpit.file(configFile, { superuser: 'require' }).replace(newNetplanConfig);
        console.log('BondManager: Updated configuration written');
        
        // Apply changes
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        console.log('BondManager: Configuration applied successfully');
        
    } catch (error) {
        console.error('BondManager: Error updating bond:', error);
        throw error;
    }
}

function toggleBond(bondName, currentStatus) {
    console.log(`BondManager: Toggling bond ${bondName} from ${currentStatus}`);
    
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    if (confirm(`Are you sure you want to ${action} bond ${bondName}?`)) {
        console.log(`BondManager: User confirmed ${action} for bond ${bondName}`);
        
        // Use real system command to toggle bond
        toggleRealBond(bondName, newStatus)
            .then(() => {
                console.log(`BondManager: Bond ${bondName} ${action}d successfully`);
                NetworkManager.showSuccess(`Bond ${bondName} ${action}d successfully`);
                BondManager.loadBonds();
            })
            .catch((error) => {
                console.error(`BondManager: Failed to ${action} bond:`, error);
                NetworkManager.showError(`Failed to ${action} bond: ${error.message}`);
            });
    }
}

// Toggle real bond interface
async function toggleRealBond(bondName, targetStatus) {
    console.log(`BondManager: Setting bond ${bondName} to ${targetStatus}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        const command = targetStatus === 'up' ? 'up' : 'down';
        console.log(`BondManager: Running: ip link set ${bondName} ${command}`);
        
        await cockpit.spawn(['ip', 'link', 'set', bondName, command], { superuser: 'require' });
        console.log(`BondManager: Bond ${bondName} set to ${targetStatus} successfully`);
        
    } catch (error) {
        console.error(`BondManager: Error toggling bond ${bondName}:`, error);
        throw new Error(`Failed to set bond ${bondName} to ${targetStatus}: ${error.message}`);
    }
}

function deleteBond(bondName) {
    console.log(`BondManager: Delete bond ${bondName} requested`);
    
    if (confirm(`Are you sure you want to delete bond ${bondName}? This will remove the bond interface and its configuration. This action cannot be undone.`)) {
        console.log(`BondManager: User confirmed deletion of bond ${bondName}`);
        
        // Use real system commands to delete bond
        deleteRealBond(bondName)
            .then(() => {
                console.log(`BondManager: Bond ${bondName} deleted successfully`);
                NetworkManager.showSuccess(`Bond ${bondName} deleted successfully`);
                BondManager.loadBonds();
            })
            .catch((error) => {
                console.error(`BondManager: Failed to delete bond:`, error);
                NetworkManager.showError(`Failed to delete bond: ${error.message}`);
            });
    }
}

// Delete real bond interface and configuration
async function deleteRealBond(bondName) {
    console.log(`BondManager: Deleting real bond ${bondName}`);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // First, bring the bond down
        console.log(`BondManager: Bringing bond ${bondName} down...`);
        try {
            await cockpit.spawn(['ip', 'link', 'set', bondName, 'down'], { superuser: 'require' });
        } catch (downError) {
            console.warn(`BondManager: Could not bring bond down (may already be down):`, downError);
        }
        
        // Remove the XAVS configuration file
        const configFile = `/etc/netplan/90-xavs-${bondName}.yaml`;
        console.log(`BondManager: Removing configuration file ${configFile}`);
        
        try {
            await cockpit.spawn(['rm', configFile], { superuser: 'require' });
            console.log('BondManager: Configuration file removed');
        } catch (rmError) {
            console.warn('BondManager: Configuration file may not exist or could not be removed:', rmError);
        }
        
        // Apply Netplan to remove the bond from system
        console.log('BondManager: Applying Netplan to remove bond...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        console.log('BondManager: Netplan applied - bond should be removed');
        
        // Verify bond is gone
        try {
            await cockpit.spawn(['ip', 'link', 'show', bondName], { superuser: 'try' });
            console.warn(`BondManager: Bond ${bondName} still exists after deletion attempt`);
        } catch (verifyError) {
            console.log(`BondManager: Bond ${bondName} successfully removed from system`);
        }
        
    } catch (error) {
        console.error(`BondManager: Error deleting bond ${bondName}:`, error);
        throw new Error(`Failed to delete bond ${bondName}: ${error.message}`);
    }
}

function addSlaveToBond(bondName) {
    console.log(`BondManager: Adding slave to bond ${bondName}`);
    
    const newSlave = document.getElementById('new-slave').value;
    if (!newSlave) {
        NetworkManager.showError('Please select an interface to add');
        return;
    }
    
    console.log(`BondManager: Adding interface ${newSlave} to bond ${bondName}`);
    
    // Add slave using real system commands
    addRealSlaveToBond(bondName, newSlave)
        .then(() => {
            console.log(`BondManager: Interface ${newSlave} added to bond ${bondName} successfully`);
            NetworkManager.showSuccess(`Interface ${newSlave} added to bond ${bondName}`);
            NetworkManager.closeModal();
            BondManager.loadBonds();
        })
        .catch((error) => {
            console.error('BondManager: Failed to add slave to bond:', error);
            NetworkManager.showError(`Failed to add slave to bond: ${error.message}`);
        });
}

// Add real slave interface to bond
async function addRealSlaveToBond(bondName, slaveInterface) {
    console.log(`BondManager: Adding real slave ${slaveInterface} to bond ${bondName}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // First, ensure the slave interface is down
        console.log(`BondManager: Bringing slave interface ${slaveInterface} down...`);
        await cockpit.spawn(['ip', 'link', 'set', slaveInterface, 'down'], { superuser: 'require' });
        
        // Add slave to bond via sysfs
        console.log(`BondManager: Adding ${slaveInterface} to bond ${bondName} via sysfs...`);
        await cockpit.spawn(['sh', '-c', `echo +${slaveInterface} > /sys/class/net/${bondName}/bonding/slaves`], { superuser: 'require' });
        
        // Bring the slave interface up
        console.log(`BondManager: Bringing slave interface ${slaveInterface} up...`);
        await cockpit.spawn(['ip', 'link', 'set', slaveInterface, 'up'], { superuser: 'require' });
        
        console.log(`BondManager: Slave ${slaveInterface} added to bond ${bondName} successfully`);
        
    } catch (error) {
        console.error(`BondManager: Error adding slave ${slaveInterface} to bond ${bondName}:`, error);
        throw new Error(`Failed to add ${slaveInterface} to bond ${bondName}: ${error.message}`);
    }
}

function removeBondSlave(bondName) {
    console.log(`BondManager: Remove slave from bond ${bondName} requested`);
    
    const bond = BondManager.bonds.find(b => b.name === bondName);
    if (!bond || bond.slaves.length <= 2) {
        NetworkManager.showError('Cannot remove slave - bond must have at least 2 slaves');
        return;
    }
    
    // For now, we'll remove the last slave as an example
    // In a real implementation, you'd want to let the user choose
    const slaveToRemove = bond.slaves[bond.slaves.length - 1];
    
    if (confirm(`Remove ${slaveToRemove} from bond ${bondName}?`)) {
        console.log(`BondManager: User confirmed removal of ${slaveToRemove} from bond ${bondName}`);
        
        // Remove slave using real system commands
        removeRealSlaveFromBond(bondName, slaveToRemove)
            .then(() => {
                console.log(`BondManager: Slave ${slaveToRemove} removed from bond ${bondName} successfully`);
                NetworkManager.showSuccess(`Slave interface ${slaveToRemove} removed from bond ${bondName}`);
                NetworkManager.closeModal();
                BondManager.loadBonds();
            })
            .catch((error) => {
                console.error('BondManager: Failed to remove slave from bond:', error);
                NetworkManager.showError(`Failed to remove slave from bond: ${error.message}`);
            });
    }
}

// Remove real slave interface from bond
async function removeRealSlaveFromBond(bondName, slaveInterface) {
    console.log(`BondManager: Removing real slave ${slaveInterface} from bond ${bondName}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // Remove slave from bond via sysfs
        console.log(`BondManager: Removing ${slaveInterface} from bond ${bondName} via sysfs...`);
        await cockpit.spawn(['sh', '-c', `echo -${slaveInterface} > /sys/class/net/${bondName}/bonding/slaves`], { superuser: 'require' });
        
        // Bring the former slave interface down
        console.log(`BondManager: Bringing former slave interface ${slaveInterface} down...`);
        await cockpit.spawn(['ip', 'link', 'set', slaveInterface, 'down'], { superuser: 'require' });
        
        console.log(`BondManager: Slave ${slaveInterface} removed from bond ${bondName} successfully`);
        
    } catch (error) {
        console.error(`BondManager: Error removing slave ${slaveInterface} from bond ${bondName}:`, error);
        throw new Error(`Failed to remove ${slaveInterface} from bond ${bondName}: ${error.message}`);
    }
}

function refreshBonds() {
    BondManager.loadBonds();
}

// Update the main NetworkManager to use BondManager
NetworkManager.loadBonds = function() {
    BondManager.loadBonds();
};
