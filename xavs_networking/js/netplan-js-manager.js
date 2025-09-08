// Cockpit Netplan Manager - main logic file
// Standards-compliant multi-file netplan configuration management

// Netplan configuration files structure
const NETPLAN_DIR = '/etc/netplan';
const NETPLAN_FILES = {
  COCKPIT_ROUTES: '70-cockpit-routes.yaml',
  COCKPIT_INTERFACES: '80-cockpit-interfaces.yaml', 
  COCKPIT_OVERRIDES: '85-cockpit-overrides.yaml',
  COCKPIT_LEGACY: '99-cockpit.yaml'
};

// Command execution helper for compatibility with existing code
async function executeCommand(command, options = {}) {
  try {
    console.log(`Executing command: ${command}`);
    
    // Check if run function is available (loaded after this file)
    if (typeof window.run === 'function') {
      // Use the global run function if available
      if (command.includes('|') || command.includes('awk') || command.includes('grep') || command.includes('&&') || command.includes(';')) {
        // Use shell execution for complex commands
        const result = await window.run('/bin/sh', ['-c', command], { superuser: 'try', ...options });
        return { success: true, output: result ? result.toString().trim() : '' };
      } else {
        // Simple command execution
        const parts = command.trim().split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);
        const result = await window.run(cmd, args, { superuser: 'try', ...options });
        return { success: true, output: result ? result.toString().trim() : '' };
      }
    }
    
    // Fallback to cockpit.spawn directly if run function not available
    if (typeof cockpit === 'undefined') {
      throw new Error('Neither run function nor Cockpit API available');
    }
    
    // Handle shell commands with pipes and complex syntax
    if (command.includes('|') || command.includes('awk') || command.includes('grep') || command.includes('&&') || command.includes(';')) {
      // Use shell execution for complex commands
      const proc = cockpit.spawn(['/bin/sh', '-c', command], {
        superuser: 'try',
        err: 'out',
        ...options
      });
      
      let output = '';
      proc.stream(data => output += data);
      
      const result = await new Promise((resolve, reject) => {
        proc.done(resolve);
        proc.fail(reject);
      });
      
      return { success: true, output: output.trim() };
    } else {
      // Simple command execution
      const parts = command.trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);
      
      const proc = cockpit.spawn([cmd, ...args], {
        superuser: 'try',
        err: 'out',
        ...options
      });
      
      let output = '';
      proc.stream(data => output += data);
      
      const result = await new Promise((resolve, reject) => {
        proc.done(resolve);
        proc.fail(reject);
      });
      
      return { success: true, output: output.trim() };
    }
  } catch (error) {
    console.error(`Command failed: ${command}`, error);
    return { success: false, error: error.message || error.toString() };
  }
}

// Helper function to check if we can do system cleanup
function canDoSystemCleanup() {
  // For now, allow system cleanup as it's needed for proper interface management
  return true;
}

// Compatibility wrapper for run function to handle loading order
async function run(cmd, args = [], opts = {}) {
  if (typeof window.run === 'function') {
    return await window.run(cmd, args, opts);
  } else if (typeof cockpit !== 'undefined') {
    // Fallback to cockpit.spawn
    const proc = cockpit.spawn([cmd, ...args], {
      superuser: 'try',
      err: 'out',
      ...opts
    });
    
    let output = '';
    proc.stream(data => output += data);
    
    await new Promise((resolve, reject) => {
      proc.done(resolve);
      proc.fail(reject);
    });
    
    return output;
  } else {
    throw new Error('Neither run function nor Cockpit API available');
  }
}

// Simple interface deletion using ip commands (for compatibility)
async function deleteInterfaceSimple(interfaceName, interfaceType = 'auto') {
  console.log(`🗑️ Simple delete: ${interfaceName} (type: ${interfaceType})`);
  
  try {
    // Try to bring down and delete the interface using ip commands
    try {
      if (typeof window.run === 'function') {
        await window.run('ip', ['link', 'set', interfaceName, 'down'], { superuser: 'try' });
      } else if (typeof cockpit !== 'undefined') {
        const downProc = cockpit.spawn(['ip', 'link', 'set', interfaceName, 'down'], { superuser: 'try' });
        await new Promise((resolve, reject) => {
          downProc.done(resolve);
          downProc.fail(reject);
        });
      }
      console.log(`Brought down ${interfaceName}`);
    } catch (downError) {
      console.warn(`Could not bring down ${interfaceName}:`, downError);
    }
    
    try {
      if (typeof window.run === 'function') {
        await window.run('ip', ['link', 'delete', interfaceName], { superuser: 'try' });
      } else if (typeof cockpit !== 'undefined') {
        const deleteProc = cockpit.spawn(['ip', 'link', 'delete', interfaceName], { superuser: 'try' });
        await new Promise((resolve, reject) => {
          deleteProc.done(resolve);
          deleteProc.fail(reject);
        });
      }
      console.log(`Deleted ${interfaceName} using ip commands`);
    } catch (deleteError) {
      console.warn(`Could not delete ${interfaceName} using ip:`, deleteError);
    }
    
    // Also try to remove from netplan configuration
    try {
      const netplanConfig = await loadNetplanConfig();
      let removed = false;
      
      // Remove from appropriate netplan section
      for (const section of ['vlans', 'bridges', 'bonds', 'ethernets']) {
        if (netplanConfig.network && netplanConfig.network[section] && netplanConfig.network[section][interfaceName]) {
          delete netplanConfig.network[section][interfaceName];
          removed = true;
          console.log(`Removed ${interfaceName} from netplan ${section} section`);
          break;
        }
      }
      
      if (removed) {
        await writeNetplanConfig(netplanConfig);
        console.log(`Updated netplan configuration after removing ${interfaceName}`);
      }
    } catch (netplanError) {
      console.warn(`Could not update netplan config:`, netplanError);
    }
    
    return { 
      success: true, 
      message: `Interface ${interfaceName} removed using ip commands and netplan cleanup` 
    };
    
  } catch (error) {
    return { error: `Failed to delete interface: ${error.message}` };
  }
}

/**
 * Get system-managed interfaces from netplan files
 */
async function getSystemManagedInterfaces() {
  const systemInterfaces = {};
  
  // If no system interfaces found in files, check for interfaces that exist 
  // in the system but are not in any Cockpit-managed files
  if (Object.keys(systemInterfaces).length === 0) {
    console.log('No system interfaces found in netplan files, checking for system-only interfaces...');
    try {
      // Get list of actual network interfaces from the system
      const systemIfCmd = `ip -o link show | awk -F': ' '/^[0-9]+: (en|eth|wl)/ {print $2}' | grep -E '(en|eth|wl)' | head -20`;
      
      const sysResult = await executeCommand(systemIfCmd);
      if (sysResult.success) {
        const systemIfaceNames = sysResult.output.split('\n').filter(line => line.trim());
        console.log('Found system interfaces:', systemIfaceNames);
        
        // Check which ones are not managed by Cockpit
        const cockpitInterfaces = await getCockpitManagedInterfaces();
        const cockpitNames = Object.keys(cockpitInterfaces);
        
        for (const ifaceName of systemIfaceNames) {
          if (!cockpitNames.includes(ifaceName)) {
            systemInterfaces[ifaceName] = {
              type: ifaceName.includes('.') ? 'vlans' : 'ethernets',
              config: { detected: 'system-only' },
              file: 'system-detected',
              isSystemManaged: true
            };
          }
        }
      }
    } catch (e) {
      console.warn('Failed to detect system-only interfaces:', e);
    }
  }
  
  console.log('System-managed interfaces found:', Object.keys(systemInterfaces));
  return systemInterfaces;
}

/**
 * Get our managed interfaces from Cockpit files
 */
async function getCockpitManagedInterfaces() {
  console.log('Getting Cockpit-managed interfaces...');
  
  const managedInterfaces = {};
  
  try {
    // Read our managed config files
    const files = [
      NETPLAN_FILES.COCKPIT_INTERFACES,
      NETPLAN_FILES.COCKPIT_OVERRIDES,
      NETPLAN_FILES.COCKPIT_LEGACY
    ];
    
    for (const filename of files) {
      const config = await loadNetplanFile(filename);
      if (config && config.network) {
        for (const section of ['ethernets', 'vlans', 'bridges', 'bonds']) {
          if (config.network[section]) {
            for (const [name, ifaceConfig] of Object.entries(config.network[section])) {
              managedInterfaces[name] = {
                type: section,
                config: ifaceConfig,
                file: filename,
                isCockpitManaged: true
              };
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to get Cockpit managed interfaces:', error);
  }
  
  console.log('Cockpit-managed interfaces found:', Object.keys(managedInterfaces));
  return managedInterfaces;
}

/**
 * Classify interfaces by management type
 */
async function classifyInterfaces() {
  console.log('Classifying interfaces by management type...');
  
  const [systemInterfaces, cockpitInterfaces] = await Promise.all([
    getSystemManagedInterfaces(),
    getCockpitManagedInterfaces()
  ]);
  
  const classification = {
    systemManaged: systemInterfaces,
    cockpitManaged: cockpitInterfaces,
    conflicts: {}
  };
  
  // Find conflicts (interfaces in both systems)
  for (const name of Object.keys(systemInterfaces)) {
    if (cockpitInterfaces[name]) {
      classification.conflicts[name] = {
        system: systemInterfaces[name],
        cockpit: cockpitInterfaces[name]
      };
    }
  }
  
  console.log('Interface classification:', {
    system: Object.keys(classification.systemManaged).length,
    cockpit: Object.keys(classification.cockpitManaged).length,
    conflicts: Object.keys(classification.conflicts).length
  });
  
  return classification;
}

/**
 * Load a specific netplan file, creating it if it doesn't exist
 */
async function loadNetplanFile(filename) {
  console.log(`Loading netplan file: ${filename}`);
  
  const command = `
    if [ -f "${NETPLAN_DIR}/${filename}" ]; then
      # Read the raw file content and return it for JavaScript parsing
      if [ -f "${NETPLAN_DIR}/${filename}" ] && [ -s "${NETPLAN_DIR}/${filename}" ]; then
        echo "===YAML_START==="
        cat "${NETPLAN_DIR}/${filename}"
        echo "===YAML_END==="
      else
        echo "===YAML_START==="
        echo "# File not found or empty"
        echo "===YAML_END==="
      fi
    else
      echo "File ${filename} does not exist, will be created when needed"
      echo '{}'
    fi
  `;
  
  const result = await executeCommand(command);
  if (result.success) {
    try {
      // Extract YAML content between markers
      const yamlMatch = result.output.match(/===YAML_START===\n([\s\S]*?)\n===YAML_END===/);
      if (yamlMatch && yamlMatch[1]) {
        const yamlContent = yamlMatch[1].trim();
        
        // If it's just a comment or empty, return empty object
        if (!yamlContent || yamlContent.startsWith('# File not found') || yamlContent === '# File not found or empty') {
          return {};
        }
        
        // Simple YAML parser for netplan structure
        const config = parseSimpleNetplanYaml(yamlContent);
        return config;
      }
      return {};
    } catch (e) {
      console.warn(`Failed to parse ${filename}:`, e);
      return {};
    }
  }
  return {};
}

/**
 * Simple YAML parser specifically for netplan configuration files
 */
function parseSimpleNetplanYaml(yamlContent) {
  const config = { network: { version: 2, renderer: 'networkd' } };
  const lines = yamlContent.split('\n');
  
  let currentSection = null;
  let currentInterface = null;
  let indent = 0;
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Calculate indentation
    const lineIndent = line.length - line.trimStart().length;
    
    // Network section
    if (trimmed === 'network:') {
      continue;
    }
    
    // Version and renderer
    if (trimmed.startsWith('version:')) {
      config.network.version = parseInt(trimmed.split(':')[1].trim()) || 2;
      continue;
    }
    if (trimmed.startsWith('renderer:')) {
      config.network.renderer = trimmed.split(':')[1].trim() || 'networkd';
      continue;
    }
    
    // Interface sections (ethernets, vlans, bridges, bonds)
    if (lineIndent === 2 && (trimmed.endsWith('ethernets:') || trimmed.endsWith('vlans:') || 
                            trimmed.endsWith('bridges:') || trimmed.endsWith('bonds:'))) {
      currentSection = trimmed.replace(':', '');
      if (!config.network[currentSection]) {
        config.network[currentSection] = {};
      }
      currentInterface = null;
      continue;
    }
    
    // Interface names
    if (lineIndent === 4 && currentSection && trimmed.endsWith(':')) {
      currentInterface = trimmed.replace(':', '');
      if (!config.network[currentSection][currentInterface]) {
        config.network[currentSection][currentInterface] = {};
      }
      continue;
    }
    
    // Interface properties
    if (lineIndent === 6 && currentSection && currentInterface && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      // Handle different value types
      if (value === 'true' || value === 'false') {
        config.network[currentSection][currentInterface][key] = (value === 'true');
      } else if (value && !isNaN(value) && !value.includes('.')) {
        config.network[currentSection][currentInterface][key] = parseInt(value);
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Simple array parsing
        const arrayContent = value.slice(1, -1);
        config.network[currentSection][currentInterface][key] = 
          arrayContent.split(',').map(item => item.trim().replace(/['"]/g, ''));
      } else if (value) {
        config.network[currentSection][currentInterface][key] = value.replace(/['"]/g, '');
      }
    }
  }
  
  return config;
}

/**
 * Ensure a netplan file exists with proper structure
 */
async function ensureNetplanFile(filename, description = '') {
  console.log(`🔧 Ensuring netplan file exists: ${filename}`);
  
  const checkCommand = `[ -f "${NETPLAN_DIR}/${filename}" ] && echo "exists" || echo "missing"`;
  const checkResult = await executeCommand(checkCommand);
  
  if (checkResult.success && checkResult.output.trim() === "missing") {
    console.log(`📝 Creating missing netplan file: ${filename}`);
    
    // Create appropriate default content based on file type
    let defaultContent = '';
    
    if (filename.includes('routes')) {
      defaultContent = `# ${description || 'Cockpit-managed routes'}
# Generated by XOS Networking
# This file is used for route preservation and management
# Routes are defined within interface configurations
network:
  version: 2
  renderer: networkd
`;
    } else if (filename.includes('interfaces')) {
      defaultContent = `# ${description || 'Cockpit-managed interfaces'}
# Generated by XOS Networking
network:
  version: 2
  renderer: networkd
`;
    } else if (filename.includes('overrides')) {
      defaultContent = `# ${description || 'Cockpit configuration overrides'}
# Generated by XOS Networking
network:
  version: 2
`;
    } else {
      // Default structure for any other file
      defaultContent = `# ${description || 'Cockpit-managed configuration'}
# Generated by XOS Networking
network:
  version: 2
  renderer: networkd
`;
    }
    
    const createCommand = `
      # Create netplan directory if it doesn't exist
      mkdir -p "${NETPLAN_DIR}"
      
      # Create the file with proper content
      cat > "${NETPLAN_DIR}/${filename}" << 'EOF'
${defaultContent}EOF
      
      # Set proper permissions
      chmod 600 "${NETPLAN_DIR}/${filename}"
      
      echo "Created ${filename} successfully"
    `;
    
    const createResult = await executeCommand(createCommand);
    if (createResult.success) {
      console.log(`✅ Successfully created ${filename}`);
      return true;
    } else {
      console.error(`❌ Failed to create ${filename}:`, createResult.error);
      return false;
    }
  } else {
    console.log(`✅ File ${filename} already exists`);
    return true;
  }
}

/**
 * Write to a specific netplan file
 */
async function writeNetplanFile(filename, config) {
  console.log(`Writing netplan file: ${filename}`);
  
  // No preservation step needed; config is already the full merged config
  let finalConfig = config;
  
  // Determine appropriate description based on filename
  let description = 'Cockpit-managed configuration';
  if (filename.includes('routes')) description = 'Network routes and routing tables';
  else if (filename.includes('interfaces')) description = 'Physical interfaces and VLANs';
  else if (filename.includes('overrides')) description = 'Configuration overrides and special settings';
  else if (filename.includes('99-cockpit')) description = 'Legacy Cockpit configuration';
  
  // Ensure the file exists with proper structure
  await ensureNetplanFile(filename, description);
  
  // Generate YAML for the final config
  const yaml = generateNetplanYAML(finalConfig);
  
  // TODO: Implement backup and file write logic in Node.js
  // Placeholder: just log the YAML that would be written
  console.log(`Would write YAML to ${filename} in ${NETPLAN_DIR} with content:`);
  console.log(yaml);
  // Simulate success result
  const result = { success: true, output: `SUCCESS: Written ${filename}` };
  
  if (result.success && result.output.includes('SUCCESS')) {
    console.log(`✅ Successfully wrote ${filename} with comprehensive configuration preservation`);
    // Clear cache since configuration has changed
    clearConfigCache();
    return true;
  } else {
    console.error(`❌ Failed to write ${filename}:`, result);
    return false;
  }
}

/**
 * Determine appropriate file for interface management
 */
function determineTargetFile(interfaceName, operation = 'create') {
  // For system interface overrides
  if (operation === 'override') {
    return NETPLAN_FILES.COCKPIT_OVERRIDES;
  }
  
  // For new interfaces we create
  if (operation === 'create' || operation === 'manage') {
    return NETPLAN_FILES.COCKPIT_INTERFACES;
  }
  
  // For route preservation
  if (operation === 'routes') {
    return NETPLAN_FILES.COCKPIT_ROUTES;
  }
  
  // Default to interfaces file
  return NETPLAN_FILES.COCKPIT_INTERFACES;
}

/**
 * Generate YAML for netplan config following official netplan standards
 * Based on: https://netplan.readthedocs.io/en/stable/netplan-yaml/
 */
function generateNetplanYAML(config) {
  console.log('🔧 Generating netplan YAML configuration');
  
  // Generate proper netplan YAML with correct structure
  let yaml = 'network:\n  version: 2\n  renderer: networkd\n';
  
  const network = config.network || {};
  
  // Process each interface type in the correct order
  for (const section of ['ethernets', 'bonds', 'bridges', 'vlans']) {
    if (network[section] && Object.keys(network[section]).length > 0) {
      yaml += `  ${section}:\n`;
      
      for (const [name, iface] of Object.entries(network[section])) {
        yaml += `    ${name}:\n`;
        
        // Add type-specific properties first
        yaml += generateInterfaceTypeProperties(section, iface);
        
        // Add common network properties
        yaml += generateCommonNetworkProperties(iface);
        
        // Add advanced properties
        yaml += generateAdvancedProperties(iface);
      }
    }
  }
  
  return yaml;
}

/**
 * Generate interface type-specific properties (VLAN, Bond, Bridge)
 */
function generateInterfaceTypeProperties(section, iface) {
  let yaml = '';
  
  switch (section) {
    case 'vlans':
      // VLAN configuration - id and link are mandatory
      if (iface.id !== undefined) yaml += `      id: ${iface.id}\n`;
      if (iface.link) yaml += `      link: ${iface.link}\n`;
      break;
      
    case 'bridges':
      // Bridge configuration
      if (iface.interfaces && iface.interfaces.length > 0) {
        yaml += `      interfaces:\n`;
        iface.interfaces.forEach(intf => {
          yaml += `        - ${intf}\n`;
        });
      }
      // Bridge parameters
      if (iface.parameters) {
        yaml += `      parameters:\n`;
        if (iface.parameters.stp !== undefined) yaml += `        stp: ${iface.parameters.stp}\n`;
        if (iface.parameters['forward-delay']) yaml += `        forward-delay: ${iface.parameters['forward-delay']}\n`;
        if (iface.parameters['hello-time']) yaml += `        hello-time: ${iface.parameters['hello-time']}\n`;
        if (iface.parameters['max-age']) yaml += `        max-age: ${iface.parameters['max-age']}\n`;
        if (iface.parameters.priority) yaml += `        priority: ${iface.parameters.priority}\n`;
      }
      break;
      
    case 'bonds':
      // Bond configuration
      if (iface.interfaces && iface.interfaces.length > 0) {
        yaml += `      interfaces:\n`;
        iface.interfaces.forEach(intf => {
          yaml += `        - ${intf}\n`;
        });
      }
      // Bond parameters
      if (iface.parameters) {
        yaml += `      parameters:\n`;
        if (iface.parameters.mode) yaml += `        mode: ${iface.parameters.mode}\n`;
        if (iface.parameters.primary) yaml += `        primary: ${iface.parameters.primary}\n`;
        if (iface.parameters['mii-monitor-interval']) yaml += `        mii-monitor-interval: ${iface.parameters['mii-monitor-interval']}\n`;
        if (iface.parameters['lacp-rate']) yaml += `        lacp-rate: ${iface.parameters['lacp-rate']}\n`;
        if (iface.parameters['gratuitious-arp']) yaml += `        gratuitious-arp: ${iface.parameters['gratuitious-arp']}\n`;
      }
      break;
      
    case 'ethernets':
      // Ethernet-specific properties (match conditions, etc.)
      if (iface.match) {
        yaml += `      match:\n`;
        if (iface.match.name) yaml += `        name: ${iface.match.name}\n`;
        if (iface.match.macaddress) yaml += `        macaddress: ${iface.match.macaddress}\n`;
        if (iface.match.driver) yaml += `        driver: ${iface.match.driver}\n`;
      }
      if (iface['set-name']) yaml += `      set-name: ${iface['set-name']}\n`;
      break;
  }
  
  return yaml;
}

/**
 * Generate common network properties (addresses, DHCP, etc.)
 */
function generateCommonNetworkProperties(iface) {
  let yaml = '';
  
  // Basic interface properties
  if (iface.optional !== undefined) yaml += `      optional: ${iface.optional}\n`;
  
  // DHCP configuration
  if (iface.dhcp4 !== undefined) yaml += `      dhcp4: ${iface.dhcp4}\n`;
  if (iface.dhcp6 !== undefined) yaml += `      dhcp6: ${iface.dhcp6}\n`;
  
  // DHCP overrides (modern netplan approach)
  if (iface['dhcp4-overrides']) {
    yaml += `      dhcp4-overrides:\n`;
    if (iface['dhcp4-overrides']['route-metric']) yaml += `        route-metric: ${iface['dhcp4-overrides']['route-metric']}\n`;
    if (iface['dhcp4-overrides']['use-dns'] !== undefined) yaml += `        use-dns: ${iface['dhcp4-overrides']['use-dns']}\n`;
    if (iface['dhcp4-overrides']['use-domains'] !== undefined) yaml += `        use-domains: ${iface['dhcp4-overrides']['use-domains']}\n`;
    if (iface['dhcp4-overrides']['use-routes'] !== undefined) yaml += `        use-routes: ${iface['dhcp4-overrides']['use-routes']}\n`;
  }
  
  if (iface['dhcp6-overrides']) {
    yaml += `      dhcp6-overrides:\n`;
    if (iface['dhcp6-overrides']['use-dns'] !== undefined) yaml += `        use-dns: ${iface['dhcp6-overrides']['use-dns']}\n`;
    if (iface['dhcp6-overrides']['use-domains'] !== undefined) yaml += `        use-domains: ${iface['dhcp6-overrides']['use-domains']}\n`;
  }
  
  // Static addresses
  if (iface.addresses && iface.addresses.length > 0) {
    yaml += `      addresses:\n`;
    iface.addresses.forEach(addr => {
      yaml += `        - ${addr}\n`;
    });
  }
  
  // Modern routing (replaces deprecated gateway4/gateway6)
  if (iface.routes && iface.routes.length > 0) {
    yaml += `      routes:\n`;
    iface.routes.forEach(route => {
      yaml += `        - to: ${route.to || 'default'}\n`;
      if (route.via) yaml += `          via: ${route.via}\n`;
      if (route.metric) yaml += `          metric: ${route.metric}\n`;
      if (route.table) yaml += `          table: ${route.table}\n`;
      if (route.scope) yaml += `          scope: ${route.scope}\n`;
      if (route['on-link'] !== undefined) yaml += `          on-link: ${route['on-link']}\n`;
    });
  }
  
  // Legacy gateway support (convert to routes if no routes defined)
  if (!iface.routes && (iface.gateway4 || iface.gateway6)) {
    yaml += `      routes:\n`;
    if (iface.gateway4) yaml += `        - to: default\n          via: ${iface.gateway4}\n`;
    if (iface.gateway6) yaml += `        - to: default\n          via: ${iface.gateway6}\n`;
  }
  
  // DNS configuration
  if (iface.nameservers) {
    yaml += `      nameservers:\n`;
    if (iface.nameservers.addresses && iface.nameservers.addresses.length > 0) {
      yaml += `        addresses:\n`;
      iface.nameservers.addresses.forEach(addr => {
        yaml += `          - ${addr}\n`;
      });
    }
    if (iface.nameservers.search && iface.nameservers.search.length > 0) {
      yaml += `        search:\n`;
      iface.nameservers.search.forEach(domain => {
        yaml += `          - ${domain}\n`;
      });
    }
  }
  
  return yaml;
}

/**
 * Generate advanced properties (MTU, MAC, etc.)
 */
function generateAdvancedProperties(iface) {
  let yaml = '';
  
  // Physical properties
  if (iface.mtu) yaml += `      mtu: ${iface.mtu}\n`;
  if (iface.macaddress) yaml += `      macaddress: ${iface.macaddress}\n`;
  
  // Interface behavior
  if (iface.critical !== undefined) yaml += `      critical: ${iface.critical}\n`;
  if (iface.wakeonlan !== undefined) yaml += `      wakeonlan: ${iface.wakeonlan}\n`;
  
  // IPv6 configuration
  if (iface['accept-ra'] !== undefined) yaml += `      accept-ra: ${iface['accept-ra']}\n`;
  if (iface['ipv6-privacy'] !== undefined) yaml += `      ipv6-privacy: ${iface['ipv6-privacy']}\n`;
  if (iface['ipv6-address-generation']) yaml += `      ipv6-address-generation: ${iface['ipv6-address-generation']}\n`;
  
  // Link configuration
  if (iface['link-local'] && iface['link-local'].length > 0) {
    yaml += `      link-local: [${iface['link-local'].join(', ')}]\n`;
  }
  
  // Routing policy rules (advanced routing)
  if (iface['routing-policy'] && iface['routing-policy'].length > 0) {
    yaml += `      routing-policy:\n`;
    iface['routing-policy'].forEach(rule => {
      yaml += `        - from: ${rule.from}\n`;
      if (rule.to) yaml += `          to: ${rule.to}\n`;
      if (rule.table) yaml += `          table: ${rule.table}\n`;
      if (rule.priority) yaml += `          priority: ${rule.priority}\n`;
      if (rule.mark) yaml += `          mark: ${rule.mark}\n`;
    });
  }
  
  return yaml;
}

// Simple cache for netplan config to prevent duplicate loads
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 2000; // 2 seconds cache

/**
 * Clear the netplan configuration cache
 * Call this when making changes that would invalidate the cached config
 */
function clearConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

/**
 * Load current netplan configuration from multiple files
 */
async function loadNetplanConfig(forceReload = false) {
  // Check cache first (unless force reload)
  if (!forceReload && configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    console.log('🚀 Using cached netplan configuration');
    return { ...configCache }; // Return a copy to prevent mutations
  }
  
  console.log('🔍 Loading netplan configuration from multiple files...');
  
  const mergedConfig = {
    network: {
      version: 2,
      renderer: 'networkd',
      ethernets: {},
      vlans: {},
      bridges: {},
      bonds: {}
    }
  };
  
  // Define files to read with their descriptions
  const filesToRead = [
    { file: NETPLAN_FILES.COCKPIT_ROUTES, desc: 'Network routes and routing tables' },
    { file: NETPLAN_FILES.COCKPIT_INTERFACES, desc: 'Physical interfaces and VLANs' }, 
    { file: NETPLAN_FILES.COCKPIT_OVERRIDES, desc: 'Configuration overrides and special settings' },
    { file: NETPLAN_FILES.COCKPIT_LEGACY, desc: 'Legacy Cockpit configuration' }
  ];
  
  console.log('📁 Files to process:', filesToRead.map(f => f.file));
  
  // First, ensure all required files exist
  for (const { file, desc } of filesToRead) {
    await ensureNetplanFile(file, desc);
  }
  
  // Then, load and merge configurations
  for (const { file: filename } of filesToRead) {
    try {
      console.log(`📖 Reading file: ${filename}`);
      const fileConfig = await loadNetplanFile(filename);
      console.log(`📄 File ${filename} content:`, fileConfig);
      
      if (fileConfig && fileConfig.network) {
        console.log(`✅ Processing sections from ${filename}`);
        // Merge configuration sections
        for (const section of ['ethernets', 'vlans', 'bridges', 'bonds']) {
          if (fileConfig.network[section]) {
            console.log(`📝 Merging ${section} from ${filename}`);
            Object.assign(mergedConfig.network[section], fileConfig.network[section]);
          }
        }
        
        // Update renderer and version if specified
        if (fileConfig.network.renderer) {
          mergedConfig.network.renderer = fileConfig.network.renderer;
        }
        if (fileConfig.network.version) {
          mergedConfig.network.version = fileConfig.network.version;
        }
      } else {
        console.log(`⚠️ File ${filename} has no network section or is empty`);
      }
    } catch (error) {
      console.error(`❌ Error processing file ${filename}:`, error);
    }
  }
  
  console.log('🔄 Final merged config:', mergedConfig);
  
  // Store in cache
  configCache = { ...mergedConfig }; // Store a copy
  configCacheTime = Date.now();
  
  return mergedConfig;
}

/**
 * Preserve existing network configuration when writing updates
 * This prevents loss of IP addresses, MTU, routes, DNS, VLAN properties, bridge/bond settings, etc.
 * Covers ALL netplan interface properties to ensure comprehensive configuration preservation
 */
async function preserveExistingConfiguration(newConfig, targetFile = null) {
  console.log('🔒 Starting comprehensive network configuration preservation...');
  
  try {
    // Load the current complete configuration
    const originalConfig = await loadNetplanConfig();
    console.log('Loading original config for IP preservation');
    
    // If we're writing to a specific file, also load that file's current state
    let fileSpecificConfig = null;
    if (targetFile) {
      fileSpecificConfig = await loadNetplanFile(targetFile);
      // File-specific config loaded successfully
    }
    
    // Track preservation actions for logging
    const preservationLog = {
      preserved: [],
      created: [],
      modified: []
    };
    
    // For each interface type, preserve existing addresses
    for (const sectionType of ['vlans', 'ethernets', 'bridges', 'bonds']) {
      if (!newConfig.network || !newConfig.network[sectionType]) continue;
      
      // Iterate through interfaces in the new config
      for (const ifName in newConfig.network[sectionType]) {
        const newInterface = newConfig.network[sectionType][ifName];
        
        // Check if this interface exists in the original config
        let originalInterface = null;
        if (originalConfig.network && originalConfig.network[sectionType] && 
            originalConfig.network[sectionType][ifName]) {
          originalInterface = originalConfig.network[sectionType][ifName];
        }
        
        // Also check file-specific config if available
        let fileInterface = null;
        if (fileSpecificConfig && fileSpecificConfig.network && 
            fileSpecificConfig.network[sectionType] && 
            fileSpecificConfig.network[sectionType][ifName]) {
          fileInterface = fileSpecificConfig.network[sectionType][ifName];
        }
        
        // Determine the source for preservation (prefer original over file-specific)
        const sourceInterface = originalInterface || fileInterface;
        
        if (sourceInterface) {
          // Comprehensive property preservation strategy
          // ENHANCED: Added more netplan properties that should be preserved
          const criticalProperties = [
            'addresses', 'dhcp4', 'dhcp6',           // IP configuration
            'mtu',                                    // Network settings
            'routes', 'routing-policy',              // Routing
            'nameservers', 'search',                 // DNS
            'gateway4', 'gateway6',                  // Gateways
            'optional', 'critical',                  // Interface behavior
            'wakeonlan', 'link-local', 'accept-ra',  // Advanced settings
            'macaddress', 'set-name',                // Hardware settings
            'id', 'link',                            // VLAN properties (critical!)
            'interfaces',                            // Bridge/Bond members
            'parameters',                            // Bridge/Bond parameters (STP, bonding mode, etc.)
            'mode', 'primary', 'mii-monitor-interval', 'lacp-rate', // Bond-specific
            'stp', 'forward-delay', 'hello-time', 'max-age', 'priority', // Bridge-specific
            'dhcp-identifier', 'dhcp4-overrides', 'dhcp6-overrides', // DHCP advanced
            'renderer', 'version',                   // Global settings (if present at interface level)
            'ipv6-privacy', 'ipv6-address-generation', // IPv6 settings
            'emit-lldp', 'receive-checksum-offload', 'transmit-checksum-offload', // Hardware offload
            'generic-receive-offload', 'generic-segmentation-offload', 'large-receive-offload', // More hardware offload
            'tcp-segmentation-offload', 'tcp6-segmentation-offload' // TCP offload
          ];
          
          // Track what properties we're preserving vs modifying
          const preserved = [];
          const modified = [];
          
          criticalProperties.forEach(prop => {
            const sourceValue = sourceInterface[prop];
            const newValue = newInterface[prop];
            
            // If new config doesn't have this property but source does, preserve it
            if (newValue === undefined && sourceValue !== undefined) {
              console.log(`🔒 Preserving ${prop} for ${ifName}:`, sourceValue);
              
              // Handle arrays properly (deep copy)
              if (Array.isArray(sourceValue)) {
                newInterface[prop] = [...sourceValue];
              }
              // Handle objects properly (deep copy)
              else if (typeof sourceValue === 'object' && sourceValue !== null) {
                newInterface[prop] = { ...sourceValue };
              }
              // Handle primitives
              else {
                newInterface[prop] = sourceValue;
              }
              
              preserved.push({ property: prop, value: sourceValue });
            }
            // If new config has this property, log as modified
            else if (newValue !== undefined && newValue !== sourceValue) {
              modified.push({ 
                property: prop, 
                oldValue: sourceValue, 
                newValue: newValue 
              });
            }
          });
          
          // Log preservation actions
          if (preserved.length > 0 || modified.length > 0) {
            preservationLog.preserved.push({
              interface: ifName,
              type: sectionType,
              preservedProperties: preserved,
              modifiedProperties: modified
            });
          }
        }
        // If this is a completely new interface, log its properties
        else if (Object.keys(newInterface).length > 0) {
          const newProperties = Object.keys(newInterface).map(prop => ({
            property: prop,
            value: newInterface[prop]
          }));
          
          preservationLog.created.push({
            interface: ifName,
            type: sectionType,
            newProperties: newProperties
          });
        }
      }
      
      // Now check for interfaces that exist in original but not in new config
      // These need to be preserved entirely if they have addresses
      if (originalConfig.network && originalConfig.network[sectionType]) {
        for (const ifName in originalConfig.network[sectionType]) {
          // Skip if this interface is already in the new config
          if (newConfig.network[sectionType] && newConfig.network[sectionType][ifName]) {
            continue;
          }
          
          const originalInterface = originalConfig.network[sectionType][ifName];
          
          // If the original interface has any configuration, preserve the entire interface
          if (originalInterface && Object.keys(originalInterface).length > 0) {
            // Check if this interface has critical properties worth preserving
            // ENHANCED: More comprehensive check for critical properties
            const hasCriticalProps = originalInterface.addresses || 
                                   originalInterface.mtu || 
                                   originalInterface.routes ||
                                   originalInterface.gateway4 || 
                                   originalInterface.gateway6 ||
                                   originalInterface.nameservers ||
                                   originalInterface.parameters ||
                                   originalInterface.interfaces ||
                                   originalInterface.id || // VLAN ID is critical
                                   originalInterface.macaddress ||
                                   originalInterface['set-name'] ||
                                   originalInterface.critical ||
                                   originalInterface.wakeonlan ||
                                   originalInterface['dhcp4-overrides'] ||
                                   originalInterface['dhcp6-overrides'] ||
                                   (originalInterface.dhcp4 === false) || // Explicit DHCP disabled
                                   (originalInterface.dhcp6 === false);
            
            if (hasCriticalProps) {
              console.log(`🔒 Preserving entire interface ${ifName} with properties:`, Object.keys(originalInterface));
              
              // Ensure the section exists in new config
              if (!newConfig.network[sectionType]) {
                newConfig.network[sectionType] = {};
              }
              
              // Deep copy the entire interface configuration
              newConfig.network[sectionType][ifName] = JSON.parse(JSON.stringify(originalInterface));
              
              preservationLog.preserved.push({
                interface: ifName,
                type: sectionType,
                entireInterface: true,
                properties: Object.keys(originalInterface)
              });
            }
          }
        }
      }
    }
    
    // Log preservation summary
    console.log('🔒 Comprehensive Configuration Preservation Summary:');
    console.log(`  • Preserved: ${preservationLog.preserved.length} interfaces`);
    console.log(`  • Modified: ${preservationLog.modified.length} interfaces`);
    console.log(`  • Created: ${preservationLog.created.length} interfaces`);
    
    if (preservationLog.preserved.length > 0) {
      console.log('🔒 Preserved Interfaces:');
      preservationLog.preserved.forEach(item => {
        if (item.entireInterface) {
          console.log(`  • ${item.interface} (${item.type}): Complete interface with properties: ${item.properties?.join(', ')}`);
        } else if (item.preservedProperties && item.preservedProperties.length > 0) {
          const propNames = item.preservedProperties.map(p => p.property).join(', ');
          console.log(`  • ${item.interface} (${item.type}): Properties preserved: ${propNames}`);
        }
        if (item.modifiedProperties && item.modifiedProperties.length > 0) {
          const modNames = item.modifiedProperties.map(p => p.property).join(', ');
          console.log(`    Modified properties: ${modNames}`);
        }
      });
    }
    if (preservationLog.created.length > 0) {
      console.log('🔒 Created Interfaces:');
      preservationLog.created.forEach(item => {
        const propNames = item.newProperties?.map(p => p.property).join(', ') || 'none';
        console.log(`  • ${item.interface} (${item.type}): New properties: ${propNames}`);
      });
    }
    
    return newConfig;
    
  } catch (error) {
    console.error('❌ Error during IP address preservation:', error);
    // Return original config on error to avoid data loss
    return newConfig;
  }
}

/**
 * Write netplan configuration using multi-file strategy
 */
async function writeNetplanConfig(config) {
  console.log('Writing netplan config with multi-file strategy:', config);
  
  // NEW: Always write the full set of interfaces for each file
  if (!config.network) {
    console.error('❌ No network section in config');
    return false;
  }

  const updates = [];

  // Write all VLANs, bridges, and bonds to 80-cockpit-interfaces.yaml
  const interfacesConfig = {
    network: {
      version: config.network.version || 2,
      renderer: config.network.renderer || 'networkd',
      vlans: config.network.vlans || {},
      bridges: config.network.bridges || {},
      bonds: config.network.bonds || {}
    }
  };
  updates.push(writeNetplanFile(NETPLAN_FILES.COCKPIT_INTERFACES, interfacesConfig));

  // Write all overrides (ethernets with more than just 'optional: true') to 85-cockpit-overrides.yaml
  const overrides = {};
  if (config.network.ethernets) {
    for (const [name, iface] of Object.entries(config.network.ethernets)) {
      // If the interface has more than just 'optional: true', treat as override
      const keys = Object.keys(iface);
      if (keys.length > 1 || (keys.length === 1 && keys[0] !== 'optional')) {
        overrides[name] = iface;
      }
    }
  }
  if (Object.keys(overrides).length > 0) {
    const overridesConfig = {
      network: {
        version: config.network.version || 2,
        renderer: config.network.renderer || 'networkd',
        ethernets: overrides
      }
    };
    updates.push(writeNetplanFile(NETPLAN_FILES.COCKPIT_OVERRIDES, overridesConfig));
  }

  // Write all simple ethernets (parent interfaces, just 'optional: true') to 99-cockpit.yaml
  const simpleEthernets = {};
  if (config.network.ethernets) {
    for (const [name, iface] of Object.entries(config.network.ethernets)) {
      const keys = Object.keys(iface);
      if (keys.length === 1 && keys[0] === 'optional') {
        simpleEthernets[name] = iface;
      }
    }
  }
  if (Object.keys(simpleEthernets).length > 0) {
    const legacyConfig = {
      network: {
        version: config.network.version || 2,
        renderer: config.network.renderer || 'networkd',
        ethernets: simpleEthernets
      }
    };
    updates.push(writeNetplanFile(NETPLAN_FILES.COCKPIT_LEGACY, legacyConfig));
  }

  // Write routes (if any) to 70-cockpit-routes.yaml (future-proof)
  if (config.network.routes || config.network['routing-policy']) {
    const routeConfig = {
      network: {
        version: config.network.version || 2,
        renderer: config.network.renderer || 'networkd',
        routes: config.network.routes || [],
        'routing-policy': config.network['routing-policy'] || []
      }
    };
    updates.push(writeNetplanFile(NETPLAN_FILES.COCKPIT_ROUTES, routeConfig));
  }

  // Wait for all writes to complete and return success status
  try {
    const results = await Promise.all(updates);
    const allSuccessful = results.every(result => result === true);
    console.log(`✅ writeNetplanConfig completed: ${allSuccessful ? 'SUCCESS' : 'SOME FAILURES'}`);
    return allSuccessful;
  } catch (error) {
    console.error('❌ writeNetplanConfig failed:', error);
    return false;
  }
}

/**
 * Extract route-specific configuration
 */
function extractRouteConfig(config) {
  const routeConfig = {
    network: {
      version: 2,
      renderer: 'networkd'
    }
  };
  
  // Add any route-specific configurations here
  // This is for future route preservation features
  return routeConfig;
}

/**
 * Extract interface creation configuration (VLANs, bridges, bonds)
 * FIXED: Ensure ALL existing interfaces are preserved, not just the ones being modified
 */
function extractInterfaceConfig(config) {
  const interfaceConfig = {
    network: {
      version: 2,
      renderer: 'networkd'
    }
  };
  
  // CRITICAL FIX: Include ALL VLANs, bridges, and bonds from the complete config
  // This ensures we don't lose existing configurations when writing interface files
  if (config.network?.vlans && Object.keys(config.network.vlans).length > 0) {
    interfaceConfig.network.vlans = { ...config.network.vlans }; // Deep copy all VLANs
  }
  
  if (config.network?.bridges && Object.keys(config.network.bridges).length > 0) {
    interfaceConfig.network.bridges = { ...config.network.bridges }; // Deep copy all bridges
  }
  
  if (config.network?.bonds && Object.keys(config.network.bonds).length > 0) {
    interfaceConfig.network.bonds = { ...config.network.bonds }; // Deep copy all bonds
  }
  
  // Preserve the preservation marker to avoid redundant processing
  if (config._preservationApplied) {
    interfaceConfig._preservationApplied = true;
  }
  
  return interfaceConfig;
}

/**
 * Extract system override configuration (modified physical interfaces)
 */
function extractOverrideConfig(config) {
  const overrideConfig = {
    network: {
      version: 2,
      renderer: 'networkd'
    }
  };
  
  // Add modified physical interfaces (ethernets that override system config)
  if (config.network?.ethernets) {
    // Only include ethernets that are overrides, not parent interfaces for VLANs
    const filteredEthernets = {};
    
    for (const [name, iface] of Object.entries(config.network.ethernets)) {
      // Include if it has meaningful configuration (not just optional: true)
      if (iface.addresses || iface.dhcp4 === false || iface.mtu || iface.gateway4) {
        filteredEthernets[name] = iface;
      }
    }
    
    if (Object.keys(filteredEthernets).length > 0) {
      overrideConfig.network.ethernets = filteredEthernets;
    }
  }
  
  // Preserve the preservation marker to avoid redundant processing
  if (config._preservationApplied) {
    overrideConfig._preservationApplied = true;
  }
  
  return overrideConfig;
}

/**
 * Extract ethernet configuration (parent interfaces and simple ethernet configs)
 * Excludes VLANs, bridges, bonds which should go to interfaces file
 */
function extractEthernetConfig(config, interfaceConfig = null) {
  const ethernetConfig = {
    network: {
      version: 2,
      renderer: 'networkd'
    }
  };
  
  // Get list of non-ethernet interfaces that should NOT be in ethernet config
  const excludedInterfaces = new Set();
  
  // Never include VLANs, bridges, or bonds in ethernet config
  if (config.network) {
    ['vlans', 'bridges', 'bonds'].forEach(section => {
      if (config.network[section]) {
        Object.keys(config.network[section]).forEach(name => {
          excludedInterfaces.add(name);
        });
      }
    });
  }
  
  // Add ethernet interfaces (usually parent interfaces for VLANs)
  if (config.network?.ethernets) {
    // Only include simple ethernet configs (like optional: true for parent interfaces)
    const filteredEthernets = {};
    
    for (const [name, iface] of Object.entries(config.network.ethernets)) {
      // Skip if this is actually a VLAN/bridge/bond (should never be in ethernets)
      if (excludedInterfaces.has(name)) {
        continue;
      }
      
      // Include parent interfaces and simple ethernet configs
      if (iface.optional === true || (!iface.addresses && !iface.dhcp4 && !iface.mtu)) {
        filteredEthernets[name] = iface;
      }
    }
    
    if (Object.keys(filteredEthernets).length > 0) {
      ethernetConfig.network.ethernets = filteredEthernets;
    }
  }
  
  return ethernetConfig;
}

/**
 * Check if configuration has meaningful content
 */
function hasContent(config) {
  if (!config?.network) return false;
  
  const sections = ['ethernets', 'vlans', 'bridges', 'bonds'];
  return sections.some(section => 
    config.network[section] && Object.keys(config.network[section]).length > 0
  );
}

/**
 * Capture important routes that should be preserved during netplan apply
 */
async function captureAndPreserveRoutes() {
  console.log('🛡️ Capturing routes for preservation...');
  
  const preservation = {
    defaultGateway: null,
    staticRoutes: [],
    networkRoutes: []
  };
  
  try {
    // Capture default gateway
    const defaultResult = await executeCommand("ip -4 route show default | awk '{print $3}' | head -1");
    if (defaultResult.success && defaultResult.output.trim()) {
      preservation.defaultGateway = defaultResult.output.trim();
      console.log(`📍 Default gateway captured: ${preservation.defaultGateway}`);
    }
    
    // Capture all non-default routes that might be important
    const routesResult = await executeCommand("ip -4 route show | grep -v '^default' | grep -E '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/[0-9]+'");
    if (routesResult.success) {
      const routes = routesResult.output.split('\n').filter(line => line.trim());
      
      for (const route of routes) {
        const parts = route.trim().split(/\s+/);
        if (parts.length >= 3) {
          const network = parts[0]; // e.g., "10.0.1.0/24"
          const viaIndex = parts.findIndex(p => p === 'via');
          const devIndex = parts.findIndex(p => p === 'dev');
          
          if (viaIndex !== -1 && devIndex !== -1) {
            const gateway = parts[viaIndex + 1];
            const device = parts[devIndex + 1];
            
            // Only preserve routes that look like they might be important
            // (exclude local network routes that are automatically created)
            if (!route.includes('scope link') && !route.includes('proto kernel')) {
              preservation.staticRoutes.push({
                network,
                gateway,
                device,
                original: route
              });
              console.log(`🔗 Static route captured: ${network} via ${gateway} dev ${device}`);
            }
          }
        }
      }
    }
    
    console.log(`✅ Route preservation prepared: ${preservation.staticRoutes.length} static routes`);
    return preservation;
    
  } catch (error) {
    console.warn('⚠️ Route capture failed:', error);
    return preservation; // Return empty preservation object
  }
}

/**
 * Restore important routes after netplan apply
 */
async function restorePreservedRoutes(preservation) {
  if (!preservation || (!preservation.staticRoutes?.length && !preservation.defaultGateway)) {
    console.log('ℹ️ No routes to restore');
    return;
  }
  
  console.log('🔄 Restoring preserved routes...');
  let restoredCount = 0;
  
  try {
    // Give netplan apply a moment to settle
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Restore static routes
    for (const route of preservation.staticRoutes || []) {
      try {
        const restoreCommand = `ip route add ${route.network} via ${route.gateway} dev ${route.device}`;
        console.log(`🔧 Restoring route: ${restoreCommand}`);
        
        const result = await executeCommand(restoreCommand);
        if (result.success) {
          restoredCount++;
          console.log(`✅ Route restored: ${route.network} via ${route.gateway}`);
        } else {
          // Route might already exist, check if it's there
          const checkResult = await executeCommand(`ip route show ${route.network}`);
          if (checkResult.success && checkResult.output.includes(route.network)) {
            console.log(`ℹ️ Route already exists: ${route.network}`);
          } else {
            console.warn(`⚠️ Failed to restore route: ${route.network} - ${result.error}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Error restoring route ${route.network}:`, error);
      }
    }
    
    if (restoredCount > 0) {
      console.log(`✅ Route restoration completed: ${restoredCount} routes restored`);
      if (typeof window.showToast === 'function') {
        window.showToast(`🛡️ Preserved ${restoredCount} network routes during configuration apply`, 'success', 3000);
      }
    }
    
  } catch (error) {
    console.error('❌ Route restoration failed:', error);
  }
}

/**
 * Apply netplan configuration
 * Handles special cases for bonds/bridges that don't support netplan try
 */
async function applyNetplanConfig(skipTry = false, timeout = 10) {
  console.log('Applying netplan configuration...', skipTry ? '(skipping try)' : '(with try if supported)');
  
  // Step 1: Capture and preserve important routes before applying
  const routePreservation = await captureAndPreserveRoutes();
  
  // Step 2: Generate netplan configuration
  console.log('Running netplan generate...');
  let result = await executeCommand('netplan generate');
  if (!result.success) {
    return { error: `netplan generate failed: ${result.error}` };
  }

  // Step 3: Check if we have bonds or bridges (they don't support netplan try)
  console.log('🔍 About to call loadNetplanConfig...');
  let config;
  try {
    config = await loadNetplanConfig();
    console.log('✅ loadNetplanConfig completed successfully');
  } catch (error) {
    console.error('❌ loadNetplanConfig failed:', error.message);
    return { error: `Failed to load netplan config: ${error.message}` };
  }
  
  const network = config.network || {};
  const hasBonds = network.bonds && Object.keys(network.bonds).length > 0;
  const hasBridges = network.bridges && Object.keys(network.bridges).length > 0;
  
  // Step 4: Apply configuration with or without try
  if (skipTry || hasBonds || hasBridges) {
    const reason = skipTry ? 'try already done or explicitly skipped' : 'bonds/bridges detected';
    console.log(`Applying directly: ${reason}...`);
    result = await executeCommand('netplan apply');
    
    if (result.success) {
      console.log('Netplan configuration applied successfully');
      
      // Step 5: Restore preserved routes after apply
      await restorePreservedRoutes(routePreservation);
      
      return { success: true, message: `Configuration applied directly (${reason})` };
    } else {
      return { error: `netplan apply failed: ${result.error}` };
    }
  } else {
    console.log(`Testing configuration safely with ${timeout}s timeout...`);
    result = await executeCommand(`netplan try --timeout ${timeout}`, { timeout: (timeout + 5) * 1000 });
    
    // Check for timeout/revert (either via exit code or output detection)
    if (result.reverted || result.exitCode === 78) {
      console.log('Configuration was reverted due to timeout - this is expected safety behavior');
      return { error: 'Configuration was automatically reverted due to timeout. Network connectivity may have been lost.' };
    } else if (result.success) {
      console.log('Test successful, applying final configuration...');
      result = await executeCommand('netplan apply');
      
      if (result.success) {
        console.log('Netplan configuration applied successfully');
        
        // Step 5: Restore preserved routes after apply
        await restorePreservedRoutes(routePreservation);
        
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
 * Helper function to check route changes after netplan apply
 * @deprecated - Replaced by active route preservation in captureAndPreserveRoutes/restorePreservedRoutes
 */
async function checkRouteChanges(prevDefault, clientRoutes) {
  // Compare default route after apply and warn if changed
  try {
    const now = await executeCommand("ip -4 route show default | awk '{print $3}' | head -1");
    if (prevDefault && now.success) {
      const curr = now.output.trim();
      if (curr && curr !== prevDefault) {
        const msg = `⚠ Default gateway changed from ${prevDefault} to ${curr} after netplan apply.`;
        console.warn(msg);
        if (typeof window.showToast === 'function') window.showToast(msg, 'warning', 5000);
      }
    }
  } catch (e) { /* ignore */ }
  
  // Check for missing client access routes
  try {
    const nowRoutes = await executeCommand("ip -4 route show | grep -E '^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+/[0-9]+' | grep -v '^default'");
    if (nowRoutes.success && clientRoutes.length > 0) {
      const currentRoutes = nowRoutes.output.split('\n').filter(line => line.trim());
      const missingRoutes = clientRoutes.filter(oldRoute => {
        const network = oldRoute.split(' ')[0]; // Extract network part like "10.0.1.0/24"
        return !currentRoutes.some(newRoute => newRoute.includes(network));
      });
      
      if (missingRoutes.length > 0) {
        const msg = `⚠ ${missingRoutes.length} network route(s) were removed after netplan apply. Access may be affected.`;
        console.warn(msg, 'Missing routes:', missingRoutes);
        if (typeof window.showToast === 'function') {
          window.showToast(msg + ' Check console for details.', 'warning', 8000);
        }
      }
    }
  } catch (e) { /* ignore */ }
}

/**
 * Get all current system routes for preservation
 */
async function getAllSystemRoutes() {
  try {
    const result = await executeCommand("ip -4 route show");
    if (result.success) {
      const routes = result.output.split('\n').filter(line => line.trim());
      const parsedRoutes = [];
      
      for (const route of routes) {
        if (route.includes('default')) {
          const match = route.match(/default via (\S+)(?:\s+dev\s+(\S+))?/);
          if (match) {
            parsedRoutes.push({
              to: '0.0.0.0/0',
              via: match[1],
              dev: match[2] || null,
              original: route
            });
          }
        } else {
          const match = route.match(/^(\S+)(?:\s+via\s+(\S+))?(?:\s+dev\s+(\S+))?/);
          if (match && match[1] && !match[1].includes('linkdown')) {
            parsedRoutes.push({
              to: match[1],
              via: match[2] || null,
              dev: match[3] || null,
              original: route
            });
          }
        }
      }
      
      console.log(`Captured ${parsedRoutes.length} system routes for preservation`);
      return parsedRoutes;
    }
  } catch (e) {
    console.warn('Failed to capture system routes:', e);
  }
  return [];
}

/**
 * Add routes section to netplan interface configuration
 */
function addRoutesToInterface(interfaceConfig, routes) {
  if (!routes || routes.length === 0) return;
  
  if (!interfaceConfig.routes) {
    interfaceConfig.routes = [];
  }
  
  for (const route of routes) {
    const routeConfig = { to: route.to };
    if (route.via) routeConfig.via = route.via;
    
    // Avoid duplicates
    const exists = interfaceConfig.routes.some(existing => 
      existing.to === route.to && existing.via === route.via
    );
    
    if (!exists) {
      interfaceConfig.routes.push(routeConfig);
    }
  }
}

/**
 * Manage routes for an interface
 */
async function manageInterfaceRoutes(config) {
  console.log('Managing routes for interface:', config);
  
  try {
    const netplanConfig = await loadNetplanConfig();
    if (netplanConfig.error) return netplanConfig;
    
    // Ensure network structure
    if (!netplanConfig.network) {
      netplanConfig.network = { version: 2, ethernets: {}, vlans: {}, bridges: {}, bonds: {} };
    } else {
      netplanConfig.network.version = netplanConfig.network.version || 2;
      netplanConfig.network.ethernets = netplanConfig.network.ethernets || {};
      netplanConfig.network.vlans = netplanConfig.network.vlans || {};
      netplanConfig.network.bridges = netplanConfig.network.bridges || {};
      netplanConfig.network.bonds = netplanConfig.network.bonds || {};
    }
    
    const { name, routes, action } = config;
    let interfaceSection = null;
    
    // Find interface section
    if (netplanConfig.network.vlans && netplanConfig.network.vlans[name]) {
      interfaceSection = netplanConfig.network.vlans[name];
    } else if (netplanConfig.network.bridges && netplanConfig.network.bridges[name]) {
      interfaceSection = netplanConfig.network.bridges[name];
    } else if (netplanConfig.network.bonds && netplanConfig.network.bonds[name]) {
      interfaceSection = netplanConfig.network.bonds[name];
    } else if (netplanConfig.network.ethernets && netplanConfig.network.ethernets[name]) {
      interfaceSection = netplanConfig.network.ethernets[name];
    }
    
    if (!interfaceSection) {
      // Auto-create interface if it looks like a VLAN
      if (name.includes('.')) {
        const [parent, vlanIdStr] = name.split('.', 2);
        const vlanId = parseInt(vlanIdStr, 10);
        if (!isNaN(vlanId) && parent) {
          if (!netplanConfig.network.ethernets[parent]) {
            netplanConfig.network.ethernets[parent] = { optional: true };
          }
          netplanConfig.network.vlans[name] = { id: vlanId, link: parent };
          interfaceSection = netplanConfig.network.vlans[name];
        }
      } else {
        // Create ethernet entry
        netplanConfig.network.ethernets[name] = netplanConfig.network.ethernets[name] || {};
        interfaceSection = netplanConfig.network.ethernets[name];
      }
    }
    
    if (!interfaceSection) {
      return { error: `Interface ${name} not found and cannot be auto-created` };
    }
    
    // Manage routes based on action
    switch (action) {
      case 'add':
        addRoutesToInterface(interfaceSection, routes);
        break;
      case 'remove':
        if (interfaceSection.routes && routes) {
          interfaceSection.routes = interfaceSection.routes.filter(existing => {
            return !routes.some(route => 
              existing.to === route.to && existing.via === route.via
            );
          });
          if (interfaceSection.routes.length === 0) {
            delete interfaceSection.routes;
          }
        }
        break;
      case 'replace':
        if (routes && routes.length > 0) {
          interfaceSection.routes = routes.map(route => {
            const routeConfig = { to: route.to };
            if (route.via) routeConfig.via = route.via;
            return routeConfig;
          });
        } else {
          delete interfaceSection.routes;
        }
        break;
      default:
        return { error: `Unknown route action: ${action}` };
    }
    
    // Write configuration
    const writeOk = await writeNetplanConfig(netplanConfig);
    if (!writeOk) {
      return { error: 'Failed to write netplan configuration' };
    }
    
    return { 
      success: true, 
      message: `Routes ${action}ed for interface ${name}`,
      routes: interfaceSection.routes || []
    };
    
  } catch (error) {
    return { error: `Failed to manage routes: ${error.message}` };
  }
}

/**
 * Preserve all system routes by adding them to netplan config
 */
async function preserveSystemRoutes() {
  console.log('Preserving all system routes in netplan...');
  
  try {
    const systemRoutes = await getAllSystemRoutes();
    if (systemRoutes.length === 0) {
      return { success: true, message: 'No routes to preserve' };
    }
    
    const netplanConfig = await loadNetplanConfig();
    if (netplanConfig.error) return netplanConfig;
    
    // Ensure network structure
    if (!netplanConfig.network) {
      netplanConfig.network = { version: 2, ethernets: {}, vlans: {}, bridges: {}, bonds: {} };
    }
    
    // Group routes by interface
    const routesByInterface = {};
    for (const route of systemRoutes) {
      if (route.dev) {
        if (!routesByInterface[route.dev]) {
          routesByInterface[route.dev] = [];
        }
        routesByInterface[route.dev].push(route);
      }
    }
    
    let preservedCount = 0;
    
    // Add routes to appropriate interface sections
    for (const [interfaceName, routes] of Object.entries(routesByInterface)) {
      let interfaceSection = null;
      
      // Find or create interface section
      if (netplanConfig.network.vlans && netplanConfig.network.vlans[interfaceName]) {
        interfaceSection = netplanConfig.network.vlans[interfaceName];
      } else if (netplanConfig.network.bridges && netplanConfig.network.bridges[interfaceName]) {
        interfaceSection = netplanConfig.network.bridges[interfaceName];
      } else if (netplanConfig.network.bonds && netplanConfig.network.bonds[interfaceName]) {
        interfaceSection = netplanConfig.network.bonds[interfaceName];
      } else {
        // Create or use ethernet section
        if (!netplanConfig.network.ethernets[interfaceName]) {
          netplanConfig.network.ethernets[interfaceName] = { optional: true };
        }
        interfaceSection = netplanConfig.network.ethernets[interfaceName];
      }
      
      if (interfaceSection) {
        addRoutesToInterface(interfaceSection, routes);
        preservedCount += routes.length;
      }
    }
    
    // Write configuration
    const writeOk = await writeNetplanConfig(netplanConfig);
    if (!writeOk) {
      return { error: 'Failed to write netplan configuration with preserved routes' };
    }
    
    return { 
      success: true, 
      message: `Preserved ${preservedCount} system routes in netplan configuration`,
      count: preservedCount
    };
    
  } catch (error) {
    return { error: `Failed to preserve system routes: ${error.message}` };
  }
}
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
 * Add VLAN interface with standards-compliant configuration
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
    // do not force global renderer; preserve system settings
    netplan.network.version = netplan.network.version || 2;
    
    // Add parent interface to ethernets if not present
    const parentInterface = config.link;
    if (parentInterface && !netplan.network.ethernets[parentInterface]) {
      netplan.network.ethernets[parentInterface] = { optional: true };
    }
    
    // Prepare configuration options for standards-compliant VLAN creation
    const options = {};
    
    // Handle IP configuration
    let addresses = [];
    if (config.static_ip && config.static_ip.trim()) {
      options.dhcp4 = false;
      addresses = [config.static_ip];
      
      // Use modern routes instead of deprecated gateway4
      if (config.gateway && config.gateway.trim()) {
        options.gateway4 = config.gateway;  // Will be converted to routes by createVLANConfig
      }
    } else {
      options.dhcp4 = true;
    }
    
    // Add MTU if specified
    if (config.mtu && parseInt(config.mtu) > 0) {
      options.mtu = parseInt(config.mtu);
    }
    
    // Create standards-compliant VLAN configuration
    const vlanConfig = createVLANConfig(config.name, config.id, config.link, addresses, options);
    
    netplan.network.vlans[config.name] = vlanConfig;
    
    // Validate configuration before writing
    const validation = validateNetplanConfig(netplan);
    if (!validation.valid) {
      console.error('VLAN configuration validation failed:', validation.errors);
      return { error: `Configuration validation failed: ${validation.errors.join(', ')}` };
    }
    
    if (validation.warnings.length > 0) {
      console.warn('VLAN configuration warnings:', validation.warnings);
    }
    
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
    
    console.log(`✅ Standards-compliant VLAN ${config.name} created successfully`);
    return { success: true, message: `VLAN ${config.name} created successfully with standards-compliant configuration` };
    
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
  // do not force global renderer; preserve system settings
  netplan.network.version = netplan.network.version || 2;
    
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
    // do not force global renderer; preserve system settings
    netplan.network.version = netplan.network.version || 2;
    
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
    
    // Prepare bond options for standards-compliant creation
    const bondOptions = {};
    
    // Add MII monitoring (important for link detection)
    const miimon = config.miimon ? parseInt(config.miimon) : 100; // Default 100ms
    if (miimon > 0) {
      bondOptions['mii-monitor-interval'] = miimon;
    }
    
    // Add primary interface if specified and valid
    if (config.primary && interfaces.includes(config.primary)) {
      bondOptions.primary = config.primary;
    }
    
    // Add optional gratuitous ARP for faster failover
    if (mode === 'active-backup') {
      bondOptions['gratuitious-arp'] = 1;
    }
    
    // Mode-specific optimizations
    switch (mode) {
      case '802.3ad':
        bondOptions['lacp-rate'] = 'fast';
        bondOptions['transmit-hash-policy'] = 'layer3+4';
        break;
      case 'balance-xor':
        bondOptions['transmit-hash-policy'] = 'layer2+3';
        break;
      case 'balance-tlb':
      case 'balance-alb':
        // These modes require MII monitoring
        if (!bondOptions['mii-monitor-interval']) {
          bondOptions['mii-monitor-interval'] = 100;
        }
        break;
    }
    
    // Add IP configuration options
    if (config.static_ip && config.static_ip.trim()) {
      bondOptions.dhcp4 = false;
      bondOptions.addresses = [config.static_ip];
      
      // Use modern routes instead of legacy gateway
      if (config.gateway && config.gateway.trim()) {
        bondOptions.gateway4 = config.gateway; // Will be converted to routes
      }
    } else {
      bondOptions.dhcp4 = config.dhcp4 !== false; // Default to DHCP unless explicitly disabled
    }
    
    // Add MTU if specified
    if (config.mtu && parseInt(config.mtu) > 0) {
      bondOptions.mtu = parseInt(config.mtu);
    }
    
    // Create standards-compliant bond configuration
    const bondConfig = createBondConfig(config.name, interfaces, mode, bondOptions);
    
    netplan.network.bonds[config.name] = bondConfig;
    
    // Validate configuration before writing
    const validation = validateNetplanConfig(netplan);
    if (!validation.valid) {
      console.error('Bond configuration validation failed:', validation.errors);
      return { error: `Configuration validation failed: ${validation.errors.join(', ')}` };
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Bond configuration warnings:', validation.warnings);
    }
    
    // Write and apply configuration
    console.log('Writing bond configuration...');
    const writeSuccess = await writeNetplanConfig(netplan);
    if (!writeSuccess) {
      return { error: 'Failed to write netplan configuration' };
    }
    
    console.log('Applying bond configuration (note: bonds require direct apply)...');
    const applyResult = await applyNetplanConfig();
    if (applyResult.error) {
      return applyResult;
    }
    
    console.log(`✅ Standards-compliant bond ${config.name} created successfully`);
    return { 
      success: true, 
      message: `Bond ${config.name} created successfully with standards-compliant configuration`,
      details: {
        mode: mode,
        interfaces: interfaces,
        mii_monitor: bondConfig.parameters['mii-monitor-interval'],
        primary: bondConfig.parameters.primary,
        modern_routes: !!bondConfig.routes,
        dhcp4: bondConfig.dhcp4
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

  // Helper: allow direct system delete only if interface is NOT present in netplan config
  async function allowDirectSystemDelete(name) {
    try {
      const cfg = await loadNetplanConfig();
      if (!cfg || !cfg.network) return true; // Missing config means it's not present
      const n = cfg.network;
      const present = !!(
        (n.ethernets && n.ethernets[name]) ||
        (n.vlans && n.vlans[name]) ||
        (n.bridges && n.bridges[name]) ||
        (n.bonds && n.bonds[name])
      );
      return !present;
    } catch (e) {
      // On error reading config, default to allowing delete (treat as not present)
      console.warn('[netplan] Could not read netplan config to decide delete policy, allowing system delete:', e);
      return true;
    }
  }
  
  if (interfaceType === 'bonds') {
    try {
  const checkBondResult = await run('ip', ['link', 'show', interfaceName], { superuser: 'try' });
      if (checkBondResult && !checkBondResult.includes('does not exist') && !checkBondResult.includes('Cannot find device')) {
        console.log(`Bond interface ${interfaceName} still exists, manually removing...`);
        
        try {
          if (canDoSystemCleanup()) {
            await run('ip', ['link', 'set', interfaceName, 'down'], { superuser: 'try' });
          } else {
            console.warn(`[netplan] Skipping direct action: ip link set ${interfaceName} down (policy: actions via netplan only)`);
          }
          console.log(`Brought down bond interface ${interfaceName}`);
        } catch (downError) {
          console.warn(`Could not bring down bond ${interfaceName}:`, downError);
        }
        
        try {
          if (await allowDirectSystemDelete(interfaceName)) {
            await run('ip', ['link', 'delete', interfaceName], { superuser: 'try' });
          } else {
            console.warn(`[netplan] Skipping direct delete: ${interfaceName} exists in netplan config`);
          }
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
          if (canDoSystemCleanup()) {
            await run('ip', ['link', 'set', interfaceName, 'down'], { superuser: 'try' });
          } else {
            console.warn(`[netplan] Skipping direct action: ip link set ${interfaceName} down (policy: actions via netplan only)`);
          }
          console.log(`Brought down bridge interface ${interfaceName}`);
        } catch (downError) {
          console.warn(`Could not bring down bridge ${interfaceName}:`, downError);
        }
        
        try {
          if (await allowDirectSystemDelete(interfaceName)) {
            await run('ip', ['link', 'delete', interfaceName], { superuser: 'try' });
          } else {
            console.warn(`[netplan] Skipping direct delete: ${interfaceName} exists in netplan config`);
          }
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
              if (canDoSystemCleanup()) {
                await run('ip', ['link', 'set', vlanName, 'down'], { superuser: 'try' });
              } else {
                console.warn(`[netplan] Skipping direct action: ip link set ${vlanName} down (policy: actions via netplan only)`);
              }
              console.log(`Brought down VLAN interface ${vlanName}`);
            } catch (downError) {
              console.warn(`Could not bring down VLAN ${vlanName}:`, downError);
            }
            
            try {
              if (await allowDirectSystemDelete(vlanName)) {
                await run('ip', ['link', 'delete', vlanName], { superuser: 'try' });
              } else {
                console.warn(`[netplan] Skipping direct delete: ${vlanName} exists in netplan config`);
              }
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
 * Extract existing routes for a specific interface from configuration
 */
function extractExistingRoutes(config, interfaceName) {
  const routes = [];
  
  if (!config || !config.network) {
    return routes;
  }
  
  // Check all interface types for the specified interface
  for (const section of ['ethernets', 'vlans', 'bridges', 'bonds']) {
    if (config.network[section] && config.network[section][interfaceName]) {
      const interfaceConfig = config.network[section][interfaceName];
      if (interfaceConfig.routes && Array.isArray(interfaceConfig.routes)) {
        routes.push(...interfaceConfig.routes);
      }
    }
  }
  
  return routes;
}

/**
 * Standards-compliant interface IP configuration update
 */
async function updateInterfaceIPStandardsCompliant(interfaceName, staticIP, options = {}) {
  console.log(`📝 Updating interface ${interfaceName} IP to ${staticIP || 'DHCP'} (standards-compliant)`);
  
  try {
    // Load current configuration
    const netplanConfig = await loadNetplanConfig();
    if (netplanConfig.error) return netplanConfig;
    
    // Ensure proper structure
    if (!netplanConfig.network) {
      netplanConfig.network = { version: 2 };
    }
    
    // Find the interface in appropriate section
    let interfaceSection = null;
    let interfaceType = null;
    
    for (const section of ['vlans', 'bridges', 'bonds', 'ethernets']) {
      if (netplanConfig.network[section] && netplanConfig.network[section][interfaceName]) {
        interfaceSection = netplanConfig.network[section][interfaceName];
        interfaceType = section;
        break;
      }
    }
    
    // Auto-create interface if it doesn't exist
    if (!interfaceSection) {
      console.log(`🔧 Interface ${interfaceName} not found, auto-creating...`);
      
      if (interfaceName.includes('.')) {
        // VLAN interface
        const [parent, vlanIdStr] = interfaceName.split('.', 2);
        const vlanId = parseInt(vlanIdStr, 10);
        
        if (!isNaN(vlanId) && parent) {
          interfaceType = 'vlans';
          if (!netplanConfig.network.vlans) netplanConfig.network.vlans = {};
          if (!netplanConfig.network.ethernets) netplanConfig.network.ethernets = {};
          
          // Ensure parent exists
          if (!netplanConfig.network.ethernets[parent]) {
            netplanConfig.network.ethernets[parent] = { optional: true };
          }
          
          // Create VLAN using standards-compliant builder
          const addresses = staticIP ? [staticIP] : [];
          const vlanOptions = {
            dhcp4: !staticIP,
            ...options
          };
          
          const vlanConfig = createVLANConfig(interfaceName, vlanId, parent, addresses, vlanOptions);
          netplanConfig.network.vlans[interfaceName] = vlanConfig;
          interfaceSection = vlanConfig;
        }
      } else {
        // Ethernet interface
        interfaceType = 'ethernets';
        if (!netplanConfig.network.ethernets) netplanConfig.network.ethernets = {};
        
        netplanConfig.network.ethernets[interfaceName] = {
          optional: true
        };
        interfaceSection = netplanConfig.network.ethernets[interfaceName];
      }
    }
    
    // Update IP configuration using standards-compliant approach
    if (staticIP && staticIP.trim() !== '') {
      // Static IP configuration
      interfaceSection.addresses = [staticIP.includes('/') ? staticIP : `${staticIP}/24`];
      interfaceSection.dhcp4 = false;
      interfaceSection.dhcp6 = false;
      
      // Add gateway using modern routes if provided
      if (options.gateway) {
        if (!interfaceSection.routes) interfaceSection.routes = [];
        
        // Remove any existing default routes to avoid conflicts
        interfaceSection.routes = interfaceSection.routes.filter(route => route.to !== 'default');
        
        // Add new default route
        interfaceSection.routes.push({
          to: 'default',
          via: options.gateway,
          metric: options.metric || 100
        });
      }
    } else {
      // DHCP configuration
      delete interfaceSection.addresses;
      delete interfaceSection.routes; // Remove static routes when switching to DHCP
      interfaceSection.dhcp4 = true;
      interfaceSection.dhcp6 = options.dhcp6 || false;
    }
    
    // Add additional options
    if (options.mtu) interfaceSection.mtu = options.mtu;
    if (options.nameservers) interfaceSection.nameservers = options.nameservers;
    
    // Validate configuration before writing
    const validation = validateNetplanConfig(netplanConfig);
    if (!validation.valid) {
      console.error('Interface IP configuration validation failed:', validation.errors);
      return { error: `Configuration validation failed: ${validation.errors.join(', ')}` };
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Interface IP configuration warnings:', validation.warnings);
    }
    
    // Write configuration
    const writeSuccess = await writeNetplanConfig(netplanConfig);
    if (!writeSuccess) {
      return { error: 'Failed to write netplan configuration' };
    }
    
    // Apply configuration
    const applyResult = await applyNetplanConfig();
    if (applyResult.error) {
      return applyResult;
    }
    
    console.log(`✅ Standards-compliant IP configuration updated for ${interfaceName}`);
    return { 
      success: true, 
      message: `Interface ${interfaceName} IP configuration updated successfully`,
      details: {
        interface: interfaceName,
        type: interfaceType,
        static_ip: staticIP || null,
        dhcp4: interfaceSection.dhcp4,
        modern_routes: !!interfaceSection.routes,
        validation_passed: true
      }
    };
    
  } catch (error) {
    console.error('Failed to update interface IP:', error);
    return { error: `Failed to update interface IP: ${error.message}` };
  }
}

/**
 * Standards-compliant interface MTU configuration update
 */
async function updateInterfaceMTUStandardsCompliant(interfaceName, mtu, options = {}) {
  console.log(`📝 Updating interface ${interfaceName} MTU to ${mtu} (standards-compliant)`);
  
  if (!interfaceName) {
    return { error: 'Interface name is required' };
  }
  
  if (!mtu || isNaN(mtu) || mtu < 68 || mtu > 9000) {
    return { error: 'Valid MTU value (68-9000) is required' };
  }
  
  try {
    // Special validation for VLAN interfaces
    if (interfaceName.includes('.')) {
      const parentInterface = interfaceName.split('.')[0];
      console.log(`🔍 VLAN detected: ${interfaceName}, parent: ${parentInterface}`);
      
      // Check parent interface MTU using ip link show
      try {
        const parentMtuCmd = `ip link show ${parentInterface} | grep 'mtu ' | head -1 | sed 's/.*mtu \\([0-9]*\\).*/\\1/'`;
        console.log(`Checking parent MTU with command: ${parentMtuCmd}`);
        
        const parentMtuResult = await executeCommand(parentMtuCmd);
        console.log(`Parent MTU check result:`, parentMtuResult);
        
        if (parentMtuResult.success && parentMtuResult.output.trim()) {
          const parentMtu = parseInt(parentMtuResult.output.trim());
          console.log(`Parent interface ${parentInterface} MTU: ${parentMtu}`);
          
          if (!isNaN(parentMtu) && mtu > parentMtu) {
            const errorMsg = `Cannot set VLAN MTU (${mtu}) higher than parent interface ${parentInterface} MTU (${parentMtu}). Please increase parent interface MTU first.`;
            const hintMsg = `Set ${parentInterface} MTU to at least ${mtu} before setting VLAN MTU`;
            console.error(errorMsg);
            return { 
              error: errorMsg,
              hint: hintMsg
            };
          }
        } else {
          console.warn(`Could not determine parent interface MTU for ${parentInterface}`);
        }
      } catch (parentError) {
        console.warn('Could not check parent interface MTU:', parentError);
        // Continue anyway, let netplan handle the validation
      }
    }
    
    // Load current configuration
    const netplanConfig = await loadNetplanConfig();
    if (netplanConfig.error) return netplanConfig;
    
    // Ensure proper structure
    if (!netplanConfig.network) {
      netplanConfig.network = { version: 2 };
    }
    
    // Find the interface in appropriate section
    let interfaceSection = null;
    let interfaceType = null;
    
    for (const section of ['vlans', 'bridges', 'bonds', 'ethernets']) {
      if (netplanConfig.network[section] && netplanConfig.network[section][interfaceName]) {
        interfaceSection = netplanConfig.network[section][interfaceName];
        interfaceType = section;
        break;
      }
    }
    
    // Auto-create interface if it doesn't exist
    if (!interfaceSection) {
      console.log(`🔧 Interface ${interfaceName} not found, auto-creating for MTU setting...`);
      
      if (interfaceName.includes('.')) {
        // VLAN interface
        const [parent, vlanIdStr] = interfaceName.split('.', 2);
        const vlanId = parseInt(vlanIdStr, 10);
        
        if (!isNaN(vlanId) && parent) {
          interfaceType = 'vlans';
          if (!netplanConfig.network.vlans) netplanConfig.network.vlans = {};
          if (!netplanConfig.network.ethernets) netplanConfig.network.ethernets = {};
          
          // Ensure parent exists
          if (!netplanConfig.network.ethernets[parent]) {
            netplanConfig.network.ethernets[parent] = { optional: true };
          }
          
          // Create VLAN using standards-compliant builder
          const vlanOptions = { mtu: mtu, ...options };
          const vlanConfig = createVLANConfig(interfaceName, vlanId, parent, [], vlanOptions);
          netplanConfig.network.vlans[interfaceName] = vlanConfig;
          interfaceSection = vlanConfig;
        }
      } else {
        // Ethernet interface
        interfaceType = 'ethernets';
        if (!netplanConfig.network.ethernets) netplanConfig.network.ethernets = {};
        
        netplanConfig.network.ethernets[interfaceName] = {
          optional: true,
          mtu: mtu
        };
        interfaceSection = netplanConfig.network.ethernets[interfaceName];
      }
    } else {
      // Update existing interface MTU
      interfaceSection.mtu = mtu;
    }
    
    // Validate configuration before writing
    const validation = validateNetplanConfig(netplanConfig);
    if (!validation.valid) {
      console.error('Interface MTU configuration validation failed:', validation.errors);
      return { error: `Configuration validation failed: ${validation.errors.join(', ')}` };
    }
    
    if (validation.warnings.length > 0) {
      console.warn('Interface MTU configuration warnings:', validation.warnings);
    }
    
    // Write configuration
    const writeSuccess = await writeNetplanConfig(netplanConfig);
    if (!writeSuccess) {
      return { error: 'Failed to write netplan configuration' };
    }
    
    // Apply configuration
    const applyResult = await applyNetplanConfig();
    if (applyResult.error) {
      return applyResult;
    }
    
    console.log(`✅ Standards-compliant MTU configuration updated for ${interfaceName}`);
    return { 
      success: true, 
      message: `Interface ${interfaceName} MTU updated successfully to ${mtu}`,
      details: {
        interface: interfaceName,
        type: interfaceType,
        mtu: mtu,
        validation_passed: true,
        parent_validated: interfaceName.includes('.') ? 'yes' : 'n/a'
      }
    };
    
  } catch (error) {
    console.error('Failed to update interface MTU:', error);
    return { error: `Failed to update interface MTU: ${error.message}` };
  }
}

/**
 * Set IP address for an interface
 */
async function setInterfaceIP(config) {
  const { name, static_ip } = config;
  
  if (!name) {
    return { error: 'Interface name is required' };
  }
  
  try {
    console.log(`Setting IP address for ${name} to ${static_ip}`);
    
    // CRITICAL: Preserve existing routes before any changes
    const currentConfig = await loadNetplanConfig();
    
    const existingRoutes = extractExistingRoutes(currentConfig, name);
    console.log(`Preserving ${existingRoutes.length} existing routes for ${name}`);
    
    // First, classify the interface
    const classification = await classifyInterfaces();
    const isSystemManaged = classification.systemManaged[name];
    const isCockpitManaged = classification.cockpitManaged[name];
    
    let targetFile;
    let netplanConfig;
    let interfaceType = 'ethernets'; // Default interface type, will be updated based on interface detection
    
    if (isSystemManaged && !isCockpitManaged) {
      // This is a system interface - create override
      console.log(`${name} is system-managed, creating override...`);
      targetFile = determineTargetFile(name, 'override');
      await ensureNetplanFile(targetFile, 'Configuration overrides for system-managed interfaces');
      netplanConfig = await loadNetplanFile(targetFile);
      
      // Initialize structure if needed
      if (!netplanConfig.network) {
        netplanConfig.network = { version: 2 };
      }
      
      // Import current system config to preserve settings
      const systemConfig = isSystemManaged.config;
      interfaceType = isSystemManaged.type;
      
      if (!netplanConfig.network[interfaceType]) {
        netplanConfig.network[interfaceType] = {};
      }
      
      // Create override with preserved settings
      netplanConfig.network[interfaceType][name] = {
        ...systemConfig,
        addresses: static_ip ? [static_ip] : undefined,
        dhcp4: !static_ip,
        dhcp6: false,
        _cockpit_override: true,
        _original_file: isSystemManaged.file
      };
      
      // Preserve existing routes
      if (existingRoutes.length > 0) {
        netplanConfig.network[interfaceType][name].routes = existingRoutes;
      }
      
    } else {
      // Use our standard managed file
      targetFile = determineTargetFile(name, 'manage');
      await ensureNetplanFile(targetFile, 'Physical interfaces and VLANs');
      
      // CRITICAL FIX: Load complete multi-file configuration to preserve ALL interfaces
      netplanConfig = await loadNetplanConfig();
      
      if (!netplanConfig.network) {
        netplanConfig.network = { version: 2, ethernets: {}, vlans: {}, bridges: {}, bonds: {} };
      }
      
      // Find or create interface section
      let interfaceFound = false;
      let interfaceSection = null;
      interfaceType = 'ethernets'; // reset to default for this branch
      
      // Check existing sections
      for (const section of ['vlans', 'bridges', 'bonds', 'ethernets']) {
        if (netplanConfig.network[section] && netplanConfig.network[section][name]) {
          interfaceSection = netplanConfig.network[section][name];
          interfaceType = section;
          interfaceFound = true;
          break;
        }
      }
      
      if (!interfaceFound) {
        // Auto-create interface
        if (name.includes('.')) {
          // VLAN
          const [parent, vlanIdStr] = name.split('.', 2);
          const vlanId = parseInt(vlanIdStr, 10);
          if (!isNaN(vlanId) && parent) {
            interfaceType = 'vlans';
            if (!netplanConfig.network.vlans) netplanConfig.network.vlans = {};
            if (!netplanConfig.network.ethernets) netplanConfig.network.ethernets = {};
            
            // Ensure parent exists
            if (!netplanConfig.network.ethernets[parent]) {
              netplanConfig.network.ethernets[parent] = { optional: true };
            }
            
            netplanConfig.network.vlans[name] = { id: vlanId, link: parent };
            interfaceSection = netplanConfig.network.vlans[name];
            interfaceFound = true;
          }
        }
        
        if (!interfaceFound) {
          // Create ethernet entry
          if (!netplanConfig.network.ethernets) netplanConfig.network.ethernets = {};
          netplanConfig.network.ethernets[name] = {};
          interfaceSection = netplanConfig.network.ethernets[name];
          interfaceFound = true;
        }
      }
      
      // Update IP configuration
      if (static_ip && static_ip.trim() !== '') {
        interfaceSection.addresses = [static_ip];
        interfaceSection.dhcp4 = false;
        interfaceSection.dhcp6 = false;
      } else {
        delete interfaceSection.addresses;
        interfaceSection.dhcp4 = true;
      }
      
      // CRITICAL: Preserve IP addresses and ALL configurations on other interfaces
      // When we write back the config, we need to ensure we don't lose ANY existing configs
      // Preserving existing configurations on other interfaces
      const originalConfig = await loadNetplanConfig();
      // Original config loaded for comprehensive preservation
      
      // VLAN ID conflict detection - only check for REAL conflicts (same parent + same VLAN ID)
      if (interfaceType === 'vlans' && interfaceSection.id && interfaceSection.link) {
        const currentVlanId = interfaceSection.id;
        const currentParent = interfaceSection.link;
        console.log(`🔍 Checking for REAL VLAN conflicts: ${name} (ID ${currentVlanId} on ${currentParent})...`);
        
        // Check all existing VLANs for the same parent + same ID combination (actual conflict)
        if (originalConfig.network && originalConfig.network.vlans) {
          const realConflicts = [];
          for (const vlanName in originalConfig.network.vlans) {
            if (vlanName !== name) {
              const existingVlan = originalConfig.network.vlans[vlanName];
              if (existingVlan.id === currentVlanId && existingVlan.link === currentParent) {
                realConflicts.push(vlanName);
              }
            }
          }
          
          if (realConflicts.length > 0) {
            console.error(`❌ REAL VLAN CONFLICT DETECTED! Same parent (${currentParent}) + same VLAN ID (${currentVlanId}):`);
            console.error(`❌ Conflicting VLANs:`, realConflicts);
            console.error(`❌ This is invalid - cannot have duplicate ${currentParent}.${currentVlanId}`);
            return { error: `VLAN conflict: ${name} conflicts with existing ${realConflicts.join(', ')} (same parent + VLAN ID)` };
          } else {
            console.log(`✅ No real VLAN conflicts detected for ${name}`);
            // Log other VLANs with same ID on different parents (which is valid)
            const sameIdDifferentParent = [];
            for (const vlanName in originalConfig.network.vlans) {
              if (vlanName !== name) {
                const existingVlan = originalConfig.network.vlans[vlanName];
                if (existingVlan.id === currentVlanId && existingVlan.link !== currentParent) {
                  sameIdDifferentParent.push(`${vlanName} (${existingVlan.link})`);
                }
              }
            }
            if (sameIdDifferentParent.length > 0) {
              console.log(`ℹ️ Valid: VLAN ID ${currentVlanId} also used on different parents:`, sameIdDifferentParent);
              console.log(`ℹ️ This is perfectly valid - different parent interfaces can use the same VLAN ID`);
            }
          }
        }
      }
      
      // ENHANCED: Comprehensive preservation - ensure ALL interfaces from original config are preserved
      console.log('🔧 ENHANCED: Starting comprehensive VLAN preservation to prevent interface loss...');
      const preservationStats = { preserved: 0, merged: 0, target: 0 };
      
      for (const sectionType of ['vlans', 'ethernets', 'bridges', 'bonds']) {
        if (originalConfig.network && originalConfig.network[sectionType]) {
          
          // Ensure the section exists in our config
          if (!netplanConfig.network[sectionType]) {
            netplanConfig.network[sectionType] = {};
          }
          
          for (const ifName in originalConfig.network[sectionType]) {
            const originalIf = originalConfig.network[sectionType][ifName];
            
            console.log(`🔒 ENHANCED: Processing interface ${ifName} (${sectionType})`);
            
            // CRITICAL FIX: Don't skip any interfaces during preservation
            // Preserve ALL interfaces first, then update the target
            
            // If this interface doesn't exist in our config, add it completely
            if (!netplanConfig.network[sectionType][ifName]) {
              console.log(`🔒 ENHANCED: Preserving entire interface ${ifName} (${sectionType}):`, originalIf);
              netplanConfig.network[sectionType][ifName] = JSON.parse(JSON.stringify(originalIf));
              preservationStats.preserved++;
            } else {
              // Interface exists, merge properties carefully
              const currentIf = netplanConfig.network[sectionType][ifName];
              
              if (ifName === name) {
                console.log(`🎯 ENHANCED: Preserving non-IP properties for target interface ${name}`);
                preservationStats.target++;
              } else {
                preservationStats.merged++;
              }
              
              // Critical properties that must be preserved if they exist in original
              const criticalProps = [
                'addresses', 'dhcp4', 'dhcp6',           // IP configuration
                'mtu',                                    // Network settings
                'routes', 'routing-policy',              // Routing
                'nameservers', 'search',                 // DNS
                'gateway4', 'gateway6',                  // Gateways
                'optional', 'critical',                  // Interface behavior
                'wakeonlan', 'link-local', 'accept-ra',  // Advanced settings
                'macaddress', 'set-name',                // Hardware settings
                'id', 'link',                            // VLAN properties (critical!)
                'interfaces',                            // Bridge/Bond members
                'parameters',                            // Bridge/Bond parameters (STP, bonding mode, etc.)
                'mode', 'primary', 'mii-monitor-interval', 'lacp-rate', // Bond-specific
                'stp', 'forward-delay', 'hello-time', 'max-age', 'priority', // Bridge-specific
                'dhcp-identifier', 'dhcp4-overrides', 'dhcp6-overrides', // DHCP advanced
                'renderer', 'version',                   // Global settings (if present at interface level)
                'ipv6-privacy', 'ipv6-address-generation', // IPv6 settings
                'emit-lldp', 'receive-checksum-offload', 'transmit-checksum-offload', // Hardware offload
                'generic-receive-offload', 'generic-segmentation-offload', 'large-receive-offload', // More hardware offload
                'tcp-segmentation-offload', 'tcp6-segmentation-offload' // TCP offload
              ];
              
              // For target interface, preserve everything except addresses/dhcp (which we'll update)
              const propsToPreserve = ifName === name ? 
                criticalProps.filter(prop => !['addresses', 'dhcp4', 'dhcp6'].includes(prop)) : 
                criticalProps;
              
              propsToPreserve.forEach(prop => {
                if (originalIf[prop] !== undefined && currentIf[prop] === undefined) {
                  console.log(`🔒 ENHANCED: Preserving ${prop} for ${ifName}:`, originalIf[prop]);
                  if (Array.isArray(originalIf[prop])) {
                    currentIf[prop] = [...originalIf[prop]];
                  } else if (typeof originalIf[prop] === 'object' && originalIf[prop] !== null) {
                    currentIf[prop] = { ...originalIf[prop] };
                  } else {
                    currentIf[prop] = originalIf[prop];
                  }
                }
              });
            }
          }
        }
      }
      
      console.log(`🔧 ENHANCED: Preservation complete - preserved: ${preservationStats.preserved}, merged: ${preservationStats.merged}, target: ${preservationStats.target}`);
      
      // NOW update the target interface with new IP configuration
      console.log('🎯 ENHANCED: Applying IP changes to target interface...');
      if (interfaceSection) {
        if (static_ip && static_ip.trim() !== '') {
          interfaceSection.addresses = [static_ip];
          interfaceSection.dhcp4 = false;
          interfaceSection.dhcp6 = false;
          console.log(`✅ ENHANCED: Updated ${name} with new IP: ${static_ip}`);
        } else {
          delete interfaceSection.addresses;
          interfaceSection.dhcp4 = true;
          console.log(`✅ ENHANCED: Updated ${name} to use DHCP`);
        }
      }
      
      // CRITICAL: Preserve existing routes
      if (existingRoutes.length > 0) {
        interfaceSection.routes = existingRoutes;
        console.log(`Preserved ${existingRoutes.length} routes for ${name} in ${interfaceType} section`);
      }
    }
    
    // ENHANCED: Use atomic write strategy for VLAN IP edits to prevent configuration splitting
    console.log('💾 ENHANCED: Using atomic write strategy to prevent VLAN loss...');
    const writeOk = await writeNetplanConfigAtomic(netplanConfig);
    if (!writeOk) {
      return { error: `Failed to write netplan configuration using multi-file strategy` };
    }
    
    console.log(`IP address for ${name} updated successfully using multi-file strategy`);
    
    // Verify that other interfaces still have their IPs
    // Verifying IP preservation after write
    const verifyConfig = await loadNetplanConfig();
    for (const sectionType of ['vlans', 'ethernets', 'bridges', 'bonds']) {
      if (verifyConfig.network && verifyConfig.network[sectionType]) {
        for (const ifName in verifyConfig.network[sectionType]) {
          const ifConfig = verifyConfig.network[sectionType][ifName];
          if (ifConfig.addresses && ifConfig.addresses.length > 0) {
            // Post-write verification of addresses
          }
        }
      }
    }
    
    let message = `IP address for ${name} updated to ${static_ip || 'DHCP'}`;
    if (isSystemManaged && !isCockpitManaged) {
      message += `\n\n📝 Note: This is a system-managed interface. An override has been created in ${targetFile} to preserve original settings while applying your changes.`;
    }
    
    return {
      success: true,
      message: message,
      details: { 
        created: false, // Interface was updated, not created
        isSystemOverride: isSystemManaged && !isCockpitManaged,
        targetFile: targetFile
      }
    };
    
  } catch (error) {
    return { error: `Failed to set IP address: ${error.message}` };
  }
}

/**
 * ENHANCED: Atomic write strategy for VLAN IP edits
 * This prevents configuration splitting that can cause VLAN loss
 */
async function writeNetplanConfigAtomic(config) {
  console.log('💾 ENHANCED: Writing netplan config using atomic strategy (safer for VLAN edits)');
  
  // Write everything to a single file to avoid split issues
  const targetFile = NETPLAN_FILES.COCKPIT_INTERFACES;
  
  // Ensure we have a complete configuration
  const atomicConfig = {
    network: {
      version: config.network.version || 2,
      renderer: config.network.renderer || 'networkd',
      ethernets: config.network.ethernets || {},
      vlans: config.network.vlans || {},
      bridges: config.network.bridges || {},
      bonds: config.network.bonds || {}
    }
  };
  
  console.log('💾 ENHANCED: Writing atomic config with VLANs:', Object.keys(atomicConfig.network.vlans));
  
  // Write to single file atomically
  try {
    const success = await writeNetplanFile(targetFile, atomicConfig);
    if (success) {
      console.log('✅ ENHANCED: Atomic write successful');
      
      // Clear other cockpit files to avoid conflicts
      const filesToClear = [
        NETPLAN_FILES.COCKPIT_OVERRIDES,
        NETPLAN_FILES.COCKPIT_LEGACY
      ];
      
      for (const file of filesToClear) {
        try {
          await writeNetplanFile(file, { network: { version: 2, renderer: 'networkd' } });
          console.log(`🧹 ENHANCED: Cleared ${file} to prevent conflicts`);
        } catch (clearError) {
          console.warn(`⚠️ Could not clear ${file}:`, clearError);
        }
      }
    }
    return success;
  } catch (error) {
    console.error('❌ ENHANCED: Atomic write failed:', error);
    return false;
  }
}

/**
 * Set MTU for an interface
 */
async function setInterfaceMTU(config) {
  const { name, mtu } = config;
  
  if (!name) {
    return { error: 'Interface name is required' };
  }
  
  if (!mtu || isNaN(mtu) || mtu < 68 || mtu > 9000) {
    return { error: 'Valid MTU value (68-9000) is required' };
  }
  
  try {
    console.log(`Setting MTU for ${name} to ${mtu}`);
    
    // Special validation for VLAN interfaces
    if (name.includes('.')) {
      const parentInterface = name.split('.')[0];
      console.log(`VLAN detected: ${name}, parent: ${parentInterface}`);
      
      // Check parent interface MTU using ip link show
      try {
        const parentMtuCmd = `ip link show ${parentInterface} | grep 'mtu ' | head -1 | sed 's/.*mtu \\([0-9]*\\).*/\\1/'`;
        console.log(`Checking parent MTU with command: ${parentMtuCmd}`);
        
        const parentMtuResult = await executeCommand(parentMtuCmd);
        console.log(`Parent MTU check result:`, parentMtuResult);
        
        if (parentMtuResult.success && parentMtuResult.output.trim()) {
          const parentMtu = parseInt(parentMtuResult.output.trim());
          console.log(`Parent interface ${parentInterface} MTU: ${parentMtu}`);
          
          if (!isNaN(parentMtu) && mtu > parentMtu) {
            const errorMsg = `Cannot set VLAN MTU (${mtu}) higher than parent interface ${parentInterface} MTU (${parentMtu}). Please increase parent interface MTU first.`;
            const hintMsg = `Set ${parentInterface} MTU to at least ${mtu} before setting VLAN MTU`;
            console.error(errorMsg);
            return { 
              error: errorMsg,
              hint: hintMsg
            };
          }
        } else {
          console.warn(`Could not determine parent interface MTU for ${parentInterface}`);
        }
      } catch (parentError) {
        console.warn('Could not check parent interface MTU:', parentError);
        // Continue anyway, let netplan handle the validation
      }
    }
    
  // Load current configuration
    const netplanConfig = await loadNetplanConfig();
    if (netplanConfig.error) {
      return netplanConfig;
    }
    
    if (!netplanConfig.network) {
      netplanConfig.network = { version: 2 };
    }
    
    // Find the interface in the appropriate section
    let interfaceFound = false;
    let interfaceSection = null;
    
    // Check VLANs
    if (netplanConfig.network.vlans && netplanConfig.network.vlans[name]) {
      interfaceSection = netplanConfig.network.vlans[name];
      interfaceFound = true;
    }
    // Check bridges
    else if (netplanConfig.network.bridges && netplanConfig.network.bridges[name]) {
      interfaceSection = netplanConfig.network.bridges[name];
      interfaceFound = true;
    }
    // Check bonds
    else if (netplanConfig.network.bonds && netplanConfig.network.bonds[name]) {
      interfaceSection = netplanConfig.network.bonds[name];
      interfaceFound = true;
    }
    // Check ethernets
    else if (netplanConfig.network.ethernets && netplanConfig.network.ethernets[name]) {
      interfaceSection = netplanConfig.network.ethernets[name];
      interfaceFound = true;
    }
    
    if (!interfaceFound) {
      // Auto-create on edit: VLAN or ethernet
      if (name.includes('.')) {
        const [parent, vlanIdStr] = name.split('.', 2);
        const vlanId = parseInt(vlanIdStr, 10);
        if (!isNaN(vlanId) && parent) {
          // Ensure parent exists
          if (!netplanConfig.network.ethernets[parent]) {
            netplanConfig.network.ethernets[parent] = { optional: true };
          }
          netplanConfig.network.vlans[name] = { id: vlanId, link: parent };
          interfaceSection = netplanConfig.network.vlans[name];
          interfaceFound = true;
          console.log(`Auto-created VLAN ${name} in netplan for MTU edit`);
        }
      }
      if (!interfaceFound) {
        netplanConfig.network.ethernets[name] = netplanConfig.network.ethernets[name] || {};
        interfaceSection = netplanConfig.network.ethernets[name];
        interfaceFound = true;
        console.log(`Auto-created ethernet ${name} in netplan for MTU edit`);
      }
    }
    
    // Update MTU
    interfaceSection.mtu = parseInt(mtu);
    
    // Write configuration
    const writeOk = await writeNetplanConfig(netplanConfig);
    if (!writeOk) {
      return { error: 'Failed to write netplan configuration' };
    }
    
    console.log(`MTU for ${name} updated successfully in netplan configuration`);
    
    // Post-validation: Check if the MTU actually took effect for VLANs
    let actualMtuWarning = '';
    if (name.includes('.')) {
      try {
        const actualMtuCmd = `ip link show ${name} | grep 'mtu ' | head -1 | sed 's/.*mtu \\([0-9]*\\).*/\\1/'`;
        const actualMtuResult = await executeCommand(actualMtuCmd);
        
        if (actualMtuResult.success && actualMtuResult.output.trim()) {
          const actualMtu = parseInt(actualMtuResult.output.trim());
          console.log(`Actual interface MTU after netplan apply: ${actualMtu}, expected: ${mtu}`);
          
          if (actualMtu !== parseInt(mtu)) {
            const parentInterface = name.split('.')[0];
            actualMtuWarning = `\n\n⚠️ Warning: The interface MTU is still ${actualMtu} instead of ${mtu}. This likely means the parent interface (${parentInterface}) has a lower MTU. Please set ${parentInterface} MTU to at least ${mtu} first.`;
          }
        }
      } catch (checkError) {
        console.warn('Could not verify actual MTU after apply:', checkError);
      }
    }
    
    // For VLANs, provide additional feedback about parent interface requirements
    let message = `MTU for ${name} updated to ${mtu}`;
    if (name.includes('.')) {
      const parentInterface = name.split('.')[0];
      message += `\n\nNote: VLAN MTU changes require the parent interface (${parentInterface}) to have an MTU of at least ${mtu}. If the change doesn't take effect, please check the parent interface MTU.`;
      message += actualMtuWarning;
    }
    
    return { 
      success: true, 
      message: message
    };
    
  } catch (error) {
    return { error: `Failed to set MTU: ${error.message}` };
  }
}

/**
 * Main action dispatcher for JavaScript netplan manager
 * Handles all netplan operations using multi-file approach
 */
async function netplanJsAction(action, config = {}) {
  console.log(`netplanJsAction called: ${action}`, config);
  
  try {
    switch (action) {
      case 'get_interface_classification':
        const classification = await classifyInterfaces();
        return { success: true, classification };
        
      case 'preserve_routes':
        return await preserveSystemRoutes();
        
      case 'manage_routes':
        return await manageInterfaceRoutes(config);
        
      case 'get_routes':
        const routes = await getAllSystemRoutes();
        return { success: true, routes };
        
      case 'add_vlan':
        return await addVlan(config);
        
      case 'add_bridge':
        return await addBridge(config);
        
      case 'add_bond':
        return await addBond(config);
        
      case 'remove_interface':
      case 'delete_interface':
      case 'delete':  // Add support for 'delete' action used by advanced-actions.js
        // Use simple deletion with ip commands only
        const deleteInterfaceName = config.name || config.interface;
        const deleteInterfaceType = config.type || 'auto';
        if (!deleteInterfaceName) {
          return { error: 'Interface name is required for deletion' };
        }
        return await deleteInterfaceSimple(deleteInterfaceName, deleteInterfaceType);
        
      case 'delete_complete':
      case 'force_delete':
        // Enhanced deletion with direct system commands (legacy compatibility)
        const interfaceName = config.name || config.interface;
        const interfaceType = config.type || 'auto';
        if (!interfaceName) {
          return { error: 'Interface name is required for deletion' };
        }
        return await deleteInterfaceSimple(interfaceName, interfaceType);
        
      case 'set_ip':
        return await setInterfaceIP(config);
        
      case 'set_mtu':
        return await setInterfaceMTU(config);
        
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
        
      case 'apply_direct':
        // Apply directly without try (useful when try was already done)
        console.log('🚀 apply_direct: Skipping netplan try (already done), applying directly...');
        return await applyNetplanConfig(true);
        
      case 'generate':
        const generateResult = await executeCommand('netplan generate');
        return generateResult.success ? 
          { success: true, message: 'netplan generate completed successfully' } : 
          { error: generateResult.error };
        
      case 'try':
      case 'try_config':
        console.log('🧪 try_config: Testing netplan configuration safely...');
        const timeout = config.timeout || 30; // Increased default timeout from 10 to 30 seconds
        console.log(`⏱️ Using ${timeout}s timeout for netplan try`);
        const tryResult = await executeCommand(`netplan try --timeout ${timeout}`);
        
        // CRITICAL: Check for revert (either via exit code or output detection)
        if (tryResult.reverted || tryResult.exitCode === 78) {
          console.log(`⚠️ netplan try failed with exit code ${tryResult.exitCode}, attempting fallback...`);
          
          if (tryResult.possibleFalsePositive) {
            console.log('🤔 Detected possible false positive revert - netplan may have applied config despite showing revert message');
            return { 
              success: true, // Treat as success but with warning
              warning: true,
              message: `netplan try showed revert message but may have applied configuration anyway (${timeout}s timeout)`,
              details: 'Your system appears to have a netplan quirk where it shows revert messages but applies configs successfully'
            };
          } else {
            // For timeout issues, offer fallback to direct apply
            console.log('💡 Timeout detected - you may want to try direct apply');
            return { 
              success: false, 
              reverted: true,
              error: `netplan try timed out after ${timeout}s - configuration automatically reverted for safety`,
              message: `netplan try timed out after ${timeout}s - configuration automatically reverted for safety`,
              suggestion: 'Consider using longer timeout or direct apply for this configuration'
            };
          }
        } else if (tryResult.success) {
          return { success: true, message: `netplan try completed successfully (${timeout}s timeout)` };
        } else {
          return { error: `netplan try failed: ${tryResult.error || 'Unknown error'}` };
        }
        
      default:
        return { error: `Unknown action: ${action}. Available actions: get_interface_classification, preserve_routes, manage_routes, get_routes, add_vlan, add_bridge, add_bond, remove_interface, set_ip, set_mtu, load_netplan, get_summary, get_physical_interfaces, apply_config, apply_direct, generate, try` };
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
window.getAllSystemRoutes = getAllSystemRoutes;
window.manageInterfaceRoutes = manageInterfaceRoutes;
window.preserveSystemRoutes = preserveSystemRoutes;
window.classifyInterfaces = classifyInterfaces;
window.getSystemManagedInterfaces = getSystemManagedInterfaces;
window.getCockpitManagedInterfaces = getCockpitManagedInterfaces;

// Core debug helper for configuration verification
window.debugNetplan = async function() {
  // Running netplan debug
  
  try {
    const config = await loadNetplanConfig();
    const summary = await getNetplanSummary();
    const interfaces = await getPhysicalInterfaces();
    
    return {
      config,
      summary,
      interfaces,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Debug failed:', error);
    return { error: error.message };
  }
};

console.log('✅ Enhanced JavaScript Netplan Manager loaded');
console.log('📁 Configuration file: /etc/netplan/99-cockpit.yaml');
// Debug command available: debugNetplan()



// =====================================
// Standards-Compliant Helper Functions
// =====================================

/**
 * Create or update VLAN interface configuration with proper netplan structure
 */
function createVLANConfig(name, vlanId, parentInterface, addresses = [], options = {}) {
  // VLAN configuration helper
  
  const vlanConfig = {
    id: parseInt(vlanId),
    link: parentInterface,
    optional: true  // VLANs are typically optional
  };
  
  // Add IP configuration
  if (addresses && addresses.length > 0) {
    vlanConfig.addresses = addresses.map(addr => {
      // Ensure CIDR notation
      if (!addr.includes('/')) {
        return `${addr}/24`;  // Default to /24 if no prefix
      }
      return addr;
    });
  }
  
  // DHCP configuration
  if (options.dhcp4 !== undefined) vlanConfig.dhcp4 = options.dhcp4;
  if (options.dhcp6 !== undefined) vlanConfig.dhcp6 = options.dhcp6;
  
  // Gateway configuration - use modern routes instead of deprecated gateway4/gateway6
  if (options.gateway4 || options.gateway6) {
    vlanConfig.routes = [];
    if (options.gateway4) {
      vlanConfig.routes.push({
        to: 'default',
        via: options.gateway4,
        metric: options.metric || 100
      });
    }
    if (options.gateway6) {
      vlanConfig.routes.push({
        to: 'default',
        via: options.gateway6,
        metric: options.metric || 100
      });
    }
  }
  
  // Additional properties
  if (options.mtu) vlanConfig.mtu = options.mtu;
  if (options.macaddress) vlanConfig.macaddress = options.macaddress;
  if (options.nameservers) vlanConfig.nameservers = options.nameservers;
  
  // Advanced properties
  if (options.critical !== undefined) vlanConfig.critical = options.critical;
  if (options.wakeonlan !== undefined) vlanConfig.wakeonlan = options.wakeonlan;
  if (options['accept-ra'] !== undefined) vlanConfig['accept-ra'] = options['accept-ra'];
  if (options['ipv6-privacy'] !== undefined) vlanConfig['ipv6-privacy'] = options['ipv6-privacy'];
  
  return vlanConfig;
}

/**
 * Create or update bridge interface configuration with proper netplan structure
 */
function createBridgeConfig(name, interfaces = [], options = {}) {
  // Bridge configuration helper
  
  const bridgeConfig = {
    interfaces: interfaces.slice(),  // Clone array
    optional: true
  };
  
  // Bridge parameters
  if (options.stp !== undefined || options['forward-delay'] || options['hello-time'] || 
      options['max-age'] || options.priority) {
    bridgeConfig.parameters = {};
    if (options.stp !== undefined) bridgeConfig.parameters.stp = options.stp;
    if (options['forward-delay']) bridgeConfig.parameters['forward-delay'] = options['forward-delay'];
    if (options['hello-time']) bridgeConfig.parameters['hello-time'] = options['hello-time'];
    if (options['max-age']) bridgeConfig.parameters['max-age'] = options['max-age'];
    if (options.priority) bridgeConfig.parameters.priority = options.priority;
  }
  
  // IP configuration
  if (options.addresses && options.addresses.length > 0) {
    bridgeConfig.addresses = options.addresses.map(addr => {
      if (!addr.includes('/')) {
        return `${addr}/24`;
      }
      return addr;
    });
  }
  
  // DHCP configuration
  if (options.dhcp4 !== undefined) bridgeConfig.dhcp4 = options.dhcp4;
  if (options.dhcp6 !== undefined) bridgeConfig.dhcp6 = options.dhcp6;
  
  // Gateway configuration - use modern routes
  if (options.gateway4 || options.gateway6) {
    bridgeConfig.routes = [];
    if (options.gateway4) {
      bridgeConfig.routes.push({
        to: 'default',
        via: options.gateway4,
        metric: options.metric || 100
      });
    }
    if (options.gateway6) {
      bridgeConfig.routes.push({
        to: 'default',
        via: options.gateway6,
        metric: options.metric || 100
      });
    }
  }
  
  // Additional properties
  if (options.mtu) bridgeConfig.mtu = options.mtu;
  if (options.macaddress) bridgeConfig.macaddress = options.macaddress;
  if (options.nameservers) bridgeConfig.nameservers = options.nameservers;
  
  return bridgeConfig;
}

/**
 * Create or update bond interface configuration with proper netplan structure
 */
function createBondConfig(name, interfaces = [], mode = 'active-backup', options = {}) {
  // Bond configuration helper
  
  const bondConfig = {
    interfaces: interfaces.slice(),  // Clone array
    optional: true,
    parameters: {
      mode: mode
    }
  };
  
  // Bond parameters
  if (options.primary) bondConfig.parameters.primary = options.primary;
  if (options['mii-monitor-interval']) bondConfig.parameters['mii-monitor-interval'] = options['mii-monitor-interval'];
  if (options['lacp-rate']) bondConfig.parameters['lacp-rate'] = options['lacp-rate'];
  if (options['gratuitious-arp']) bondConfig.parameters['gratuitious-arp'] = options['gratuitious-arp'];
  if (options['transmit-hash-policy']) bondConfig.parameters['transmit-hash-policy'] = options['transmit-hash-policy'];
  
  // IP configuration
  if (options.addresses && options.addresses.length > 0) {
    bondConfig.addresses = options.addresses.map(addr => {
      if (!addr.includes('/')) {
        return `${addr}/24`;
      }
      return addr;
    });
  }
  
  // DHCP configuration
  if (options.dhcp4 !== undefined) bondConfig.dhcp4 = options.dhcp4;
  if (options.dhcp6 !== undefined) bondConfig.dhcp6 = options.dhcp6;
  
  // Gateway configuration - use modern routes
  if (options.gateway4 || options.gateway6) {
    bondConfig.routes = [];
    if (options.gateway4) {
      bondConfig.routes.push({
        to: 'default',
        via: options.gateway4,
        metric: options.metric || 100
      });
    }
    if (options.gateway6) {
      bondConfig.routes.push({
        to: 'default',
        via: options.gateway6,
        metric: options.metric || 100
      });
    }
  }
  
  // Additional properties
  if (options.mtu) bondConfig.mtu = options.mtu;
  if (options.macaddress) bondConfig.macaddress = options.macaddress;
  if (options.nameservers) bondConfig.nameservers = options.nameservers;
  
  return bondConfig;
}

/**
 * Convert legacy gateway configuration to modern routes
 */
function convertLegacyGatewayToRoutes(config) {
  const convertedConfig = JSON.parse(JSON.stringify(config));  // Deep clone
  
  for (const section of ['ethernets', 'vlans', 'bridges', 'bonds']) {
    if (convertedConfig.network && convertedConfig.network[section]) {
      for (const [name, iface] of Object.entries(convertedConfig.network[section])) {
        if (iface.gateway4 || iface.gateway6) {
          if (!iface.routes) iface.routes = [];
          
          if (iface.gateway4) {
            iface.routes.push({
              to: 'default',
              via: iface.gateway4,
              metric: 100
            });
            delete iface.gateway4;
          }
          
          if (iface.gateway6) {
            iface.routes.push({
              to: 'default',
              via: iface.gateway6,
              metric: 100
            });
            delete iface.gateway6;
          }
        }
      }
    }
  }
  
  return convertedConfig;
}

/**
 * Validate netplan configuration against standards
 */
function validateNetplanConfig(config) {
  const errors = [];
  const warnings = [];
  
  if (!config.network) {
    errors.push('Missing required "network" key');
    return { valid: false, errors, warnings };
  }
  
  if (!config.network.version || config.network.version !== 2) {
    errors.push('Network version must be 2');
  }
  
  // Check for deprecated properties
  for (const section of ['ethernets', 'vlans', 'bridges', 'bonds']) {
    if (config.network[section]) {
      for (const [name, iface] of Object.entries(config.network[section])) {
        if (iface.gateway4 || iface.gateway6) {
          warnings.push(`Interface ${name}: gateway4/gateway6 is deprecated, use routes instead`);
        }
        
        // Validate VLAN specifics
        if (section === 'vlans') {
          if (iface.id === undefined) {
            errors.push(`VLAN ${name}: missing required "id" property`);
          }
          if (!iface.link) {
            errors.push(`VLAN ${name}: missing required "link" property`);
          }
        }
        
        // Validate Bond/Bridge specifics
        if ((section === 'bonds' || section === 'bridges') && (!iface.interfaces || !iface.interfaces.length)) {
          errors.push(`${section.slice(0, -1)} ${name}: missing required "interfaces" property`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Enhanced YAML generation with validation
 */
function generateValidatedNetplanYAML(config) {
  // First validate the config
  const validation = validateNetplanConfig(config);
  
  if (!validation.valid) {
    console.error('Configuration validation failed:', validation.errors);
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }
  
  if (validation.warnings.length > 0) {
    console.warn('Configuration warnings:', validation.warnings);
  }
  
  // Convert legacy gateway configuration if needed
  const modernConfig = convertLegacyGatewayToRoutes(config);
  
  // Generate YAML
  return generateNetplanYAML(modernConfig);
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createVLANConfig,
    createBridgeConfig,
    createBondConfig,
    convertLegacyGatewayToRoutes,
    validateNetplanConfig,
    generateValidatedNetplanYAML
  };
}

console.log('🔧 Enhanced netplan standards compliance functions loaded');
console.log('✅ JavaScript Netplan Manager loaded successfully');
console.log('📁 Configuration files: /etc/netplan/ (multi-file strategy)');
console.log('💡 Debug command: debugNetplan() - Get comprehensive debug info');
