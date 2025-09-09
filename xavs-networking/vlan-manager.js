// VLAN Management Module

// Utility function to provide immediate button feedback
function setButtonLoading(button, loadingText = 'Processing...') {
    if (!button) return null;
    
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
    button.classList.add('loading');
    
    return () => {
        button.disabled = false;
        button.innerHTML = originalContent;
        button.classList.remove('loading');
    };
}

const VlanManager = {
    vlans: [],
    isLoading: false, // Flag to prevent concurrent loading
    permissionsFixed: false, // Track if permissions have been fixed
    
    // Force refresh VLAN data from system
    async refreshVlanData() {
        NetworkLogger.info('Force refreshing VLAN data from system...');
        this.vlans = []; // Clear existing data
        await this.loadVlans();
    },
    
    // Fix permissions for all XAVS Netplan files
    async fixNetplanPermissions() {
        try {
            NetworkLogger.info('Checking and fixing Netplan file permissions...');
            const xavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*-xavs-*.yaml'], { superuser: 'try' });
            const files = xavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    await cockpit.spawn(['chmod', '600', file], { superuser: 'try' });
                    NetworkLogger.success(`Fixed permissions for ${file}`);
                } catch (error) {
                    NetworkLogger.warning(`Could not fix permissions for ${file}: ${error.message || error}`);
                }
            }
        } catch (error) {
            NetworkLogger.warning(`Error fixing Netplan permissions: ${error.message || error}`);
        }
    },
    
    // Load VLAN configurations
    async loadVlans() {
        if (this.isLoading) {
            NetworkLogger.info('Already loading VLANs, skipping...');
            return;
        }
        
        this.isLoading = true;
        const listElement = document.getElementById('vlan-list');
        if (listElement) {
            listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading VLANs...</div>';
        }
        
        try {
            // Fix permissions on first load
            if (!this.permissionsFixed) {
                await this.fixNetplanPermissions();
                this.permissionsFixed = true;
            }
        
            this.vlans = await this.fetchVlans();
            this.renderVlans();
            NetworkLogger.success(`Loaded ${this.vlans.length} VLAN configurations`);
        } catch (error) {
            NetworkLogger.error(`Failed to load VLANs: ${error.message || error}`);
            if (listElement) {
                listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load VLANs</div>';
            }
        } finally {
            this.isLoading = false;
        }
    },
    
    // Fetch real VLANs from system using Cockpit APIs
    async fetchVlans() {
        NetworkLogger.info('Fetching VLAN interfaces from system...');
        
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available');
        }

        const vlans = [];
        
        try {
            // STEP 1: Get real system interfaces from 'ip a' output - this is the source of truth
            const ipOutput = await cockpit.spawn(['ip', 'a'], { superuser: 'try' });
            const lines = ipOutput.split('\n');
            
            NetworkLogger.info('[fetchVlans] Processing ip a output for VLAN interfaces...');
            
            for (const line of lines) {
                // Match interface lines with or without parent interface notation
                const match = line.match(/^\d+:\s+([^@:]+)(?:@([^:]+))?:/);
                if (match) {
                    const interfaceName = match[1];
                    const parentFromMatch = match[2]; // This could be undefined
                    
                    // Check if this is a VLAN interface (standard naming patterns)
                    const vlanMatch = interfaceName.match(/^(.+)\.(\d+)$/) || 
                                     interfaceName.match(/^vlan(\d+)$/);
                    
                    if (vlanMatch) {
                        const vlanId = parseInt(vlanMatch[vlanMatch.length - 1]);
                        let parent = 'unknown';
                        
                        // Determine parent interface - prioritize system info over name parsing
                        if (parentFromMatch) {
                            // Format like eno4.1111@eno1 - parent is from @ (most reliable)
                            parent = parentFromMatch;
                        } else {
                            // Try to get parent from system first
                            try {
                                const vlanInfo = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/vlan/real_dev_name`], { superuser: 'try' });
                                parent = vlanInfo.trim();
                            } catch (vlanInfoError) {
                                // Fallback to name-based parsing
                                if (vlanMatch.length === 3) {
                                    // Format like eth0.100 - parent is eth0
                                    parent = vlanMatch[1];
                                } else {
                                    NetworkLogger.warning(`VlanManager: Could not determine parent for ${interfaceName}:`, vlanInfoError);
                                }
                            }
                        }
                        
                        NetworkLogger.info(`VlanManager: Found system VLAN ${interfaceName} (ID: ${vlanId}, Parent: ${parent})`);
                        
                        try {
                            // Get interface details from system
                            const details = await this.getVlanDetailsFromSystem(interfaceName, ipOutput);
                            
                            vlans.push({
                                id: vlanId,
                                name: interfaceName,
                                parentInterface: parent,
                                description: details.description || `VLAN ${vlanId} on ${parent}`,
                                ip: details.ip || 'Not configured',
                                ipAddresses: details.ipAddresses || [],
                                gateway: details.gateway || 'Not configured',
                                dns: details.dns || [],
                                status: details.status || 'unknown',
                                configFile: details.configFile || 'Not configured',
                                source: 'system' // Mark as real system interface
                            });
                        } catch (error) {
                            NetworkLogger.warning(`VlanManager: Could not get details for VLAN ${interfaceName}:`, error);
                            vlans.push({
                                id: vlanId,
                                name: interfaceName,
                                parentInterface: parent,
                                description: `VLAN ${vlanId} on ${parent}`,
                                ip: 'Not configured',
                                ipAddresses: [],
                                gateway: 'Not configured',
                                dns: [],
                                status: 'unknown',
                                configFile: 'Not configured',
                                source: 'system'
                            });
                        }
                    }
                }
            }
            
            // STEP 2: Check Netplan files for VLANs that might not be active/visible in system
            // But only add them if they don't already exist in the system list
            NetworkLogger.info('[fetchVlans] Checking Netplan files for additional VLAN configurations...');
            const netplanVlans = await this.fetchVlansFromNetplan();
            
            for (const netplanVlan of netplanVlans) {
                // Only add if not already found in system
                const existingVlan = vlans.find(v => 
                    v.name === netplanVlan.name || 
                    (v.id === netplanVlan.id && v.parentInterface === netplanVlan.parentInterface)
                );
                
                if (!existingVlan) {
                    NetworkLogger.info(`VlanManager: Adding Netplan-only VLAN: ${netplanVlan.name}`);
                    netplanVlan.source = 'netplan'; // Mark as config-only
                    netplanVlan.status = 'configured'; // But not active
                    vlans.push(netplanVlan);
                }
            }
            
            NetworkLogger.info(`VlanManager: Found ${vlans.length} total VLANs:`, vlans);
            return vlans;
            
        } catch (error) {
            NetworkLogger.error('Error fetching VLANs:', error);
            return [];
        }
    },

    // Get VLAN details from system (ip a output and other system sources)
    async getVlanDetailsFromSystem(interfaceName, ipOutput) {
        NetworkLogger.info(`[getVlanDetailsFromSystem] Getting details for ${interfaceName}`);
        
        const details = {
            ipAddresses: [],
            status: 'unknown',
            description: '',
            gateway: '',
            dns: [],
            configFile: 'Not configured'
        };
        
        try {
            // Parse ip a output to get IP addresses for this interface
            // Split by lines and look for the interface block
            const lines = ipOutput.split('\n');
            let inInterfaceBlock = false;
            let interfaceFound = false;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Check if this line starts a new interface block
                const interfaceMatch = line.match(/^\d+:\s+([^@:\s]+)(?:@([^:\s]+))?:/);
                if (interfaceMatch) {
                    const currentInterface = interfaceMatch[1];
                    if (currentInterface === interfaceName) {
                        inInterfaceBlock = true;
                        interfaceFound = true;
                        
                        NetworkLogger.info(`[getVlanDetailsFromSystem] Found interface block for ${interfaceName}: ${line.trim()}`);
                        
                        // Check interface status from this line
                        if (line.includes('state UP')) {
                            details.status = 'up';
                        } else if (line.includes('state DOWN')) {
                            details.status = 'down';
                        } else if (line.includes('<UP,')) {
                            details.status = 'up';
                        } else {
                            details.status = 'down';
                        }
                        
                        NetworkLogger.info(`[getVlanDetailsFromSystem] Found interface ${interfaceName}, status: ${details.status}`);
                        continue;
                    } else {
                        // Different interface, stop processing if we were in our block
                        if (inInterfaceBlock) {
                            NetworkLogger.info(`[getVlanDetailsFromSystem] Exiting interface block for ${interfaceName}, found new interface: ${currentInterface}`);
                            break;
                        }
                        inInterfaceBlock = false;
                    }
                }
                
                // If we're in our interface block, look for IP addresses
                if (inInterfaceBlock && line.trim().startsWith('inet ')) {
                    const ipMatch = line.match(/inet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(?:\/[0-9]+)?)/);
                    if (ipMatch) {
                        let ipWithCidr = ipMatch[1];
                        // Ensure CIDR notation - if no /XX, default to /24
                        if (!ipWithCidr.includes('/')) {
                            ipWithCidr += '/24';
                        }
                        details.ipAddresses.push(ipWithCidr);
                        NetworkLogger.info(`[getVlanDetailsFromSystem] Found IP address: ${ipWithCidr}`);
                    }
                }
                
                // Also check for inet6 addresses
                if (inInterfaceBlock && line.trim().startsWith('inet6 ')) {
                    const ipv6Match = line.match(/inet6\s+([0-9a-fA-F:]+(?:\/[0-9]+)?)/);
                    if (ipv6Match && !ipv6Match[1].startsWith('fe80') && !ipv6Match[1].startsWith('::1')) {
                        // Skip link-local and loopback addresses
                        const ipv6WithCidr = ipv6Match[1];
                        details.ipAddresses.push(ipv6WithCidr);
                        NetworkLogger.info(`[getVlanDetailsFromSystem] Found IPv6 address: ${ipv6WithCidr}`);
                    }
                }
            }
            
            if (!interfaceFound) {
                NetworkLogger.warning(`[getVlanDetailsFromSystem] Interface ${interfaceName} not found in ip output`);
            }
            
            // Set primary IP for backward compatibility
            details.ip = details.ipAddresses.length > 0 ? details.ipAddresses[0] : 'Not configured';
            
            // Try to get gateway information for this interface
            try {
                const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'dev', interfaceName], { superuser: 'try' });
                const gatewayMatch = routeOutput.match(/default via ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
                if (gatewayMatch) {
                    details.gateway = gatewayMatch[1];
                    NetworkLogger.info(`[getVlanDetailsFromSystem] Found gateway: ${details.gateway}`);
                }
            } catch (gatewayError) {
                NetworkLogger.info(`[getVlanDetailsFromSystem] No gateway found for ${interfaceName}`);
            }
            
            // Try to find associated Netplan config file and extract DNS info
            try {
                const configFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-exec', 'grep', '-l', interfaceName, '{}', ';'], { superuser: 'try' });
                if (configFiles.trim()) {
                    const files = configFiles.trim().split('\n');
                    details.configFile = files[0]; // Use first match
                    
                    // Try to extract DNS information from the config file
                    try {
                        const configContent = await cockpit.file(files[0], { superuser: 'try' }).read();
                        const dnsMatch = configContent.match(/nameservers:\s*\n\s*addresses:\s*\[(.*?)\]/s);
                        if (dnsMatch) {
                            const dnsServers = dnsMatch[1].split(',').map(dns => dns.trim().replace(/["\[\]]/g, ''));
                            details.dns = dnsServers.filter(dns => dns.length > 0);
                            NetworkLogger.info(`[getVlanDetailsFromSystem] Found DNS servers: ${details.dns.join(', ')}`);
                        }
                    } catch (dnsError) {
                        NetworkLogger.warning(`Could not parse DNS from config file: ${dnsError.message}`);
                    }
                }
            } catch (configError) {
                NetworkLogger.warning(`Could not find config file for ${interfaceName}:`, configError);
            }
            
            // Try to get gateway info (this would require route parsing - simplified for now)
            // details.gateway = await this.getGatewayForInterface(interfaceName);
            
        } catch (error) {
            NetworkLogger.warning(`Error getting system details for ${interfaceName}:`, error);
        }
        
        return details;
    },

    // Fetch VLANs from Netplan configuration files
    async fetchVlansFromNetplan() {
        NetworkLogger.info('Fetching VLANs from Netplan configurations...');
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
                                
                                NetworkLogger.info(`VlanManager: Found VLAN in Netplan: ${vlanName}`);
                                
                                // Extract VLAN details
                                const idMatch = vlanConfig.match(/id:\s*(\d+)/);
                                const linkMatch = vlanConfig.match(/link:\s*([a-zA-Z0-9\._-]+)/);
                                const addressesMatch = vlanConfig.match(/addresses:\s*\n([\s\S]*?)(?=\n\s{0,6}\w|\n$|$)/);
                                
                                if (idMatch) {
                                    const vlanId = parseInt(idMatch[1]);
                                    let parentInterface = 'unknown';
                                    
                                    if (linkMatch && linkMatch[1] && linkMatch[1].trim()) {
                                        parentInterface = linkMatch[1].trim();
                                        NetworkLogger.info(`VlanManager: Found parent interface '${parentInterface}' for VLAN ${vlanName}`);
                                    } else {
                                        NetworkLogger.warning(`VlanManager: No valid parent interface found for VLAN ${vlanName}, searching alternatives...`);
                                        
                                        // Try to extract parent from VLAN name if possible
                                        const nameMatch = vlanName.match(/^(.+)\.(\d+)$/);
                                        if (nameMatch) {
                                            parentInterface = nameMatch[1];
                                            NetworkLogger.info(`VlanManager: Extracted parent '${parentInterface}' from VLAN name '${vlanName}'`);
                                        } else {
                                            // Try to get parent from system
                                            try {
                                                const vlanInfo = await cockpit.spawn(['cat', `/sys/class/net/${vlanName}/vlan/real_dev_name`], { superuser: 'try' });
                                                parentInterface = vlanInfo.trim();
                                                NetworkLogger.info(`VlanManager: Got parent '${parentInterface}' from system for VLAN ${vlanName}`);
                                            } catch (sysError) {
                                                NetworkLogger.warning(`VlanManager: Could not get parent from system for ${vlanName}:`, sysError);
                                            }
                                        }
                                    }
                                    
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
                                    
                                    // Parse gateway information
                                    let gateway = 'Not configured';
                                    const gatewayMatch = vlanConfig.match(/gateway4:\s*([^\s\n]+)/);
                                    if (gatewayMatch) {
                                        gateway = gatewayMatch[1];
                                    } else {
                                        // Check for routes section
                                        const routesMatch = vlanConfig.match(/routes:\s*\n([\s\S]*?)(?=\n\s{0,6}\w|\n$|$)/);
                                        if (routesMatch) {
                                            const routeLines = routesMatch[1].split('\n');
                                            for (const line of routeLines) {
                                                if (line.includes('to: default') || line.includes('to: 0.0.0.0/0')) {
                                                    const viaMatch = line.match(/via:\s*([^\s\n]+)/);
                                                    if (viaMatch) {
                                                        gateway = viaMatch[1];
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Parse DNS information
                                    let dnsServers = [];
                                    const nameserversMatch = vlanConfig.match(/nameservers:\s*\n([\s\S]*?)(?=\n\s{0,6}\w|\n$|$)/);
                                    if (nameserversMatch) {
                                        const addressesMatch = nameserversMatch[1].match(/addresses:\s*\[(.*?)\]/);
                                        if (addressesMatch) {
                                            const addresses = addressesMatch[1].split(',').map(addr => addr.trim().replace(/['"]/g, '')).filter(addr => addr);
                                            dnsServers = addresses;
                                        } else {
                                            // Try alternative format
                                            const altAddressesMatch = nameserversMatch[1].match(/addresses:\s*\n([\s\S]*?)(?=\n\s{0,8}\w|\n$|$)/);
                                            if (altAddressesMatch) {
                                                const addressLines = altAddressesMatch[1].split('\n');
                                                for (const line of addressLines) {
                                                    const dnsMatch = line.match(/- (.+)/);
                                                    if (dnsMatch) {
                                                        dnsServers.push(dnsMatch[1].trim());
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Get interface status from system
                                    let status = 'down';
                                    let systemIPs = [];
                                    
                                    try {
                                        const interfaceStatus = await cockpit.spawn(['ip', 'addr', 'show', vlanName], { superuser: 'try' });
                                        if (interfaceStatus.includes('state UP')) {
                                            status = 'up';
                                        }
                                        
                                        // Get all actual IPs from system
                                        const ipMatches = interfaceStatus.match(/inet\s+([^\s]+)/g);
                                        if (ipMatches && ipMatches.length > 0) {
                                            systemIPs = ipMatches.map(ip => ip.replace('inet ', ''));
                                        }
                                    } catch (statusError) {
                                        NetworkLogger.warning(`VlanManager: Could not get status for ${vlanName}:`, statusError);
                                    }
                                    
                                    // Use system IPs if available, otherwise use Netplan IPs
                                    const allIPs = systemIPs.length > 0 ? systemIPs : ipAddresses;
                                    
                                    // Determine configuration type
                                    let configType = 'static';
                                    if (vlanConfig.includes('dhcp4: true')) {
                                        configType = 'dhcp';
                                    } else if (allIPs.length > 0) {
                                        configType = 'static';
                                    } else {
                                        configType = 'dhcp'; // Default fallback
                                    }
                                    
                                    NetworkLogger.info(`VlanManager: Parsed VLAN ${vlanName}:`, {
                                        id: vlanId,
                                        parent: parentInterface,
                                        netplanIPs: ipAddresses,
                                        systemIPs: systemIPs,
                                        allIPs: allIPs,
                                        gateway: gateway,
                                        dns: dnsServers,
                                        configType: configType
                                    });
                                    
                                    const vlanObject = {
                                        id: vlanId,
                                        name: vlanName,
                                        parentInterface: parentInterface,
                                        description: `VLAN ${vlanId} on ${parentInterface}`,
                                        ip: allIPs.length > 0 ? allIPs[0] : 'Not configured', // Primary IP for backward compatibility
                                        ipAddresses: allIPs, // All IP addresses
                                        ipConfig: configType,
                                        gateway: gateway,
                                        dns: dnsServers,
                                        status: status,
                                        configFile: file
                                    };
                                    
                                    NetworkLogger.info(`VlanManager: Created VLAN object:`, vlanObject);
                                    NetworkLogger.info(`VlanManager: Parent interface for ${vlanName}: '${parentInterface}'`);
                                    
                                    vlans.push(vlanObject);
                                }
                            }
                        }
                    }
                } catch (fileError) {
                    NetworkLogger.warning(`VlanManager: Could not read Netplan file ${file}:`, fileError);
                }
            }
            
        } catch (error) {
            NetworkLogger.warning('Error fetching VLANs from Netplan:', error);
        }
        
        NetworkLogger.info(`VlanManager: Found ${vlans.length} VLANs from Netplan configurations`);
        return vlans;
    },

    // Get existing VLANs on a specific parent interface
    async getExistingVlansOnParent(parentInterface) {
        const vlans = [];
        
        try {
            // Check system interfaces for VLANs on this parent
            const ipOutput = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
            const lines = ipOutput.split('\n');
            
            for (const line of lines) {
                const match = line.match(/^\d+:\s+([^@:]+)@([^:]*)/);
                if (match) {
                    const interfaceName = match[1];
                    const parent = match[2];
                    
                    if (parent === parentInterface) {
                        // Extract VLAN ID from interface name or system info
                        let vlanId = null;
                        
                        // Try standard naming patterns first
                        const vlanMatch = interfaceName.match(/^(.+)\.(\d+)$/) || 
                                         interfaceName.match(/^vlan(\d+)$/);
                        
                        if (vlanMatch) {
                            vlanId = parseInt(vlanMatch[vlanMatch.length - 1]);
                        } else {
                            // Try to get VLAN ID from system (for non-standard names like "ankit")
                            try {
                                const vlanInfo = await cockpit.spawn(['cat', `/sys/class/net/${interfaceName}/vlan/VID`], { superuser: 'try' });
                                vlanId = parseInt(vlanInfo.trim());
                            } catch (vlanInfoError) {
                                NetworkLogger.warning(`Could not get VLAN ID for ${interfaceName}:`, vlanInfoError);
                                // For custom-named VLANs, try to get VLAN ID from Netplan configuration
                                try {
                                    const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml'], { superuser: 'try' });
                                    const files = netplanFiles.trim().split('\n').filter(f => f.trim());
                                    
                                    for (const file of files) {
                                        try {
                                            const content = await cockpit.file(file, { superuser: 'try' }).read();
                                            if (content && content.includes(`${interfaceName}:`)) {
                                                const idMatch = content.match(new RegExp(`${interfaceName}:[\\s\\S]*?id:\\s*(\\d+)`));
                                                if (idMatch) {
                                                    vlanId = parseInt(idMatch[1]);
                                                    NetworkLogger.info(`Found VLAN ID ${vlanId} for ${interfaceName} in Netplan file ${file}`);
                                                    break;
                                                }
                                            }
                                        } catch (fileError) {
                                            NetworkLogger.warning(`Could not read Netplan file ${file}:`, fileError);
                                        }
                                    }
                                } catch (netplanError) {
                                    NetworkLogger.warning(`Could not search Netplan files for ${interfaceName}:`, netplanError);
                                }
                            }
                        }
                        
                        if (vlanId !== null) {
                            vlans.push({
                                name: interfaceName,
                                id: vlanId,
                                parent: parent
                            });
                        }
                    }
                }
            }
            
        } catch (error) {
            NetworkLogger.warning('Error getting existing VLANs on parent:', error);
        }
        
        NetworkLogger.info(`VlanManager: Found ${vlans.length} existing VLANs on parent ${parentInterface}:`, vlans);
        return vlans;
    },
    
    // Get the real parent interface from Netplan configuration
    async getRealParentFromNetplan(vlanName, vlanId) {
        try {
            // Search for config files that might contain this VLAN
            const searchPatterns = [
                `90-xavs-*-vlan${vlanId}.yaml`,
                `90-xavs-vlan${vlanId}.yaml`,
                `90-xavs-*${vlanName}*.yaml`,
                `92-xavs-*-vlan${vlanId}.yaml`,
                `92-xavs-vlan${vlanId}.yaml`,
                `92-xavs-*${vlanName}*.yaml`,
                `95-xavs-*-vlan${vlanId}.yaml`,
                `95-xavs-vlan${vlanId}.yaml`,
                `95-xavs-*${vlanName}*.yaml`
            ];
            
            for (const pattern of searchPatterns) {
                try {
                    const findResult = await cockpit.spawn(['find', '/etc/netplan', '-name', pattern], { superuser: 'try' });
                    const files = findResult.trim().split('\n').filter(f => f.trim());
                    
                    for (const file of files) {
                        try {
                            const content = await cockpit.file(file, { superuser: 'try' }).read();
                            
                            // Parse YAML to find the link/parent
                            const linkMatch = content.match(/link:\s*([^\s\n]+)/);
                            if (linkMatch && linkMatch[1]) {
                                NetworkLogger.info(`VlanManager: Found parent '${linkMatch[1]}' in config file ${file}`);
                                return linkMatch[1].trim();
                            }
                        } catch (readError) {
                            NetworkLogger.warning(`VlanManager: Could not read config file ${file}:`, readError);
                        }
                    }
                } catch (findError) {
                    // Pattern not found, continue
                }
            }
            
            return null;
        } catch (error) {
            NetworkLogger.warning('Error getting real parent from Netplan:', error);
            return null;
        }
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
                    NetworkLogger.warning(`VlanManager: Could not read netplan file ${file}:`, fileError);
                }
            }

        } catch (error) {
            NetworkLogger.warning(`VlanManager: Error getting details for ${interfaceName}:`, error);
        }

        return details;
    },
    
    // Render VLANs
    renderVlans() {
        const listElement = document.getElementById('vlan-list');
        
        NetworkLogger.info('Rendering VLANs:', this.vlans);
        this.vlans.forEach(vlan => {
            NetworkLogger.info(`VlanManager: VLAN ${vlan.id} - Parent Interface: '${vlan.parentInterface}'`);
        });
        
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
                        <div class="detail-value">${vlan.parentInterface || 'Not specified'}</div>
                    </div>
                    <div>
                        <span class="detail-label">IP Configuration</span>
                        <div class="detail-value">
                            ${vlan.ipAddresses && vlan.ipAddresses.length > 0 
                                ? vlan.ipAddresses.map(ip => `<div class="ip-address-item">${ip}</div>`).join('')
                                : vlan.ip || 'Not configured'
                            }
                        </div>
                    </div>
                    <div>
                        <span class="detail-label">Gateway</span>
                        <div class="detail-value">${vlan.gateway || 'Not configured'}</div>
                    </div>
                    <div>
                        <span class="detail-label">DNS Servers</span>
                        <div class="detail-value">
                            ${vlan.dns && vlan.dns.length > 0 
                                ? (Array.isArray(vlan.dns) ? vlan.dns.join(', ') : vlan.dns)
                                : 'Not configured'
                            }
                        </div>
                    </div>
                </div>
                
                <div class="interface-actions" style="margin-top: 16px;">
                    <button class="btn btn-sm btn-outline-brand" onclick="handleEditVlan('${vlan.name}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleVlan('${vlan.name}', '${vlan.status}')">
                        <i class="fas fa-power-off"></i> ${vlan.status === 'up' ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger btn-icon-only" onclick="deleteVlan('${vlan.name}')" title="Delete VLAN" data-tip="Delete this VLAN permanently">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
};

// VLAN Functions
async function addVlan() {
    NetworkLogger.info('Opening add VLAN dialog...');
    
    // Get available parent interfaces
    let availableInterfaces = [];
    try {
        NetworkLogger.info('Getting available parent interfaces...');
        availableInterfaces = await getAvailableParentInterfaces();
    } catch (error) {
        NetworkLogger.error('Could not get available interfaces:', error);
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
                <label class="form-label" for="vlan-parent">Parent Interface</label>
                <select id="vlan-parent" class="form-control" required>
                    <option value="">Select interface</option>
                    ${interfaceOptions}
                </select>
                <div class="hint">Parent interface for the VLAN</div>
            </div>
            
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
                <div class="form-group full-width">
                    <label class="form-label">IP Addresses</label>
                    <div id="ip-addresses-container">
                        <div class="ip-address-entry" data-index="0">
                            <div class="ip-entry-row">
                                <div>
                                    <input type="text" id="vlan-ip-0" class="form-control ip-address-input" placeholder="10.100.1.50 (default /24)" data-validate="cidr">
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-danger remove-ip-btn" onclick="removeIpAddress(0)" style="display: none;">
                                    <i class="fas fa-minus"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-brand" onclick="addIpAddress()" style="margin-top: 8px;">
                        <i class="fas fa-plus"></i> Add IP Address
                    </button>
                    <div class="hint">Enter IP addresses. CIDR defaults to /24 if not specified (e.g., 192.168.1.10 becomes 192.168.1.10/24)</div>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="vlan-gateway">Gateway (Optional)</label>
                    <input type="text" id="vlan-gateway" class="form-control" placeholder="10.100.1.1" data-validate="ipAddress">
                    <div class="hint">Gateway is informational only - routes are managed automatically</div>
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
    
    // Initialize IP address management
    updateRemoveButtonVisibility();
}

// Get available parent interfaces for VLAN creation
async function getAvailableParentInterfaces() {
    NetworkLogger.info('Getting available parent interfaces...');
    
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
                
                // Skip loopback and empty names
                if (ifaceName === 'lo' || ifaceName === '') {
                    continue;
                }
                
                // Skip existing VLAN interfaces (contain . or start with vlan)
                if (ifaceName.includes('.') || ifaceName.startsWith('vlan')) {
                    continue;
                }
                
                // Skip Docker and container interfaces
                if (ifaceName.startsWith('docker') || 
                    ifaceName.startsWith('veth') || 
                    ifaceName.startsWith('virbr') ||
                    ifaceName.startsWith('cni') ||
                    ifaceName.startsWith('flannel')) {
                    continue;
                }
                
                // Include physical interfaces (eth, eno, ens, enp, etc.)
                if (/^(eth|eno|ens|enp|em|p\d+p\d+|wl)/.test(ifaceName)) {
                    availableInterfaces.push(ifaceName);
                    continue;
                }
                
                // Include bond interfaces (bond0, bond1, etc.)
                if (/^bond\d+$/.test(ifaceName)) {
                    NetworkLogger.info(`VlanManager: Found bond interface: ${ifaceName}`);
                    availableInterfaces.push(ifaceName);
                    continue;
                }
                
                // Include bridge interfaces - check for user-created bridges
                // User bridges typically don't start with br- (which are usually Docker bridges)
                // But also include br- bridges that might be user-created
                if (ifaceName.startsWith('br') || ifaceName.includes('bridge')) {
                    // Additional check: see if this might be a user bridge by checking if it has configuration
                    try {
                        const bridgeInfo = await cockpit.spawn(['ip', 'addr', 'show', ifaceName], { superuser: 'try' });
                        if (bridgeInfo && !bridgeInfo.includes('NO-CARRIER')) {
                            NetworkLogger.info(`VlanManager: Found bridge interface: ${ifaceName}`);
                            availableInterfaces.push(ifaceName);
                        }
                    } catch (bridgeError) {
                        // If we can't get info, include it anyway
                        NetworkLogger.info(`VlanManager: Including bridge interface (couldn't verify): ${ifaceName}`);
                        availableInterfaces.push(ifaceName);
                    }
                    continue;
                }
                
                // Include any other interfaces that might be valid parents
                // This catches custom named interfaces or other types
                if (!isSystemInterface(ifaceName)) {
                    NetworkLogger.info(`VlanManager: Found other interface: ${ifaceName}`);
                    availableInterfaces.push(ifaceName);
                }
            }
        }
        
        // Additionally, try to get bond and bridge interfaces from our managers
        try {
            // Get bonds from NetworkManager if available
            if (typeof NetworkManager !== 'undefined' && NetworkManager.bonds) {
                NetworkManager.bonds.forEach(bond => {
                    if (!availableInterfaces.includes(bond.name)) {
                        NetworkLogger.info(`VlanManager: Adding bond from NetworkManager: ${bond.name}`);
                        availableInterfaces.push(bond.name);
                    }
                });
            }
        } catch (bondError) {
            NetworkLogger.warning('Could not get bonds from NetworkManager:', bondError);
        }
        
        try {
            // Get bridges from BridgeManager if available
            if (typeof BridgeManager !== 'undefined' && BridgeManager.bridges) {
                BridgeManager.bridges.forEach(bridge => {
                    if (!availableInterfaces.includes(bridge.name)) {
                        NetworkLogger.info(`VlanManager: Adding bridge from BridgeManager: ${bridge.name}`);
                        availableInterfaces.push(bridge.name);
                    }
                });
            }
        } catch (bridgeError) {
            NetworkLogger.warning('Could not get bridges from BridgeManager:', bridgeError);
        }
        
    } catch (error) {
        NetworkLogger.error('Error getting available interfaces:', error);
    }
    
    NetworkLogger.info('Available parent interfaces:', availableInterfaces);
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

async function editVlan(vlanIdentifier) {
    NetworkLogger.info(`VlanManager: Editing VLAN with identifier ${vlanIdentifier}, type: ${typeof vlanIdentifier}`);
    NetworkLogger.info('Available VLANs:', VlanManager.vlans.map(v => ({ id: v.id, name: v.name, parent: v.parentInterface })));
    
    // Try to find VLAN by name first (most reliable), then by ID
    let vlan = VlanManager.vlans.find(v => v.name === vlanIdentifier);
    if (!vlan) {
        // Fallback: try to find by ID (for backward compatibility)
        vlan = VlanManager.vlans.find(v => v.id == vlanIdentifier);
        if (vlan) {
            NetworkLogger.warning(`VlanManager: Found VLAN by ID ${vlanIdentifier}, but this could be ambiguous if multiple VLANs have the same ID`);
        }
    }
    
    if (!vlan) {
        NetworkLogger.error(`VlanManager: VLAN with identifier ${vlanIdentifier} not found`);
        NetworkManager.showError(`VLAN with identifier ${vlanIdentifier} not found`);
        return;
    }
    
    NetworkLogger.info(`VlanManager: Found VLAN for editing:`, vlan);
    NetworkLogger.info(`VlanManager: VLAN ipAddresses array:`, vlan.ipAddresses);
    NetworkLogger.info(`VlanManager: VLAN ip field:`, vlan.ip);
    
    // Get fresh system details to ensure we have the latest IP configuration
    try {
        NetworkLogger.info('Refreshing VLAN details from system...');
        const ipOutput = await cockpit.spawn(['ip', 'a'], { superuser: 'try' });
        
        // Get IP output section for this interface
        const interfaceSection = ipOutput.split('\n').filter(line => 
            line.includes(vlan.name) || 
            (line.includes('inet ') && ipOutput.indexOf(line) > ipOutput.indexOf(vlan.name))
        );
        NetworkLogger.info(`VlanManager: IP output section for ${vlan.name}:`, interfaceSection);
        
        const freshDetails = await VlanManager.getVlanDetailsFromSystem(vlan.name, ipOutput);
        
        NetworkLogger.info(`VlanManager: Fresh details from system:`, freshDetails);
        
        // Update VLAN object with fresh details
        if (freshDetails.ipAddresses && freshDetails.ipAddresses.length > 0) {
            vlan.ipAddresses = freshDetails.ipAddresses;
            vlan.ip = freshDetails.ipAddresses[0]; // Update primary IP for consistency
            NetworkLogger.info(`VlanManager: Updated ipAddresses:`, vlan.ipAddresses);
        } else {
            NetworkLogger.warning(`VlanManager: No IP addresses found in fresh details for ${vlan.name}`);
        }
        if (freshDetails.gateway && freshDetails.gateway !== 'Not configured') {
            vlan.gateway = freshDetails.gateway;
        }
        if (freshDetails.dns && freshDetails.dns.length > 0) {
            vlan.dns = freshDetails.dns;
        }
        vlan.status = freshDetails.status || vlan.status;
        
        NetworkLogger.info(`VlanManager: Updated VLAN with fresh details:`, {
            ipAddresses: vlan.ipAddresses,
            gateway: vlan.gateway,
            dns: vlan.dns,
            status: vlan.status
        });
    } catch (refreshError) {
        NetworkLogger.warning('Could not refresh VLAN details from system:', refreshError);
        // Continue with existing data
    }
    
    // Get available parent interfaces
    let availableInterfaces = [];
    try {
        availableInterfaces = await getAvailableParentInterfaces();
    } catch (error) {
        NetworkLogger.error('Error getting available interfaces:', error);
        NetworkManager.showError('Error loading available interfaces');
        return;
    }
    
    // Determine IP configuration type - check if any IP addresses are configured
    // First, try to use the original VLAN data if fresh refresh failed to get IPs
    let allIpAddresses = [];
    if (vlan.ipAddresses && Array.isArray(vlan.ipAddresses) && vlan.ipAddresses.length > 0) {
        allIpAddresses = vlan.ipAddresses;
    } else if (vlan.ip && vlan.ip !== 'Not configured' && vlan.ip !== 'DHCP' && vlan.ip !== '') {
        if (vlan.ip.includes(',')) {
            allIpAddresses = vlan.ip.split(',').map(ip => ip.trim());
        } else {
            allIpAddresses = [vlan.ip];
        }
    }
    
    const hasStaticIps = allIpAddresses.length > 0 && 
                        allIpAddresses.some(ip => ip && ip !== 'Not configured' && ip !== 'DHCP' && ip !== '');
    const ipConfig = hasStaticIps ? 'static' : 'dhcp';
    const gateway = vlan.gateway && vlan.gateway !== 'Not configured' ? vlan.gateway : '';
    
    NetworkLogger.info(`VlanManager: All IP addresses found:`, allIpAddresses);
    NetworkLogger.info(`VlanManager: Determined IP config type: ${ipConfig}, has static IPs: ${hasStaticIps}`);
    
    // Create parent interface options HTML
    const parentOptionsHtml = availableInterfaces.map(iface => 
        `<option value="${iface}" ${vlan.parentInterface === iface ? 'selected' : ''}>${iface}</option>`
    ).join('');
    
    const modalContent = `
        <form id="vlan-edit-form" class="form-grid">
            <div class="form-group">
                <label class="form-label" for="edit-vlan-parent">Parent Interface</label>
                <select id="edit-vlan-parent" class="form-control" required>
                    ${parentOptionsHtml}
                </select>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-vlan-id">VLAN ID</label>
                <input type="number" id="edit-vlan-id" class="form-control" value="${vlan.id}" readonly>
            </div>
            
            <div class="form-group">
                <label class="form-label" for="edit-vlan-name">VLAN Name</label>
                <input type="text" id="edit-vlan-name" class="form-control" value="${vlan.name}" required>
            </div>
            
            <div class="form-group full-width">
                <label class="form-label" for="edit-vlan-description">Description</label>
                <input type="text" id="edit-vlan-description" class="form-control" value="${vlan.description}">
            </div>
            
            <div class="form-group full-width">
                <label class="form-label">IP Configuration</label>
                <div class="toggle-pill">
                    <button type="button" class="toggle-seg ${ipConfig === 'static' ? 'active' : ''}" data-config="static">Static IP</button>
                    <button type="button" class="toggle-seg ${ipConfig === 'dhcp' ? 'active' : ''}" data-config="dhcp">DHCP</button>
                </div>
            </div>
            
            <div id="edit-vlan-static-config" class="static-config ${ipConfig === 'static' ? '' : 'hidden'}">
                <div class="form-group full-width">
                    <label class="form-label">IP Addresses</label>
                    <div id="edit-ip-addresses-container">
                        <!-- IP addresses will be populated here -->
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-brand" onclick="addEditIpAddress()" style="margin-top: 8px;">
                        <i class="fas fa-plus"></i> Add IP Address
                    </button>

                    <div class="hint">Enter IP addresses. CIDR defaults to /24 if not specified (e.g., 192.168.1.10 becomes 192.168.1.10/24)</div>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="edit-vlan-gateway">Gateway (Optional)</label>
                    <input type="text" id="edit-vlan-gateway" class="form-control" value="${gateway}" data-validate="ipAddress">
                    <div class="hint">Gateway is informational only - routes are managed automatically</div>
                </div>
                
                <div class="form-group full-width">
                    <label class="form-label" for="edit-vlan-dns">DNS Servers</label>
                    <input type="text" id="edit-vlan-dns" class="form-control" value="${vlan.dns ? (Array.isArray(vlan.dns) ? vlan.dns.join(', ') : vlan.dns) : ''}">
                    <div class="hint">Comma-separated list of DNS servers</div>
                </div>
            </div>
        </form>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal()">Cancel</button>
        <button class="btn btn-brand" onclick="saveVlanEdit('${vlan.name}')">Update VLAN</button>
    `;
    
    NetworkManager.createModal('Edit VLAN Configuration', modalContent, modalFooter);
    
    // Populate IP addresses for editing - use the determined allIpAddresses
    const ipAddresses = [];
    
    if (allIpAddresses.length > 0) {
        // Use the determined IP addresses
        ipAddresses.push(...allIpAddresses);
        NetworkLogger.info(`VlanManager: Using determined IP addresses:`, allIpAddresses);
    } else {
        // No IP addresses found, create empty entry for static configuration
        if (ipConfig === 'static') {
            ipAddresses.push('');
        }
        NetworkLogger.info(`VlanManager: No IP addresses found, creating empty entry for static config`);
    }
    
    // Log information
    NetworkLogger.info(`VlanManager: Final IP addresses for edit form:`, ipAddresses);
    
    // Populate IP addresses in the edit form after modal is created
    setTimeout(() => {
        populateEditIpAddresses(ipAddresses);
        
        // Setup live validation for the edit form after IP population
        const editForm = document.getElementById('vlan-edit-form');
        if (typeof setupLiveValidation === 'function') {
            setupLiveValidation(editForm);
        }
        
        // Setup toggle functionality for edit form after IP population
        setupVlanToggle('edit-vlan');
    }, 100);
}

function setupVlanToggle(prefix = 'vlan') {
    const toggleButtons = document.querySelectorAll('.toggle-seg');
    toggleButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            toggleButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const configType = btn.getAttribute('data-config');
            const staticConfigId = prefix === 'edit-vlan' ? 'edit-vlan-static-config' : 'vlan-static-config';
            const staticConfig = document.getElementById(staticConfigId);
            
            if (staticConfig) {
                if (configType === 'static') {
                    staticConfig.style.display = 'contents';
                } else {
                    staticConfig.style.display = 'none';
                }
            } else {
                NetworkLogger.warning(`VlanManager: Could not find static config element with ID: ${staticConfigId}`);
            }
        });
    });
}

async function saveVlan() {
    NetworkLogger.info('Creating new VLAN...');
    
    const modal = document.querySelector('.modal');
    const form = document.getElementById('vlan-form');
    const saveButton = modal.querySelector('button.btn-brand');
    
    // Save original button state
    let originalButtonContent = '';
    if (saveButton) {
        originalButtonContent = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
    }
    
    // Function to restore button state
    const restoreButton = () => {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonContent;
        }
    };
    
    // Clear any existing modal messages
    if (typeof clearModalMessages === 'function') {
        clearModalMessages(modal);
    }
    
    // Validate form using live validation
    if (typeof validateForm === 'function') {
        if (!validateForm(form)) {
            restoreButton();
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
        ipAddresses: collectIpAddresses(),
        ip: collectIpAddresses()[0] || '', // Backward compatibility
        gateway: (document.getElementById('vlan-gateway') && document.getElementById('vlan-gateway').value) || '',
        dns: (document.getElementById('vlan-dns') && document.getElementById('vlan-dns').value) || ''
    };
    
    NetworkLogger.info('Form data collected:', formData);
    
    // Basic validation fallback
    if (!formData.id || !formData.name || !formData.parent) {
        restoreButton();
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
        restoreButton();
        if (typeof showModalError === 'function') {
            showModalError(modal, 'VLAN ID must be between 1 and 4094.');
        } else {
            NetworkManager.showError('VLAN ID must be between 1 and 4094');
        }
        return;
    }
    
    // Check for VLAN ID conflicts on the selected parent interface
    try {
        const existingVlans = await VlanManager.getExistingVlansOnParent(formData.parent);
        const conflictingVlan = existingVlans.find(vlan => vlan.id === vlanId);
        
        if (conflictingVlan) {
            restoreButton();
            if (typeof showModalError === 'function') {
                showModalError(modal, `VLAN ID ${vlanId} is already in use on interface ${formData.parent} by VLAN '${conflictingVlan.name}'. Please choose a different VLAN ID.`);
            } else {
                NetworkManager.showError(`VLAN ID ${vlanId} is already in use on ${formData.parent}`);
            }
            return;
        }
    } catch (conflictCheckError) {
        NetworkLogger.warning('Could not check for VLAN ID conflicts:', conflictCheckError);
        // Continue anyway - the server-side check will catch this
    }
    
    // Validate VLAN interface name format to prevent conflicts
    if (!formData.name.includes('.') && !formData.name.startsWith('vlan')) {
        restoreButton();
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
        NetworkLogger.info(`VlanManager: Corrected VLAN name to: ${formData.name}`);
    }
    
    // Check if gateway is specified and warn about route management
    if (formData.gateway && formData.gateway.trim()) {
        const routeWarning = `You have specified a gateway (${formData.gateway}) for this VLAN.

Note: Gateway configuration is currently disabled in the system to prevent route conflicts. The gateway will be saved in the configuration file but not automatically applied as routes.

Routes are managed automatically based on IP address configuration. If you need custom routing, you can configure it manually after VLAN creation.

Do you want to continue creating the VLAN?`;
        
        if (!confirm(routeWarning)) {
            restoreButton();
            NetworkLogger.info('User cancelled VLAN creation due to gateway/route concerns');
            return;
        }
    }
    
    // Check for potential route impacts when creating new VLAN
    if (formData.configType === 'static' && formData.ipAddresses && formData.ipAddresses.length > 0) {
        try {
            const routeOptions = await confirmNewVlanRouteImpact(formData);
            if (!routeOptions.proceed) {
                restoreButton();
                NetworkLogger.info('User cancelled VLAN creation due to route impact concerns');
                return;
            }
            // For new VLANs, we don't preserve routes since the interface doesn't exist yet
            // But we can warn about parent interface route impacts
        } catch (routeCheckError) {
            NetworkLogger.warning('Could not check route impacts for new VLAN:', routeCheckError);
            // Continue anyway
        }
    }
    
    // Create VLAN using real system calls
    createRealVlan(formData)
        .then(() => {
            restoreButton();
            NetworkLogger.info('VLAN created successfully');
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
            restoreButton();
            displayVlanError(modal, error, 'create VLAN');
        });
}

// Get the type of parent interface (physical, bond, bridge, etc.)
async function getParentInterfaceType(interfaceName) {
    try {
        // Check if it's a bond
        try {
            const bondInfo = await cockpit.spawn(['cat', `/proc/net/bonding/${interfaceName}`], { superuser: 'try' });
            if (bondInfo) {
                return 'bond';
            }
        } catch (bondError) {
            // Not a bond, continue checking
        }
        
        // Check if it's a bridge
        try {
            const bridgeInfo = await cockpit.spawn(['brctl', 'show', interfaceName], { superuser: 'try' });
            if (bridgeInfo && !bridgeInfo.includes('No such device')) {
                return 'bridge';
            }
        } catch (bridgeError) {
            // Not a bridge, continue checking
        }
        
        // Check if it's a physical interface by looking at /sys/class/net
        try {
            const physicalCheck = await cockpit.spawn(['readlink', '-f', `/sys/class/net/${interfaceName}`], { superuser: 'try' });
            if (physicalCheck.includes('/devices/pci')) {
                return 'physical';
            }
        } catch (physicalError) {
            // Continue checking
        }
        
        return 'unknown';
    } catch (error) {
        NetworkLogger.warning(`getParentInterfaceType: Error detecting type for ${interfaceName}:`, error);
        return 'unknown';
    }
}

// Determine the correct Netplan filename prefix based on parent interface type
function getVlanFilePrefix(parentType, parentName = '') {
    // Use the new comprehensive system from NetworkConfigUtils
    const parentInfo = {
        parentType: parentType,
        parentInterface: parentName
    };
    
    // If parent is a complex interface, analyze it for better classification
    if (parentName && (parentName.includes('.') || parentName.includes('bond') || parentName.includes('br'))) {
        const analysis = NetworkConfigUtils.analyzeInterfaceStructure(parentName);
        parentInfo.parentType = analysis.objectType;
        parentInfo.isComplex = analysis.isComplex;
    }
    
    return NetworkConfigUtils.getNetplanFilePrefix('vlan', parentInfo);
}

// Create real VLAN configuration
// Check for existing default gateway conflicts before creating VLAN
async function checkForGatewayConflicts(config) {
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
            
            // If we're trying to create a VLAN with gateway on a parent that already has a gateway, warn
            const parentHasGateway = existingGateways.find(gw => gw.interface === config.parent);
            if (parentHasGateway && config.gateway) {
                NetworkLogger.warning(`Parent interface ${config.parent} already has a default gateway. VLAN gateway will be ignored to prevent conflicts.`);
                // Remove gateway from config to prevent conflicts
                delete config.gateway;
            }
            
            // Check if any other interface has a default gateway and we're trying to add one
            if (config.gateway && existingGateways.length > 0) {
                const conflictingInterfaces = existingGateways.map(gw => gw.interface).join(', ');
                NetworkLogger.warning(`Multiple default gateways detected. Existing: ${conflictingInterfaces}. Removing gateway from VLAN ${config.name} to prevent conflicts.`);
                // Remove gateway to prevent conflicts
                delete config.gateway;
            }
        }
        
        // Always remove gateway from VLAN config as a precaution to prevent route conflicts
        if (config.gateway) {
            NetworkLogger.info(`Removing gateway ${config.gateway} from VLAN ${config.name} configuration to prevent route table conflicts`);
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

// Clean up conflicting default routes from existing Netplan files
async function cleanupConflictingRoutes() {
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

async function createRealVlan(config) {
    NetworkLogger.info('Creating real VLAN configuration...');
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    // Check for existing default gateway conflicts before creating VLAN
    await checkForGatewayConflicts(config);
    
    // Additional cleanup: remove any conflicting default routes from other files
    await cleanupConflictingRoutes();
    
    // Check parent interface type first
    const parentType = await getParentInterfaceType(config.parent);
    NetworkLogger.info(`VlanManager: Parent interface ${config.parent} detected as type: ${parentType}`);
    
    // Get correct file prefix based on parent type using new system
    const filePrefix = getVlanFilePrefix(parentType, config.parent);
    
    // Generate proper filename using the new comprehensive system
    const parentInfo = {
        parentType: parentType,
        parentInterface: config.parent
    };
    const filename = NetworkConfigUtils.generateNetplanFilename(config.name, 'vlan', parentInfo);
    
    // Generate Netplan configuration with parent type information
    const netplanConfig = await generateVlanNetplanConfig(config, parentType);
    // Use the new comprehensive filename system
    const configPath = `/etc/netplan/${filename}`;
    
    NetworkLogger.info('Generated Netplan config:', netplanConfig);
    NetworkLogger.info('Writing configuration to', configPath);
    
    try {
        // Check for interface conflicts before proceeding
        NetworkLogger.info('Checking for interface conflicts...');
        // Validate interface name
        
        // Check for VLAN ID conflicts on the same parent interface
        NetworkLogger.info(`VlanManager: Checking for VLAN ID conflicts (ID ${config.id} on ${config.parent})...`);
        const existingVlans = await VlanManager.getExistingVlansOnParent(config.parent);
        const conflictingVlan = existingVlans.find(vlan => vlan.id === parseInt(config.id) && vlan.name !== config.name);
        
        if (conflictingVlan) {
            throw new Error(`VLAN ID ${config.id} is already in use on interface ${config.parent} by VLAN '${conflictingVlan.name}'. Please choose a different VLAN ID.`);
        }
        
        // Remove any existing XAVS config files that might conflict with this interface name
        // This helps prevent the "device type changes" error
        try {
            const existingXavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*-xavs-*.yaml'], { superuser: 'try' });
            const files = existingXavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes(`${config.name}:`)) {
                        NetworkLogger.info(`VlanManager: Removing conflicting XAVS file: ${file}`);
                        await cockpit.spawn(['rm', '-f', file], { superuser: 'try' });
                    }
                } catch (fileError) {
                    NetworkLogger.warning(`VlanManager: Could not check/remove file ${file}:`, fileError);
                }
            }
        } catch (cleanupError) {
            NetworkLogger.warning('Error during cleanup:', cleanupError);
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
            NetworkLogger.warning('Could not check existing interfaces:', interfaceCheckError);
        }
        
        // Write the Netplan configuration
        await cockpit.file(configPath, { superuser: 'try' }).replace(netplanConfig);
        NetworkLogger.info('Netplan configuration written successfully');
        
        // Set proper file permissions (600 = rw-------) - ignore errors if file doesn't exist
        try {
            await cockpit.spawn(['chmod', '600', configPath], { superuser: 'try' });
            NetworkLogger.info('File permissions set to 600');
        } catch (chmodError) {
            NetworkLogger.warn('Could not set file permissions (file may not exist):', chmodError.message);
        }
        
        // Skip individual netplan try test - will be handled by NetworkConfigUtils.applyNetplanWithConfirmation
        NetworkLogger.info('Configuration written, will test during application...');
        
        // Apply the configuration with user confirmation
        NetworkLogger.info('Testing Netplan configuration with user confirmation...');
        await NetworkConfigUtils.applyNetplanWithConfirmation(120); // 2-minute timeout
        NetworkLogger.info('Netplan configuration confirmed and applied successfully');
        
        // Explicitly restore system routes in case they were lost during configuration
        try {
            await NetworkConfigUtils.restoreSystemRoutes();
            NetworkLogger.info('System routes restored successfully');
        } catch (routeError) {
            NetworkLogger.warning('Could not restore system routes:', routeError);
        }
        
        // Verify VLAN creation
        NetworkLogger.info('Verifying VLAN creation...');
        const checkOutput = await cockpit.spawn(['ip', 'link', 'show', config.name], { superuser: 'try' });
        if (checkOutput.includes(config.name)) {
            NetworkLogger.info('VLAN interface verified');
            return true;
        } else {
            throw new Error('VLAN interface was not created');
        }
        
    } catch (error) {
        NetworkLogger.error('Error in createRealVlan:', error);
        // Clean up configuration file if it was created
        try {
            await cockpit.spawn(['rm', '-f', configPath], { superuser: 'try' });
        } catch (cleanupError) {
            NetworkLogger.warning('Could not clean up config file:', cleanupError);
        }
        throw error;
    }
}

// Check if IP changes will affect routes and confirm with user
async function confirmRouteChanges(originalVlan, newConfig) {
    // Check if there are IP address changes
    const originalIps = originalVlan.ipAddresses || (originalVlan.ip ? [originalVlan.ip] : []);
    const newIps = newConfig.ipAddresses || [];
    
    // Normalize IPs for comparison
    const normalizeIpsForComparison = (ips) => {
        return ips.map(ip => {
            if (!ip || ip === 'Not configured' || ip === 'DHCP') return null;
            return normalizeIpWithCidr(ip);
        }).filter(ip => ip !== null);
    };
    
    const originalNormalized = normalizeIpsForComparison(originalIps);
    const newNormalized = normalizeIpsForComparison(newIps);
    
    // Check if IPs have changed
    const ipsChanged = originalNormalized.length !== newNormalized.length ||
                      !originalNormalized.every(ip => newNormalized.includes(ip)) ||
                      !newNormalized.every(ip => originalNormalized.includes(ip));
    
    if (!ipsChanged) {
        return { proceed: true, preserveRoutes: false }; // No IP changes, proceed normally
    }
    
    NetworkLogger.info('IP addresses changed:', {
        original: originalNormalized,
        new: newNormalized
    });
    
    // Check if the interface has any existing routes
    let hasRoutes = false;
    let existingRoutes = [];
    try {
        const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'dev', originalVlan.name], { superuser: 'try' });
        existingRoutes = routeOutput.trim().split('\n').filter(line => line.trim());
        hasRoutes = existingRoutes.length > 0;
        NetworkLogger.info(`Interface ${originalVlan.name} has existing routes:`, hasRoutes, existingRoutes);
    } catch (error) {
        NetworkLogger.warning('Could not check existing routes:', error);
        // Assume there might be routes to be safe
        hasRoutes = true;
    }
    
    if (hasRoutes || newConfig.gateway || originalVlan.gateway) {
        // Create a custom modal for route options
        return await showRouteOptionsModal(originalVlan, originalNormalized, newNormalized, existingRoutes);
    }
    
    return { proceed: true, preserveRoutes: false }; // No routes affected, proceed normally
}

// Show custom modal for route preservation options
async function showRouteOptionsModal(originalVlan, originalIps, newIps, existingRoutes) {
    return new Promise((resolve) => {
        const modalContent = `
            <div class="route-options-content">
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Route Management Warning</strong>
                </div>
                
                <p>Changing IP addresses on interface <strong>${originalVlan.name}</strong> may affect existing network routes.</p>
                
                <div class="change-summary">
                    <div class="ip-changes">
                        <div class="change-item">
                            <strong>Current IPs:</strong> ${originalIps.length > 0 ? originalIps.join(', ') : 'None'}
                        </div>
                        <div class="change-item">
                            <strong>New IPs:</strong> ${newIps.length > 0 ? newIps.join(', ') : 'None'}
                        </div>
                    </div>
                    
                    ${existingRoutes.length > 0 ? `
                    <div class="existing-routes">
                        <strong>Existing Routes:</strong>
                        <div class="route-list">
                            ${existingRoutes.map(route => `<div class="route-item"><code>${route}</code></div>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <div class="route-options">
                    <h4>How would you like to handle routes?</h4>
                    
                    <div class="option-group">
                        <label class="radio-option">
                            <input type="radio" name="routeOption" value="reconfigure" checked>
                            <div class="option-content">
                                <strong>Reconfigure Routes (Recommended)</strong>
                                <p>Let the system automatically reconfigure routes based on new IP addresses. This may temporarily affect connectivity but ensures proper routing.</p>
                            </div>
                        </label>
                        
                        <label class="radio-option">
                            <input type="radio" name="routeOption" value="preserve">
                            <div class="option-content">
                                <strong>Preserve Existing Routes</strong>
                                <p>Keep existing routes unchanged. You'll need to manually adjust routes if needed. This prevents automatic route changes but may leave inconsistent routing.</p>
                            </div>
                        </label>
                        
                        <label class="radio-option">
                            <input type="radio" name="routeOption" value="cancel">
                            <div class="option-content">
                                <strong>Cancel Changes</strong>
                                <p>Don't modify the VLAN configuration. No changes will be made.</p>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            
            <style>
                .route-options-content { font-family: system-ui, -apple-system, sans-serif; }
                .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
                .change-summary { background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 16px 0; }
                .change-item { margin: 8px 0; }
                .route-list { background: #fff; padding: 8px; border-radius: 4px; margin-top: 8px; max-height: 120px; overflow-y: auto; }
                .route-item { margin: 4px 0; font-size: 13px; }
                .option-group { margin: 16px 0; }
                .radio-option { display: block; margin: 12px 0; padding: 12px; border: 2px solid #e9ecef; border-radius: 8px; cursor: pointer; }
                .radio-option:hover { border-color: #007bff; background: #f8f9ff; }
                .radio-option input[type="radio"] { margin-right: 8px; }
                .option-content strong { display: block; margin-bottom: 4px; color: #333; }
                .option-content p { margin: 0; color: #666; font-size: 14px; }
                .radio-option input[type="radio"]:checked + .option-content { color: #007bff; }
                .radio-option input[type="radio"]:checked { accent-color: #007bff; }
            </style>
        `;
        
        const modalFooter = `
            <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal(); window.routeOptionsResolve({ proceed: false, preserveRoutes: false });">Cancel</button>
            <button class="btn btn-brand" onclick="handleRouteOptionChoice()">Continue</button>
        `;
        
        // Store resolve function globally so buttons can access it
        window.routeOptionsResolve = resolve;
        
        // Create modal
        NetworkManager.createModal('Route Management Options', modalContent, modalFooter);
        
        // Add handler function to window
        window.handleRouteOptionChoice = function() {
            const selectedOption = (document.querySelector('input[name="routeOption"]:checked') && document.querySelector('input[name="routeOption"]:checked').value);
            NetworkManager.closeModal();
            
            switch (selectedOption) {
                case 'reconfigure':
                    resolve({ proceed: true, preserveRoutes: false });
                    break;
                case 'preserve':
                    resolve({ proceed: true, preserveRoutes: true });
                    break;
                case 'cancel':
                default:
                    resolve({ proceed: false, preserveRoutes: false });
                    break;
            }
        };
    });
}

// Check route impacts when creating new VLAN
async function confirmNewVlanRouteImpact(vlanConfig) {
    NetworkLogger.info('Checking route impacts for new VLAN creation...');
    
    // Check if parent interface has existing routes that might be affected
    let parentRoutes = [];
    let potentialConflicts = false;
    
    try {
        const routeOutput = await cockpit.spawn(['ip', 'route', 'show', 'dev', vlanConfig.parent], { superuser: 'try' });
        parentRoutes = routeOutput.trim().split('\n').filter(line => line.trim());
        NetworkLogger.info(`Parent interface ${vlanConfig.parent} has existing routes:`, parentRoutes);
        
        // Check if new VLAN IPs might create subnet conflicts
        if (parentRoutes.length > 0 && vlanConfig.ipAddresses) {
            for (const ip of vlanConfig.ipAddresses) {
                if (ip && ip.includes('/')) {
                    const vlanSubnet = ip.split('/')[0];
                    const vlanSubnetBase = vlanSubnet.split('.').slice(0, 3).join('.');
                    
                    // Check if any parent routes use the same subnet
                    for (const route of parentRoutes) {
                        if (route.includes(vlanSubnetBase)) {
                            potentialConflicts = true;
                            break;
                        }
                    }
                }
            }
        }
    } catch (error) {
        NetworkLogger.warning('Could not check parent interface routes:', error);
        // If we can't check, assume there might be routes to be safe
        parentRoutes = ['Unable to check - routes may exist'];
        potentialConflicts = true;
    }
    
    // Only show dialog if there are existing routes or potential conflicts
    if (parentRoutes.length === 0 || (parentRoutes.length === 1 && !parentRoutes[0].trim())) {
        NetworkLogger.info('No existing routes found on parent interface, proceeding with VLAN creation');
        return { proceed: true };
    }
    
    if (potentialConflicts || parentRoutes.length > 0) {
        // Create a simplified modal for new VLAN creation
        return await showNewVlanRouteWarningModal(vlanConfig, parentRoutes, potentialConflicts);
    }
    
    return { proceed: true };
}

// Show route warning modal for new VLAN creation
async function showNewVlanRouteWarningModal(vlanConfig, parentRoutes, hasConflicts) {
    return new Promise((resolve) => {
        const modalContent = `
            <div class="route-options-content">
                <div class="alert ${hasConflicts ? 'alert-warning' : 'alert-info'}">
                    <i class="fas ${hasConflicts ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                    <strong>${hasConflicts ? 'Potential Route Conflict Detected' : 'Route Impact Information'}</strong>
                </div>
                
                <p>Creating VLAN <strong>${vlanConfig.name}</strong> on parent interface <strong>${vlanConfig.parent}</strong> may impact existing network routing.</p>
                
                <div class="change-summary">
                    <div class="vlan-info">
                        <div class="change-item">
                            <strong>New VLAN IPs:</strong> ${vlanConfig.ipAddresses ? vlanConfig.ipAddresses.join(', ') : 'None'}
                        </div>
                        <div class="change-item">
                            <strong>Parent Interface:</strong> ${vlanConfig.parent}
                        </div>
                    </div>
                    
                    ${parentRoutes.length > 0 ? `
                    <div class="existing-routes">
                        <strong>Existing Routes on Parent Interface:</strong>
                        <div class="route-list">
                            ${parentRoutes.map(route => `<div class="route-item"><code>${route}</code></div>`).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                ${hasConflicts ? `
                <div class="conflict-warning">
                    <h4><i class="fas fa-exclamation-triangle"></i> Potential Issues:</h4>
                    <ul>
                        <li>The new VLAN's IP subnet may overlap with existing routes</li>
                        <li>This could cause routing conflicts or unexpected traffic behavior</li>
                        <li>You may need to manually adjust routes after VLAN creation</li>
                    </ul>
                </div>
                ` : ''}
                
                <div class="route-options">
                    <h4>How would you like to proceed?</h4>
                    
                    <div class="option-group">
                        <label class="radio-option">
                            <input type="radio" name="newVlanRouteOption" value="proceed" checked>
                            <div class="option-content">
                                <strong>Create VLAN with Automatic Route Management</strong>
                                <p>Create the VLAN and let the system manage routes automatically. This is recommended for most scenarios.</p>
                            </div>
                        </label>
                        
                        <label class="radio-option">
                            <input type="radio" name="newVlanRouteOption" value="manual">
                            <div class="option-content">
                                <strong>Create VLAN - I'll Handle Routes Manually</strong>
                                <p>Create the VLAN but I'll manually configure any needed route adjustments after creation.</p>
                            </div>
                        </label>
                        
                        <label class="radio-option">
                            <input type="radio" name="newVlanRouteOption" value="cancel">
                            <div class="option-content">
                                <strong>Cancel VLAN Creation</strong>
                                <p>Don't create the VLAN. I'll review the routing configuration first.</p>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
            
            <style>
                .route-options-content { font-family: system-ui, -apple-system, sans-serif; }
                .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; }
                .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
                .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
                .change-summary { background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 16px 0; }
                .change-item { margin: 8px 0; }
                .route-list { background: #fff; padding: 8px; border-radius: 4px; margin-top: 8px; max-height: 120px; overflow-y: auto; }
                .route-item { margin: 4px 0; font-size: 13px; }
                .conflict-warning { background: #fff3cd; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #ffc107; }
                .conflict-warning h4 { margin-top: 0; color: #856404; }
                .conflict-warning ul { margin-bottom: 0; }
                .option-group { margin: 16px 0; }
                .radio-option { display: block; margin: 12px 0; padding: 12px; border: 2px solid #e9ecef; border-radius: 8px; cursor: pointer; }
                .radio-option:hover { border-color: #007bff; background: #f8f9ff; }
                .radio-option input[type="radio"] { margin-right: 8px; }
                .option-content strong { display: block; margin-bottom: 4px; color: #333; }
                .option-content p { margin: 0; color: #666; font-size: 14px; }
                .radio-option input[type="radio"]:checked + .option-content { color: #007bff; }
                .radio-option input[type="radio"]:checked { accent-color: #007bff; }
            </style>
        `;
        
        const modalFooter = `
            <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal(); window.newVlanRouteOptionsResolve({ proceed: false });">Cancel</button>
            <button class="btn btn-brand" onclick="handleNewVlanRouteOptionChoice()">Continue</button>
        `;
        
        // Store resolve function globally so buttons can access it
        window.newVlanRouteOptionsResolve = resolve;
        
        // Create modal
        NetworkManager.createModal('New VLAN Route Impact', modalContent, modalFooter);
        
        // Add handler function to window
        window.handleNewVlanRouteOptionChoice = function() {
            const selectedOption = (document.querySelector('input[name="newVlanRouteOption"]:checked') && document.querySelector('input[name="newVlanRouteOption"]:checked').value);
            NetworkManager.closeModal();
            
            switch (selectedOption) {
                case 'proceed':
                case 'manual':
                    resolve({ proceed: true });
                    break;
                case 'cancel':
                default:
                    resolve({ proceed: false });
                    break;
            }
        };
    });
}

// Parse existing routes for inclusion in netplan configuration
function parseRoutesForNetplan(routeLines) {
    const routes = [];
    
    for (const line of routeLines) {
        if (!line.trim()) continue;
        
        try {
            // Parse route line: "destination via gateway dev interface"
            // Example: "192.168.1.0/24 via 10.100.1.1 dev eno4.1111"
            // Example: "default via 10.100.1.1 dev eno4.1111"
            
            const parts = line.trim().split(/\s+/);
            let destination = null;
            let gateway = null;
            
            // Skip kernel-generated routes (they'll be recreated automatically)
            if (line.includes('proto kernel') && !line.includes('default')) {
                NetworkLogger.info('Skipping kernel proto route:', line);
                continue;
            }
            
            // Parse destination
            if (parts[0] === 'default') {
                destination = '0.0.0.0/0';
            } else if (parts[0].includes('/') || /^\d+\.\d+\.\d+\.\d+$/.test(parts[0])) {
                destination = parts[0];
                // Add /32 if it's a single IP without CIDR
                if (!destination.includes('/') && /^\d+\.\d+\.\d+\.\d+$/.test(destination)) {
                    destination += '/32';
                }
            } else {
                NetworkLogger.info('Skipping route with unrecognized destination:', line);
                continue;
            }
            
            // Find gateway
            const viaIndex = parts.indexOf('via');
            if (viaIndex !== -1 && viaIndex + 1 < parts.length) {
                gateway = parts[viaIndex + 1];
            }
            
            // Only include routes with gateways (static routes)
            if (gateway && destination) {
                const route = {
                    to: destination
                };
                
                if (gateway !== '0.0.0.0') {
                    route.via = gateway;
                }
                
                routes.push(route);
                NetworkLogger.info('Parsed route for netplan:', route, 'from line:', line);
            } else {
                NetworkLogger.info('Skipping route without gateway:', line);
            }
            
        } catch (error) {
            NetworkLogger.warning('Could not parse route line:', line, error);
        }
    }
    
    NetworkLogger.info('Parsed routes for netplan:', routes);
    return routes;
}

// Generate Netplan configuration for VLAN
async function generateVlanNetplanConfig(config, parentType = 'unknown') {
    NetworkLogger.info('Generating Netplan config for VLAN:', config.name);
    NetworkLogger.info('Config object:', config);
    NetworkLogger.info('Parent interface type:', parentType);
    
    // Validate that we have a valid parent interface
    if (!config.parent || config.parent === 'null' || config.parent === null || config.parent === undefined) {
        NetworkLogger.error('Invalid or missing parent interface for VLAN:', config);
        throw new Error(`Invalid parent interface for VLAN ${config.name}. Parent interface is required.`);
    }
    
    let yamlConfig = `network:
  version: 2
  renderer: networkd`;
    
    // For bonds and bridges, we need to include a minimal definition so Netplan can resolve the parent
    // However, we exclude any IP configuration, gateways, or routes to prevent conflicts
    if (parentType === 'bond' || parentType === 'bridge') {
        NetworkLogger.info(`VlanManager: Including minimal parent ${parentType} definition for ${config.parent} (no IP/route config)`);
        
        if (parentType === 'bond') {
            yamlConfig += `
  bonds:
    ${config.parent}:
      # Minimal bond definition - full config should be in another file
      # This is just to satisfy netplan's parent interface requirement
      # No IP configuration to avoid route conflicts
      interfaces: []`;
        } else if (parentType === 'bridge') {
            yamlConfig += `
  bridges:
    ${config.parent}:
      # Minimal bridge definition - full config should be in another file  
      # This is just to satisfy netplan's parent interface requirement
      # No IP configuration to avoid route conflicts
      interfaces: []`;
        }
    }
    
    yamlConfig += `
  vlans:
    ${config.name}:
      id: ${config.id}
      link: ${config.parent}`;
    
    if (config.configType === 'static') {
        // Handle multiple IP addresses
        const ipAddresses = config.ipAddresses || (config.ip ? [config.ip] : []);
        NetworkLogger.info(`VlanManager: generateVlanNetplanConfig - Processing IP addresses:`, ipAddresses);
        NetworkLogger.info(`VlanManager: config.ipAddresses:`, config.ipAddresses);
        NetworkLogger.info(`VlanManager: config.ip:`, config.ip);
        
        if (ipAddresses.length > 0) {
            yamlConfig += `
      addresses:`;
            ipAddresses.forEach((ip, index) => {
                NetworkLogger.info(`VlanManager: Adding IP address ${index}: ${ip}`);
                yamlConfig += `
        - ${ip}`;
            });
        } else {
            NetworkLogger.warning(`VlanManager: No IP addresses found for static configuration!`);
        }
        
        // Gateway configuration is intentionally disabled to prevent automatic route conflicts
        // The gateway value is preserved in the configuration for reference but not applied as routes
        // Routes are managed automatically by the system based on IP address configuration
        // Users can manually configure custom routes after VLAN creation if needed
        if (config.gateway) {
            NetworkLogger.info(`VlanManager: Gateway ${config.gateway} specified but not added to prevent automatic route conflicts`);
            // Gateway is stored in the form but not written to Netplan to avoid route management issues
        }
        
        if (config.dns) {
            const dnsServers = config.dns.split(',').map(dns => dns.trim()).filter(dns => dns);
            if (dnsServers.length > 0) {
                yamlConfig += `
      nameservers:
        addresses: [${dnsServers.map(dns => `"${dns}"`).join(', ')}]`;
            }
        }
        
        // Add preserved routes if available (but avoid default routes to prevent conflicts)
        if (config.routes && config.routes.length > 0) {
            const nonDefaultRoutes = config.routes.filter(route => 
                route.to !== 'default' && route.to !== '0.0.0.0/0' && route.to !== '::0/0'
            );
            
            if (nonDefaultRoutes.length > 0) {
                yamlConfig += `
      routes:`;
                nonDefaultRoutes.forEach((route, index) => {
                    NetworkLogger.info(`VlanManager: Adding preserved non-default route ${index}:`, route);
                    yamlConfig += `
        - to: ${route.to}`;
                    if (route.via) {
                        yamlConfig += `
          via: ${route.via}`;
                    }
                });
            }
            
            // Log filtered out default routes
            const defaultRoutes = config.routes.filter(route => 
                route.to === 'default' || route.to === '0.0.0.0/0' || route.to === '::0/0'
            );
            if (defaultRoutes.length > 0) {
                NetworkLogger.info(`VlanManager: Filtered out ${defaultRoutes.length} default route(s) to prevent conflicts:`, defaultRoutes);
            }
        }
    } else if (config.configType === 'dhcp') {
        yamlConfig += `
      dhcp4: true`;
    }
    
    yamlConfig += '\n';
    
    NetworkLogger.info('Generated YAML config:', yamlConfig);
    return yamlConfig;
}

// Save VLAN edit changes
async function saveVlanEdit(vlanIdentifier) {
    // Determine if this is a VLAN ID or name
    let vlanDisplay = vlanIdentifier;
    let originalVlan = null;
    
    // Try to find the VLAN by name first, then by ID for backward compatibility
    if (typeof vlanIdentifier === 'string' && vlanIdentifier.includes('.')) {
        // Looks like a VLAN name (e.g., "bond0.1111")
        originalVlan = VlanManager.vlans.find(v => v.name === vlanIdentifier);
        vlanDisplay = vlanIdentifier;
    } else {
        // Might be a VLAN ID
        originalVlan = VlanManager.vlans.find(v => v.id == vlanIdentifier);
        vlanDisplay = originalVlan ? `${originalVlan.name} (ID ${originalVlan.id})` : vlanIdentifier;
    }
    
    NetworkLogger.info(`VlanManager: Saving edits for VLAN ${vlanDisplay}...`);
    
    const modal = document.querySelector('.modal');
    const form = document.getElementById('vlan-edit-form');
    const saveButton = modal.querySelector('button.btn-brand');
    
    // Save original button state
    let originalButtonContent = '';
    if (saveButton) {
        originalButtonContent = saveButton.innerHTML;
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
    }
    
    // Function to restore button state
    const restoreButton = () => {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonContent;
        }
    };
    
    // Clear any existing modal messages
    if (typeof clearModalMessages === 'function') {
        clearModalMessages(modal);
    }
    
    // Validate form using live validation
    if (typeof validateForm === 'function') {
        if (!validateForm(form)) {
            restoreButton();
            if (typeof showModalError === 'function') {
                showModalError(modal, 'Please correct the errors in the form before continuing.');
            }
            return;
        }
    }
    
    // Use emergency IP collection since it works correctly
    const collectedIpAddresses = emergencyCollectAllIps();
    NetworkLogger.info(`VlanManager: Collected IP addresses from form:`, collectedIpAddresses);
    
    const formData = {
        id: originalVlan ? originalVlan.id : vlanIdentifier, // Keep original VLAN ID
        name: document.getElementById('edit-vlan-name').value,
        parent: document.getElementById('edit-vlan-parent').value,
        description: document.getElementById('edit-vlan-description').value,
        configType: document.querySelector('#vlan-edit-form .toggle-seg.active').getAttribute('data-config'),
        ipAddresses: collectedIpAddresses,
        ip: collectedIpAddresses[0] || '', // Backward compatibility
        gateway: (document.getElementById('edit-vlan-gateway') && document.getElementById('edit-vlan-gateway').value) || '',
        dns: (document.getElementById('edit-vlan-dns') && document.getElementById('edit-vlan-dns').value) || ''
    };
    
    NetworkLogger.info('Edit form data collected:', formData);
    
    // Basic validation
    if (!formData.name || !formData.parent) {
        restoreButton();
        if (typeof showModalError === 'function') {
            showModalError(modal, 'Please fill in all required fields (Name and Parent Interface).');
        } else {
            NetworkManager.showError('Please fill in all required fields');
        }
        return;
    }
    
    // Find the original VLAN to check if we're changing parent interface
    if (!originalVlan) {
        restoreButton();
        if (typeof showModalError === 'function') {
            showModalError(modal, `Original VLAN ${vlanIdentifier} not found.`);
        } else {
            NetworkManager.showError(`VLAN ${vlanIdentifier} not found`);
        }
        return;
    }
    
    // Check for VLAN ID conflicts on new parent interface (if changed)
    if (formData.parent !== originalVlan.parentInterface) {
        try {
            const existingVlans = await VlanManager.getExistingVlansOnParent(formData.parent);
            const conflictingVlan = existingVlans.find(vlan => vlan.id == formData.id && vlan.name !== formData.name);
            
            if (conflictingVlan) {
                if (typeof showModalError === 'function') {
                    showModalError(modal, `VLAN ID ${formData.id} is already in use on interface ${formData.parent} by VLAN '${conflictingVlan.name}'. Please choose a different parent interface.`);
                } else {
                    NetworkManager.showError(`VLAN ID ${formData.id} is already in use on ${formData.parent}`);
                }
                return;
            }
        } catch (conflictCheckError) {
            NetworkLogger.warning('Could not check for VLAN ID conflicts:', conflictCheckError);
        }
    }
    
    // Check if IP changes will affect routes and get user confirmation
    let routeOptions = { proceed: true, preserveRoutes: false };
    try {
        routeOptions = await confirmRouteChanges(originalVlan, formData);
        if (!routeOptions.proceed) {
            restoreButton();
            NetworkLogger.info('User cancelled VLAN edit due to route changes');
            return;
        }
    } catch (confirmError) {
        NetworkLogger.warning('Could not check route changes:', confirmError);
        // Continue anyway - user can handle route issues manually
    }
    
    // Pass route preservation option to update function
    formData.preserveRoutes = routeOptions.preserveRoutes;
    
    // Update VLAN using real system calls
    updateRealVlan(originalVlan, formData)
        .then(() => {
            restoreButton();
            NetworkLogger.info('VLAN updated successfully');
            if (typeof showModalSuccess === 'function') {
                showModalSuccess(modal, `VLAN ${vlanDisplay} updated and tested successfully! The configuration has been applied.`);
                // Close modal after showing success
                setTimeout(() => {
                    NetworkManager.closeModal();
                    VlanManager.loadVlans();
                }, 2000);
            } else {
                NetworkManager.showSuccess(`VLAN ${vlanDisplay} updated successfully`);
                NetworkManager.closeModal();
                VlanManager.loadVlans();
            }
        })
        .catch((error) => {
            restoreButton();
            displayVlanError(modal, error, 'update VLAN');
        });
}

// Update real VLAN configuration
async function updateRealVlan(originalVlan, newConfig) {
    NetworkLogger.info('Updating real VLAN configuration...');
    NetworkLogger.info('Original VLAN:', originalVlan);
    NetworkLogger.info('New config:', newConfig);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    const vlanId = originalVlan.id;
    
    // Get parent interface type for proper file prefix
    const oldParentType = await getParentInterfaceType(originalVlan.parentInterface);
    const oldFilePrefix = getVlanFilePrefix(oldParentType, originalVlan.parentInterface);
    const newParentType = await getParentInterfaceType(newConfig.parent);
    const newFilePrefix = getVlanFilePrefix(newParentType, newConfig.parent);
    
    // Generate old filename paths using both old and new systems for cleanup
    const oldConfigPath = `/etc/netplan/${oldFilePrefix}-${originalVlan.parentInterface}-vlan${vlanId}.yaml`;
    const oldGenericConfigPath = `/etc/netplan/${oldFilePrefix}-vlan${vlanId}.yaml`;
    const oldCustomConfigPath = `/etc/netplan/${oldFilePrefix}-${originalVlan.name}.yaml`;
    
    // Generate old filename using new system (in case it was previously created with new system)
    const oldParentInfo = {
        parentType: oldParentType,
        parentInterface: originalVlan.parentInterface
    };
    const oldNewSystemFilename = NetworkConfigUtils.generateNetplanFilename(originalVlan.name, 'vlan', oldParentInfo);
    const oldNewSystemPath = `/etc/netplan/${oldNewSystemFilename}`;
    
    try {
        // Remove old configuration files (try both old and new naming schemes)
        NetworkLogger.info('Removing old configuration files...');
        await cockpit.spawn(['rm', '-f', oldConfigPath], { superuser: 'try' });
        await cockpit.spawn(['rm', '-f', oldGenericConfigPath], { superuser: 'try' });
        await cockpit.spawn(['rm', '-f', oldCustomConfigPath], { superuser: 'try' });
        await cockpit.spawn(['rm', '-f', oldNewSystemPath], { superuser: 'try' });
        
        // Remove any conflicting XAVS files for this interface name
        try {
            const existingXavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*-xavs-*.yaml'], { superuser: 'try' });
            const files = existingXavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes(`${newConfig.name}:`)) {
                        NetworkLogger.info(`VlanManager: Removing conflicting XAVS file: ${file}`);
                        await cockpit.spawn(['rm', '-f', file], { superuser: 'try' });
                    }
                } catch (fileError) {
                    NetworkLogger.warning(`VlanManager: Could not check/remove file ${file}:`, fileError);
                }
            }
        } catch (cleanupError) {
            NetworkLogger.warning('Error during cleanup:', cleanupError);
        }
        
        // Generate and write new configuration with parent type detection
        NetworkLogger.info(`VlanManager: Parent interface ${newConfig.parent} detected as type: ${newParentType}`);
        
        const netplanConfig = await generateVlanNetplanConfig(newConfig, newParentType);
        
        // Generate new filename using the comprehensive system
        const newParentInfo = {
            parentType: newParentType,
            parentInterface: newConfig.parent
        };
        const newFilename = NetworkConfigUtils.generateNetplanFilename(newConfig.name, 'vlan', newParentInfo);
        const newConfigPath = `/etc/netplan/${newFilename}`;
        
        NetworkLogger.info('Generated new Netplan config:', netplanConfig);
        NetworkLogger.info('Writing new configuration to', newConfigPath);
        
        await cockpit.file(newConfigPath, { superuser: 'try' }).replace(netplanConfig);
        
        // Set proper permissions (ignore errors if file doesn't exist)
        NetworkLogger.info('Setting file permissions...');
        try {
            await cockpit.spawn(['chmod', '600', newConfigPath], { superuser: 'try' });
        } catch (chmodError) {
            NetworkLogger.warn('Could not set file permissions (file may not exist):', chmodError.message);
        }
        
        // Skip individual netplan try test - will be handled by applyNetplanWithConfirmation
        NetworkLogger.info('Configuration written, will test during application...');
        
        // Apply the configuration
        NetworkLogger.info('Applying netplan configuration...');
        
        // If route preservation is requested, backup ALL system routes first
        let savedSystemRoutes = [];
        if (newConfig.preserveRoutes) {
            try {
                NetworkLogger.info('Backing up ALL system routes for preservation...');
                // Get all system routes to preserve critical connectivity
                const routeOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
                savedSystemRoutes = routeOutput.trim().split('\n').filter(line => line.trim());
                NetworkLogger.info('Saved all system routes:', savedSystemRoutes);
                
                // Store routes globally for restoration after netplan operations
                window.preservedSystemRoutes = savedSystemRoutes;
                NetworkLogger.info('System routes stored for post-netplan restoration');
            } catch (routeBackupError) {
                NetworkLogger.warning('Could not backup system routes:', routeBackupError);
                // Continue anyway
            }
        }
        
        await NetworkConfigUtils.applyNetplanWithConfirmation(120); // 2-minute timeout
        
        // Explicitly restore system routes in case they were lost during configuration
        try {
            await NetworkConfigUtils.restoreSystemRoutes();
            NetworkLogger.info('System routes restored successfully after VLAN update');
        } catch (routeError) {
            NetworkLogger.warning('Could not restore system routes after VLAN update:', routeError);
        }
        
        NetworkLogger.info('VLAN configuration updated successfully');
        
    } catch (error) {
        NetworkLogger.error('Error updating VLAN configuration:', error);
        
        // Try to restore old configuration if possible
        try {
            NetworkLogger.info('Attempting to restore old configuration...');
            
            // Get parent interface type for proper configuration generation
            const parentType = await getParentInterfaceType(originalVlan.parentInterface);
            NetworkLogger.info('Parent interface type:', parentType);
            
            const oldNetplanConfig = await generateVlanNetplanConfig({
                id: originalVlan.id,
                name: originalVlan.name,
                parent: originalVlan.parentInterface,
                description: originalVlan.description,
                configType: originalVlan.ipConfig,
                ip: originalVlan.ipAddress,
                gateway: originalVlan.gateway,
                dns: originalVlan.dns ? originalVlan.dns.join(', ') : ''
            }, parentType);
            
            NetworkLogger.info('Generated YAML config:', oldNetplanConfig);
            
            // Use interface-specific path with correct prefix for restore
            const restoreConfigPath = `/etc/netplan/${oldFilePrefix}-${originalVlan.parentInterface}-vlan${originalVlan.id}.yaml`;
            await cockpit.file(restoreConfigPath, { superuser: 'try' }).replace(oldNetplanConfig);
            try {
                await cockpit.spawn(['chmod', '600', restoreConfigPath], { superuser: 'try' });
            } catch (chmodError) {
                NetworkLogger.warn('Could not set restore file permissions:', chmodError.message);
            }
            await NetworkConfigUtils.applyNetplanWithConfirmation(60); // 1-minute timeout for restoration
            
            NetworkLogger.info('Old configuration restored');
        } catch (restoreError) {
            NetworkLogger.error('Failed to restore old configuration:', restoreError);
        }
        
        throw new Error(`Failed to update VLAN configuration: ${error.message || error}`);
    }
}

async function updateVlan(vlanId) {
    NetworkLogger.info(`VlanManager: updateVlan called for VLAN ${vlanId} - this function is deprecated, use editVlan instead`);
    // This function is deprecated - editVlan should be used instead
    // editVlan now accepts both VLAN IDs and names for backward compatibility
    try {
        await editVlan(vlanId);
    } catch (error) {
        NetworkLogger.error('Error in updateVlan wrapper:', error);
        NetworkManager.showError('Error loading VLAN edit form');
    }
}

function toggleVlan(vlanIdentifier, currentStatus) {
    // Determine if this is a VLAN ID or name
    let vlanDisplay = vlanIdentifier;
    let vlan = null;
    
    // Try to find the VLAN by name first, then by ID for backward compatibility
    if (typeof vlanIdentifier === 'string' && vlanIdentifier.includes('.')) {
        // Looks like a VLAN name (e.g., "bond0.1111")
        vlan = VlanManager.vlans.find(v => v.name === vlanIdentifier);
        vlanDisplay = vlanIdentifier;
    } else {
        // Might be a VLAN ID
        vlan = VlanManager.vlans.find(v => v.id == vlanIdentifier);
        vlanDisplay = vlan ? `${vlan.name} (ID ${vlan.id})` : vlanIdentifier;
    }
    
    if (!vlan) {
        NetworkManager.showError(`VLAN ${vlanIdentifier} not found`);
        return;
    }
    
    const newStatus = currentStatus === 'up' ? 'down' : 'up';
    const action = newStatus === 'up' ? 'enable' : 'disable';
    
    if (confirm(`Are you sure you want to ${action} VLAN ${vlanDisplay}?`)) {
        NetworkLogger.info(`VlanManager: ${action}ing VLAN ${vlanDisplay}...`);
        
        // Find the toggle button and show progress - use VLAN name for selector
        const toggleButton = document.querySelector(`button[onclick="toggleVlan('${vlanIdentifier}', '${currentStatus}')"]`);
        if (toggleButton) {
            // Save original button content
            const originalContent = toggleButton.innerHTML;
            
            // Show loading state
            toggleButton.disabled = true;
            toggleButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            toggleButton.classList.add('loading');
            
            // Show immediate feedback toast
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', `${action === 'enable' ? 'Enabling' : 'Disabling'} VLAN ${vlanDisplay}...`, { duration: 0 });
            }
            
            // Restore button state function
            const restoreButton = () => {
                if (toggleButton) {
                    toggleButton.disabled = false;
                    toggleButton.innerHTML = originalContent;
                    toggleButton.classList.remove('loading');
                }
            };
            
            if (!cockpit || !cockpit.spawn) {
                restoreButton();
                NetworkManager.showError('Cockpit API not available');
                return;
            }
            
            const command = newStatus === 'up' ? 'up' : 'down';
            cockpit.spawn(['ip', 'link', 'set', vlan.name, command], { superuser: 'try' })
                .then(() => {
                    restoreButton();
                    NetworkManager.showSuccess(`VLAN ${vlanDisplay} ${action}d successfully`);
                    VlanManager.loadVlans();
                })
                .catch((error) => {
                    restoreButton();
                    NetworkLogger.error(`VlanManager: Error ${action}ing VLAN:`, error);
                    NetworkManager.showError(`Failed to ${action} VLAN: ${error.message || error}`);
                });
        }
    }
}

function deleteVlan(vlanIdentifier) {
    // Determine if this is a VLAN ID or name
    let vlanDisplay = vlanIdentifier;
    let vlan = null;
    
    // Try to find the VLAN by name first, then by ID
    if (typeof vlanIdentifier === 'string' && vlanIdentifier.includes('.')) {
        // Looks like a VLAN name (e.g., "bond0.1111")
        vlan = VlanManager.vlans.find(v => v.name === vlanIdentifier);
        vlanDisplay = vlanIdentifier;
    } else {
        // Might be a VLAN ID
        vlan = VlanManager.vlans.find(v => v.id == vlanIdentifier);
        vlanDisplay = vlan ? `${vlan.name} (ID ${vlan.id})` : vlanIdentifier;
    }
    
    if (!vlan) {
        NetworkManager.showError(`VLAN ${vlanIdentifier} not found`);
        return;
    }
    
    if (confirm(`Are you sure you want to delete VLAN ${vlanDisplay}? This action cannot be undone.`)) {
        NetworkLogger.info(`VlanManager: Deleting VLAN ${vlanDisplay}...`);
        
        // Find the delete button and show progress
        const deleteButton = document.querySelector(`button[onclick="deleteVlan('${vlanIdentifier}')"]`);
        if (deleteButton) {
            // Save original button content
            const originalContent = deleteButton.innerHTML;
            
            // Show loading state
            deleteButton.disabled = true;
            deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            deleteButton.classList.add('loading');
            
            // Show immediate feedback toast
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', `Deleting VLAN ${vlanDisplay}...`, { duration: 0 }); // Persistent until completion
            }
            
            // Restore button state function
            const restoreButton = () => {
                if (deleteButton) {
                    deleteButton.disabled = false;
                    deleteButton.innerHTML = originalContent;
                    deleteButton.classList.remove('loading');
                }
            };
            
            // Call the deletion function
            VlanManager.deleteRealVlan(vlan.id, vlan.name)
                .then(() => {
                    // Success is handled in the deleteRealVlan function
                    restoreButton();
                })
                .catch((error) => {
                    NetworkLogger.error('Delete operation failed:', error);
                    restoreButton();
                    
                    // Show error if not already shown
                    if (typeof NetworkManager !== 'undefined' && NetworkManager.showError) {
                        NetworkManager.showError(`Failed to delete VLAN ${vlanDisplay}: ${error.message || error}`);
                    }
                });
        } else {
            // Fallback if button not found
            VlanManager.deleteRealVlan(vlan.id, vlan.name);
        }
    }
}

// Add a public method to VlanManager for external deletion calls
VlanManager.deleteRealVlan = async function(vlanId, vlanName = null) {
    NetworkLogger.info(`VlanManager: deleteRealVlan called for VLAN ${vlanId}${vlanName ? ` (${vlanName})` : ''}...`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // Find the VLAN in our current list - prioritize finding by name first to avoid ID conflicts
        let vlan = null;
        
        if (vlanName) {
            // If we have a name, find by name first (most accurate)
            NetworkLogger.info(`VlanManager: Looking for VLAN by name: '${vlanName}'`);
            vlan = this.vlans.find(v => v.name === vlanName);
            if (vlan) {
                NetworkLogger.info(`VlanManager: Found VLAN by name: ${vlan.name} (ID: ${vlan.id})`);
            } else {
                NetworkLogger.info(`VlanManager: VLAN '${vlanName}' not found by name in current list`);
            }
        }
        
        if (!vlan) {
            // If not found by name, try to find by ID (less reliable due to potential conflicts)
            NetworkLogger.info(`VlanManager: Looking for VLAN by ID: ${vlanId}`);
            vlan = this.vlans.find(v => v.id === vlanId);
            if (vlan) {
                NetworkLogger.info(`VlanManager: Found VLAN by ID: ${vlan.name} (ID: ${vlan.id})`);
                NetworkLogger.warning(`VlanManager: WARNING - Found VLAN by ID but not by name. This could be wrong if multiple VLANs have the same ID!`);
            }
        }
        
        if (!vlan && vlanName) {
            // Create a temporary VLAN object for deletion
            const vlanIdMatch = vlanName.match(/\.(\d+)$/);
            vlan = {
                id: vlanIdMatch ? parseInt(vlanIdMatch[1]) : vlanId,
                name: vlanName
            };
        }
        
        if (!vlan) {
            throw new Error(`VLAN ${vlanId} not found`);
        }
        
        NetworkLogger.info(`VlanManager: Found VLAN for deletion:`, vlan);
        
        // Try to get the real parent interface from Netplan config before deletion
        try {
            const realParent = await this.getRealParentFromNetplan(vlan.name, vlan.id);
            if (realParent && realParent !== vlan.parentInterface) {
                NetworkLogger.info(`VlanManager: Corrected parent interface from '${vlan.parentInterface}' to '${realParent}' based on Netplan config`);
                vlan.parentInterface = realParent;
            }
        } catch (parentError) {
            NetworkLogger.warning(`VlanManager: Could not determine real parent interface:`, parentError);
        }
        
        // Check if the interface actually exists in the system before trying to delete it
        let interfaceExists = false;
        try {
            NetworkLogger.info(`VlanManager: Checking if VLAN interface ${vlan.name} exists...`);
            const ipShow = await cockpit.spawn(['ip', 'link', 'show', vlan.name], { superuser: 'try' });
            interfaceExists = true;
            NetworkLogger.info(`VlanManager: VLAN interface ${vlan.name} exists in system`);
        } catch (checkError) {
            NetworkLogger.info(`VlanManager: VLAN interface ${vlan.name} does not exist in system (this is okay)`);
            interfaceExists = false;
        }
        
        // Only try to bring down and delete the interface if it actually exists
        if (interfaceExists) {
            // First bring down the interface
            try {
                NetworkLogger.info(`VlanManager: Bringing down VLAN interface: ${vlan.name}`);
                await cockpit.spawn(['ip', 'link', 'set', vlan.name, 'down'], { superuser: 'try' });
            } catch (downError) {
                NetworkLogger.warning(`VlanManager: Could not bring down interface ${vlan.name}:`, downError);
            }
            
            // Delete the VLAN interface
            try {
                NetworkLogger.info(`VlanManager: Deleting VLAN interface: ${vlan.name}`);
                await cockpit.spawn(['ip', 'link', 'delete', vlan.name], { superuser: 'try' });
                
                // Wait a moment for the deletion to complete
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Verify the interface is actually deleted
                try {
                    const verifyOutput = await cockpit.spawn(['ip', 'link', 'show', vlan.name], { superuser: 'try' });
                    NetworkLogger.warning(`VlanManager: Interface ${vlan.name} still exists after deletion attempt`);
                } catch (verifyError) {
                    // This is expected - interface should not exist
                    NetworkLogger.info(`VlanManager: Verified interface ${vlan.name} was successfully deleted`);
                }
            } catch (deleteError) {
                NetworkLogger.warning(`VlanManager: Could not delete interface ${vlan.name}:`, deleteError);
            }
        } else {
            NetworkLogger.info(`VlanManager: Skipping interface deletion since ${vlan.name} doesn't exist`);
        }
        
        // Remove all possible configuration files for this VLAN
        // Support both old and new naming schemes with different prefixes
        const configFiles = [
            `/etc/netplan/90-xavs-vlan${vlan.id}.yaml`, // Old naming scheme
            `/etc/netplan/90-xavs-${vlan.name}.yaml`, // Custom name scheme
            `/etc/netplan/92-xavs-vlan${vlan.id}.yaml`, // VLAN on bridge naming scheme
            `/etc/netplan/92-xavs-${vlan.name}.yaml`, // VLAN on bridge custom name scheme
            `/etc/netplan/95-xavs-vlan${vlan.id}.yaml`, // VLAN on bond naming scheme
            `/etc/netplan/95-xavs-${vlan.name}.yaml`, // VLAN on bond custom name scheme
        ];
        
        // Add interface-specific naming scheme if we can determine the parent
        if (vlan.parentInterface) {
            // Try all possible prefixes for the parent interface
            const prefixes = ['90-xavs', '92-xavs', '95-xavs'];
            for (const prefix of prefixes) {
                configFiles.push(`/etc/netplan/${prefix}-${vlan.parentInterface}-vlan${vlan.id}.yaml`);
            }
        }
        
        // Try to find ALL possible interface-specific files by pattern matching
        // This catches cases where the parent interface detection was incorrect
        try {
            const findResult = await cockpit.spawn(['find', '/etc/netplan', '-name', `*-xavs-*-vlan${vlan.id}.yaml`], { superuser: 'try' });
            const foundFiles = findResult.trim().split('\n').filter(f => f.trim());
            
            // Also search for files containing this VLAN name
            const nameSearchResult = await cockpit.spawn(['find', '/etc/netplan', '-name', `*-xavs-*${vlan.name}*.yaml`], { superuser: 'try' });
            const nameFoundFiles = nameSearchResult.trim().split('\n').filter(f => f.trim());
            
            // Combine all found files and deduplicate
            const allFoundFiles = [...new Set([...foundFiles, ...nameFoundFiles])];
            configFiles.push(...allFoundFiles);
            
            NetworkLogger.info(`VlanManager: Found config files to remove:`, allFoundFiles);
        } catch (findError) {
            NetworkLogger.warning('Could not search for config files:', findError);
        }
        
        // Deduplicate config files
        const uniqueConfigFiles = [...new Set(configFiles)];
        
        for (const configFile of uniqueConfigFiles) {
            try {
                NetworkLogger.info(`VlanManager: Removing configuration file: ${configFile}`);
                await cockpit.spawn(['rm', '-f', configFile], { superuser: 'require' });
            } catch (rmError) {
                NetworkLogger.warning(`VlanManager: Could not remove ${configFile}:`, rmError);
            }
        }
        
        // Skip individual netplan try test - will be handled by NetworkConfigUtils.applyNetplanWithConfirmation
        NetworkLogger.info('Configuration files deleted, will test during application...');
        
        // Clean up any remaining gateway conflicts and deprecated configs before applying
        NetworkLogger.info('Cleaning up gateway conflicts and deprecated configs before VLAN deletion...');
        try {
            await checkForGatewayConflicts();
            await cleanupConflictingRoutes();
        } catch (cleanupError) {
            NetworkLogger.warning('Cleanup failed during VLAN deletion:', cleanupError);
            // Continue with netplan apply even if cleanup fails
        }
        
        // Apply netplan to ensure configuration is clean
        NetworkLogger.info('Testing VLAN deletion configuration...');
        try {
            await NetworkConfigUtils.applyNetplanWithConfirmation(60); // 1-minute timeout for deletion
            NetworkLogger.info('VLAN deletion configuration confirmed and applied successfully');
        } catch (applyError) {
            NetworkLogger.error('Netplan confirmation failed:', applyError);
            
            // Check if this is the same bond configuration issue
            if (applyError.message && applyError.message.includes('unknown bond mode')) {
                NetworkLogger.warning('Bond configuration error detected during confirmation. VLAN files were deleted but bond error prevents full network reload.');
                
                if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                    NetworkManager.showToast('warning', 'VLAN configuration files deleted but bond error prevents full network reload. Please fix bond configuration.');
                }
            } else {
                throw applyError;
            }
        }
        
        NetworkLogger.info(`VlanManager: VLAN ${vlan.id} deleted successfully`);
        
        // Show success and reload VLANs
        if (typeof NetworkManager !== 'undefined' && NetworkManager.showSuccess) {
            NetworkManager.showSuccess(`VLAN ${vlan.id} deleted successfully`);
        }
        
        // Wait a moment for system to fully process the deletion before reloading
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Reload VLANs to update the display
        this.loadVlans();
        
        return { success: true };
        
    } catch (error) {
        NetworkLogger.error('Error deleting VLAN:', error);
        
        if (typeof NetworkManager !== 'undefined' && NetworkManager.showError) {
            NetworkManager.showError(`Failed to delete VLAN: ${error.message || error}`);
        }
        
        throw error;
    }
};

// Keep the original deleteVlan function for backward compatibility
function deleteVlanOriginal(vlanId) {
    if (confirm(`Are you sure you want to delete VLAN ${vlanId}? This action cannot be undone.`)) {
        NetworkLogger.info(`VlanManager: Deleting VLAN ${vlanId}...`);
        
        if (!cockpit || !cockpit.spawn) {
            NetworkManager.showError('Cockpit API not available');
            return;
        }
        
        const vlan = VlanManager.vlans.find(v => v.id === vlanId);
        if (!vlan) {
            NetworkManager.showError(`VLAN ${vlanId} not found`);
            return;
        }
        
        // Try to find all possible config files for this VLAN
        let configPaths = [
            `/etc/netplan/90-xavs-vlan${vlanId}.yaml`, // Old default naming
            `/etc/netplan/92-xavs-vlan${vlanId}.yaml`, // VLAN on bridge naming
            `/etc/netplan/95-xavs-vlan${vlanId}.yaml`, // VLAN on bond naming
        ];
        
        // Add interface-specific paths if we know the parent
        if (vlan.parentInterface) {
            configPaths.push(
                `/etc/netplan/90-xavs-${vlan.parentInterface}-vlan${vlanId}.yaml`,
                `/etc/netplan/92-xavs-${vlan.parentInterface}-vlan${vlanId}.yaml`,
                `/etc/netplan/95-xavs-${vlan.parentInterface}-vlan${vlanId}.yaml`
            );
        }
        
        // Add custom name paths
        configPaths.push(
            `/etc/netplan/90-xavs-${vlan.name}.yaml`,
            `/etc/netplan/92-xavs-${vlan.name}.yaml`,
            `/etc/netplan/95-xavs-${vlan.name}.yaml`
        );
        
        // First bring down the interface
        cockpit.spawn(['ip', 'link', 'set', vlan.name, 'down'], { superuser: 'try' })
            .then(() => {
                // Delete the VLAN interface
                return cockpit.spawn(['ip', 'link', 'delete', vlan.name], { superuser: 'try' });
            })
            .then(() => {
                // Remove all possible Netplan configuration files
                const removePromises = configPaths.map(path => 
                    cockpit.spawn(['rm', '-f', path], { superuser: 'try' })
                        .catch(error => NetworkLogger.warning(`Could not remove ${path}:`, error))
                );
                return Promise.all(removePromises);
            })
            .then(() => {
                // Test netplan configuration with user confirmation
                return NetworkConfigUtils.applyNetplanWithConfirmation(60); // 1-minute timeout for deletion
            })
            .then(() => {
                NetworkManager.showSuccess(`VLAN ${vlanId} deleted successfully`);
                VlanManager.loadVlans();
            })
            .catch((error) => {
                NetworkLogger.error('Error deleting VLAN:', error);
                NetworkManager.showError(`Failed to delete VLAN: ${error.message || error}`);
            });
    }
}

function refreshVlans() {
    VlanManager.loadVlans();
}

// Function to manually clean up conflicting configurations
function displayVlanError(modal, error, operation = 'VLAN operation') {
    NetworkLogger.error(`VlanManager: Error in ${operation}:`, error);
    
    let errorMessage = error.message || error.toString() || 'Unknown error occurred';
    
    // Add more context for common errors
    if (errorMessage.includes('this.getExistingVlansOnParent is not a function')) {
        errorMessage = 'Internal error: VLAN manager function not properly initialized. Please refresh the page and try again.';
    } else if (errorMessage.includes('Cockpit API not available')) {
        errorMessage = 'System API not available. Please ensure you are connected to the system properly.';
    } else if (errorMessage.includes('already exists')) {
        errorMessage = `VLAN configuration conflict: ${errorMessage}`;
    } else if (errorMessage.includes('not found')) {
        errorMessage = `VLAN not found: ${errorMessage}`;
    } else if (errorMessage.includes('Permission denied')) {
        errorMessage = 'Permission denied. Please ensure you have administrator privileges.';
    }
    
    // Try modal error first, then fallback to main notification
    if (typeof showModalError === 'function' && modal) {
        showModalError(modal, `Failed to ${operation.toLowerCase()}: ${errorMessage}`);
    } else if (typeof NetworkManager !== 'undefined' && NetworkManager.showError) {
        NetworkManager.showError(`Failed to ${operation.toLowerCase()}: ${errorMessage}`);
    } else {
        // Last resort - alert
        alert(`Error: Failed to ${operation.toLowerCase()}: ${errorMessage}`);
    }
}

// Update the main NetworkManager to use VlanManager
NetworkManager.loadVlans = function() {
    VlanManager.loadVlans();
};

// Emergency cleanup function for corrupted VLAN configurations
function populateEditIpAddresses(ipAddresses) {
    NetworkLogger.info(`VlanManager: populateEditIpAddresses called with:`, ipAddresses);
    const container = document.getElementById('edit-ip-addresses-container');
    
    if (!container) {
        NetworkLogger.error('VlanManager: edit-ip-addresses-container not found!');
        NetworkLogger.error('VlanManager: Available elements with id:', document.querySelectorAll('[id*="ip"]'));
        return;
    }
    
    NetworkLogger.info('VlanManager: Container found:', container);
    NetworkLogger.info('VlanManager: Container innerHTML before clear:', container.innerHTML);
    
    // Clear existing entries
    container.innerHTML = '';
    window.editIpAddressCounter = 0;
    
    // Ensure we have at least one entry
    if (!ipAddresses || ipAddresses.length === 0) {
        ipAddresses = [''];
        NetworkLogger.info(`VlanManager: No IP addresses provided, using empty array:`, ipAddresses);
    }
    
    NetworkLogger.info(`VlanManager: Processing ${ipAddresses.length} IP addresses for edit form`);
    
    // Create all entries using a consistent approach
    ipAddresses.forEach((ip, index) => {
        NetworkLogger.info(`VlanManager: Adding IP address ${index}: '${ip}'`);
        
        const entryHtml = `
            <div class="ip-address-entry" data-index="${index}">
                <div class="ip-entry-row" ${index > 0 ? 'style="margin-top: 8px;"' : ''}>
                    <div>
                        <input type="text" id="edit-vlan-ip-${index}" class="form-control edit-ip-address-input" placeholder="10.100.1.50 (default /24)" data-validate="cidr" value="${ip || ''}">
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger remove-edit-ip-btn" onclick="removeEditIpAddress(${index})" ${index === 0 ? 'style="display: none;"' : ''}>
                        <i class="fas fa-minus"></i>
                    </button>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', entryHtml);
        NetworkLogger.info(`VlanManager: Created IP entry ${index} with value: '${ip}'`);
    });
    
    // Set the counter to the highest index for future additions
    window.editIpAddressCounter = ipAddresses.length - 1;
    
    // Update button visibility
    updateEditRemoveButtonVisibility();
    
    // Log final state
    const finalInputs = container.querySelectorAll('.edit-ip-address-input');
    NetworkLogger.info(`VlanManager: Created ${finalInputs.length} IP input fields`);
    finalInputs.forEach((input, idx) => {
        NetworkLogger.info(`VlanManager: Input ${idx}: value='${input.value}', id='${input.id}'`);
    });
}

function addEditIpAddress() {
    if (!window.editIpAddressCounter) window.editIpAddressCounter = 0;
    window.editIpAddressCounter++;
    
    NetworkLogger.info(`VlanManager: Adding new IP address input field with index ${window.editIpAddressCounter}`);
    
    const container = document.getElementById('edit-ip-addresses-container');
    
    // Log current state before adding
    const existingInputs = container.querySelectorAll('.edit-ip-address-input');
    NetworkLogger.info(`VlanManager: Before adding - existing inputs: ${existingInputs.length}`);
    existingInputs.forEach((input, idx) => {
        NetworkLogger.info(`VlanManager: Existing input ${idx}: id='${input.id}', value='${input.value}'`);
    });
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', window.editIpAddressCounter);
    
    newEntry.innerHTML = `
        <div class="ip-entry-row" style="margin-top: 8px;">
            <div>
                <input type="text" id="edit-vlan-ip-${window.editIpAddressCounter}" class="form-control edit-ip-address-input" placeholder="10.100.1.51 (default /24)" data-validate="cidr">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-edit-ip-btn" onclick="removeEditIpAddress(${window.editIpAddressCounter})">
                <i class="fas fa-minus"></i>
            </button>
        </div>
    `;
    
    container.appendChild(newEntry);
    
    // Update remove button visibility
    updateEditRemoveButtonVisibility();
    
    // Setup live validation for the new input
    const newInput = document.getElementById(`edit-vlan-ip-${window.editIpAddressCounter}`);
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(newInput.closest('form'));
    }
    
    // Log state after adding
    const allInputsAfter = container.querySelectorAll('.edit-ip-address-input');
    NetworkLogger.info(`VlanManager: After adding - total inputs: ${allInputsAfter.length}`);
    allInputsAfter.forEach((input, idx) => {
        NetworkLogger.info(`VlanManager: After adding - Input ${idx}: id='${input.id}', value='${input.value}'`);
    });
    NetworkLogger.info(`VlanManager: Successfully added IP input field: edit-vlan-ip-${window.editIpAddressCounter}`);
}

function removeEditIpAddress(index) {
    const entry = document.querySelector(`#edit-ip-addresses-container [data-index="${index}"]`);
    if (entry) {
        entry.remove();
        updateEditRemoveButtonVisibility();
    }
}

function updateEditRemoveButtonVisibility() {
    const entries = document.querySelectorAll('#edit-ip-addresses-container .ip-address-entry');
    entries.forEach((entry, idx) => {
        const removeBtn = entry.querySelector('.remove-edit-ip-btn');
        if (removeBtn) {
            // Always hide the remove button for the first entry (index 0) and only show for additional entries when there are multiple
            const entryIndex = parseInt(entry.getAttribute('data-index') || '0');
            if (entryIndex === 0) {
                removeBtn.style.display = 'none';
            } else {
                removeBtn.style.display = entries.length > 1 ? 'block' : 'none';
            }
        }
    });
}

// Emergency IP collection - collects all text inputs from edit container
function emergencyCollectAllIps() {
    const container = document.getElementById('edit-ip-addresses-container');
    if (!container) {
        return [];
    }
    
    const textInputs = container.querySelectorAll('input[type="text"]');
    const allIpAddresses = [];
    
    // Collect from ALL text inputs
    textInputs.forEach((input) => {
        const value = input.value.trim();
        if (value) {
            const normalizedIp = normalizeIpWithCidr ? normalizeIpWithCidr(value) : value;
            allIpAddresses.push(normalizedIp);
        }
    });
    
    return allIpAddresses;
}

function collectEditIpAddresses() {
    const container = document.getElementById('edit-ip-addresses-container');
    if (!container) {
        return [];
    }
    
    // Use the working approach: collect ALL text inputs in the container
    const textInputs = container.querySelectorAll('input[type="text"]');
    const allIpAddresses = [];
    
    NetworkLogger.info(`VlanManager: collectEditIpAddresses - Found ${textInputs.length} IP input fields in edit container`);
    
    textInputs.forEach((input, index) => {
        const value = input.value.trim();
        
        NetworkLogger.info(`VlanManager: Input ${index} (id: ${input.id}): value='${value}', visible=${input.offsetParent !== null}`);
        
        if (value) {
            const normalizedIp = normalizeIpWithCidr(value);
            allIpAddresses.push(normalizedIp);
            NetworkLogger.info(`VlanManager: Added IP address: '${value}' -> '${normalizedIp}'`);
        } else {
            NetworkLogger.info(`VlanManager: Skipped empty IP input ${index}`);
        }
    });
    
    NetworkLogger.info(`VlanManager: collectEditIpAddresses - Final collected IPs:`, allIpAddresses);
    return allIpAddresses;
}

// Multiple IP Address Management Functions
let ipAddressCounter = 0;

function addIpAddress() {
    ipAddressCounter++;
    const container = document.getElementById('ip-addresses-container');
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', ipAddressCounter);
    
    newEntry.innerHTML = `
        <div class="ip-entry-row" style="margin-top: 8px;">
            <div>
                <input type="text" id="vlan-ip-${ipAddressCounter}" class="form-control ip-address-input" placeholder="10.100.1.51 (default /24)" data-validate="cidr">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger remove-ip-btn" onclick="removeIpAddress(${ipAddressCounter})">
                <i class="fas fa-minus"></i>
            </button>
        </div>
    `;
    
    container.appendChild(newEntry);
    
    // Update remove button visibility
    updateRemoveButtonVisibility();
    
    // Setup live validation for the new input
    const newInput = document.getElementById(`vlan-ip-${ipAddressCounter}`);
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(newInput.closest('form'));
    }
}

function removeIpAddress(index) {
    const entry = document.querySelector(`[data-index="${index}"]`);
    if (entry) {
        entry.remove();
        updateRemoveButtonVisibility();
    }
}

function updateRemoveButtonVisibility() {
    const entries = document.querySelectorAll('.ip-address-entry');
    entries.forEach((entry, idx) => {
        const removeBtn = entry.querySelector('.remove-ip-btn');
        if (removeBtn) {
            removeBtn.style.display = entries.length > 1 ? 'block' : 'none';
        }
    });
}

function collectIpAddresses() {
    const ipInputs = document.querySelectorAll('.ip-address-input');
    const ipAddresses = [];
    
    ipInputs.forEach(input => {
        if (input.value.trim()) {
            // Normalize IP address with default /24 CIDR if not provided
            const normalizedIp = normalizeIpWithCidr(input.value.trim());
            ipAddresses.push(normalizedIp);
        }
    });
    
    return ipAddresses;
}

function populateIpAddresses(ipAddresses) {
    const container = document.getElementById('ip-addresses-container');
    
    // Clear existing entries
    container.innerHTML = '';
    ipAddressCounter = 0;
    
    // Add entries for each IP address
    ipAddresses.forEach((ip, index) => {
        if (index === 0) {
            // First entry
            container.innerHTML = `
                <div class="ip-address-entry" data-index="0">
                    <div style="display: flex; gap: 8px; align-items: flex-end;">
                        <div style="flex: 1;">
                            <input type="text" id="vlan-ip-0" class="form-control ip-address-input" placeholder="10.100.1.50/24" data-validate="cidr" value="${ip}">
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger remove-ip-btn" onclick="removeIpAddress(0)" style="display: none;">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Additional entries
            addIpAddress();
            document.getElementById(`vlan-ip-${ipAddressCounter}`).value = ip;
        }
    });
    
    updateRemoveButtonVisibility();
}

function normalizeIpWithCidr(ipAddress) {
    if (!ipAddress || !ipAddress.trim()) {
        return '';
    }
    
    const ip = ipAddress.trim();
    
    // If it already has CIDR notation, return as is
    if (ip.includes('/')) {
        return ip;
    }
    
    // If it's just an IP address, add /24 as default
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
        return `${ip}/24`;
    }
    
    // Return as is if it doesn't match IP pattern
    return ip;
}

// Wrapper function to handle async editVlan calls with refresh
async function handleEditVlan(vlanIdentifier) {
    try {
        // Force refresh the specific VLAN data before editing
        NetworkLogger.info(`Refreshing VLAN data before editing: ${vlanIdentifier}`);
        
        // Find the VLAN to refresh
        let vlanToRefresh = VlanManager.vlans.find(v => v.name === vlanIdentifier);
        if (!vlanToRefresh) {
            vlanToRefresh = VlanManager.vlans.find(v => v.id == vlanIdentifier);
        }
        
        if (vlanToRefresh) {
            // Get fresh system data for this VLAN
            const ipOutput = await cockpit.spawn(['ip', 'a'], { superuser: 'try' });
            const freshDetails = await VlanManager.getVlanDetailsFromSystem(vlanToRefresh.name, ipOutput);
            
            // Update the VLAN object with fresh data
            const vlanIndex = VlanManager.vlans.findIndex(v => v.name === vlanToRefresh.name);
            if (vlanIndex !== -1) {
                VlanManager.vlans[vlanIndex] = {
                    ...VlanManager.vlans[vlanIndex],
                    ipAddresses: freshDetails.ipAddresses || [],
                    ip: freshDetails.ip || VlanManager.vlans[vlanIndex].ip,
                    gateway: freshDetails.gateway || VlanManager.vlans[vlanIndex].gateway,
                    dns: freshDetails.dns || VlanManager.vlans[vlanIndex].dns,
                    status: freshDetails.status || VlanManager.vlans[vlanIndex].status
                };
                NetworkLogger.info(`Refreshed VLAN data for ${vlanToRefresh.name}:`, VlanManager.vlans[vlanIndex]);
            }
        }
        
        await editVlan(vlanIdentifier);
    } catch (error) {
        NetworkLogger.error('Error editing VLAN:', error);
        NetworkManager.showError('Error loading VLAN edit form: ' + (error.message || error));
    }
}

// Make function globally accessible
window.handleEditVlan = handleEditVlan;
window.addVlan = addVlan;
window.addEditIpAddress = addEditIpAddress;
window.removeEditIpAddress = removeEditIpAddress;
window.updateEditRemoveButtonVisibility = updateEditRemoveButtonVisibility;
window.collectEditIpAddresses = collectEditIpAddresses;
window.addIpAddress = addIpAddress;
window.removeIpAddress = removeIpAddress;
window.updateRemoveButtonVisibility = updateRemoveButtonVisibility;
window.collectIpAddresses = collectIpAddresses;

// Helper function to apply netplan configuration safely with user confirmation
async function applyNetplanWithConfirmation(timeout = 120) {
    NetworkLogger.info('Testing Netplan configuration with automatic revert protection...');
    
    return new Promise(async (resolve, reject) => {
        try {
            // Show informational modal about what's happening
            showNetplanAutoRevertInfo(timeout);
            
            // Use netplan try with automatic revert - this is the safest approach
            NetworkLogger.info(`Running netplan try with ${timeout}s automatic revert timeout...`);
            
            // Run netplan try without PTY - let it handle the timeout automatically
            const tryProcess = cockpit.spawn(['netplan', 'try', '--timeout', timeout.toString()], { 
                superuser: 'try'
            });
            
            // Set up timeout handler for our modal
            const modalTimeoutId = setTimeout(() => {
                NetworkLogger.info('Modal timeout reached - netplan try will auto-revert');
                NetworkManager.closeModal();
                reject(new Error('Configuration test timed out and was automatically reverted for safety'));
            }, (timeout + 5) * 1000); // Give 5 extra seconds after netplan timeout
            
            tryProcess.done(() => {
                clearTimeout(modalTimeoutId);
                NetworkLogger.info('Netplan try completed successfully - configuration accepted');
                
                // Close info modal
                NetworkManager.closeModal();
                
                // Configuration was accepted, now ask if user wants to make it permanent
                setTimeout(() => showNetplanApplyConfirmation(resolve, reject), 500);
            });
            
            tryProcess.fail((error) => {
                clearTimeout(modalTimeoutId);
                NetworkLogger.error('Netplan try failed or timed out:', error);
                
                // Close info modal
                NetworkManager.closeModal();
                
                // Check if it was a timeout (configuration reverted) or real error
                if (error.exit_status === 130 || (error.message && error.message.includes('timeout')) || (error.message && error.message.includes('cancelled'))) {
                    // This was a timeout - configuration was automatically reverted
                    setTimeout(() => showNetplanTimeoutRevertModal(reject), 500);
                } else {
                    // This was a real error
                    setTimeout(() => showNetplanErrorModal(error, reject), 500);
                }
            });
            
        } catch (error) {
            NetworkLogger.error('Error starting netplan try:', error);
            
            // Close progress modal if open
            if (document.querySelector('.modal')) {
                NetworkManager.closeModal();
            }
            
            reject(error);
        }
    });
}

// Show information modal about netplan try with auto-revert
function showNetplanAutoRevertInfo(timeout) {
    const modalContent = `
        <div class="netplan-auto-revert-content">
            <div class="alert alert-info">
                <i class="fas fa-shield-alt"></i>
                <strong>Safe Network Configuration Test</strong>
            </div>
            
            <p>The system is testing your network configuration with <strong>automatic safety protection</strong>.</p>
            
            <div class="safety-info">
                <div class="safety-step">
                    <i class="fas fa-play-circle text-primary"></i>
                    <div class="step-content">
                        <strong>Testing in Progress</strong>
                        <p>The new configuration is being applied temporarily for testing</p>
                    </div>
                </div>
                <div class="safety-step active">
                    <i class="fas fa-shield-alt text-success"></i>
                    <div class="step-content">
                        <strong>Automatic Safety Revert</strong>
                        <p>If network connectivity is lost, the configuration will automatically revert in ${timeout} seconds</p>
                    </div>
                </div>
                <div class="safety-step">
                    <i class="fas fa-check-circle text-info"></i>
                    <div class="step-content">
                        <strong>Manual Confirmation</strong>
                        <p>If connectivity is maintained, you'll be prompted to make changes permanent</p>
                    </div>
                </div>
            </div>
            
            <div class="connection-status">
                <div class="status-item">
                    <i class="fas fa-wifi text-success"></i>
                    <strong>Connection Test:</strong> If you can see this message, your connection is working
                </div>
                <div class="status-item">
                    <i class="fas fa-clock text-warning"></i>
                    <strong>Timeout Protection:</strong> Configuration will auto-revert if no response in ${timeout} seconds
                </div>
                <div class="status-item">
                    <i class="fas fa-undo text-info"></i>
                    <strong>No Risk:</strong> Your original configuration will be restored automatically if needed
                </div>
            </div>
            
            <div class="waiting-indicator">
                <div class="spinner-border text-primary" role="status">
                    <span class="sr-only">Testing configuration...</span>
                </div>
                <p><strong>Please wait while the configuration is tested...</strong></p>
                <p class="text-muted">This window will update automatically when testing is complete.</p>
            </div>
        </div>
        
        <style>
            .netplan-auto-revert-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; }
            .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
            .safety-info { margin: 20px 0; }
            .safety-step { display: flex; align-items: flex-start; gap: 12px; margin: 16px 0; padding: 12px; border-radius: 6px; background: #f8f9fa; }
            .safety-step.active { background: #e7f3ff; border: 1px solid #b8daff; }
            .safety-step i { font-size: 16px; margin-top: 2px; }
            .step-content strong { display: block; margin-bottom: 4px; color: #333; }
            .step-content p { margin: 0; color: #666; font-size: 14px; }
            .connection-status { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 20px 0; }
            .status-item { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
            .status-item i { font-size: 14px; }
            .text-primary { color: #007bff !important; }
            .text-success { color: #28a745 !important; }
            .text-warning { color: #ffc107 !important; }
            .text-info { color: #17a2b8 !important; }
            .text-muted { color: #6c757d !important; }
            .waiting-indicator { text-align: center; margin: 20px 0; }
            .spinner-border { width: 2rem; height: 2rem; margin-bottom: 12px; }
            .spinner-border { border: 0.25em solid rgba(0, 123, 255, 0.25); border-right-color: #007bff; border-radius: 50%; animation: spinner-border 0.75s linear infinite; }
            @keyframes spinner-border { to { transform: rotate(360deg); } }
        </style>
    `;
    
    // No footer buttons - this is an informational modal
    const modalFooter = ``;
    
    // Create modal without close option
    NetworkManager.createModal('Network Configuration Safety Test', modalContent, modalFooter, { 
        allowClose: false 
    });
}

// Show modal when netplan try times out and reverts automatically
function showNetplanTimeoutRevertModal(reject) {
    const modalContent = `
        <div class="netplan-timeout-revert-content">
            <div class="alert alert-success">
                <i class="fas fa-shield-alt"></i>
                <strong>Configuration Automatically Reverted</strong>
            </div>
            
            <p>The network configuration test timed out, and <strong>your original configuration has been automatically restored</strong> to prevent network lockout.</p>
            
            <div class="revert-info">
                <div class="info-item success">
                    <i class="fas fa-check-circle text-success"></i>
                    <strong>Safety Protection Activated:</strong> The automatic revert feature prevented potential network isolation.
                </div>
                <div class="info-item">
                    <i class="fas fa-undo text-info"></i>
                    <strong>Configuration Restored:</strong> Your network settings have been returned to their previous working state.
                </div>
                <div class="info-item">
                    <i class="fas fa-network-wired text-primary"></i>
                    <strong>Connectivity Preserved:</strong> Your network connection should now be fully restored.
                </div>
            </div>
            
            <div class="what-happened">
                <h4>What happened?</h4>
                <p>The new network configuration may have caused connectivity issues or conflicts. Common causes include:</p>
                <ul>
                    <li>IP address conflicts with existing network infrastructure</li>
                    <li>Incorrect gateway or routing configuration</li>
                    <li>VLAN configuration incompatible with network switch settings</li>
                    <li>Parent interface or dependency issues</li>
                </ul>
            </div>
            
            <div class="next-steps">
                <h4>Recommended next steps:</h4>
                <ul>
                    <li>Review the VLAN configuration for conflicts or errors</li>
                    <li>Verify the parent interface is properly configured</li>
                    <li>Check network switch VLAN settings if applicable</li>
                    <li>Consider testing with different IP addresses or VLAN settings</li>
                </ul>
            </div>
        </div>
        
        <style>
            .netplan-timeout-revert-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .revert-info { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 16px 0; }
            .info-item { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
            .info-item i { font-size: 14px; }
            .what-happened, .next-steps { background: #fff3cd; padding: 12px; border-radius: 6px; margin: 16px 0; border-left: 4px solid #ffc107; }
            .what-happened h4, .next-steps h4 { margin-top: 0; color: #856404; }
            ul { margin-bottom: 0; }
            .text-success { color: #28a745 !important; }
            .text-info { color: #17a2b8 !important; }
            .text-primary { color: #007bff !important; }
        </style>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal();">Close</button>
    `;
    
    // Create modal
    NetworkManager.createModal('Network Configuration Auto-Reverted', modalContent, modalFooter);
    
    setTimeout(() => {
        reject(new Error('Network configuration test timed out and was automatically reverted for safety'));
    }, 100);
}

// Show progress modal while netplan try is running
function showNetplanTestingProgress(timeout) {
    const modalContent = `
        <div class="netplan-testing-content">
            <div class="alert alert-info">
                <i class="fas fa-cog fa-spin"></i>
                <strong>Testing Network Configuration</strong>
            </div>
            
            <p>The system is currently testing your network configuration. <strong>Please wait while the test completes.</strong></p>
            
            <div class="test-progress">
                <div class="progress-step active">
                    <i class="fas fa-file-alt"></i>
                    <div class="step-content">
                        <strong>Validating Configuration</strong>
                        <p>Checking Netplan YAML syntax and structure</p>
                    </div>
                </div>
                <div class="progress-step active">
                    <i class="fas fa-network-wired fa-pulse"></i>
                    <div class="step-content">
                        <strong>Testing Network Connectivity</strong>
                        <p>Applying configuration temporarily and checking network status</p>
                    </div>
                </div>
                <div class="progress-step">
                    <i class="fas fa-check-circle"></i>
                    <div class="step-content">
                        <strong>Verification Complete</strong>
                        <p>Configuration will be evaluated for permanent application</p>
                    </div>
                </div>
            </div>
            
            <div class="test-info">
                <div class="info-item">
                    <i class="fas fa-info-circle text-info"></i>
                    <strong>Safety Feature:</strong> This test will automatically revert if any issues are detected.
                </div>
                <div class="info-item">
                    <i class="fas fa-clock text-warning"></i>
                    <strong>Timeout:</strong> Test will complete within ${timeout} seconds maximum.
                </div>
                <div class="info-item">
                    <i class="fas fa-shield-alt text-success"></i>
                    <strong>No Risk:</strong> Your current network configuration is preserved during testing.
                </div>
            </div>
            
            <div class="loading-indicator">
                <div class="spinner-border" role="status">
                    <span class="sr-only">Testing in progress...</span>
                </div>
                <p><strong>Running netplan try...</strong></p>
            </div>
        </div>
        
        <style>
            .netplan-testing-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; }
            .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
            .test-progress { margin: 20px 0; }
            .progress-step { display: flex; align-items: flex-start; gap: 12px; margin: 16px 0; padding: 12px; border-radius: 6px; transition: all 0.3s ease; }
            .progress-step.active { background: #e7f3ff; border: 1px solid #b8daff; }
            .progress-step:not(.active) { background: #f8f9fa; opacity: 0.6; }
            .progress-step i { font-size: 16px; margin-top: 2px; color: #007bff; }
            .step-content strong { display: block; margin-bottom: 4px; color: #333; }
            .step-content p { margin: 0; color: #666; font-size: 14px; }
            .test-info { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 20px 0; }
            .info-item { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
            .info-item i { font-size: 14px; }
            .text-info { color: #17a2b8 !important; }
            .text-warning { color: #ffc107 !important; }
            .text-success { color: #28a745 !important; }
            .loading-indicator { text-align: center; margin: 20px 0; }
            .spinner-border { width: 2rem; height: 2rem; margin-bottom: 12px; }
            .spinner-border { border: 0.25em solid rgba(0, 123, 255, 0.25); border-right-color: #007bff; border-radius: 50%; animation: spinner-border 0.75s linear infinite; }
            @keyframes spinner-border { to { transform: rotate(360deg); } }
            .fa-pulse { animation: fa-pulse 1s infinite linear; }
            @keyframes fa-pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
        </style>
    `;
    
    // No footer buttons - this is a progress modal
    const modalFooter = ``;
    
    // Create modal without close option (user should wait for test to complete)
    NetworkManager.createModal('Network Configuration Test', modalContent, modalFooter, { 
        allowClose: false 
    });
}

// Restore critical system routes after netplan operations
async function restoreSystemRoutes() {
    if (!window.preservedSystemRoutes || window.preservedSystemRoutes.length === 0) {
        NetworkLogger.info('No preserved system routes to restore');
        return;
    }
    
    try {
        NetworkLogger.info('Restoring critical system routes...');
        
        // Get current routes to see what's missing
        const currentRoutesOutput = await cockpit.spawn(['ip', 'route', 'show'], { superuser: 'try' });
        const currentRoutes = currentRoutesOutput.trim().split('\n').filter(line => line.trim());
        
        // Find routes that need to be restored
        const routesToRestore = window.preservedSystemRoutes.filter(route => {
            // Focus on critical routes: default routes and static routes
            if (route.includes('default via') || (route.includes('via') && !route.includes('proto kernel'))) {
                // Check if this route is missing from current routes
                return !currentRoutes.some(currentRoute => 
                    currentRoute.trim() === route.trim() || 
                    currentRoute.includes(route.split(' ')[0]) // Check destination
                );
            }
            return false;
        });
        
        NetworkLogger.info('Routes to restore:', routesToRestore);
        
        // Restore missing critical routes
        for (const route of routesToRestore) {
            if (!route.trim()) continue;
            
            try {
                NetworkLogger.info('Attempting to restore route:', route);
                
                // Parse route components
                const parts = route.trim().split(/\s+/);
                const routeCmd = ['ip', 'route', 'add'];
                
                // Build route command from parts
                let i = 0;
                while (i < parts.length) {
                    const part = parts[i];
                    
                    if (part === 'default') {
                        routeCmd.push('default');
                    } else if (part === 'via') {
                        routeCmd.push('via', parts[i + 1]);
                        i++; // skip next part as it's the gateway
                    } else if (part === 'dev') {
                        routeCmd.push('dev', parts[i + 1]);
                        i++; // skip next part as it's the device
                    } else if (part === 'proto') {
                        routeCmd.push('proto', parts[i + 1]);
                        i++; // skip next part as it's the protocol
                    } else if (part.includes('/') || /^\d+\.\d+\.\d+\.\d+$/.test(part)) {
                        // This is a destination
                        if (routeCmd.length === 3) { // Only add if it's the first destination
                            routeCmd.push(part);
                        }
                    }
                    i++;
                }
                
                // Only execute if we have a valid route command
                if (routeCmd.length > 3) {
                    NetworkLogger.info('Executing route restore command:', routeCmd);
                    await cockpit.spawn(routeCmd, { superuser: 'try' });
                    NetworkLogger.info('Successfully restored route:', route);
                } else {
                    NetworkLogger.warning('Could not parse route for restoration:', route);
                }
                
            } catch (routeError) {
                NetworkLogger.warning('Could not restore route:', route, routeError);
                // Continue with other routes - don't fail the entire operation
            }
        }
        
        // Clean up the preserved routes
        window.preservedSystemRoutes = null;
        NetworkLogger.info('System route restoration completed');
        
    } catch (error) {
        NetworkLogger.error('Failed to restore system routes:', error);
        throw error;
    }
}

// Show confirmation dialog after successful netplan try
function showNetplanApplyConfirmation(resolve, reject) {
    const modalContent = `
        <div class="netplan-confirmation-content">
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                <strong>Configuration Test Successful</strong>
            </div>
            
            <p>The network configuration has been tested successfully! <strong>Your network connection is working properly with the new configuration.</strong></p>
            
            <div class="test-results">
                <div class="test-result success">
                    <i class="fas fa-check text-success"></i>
                    <strong>Configuration Valid:</strong> The new network configuration is syntactically correct and compatible.
                </div>
                <div class="test-result success">
                    <i class="fas fa-check text-success"></i>
                    <strong>Network Connectivity:</strong> You can still access this interface, indicating network connectivity is maintained.
                </div>
                <div class="test-result success">
                    <i class="fas fa-check text-success"></i>
                    <strong>Interface Status:</strong> The VLAN interface has been created and configured successfully.
                </div>
            </div>
            
            <div class="apply-options">
                <h4>Do you want to make these changes permanent?</h4>
                <p>You can choose to:</p>
                <ul>
                    <li><strong>Apply Permanently:</strong> Run <code>netplan apply</code> to make the configuration persistent across reboots</li>
                    <li><strong>Keep Temporary:</strong> Keep the current working configuration but don't make it permanent (will revert on reboot)</li>
                    <li><strong>Revert Changes:</strong> Undo the configuration changes and return to the previous state</li>
                </ul>
            </div>
        </div>
        
        <style>
            .netplan-confirmation-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; }
            .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .test-results { background: #f8f9fa; padding: 16px; border-radius: 6px; margin: 16px 0; }
            .test-result { margin: 12px 0; padding: 8px 0; }
            .test-result i { margin-right: 8px; }
            .apply-options { background: #e7f3ff; padding: 12px; border-radius: 6px; margin: 16px 0; border: 1px solid #b8daff; }
            .apply-options h4 { margin-top: 0; color: #004085; }
            .apply-options ul { margin-bottom: 0; }
            .text-success { color: #28a745 !important; }
            code { background: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
        </style>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="revertNetplanConfig();">Revert Changes</button>
        <button class="btn btn-outline-primary" onclick="keepTemporaryConfig();">Keep Temporary</button>
        <button class="btn btn-success" onclick="applyNetplanPermanently();">Apply Permanently</button>
    `;
    
    // Global functions for modal buttons
    window.applyNetplanPermanently = async () => {
        try {
            NetworkManager.closeModal();
            NetworkLogger.info('User chose to apply configuration permanently');
            
            // Show progress
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', 'Applying configuration permanently...');
            }
            
            // Run netplan apply
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            NetworkLogger.info('Netplan apply completed successfully');
            
            // Restore critical system routes if they were preserved
            await restoreSystemRoutes();
            
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('success', 'Configuration applied permanently');
            }
            resolve(true);
        } catch (error) {
            NetworkLogger.error('Netplan apply failed:', error);
            NetworkManager.showError(`Failed to apply configuration permanently: ${error.message || error}`);
            reject(error);
        }
    };
    
    window.keepTemporaryConfig = async () => {
        try {
            NetworkManager.closeModal();
            NetworkLogger.info('User chose to keep temporary configuration');
            
            // Restore critical system routes if they were preserved
            await restoreSystemRoutes();
            
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('warning', 'Configuration is temporary - will revert on reboot');
            }
            resolve(true);
        } catch (error) {
            NetworkLogger.error('Failed to restore routes after keeping temporary config:', error);
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('warning', 'Configuration kept but some routes may need manual restoration');
            }
            resolve(true); // Don't fail the operation just for route restoration
        }
    };
    
    window.revertNetplanConfig = async () => {
        try {
            NetworkManager.closeModal();
            NetworkLogger.info('User chose to revert configuration');
            
            // Show progress
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', 'Reverting configuration...');
            }
            
            // Reload previous configuration
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            NetworkLogger.info('Configuration reverted successfully');
            if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                NetworkManager.showToast('info', 'Configuration reverted to previous state');
            }
            reject(new Error('User chose to revert configuration'));
        } catch (error) {
            NetworkLogger.error('Failed to revert configuration:', error);
            NetworkManager.showError(`Failed to revert configuration: ${error.message || error}`);
            reject(error);
        }
    };
    
    // Create modal
    NetworkManager.createModal('Apply Network Configuration', modalContent, modalFooter);
}

// Show error modal when netplan try fails
function showNetplanErrorModal(error, reject) {
    const modalContent = `
        <div class="netplan-error-content">
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Configuration Test Failed</strong>
            </div>
            
            <p>The network configuration test failed. <strong>This indicates there may be issues with the configuration that could cause network problems.</strong></p>
            
            <div class="error-details">
                <h4>Error Details:</h4>
                <div class="error-message">
                    <code>${error.message || error}</code>
                </div>
            </div>
            
            <div class="error-implications">
                <h4>What this means:</h4>
                <ul>
                    <li>The configuration has syntax errors or conflicts</li>
                    <li>Applying this configuration could break network connectivity</li>
                    <li>The system has prevented applying the problematic configuration</li>
                </ul>
            </div>
            
            <div class="recommendations">
                <h4>Recommendations:</h4>
                <ul>
                    <li>Review the VLAN configuration for errors</li>
                    <li>Check for IP address conflicts or invalid settings</li>
                    <li>Verify parent interface exists and is properly configured</li>
                    <li>Consult the system logs for more detailed error information</li>
                </ul>
            </div>
        </div>
        
        <style>
            .netplan-error-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert-danger { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            .error-details, .error-implications, .recommendations { background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 16px 0; }
            .error-message { background: #fff; padding: 8px; border-radius: 4px; margin-top: 8px; }
            .error-message code { background: transparent; color: #d63384; font-family: monospace; }
            h4 { margin-top: 0; color: #495057; }
            ul { margin-bottom: 0; }
        </style>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal();">Close</button>
    `;
    
    // Create modal
    NetworkManager.createModal('Configuration Test Failed', modalContent, modalFooter);
    
    setTimeout(() => {
        reject(error);
    }, 100);
}

// Show timeout modal when netplan try hangs
function showNetplanTimeoutModal(reject) {
    const modalContent = `
        <div class="netplan-timeout-content">
            <div class="alert alert-warning">
                <i class="fas fa-clock"></i>
                <strong>Configuration Test Timed Out</strong>
            </div>
            
            <p>The network configuration test did not complete within the expected time. <strong>This may indicate network connectivity issues.</strong></p>
            
            <div class="timeout-implications">
                <h4>Possible causes:</h4>
                <ul>
                    <li>The new configuration may have disrupted network connectivity</li>
                    <li>There may be conflicts with existing network settings</li>
                    <li>The system may be experiencing high load or other issues</li>
                </ul>
            </div>
            
            <div class="safety-note">
                <h4>Safety measures:</h4>
                <p>The configuration has been automatically reverted to prevent network lockout. Your original network configuration should be restored.</p>
            </div>
        </div>
        
        <style>
            .netplan-timeout-content { font-family: system-ui, -apple-system, sans-serif; }
            .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
            .timeout-implications, .safety-note { background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 16px 0; }
            h4 { margin-top: 0; color: #495057; }
            ul { margin-bottom: 0; }
        </style>
    `;
    
    const modalFooter = `
        <button class="btn btn-outline-secondary" onclick="NetworkManager.closeModal();">Close</button>
    `;
    
    // Create modal
    NetworkManager.createModal('Configuration Test Timeout', modalContent, modalFooter);
    
    setTimeout(() => {
        reject(new Error('Configuration test timed out'));
    }, 100);
}

// Export VlanManager globally so NetworkManager can access it
window.VlanManager = VlanManager;
