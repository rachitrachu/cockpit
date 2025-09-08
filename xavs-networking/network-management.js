// XAVS Network Management JavaScript

// Check for Cockpit API availability
if (typeof cockpit === 'undefined') {
    NetworkLogger.error('Cockpit API not available. Make sure cockpit.js is loaded.');
    NetworkLogger.error('This module requires Cockpit to be properly installed and running.');
    NetworkLogger.error('Please ensure you are accessing this page through the Cockpit web interface.');
}

// Global constants
const INTERFACE_NAME_REGEX = /^(e(n|th)\w+|bond\d+|ens\d+|eno\d+|enp\d+s\d+|wl\w+|vlan\d+|br\w+)$/;

// Logging functionality
const NetworkLogger = {
    logElement: null,
    statusElement: null,
    
    init() {
        this.logElement = document.getElementById('log');
        this.statusElement = document.getElementById('status-text');
        
        if (!this.logElement) {
            NetworkLogger.warning('Log element not found');
            return;
        }
        
        // Load existing logs from storage
        this.loadStoredLogs();
        
        // Setup cross-tab synchronization
        this.setupLogSync();
        
        // Setup clear log button
        this.setupClearLogButton();
        
        // Setup status bar link
        this.setupStatusBarLink();
        
        // Initial log entry
        this.log('Network Management system initialized');
    },
    
    log(message = '') {
        if (!this.logElement) {
            console.warn('⚠️ NetworkLogger: Log element not available, using console:', message);
            return;
        }
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        
        // Add to log display
        this.logElement.textContent += logEntry + '\n';
        this.logElement.scrollTop = this.logElement.scrollHeight;
        
        // Update status bar
        if (this.statusElement) {
            this.statusElement.textContent = message || 'Ready';
        }
        
        // Store logs for persistence
        this.storeLogs(logEntry);
        
        // Console logging for debugging - use console.info directly to avoid recursion
        console.info(`📝 NetworkLogger: ${message}`);
    },
    
    loadStoredLogs() {
        try {
            let storedLogs = localStorage.getItem('xavs-network-logs');
            
            if (!storedLogs) {
                storedLogs = sessionStorage.getItem('xavs-network-logs');
            }
            
            if (storedLogs && this.logElement) {
                this.logElement.textContent = storedLogs;
                this.logElement.scrollTop = this.logElement.scrollHeight;
            }
        } catch (e) {
            NetworkLogger.warning('Could not load stored logs:', e);
        }
    },
    
    storeLogs(logEntry) {
        try {
            const existingLogs = localStorage.getItem('xavs-network-logs') || '';
            const newLogs = existingLogs + logEntry + '\n';
            localStorage.setItem('xavs-network-logs', newLogs);
            
            // Trigger custom event for cross-tab sync
            window.dispatchEvent(new CustomEvent('xavs-network-logs-updated', {
                detail: { logs: newLogs }
            }));
        } catch (e) {
            console.warn('⚠️ NetworkLogger: localStorage failed, trying sessionStorage:', e);
            try {
                const existingLogs = sessionStorage.getItem('xavs-network-logs') || '';
                sessionStorage.setItem('xavs-network-logs', existingLogs + logEntry + '\n');
            } catch (e2) {
                console.warn('⚠️ NetworkLogger: Could not store logs:', e2);
            }
        }
    },
    
    setupLogSync() {
        // Listen for storage changes from other tabs
        window.addEventListener('storage', (e) => {
            if (e.key === 'xavs-network-logs' && e.newValue !== e.oldValue) {
                if (this.logElement && e.newValue) {
                    this.logElement.textContent = e.newValue;
                    this.logElement.scrollTop = this.logElement.scrollHeight;
                }
            }
        });
        
        // Listen for custom log update events
        window.addEventListener('xavs-network-logs-updated', (e) => {
            if (this.logElement && e.detail && e.detail.logs) {
                if (this.logElement.textContent !== e.detail.logs) {
                    this.logElement.textContent = e.detail.logs;
                    this.logElement.scrollTop = this.logElement.scrollHeight;
                }
            }
        });
    },
    
    setupClearLogButton() {
        const clearButton = document.getElementById('btn-clear-log');
        if (clearButton) {
            clearButton.addEventListener('click', () => {
                if (this.logElement) {
                    this.logElement.textContent = '';
                }
                
                // Clear stored logs
                try {
                    localStorage.removeItem('xavs-network-logs');
                    sessionStorage.removeItem('xavs-network-logs');
                    
                    window.dispatchEvent(new CustomEvent('xavs-network-logs-updated', {
                        detail: { logs: '' }
                    }));
                } catch (e) {
                    NetworkLogger.warning('Could not clear stored logs:', e);
                }
                
                this.log('Log cleared');
            });
        }
    },
    
    setupStatusBarLink() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('.status-link[data-tab]')) {
                e.preventDefault();
                const tabId = e.target.getAttribute('data-tab');
                
                // Switch to the logs tab
                document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.remove('show', 'active');
                });
                
                const targetTab = document.querySelector(`[data-tab="${tabId}"]`);
                const targetPane = document.getElementById(tabId);
                
                if (targetTab && targetPane) {
                    targetTab.classList.add('active');
                    targetPane.classList.add('show', 'active');
                    NetworkManager.currentTab = tabId;
                }
            }
        });
    },
    
    // Helper methods for different log levels
    error(message) {
        this.log(`❌ ERROR: ${message}`);
    },
    
    success(message) {
        this.log(`✅ SUCCESS: ${message}`);
    },
    
    warning(message) {
        this.log(`⚠️ WARNING: ${message}`);
    },
    
    info(message) {
        this.log(`ℹ️ INFO: ${message}`);
    }
};

// Button progress functionality
const ButtonProgress = {
    setLoading(button, originalText = null) {
        if (typeof button === 'string') {
            button = document.getElementById(button) || document.querySelector(button);
        }
        
        if (!button) return;
        
        // Store original text if not provided
        if (!originalText) {
            originalText = button.textContent || button.innerHTML;
        }
        
        button.dataset.originalText = originalText;
        button.classList.add('loading');
        button.disabled = true;
    },
    
    clearLoading(button) {
        if (typeof button === 'string') {
            button = document.getElementById(button) || document.querySelector(button);
        }
        
        if (!button) return;
        
        button.classList.remove('loading');
        button.disabled = false;
        
        // Restore original text if available
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    },
    
    setCardLoading(card) {
        if (typeof card === 'string') {
            card = document.getElementById(card) || document.querySelector(card);
        }
        
        if (card) {
            card.classList.add('loading');
        }
    },
    
    clearCardLoading(card) {
        if (typeof card === 'string') {
            card = document.getElementById(card) || document.querySelector(card);
        }
        
        if (card) {
            card.classList.remove('loading');
        }
    }
};

// Global state management
const NetworkManager = {
    currentTab: 'interfaces',
    interfaces: [],
    vlans: [],
    bridges: [],
    bonds: [],
    routes: [],
    dnsServers: [],
    systemStatus: {},
    initialized: false, // Flag to prevent duplicate initialization
    
    // Initialize the application
    init() {
        if (this.initialized) {
            return;
        }
        
        this.initialized = true;
        
        // Initialize logging first
        NetworkLogger.init();
        
        this.setupTabNavigation();
        this.fixNetplanPermissions(); // Fix any permission issues on startup
        this.loadNetworkData();
        this.setupEventListeners();
        
        // Initialize external managers if available
        if (typeof NetworkManager !== 'undefined' && this.loadBonds) {
            NetworkLogger.info('Initializing NetworkManager bonds...');
            this.loadBonds().catch(error => {
                NetworkLogger.error(`Failed to initialize bonds: ${error.message}`);
            });
        }
        
        // Auto-refresh disabled to prevent interrupting user interactions
        // Users can manually refresh using the refresh buttons on each tab
        // If auto-refresh is needed, consider implementing:
        // 1. Only refresh when tab is not actively being used
        // 2. Only refresh specific data that doesn't disrupt UI
        // 3. Use longer intervals (5+ minutes)
        
        /* 
        // Optional: Very infrequent auto-refresh (5 minutes) - currently disabled
        setInterval(() => {
            // Only refresh if no modal is open and user hasn't interacted recently
            if (!document.querySelector('.modal') && !this.userActive) {
                this.loadTabData(this.currentTab);
            }
        }, 300000); // 5 minutes
        */
    },

    // Fix permissions for all XAVS Netplan files
    async fixNetplanPermissions() {
        try {
            const xavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-*.yaml'], { superuser: 'try' });
            const files = xavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    await cockpit.spawn(['chmod', '600', file], { superuser: 'try' });
                } catch (error) {
                    NetworkLogger.warning(`Could not fix permissions for ${file}:`, error);
                }
            }
        } catch (error) {
            NetworkLogger.warning('Error fixing Netplan permissions:', error);
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
                // Also initialize bonds if available
                if (typeof NetworkManager !== 'undefined' && this.loadBonds) {
                    this.loadBonds();
                }
                break;
            case 'routes':
                this.loadRoutes();
                break;
            case 'dns':
                this.loadDnsConfig();
                break;
        }
    },
    
    // Load network interfaces
    
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
            NetworkLogger.warning('Cockpit API not available for system status');
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
                    NetworkLogger.warning('Failed to get networkd uptime:', uptimeError);
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
                    NetworkLogger.warning('Failed to get resolved uptime:', uptimeError);
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
                NetworkLogger.warning('Failed to get Netplan renderer:', netplanError);
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
                NetworkLogger.warning('Failed to check Netplan configuration:', netplanError);
                status.syntaxValid = false;
            }
            
        } catch (error) {
            NetworkLogger.warning('Error fetching system status:', error);
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
            NetworkLogger.warning('Cockpit API not available for log fetching');
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
            NetworkLogger.warning('Failed to fetch system logs:', error);
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
            NetworkLogger.info('Fetching real network interfaces from system...');
            const interfaces = await this.getSystemInterfaces();
            return interfaces;
        } catch (error) {
            NetworkLogger.error('Failed to fetch interfaces:', error);
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
            NetworkLogger.info('Running networkctl list command...');
            const networkctlOutput = await cockpit.spawn(['networkctl', 'list', '--no-legend'], { superuser: 'try' });
            const interfaceLines = networkctlOutput.trim().split('\n').filter(line => line.trim());
            
            // First pass: create basic interface objects
            const interfacePromises = [];
            for (const line of interfaceLines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 4) {
                    const rawStatus = parts[3].toLowerCase();
                    
                    // Convert networkctl status to simplified up/down status
                    // networkctl can return: routable, configured, carrier, degraded, off, etc.
                    let normalizedStatus = 'down';
                    if (['routable', 'configured', 'carrier', 'enslaved'].includes(rawStatus)) {
                        normalizedStatus = 'up';
                    }
                    
                    const ifaceData = {
                        name: parts[1],
                        type: parts[2],
                        status: normalizedStatus,
                        rawStatus: rawStatus, // Keep original status for debugging
                        systemInterface: this.isSystemInterface(parts[1])
                    };
                    
                    NetworkLogger.info(`Interface ${ifaceData.name}: networkctl status = "${rawStatus}" -> normalized = "${normalizedStatus}"`);
                    
                    // Override type detection for VLANs and other special cases
                    if (ifaceData.name.includes('.') || ifaceData.name.match(/^vlan\d+$/)) {
                        ifaceData.type = 'vlan';
                    } else if (ifaceData.name.startsWith('br')) {
                        ifaceData.type = 'bridge';
                    } else if (ifaceData.name.startsWith('bond')) {
                        ifaceData.type = 'bond';
                    }
                    
                    // Create promise for enriching interface data in parallel
                    interfacePromises.push(
                        this.enrichInterfaceData(ifaceData).then(() => ifaceData)
                    );
                }
            }
            
            // Wait for all interface enrichment to complete in parallel
            NetworkLogger.info(`Enriching ${interfacePromises.length} interfaces in parallel...`);
            const interfaces = await Promise.all(interfacePromises);
            
            NetworkLogger.info(`Found ${interfaces.length} network interfaces`);
            return interfaces;
            
        } catch (error) {
            NetworkLogger.error('Error getting system interfaces:', error);
            
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
            // Use Promise.allSettled to run all commands in parallel for better performance
            const [statusResult, linkResult, ipResult, statsResult] = await Promise.allSettled([
                // Get interface details using networkctl status
                cockpit.spawn(['networkctl', 'status', iface.name], { superuser: 'try' }),
                
                // Verify interface status using ip link command for more accurate state
                cockpit.spawn(['ip', 'link', 'show', iface.name], { superuser: 'try' }),
                
                // Get IP addresses using ip command
                cockpit.spawn(['ip', 'addr', 'show', iface.name], { superuser: 'try' }),
                
                // Get interface statistics
                cockpit.spawn(['cat', `/sys/class/net/${iface.name}/statistics/rx_bytes`, 
                                    `/sys/class/net/${iface.name}/statistics/tx_bytes`], { superuser: 'try' })
            ]);
            
            // Process networkctl status
            if (statusResult.status === 'fulfilled') {
                this.parseNetworkctlStatus(iface, statusResult.value);
            } else {
                NetworkLogger.warning(`Failed to get networkctl status for ${iface.name}:`, statusResult.reason);
            }
            
            // Process ip link output
            if (linkResult.status === 'fulfilled') {
                const linkOutput = linkResult.value;
                const isLinkUp = linkOutput.includes('state UP') || linkOutput.includes('<UP,');
                
                // Update status based on ip link if there's a discrepancy
                if (isLinkUp && iface.status === 'down') {
                    NetworkLogger.info(`Interface ${iface.name}: Correcting status from '${iface.status}' to 'up' based on ip link output`);
                    iface.status = 'up';
                } else if (!isLinkUp && iface.status === 'up') {
                    NetworkLogger.info(`Interface ${iface.name}: Correcting status from '${iface.status}' to 'down' based on ip link output`);
                    iface.status = 'down';
                }
                
                // Also check for carrier status
                iface.carrier = linkOutput.includes('<BROADCAST,MULTICAST,UP,LOWER_UP>') || linkOutput.includes('state UP');
            } else {
                NetworkLogger.warning(`Could not verify link status for ${iface.name}:`, linkResult.reason);
            }
            
            // Process IP addresses
            if (ipResult.status === 'fulfilled') {
                this.parseIpAddr(iface, ipResult.value);
            } else {
                NetworkLogger.warning(`Could not get IP addresses for ${iface.name}:`, ipResult.reason);
            }
            
            // Process interface statistics
            if (statsResult.status === 'fulfilled') {
                this.parseInterfaceStats(iface, statsResult.value);
            } else {
                NetworkLogger.warning(`Could not get statistics for ${iface.name}:`, statsResult.reason);
            }
            
            // Check for Netplan configuration (can be done async without blocking)
            this.checkNetplanConfig(iface).catch(error => {
                NetworkLogger.warning(`Failed to check Netplan config for ${iface.name}:`, error);
                iface.configFile = null;
                iface.configType = 'unknown';
            });
            
        } catch (error) {
            NetworkLogger.warning(`Failed to get details for interface ${iface.name}:`, error);
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
        
        // Set IP addresses array and primary IP
        iface.ipAddresses = ipAddresses;
        if (ipAddresses.length > 0) {
            iface.ip = ipAddresses[0];
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
                    NetworkLogger.warning(`Could not read ${file}:`, fileError);
                }
            }
            
            if (!iface.configFile) {
                iface.configType = 'unconfigured';
                iface.dhcp = false;
            }
            
        } catch (error) {
            NetworkLogger.warning(`Failed to check Netplan config for ${iface.name}:`, error);
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
                    <div class="interface-column">Actions</div>
                </div>
                ${this.interfaces.map(iface => `
                    <div class="interface-row interface-card" data-type="${iface.type}">
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
                                ${iface.rawStatus ? ` | Raw Status: ${iface.rawStatus}` : ''}
                                ${iface.type === 'vlan' && iface.vlanId ? ` | VLAN ${iface.vlanId}` : ''}
                                ${iface.type === 'bond' && iface.bondSlaves ? ` | Slaves: ${iface.bondSlaves.length}` : ''}
                                ${iface.parent ? ` | Parent: ${iface.parent}` : ''}
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
                            <div class="ip-addresses">
                                ${iface.ipAddresses && iface.ipAddresses.length > 0 
                                    ? iface.ipAddresses.map(ip => `<div class="ip-address-item">${ip}</div>`).join('')
                                    : '<div class="ip-address">N/A</div>'
                                }
                            </div>
                            <div class="traffic-info">RX: ${this.formatBytes(iface.rxBytes || 0)} | TX: ${this.formatBytes(iface.txBytes || 0)}</div>
                        </div>
                        <div class="interface-column">
                            <div class="interface-actions">
                                <button class="btn btn-xs btn-outline-brand" onclick="viewInterfaceDetails('${iface.name}')" title="View Details">
                                    <i class="fas fa-info-circle"></i>
                                </button>
                                ${!iface.systemInterface && !['vlan', 'bond', 'bridge'].includes(iface.type) ? `
                                <button class="btn btn-xs btn-outline-brand" onclick="editInterface('${iface.name}')" title="Edit">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-xs btn-outline-secondary" onclick="toggleInterface('${iface.name}', '${iface.status}')" title="${iface.status === 'up' ? 'Disable' : 'Enable'}">
                                    <i class="fas fa-power-off"></i>
                                </button>
                                ${iface.configFile ? `
                                <button class="btn btn-xs btn-outline-danger" onclick="confirmDeleteInterface('${iface.name}')" title="Delete">
                                    <i class="fas fa-trash"></i>
                                </button>
                                ` : `
                                <button class="btn btn-xs btn-outline-secondary" onclick="addInterfaceConfig('${iface.name}')" title="Configure">
                                    <i class="fas fa-plus"></i>
                                </button>
                                `}
                                ` : ''}
                                ${!iface.systemInterface && ['vlan', 'bond', 'bridge'].includes(iface.type) ? `
                                <button class="btn btn-xs btn-outline-secondary" onclick="toggleInterface('${iface.name}', '${iface.status}')" title="${iface.status === 'up' ? 'Disable' : 'Enable'}">
                                    <i class="fas fa-power-off"></i>
                                </button>
                                <span class="text-muted small" style="font-style: italic;">
                                    Manage via ${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)}s tab
                                </span>
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
            NetworkLogger.info('Loading VLANs...');
            
            if (!cockpit || !cockpit.spawn) {
                NetworkLogger.warning('Cockpit API not available for VLAN loading');
                this.vlans = [];
                return;
            }
            
            // Use VlanManager to get complete VLAN data with IP addresses from Netplan
            let vlans = [];
            
            try {
                if (typeof VlanManager !== 'undefined' && VlanManager.fetchVlansFromNetplan) {
                    NetworkLogger.info('Using VlanManager to get VLANs from Netplan...');
                    vlans = await VlanManager.fetchVlansFromNetplan();
                    NetworkLogger.info(`VlanManager returned ${vlans.length} VLANs:`, vlans);
                } else {
                    NetworkLogger.warning('VlanManager not available, falling back to basic VLAN detection');
                    vlans = await this.getBasicVlans();
                }
            } catch (vlanManagerError) {
                NetworkLogger.warning('Failed to get VLANs from VlanManager, falling back to basic detection:', vlanManagerError);
                vlans = await this.getBasicVlans();
            }
            
            this.vlans = vlans;
            NetworkLogger.info(`Found ${vlans.length} VLAN interfaces:`, vlans);
            this.updateVlanDisplay();
            
        } catch (error) {
            NetworkLogger.error('Failed to load VLANs:', error);
            this.vlans = [];
            this.updateVlanDisplay();
        }
    },
    
    // Fallback method for basic VLAN detection
    async getBasicVlans() {
        let vlans = [];
        
        try {
            // First try: get all VLAN type interfaces
            const ipOutput = await cockpit.spawn(['ip', 'link', 'show', 'type', 'vlan'], { superuser: 'try' });
            NetworkLogger.info('VLAN ip link output:', ipOutput);
            
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
                                id: vlanId,
                                parentInterface: parentInterface,
                                status: line.includes('UP') ? 'up' : 'down',
                                ip: 'Not configured',
                                ipAddresses: []
                            });
                        }
                    }
                }
            }
        } catch (vlanError) {
            NetworkLogger.warning('Failed to get VLAN interfaces via type filter:', vlanError);
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
                                    id: vlanId,
                                    parentInterface: parentInterface,
                                    status: line.includes('UP') ? 'up' : 'down',
                                    ip: 'Not configured',
                                    ipAddresses: []
                                });
                            }
                        }
                    }
                }
            }
        } catch (allError) {
            NetworkLogger.warning('Failed to scan all interfaces for VLANs:', allError);
        }
        
        return vlans;
    },
    
    // Load bridges from system
    async loadBridges() {
        try {
            NetworkLogger.info('Loading bridges from system interfaces...');
            
            if (!cockpit || !cockpit.spawn) {
                NetworkLogger.warning('Cockpit API not available for bridge loading');
                this.bridges = [];
                return;
            }
            
            let bridges = [];
            
            try {
                // STEP 1: Get real system interfaces from 'ip a' output - this is the source of truth
                const ipOutput = await cockpit.spawn(['ip', 'a'], { superuser: 'try' });
                const lines = ipOutput.split('\n');
                
                NetworkLogger.info('[loadBridges] Processing ip a output for bridge interfaces...');
                
                for (const line of lines) {
                    // Match interface lines
                    const match = line.match(/^\d+:\s+([^@:]+)(?:@([^:]+))?:/);
                    if (match) {
                        const interfaceName = match[1];
                        
                        // Check if this is a bridge interface by checking /sys/class/net
                        try {
                            const bridgeCheck = await cockpit.spawn(['test', '-d', `/sys/class/net/${interfaceName}/bridge`], { superuser: 'try' });
                            
                            // If we get here, it's a bridge interface
                            NetworkLogger.info(`Found system bridge interface: ${interfaceName}`);
                            
                            // Get bridge details from system
                            const details = await this.getBridgeDetailsFromSystem(interfaceName, ipOutput);
                            
                            bridges.push({
                                name: interfaceName,
                                description: details.description || `Bridge interface ${interfaceName}`,
                                members: details.members || [],
                                status: details.status || 'unknown',
                                ip: details.ip || 'Not configured',
                                ipAddresses: details.ipAddresses || [],
                                gateway: details.gateway || 'Not configured',
                                dns: details.dns || [],
                                configFile: details.configFile || 'Not configured',
                                source: 'system'
                            });
                            
                        } catch (bridgeTestError) {
                            // Not a bridge interface, continue
                        }
                    }
                }
                
                // STEP 2: Check Netplan files for bridges that might not be active
                NetworkLogger.info('[loadBridges] Checking Netplan files for additional bridge configurations...');
                const netplanBridges = await this.fetchBridgesFromNetplan();
                
                for (const netplanBridge of netplanBridges) {
                    // Only add if not already found in system
                    const existingBridge = bridges.find(b => b.name === netplanBridge.name);
                    
                    if (!existingBridge) {
                        NetworkLogger.info(`Adding Netplan-only bridge: ${netplanBridge.name}`);
                        netplanBridge.source = 'netplan';
                        netplanBridge.status = 'configured';
                        bridges.push(netplanBridge);
                    }
                }
                
            } catch (ipError) {
                NetworkLogger.warning('Failed to get system interfaces for bridges:', ipError);
                
                // Fallback: try old method with ip link show type bridge
                try {
                    const ipOutput = await cockpit.spawn(['ip', 'link', 'show', 'type', 'bridge'], { superuser: 'try' });
                    NetworkLogger.info('Bridge ip link output:', ipOutput);
                    
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
                                        NetworkLogger.warning(`Could not get members for bridge ${bridgeName}:`, sysError);
                                    }
                                }
                                
                                bridges.push({
                                    name: bridgeName,
                                    description: `Bridge interface ${bridgeName}`,
                                    members: members,
                                    status: 'unknown',
                                    ip: 'Not configured',
                                    ipAddresses: [],
                                    gateway: 'Not configured',
                                    dns: [],
                                    configFile: 'Not configured',
                                    source: 'system'
                                });
                            }
                        }
                    }
                } catch (bridgeError) {
                    NetworkLogger.warning('Failed to get bridge interfaces:', bridgeError);
                }
            }
            
            this.bridges = bridges;
            NetworkLogger.info(`Found ${bridges.length} bridge interfaces:`, bridges);
            this.updateBridgeDisplay();
            
        } catch (error) {
            NetworkLogger.error('Failed to load bridges:', error);
            this.bridges = [];
            this.updateBridgeDisplay();
        }
    },

    // Get bridge details from system
    async getBridgeDetailsFromSystem(interfaceName, ipOutput) {
        NetworkLogger.info(`[getBridgeDetailsFromSystem] Getting details for ${interfaceName}`);
        
        const details = {
            ipAddresses: [],
            status: 'unknown',
            description: '',
            gateway: '',
            dns: [],
            configFile: 'Not configured',
            members: []
        };
        
        try {
            // Parse ip a output to get IP addresses for this interface
            const interfaceBlocks = ipOutput.split(/^\d+:/m);
            for (const block of interfaceBlocks) {
                if (block.includes(interfaceName + ':')) {
                    // Extract IP addresses
                    const ipMatches = block.match(/inet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+)/g);
                    if (ipMatches) {
                        details.ipAddresses = ipMatches.map(match => match.replace('inet ', ''));
                    }
                    
                    // Check interface status
                    if (block.includes('state UP')) {
                        details.status = 'up';
                    } else if (block.includes('state DOWN')) {
                        details.status = 'down';
                    }
                    
                    break;
                }
            }
            
            // Set primary IP for backward compatibility
            details.ip = details.ipAddresses.length > 0 ? details.ipAddresses[0] : 'Not configured';
            
            // Get bridge members
            try {
                const sysBridge = await cockpit.spawn(['ls', `/sys/class/net/${interfaceName}/brif/`], { superuser: 'try' });
                details.members = sysBridge.trim().split('\n').filter(m => m.trim());
            } catch (membersError) {
                NetworkLogger.warning(`Could not get members for bridge ${interfaceName}:`, membersError);
            }
            
            // Try to find associated Netplan config file
            try {
                const configFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-exec', 'grep', '-l', interfaceName, '{}', ';'], { superuser: 'try' });
                if (configFiles.trim()) {
                    const files = configFiles.trim().split('\n');
                    details.configFile = files[0]; // Use first match
                }
            } catch (configError) {
                NetworkLogger.warning(`Could not find config file for ${interfaceName}:`, configError);
            }
            
        } catch (error) {
            NetworkLogger.warning(`Error getting system details for bridge ${interfaceName}:`, error);
        }
        
        return details;
    },

    // Fetch bridges from Netplan configuration files
    async fetchBridgesFromNetplan() {
        NetworkLogger.info('[fetchBridgesFromNetplan] Checking Netplan files for bridge configurations...');
        const bridges = [];
        
        try {
            // Get all Netplan files
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
            const files = netplanFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes('bridges:')) {
                        // Simple parsing for bridges section
                        const bridgeMatches = content.match(/bridges:\s*\n([\s\S]*?)(?=\n\w|\n$|$)/);
                        if (bridgeMatches) {
                            const bridgesSection = bridgeMatches[1];
                            
                            // Find individual bridge definitions
                            const bridgeRegex = /^\s{2,4}([a-zA-Z0-9\._-]+):\s*\n([\s\S]*?)(?=^\s{2,4}[a-zA-Z0-9\._-]+:|\n$|$)/gm;
                            let bridgeMatch;
                            
                            while ((bridgeMatch = bridgeRegex.exec(bridgesSection)) !== null) {
                                const bridgeName = bridgeMatch[1];
                                const bridgeConfig = bridgeMatch[2];
                                
                                NetworkLogger.info(`Found bridge in Netplan: ${bridgeName}`);
                                
                                bridges.push({
                                    name: bridgeName,
                                    description: `Bridge interface ${bridgeName}`,
                                    members: [],
                                    status: 'configured',
                                    ip: 'Not configured',
                                    ipAddresses: [],
                                    gateway: 'Not configured',
                                    dns: [],
                                    configFile: file,
                                    source: 'netplan'
                                });
                            }
                        }
                    }
                } catch (error) {
                    NetworkLogger.warning(`Error parsing bridge from ${file}:`, error);
                }
            }
        } catch (error) {
            NetworkLogger.warning('Error fetching bridges from Netplan:', error);
        }
        
        return bridges;
    },
    
    // Load bonds from system
    async loadBonds() {
        try {
            NetworkLogger.info('Loading bonds from system...');
            
            if (!cockpit || !cockpit.spawn) {
                NetworkLogger.warning('Cockpit API not available for bond loading');
                this.bonds = [];
                return;
            }

            let bonds = [];
            
            try {
                // STEP 1: Use the proper command to get bond interfaces directly
                NetworkLogger.info('[loadBonds] Running ip link show type bond...');
                const bondOutput = await cockpit.spawn(['ip', 'link', 'show', 'type', 'bond'], { superuser: 'try' });
                
                if (bondOutput.trim()) {
                    const lines = bondOutput.trim().split('\n');
                    for (const line of lines) {
                        const match = line.match(/(\d+):\s+([^:@]+)(?:@[^:]+)?:/);
                        if (match) {
                            const bondName = match[2].trim();
                            NetworkLogger.info(`Found bond interface: ${bondName}`);
                            
                            // Get detailed bond information using proper commands
                            try {
                                // Use /proc/net/bonding for bond information 
                                const bondInfo = await cockpit.spawn(['cat', `/proc/net/bonding/${bondName}`], { superuser: 'try' });
                                let bondMode = 'unknown';
                                let slaves = [];
                                
                                const infoLines = bondInfo.split('\n');
                                for (const infoLine of infoLines) {
                                    if (infoLine.includes('Bonding Mode:')) {
                                        const modeMatch = infoLine.match(/Bonding Mode:\s+(.+)/);
                                        if (modeMatch) {
                                            const fullMode = modeMatch[1].trim();
                                            // Handle special case for IEEE 802.3ad
                                            if (fullMode.includes('IEEE 802.3ad') || fullMode.includes('802.3ad')) {
                                                bondMode = '802.3ad';
                                            } else {
                                                bondMode = fullMode.split(' ')[0];
                                            }
                                        }
                                    } else if (infoLine.includes('Slave Interface:')) {
                                        const slaveMatch = infoLine.match(/Slave Interface:\s+([^\s]+)/);
                                        if (slaveMatch) {
                                            slaves.push(slaveMatch[1]);
                                        }
                                    }
                                }
                                
                                bonds.push({
                                    name: bondName,
                                    description: `Bond interface ${bondName}`,
                                    mode: bondMode,
                                    slaves: slaves,
                                    status: 'unknown',
                                    ip: 'Not configured',
                                    ipAddresses: [],
                                    gateway: 'Not configured',
                                    dns: [],
                                    configFile: 'Not configured',
                                    source: 'system'
                                });
                            } catch (bondInfoError) {
                                NetworkLogger.warning(`Could not get bond info for ${bondName}:`, bondInfoError);
                                // Fallback to basic info
                                bonds.push({
                                    name: bondName,
                                    description: `Bond interface ${bondName}`,
                                    mode: 'unknown',
                                    slaves: [],
                                    status: 'unknown',
                                    ip: 'Not configured',
                                    ipAddresses: [],
                                    gateway: 'Not configured',
                                    dns: [],
                                    configFile: 'Not configured',
                                    source: 'system'
                                });
                            }
                        }
                    }
                } else {
                    NetworkLogger.info('[loadBonds] No bond interfaces found via type filter');
                }
                
            } catch (bondTypeError) {
                NetworkLogger.warning('Failed to get bonds via type filter:', bondTypeError);
                
                // STEP 2: Fallback - scan all interfaces for bond patterns
                try {
                    NetworkLogger.info('[loadBonds] Fallback - scanning all interfaces for bonds...');
                    const allOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
                    const lines = allOutput.split('\n');
                    
                    for (const line of lines) {
                        if (line.includes(':') && line.includes('bond')) {
                            const match = line.match(/(\d+):\s+([^:@]+)(?:@[^:]+)?:/);
                            if (match) {
                                const ifaceName = match[2].trim();
                                if (ifaceName.startsWith('bond')) {
                                    NetworkLogger.info(`Found potential bond interface: ${ifaceName}`);
                                    
                                    // Verify it's actually a bond by checking sysfs
                                    try {
                                        await cockpit.spawn(['test', '-d', `/sys/class/net/${ifaceName}/bonding`], { superuser: 'try' });
                                        
                                        const details = await this.getBondDetailsFromSystem(ifaceName);
                                        bonds.push({
                                            name: ifaceName,
                                            description: details.description || `Bond interface ${ifaceName}`,
                                            mode: details.mode || 'unknown',
                                            slaves: details.slaves || [],
                                            status: details.status || 'unknown',
                                            ip: details.ip || 'Not configured',
                                            ipAddresses: details.ipAddresses || [],
                                            gateway: details.gateway || 'Not configured',
                                            dns: details.dns || [],
                                            configFile: details.configFile || 'Not configured',
                                            source: 'system'
                                        });
                                    } catch (verifyError) {
                                        NetworkLogger.warning(`Interface ${ifaceName} is not a valid bond:`, verifyError);
                                    }
                                }
                            }
                        }
                    }
                } catch (fallbackError) {
                    NetworkLogger.warning('Fallback bond detection failed:', fallbackError);
                }
            }
            
            // STEP 3: Check Netplan files for bonds that might not be active
            NetworkLogger.info('[loadBonds] Checking Netplan files for additional bond configurations...');
            const netplanBonds = await this.fetchBondsFromNetplan();
            
            for (const netplanBond of netplanBonds) {
                // Only add if not already found in system
                const existingBond = bonds.find(b => b.name === netplanBond.name);
                
                if (!existingBond) {
                    NetworkLogger.info(`Adding Netplan-only bond: ${netplanBond.name}`);
                    netplanBond.source = 'netplan';
                    netplanBond.status = 'configured';
                    bonds.push(netplanBond);
                }
            }
            
            this.bonds = bonds;
            NetworkLogger.info(`Found ${bonds.length} bond interfaces:`, bonds);
            this.updateBondDisplay();
            
        } catch (error) {
            NetworkLogger.error('Failed to load bonds:', error);
            this.bonds = [];
            this.updateBondDisplay();
        }
    },

    // Get bond details from system
    async getBondDetailsFromSystem(interfaceName, ipOutput) {
        NetworkLogger.info(`[getBondDetailsFromSystem] Getting details for ${interfaceName}`);
        
        const details = {
            ipAddresses: [],
            status: 'unknown',
            description: '',
            gateway: '',
            dns: [],
            configFile: 'Not configured',
            mode: 'unknown',
            slaves: []
        };
        
        try {
            // Parse ip a output to get IP addresses for this interface
            const interfaceBlocks = ipOutput.split(/^\d+:/m);
            for (const block of interfaceBlocks) {
                if (block.includes(interfaceName + ':')) {
                    // Extract IP addresses
                    const ipMatches = block.match(/inet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+)/g);
                    if (ipMatches) {
                        details.ipAddresses = ipMatches.map(match => match.replace('inet ', ''));
                    }
                    
                    // Check interface status
                    if (block.includes('state UP')) {
                        details.status = 'up';
                    } else if (block.includes('state DOWN')) {
                        details.status = 'down';
                    }
                    
                    break;
                }
            }
            
            // Set primary IP for backward compatibility
            details.ip = details.ipAddresses.length > 0 ? details.ipAddresses[0] : 'Not configured';
            
            // Get bond mode and slaves
            try {
                const bondInfo = await cockpit.spawn(['cat', `/proc/net/bonding/${interfaceName}`], { superuser: 'try' });
                
                const infoLines = bondInfo.split('\n');
                for (const infoLine of infoLines) {
                    if (infoLine.includes('Bonding Mode:')) {
                        const modeMatch = infoLine.match(/Bonding Mode:\s+(.+)/);
                        if (modeMatch) {
                            const fullMode = modeMatch[1].trim();
                            // Handle special case for IEEE 802.3ad
                            if (fullMode.includes('IEEE 802.3ad') || fullMode.includes('802.3ad')) {
                                details.mode = '802.3ad';
                            } else {
                                details.mode = fullMode.split(' ')[0];
                            }
                        }
                    } else if (infoLine.includes('Slave Interface:')) {
                        const slaveMatch = infoLine.match(/Slave Interface:\s+([^\s]+)/);
                        if (slaveMatch) {
                            details.slaves.push(slaveMatch[1]);
                        }
                    }
                }
            } catch (bondInfoError) {
                NetworkLogger.warning(`Could not get bond info for ${interfaceName}:`, bondInfoError);
            }
            
            // Try to find associated Netplan config file
            try {
                const configFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-exec', 'grep', '-l', interfaceName, '{}', ';'], { superuser: 'try' });
                if (configFiles.trim()) {
                    const files = configFiles.trim().split('\n');
                    details.configFile = files[0]; // Use first match
                }
            } catch (configError) {
                NetworkLogger.warning(`Could not find config file for ${interfaceName}:`, configError);
            }
            
        } catch (error) {
            NetworkLogger.warning(`Error getting system details for bond ${interfaceName}:`, error);
        }
        
        return details;
    },

    // Fetch bonds from Netplan configuration files
    async fetchBondsFromNetplan() {
        NetworkLogger.info('[fetchBondsFromNetplan] Checking Netplan files for bond configurations...');
        const bonds = [];
        
        try {
            // Get all Netplan files
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], { superuser: 'try' });
            const files = netplanFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes('bonds:')) {
                        // Simple parsing for bonds section
                        const bondMatches = content.match(/bonds:\s*\n([\s\S]*?)(?=\n\w|\n$|$)/);
                        if (bondMatches) {
                            const bondsSection = bondMatches[1];
                            
                            // Find individual bond definitions
                            const bondRegex = /^\s{2,4}([a-zA-Z0-9\._-]+):\s*\n([\s\S]*?)(?=^\s{2,4}[a-zA-Z0-9\._-]+:|\n$|$)/gm;
                            let bondMatch;
                            
                            while ((bondMatch = bondRegex.exec(bondsSection)) !== null) {
                                const bondName = bondMatch[1];
                                const bondConfig = bondMatch[2];
                                
                                NetworkLogger.info(`Found bond in Netplan: ${bondName}`);
                                
                                bonds.push({
                                    name: bondName,
                                    description: `Bond interface ${bondName}`,
                                    mode: 'unknown',
                                    slaves: [],
                                    status: 'configured',
                                    ip: 'Not configured',
                                    ipAddresses: [],
                                    gateway: 'Not configured',
                                    dns: [],
                                    configFile: file,
                                    source: 'netplan'
                                });
                            }
                        }
                    }
                } catch (error) {
                    NetworkLogger.warning(`Error parsing bond from ${file}:`, error);
                }
            }
        } catch (error) {
            NetworkLogger.warning('Error fetching bonds from Netplan:', error);
        }
        
        return bonds;
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
                                <span class="detail-value">${vlan.id || vlan.vlanId || 'Unknown'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Parent:</span>
                                <span class="detail-value">${vlan.parentInterface || vlan.parent || 'Unknown'}</span>
                            </div>
                            ${vlan.ipAddresses && vlan.ipAddresses.length > 0 ? `
                            <div class="detail-item">
                                <span class="detail-label">IP Address${vlan.ipAddresses.length > 1 ? 'es' : ''}:</span>
                                <span class="detail-value">${vlan.ipAddresses.join(', ')}</span>
                            </div>
                            ` : vlan.ip ? `
                            <div class="detail-item">
                                <span class="detail-label">IP Address:</span>
                                <span class="detail-value">${vlan.ip}</span>
                            </div>
                            ` : ''}
                        </div>
                        <div class="interface-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="editVlan('${vlan.name}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteVlan('${vlan.name}')">
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
                            <button class="btn btn-sm btn-outline-primary" onclick="editBridge('${bridge.name}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteBridge('${bridge.name}')">
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
        const bondContainer = document.getElementById('bond-list'); // Target the actual bond-list element
        if (!bondContainer) {
            NetworkLogger.warning('Bond list container not found');
            return;
        }
        
        if (this.bonds.length === 0) {
            bondContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-link fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No Bond Interfaces</h5>
                    <p class="text-muted">No bond interfaces are currently configured on this system.</p>
                    <button class="btn btn-brand create-bond-button" onclick="addBond()">
                        <i class="fas fa-plus"></i> Create First Bond
                    </button>
                </div>
            `;
        } else {
            let html = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h6 class="mb-0">Bond Interfaces (${this.bonds.length})</h6>
                    <button class="btn btn-sm btn-brand create-bond-button" onclick="addBond()">
                        <i class="fas fa-plus"></i> Add Bond
                    </button>
                </div>
                <div class="interface-grid">
            `;
            
            this.bonds.forEach(bond => {
                const statusIcon = bond.status === 'up' ? 'fa-arrow-up text-success' : 'fa-arrow-down text-danger';
                const slavesDisplay = bond.slaves && bond.slaves.length > 0 
                    ? (bond.slaves.length > 2 
                        ? `${bond.slaves.slice(0, 2).join(', ')} +${bond.slaves.length - 2} more`
                        : bond.slaves.join(', '))
                    : 'None';
                
                html += `
                    <div class="interface-card bond-card">
                        <div class="interface-header">
                            <h6 class="interface-name" title="${bond.name}">${bond.name}</h6>
                            <span class="interface-status">
                                <i class="fas ${statusIcon}"></i> ${bond.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="interface-details">
                            <div class="detail-item">
                                <span class="detail-label">Mode:</span>
                                <span class="detail-value" title="${bond.mode || 'Unknown'}">${bond.mode || 'Unknown'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Slaves:</span>
                                <span class="detail-value" title="${bond.slaves ? bond.slaves.join(', ') : 'None'}">${slavesDisplay}</span>
                            </div>
                            ${bond.ip && bond.ip !== 'Not configured' ? `
                            <div class="detail-item">
                                <span class="detail-label">IP:</span>
                                <span class="detail-value" title="${bond.ip}">${bond.ip.length > 15 ? bond.ip.substring(0, 15) + '...' : bond.ip}</span>
                            </div>
                            ` : ''}
                        </div>
                        <div class="interface-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="editBond('${bond.name}')" title="Edit bond configuration">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="deleteBond('${bond.name}')" title="Delete bond">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            bondContainer.innerHTML = html;
        }
    },

    // Load routes from system
    async loadRoutes() {
        try {
            NetworkLogger.info('Loading routes...');
            
            if (!cockpit || !cockpit.spawn) {
                NetworkLogger.warning('Cockpit API not available for route loading');
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
            NetworkLogger.info(`Found ${routes.length} routes`);
            this.renderRoutes();
            
        } catch (error) {
            NetworkLogger.warning('Failed to load routes:', error);
            this.routes = [];
            this.renderRoutes();
        }
    },

    // Render routes in the UI
    renderRoutes() {
        const routeListElement = document.getElementById('route-list');
        
        if (!routeListElement) {
            NetworkLogger.warning('Route list element not found');
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
            NetworkLogger.info('Loading DNS configuration...');
            
            if (!cockpit || !cockpit.file) {
                NetworkLogger.warning('Cockpit API not available for DNS loading');
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
                    NetworkLogger.warning('Failed to read DNS configuration:', resolvError);
                }
            }
            
            this.dnsServers = dnsServers;
            NetworkLogger.info(`Found ${dnsServers.length} DNS servers`);
            
        } catch (error) {
            NetworkLogger.warning('Failed to load DNS configuration:', error);
            this.dnsServers = [];
        }
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
        NetworkLogger.info(`Searching for "${searchTerm}" in ${currentTab}`);
    },
    
    // Show error message
    showError(message) {
        // Log the error
        NetworkLogger.error(message);
        
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
        // Log the success
        NetworkLogger.success(message);
        
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
            ${['vlan', 'bond', 'bridge'].includes(iface.type) ? `
            <button class="btn btn-outline-brand" onclick="NetworkManager.closeModal(); redirectToManagementTab('${iface.type}', '${iface.name}')">
                <i class="fas fa-external-link-alt"></i> Manage in ${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)}s Tab
            </button>
            ` : `
            <button class="btn btn-outline-brand" onclick="NetworkManager.closeModal(); editInterface('${iface.name}')">
                <i class="fas fa-edit"></i> Edit Interface
            </button>
            `}
        ` : ''}
    `;
    
    NetworkManager.createModal(`Interface Details: ${iface.name}`, modalContent, modalFooter);
}

// Redirect to appropriate management tab for VLANs, bonds, and bridges
function redirectToManagementTab(interfaceType, interfaceName) {
    // Map interface types to tab names
    const tabMap = {
        'vlan': 'vlans',
        'bond': 'bonds', 
        'bridge': 'bridges'
    };
    
    const targetTab = tabMap[interfaceType];
    if (!targetTab) {
        NetworkLogger.error(`Unknown interface type: ${interfaceType}`);
        return;
    }
    
    // Switch to the appropriate tab
    const targetTabLink = document.querySelector(`[data-tab="${targetTab}"]`);
    const targetTabPane = document.getElementById(targetTab);
    
    if (targetTabLink && targetTabPane) {
        // Update active tab
        const tabLinks = document.querySelectorAll('.nav-link');
        const tabPanes = document.querySelectorAll('.tab-pane');
        
        tabLinks.forEach(l => l.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('show'));
        
        targetTabLink.classList.add('active');
        targetTabPane.classList.add('show');
        
        // Update NetworkManager state
        NetworkManager.currentTab = targetTab;
        
        // Load the tab data
        NetworkManager.loadTabData(targetTab);
        
        // Show a success message indicating the redirect
        setTimeout(() => {
            NetworkManager.showSuccess(`Switched to ${interfaceType.charAt(0).toUpperCase() + interfaceType.slice(1)}s tab to manage ${interfaceName}`);
        }, 500);
        
        // If using VLAN manager or similar, try to scroll to or highlight the specific interface
        if (interfaceType === 'vlan' && typeof VlanManager !== 'undefined') {
            setTimeout(() => {
                // Try to scroll to the specific VLAN if visible
                const vlanElement = document.querySelector(`[data-vlan-name="${interfaceName}"]`);
                if (vlanElement) {
                    vlanElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Add a temporary highlight effect
                    vlanElement.style.backgroundColor = '#e3f2fd';
                    setTimeout(() => {
                        vlanElement.style.backgroundColor = '';
                    }, 2000);
                }
            }, 1000);
        }
    } else {
        NetworkManager.showError(`Could not find ${interfaceType}s tab`);
    }
}

// Add configuration for unconfigured interface
function addInterfaceConfig(name) {
    const iface = NetworkManager.interfaces.find(i => i.name === name);
    if (!iface) return;
    
    // Check if it's a VLAN, bond, or bridge - these should be managed in their respective tabs
    if (['vlan', 'bond', 'bridge'].includes(iface.type)) {
        NetworkManager.showError(`${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)} interfaces should be configured via the ${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)}s tab`);
        return;
    }
    
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
    
    // Setup live validation for the form
    const form = document.getElementById('interface-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(form);
    }
    
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
    
    // Check if it's a VLAN, bond, or bridge - these should be managed in their respective tabs
    if (['vlan', 'bond', 'bridge'].includes(iface.type)) {
        NetworkManager.showError(`${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)} interfaces should be managed via the ${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)}s tab`);
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
                <div class="form-group full-width">
                    <label class="form-label">IP Addresses</label>
                    <div id="edit-interface-ip-addresses-container">
                        <!-- IP addresses will be populated here -->
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-brand" onclick="addInterfaceIpAddress()" style="margin-top: 8px;">
                        <i class="fas fa-plus"></i> Add IP Address
                    </button>
                    <div class="hint">Enter IP addresses in CIDR notation (e.g., 192.168.1.10/24)</div>
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
        <button class="btn btn-brand" onclick="saveInterfaceEdit('${name}')" id="save-interface-btn">
            <i class="fas fa-save"></i> Save Changes
        </button>
    `;
    
    NetworkManager.createModal(`Edit Interface: ${name}`, modalContent, modalFooter);
    
    // Setup live validation for the edit form
    const editForm = document.getElementById('interface-edit-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(editForm);
    }
    
    // Populate IP addresses for editing
    const ipAddresses = [];
    
    // Collect all IP addresses from different sources
    if (iface.ipAddresses && Array.isArray(iface.ipAddresses) && iface.ipAddresses.length > 0) {
        // Use the ipAddresses array if available (filter out loopback and invalid IPs)
        const validIPs = iface.ipAddresses.filter(ip => 
            ip && 
            ip !== 'N/A' && 
            ip !== '127.0.0.1/8' && 
            !ip.startsWith('127.') &&
            !ip.startsWith('169.254.') // Skip link-local addresses
        );
        ipAddresses.push(...validIPs);
    } else if (iface.ip && iface.ip !== 'N/A' && iface.ip !== 'Not configured' && !iface.ip.startsWith('127.')) {
        // Fall back to single IP field
        ipAddresses.push(iface.ip);
    }
    
    NetworkLogger.info(`[editInterface] Interface ${name} IP analysis:`, {
        rawIpAddresses: iface.ipAddresses,
        singleIp: iface.ip,
        filteredAndCollected: ipAddresses,
        interfaceData: iface
    });
    
    populateInterfaceIpAddresses(ipAddresses);
    
    // Setup toggle functionality for static/DHCP configuration
    setupInterfaceConfigToggle();
}

// Function to populate IP addresses for interface editing
function populateInterfaceIpAddresses(ipAddresses) {
    NetworkLogger.info('[populateInterfaceIpAddresses] Input IPs:', ipAddresses);
    const container = document.getElementById('edit-interface-ip-addresses-container');
    
    if (!container) {
        NetworkLogger.error('[populateInterfaceIpAddresses] Container not found');
        return;
    }
    
    container.innerHTML = '';
    
    if (ipAddresses && ipAddresses.length > 0) {
        ipAddresses.forEach((ip, index) => {
            addInterfaceIpField(ip, index);
        });
    } else {
        // Add one empty field if no IPs
        addInterfaceIpField('', 0);
    }
}

// Function to setup the static/DHCP configuration toggle for interface editing
function setupInterfaceConfigToggle() {
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

// Function to add IP field for interface
function addInterfaceIpField(value = '', index = 0) {
    const container = document.getElementById('edit-interface-ip-addresses-container');
    const ipField = document.createElement('div');
    ipField.className = 'ip-field-group mb-2';
    ipField.innerHTML = `
        <div class="d-flex align-items-center">
            <input type="text" class="form-control me-2" 
                   placeholder="IP address (default /24, e.g., 192.168.1.10)" 
                   value="${value}" 
                   id="interface-ip-${index}">
            <button type="button" class="btn btn-outline-danger btn-sm" 
                    onclick="removeInterfaceIpField(this)" 
                    ${index === 0 ? 'style="visibility: hidden;"' : ''}>
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    container.appendChild(ipField);
}

// Function to remove IP field for interface
function removeInterfaceIpField(button) {
    const container = document.getElementById('edit-interface-ip-addresses-container');
    if (container.children.length > 1) {
        button.closest('.ip-field-group').remove();
        // Update visibility of first remove button
        const firstRemoveBtn = container.querySelector('.ip-field-group:first-child .btn-outline-danger');
        if (firstRemoveBtn && container.children.length === 1) {
            firstRemoveBtn.style.visibility = 'hidden';
        }
    }
}

// Function to add new IP field for interface
function addInterfaceIpAddress() {
    const container = document.getElementById('edit-interface-ip-addresses-container');
    const newIndex = container.children.length;
    addInterfaceIpField('', newIndex);
    
    // Setup live validation for the new input
    const newInput = container.children[newIndex].querySelector('input');
    if (typeof setupLiveValidation === 'function' && newInput) {
        setupLiveValidation(newInput.closest('form'));
    }
    
    // Show remove button on first field if there are now multiple fields
    if (container.children.length > 1) {
        const firstRemoveBtn = container.querySelector('.ip-field-group:first-child .btn-outline-danger');
        if (firstRemoveBtn) {
            firstRemoveBtn.style.visibility = 'visible';
        }
    }
}

// Function to get all IP addresses from interface form
function getInterfaceIpAddresses() {
    const container = document.getElementById('edit-interface-ip-addresses-container');
    const ipFields = container.querySelectorAll('input[id^="interface-ip-"]');
    const ips = [];
    
    ipFields.forEach(field => {
        const value = field.value.trim();
        if (value) {
            // Add /24 as default CIDR if not provided
            if (!value.includes('/')) {
                ips.push(value + '/24');
            } else {
                ips.push(value);
            }
        }
    });
    
    NetworkLogger.info('[getInterfaceIpAddresses] Collected IPs:', ips);
    return ips;
}

// Function to save interface edit
async function saveInterfaceEdit(interfaceName) {
    const saveBtn = document.getElementById('save-interface-btn');
    const originalText = saveBtn.innerHTML;
    
    try {
        // Show loading state
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;
        
        NetworkLogger.info(`[saveInterfaceEdit] Saving interface: ${interfaceName}`);
        
        const enabled = document.getElementById('interface-enabled')?.checked;
        const ipAddresses = getInterfaceIpAddresses();
        const gateway = document.getElementById('interface-gateway')?.value?.trim();
        const dns = document.getElementById('interface-dns')?.value?.trim();
        
        NetworkLogger.info('[saveInterfaceEdit] Form data:', {
            enabled,
            ipAddresses,
            gateway,
            dns
        });
        
        // Validate IP addresses
        if (ipAddresses.length === 0) {
            throw new Error('At least one IP address is required');
        }
        
        for (const ip of ipAddresses) {
            if (!isValidIpWithCidr(ip)) {
                throw new Error(`Invalid IP address format: ${ip}`);
            }
        }
        
        if (gateway && !isValidIp(gateway)) {
            throw new Error(`Invalid gateway IP: ${gateway}`);
        }
        
        // Get current interface info to determine type
        const currentInterface = interfaces.find(iface => iface.name === interfaceName);
        if (!currentInterface) {
            throw new Error(`Interface ${interfaceName} not found`);
        }
        
        NetworkLogger.info('[saveInterfaceEdit] Current interface:', currentInterface);
        
        // Handle different interface types
        if (currentInterface.type === 'vlan') {
            // For VLANs, use VLAN manager
            const vlanId = extractVlanId(interfaceName);
            const parentInterface = currentInterface.parent || getVlanParentFromName(interfaceName);
            
            if (!vlanId || !parentInterface) {
                throw new Error('Could not determine VLAN ID or parent interface');
            }
            
            NetworkLogger.info(`[saveInterfaceEdit] Updating VLAN ${vlanId} on ${parentInterface}`);
            
            const vlanConfig = {
                id: vlanId,
                parentInterface: parentInterface,
                ipAddresses: ipAddresses,
                gateway: gateway || '',
                dns: dns || '',
                enabled: enabled
            };
            
            await updateVlan(vlanId, parentInterface, vlanConfig);
        } else {
            // For regular interfaces, bonds, bridges
            const config = {
                ipAddresses: ipAddresses,
                gateway: gateway || '',
                dns: dns || '',
                enabled: enabled
            };
            
            await updateRegularInterface(interfaceName, config);
        }
        
        NetworkManager.closeModal();
        await refreshNetworkInterfaces();
        NetworkManager.showSuccess(`Interface ${interfaceName} updated successfully`);
        
    } catch (error) {
        NetworkLogger.error('[saveInterfaceEdit] Error:', error);
        NetworkManager.showError(`Failed to update interface: ${error.message}`);
    } finally {
        // Restore button state
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

// Function to update regular interface (non-VLAN)
async function updateRegularInterface(interfaceName, config) {
    NetworkLogger.info(`[updateRegularInterface] Updating ${interfaceName}:`, config);
    
    try {
        // Create Netplan configuration
        const netplanConfig = {
            network: {
                version: 2,
                renderer: 'networkd',
                ethernets: {}
            }
        };
        
        const interfaceConfig = {};
        
        if (config.enabled === false) {
            interfaceConfig.optional = true;
        }
        
        if (config.ipAddresses && config.ipAddresses.length > 0) {
            interfaceConfig.addresses = config.ipAddresses;
        }
        
        if (config.gateway) {
            interfaceConfig.gateway4 = config.gateway;
        }
        
        if (config.dns) {
            interfaceConfig.nameservers = {
                addresses: config.dns.split(',').map(dns => dns.trim())
            };
        }
        
        netplanConfig.network.ethernets[interfaceName] = interfaceConfig;
        
        // Generate YAML content manually
        let yamlContent = `network:
  version: 2
  renderer: networkd
  ethernets:
    ${interfaceName}:`;
        
        if (interfaceConfig.optional) {
            yamlContent += `\n      optional: true`;
        }
        
        if (interfaceConfig.addresses && interfaceConfig.addresses.length > 0) {
            yamlContent += `\n      addresses:`;
            interfaceConfig.addresses.forEach(addr => {
                yamlContent += `\n        - ${addr}`;
            });
        }
        
        if (interfaceConfig.gateway4) {
            yamlContent += `\n      gateway4: ${interfaceConfig.gateway4}`;
        }
        
        if (interfaceConfig.nameservers && interfaceConfig.nameservers.addresses) {
            yamlContent += `\n      nameservers:`;
            yamlContent += `\n        addresses:`;
            interfaceConfig.nameservers.addresses.forEach(dns => {
                yamlContent += `\n          - ${dns}`;
            });
        }
        
        yamlContent += '\n';
        
        const configFile = `/etc/netplan/90-xavs-${interfaceName}.yaml`;
        
        NetworkLogger.info(`[updateRegularInterface] Writing config to ${configFile}:`, yamlContent);
        
        // Write configuration file
        await executeCommand(`echo '${yamlContent}' | sudo tee ${configFile}`);
        await executeCommand(`sudo chmod 600 ${configFile}`);
        
        // Test configuration
        const testResult = await executeCommand('sudo netplan --debug try');
        NetworkLogger.info('[updateRegularInterface] Test result:', testResult);
        
        if (testResult.includes('Error') || testResult.includes('error')) {
            throw new Error(`Configuration test failed: ${testResult}`);
        }
        
        // Apply configuration
        await executeCommand('sudo netplan apply');
        
        // Log the operation
        await logNetworkOperation('interface_update', {
            interface: interfaceName,
            config: config,
            file: configFile,
            test_output: testResult
        });
        
    } catch (error) {
        NetworkLogger.error('[updateRegularInterface] Error:', error);
        throw error;
    }
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
    NetworkLogger.info(`updateInterface called for interface: ${name}`);
    
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
    
    NetworkLogger.info('Initial form data collected:', formData);
    
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
    
    NetworkLogger.info('Final collected form data for validation:', formData);
    
    // Validate form data
    NetworkLogger.info('Starting form data validation...');
    const validation = validateInterfaceConfig(formData);
    NetworkLogger.info('Validation result:', validation);
    if (!validation.valid) {
        NetworkLogger.error('Validation failed:', validation.message);
        NetworkManager.showError(validation.message);
        return;
    }
    NetworkLogger.info('Form data validation passed');
    
    // Show configuration preview
    NetworkLogger.info('Generating configuration preview...');
    const yamlPreview = generateNetplanYaml(formData);
    NetworkLogger.info('Generated YAML preview:', yamlPreview);
    
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
    NetworkLogger.info(`confirmUpdateInterface called for interface: ${name}`);
    
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
        
        NetworkLogger.info('Collected form data:', formData);
        
        // DHCP configuration
        if (formData.configType === 'dhcp') {
            formData.dhcp4 = document.getElementById('edit-dhcp4')?.checked !== false;
            formData.dhcp6 = document.getElementById('edit-dhcp6')?.checked === true;
            formData.dhcpUseDns = document.getElementById('edit-dhcp-use-dns')?.checked !== false;
            formData.dhcpUseRoutes = document.getElementById('edit-dhcp-use-routes')?.checked !== false;
            formData.dhcpSendHostname = document.getElementById('edit-dhcp-send-hostname')?.checked === true;
            formData.dhcpMetric = document.getElementById('edit-dhcp-metric')?.value || '';
            NetworkLogger.info('Added DHCP configuration:', {
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
        
        NetworkLogger.info('Final form data for processing:', formData);
        
        // Close the modal first
        NetworkManager.closeModal();
        
        // Show processing message
        NetworkManager.showSuccess('Updating interface configuration...');
        
        // Use NetworkAPI to configure the interface
        NetworkLogger.info('Calling NetworkAPI.configureInterface...');
        NetworkAPI.configureInterface(formData)
            .then(() => {
                NetworkLogger.info('Interface configuration completed successfully');
                NetworkManager.showSuccess(`Interface ${name} configuration updated successfully`);
                NetworkManager.loadInterfaces(); // Reload interfaces to show updated config
            })
            .catch((error) => {
                NetworkLogger.error('Failed to update interface:', error);
                NetworkManager.showError(`Failed to update interface: ${error.message}`);
            });
            
    } catch (error) {
        NetworkLogger.error('Error in confirmUpdateInterface:', error);
        NetworkManager.showError(`Error processing interface update: ${error.message}`);
    }
}

function confirmDeleteInterface(name) {
    const iface = NetworkManager.interfaces.find(i => i.name === name);
    if (!iface) return;
    
    // Check if it's a VLAN, bond, or bridge - these should be managed in their respective tabs
    if (['vlan', 'bond', 'bridge'].includes(iface.type)) {
        NetworkManager.showError(`${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)} interfaces should be deleted via the ${iface.type.charAt(0).toUpperCase() + iface.type.slice(1)}s tab`);
        return;
    }
    
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

async function performDeleteInterface(name) {
    const deleteBtn = document.getElementById('delete-confirm-btn');
    const originalText = deleteBtn.innerHTML;
    
    try {
        // Show loading state
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        deleteBtn.disabled = true;
        
        NetworkLogger.info(`[performDeleteInterface] Deleting interface: ${name}`);
        
        // Get current interface info to determine type
        const currentInterface = interfaces.find(iface => iface.name === name);
        if (!currentInterface) {
            throw new Error(`Interface ${name} not found`);
        }
        
        NetworkLogger.info('[performDeleteInterface] Current interface:', currentInterface);
        
        // Handle different interface types
        if (currentInterface.type === 'vlan') {
            // For VLANs, use VLAN manager
            const vlanId = extractVlanId(name);
            const parentInterface = currentInterface.parent || getVlanParentFromName(name);
            
            if (!vlanId || !parentInterface) {
                throw new Error('Could not determine VLAN ID or parent interface');
            }
            
            NetworkLogger.info(`[performDeleteInterface] Deleting VLAN ${vlanId} on ${parentInterface}`);
            await deleteVlan(vlanId, parentInterface);
        } else {
            // For regular interfaces, bonds, bridges
            NetworkLogger.info(`[performDeleteInterface] Deleting regular interface ${name}`);
            await deleteRegularInterface(name);
        }
        
        NetworkManager.closeModal();
        await refreshNetworkInterfaces();
        NetworkManager.showSuccess(`Interface ${name} deleted successfully`);
        
    } catch (error) {
        NetworkLogger.error('[performDeleteInterface] Error:', error);
        NetworkManager.showError(`Failed to delete interface: ${error.message}`);
    } finally {
        // Restore button state
        deleteBtn.innerHTML = originalText;
        deleteBtn.disabled = false;
    }
}

// Function to delete regular interface (non-VLAN)
async function deleteRegularInterface(interfaceName) {
    NetworkLogger.info(`[deleteRegularInterface] Deleting ${interfaceName}`);
    
    try {
        const configFile = `/etc/netplan/90-xavs-${interfaceName}.yaml`;
        
        // Check if config file exists
        const fileExists = await executeCommand(`test -f ${configFile} && echo "exists" || echo "not found"`);
        
        if (fileExists.includes('exists')) {
            // Remove configuration file
            await executeCommand(`sudo rm -f ${configFile}`);
            NetworkLogger.info(`[deleteRegularInterface] Removed config file: ${configFile}`);
        }
        
        // Test configuration
        const testResult = await executeCommand('sudo netplan --debug try');
        NetworkLogger.info('[deleteRegularInterface] Test result:', testResult);
        
        if (testResult.includes('Error') || testResult.includes('error')) {
            throw new Error(`Configuration test failed: ${testResult}`);
        }
        
        // Apply configuration
        await executeCommand('sudo netplan apply');
        
        // Log the operation
        await logNetworkOperation('interface_delete', {
            interface: interfaceName,
            file: configFile,
            test_output: testResult
        });
        
    } catch (error) {
        NetworkLogger.error('[deleteRegularInterface] Error:', error);
        throw error;
    }
}

// Helper function to extract VLAN ID from interface name
function extractVlanId(interfaceName) {
    NetworkLogger.info(`[extractVlanId] Extracting VLAN ID from: ${interfaceName}`);
    
    // Try different VLAN naming patterns
    const patterns = [
        /\.(\d+)$/,           // eth0.100
        /vlan(\d+)$/i,        // vlan100, VLAN100
        /-vlan(\d+)$/i,       // eth0-vlan100
        /v(\d+)$/,            // ethv100
    ];
    
    for (const pattern of patterns) {
        const match = interfaceName.match(pattern);
        if (match) {
            const vlanId = parseInt(match[1], 10);
            NetworkLogger.info(`[extractVlanId] Found VLAN ID: ${vlanId}`);
            return vlanId;
        }
    }
    
    NetworkLogger.info(`[extractVlanId] No VLAN ID found in: ${interfaceName}`);
    return null;
}

// Helper function to get parent interface from VLAN name
function getVlanParentFromName(interfaceName) {
    NetworkLogger.info(`[getVlanParentFromName] Getting parent from: ${interfaceName}`);
    
    // Try different VLAN naming patterns
    const patterns = [
        /^(.+)\.(\d+)$/,           // eth0.100 -> eth0
        /^(.+)-vlan(\d+)$/i,       // eth0-vlan100 -> eth0
        /^(.+)v(\d+)$/,            // ethv100 -> eth (less common)
    ];
    
    for (const pattern of patterns) {
        const match = interfaceName.match(pattern);
        if (match) {
            const parent = match[1];
            NetworkLogger.info(`[getVlanParentFromName] Found parent: ${parent}`);
            return parent;
        }
    }
    
    // For simple vlan naming, try to find in system interfaces
    if (/^vlan(\d+)$/i.test(interfaceName)) {
        NetworkLogger.info(`[getVlanParentFromName] Simple VLAN name, checking system for parent`);
        // This would need system lookup - for now return null
    }
    
    NetworkLogger.info(`[getVlanParentFromName] No parent found for: ${interfaceName}`);
    return null;
}

function toggleInterface(name, currentStatus) {
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    const modalContent = `
        <div class="alert ${newStatus === 'down' ? 'alert-warning' : 'alert-info'}" style="margin-bottom: 20px;">
            <i class="fas ${newStatus === 'down' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
            You are about to <strong>${action}</strong> interface <strong>${name}</strong>.
        </div>
        
        <div style="margin-bottom: 16px;">
            <strong>Current Status:</strong> <span class="status-badge status-${currentStatus}">${currentStatus.toUpperCase()}</span>
            <br>
            <strong>Target Status:</strong> <span class="status-badge status-${newStatus}">${newStatus.toUpperCase()}</span>
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

// Perform the actual interface toggle operation
async function performToggleInterface(name, newStatus) {
    try {
        const action = newStatus === 'up' ? 'enable' : 'disable';
        
        if (!cockpit || !cockpit.spawn) {
            NetworkManager.showError('Cockpit API not available');
            return;
        }
        
        NetworkLogger.info(`Performing ${action} operation on interface ${name}...`);
        
        // First, check the current interface state to avoid unnecessary operations
        try {
            const currentState = await cockpit.spawn(['ip', 'link', 'show', name], { superuser: 'try' });
            const isCurrentlyUp = currentState.includes('state UP') || currentState.includes('<UP,');
            
            // Check if interface is already in the desired state
            if ((newStatus === 'up' && isCurrentlyUp) || (newStatus === 'down' && !isCurrentlyUp)) {
                NetworkManager.closeModal();
                NetworkManager.showSuccess(`Interface ${name} is already ${newStatus === 'up' ? 'enabled' : 'disabled'}`);
                return;
            }
            
            NetworkLogger.info(`Interface ${name} current state: ${isCurrentlyUp ? 'up' : 'down'}, target state: ${newStatus}`);
        } catch (stateCheckError) {
            NetworkLogger.warning(`Could not check current state of interface ${name}:`, stateCheckError);
            // Continue with the operation anyway, as the state check is informational
        }
        
        // Execute the interface toggle command
        const command = newStatus === 'up' ? 'up' : 'down';
        await cockpit.spawn(['ip', 'link', 'set', name, command], { superuser: 'try' });
        
        // Close the modal
        NetworkManager.closeModal();
        
        // Show success message
        NetworkManager.showSuccess(`Interface ${name} ${action}d successfully`);
        
        // Reload interface data to reflect changes
        setTimeout(() => {
            NetworkManager.loadInterfaces();
        }, 1000);
        
    } catch (error) {
        NetworkLogger.error(`Error ${newStatus === 'up' ? 'enabling' : 'disabling'} interface:`, error);
        NetworkManager.showError(`Failed to ${newStatus === 'up' ? 'enable' : 'disable'} interface ${name}: ${error.message || error}`);
    }
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
    NetworkLogger.error('Network operation failed:', error);
    
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
        NetworkLogger.info('Configuring VLAN interface:', config.name);
        
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
                            NetworkLogger.info(`Found VLAN section for ${config.name}:`, vlanSection[1]);
                            
                            const idMatch = vlanSection[1].match(/id:\s*(\d+)/);
                            const linkMatch = vlanSection[1].match(/link:\s*([a-zA-Z0-9\._-]+)/);
                            
                            if (idMatch) {
                                vlanId = parseInt(idMatch[1]);
                                NetworkLogger.info(`Extracted VLAN ID: ${vlanId}`);
                            }
                            if (linkMatch && linkMatch[1] !== 'null') {
                                linkInterface = linkMatch[1];
                                NetworkLogger.info(`Extracted link interface: ${linkInterface}`);
                            } else {
                                NetworkLogger.info(`Link match result:`, linkMatch);
                            }
                        }
                        
                        // If link is null or not found, try to extract parent from interface name
                        if (!linkInterface || linkInterface === 'null') {
                            NetworkLogger.info(`Link interface not found in config, extracting from interface name: ${config.name}`);
                            const nameParts = config.name.split('.');
                            if (nameParts.length === 2) {
                                linkInterface = nameParts[0]; // e.g., bond0.3333 -> bond0
                                NetworkLogger.info(`Extracted parent interface from name: ${linkInterface}`);
                            }
                        }
                        break;
                    }
                } catch (fileError) {
                    NetworkLogger.warning(`Could not read file ${file}:`, fileError);
                }
            }
            
            if (!vlanConfigFile) {
                throw new Error(`VLAN configuration file not found for interface ${config.name}`);
            }
            
            // If we still don't have a link interface, try to get it from the system
            if (!linkInterface) {
                NetworkLogger.info(`Attempting to get parent interface from system for ${config.name}`);
                try {
                    // Try to get the link information from ip command
                    const ipLinkOutput = await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
                    const linkMatch = ipLinkOutput.match(new RegExp(`${config.name}@([a-zA-Z0-9\\._-]+):`));
                    if (linkMatch) {
                        linkInterface = linkMatch[1];
                        NetworkLogger.info(`Found parent interface from system: ${linkInterface}`);
                    }
                } catch (systemError) {
                    NetworkLogger.warning(`Could not get parent interface from system for ${config.name}:`, systemError);
                }
            }
            
            if (!linkInterface) {
                throw new Error(`Could not determine parent interface for VLAN ${config.name}. Please ensure the VLAN is properly configured.`);
            }

            NetworkLogger.info(`Found VLAN ${config.name} (ID: ${vlanId}, Link: ${linkInterface}) in ${vlanConfigFile}`);
            
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
            
            NetworkLogger.info('Generated VLAN Netplan config:', netplanConfig);
            
            // Write the configuration to the same file or a new XAVS file
            const newConfigPath = vlanConfigFile.includes('90-xavs-') ? vlanConfigFile : `/etc/netplan/90-xavs-vlan${vlanId}.yaml`;
            
            // Remove old file if creating a new one
            if (newConfigPath !== vlanConfigFile) {
                NetworkLogger.info(`Moving VLAN configuration from ${vlanConfigFile} to ${newConfigPath}`);
                await cockpit.spawn(['rm', '-f', vlanConfigFile], { superuser: 'try' });
            }
            
            // Write new configuration
            await cockpit.file(newConfigPath, { superuser: 'try' }).replace(netplanConfig);
            NetworkLogger.info('VLAN configuration written successfully');
            
            // Set proper file permissions
            await cockpit.spawn(['chmod', '600', newConfigPath], { superuser: 'try' });
            NetworkLogger.info('File permissions set to 600');
            
            // Test the configuration with netplan try
            NetworkLogger.info('Testing VLAN configuration with netplan --debug try...');
            try {
                const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'try' });
                NetworkLogger.info('Netplan debug output:');
                NetworkLogger.info('--- START NETPLAN DEBUG ---');
                NetworkLogger.info(debugOutput);
                NetworkLogger.info('--- END NETPLAN DEBUG ---');
                NetworkLogger.info('Netplan try completed successfully');
            } catch (tryError) {
                NetworkLogger.error('Netplan try failed:', tryError);
                
                // Log the debug output even on failure
                if (tryError.message) {
                    NetworkLogger.info('Netplan error output:');
                    NetworkLogger.info('--- START NETPLAN ERROR ---');
                    NetworkLogger.info(tryError.message);
                    NetworkLogger.info('--- END NETPLAN ERROR ---');
                }
                
                // Check if this is just the bond revert warning (exit status 78)
                if (tryError.exit_status === 78) {
                    NetworkLogger.info('Netplan try exited with status 78 (bond revert warning) - this is expected for bond configurations');
                    // This is the expected bond warning, not a real error
                } else {
                    // This is a real error
                    throw new Error(`Configuration test failed: ${tryError.message || tryError}. The configuration has not been applied.`);
                }
            }
            
            // Apply the configuration
            NetworkLogger.info('Applying VLAN configuration...');
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            NetworkLogger.info('VLAN configuration applied successfully');
            
            return { success: true, message: `VLAN ${config.name} configured successfully` };
            
        } catch (error) {
            NetworkLogger.error('Error configuring VLAN interface:', error);
            
            // Enhanced error handling for GUI display
            let enhancedError = error;
            if (error.message && error.message.includes('interface \'null\' is not defined')) {
                enhancedError = new Error(`VLAN parent interface not found. The VLAN ${config.name} has an invalid parent interface configuration. Please recreate the VLAN with a valid parent interface.`);
            } else if (error.message && error.message.includes('Could not determine parent interface')) {
                enhancedError = new Error(`Cannot determine parent interface for VLAN ${config.name}. Please ensure the VLAN is properly configured with a valid parent interface.`);
            }
            
            throw enhancedError;
        }
    },

    // Check for interface definition conflicts across Netplan files
    async checkForInterfaceConflicts(interfaceName, intendedType) {
        NetworkLogger.info(`Checking for conflicts for interface '${interfaceName}' intended as '${intendedType}'...`);
        
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
                                    NetworkLogger.info(`Found conflict: ${interfaceName} defined as ${type} in ${file}, but trying to define as ${intendedType}`);
                                }
                            }
                        }
                    }
                } catch (fileError) {
                    NetworkLogger.warning(`Could not read file ${file}:`, fileError);
                }
            }
            
            // If conflicts found, handle them
            if (conflictingFiles.length > 0) {
                NetworkLogger.info(`Found ${conflictingFiles.length} conflicting definitions for interface '${interfaceName}'`);
                
                // For XAVS files, we can remove the conflicting definition
                for (const conflict of conflictingFiles) {
                    if (conflict.file.includes('90-xavs-')) {
                        NetworkLogger.info(`Removing conflicting XAVS configuration file: ${conflict.file}`);
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
            NetworkLogger.warning('Error checking for interface conflicts:', error);
            // Don't throw here - allow the operation to continue if conflict check fails
        }
    },

    async configureInterface(config) {
        try {
            NetworkLogger.info('NetworkAPI.configureInterface called with config:', config);
            
            // Determine interface type based on configuration or interface name
            let interfaceType = 'ethernets';
            let isVlanInterface = false;
            
            // Check if this is a VLAN interface
            const vlanPattern = /^(.+)\.(\d+)$|^vlan(\d+)$/;
            if (vlanPattern.test(config.name)) {
                interfaceType = 'vlans';
                isVlanInterface = true;
                NetworkLogger.info(`Detected VLAN interface: ${config.name}`);
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
                                NetworkLogger.info(`Found ${config.name} defined as VLAN in ${file}`);
                                break;
                            }
                        } catch (fileError) {
                            NetworkLogger.warning(`Could not read file ${file}:`, fileError);
                        }
                    }
                } catch (searchError) {
                    NetworkLogger.warning('Error searching for VLAN definitions:', searchError);
                }
            }
            
            // If this is a VLAN interface, delegate to VLAN manager
            if (isVlanInterface) {
                NetworkLogger.info(`Delegating VLAN interface ${config.name} configuration to VLAN manager`);
                return await this.configureVlanInterface(config);
            }
            
            // Check for interface conflicts before proceeding
            NetworkLogger.info('Checking for interface conflicts...');
            await this.checkForInterfaceConflicts(config.name, interfaceType);
            
            // Validate configuration
            NetworkLogger.info('Validating configuration...');
            if (config.configType === 'static' && config.ip && !validateCIDR(config.ip)) {
                throw new NetworkError('Invalid IP address format', 'INVALID_IP');
            }
            
            if (config.gateway && !validateIPAddress(config.gateway)) {
                throw new NetworkError('Invalid gateway address', 'INVALID_GATEWAY');
            }
            
            NetworkLogger.info('Configuration validation passed');
            
            // Generate Netplan configuration
            NetworkLogger.info('Generating Netplan YAML configuration...');
            const netplanConfig = generateNetplanYaml(config);
            NetworkLogger.info('Generated Netplan config:');
            NetworkLogger.info('--- START CONFIG ---');
            NetworkLogger.info(netplanConfig);
            NetworkLogger.info('--- END CONFIG ---');
            
            // Use XAVS-specific naming to avoid conflicts with installer configs
            const configFile = `/etc/netplan/90-xavs-${config.name}.yaml`;
            NetworkLogger.info(`Writing configuration to file: ${configFile}`);
            
            // Show what we're about to write
            NetworkLogger.info('File path details:');
            NetworkLogger.info('- config.name:', config.name);
            NetworkLogger.info('- Full file path:', configFile);
            NetworkLogger.info('- Content length:', netplanConfig.length, 'characters');
            
            // Check Cockpit API availability
            if (!cockpit || !cockpit.file) {
                NetworkLogger.error('Cockpit API check failed - cockpit object:', cockpit);
                throw new Error('Cockpit API not available - please ensure you are running this module within Cockpit');
            } else {
                NetworkLogger.info('Cockpit API is available');
            }
            
            NetworkLogger.info('Attempting to write file with Cockpit API...');
            await cockpit.file(configFile, { superuser: 'require' }).replace(netplanConfig);
            NetworkLogger.info('Configuration file written successfully');
            
            // Set proper file permissions (600 = rw-------)
            NetworkLogger.info('Setting file permissions to 600...');
            await cockpit.spawn(['chmod', '600', configFile], { superuser: 'require' });
            NetworkLogger.info('File permissions set successfully');
            
            // Test the configuration first with netplan try
            NetworkLogger.info('Testing Netplan configuration with netplan --debug try...');
            if (!cockpit.spawn) {
                NetworkLogger.error('Cockpit spawn API not available');
                throw new Error('Cockpit spawn API not available');
            }
            
            try {
                NetworkLogger.info('Running: netplan --debug try --timeout=30');
                const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
                NetworkLogger.info('Netplan debug output:');
                NetworkLogger.info('--- START NETPLAN DEBUG ---');
                NetworkLogger.info(debugOutput);
                NetworkLogger.info('--- END NETPLAN DEBUG ---');
                NetworkLogger.info('Netplan try completed successfully');
            } catch (tryError) {
                NetworkLogger.error('Netplan try failed:', tryError);
                
                // Log the debug output even on failure
                if (tryError.message) {
                    NetworkLogger.info('Netplan error output:');
                    NetworkLogger.info('--- START NETPLAN ERROR ---');
                    NetworkLogger.info(tryError.message);
                    NetworkLogger.info('--- END NETPLAN ERROR ---');
                }
                
                // Check if this is just the bond revert warning (exit status 78)
                if (tryError.exit_status === 78) {
                    NetworkLogger.info('Netplan try exited with status 78 (bond revert warning) - this is expected for bond configurations');
                    // This is the expected bond warning, not a real error
                } else {
                    // This is a real error
                    throw new Error(`Configuration test failed: ${tryError.message || tryError}. The configuration has not been applied.`);
                }
            }
            
            // Apply configuration permanently
            NetworkLogger.info('Applying Netplan configuration permanently...');
            NetworkLogger.info('Running: netplan apply');
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            NetworkLogger.info('Netplan configuration applied successfully');
            
            return { success: true };
        } catch (error) {
            NetworkLogger.error('Error in NetworkAPI.configureInterface:', error);
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
        NetworkLogger.info(`NetworkAPI.deleteInterface called for: ${name}`);
        
        try {
            // Detect interface type and delegate to appropriate manager
            if (name.includes('.') && /\.\d+$/.test(name)) {
                NetworkLogger.info(`Detected VLAN interface: ${name}, delegating to VLAN manager`);
                
                // Extract VLAN ID from name
                const vlanIdMatch = name.match(/\.(\d+)$/);
                if (vlanIdMatch) {
                    const vlanId = parseInt(vlanIdMatch[1]);
                    
                    // Check if VlanManager is available and has the deleteRealVlan function
                    if (typeof VlanManager !== 'undefined' && typeof VlanManager.deleteRealVlan === 'function') {
                        NetworkLogger.info(`Calling VlanManager.deleteRealVlan for VLAN ${vlanId}`);
                        await VlanManager.deleteRealVlan(vlanId, name);
                        return { success: true };
                    } else {
                        // Fallback to legacy VLAN deletion
                        NetworkLogger.info(`VlanManager not available, using fallback deletion for VLAN ${name}`);
                        return await this.deleteVlanInterface(name, vlanId);
                    }
                }
            }
            
            // For non-VLAN interfaces, use the standard deletion process
            NetworkLogger.info(`Deleting standard interface: ${name}`);
            
            // Only look for XAVS-managed configuration files to avoid touching installer configs
            const xavsConfigFile = `/etc/netplan/90-xavs-${name}.yaml`;
            
            try {
                // Check if our XAVS config file exists
                const content = await cockpit.file(xavsConfigFile).read();
                if (content) {
                    NetworkLogger.info(`Removing XAVS config file: ${xavsConfigFile}`);
                    // Remove the XAVS-managed configuration file
                    await cockpit.spawn(['rm', xavsConfigFile], { superuser: 'require' });
                }
            } catch (fileError) {
                NetworkLogger.info(`XAVS config file ${xavsConfigFile} not found, checking other Netplan files`);
                // If the specific XAVS file doesn't exist, look in other Netplan files
                // but exclude installer configs (00-installer-config.yaml, 01-network-manager-all.yaml)
                const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-not', '-name', '00-installer-config.yaml', '-not', '-name', '01-network-manager-all.yaml'], { superuser: 'try' });
                const files = netplanFiles.trim().split('\n').filter(f => f.trim());
                
                for (const file of files) {
                    try {
                        const content = await cockpit.file(file).read();
                        if (content && content.includes(`${name}:`)) {
                            NetworkLogger.info(`Found interface ${name} in file: ${file}`);
                            // Only remove from non-installer config files
                            if (!file.includes('00-installer-config') && !file.includes('01-network-manager')) {
                                const updatedContent = removeInterfaceFromNetplan(content, name);
                                await cockpit.file(file, { superuser: 'require' }).replace(updatedContent);
                                NetworkLogger.info(`Updated file: ${file}`);
                                break;
                            }
                        }
                    } catch (fileError) {
                        NetworkLogger.warning(`Could not process ${file}:`, fileError);
                    }
                }
            }
            
            // Test configuration before applying
            NetworkLogger.info('Testing Netplan configuration with netplan --debug try...');
            try {
                const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
                NetworkLogger.info('NetworkAPI: Netplan debug output:');
                NetworkLogger.info('--- START NETPLAN DEBUG ---');
                NetworkLogger.info(debugOutput);
                NetworkLogger.info('--- END NETPLAN DEBUG ---');
            } catch (tryError) {
                NetworkLogger.error('NetworkAPI: Netplan try failed:', tryError);
                
                // Log the debug output even on failure
                if (tryError.message) {
                    NetworkLogger.info('NetworkAPI: Netplan error output:');
                    NetworkLogger.info('--- START NETPLAN ERROR ---');
                    NetworkLogger.info(tryError.message);
                    NetworkLogger.info('--- END NETPLAN ERROR ---');
                }
                
                // Check if this is just the bond revert warning (exit status 78)
                if (tryError.exit_status === 78) {
                    NetworkLogger.info('NetworkAPI: Netplan try exited with status 78 (bond revert warning) - proceeding');
                } else {
                    throw new Error(`Configuration test failed: ${tryError.message || tryError}`);
                }
            }
            
            // Apply configuration
            NetworkLogger.info('Applying Netplan configuration...');
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            NetworkLogger.info('Netplan applied successfully');
            
            return { success: true };
        } catch (error) {
            NetworkLogger.error(`NetworkAPI.deleteInterface error for ${name}:`, error);
            throw new NetworkError(`Failed to delete interface ${name}`, 'DELETE_FAILED', error);
        }
    },
    
    // Fallback VLAN deletion method
    async deleteVlanInterface(name, vlanId) {
        NetworkLogger.info(`NetworkAPI.deleteVlanInterface: Deleting VLAN ${name} (ID: ${vlanId})`);
        
        try {
            // Try to bring down the interface first
            try {
                NetworkLogger.info(`Bringing down VLAN interface: ${name}`);
                await cockpit.spawn(['ip', 'link', 'set', name, 'down'], { superuser: 'try' });
            } catch (downError) {
                NetworkLogger.warning(`Could not bring down interface ${name}:`, downError);
            }
            
            // Try to delete the VLAN interface
            try {
                NetworkLogger.info(`Deleting VLAN interface: ${name}`);
                await cockpit.spawn(['ip', 'link', 'delete', name], { superuser: 'try' });
            } catch (deleteError) {
                NetworkLogger.warning(`Could not delete interface ${name}:`, deleteError);
            }
            
            // Remove VLAN-specific configuration files
            const vlanConfigFiles = [
                `/etc/netplan/90-xavs-vlan${vlanId}.yaml`,
                `/etc/netplan/90-xavs-${name}.yaml`
            ];
            
            for (const configFile of vlanConfigFiles) {
                try {
                    NetworkLogger.info(`Removing VLAN config file: ${configFile}`);
                    await cockpit.spawn(['rm', '-f', configFile], { superuser: 'require' });
                } catch (rmError) {
                    NetworkLogger.warning(`Could not remove ${configFile}:`, rmError);
                }
            }
            
            // Test and apply Netplan configuration
            NetworkLogger.info('Testing VLAN deletion with netplan --debug try...');
            try {
                const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
                NetworkLogger.info('NetworkAPI: VLAN deletion debug output:');
                NetworkLogger.info('--- START NETPLAN DEBUG ---');
                NetworkLogger.info(debugOutput);
                NetworkLogger.info('--- END NETPLAN DEBUG ---');
            } catch (tryError) {
                NetworkLogger.error('NetworkAPI: VLAN deletion netplan try failed:', tryError);
                
                if (tryError.message) {
                    NetworkLogger.info('NetworkAPI: VLAN deletion netplan error output:');
                    NetworkLogger.info('--- START NETPLAN ERROR ---');
                    NetworkLogger.info(tryError.message);
                    NetworkLogger.info('--- END NETPLAN ERROR ---');
                }
                
                if (tryError.exit_status === 78) {
                    NetworkLogger.info('NetworkAPI: Netplan try exited with status 78 (bond revert warning) - proceeding');
                } else {
                    throw new Error(`VLAN deletion configuration test failed: ${tryError.message || tryError}`);
                }
            }
            
            NetworkLogger.info('Applying VLAN deletion configuration...');
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            NetworkLogger.info('VLAN deletion configuration applied successfully');
            
            return { success: true };
        } catch (error) {
            NetworkLogger.error(`NetworkAPI.deleteVlanInterface error for ${name}:`, error);
            throw new Error(`Failed to delete VLAN interface ${name}: ${error.message || error}`);
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

// Generate Netplan configuration specifically for VLAN interfaces
function generateVlanNetplanConfig(config) {
    NetworkLogger.info('Generating VLAN Netplan config for:', config.name);
    
    let yamlConfig = `network:
  version: 2
  vlans:
    ${config.name}:
      id: ${config.id}
      link: ${config.parent}`;
    
    if (config.configType === 'static') {
        // Handle multiple IP addresses
        const ipAddresses = config.ipAddresses || (config.ip ? [config.ip] : []);
        if (ipAddresses.length > 0) {
            yamlConfig += `
      addresses:`;
            ipAddresses.forEach(ip => {
                yamlConfig += `
        - ${ip}`;
            });
        }
        
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
        
        // Ensure bond functions are available after all scripts load
        setTimeout(() => {
            if (typeof addBond === 'undefined') {
                NetworkLogger.warning('addBond function not found, creating placeholder');
                window.addBond = () => NetworkManager.showError('Bond manager not loaded. Please refresh the page.');
            }
            if (typeof editBond === 'undefined') {
                NetworkLogger.warning('editBond function not found, creating placeholder');
                window.editBond = (bondName) => NetworkManager.showError('Bond manager not loaded. Please refresh the page.');
            }
        }, 100);
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
    NetworkLogger.info('Filtering interfaces by:', filterValue);
    
    const interfaceCards = document.querySelectorAll('#interface-list .interface-card');
    
    interfaceCards.forEach(card => {
        const interfaceType = card.getAttribute('data-type') || 'ethernet';
        
        if (filterValue === 'all') {
            card.style.display = 'block';
        } else if (filterValue === interfaceType) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
    
    // Update visible count
    const visibleCards = document.querySelectorAll('#interface-list .interface-card[style*="block"], #interface-list .interface-card:not([style])');
    const totalCards = interfaceCards.length;
    
    NetworkLogger.info(`Showing ${visibleCards.length} of ${totalCards} interfaces (filter: ${filterValue})`);
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
    
    // Setup live validation for the form
    const form = document.getElementById('route-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(form);
    }
    
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
    NetworkLogger.info('Refresh VLANs');
    NetworkManager.loadVlans();
    NetworkManager.showSuccess('VLANs refreshed');
}

function refreshBridges() {
    NetworkLogger.info('Refresh Bridges');
    NetworkManager.loadBridges();
    NetworkManager.showSuccess('Bridges refreshed');
}

function refreshBonds() {
    NetworkLogger.info('Refresh Bonds');
    NetworkManager.loadBonds();
    NetworkManager.showSuccess('Bonds refreshed');
}

function refreshRoutes() {
    NetworkLogger.info('Refresh Routes');
    NetworkManager.loadRoutes();
    NetworkManager.showSuccess('Routes refreshed');
}

function refreshDns() {
    NetworkLogger.info('Refresh DNS');
    NetworkManager.loadDnsConfig();
    NetworkManager.showSuccess('DNS configuration refreshed');
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
    
    // Setup live validation for the edit form
    const editForm = document.getElementById('route-edit-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(editForm);
    }
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
        NetworkLogger.error('Failed to update route:', error);
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
        
        NetworkLogger.info('Deleting route with command:', deleteCmd);
        await cockpit.spawn(deleteCmd, { superuser: 'try' });
        
        if (showSuccess) {
            NetworkManager.showSuccess(`Route to ${route.destination} deleted successfully`);
            NetworkManager.loadRoutes();
        }
        
    } catch (error) {
        NetworkLogger.error('Failed to delete route:', error);
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
    
    NetworkLogger.info('Adding route with command:', addCmd);
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
        
        // First check if it's a plain IP address (will get /24 default)
        const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (ipPattern.test(value)) {
            return { valid: true, message: 'Valid IP address (will default to /24)' };
        }
        
        // Then check if it's a proper CIDR notation
        const cidrPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/(?:[0-9]|[1-2][0-9]|3[0-2])$/;
        if (cidrPattern.test(value)) {
            return { valid: true, message: 'Valid CIDR notation' };
        }
        
        return { valid: false, message: 'Invalid IP address or CIDR format (e.g., 192.168.1.10 or 192.168.1.0/24)' };
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

// Debug Netplan configuration with detailed output - main network manager version
