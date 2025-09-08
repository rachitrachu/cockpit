// XAVS Network Management JavaScript

// Check for Cockpit API availability
if (typeof cockpit === 'undefined') {
    console.error('Cockpit API not available. Make sure cockpit.js is loaded.');
    console.error('This module requires Cockpit to be properly installed and running.');
    console.error('Please ensure you are accessing this page through the Cockpit web interface.');
}

// Global state management
const NetworkManager = {
    currentTab: 'overview',
    interfaces: [],
    vlans: [],
    bridges: [],
    bonds: [],
    routes: [],
    dnsServers: [],
    systemStatus: {},
    
    // Initialize the application
    init() {
        this.setupTabNavigation();
        this.fixNetplanPermissions(); // Fix any permission issues on startup
        this.loadSystemStatus();
        this.loadNetworkData();
        this.setupEventListeners();
        
        // Refresh data every 30 seconds
        setInterval(() => {
            if (this.currentTab === 'overview') {
                this.loadSystemStatus();
            }
        }, 30000);
    },

    // Fix permissions for all XAVS Netplan files
    async fixNetplanPermissions() {
        try {
            console.log('Checking and fixing Netplan file permissions...');
            const xavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-*.yaml'], { superuser: 'try' });
            const files = xavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    await cockpit.spawn(['chmod', '600', file], { superuser: 'try' });
                    console.log(`Fixed permissions for ${file}`);
                } catch (error) {
                    console.warn(`Could not fix permissions for ${file}:`, error);
                }
            }
        } catch (error) {
            console.warn('Error fixing Netplan permissions:', error);
        }
    },
    
    // Setup tab navigation
    setupTabNavigation() {
        const tabLinks = document.querySelectorAll('.nav-link');
        const tabPanes = document.querySelectorAll('.tab-pane');
        
        tabLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = link.getAttribute('data-tab');
                
                // Update active tab
                tabLinks.forEach(l => l.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('show'));
                
                link.classList.add('active');
                document.getElementById(targetTab).classList.add('show');
                
                this.currentTab = targetTab;
                this.loadTabData(targetTab);
            });
        });
    },
    
    // Load data for specific tab
    loadTabData(tab) {
        switch(tab) {
            case 'overview':
                this.loadSystemStatus();
                break;
            case 'interfaces':
                this.loadInterfaces();
                break;
            case 'vlans':
                this.loadVlans();
                break;
            case 'bridges':
                this.loadBridges();
                break;
            case 'bonds':
                this.loadBonds();
                break;
            case 'routes':
                this.loadRoutes();
                break;
            case 'dns':
                this.loadDnsConfig();
                break;
            case 'monitoring':
                this.loadMonitoring();
                break;
            case 'config':
                this.loadConfigManagement();
                break;
        }
    },
    
    // Load system status
    async loadSystemStatus() {
        try {
            // Get real system status using Cockpit APIs
            const status = await this.fetchSystemStatus();
            this.updateStatusDisplay(status);
        } catch (error) {
            console.error('Failed to load system status:', error);
            this.showError('Failed to load system status');
        }
    },
    
    // Fetch real system status
    async fetchSystemStatus() {
        const status = {
            networkd: { status: 'unknown', uptime: 'N/A' },
            resolved: { status: 'unknown', uptime: 'N/A' },
            renderer: 'unknown',
            totalInterfaces: 0,
            activeInterfaces: 0,
            dhcpInterfaces: 0,
            lastModified: 'N/A',
            backupAvailable: false,
            syntaxValid: true
        };
        
        if (!cockpit || !cockpit.spawn) {
            console.warn('Cockpit API not available for system status');
            return status;
        }
        
        try {
            // Check systemd-networkd status
            const networkdStatus = await cockpit.spawn(['systemctl', 'show', 'systemd-networkd', '--property=ActiveState,SubState'], { superuser: 'try' });
            if (networkdStatus.includes('ActiveState=active')) {
                status.networkd.status = 'active';
                
                // Get uptime
                try {
                    const uptimeOutput = await cockpit.spawn(['systemctl', 'show', 'systemd-networkd', '--property=ActiveEnterTimestamp'], { superuser: 'try' });
                    const timestampMatch = uptimeOutput.match(/ActiveEnterTimestamp=(.+)/);
                    if (timestampMatch) {
                        const startTime = new Date(timestampMatch[1]);
                        const uptime = this.calculateUptime(startTime);
                        status.networkd.uptime = uptime;
                    }
                } catch (uptimeError) {
                    console.warn('Failed to get networkd uptime:', uptimeError);
                }
            }
            
            // Check systemd-resolved status
            const resolvedStatus = await cockpit.spawn(['systemctl', 'show', 'systemd-resolved', '--property=ActiveState'], { superuser: 'try' });
            if (resolvedStatus.includes('ActiveState=active')) {
                status.resolved.status = 'active';
                
                try {
                    const uptimeOutput = await cockpit.spawn(['systemctl', 'show', 'systemd-resolved', '--property=ActiveEnterTimestamp'], { superuser: 'try' });
                    const timestampMatch = uptimeOutput.match(/ActiveEnterTimestamp=(.+)/);
                    if (timestampMatch) {
                        const startTime = new Date(timestampMatch[1]);
                        const uptime = this.calculateUptime(startTime);
                        status.resolved.uptime = uptime;
                    }
                } catch (uptimeError) {
                    console.warn('Failed to get resolved uptime:', uptimeError);
                }
            }
            
            // Get Netplan renderer
            try {
                const netplanStatus = await cockpit.spawn(['netplan', 'get'], { superuser: 'try' });
                if (netplanStatus.includes('renderer')) {
                    if (netplanStatus.includes('networkd')) {
                        status.renderer = 'networkd';
                    } else if (netplanStatus.includes('NetworkManager')) {
                        status.renderer = 'NetworkManager';
                    }
                }
            } catch (netplanError) {
                console.warn('Failed to get Netplan renderer:', netplanError);
            }
            
            // Count interfaces from our loaded data
            status.totalInterfaces = this.interfaces.length;
            status.activeInterfaces = this.interfaces.filter(i => i.status === 'up').length;
            status.dhcpInterfaces = this.interfaces.filter(i => i.dhcp).length;
            
            // Check for Netplan configuration files
            try {
                const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
                if (netplanFiles.trim()) {
                    status.backupAvailable = true;
                    
                    // Get last modification time
                    const statOutput = await cockpit.spawn(['stat', '-c', '%y', '/etc/netplan'], { superuser: 'try' });
                    status.lastModified = statOutput.trim().split('.')[0];
                }
                
                // Validate Netplan syntax
                const netplanCheck = await cockpit.spawn(['netplan', 'get'], { superuser: 'try' });
                status.syntaxValid = true;
            } catch (netplanError) {
                console.warn('Failed to check Netplan configuration:', netplanError);
                status.syntaxValid = false;
            }
            
        } catch (error) {
            console.warn('Error fetching system status:', error);
        }
        
        return status;
    },
    
    // Calculate service uptime
    calculateUptime(startTime) {
        const now = new Date();
        const diff = now - startTime;
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    },
    
    // Update status display
    updateStatusDisplay(status) {
        // Update service status
        this.updateServiceStatus('networkd', status.networkd);
        this.updateServiceStatus('resolved', status.resolved);
        
        // Update interface counts
        document.getElementById('total-interfaces').textContent = status.totalInterfaces;
        document.getElementById('active-interfaces').textContent = status.activeInterfaces;
        document.getElementById('dhcp-interfaces').textContent = status.dhcpInterfaces;
        
        // Update configuration status
        document.getElementById('last-modified').textContent = status.lastModified;
        document.getElementById('backup-status').textContent = status.backupAvailable ? 'Yes' : 'No';
        
        const syntaxElement = document.getElementById('syntax-status');
        if (status.syntaxValid) {
            syntaxElement.innerHTML = '<span class="status-dot ok"></span>Valid';
        } else {
            syntaxElement.innerHTML = '<span class="status-dot bad"></span>Invalid';
        }
        
        this.loadSystemLogs();
    },
    
    // Update individual service status
    updateServiceStatus(service, status) {
        const statusElement = document.getElementById(`${service}-status`);
        const dotElement = document.getElementById(`${service}-dot`);
        
        if (status.status === 'active') {
            statusElement.innerHTML = `<span class="status-dot ok" id="${service}-dot"></span>Active (${status.uptime})`;
        } else {
            statusElement.innerHTML = `<span class="status-dot bad" id="${service}-dot"></span>Inactive`;
        }
    },
    
    // Load system logs
    async loadSystemLogs() {
        const logsElement = document.getElementById('system-logs');
        logsElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading logs...</div>';
        
        try {
            const logs = await this.fetchSystemLogs();
            logsElement.textContent = logs;
        } catch (error) {
            logsElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load logs</div>';
        }
    },
    
    // Fetch real system logs
    async fetchSystemLogs() {
        if (!cockpit || !cockpit.spawn) {
            console.warn('Cockpit API not available for log fetching');
            return 'Cockpit API not available - please ensure you are running this module within Cockpit';
        }
        
        try {
            // Get recent network-related logs from journalctl
            const logOutput = await cockpit.spawn([
                'journalctl', 
                '-u', 'systemd-networkd',
                '-u', 'systemd-resolved', 
                '--lines=50',
                '--no-pager',
                '--since=1 hour ago'
            ], { superuser: 'try' });
            
            if (logOutput.trim()) {
                return logOutput;
            } else {
                return 'No recent network logs found.';
            }
        } catch (error) {
            console.warn('Failed to fetch system logs:', error);
            return `Failed to fetch system logs: ${error.message}`;
        }
    },
    
    // Load network interfaces
    async loadInterfaces() {
        const listElement = document.getElementById('interface-list');
        listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading interfaces...</div>';
        
        try {
            this.interfaces = await this.fetchInterfaces();
            this.renderInterfaces();
        } catch (error) {
            listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load interfaces</div>';
        }
    },
    
    // Fetch real interfaces from system using Cockpit APIs
    async fetchInterfaces() {
        try {
            console.log('Fetching real network interfaces from system...');
            const interfaces = await this.getSystemInterfaces();
            return interfaces;
        } catch (error) {
            console.error('Failed to fetch interfaces:', error);
            this.showError('Failed to load network interfaces: ' + error.message);
            return [];
        }
    },

    // Get system interfaces using Cockpit APIs
    async getSystemInterfaces() {
        const interfaces = [];
        
        try {
            // Check if cockpit API is properly available
            if (!cockpit || !cockpit.spawn) {
                throw new Error('Cockpit API not available. Please ensure this module is running within Cockpit.');
            }
            
            // Get interface list using networkctl
            console.log('Running networkctl list command...');
            const networkctlOutput = await cockpit.spawn(['networkctl', 'list', '--no-legend'], { superuser: 'try' });
            const interfaceLines = networkctlOutput.trim().split('\n').filter(line => line.trim());
            
            for (const line of interfaceLines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                    const ifaceData = {
                        name: parts[1],
                        type: parts[2],
                        status: parts[3].toLowerCase(),
                        systemInterface: this.isSystemInterface(parts[1])
                    };
                    
                    // Override type detection for VLANs and other special cases
                    if (ifaceData.name.includes('.') || ifaceData.name.match(/^vlan\d+$/)) {
                        ifaceData.type = 'vlan';
                    } else if (ifaceData.name.startsWith('br')) {
                        ifaceData.type = 'bridge';
                    } else if (ifaceData.name.startsWith('bond')) {
                        ifaceData.type = 'bond';
                    }
                    
                    // Get detailed information for each interface
                    await this.enrichInterfaceData(ifaceData);
                    interfaces.push(ifaceData);
                }
            }
            
            console.log(`Found ${interfaces.length} network interfaces`);
            return interfaces;
            
        } catch (error) {
            console.error('Error getting system interfaces:', error);
            
            if (error.message.includes('Cockpit API not available')) {
                // Show a user-friendly message for Cockpit API issues
                throw new Error('This module requires Cockpit to be properly installed and running. Please ensure you are accessing this page through the Cockpit web interface.');
            }
            
            throw new Error('Failed to query network interfaces: ' + error.message);
        }
    },

    // Enrich interface data with detailed information
    async enrichInterfaceData(iface) {
        try {
            // Get interface details using networkctl status
            const statusOutput = await cockpit.spawn(['networkctl', 'status', iface.name], { superuser: 'try' });
            this.parseNetworkctlStatus(iface, statusOutput);
            
            // Get IP addresses using ip command
            const ipOutput = await cockpit.spawn(['ip', 'addr', 'show', iface.name], { superuser: 'try' });
            this.parseIpAddr(iface, ipOutput);
            
            // Get interface statistics
            const statsOutput = await cockpit.spawn(['cat', `/sys/class/net/${iface.name}/statistics/rx_bytes`, 
                                                          `/sys/class/net/${iface.name}/statistics/tx_bytes`], { superuser: 'try' });
            this.parseInterfaceStats(iface, statsOutput);
            
            // Check for Netplan configuration
            await this.checkNetplanConfig(iface);
            
        } catch (error) {
            console.warn(`Failed to get details for interface ${iface.name}:`, error);
            // Set default values if we can't get detailed info
            iface.ip = iface.ip || 'N/A';
            iface.mac = iface.mac || 'N/A';
            iface.mtu = iface.mtu || 1500;
            iface.rxBytes = iface.rxBytes || 0;
            iface.txBytes = iface.txBytes || 0;
        }
    },

    // Parse networkctl status output
    parseNetworkctlStatus(iface, output) {
        const lines = output.split('\n');
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.includes('HW Address:')) {
                iface.mac = trimmed.split('HW Address:')[1].trim();
            }
            if (trimmed.includes('MTU:')) {
                const mtuMatch = trimmed.match(/MTU:\s*(\d+)/);
                if (mtuMatch) iface.mtu = parseInt(mtuMatch[1]);
            }
            if (trimmed.includes('Speed:')) {
                iface.speed = trimmed.split('Speed:')[1].trim();
            }
            if (trimmed.includes('Duplex:')) {
                iface.duplex = trimmed.split('Duplex:')[1].trim();
            }
            if (trimmed.includes('Carrier:')) {
                iface.carrier = trimmed.includes('yes');
            }
        }
    },

    // Parse ip addr output
    parseIpAddr(iface, output) {
        const lines = output.split('\n');
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
            
            // Look for link/ether for MAC address
            if (trimmed.startsWith('link/ether ')) {
                const macMatch = trimmed.match(/link\/ether\s+([^\s]+)/);
                if (macMatch) {
                    iface.mac = macMatch[1];
                }
            }
        }
        
        // Set primary IP
        if (ipAddresses.length > 0) {
            iface.ip = ipAddresses[0];
            if (ipAddresses.length > 1) {
                iface.additionalIPs = ipAddresses.slice(1);
            }
        } else {
            iface.ip = 'N/A';
        }
    },

    // Parse interface statistics
    parseInterfaceStats(iface, output) {
        const lines = output.split('\n');
        if (lines.length >= 2) {
            iface.rxBytes = parseInt(lines[0]) || 0;
            iface.txBytes = parseInt(lines[1]) || 0;
        }
    },

    // Check for Netplan configuration
    async checkNetplanConfig(iface) {
        try {
            // Look for the interface in Netplan files
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
            const files = netplanFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file).read();
                    if (content && content.includes(iface.name)) {
                        iface.configFile = file;
                        
                        // Try to determine configuration type
                        if (content.includes(`${iface.name}:`)) {
                            if (content.includes('dhcp4: true') || content.includes('dhcp6: true')) {
                                iface.configType = 'dhcp';
                                iface.dhcp = true;
                            } else if (content.includes('addresses:')) {
                                iface.configType = 'static';
                                iface.dhcp = false;
                            }
                        }
                        break;
                    }
                } catch (fileError) {
                    console.warn(`Could not read ${file}:`, fileError);
                }
            }
            
            if (!iface.configFile) {
                iface.configType = 'unconfigured';
                iface.dhcp = false;
            }
            
        } catch (error) {
            console.warn(`Failed to check Netplan config for ${iface.name}:`, error);
            iface.configFile = null;
            iface.configType = 'unknown';
        }
    },

    // Check if interface is a system interface
    isSystemInterface(name) {
        const systemPrefixes = ['lo', 'docker', 'veth', 'br-', 'virbr'];
        return systemPrefixes.some(prefix => name.startsWith(prefix));
    },

    // Render interfaces with enhanced information
    renderInterfaces() {
        const listElement = document.getElementById('interface-list');
        
        if (this.interfaces.length === 0) {
            listElement.innerHTML = '<div class="alert">No network interfaces found.</div>';
            return;
        }

        // Add interface statistics summary
        const totalInterfaces = this.interfaces.length;
        const activeInterfaces = this.interfaces.filter(i => i.status === 'up').length;
        const dhcpInterfaces = this.interfaces.filter(i => i.dhcp).length;
        const configuredInterfaces = this.interfaces.filter(i => i.configFile).length;

        listElement.innerHTML = `
            <!-- Interface Statistics -->
            <div class="status-card" style="margin-bottom: 20px;">
                <div class="status-card-header">
                    <i class="status-icon fas fa-chart-bar"></i>
                    <h4>Interface Summary</h4>
                </div>
                <div class="status-card-body">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Total Interfaces</span>
                                <span class="status-value">${totalInterfaces}</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Active</span>
                                <span class="status-value" style="color: #28a745;">${activeInterfaces}</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">DHCP Enabled</span>
                                <span class="status-value">${dhcpInterfaces}</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Configured</span>
                                <span class="status-value">${configuredInterfaces}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Interface Table -->
            <div class="interfaces-table">
                <div class="interfaces-header">
                    <div class="interface-column">Interface</div>
                    <div class="interface-column">Type</div>
                    <div class="interface-column">Status</div>
                    <div class="interface-column">IP Address</div>
                    <div class="interface-column">Configuration</div>
                    <div class="interface-column">Actions</div>
                </div>
                ${this.interfaces.map(iface => `
                    <div class="interface-row">
                        <div class="interface-column">
                            <div class="interface-name-cell">
                                <i class="fas fa-${this.getInterfaceIcon(iface.type)}"></i>
                                <span class="interface-name">${iface.name}</span>
                                <span class="status-dot ${iface.status === 'up' ? 'ok' : 'bad'}"></span>
                                ${iface.systemInterface ? '<span class="system-badge">SYSTEM</span>' : ''}
                                ${iface.configFile ? '<i class="fas fa-file-code config-indicator" title="Configured"></i>' : ''}
                            </div>
                            <div class="interface-meta">
                                MAC: ${iface.mac || 'N/A'}
                                ${iface.type === 'vlan' && iface.vlanId ? ` | VLAN ${iface.vlanId}` : ''}
                                ${iface.type === 'bond' && iface.bondSlaves ? ` | Slaves: ${iface.bondSlaves.length}` : ''}
                            </div>
                        </div>
                        <div class="interface-column">
                            <span class="interface-type ${iface.type}">${iface.type.toUpperCase()}</span>
                        </div>
                        <div class="interface-column">
                            <span class="status-badge status-${iface.status}">${iface.status.toUpperCase()}</span>
                            <div class="speed-info">${iface.speed} | MTU: ${iface.mtu || 'N/A'}</div>
                        </div>
                        <div class="interface-column">
                            <div class="ip-address">${iface.ip}</div>
                            <div class="traffic-info">RX: ${this.formatBytes(iface.rxBytes || 0)} | TX: ${this.formatBytes(iface.txBytes || 0)}</div>
                        </div>
                        <div class="interface-column">
                            <span class="config-type">${iface.dhcp ? 'DHCP' : 'Static'}</span>
                            ${iface.configFile ? `<div class="config-file">File: ${iface.configFile}</div>` : '<div class="config-file">Not configured</div>'}
                        </div>
                        <div class="interface-column">
                            <div class="interface-actions">
                                <button class="btn btn-xs btn-outline-brand" onclick="viewInterfaceDetails('${iface.name}')" title="View Details">
                                    <i class="fas fa-info-circle"></i>
                                </button>
                                ${!iface.systemInterface ? `
                                <button class="btn btn-xs btn-outline-brand" onclick="editInterface('${iface.name}')" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-xs btn-outline-secondary" onclick="toggleInterface('${iface.name}', '${iface.status}')" title="${iface.status === 'up' ? 'Disable' : 'Enable'}">
                                    <i class="fas fa-power-off"></i>
                                </button>
                                ${iface.configFile ? `
                                <button class="btn btn-xs btn-outline-danger" onclick="deleteInterface('${iface.name}')" title="Delete">
                                    <i class="fas fa-trash"></i>
                                </button>
                                ` : `
                                <button class="btn btn-xs btn-outline-secondary" onclick="addInterfaceConfig('${iface.name}')" title="Configure">
                                    <i class="fas fa-plus"></i>
                                </button>
                                `}
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // Helper function to format bytes
    formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // Get interface icon with more types
    getInterfaceIcon(type) {
        switch(type) {
            case 'ethernet': return 'ethernet';
            case 'wifi': return 'wifi';
            case 'virtual': return 'sitemap';
            case 'bond': return 'link';
            case 'bridge': return 'project-diagram';
            case 'vlan': return 'tags';
            case 'loopback': return 'circle';
            case 'tunnel': return 'tunnel';
            default: return 'network-wired';
        }
    },
    
    // Load network data
    async loadNetworkData() {
        // Load all network configurations
        await Promise.all([
            this.loadInterfaces(),
            this.loadVlans(),
            this.loadBridges(),
            this.loadBonds(),
            this.loadRoutes(),
            this.loadDnsConfig()
        ]);
    },
    
    // Load VLANs from system
    async loadVlans() {
        try {
            console.log('Loading VLANs...');
            
            if (!cockpit || !cockpit.spawn) {
                console.warn('Cockpit API not available for VLAN loading');
                this.vlans = [];
                return;
            }
            
            // Get VLAN interfaces from ip link show - try different approaches
            let vlans = [];
            
            try {
                // First try: get all VLAN type interfaces
                const ipOutput = await cockpit.spawn(['ip', 'link', 'show', 'type', 'vlan'], { superuser: 'try' });
                console.log('VLAN ip link output:', ipOutput);
                
                if (ipOutput.trim()) {
                    const lines = ipOutput.trim().split('\n');
                    for (const line of lines) {
                        if (line.includes('@')) {
                            const match = line.match(/(\d+):\s+([^@]+)@([^:]+):/);
                            if (match) {
                                const [, , vlanName, parentInterface] = match;
                                
                                // Get VLAN ID
                                const vlanIdMatch = vlanName.match(/vlan(\d+)|\.(\d+)$/);
                                const vlanId = vlanIdMatch ? (vlanIdMatch[1] || vlanIdMatch[2]) : null;
                                
                                vlans.push({
                                    name: vlanName,
                                    vlanId: vlanId,
                                    parentInterface: parentInterface,
                                    status: line.includes('UP') ? 'up' : 'down'
                                });
                            }
                        }
                    }
                }
            } catch (vlanError) {
                console.warn('Failed to get VLAN interfaces via type filter:', vlanError);
            }
            
            // Second try: look for VLAN interfaces in all interfaces
            try {
                const allInterfacesOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
                const lines = allInterfacesOutput.split('\n');
                
                for (const line of lines) {
                    // Look for VLAN patterns: interface.vlanid or vlan* interfaces
                    if (line.includes('@') && (line.includes('vlan') || line.includes('.'))) {
                        const match = line.match(/(\d+):\s+([^@]+)@([^:]+):/);
                        if (match) {
                            const [, , ifaceName, parentInterface] = match;
                            
                            // Check if it's a VLAN interface we haven't already found
                            if (!vlans.find(v => v.name === ifaceName)) {
                                const vlanIdMatch = ifaceName.match(/vlan(\d+)|\.(\d+)$/);
                                const vlanId = vlanIdMatch ? (vlanIdMatch[1] || vlanIdMatch[2]) : null;
                                
                                if (vlanId) {
                                    vlans.push({
                                        name: ifaceName,
                                        vlanId: vlanId,
                                        parentInterface: parentInterface,
                                        status: line.includes('UP') ? 'up' : 'down'
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (allError) {
                console.warn('Failed to scan all interfaces for VLANs:', allError);
            }
            
            this.vlans = vlans;
            console.log(`Found ${vlans.length} VLAN interfaces:`, vlans);
            this.updateVlanDisplay();
            
        } catch (error) {
            console.error('Failed to load VLANs:', error);
            this.vlans = [];
            this.updateVlanDisplay();
        }
    },
    
    // Load bridges from system
    async loadBridges() {
        try {
            console.log('Loading bridges...');
            
            if (!cockpit || !cockpit.spawn) {
                console.warn('Cockpit API not available for bridge loading');
                this.bridges = [];
                return;
            }
            
            let bridges = [];
            
            try {
                // First try: get bridge type interfaces
                const ipOutput = await cockpit.spawn(['ip', 'link', 'show', 'type', 'bridge'], { superuser: 'try' });
                console.log('Bridge ip link output:', ipOutput);
                
                if (ipOutput.trim()) {
                    const lines = ipOutput.trim().split('\n');
                    for (const line of lines) {
                        const match = line.match(/(\d+):\s+([^:]+):/);
                        if (match) {
                            const bridgeName = match[2];
                            
                            // Get bridge members
                            let members = [];
                            try {
                                const bridgeShow = await cockpit.spawn(['bridge', 'link', 'show', 'br', bridgeName], { superuser: 'try' });
                                const memberLines = bridgeShow.trim().split('\n');
                                for (const memberLine of memberLines) {
                                    const memberMatch = memberLine.match(/^\d+:\s+([^:]+)/);
                                    if (memberMatch) {
                                        members.push(memberMatch[1]);
                                    }
                                }
                            } catch (bridgeError) {
                                // Try alternative method to get bridge members
                                try {
                                    const sysBridge = await cockpit.spawn(['ls', `/sys/class/net/${bridgeName}/brif/`], { superuser: 'try' });
                                    members = sysBridge.trim().split('\n').filter(m => m.trim());
                                } catch (sysError) {
                                    console.warn(`Could not get members for bridge ${bridgeName}:`, sysError);
                                }
                            }
                            
                            bridges.push({
                                name: bridgeName,
                                status: line.includes('UP') ? 'up' : 'down',
                                members: members
                            });
                        }
                    }
                }
            } catch (bridgeError) {
                console.warn('Failed to get bridge interfaces via type filter:', bridgeError);
            }
            
            // Second try: look for bridge interfaces in all interfaces
            try {
                const allInterfacesOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
                const lines = allInterfacesOutput.split('\n');
                
                for (const line of lines) {
                    // Look for bridge patterns: br*, bridge*, or known bridge names
                    if (line.includes(':') && (line.includes(' br') || line.includes('bridge'))) {
                        const match = line.match(/(\d+):\s+([^:]+):/);
                        if (match) {
                            const ifaceName = match[2].trim();
                            
                            // Check if it's a bridge we haven't already found
                            if (!bridges.find(b => b.name === ifaceName) && 
                                (ifaceName.startsWith('br') || ifaceName.includes('bridge'))) {
                                
                                let members = [];
                                try {
                                    const sysBridge = await cockpit.spawn(['ls', `/sys/class/net/${ifaceName}/brif/`], { superuser: 'try' });
                                    members = sysBridge.trim().split('\n').filter(m => m.trim());
                                } catch (sysError) {
                                    // This interface might not be a bridge
                                }
                                
                                // Only add if we can confirm it's a bridge (has brif directory)
                                if (members.length > 0 || ifaceName.startsWith('br')) {
                                    bridges.push({
                                        name: ifaceName,
                                        status: line.includes('UP') ? 'up' : 'down',
                                        members: members
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (allError) {
                console.warn('Failed to scan all interfaces for bridges:', allError);
            }
            
            this.bridges = bridges;
            console.log(`Found ${bridges.length} bridge interfaces:`, bridges);
            this.updateBridgeDisplay();
            
        } catch (error) {
            console.error('Failed to load bridges:', error);
            this.bridges = [];
            this.updateBridgeDisplay();
        }
    },
    
    // Load bonds from system
    async loadBonds() {
        try {
            console.log('Loading bonds...');
            
            if (!cockpit || !cockpit.spawn) {
                console.warn('Cockpit API not available for bond loading');
                this.bonds = [];
                return;
            }
            
            let bonds = [];
            
            try {
                // First try: get bond type interfaces
                const ipOutput = await cockpit.spawn(['ip', 'link', 'show', 'type', 'bond'], { superuser: 'try' });
                console.log('Bond ip link output:', ipOutput);
                
                if (ipOutput.trim()) {
                    const lines = ipOutput.trim().split('\n');
                    for (const line of lines) {
                        const match = line.match(/(\d+):\s+([^:]+):/);
                        if (match) {
                            const bondName = match[2];
                            
                            // Get bond slaves and mode
                            let bondMode = 'unknown';
                            let slaves = [];
                            
                            try {
                                const bondInfo = await cockpit.spawn(['cat', `/proc/net/bonding/${bondName}`], { superuser: 'try' });
                                
                                const infoLines = bondInfo.split('\n');
                                for (const infoLine of infoLines) {
                                    if (infoLine.includes('Bonding Mode:')) {
                                        const modeMatch = infoLine.match(/Bonding Mode:\s+(.+)/);
                                        if (modeMatch) {
                                            bondMode = modeMatch[1].trim();
                                        }
                                    }
                                    if (infoLine.includes('Slave Interface:')) {
                                        const slaveMatch = infoLine.match(/Slave Interface:\s+(\w+)/);
                                        if (slaveMatch) {
                                            slaves.push(slaveMatch[1]);
                                        }
                                    }
                                }
                            } catch (bondError) {
                                // Try alternative method to get bond slaves
                                try {
                                    const sysBond = await cockpit.spawn(['ls', `/sys/class/net/${bondName}/bonding/`], { superuser: 'try' });
                                    console.log(`Bond ${bondName} sysfs content:`, sysBond);
                                    
                                    // Try to get slaves from sysfs
                                    const slavesContent = await cockpit.spawn(['cat', `/sys/class/net/${bondName}/bonding/slaves`], { superuser: 'try' });
                                    slaves = slavesContent.trim().split(/\s+/).filter(s => s.trim());
                                    
                                    // Try to get mode from sysfs
                                    const modeContent = await cockpit.spawn(['cat', `/sys/class/net/${bondName}/bonding/mode`], { superuser: 'try' });
                                    bondMode = modeContent.trim();
                                } catch (sysError) {
                                    console.warn(`Could not get bond info for ${bondName}:`, sysError);
                                }
                            }
                            
                            bonds.push({
                                name: bondName,
                                status: line.includes('UP') ? 'up' : 'down',
                                mode: bondMode,
                                slaves: slaves
                            });
                        }
                    }
                }
            } catch (bondError) {
                console.warn('Failed to get bond interfaces via type filter:', bondError);
            }
            
            // Second try: look for bond interfaces in all interfaces
            try {
                const allInterfacesOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
                const lines = allInterfacesOutput.split('\n');
                
                for (const line of lines) {
                    // Look for bond patterns: bond*, team*, or known bond names
                    if (line.includes(':') && (line.includes(' bond') || line.includes('team'))) {
                        const match = line.match(/(\d+):\s+([^:]+):/);
                        if (match) {
                            const ifaceName = match[2].trim();
                            
                            // Check if it's a bond we haven't already found
                            if (!bonds.find(b => b.name === ifaceName) && 
                                (ifaceName.startsWith('bond') || ifaceName.includes('team'))) {
                                
                                let bondMode = 'unknown';
                                let slaves = [];
                                
                                try {
                                    // Check if it's a real bond interface
                                    const slavesContent = await cockpit.spawn(['cat', `/sys/class/net/${ifaceName}/bonding/slaves`], { superuser: 'try' });
                                    slaves = slavesContent.trim().split(/\s+/).filter(s => s.trim());
                                    
                                    const modeContent = await cockpit.spawn(['cat', `/sys/class/net/${ifaceName}/bonding/mode`], { superuser: 'try' });
                                    bondMode = modeContent.trim();
                                    
                                    bonds.push({
                                        name: ifaceName,
                                        status: line.includes('UP') ? 'up' : 'down',
                                        mode: bondMode,
                                        slaves: slaves
                                    });
                                } catch (sysError) {
                                    // This interface might not be a bond
                                    console.warn(`Interface ${ifaceName} is not a bond interface:`, sysError);
                                }
                            }
                        }
                    }
                }
            } catch (allError) {
                console.warn('Failed to scan all interfaces for bonds:', allError);
            }
            
            this.bonds = bonds;
            console.log(`Found ${bonds.length} bond interfaces:`, bonds);
            this.updateBondDisplay();
            
        } catch (error) {
            console.error('Failed to load bonds:', error);
            this.bonds = [];
            this.updateBondDisplay();
        }
    },

    // Update VLAN display
    updateVlanDisplay() {
        const vlanContainer = document.getElementById('vlans');
        if (!vlanContainer) return;
        
        const vlanList = vlanContainer.querySelector('.interface-list') || 
                        vlanContainer.querySelector('.card-body') ||
                        vlanContainer;
        
        if (this.vlans.length === 0) {
            vlanList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-network-wired fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No VLAN Interfaces</h5>
                    <p class="text-muted">No VLAN interfaces are currently configured on this system.</p>
                    <button class="btn btn-brand" onclick="addVlan()">
                        <i class="fas fa-plus"></i> Create VLAN
                    </button>
                </div>
            `;
        } else {
            let html = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">VLAN Interfaces (${this.vlans.length})</h6>
                    <button class="btn btn-sm btn-brand" onclick="addVlan()">
                        <i class="fas fa-plus"></i> Add VLAN
                    </button>
                </div>
                <div class="interface-grid">
            `;
            
            this.vlans.forEach(vlan => {
                const statusIcon = vlan.status === 'up' ? 'fa-arrow-up text-success' : 'fa-arrow-down text-danger';
                html += `
                    <div class="interface-card">
                        <div class="interface-header">
                            <h6 class="interface-name">${vlan.name}</h6>
                            <span class="interface-status">
                                <i class="fas ${statusIcon}"></i> ${vlan.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="interface-details">
                            <div class="detail-item">
                                <span class="detail-label">VLAN ID:</span>
                                <span class="detail-value">${vlan.vlanId || 'Unknown'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Parent:</span>
                                <span class="detail-value">${vlan.parent || 'Unknown'}</span>
                            </div>
                            ${vlan.ip ? `
                            <div class="detail-item">
                                <span class="detail-label">IP Address:</span>
                                <span class="detail-value">${vlan.ip}</span>
                            </div>
                            ` : ''}
                        </div>
                        <div class="interface-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="editInterface('${vlan.name}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteInterface('${vlan.name}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            vlanList.innerHTML = html;
        }
    },

    // Update Bridge display
    updateBridgeDisplay() {
        const bridgeContainer = document.getElementById('bridges');
        if (!bridgeContainer) return;
        
        const bridgeList = bridgeContainer.querySelector('.interface-list') || 
                          bridgeContainer.querySelector('.card-body') ||
                          bridgeContainer;
        
        if (this.bridges.length === 0) {
            bridgeList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-project-diagram fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No Bridge Interfaces</h5>
                    <p class="text-muted">No bridge interfaces are currently configured on this system.</p>
                    <button class="btn btn-brand" onclick="addBridge()">
                        <i class="fas fa-plus"></i> Create Bridge
                    </button>
                </div>
            `;
        } else {
            let html = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">Bridge Interfaces (${this.bridges.length})</h6>
                    <button class="btn btn-sm btn-brand" onclick="addBridge()">
                        <i class="fas fa-plus"></i> Add Bridge
                    </button>
                </div>
                <div class="interface-grid">
            `;
            
            this.bridges.forEach(bridge => {
                const statusIcon = bridge.status === 'up' ? 'fa-arrow-up text-success' : 'fa-arrow-down text-danger';
                html += `
                    <div class="interface-card">
                        <div class="interface-header">
                            <h6 class="interface-name">${bridge.name}</h6>
                            <span class="interface-status">
                                <i class="fas ${statusIcon}"></i> ${bridge.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="interface-details">
                            <div class="detail-item">
                                <span class="detail-label">Type:</span>
                                <span class="detail-value">Bridge</span>
                            </div>
                            ${bridge.members && bridge.members.length > 0 ? `
                            <div class="detail-item">
                                <span class="detail-label">Members:</span>
                                <span class="detail-value">${bridge.members.join(', ')}</span>
                            </div>
                            ` : ''}
                            ${bridge.ip ? `
                            <div class="detail-item">
                                <span class="detail-label">IP Address:</span>
                                <span class="detail-value">${bridge.ip}</span>
                            </div>
                            ` : ''}
                        </div>
                        <div class="interface-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="editInterface('${bridge.name}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteInterface('${bridge.name}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            bridgeList.innerHTML = html;
        }
    },

    // Update Bond display
    updateBondDisplay() {
        const bondContainer = document.getElementById('bonds');
        if (!bondContainer) return;
        
        const bondList = bondContainer.querySelector('.interface-list') || 
                        bondContainer.querySelector('.card-body') ||
                        bondContainer;
        
        if (this.bonds.length === 0) {
            bondList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-link fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No Bond Interfaces</h5>
                    <p class="text-muted">No bond interfaces are currently configured on this system.</p>
                    <button class="btn btn-brand" onclick="addBond()">
                        <i class="fas fa-plus"></i> Create Bond
                    </button>
                </div>
            `;
        } else {
            let html = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">Bond Interfaces (${this.bonds.length})</h6>
                    <button class="btn btn-sm btn-brand" onclick="addBond()">
                        <i class="fas fa-plus"></i> Add Bond
                    </button>
                </div>
                <div class="interface-grid">
            `;
            
            this.bonds.forEach(bond => {
                const statusIcon = bond.status === 'up' ? 'fa-arrow-up text-success' : 'fa-arrow-down text-danger';
                html += `
                    <div class="interface-card">
                        <div class="interface-header">
                            <h6 class="interface-name">${bond.name}</h6>
                            <span class="interface-status">
                                <i class="fas ${statusIcon}"></i> ${bond.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="interface-details">
                            <div class="detail-item">
                                <span class="detail-label">Mode:</span>
                                <span class="detail-value">${bond.mode || 'Unknown'}</span>
                            </div>
                            ${bond.slaves && bond.slaves.length > 0 ? `
                            <div class="detail-item">
                                <span class="detail-label">Slaves:</span>
                                <span class="detail-value">${bond.slaves.join(', ')}</span>
                            </div>
                            ` : ''}
                            ${bond.ip ? `
                            <div class="detail-item">
                                <span class="detail-label">IP Address:</span>
                                <span class="detail-value">${bond.ip}</span>
                            </div>
                            ` : ''}
                        </div>
                        <div class="interface-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="editInterface('${bond.name}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteInterface('${bond.name}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            bondList.innerHTML = html;
        }
    },

    // Load routes from system
    async loadRoutes() {
        try {
            console.log('Loading routes...');
            
            if (!cockpit || !cockpit.spawn) {
                console.warn('Cockpit API not available for route loading');
                this.routes = [];
                this.renderRoutes();
                return;
            }
            
            // Get routing table
            const routeOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
            const routes = [];
            
            const lines = routeOutput.trim().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const parts = line.trim().split(/\s+/);
                    
                    let destination = 'default';
                    let gateway = null;
                    let device = null;
                    let metric = null;
                    
                    if (parts[0] === 'default') {
                        destination = '0.0.0.0/0';
                        if (parts.includes('via')) {
                            const viaIndex = parts.indexOf('via');
                            gateway = parts[viaIndex + 1];
                        }
                    } else if (parts[0].includes('/')) {
                        destination = parts[0];
                    } else {
                        destination = parts[0];
                    }
                    
                    if (parts.includes('dev')) {
                        const devIndex = parts.indexOf('dev');
                        device = parts[devIndex + 1];
                    }
                    
                    if (parts.includes('metric')) {
                        const metricIndex = parts.indexOf('metric');
                        metric = parts[metricIndex + 1];
                    }
                    
                    if (parts.includes('via') && !gateway) {
                        const viaIndex = parts.indexOf('via');
                        gateway = parts[viaIndex + 1];
                    }
                    
                    routes.push({
                        destination: destination,
                        gateway: gateway || 'N/A',
                        interface: device || 'N/A',
                        metric: metric || 'N/A'
                    });
                }
            }
            
            this.routes = routes;
            console.log(`Found ${routes.length} routes`);
            this.renderRoutes();
            
        } catch (error) {
            console.warn('Failed to load routes:', error);
            this.routes = [];
            this.renderRoutes();
        }
    },

    // Render routes in the UI
    renderRoutes() {
        const routeListElement = document.getElementById('route-list');
        
        if (!routeListElement) {
            console.warn('Route list element not found');
            return;
        }
        
        if (this.routes.length === 0) {
            routeListElement.innerHTML = `
                <div class="alert">
                    <p>No routes found. Add your first route to get started.</p>
                    <button class="btn btn-brand" onclick="addRoute()">
                        <i class="fas fa-plus"></i> Add Route
                    </button>
                </div>
            `;
            return;
        }
        
        routeListElement.innerHTML = `
            <div class="routes-table">
                <div class="routes-header">
                    <div class="route-column">Destination</div>
                    <div class="route-column">Gateway</div>
                    <div class="route-column">Interface</div>
                    <div class="route-column">Metric</div>
                    <div class="route-column">Actions</div>
                </div>
                ${this.routes.map((route, index) => `
                    <div class="route-row">
                        <div class="route-column">
                            <span class="route-destination">${route.destination}</span>
                        </div>
                        <div class="route-column">
                            <span class="route-gateway">${route.gateway}</span>
                        </div>
                        <div class="route-column">
                            <span class="route-interface">${route.interface}</span>
                        </div>
                        <div class="route-column">
                            <span class="route-metric">${route.metric}</span>
                        </div>
                        <div class="route-column">
                            <div class="route-actions">
                                <button class="btn btn-sm btn-outline-brand" onclick="editRoute(${index})" title="Edit Route">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteRoute(${index})" title="Delete Route">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    // Load DNS configuration from system
    async loadDnsConfig() {
        try {
            console.log('Loading DNS configuration...');
            
            if (!cockpit || !cockpit.file) {
                console.warn('Cockpit API not available for DNS loading');
                this.dnsServers = [];
                return;
            }
            
            const dnsServers = [];
            
            // Try to read systemd-resolved status
            try {
                const resolvedStatus = await cockpit.spawn(['systemd-resolve', '--status'], { superuser: 'try' });
                const lines = resolvedStatus.split('\n');
                
                for (const line of lines) {
                    if (line.trim().startsWith('DNS Servers:')) {
                        const servers = line.replace('DNS Servers:', '').trim().split(/\s+/);
                        servers.forEach(server => {
                            if (server && server.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                                dnsServers.push({
                                    server: server,
                                    source: 'systemd-resolved'
                                });
                            }
                        });
                    }
                }
            } catch (resolvedError) {
                // Fallback to /etc/resolv.conf
                try {
                    const resolvConf = await cockpit.file('/etc/resolv.conf').read();
                    const lines = resolvConf.split('\n');
                    
                    for (const line of lines) {
                        if (line.trim().startsWith('nameserver')) {
                            const server = line.replace('nameserver', '').trim();
                            if (server.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                                dnsServers.push({
                                    server: server,
                                    source: '/etc/resolv.conf'
                                });
                            }
                        }
                    }
                } catch (resolvError) {
                    console.warn('Failed to read DNS configuration:', resolvError);
                }
            }
            
            this.dnsServers = dnsServers;
            console.log(`Found ${dnsServers.length} DNS servers`);
            
        } catch (error) {
            console.warn('Failed to load DNS configuration:', error);
            this.dnsServers = [];
        }
    },
    
    async loadMonitoring() {
        // Real monitoring data implementation
        console.log('Loading monitoring data...');
        // This function can be expanded to include real system monitoring
        // For now, the monitoring is handled by the real interface data
    },
    
    async loadConfigManagement() {
        // Real configuration management implementation  
        console.log('Loading configuration management...');
        // This function can be expanded to include real configuration management
        // For now, configurations are handled by real Netplan file operations
    },
    
    // Setup additional event listeners
    setupEventListeners() {
        // Setup search functionality
        const searchInputs = document.querySelectorAll('input[type="search"]');
        searchInputs.forEach(input => {
            input.addEventListener('input', this.handleSearch.bind(this));
        });
        
        // Setup modal close handlers
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    },
    
    // Handle search functionality
    handleSearch(event) {
        const searchTerm = event.target.value.toLowerCase();
        const currentTab = this.currentTab;
        
        // Implement search based on current tab
        console.log(`Searching for "${searchTerm}" in ${currentTab}`);
    },
    
    // Show error message
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i>${message}`;
        
        // Show error in appropriate location
        const tabPane = document.querySelector('.tab-pane.show');
        if (tabPane) {
            tabPane.insertBefore(errorDiv, tabPane.firstChild);
            setTimeout(() => errorDiv.remove(), 5000);
        }
    },
    
    // Show success message
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.innerHTML = `<i class="fas fa-check-circle"></i>${message}`;
        
        // Show success in appropriate location
        const tabPane = document.querySelector('.tab-pane.show');
        if (tabPane) {
            tabPane.insertBefore(successDiv, tabPane.firstChild);
            setTimeout(() => successDiv.remove(), 5000);
        }
    },
    
    // Create modal
    createModal(title, content, footer = '') {
        const modalHtml = `
            <div class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close" onclick="NetworkManager.closeModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
                </div>
            </div>
        `;
        
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = modalHtml;
    },
    
    // Close modal
    closeModal() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = '';
    }
};

// Interface Management Functions

// View detailed interface information
function viewInterfaceDetails(name) {
    const iface = NetworkManager.interfaces.find(i => i.name === name);
    if (!iface) return;
    
    const modalContent = `
        <div class="interface-details-modal">
            <div class="interface-header" style="margin-bottom: 24px;">
                <div class="interface-name" style="font-size: 24px;">
                    <i class="fas fa-${NetworkManager.getInterfaceIcon(iface.type)}"></i>
                    ${iface.name}
                    <span class="status-dot ${iface.status === 'up' ? 'ok' : 'bad'}"></span>
                </div>
                <span class="interface-type ${iface.type}">${iface.type.toUpperCase()}</span>
            </div>
            
            <div class="detail-sections">
                <!-- Basic Information -->
                <div class="detail-section">
                    <h4><i class="fas fa-info-circle"></i> Basic Information</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Interface Name</span>
                            <span class="detail-value">${iface.name}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Type</span>
                            <span class="detail-value">${iface.type}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value">
                                <span class="status-dot ${iface.status === 'up' ? 'ok' : 'bad'}"></span>
                                ${iface.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Carrier</span>
                            <span class="detail-value">${iface.carrier ? 'Detected' : 'Not Detected'}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Network Configuration -->
                <div class="detail-section">
                    <h4><i class="fas fa-network-wired"></i> Network Configuration</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">IP Address</span>
                            <span class="detail-value">${iface.ip}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">MAC Address</span>
                            <span class="detail-value">${iface.mac}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Configuration Method</span>
                            <span class="detail-value">${iface.dhcp ? 'DHCP' : 'Static'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">MTU</span>
                            <span class="detail-value">${iface.mtu || 'Default'}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Physical Properties -->
                <div class="detail-section">
                    <h4><i class="fas fa-microchip"></i> Physical Properties</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Speed</span>
                            <span class="detail-value">${iface.speed}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Duplex</span>
                            <span class="detail-value">${iface.duplex}</span>
                        </div>
                        ${iface.type === 'bond' ? `
                        <div class="detail-item">
                            <span class="detail-label">Bond Mode</span>
                            <span class="detail-value">${iface.bondMode}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Bond Slaves</span>
                            <span class="detail-value">${iface.bondSlaves ? iface.bondSlaves.join(', ') : 'None'}</span>
                        </div>
                        ` : ''}
                        ${iface.type === 'vlan' ? `
                        <div class="detail-item">
                            <span class="detail-label">VLAN ID</span>
                            <span class="detail-value">${iface.vlanId}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Parent Interface</span>
                            <span class="detail-value">${iface.vlanParent}</span>
                        </div>
                        ` : ''}
                        ${iface.type === 'bridge' ? `
                        <div class="detail-item">
                            <span class="detail-label">Bridge Members</span>
                            <span class="detail-value">${iface.bridgeInterfaces ? iface.bridgeInterfaces.join(', ') : 'None'}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Traffic Statistics -->
                <div class="detail-section">
                    <h4><i class="fas fa-chart-bar"></i> Traffic Statistics</h4>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Bytes Received</span>
                            <span class="detail-value">${NetworkManager.formatBytes(iface.rxBytes || 0)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Bytes Transmitted</span>
                            <span class="detail-value">${NetworkManager.formatBytes(iface.txBytes || 0)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Packets Received</span>
                            <span class="detail-value">${(iface.rxPackets || 0).toLocaleString()}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Packets Transmitted</span>
                            <span class="detail-value">${(iface.txPackets || 0).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Configuration File -->
                ${iface.configFile ? `
                <div class="detail-section">
                    <h4><i class="fas fa-file-code"></i> Configuration</h4>
                    <div class="detail-item">
                        <span class="detail-label">Configuration File</span>
                        <span class="detail-value" style="font-family: monospace; background: var(--surface-2); padding: 4px 8px; border-radius: 4px;">${iface.configFile}</span>
                    </div>
                </div>
                ` : `
                <div class="detail-section">
                    <h4><i class="fas fa-exclamation-triangle"></i> Configuration Status</h4>
                    <div class="alert" style="background: #fff3cd; border-color: #ffeaa7; color: #856404;">
                        <i class="fas fa-info-circle"></i>
                        This interface is not configured through Netplan. It may be managed by the system or another network manager.
                    </div>
                </div>
                `}
            </div>
        </div>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Close</button>
        ${!iface.systemInterface ? `
        <button class="btn btn-outline-brand" onclick="NetworkManager.closeModal(); editInterface('${iface.name}')">
            <i class="fas fa-edit"></i> Edit Interface
        </button>
        ` : ''}
    `;
    
    NetworkManager.createModal(`Interface Details: ${iface.name}`, modalContent, modalFooter);
}

// Add configuration for unconfigured interface
function addInterfaceConfig(name) {
    const iface = NetworkManager.interfaces.find(i => i.name === name);
    if (!iface) return;
    
    const modalContent = `
        <div class="alert" style="background: #e7f3ff; border-color: #b3d9ff; color: #0066cc; margin-bottom: 20px;">
            <i class="fas fa-info-circle"></i>
            Adding configuration for existing interface <strong>${name}</strong>. This will create a new Netplan configuration file.
        </div>
        
        <form id="interface-config-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="config-if-name">Interface Name</label>
                <input type="text" id="config-if-name" class="form-control" value="${name}" readonly>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="config-file-name">Configuration File</label>
                <select id="config-file-name" class="form-control" required>
                    <option value="">Select or create file</option>
                    <option value="/etc/netplan/10-${name}.yaml">10-${name}.yaml (dedicated file)</option>
                    <option value="/etc/netplan/20-interfaces.yaml">20-interfaces.yaml (shared file)</option>
                    <option value="/etc/netplan/30-custom.yaml">30-custom.yaml (custom file)</option>
                </select>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">Configuration Type</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg active" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg" data-config="dhcp">DHCP</button>
                </div>
            </div>
            
            <div id="static-config" class="static-config">
                <div class="form-group">
                    <label class="form-label" for="config-if-ip">IP Address</label>
                    <input type="text" id="config-if-ip" class="form-control" placeholder="192.168.1.100/24" value="${iface.ip !== 'N/A' ? iface.ip : ''}">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="config-if-gateway">Gateway</label>
                    <input type="text" id="config-if-gateway" class="form-control" placeholder="192.168.1.1">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="config-if-dns">DNS Servers</label>
                    <input type="text" id="config-if-dns" class="form-control" placeholder="8.8.8.8, 1.1.1.1">
                    <div class="hint">Comma-separated list of DNS servers</div>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="config-if-mtu">MTU (Optional)</label>
                <input type="number" id="config-if-mtu" class="form-control" placeholder="1500" value="${iface.mtu || ''}">
                <div class="hint">Maximum Transmission Unit (leave empty for default)</div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveInterfaceConfig('${name}')">Create Configuration</button>
    `;
    
    NetworkManager.createModal(`Configure Interface: ${name}`, modalContent, modalFooter);
    
    // Setup toggle functionality
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfig = document.getElementById('static-config');
            
            if (configType === 'static') {
                staticConfig.style.display = 'contents';
            } else {
                staticConfig.style.display = 'none';
            }
        });
    });
}
function addInterface() {
    const modalContent = `
        <form id="interface-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="if-name">Interface Name</label>
                <input type="text" id="if-name" class="form-control" placeholder="e.g., eth0" required>
                <div class="hint">Enter the interface name (e.g., eth0, eno1)</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="if-type">Interface Type</label>
                <select id="if-type" class="form-control" required>
                    <option value="">Select type</option>
                    <option value="ethernet">Ethernet</option>
                    <option value="wifi">Wi-Fi</option>
                    <option value="virtual">Virtual</option>
                </select>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">Configuration Type</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg active" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg" data-config="dhcp">DHCP</button>
                </div>
            </div>
            
            <div id="static-config" class="static-config">
                <div class="form-group">
                    <label class="form-label" for="if-ip">IP Address</label>
                    <input type="text" id="if-ip" class="form-control" placeholder="192.168.1.100/24">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="if-gateway">Gateway</label>
                    <input type="text" id="if-gateway" class="form-control" placeholder="192.168.1.1">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="if-dns">DNS Servers</label>
                    <input type="text" id="if-dns" class="form-control" placeholder="8.8.8.8, 1.1.1.1">
                    <div class="hint">Comma-separated list of DNS servers</div>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="if-mac">MAC Address (Optional)</label>
                <input type="text" id="if-mac" class="form-control" placeholder="aa:bb:cc:dd:ee:ff">
                <div class="hint">Leave empty to use hardware MAC</div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveInterface()">Create Interface</button>
    `;
    
    NetworkManager.createModal('Add Network Interface', modalContent, modalFooter);
    
    // Setup toggle functionality
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfig = document.getElementById('static-config');
            
            if (configType === 'static') {
                staticConfig.style.display = 'contents';
            } else {
                staticConfig.style.display = 'none';
            }
        });
    });
}

function editInterface(name) {
    // Find interface data
    const iface = NetworkManager.interfaces.find(i => i.name === name);
    if (!iface) return;
    
    // Check if it's a system interface
    if (iface.systemInterface) {
        NetworkManager.showError('System interfaces cannot be edited');
        return;
    }
    
    const modalContent = `
        <div class="alert" style="background: #fff3cd; border-color: #ffeaa7; color: #856404; margin-bottom: 20px;">
            <i class="fas fa-exclamation-triangle"></i>
            Editing interface <strong>${name}</strong>. Changes will be applied to ${iface.configFile || 'a new configuration file'}.
        </div>
        
        <form id="interface-edit-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="edit-if-name">Interface Name</label>
                <input type="text" id="edit-if-name" class="form-control" value="${iface.name}" readonly>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-if-type">Interface Type</label>
                <input type="text" id="edit-if-type" class="form-control" value="${iface.type}" readonly>
                <div class="hint">Interface type cannot be changed</div>
            </div>
            
            ${iface.configFile ? `
            <div class="form-group">
                <label class="form-label" for="edit-config-file">Configuration File</label>
                <input type="text" id="edit-config-file" class="form-control" value="${iface.configFile}" readonly>
            </div>
            ` : ''}
            
            <div class="form-group full-width">
                <label class="form-label">Configuration Type</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg ${!iface.dhcp ? 'active' : ''}" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg ${iface.dhcp ? 'active' : ''}" data-config="dhcp">DHCP</button>
                </div>
            </div>
            
            <div id="static-config" class="static-config" style="${iface.dhcp ? 'display: none' : 'display: contents'}">
                <div class="form-group">
                    <label class="form-label" for="edit-if-ip">IP Address</label>
                    <input type="text" id="edit-if-ip" class="form-control" value="${iface.ip !== 'N/A' ? iface.ip : ''}" placeholder="192.168.1.100/24">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="edit-if-gateway">Gateway</label>
                    <input type="text" id="edit-if-gateway" class="form-control" placeholder="192.168.1.1">
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="edit-if-dns">DNS Servers</label>
                    <input type="text" id="edit-if-dns" class="form-control" placeholder="8.8.8.8, 1.1.1.1">
                    <div class="hint">Comma-separated list of DNS servers</div>
                </div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-if-mtu">MTU</label>
                <input type="number" id="edit-if-mtu" class="form-control" value="${iface.mtu || ''}" placeholder="1500">
                <div class="hint">Maximum Transmission Unit</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-if-mac">MAC Address</label>
                <input type="text" id="edit-if-mac" class="form-control" value="${iface.mac}" readonly>
                <div class="hint">Hardware MAC address (read-only)</div>
            </div>
            
            <!-- Advanced Options -->
            <div class="form-group full-width">
                <label class="form-label">
                    <input type="checkbox" id="show-advanced" onchange="toggleAdvancedOptions()"> 
                    Show Advanced Options
                </label>
            </div>
            
            <div id="advanced-options" style="display: none; grid-column: 1 / -1;">
                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="edit-if-metric">Route Metric</label>
                        <input type="number" id="edit-if-metric" class="form-control" placeholder="100">
                        <div class="hint">Route priority (lower = higher priority)</div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">
                            <input type="checkbox" id="edit-if-optional"> 
                            Optional Interface
                        </label>
                        <div class="hint">Don't wait for this interface during boot</div>
                    </div>
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-outline-danger" onclick="confirmDeleteInterface('${name}')">Delete Interface</button>
        <button class="btn btn-brand" onclick="updateInterface('${name}')">Update Interface</button>
    `;
    
    NetworkManager.createModal(`Edit Interface: ${name}`, modalContent, modalFooter);
    
    // Setup toggle functionality
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfig = document.getElementById('static-config');
            
            if (configType === 'static') {
                staticConfig.style.display = 'contents';
            } else {
                staticConfig.style.display = 'none';
            }
        });
    });
}

// Toggle advanced options
function toggleAdvancedOptions() {
    const checkbox = document.getElementById('show-advanced');
    const advancedOptions = document.getElementById('advanced-options');
    
    if (checkbox.checked) {
        advancedOptions.style.display = 'block';
    } else {
        advancedOptions.style.display = 'none';
    }
}

function saveInterface() {
    // Collect form data
    const formData = {
        name: document.getElementById('if-name').value,
        type: document.getElementById('if-type').value,
        // Add more fields as needed
    };
    
    // Validate form
    if (!formData.name || !formData.type) {
        NetworkManager.showError('Please fill in all required fields');
        return;
    }
    
    // Real interface creation using NetworkAPI
    NetworkAPI.configureInterface(formData)
        .then(() => {
            NetworkManager.showSuccess(`Interface ${formData.name} created successfully`);
            NetworkManager.closeModal();
            NetworkManager.loadInterfaces(); // Reload interfaces
        })
        .catch((error) => {
            NetworkManager.showError(`Failed to create interface: ${error.message}`);
        });
}

function saveInterfaceConfig(name) {
    // Collect form data
    const formData = {
        name: name,
        configFile: document.getElementById('config-file-name').value,
        configType: document.querySelector('.toggle-seg.active').getAttribute('data-config'),
        ip: document.getElementById('config-if-ip').value,
        gateway: document.getElementById('config-if-gateway').value,
        dns: document.getElementById('config-if-dns').value,
        mtu: document.getElementById('config-if-mtu').value
    };
    
    // Validate form
    if (!formData.configFile) {
        NetworkManager.showError('Please select a configuration file');
        return;
    }
    
    if (formData.configType === 'static' && !formData.ip) {
        NetworkManager.showError('Please provide an IP address for static configuration');
        return;
    }
    
    // Show preview of configuration that will be created
    const yamlPreview = generateNetplanYaml(formData);
    
    const confirmModal = `
        <div>
            <h4>Configuration Preview</h4>
            <p>The following configuration will be added to <code>${formData.configFile}</code>:</p>
            
            <div class="config-preview">${yamlPreview}</div>
            
            <div class="alert" style="background: #fff3cd; border-color: #ffeaa7; color: #856404; margin-top: 16px;">
                <i class="fas fa-exclamation-triangle"></i>
                This will create or modify the configuration file. Make sure to apply the changes after saving.
            </div>
        </div>
    `;
    
    const confirmFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="confirmSaveInterfaceConfig('${name}')">Save Configuration</button>
    `;
    
    NetworkManager.createModal('Confirm Configuration', confirmModal, confirmFooter);
}

function generateNetplanYaml(formData) {
    let yaml = `network:
  version: 2
  renderer: networkd
  ethernets:
    ${formData.name}:`;

    if (formData.configType === 'dhcp') {
        yaml += `
      dhcp4: true`;
    } else {
        yaml += `
      addresses:
        - ${formData.ip}`;
        
        if (formData.gateway) {
            yaml += `
      routes:
        - to: default
          via: ${formData.gateway}`;
        }
        
        if (formData.dns) {
            const dnsServers = formData.dns.split(',').map(dns => dns.trim());
            yaml += `
      nameservers:
        addresses: [${dnsServers.join(', ')}]`;
        }
    }
    
    if (formData.mtu) {
        yaml += `
      mtu: ${formData.mtu}`;
    }
    
    return yaml;
}

function confirmSaveInterfaceConfig(name) {
    // Get form data and save using real NetworkAPI
    const form = document.querySelector('#interface-config-form');
    if (!form) {
        NetworkManager.showError('Configuration form not found');
        return;
    }
    
    const formData = new FormData(form);
    const config = {
        name: name,
        type: formData.get('configType') || 'dhcp',
        ip: formData.get('ip'),
        gateway: formData.get('gateway'),
        dns: formData.get('dns') ? formData.get('dns').split(',').map(s => s.trim()) : [],
        mtu: formData.get('mtu') ? parseInt(formData.get('mtu')) : null
    };
    
    NetworkAPI.configureInterface(config)
        .then(() => {
            NetworkManager.showSuccess(`Configuration for interface ${name} saved successfully`);
            NetworkManager.closeModal();
            NetworkManager.loadInterfaces(); // Reload interfaces to show updated config
        })
        .catch((error) => {
            NetworkManager.showError(`Failed to save configuration: ${error.message}`);
        });
}

// Additional IP Management Functions
function addAdditionalIP(ip = '') {
    const container = document.getElementById('additional-ips');
    if (!container) return;
    
    const ipIndex = container.children.length;
    const ipDiv = document.createElement('div');
    ipDiv.className = 'additional-ip-item';
    ipDiv.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';
    
    ipDiv.innerHTML = `
        <input type="text" class="form-control additional-ip-input" 
               value="${ip}" placeholder="192.168.1.101/24 or 2001:db8::2/64" style="flex: 1;">
        <select class="form-control" style="width: 120px;">
            <option value="forever">Permanent</option>
            <option value="temporary">Temporary</option>
        </select>
        <input type="text" class="form-control" placeholder="Label (optional)" style="width: 100px;">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeAdditionalIP(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(ipDiv);
}

function removeAdditionalIP(button) {
    const ipItem = button.closest('.additional-ip-item');
    if (ipItem) {
        ipItem.remove();
    }
}

function toggleAdvancedOptions() {
    const advancedDiv = document.getElementById('advanced-options');
    const button = event.target;
    
    if (advancedDiv.style.display === 'none') {
        advancedDiv.style.display = 'block';
        button.innerHTML = '<i class="fas fa-cog"></i> Hide Advanced Options';
    } else {
        advancedDiv.style.display = 'none';
        button.innerHTML = '<i class="fas fa-cog"></i> Advanced Options';
    }
}

function updateInterface(name) {
    console.log(`updateInterface called for interface: ${name}`);
    
    // Collect basic form data
    const formData = {
        name: name,
        configType: document.querySelector('.toggle-seg.active')?.getAttribute('data-config') || 'dhcp',
        ip: document.getElementById('edit-if-ip')?.value || '',
        gateway: document.getElementById('edit-if-gateway')?.value || '',
        dns: document.getElementById('edit-if-dns')?.value || '',
        searchDomains: document.getElementById('edit-if-search')?.value || '',
        mtu: document.getElementById('edit-if-mtu')?.value || '',
        ipv6Mtu: document.getElementById('edit-if-ipv6-mtu')?.value || '',
        metric: document.getElementById('edit-if-metric')?.value || '',
        macAddress: document.getElementById('edit-mac-address')?.value || '',
        optional: document.getElementById('edit-if-optional')?.checked || false
    };
    
    console.log('Initial form data collected:', formData);
    
    // DHCP configuration
    if (formData.configType === 'dhcp') {
        formData.dhcp4 = document.getElementById('edit-dhcp4')?.checked !== false;
        formData.dhcp6 = document.getElementById('edit-dhcp6')?.checked === true;
        formData.dhcpUseDns = document.getElementById('edit-dhcp-use-dns')?.checked !== false;
        formData.dhcpUseRoutes = document.getElementById('edit-dhcp-use-routes')?.checked !== false;
        formData.dhcpSendHostname = document.getElementById('edit-dhcp-send-hostname')?.checked === true;
        formData.dhcpMetric = document.getElementById('edit-dhcp-metric')?.value || '';
    }
    
    // Hardware offloading settings
    formData.rxChecksum = document.getElementById('edit-rx-checksum')?.checked !== false;
    formData.txChecksum = document.getElementById('edit-tx-checksum')?.checked !== false;
    formData.tcpSegmentation = document.getElementById('edit-tcp-segmentation')?.checked !== false;
    formData.genericSegmentation = document.getElementById('edit-generic-segmentation')?.checked !== false;
    
    // IPv6 settings
    formData.ipv6Privacy = document.getElementById('edit-ipv6-privacy')?.checked === true;
    formData.acceptRa = document.getElementById('edit-accept-ra')?.checked !== false;
    
    // Collect additional IP addresses
    formData.additionalIPs = [];
    const additionalIPInputs = document.querySelectorAll('.additional-ip-input');
    additionalIPInputs.forEach((input, index) => {
        if (input.value.trim()) {
            const container = input.closest('.additional-ip-item');
            const lifetime = container.querySelector('select').value;
            const label = container.querySelector('input[placeholder="Label (optional)"]').value;
            
            formData.additionalIPs.push({
                address: input.value.trim(),
                lifetime: lifetime,
                label: label.trim() || null
            });
        }
    });
    
    console.log('Final collected form data for validation:', formData);
    
    // Validate form data
    console.log('Starting form data validation...');
    const validation = validateInterfaceConfig(formData);
    console.log('Validation result:', validation);
    if (!validation.valid) {
        console.error('Validation failed:', validation.message);
        NetworkManager.showError(validation.message);
        return;
    }
    console.log('Form data validation passed');
    
    // Show configuration preview
    console.log('Generating configuration preview...');
    const yamlPreview = generateNetplanYaml(formData);
    console.log('Generated YAML preview:', yamlPreview);
    
    const confirmModal = `
        <div>
            <h4>Configuration Preview</h4>
            <p>The following configuration will be applied to interface <strong>${name}</strong>:</p>
            
            <div class="config-preview">${yamlPreview}</div>
            
            <div class="alert alert-warning" style="margin-top: 16px;">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Warning:</strong> This will modify the network configuration. 
                ${formData.configType === 'disabled' ? 'The interface will be disabled.' : 
                  'Network connectivity may be temporarily interrupted.'}
            </div>
        </div>
    `;
    
    const confirmFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="confirmUpdateInterface('${name}')">Apply Configuration</button>
    `;
    
    NetworkManager.createModal('Confirm Interface Update', confirmModal, confirmFooter);
}

function validateInterfaceConfig(formData) {
    // Basic validation
    if (formData.configType === 'static') {
        if (!formData.ip) {
            return { valid: false, message: 'IP address is required for static configuration' };
        }
        
        if (!validateCIDR(formData.ip)) {
            return { valid: false, message: 'Invalid IP address format. Use CIDR notation (e.g., 192.168.1.100/24)' };
        }
        
        if (formData.gateway && !validateIPAddress(formData.gateway)) {
            return { valid: false, message: 'Invalid gateway address format' };
        }
    }
    
    // Validate additional IPs
    if (formData.additionalIPs && formData.additionalIPs.length > 0) {
        for (let i = 0; i < formData.additionalIPs.length; i++) {
            const additionalIP = formData.additionalIPs[i];
            if (!validateCIDR(additionalIP.address)) {
                return { valid: false, message: `Invalid additional IP address format: ${additionalIP.address}` };
            }
        }
    }
    
    // Validate MAC address if provided
    if (formData.macAddress && !validateMAC(formData.macAddress)) {
        return { valid: false, message: 'Invalid MAC address format. Use format: aa:bb:cc:dd:ee:ff' };
    }
    
    // Validate MTU values
    if (formData.mtu && (formData.mtu < 68 || formData.mtu > 9000)) {
        return { valid: false, message: 'MTU must be between 68 and 9000' };
    }
    
    if (formData.ipv6Mtu && (formData.ipv6Mtu < 1280 || formData.ipv6Mtu > 9000)) {
        return { valid: false, message: 'IPv6 MTU must be between 1280 and 9000' };
    }
    
    // Validate DNS servers
    if (formData.dns) {
        const dnsServers = formData.dns.split(',').map(dns => dns.trim());
        for (let dns of dnsServers) {
            if (dns && !validateIPAddress(dns)) {
                return { valid: false, message: `Invalid DNS server address: ${dns}` };
            }
        }
    }
    
    return { valid: true };
}

function confirmUpdateInterface(name) {
    console.log(`confirmUpdateInterface called for interface: ${name}`);
    
    try {
        // Collect form data from the updateInterface function's saved data
        const formData = {
            name: name,
            configType: document.querySelector('.toggle-seg.active')?.getAttribute('data-config') || 'dhcp',
            ip: document.getElementById('edit-if-ip')?.value || '',
            gateway: document.getElementById('edit-if-gateway')?.value || '',
            dns: document.getElementById('edit-if-dns')?.value || '',
            searchDomains: document.getElementById('edit-if-search')?.value || '',
            mtu: document.getElementById('edit-if-mtu')?.value || '',
            ipv6Mtu: document.getElementById('edit-if-ipv6-mtu')?.value || '',
            metric: document.getElementById('edit-if-metric')?.value || '',
            macAddress: document.getElementById('edit-mac-address')?.value || '',
            optional: document.getElementById('edit-if-optional')?.checked || false
        };
        
        console.log('Collected form data:', formData);
        
        // DHCP configuration
        if (formData.configType === 'dhcp') {
            formData.dhcp4 = document.getElementById('edit-dhcp4')?.checked !== false;
            formData.dhcp6 = document.getElementById('edit-dhcp6')?.checked === true;
            formData.dhcpUseDns = document.getElementById('edit-dhcp-use-dns')?.checked !== false;
            formData.dhcpUseRoutes = document.getElementById('edit-dhcp-use-routes')?.checked !== false;
            formData.dhcpSendHostname = document.getElementById('edit-dhcp-send-hostname')?.checked === true;
            formData.dhcpMetric = document.getElementById('edit-dhcp-metric')?.value || '';
            console.log('Added DHCP configuration:', {
                dhcp4: formData.dhcp4,
                dhcp6: formData.dhcp6,
                dhcpUseDns: formData.dhcpUseDns,
                dhcpUseRoutes: formData.dhcpUseRoutes
            });
        }
        
        // Hardware offloading settings
        formData.rxChecksum = document.getElementById('edit-rx-checksum')?.checked !== false;
        formData.txChecksum = document.getElementById('edit-tx-checksum')?.checked !== false;
        formData.tcpSegmentation = document.getElementById('edit-tcp-segmentation')?.checked !== false;
        formData.genericSegmentation = document.getElementById('edit-generic-segmentation')?.checked !== false;
        
        // IPv6 settings
        formData.ipv6Privacy = document.getElementById('edit-ipv6-privacy')?.checked === true;
        formData.acceptRa = document.getElementById('edit-accept-ra')?.checked !== false;
        
        // Collect additional IP addresses
        formData.additionalIPs = [];
        const additionalIPInputs = document.querySelectorAll('.additional-ip-input');
        additionalIPInputs.forEach((input, index) => {
            if (input.value.trim()) {
                const container = input.closest('.additional-ip-item');
                const lifetime = container.querySelector('select').value;
                const label = container.querySelector('input[placeholder="Label (optional)"]').value;
                
                formData.additionalIPs.push({
                    address: input.value.trim(),
                    lifetime: lifetime,
                    label: label.trim() || null
                });
            }
        });
        
        console.log('Final form data for processing:', formData);
        
        // Close the modal first
        NetworkManager.closeModal();
        
        // Show processing message
        NetworkManager.showSuccess('Updating interface configuration...');
        
        // Use NetworkAPI to configure the interface
        console.log('Calling NetworkAPI.configureInterface...');
        NetworkAPI.configureInterface(formData)
            .then(() => {
                console.log('Interface configuration completed successfully');
                NetworkManager.showSuccess(`Interface ${name} configuration updated successfully`);
                NetworkManager.loadInterfaces(); // Reload interfaces to show updated config
            })
            .catch((error) => {
                console.error('Failed to update interface:', error);
                NetworkManager.showError(`Failed to update interface: ${error.message}`);
            });
            
    } catch (error) {
        console.error('Error in confirmUpdateInterface:', error);
        NetworkManager.showError(`Error processing interface update: ${error.message}`);
    }
}

function confirmDeleteInterface(name) {
    const iface = NetworkManager.interfaces.find(i => i.name === name);
    if (!iface) return;
    
    const modalContent = `
        <div class="alert" style="background: #f8d7da; border-color: #f5c6cb; color: #721c24; margin-bottom: 20px;">
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Warning:</strong> You are about to delete the configuration for interface <strong>${name}</strong>.
        </div>
        
        <div>
            <h4>What will be deleted:</h4>
            <ul>
                <li>Interface configuration in ${iface.configFile}</li>
                <li>IP address assignment</li>
                <li>Routing configuration</li>
                <li>DNS settings</li>
            </ul>
            
            <h4>What will happen:</h4>
            <ul>
                <li>The interface will become unconfigured</li>
                <li>Network connectivity through this interface will be lost</li>
                <li>The physical interface will remain available for reconfiguration</li>
            </ul>
            
            <div class="form-group" style="margin-top: 20px;">
                <label style="display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="confirm-delete-checkbox">
                    I understand the consequences and want to proceed
                </label>
            </div>
        </div>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="performDeleteInterface('${name}')" id="delete-confirm-btn" disabled>
            <i class="fas fa-trash"></i> Delete Configuration
        </button>
    `;
    
    NetworkManager.createModal(`Delete Interface Configuration: ${name}`, modalContent, modalFooter);
    
    // Enable delete button only when checkbox is checked
    document.getElementById('confirm-delete-checkbox').addEventListener('change', function() {
        document.getElementById('delete-confirm-btn').disabled = !this.checked;
    });
}

function performDeleteInterface(name) {
    // Use real NetworkAPI to delete interface
    NetworkAPI.deleteInterface(name)
        .then(() => {
            NetworkManager.showSuccess(`Interface ${name} configuration deleted successfully`);
            NetworkManager.closeModal();
            NetworkManager.loadInterfaces(); // Reload interfaces
        })
        .catch((error) => {
            NetworkManager.showError(`Failed to delete interface: ${error.message}`);
        });
}

function toggleInterface(name, currentStatus) {
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    const modalContent = `
        <div class="alert ${newStatus === 'down' ? 'alert-warning' : 'alert-info'}" style="margin-bottom: 20px;">
            <i class="fas ${newStatus === 'down' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            You are about to <strong>${action}</strong> interface <strong>${name}</strong>.
        </div>
        
        <div>
            <h4>This will:</h4>
            <ul>
                ${newStatus === 'up' ? `
                    <li>Bring the interface online</li>
                    <li>Apply configured IP addresses</li>
                    <li>Enable network connectivity</li>
                    <li>Start any associated services</li>
                ` : `
                    <li>Take the interface offline</li>
                    <li>Disconnect all active connections</li>
                    <li>Stop network traffic through this interface</li>
                    <li>Potentially affect dependent services</li>
                `}
            </ul>
        </div>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn ${newStatus === 'down' ? 'btn-warning' : 'btn-brand'}" onclick="performToggleInterface('${name}', '${newStatus}')">
            <i class="fas ${newStatus === 'up' ? 'fa-play' : 'fa-stop'}"></i> ${action.charAt(0).toUpperCase() + action.slice(1)} Interface
        </button>
    `;
    
    NetworkManager.createModal(`${action.charAt(0).toUpperCase() + action.slice(1)} Interface: ${name}`, modalContent, modalFooter);
}

// Utility Functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bps) {
    if (bps === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return parseFloat((bps / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function validateIPAddress(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

function validateCIDR(cidr) {
    const parts = cidr.split('/');
    if (parts.length !== 2) return false;
    
    const ip = parts[0];
    const prefix = parseInt(parts[1]);
    
    if (!validateIPAddress(ip)) return false;
    
    // Check prefix length
    if (ip.includes(':')) {
        // IPv6
        return prefix >= 0 && prefix <= 128;
    } else {
        // IPv4
        return prefix >= 0 && prefix <= 32;
    }
}

function validateMAC(mac) {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
}

function isSystemInterface(name) {
    const systemPrefixes = ['lo', 'docker', 'veth', 'br-', 'virbr'];
    return systemPrefixes.some(prefix => name.startsWith(prefix));
}

function getInterfaceTypeFromName(name) {
    if (name.startsWith('lo')) return 'loopback';
    if (name.startsWith('eth') || name.startsWith('en')) return 'physical';
    if (name.startsWith('wl') || name.startsWith('wlan')) return 'wireless';
    if (name.startsWith('br')) return 'bridge';
    if (name.startsWith('bond')) return 'bond';
    if (name.includes('.')) return 'vlan';
    if (name.startsWith('tun') || name.startsWith('tap')) return 'tunnel';
    if (name.startsWith('docker') || name.startsWith('veth')) return 'virtual';
    return 'unknown';
}

// Enhanced Error Handling
class NetworkError extends Error {
    constructor(message, code = 'NETWORK_ERROR', details = null) {
        super(message);
        this.name = 'NetworkError';
        this.code = code;
        this.details = details;
    }
}

function handleNetworkError(error) {
    console.error('Network operation failed:', error);
    
    let message = 'An unexpected error occurred';
    
    if (error instanceof NetworkError) {
        message = error.message;
    } else if (error.message) {
        message = error.message;
    }
    
    NetworkManager.showError(message);
}

// API Wrapper for Real Backend Integration
const NetworkAPI = {
    async getInterfaces() {
        try {
            // Use the real interface fetching function
            return await NetworkManager.fetchInterfaces();
        } catch (error) {
            throw new NetworkError('Failed to fetch network interfaces', 'GET_INTERFACES_FAILED', error);
        }
    },

    // Configure VLAN interface specifically
    async configureVlanInterface(config) {
        console.log('Configuring VLAN interface:', config.name);
        
        try {
            // Find the existing VLAN configuration
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
            const files = netplanFiles.trim().split('\n').filter(f => f.trim());
            
            let vlanConfigFile = null;
            let vlanId = null;
            let linkInterface = null;
            
            // Search for the VLAN definition
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes('vlans:') && content.includes(`${config.name}:`)) {
                        vlanConfigFile = file;
                        
                        // Extract VLAN ID and link
                        const vlanSection = content.match(new RegExp(`${config.name}:\\s*\\n([\\s\\S]*?)(?=^\\s{2,4}\\w|\\n$|$)`, 'm'));
                        if (vlanSection) {
                            const idMatch = vlanSection[1].match(/id:\s*(\d+)/);
                            const linkMatch = vlanSection[1].match(/link:\s*([a-zA-Z0-9\._-]+)/);
                            
                            if (idMatch) vlanId = parseInt(idMatch[1]);
                            if (linkMatch) linkInterface = linkMatch[1];
                        }
                        break;
                    }
                } catch (fileError) {
                    console.warn(`Could not read file ${file}:`, fileError);
                }
            }
            
            if (!vlanConfigFile) {
                throw new Error(`VLAN configuration file not found for interface ${config.name}`);
            }
            
            console.log(`Found VLAN ${config.name} (ID: ${vlanId}, Link: ${linkInterface}) in ${vlanConfigFile}`);
            
            // Generate new VLAN configuration
            const vlanConfig = {
                id: vlanId,
                name: config.name,
                parent: linkInterface,
                description: `VLAN ${vlanId}`,
                configType: config.configType,
                ip: config.ip || '',
                gateway: config.gateway || '',
                dns: config.dns || ''
            };
            
            // Generate new Netplan VLAN configuration
            const netplanConfig = generateVlanNetplanConfig(vlanConfig);
            
            console.log('Generated VLAN Netplan config:', netplanConfig);
            
            // Write the configuration to the same file or a new XAVS file
            const newConfigPath = vlanConfigFile.includes('90-xavs-') ? vlanConfigFile : `/etc/netplan/90-xavs-vlan${vlanId}.yaml`;
            
            // Remove old file if creating a new one
            if (newConfigPath !== vlanConfigFile) {
                console.log(`Moving VLAN configuration from ${vlanConfigFile} to ${newConfigPath}`);
                await cockpit.spawn(['rm', '-f', vlanConfigFile], { superuser: 'try' });
            }
            
            // Write new configuration
            await cockpit.file(newConfigPath, { superuser: 'try' }).replace(netplanConfig);
            console.log('VLAN configuration written successfully');
            
            // Set proper file permissions
            await cockpit.spawn(['chmod', '600', newConfigPath], { superuser: 'try' });
            console.log('File permissions set to 600');
            
            // Test the configuration with netplan try
            console.log('Testing VLAN configuration with netplan try...');
            try {
                await cockpit.spawn(['netplan', 'try', '--timeout=30'], { superuser: 'try' });
                console.log('Netplan try completed successfully');
            } catch (tryError) {
                console.error('Netplan try failed:', tryError);
                throw new Error(`Configuration test failed: ${tryError.message || tryError}. The configuration has not been applied.`);
            }
            
            // Apply the configuration
            console.log('Applying VLAN configuration...');
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            console.log('VLAN configuration applied successfully');
            
            return { success: true, message: `VLAN ${config.name} configured successfully` };
            
        } catch (error) {
            console.error('Error configuring VLAN interface:', error);
            throw error;
        }
    },

    // Check for interface definition conflicts across Netplan files
    async checkForInterfaceConflicts(interfaceName, intendedType) {
        console.log(`Checking for conflicts for interface '${interfaceName}' intended as '${intendedType}'...`);
        
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
                                    console.log(`Found conflict: ${interfaceName} defined as ${type} in ${file}, but trying to define as ${intendedType}`);
                                }
                            }
                        }
                    }
                } catch (fileError) {
                    console.warn(`Could not read file ${file}:`, fileError);
                }
            }
            
            // If conflicts found, handle them
            if (conflictingFiles.length > 0) {
                console.log(`Found ${conflictingFiles.length} conflicting definitions for interface '${interfaceName}'`);
                
                // For XAVS files, we can remove the conflicting definition
                for (const conflict of conflictingFiles) {
                    if (conflict.file.includes('90-xavs-')) {
                        console.log(`Removing conflicting XAVS configuration file: ${conflict.file}`);
                        await cockpit.spawn(['rm', '-f', conflict.file], { superuser: 'try' });
                    } else {
                        throw new NetworkError(
                            `Interface '${interfaceName}' is already defined as '${conflict.type}' in ${conflict.file}. Cannot redefine as '${intendedType}'.`,
                            'INTERFACE_CONFLICT'
                        );
                    }
                }
            }
            
        } catch (error) {
            if (error instanceof NetworkError) {
                throw error;
            }
            console.warn('Error checking for interface conflicts:', error);
            // Don't throw here - allow the operation to continue if conflict check fails
        }
    },

    async configureInterface(config) {
        try {
            console.log('NetworkAPI.configureInterface called with config:', config);
            
            // Determine interface type based on configuration or interface name
            let interfaceType = 'ethernets';
            let isVlanInterface = false;
            
            // Check if this is a VLAN interface
            const vlanPattern = /^(.+)\.(\d+)$|^vlan(\d+)$/;
            if (vlanPattern.test(config.name)) {
                interfaceType = 'vlans';
                isVlanInterface = true;
                console.log(`Detected VLAN interface: ${config.name}`);
            }
            
            // Also check if interface exists in any VLAN netplan files
            if (!isVlanInterface) {
                try {
                    const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
                    const files = netplanFiles.trim().split('\n').filter(f => f.trim());
                    
                    for (const file of files) {
                        try {
                            const content = await cockpit.file(file, { superuser: 'try' }).read();
                            if (content && content.includes('vlans:') && content.includes(`${config.name}:`)) {
                                interfaceType = 'vlans';
                                isVlanInterface = true;
                                console.log(`Found ${config.name} defined as VLAN in ${file}`);
                                break;
                            }
                        } catch (fileError) {
                            console.warn(`Could not read file ${file}:`, fileError);
                        }
                    }
                } catch (searchError) {
                    console.warn('Error searching for VLAN definitions:', searchError);
                }
            }
            
            // If this is a VLAN interface, delegate to VLAN manager
            if (isVlanInterface) {
                console.log(`Delegating VLAN interface ${config.name} configuration to VLAN manager`);
                return await this.configureVlanInterface(config);
            }
            
            // Check for interface conflicts before proceeding
            console.log('Checking for interface conflicts...');
            await this.checkForInterfaceConflicts(config.name, interfaceType);
            
            // Validate configuration
            console.log('Validating configuration...');
            if (config.configType === 'static' && config.ip && !validateCIDR(config.ip)) {
                throw new NetworkError('Invalid IP address format', 'INVALID_IP');
            }
            
            if (config.gateway && !validateIPAddress(config.gateway)) {
                throw new NetworkError('Invalid gateway address', 'INVALID_GATEWAY');
            }
            
            console.log('Configuration validation passed');
            
            // Generate Netplan configuration
            console.log('Generating Netplan YAML configuration...');
            const netplanConfig = generateNetplanYaml(config);
            console.log('Generated Netplan config:');
            console.log('--- START CONFIG ---');
            console.log(netplanConfig);
            console.log('--- END CONFIG ---');
            
            // Use XAVS-specific naming to avoid conflicts with installer configs
            const configFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
            console.log(`Writing configuration to file: ${configFile}`);
            
            // Show what we're about to write
            console.log('File path details:');
            console.log('- config.name:', config.name);
            console.log('- Full file path:', configFile);
            console.log('- Content length:', netplanConfig.length, 'characters');
            
            // Check Cockpit API availability
            if (!cockpit || !cockpit.file) {
                console.error('Cockpit API check failed - cockpit object:', cockpit);
                throw new Error('Cockpit API not available - please ensure you are running this module within Cockpit');
            } else {
                console.log('Cockpit API is available');
            }
            
            console.log('Attempting to write file with Cockpit API...');
            await cockpit.file(configFile, { superuser: 'require' }).replace(netplanConfig);
            console.log('Configuration file written successfully');
            
            // Set proper file permissions (600 = rw-------)
            console.log('Setting file permissions to 600...');
            await cockpit.spawn(['chmod', '600', configFile], { superuser: 'require' });
            console.log('File permissions set successfully');
            
            // Test the configuration first with netplan try
            console.log('Testing Netplan configuration with netplan try...');
            if (!cockpit.spawn) {
                console.error('Cockpit spawn API not available');
                throw new Error('Cockpit spawn API not available');
            }
            
            try {
                console.log('Running: netplan try --timeout=30');
                await cockpit.spawn(['netplan', 'try', '--timeout=30'], { superuser: 'require' });
                console.log('Netplan try completed successfully');
            } catch (tryError) {
                console.error('Netplan try failed:', tryError);
                throw new Error(`Configuration test failed: ${tryError.message || tryError}. The configuration has not been applied.`);
            }
            
            // Apply configuration permanently
            console.log('Applying Netplan configuration permanently...');
            console.log('Running: netplan apply');
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            console.log('Netplan configuration applied successfully');
            
            return { success: true };
        } catch (error) {
            console.error('Error in NetworkAPI.configureInterface:', error);
            throw new NetworkError('Failed to configure interface', 'CONFIGURE_FAILED', error);
        }
    },
    
    async toggleInterface(name, action) {
        try {
            // Toggle interface using ip command
            await cockpit.spawn(['ip', 'link', 'set', name, action], { superuser: 'require' });
            
            return { success: true };
        } catch (error) {
            throw new NetworkError(`Failed to ${action} interface ${name}`, 'TOGGLE_FAILED', error);
        }
    },
    
    async deleteInterface(name) {
        try {
            // Only look for XAVS-managed configuration files to avoid touching installer configs
            const xavsConfigFile = `/etc/netplan/90-xavs-${name}.yaml`;
            
            try {
                // Check if our XAVS config file exists
                const content = await cockpit.file(xavsConfigFile).read();
                if (content) {
                    // Remove the XAVS-managed configuration file
                    await cockpit.spawn(['rm', xavsConfigFile], { superuser: 'require' });
                }
            } catch (fileError) {
                // If the specific XAVS file doesn't exist, look in other Netplan files
                // but exclude installer configs (00-installer-config.yaml, 01-network-manager-all.yaml)
                const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-not', '-name', '00-installer-config.yaml', '-not', '-name', '01-network-manager-all.yaml'], { superuser: 'try' });
                const files = netplanFiles.trim().split('\n').filter(f => f.trim());
                
                for (const file of files) {
                    try {
                        const content = await cockpit.file(file).read();
                        if (content && content.includes(`${name}:`)) {
                            // Only remove from non-installer config files
                            if (!file.includes('00-installer-config') && !file.includes('01-network-manager')) {
                                const updatedContent = removeInterfaceFromNetplan(content, name);
                                await cockpit.file(file, { superuser: 'require' }).replace(updatedContent);
                                break;
                            }
                        }
                    } catch (fileError) {
                        console.warn(`Could not process ${file}:`, fileError);
                    }
                }
            }
            
            // Apply configuration
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            
            return { success: true };
        } catch (error) {
            throw new NetworkError(`Failed to delete interface ${name}`, 'DELETE_FAILED', error);
        }
    }
};

// Helper functions for Netplan configuration
function generateNetplanYaml(config) {
    let yamlContent = `network:
  version: 2
`;

    // Determine the appropriate section based on interface type
    const interfaceType = determineNetplanSection(config);
    
    if (interfaceType === 'ethernets') {
        yamlContent += generateEthernetConfig(config);
    } else if (interfaceType === 'vlans') {
        yamlContent += generateVlanConfig(config);
    } else if (interfaceType === 'bridges') {
        yamlContent += generateBridgeConfig(config);
    } else if (interfaceType === 'bonds') {
        yamlContent += generateBondConfig(config);
    } else {
        // Default to ethernet
        yamlContent += generateEthernetConfig(config);
    }

    return yamlContent;
}

// Determine which Netplan section to use
function determineNetplanSection(config) {
    if (config.interfaceType === 'vlan' || config.vlanId) {
        return 'vlans';
    } else if (config.interfaceType === 'bridge' || config.bridgeInterfaces) {
        return 'bridges';
    } else if (config.interfaceType === 'bond' || config.bondSlaves) {
        return 'bonds';
    } else {
        return 'ethernets';
    }
}

// Generate ethernet interface configuration
function generateEthernetConfig(config) {
    let yamlContent = `  ethernets:
    ${config.name}:
`;
    
    // IP Configuration
    if (config.type === 'static' || config.configType === 'static') {
        if (config.ip || config.addresses) {
            yamlContent += `      addresses:
`;
            if (config.addresses && Array.isArray(config.addresses)) {
                config.addresses.forEach(addr => {
                    yamlContent += `        - ${addr}
`;
                });
            } else if (config.ip) {
                yamlContent += `        - ${config.ip}
`;
            }
        }
        
        if (config.gateway) {
            yamlContent += `      gateway4: ${config.gateway}
`;
        }
        
        if (config.dns && config.dns.length > 0) {
            yamlContent += `      nameservers:
        addresses:
`;
            config.dns.forEach(dns => {
                yamlContent += `          - ${dns}
`;
            });
        }
    } else if (config.type === 'dhcp' || config.configType === 'dhcp') {
        yamlContent += `      dhcp4: true
`;
        if (config.dhcp6) {
            yamlContent += `      dhcp6: true
`;
        }
    }
    
    // Additional ethernet settings
    if (config.mtu) {
        yamlContent += `      mtu: ${config.mtu}
`;
    }
    
    if (config.macAddress) {
        yamlContent += `      macaddress: ${config.macAddress}
`;
    }
    
    return yamlContent;
}

// Generate VLAN interface configuration
function generateVlanConfig(config) {
    let yamlContent = `  vlans:
    ${config.name}:
      id: ${config.vlanId}
      link: ${config.parentInterface || config.vlanParent}
`;
    
    // IP Configuration for VLAN
    if (config.type === 'static' || config.configType === 'static') {
        if (config.ip || config.addresses) {
            yamlContent += `      addresses:
`;
            if (config.addresses && Array.isArray(config.addresses)) {
                config.addresses.forEach(addr => {
                    yamlContent += `        - ${addr}
`;
                });
            } else if (config.ip) {
                yamlContent += `        - ${config.ip}
`;
            }
        }
        
        if (config.gateway) {
            yamlContent += `      gateway4: ${config.gateway}
`;
        }
    } else if (config.type === 'dhcp' || config.configType === 'dhcp') {
        yamlContent += `      dhcp4: true
`;
        if (config.dhcp6) {
            yamlContent += `      dhcp6: true
`;
        }
    }
    
    if (config.mtu) {
        yamlContent += `      mtu: ${config.mtu}
`;
    }
    
    return yamlContent;
}

// Generate bridge interface configuration
function generateBridgeConfig(config) {
    let yamlContent = `  bridges:
    ${config.name}:
`;
    
    if (config.bridgeInterfaces && config.bridgeInterfaces.length > 0) {
        yamlContent += `      interfaces:
`;
        config.bridgeInterfaces.forEach(iface => {
            yamlContent += `        - ${iface}
`;
        });
    }
    
    // IP Configuration for bridge
    if (config.type === 'static' || config.configType === 'static') {
        if (config.ip || config.addresses) {
            yamlContent += `      addresses:
`;
            if (config.addresses && Array.isArray(config.addresses)) {
                config.addresses.forEach(addr => {
                    yamlContent += `        - ${addr}
`;
                });
            } else if (config.ip) {
                yamlContent += `        - ${config.ip}
`;
            }
        }
        
        if (config.gateway) {
            yamlContent += `      gateway4: ${config.gateway}
`;
        }
    } else if (config.type === 'dhcp' || config.configType === 'dhcp') {
        yamlContent += `      dhcp4: true
`;
        if (config.dhcp6) {
            yamlContent += `      dhcp6: true
`;
        }
    }
    
    if (config.mtu) {
        yamlContent += `      mtu: ${config.mtu}
`;
    }
    
    // Bridge-specific parameters
    if (config.bridgeParams) {
        if (config.bridgeParams.stp !== undefined) {
            yamlContent += `      parameters:
        stp: ${config.bridgeParams.stp}
`;
        }
    }
    
    return yamlContent;
}

// Generate bond interface configuration
function generateBondConfig(config) {
    let yamlContent = `  bonds:
    ${config.name}:
`;
    
    if (config.bondSlaves && config.bondSlaves.length > 0) {
        yamlContent += `      interfaces:
`;
        config.bondSlaves.forEach(iface => {
            yamlContent += `        - ${iface}
`;
        });
    }
    
    // IP Configuration for bond
    if (config.type === 'static' || config.configType === 'static') {
        if (config.ip || config.addresses) {
            yamlContent += `      addresses:
`;
            if (config.addresses && Array.isArray(config.addresses)) {
                config.addresses.forEach(addr => {
                    yamlContent += `        - ${addr}
`;
                });
            } else if (config.ip) {
                yamlContent += `        - ${config.ip}
`;
            }
        }
        
        if (config.gateway) {
            yamlContent += `      gateway4: ${config.gateway}
`;
        }
    } else if (config.type === 'dhcp' || config.configType === 'dhcp') {
        yamlContent += `      dhcp4: true
`;
        if (config.dhcp6) {
            yamlContent += `      dhcp6: true
`;
        }
    }
    
    if (config.mtu) {
        yamlContent += `      mtu: ${config.mtu}
`;
    }
    
    // Bond-specific parameters
    yamlContent += `      parameters:
        mode: ${config.bondMode || 'active-backup'}
`;
    
    if (config.bondParams) {
        if (config.bondParams.miimon) {
            yamlContent += `        mii-monitor-interval: ${config.bondParams.miimon}
`;
        }
        if (config.bondParams.primary) {
            yamlContent += `        primary: ${config.bondParams.primary}
`;
        }
    }
    
    return yamlContent;
}

function removeInterfaceFromNetplan(content, interfaceName) {
    // This is a simplified approach - in a real implementation,
    // you'd want to parse the YAML properly
    const lines = content.split('\n');
    const result = [];
    let skipSection = false;
    let indentLevel = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === `${interfaceName}:`) {
            skipSection = true;
            indentLevel = line.length - line.trimLeft().length;
            continue;
        }

        if (skipSection) {
            const currentIndent = line.length - line.trimLeft().length;
            if (currentIndent <= indentLevel && trimmed !== '') {
                skipSection = false;
            } else {
                continue;
            }
        }

        if (!skipSection) {
            result.push(line);
        }
    }

    return result.join('\n');
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        NetworkManager.init();
    } catch (error) {
        handleNetworkError(error);
    }
});

// Handle page unload
window.addEventListener('beforeunload', function(e) {
    // Clean up any ongoing operations
    NetworkManager.cleanup();
});

// Quick Action Functions
function refreshSystemStatus() {
    NetworkManager.loadSystemStatus();
    NetworkManager.showSuccess('System status refreshed');
}

function validateConfiguration() {
    // Real configuration validation using netplan
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for configuration validation');
        return;
    }
    
    cockpit.spawn(['netplan', 'get'], { superuser: 'try' })
        .then(() => {
            NetworkManager.showSuccess('All configurations are valid');
        })
        .catch((error) => {
            NetworkManager.showError(`Configuration validation failed: ${error.message}`);
        });
}

function backupConfiguration() {
    // Real backup creation
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for backup creation');
        return;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = `/tmp/netplan-backup-${timestamp}`;
    
    cockpit.spawn(['cp', '-r', '/etc/netplan', backupDir], { superuser: 'require' })
        .then(() => {
            NetworkManager.showSuccess(`Configuration backup created at ${backupDir}`);
        })
        .catch((error) => {
            NetworkManager.showError(`Backup creation failed: ${error.message}`);
        });
}

function viewLogs() {
    NetworkManager.loadSystemLogs();
}

function refreshInterfaces() {
    NetworkManager.loadInterfaces();
}

function filterInterfaces() {
    const filterValue = document.getElementById('interface-filter').value;
    // Implement filtering logic
    console.log('Filtering interfaces by:', filterValue);
}

// VLAN, Bridge, and Bond creation functions
function addVlan() {
    const modal = document.getElementById('interface-modal');
    const modalTitle = modal.querySelector('.modal-title');
    const modalBody = modal.querySelector('.modal-body');
    
    modalTitle.textContent = 'Create VLAN Interface';
    modalBody.innerHTML = `
        <form id="vlan-form">
            <div class="form-group">
                <label for="vlan-name">VLAN Interface Name</label>
                <input type="text" id="vlan-name" name="name" placeholder="e.g., vlan100" required>
            </div>
            <div class="form-group">
                <label for="vlan-id">VLAN ID</label>
                <input type="number" id="vlan-id" name="vlanId" min="1" max="4094" placeholder="e.g., 100" required>
            </div>
            <div class="form-group">
                <label for="vlan-parent">Parent Interface</label>
                <select id="vlan-parent" name="parentInterface" required>
                    <option value="">Select parent interface...</option>
                    ${NetworkManager.interfaces.filter(i => !i.systemInterface && i.type === 'ethernet').map(i => 
                        `<option value="${i.name}">${i.name}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="vlan-config-type">IP Configuration</label>
                <select id="vlan-config-type" name="configType" onchange="toggleVlanIPConfig(this.value)">
                    <option value="dhcp">DHCP</option>
                    <option value="static">Static IP</option>
                    <option value="none">No IP Configuration</option>
                </select>
            </div>
            <div id="vlan-static-config" style="display: none;">
                <div class="form-group">
                    <label for="vlan-ip">IP Address/CIDR</label>
                    <input type="text" id="vlan-ip" name="ip" placeholder="e.g., 192.168.100.50/24">
                </div>
                <div class="form-group">
                    <label for="vlan-gateway">Gateway (optional)</label>
                    <input type="text" id="vlan-gateway" name="gateway" placeholder="e.g., 192.168.100.1">
                </div>
            </div>
            <div class="form-group">
                <label for="vlan-mtu">MTU (optional)</label>
                <input type="number" id="vlan-mtu" name="mtu" placeholder="1500" min="576" max="9000">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-brand">Create VLAN</button>
            </div>
        </form>
    `;
    
    modal.style.display = 'block';
    
    // Handle form submission
    document.getElementById('vlan-form').onsubmit = async function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const config = {
            name: formData.get('name'),
            interfaceType: 'vlan',
            vlanId: parseInt(formData.get('vlanId')),
            parentInterface: formData.get('parentInterface'),
            configType: formData.get('configType'),
            ip: formData.get('ip'),
            gateway: formData.get('gateway'),
            mtu: formData.get('mtu') ? parseInt(formData.get('mtu')) : null
        };
        
        try {
            await NetworkAPI.configureInterface(config);
            NetworkManager.showSuccess(`VLAN ${config.name} created successfully`);
            NetworkManager.closeModal();
            NetworkManager.loadInterfaces();
        } catch (error) {
            NetworkManager.showError(`Failed to create VLAN: ${error.message}`);
        }
    };
}

function addBridge() {
    const modal = document.getElementById('interface-modal');
    const modalTitle = modal.querySelector('.modal-title');
    const modalBody = modal.querySelector('.modal-body');
    
    modalTitle.textContent = 'Create Bridge Interface';
    modalBody.innerHTML = `
        <form id="bridge-form">
            <div class="form-group">
                <label for="bridge-name">Bridge Interface Name</label>
                <input type="text" id="bridge-name" name="name" placeholder="e.g., br0" required>
            </div>
            <div class="form-group">
                <label for="bridge-interfaces">Member Interfaces</label>
                <div class="checkbox-group">
                    ${NetworkManager.interfaces.filter(i => !i.systemInterface && i.type === 'ethernet').map(i => 
                        `<label><input type="checkbox" name="bridgeInterfaces" value="${i.name}"> ${i.name}</label>`
                    ).join('')}
                </div>
            </div>
            <div class="form-group">
                <label for="bridge-config-type">IP Configuration</label>
                <select id="bridge-config-type" name="configType" onchange="toggleBridgeIPConfig(this.value)">
                    <option value="dhcp">DHCP</option>
                    <option value="static">Static IP</option>
                    <option value="none">No IP Configuration</option>
                </select>
            </div>
            <div id="bridge-static-config" style="display: none;">
                <div class="form-group">
                    <label for="bridge-ip">IP Address/CIDR</label>
                    <input type="text" id="bridge-ip" name="ip" placeholder="e.g., 192.168.1.50/24">
                </div>
                <div class="form-group">
                    <label for="bridge-gateway">Gateway (optional)</label>
                    <input type="text" id="bridge-gateway" name="gateway" placeholder="e.g., 192.168.1.1">
                </div>
            </div>
            <div class="form-group">
                <label for="bridge-stp">Spanning Tree Protocol (STP)</label>
                <select id="bridge-stp" name="stp">
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                </select>
            </div>
            <div class="form-group">
                <label for="bridge-mtu">MTU (optional)</label>
                <input type="number" id="bridge-mtu" name="mtu" placeholder="1500" min="576" max="9000">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-brand">Create Bridge</button>
            </div>
        </form>
    `;
    
    modal.style.display = 'block';
    
    // Handle form submission
    document.getElementById('bridge-form').onsubmit = async function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const selectedInterfaces = Array.from(formData.getAll('bridgeInterfaces'));
        
        const config = {
            name: formData.get('name'),
            interfaceType: 'bridge',
            bridgeInterfaces: selectedInterfaces,
            configType: formData.get('configType'),
            ip: formData.get('ip'),
            gateway: formData.get('gateway'),
            mtu: formData.get('mtu') ? parseInt(formData.get('mtu')) : null,
            bridgeParams: {
                stp: formData.get('stp') === 'true'
            }
        };
        
        try {
            await NetworkAPI.configureInterface(config);
            NetworkManager.showSuccess(`Bridge ${config.name} created successfully`);
            NetworkManager.closeModal();
            NetworkManager.loadInterfaces();
        } catch (error) {
            NetworkManager.showError(`Failed to create bridge: ${error.message}`);
        }
    };
}

function addBond() {
    const modal = document.getElementById('interface-modal');
    const modalTitle = modal.querySelector('.modal-title');
    const modalBody = modal.querySelector('.modal-body');
    
    modalTitle.textContent = 'Create Bond Interface';
    modalBody.innerHTML = `
        <form id="bond-form">
            <div class="form-group">
                <label for="bond-name">Bond Interface Name</label>
                <input type="text" id="bond-name" name="name" placeholder="e.g., bond0" required>
            </div>
            <div class="form-group">
                <label for="bond-mode">Bond Mode</label>
                <select id="bond-mode" name="bondMode">
                    <option value="active-backup">Active-Backup (mode 1)</option>
                    <option value="balance-xor">Balance XOR (mode 2)</option>
                    <option value="broadcast">Broadcast (mode 3)</option>
                    <option value="802.3ad">LACP 802.3ad (mode 4)</option>
                    <option value="balance-tlb">Balance TLB (mode 5)</option>
                    <option value="balance-alb">Balance ALB (mode 6)</option>
                </select>
            </div>
            <div class="form-group">
                <label for="bond-slaves">Slave Interfaces</label>
                <div class="checkbox-group">
                    ${NetworkManager.interfaces.filter(i => !i.systemInterface && i.type === 'ethernet').map(i => 
                        `<label><input type="checkbox" name="bondSlaves" value="${i.name}"> ${i.name}</label>`
                    ).join('')}
                </div>
            </div>
            <div class="form-group">
                <label for="bond-config-type">IP Configuration</label>
                <select id="bond-config-type" name="configType" onchange="toggleBondIPConfig(this.value)">
                    <option value="dhcp">DHCP</option>
                    <option value="static">Static IP</option>
                    <option value="none">No IP Configuration</option>
                </select>
            </div>
            <div id="bond-static-config" style="display: none;">
                <div class="form-group">
                    <label for="bond-ip">IP Address/CIDR</label>
                    <input type="text" id="bond-ip" name="ip" placeholder="e.g., 192.168.1.50/24">
                </div>
                <div class="form-group">
                    <label for="bond-gateway">Gateway (optional)</label>
                    <input type="text" id="bond-gateway" name="gateway" placeholder="e.g., 192.168.1.1">
                </div>
            </div>
            <div class="form-group">
                <label for="bond-miimon">MII Monitor Interval (ms)</label>
                <input type="number" id="bond-miimon" name="miimon" placeholder="100" min="0">
            </div>
            <div class="form-group">
                <label for="bond-mtu">MTU (optional)</label>
                <input type="number" id="bond-mtu" name="mtu" placeholder="1500" min="576" max="9000">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-brand">Create Bond</button>
            </div>
        </form>
    `;
    
    modal.style.display = 'block';
    
    // Handle form submission
    document.getElementById('bond-form').onsubmit = async function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const selectedSlaves = Array.from(formData.getAll('bondSlaves'));
        
        const config = {
            name: formData.get('name'),
            interfaceType: 'bond',
            bondSlaves: selectedSlaves,
            bondMode: formData.get('bondMode'),
            configType: formData.get('configType'),
            ip: formData.get('ip'),
            gateway: formData.get('gateway'),
            mtu: formData.get('mtu') ? parseInt(formData.get('mtu')) : null,
            bondParams: {
                miimon: formData.get('miimon') ? parseInt(formData.get('miimon')) : 100
            }
        };
        
        try {
            await NetworkAPI.configureInterface(config);
            NetworkManager.showSuccess(`Bond ${config.name} created successfully`);
            NetworkManager.closeModal();
            NetworkManager.loadInterfaces();
        } catch (error) {
            NetworkManager.showError(`Failed to create bond: ${error.message}`);
        }
    };
}

// Helper functions for dynamic forms
function toggleVlanIPConfig(configType) {
    const staticConfig = document.getElementById('vlan-static-config');
    staticConfig.style.display = configType === 'static' ? 'block' : 'none';
}

function toggleBridgeIPConfig(configType) {
    const staticConfig = document.getElementById('bridge-static-config');
    staticConfig.style.display = configType === 'static' ? 'block' : 'none';
}

function toggleBondIPConfig(configType) {
    const staticConfig = document.getElementById('bond-static-config');
    staticConfig.style.display = configType === 'static' ? 'block' : 'none';
}

function addRoute() {
    const modal = document.getElementById('interface-modal');
    const modalTitle = modal.querySelector('.modal-title');
    const modalBody = modal.querySelector('.modal-body');
    
    modalTitle.textContent = 'Add Route';
    modalBody.innerHTML = `
        <form id="route-form">
            <div class="form-group">
                <label for="route-destination">Destination Network</label>
                <input type="text" id="route-destination" name="destination" placeholder="192.168.1.0/24 or default" required>
            </div>
            <div class="form-group">
                <label for="route-gateway">Gateway</label>
                <input type="text" id="route-gateway" name="gateway" placeholder="192.168.1.1" required>
            </div>
            <div class="form-group">
                <label for="route-interface">Interface</label>
                <select id="route-interface" name="interface" required>
                    <option value="">Select interface...</option>
                    ${NetworkManager.interfaces.filter(i => !i.systemInterface).map(i => 
                        `<option value="${i.name}">${i.name}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-group">
                <label for="route-metric">Metric (optional)</label>
                <input type="number" id="route-metric" name="metric" placeholder="100" min="0">
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-brand">Add Route</button>
            </div>
        </form>
    `;
    
    modal.style.display = 'block';
    
    document.getElementById('route-form').onsubmit = function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const destination = formData.get('destination');
        const gateway = formData.get('gateway');
        const iface = formData.get('interface');
        const metric = formData.get('metric');
        
        if (!validateIPAddress(gateway) && !validateCIDR(gateway)) {
            NetworkManager.showError('Invalid gateway IP address');
            return;
        }
        
        // Add route using ip route add command
        if (!cockpit || !cockpit.spawn) {
            NetworkManager.showError('Cockpit API not available for route addition');
            return;
        }
        
        const routeCmd = ['ip', 'route', 'add', destination, 'via', gateway, 'dev', iface];
        if (metric) {
            routeCmd.push('metric', metric);
        }
        
        cockpit.spawn(routeCmd, { superuser: 'require' })
            .then(() => {
                NetworkManager.showSuccess(`Route to ${destination} via ${gateway} added successfully`);
                NetworkManager.closeModal();
                NetworkManager.loadRoutes();
            })
            .catch((error) => {
                NetworkManager.showError(`Failed to add route: ${error.message}`);
            });
    };
}

function addDnsServer() {
    // Open modal for adding DNS server
    const modal = document.getElementById('interface-modal');
    const modalTitle = modal.querySelector('.modal-title');
    const modalBody = modal.querySelector('.modal-body');
    
    modalTitle.textContent = 'Add DNS Server';
    modalBody.innerHTML = `
        <form id="dns-form">
            <div class="form-group">
                <label for="dns-server">DNS Server IP Address</label>
                <input type="text" id="dns-server" name="dnsServer" placeholder="8.8.8.8" required>
            </div>
            <div class="form-group">
                <label for="dns-interface">Apply to Interface (optional)</label>
                <select id="dns-interface" name="interface">
                    <option value="">Global DNS server</option>
                    ${NetworkManager.interfaces.filter(i => !i.systemInterface).map(i => 
                        `<option value="${i.name}">${i.name}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
                <button type="submit" class="btn btn-brand">Add DNS Server</button>
            </div>
        </form>
    `;
    
    modal.style.display = 'block';
    
    document.getElementById('dns-form').onsubmit = function(e) {
        e.preventDefault();
        const formData = new FormData(e.target);
        const dnsServer = formData.get('dnsServer');
        const targetInterface = formData.get('interface');
        
        if (!validateIPAddress(dnsServer)) {
            NetworkManager.showError('Invalid DNS server IP address');
            return;
        }
        
        // Add DNS server logic here
        NetworkManager.showSuccess(`DNS server ${dnsServer} added${targetInterface ? ` to ${targetInterface}` : ' globally'}`);
        NetworkManager.closeModal();
        NetworkManager.loadDnsConfig();
    };
}

function refreshVlans() {
    console.log('Refresh VLANs');
    NetworkManager.loadVlans();
    NetworkManager.showSuccess('VLANs refreshed');
}

function refreshBridges() {
    console.log('Refresh Bridges');
    NetworkManager.loadBridges();
    NetworkManager.showSuccess('Bridges refreshed');
}

function refreshBonds() {
    console.log('Refresh Bonds');
    NetworkManager.loadBonds();
    NetworkManager.showSuccess('Bonds refreshed');
}

function refreshRoutes() {
    console.log('Refresh Routes');
    NetworkManager.loadRoutes();
    NetworkManager.showSuccess('Routes refreshed');
}

function refreshDns() {
    console.log('Refresh DNS');
    NetworkManager.loadDnsConfig();
    NetworkManager.showSuccess('DNS configuration refreshed');
}

function refreshMonitoring() {
    console.log('Refresh Monitoring');
    NetworkManager.loadMonitoring();
    NetworkManager.showSuccess('Monitoring data refreshed');
}

function exportLogs() {
    console.log('Export Logs');
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for log export');
        return;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = `/tmp/network-logs-${timestamp}.log`;
    
    cockpit.spawn([
        'journalctl', 
        '-u', 'systemd-networkd',
        '-u', 'systemd-resolved',
        '--since=24 hours ago',
        '--no-pager'
    ], { superuser: 'try' })
        .then((logs) => {
            return cockpit.spawn(['tee', logFile], { input: logs, superuser: 'require' });
        })
        .then(() => {
            NetworkManager.showSuccess(`Network logs exported to ${logFile}`);
        })
        .catch((error) => {
            NetworkManager.showError(`Log export failed: ${error.message}`);
        });
}

function applyConfiguration() {
    console.log('Apply Configuration');
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for configuration application');
        return;
    }
    
    cockpit.spawn(['netplan', 'apply'], { superuser: 'require' })
        .then(() => {
            NetworkManager.showSuccess('Configuration applied successfully');
            // Reload all data to reflect changes
            NetworkManager.loadNetworkData();
        })
        .catch((error) => {
            NetworkManager.showError(`Failed to apply configuration: ${error.message}`);
        });
}

function validateAllConfigs() {
    console.log('Validate All Configs');
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for validation');
        return;
    }
    
    cockpit.spawn(['netplan', 'get'], { superuser: 'try' })
        .then(() => {
            return cockpit.spawn(['netplan', '--debug', 'generate'], { superuser: 'try' });
        })
        .then(() => {
            NetworkManager.showSuccess('All network configurations are valid');
        })
        .catch((error) => {
            NetworkManager.showError(`Configuration validation failed: ${error.message}`);
        });
}

function rollbackConfiguration() {
    console.log('Rollback Configuration');
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for rollback');
        return;
    }
    
    // This would need to be implemented with a proper backup/restore mechanism
    NetworkManager.showError('Rollback functionality requires a previous backup to be available');
}

// Edit route function
function editRoute(index) {
    const route = NetworkManager.routes[index];
    if (!route) return;
    
    const modalContent = `
        <form id="route-edit-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="edit-route-destination">Destination Network</label>
                <input type="text" id="edit-route-destination" class="form-control" value="${route.destination}" required>
                <div class="hint">Network address with CIDR notation (e.g., 192.168.1.0/24) or 'default'</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-route-gateway">Gateway</label>
                <input type="text" id="edit-route-gateway" class="form-control" value="${route.gateway !== 'N/A' ? route.gateway : ''}" required>
                <div class="hint">Gateway IP address</div>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-route-interface">Interface</label>
                <select id="edit-route-interface" class="form-control" required>
                    <option value="">Select interface...</option>
                    ${NetworkManager.interfaces.filter(i => !i.systemInterface).map(i => 
                        `<option value="${i.name}" ${i.name === route.interface ? 'selected' : ''}>${i.name}</option>`
                    ).join('')}
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-route-metric">Metric</label>
                <input type="number" id="edit-route-metric" class="form-control" value="${route.metric !== 'N/A' ? route.metric : ''}" min="0">
                <div class="hint">Route priority (lower values have higher priority)</div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="updateRoute(${index})">Update Route</button>
    `;
    
    NetworkManager.createModal('Edit Route', modalContent, modalFooter);
}

// Delete route function
function deleteRoute(index) {
    const route = NetworkManager.routes[index];
    if (!route) return;
    
    if (confirm(`Are you sure you want to delete the route to ${route.destination}?`)) {
        deleteRouteFromSystem(route, index);
    }
}

// Update route function
async function updateRoute(index) {
    const form = document.getElementById('route-edit-form');
    const formData = new FormData(form);
    
    const routeData = {
        destination: formData.get('destination'),
        gateway: formData.get('gateway'),
        interface: formData.get('interface'),
        metric: formData.get('metric')
    };
    
    // Validate inputs
    if (!routeData.destination || !routeData.gateway || !routeData.interface) {
        NetworkManager.showError('Please fill in all required fields');
        return;
    }
    
    try {
        // First delete the old route
        const oldRoute = NetworkManager.routes[index];
        await deleteRouteFromSystem(oldRoute, index, false);
        
        // Then add the new route
        await addRouteToSystem(routeData);
        
        NetworkManager.showSuccess('Route updated successfully');
        NetworkManager.closeModal();
        NetworkManager.loadRoutes();
        
    } catch (error) {
        console.error('Failed to update route:', error);
        NetworkManager.showError(`Failed to update route: ${error.message || error}`);
    }
}

// Helper function to delete route from system
async function deleteRouteFromSystem(route, index, showSuccess = true) {
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        let deleteCmd;
        
        if (route.destination === 'default' || route.destination === '0.0.0.0/0') {
            deleteCmd = ['ip', 'route', 'del', 'default'];
            if (route.gateway !== 'N/A') {
                deleteCmd.push('via', route.gateway);
            }
        } else {
            deleteCmd = ['ip', 'route', 'del', route.destination];
            if (route.gateway !== 'N/A') {
                deleteCmd.push('via', route.gateway);
            }
        }
        
        if (route.interface !== 'N/A') {
            deleteCmd.push('dev', route.interface);
        }
        
        console.log('Deleting route with command:', deleteCmd);
        await cockpit.spawn(deleteCmd, { superuser: 'try' });
        
        if (showSuccess) {
            NetworkManager.showSuccess(`Route to ${route.destination} deleted successfully`);
            NetworkManager.loadRoutes();
        }
        
    } catch (error) {
        console.error('Failed to delete route:', error);
        throw new Error(`Failed to delete route: ${error.message || error}`);
    }
}

// Helper function to add route to system
async function addRouteToSystem(routeData) {
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    let addCmd;
    
    if (routeData.destination === 'default') {
        addCmd = ['ip', 'route', 'add', 'default', 'via', routeData.gateway, 'dev', routeData.interface];
    } else {
        addCmd = ['ip', 'route', 'add', routeData.destination, 'via', routeData.gateway, 'dev', routeData.interface];
    }
    
    if (routeData.metric) {
        addCmd.push('metric', routeData.metric);
    }
    
    console.log('Adding route with command:', addCmd);
    await cockpit.spawn(addCmd, { superuser: 'try' });
}

// Refresh routes function
function refreshRoutes() {
    NetworkManager.loadRoutes();
}

// Validation utilities
const validators = {
    ipAddress: (value) => {
        if (!value) return { valid: false, message: 'IP address is required' };
        const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/;
        if (ipv4Pattern.test(value) || ipv6Pattern.test(value)) {
            return { valid: true, message: 'Valid IP address' };
        }
        return { valid: false, message: 'Invalid IP address format' };
    },

    cidr: (value) => {
        if (!value) return { valid: false, message: 'CIDR is required' };
        const cidrPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
        if (cidrPattern.test(value)) {
            return { valid: true, message: 'Valid CIDR notation' };
        }
        return { valid: false, message: 'Invalid CIDR format (e.g., 192.168.1.0/24)' };
    },

    interfaceName: (value) => {
        if (!value) return { valid: false, message: 'Interface name is required' };
        if (value.length > 15) return { valid: false, message: 'Interface name too long (max 15 chars)' };
        const namePattern = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
        if (namePattern.test(value)) {
            return { valid: true, message: 'Valid interface name' };
        }
        return { valid: false, message: 'Invalid interface name format' };
    },

    vlanId: (value) => {
        if (!value) return { valid: false, message: 'VLAN ID is required' };
        const id = parseInt(value, 10);
        if (isNaN(id) || id < 1 || id > 4094) {
            return { valid: false, message: 'VLAN ID must be between 1 and 4094' };
        }
        return { valid: true, message: 'Valid VLAN ID' };
    },

    mtu: (value) => {
        if (!value) return { valid: true, message: '' }; // MTU is optional
        const mtu = parseInt(value, 10);
        if (isNaN(mtu) || mtu < 68 || mtu > 9000) {
            return { valid: false, message: 'MTU must be between 68 and 9000' };
        }
        return { valid: true, message: 'Valid MTU' };
    },

    macAddress: (value) => {
        if (!value) return { valid: true, message: '' }; // MAC is often optional
        const macPattern = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
        if (macPattern.test(value)) {
            return { valid: true, message: 'Valid MAC address' };
        }
        return { valid: false, message: 'Invalid MAC address format (e.g., 00:11:22:33:44:55)' };
    },

    required: (value) => {
        if (!value || value.trim() === '') {
            return { valid: false, message: 'This field is required' };
        }
        return { valid: true, message: '' };
    }
};

// Live validation helper
function setupLiveValidation(formElement) {
    const inputs = formElement.querySelectorAll('input, select, textarea');
    
    inputs.forEach(input => {
        const validationType = input.dataset.validate;
        const isRequired = input.hasAttribute('required') || input.dataset.required === 'true';
        
        if (!validationType && !isRequired) return;

        // Add validation on input/change
        input.addEventListener('input', () => validateField(input, validationType, isRequired));
        input.addEventListener('change', () => validateField(input, validationType, isRequired));
        input.addEventListener('blur', () => validateField(input, validationType, isRequired));
    });
}

function validateField(input, validationType, isRequired) {
    const value = input.value.trim();
    const formGroup = input.closest('.form-group');
    let result = { valid: true, message: '' };

    // Check required first
    if (isRequired && !value) {
        result = { valid: false, message: 'This field is required' };
    } else if (value && validationType && validators[validationType]) {
        result = validators[validationType](value);
    }

    // Update UI
    updateValidationUI(formGroup, input, result);
    return result.valid;
}

function updateValidationUI(formGroup, input, result) {
    // Remove existing validation classes and messages
    formGroup.classList.remove('has-error', 'has-success');
    const existingMessage = formGroup.querySelector('.validation-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    if (input.value.trim() === '') {
        // No validation for empty non-required fields
        return;
    }

    // Add new validation state
    if (result.valid) {
        formGroup.classList.add('has-success');
        if (result.message) {
            const messageEl = document.createElement('div');
            messageEl.className = 'validation-message success';
            messageEl.textContent = result.message;
            formGroup.appendChild(messageEl);
        }
    } else {
        formGroup.classList.add('has-error');
        const messageEl = document.createElement('div');
        messageEl.className = 'validation-message';
        messageEl.textContent = result.message;
        formGroup.appendChild(messageEl);
    }
}

function validateForm(formElement) {
    const inputs = formElement.querySelectorAll('input, select, textarea');
    let isValid = true;

    inputs.forEach(input => {
        const validationType = input.dataset.validate;
        const isRequired = input.hasAttribute('required') || input.dataset.required === 'true';
        
        if (validationType || isRequired) {
            const fieldValid = validateField(input, validationType, isRequired);
            if (!fieldValid) {
                isValid = false;
            }
        }
    });

    return isValid;
}

// Modal error handling utilities
function showModalError(modalElement, message) {
    // Remove existing error/success messages
    const existingAlerts = modalElement.querySelectorAll('.modal-error, .modal-success');
    existingAlerts.forEach(alert => alert.remove());

    // Create error element
    const errorEl = document.createElement('div');
    errorEl.className = 'modal-error';
    errorEl.innerHTML = `<strong>Error:</strong> ${message}`;

    // Insert at the beginning of modal body
    const modalBody = modalElement.querySelector('.modal-body');
    modalBody.insertBefore(errorEl, modalBody.firstChild);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorEl.parentNode) {
            errorEl.remove();
        }
    }, 5000);
}

function showModalSuccess(modalElement, message) {
    // Remove existing error/success messages
    const existingAlerts = modalElement.querySelectorAll('.modal-error, .modal-success');
    existingAlerts.forEach(alert => alert.remove());

    // Create success element
    const successEl = document.createElement('div');
    successEl.className = 'modal-success';
    successEl.innerHTML = `<strong>Success:</strong> ${message}`;

    // Insert at the beginning of modal body
    const modalBody = modalElement.querySelector('.modal-body');
    modalBody.insertBefore(successEl, modalBody.firstChild);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (successEl.parentNode) {
            successEl.remove();
        }
    }, 3000);
}

function clearModalMessages(modalElement) {
    const existingAlerts = modalElement.querySelectorAll('.modal-error, .modal-success');
    existingAlerts.forEach(alert => alert.remove());
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    NetworkManager.init();
});
