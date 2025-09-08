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
            const corruptedFiles = [];
            const interfaceDefinitions = new Map();
            
            // Scan all XAVS files for interface definitions and corrupted configurations
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content) {
                        // Check for corrupted VLAN configurations
                        if (content.includes('link: null') || content.includes('link: ""') || content.includes('link:null')) {
                            console.log(`VlanManager: Found corrupted VLAN configuration with null link in ${file} - marking for removal`);
                            corruptedFiles.push(file);
                            continue; // Skip further processing of this corrupted file
                        }
                        
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
            
            // Remove corrupted files first
            for (const file of corruptedFiles) {
                try {
                    console.log(`VlanManager: Removing corrupted VLAN configuration file: ${file}`);
                    await cockpit.spawn(['rm', '-f', file], { superuser: 'require' });
                } catch (removeError) {
                    console.warn(`VlanManager: Could not remove corrupted file ${file}:`, removeError);
                }
            }
            
            // Remove conflicting files
            for (const file of conflictingFiles) {
                try {
                    console.log(`VlanManager: Removing conflicting configuration file: ${file}`);
                    await cockpit.spawn(['rm', '-f', file], { superuser: 'require' });
                } catch (removeError) {
                    console.warn(`VlanManager: Could not remove conflicting file ${file}:`, removeError);
                }
            }
            
            const totalCleaned = corruptedFiles.length + conflictingFiles.length;
            if (totalCleaned > 0) {
                console.log(`VlanManager: Cleaned up ${totalCleaned} problematic configuration files (${corruptedFiles.length} corrupted, ${conflictingFiles.length} conflicting)`);
                
                // If we cleaned up files, test and apply the configuration
                console.log('VlanManager: Testing configuration after cleanup...');
                try {
                    const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
                    console.log('VlanManager: Configuration test after cleanup successful');
                    console.log('--- START NETPLAN DEBUG ---');
                    console.log(debugOutput);
                    console.log('--- END NETPLAN DEBUG ---');
                } catch (tryError) {
                    console.error('VlanManager: Configuration test after cleanup failed:', tryError);
                    
                    if (tryError.message) {
                        console.log('VlanManager: Netplan error output after cleanup:');
                        console.log('--- START NETPLAN ERROR ---');
                        console.log(tryError.message);
                        console.log('--- END NETPLAN ERROR ---');
                    }
                    
                    if (tryError.exit_status === 78) {
                        console.log('VlanManager: Netplan try exited with status 78 (bond revert warning) - proceeding');
                    } else {
                        console.warn('VlanManager: Configuration test failed after cleanup, but continuing...');
                    }
                }
                
                return totalCleaned;
            } else {
                console.log('VlanManager: No problematic configurations found');
                return 0;
            }
            
        } catch (error) {
            console.warn('VlanManager: Error cleaning up conflicting configs:', error);
            return 0;
        }
    },
    
    // Load VLAN configurations
    async loadVlans() {
        if (this.isLoading) {
            console.log('VlanManager: Already loading VLANs, skipping...');
            return;
        }
        
        this.isLoading = true;
        const listElement = document.getElementById('vlan-list');
        if (listElement) {
            listElement.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i>Loading VLANs...</div>';
        }
        
        try {
            // Fix permissions and clean up conflicts on first load
            if (!this.permissionsFixed) {
                await this.fixNetplanPermissions();
                const cleanedCount = await this.cleanupConflictingConfigs();
                if (cleanedCount > 0) {
                    console.log(`VlanManager: Cleaned up ${cleanedCount} conflicting configuration files`);
                }
                this.permissionsFixed = true;
            }
        
            this.vlans = await this.fetchVlans();
            this.renderVlans();
        } catch (error) {
            console.error('VlanManager: Failed to load VLANs:', error);
            if (listElement) {
                listElement.innerHTML = '<div class="error-message"><i class="fas fa-exclamation-triangle"></i>Failed to load VLANs</div>';
            }
        } finally {
            this.isLoading = false;
        }
    },
    
    // Fetch real VLANs from system using Cockpit APIs
    async fetchVlans() {
        console.log('VlanManager: Fetching real VLANs from system interfaces first...');
        
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available');
        }

        const vlans = [];
        
        try {
            // STEP 1: Get real system interfaces from 'ip a' output - this is the source of truth
            const ipOutput = await cockpit.spawn(['ip', 'a'], { superuser: 'try' });
            const lines = ipOutput.split('\n');
            
            console.log('[fetchVlans] Processing ip a output for VLAN interfaces...');
            
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
                                    console.warn(`VlanManager: Could not determine parent for ${interfaceName}:`, vlanInfoError);
                                }
                            }
                        }
                        
                        console.log(`VlanManager: Found system VLAN ${interfaceName} (ID: ${vlanId}, Parent: ${parent})`);
                        
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
                            console.warn(`VlanManager: Could not get details for VLAN ${interfaceName}:`, error);
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
            console.log('[fetchVlans] Checking Netplan files for additional VLAN configurations...');
            const netplanVlans = await this.fetchVlansFromNetplan();
            
            for (const netplanVlan of netplanVlans) {
                // Only add if not already found in system
                const existingVlan = vlans.find(v => 
                    v.name === netplanVlan.name || 
                    (v.id === netplanVlan.id && v.parentInterface === netplanVlan.parentInterface)
                );
                
                if (!existingVlan) {
                    console.log(`VlanManager: Adding Netplan-only VLAN: ${netplanVlan.name}`);
                    netplanVlan.source = 'netplan'; // Mark as config-only
                    netplanVlan.status = 'configured'; // But not active
                    vlans.push(netplanVlan);
                }
            }
            
            console.log(`VlanManager: Found ${vlans.length} total VLANs:`, vlans);
            return vlans;
            
        } catch (error) {
            console.error('VlanManager: Error fetching VLANs:', error);
            return [];
        }
    },

    // Get VLAN details from system (ip a output and other system sources)
    async getVlanDetailsFromSystem(interfaceName, ipOutput) {
        console.log(`[getVlanDetailsFromSystem] Getting details for ${interfaceName}`);
        
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
            const interfaceBlocks = ipOutput.split(/^\d+:/m);
            for (const block of interfaceBlocks) {
                if (block.includes(interfaceName + ':') || block.includes(interfaceName + '@')) {
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
            
            // Try to find associated Netplan config file
            try {
                const configFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml', '-exec', 'grep', '-l', interfaceName, '{}', ';'], { superuser: 'try' });
                if (configFiles.trim()) {
                    const files = configFiles.trim().split('\n');
                    details.configFile = files[0]; // Use first match
                }
            } catch (configError) {
                console.warn(`Could not find config file for ${interfaceName}:`, configError);
            }
            
            // Try to get gateway info (this would require route parsing - simplified for now)
            // details.gateway = await this.getGatewayForInterface(interfaceName);
            
        } catch (error) {
            console.warn(`Error getting system details for ${interfaceName}:`, error);
        }
        
        return details;
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
                                    let parentInterface = 'unknown';
                                    
                                    if (linkMatch && linkMatch[1] && linkMatch[1].trim()) {
                                        parentInterface = linkMatch[1].trim();
                                        console.log(`VlanManager: Found parent interface '${parentInterface}' for VLAN ${vlanName}`);
                                    } else {
                                        console.warn(`VlanManager: No valid parent interface found for VLAN ${vlanName}, searching alternatives...`);
                                        
                                        // Try to extract parent from VLAN name if possible
                                        const nameMatch = vlanName.match(/^(.+)\.(\d+)$/);
                                        if (nameMatch) {
                                            parentInterface = nameMatch[1];
                                            console.log(`VlanManager: Extracted parent '${parentInterface}' from VLAN name '${vlanName}'`);
                                        } else {
                                            // Try to get parent from system
                                            try {
                                                const vlanInfo = await cockpit.spawn(['cat', `/sys/class/net/${vlanName}/vlan/real_dev_name`], { superuser: 'try' });
                                                parentInterface = vlanInfo.trim();
                                                console.log(`VlanManager: Got parent '${parentInterface}' from system for VLAN ${vlanName}`);
                                            } catch (sysError) {
                                                console.warn(`VlanManager: Could not get parent from system for ${vlanName}:`, sysError);
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
                                        console.warn(`VlanManager: Could not get status for ${vlanName}:`, statusError);
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
                                    
                                    console.log(`VlanManager: Parsed VLAN ${vlanName}:`, {
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
                                    
                                    console.log(`VlanManager: Created VLAN object:`, vlanObject);
                                    console.log(`VlanManager: Parent interface for ${vlanName}: '${parentInterface}'`);
                                    
                                    vlans.push(vlanObject);
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
                                console.warn(`Could not get VLAN ID for ${interfaceName}:`, vlanInfoError);
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
                                                    console.log(`Found VLAN ID ${vlanId} for ${interfaceName} in Netplan file ${file}`);
                                                    break;
                                                }
                                            }
                                        } catch (fileError) {
                                            console.warn(`Could not read Netplan file ${file}:`, fileError);
                                        }
                                    }
                                } catch (netplanError) {
                                    console.warn(`Could not search Netplan files for ${interfaceName}:`, netplanError);
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
            console.warn('Error getting existing VLANs on parent:', error);
        }
        
        console.log(`VlanManager: Found ${vlans.length} existing VLANs on parent ${parentInterface}:`, vlans);
        return vlans;
    },
    
    // Get the real parent interface from Netplan configuration
    async getRealParentFromNetplan(vlanName, vlanId) {
        try {
            // Search for config files that might contain this VLAN
            const searchPatterns = [
                `90-xavs-*-vlan${vlanId}.yaml`,
                `90-xavs-vlan${vlanId}.yaml`,
                `90-xavs-*${vlanName}*.yaml`
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
                                console.log(`VlanManager: Found parent '${linkMatch[1]}' in config file ${file}`);
                                return linkMatch[1].trim();
                            }
                        } catch (readError) {
                            console.warn(`VlanManager: Could not read config file ${file}:`, readError);
                        }
                    }
                } catch (findError) {
                    // Pattern not found, continue
                }
            }
            
            return null;
        } catch (error) {
            console.warn('VlanManager: Error getting real parent from Netplan:', error);
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
        
        console.log('VlanManager: Rendering VLANs:', this.vlans);
        this.vlans.forEach(vlan => {
            console.log(`VlanManager: VLAN ${vlan.id} - Parent Interface: '${vlan.parentInterface}'`);
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
                    <button class="btn btn-sm btn-outline-brand" onclick="editVlan('${vlan.name}')">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="toggleVlan('${vlan.name}', '${vlan.status}')">
                        <i class="fas fa-power-off"></i> ${vlan.status === 'up' ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteVlan('${vlan.name}')">
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
                <div class="form-group full-width">
                    <label class="form-label">IP Addresses</label>
                    <div id="ip-addresses-container">
                        <div class="ip-address-entry" data-index="0">
                            <div style="display: flex; gap: 8px; align-items: flex-end;">
                                <div style="flex: 1;">
                                    <input type="text" id="vlan-ip-0" class="form-control ip-address-input" placeholder="10.100.1.50/24" data-validate="cidr">
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
                    <div class="hint">Enter IP addresses in CIDR notation (e.g., 192.168.1.10/24)</div>
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
    
    // Initialize IP address management
    updateRemoveButtonVisibility();
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
                    console.log(`VlanManager: Found bond interface: ${ifaceName}`);
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
                            console.log(`VlanManager: Found bridge interface: ${ifaceName}`);
                            availableInterfaces.push(ifaceName);
                        }
                    } catch (bridgeError) {
                        // If we can't get info, include it anyway
                        console.log(`VlanManager: Including bridge interface (couldn't verify): ${ifaceName}`);
                        availableInterfaces.push(ifaceName);
                    }
                    continue;
                }
                
                // Include any other interfaces that might be valid parents
                // This catches custom named interfaces or other types
                if (!isSystemInterface(ifaceName)) {
                    console.log(`VlanManager: Found other interface: ${ifaceName}`);
                    availableInterfaces.push(ifaceName);
                }
            }
        }
        
        // Additionally, try to get bond and bridge interfaces from our managers
        try {
            // Get bonds from BondManager if available
            if (typeof BondManager !== 'undefined' && BondManager.bonds) {
                BondManager.bonds.forEach(bond => {
                    if (!availableInterfaces.includes(bond.name)) {
                        console.log(`VlanManager: Adding bond from BondManager: ${bond.name}`);
                        availableInterfaces.push(bond.name);
                    }
                });
            }
        } catch (bondError) {
            console.warn('VlanManager: Could not get bonds from BondManager:', bondError);
        }
        
        try {
            // Get bridges from BridgeManager if available
            if (typeof BridgeManager !== 'undefined' && BridgeManager.bridges) {
                BridgeManager.bridges.forEach(bridge => {
                    if (!availableInterfaces.includes(bridge.name)) {
                        console.log(`VlanManager: Adding bridge from BridgeManager: ${bridge.name}`);
                        availableInterfaces.push(bridge.name);
                    }
                });
            }
        } catch (bridgeError) {
            console.warn('VlanManager: Could not get bridges from BridgeManager:', bridgeError);
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

function editVlan(vlanIdentifier) {
    console.log(`VlanManager: Editing VLAN with identifier ${vlanIdentifier}, type: ${typeof vlanIdentifier}`);
    console.log('Available VLANs:', VlanManager.vlans.map(v => ({ id: v.id, name: v.name, parent: v.parentInterface })));
    
    // Try to find VLAN by name first (most reliable), then by ID
    let vlan = VlanManager.vlans.find(v => v.name === vlanIdentifier);
    if (!vlan) {
        // Fallback: try to find by ID (for backward compatibility)
        vlan = VlanManager.vlans.find(v => v.id == vlanIdentifier);
        if (vlan) {
            console.warn(`VlanManager: Found VLAN by ID ${vlanIdentifier}, but this could be ambiguous if multiple VLANs have the same ID`);
        }
    }
    
    if (!vlan) {
        console.error(`VlanManager: VLAN with identifier ${vlanIdentifier} not found`);
        NetworkManager.showError(`VLAN with identifier ${vlanIdentifier} not found`);
        return;
    }
    
    console.log(`VlanManager: Found VLAN for editing:`, vlan);
    
    // Determine IP configuration type
    const ipConfig = vlan.ip === 'DHCP' || vlan.ip === 'Not configured' ? 'dhcp' : 'static';
    const ipAddress = ipConfig === 'static' ? vlan.ip : '';
    const gateway = vlan.gateway && vlan.gateway !== 'Not configured' ? vlan.gateway : '';
    
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
                    <option value="eno1" ${vlan.parentInterface === 'eno1' ? 'selected' : ''}>eno1</option>
                    <option value="eno2" ${vlan.parentInterface === 'eno2' ? 'selected' : ''}>eno2</option>
                    <option value="eno3" ${vlan.parentInterface === 'eno3' ? 'selected' : ''}>eno3</option>
                    <option value="eno4" ${vlan.parentInterface === 'eno4' ? 'selected' : ''}>eno4</option>
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
                    <div class="hint">Enter IP addresses in CIDR notation (e.g., 192.168.1.10/24)</div>
                </div>
                
                <div class="form-group">
                    <label class="form-label" for="edit-vlan-gateway">Gateway</label>
                    <input type="text" id="edit-vlan-gateway" class="form-control" value="${gateway}" data-validate="ipAddress">
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
    
    // Populate IP addresses for editing - use the new ipAddresses array
    const ipAddresses = [];
    if (vlan.ipAddresses && Array.isArray(vlan.ipAddresses) && vlan.ipAddresses.length > 0) {
        // Use the stored IP addresses array
        ipAddresses.push(...vlan.ipAddresses);
    } else if (vlan.ip && vlan.ip !== 'Not configured' && vlan.ip !== 'DHCP') {
        // Fallback to single IP field if ipAddresses not available
        if (vlan.ip.includes(',')) {
            ipAddresses.push(...vlan.ip.split(',').map(ip => ip.trim()));
        } else {
            ipAddresses.push(vlan.ip);
        }
    }
    
    console.log(`VlanManager: Populating edit form with IP addresses:`, ipAddresses);
    populateEditIpAddresses(ipAddresses);
    
    // Setup live validation for the edit form
    const editForm = document.getElementById('vlan-edit-form');
    if (typeof setupLiveValidation === 'function') {
        setupLiveValidation(editForm);
    }
    
    // Setup toggle functionality for edit form
    setupVlanToggle('edit-vlan');
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
                console.warn(`VlanManager: Could not find static config element with ID: ${staticConfigId}`);
            }
        });
    });
}

async function saveVlan() {
    console.log('VlanManager: Creating new VLAN...');
    
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
        gateway: document.getElementById('vlan-gateway')?.value || '',
        dns: document.getElementById('vlan-dns')?.value || ''
    };
    
    console.log('VlanManager: Form data collected:', formData);
    
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
        console.warn('Could not check for VLAN ID conflicts:', conflictCheckError);
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
        console.log(`VlanManager: Corrected VLAN name to: ${formData.name}`);
    }
    
    // Create VLAN using real system calls
    createRealVlan(formData)
        .then(() => {
            restoreButton();
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
        console.warn(`getParentInterfaceType: Error detecting type for ${interfaceName}:`, error);
        return 'unknown';
    }
}

// Create real VLAN configuration
async function createRealVlan(config) {
    console.log('VlanManager: Creating real VLAN configuration...');
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    // Check parent interface type first
    const parentType = await getParentInterfaceType(config.parent);
    console.log(`VlanManager: Parent interface ${config.parent} detected as type: ${parentType}`);
    
    // Generate Netplan configuration with parent type information
    const netplanConfig = await generateVlanNetplanConfig(config, parentType);
    // Use interface-specific filename to avoid conflicts when same VLAN ID is used on different interfaces
    const configPath = `/etc/netplan/90-xavs-${config.parent}-vlan${config.id}.yaml`;
    
    console.log('VlanManager: Generated Netplan config:', netplanConfig);
    console.log('VlanManager: Writing configuration to', configPath);
    
    try {
        // Check for interface conflicts before proceeding
        console.log('VlanManager: Checking for interface conflicts...');
        await checkForInterfaceConflicts(config.name, 'vlans');
        
        // Check for VLAN ID conflicts on the same parent interface
        console.log(`VlanManager: Checking for VLAN ID conflicts (ID ${config.id} on ${config.parent})...`);
        const existingVlans = await VlanManager.getExistingVlansOnParent(config.parent);
        const conflictingVlan = existingVlans.find(vlan => vlan.id === parseInt(config.id) && vlan.name !== config.name);
        
        if (conflictingVlan) {
            throw new Error(`VLAN ID ${config.id} is already in use on interface ${config.parent} by VLAN '${conflictingVlan.name}'. Please choose a different VLAN ID.`);
        }
        
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
        console.log('VlanManager: Testing Netplan configuration with netplan --debug try...');
        try {
            const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'try' });
            console.log('VlanManager: Netplan debug output:');
            console.log('--- START NETPLAN DEBUG ---');
            console.log(debugOutput);
            console.log('--- END NETPLAN DEBUG ---');
            console.log('VlanManager: Netplan try completed successfully');
        } catch (tryError) {
            console.error('VlanManager: Netplan try failed:', tryError);
            
            // Log the debug output even on failure
            if (tryError.message) {
                console.log('VlanManager: Netplan error output:');
                console.log('--- START NETPLAN ERROR ---');
                console.log(tryError.message);
                console.log('--- END NETPLAN ERROR ---');
            }
            
            // Check if this is just the bond revert warning (exit status 78)
            if (tryError.exit_status === 78) {
                console.log('VlanManager: Netplan try exited with status 78 (bond revert warning) - this is expected for bond configurations');
                // This is the expected bond warning, not a real error
            } else {
                // This is a real error
                throw new Error(`Configuration test failed: ${tryError.message || tryError}. The configuration has not been applied.`);
            }
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
async function generateVlanNetplanConfig(config, parentType = 'unknown') {
    console.log('VlanManager: Generating Netplan config for VLAN:', config.name);
    console.log('VlanManager: Config object:', config);
    console.log('VlanManager: Parent interface type:', parentType);
    
    // Validate that we have a valid parent interface
    if (!config.parent || config.parent === 'null' || config.parent === null || config.parent === undefined) {
        console.error('VlanManager: Invalid or missing parent interface for VLAN:', config);
        throw new Error(`Invalid parent interface for VLAN ${config.name}. Parent interface is required.`);
    }
    
    let yamlConfig = `network:
  version: 2`;
    
    // For bonds and bridges, we need to include a minimal definition so Netplan can resolve the parent
    if (parentType === 'bond' || parentType === 'bridge') {
        console.log(`VlanManager: Including parent ${parentType} definition for ${config.parent}`);
        
        if (parentType === 'bond') {
            yamlConfig += `
  bonds:
    ${config.parent}:
      # Minimal bond definition - full config should be in another file
      # This is just to satisfy netplan's parent interface requirement
      interfaces: []`;
        } else if (parentType === 'bridge') {
            yamlConfig += `
  bridges:
    ${config.parent}:
      # Minimal bridge definition - full config should be in another file
      # This is just to satisfy netplan's parent interface requirement
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
    
    console.log('VlanManager: Generated YAML config:', yamlConfig);
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
    
    console.log(`VlanManager: Saving edits for VLAN ${vlanDisplay}...`);
    
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
    
    const formData = {
        id: originalVlan ? originalVlan.id : vlanIdentifier, // Keep original VLAN ID
        name: document.getElementById('edit-vlan-name').value,
        parent: document.getElementById('edit-vlan-parent').value,
        description: document.getElementById('edit-vlan-description').value,
        configType: document.querySelector('#vlan-edit-form .toggle-seg.active').getAttribute('data-config'),
        ipAddresses: collectEditIpAddresses(),
        ip: collectEditIpAddresses()[0] || '', // Backward compatibility
        gateway: document.getElementById('edit-vlan-gateway')?.value || '',
        dns: document.getElementById('edit-vlan-dns')?.value || ''
    };
    
    console.log('VlanManager: Edit form data collected:', formData);
    
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
            console.warn('Could not check for VLAN ID conflicts:', conflictCheckError);
        }
    }
    
    // Update VLAN using real system calls
    updateRealVlan(originalVlan, formData)
        .then(() => {
            restoreButton();
            console.log('VlanManager: VLAN updated successfully');
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
    console.log('VlanManager: Updating real VLAN configuration...');
    console.log('VlanManager: Original VLAN:', originalVlan);
    console.log('VlanManager: New config:', newConfig);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    const vlanId = originalVlan.id;
    // Use interface-specific filenames to avoid conflicts
    const oldConfigPath = `/etc/netplan/90-xavs-${originalVlan.parentInterface}-vlan${vlanId}.yaml`;
    const oldGenericConfigPath = `/etc/netplan/90-xavs-vlan${vlanId}.yaml`;
    const oldCustomConfigPath = `/etc/netplan/90-xavs-${originalVlan.name}.yaml`;
    
    try {
        // Remove old configuration files (try both old and new naming schemes)
        console.log('VlanManager: Removing old configuration files...');
        await cockpit.spawn(['rm', '-f', oldConfigPath], { superuser: 'try' });
        await cockpit.spawn(['rm', '-f', oldGenericConfigPath], { superuser: 'try' });
        await cockpit.spawn(['rm', '-f', oldCustomConfigPath], { superuser: 'try' });
        
        // Remove any conflicting XAVS files for this interface name
        try {
            const existingXavsFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-*.yaml'], { superuser: 'try' });
            const files = existingXavsFiles.trim().split('\n').filter(f => f.trim());
            
            for (const file of files) {
                try {
                    const content = await cockpit.file(file, { superuser: 'try' }).read();
                    if (content && content.includes(`${newConfig.name}:`)) {
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
        
        // Generate and write new configuration with parent type detection
        const parentType = await getParentInterfaceType(newConfig.parent);
        console.log(`VlanManager: Parent interface ${newConfig.parent} detected as type: ${parentType}`);
        
        const netplanConfig = await generateVlanNetplanConfig(newConfig, parentType);
        // Use interface-specific filename to avoid conflicts
        const newConfigPath = `/etc/netplan/90-xavs-${newConfig.parent}-vlan${vlanId}.yaml`;
        
        console.log('VlanManager: Generated new Netplan config:', netplanConfig);
        console.log('VlanManager: Writing new configuration to', newConfigPath);
        
        await cockpit.file(newConfigPath, { superuser: 'try' }).replace(netplanConfig);
        
        // Set proper permissions
        console.log('VlanManager: Setting file permissions...');
        await cockpit.spawn(['chmod', '600', newConfigPath], { superuser: 'try' });
        
        // Test configuration with netplan debug try
        console.log('VlanManager: Testing new configuration with netplan --debug try...');
        try {
            const debugResult = await cockpit.spawn(['netplan', '--debug', 'try'], { 
                superuser: 'try',
                err: 'out'
            });
            console.log('VlanManager: Netplan debug output:', debugResult);
        } catch (debugError) {
            console.log('VlanManager: Netplan debug error:', debugError);
            
            // Check if this is just a bond revert warning (exit status 78)
            if (debugError.exit_status !== 78) {
                throw new Error(`Netplan configuration test failed: ${debugError.message || debugError}`);
            } else {
                console.log('VlanManager: Ignoring bond revert warning (exit status 78)');
            }
        }
        
        // Apply the configuration
        console.log('VlanManager: Applying netplan configuration...');
        await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
        
        console.log('VlanManager: VLAN configuration updated successfully');
        
    } catch (error) {
        console.error('VlanManager: Error updating VLAN configuration:', error);
        
        // Try to restore old configuration if possible
        try {
            console.log('VlanManager: Attempting to restore old configuration...');
            const oldNetplanConfig = generateVlanNetplanConfig({
                id: originalVlan.id,
                name: originalVlan.name,
                parent: originalVlan.parentInterface,
                description: originalVlan.description,
                configType: originalVlan.ipConfig,
                ip: originalVlan.ipAddress,
                gateway: originalVlan.gateway,
                dns: originalVlan.dns ? originalVlan.dns.join(', ') : ''
            });
            
            // Use interface-specific path for restore
            const restoreConfigPath = `/etc/netplan/90-xavs-${originalVlan.parentInterface}-vlan${originalVlan.id}.yaml`;
            await cockpit.file(restoreConfigPath, { superuser: 'try' }).replace(oldNetplanConfig);
            await cockpit.spawn(['chmod', '600', restoreConfigPath], { superuser: 'try' });
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'try' });
            
            console.log('VlanManager: Old configuration restored');
        } catch (restoreError) {
            console.error('VlanManager: Failed to restore old configuration:', restoreError);
        }
        
        throw new Error(`Failed to update VLAN configuration: ${error.message || error}`);
    }
}

function updateVlan(vlanId) {
    console.log(`VlanManager: updateVlan called for VLAN ${vlanId} - this function is deprecated, use editVlan instead`);
    // This function is deprecated - editVlan should be used instead
    // editVlan now accepts both VLAN IDs and names for backward compatibility
    editVlan(vlanId);
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
        console.log(`VlanManager: ${action}ing VLAN ${vlanDisplay}...`);
        
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
                    console.error(`VlanManager: Error ${action}ing VLAN:`, error);
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
        console.log(`VlanManager: Deleting VLAN ${vlanDisplay}...`);
        
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
                    console.error('VlanManager: Delete operation failed:', error);
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
    console.log(`VlanManager: deleteRealVlan called for VLAN ${vlanId}${vlanName ? ` (${vlanName})` : ''}...`);
    
    if (!cockpit || !cockpit.spawn) {
        throw new Error('Cockpit API not available');
    }
    
    try {
        // Find the VLAN in our current list
        let vlan = this.vlans.find(v => v.id === vlanId);
        if (!vlan && vlanName) {
            // If not found by ID, try to find by name
            vlan = this.vlans.find(v => v.name === vlanName);
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
        
        console.log(`VlanManager: Found VLAN for deletion:`, vlan);
        
        // Try to get the real parent interface from Netplan config before deletion
        try {
            const realParent = await this.getRealParentFromNetplan(vlan.name, vlan.id);
            if (realParent && realParent !== vlan.parentInterface) {
                console.log(`VlanManager: Corrected parent interface from '${vlan.parentInterface}' to '${realParent}' based on Netplan config`);
                vlan.parentInterface = realParent;
            }
        } catch (parentError) {
            console.warn(`VlanManager: Could not determine real parent interface:`, parentError);
        }
        
        // Check if the interface actually exists in the system before trying to delete it
        let interfaceExists = false;
        try {
            console.log(`VlanManager: Checking if VLAN interface ${vlan.name} exists...`);
            const ipShow = await cockpit.spawn(['ip', 'link', 'show', vlan.name], { superuser: 'try' });
            interfaceExists = true;
            console.log(`VlanManager: VLAN interface ${vlan.name} exists in system`);
        } catch (checkError) {
            console.log(`VlanManager: VLAN interface ${vlan.name} does not exist in system (this is okay)`);
            interfaceExists = false;
        }
        
        // Only try to bring down and delete the interface if it actually exists
        if (interfaceExists) {
            // First bring down the interface
            try {
                console.log(`VlanManager: Bringing down VLAN interface: ${vlan.name}`);
                await cockpit.spawn(['ip', 'link', 'set', vlan.name, 'down'], { superuser: 'try' });
            } catch (downError) {
                console.warn(`VlanManager: Could not bring down interface ${vlan.name}:`, downError);
            }
            
            // Delete the VLAN interface
            try {
                console.log(`VlanManager: Deleting VLAN interface: ${vlan.name}`);
                await cockpit.spawn(['ip', 'link', 'delete', vlan.name], { superuser: 'try' });
                
                // Wait a moment for the deletion to complete
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Verify the interface is actually deleted
                try {
                    const verifyOutput = await cockpit.spawn(['ip', 'link', 'show', vlan.name], { superuser: 'try' });
                    console.warn(`VlanManager: Interface ${vlan.name} still exists after deletion attempt`);
                } catch (verifyError) {
                    // This is expected - interface should not exist
                    console.log(`VlanManager: Verified interface ${vlan.name} was successfully deleted`);
                }
            } catch (deleteError) {
                console.warn(`VlanManager: Could not delete interface ${vlan.name}:`, deleteError);
            }
        } else {
            console.log(`VlanManager: Skipping interface deletion since ${vlan.name} doesn't exist`);
        }
        
        // Remove all possible configuration files for this VLAN
        // Support both old and new naming schemes
        const configFiles = [
            `/etc/netplan/90-xavs-vlan${vlan.id}.yaml`, // Old naming scheme
            `/etc/netplan/90-xavs-${vlan.name}.yaml`, // Custom name scheme
        ];
        
        // Add interface-specific naming scheme if we can determine the parent
        if (vlan.parentInterface) {
            configFiles.push(`/etc/netplan/90-xavs-${vlan.parentInterface}-vlan${vlan.id}.yaml`);
        }
        
        // Try to find ALL possible interface-specific files by pattern matching
        // This catches cases where the parent interface detection was incorrect
        try {
            const findResult = await cockpit.spawn(['find', '/etc/netplan', '-name', `90-xavs-*-vlan${vlan.id}.yaml`], { superuser: 'try' });
            const foundFiles = findResult.trim().split('\n').filter(f => f.trim());
            
            // Also search for files containing this VLAN name
            const nameSearchResult = await cockpit.spawn(['find', '/etc/netplan', '-name', `90-xavs-*${vlan.name}*.yaml`], { superuser: 'try' });
            const nameFoundFiles = nameSearchResult.trim().split('\n').filter(f => f.trim());
            
            // Combine all found files and deduplicate
            const allFoundFiles = [...new Set([...foundFiles, ...nameFoundFiles])];
            configFiles.push(...allFoundFiles);
            
            console.log(`VlanManager: Found config files to remove:`, allFoundFiles);
        } catch (findError) {
            console.warn('VlanManager: Could not search for config files:', findError);
        }
        
        // Deduplicate config files
        const uniqueConfigFiles = [...new Set(configFiles)];
        
        for (const configFile of uniqueConfigFiles) {
            try {
                console.log(`VlanManager: Removing configuration file: ${configFile}`);
                await cockpit.spawn(['rm', '-f', configFile], { superuser: 'require' });
            } catch (rmError) {
                console.warn(`VlanManager: Could not remove ${configFile}:`, rmError);
            }
        }
        
        // Test configuration with netplan --debug try
        console.log('VlanManager: Testing VLAN deletion with netplan --debug try...');
        try {
            const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
            console.log('VlanManager: Netplan debug output:');
            console.log('--- START NETPLAN DEBUG ---');
            console.log(debugOutput);
            console.log('--- END NETPLAN DEBUG ---');
            console.log('VlanManager: Netplan try completed successfully');
        } catch (tryError) {
            console.error('VlanManager: Netplan try failed:', tryError);
            
            // Log the debug output even on failure
            if (tryError.message) {
                console.log('VlanManager: Netplan error output:');
                console.log('--- START NETPLAN ERROR ---');
                console.log(tryError.message);
                console.log('--- END NETPLAN ERROR ---');
            }
            
            // Check if this is just the bond revert warning (exit status 78) or bond configuration error
            if (tryError.exit_status === 78) {
                console.log('VlanManager: Netplan try exited with status 78 (bond revert warning) - this is expected for bond configurations');
                
                // Check if the error message contains bond mode issues
                if (tryError.message && tryError.message.includes('unknown bond mode')) {
                    console.warn('VlanManager: Bond configuration error detected. VLAN deletion will proceed but bond configuration needs fixing.');
                    
                    if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                        NetworkManager.showToast('warning', 'VLAN deleted but bond configuration error detected. Please check bond settings.');
                    }
                }
            } else {
                // This is a real error that prevents VLAN deletion
                throw new Error(`VLAN deletion configuration test failed: ${tryError.message || tryError}. The configuration has not been applied.`);
            }
        }
        
        // Apply netplan to ensure configuration is clean
        console.log('VlanManager: Applying VLAN deletion configuration...');
        try {
            await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
            console.log('VlanManager: VLAN deletion configuration applied successfully');
        } catch (applyError) {
            console.error('VlanManager: Netplan apply failed:', applyError);
            
            // Check if this is the same bond configuration issue
            if (applyError.exit_status === 78 && applyError.message && applyError.message.includes('unknown bond mode')) {
                console.warn('VlanManager: Bond configuration error detected during apply. VLAN files were deleted but network configuration not fully applied.');
                
                if (typeof NetworkManager !== 'undefined' && NetworkManager.showToast) {
                    NetworkManager.showToast('warning', 'VLAN configuration files deleted but bond error prevents full network reload. Please fix bond configuration.');
                }
            } else {
                throw applyError;
            }
        }
        
        console.log(`VlanManager: VLAN ${vlan.id} deleted successfully`);
        
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
        console.error('VlanManager: Error deleting VLAN:', error);
        
        if (typeof NetworkManager !== 'undefined' && NetworkManager.showError) {
            NetworkManager.showError(`Failed to delete VLAN: ${error.message || error}`);
        }
        
        throw error;
    }
};

// Keep the original deleteVlan function for backward compatibility
function deleteVlanOriginal(vlanId) {
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

// Function to run netplan debug and show detailed output
async function debugNetplanConfiguration() {
    try {
        console.log('Debug: Running netplan --debug try...');
        NetworkManager.showSuccess('Running Netplan debug analysis...');
        
        const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=10'], { superuser: 'try' });
        
        console.log('Debug: Netplan debug output:');
        console.log('=== NETPLAN DEBUG OUTPUT ===');
        console.log(debugOutput);
        console.log('=== END DEBUG OUTPUT ===');
        
        NetworkManager.showSuccess('Netplan debug completed successfully. Check browser console for detailed output.');
        
    } catch (error) {
        console.error('Debug: Netplan debug failed:', error);
        
        // Log the error output
        if (error.message) {
            console.log('Debug: Netplan error output:');
            console.log('=== NETPLAN ERROR OUTPUT ===');
            console.log(error.message);
            console.log('=== END ERROR OUTPUT ===');
        }
        
        if (error.exit_status === 78) {
            NetworkManager.showSuccess('Netplan debug completed with bond revert warning (expected). Check browser console for detailed output.');
        } else {
            NetworkManager.showError(`Netplan debug failed: ${error.message || error}. Check browser console for details.`);
        }
    }
}

// Comprehensive VLAN diagnostic function
async function diagnosticVlanConfiguration() {
    try {
        console.log('=== VLAN DIAGNOSTIC REPORT ===');
        
        // 1. List all network interfaces
        console.log('1. Network Interfaces:');
        try {
            const interfaces = await cockpit.spawn(['ip', 'link', 'show'], { superuser: 'try' });
            console.log(interfaces);
        } catch (error) {
            console.error('Failed to get interfaces:', error);
        }
        
        // 2. List all VLAN interfaces detected by system
        console.log('\n2. System VLAN Interfaces:');
        try {
            const vlans = await cockpit.spawn(['ip', 'link', 'show', 'type', 'vlan'], { superuser: 'try' });
            console.log(vlans);
        } catch (error) {
            console.error('Failed to get VLAN interfaces:', error);
        }
        
        // 3. List all Netplan files
        console.log('\n3. Netplan Files:');
        try {
            const netplanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '*.yaml'], { superuser: 'try' });
            console.log('Found Netplan files:');
            console.log(netplanFiles);
            
            // Read each file
            const files = netplanFiles.trim().split('\n').filter(f => f.trim());
            for (const file of files) {
                try {
                    console.log(`\nContent of ${file}:`);
                    const content = await cockpit.spawn(['cat', file], { superuser: 'try' });
                    console.log(content);
                } catch (error) {
                    console.error(`Failed to read ${file}:`, error);
                }
            }
        } catch (error) {
            console.error('Failed to list Netplan files:', error);
        }
        
        // 4. Run netplan status
        console.log('\n4. Netplan Status:');
        try {
            const status = await cockpit.spawn(['netplan', 'status'], { superuser: 'try' });
            console.log(status);
        } catch (error) {
            console.error('Failed to get netplan status:', error);
        }
        
        // 5. Check VLAN Manager state
        console.log('\n5. VLAN Manager State:');
        console.log('Current VLANs in memory:', VlanManager.vlans);
        
        // 6. Test netplan try
        console.log('\n6. Netplan Try Test:');
        try {
            const result = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=10'], { superuser: 'try' });
            console.log('Netplan try successful:', result);
        } catch (error) {
            console.error('Netplan try failed:', error);
        }
        
        console.log('=== END VLAN DIAGNOSTIC REPORT ===');
        
        NetworkManager.showSuccess('VLAN diagnostic completed. Check browser console for detailed report.');
        
    } catch (error) {
        console.error('Diagnostic failed:', error);
        NetworkManager.showError(`Diagnostic failed: ${error.message || error}`);
    }
}

// Helper function to ensure error messages are always displayed
function displayVlanError(modal, error, operation = 'VLAN operation') {
    console.error(`VlanManager: Error in ${operation}:`, error);
    
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
async function emergencyCleanupCorruptedVlans() {
    console.log('VlanManager: Running emergency cleanup for corrupted VLAN configurations...');
    
    try {
        if (!cockpit || !cockpit.spawn) {
            throw new Error('Cockpit API not available');
        }
        
        // Find all XAVS VLAN configuration files
        const vlanFiles = await cockpit.spawn(['find', '/etc/netplan', '-name', '90-xavs-vlan*.yaml'], { superuser: 'try' });
        const files = vlanFiles.trim().split('\n').filter(f => f.trim());
        
        const corruptedFiles = [];
        
        for (const file of files) {
            try {
                const content = await cockpit.file(file).read();
                if (content && (content.includes('link: null') || content.includes('link: ""') || content.includes('link:null'))) {
                    console.log(`VlanManager: Found corrupted VLAN file: ${file}`);
                    corruptedFiles.push(file);
                }
            } catch (fileError) {
                console.warn(`VlanManager: Could not read file ${file}:`, fileError);
            }
        }
        
        if (corruptedFiles.length > 0) {
            console.log(`VlanManager: Removing ${corruptedFiles.length} corrupted VLAN configuration files...`);
            
            for (const file of corruptedFiles) {
                try {
                    console.log(`VlanManager: Removing corrupted file: ${file}`);
                    await cockpit.spawn(['rm', '-f', file], { superuser: 'require' });
                } catch (removeError) {
                    console.warn(`VlanManager: Could not remove ${file}:`, removeError);
                }
            }
            
            // Test the configuration after cleanup
            console.log('VlanManager: Testing configuration after emergency cleanup...');
            try {
                const debugOutput = await cockpit.spawn(['netplan', '--debug', 'try', '--timeout=30'], { superuser: 'require' });
                console.log('VlanManager: Emergency cleanup successful - configuration is now valid');
                console.log('--- START NETPLAN DEBUG ---');
                console.log(debugOutput);
                console.log('--- END NETPLAN DEBUG ---');
                
                // Apply the cleaned configuration
                await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
                console.log('VlanManager: Clean configuration applied successfully');
                
                NetworkManager.showSuccess(`Emergency cleanup completed: removed ${corruptedFiles.length} corrupted VLAN configurations`);
                
            } catch (tryError) {
                console.error('VlanManager: Configuration still invalid after cleanup:', tryError);
                if (tryError.exit_status === 78) {
                    console.log('VlanManager: Bond revert warning (status 78) - proceeding anyway');
                    await cockpit.spawn(['netplan', 'apply'], { superuser: 'require' });
                    NetworkManager.showSuccess(`Emergency cleanup completed with warnings: removed ${corruptedFiles.length} corrupted VLAN configurations`);
                } else {
                    NetworkManager.showError(`Emergency cleanup failed: ${tryError.message || tryError}`);
                }
            }
            
            // Reload VLANs
            VlanManager.loadVlans();
            
        } else {
            console.log('VlanManager: No corrupted VLAN configurations found');
            NetworkManager.showSuccess('No corrupted VLAN configurations found');
        }
        
    } catch (error) {
        console.error('VlanManager: Emergency cleanup failed:', error);
        NetworkManager.showError(`Emergency cleanup failed: ${error.message || error}`);
    }
}

// Update the main NetworkManager to use VlanManager (keep original version)
NetworkManager.loadVlans = function() {
    VlanManager.loadVlans();
};

function populateEditIpAddresses(ipAddresses) {
    const container = document.getElementById('edit-ip-addresses-container');
    
    // Clear existing entries
    container.innerHTML = '';
    window.editIpAddressCounter = 0;
    
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
                            <input type="text" id="edit-vlan-ip-0" class="form-control edit-ip-address-input" placeholder="10.100.1.50/24" data-validate="cidr" value="${ip}">
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger remove-edit-ip-btn" onclick="removeEditIpAddress(0)" style="display: none;">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Additional entries
            addEditIpAddress();
            document.getElementById(`edit-vlan-ip-${window.editIpAddressCounter}`).value = ip;
        }
    });
    
    updateEditRemoveButtonVisibility();
}

let editIpAddressCounter = 0;

function addEditIpAddress() {
    if (!window.editIpAddressCounter) window.editIpAddressCounter = 0;
    window.editIpAddressCounter++;
    
    const container = document.getElementById('edit-ip-addresses-container');
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', window.editIpAddressCounter);
    
    newEntry.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: flex-end; margin-top: 8px;">
            <div style="flex: 1;">
                <input type="text" id="edit-vlan-ip-${window.editIpAddressCounter}" class="form-control edit-ip-address-input" placeholder="10.100.1.51/24" data-validate="cidr">
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
            removeBtn.style.display = entries.length > 1 ? 'block' : 'none';
        }
    });
}

function collectEditIpAddresses() {
    const ipInputs = document.querySelectorAll('.edit-ip-address-input');
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

// Multiple IP Address Management Functions
let ipAddressCounter = 0;

function addIpAddress() {
    ipAddressCounter++;
    const container = document.getElementById('ip-addresses-container');
    
    const newEntry = document.createElement('div');
    newEntry.className = 'ip-address-entry';
    newEntry.setAttribute('data-index', ipAddressCounter);
    
    newEntry.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: flex-end; margin-top: 8px;">
            <div style="flex: 1;">
                <input type="text" id="vlan-ip-${ipAddressCounter}" class="form-control ip-address-input" placeholder="10.100.1.51/24" data-validate="cidr">
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

// Test function to validate VLAN parent interface detection
async function testVlanParentDetection() {
    console.log('=== VLAN PARENT INTERFACE DETECTION TEST ===');
    
    try {
        console.log('1. Testing Netplan VLAN parsing...');
        const netplanVlans = await VlanManager.fetchVlansFromNetplan();
        console.log('Netplan VLANs:', netplanVlans);
        
        console.log('\n2. Testing full VLAN loading...');
        const allVlans = await VlanManager.fetchVlans();
        console.log('All VLANs:', allVlans);
        
        console.log('\n3. Parent interface summary:');
        allVlans.forEach(vlan => {
            console.log(`VLAN ${vlan.id} (${vlan.name}): Parent = '${vlan.parentInterface}'`);
        });
        
        NetworkManager.showSuccess('VLAN parent interface test completed. Check browser console for detailed results.');
        
    } catch (error) {
        console.error('VLAN test failed:', error);
        NetworkManager.showError(`VLAN test failed: ${error.message || error}`);
    }
    
    console.log('=== END VLAN PARENT INTERFACE TEST ===');
}

// Helper function to normalize IP addresses with default CIDR
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
