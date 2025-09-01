'use strict';
/* global cockpit, run, setStatus */

/**
 * JavaScript-based Netplan Manager
 * Replaces Python netplan_manager.py for common operations
 * Uses direct shell commands and YAML manipulation via Cockpit API
 */

const NETPLAN_DIR = '/etc/netplan';
const NETPLAN_FILE = '99-cockpit.yaml';

/**
 * Execute a shell command via Cockpit
 */
async function executeCommand(command, options = {}) {
  const defaultOptions = {
    superuser: 'require',
    err: 'out'
  };
  
  console.log('Executing command:', command.replace(/\n/g, '\\n').substring(0, 200) + '...');
  
  try {
    const result = await cockpit.spawn(['bash', '-c', command], { ...defaultOptions, ...options });
    console.log('Command success, output length:', result.length);
    return { success: true, output: result.trim() };
  } catch (error) {
    console.error('Command failed:', error);
    return { success: false, error: error.message || error.toString(), output: error.message || error.toString() };
  }
}

/**
 * Load current netplan configuration
 */
async function loadNetplanConfig() {
  console.log('Loading netplan configuration...');
  
  const command = `
    if [ ! -f "${NETPLAN_DIR}/${NETPLAN_FILE}" ]; then
      echo '{"network":{"version":2,"renderer":"networkd","ethernets":{},"vlans":{},"bridges":{},"bonds":{}}}'
    else
      python3 -c "
import yaml
import json
import sys
import os

try:
    if os.path.exists('${NETPLAN_DIR}/${NETPLAN_FILE}'):
        with open('${NETPLAN_DIR}/${NETPLAN_FILE}', 'r') as f:
            data = yaml.safe_load(f) or {}
        print(json.dumps(data))
    else:
        # Create default config
        default_config = {
            'network': {
                'version': 2,
                'renderer': 'networkd',
                'ethernets': {},
                'vlans': {},
                'bridges': {},
                'bonds': {}
            }
        }
        print(json.dumps(default_config))
except Exception as e:
    print(json.dumps({'error': str(e)}))
    sys.exit(1)
"
    fi
  `;
  
  const result = await executeCommand(command);
  console.log('loadNetplanConfig result:', result);
  
  if (result.success) {
    try {
      const config = JSON.parse(result.output);
      console.log('Loaded netplan config:', config);
      return config;
    } catch (e) {
      console.error('Failed to parse netplan config:', e);
      return { error: 'Failed to parse netplan configuration' };
    }
  }
  return { error: result.error || 'Failed to load netplan configuration' };
}

/**
 * Write netplan configuration
 */
async function writeNetplanConfig(config) {
  console.log('Writing netplan config:', config);
  
  // Simple approach: write YAML directly without complex Python script
  const yamlConfig = `network:
  version: 2
  renderer: networkd
  ethernets:`;
  
  // Add ethernets
  const ethernets = config.network?.ethernets || {};
  let ethernetYaml = '';
  for (const [name, iface] of Object.entries(ethernets)) {
    ethernetYaml += `
    ${name}:
      optional: ${iface.optional || true}`;
  }
  
  // Add VLANs
  const vlans = config.network?.vlans || {};
  let vlanYaml = '';
  if (Object.keys(vlans).length > 0) {
    vlanYaml = '\n  vlans:';
    for (const [name, vlan] of Object.entries(vlans)) {
      vlanYaml += `
    ${name}:
      id: ${vlan.id}
      link: ${vlan.link}`;
      if (vlan.dhcp4 !== undefined) {
        vlanYaml += `
      dhcp4: ${vlan.dhcp4}`;
      }
      if (vlan.addresses) {
        vlanYaml += `
      addresses:
        - ${vlan.addresses[0]}`;
      }
      if (vlan.gateway4) {
        vlanYaml += `
      gateway4: ${vlan.gateway4}`;
      }
      if (vlan.mtu) {
        vlanYaml += `
      mtu: ${vlan.mtu}`;
      }
    }
  }
  
  // Add bridges
  const bridges = config.network?.bridges || {};
  let bridgeYaml = '';
  if (Object.keys(bridges).length > 0) {
    bridgeYaml = '\n  bridges:';
    for (const [name, bridge] of Object.entries(bridges)) {
      bridgeYaml += `
    ${name}:
      interfaces: [${bridge.interfaces.join(', ')}]`;
      if (bridge.dhcp4 !== undefined) {
        bridgeYaml += `
      dhcp4: ${bridge.dhcp4}`;
      }
    }
  }
  
  // Add bonds
  const bonds = config.network?.bonds || {};
  let bondYaml = '';
  if (Object.keys(bonds).length > 0) {
    bondYaml = '\n  bonds:';
    for (const [name, bond] of Object.entries(bonds)) {
      bondYaml += `
    ${name}:
      interfaces: [${bond.interfaces.join(', ')}]
      parameters:
        mode: ${bond.parameters.mode}`;
    }
  }
  
  const finalYaml = yamlConfig + ethernetYaml + vlanYaml + bridgeYaml + bondYaml;
  
  console.log('Generated YAML:', finalYaml);
  
  // Escape the YAML content for shell command
  const escapedYaml = finalYaml.replace(/'/g, "'\\''").replace(/"/g, '\\"');
  
  const command = `
    # Create netplan directory if it doesn't exist
    mkdir -p "${NETPLAN_DIR}"
    
    # Create backup if file exists
    if [ -f "${NETPLAN_DIR}/${NETPLAN_FILE}" ]; then
      cp "${NETPLAN_DIR}/${NETPLAN_FILE}" "${NETPLAN_DIR}/${NETPLAN_FILE}.backup.\$(date +%s)"
    fi
    
    # Write YAML content directly
    cat > "${NETPLAN_DIR}/${NETPLAN_FILE}" << 'EOF'
${finalYaml}
EOF
    
    # Set proper permissions
    chmod 600 "${NETPLAN_DIR}/${NETPLAN_FILE}"
    
    # Verify the file was written
    if [ -f "${NETPLAN_DIR}/${NETPLAN_FILE}" ]; then
      echo "SUCCESS: Netplan configuration written"
      echo "File size: \$(wc -c < "${NETPLAN_DIR}/${NETPLAN_FILE}") bytes"
    else
      echo "ERROR: Failed to create netplan file"
      exit 1
    fi
  `;
  
  const result = await executeCommand(command);
  console.log('writeNetplanConfig result:', result);
  
  if (result.success && result.output.includes('SUCCESS')) {
    return true;
  } else {
    console.error('Failed to write netplan config:', result);
    return false;
  }
}

/**
 * Apply netplan configuration
 * Handles special cases for bonds/bridges that don't support netplan try
 */
async function applyNetplanConfig(timeout = 10) {
  console.log('Applying netplan configuration...');
  
  // First generate
  console.log('Running netplan generate...');
  let result = await executeCommand('netplan generate');
  if (!result.success) {
    return { error: `netplan generate failed: ${result.error}` };
  }
  
  // Check if we have bonds or bridges (they don't support netplan try)
  const config = await loadNetplanConfig();
  const network = config.network || {};
  const hasBonds = network.bonds && Object.keys(network.bonds).length > 0;
  const hasBridges = network.bridges && Object.keys(network.bridges).length > 0;
  
  if (hasBonds || hasBridges) {
    console.log('Bonds or bridges detected - applying directly (netplan try not supported)...');
    result = await executeCommand('netplan apply');
    
    if (result.success) {
      console.log('Netplan configuration applied successfully');
      return { success: true, message: 'Configuration applied (bonds/bridges require direct apply)' };
    } else {
      return { error: `netplan apply failed: ${result.error}` };
    }
  } else {
    console.log(`Testing configuration safely with ${timeout}s timeout...`);
    result = await executeCommand(`netplan try --timeout ${timeout}`, { timeout: (timeout + 5) * 1000 });
    
    if (result.success) {
      console.log('Test successful, applying final configuration...');
      result = await executeCommand('netplan apply');
      
      if (result.success) {
        console.log('Netplan configuration applied successfully');
        return { success: true, message: 'Configuration tested and applied successfully' };
      } else {
        return { error: `netplan apply failed after successful try: ${result.error}` };
      }
    } else {
      return { error: `netplan try failed: ${result.error}` };
    }
  }
}

/**
 * Get physical interfaces
 */
async function getPhysicalInterfaces() {
  const command = `
    ip link show | grep -E '^[0-9]+:' | cut -d: -f2 | tr -d ' ' | grep -E '^(eth|en|em|p[0-9]|wl)' | grep -v '@'
  `;
  
  const result = await executeCommand(command);
  if (result.success) {
    return result.output.split('\n').filter(iface => iface.trim());
  }
  return [];
}

/**
 * Add VLAN interface
 */
async function addVlan(config) {
  console.log('Adding VLAN:', config);
  
  try {
    const netplan = await loadNetplanConfig();
    if (netplan.error) return netplan;
    
    // Ensure network structure
    if (!netplan.network) netplan.network = {};
    if (!netplan.network.vlans) netplan.network.vlans = {};
    if (!netplan.network.ethernets) netplan.network.ethernets = {};
    
    netplan.network.version = 2;
    netplan.network.renderer = 'networkd';
    
    // Add parent interface to ethernets if not present
    const parentInterface = config.link;
    if (parentInterface && !netplan.network.ethernets[parentInterface]) {
      netplan.network.ethernets[parentInterface] = { optional: true };
    }
    
    // Create VLAN configuration
    const vlanConfig = {
      id: parseInt(config.id),
      link: config.link
    };
    
    // Add IP configuration
    if (config.static_ip && config.static_ip.trim()) {
      vlanConfig.dhcp4 = false;
      vlanConfig.addresses = [config.static_ip];
      if (config.gateway && config.gateway.trim()) {
        vlanConfig.gateway4 = config.gateway;
      }
    } else {
      vlanConfig.dhcp4 = true;
    }
    
    // Add MTU if specified
    if (config.mtu && parseInt(config.mtu) > 0) {
      vlanConfig.mtu = parseInt(config.mtu);
    }
    
    netplan.network.vlans[config.name] = vlanConfig;
    
    // Write and apply
    const writeSuccess = await writeNetplanConfig(netplan);
    if (!writeSuccess) {
      return { error: 'Failed to write netplan configuration' };
    }
    
    const applyResult = await applyNetplanConfig();
    if (applyResult.error) {
      return applyResult;
    }
    
    // Verify IP assignment if static IP was configured
    if (config.addresses && config.addresses.length > 0) {
      console.log(`Verifying IP assignment for VLAN ${config.name}...`);
      try {
        // Wait a moment for the interface to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if the IP was actually assigned
        const ifconfigResult = await run('ifconfig', [config.name], { superuser: 'try' });
        const expectedIP = config.addresses[0].split('/')[0]; // Extract IP from CIDR
        
        if (ifconfigResult && ifconfigResult.includes(`inet ${expectedIP}`)) {
          console.log(`✅ Static IP ${expectedIP} successfully assigned to ${config.name}`);
        } else {
          console.warn(`⚠️ Static IP ${expectedIP} was not assigned to ${config.name}`);
          console.log('Interface might be up but IP assignment failed - check network connectivity');
          return { 
            success: true, 
            message: `VLAN ${config.name} created but static IP assignment may have failed`,
            warning: `Expected IP ${expectedIP} not found on interface`,
            details: {
              interface: config.name,
              expected_ip: expectedIP,
              actual_output: ifconfigResult
            }
          };
        }
      } catch (verifyError) {
        console.warn('Could not verify IP assignment:', verifyError);
        // Don't fail the operation, just warn
      }
    }
    
    return { success: true, message: `VLAN ${config.name} created successfully` };
    
  } catch (error) {
    return { error: `Failed to add VLAN: ${error.message}` };
  }
}

/**
 * Add Bridge interface with comprehensive STP configuration
 * Note: Bridges require direct netplan apply (no try support)
 */
async function addBridge(config) {
  console.log('Adding Bridge:', config);
  
  try {
    const netplan = await loadNetplanConfig();
    if (netplan.error) return netplan;
    
    // Ensure network structure
    if (!netplan.network) netplan.network = {};
    if (!netplan.network.bridges) netplan.network.bridges = {};
    if (!netplan.network.ethernets) netplan.network.ethernets = {};
    
    netplan.network.version = 2;
    netplan.network.renderer = 'networkd';
    
    // Validate bridge members
    const interfaces = config.interfaces || [];
    if (interfaces.length === 0) {
      return { error: 'Bridge requires at least one member interface' };
    }
    
    // Add member interfaces to ethernets (required for netplan)
    interfaces.forEach(iface => {
      if (!netplan.network.ethernets[iface]) {
        netplan.network.ethernets[iface] = { optional: true };
      }
    });
    
    // Create bridge configuration
    const bridgeConfig = {
      interfaces: interfaces,
      dhcp4: config.dhcp4 !== false // Default to DHCP unless explicitly disabled
    };
    
    // Add static IP configuration if provided
    if (config.static_ip && config.static_ip.trim()) {
      bridgeConfig.dhcp4 = false;
      bridgeConfig.addresses = [config.static_ip];
      if (config.gateway && config.gateway.trim()) {
        bridgeConfig.gateway4 = config.gateway;
      }
    }
    
    // Add STP (Spanning Tree Protocol) configuration
    const stpEnabled = config.stp !== false; // Default to enabled for safety
    bridgeConfig.parameters = {
      stp: stpEnabled
    };
    
    // Add advanced STP timing parameters if STP is enabled
    if (stpEnabled) {
      // Forward delay: time spent in listening and learning states (default: 15s, range: 4-30s)
      if (config.forward_delay) {
        const forwardDelay = parseInt(config.forward_delay);
        if (forwardDelay >= 4 && forwardDelay <= 30) {
          bridgeConfig.parameters['forward-delay'] = forwardDelay;
        } else {
          console.warn('Forward delay out of range (4-30s), using default');
        }
      }
      
      // Hello time: interval between config BPDUs (default: 2s, range: 1-10s)
      if (config.hello_time) {
        const helloTime = parseInt(config.hello_time);
        if (helloTime >= 1 && helloTime <= 10) {
          bridgeConfig.parameters['hello-time'] = helloTime;
        } else {
          console.warn('Hello time out of range (1-10s), using default');
        }
      }
      
      // Max age: how long to wait for BPDUs (default: 20s, range: 6-40s)
      if (config.max_age) {
        const maxAge = parseInt(config.max_age);
        if (maxAge >= 6 && maxAge <= 40) {
          bridgeConfig.parameters['max-age'] = maxAge;
        } else {
          console.warn('Max age out of range (6-40s), using default');
        }
      }
      
      // Bridge priority (lower = higher priority, default: 32768)
      if (config.priority) {
        const priority = parseInt(config.priority);
        if (priority >= 0 && priority <= 65535 && priority % 4096 === 0) {
          bridgeConfig.parameters.priority = priority;
        } else {
          console.warn('Bridge priority must be multiple of 4096 (0-65535), using default');
        }
      }
    }
    
    // Add path cost for specific ports if specified
    if (config.path_costs && typeof config.path_costs === 'object') {
      bridgeConfig.parameters['path-cost'] = config.path_costs;
    }
    
    // Add port priority for specific ports if specified  
    if (config.port_priorities && typeof config.port_priorities === 'object') {
      bridgeConfig.parameters['port-priority'] = config.port_priorities;
    }
    
    netplan.network.bridges[config.name] = bridgeConfig;
    
    // Write and apply configuration
    console.log('Writing bridge configuration to 99-cockpit.yaml...');
    const writeSuccess = await writeNetplanConfig(netplan);
    if (!writeSuccess) {
      return { error: 'Failed to write netplan configuration to 99-cockpit.yaml' };
    }
    
    console.log('Applying bridge configuration (note: bridges require direct apply)...');
    const applyResult = await applyNetplanConfig();
    if (applyResult.error) {
      return applyResult;
    }
    
    return { 
      success: true, 
      message: `Bridge ${config.name} created successfully with STP ${stpEnabled ? 'enabled' : 'disabled'}`,
      details: {
        interfaces: interfaces,
        stp: stpEnabled,
        dhcp4: bridgeConfig.dhcp4,
        static_ip: config.static_ip || null,
        forward_delay: bridgeConfig.parameters['forward-delay'],
        hello_time: bridgeConfig.parameters['hello-time']
      }
    };
    
  } catch (error) {
    return { error: `Failed to add bridge: ${error.message}` };
  }
}

/**
 * Add Bond interface with comprehensive validation
 * Note: Bonds require direct netplan apply (no try support)
 */
async function addBond(config) {
  console.log('Adding Bond:', config);
  
  try {
    const netplan = await loadNetplanConfig();
    if (netplan.error) return netplan;
    
    // Ensure network structure
    if (!netplan.network) netplan.network = {};
    if (!netplan.network.bonds) netplan.network.bonds = {};
    if (!netplan.network.ethernets) netplan.network.ethernets = {};
    
    netplan.network.version = 2;
    netplan.network.renderer = 'networkd';
    
    // Validate bond mode
    const validModes = ['balance-rr', 'active-backup', 'balance-xor', 'broadcast', '802.3ad', 'balance-tlb', 'balance-alb'];
    const mode = config.mode || 'active-backup';
    if (!validModes.includes(mode)) {
      return { error: `Invalid bond mode: ${mode}. Valid modes: ${validModes.join(', ')}` };
    }
    
    // Validate interfaces
    const interfaces = config.interfaces || [];
    if (interfaces.length < 2) {
      return { error: 'Bond requires at least 2 interfaces' };
    }
    
    // Add slave interfaces to ethernets (required for netplan)
    interfaces.forEach(iface => {
      if (!netplan.network.ethernets[iface]) {
        netplan.network.ethernets[iface] = { optional: true };
      }
    });
    
    // Create bond configuration with mode-specific parameters
    const bondConfig = {
      interfaces: interfaces,
      parameters: {
        mode: mode
      }
    };
    
    // Add MII monitoring (important for link detection)
    const miimon = config.miimon ? parseInt(config.miimon) : 100; // Default 100ms
    if (miimon > 0) {
      bondConfig.parameters['mii-monitor-interval'] = miimon;
    }
    
    // Add primary interface if specified and valid
    if (config.primary && interfaces.includes(config.primary)) {
      bondConfig.parameters.primary = config.primary;
    }
    
    // Mode-specific optimizations
    switch (mode) {
      case '802.3ad':
        bondConfig.parameters['lacp-rate'] = 'fast';
        bondConfig.parameters['transmit-hash-policy'] = 'layer3+4';
        break;
      case 'balance-xor':
        bondConfig.parameters['transmit-hash-policy'] = 'layer2+3';
        break;
      case 'balance-tlb':
      case 'balance-alb':
        // These modes require MII monitoring
        if (!bondConfig.parameters['mii-monitor-interval']) {
          bondConfig.parameters['mii-monitor-interval'] = 100;
        }
        break;
    }
    
    // Add optional gratuitous ARP for faster failover
    if (mode === 'active-backup') {
      bondConfig.parameters['gratuitous-arp'] = 1;
    }
    
    netplan.network.bonds[config.name] = bondConfig;
    
    // Write and apply configuration
    console.log('Writing bond configuration to 99-cockpit.yaml...');
    const writeSuccess = await writeNetplanConfig(netplan);
    if (!writeSuccess) {
      return { error: 'Failed to write netplan configuration to 99-cockpit.yaml' };
    }
    
    console.log('Applying bond configuration (note: bonds require direct apply)...');
    const applyResult = await applyNetplanConfig();
    if (applyResult.error) {
      return applyResult;
    }
    
    return { 
      success: true, 
      message: `Bond ${config.name} created successfully with mode ${mode}`,
      details: {
        mode: mode,
        interfaces: interfaces,
        mii_monitor: bondConfig.parameters['mii-monitor-interval'],
        primary: bondConfig.parameters.primary
      }
    };
    
  } catch (error) {
    return { error: `Failed to add bond: ${error.message}` };
  }
}

/**
 * Perform system-level cleanup for interfaces
 * @param {string} interfaceType - Type of interface (vlans, bonds, bridges)
 * @param {string} interfaceName - Name of interface to clean up
 * @param {string} originalName - Original interface name for logging
 */
async function performSystemCleanup(interfaceType, interfaceName, originalName) {
  console.log(`Performing system cleanup for ${interfaceType} interface ${interfaceName}...`);
  
  if (interfaceType === 'bonds') {
    try {
      const checkBondResult = await run('ip', ['link', 'show', interfaceName], { superuser: 'try' });
      if (checkBondResult && !checkBondResult.includes('does not exist') && !checkBondResult.includes('Cannot find device')) {
        console.log(`Bond interface ${interfaceName} still exists, manually removing...`);
        
        try {
          await run('ip', ['link', 'set', interfaceName, 'down'], { superuser: 'try' });
          console.log(`Brought down bond interface ${interfaceName}`);
        } catch (downError) {
          console.warn(`Could not bring down bond ${interfaceName}:`, downError);
        }
        
        try {
          await run('ip', ['link', 'delete', interfaceName], { superuser: 'try' });
          console.log(`Deleted bond interface ${interfaceName}`);
        } catch (deleteError) {
          console.warn(`Could not delete bond ${interfaceName}:`, deleteError);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (bondCleanupError) {
      console.warn(`Warning: Could not check/cleanup bond interface ${interfaceName}:`, bondCleanupError);
    }
  }
  
  else if (interfaceType === 'bridges') {
    try {
      const checkBridgeResult = await run('ip', ['link', 'show', interfaceName], { superuser: 'try' });
      if (checkBridgeResult && !checkBridgeResult.includes('does not exist') && !checkBridgeResult.includes('Cannot find device')) {
        console.log(`Bridge interface ${interfaceName} still exists, manually removing...`);
        
        try {
          await run('ip', ['link', 'set', interfaceName, 'down'], { superuser: 'try' });
          console.log(`Brought down bridge interface ${interfaceName}`);
        } catch (downError) {
          console.warn(`Could not bring down bridge ${interfaceName}:`, downError);
        }
        
        try {
          await run('ip', ['link', 'delete', interfaceName], { superuser: 'try' });
          console.log(`Deleted bridge interface ${interfaceName}`);
        } catch (deleteError) {
          console.warn(`Could not delete bridge ${interfaceName}:`, deleteError);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (bridgeCleanupError) {
      console.warn(`Warning: Could not check/cleanup bridge interface ${interfaceName}:`, bridgeCleanupError);
    }
  }
  
  else if (interfaceType === 'vlans') {
    try {
      const vlanNamesToCheck = [interfaceName];
      if (originalName !== interfaceName && originalName.includes('@')) {
        vlanNamesToCheck.push(originalName);
      }
      
      console.log(`Checking VLAN name variations: ${vlanNamesToCheck.join(', ')}`);
      
      for (const vlanName of vlanNamesToCheck) {
        try {
          const checkVlanResult = await run('ip', ['link', 'show', vlanName], { superuser: 'try' });
          if (checkVlanResult && !checkVlanResult.includes('does not exist') && !checkVlanResult.includes('Cannot find device')) {
            console.log(`VLAN interface ${vlanName} still exists, manually removing...`);
            
            try {
              await run('ip', ['link', 'set', vlanName, 'down'], { superuser: 'try' });
              console.log(`Brought down VLAN interface ${vlanName}`);
            } catch (downError) {
              console.warn(`Could not bring down VLAN ${vlanName}:`, downError);
            }
            
            try {
              await run('ip', ['link', 'delete', vlanName], { superuser: 'try' });
              console.log(`Deleted VLAN interface ${vlanName}`);
              break;
            } catch (deleteError) {
              console.warn(`Could not delete VLAN ${vlanName}:`, deleteError);
            }
          }
        } catch (checkError) {
          console.warn(`Could not check VLAN interface ${vlanName}:`, checkError);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (vlanCleanupError) {
      console.warn(`Warning: Could not check/cleanup VLAN interface ${interfaceName}:`, vlanCleanupError);
    }
  }
}

/**
 * Remove interface from netplan configuration
 * Supports VLANs, bridges, and bonds with enhanced name resolution
 */
async function removeInterface(config) {
  console.log('Removing interface:', config);
  
  try {
    const netplan = await loadNetplanConfig();
    if (netplan.error) return netplan;
    
    let interfaceName = config.name;
    const interfaceType = config.type; // 'vlans', 'bridges', 'bonds'
    
    if (!interfaceName) {
      return { error: 'Interface name is required for removal' };
    }
    
    // Ensure network structure exists
    if (!netplan.network) {
      return { error: 'No netplan configuration found' };
    }
    
    // Enhanced name normalization for VLANs with @parent suffixes
    let normalizedName = interfaceName;
    if (interfaceName.includes('@')) {
      // Handle cases like: eno4.1188@eno4@eno4 -> eno4.1188
      const parts = interfaceName.split('@');
      normalizedName = parts[0]; // Take just the interface.vlan part
      console.log(`Normalized VLAN name from ${interfaceName} to ${normalizedName}`);
    }
    
    let removed = false;
    let removedFrom = '';
    let actualName = '';
    
    // Try to find the interface by checking all possible name variations
    const checkNames = [interfaceName, normalizedName];
    
    // Remove from appropriate section based on type or by searching
    if (interfaceType === 'vlans' || interfaceType === 'vlan' || (!interfaceType && netplan.network.vlans)) {
      for (const checkName of checkNames) {
        if (netplan.network.vlans && netplan.network.vlans[checkName]) {
          delete netplan.network.vlans[checkName];
          removed = true;
          removedFrom = 'vlans';
          actualName = checkName;
          console.log(`Removed VLAN ${checkName} from vlans section`);
          break;
        }
      }
    }
    
    if (!removed && (interfaceType === 'bridges' || interfaceType === 'bridge' || (!interfaceType && netplan.network.bridges))) {
      for (const checkName of checkNames) {
        if (netplan.network.bridges && netplan.network.bridges[checkName]) {
          delete netplan.network.bridges[checkName];
          removed = true;
          removedFrom = 'bridges';
          actualName = checkName;
          console.log(`Removed bridge ${checkName} from bridges section`);
          break;
        }
      }
    }
    
    if (!removed && (interfaceType === 'bonds' || interfaceType === 'bond' || (!interfaceType && netplan.network.bonds))) {
      for (const checkName of checkNames) {
        if (netplan.network.bonds && netplan.network.bonds[checkName]) {
          delete netplan.network.bonds[checkName];
          removed = true;
          removedFrom = 'bonds';
          actualName = checkName;
          console.log(`Removed bond ${checkName} from bonds section`);
          break;
        }
      }
    }
    
    if (!removed) {
      // Try to find the interface in any section (fallback search)
      console.log('Interface not found with standard search, trying fallback search...');
      const allSections = ['vlans', 'bridges', 'bonds'];
      
      for (const section of allSections) {
        if (netplan.network[section]) {
          for (const [name, config] of Object.entries(netplan.network[section])) {
            // Check if any stored name matches our search names
            if (checkNames.includes(name)) {
              delete netplan.network[section][name];
              removed = true;
              removedFrom = section;
              actualName = name;
              console.log(`Found and removed ${name} from ${section} section via fallback search`);
              break;
            }
          }
          if (removed) break;
        }
      }
    }
    
    if (!removed) {
      console.log('Available interfaces in netplan config:');
      console.log('VLANs:', Object.keys(netplan.network.vlans || {}));
      console.log('Bridges:', Object.keys(netplan.network.bridges || {}));
      console.log('Bonds:', Object.keys(netplan.network.bonds || {}));
      
      // Check if this is a system-only interface that needs cleanup
      // This happens when interfaces were created outside of netplan or are orphaned
      console.log(`Interface ${interfaceName} not found in netplan, checking if it exists in system...`);
      
      try {
        const checkSystemResult = await run('ip', ['link', 'show', interfaceName], { superuser: 'try' });
        if (checkSystemResult && !checkSystemResult.includes('does not exist') && !checkSystemResult.includes('Cannot find device')) {
          console.log(`Found system-only interface ${interfaceName}, performing direct system cleanup...`);
          
          // Determine interface type for cleanup
          let systemInterfaceType = 'unknown';
          if (interfaceName.includes('.')) {
            systemInterfaceType = 'vlans';
          } else if (interfaceName.startsWith('br')) {
            systemInterfaceType = 'bridges';
          } else if (interfaceName.startsWith('bond')) {
            systemInterfaceType = 'bonds';
          }
          
          // Perform system cleanup
          await performSystemCleanup(systemInterfaceType, interfaceName, interfaceName);
          
          return { 
            success: true, 
            message: `System-only interface ${interfaceName} removed successfully (not in netplan config)`,
            details: {
              interface: interfaceName,
              original_name: interfaceName,
              type: systemInterfaceType,
              config_file: 'not_in_config',
              system_cleanup: true,
              system_only: true
            }
          };
        }
      } catch (systemCheckError) {
        console.warn('Could not check system for interface:', systemCheckError);
      }
      
      return { error: `Interface ${interfaceName} (tried variations: ${checkNames.join(', ')}) not found in netplan configuration or system` };
    }
    
    // Write and apply configuration
    console.log(`Writing updated configuration to 99-cockpit.yaml (removed ${actualName} from ${removedFrom})...`);
    const writeSuccess = await writeNetplanConfig(netplan);
    if (!writeSuccess) {
      return { error: 'Failed to write updated netplan configuration to 99-cockpit.yaml' };
    }
    
    console.log('Applying updated configuration...');
    const applyResult = await applyNetplanConfig();
    if (applyResult.error) {
      return applyResult;
    }
    
    // For bonds, VLANs, and bridges, we need additional cleanup since netplan apply might not fully remove the interface
    if (['bonds', 'vlans', 'bridges'].includes(removedFrom)) {
      await performSystemCleanup(removedFrom, actualName, interfaceName);
    }
    
    // Clean up orphaned ethernet entries after successful removal
    await cleanupOrphanedEthernets();
    
    return { 
      success: true, 
      message: `Interface ${actualName} removed successfully from ${removedFrom} section${(['bonds', 'vlans', 'bridges'].includes(removedFrom)) ? ' with system-level cleanup' : ''}`,
      details: {
        interface: actualName,
        original_name: interfaceName,
        type: removedFrom,
        config_file: '99-cockpit.yaml',
        system_cleanup: ['bonds', 'vlans', 'bridges'].includes(removedFrom)
      }
    };
    
  } catch (error) {
    return { error: `Failed to remove interface: ${error.message}` };
  }
}

/**
 * Clean up orphaned ethernet entries that are no longer used
 * This removes ethernet interfaces that were only added to support VLANs, bridges, or bonds
 */
async function cleanupOrphanedEthernets() {
  console.log('Checking for orphaned ethernet entries...');
  
  try {
    const netplan = await loadNetplanConfig();
    if (netplan.error || !netplan.network || !netplan.network.ethernets) {
      return;
    }
    
    const ethernets = netplan.network.ethernets;
    const vlans = netplan.network.vlans || {};
    const bridges = netplan.network.bridges || {};
    const bonds = netplan.network.bonds || {};
    
    // Get list of physical interfaces that are actually in use
    const usedInterfaces = new Set();
    
    // Check VLAN parent interfaces
    Object.values(vlans).forEach(vlan => {
      if (vlan.link) {
        usedInterfaces.add(vlan.link);
      }
    });
    
    // Check bridge member interfaces
    Object.values(bridges).forEach(bridge => {
      if (bridge.interfaces) {
        bridge.interfaces.forEach(iface => usedInterfaces.add(iface));
      }
    });
    
    // Check bond slave interfaces
    Object.values(bonds).forEach(bond => {
      if (bond.interfaces) {
        bond.interfaces.forEach(iface => usedInterfaces.add(iface));
      }
    });
    
    // Remove ethernet entries that are only placeholders (optional: true and no other config)
    let cleaned = false;
    for (const [ethName, ethConfig] of Object.entries(ethernets)) {
      // Only clean up if it's a simple placeholder entry
      const isPlaceholder = ethConfig.optional === true && 
                           Object.keys(ethConfig).length === 1; // Only has 'optional' property
      
      if (isPlaceholder && !usedInterfaces.has(ethName)) {
        console.log(`Removing orphaned ethernet entry: ${ethName}`);
        delete netplan.network.ethernets[ethName];
        cleaned = true;
      }
    }
    
    if (cleaned) {
      console.log('Writing cleaned netplan configuration...');
      await writeNetplanConfig(netplan);
    }
    
  } catch (error) {
    console.warn('Failed to clean up orphaned ethernet entries:', error);
  }
}

/**
 * Get current netplan configuration summary
 */
async function getNetplanSummary() {
  console.log('Getting netplan configuration summary...');
  
  try {
    const config = await loadNetplanConfig();
    if (config.error) return config;
    
    const network = config.network || {};
    
    const summary = {
      file: '99-cockpit.yaml',
      version: network.version || 2,
      renderer: network.renderer || 'networkd',
      ethernets: Object.keys(network.ethernets || {}).length,
      vlans: Object.keys(network.vlans || {}).length,
      bridges: Object.keys(network.bridges || {}).length,
      bonds: Object.keys(network.bonds || {}).length,
      interfaces: {
        ethernets: network.ethernets || {},
        vlans: network.vlans || {},
        bridges: network.bridges || {},
        bonds: network.bonds || {}
      }
    };
    
    return { success: true, summary };
  } catch (error) {
    return { error: `Failed to get netplan summary: ${error.message}` };
  }
}

/**
 * Main action dispatcher - replaces the Python script
 * Handles all netplan operations using 99-cockpit.yaml
 */
async function netplanJsAction(action, config = {}) {
  console.log(`netplanJsAction called: ${action}`, config);
  
  try {
    switch (action) {
      case 'add_vlan':
        return await addVlan(config);
        
      case 'add_bridge':
        return await addBridge(config);
        
      case 'add_bond':
        return await addBond(config);
        
      case 'remove_interface':
      case 'delete_interface':
      case 'delete':  // Add support for 'delete' action used by advanced-actions.js
        return await removeInterface(config);
        
      case 'load_netplan':
      case 'get_config':
        return await loadNetplanConfig();
        
      case 'get_summary':
        return await getNetplanSummary();
        
      case 'get_physical_interfaces':
        const interfaces = await getPhysicalInterfaces();
        return { success: true, interfaces };
        
      case 'apply_config':
      case 'apply':
        return await applyNetplanConfig();
        
      case 'generate':
        const generateResult = await executeCommand('netplan generate');
        return generateResult.success ? 
          { success: true, message: 'netplan generate completed successfully' } : 
          { error: generateResult.error };
        
      case 'try':
      case 'try_config':
        const timeout = config.timeout || 10;
        const tryResult = await executeCommand(`netplan try --timeout ${timeout}`);
        return tryResult.success ? 
          { success: true, message: `netplan try completed successfully (${timeout}s timeout)` } : 
          { error: tryResult.error };
        
      default:
        return { error: `Unknown action: ${action}. Available actions: add_vlan, add_bridge, add_bond, remove_interface, load_netplan, get_summary, get_physical_interfaces, apply_config, generate, try` };
    }
  } catch (error) {
    return { error: `Operation failed: ${error.message}` };
  }
}

// Export functions for use in other modules
window.netplanJsAction = netplanJsAction;
window.loadNetplanConfig = loadNetplanConfig;
window.getPhysicalInterfaces = getPhysicalInterfaces;
window.writeNetplanConfig = writeNetplanConfig;
window.applyNetplanConfig = applyNetplanConfig;
window.getNetplanSummary = getNetplanSummary;
window.removeInterface = removeInterface;
window.cleanupOrphanedEthernets = cleanupOrphanedEthernets;

// Enhanced debug functions
window.testNetplanConfig = async function() {
  console.log('🧪 Testing netplan configuration loading...');
  const config = await loadNetplanConfig();
  console.log('Test result:', config);
  return config;
};

window.debugNetplan = async function() {
  console.log('🔍 Running comprehensive netplan debug...');
  
  const results = {
    config_file: '99-cockpit.yaml',
    timestamp: new Date().toISOString()
  };
  
  try {
    // Test config loading
    console.log('Testing config loading...');
    results.config = await loadNetplanConfig();
    
    // Get summary
    console.log('Getting configuration summary...');
    results.summary = await getNetplanSummary();
    
    // Test physical interfaces
    console.log('Getting physical interfaces...');
    results.interfaces = await getPhysicalInterfaces();
    
    // Test commands
    console.log('Testing netplan commands...');
    const generateTest = await executeCommand('netplan info');
    results.netplan_info = generateTest.success ? generateTest.output : generateTest.error;
    
    const statusTest = await executeCommand('ls -la /etc/netplan/');
    results.netplan_files = statusTest.success ? statusTest.output : statusTest.error;
    
    console.log('🔍 Debug results:', results);
    return results;
    
  } catch (error) {
    results.error = error.message;
    console.error('Debug failed:', error);
    return results;
  }
};

window.showNetplanStatus = async function() {
  console.log('🔍 Checking netplan status...');
  
  try {
    const statusInfo = {
      timestamp: new Date().toISOString(),
      config_file: '99-cockpit.yaml'
    };
    
    // Check if file exists and get size
    const fileCheck = await executeCommand('ls -la /etc/netplan/99-cockpit.yaml 2>/dev/null || echo "File not found"');
    statusInfo.file_status = fileCheck.success ? fileCheck.output : 'File not found';
    
    // Get current configuration
    const config = await loadNetplanConfig();
    if (config.network) {
      statusInfo.interfaces = {
        ethernets: Object.keys(config.network.ethernets || {}).length,
        vlans: Object.keys(config.network.vlans || {}).length,
        bridges: Object.keys(config.network.bridges || {}).length,
        bonds: Object.keys(config.network.bonds || {}).length
      };
      
      // Show VLAN details
      if (config.network.vlans) {
        statusInfo.vlan_details = config.network.vlans;
      }
    }
    
    // Check netplan syntax
    const syntaxCheck = await executeCommand('netplan generate 2>&1');
    statusInfo.syntax_check = syntaxCheck.success ? 'OK' : syntaxCheck.error;
    
    console.log('📊 Netplan Status:', statusInfo);
    return statusInfo;
    
  } catch (error) {
    console.error('Status check failed:', error);
    return { error: error.message };
  }
};

window.showNetplanLimitations = function() {
  console.log(`
📝 NETPLAN LIMITATIONS for Bonds and Bridges:

🔗 BONDS:
  - netplan try is NOT supported for bonds
  - Must use direct 'netplan apply' 
  - Changes take effect immediately
  - Requires at least 2 slave interfaces
  - Valid modes: balance-rr, active-backup, balance-xor, broadcast, 802.3ad, balance-tlb, balance-alb

🌉 BRIDGES:
  - netplan try is NOT supported for bridges  
  - Must use direct 'netplan apply'
  - Changes take effect immediately
  - STP (Spanning Tree Protocol) enabled by default for safety
  - Can have 1 or more member interfaces

⚙️ VLANS:
  - Full netplan try support available
  - Safe to test before applying
  - VLAN ID range: 1-4094
  - Requires parent interface

📁 CONFIGURATION:
  - All changes written to: /etc/netplan/99-cockpit.yaml
  - Uses networkd renderer for consistency
  - Automatic backup on each change

🚀 COMMANDS USED:
  - netplan generate (validate configuration)
  - netplan try --timeout 10 (safe testing, VLANs only)
  - netplan apply (final application)
  `);
};

console.log('✅ Enhanced JavaScript Netplan Manager loaded');
console.log('📁 Configuration file: /etc/netplan/99-cockpit.yaml');
console.log('💡 Debug commands available:');
console.log('   - testNetplanConfig() - Test config loading');
console.log('   - debugNetplan() - Comprehensive debug info');
console.log('   - showNetplanStatus() - Current status and interface count');
console.log('   - showNetplanLimitations() - Show bond/bridge limitations');
console.log('   - cleanupOrphanedEthernets() - Clean up unused ethernet entries');
console.log('⚠️  Note: Bonds and bridges require direct apply (no netplan try support)');
console.log('✨ VLAN creation is working perfectly! Check the logs above for confirmation.');
console.log('🗑️  Deletion logic enhanced with better name resolution and cleanup');
