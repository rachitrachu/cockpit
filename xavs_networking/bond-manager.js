// Bond Management Module

// Valid bond modes for Netplan
const VALID_BOND_MODES = [
    'balance-rr',      // 0
    'active-backup',   // 1
    'balance-xor',     // 2
    'broadcast',       // 3
    '802.3ad',         // 4 (IEEE 802.3ad)
    'balance-tlb',     // 5
    'balance-alb',     // 6
    '0', '1', '2', '3', '4', '5', '6'  // Numeric modes
];

// Validate interface name to prevent command injection
function assertValidInterfaceName(name) {
    if (!name || typeof name !== 'string') {
        throw new Error(`Invalid interface name: ${name}`);
    }
    if (!INTERFACE_NAME_REGEX.test(name)) {
        throw new Error(`Invalid interface name format: ${name}`);
    }
}

// Normalize bond mode string
function normalizeBondMode(mode) {
    return mode.toString().trim().toLowerCase().replace(/[_\s]/g, '-');
}

// Validate and fix bond mode
function validateBondMode(mode) {
    console.log(`[validateBondMode] Validating bond mode: ${mode}`);
    
    if (!mode) {
        console.warn('[validateBondMode] No mode provided, defaulting to active-backup');
        return 'active-backup';
    }
    
    const normalized = normalizeBondMode(mode);
    
    // Enhanced mode mapping with broader aliases
    const modeMap = {
        'lacp': '802.3ad', 
        'lag': '802.3ad',
        '802-3ad': '802.3ad',
        'activebackup': 'active-backup',
        'active-backup': 'active-backup',
        'round-robin': 'balance-rr',
        'rr': 'balance-rr',
        'xor': 'balance-xor',
        'tlb': 'balance-tlb',
        'alb': 'balance-alb',
        '802.3ad': '802.3ad'
    };
    
    // Check if it's a mapped mode
    if (modeMap[normalized]) {
        console.log(`[validateBondMode] Mapped ${normalized} to ${modeMap[normalized]}`);
        return modeMap[normalized];
    }
    
    // Check if it's already a valid mode
    if (VALID_BOND_MODES.includes(normalized)) {
        console.log(`[validateBondMode] Mode ${normalized} is valid`);
        return normalized;
    }
    
    console.warn(`[validateBondMode] Invalid bond mode ${normalized}, defaulting to active-backup`);
    return 'active-backup';
}

// Check for potentially invalid configurations in existing files
async function validateExistingBondConfigs() {
    console.log('[validateExistingBondConfigs] Checking existing bond configurations...');
    
    try {
        const xavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-bond*.yaml'], { superuser: 'try' });
        const files = xavsFiles.trim().split('\n').filter(f => f.trim());
        
        for (const file of files) {
            try {
                const content = await cockpit.file(file).read();
                
                // Check for invalid bond mode
                const modeMatch = content.match(/mode:\s*(.+)/);
                if (modeMatch) {
                    const currentMode = modeMatch[1].trim();
                    const validatedMode = validateBondMode(currentMode);
                    
                    if (validatedMode !== currentMode) {
                        console.warn(`[validateExistingBondConfigs] Found invalid bond mode '${currentMode}' in ${file}, should be '${validatedMode}'`);
                    }
                }
                
                // Check for invalid gateway values
                const gatewayMatch = content.match(/gateway4:\s*(.+)/);
                if (gatewayMatch) {
                    const gateway = gatewayMatch[1].trim();
                    if (gateway === 'N/A' || gateway === 'null' || gateway === 'undefined') {
                        console.warn(`[validateExistingBondConfigs] Found invalid gateway value '${gateway}' in ${file}`);
                    }
                }
                
            } catch (error) {
                console.warn(`[validateExistingBondConfigs] Could not validate ${file}:`, error);
            }
        }
    } catch (error) {
        console.warn('[validateExistingBondConfigs] Error validating existing configs:', error);
    }
}

const BondManager = {
    bonds: [],
    isLoading: false, // Flag to prevent concurrent loading
    
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
        if (this.isLoading) {
            console.log('BondManager: Already loading bonds, skipping...');
            return;
        }
        
        this.isLoading = true;
        console.log('BondManager: Loading real bond configurations...');
        const listElement = document.getElementById('bond-list');
        if (listElement) {
            listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading bonds...</div>';
        }
        
        try {
            // Fix permissions on first load
            if (!this.permissionsFixed) {
                await this.fixNetplanPermissions();
                this.permissionsFixed = true;
                
                // Also validate existing bond configs
                await validateExistingBondConfigs();
            }
        
            this.bonds = await this.fetchBonds();
            this.renderBonds();
        } catch (error) {
            console.error('BondManager: Failed to load bonds:', error);
            if (listElement) {
                listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load bonds</div>';
            }
        } finally {
            this.isLoading = false;
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
            // Get bond status from ip link - check both administrative and operational state
            const ipLinkOutput = await cockpit.spawn(['ip', 'link', 'show', bondName], { superuser: 'try' });
            console.log(`[getBondDetails] ip link output for ${bondName}: ${ipLinkOutput.trim()}`);
            
            // More detailed status checking
            const isAdminUp = ipLinkOutput.includes('UP');
            const isOperUp = ipLinkOutput.includes(',UP,') || ipLinkOutput.includes(' UP ');
            const hasLowerUp = ipLinkOutput.includes('LOWER_UP');
            
            // Bond is truly up only if it's administratively up AND operationally up
            if (isAdminUp && (isOperUp || hasLowerUp)) {
                bondInfo.status = 'up';
            } else if (isAdminUp && !isOperUp && !hasLowerUp) {
                bondInfo.status = 'degraded'; // Admin up but no link
            } else {
                bondInfo.status = 'down';
            }
            
            console.log(`[getBondDetails] Bond ${bondName} status: ${bondInfo.status} (admin: ${isAdminUp}, oper: ${isOperUp}, lower: ${hasLowerUp})`);
            
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
            
            // Get route information for gateway (use global default route)
            try {
                const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'default'], { superuser: 'try' });
                const defaultRoute = routeOutput.trim();
                if (defaultRoute) {
                    const gatewayMatch = defaultRoute.match(/default via\s+([^\s]+)/);
                    if (gatewayMatch) {
                        bondInfo.gateway = gatewayMatch[1];
                    }
                }
            } catch (routeError) {
                console.warn(`BondManager: Could not get default route info:`, routeError);
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
        let currentSlave = null;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.includes('Bonding Mode:')) {
                const modeMatch = trimmed.match(/Bonding Mode:\s+(.+)/);
                if (modeMatch) {
                    const fullMode = modeMatch[1].trim();
                    console.log(`[parseBondingInfo] Raw bonding mode from system: "${fullMode}"`);
                    // Handle special case for IEEE 802.3ad
                    if (fullMode.includes('IEEE 802.3ad') || fullMode.includes('802.3ad')) {
                        bondInfo.mode = '802.3ad';
                        console.log(`[parseBondingInfo] Normalized IEEE mode to: 802.3ad`);
                    } else {
                        bondInfo.mode = fullMode.split(' ')[0]; // Get just the mode name for other modes
                        console.log(`[parseBondingInfo] Extracted mode: ${bondInfo.mode}`);
                    }
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
            
            if (trimmed.startsWith('Slave Interface:')) {
                const slaveMatch = trimmed.match(/Slave Interface:\s+(\w+)/);
                if (slaveMatch) {
                    currentSlave = slaveMatch[1];
                    bondInfo.slaves.push(currentSlave);
                }
            }
            
            // Parse per-slave MII status when we're in a slave block
            if (currentSlave && trimmed.startsWith('MII Status:')) {
                const statusMatch = trimmed.match(/MII Status:\s+(\w+)/);
                if (statusMatch) {
                    const isUp = statusMatch[1].toLowerCase() === 'up';
                    if (isUp) {
                        bondInfo.activeSlaves.push(currentSlave);
                    } else {
                        bondInfo.inactiveSlaves.push(currentSlave);
                    }
                    currentSlave = null; // Close the current slave block
                }
            }
        }
    },

    // Get bond information from sysfs as fallback
    async getBondInfoFromSysfs(bondInfo) {
        try {
            // Get bonding mode
            const modeContent = await cockpit.spawn(['cat', `/sys/class/net/${bondInfo.name}/bonding/mode`], { superuser: 'try' });
            const fullMode = modeContent.trim();
            
            // Handle special case for IEEE 802.3ad
            if (fullMode.includes('IEEE 802.3ad') || fullMode.includes('802.3ad')) {
                bondInfo.mode = '802.3ad';
            } else {
                bondInfo.mode = fullMode.split(' ')[0];
            }
            
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
        
        // Store all IP addresses
        bondInfo.ipAddresses = ipAddresses;
        
        if (ipAddresses.length > 0) {
            bondInfo.ip = ipAddresses[0]; // Primary IP for backward compatibility
        } else {
            // Check if this might be a DHCP interface
            bondInfo.ip = 'DHCP';
            bondInfo.ipAddresses = [];
        }
    },
    
    // Render bonds
    renderBonds() {
        const listElement = document.getElementById('bond-list');
        
        if (this.bonds.length === 0) {
            listElement.innerHTML = `
                <div class="alert">
                    <p>No network bonds configured. Create bonds for high availability and increased bandwidth.</p>
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
                        <span class="bond-mode ${bond.mode.replace(/[^a-zA-Z0-9]/g, '-')}">${bond.mode}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="status-dot ${bond.status === 'up' ? 'ok' : bond.status === 'degraded' ? 'warning' : 'bad'}"></span>
                        <span style="font-weight: 600; color: var(--text);">${bond.status.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="vlan-config">
                    <div>
                        <span class="detail-label">IP Configuration</span>
                        <div class="detail-value">
                            ${bond.ipAddresses && bond.ipAddresses.length > 0 
                                ? bond.ipAddresses.map(ip => `<div class="ip-address-item">${ip}</div>`).join('')
                                : (bond.ip || 'Not configured')
                            }
                        </div>
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
        // Instead of using mock data, show an error message
        if (typeof showModalError === 'function') {
            showModalError(document.querySelector('.modal'), 'Cannot load network interfaces. Please ensure Cockpit is running properly and try again.');
        } else {
            NetworkManager.showError('Cannot load network interfaces. Please ensure Cockpit is running properly and try again.');
        }
        return; // Exit early instead of showing mock data
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
                <div class="hint">Choose based on switch support and requirements. Invalid modes will be automatically corrected.</div>
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
                <div class="form-group full-width">
                    <label class="form-label">IP Addresses</label>
                    <div id="bond-ip-addresses-container">
                        <div class="ip-address-entry" data-index="0">
                            <div style="display: flex; gap: 8px; align-items: flex-end;">
                                <div style="flex: 1;">
                                    <input type="text" id="bond-ip-0" class="form-control bond-ip-address-input" placeholder="192.168.1.100/24" data-validate="cidr">
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-danger remove-bond-ip-btn" onclick="removeBondIpAddress(0)" style="display: none;">
                                    <i class="fas fa-minus"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-brand" onclick="addBondIpAddress()" style="margin-top: 8px;">
                        <i class="fas fa-plus"></i> Add IP Address
                    </button>
                    <div class="hint">Enter IP addresses in CIDR notation (e.g., 192.168.1.10/24)</div>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="bond-gateway">Gateway</label>
                    <input type="text" id="bond-gateway" class="form-control" placeholder="192.168.1.1" data-validate="ipAddress">
                    <div class="hint">Gateway for this bond interface</div>
                </div>
                
                <div class="form-group full-width">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="bond-set-default-route" class="form-control-checkbox">
                        <label for="bond-set-default-route" style="margin: 0; font-size: 14px;">Set as default route (overrides system routing)</label>
                    </div>
                    <div class="hint" style="color: #d63384;">⚠️ <strong>Warning:</strong> This will replace the current default route and may affect connectivity to other networks. Only enable if this bond should handle all internet traffic.</div>
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
        // Use readlink -f to properly resolve the master symlink
        const masterOutput = await cockpit.spawn(['readlink', '-f', `/sys/class/net/${interfaceName}/master`], { superuser: 'try' });
        // Check if the resolved path contains a bond interface
        return /\/bond\d+$/.test(masterOutput.trim());
    } catch (error) {
        // If the symlink doesn't exist or can't be resolved, interface is not bonded
        return false;
    }
}

// Helper function to check if interface is a system interface
function isSystemInterface(name) {
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

function editBond(bondName) {
    console.log(`editBond called with bondName: ${bondName}`);
    
    // Check if BondManager is initialized
    if (!BondManager || !BondManager.bonds) {
        console.warn('BondManager not initialized, initializing now...');
        NetworkManager.showError('Bond manager is not ready. Please wait a moment and try again.');
        // Try to initialize BondManager
        if (BondManager && BondManager.loadBonds) {
            BondManager.loadBonds();
        }
        return;
    }
    
    const bond = BondManager.bonds.find(b => b.name === bondName);
    if (!bond) {
        console.warn(`Bond ${bondName} not found in BondManager.bonds`);
        NetworkManager.showError(`Bond ${bondName} not found. Please refresh and try again.`);
        return;
    }
    
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
            
            <div class="form-group full-width">
                <label class="form-label">IP Addresses</label>
                <div id="edit-ip-addresses-container">
                    ${bond.ipAddresses && bond.ipAddresses.length > 0 
                        ? bond.ipAddresses.map((ip, index) => `
                            <div class="ip-input-row" data-index="${index}">
                                <input type="text" class="form-control ip-address-input" value="${ip}" placeholder="e.g., 192.168.1.10/24" data-validate="cidr">
                                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeEditIpAddress(${index})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        `).join('')
                        : `
                            <div class="ip-input-row" data-index="0">
                                <input type="text" class="form-control ip-address-input" value="${bond.ip && bond.ip !== 'Not configured' && bond.ip !== 'DHCP' ? bond.ip : ''}" placeholder="e.g., 192.168.1.10/24" data-validate="cidr">
                                <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeEditIpAddress(0)">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        `
                    }
                </div>
                <button type="button" class="btn btn-sm btn-outline-brand" onclick="addEditIpAddress()">
                    <i class="fas fa-plus"></i> Add IP Address
                </button>
                <div class="hint">Enter IP addresses in CIDR notation (e.g., 192.168.1.10/24)</div>
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
    
    // Initialize IP address management
    updateBondRemoveButtonVisibility();
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

// IP address management functions for edit form
function addEditIpAddress() {
    const container = document.getElementById('edit-ip-addresses-container');
    const existingRows = container.querySelectorAll('.ip-input-row');
    const newIndex = existingRows.length;
    
    const newRow = document.createElement('div');
    newRow.className = 'ip-input-row';
    newRow.setAttribute('data-index', newIndex);
    newRow.innerHTML = `
        <input type="text" class="form-control ip-address-input" placeholder="e.g., 192.168.1.10/24" data-validate="cidr">
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeEditIpAddress(${newIndex})">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(newRow);
    
    // Set up validation for the new input if available
    const newInput = newRow.querySelector('input');
    if (typeof setupInputValidation === 'function') {
        setupInputValidation(newInput);
    }
}

function removeEditIpAddress(index) {
    const container = document.getElementById('edit-ip-addresses-container');
    const row = container.querySelector(`[data-index="${index}"]`);
    if (row) {
        row.remove();
    }
    
    // Ensure at least one IP address row remains
    const remainingRows = container.querySelectorAll('.ip-input-row');
    if (remainingRows.length === 0) {
        addEditIpAddress();
    }
}

function collectEditIpAddresses() {
    const inputs = document.querySelectorAll('#edit-ip-addresses-container .ip-address-input');
    const ipAddresses = [];
    
    inputs.forEach(input => {
        const value = input.value.trim();
        if (value) {
            // Basic validation - check if it looks like an IP address with CIDR
            if (value.includes('/') || value.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                ipAddresses.push(value);
            }
        }
    });
    
    return ipAddresses;
}

async function manageBondSlaves(bondName) {
    const bond = BondManager.bonds.find(b => b.name === bondName);
    if (!bond) return;
    
    // Get available interfaces for adding to bond
    let availableForBonding = [];
    try {
        availableForBonding = await getAvailableInterfacesForBonding();
    } catch (error) {
        console.warn('Could not get available interfaces for bond management:', error);
    }
    
    const availableOptions = availableForBonding.length > 0 
        ? availableForBonding.map(iface => `<option value="${iface}">${iface}</option>`).join('')
        : '<option value="">No interfaces available</option>';
    
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
                    ${availableOptions}
                </select>
                <div class="hint">Only available physical interfaces are shown</div>
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
    NetworkLogger.info('Creating new bond...');
    
    const modal = document.querySelector('.modal');
    const form = document.getElementById('bond-form');
    
    // Get the save button and show progress
    const saveButton = modal.querySelector('.btn-brand');
    ButtonProgress.setLoading(saveButton, '<i class="fas fa-plus"></i> Create Bond');
    
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
        ipAddresses: collectBondIpAddresses(),
        ip: collectBondIpAddresses()[0] || '', // Backward compatibility
        gateway: document.getElementById('bond-gateway')?.value || '',
        setDefaultRoute: document.getElementById('bond-set-default-route')?.checked || false
    };
    
    console.log('BondManager: Form data collected:', formData);
    NetworkLogger.info(`Creating bond ${formData.name} with mode ${formData.mode}`);
    
    // Basic validation fallback
    if (!formData.name || !formData.mode || formData.slaves.length < 2) {
        console.error('BondManager: Validation failed - insufficient data');
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Please fill in all required fields and select at least 2 slave interfaces.');
        } else {
            NetworkManager.showError('Please fill in all required fields and select at least 2 slave interfaces');
        }
        return;
    }
    
    // Check for valid bond name and interface name security
    if (!/^bond\d+$/.test(formData.name)) {
        console.error('BondManager: Invalid bond name format');
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Bond name must be in format: bond0, bond1, etc.');
        } else {
            NetworkManager.showError('Bond name must be in format: bond0, bond1, etc.');
        }
        return;
    }
    
    // Validate interface names for security
    try {
        assertValidInterfaceName(formData.name);
        formData.slaves.forEach(assertValidInterfaceName);
    } catch (validationError) {
        console.error('BondManager: Interface name validation failed:', validationError);
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, `Invalid interface name: ${validationError.message}`);
        } else {
            NetworkManager.showError(`Invalid interface name: ${validationError.message}`);
        }
        return;
    }
    
    console.log('BondManager: Validation passed, creating bond configuration...');
    NetworkLogger.info(`Creating bond ${formData.name} with ${formData.slaves.length} interfaces`);
    
    if (formData.setDefaultRoute) {
        NetworkLogger.warning(`Bond ${formData.name} will become the default route - existing routes may be affected`);
    } else if (formData.gateway) {
        NetworkLogger.info(`Bond ${formData.name} gateway set to ${formData.gateway} (preserving existing routes)`);
    }
    
    // Create bond using real system calls
    createRealBond(formData)
        .then(() => {
            console.log('BondManager: Bond created successfully');
            NetworkLogger.success(`Bond ${formData.name} created successfully`);
            ButtonProgress.clearLoading(saveButton);
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
            NetworkLogger.error(`Failed to create bond ${formData.name}: ${error.message}`);
            ButtonProgress.clearLoading(saveButton);
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
        // First, backup current routes to avoid losing them
        console.log('BondManager: Backing up current routing table...');
        const currentRoutes = await backupCurrentRoutes();
        
        // Generate Netplan configuration for the bond
        const netplanConfig = generateBondNetplanConfig(config);
        console.log('BondManager: Generated Netplan config:', netplanConfig);
        
        // Write Netplan configuration file
        const configFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
        console.log(`BondManager: Writing configuration to ${configFile}`);
        
        await cockpit.file(configFile, { superuser: 'require' }).replace(netplanConfig);
        console.log('BondManager: Netplan configuration written successfully');
        
        // Test the configuration first with netplan try
        console.log('BondManager: Testing Netplan configuration with netplan --debug try...');
        try {
            const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
            console.log('BondManager: Netplan debug output:');
            console.log('--- START NETPLAN DEBUG ---');
            console.log(debugOutput);
            console.log('--- END NETPLAN DEBUG ---');
            console.log('BondManager: Netplan try completed successfully');
        } catch (tryError) {
            console.error('BondManager: Netplan try failed:', tryError);
            
            // Log the debug output even on failure
            if (tryError.message) {
                console.log('BondManager: Netplan error output:');
                console.log('--- START NETPLAN ERROR ---');
                console.log(tryError.message);
                console.log('--- END NETPLAN ERROR ---');
            }
            
            // Check if this is just the bond revert warning (exit status 78)
            if (tryError.exit_status === 78) {
                console.log('BondManager: Netplan try exit 78: bond change warning in non-interactive session; proceeding to apply');
                // This is the expected behavior for bond configs in headless/non-TTY environments
            } else {
                // Fallback: try preflight validation with netplan generate
                console.log('BondManager: Attempting fallback preflight validation...');
                try {
                    await cockpit.spawn(['netplan', 'generate'], { superuser: 'require' });
                    console.log('BondManager: Preflight validation passed, proceeding to apply');
                } catch (generateError) {
                    console.error('BondManager: Preflight validation failed:', generateError);
                    throw new Error(`Configuration validation failed: ${tryError.message || tryError}. The bond configuration has not been applied.`);
                }
            }
        }
        
        // Apply Netplan configuration permanently
        console.log('BondManager: Applying Netplan configuration permanently...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        console.log('BondManager: Netplan applied successfully');
        
        // Verify bond creation
        console.log('BondManager: Verifying bond creation...');
        await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
        console.log('BondManager: Bond interface verified');
        
        // Restore any critical routes that might have been lost
        console.log('BondManager: Checking and restoring critical routes...');
        await restoreCriticalRoutes(currentRoutes, config);
        
    } catch (error) {
        console.error('BondManager: Error creating bond:', error);
        throw new Error(`Failed to create bond interface: ${error.message}`);
    }
}

// Backup current routing table
async function backupCurrentRoutes() {
    try {
        const routeOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
        const routes = routeOutput.split('\n').filter(line => line.trim());
        console.log('BondManager: Current routes backed up:', routes.length, 'entries');
        return routes;
    } catch (error) {
        console.warn('BondManager: Could not backup routes:', error);
        return [];
    }
}

// Restore critical routes that are not related to the bond interfaces
async function restoreCriticalRoutes(originalRoutes, bondConfig) {
    try {
        // Get current routes after bond creation
        const newRouteOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
        const newRoutes = newRouteOutput.split('\n').filter(line => line.trim());
        
        // Find routes that were lost and need to be restored
        const lostRoutes = originalRoutes.filter(route => {
            // Skip routes related to interfaces that are now part of the bond
            const isSlaveRoute = bondConfig.slaves.some(slave => route.includes(` dev ${slave} `));
            // Skip default routes if we're setting a new one
            const isDefaultRoute = route.includes('default') && bondConfig.gateway;
            // Skip if route still exists
            const stillExists = newRoutes.some(newRoute => newRoute === route);
            
            return !isSlaveRoute && !isDefaultRoute && !stillExists;
        });
        
        if (lostRoutes.length > 0) {
            console.log('BondManager: Attempting to restore', lostRoutes.length, 'critical routes');
            for (const route of lostRoutes) {
                try {
                    // Parse and restore the route
                    const routeParts = route.split(' ');
                    if (routeParts.length >= 3 && !route.includes('linkdown')) {
                        console.log('BondManager: Restoring route:', route);
                        await cockpit.spawn(['ip', 'route', 'add', ...routeParts], { superuser: 'require' });
                    }
                } catch (restoreError) {
                    console.warn('BondManager: Could not restore route:', route, restoreError);
                }
            }
        } else {
            console.log('BondManager: No critical routes need restoration');
        }
    } catch (error) {
        console.warn('BondManager: Error during route restoration:', error);
    }
}

// Generate Netplan configuration for bond with modern features
function generateBondNetplanConfig(config) {
    console.log('BondManager: Generating Netplan config for bond:', config.name);
    
    // Validate and fix bond mode
    const validatedMode = validateBondMode(config.mode);
    if (validatedMode !== config.mode) {
        console.warn(`[generateBondNetplanConfig] Bond mode changed from '${config.mode}' to '${validatedMode}'`);
        config.mode = validatedMode;
    }
    
    // Build configuration object for better structure
    const netplanConfig = {
        network: {
            version: 2,
            renderer: 'networkd',
            bonds: {
                [config.name]: {
                    interfaces: config.slaves,
                    parameters: {
                        mode: config.mode
                    }
                }
            }
        }
    };
    
    const bondConfig = netplanConfig.network.bonds[config.name];
    const params = bondConfig.parameters;
    
    // Add mode-specific parameters
    if (config.primary && config.mode === 'active-backup') {
        params.primary = config.primary;
    }
    
    if (config.miiMonitor) {
        params['mii-monitor-interval'] = parseInt(config.miiMonitor);
    }
    
    if (config.upDelay) {
        params['up-delay'] = parseInt(config.upDelay);
    }
    
    if (config.lacpRate && config.mode === '802.3ad') {
        params['lacp-rate'] = config.lacpRate;
    }
    
    if (config.hashPolicy && (config.mode === '802.3ad' || config.mode === 'balance-xor')) {
        params['transmit-hash-policy'] = config.hashPolicy;
    }
    
    // Add min-links for 802.3ad (recommended)
    if (config.mode === '802.3ad') {
        params['min-links'] = 2;
    }
    
    // Add IP configuration
    if (config.configType === 'static') {
        // Handle multiple IP addresses
        const ipAddresses = config.ipAddresses || (config.ip ? [config.ip] : []);
        if (ipAddresses.length > 0) {
            bondConfig.addresses = ipAddresses;
        }
        
        // Only add gateway if explicitly provided and user wants to set default route
        if (config.gateway && config.gateway.trim() && 
            !['N/A', 'Auto', 'null', 'undefined'].includes(config.gateway)) {
            
            if (config.setDefaultRoute) {
                // User explicitly wants this bond to be the default route
                console.log('BondManager: Setting bond as default route');
                bondConfig.gateway4 = config.gateway;
                bondConfig.routes = [
                    {
                        to: 'default',
                        via: config.gateway
                    }
                ];
            } else {
                // Just set gateway for this interface without making it default
                console.log('BondManager: Setting gateway without default route');
                bondConfig.gateway4 = config.gateway;
            }
        }
    } else if (config.configType === 'dhcp') {
        bondConfig.dhcp4 = true;
    }
    
    // Convert to YAML string manually (simple implementation)
    let yamlContent = `network:
  version: 2
  renderer: networkd
  bonds:
    ${config.name}:
      interfaces:
`;
    
    // Add slave interfaces
    config.slaves.forEach(slave => {
        yamlContent += `        - ${slave}
`;
    });
    
    // Add parameters
    yamlContent += `      parameters:
        mode: ${config.mode}
`;
    
    Object.entries(params).forEach(([key, value]) => {
        if (key !== 'mode') {
            yamlContent += `        ${key}: ${value}
`;
        }
    });
    
    // Add addresses if any
    if (bondConfig.addresses) {
        yamlContent += `      addresses:
`;
        bondConfig.addresses.forEach(addr => {
            yamlContent += `        - ${addr}
`;
        });
    }
    
    // Add routes if any (when user explicitly wants default route)
    if (bondConfig.routes) {
        yamlContent += `      routes:
`;
        bondConfig.routes.forEach(route => {
            yamlContent += `        - to: ${route.to}
          via: ${route.via}
`;
        });
    }
    
    // Add gateway4 if present (but avoid default routes that override system routing)
    if (bondConfig.gateway4) {
        yamlContent += `      gateway4: ${bondConfig.gateway4}
`;
    }
    
    // Add DHCP if configured
    if (bondConfig.dhcp4) {
        yamlContent += `      dhcp4: true
`;
    }
    
    console.log('BondManager: Generated Netplan YAML:', yamlContent);
    return yamlContent;
}

function updateBond(bondName) {
    console.log(`BondManager: Updating bond ${bondName}...`);
    NetworkLogger.info(`Updating bond ${bondName}...`);
    
    // Find and set loading state on update button
    const updateButton = document.querySelector('.btn-brand[onclick*="updateBond"]');
    if (updateButton) {
        ButtonProgress.setLoading(updateButton, 'Update Bond');
    }
    
    const formData = {
        name: bondName,
        description: document.getElementById('edit-bond-description')?.value || '',
        ipAddresses: collectEditIpAddresses(),
        ip: collectEditIpAddresses()[0] || '', // Backward compatibility
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
            NetworkLogger.success(`Bond ${bondName} updated successfully`);
            NetworkManager.closeModal();
            BondManager.loadBonds();
        })
        .catch((error) => {
            console.error('BondManager: Failed to update bond:', error);
            NetworkLogger.error(`Failed to update bond ${bondName}: ${error.message}`);
            NetworkManager.showError(`Failed to update bond: ${error.message}`);
        })
        .finally(() => {
            if (updateButton) {
                ButtonProgress.clearLoading(updateButton);
            }
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
            configType: config.ipAddresses && config.ipAddresses.length > 0 ? 'static' : 'dhcp',
            ipAddresses: config.ipAddresses || [],
            ip: config.ipAddresses && config.ipAddresses[0] || '', // Backward compatibility
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
        
        // Remove slave interfaces from the bond first
        try {
            const bondInfo = await cockpit.spawn(['cat', `/proc/net/bonding/${bondName}`], { superuser: 'try' });
            const slaves = [];
            const infoLines = bondInfo.split('\n');
            for (const infoLine of infoLines) {
                if (infoLine.includes('Slave Interface:')) {
                    const slaveMatch = infoLine.match(/Slave Interface:\s+([^\s]+)/);
                    if (slaveMatch) {
                        slaves.push(slaveMatch[1]);
                    }
                }
            }
            
            // Remove each slave
            for (const slave of slaves) {
                try {
                    console.log(`BondManager: Removing slave ${slave} from bond ${bondName}`);
                    await cockpit.spawn(['ip', 'link', 'set', slave, 'nomaster'], { superuser: 'require' });
                } catch (slaveError) {
                    console.warn(`BondManager: Could not remove slave ${slave}:`, slaveError);
                }
            }
        } catch (slaveError) {
            console.warn(`BondManager: Could not get bond slave info:`, slaveError);
        }
        
        // Explicitly delete the bond interface
        console.log(`BondManager: Deleting bond interface ${bondName}...`);
        try {
            await cockpit.spawn(['ip', 'link', 'delete', bondName], { superuser: 'require' });
            console.log(`BondManager: Bond interface ${bondName} deleted`);
        } catch (deleteError) {
            console.warn(`BondManager: Could not delete bond interface (may not exist):`, deleteError);
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
        
        // Apply Netplan to clean up any remaining configuration
        console.log('BondManager: Applying Netplan to clean up...');
        try {
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            console.log('BondManager: Netplan applied');
        } catch (netplanError) {
            console.warn('BondManager: Netplan apply failed:', netplanError);
        }
        
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
    
    // Validate interface names for security
    assertValidInterfaceName(bondName);
    assertValidInterfaceName(slaveInterface);
    
    try {
        // First, ensure the slave interface is down
        console.log(`BondManager: Bringing slave interface ${slaveInterface} down...`);
        await cockpit.spawn(['ip', 'link', 'set', slaveInterface, 'down'], { superuser: 'require' });
        
        // Add slave to bond via sysfs using cockpit.file for safety
        console.log(`BondManager: Adding ${slaveInterface} to bond ${bondName} via sysfs...`);
        const slavePath = `/sys/class/net/${bondName}/bonding/slaves`;
        await cockpit.file(slavePath, { superuser: 'require' }).replace(`+${slaveInterface}`);
        
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
    
    // Validate interface names for security
    assertValidInterfaceName(bondName);
    assertValidInterfaceName(slaveInterface);
    
    try {
        // Remove slave from bond via sysfs using cockpit.file for safety
        console.log(`BondManager: Removing ${slaveInterface} from bond ${bondName} via sysfs...`);
        const slavePath = `/sys/class/net/${bondName}/bonding/slaves`;
        await cockpit.file(slavePath, { superuser: 'require' }).replace(`-${slaveInterface}`);
        
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

// Debug Netplan configuration with detailed output
async function debugNetplanConfiguration(section = 'bonds') {
    console.log(`BondManager: Running netplan debug for ${section}...`);
    
    try {
        // Run netplan --debug try to test current configuration
        const result = await cockpit.spawn(['netplan', '--debug', 'try'], { 
            superuser: 'try',
            err: 'out'
        });
        
        console.log('Netplan Debug Output:', result);
        
        // Show a user-friendly notification
        if (typeof NetworkManager !== 'undefined' && NetworkManager.showSuccess) {
            NetworkManager.showSuccess('Netplan debug completed successfully. Check browser console for detailed output.');
        }
        
    } catch (error) {
        console.error('Netplan Debug Error:', error);
        
        // Show error to user
        if (typeof NetworkManager !== 'undefined' && NetworkManager.showError) {
            NetworkManager.showError(`Netplan debug failed: ${error.message || error}`);
        }
    }
}

// Update the main NetworkManager to use BondManager
NetworkManager.loadBonds = function() {
    BondManager.loadBonds();
};

// Bond Multiple IP Address Management Functions
let bondIpAddressCounter = 0;

function addBondIpAddress() {
    bondIpAddressCounter++;
    const container = document.getElementById('bond-ip-addresses-container');
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', bondIpAddressCounter);
    
    newEntry.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: flex-end; margin-top: 8px;">
            <div style="flex: 1;">
                <input type="text" id="bond-ip-${bondIpAddressCounter}" class="form-control bond-ip-address-input" placeholder="192.168.1.101/24" data-validate="cidr">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-bond-ip-btn" onclick="removeBondIpAddress(${bondIpAddressCounter})">
                <i class="fas fa-minus"></i>
            </button>
        </div>
    `;
    
    container.appendChild(newEntry);
    
    // Update remove button visibility
    updateBondRemoveButtonVisibility();
    
    // Setup live validation for the new input
    const newInput = document.getElementById(`bond-ip-${bondIpAddressCounter}`);
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(newInput.closest('form'));
    }
}

function removeBondIpAddress(index) {
    const entry = document.querySelector(`#bond-ip-addresses-container [data-index="${index}"]`);
    if (entry) {
        entry.remove();
        updateBondRemoveButtonVisibility();
    }
}

function updateBondRemoveButtonVisibility() {
    const entries = document.querySelectorAll('#bond-ip-addresses-container .ip-address-entry');
    entries.forEach((entry, idx) => {
        const removeBtn = entry.querySelector('.remove-bond-ip-btn');
        if (removeBtn) {
            removeBtn.style.display = entries.length > 1 ? 'block' : 'none';
        }
    });
}

function collectBondIpAddresses() {
    const ipInputs = document.querySelectorAll('.bond-ip-address-input');
    const ipAddresses = [];
    
    ipInputs.forEach(input => {
        if (input.value.trim()) {
            ipAddresses.push(input.value.trim());
        }
    });
    
    return ipAddresses;
}

// Debug: Ensure functions are globally available
console.log('Bond Manager loaded. Functions available:', {
    addBond: typeof addBond,
    editBond: typeof editBond,
    updateBond: typeof updateBond,
    BondManager: typeof BondManager,
    addBondIpAddress: typeof addBondIpAddress,
    removeBondIpAddress: typeof removeBondIpAddress,
    addEditIpAddress: typeof addEditIpAddress,
    removeEditIpAddress: typeof removeEditIpAddress,
    collectEditIpAddresses: typeof collectEditIpAddresses
});

// Make sure functions are globally accessible
window.addBond = addBond;
window.editBond = editBond;
window.updateBond = updateBond;
window.addBondIpAddress = addBondIpAddress;
window.removeBondIpAddress = removeBondIpAddress;
window.addEditIpAddress = addEditIpAddress;
window.removeEditIpAddress = removeEditIpAddress;
window.collectEditIpAddresses = collectEditIpAddresses;
window.updateBondRemoveButtonVisibility = updateBondRemoveButtonVisibility;
window.collectBondIpAddresses = collectBondIpAddresses;
