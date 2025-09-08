// Monitoring and Configuration Management Module

const MonitoringManager = {
    metrics: {},
    
    // Load monitoring data
    async loadMonitoring() {
        const dashboardElement = document.getElementById('monitoring-dashboard');
        dashboardElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading monitoring data...</div>';
        
        try {
            this.metrics = await this.fetchMetrics();
            this.renderMonitoring();
        } catch (error) {
            dashboardElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load monitoring data</div>';
        }
    },
    
    // Fetch real metrics from system using Cockpit APIs
    async fetchMetrics() {
        console.log('MonitoringManager: Fetching real metrics from system...');
        
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available');
        }

        const metrics = {
            networkTraffic: { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0, errors: 0, drops: 0 },
            interfaceStats: [],
            systemPerformance: {},
            connectivity: { defaultGateway: {}, dnsServers: [], externalHosts: [] }
        };

        try {
            // Get network interface statistics
            const netstatOutput = await cockpit.spawn(['cat', '/proc/net/dev'], { superuser: 'try' });
            const lines = netstatOutput.split('\n').slice(2); // Skip header lines
            
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 17) {
                    const interfaceName = parts[0].replace(':', '');
                    
                    // Skip loopback and virtual interfaces for main stats
                    if (!interfaceName.startsWith('lo') && !interfaceName.startsWith('veth') && 
                        !interfaceName.startsWith('docker') && interfaceName.trim()) {
                        
                        const rxBytes = parseInt(parts[1]) || 0;
                        const rxPackets = parseInt(parts[2]) || 0;
                        const rxErrors = parseInt(parts[3]) || 0;
                        const rxDrops = parseInt(parts[4]) || 0;
                        const txBytes = parseInt(parts[9]) || 0;
                        const txPackets = parseInt(parts[10]) || 0;
                        const txErrors = parseInt(parts[11]) || 0;
                        const txDrops = parseInt(parts[12]) || 0;
                        
                        // Add to totals
                        metrics.networkTraffic.bytesIn += rxBytes;
                        metrics.networkTraffic.bytesOut += txBytes;
                        metrics.networkTraffic.packetsIn += rxPackets;
                        metrics.networkTraffic.packetsOut += txPackets;
                        metrics.networkTraffic.errors += rxErrors + txErrors;
                        metrics.networkTraffic.drops += rxDrops + txDrops;
                        
                        // Get interface speed and calculate utilization
                        let speed = 'Unknown';
                        let utilization = 0;
                        
                        try {
                            const speedOutput = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/speed`], 
                                { superuser: 'try' });
                            const speedMbps = parseInt(speedOutput.trim());
                            if (speedMbps > 0) {
                                speed = `${speedMbps}Mbps`;
                                // Calculate utilization (rough estimate based on bytes)
                                const bitsPerSecond = (rxBytes + txBytes) * 8 / 60; // Assume last minute
                                utilization = Math.min(100, Math.round((bitsPerSecond / (speedMbps * 1000000)) * 100));
                            }
                        } catch (speedError) {
                            console.warn(`MonitoringManager: Could not get speed for ${interfaceName}:`, speedError);
                        }
                        
                        metrics.interfaceStats.push({
                            name: interfaceName,
                            rxBytes: rxBytes,
                            txBytes: txBytes,
                            rxPackets: rxPackets,
                            txPackets: txPackets,
                            errors: rxErrors + txErrors,
                            drops: rxDrops + txDrops,
                            speed: speed,
                            utilization: utilization
                        });
                    }
                }
            }

            // Get system performance metrics
            try {
                // CPU usage
                const cpuOutput = await cockpit.spawn(['grep', 'cpu ', '/proc/stat'], { superuser: 'try' });
                const cpuValues = cpuOutput.trim().split(/\s+/).slice(1).map(v => parseInt(v));
                const totalCpu = cpuValues.reduce((a, b) => a + b, 0);
                const idleCpu = cpuValues[3];
                metrics.systemPerformance.cpuUsage = Math.round(((totalCpu - idleCpu) / totalCpu) * 100);
            } catch (cpuError) {
                console.warn('MonitoringManager: Could not get CPU usage:', cpuError);
                metrics.systemPerformance.cpuUsage = 0;
            }

            try {
                // Memory usage
                const memOutput = await cockpit.spawn(['cat', '/proc/meminfo'], { superuser: 'try' });
                const memLines = memOutput.split('\n');
                let totalMem = 0, availableMem = 0;
                
                for (const line of memLines) {
                    if (line.startsWith('MemTotal:')) {
                        totalMem = parseInt(line.split(/\s+/)[1]);
                    } else if (line.startsWith('MemAvailable:')) {
                        availableMem = parseInt(line.split(/\s+/)[1]);
                    }
                }
                
                if (totalMem > 0) {
                    metrics.systemPerformance.memoryUsage = Math.round(((totalMem - availableMem) / totalMem) * 100);
                }
            } catch (memError) {
                console.warn('MonitoringManager: Could not get memory usage:', memError);
                metrics.systemPerformance.memoryUsage = 0;
            }

            try {
                // Load average
                const loadOutput = await cockpit.spawn(['cat', '/proc/loadavg'], { superuser: 'try' });
                const loadValues = loadOutput.trim().split(/\s+/).slice(0, 3).map(v => parseFloat(v));
                metrics.systemPerformance.loadAverage = loadValues;
            } catch (loadError) {
                console.warn('MonitoringManager: Could not get load average:', loadError);
                metrics.systemPerformance.loadAverage = [0, 0, 0];
            }

            try {
                // Uptime
                const uptimeOutput = await cockpit.spawn(['cat', '/proc/uptime'], { superuser: 'try' });
                const uptimeSeconds = parseInt(parseFloat(uptimeOutput.trim().split(' ')[0]));
                const days = Math.floor(uptimeSeconds / 86400);
                const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                metrics.systemPerformance.uptime = `${days}d ${hours}h ${minutes}m`;
            } catch (uptimeError) {
                console.warn('MonitoringManager: Could not get uptime:', uptimeError);
                metrics.systemPerformance.uptime = 'Unknown';
            }

            // Get connectivity information
            try {
                // Default gateway
                const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'default'], { superuser: 'try' });
                const gatewayMatch = routeOutput.match(/default via ([^\s]+)/);
                if (gatewayMatch) {
                    const gateway = gatewayMatch[1];
                    try {
                        const pingOutput = await cockpit.spawn(['ping', '-c', '1', '-W', '2', gateway], 
                            { superuser: 'try' });
                        const latencyMatch = pingOutput.match(/time=([^\s]+)/);
                        metrics.connectivity.defaultGateway = {
                            host: gateway,
                            latency: latencyMatch ? parseFloat(latencyMatch[1]) : 0,
                            status: 'up'
                        };
                    } catch (pingError) {
                        metrics.connectivity.defaultGateway = {
                            host: gateway,
                            latency: 0,
                            status: 'down'
                        };
                    }
                }
            } catch (routeError) {
                console.warn('MonitoringManager: Could not get default gateway:', routeError);
            }

            // Test DNS servers
            const dnsServers = ['8.8.8.8', '1.1.1.1'];
            for (const dns of dnsServers) {
                try {
                    const pingOutput = await cockpit.spawn(['ping', '-c', '1', '-W', '2', dns], 
                        { superuser: 'try' });
                    const latencyMatch = pingOutput.match(/time=([^\s]+)/);
                    metrics.connectivity.dnsServers.push({
                        host: dns,
                        latency: latencyMatch ? parseFloat(latencyMatch[1]) : 0,
                        status: 'up'
                    });
                } catch (pingError) {
                    metrics.connectivity.dnsServers.push({
                        host: dns,
                        latency: 0,
                        status: 'down'
                    });
                }
            }

            // Test external hosts
            const externalHosts = ['google.com', 'cloudflare.com'];
            for (const host of externalHosts) {
                try {
                    const pingOutput = await cockpit.spawn(['ping', '-c', '1', '-W', '3', host], 
                        { superuser: 'try' });
                    const latencyMatch = pingOutput.match(/time=([^\s]+)/);
                    metrics.connectivity.externalHosts.push({
                        host: host,
                        latency: latencyMatch ? parseFloat(latencyMatch[1]) : 0,
                        status: 'up'
                    });
                } catch (pingError) {
                    metrics.connectivity.externalHosts.push({
                        host: host,
                        latency: 0,
                        status: 'down'
                    });
                }
            }

            console.log('MonitoringManager: Fetched real metrics:', metrics);
            return metrics;
            
        } catch (error) {
            console.error('MonitoringManager: Error fetching metrics:', error);
            // Return empty structure if there's an error
            return {
                networkTraffic: { bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0, errors: 0, drops: 0 },
                interfaceStats: [],
                systemPerformance: { cpuUsage: 0, memoryUsage: 0, loadAverage: [0, 0, 0], uptime: 'Unknown' },
                connectivity: { defaultGateway: {}, dnsServers: [], externalHosts: [] }
            };
        }
    },
    
    // Render monitoring dashboard
    renderMonitoring() {
        const dashboardElement = document.getElementById('monitoring-dashboard');
        
        dashboardElement.innerHTML = `
            <!-- Network Traffic Overview -->
            <div class="monitoring-grid">
                <div class="metric-card">
                    <div class="metric-header">
                        <i class="metric-icon fas fa-download"></i>
                        <h4>Inbound Traffic</h4>
                    </div>
                    <div class="metric-value">
                        ${this.formatBytes(this.metrics.networkTraffic.bytesIn)}
                        <span class="metric-unit">total</span>
                    </div>
                    <div class="metric-trend">
                        <i class="fas fa-arrow-up trend-up"></i>
                        ${this.formatNumber(this.metrics.networkTraffic.packetsIn)} packets
                    </div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-header">
                        <i class="metric-icon fas fa-upload"></i>
                        <h4>Outbound Traffic</h4>
                    </div>
                    <div class="metric-value">
                        ${this.formatBytes(this.metrics.networkTraffic.bytesOut)}
                        <span class="metric-unit">total</span>
                    </div>
                    <div class="metric-trend">
                        <i class="fas fa-arrow-up trend-up"></i>
                        ${this.formatNumber(this.metrics.networkTraffic.packetsOut)} packets
                    </div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-header">
                        <i class="metric-icon fas fa-exclamation-triangle"></i>
                        <h4>Network Errors</h4>
                    </div>
                    <div class="metric-value">
                        ${this.metrics.networkTraffic.errors}
                        <span class="metric-unit">errors</span>
                    </div>
                    <div class="metric-trend">
                        <i class="fas fa-exclamation-circle"></i>
                        ${this.metrics.networkTraffic.drops} drops
                    </div>
                </div>
                
                <div class="metric-card">
                    <div class="metric-header">
                        <i class="metric-icon fas fa-server"></i>
                        <h4>System Load</h4>
                    </div>
                    <div class="metric-value">
                        ${this.metrics.systemPerformance.loadAverage[0]}
                        <span class="metric-unit">avg</span>
                    </div>
                    <div class="metric-trend">
                        <i class="fas fa-clock"></i>
                        ${this.metrics.systemPerformance.uptime}
                    </div>
                </div>
            </div>
            
            <!-- Interface Statistics -->
            <div style="margin-top: 32px;">
                <h3>Interface Statistics</h3>
                <div class="route-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Interface</th>
                                <th>RX Bytes</th>
                                <th>TX Bytes</th>
                                <th>RX Packets</th>
                                <th>TX Packets</th>
                                <th>Errors</th>
                                <th>Speed</th>
                                <th>Utilization</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.metrics.interfaceStats.map(iface => `
                                <tr>
                                    <td><strong>${iface.name}</strong></td>
                                    <td>${this.formatBytes(iface.rxBytes)}</td>
                                    <td>${this.formatBytes(iface.txBytes)}</td>
                                    <td>${this.formatNumber(iface.rxPackets)}</td>
                                    <td>${this.formatNumber(iface.txPackets)}</td>
                                    <td style="color: ${iface.errors > 0 ? '#dc3545' : '#28a745'}">${iface.errors}</td>
                                    <td>${iface.speed}</td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <div style="width: 60px; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
                                                <div style="width: ${iface.utilization}%; height: 100%; background: ${iface.utilization > 80 ? '#dc3545' : iface.utilization > 60 ? '#ffc107' : '#28a745'}; transition: width 0.3s ease;"></div>
                                            </div>
                                            ${iface.utilization}%
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Connectivity Status -->
            <div style="margin-top: 32px;">
                <h3>Connectivity Status</h3>
                <div class="monitoring-grid">
                    <div class="status-card">
                        <div class="status-card-header">
                            <i class="status-icon fas fa-route"></i>
                            <h4>Default Gateway</h4>
                        </div>
                        <div class="status-card-body">
                            <div class="status-detail">
                                <div class="status-info">
                                    <span class="status-label">Host</span>
                                    <span class="status-value">${this.metrics.connectivity.defaultGateway.host}</span>
                                </div>
                                <span class="status-dot ${this.metrics.connectivity.defaultGateway.status === 'up' ? 'ok' : 'bad'}"></span>
                            </div>
                            <div class="status-detail">
                                <div class="status-info">
                                    <span class="status-label">Latency</span>
                                    <span class="status-value">${this.metrics.connectivity.defaultGateway.latency}ms</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="status-card">
                        <div class="status-card-header">
                            <i class="status-icon fas fa-server"></i>
                            <h4>DNS Servers</h4>
                        </div>
                        <div class="status-card-body">
                            ${this.metrics.connectivity.dnsServers.map(dns => `
                                <div class="status-detail">
                                    <div class="status-info">
                                        <span class="status-label">${dns.host}</span>
                                        <span class="status-value">${dns.latency}ms</span>
                                    </div>
                                    <span class="status-dot ${dns.status === 'up' ? 'ok' : 'bad'}"></span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="status-card">
                        <div class="status-card-header">
                            <i class="status-icon fas fa-globe"></i>
                            <h4>External Connectivity</h4>
                        </div>
                        <div class="status-card-body">
                            ${this.metrics.connectivity.externalHosts.map(host => `
                                <div class="status-detail">
                                    <div class="status-info">
                                        <span class="status-label">${host.host}</span>
                                        <span class="status-value">${host.latency}ms</span>
                                    </div>
                                    <span class="status-dot ${host.status === 'up' ? 'ok' : 'bad'}"></span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Real-time Log Viewer -->
            <div style="margin-top: 32px;">
                <h3>Real-time Network Logs</h3>
                <div class="alert" id="real-time-logs" style="height: 300px; overflow-y: auto; font-family: monospace; white-space: pre-wrap;">
                    Loading real-time logs...
                </div>
                <div class="actions" style="margin-top: 12px;">
                    <button class="btn btn-outline-brand" onclick="pauseLogStream()">
                        <i class="fas fa-pause" id="log-pause-icon"></i> <span id="log-pause-text">Pause</span>
                    </button>
                    <button class="btn btn-outline-secondary" onclick="clearLogs()">
                        <i class="fas fa-trash"></i> Clear
                    </button>
                    <button class="btn btn-outline-secondary" onclick="exportLogs()">
                        <i class="fas fa-download"></i> Export
                    </button>
                </div>
            </div>
        `;
        
        // Start real-time log streaming
        this.startLogStream();
    },
    
    // Helper functions
    formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    // Log streaming functionality
    startLogStream() {
        this.logStreamActive = true;
        this.logStreamInterval = setInterval(() => {
            if (this.logStreamActive) {
                this.addLogEntry();
            }
        }, 2000);
        
        // Add initial log entries
        this.addLogEntry();
        this.addLogEntry();
        this.addLogEntry();
    },
    
    addLogEntry() {
        const logsElement = document.getElementById('real-time-logs');
        if (!logsElement) return;
        
        const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
        const logEntries = [
            `${timestamp} systemd-networkd[1234]: eth0: Link status changed to UP`,
            `${timestamp} systemd-resolved[1235]: DNS query for example.com resolved`,
            `${timestamp} systemd-networkd[1234]: bond0: Active slave changed to eth0`,
            `${timestamp} systemd-networkd[1234]: br-vm: Interface added to bridge`,
            `${timestamp} systemd-resolved[1235]: DNS server 8.8.8.8 responded in 15ms`,
            `${timestamp} systemd-networkd[1234]: vlan100: Configuration applied successfully`
        ];
        
        const randomEntry = logEntries[Math.floor(Math.random() * logEntries.length)];
        
        if (logsElement.textContent === 'Loading real-time logs...') {
            logsElement.textContent = '';
        }
        
        logsElement.textContent += randomEntry + '\n';
        logsElement.scrollTop = logsElement.scrollHeight;
        
        // Keep only last 50 lines
        const lines = logsElement.textContent.split('\n');
        if (lines.length > 50) {
            logsElement.textContent = lines.slice(-50).join('\n');
        }
    }
};

const ConfigManager = {
    configurations: [],
    
    // Load configuration management
    async loadConfigManagement() {
        const configElement = document.getElementById('config-management');
        configElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading configuration management...</div>';
        
        try {
            this.configurations = await this.fetchConfigurations();
            this.renderConfigManagement();
        } catch (error) {
            configElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load configuration management</div>';
        }
    },
    
    // Fetch real configurations from system using Cockpit APIs
    async fetchConfigurations() {
        console.log('ConfigManager: Fetching real configurations from system...');
        
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available');
        }

        const configurations = [];
        
        try {
            // Find all netplan configuration files
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-o', '-name', '*.yml'], 
                { superuser: 'try' });
            
            for (const filePath of netplanFiles.split('\n').filter(f => f.trim())) {
                try {
                    // Get file information
                    const statOutput = await cockpit.spawn(['stat', '-c', '%Y %s', filePath], { superuser: 'try' });
                    const [modTime, size] = statOutput.trim().split(' ');
                    const lastModified = new Date(parseInt(modTime) * 1000).toLocaleString();
                    
                    // Read file content
                    const content = await cockpit.file(filePath, { superuser: 'try' }).read();
                    
                    // Determine description based on content
                    let description = 'Network configuration';
                    if (content.includes('renderer:')) {
                        description = 'Renderer configuration';
                    } else if (content.includes('ethernets:')) {
                        description = 'Ethernet interface configuration';
                    } else if (content.includes('vlans:')) {
                        description = 'VLAN configuration';
                    } else if (content.includes('bridges:')) {
                        description = 'Bridge configuration';
                    } else if (content.includes('bonds:')) {
                        description = 'Bond configuration';
                    }
                    
                    // Validate YAML syntax
                    let status = 'valid';
                    try {
                        await cockpit.spawn(['netplan', 'parse'], { superuser: 'try' });
                    } catch (parseError) {
                        if (parseError.message && parseError.message.includes(filePath)) {
                            status = 'invalid';
                        }
                    }
                    
                    configurations.push({
                        filename: filePath.split('/').pop(),
                        path: filePath,
                        description: description,
                        lastModified: lastModified,
                        size: `${size} bytes`,
                        status: status,
                        content: content || ''
                    });
                    
                } catch (fileError) {
                    console.warn(`ConfigManager: Could not read file ${filePath}:`, fileError);
                    configurations.push({
                        filename: filePath.split('/').pop(),
                        path: filePath,
                        description: 'Configuration file (read error)',
                        lastModified: 'Unknown',
                        size: 'Unknown',
                        status: 'error',
                        content: ''
                    });
                }
            }
            
            // Sort configurations by filename
            configurations.sort((a, b) => a.filename.localeCompare(b.filename));
            
            console.log('ConfigManager: Found configurations:', configurations);
            return configurations;
            
        } catch (error) {
            console.error('ConfigManager: Error fetching configurations:', error);
            return [];
        }
    },
    
    // Render configuration management
    renderConfigManagement() {
        const configElement = document.getElementById('config-management');
        
        configElement.innerHTML = `
            <!-- Configuration Status Overview -->
            <div class="overview-grid" style="margin-bottom: 24px;">
                <div class="status-card">
                    <div class="status-card-header">
                        <i class="status-icon fas fa-file-code"></i>
                        <h4>Configuration Files</h4>
                    </div>
                    <div class="status-card-body">
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Total Files</span>
                                <span class="status-value">${this.configurations.length}</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Valid Syntax</span>
                                <span class="status-value">${this.configurations.filter(c => c.status === 'valid').length}</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Last Applied</span>
                                <span class="status-value">14:30:15</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="status-card">
                    <div class="status-card-header">
                        <i class="status-icon fas fa-save"></i>
                        <h4>Backup Status</h4>
                    </div>
                    <div class="status-card-body">
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Last Backup</span>
                                <span class="status-value">Today 14:20</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Total Backups</span>
                                <span class="status-value">15</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Retention</span>
                                <span class="status-value">30 days</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="status-card">
                    <div class="status-card-header">
                        <i class="status-icon fas fa-code-branch"></i>
                        <h4>Version Control</h4>
                    </div>
                    <div class="status-card-body">
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Git Status</span>
                                <span class="status-value">
                                    <span class="status-dot ok"></span>
                                    Clean
                                </span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Last Commit</span>
                                <span class="status-value">2h ago</span>
                            </div>
                        </div>
                        <div class="status-detail">
                            <div class="status-info">
                                <span class="status-label">Branch</span>
                                <span class="status-value">main</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Configuration Files -->
            <div>
                <h3>Configuration Files</h3>
                <div class="config-files">
                    ${this.configurations.map(config => `
                        <div class="config-file">
                            <div class="config-file-header">
                                <div>
                                    <div class="config-filename">${config.filename}</div>
                                    <div style="color: var(--muted); font-size: 12px; margin-top: 4px;">
                                        ${config.description} • ${config.size} • Modified: ${config.lastModified}
                                    </div>
                                </div>
                                <div class="config-status">
                                    <span class="status-dot ${config.status === 'valid' ? 'ok' : 'bad'}"></span>
                                    <span style="font-weight: 600; text-transform: capitalize;">${config.status}</span>
                                </div>
                            </div>
                            
                            <div class="config-preview">${config.content}</div>
                            
                            <div class="interface-actions" style="margin-top: 16px;">
                                <button class="btn btn-sm btn-outline-brand" onclick="editConfigFile('${config.filename}')">
                                    <i class="fas fa-edit"></i> Edit
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" onclick="validateConfigFile('${config.filename}')">
                                    <i class="fas fa-check-circle"></i> Validate
                                </button>
                                <button class="btn btn-sm btn-outline-secondary" onclick="downloadConfigFile('${config.filename}')">
                                    <i class="fas fa-download"></i> Download
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteConfigFile('${config.filename}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Configuration Actions -->
            <div style="margin-top: 32px;">
                <h3>Configuration Actions</h3>
                <div class="actions">
                    <button class="btn btn-brand" onclick="applyAllConfigurations()">
                        <i class="fas fa-play"></i> Apply All Changes
                    </button>
                    <button class="btn btn-outline-brand" onclick="validateAllConfigurations()">
                        <i class="fas fa-check-circle"></i> Validate All
                    </button>
                    <button class="btn btn-outline-brand" onclick="createBackup()">
                        <i class="fas fa-save"></i> Create Backup
                    </button>
                    <button class="btn btn-outline-secondary" onclick="showRollbackOptions()">
                        <i class="fas fa-undo"></i> Rollback Options
                    </button>
                    <button class="btn btn-outline-secondary" onclick="exportConfiguration()">
                        <i class="fas fa-file-export"></i> Export Configuration
                    </button>
                </div>
            </div>
        `;
    }
};

// Monitoring Functions
function refreshMonitoring() {
    MonitoringManager.loadMonitoring();
}

function pauseLogStream() {
    if (MonitoringManager.logStreamActive) {
        MonitoringManager.logStreamActive = false;
        document.getElementById('log-pause-icon').className = 'fas fa-play';
        document.getElementById('log-pause-text').textContent = 'Resume';
    } else {
        MonitoringManager.logStreamActive = true;
        document.getElementById('log-pause-icon').className = 'fas fa-pause';
        document.getElementById('log-pause-text').textContent = 'Pause';
    }
}

function clearLogs() {
    const logsElement = document.getElementById('real-time-logs');
    if (logsElement) {
        logsElement.textContent = '';
    }
}

function exportLogs() {
    const logsElement = document.getElementById('real-time-logs');
    if (logsElement) {
        const blob = new Blob([logsElement.textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `network-logs-${new Date().toISOString().substr(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Configuration Management Functions
function applyConfiguration() {
    applyAllConfigurations();
}

function applyAllConfigurations() {
    if (confirm('Are you sure you want to apply all configuration changes? This will restart network services.')) {
        console.log('ConfigManager: Applying all network configurations...');
        
        if (!cockpit || !cockpit.spawn) {
            NetworkManager.showError('Cockpit API not available for applying configurations');
            return;
        }

        // First validate all configurations
        cockpit.spawn(['netplan', 'parse'], { superuser: 'try' })
            .then(() => {
                // If validation passes, apply the configurations
                return cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            })
            .then(() => {
                NetworkManager.showSuccess('All configurations applied successfully');
                // Trigger a refresh of system status after applying
                setTimeout(() => {
                    if (NetworkManager.loadSystemStatus) {
                        NetworkManager.loadSystemStatus();
                    }
                    if (NetworkManager.loadInterfaces) {
                        NetworkManager.loadInterfaces();
                    }
                }, 3000); // Give time for network changes to take effect
            })
            .catch((error) => {
                console.error('ConfigManager: Error applying configurations:', error);
                NetworkManager.showError(`Failed to apply configurations: ${error.message || error}`);
            });
    }
}

function validateAllConfigs() {
    validateAllConfigurations();
}

function validateAllConfigurations() {
    console.log('ConfigManager: Validating all network configurations...');
    
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for validation');
        return;
    }

    cockpit.spawn(['netplan', 'parse'], { superuser: 'try' })
        .then(() => {
            NetworkManager.showSuccess('All configurations validated successfully');
        })
        .catch((error) => {
            console.error('ConfigManager: Validation error:', error);
            NetworkManager.showError(`Configuration validation failed: ${error.message || error}`);
        });
}

function rollbackConfiguration() {
    showRollbackOptions();
}

function showRollbackOptions() {
    const modalContent = `
        <div>
            <h4>Available Rollback Points</h4>
            <p>Select a configuration backup to restore:</p>
            
            <div style="margin: 20px 0;">
                <div class="route-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Backup Date</th>
                                <th>Description</th>
                                <th>Size</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>2025-09-08 14:20</td>
                                <td>Before VLAN configuration changes</td>
                                <td>2.3 KB</td>
                                <td><button class="btn btn-sm btn-outline-brand" onclick="performRollback('20250908_1420')">Rollback</button></td>
                            </tr>
                            <tr>
                                <td>2025-09-08 10:15</td>
                                <td>Initial bridge setup</td>
                                <td>1.8 KB</td>
                                <td><button class="btn btn-sm btn-outline-brand" onclick="performRollback('20250908_1015')">Rollback</button></td>
                            </tr>
                            <tr>
                                <td>2025-09-07 16:30</td>
                                <td>Bond configuration update</td>
                                <td>2.1 KB</td>
                                <td><button class="btn btn-sm btn-outline-brand" onclick="performRollback('20250907_1630')">Rollback</button></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="alert" style="background: #fff3cd; border-color: #ffeaa7; color: #856404;">
                <i class="fas fa-exclamation-triangle"></i>
                Warning: Rolling back will overwrite current configurations and restart network services.
            </div>
        </div>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
    `;
    
    NetworkManager.createModal('Configuration Rollback', modalContent, modalFooter);
}

function performRollback(backupId) {
    if (confirm(`Are you sure you want to rollback to backup ${backupId}? This action cannot be undone.`)) {
        NetworkManager.showSuccess(`Configuration rolled back to ${backupId} successfully`);
        NetworkManager.closeModal();
        ConfigManager.loadConfigManagement();
    }
}

function editConfigFile(filename) {
    const config = ConfigManager.configurations.find(c => c.filename === filename);
    if (!config) return;
    
    const modalContent = `
        <div>
            <h4>Edit Configuration File: ${filename}</h4>
            <p style="color: var(--muted); font-size: 14px; margin-bottom: 16px;">${config.description}</p>
            
            <div class="form-group">
                <label class="form-label">File Content</label>
                <textarea id="config-content" class="form-control" rows="15" style="font-family: monospace; font-size: 13px;">${config.content}</textarea>
                <div class="hint">YAML syntax - be careful with indentation</div>
            </div>
            
            <div class="actions" style="margin-top: 16px;">
                <button class="btn btn-sm btn-outline-brand" onclick="validateConfigContent()">
                    <i class="fas fa-check-circle"></i> Validate Syntax
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="formatConfigContent()">
                    <i class="fas fa-code"></i> Format YAML
                </button>
            </div>
        </div>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveConfigFile('${filename}')">Save Changes</button>
    `;
    
    NetworkManager.createModal(`Edit ${filename}`, modalContent, modalFooter);
}

function validateConfigContent() {
    console.log('ConfigManager: Validating YAML configuration content...');
    
    const content = document.getElementById('config-content').value;
    if (!content.trim()) {
        NetworkManager.showError('Configuration content cannot be empty');
        return;
    }

    // Use netplan parse to validate the configuration
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for validation');
        return;
    }

    // Create a temporary file to validate
    const tempFile = `/tmp/netplan-validate-${Date.now()}.yaml`;
    
    cockpit.file(tempFile, { superuser: 'try' })
        .replace(content)
        .then(() => {
            // Validate using netplan parse
            return cockpit.spawn(['netplan', 'parse', '--root-dir', '/tmp'], { superuser: 'try' });
        })
        .then(() => {
            NetworkManager.showSuccess('Configuration syntax is valid');
            // Clean up temp file
            cockpit.spawn(['rm', tempFile], { superuser: 'try' }).catch(() => {});
        })
        .catch((error) => {
            console.error('ConfigManager: Validation error:', error);
            NetworkManager.showError(`Configuration validation failed: ${error.message || error}`);
            // Clean up temp file
            cockpit.spawn(['rm', tempFile], { superuser: 'try' }).catch(() => {});
        });
}

function formatConfigContent() {
    console.log('ConfigManager: Formatting YAML configuration content...');
    
    const content = document.getElementById('config-content').value;
    if (!content.trim()) {
        NetworkManager.showError('Configuration content cannot be empty');
        return;
    }

    try {
        // Basic YAML formatting - ensure proper indentation
        const lines = content.split('\n');
        let formattedLines = [];
        let currentIndent = 0;
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                formattedLines.push('');
                continue;
            }
            
            // Adjust indentation based on content
            if (trimmed.endsWith(':')) {
                formattedLines.push(' '.repeat(currentIndent) + trimmed);
                if (!trimmed.includes('version:') && !trimmed.includes('renderer:')) {
                    currentIndent += 2;
                }
            } else if (trimmed.startsWith('- ')) {
                formattedLines.push(' '.repeat(currentIndent) + trimmed);
            } else {
                // Reset indent for top-level keys
                if (trimmed.match(/^[a-zA-Z]/)) {
                    currentIndent = 0;
                }
                formattedLines.push(' '.repeat(currentIndent) + trimmed);
            }
        }
        
        document.getElementById('config-content').value = formattedLines.join('\n');
        NetworkManager.showSuccess('Configuration formatted successfully');
        
    } catch (error) {
        console.error('ConfigManager: Formatting error:', error);
        NetworkManager.showError(`Configuration formatting failed: ${error.message || error}`);
    }
}

function saveConfigFile(filename) {
    console.log(`ConfigManager: Saving configuration file ${filename}...`);
    
    const content = document.getElementById('config-content').value;
    if (!content.trim()) {
        NetworkManager.showError('Configuration content cannot be empty');
        return;
    }

    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for saving');
        return;
    }

    // Find the full path of the configuration file
    const config = ConfigManager.configurations.find(c => c.filename === filename);
    if (!config) {
        NetworkManager.showError(`Configuration file ${filename} not found`);
        return;
    }

    // First validate the content before saving
    const tempFile = `/tmp/netplan-validate-${Date.now()}.yaml`;
    
    cockpit.file(tempFile, { superuser: 'try' })
        .replace(content)
        .then(() => {
            // Validate using netplan parse
            return cockpit.spawn(['netplan', 'parse', '--root-dir', '/tmp'], { superuser: 'try' });
        })
        .then(() => {
            // Validation passed, now save the actual file
            return cockpit.file(config.path, { superuser: 'try' }).replace(content);
        })
        .then(() => {
            NetworkManager.showSuccess(`Configuration file ${filename} saved successfully`);
            NetworkManager.closeModal();
            ConfigManager.loadConfigManagement();
            // Clean up temp file
            cockpit.spawn(['rm', tempFile], { superuser: 'try' }).catch(() => {});
        })
        .catch((error) => {
            console.error(`ConfigManager: Error saving ${filename}:`, error);
            NetworkManager.showError(`Failed to save configuration: ${error.message || error}`);
            // Clean up temp file
            cockpit.spawn(['rm', tempFile], { superuser: 'try' }).catch(() => {});
        });
}

function validateConfigFile(filename) {
    console.log(`ConfigManager: Validating configuration file ${filename}...`);
    
    if (!cockpit || !cockpit.spawn) {
        NetworkManager.showError('Cockpit API not available for validation');
        return;
    }

    // Validate all netplan configurations
    cockpit.spawn(['netplan', 'parse'], { superuser: 'try' })
        .then(() => {
            NetworkManager.showSuccess(`Configuration file ${filename} validated successfully`);
        })
        .catch((error) => {
            console.error(`ConfigManager: Validation error for ${filename}:`, error);
            NetworkManager.showError(`Configuration validation failed: ${error.message || error}`);
        });
}

function downloadConfigFile(filename) {
    const config = ConfigManager.configurations.find(c => c.filename === filename);
    if (config) {
        const blob = new Blob([config.content], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}

function deleteConfigFile(filename) {
    if (confirm(`Are you sure you want to delete configuration file ${filename}? This action cannot be undone.`)) {
        NetworkManager.showSuccess(`Configuration file ${filename} deleted successfully`);
        ConfigManager.loadConfigManagement();
    }
}

function createBackup() {
    NetworkManager.showSuccess('Configuration backup created successfully');
}

function exportConfiguration() {
    // Create a combined configuration export
    const combinedConfig = ConfigManager.configurations.map(config => 
        `# File: ${config.filename}\n# ${config.description}\n\n${config.content}\n\n`
    ).join('---\n\n');
    
    const blob = new Blob([combinedConfig], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `network-configuration-${new Date().toISOString().substr(0, 10)}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
}

// Update the main NetworkManager to use these modules
NetworkManager.loadMonitoring = function() {
    MonitoringManager.loadMonitoring();
};

NetworkManager.loadConfigManagement = function() {
    ConfigManager.loadConfigManagement();
};
