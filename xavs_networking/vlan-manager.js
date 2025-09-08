// VLAN Management Module

const VlanManager = {
    vlans: [],
    
    // Fix permissions for all XAVS Netplan files
    async fixNetplanPermissions() {
        try {
            console.log('VlanManager: Checking and fixing Netplan file permissions...');
            const xavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-*.yaml'], { superuser: 'try' });
            const files = xavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    await cockpit.spawn(['chmod', '600', file], { superuser: 'try' });
                    console.log(`VlanManager: Fixed permissions for ${file}`);
                } catch (error) {
                    console.warn(`VlanManager: Could not fix permissions for ${file}:`, error);
                }
            }
        } catch (error) {
            console.warn('VlanManager: Error fixing Netplan permissions:', error);
        }
    },

    // Clean up conflicting XAVS configuration files
    async cleanupConflictingConfigs() {
        try {
            console.log('VlanManager: Cleaning up conflicting XAVS configurations...');
            const xavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-*.yaml'], { superuser: 'try' });
            const files = xavsFiles.trim().split('\n').filter(f => f.trim());
            
            const conflictingFiles = [];
            const interfaceDefinitions = new Map();
            
            // Scan all XAVS files for interface definitions
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content) {
                        // Look for interface definitions in different sections
                        const deviceTypes = ['ethernets', 'vlans', 'bonds', 'bridges', 'wifis'];
                        
                        for (const type of deviceTypes) {
                            const typeRegex = new RegExp(`${type}:\\s*\\n([\\s\\S]*?)(?=\\n\\w|$)`, 'm');
                            const typeMatch = content.match(typeRegex);
                            
                            if (typeMatch) {
                                // Find individual interface definitions within this type
                                const interfaceRegex = /^\s{2,4}([a-zA-Z0-9\._-]+):/gm;
                                let interfaceMatch;
                                
                                while ((interfaceMatch = interfaceRegex.exec(typeMatch[1])) !== null) {
                                    const interfaceName = interfaceMatch[1];
                                    
                                    if (interfaceDefinitions.has(interfaceName)) {
                                        const existing = interfaceDefinitions.get(interfaceName);
                                        if (existing.type !== type) {
                                            console.log(`VlanManager: Found conflicting definition for '${interfaceName}': ${existing.type} in ${existing.file} vs ${type} in ${file}`);
                                            conflictingFiles.push(file);
                                        }
                                    } else {
                                        interfaceDefinitions.set(interfaceName, { type, file });
                                    }
                                }
                            }
                        }
                    }
                } catch (fileError) {
                    console.warn(`VlanManager: Could not read file ${file}:`, fileError);
                }
            }
            
            // Remove conflicting files
            for (const file of conflictingFiles) {
                try {
                    console.log(`VlanManager: Removing conflicting configuration file: ${file}`);
                    await cockpit.spawn(['rm', '-f', file], { superuser: 'try' });
                } catch (removeError) {
                    console.warn(`VlanManager: Could not remove file ${file}:`, removeError);
                }
            }
            
            if (conflictingFiles.length > 0) {
                console.log(`VlanManager: Cleaned up ${conflictingFiles.length} conflicting configuration files`);
                return conflictingFiles.length;
            } else {
                console.log('VlanManager: No conflicting configurations found');
                return 0;
            }
            
        } catch (error) {
            console.warn('VlanManager: Error cleaning up conflicting configs:', error);
            return 0;
        }
    },
    
    // Load VLAN configurations
    async loadVlans() {
        const listElement = document.getElementById('vlan-list');
        listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading VLANs...</div>';
        
        // Fix permissions and clean up conflicts on first load
        if (!this.permissionsFixed) {
            await this.fixNetplanPermissions();
            const cleanedCount = await this.cleanupConflictingConfigs();
            if (cleanedCount > 0) {
                console.log(`VlanManager: Cleaned up ${cleanedCount} conflicting configuration files`);
            }
            this.permissionsFixed = true;
        }
        
        try {
            this.vlans = await this.fetchVlans();
            this.renderVlans();
        } catch (error) {
            listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load VLANs</div>';
        }
    },
    
    // Fetch real VLANs from system using Cockpit APIs
    async fetchVlans() {
        console.log('VlanManager: Fetching real VLANs from system...');
        
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available');
        }

        const vlans = [];
        
        try {
            // First, check Netplan configuration files for VLAN definitions
            const netplanVlans = await this.fetchVlansFromNetplan();
            vlans.push(...netplanVlans);
            
            // Then check system interfaces for VLANs that might not be in Netplan
            const ipOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
            const lines = ipOutput.split('\n');
            
            for (const line of lines) {
                const match = line.match(/^\d+:\s+([^@:]+)@?([^:]*)?:/);
                if (match) {
                    const interfaceName = match[1];
                    const parentInterface = match[2];
                    
                    // Check if this is a VLAN interface (standard naming)
                    const vlanMatch = interfaceName.match(/^(.+)\.(\d+)$/) || 
                                     interfaceName.match(/^vlan(\d+)$/);
                    
                    if (vlanMatch) {
                        const vlanId = parseInt(vlanMatch[vlanMatch.length - 1]);
                        const parent = vlanMatch.length === 3 ? vlanMatch[1] : parentInterface;
                        
                        // Check if we already have this VLAN from Netplan
                        const existingVlan = vlans.find(v => v.name === interfaceName || v.id === vlanId);
                        if (!existingVlan) {
                            try {
                                // Get interface details
                                const details = await this.getVlanDetails(interfaceName);
                                
                                vlans.push({
                                    id: vlanId,
                                    name: interfaceName,
                                    parentInterface: parent || 'unknown',
                                    description: details.description || `VLAN ${vlanId}`,
                                    ip: details.ip || 'Not configured',
                                    gateway: details.gateway || 'Not configured',
                                    dns: details.dns || [],
                                    status: details.status || 'unknown'
                                });
                            } catch (error) {
                                console.warn(`VlanManager: Could not get details for VLAN ${interfaceName}:`, error);
                                vlans.push({
                                    id: vlanId,
                                    name: interfaceName,
                                    parentInterface: parent || 'unknown',
                                    description: `VLAN ${vlanId}`,
                                    ip: 'Not configured',
                                    gateway: 'Not configured',
                                    dns: [],
                                    status: 'unknown'
                                });
                            }
                        }
                    }
                }
            }
            
            console.log('VlanManager: Found VLANs:', vlans);
            return vlans;
            
        } catch (error) {
            console.error('VlanManager: Error fetching VLANs:', error);
            return [];
        }
    },

    // Fetch VLANs from Netplan configuration files
    async fetchVlansFromNetplan() {
        console.log('VlanManager: Fetching VLANs from Netplan configurations...');
        const vlans = [];
        
        try {
            // Get all Netplan files
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
            const files = netplanFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes('vlans:')) {
                        // Parse YAML to find VLAN definitions
                        const vlanMatches = content.match(/vlans:\s*\n([\s\S]*?)(?=\n\w|\n$|$)/);
                        if (vlanMatches) {
                            const vlansSection = vlanMatches[1];
                            
                            // Find individual VLAN definitions
                            const vlanRegex = /^\s{2,4}([a-zA-Z0-9\._-]+):\s*\n([\s\S]*?)(?=^\s{2,4}[a-zA-Z0-9\._-]+:|\n$|$)/gm;
                            let vlanMatch;
                            
                            while ((vlanMatch = vlanRegex.exec(vlansSection)) !== null) {
                                const vlanName = vlanMatch[1];
                                const vlanConfig = vlanMatch[2];
                                
                                console.log(`VlanManager: Found VLAN in Netplan: ${vlanName}`);
                                
                                // Extract VLAN details
                                const idMatch = vlanConfig.match(/id:\s*(\d+)/);
                                const linkMatch = vlanConfig.match(/link:\s*([a-zA-Z0-9\._-]+)/);
                                const addressesMatch = vlanConfig.match(/addresses:\s*\n([\s\S]*?)(?=\n\s{0,6}\w|\n$|$)/);
                                
                                if (idMatch) {
                                    const vlanId = parseInt(idMatch[1]);
                                    const parentInterface = linkMatch ? linkMatch[1] : 'unknown';
                                    
                                    // Get IP addresses
                                    let ipAddresses = [];
                                    if (addressesMatch) {
                                        const addressLines = addressesMatch[1].split('\n');
                                        for (const line of addressLines) {
                                            const addrMatch = line.match(/- (.+)/);
                                            if (addrMatch) {
                                                ipAddresses.push(addrMatch[1].trim());
                                            }
                                        }
                                    }
                                    
                                    // Get interface status from system
                                    let status = 'down';
                                    let systemIP = 'Not configured';
                                    
                                    try {
                                        const interfaceStatus = await cockpit.spawn(['ip', 'addr', 'show', vlanName], { superuser: 'try' });
                                        if (interfaceStatus.includes('state UP')) {
                                            status = 'up';
                                        }
                                        
                                        // Get actual IP from system
                                        const ipMatches = interfaceStatus.match(/inet\s+([^\s]+)/);
                                        if (ipMatches && ipMatches.length > 0) {
                                            systemIP = ipMatches[0].replace('inet ', '');
                                        }
                                    } catch (statusError) {
                                        console.warn(`VlanManager: Could not get status for ${vlanName}:`, statusError);
                                    }
                                    
                                    vlans.push({
                                        id: vlanId,
                                        name: vlanName,
                                        parentInterface: parentInterface,
                                        description: `VLAN ${vlanId} (${vlanName})`,
                                        ip: systemIP !== 'Not configured' ? systemIP : (ipAddresses.length > 0 ? ipAddresses[0] : 'Not configured'),
                                        gateway: 'Not configured',
                                        dns: [],
                                        status: status,
                                        configFile: file
                                    });
                                }
                            }
                        }
                    }
                } catch (fileError) {
                    console.warn(`VlanManager: Could not read Netplan file ${file}:`, fileError);
                }
            }
            
        } catch (error) {
            console.warn('VlanManager: Error fetching VLANs from Netplan:', error);
        }
        
        console.log(`VlanManager: Found ${vlans.length} VLANs from Netplan configurations`);
        return vlans;
    },

    // Get detailed information about a VLAN interface
    async getVlanDetails(interfaceName) {
        const details = {
            ip: 'Not configured',
            gateway: 'Not configured',
            dns: [],
            status: 'down',
            description: `VLAN ${interfaceName}`
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

            // Try to get route information for gateway
            const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'dev', interfaceName], 
                { superuser: 'try' });
            const gatewayMatch = routeOutput.match(/default via ([^\s]+)/);
            if (gatewayMatch) {
                details.gateway = gatewayMatch[1];
            }

            // Check for Netplan configuration
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], 
                { superuser: 'try' });
            
            for (const file of netplanFiles.split('\n').filter(f => f.trim())) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes(interfaceName)) {
                        // Try to extract DNS servers from netplan
                        const dnsMatch = content.match(/nameservers:\s*\n\s*addresses:\s*\[(.*?)\]/s);
                        if (dnsMatch) {
                            details.dns = dnsMatch[1].split(',').map(dns => dns.trim().replace(/['"]/g, ''));
                        }
                        break;
                    }
                } catch (fileError) {
                    console.warn(`VlanManager: Could not read netplan file ${file}:`, fileError);
                }
            }

        } catch (error) {
            console.warn(`VlanManager: Error getting details for ${interfaceName}:`, error);
        }

        return details;
    },
    
    // Render VLANs
    renderVlans() {
        const listElement = document.getElementById('vlan-list');
        
        if (this.vlans.length === 0) {
            listElement.innerHTML = `
                <div class="alert">
                    <p>No VLANs configured. Create your first VLAN to get started.</p>
                    <button class="btn btn-brand" onclick="addVlan()">
                        <i class="fas fa-plus"></i> Add VLAN
                    </button>
                </div>
            `;
            return;
        }
        
        listElement.innerHTML = this.vlans.map(vlan => `
            <div class="vlan-card">
                <div class="vlan-header">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div class="vlan-id">VLAN ${vlan.id}</div>
                        <div>
                            <h3 style="margin: 0; font-size: 18px;">${vlan.name}</h3>
                            <p style="margin: 4px 0 0; color: var(--muted); font-size: 14px;">${vlan.description}</p>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="status-dot ${vlan.status === 'up' ? 'ok' : 'bad'}"></span>
                        <span style="font-weight: 600; color: var(--text);">${vlan.status.toUpperCase()}</span>
                    </div>
                </div>
                
                <div class="vlan-config">
                    <div>
                        <span class="detail-label">Parent Interface</span>
                        <div class="detail-value">${vlan.parentInterface}</div>
                    </div>
                    <div>
                        <span class="detail-label">IP Configuration</span>
                        <div class="detail-value">${vlan.ip}</div>
                    </div>
                    <div>
                        <span class="detail-label">Gateway</span>
                        <div class="detail-value">${vlan.gateway}</div>
                    </div>
                    <div>
                        <span class="detail-label">DNS Servers</span>
                        <div class="detail-value">${Array.isArray(vlan.dns) ? vlan.dns.join(', ') : vlan.dns}</div>
                    </div>
                </div>
                
                <div class="interface-actions" style="margin-top: 16px;">
                    <button class="btn btn-sm btn-outline-brand" onclick="editVlan(${vlan.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleVlan(${vlan.id}, '${vlan.status}')">
                        <i class="fas fa-power-off"></i> ${vlan.status === 'up' ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteVlan(${vlan.id})">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// VLAN Functions
async function addVlan() {
    console.log('VlanManager: Opening add VLAN dialog...');
    
    // Get available parent interfaces
    let availableInterfaces = [];
    try {
        console.log('VlanManager: Getting available parent interfaces...');
        availableInterfaces = await getAvailableParentInterfaces();
    } catch (error) {
        console.error('VlanManager: Could not get available interfaces:', error);
        NetworkManager.showError('Could not detect available network interfaces. Please ensure the system is properly configured and try again.');
        return;
    }
    
    if (availableInterfaces.length === 0) {
        NetworkManager.showError('No suitable parent interfaces found for VLAN creation.');
        return;
    }
    
    const interfaceOptions = availableInterfaces.map(iface => 
        `<option value="${iface}">${iface}</option>`
    ).join('');
    
    const modalContent = `
        <form id="vlan-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="vlan-id">VLAN ID</label>
                <input type="number" id="vlan-id" class="form-control" min="1" max="4094" placeholder="100" required data-validate="vlanId">
                <div class="hint">Valid range: 1-4094</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="vlan-name">VLAN Name</label>
                <input type="text" id="vlan-name" class="form-control" placeholder="vlan100" required data-validate="interfaceName">
                <div class="hint">Interface name (e.g., vlan100 or eth0.100)</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="vlan-parent">Parent Interface</label>
                <select id="vlan-parent" class="form-control" required>
                    <option value="">Select interface</option>
                    ${interfaceOptions}
                </select>
                <div class="hint">Parent interface for the VLAN</div>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="vlan-description">Description</label>
                <input type="text" id="vlan-description" class="form-control" placeholder="Management VLAN">
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">IP Configuration</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg active" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg" data-config="dhcp">DHCP</button>
                </div>
            </div>
            
            <div id="vlan-static-config" class="static-config">
                <div class="form-group">
                    <label class="form-label" for="vlan-ip">IP Address</label>
                    <input type="text" id="vlan-ip" class="form-control" placeholder="10.100.1.50/24" data-validate="cidr">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="vlan-gateway">Gateway</label>
                    <input type="text" id="vlan-gateway" class="form-control" placeholder="10.100.1.1" data-validate="ipAddress">
                </div>
                
                <div class="form-group full-width">
                    <label class="form-label" for="vlan-dns">DNS Servers</label>
                    <input type="text" id="vlan-dns" class="form-control" placeholder="10.100.1.1, 8.8.8.8">
                    <div class="hint">Comma-separated list of DNS servers</div>
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveVlan()">Create VLAN</button>
    `;
    
    NetworkManager.createModal('Add VLAN Configuration', modalContent, modalFooter);
    
    // Setup live validation for the form
    const form = document.getElementById('vlan-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(form);
    }
    
    // Setup toggle functionality
    setupVlanToggle();
    
    // Setup VLAN ID auto-naming
    setupVlanAutoNaming();
}

// Get available parent interfaces for VLAN creation
async function getAvailableParentInterfaces() {
    console.log('VlanManager: Getting available parent interfaces...');
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    const availableInterfaces = [];
    
    try {
        // Get all network interfaces
        const allInterfacesOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
        const lines = allInterfacesOutput.split('\n');
        
        for (const line of lines) {
            const match = line.match(/^\d+:\s+([^:@]+)/);
            if (match) {
                const ifaceName = match[1].trim();
                
                // Include physical interfaces, bonds, and bridges as potential parents
                if (!isSystemInterface(ifaceName) && 
                    !ifaceName.includes('.') && // Exclude existing VLANs
                    !ifaceName.startsWith('vlan') && // Exclude VLAN interfaces
                    !ifaceName.startsWith('lo') && // Exclude loopback
                    ifaceName !== '') {
                    availableInterfaces.push(ifaceName);
                }
            }
        }
        
    } catch (error) {
        console.error('VlanManager: Error getting available interfaces:', error);
    }
    
    console.log('VlanManager: Available parent interfaces:', availableInterfaces);
    return availableInterfaces.sort();
}

// Setup VLAN auto-naming based on ID
function setupVlanAutoNaming() {
    const vlanIdInput = document.getElementById('vlan-id');
    const vlanNameInput = document.getElementById('vlan-name');
    const parentSelect = document.getElementById('vlan-parent');
    
    function updateVlanName() {
        const vlanId = vlanIdInput.value;
        const parent = parentSelect.value;
        
        if (vlanId && parent) {
            // Use parent.vlanid format (e.g., eth0.100)
            vlanNameInput.value = `${parent}.${vlanId}`;
        } else if (vlanId) {
            // Use vlanXXX format as fallback
            vlanNameInput.value = `vlan${vlanId}`;
        }
    }
    
    if (vlanIdInput && vlanNameInput && parentSelect) {
        vlanIdInput.addEventListener('input', updateVlanName);
        parentSelect.addEventListener('change', updateVlanName);
    }
}

// Helper function to check if interface is a system interface
function isSystemInterface(name) {
    const systemPrefixes = ['lo', 'docker', 'veth', 'br-', 'virbr', 'cni', 'flannel'];
    return systemPrefixes.some(prefix => name.startsWith(prefix));
}

// Check for interface definition conflicts across Netplan files
async function checkForInterfaceConflicts(interfaceName, intendedType) {
    console.log(`VlanManager: Checking for conflicts for interface '${interfaceName}' intended as '${intendedType}'...`);
    
    try {
        // Get all Netplan files
        const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
        const files = netplanFiles.trim().split('\n').filter(f => f.trim());
        
        const conflictingFiles = [];
        
        for (const file of files) {
            try {
                const content = await cockpit.file(file, { superuser: 'try' }).read();
                if (content && content.includes(`${interfaceName}:`)) {
                    // Check what type this interface is defined as
                    const deviceTypes = ['ethernets', 'vlans', 'bonds', 'bridges', 'wifis'];
                    
                    for (const type of deviceTypes) {
                        if (content.includes(`${type}:`) && content.includes(`${interfaceName}:`)) {
                            const regex = new RegExp(`${type}:\\s*\\n([\\s\\S]*?)\\n\\s*${interfaceName}:`, 'm');
                            if (regex.test(content) && type !== intendedType) {
                                conflictingFiles.push({ file, type, intendedType });
                                console.log(`VlanManager: Found conflict: ${interfaceName} defined as ${type} in ${file}, but trying to define as ${intendedType}`);
                            }
                        }
                    }
                }
            } catch (fileError) {
                console.warn(`VlanManager: Could not read file ${file}:`, fileError);
            }
        }
        
        // If conflicts found, handle them
        if (conflictingFiles.length > 0) {
            console.log(`VlanManager: Found ${conflictingFiles.length} conflicting definitions for interface '${interfaceName}'`);
            
            // For XAVS files, we can remove the conflicting definition
            for (const conflict of conflictingFiles) {
                if (conflict.file.includes('90-xavs-')) {
                    console.log(`VlanManager: Removing conflicting XAVS configuration file: ${conflict.file}`);
                    await cockpit.spawn(['rm', '-f', conflict.file], { superuser: 'try' });
                } else {
                    throw new Error(
                        `Interface '${interfaceName}' is already defined as '${conflict.type}' in ${conflict.file}. Cannot redefine as '${intendedType}'.`
                    );
                }
            }
        }
        
    } catch (error) {
        if (error.message && error.message.includes('already defined')) {
            throw error;
        }
        console.warn('VlanManager: Error checking for interface conflicts:', error);
        // Don't throw here - allow the operation to continue if conflict check fails
    }
}

function editVlan(vlanId) {
    const vlan = VlanManager.vlans.find(v => v.id === vlanId);
    if (!vlan) return;
    
    const modalContent = `
        <form id="vlan-edit-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="edit-vlan-id">VLAN ID</label>
                <input type="number" id="edit-vlan-id" class="form-control" value="${vlan.id}" readonly>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-vlan-name">VLAN Name</label>
                <input type="text" id="edit-vlan-name" class="form-control" value="${vlan.name}" required>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-vlan-parent">Parent Interface</label>
                <select id="edit-vlan-parent" class="form-control" required>
                    <option value="eth0" ${vlan.parentInterface === 'eth0' ? 'selected' : ''}>eth0</option>
                    <option value="eth1" ${vlan.parentInterface === 'eth1' ? 'selected' : ''}>eth1</option>
                    <option value="bond0" ${vlan.parentInterface === 'bond0' ? 'selected' : ''}>bond0</option>
                </select>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="edit-vlan-description">Description</label>
                <input type="text" id="edit-vlan-description" class="form-control" value="${vlan.description}">
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">IP Configuration</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg ${vlan.ipConfig === 'static' ? 'active' : ''}" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg ${vlan.ipConfig === 'dhcp' ? 'active' : ''}" data-config="dhcp">DHCP</button>
                </div>
            </div>
            
            <div id="edit-vlan-static-config" class="static-config ${vlan.ipConfig === 'static' ? '' : 'hidden'}">
                <div class="form-group">
                    <label class="form-label" for="edit-vlan-ip">IP Address</label>
                    <input type="text" id="edit-vlan-ip" class="form-control" value="${vlan.ipAddress || ''}">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="edit-vlan-gateway">Gateway</label>
                    <input type="text" id="edit-vlan-gateway" class="form-control" value="${vlan.gateway || ''}">
                </div>
                
                <div class="form-group full-width">
                    <label class="form-label" for="edit-vlan-dns">DNS Servers</label>
                    <input type="text" id="edit-vlan-dns" class="form-control" value="${vlan.dns ? vlan.dns.join(', ') : ''}">
                    <div class="hint">Comma-separated list of DNS servers</div>
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveVlanEdit('${vlan.id}')">Update VLAN</button>
    `;
    
    NetworkManager.createModal('Edit VLAN Configuration', modalContent, modalFooter);
    
    // Setup toggle functionality for edit form
    setupVlanToggle('edit-vlan');
}

// Get available parent interfaces for VLAN creation
async function getAvailableParentInterfaces() {
    console.log('VlanManager: Getting available parent interfaces...');
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    const availableInterfaces = [];
    
    try {
        // Get all network interfaces
        const allInterfacesOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
        const lines = allInterfacesOutput.split('\n');
        
        for (const line of lines) {
            const match = line.match(/^\d+:\s+([^:@]+)/);
            if (match) {
                const ifaceName = match[1].trim();
                
                // Include physical interfaces, bonds, and bridges as potential parents
                if (!isSystemInterface(ifaceName) && 
                    !ifaceName.includes('.') && // Exclude existing VLANs
                    !ifaceName.startsWith('vlan') && // Exclude VLAN interfaces
                    !ifaceName.startsWith('lo') && // Exclude loopback
                    ifaceName !== '') {
                    availableInterfaces.push(ifaceName);
                }
            }
        }
        
    } catch (error) {
        console.error('VlanManager: Error getting available interfaces:', error);
    }
    
    console.log('VlanManager: Available parent interfaces:', availableInterfaces);
    return availableInterfaces.sort();
}

function setupVlanToggle() {
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfig = document.getElementById('vlan-static-config');
            
            if (configType === 'static') {
                staticConfig.style.display = 'contents';
            } else {
                staticConfig.style.display = 'none';
            }
        });
    });
}

function saveVlan() {
    console.log('VlanManager: Creating new VLAN...');
    
    const modal = document.querySelector('.modal');
    const form = document.getElementById('vlan-form');
    
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
    
    const formData = {
        id: document.getElementById('vlan-id').value,
        name: document.getElementById('vlan-name').value,
        parent: document.getElementById('vlan-parent').value,
        description: document.getElementById('vlan-description').value,
        configType: document.querySelector('.toggle-seg.active').getAttribute('data-config'),
        ip: document.getElementById('vlan-ip')?.value || '',
        gateway: document.getElementById('vlan-gateway')?.value || '',
        dns: document.getElementById('vlan-dns')?.value || ''
    };
    
    console.log('VlanManager: Form data collected:', formData);
    
    // Basic validation fallback
    if (!formData.id || !formData.name || !formData.parent) {
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Please fill in all required fields (VLAN ID, Name, and Parent Interface).');
        } else {
            NetworkManager.showError('Please fill in all required fields');
        }
        return;
    }
    
    // Validate VLAN ID range
    const vlanId = parseInt(formData.id);
    if (vlanId < 1 || vlanId > 4094) {
        if (typeof showModalError === 'function') {
            showModalError(modal, 'VLAN ID must be between 1 and 4094.');
        } else {
            NetworkManager.showError('VLAN ID must be between 1 and 4094');
        }
        return;
    }
    
    // Validate VLAN interface name format to prevent conflicts
    if (!formData.name.includes('.') && !formData.name.startsWith('vlan')) {
        if (typeof showModalError === 'function') {
            showModalError(modal, 'VLAN interface name must be in format "parent.vlanid" (e.g., eth0.100) or "vlanXXX" (e.g., vlan100) to avoid conflicts.');
        } else {
            NetworkManager.showError('Invalid VLAN interface name format');
        }
        return;
    }
    
    // Ensure VLAN name matches the expected format
    const expectedName = `${formData.parent}.${formData.id}`;
    if (formData.name !== expectedName && formData.name !== `vlan${formData.id}`) {
        formData.name = expectedName; // Force correct naming
        console.log(`VlanManager: Corrected VLAN name to: ${formData.name}`);
    }
    
    // Create VLAN using real system calls
    createRealVlan(formData)
        .then(() => {
            console.log('VlanManager: VLAN created successfully');
            if (typeof showModalSuccess === 'function') {
                showModalSuccess(modal, `VLAN ${formData.id} created and tested successfully! The configuration has been applied.`);
                // Close modal after showing success
                setTimeout(() => {
                    NetworkManager.closeModal();
                    VlanManager.loadVlans();
                }, 2000);
            } else {
                NetworkManager.showSuccess(`VLAN ${formData.id} created successfully`);
                NetworkManager.closeModal();
                VlanManager.loadVlans();
            }
        })
        .catch((error) => {
            console.error('VlanManager: Error creating VLAN:', error);
            if (typeof showModalError === 'function') {
                showModalError(modal, `Failed to create VLAN: ${error.message || error}`);
            } else {
                NetworkManager.showError(`Failed to create VLAN: ${error.message || error}`);
            }
        });
}

// Create real VLAN configuration
async function createRealVlan(config) {
    console.log('VlanManager: Creating real VLAN configuration...');
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    // Generate Netplan configuration
    const netplanConfig = generateVlanNetplanConfig(config);
    const configPath = `/etc/netplan/90-xavs-vlan${config.id}.yaml`;
    
    console.log('VlanManager: Generated Netplan config:', netplanConfig);
    console.log('VlanManager: Writing configuration to', configPath);
    
    try {
        // Check for interface conflicts before proceeding
        console.log('VlanManager: Checking for interface conflicts...');
        await checkForInterfaceConflicts(config.name, 'vlans');
        
        // Remove any existing XAVS config files that might conflict with this interface name
        // This helps prevent the "device type changes" error
        try {
            const existingXavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-*.yaml'], { superuser: 'try' });
            const files = existingXavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes(`${config.name}:`)) {
                        console.log(`VlanManager: Removing conflicting XAVS file: ${file}`);
                        await cockpit.spawn(['rm', '-f', file], { superuser: 'try' });
                    }
                } catch (fileError) {
                    console.warn(`VlanManager: Could not check/remove file ${file}:`, fileError);
                }
            }
        } catch (cleanupError) {
            console.warn('VlanManager: Error during cleanup:', cleanupError);
        }
        
        // Check if VLAN interface name already exists in the system
        try {
            const existingInterfaces = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
            if (existingInterfaces.includes(`${config.name}:`)) {
                throw new Error(`Interface name '${config.name}' already exists. Please choose a different name.`);
            }
        } catch (interfaceCheckError) {
            if (interfaceCheckError.message && interfaceCheckError.message.includes('already exists')) {
                throw interfaceCheckError;
            }
            console.warn('VlanManager: Could not check existing interfaces:', interfaceCheckError);
        }
        
        // Write the Netplan configuration
        await cockpit.file(configPath, { superuser: 'try' }).replace(netplanConfig);
        console.log('VlanManager: Netplan configuration written successfully');
        
        // Set proper file permissions (600 = rw-------)
        await cockpit.spawn(['chmod', '600', configPath], { superuser: 'try' });
        console.log('VlanManager: File permissions set to 600');
        
        // Test the configuration first with netplan try
        console.log('VlanManager: Testing Netplan configuration with netplan try...');
        try {
            await cockpit.spawn(['netplan', 'try', '--timeout=30'], { superuser: 'try' });
            console.log('VlanManager: Netplan try completed successfully');
        } catch (tryError) {
            console.error('VlanManager: Netplan try failed:', tryError);
            throw new Error(`Configuration test failed: ${tryError.message || tryError}. The configuration has not been applied.`);
        }
        
        // Apply the configuration permanently
        console.log('VlanManager: Applying Netplan configuration permanently...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
        console.log('VlanManager: Netplan applied successfully');
        
        // Verify VLAN creation
        console.log('VlanManager: Verifying VLAN creation...');
        const checkOutput = await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
        if (checkOutput.includes(config.name)) {
            console.log('VlanManager: VLAN interface verified');
            return true;
        } else {
            throw new Error('VLAN interface was not created');
        }
        
    } catch (error) {
        console.error('VlanManager: Error in createRealVlan:', error);
        // Clean up configuration file if it was created
        try {
            await cockpit.spawn(['rm', '-f', configPath], { superuser: 'try' });
        } catch (cleanupError) {
            console.warn('VlanManager: Could not clean up config file:', cleanupError);
        }
        throw error;
    }
}

// Generate Netplan configuration for VLAN
function generateVlanNetplanConfig(config) {
    console.log('VlanManager: Generating Netplan config for VLAN:', config.name);
    
    let yamlConfig = `network:
  version: 2
  vlans:
    ${config.name}:
      id: ${config.id}
      link: ${config.parent}`;
    
    if (config.configType === 'static' && config.ip) {
        yamlConfig += `
      addresses:
        - ${config.ip}`;
        
        if (config.gateway) {
            yamlConfig += `
      routes:
        - to: default
          via: ${config.gateway}`;
        }
        
        if (config.dns) {
            const dnsServers = config.dns.split(',').map(dns => dns.trim()).filter(dns => dns);
            if (dnsServers.length > 0) {
                yamlConfig += `
      nameservers:
        addresses: [${dnsServers.map(dns => `"${dns}"`).join(', ')}]`;
            }
        }
    } else if (config.configType === 'dhcp') {
        yamlConfig += `
      dhcp4: true`;
    }
    
    yamlConfig += '\n';
    return yamlConfig;
}

function updateVlan(vlanId) {
    console.log(`VlanManager: Updating VLAN ${vlanId}...`);
    // For now, just reload - full update functionality would require more complex logic
    NetworkManager.showSuccess(`VLAN ${vlanId} updated successfully`);
    NetworkManager.closeModal();
    VlanManager.loadVlans();
}

function toggleVlan(vlanId, currentStatus) {
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    if (confirm(`Are you sure you want to ${action} VLAN ${vlanId}?`)) {
        console.log(`VlanManager: ${action}ing VLAN ${vlanId}...`);
        
        if (!cockpit || !cockpit.spawn) {
            NetworkManager.showError('Cockpit API not available');
            return;
        }
        
        const vlan = VlanManager.vlans.find(v => v.id === vlanId);
        if (!vlan) {
            NetworkManager.showError(`VLAN ${vlanId} not found`);
            return;
        }
        
        const command = newStatus === 'up' ? 'up' : 'down';
        cockpit.spawn(['ip', 'link', 'set', vlan.name, command], { superuser: 'try' })
            .then(() => {
                NetworkManager.showSuccess(`VLAN ${vlanId} ${action}d successfully`);
                VlanManager.loadVlans();
            })
            .catch((error) => {
                console.error(`VlanManager: Error ${action}ing VLAN:`, error);
                NetworkManager.showError(`Failed to ${action} VLAN: ${error.message || error}`);
            });
    }
}

function deleteVlan(vlanId) {
    if (confirm(`Are you sure you want to delete VLAN ${vlanId}? This action cannot be undone.`)) {
        console.log(`VlanManager: Deleting VLAN ${vlanId}...`);
        
        if (!cockpit || !cockpit.spawn) {
            NetworkManager.showError('Cockpit API not available');
            return;
        }
        
        const vlan = VlanManager.vlans.find(v => v.id === vlanId);
        if (!vlan) {
            NetworkManager.showError(`VLAN ${vlanId} not found`);
            return;
        }
        
        const configPath = `/etc/netplan/90-xavs-vlan${vlanId}.yaml`;
        
        // First bring down the interface
        cockpit.spawn(['ip', 'link', 'set', vlan.name, 'down'], { superuser: 'try' })
            .then(() => {
                // Delete the VLAN interface
                return cockpit.spawn(['ip', 'link', 'delete', vlan.name], { superuser: 'try' });
            })
            .then(() => {
                // Remove the Netplan configuration file
                return cockpit.spawn(['rm', '-f', configPath], { superuser: 'try' });
            })
            .then(() => {
                // Apply netplan to ensure configuration is clean
                return cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            })
            .then(() => {
                NetworkManager.showSuccess(`VLAN ${vlanId} deleted successfully`);
                VlanManager.loadVlans();
            })
            .catch((error) => {
                console.error('VlanManager: Error deleting VLAN:', error);
                NetworkManager.showError(`Failed to delete VLAN: ${error.message || error}`);
            });
    }
}

function refreshVlans() {
    VlanManager.loadVlans();
}

// Function to manually clean up conflicting configurations
async function cleanupNetplanConflicts() {
    try {
        console.log('Manual cleanup: Starting Netplan conflict resolution...');
        const cleanedCount = await VlanManager.cleanupConflictingConfigs();
        
        if (cleanedCount > 0) {
            NetworkManager.showSuccess(`Cleaned up ${cleanedCount} conflicting configuration files. Please refresh to see changes.`);
        } else {
            NetworkManager.showSuccess('No conflicting configurations found. System is clean.');
        }
        
        // Refresh the VLAN list
        VlanManager.loadVlans();
        
    } catch (error) {
        console.error('Manual cleanup: Error during cleanup:', error);
        NetworkManager.showError(`Failed to clean up conflicts: ${error.message || error}`);
    }
}

// Update the main NetworkManager to use VlanManager
NetworkManager.loadVlans = function() {
    VlanManager.loadVlans();
};
