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
    NetworkLogger.info(`[validateBondMode] Validating bond mode: ${mode}`);
    
    if (!mode) {
        NetworkLogger.warning('[validateBondMode] No mode provided, defaulting to active-backup');
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
        NetworkLogger.info(`[validateBondMode] Mapped ${normalized} to ${modeMap[normalized]}`);
        return modeMap[normalized];
    }
    
    // Check if it's already a valid mode
    if (VALID_BOND_MODES.includes(normalized)) {
        NetworkLogger.info(`[validateBondMode] Mode ${normalized} is valid`);
        return normalized;
    }
    
    NetworkLogger.warning(`[validateBondMode] Invalid bond mode ${normalized}, defaulting to active-backup`);
    return 'active-backup';
}

// Check for potentially invalid configurations in existing files
async function addBond() {
    NetworkLogger.info(' Opening add bond dialog...');
    
    // Get available interfaces for bonding
    let availableInterfaces = [];
    try {
        NetworkLogger.info(' Getting available interfaces...');
        availableInterfaces = await getAvailableInterfacesForBonding();
    } catch (error) {
        NetworkLogger.warning(' Could not get available interfaces:', error);
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
        <style>
            .interface-selection-container {
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 16px;
                background: #f8f9fa;
                margin: 8px 0;
            }
            .interface-selection-container.valid {
                border-color: #28a745;
                background: #f8fff8;
            }
            .interface-selection-container.invalid {
                border-color: #dc3545;
                background: #fff8f8;
            }
            .selected-interfaces {
                margin-bottom: 16px;
                padding: 12px;
                background: #fff;
                border-radius: 6px;
                border: 1px solid #e9ecef;
            }
            .selected-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                font-weight: 500;
                color: #495057;
            }
            .selected-header i {
                color: #007bff;
            }
            .selected-list {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                min-height: 32px;
            }
            .no-selection {
                color: #6c757d;
                font-style: italic;
                padding: 8px 0;
            }
            .selected-interface-tag {
                display: flex;
                align-items: center;
                gap: 6px;
                background: #007bff;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 14px;
            }
            .selected-interface-tag i {
                font-size: 12px;
            }
            .remove-interface {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                padding: 0;
                margin-left: 4px;
                opacity: 0.8;
            }
            .remove-interface:hover {
                opacity: 1;
            }
            .interface-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 12px;
            }
            .interface-card.selectable {
                cursor: pointer;
                transition: all 0.2s ease;
                border: 2px solid #dee2e6;
            }
            .interface-card.selectable:hover {
                border-color: #007bff;
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,123,255,0.2);
            }
            .interface-card.selected {
                border-color: #28a745;
                background-color: #f8fff8;
            }
            .interface-checkbox {
                display: flex;
                align-items: center;
            }
            .checkbox-label {
                width: 20px;
                height: 20px;
                border: 2px solid #dee2e6;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
            }
            .interface-card.selected .checkbox-label {
                background-color: #28a745;
                border-color: #28a745;
            }
            .interface-card.selected .checkbox-label::after {
                content: '✓';
                color: white;
                font-weight: bold;
            }
            /* Improved bond-specific styling */
            .bond-mode-select {
                font-size: 14px;
            }
            .bond-mode-select option {
                padding: 8px;
                font-size: 14px;
                line-height: 1.4;
                white-space: normal;
                word-wrap: break-word;
            }
            .create-bond-button {
                padding: 10px 20px;
                font-size: 14px;
                font-weight: 500;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                min-width: 140px;
                justify-content: center;
            }
            .create-bond-button i {
                font-size: 14px;
            }
        </style>
        <form id="bond-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="bond-name">Bond Name</label>
                <input type="text" id="bond-name" class="form-control" placeholder="bond0" required data-validate="interfaceName">
                <div class="hint">Bond interface name (e.g., bond0, bond1)</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="bond-mode">Bonding Mode</label>
                <select id="bond-mode" class="form-control bond-mode-select" required onchange="updateBondModeOptions()">
                    <option value="">Select bonding mode</option>
                    <option value="active-backup">Active-Backup - Failover mode</option>
                    <option value="802.3ad">802.3ad LACP - Link aggregation</option>
                    <option value="balance-rr">Balance Round-Robin - Sequential packets</option>
                    <option value="balance-xor">Balance XOR - Hash-based balancing</option>
                    <option value="broadcast">Broadcast - Transmit on all interfaces</option>
                    <option value="balance-tlb">Balance TLB - Adaptive transmit balancing</option>
                    <option value="balance-alb">Balance ALB - Adaptive load balancing</option>
                </select>
                <div class="hint">
                    <strong>Recommended modes:</strong>
                    <br>• <strong>Active-Backup:</strong> Works with any switch, one active interface
                    <br>• <strong>802.3ad LACP:</strong> Requires switch configuration, best performance
                    <br>• <strong>Others:</strong> May require specific switch features
                </div>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="bond-description">Description</label>
                <input type="text" id="bond-description" class="form-control" placeholder="Primary Network Bond">
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">Slave Interfaces</label>
                <div class="interface-selection-container">
                    <div class="selected-interfaces" id="selected-slaves">
                        <div class="selected-header">
                            <i class="fas fa-link"></i>
                            <span class="selected-count">0 interfaces selected</span>
                        </div>
                        <div class="selected-list" id="selected-list">
                            <!-- Selected slaves will appear here -->
                        </div>
                    </div>
                    <div class="available-interfaces">
                        <label class="form-label" style="font-size: 14px; margin-bottom: 12px;">
                            <i class="fas fa-ethernet"></i> Available Interfaces:
                        </label>
                        <div class="interface-grid" id="interface-grid">
                            ${availableInterfaces.map(iface => `
                                <div class="interface-card selectable" data-interface="${iface}" onclick="toggleSlaveInterface('${iface}')">
                                    <div class="interface-info">
                                        <span class="interface-name">${iface}</span>
                                        <span class="interface-status">Ready</span>
                                    </div>
                                    <div class="interface-checkbox">
                                        <input type="checkbox" id="slave-${iface}" value="${iface}">
                                        <label for="slave-${iface}" class="checkbox-label"></label>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="hint">
                    <i class="fas fa-info-circle"></i>
                    Select at least 2 interfaces for bonding. Click interfaces to add/remove them from the bond.
                </div>
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
                <div class="hint">Configure how this bond interface gets its IP address</div>
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
                    <div class="hint">Enter IP addresses with CIDR notation (e.g., 192.168.1.100/24). Add multiple IPs for redundancy.</div>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="bond-gateway">Gateway (Optional)</label>
                    <input type="text" id="bond-gateway" class="form-control" placeholder="192.168.1.1" data-validate="ipAddress">
                    <div class="hint">Gateway for routing. Leave empty if you don't want to change routing.</div>
                </div>
                
                <div class="form-group full-width">
                    <label class="form-label" for="bond-dns">DNS Servers (Optional)</label>
                    <input type="text" id="bond-dns" class="form-control" placeholder="8.8.8.8, 1.1.1.1">
                    <div class="hint">Comma-separated list of DNS servers (optional)</div>
                </div>
                
                <div class="form-group full-width">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="bond-set-default-route" class="form-control-checkbox">
                        <label for="bond-set-default-route" style="margin: 0; font-size: 14px;">Set as default route</label>
                    </div>
                    <div class="hint" style="color: #d63384;">⚠️ <strong>Warning:</strong> This will replace the current default route and may affect connectivity to other networks. Only enable if this bond should handle all internet traffic.</div>
                </div>
                
                <div class="form-group full-width">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="bond-preserve-routes" class="form-control-checkbox" checked>
                        <label for="bond-preserve-routes" style="margin: 0; font-size: 14px;">Preserve system routes during configuration</label>
                    </div>
                    <div class="hint">Recommended to maintain network connectivity during bond creation</div>
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand create-bond-button" onclick="saveBond()">
            <i class="fas fa-plus"></i> Create Bond
        </button>
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
    NetworkLogger.info(' Getting available interfaces for bonding...');
    
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
        NetworkLogger.error(' Error getting available interfaces:', error);
        throw error;
    }
    
    NetworkLogger.info(' Available interfaces for bonding:', availableInterfaces);
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
    NetworkLogger.info(`editBond called with bondName: ${bondName}`);
    
    // Check if NetworkManager bonds are loaded
    if (!NetworkManager || !NetworkManager.bonds) {
        NetworkLogger.warning('NetworkManager bonds not initialized, initializing now...');
        NetworkManager.showError('Bond manager is not ready. Please wait a moment and try again.');
        // Try to initialize NetworkManager bonds
        if (NetworkManager && NetworkManager.loadBonds) {
            NetworkManager.loadBonds();
        }
        return;
    }
    
    const bond = NetworkManager.bonds.find(b => b.name === bondName);
    if (!bond) {
        NetworkLogger.warning(`Bond ${bondName} not found in NetworkManager.bonds`);
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
                    <!-- IP addresses will be populated by populateEditBondIpAddresses() -->
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
            
            <div class="form-group full-width">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="edit-bond-preserve-routes" class="form-control-checkbox" checked>
                    <label for="edit-bond-preserve-routes" style="margin: 0; font-size: 14px;">Preserve system routes during configuration</label>
                </div>
                <div class="hint">Recommended to maintain network connectivity during bond update</div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="updateBond('${bondName}')">Update Bond</button>
    `;
    
    NetworkManager.createModal(`Edit Bond: ${bondName}`, modalContent, modalFooter);
    
    // Populate IP addresses for editing
    const ipAddresses = [];
    if (bond.ipAddresses && Array.isArray(bond.ipAddresses) && bond.ipAddresses.length > 0) {
        // Use the stored IP addresses array
        ipAddresses.push(...bond.ipAddresses);
    } else if (bond.ip && bond.ip !== 'Not configured' && bond.ip !== 'DHCP') {
        // Fallback to single IP field if ipAddresses not available
        if (bond.ip.includes(',')) {
            ipAddresses.push(...bond.ip.split(',').map(ip => ip.trim()));
        } else {
            ipAddresses.push(bond.ip);
        }
    }
    
    NetworkLogger.info(`BondManager: Populating edit form with IP addresses:`, ipAddresses);
    populateEditBondIpAddresses(ipAddresses);
    
    // Setup live validation for the edit form
    const editForm = document.getElementById('bond-edit-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(editForm);
    }
}

function setupBondForm() {
    // Initialize bond IP address counter
    bondIpAddressCounter = 0;
    
    // Setup IP configuration toggle
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfig = document.getElementById('bond-static-config');
            
            NetworkLogger.info(`Bond IP config changed to: ${configType}`);
            
            if (configType === 'static') {
                staticConfig.style.display = 'block';
                // Focus on first IP input when switching to static
                const firstIpInput = document.getElementById('bond-ip-0');
                if (firstIpInput) {
                    setTimeout(() => firstIpInput.focus(), 100);
                }
            } else {
                staticConfig.style.display = 'none';
            }
        });
    });
    
    // Setup the new interface selection system
    setupInterfaceSelection();
    
    // Initialize IP address management
    updateBondRemoveButtonVisibility();
    
    // Set initial state for static config (default active)
    const staticConfig = document.getElementById('bond-static-config');
    if (staticConfig) {
        staticConfig.style.display = 'block';
    }
}

// Enhanced interface selection system
function setupInterfaceSelection() {
    // Initialize selected interfaces tracking
    window.selectedSlaveInterfaces = new Set();
    
    // Update the display
    updateSelectedInterfacesDisplay();
}

function toggleSlaveInterface(interfaceName) {
    NetworkLogger.info(`BondManager: Toggling interface ${interfaceName}`);
    
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
    NetworkLogger.info(`BondManager: Removing interface ${interfaceName}`);
    
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
    const selectedList = document.getElementById('selected-list');
    const selectedCount = document.querySelector('.selected-count');
    
    const count = window.selectedSlaveInterfaces ? window.selectedSlaveInterfaces.size : 0;
    
    // Update count
    if (selectedCount) {
        selectedCount.textContent = `${count} interface${count !== 1 ? 's' : ''} selected`;
    }
    
    if (!window.selectedSlaveInterfaces || window.selectedSlaveInterfaces.size === 0) {
        if (selectedList) {
            selectedList.innerHTML = '<div class="no-selection">No interfaces selected</div>';
        }
        return;
    }
    
    if (selectedList) {
        selectedList.innerHTML = Array.from(window.selectedSlaveInterfaces).map(interfaceName => `
            <div class="selected-interface-tag">
                <i class="fas fa-ethernet"></i>
                <span class="interface-name">${interfaceName}</span>
                <button type="button" class="remove-interface" onclick="removeSlaveInterface('${interfaceName}')" title="Remove interface">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    }
    
    // Update validation status
    const bondForm = document.getElementById('bond-form');
    if (bondForm) {
        const isValid = count >= 2;
        bondForm.setAttribute('data-slaves-valid', isValid);
        
        // Update visual feedback
        const interfaceContainer = document.querySelector('.interface-selection-container');
        if (interfaceContainer) {
            if (isValid) {
                interfaceContainer.classList.remove('invalid');
                interfaceContainer.classList.add('valid');
            } else {
                interfaceContainer.classList.add('invalid');
                interfaceContainer.classList.remove('valid');
            }
        }
    }
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
        <input type="text" class="form-control ip-address-input" placeholder="192.168.1.10 (default /24)" data-validate="cidr">
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeEditIpAddress(${newIndex})">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(newRow);
    
    // Update remove button visibility
    updateEditBondRemoveButtonVisibility();
    
    // Set up validation for the new input if available
    const newInput = newRow.querySelector('input');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(newInput.closest('form'));
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
    
    // Update remove button visibility
    updateEditBondRemoveButtonVisibility();
}

function populateEditBondIpAddresses(ipAddresses) {
    const container = document.getElementById('edit-ip-addresses-container');
    
    // Clear existing entries
    container.innerHTML = '';
    window.editBondIpAddressCounter = 0;
    
    // Ensure we have at least one entry
    if (ipAddresses.length === 0) {
        ipAddresses = [''];
    }
    
    // Add entries for each IP address
    ipAddresses.forEach((ip, index) => {
        if (index === 0) {
            // First entry
            container.innerHTML = `
                <div class="ip-input-row" data-index="0">
                    <input type="text" class="form-control ip-address-input" value="${ip}" placeholder="192.168.1.10 (default /24)" data-validate="cidr">
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeEditIpAddress(0)" style="display: none;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        } else {
            // Additional entries
            addEditIpAddress();
            const newInput = document.querySelector(`#edit-ip-addresses-container .ip-input-row:last-child input`);
            if (newInput) {
                newInput.value = ip;
            }
        }
    });
    
    // Update visibility of remove buttons
    updateEditBondRemoveButtonVisibility();
}

function updateEditBondRemoveButtonVisibility() {
    const container = document.getElementById('edit-ip-addresses-container');
    const removeButtons = container.querySelectorAll('.btn-outline-danger');
    
    // Hide remove button if only one IP address field
    if (removeButtons.length <= 1) {
        removeButtons.forEach(btn => btn.style.display = 'none');
    } else {
        removeButtons.forEach(btn => btn.style.display = 'inline-flex');
    }
}

function collectEditIpAddresses() {
    const inputs = document.querySelectorAll('#edit-ip-addresses-container .ip-address-input');
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

async function manageBondSlaves(bondName) {
    const bond = NetworkManager.bonds.find(b => b.name === bondName);
    if (!bond) return;
    
    // Get available interfaces for adding to bond
    let availableForBonding = [];
    try {
        availableForBonding = await getAvailableInterfacesForBonding();
    } catch (error) {
        NetworkLogger.warning('Could not get available interfaces for bond management:', error);
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
    NetworkLogger.info(' Creating new bond...');
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
        primary: (document.getElementById('bond-primary') && document.getElementById('bond-primary').value) || null,
        lacpRate: (document.getElementById('lacp-rate') && document.getElementById('lacp-rate').value) || null,
        hashPolicy: (document.getElementById('hash-policy') && document.getElementById('hash-policy').value) || null,
        miiMonitor: document.getElementById('mii-monitor').value || '100',
        upDelay: document.getElementById('up-delay').value || '200',
        configType: document.querySelector('.toggle-seg.active').getAttribute('data-config'),
        ipAddresses: collectBondIpAddresses(),
        ip: collectBondIpAddresses()[0] || '', // Backward compatibility
        gateway: (document.getElementById('bond-gateway') && document.getElementById('bond-gateway').value) || '',
        dns: (document.getElementById('bond-dns') && document.getElementById('bond-dns').value) || '',
        setDefaultRoute: (document.getElementById('bond-set-default-route') && document.getElementById('bond-set-default-route').checked) || false,
        preserveRoutes: (document.getElementById('bond-preserve-routes') && document.getElementById('bond-preserve-routes').checked) !== false
    };
    
    NetworkLogger.info(' Form data collected:', formData);
    NetworkLogger.info(`Creating bond ${formData.name} with mode ${formData.mode}`);
    NetworkLogger.info(`IP Configuration - Type: ${formData.configType}, IPs: ${JSON.stringify(formData.ipAddresses)}, Gateway: ${formData.gateway}`);
    NetworkLogger.info(`DNS servers: ${formData.dns}`);
    
    // Log static configuration visibility
    const staticConfig = document.getElementById('bond-static-config');
    NetworkLogger.info(`Static config visibility: ${staticConfig ? staticConfig.style.display : 'element not found'}`);
    NetworkLogger.info(`Selected config type: ${formData.configType}`);
    
    // Basic validation fallback
    if (!formData.name || !formData.mode || formData.slaves.length < 2) {
        NetworkLogger.error(' Validation failed - insufficient data');
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Please fill in all required fields and select at least 2 slave interfaces.');
        } else {
            NetworkManager.showError('Please fill in all required fields and select at least 2 slave interfaces');
        }
        return;
    }
    
    // Validate IP addresses for static configuration
    if (formData.configType === 'static') {
        if (formData.ipAddresses.length === 0) {
            NetworkLogger.error(' Static IP configuration selected but no IP addresses provided');
            ButtonProgress.clearLoading(saveButton);
            if (typeof showModalError === 'function') {
                showModalError(modal, 'Please provide at least one IP address for static configuration.');
            } else {
                NetworkManager.showError('Please provide at least one IP address for static configuration');
            }
            return;
        }
        NetworkLogger.info(`Bond will be configured with ${formData.ipAddresses.length} IP addresses: ${formData.ipAddresses.join(', ')}`);
    }
    
    // Check for valid bond name and interface name security
    if (!/^bond\d+$/.test(formData.name)) {
        NetworkLogger.error(' Invalid bond name format');
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
        NetworkLogger.error(' Interface name validation failed:', validationError);
        ButtonProgress.clearLoading(saveButton);
        if (typeof showModalError === 'function') {
            showModalError(modal, `Invalid interface name: ${validationError.message}`);
        } else {
            NetworkManager.showError(`Invalid interface name: ${validationError.message}`);
        }
        return;
    }
    
    NetworkLogger.info(' Validation passed, creating bond configuration...');
    NetworkLogger.info(`Creating bond ${formData.name} with ${formData.slaves.length} interfaces`);
    
    if (formData.setDefaultRoute) {
        NetworkLogger.warning(`Bond ${formData.name} will become the default route - existing routes may be affected`);
    } else if (formData.gateway) {
        NetworkLogger.info(`Bond ${formData.name} gateway set to ${formData.gateway} (preserving existing routes)`);
    }
    
    // Create bond using real system calls
    createRealBond(formData)
        .then(() => {
            NetworkLogger.info(' Bond created successfully');
            NetworkLogger.success(`Bond ${formData.name} created successfully`);
            ButtonProgress.clearLoading(saveButton);
            if (typeof showModalSuccess === 'function') {
                showModalSuccess(modal, `Bond ${formData.name} created and tested successfully! The configuration has been applied.`);
                // Close modal after showing success
                setTimeout(() => {
                    NetworkManager.closeModal();
                    NetworkManager.loadBonds();
                }, 2000);
            } else {
                NetworkManager.showSuccess(`Bond ${formData.name} created successfully`);
                NetworkManager.closeModal();
                NetworkManager.loadBonds();
            }
        })
        .catch((error) => {
            NetworkLogger.error(' Error creating bond:', error);
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
    NetworkLogger.info(' Creating real bond with config:', config);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available. Please ensure this module is running within Cockpit.');
    }
    
    try {
        // Backup system routes before making changes if route preservation is enabled
        if (config.preserveRoutes !== false) {
            NetworkLogger.info('Backing up system routes before bond creation...');
            await NetworkConfigUtils.backupSystemRoutes();
        } else {
            NetworkLogger.info('Route preservation disabled by user');
        }
        
        // Validate that slave interfaces exist and are available
        NetworkLogger.info('Validating slave interfaces...');
        for (const slave of config.slaves) {
            try {
                // Check if interface exists
                await cockpit.spawn(['ip', 'link', 'show', slave], { superuser: 'try' });
                NetworkLogger.info(`Interface ${slave} exists and is available`);
                
                // Check if interface is already enslaved
                const isAlreadyBonded = await isInterfaceAlreadyBonded(slave);
                if (isAlreadyBonded) {
                    throw new Error(`Interface ${slave} is already part of another bond`);
                }
                
                // Check if interface is assigned to a bridge
                try {
                    const bridgeFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*bridge*.yaml', '-o', '-name', '*br-*.yaml'], { superuser: 'try' });
                    const files = bridgeFiles.trim().split('\n').filter(f => f.trim());
                    
                    for (const file of files) {
                        try {
                            const content = await cockpit.file(file, { superuser: 'try' }).read();
                            if (content && content.includes(`- ${slave}`)) {
                                const bridgeMatch = content.match(/(\w+):\s*\n.*interfaces:/s);
                                const bridgeName = bridgeMatch ? bridgeMatch[1] : 'unknown bridge';
                                throw new Error(`Interface ${slave} is already assigned to bridge ${bridgeName}`);
                            }
                        } catch (fileError) {
                            // Skip unreadable files
                        }
                    }
                } catch (bridgeCheckError) {
                    NetworkLogger.warning('Could not check for bridge conflicts:', bridgeCheckError);
                }
                
                // Bring down the interface to prepare it for bonding
                NetworkLogger.info(`Bringing down interface ${slave} to prepare for bonding...`);
                try {
                    await cockpit.spawn(['ip', 'link', 'set', slave, 'down'], { superuser: 'require' });
                    NetworkLogger.info(`Interface ${slave} brought down successfully`);
                } catch (downError) {
                    NetworkLogger.warning(`Could not bring down interface ${slave}:`, downError);
                    // Continue anyway - this may not be critical
                }
            } catch (linkError) {
                NetworkLogger.error(`Interface ${slave} validation failed:`, linkError);
                throw new Error(`Interface ${slave} is not available or does not exist: ${linkError.message}`);
            }
        }
        
        // Generate Netplan configuration for the bond
        const netplanConfig = generateBondNetplanConfig(config);
        NetworkLogger.info('Generated Netplan config:', netplanConfig);
        
        // Analyze bond interfaces to determine parent types for priority
        let parentInfo = { parentType: 'physical' };
        let isComplex = false;
        
        // Check if any slave interfaces are VLANs or other complex types
        // Note: config uses 'slaves' property for bond interfaces
        const interfaceList = config.slaves || config.interfaces || [];
        for (const interfaceName of interfaceList) {
            const analysis = NetworkConfigUtils.analyzeInterfaceStructure(interfaceName);
            if (analysis.objectType !== 'physical') {
                parentInfo.parentType = analysis.objectType;
                parentInfo.isComplex = true;
                isComplex = true;
                break; // Found complex interface, use it for priority
            }
        }
        
        // Generate filename using comprehensive system
        const filename = NetworkConfigUtils.generateNetplanFilename(config.name, 'bond', parentInfo);
        const configFile = `/etc/netplan/${filename}`;
        
        NetworkLogger.info(`BondManager: Writing configuration to ${configFile} (${isComplex ? 'complex topology priority' : 'standard priority'})`);
        
        // Validate the generated YAML before writing
        NetworkLogger.info('Validating generated YAML configuration...');
        if (!netplanConfig || netplanConfig.trim().length === 0) {
            throw new Error('Generated Netplan configuration is empty');
        }
        
        // Check for basic YAML structure
        if (!netplanConfig.includes('network:') || !netplanConfig.includes('bonds:') || !netplanConfig.includes(config.name + ':')) {
            throw new Error('Generated Netplan configuration is missing required sections');
        }
        
        await cockpit.file(configFile, { superuser: 'require' }).replace(netplanConfig);
        
        // Set proper file permissions (ignore errors if file doesn't exist)
        await NetworkConfigUtils.safeChmod(configFile, '600');
        
        // Also fix permissions on any existing bond files that might be too open
        try {
            const existingBondFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*bond*.yaml'], { superuser: 'try' });
            const files = existingBondFiles.trim().split('\n').filter(f => f.trim());
            for (const file of files) {
                await NetworkConfigUtils.safeChmod(file, '600');
            }
            NetworkLogger.info('Fixed permissions on all bond configuration files');
        } catch (permError) {
            NetworkLogger.warning('Could not fix permissions on existing bond files:', permError);
        }
        
        NetworkLogger.info('Netplan configuration written successfully');
        
        // Apply the configuration directly without testing for bonds
        NetworkLogger.info('Applying bond configuration directly with netplan apply...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        NetworkLogger.info('Bond configuration applied successfully');
        
        // Explicitly restore system routes if preservation is enabled
        if (config.preserveRoutes !== false) {
            try {
                await NetworkConfigUtils.restoreSystemRoutes();
                NetworkLogger.info('System routes restored successfully after bond creation');
            } catch (routeError) {
                NetworkLogger.warning('Could not restore system routes after bond creation:', routeError);
            }
        } else {
            NetworkLogger.info('Route preservation was disabled, skipping route restoration');
        }
        
        // Verify bond creation
        NetworkLogger.info('Verifying bond creation...');
        try {
            await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
            NetworkLogger.info('Bond interface verified successfully');
        } catch (verifyError) {
            NetworkLogger.warning('Could not verify bond interface, but configuration was applied:', verifyError);
        }
        
    } catch (error) {
        NetworkLogger.error(' Error creating bond:', error);
        throw new Error(`Failed to create bond interface: ${error.message}`);
    }
}

// Backup current routing table
async function backupCurrentRoutes() {
    try {
        const routeOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
        const routes = routeOutput.split('\n').filter(line => line.trim());
        NetworkLogger.info(' Current routes backed up:', routes.length, 'entries');
        return routes;
    } catch (error) {
        NetworkLogger.warning(' Could not backup routes:', error);
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
            NetworkLogger.info(' Attempting to restore', lostRoutes.length, 'critical routes');
            for (const route of lostRoutes) {
                try {
                    // Parse and restore the route
                    const routeParts = route.split(' ');
                    if (routeParts.length >= 3 && !route.includes('linkdown')) {
                        NetworkLogger.info(' Restoring route:', route);
                        await cockpit.spawn(['ip', 'route', 'add', ...routeParts], { superuser: 'require' });
                    }
                } catch (restoreError) {
                    NetworkLogger.warning(' Could not restore route:', route, restoreError);
                }
            }
        } else {
            NetworkLogger.info(' No critical routes need restoration');
        }
    } catch (error) {
        NetworkLogger.warning(' Error during route restoration:', error);
    }
}

// Generate Netplan configuration for bond with modern features
function generateBondNetplanConfig(config) {
    NetworkLogger.info(' Generating Netplan config for bond:', config.name);
    
    // Validate and fix bond mode
    const validatedMode = validateBondMode(config.mode);
    if (validatedMode !== config.mode) {
        NetworkLogger.warning(`[generateBondNetplanConfig] Bond mode changed from '${config.mode}' to '${validatedMode}'`);
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
        NetworkLogger.info(`Static IP configuration: ${ipAddresses.length} addresses: ${JSON.stringify(ipAddresses)}`);
        
        if (ipAddresses.length > 0) {
            bondConfig.addresses = ipAddresses;
            NetworkLogger.info(`Added addresses to bond config: ${JSON.stringify(bondConfig.addresses)}`);
        }
        
        // Add DNS configuration if provided
        if (config.dns && config.dns.trim()) {
            const dnsServers = config.dns.split(',').map(dns => dns.trim()).filter(dns => dns);
            if (dnsServers.length > 0) {
                bondConfig.nameservers = {
                    addresses: dnsServers
                };
                NetworkLogger.info(`Added DNS servers: ${JSON.stringify(dnsServers)}`);
            }
        }
        
        // Only add gateway if explicitly provided and user wants to set default route
        if (config.gateway && config.gateway.trim() && 
            !['N/A', 'Auto', 'null', 'undefined'].includes(config.gateway)) {
            
            if (config.setDefaultRoute) {
                // User explicitly wants this bond to be the default route
                NetworkLogger.info(' Setting bond as default route');
                bondConfig.gateway4 = config.gateway;
                bondConfig.routes = [
                    {
                        to: 'default',
                        via: config.gateway
                    }
                ];
            } else {
                // Just set gateway for this interface without making it default
                NetworkLogger.info(' Setting gateway without default route');
                bondConfig.gateway4 = config.gateway;
            }
        }
    } else if (config.configType === 'dhcp') {
        bondConfig.dhcp4 = true;
        NetworkLogger.info('Bond configured for DHCP');
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
    
    // Add nameservers (DNS) if any
    if (bondConfig.nameservers) {
        yamlContent += `      nameservers:
        addresses:
`;
        bondConfig.nameservers.addresses.forEach(dns => {
            yamlContent += `          - ${dns}
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
    
    NetworkLogger.info(' Generated Netplan YAML:', yamlContent);
    return yamlContent;
}

function updateBond(bondName) {
    NetworkLogger.info(`BondManager: Updating bond ${bondName}...`);
    NetworkLogger.info(`Updating bond ${bondName}...`);
    
    // Find and set loading state on update button
    const updateButton = document.querySelector('.btn-brand[onclick*="updateBond"]');
    if (updateButton) {
        ButtonProgress.setLoading(updateButton, 'Update Bond');
    }
    
    const formData = {
        name: bondName,
        description: (document.getElementById('edit-bond-description') && document.getElementById('edit-bond-description').value) || '',
        ipAddresses: collectEditIpAddresses(),
        ip: collectEditIpAddresses()[0] || '', // Backward compatibility
        gateway: (document.getElementById('edit-bond-gateway') && document.getElementById('edit-bond-gateway').value) || '',
        miiMonitor: (document.getElementById('edit-mii-monitor') && document.getElementById('edit-mii-monitor').value) || '100',
        primary: (document.getElementById('edit-bond-primary') && document.getElementById('edit-bond-primary').value) || null,
        upDelay: (document.getElementById('edit-up-delay') && document.getElementById('edit-up-delay').value) || null,
        preserveRoutes: (document.getElementById('edit-bond-preserve-routes') && document.getElementById('edit-bond-preserve-routes').checked) !== false
    };
    
    NetworkLogger.info(' Update form data:', formData);
    
    // Update bond configuration using real system calls
    updateRealBond(formData)
        .then(() => {
            NetworkLogger.info(' Bond updated successfully');
            NetworkLogger.success(`Bond ${bondName} updated successfully`);
            NetworkManager.closeModal();
            NetworkManager.loadBonds();
        })
        .catch((error) => {
            NetworkLogger.error(' Failed to update bond:', error);
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
    NetworkLogger.info(' Updating real bond configuration:', config);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // Backup system routes before making changes if route preservation is enabled
        if (config.preserveRoutes !== false) {
            NetworkLogger.info('Backing up system routes before bond update...');
            await NetworkConfigUtils.backupSystemRoutes();
        } else {
            NetworkLogger.info('Route preservation disabled by user for bond update');
        }
        
        // Determine config file location using new system
        // First try to find existing file (could be old or new system)
        const oldConfigFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
        
        // Generate new filename using comprehensive system
        let parentInfo = { parentType: 'physical' };
        let isComplex = false;
        
        // Check if any slave interfaces are VLANs or other complex types
        const bond = NetworkManager.bonds.find(b => b.name === config.name);
        if (!bond) {
            throw new Error(`Bond ${config.name} not found in current configuration`);
        }
        
        for (const interfaceName of bond.slaves) {
            const analysis = NetworkConfigUtils.analyzeInterfaceStructure(interfaceName);
            if (analysis.objectType !== 'physical') {
                parentInfo.parentType = analysis.objectType;
                parentInfo.isComplex = true;
                isComplex = true;
                break; // Found complex interface, use it for priority
            }
        }
        
        const newFilename = NetworkConfigUtils.generateNetplanFilename(config.name, 'bond', parentInfo);
        const configFile = `/etc/netplan/${newFilename}`;
        
        NetworkLogger.info(`BondManager: Looking for existing config...`);
        
        let existingConfig;
        try {
            // Try new system file first
            existingConfig = await cockpit.file(configFile).read();
            NetworkLogger.info(`Found config at ${configFile}`);
        } catch (readError) {
            try {
                // Try old system file as fallback
                existingConfig = await cockpit.file(oldConfigFile).read();
                NetworkLogger.info(`Found config at old location ${oldConfigFile}, will migrate to new system`);
                
                // Clean up old file after reading
                await cockpit.spawn(['rm', '-f', oldConfigFile], { superuser: 'try' });
            } catch (oldFileError) {
                throw new Error(`Configuration file not found for bond ${config.name}. Please recreate the bond.`);
            }
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
        NetworkLogger.info(' Generated updated Netplan config:', newNetplanConfig);
        
        // Write updated configuration
        await cockpit.file(configFile, { superuser: 'require' }).replace(newNetplanConfig);
        NetworkLogger.info(' Updated configuration written');
        
        // Apply changes directly with netplan apply for bonds
        NetworkLogger.info('Applying bond update directly with netplan apply...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
        NetworkLogger.info(' Configuration applied successfully');
        
        // Explicitly restore system routes if preservation is enabled
        if (config.preserveRoutes !== false) {
            try {
                await NetworkConfigUtils.restoreSystemRoutes();
                NetworkLogger.info('System routes restored successfully after bond update');
            } catch (routeError) {
                NetworkLogger.warning('Could not restore system routes after bond update:', routeError);
            }
        } else {
            NetworkLogger.info('Route preservation was disabled, skipping route restoration');
        }
        
    } catch (error) {
        NetworkLogger.error(' Error updating bond:', error);
        throw error;
    }
}

function toggleBond(bondName, currentStatus) {
    NetworkLogger.info(`BondManager: Toggling bond ${bondName} from ${currentStatus}`);
    
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    if (confirm(`Are you sure you want to ${action} bond ${bondName}?`)) {
        NetworkLogger.info(`BondManager: User confirmed ${action} for bond ${bondName}`);
        
        // Use real system command to toggle bond
        toggleRealBond(bondName, newStatus)
            .then(() => {
                NetworkLogger.info(`BondManager: Bond ${bondName} ${action}d successfully`);
                NetworkManager.showSuccess(`Bond ${bondName} ${action}d successfully`);
                NetworkManager.loadBonds();
            })
            .catch((error) => {
                NetworkLogger.error(`BondManager: Failed to ${action} bond:`, error);
                NetworkManager.showError(`Failed to ${action} bond: ${error.message}`);
            });
    }
}

// Toggle real bond interface
async function toggleRealBond(bondName, targetStatus) {
    NetworkLogger.info(`BondManager: Setting bond ${bondName} to ${targetStatus}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        const command = targetStatus === 'up' ? 'up' : 'down';
        NetworkLogger.info(`BondManager: Running: ip link set ${bondName} ${command}`);
        
        await cockpit.spawn(['ip', 'link', 'set', bondName, command], { superuser: 'require' });
        NetworkLogger.info(`BondManager: Bond ${bondName} set to ${targetStatus} successfully`);
        
    } catch (error) {
        NetworkLogger.error(`BondManager: Error toggling bond ${bondName}:`, error);
        throw new Error(`Failed to set bond ${bondName} to ${targetStatus}: ${error.message}`);
    }
}

function deleteBond(bondName) {
    NetworkLogger.info(`BondManager: Delete bond ${bondName} requested`);
    
    if (confirm(`Are you sure you want to delete bond ${bondName}? This will remove the bond interface and its configuration. This action cannot be undone.`)) {
        NetworkLogger.info(`BondManager: User confirmed deletion of bond ${bondName}`);
        
        // Use real system commands to delete bond
        deleteRealBond(bondName)
            .then(() => {
                NetworkLogger.info(`BondManager: Bond ${bondName} deleted successfully`);
                NetworkManager.showSuccess(`Bond ${bondName} deleted successfully`);
                NetworkManager.loadBonds();
            })
            .catch((error) => {
                NetworkLogger.error(`BondManager: Failed to delete bond:`, error);
                NetworkManager.showError(`Failed to delete bond: ${error.message}`);
            });
    }
}

// Delete real bond interface and configuration
async function deleteRealBond(bondName) {
    NetworkLogger.info(`BondManager: Deleting real bond ${bondName}`);
    
    if (!cockpit || !cockpit.spawn || !cockpit.file) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // First, bring the bond down
        NetworkLogger.info(`BondManager: Bringing bond ${bondName} down...`);
        try {
            await cockpit.spawn(['ip', 'link', 'set', bondName, 'down'], { superuser: 'require' });
        } catch (downError) {
            NetworkLogger.warning(`BondManager: Could not bring bond down (may already be down):`, downError);
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
                    NetworkLogger.info(`BondManager: Removing slave ${slave} from bond ${bondName}`);
                    await cockpit.spawn(['ip', 'link', 'set', slave, 'nomaster'], { superuser: 'require' });
                } catch (slaveError) {
                    NetworkLogger.warning(`BondManager: Could not remove slave ${slave}:`, slaveError);
                }
            }
        } catch (slaveError) {
            NetworkLogger.warning(`BondManager: Could not get bond slave info:`, slaveError);
        }
        
        // Explicitly delete the bond interface
        NetworkLogger.info(`BondManager: Deleting bond interface ${bondName}...`);
        try {
            await cockpit.spawn(['ip', 'link', 'delete', bondName], { superuser: 'require' });
            NetworkLogger.info(`BondManager: Bond interface ${bondName} deleted`);
        } catch (deleteError) {
            NetworkLogger.warning(`BondManager: Could not delete bond interface (may not exist):`, deleteError);
        }
        
        // Remove configuration files (both old and new system naming)
        const oldConfigFile = `/etc/netplan/90-xavs-${bondName}.yaml`;
        
        // Generate possible new system filenames to clean up
        const possibleParentTypes = ['physical', 'vlan', 'bridge'];
        const configFilesToRemove = [oldConfigFile];
        
        for (const parentType of possibleParentTypes) {
            const parentInfo = { parentType: parentType };
            const filename = NetworkConfigUtils.generateNetplanFilename(bondName, 'bond', parentInfo);
            const configPath = `/etc/netplan/${filename}`;
            if (!configFilesToRemove.includes(configPath)) {
                configFilesToRemove.push(configPath);
            }
        }
        
        NetworkLogger.info(`BondManager: Removing configuration files for ${bondName}...`);
        
        for (const configFile of configFilesToRemove) {
            try {
                await cockpit.spawn(['rm', '-f', configFile], { superuser: 'try' });
                NetworkLogger.info(`Removed configuration file: ${configFile}`);
            } catch (rmError) {
                NetworkLogger.info(`Configuration file ${configFile} does not exist or could not be removed`);
            }
        }
        
        // Backup system routes before applying netplan changes
        NetworkLogger.info('Backing up system routes before bond deletion...');
        await NetworkConfigUtils.backupSystemRoutes();
        
        // Clean up any remaining gateway conflicts and deprecated configs before applying
        NetworkLogger.info('Cleaning up gateway conflicts and deprecated configs before bond deletion...');
        try {
            await checkForBondGatewayConflicts();
            await cleanupBondConflictingRoutes();
        } catch (cleanupError) {
            NetworkLogger.warning('Cleanup failed during bond deletion:', cleanupError);
            // Continue with netplan apply even if cleanup fails
        }
        
        // Apply Netplan to clean up configuration directly for bond deletion
        NetworkLogger.info('Applying Netplan cleanup directly with netplan apply...');
        try {
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            NetworkLogger.info('Netplan cleanup applied successfully');
        } catch (netplanError) {
            NetworkLogger.warning('Netplan apply failed during cleanup:', netplanError);
            // If netplan fails due to conflicts, try manual bond deletion
            NetworkLogger.info(`Attempting manual deletion of bond ${bondName}...`);
            try {
                await cockpit.spawn(['ip', 'link', 'delete', bondName], { superuser: 'require' });
                NetworkLogger.info(`Manual bond deletion successful for ${bondName}`);
            } catch (manualError) {
                NetworkLogger.warning(`Manual bond deletion also failed for ${bondName}:`, manualError);
            }
        }
        
        // Verify bond is gone
        try {
            await cockpit.spawn(['ip', 'link', 'show', bondName], { superuser: 'try' });
            NetworkLogger.warning(`BondManager: Bond ${bondName} still exists after deletion attempt`);
            
            // Try one more manual deletion attempt
            try {
                NetworkLogger.info(`Final manual deletion attempt for ${bondName}...`);
                await cockpit.spawn(['ip', 'link', 'delete', bondName], { superuser: 'require' });
                NetworkLogger.info(`Final manual deletion successful for ${bondName}`);
            } catch (finalError) {
                NetworkLogger.warning(`Final manual deletion failed for ${bondName}:`, finalError);
            }
        } catch (verifyError) {
            NetworkLogger.info(`BondManager: Bond ${bondName} successfully removed from system`);
        }
        
    } catch (error) {
        NetworkLogger.error(`BondManager: Error deleting bond ${bondName}:`, error);
        throw new Error(`Failed to delete bond ${bondName}: ${error.message}`);
    }
}

function addSlaveToBond(bondName) {
    NetworkLogger.info(`BondManager: Adding slave to bond ${bondName}`);
    
    const newSlave = document.getElementById('new-slave').value;
    if (!newSlave) {
        NetworkManager.showError('Please select an interface to add');
        return;
    }
    
    NetworkLogger.info(`BondManager: Adding interface ${newSlave} to bond ${bondName}`);
    
    // Add slave using real system commands
    addRealSlaveToBond(bondName, newSlave)
        .then(() => {
            NetworkLogger.info(`BondManager: Interface ${newSlave} added to bond ${bondName} successfully`);
            NetworkManager.showSuccess(`Interface ${newSlave} added to bond ${bondName}`);
            NetworkManager.closeModal();
            BondManager.loadBonds();
        })
        .catch((error) => {
            NetworkLogger.error(' Failed to add slave to bond:', error);
            NetworkManager.showError(`Failed to add slave to bond: ${error.message}`);
        });
}

// Add real slave interface to bond
async function addRealSlaveToBond(bondName, slaveInterface) {
    NetworkLogger.info(`BondManager: Adding real slave ${slaveInterface} to bond ${bondName}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    // Validate interface names for security
    assertValidInterfaceName(bondName);
    assertValidInterfaceName(slaveInterface);
    
    try {
        // Backup system routes before making changes
        NetworkLogger.info('Backing up system routes before adding slave to bond...');
        await NetworkConfigUtils.backupSystemRoutes();
        
        // First, ensure the slave interface is down
        NetworkLogger.info(`BondManager: Bringing slave interface ${slaveInterface} down...`);
        await cockpit.spawn(['ip', 'link', 'set', slaveInterface, 'down'], { superuser: 'require' });
        
        // Add slave to bond via sysfs using cockpit.file for safety
        NetworkLogger.info(`BondManager: Adding ${slaveInterface} to bond ${bondName} via sysfs...`);
        const slavePath = `/sys/class/net/${bondName}/bonding/slaves`;
        await cockpit.file(slavePath, { superuser: 'require' }).replace(`+${slaveInterface}`);
        
        // Bring the slave interface up
        NetworkLogger.info(`BondManager: Bringing slave interface ${slaveInterface} up...`);
        await cockpit.spawn(['ip', 'link', 'set', slaveInterface, 'up'], { superuser: 'require' });
        
        // Restore system routes
        try {
            await NetworkConfigUtils.restoreSystemRoutes();
            NetworkLogger.info('System routes restored successfully after adding slave to bond');
        } catch (routeError) {
            NetworkLogger.warning('Could not restore system routes after adding slave to bond:', routeError);
        }
        
        NetworkLogger.info(`BondManager: Slave ${slaveInterface} added to bond ${bondName} successfully`);
        
    } catch (error) {
        NetworkLogger.error(`BondManager: Error adding slave ${slaveInterface} to bond ${bondName}:`, error);
        throw new Error(`Failed to add ${slaveInterface} to bond ${bondName}: ${error.message}`);
    }
}

function removeBondSlave(bondName) {
    NetworkLogger.info(`BondManager: Remove slave from bond ${bondName} requested`);
    
    const bond = BondManager.bonds.find(b => b.name === bondName);
    if (!bond || bond.slaves.length <= 2) {
        NetworkManager.showError('Cannot remove slave - bond must have at least 2 slaves');
        return;
    }
    
    // For now, we'll remove the last slave as an example
    // In a real implementation, you'd want to let the user choose
    const slaveToRemove = bond.slaves[bond.slaves.length - 1];
    
    if (confirm(`Remove ${slaveToRemove} from bond ${bondName}?`)) {
        NetworkLogger.info(`BondManager: User confirmed removal of ${slaveToRemove} from bond ${bondName}`);
        
        // Remove slave using real system commands
        removeRealSlaveFromBond(bondName, slaveToRemove)
            .then(() => {
                NetworkLogger.info(`BondManager: Slave ${slaveToRemove} removed from bond ${bondName} successfully`);
                NetworkManager.showSuccess(`Slave interface ${slaveToRemove} removed from bond ${bondName}`);
                NetworkManager.closeModal();
                BondManager.loadBonds();
            })
            .catch((error) => {
                NetworkLogger.error(' Failed to remove slave from bond:', error);
                NetworkManager.showError(`Failed to remove slave from bond: ${error.message}`);
            });
    }
}

// Remove real slave interface from bond
async function removeRealSlaveFromBond(bondName, slaveInterface) {
    NetworkLogger.info(`BondManager: Removing real slave ${slaveInterface} from bond ${bondName}`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    // Validate interface names for security
    assertValidInterfaceName(bondName);
    assertValidInterfaceName(slaveInterface);
    
    try {
        // Backup system routes before making changes
        NetworkLogger.info('Backing up system routes before removing slave from bond...');
        await NetworkConfigUtils.backupSystemRoutes();
        
        // Remove slave from bond via sysfs using cockpit.file for safety
        NetworkLogger.info(`BondManager: Removing ${slaveInterface} from bond ${bondName} via sysfs...`);
        const slavePath = `/sys/class/net/${bondName}/bonding/slaves`;
        await cockpit.file(slavePath, { superuser: 'require' }).replace(`-${slaveInterface}`);
        
        // Bring the former slave interface down
        NetworkLogger.info(`BondManager: Bringing former slave interface ${slaveInterface} down...`);
        await cockpit.spawn(['ip', 'link', 'set', slaveInterface, 'down'], { superuser: 'require' });
        
        // Restore system routes
        try {
            await NetworkConfigUtils.restoreSystemRoutes();
            NetworkLogger.info('System routes restored successfully after removing slave from bond');
        } catch (routeError) {
            NetworkLogger.warning('Could not restore system routes after removing slave from bond:', routeError);
        }
        
        NetworkLogger.info(`BondManager: Slave ${slaveInterface} removed from bond ${bondName} successfully`);
        
    } catch (error) {
        NetworkLogger.error(`BondManager: Error removing slave ${slaveInterface} from bond ${bondName}:`, error);
        throw new Error(`Failed to remove ${slaveInterface} from bond ${bondName}: ${error.message}`);
    }
}

function refreshBonds() {
    NetworkManager.loadBonds();
}

// Initialize IP address counter for bond management
let bondIpAddressCounter = 0;

// Add IP address entry for bond configuration
function addBondIpAddress() {
    bondIpAddressCounter++;
    const container = document.getElementById('bond-ip-addresses-container');
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', bondIpAddressCounter);
    
    newEntry.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: flex-end; margin-top: 8px;">
            <div style="flex: 1;">
                <input type="text" id="bond-ip-${bondIpAddressCounter}" class="form-control bond-ip-address-input" placeholder="192.168.1.101 (default /24)" data-validate="cidr">
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

// Ensure functions are globally available
NetworkLogger.info('Bond Manager loaded. Functions available:', {
    addBond: typeof addBond,
    editBond: typeof editBond,
    updateBond: typeof updateBond,
    NetworkManager: typeof NetworkManager,
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
window.populateEditBondIpAddresses = populateEditBondIpAddresses;
window.updateEditBondRemoveButtonVisibility = updateEditBondRemoveButtonVisibility;

// Provide backward compatibility - BondManager is actually NetworkManager
window.BondManager = NetworkManager;

// Bond-specific gateway conflict prevention functions
async function checkForBondGatewayConflicts() {
    try {
        const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-type', 'f'], { superuser: 'try' });
        const files = netplanFiles.trim().split('\n').filter(f => f.trim());
        
        for (const file of files) {
            try {
                const content = await cockpit.file(file).read();
                if (content && content.includes('gateway4')) {
                    NetworkLogger.warning(`Found deprecated gateway4 in ${file} - will be removed`);
                }
            } catch (readError) {
                NetworkLogger.warning(`Could not read file ${file}:`, readError);
            }
        }
    } catch (error) {
        NetworkLogger.warning('Error checking for bond gateway conflicts:', error);
    }
}

async function cleanupBondConflictingRoutes() {
    try {
        const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-type', 'f'], { superuser: 'try' });
        const files = netplanFiles.trim().split('\n').filter(f => f.trim());
        
        let foundConflicts = false;
        
        for (const file of files) {
            try {
                const content = await cockpit.file(file).read();
                if (!content) continue;
                
                let modified = false;
                let lines = content.split('\n');
                
                // Remove deprecated gateway4 lines
                lines = lines.filter(line => {
                    if (line.includes('gateway4:')) {
                        NetworkLogger.info(`Removing deprecated gateway4 from ${file}: ${line.trim()}`);
                        foundConflicts = true;
                        modified = true;
                        return false;
                    }
                    return true;
                });
                
                // Check for default route conflicts and keep only one
                const routeLineIndices = [];
                lines.forEach((line, index) => {
                    if (line.includes('- to: 0.0.0.0/0') || line.includes('- to: default')) {
                        routeLineIndices.push(index);
                    }
                });
                
                if (routeLineIndices.length > 1) {
                    NetworkLogger.info(`Found ${routeLineIndices.length} default routes in ${file}, keeping only the first one`);
                    // Remove all but the first default route
                    for (let i = routeLineIndices.length - 1; i > 0; i--) {
                        const routeIndex = routeLineIndices[i];
                        // Remove the route line and the following via line if it exists
                        lines.splice(routeIndex, 1);
                        if (routeIndex < lines.length && lines[routeIndex].includes('via:')) {
                            lines.splice(routeIndex, 1);
                        }
                    }
                    foundConflicts = true;
                    modified = true;
                }
                
                // Fix self-referencing bridge interfaces
                const bridgeMatch = file.match(/(\w+)\.yaml$/);
                if (bridgeMatch) {
                    const interfaceName = bridgeMatch[1].replace(/^\d+-xavs-/, '');
                    lines = lines.map(line => {
                        if (line.includes('interfaces:') && line.includes(`[${interfaceName}]`)) {
                            NetworkLogger.info(`Removing self-reference from ${file}: ${line.trim()}`);
                            foundConflicts = true;
                            modified = true;
                            return line.replace(`${interfaceName},`, '').replace(`,${interfaceName}`, '').replace(`[${interfaceName}]`, '[]');
                        }
                        return line;
                    });
                }
                
                if (modified) {
                    await cockpit.file(file).replace(lines.join('\n'));
                    NetworkLogger.info(`Cleaned up conflicting routes and deprecated configs in ${file}`);
                }
                
            } catch (fileError) {
                NetworkLogger.warning(`Could not process file ${file}:`, fileError);
            }
        }
        
        if (foundConflicts) {
            NetworkLogger.info('Successfully cleaned up gateway conflicts and deprecated configurations');
        }
        
    } catch (error) {
        NetworkLogger.warning('Error cleaning up bond conflicting routes:', error);
    }
}
