'use strict';
/* global createStatusBadge, netplanAction, run, setStatus, setupModal, addAdvancedInterfaceActions, $, $$ */

// Helper function to determine user-friendly interface type names
function getInterfaceTypeFriendlyName(interfaceName, rawType, fullLine) {
  // Check for SLAVE and MASTER flags in ifconfig output
  if (fullLine && fullLine.includes('SLAVE')) {
    if (interfaceName.startsWith('eno') || interfaceName.startsWith('eth') || interfaceName.startsWith('enp')) {
      return 'Bond Member';
    }
    return 'Slave Interface';
  }
  
  if (fullLine && fullLine.includes('MASTER')) {
    if (interfaceName.startsWith('bond')) {
      return 'Bond Master';
    } else if (interfaceName.startsWith('br')) {
      return 'Bridge Master';
    }
    return 'Master Interface';
  }
  
  // VLAN interfaces - Enhanced with detailed info
  if (interfaceName.includes('.') || interfaceName.includes('@')) {
    const vlanInfo = parseVlanInfo(interfaceName);
    return `VLAN ${vlanInfo.id}`;
  }
  
  // Bridge interfaces
  if (interfaceName.startsWith('br') || rawType === 'bridge') {
    return 'Bridge';
  }
  
  // Bond interfaces
  if (interfaceName.startsWith('bond')) {
    return 'Bond';
  }
  
  // Loopback
  if (interfaceName === 'lo' || rawType === 'loopback') {
    return 'Loopback';
  }
  
  // Virtual interfaces
  if (interfaceName.startsWith('virbr') || interfaceName.startsWith('veth')) {
    return 'Virtual';
  }
  
  // Docker interfaces
  if (interfaceName.startsWith('docker')) {
    return 'Docker';
  }
  
  // Open vSwitch
  if (interfaceName.includes('ovs') || interfaceName.startsWith('br-')) {
    return 'OVS';
  }
  
  // Wireless interfaces
  if (interfaceName.startsWith('wl') || interfaceName.startsWith('wifi') || interfaceName.startsWith('wlan')) {
    return 'Wireless';
  }
  
  // Tunnel interfaces
  if (interfaceName.startsWith('tun') || interfaceName.startsWith('tap')) {
    return 'Tunnel';
  }
  
  // Physical Ethernet (common naming patterns)
  if (interfaceName.startsWith('eth') || 
      interfaceName.startsWith('eno') || 
      interfaceName.startsWith('ens') || 
      interfaceName.startsWith('enp') || 
      interfaceName.startsWith('em')) {
    return 'Ethernet';
  }
  
  // PPP interfaces
  if (interfaceName.startsWith('ppp')) {
    return 'PPP';
  }
  
  // Default mapping based on raw type
  const typeMap = {
    'ether': 'Ethernet',
    'loopback': 'Loopback', 
    'bridge': 'Bridge',
    'vlan': 'VLAN',
    'bond': 'Bond',
    'wifi': 'Wireless',
    'ppp': 'PPP',
    'tunnel': 'Tunnel'
  };
  
  return typeMap[rawType] || rawType.charAt(0).toUpperCase() + rawType.slice(1);
}

// Enhanced VLAN information parser
function parseVlanInfo(interfaceName) {
  const vlanInfo = {
    id: null,
    parent: null,
    fullName: interfaceName,
    isVlan: false
  };

  // Handle different VLAN naming conventions
  if (interfaceName.includes('.')) {
    // Standard VLAN notation: eth0.100, eno1.1117
    const parts = interfaceName.split('.');
    if (parts.length >= 2) {
      vlanInfo.parent = parts[0];
      vlanInfo.id = parts[1].split('@')[0]; // Remove any @parent suffix
      vlanInfo.isVlan = true;
    }
  } else if (interfaceName.includes('@')) {
    // Alternative VLAN notation: vlan100@eth0
    const parts = interfaceName.split('@');
    if (parts.length >= 2) {
      const nameWithId = parts[0];
      vlanInfo.parent = parts[1];
      
      // Extract VLAN ID from the name part
      const idMatch = nameWithId.match(/(\d+)/);
      if (idMatch) {
        vlanInfo.id = idMatch[1];
      }
      vlanInfo.isVlan = true;
    }
  }

  return vlanInfo;
}

// Helper function to get alternative interface names for commands
function getAlternativeInterfaceNames(interfaceName) {
  const alternatives = [interfaceName];
  
  // If interface contains @parent suffix, add normalized version
  if (interfaceName.includes('@')) {
    const normalized = interfaceName.split('@')[0];
    alternatives.push(normalized);
    
    // Also try with single @ if there are multiple
    const parts = interfaceName.split('@');
    if (parts.length > 2) {
      const singleAt = `${parts[0]}@${parts[1]}`;
      alternatives.push(singleAt);
    }
  }
  
  // If it's a VLAN interface, add @parent version
  if (interfaceName.includes('.') && !interfaceName.includes('@')) {
    const parts = interfaceName.split('.');
    if (parts.length === 2) {
      const withParent = `${interfaceName}@${parts[0]}`;
      alternatives.push(withParent);
    }
  }
  
  // Remove duplicates
  return [...new Set(alternatives)];
}

// Make essential functions available globally
if (typeof window !== 'undefined') {
  window.runInterfaceCommand = runInterfaceCommand;
  window.getAlternativeInterfaceNames = getAlternativeInterfaceNames;
}

// Helper function to show progress bar during netplan try operation
function showNetplanTryProgress(timeoutSeconds) {
  return new Promise((resolve) => {
    const progressModal = document.createElement('dialog');
    progressModal.className = 'netplan-progress-modal';
    progressModal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>🧪 Testing Network Configuration</h3>
        </div>
        <div class="modal-body">
          <div class="progress-info">
            <p><strong>Netplan Try in Progress</strong></p>
            <p>Testing your network configuration safely for <strong>${timeoutSeconds} seconds</strong>.</p>
            <p>If anything goes wrong, changes will be automatically reverted.</p>
          </div>
          
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" id="netplan-progress-fill"></div>
            </div>
            <div class="progress-text">
              <span id="countdown-text">${timeoutSeconds}</span> seconds remaining
            </div>
          </div>
          
          <div class="progress-status">
            <div class="status-indicator active" id="try-status">
              <span class="status-dot"></span>
              <span>Testing configuration...</span>
            </div>
            <div class="status-indicator" id="apply-status">
              <span class="status-dot"></span>
              <span>Applying configuration...</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(progressModal);
    setupModal(progressModal);
    
    const progressFill = progressModal.querySelector('#netplan-progress-fill');
    const countdownText = progressModal.querySelector('#countdown-text');
    const tryStatus = progressModal.querySelector('#try-status');
    const applyStatus = progressModal.querySelector('#apply-status');
    
    let currentSecond = timeoutSeconds;
    
    // Update progress every 100ms for smooth animation
    const updateInterval = setInterval(() => {
      currentSecond -= 0.1;
      
      if (currentSecond <= 0) {
        clearInterval(updateInterval);
        currentSecond = 0;
      }
      
      // Update progress bar (reverse progress - starts full, empties as time passes)
      const progressPercentage = (currentSecond / timeoutSeconds) * 100;
      progressFill.style.width = `${progressPercentage}%`;
      
      // Update countdown text
      const displaySeconds = Math.ceil(currentSecond);
      countdownText.textContent = displaySeconds;
      
      // Change color as time runs out
      if (progressPercentage > 50) {
        progressFill.style.backgroundColor = 'var(--network-success)';
      } else if (progressPercentage > 20) {
        progressFill.style.backgroundColor = 'var(--network-warning)';
      } else {
        progressFill.style.backgroundColor = 'var(--network-danger)';
      }
    }, 100);
    
    // Store cleanup function on modal for external access
    progressModal._cleanup = () => {
      clearInterval(updateInterval);
    };
    
    // Store modal reference and progress control
    progressModal._markTryComplete = () => {
      clearInterval(updateInterval);
      tryStatus.classList.remove('active');
      tryStatus.classList.add('complete');
      applyStatus.classList.add('active');
      
      progressFill.style.width = '100%';
      progressFill.style.backgroundColor = 'var(--network-success)';
      countdownText.textContent = '✓';
      
      const progressInfo = progressModal.querySelector('.progress-info p:last-child');
      progressInfo.textContent = 'Configuration test completed successfully! Applying changes...';
    };
    
    progressModal._markApplyComplete = () => {
      applyStatus.classList.remove('active');
      applyStatus.classList.add('complete');
      
      setTimeout(() => {
        progressModal.close();
        resolve();
      }, 1500);
    };
    
    progressModal._markError = (errorMessage) => {
      clearInterval(updateInterval);
      tryStatus.classList.remove('active');
      tryStatus.classList.add('error');
      
      progressFill.style.backgroundColor = 'var(--network-danger)';
      countdownText.textContent = '✗';
      
      const progressInfo = progressModal.querySelector('.progress-info p:last-child');
      progressInfo.textContent = `Error: ${errorMessage}`;
      progressInfo.style.color = 'var(--network-danger)';
      
      setTimeout(() => {
        progressModal.close();
        resolve();
      }, 3000);
    };
    
    progressModal.addEventListener('close', () => {
      clearInterval(updateInterval);
    });
    
    progressModal.showModal();
    
    // Return modal reference for external control
    return progressModal;
  });
}

// Helper function to safely apply netplan configuration with configurable timeout
// This ensures network configuration changes are tested before permanent application
async function safeNetplanApply(options = {}) {
  try {
    // Use default timeout of 10 seconds and allow override via options
    let config = { timeout: 10, skipTry: false };
    
    // Use provided options (no modal for timeout configuration)
    config = { ...config, ...options };

    if (config.skipTry) {
      console.log('⚡ Applying netplan configuration directly (skipping try)...');
      setStatus('Applying netplan configuration directly...');
      
      const applyResult = await netplanAction('apply_direct');
      
      if (applyResult.error) {
        console.warn('Netplan apply had issues:', applyResult.error);
        return { success: true, warning: applyResult.error };
      } else {
        console.log('Netplan configuration applied successfully (direct)');
        return { success: true };
      }
    } else {
      console.log(`🧪 Testing netplan configuration with "netplan try" (${config.timeout}s timeout)...`);
      setStatus(`Testing netplan configuration (${config.timeout}s timeout)...`);
      
      // Show progress bar modal
      const progressModalPromise = showNetplanTryProgress(config.timeout);
      const progressModal = await new Promise(resolve => {
        setTimeout(() => {
          const modal = document.querySelector('.netplan-progress-modal');
          resolve(modal);
        }, 100);
      });
      
      try {
        // First, try the configuration with specified timeout
        const tryResult = await netplanAction('try_config', { timeout: config.timeout });

        if (tryResult.error) {
          if (progressModal && progressModal._markError) {
            progressModal._markError(tryResult.error);
          }
          throw new Error(`Netplan try failed: ${tryResult.error}`);
        }

        if (tryResult.warning) {
          console.warn('⚠️ ' + tryResult.warning);
        }

        // Mark try as complete
        if (progressModal && progressModal._markTryComplete) {
          progressModal._markTryComplete();
        }

        console.log('Netplan try succeeded, applying configuration...');
        setStatus('Applying netplan configuration...');

        // If try succeeded, apply the configuration directly (skip try)
        const applyResult = await netplanAction('apply_direct');

        // Mark apply as complete
        if (progressModal && progressModal._markApplyComplete) {
          progressModal._markApplyComplete();
        }

        if (applyResult.error) {
          console.warn('Netplan apply had issues:', applyResult.error);
          // Don't throw error, just warn - the config might still work
          return { success: true, warning: applyResult.error };
        } else {
          console.log('Netplan configuration applied successfully');
          return { success: true };
        }
      } catch (error) {
        // Handle errors and update progress modal
        if (progressModal && progressModal._markError) {
          progressModal._markError(error.message || 'Unknown error');
        }
        throw error;
      }
    }
    
  } catch (error) {
    console.error('Netplan configuration failed:', error);
    throw new Error(`Failed to apply netplan configuration: ${error.message || error}`);
  }
}

// Convenience function for silent/automated apply with default settings
async function quickNetplanApply(timeout = 10) {
  return await safeNetplanApply({ timeout, silent: true });
}

// Enhanced command runner with interface name fallback
async function runInterfaceCommand(cmd, args, options = {}) {
  // Find the interface name in the args (usually after 'dev' or as the last argument)
  let interfaceNameIndex = -1;
  let interfaceName = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === 'dev' && i + 1 < args.length) {
      interfaceNameIndex = i + 1;
      interfaceName = args[i + 1];
      break;
    }
  }
  
  // If no 'dev' found, check if last argument looks like an interface
  if (interfaceName === null && args.length > 0) {
    const lastArg = args[args.length - 1];
    if (lastArg && (lastArg.includes('.') || lastArg.includes('@') || lastArg.match(/^[a-z]+\d/))) {
      interfaceNameIndex = args.length - 1;
      interfaceName = lastArg;
    }
  }
  
  if (interfaceName) {
    const alternatives = getAlternativeInterfaceNames(interfaceName);
    
    for (const altName of alternatives) {
      try {
        const newArgs = [...args];
        newArgs[interfaceNameIndex] = altName;
        
        const result = await run(cmd, newArgs, options);
        if (altName !== interfaceName) {
          console.log(`Command succeeded with alternative interface name: ${altName}`);
        }
        return result;
        
      } catch (error) {
        // Continue to next alternative
        if (altName === alternatives[alternatives.length - 1]) {
          throw error; // Last alternative failed
        }
      }
    }
  } else {
    // No interface name detected, run normally
    return await run(cmd, args, options);
  }
}

// Enhanced device name display with VLAN information
// Enhanced bonding/bridging member information parser
// Cached function to get individual interface ifconfig output
async function getCachedInterfaceDetails(interfaceName) {
  const now = Date.now();
  
  // Check if we have cached data that's still fresh
  if (interfaceDetailsCache.has(interfaceName)) {
    const cacheTime = interfaceDetailsCacheTime.get(interfaceName);
    if (now - cacheTime < INTERFACE_DETAILS_CACHE_TTL) {
      return interfaceDetailsCache.get(interfaceName);
    }
  }
  
  // Get fresh data
  try {
    const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const ifconfigInfo = await run('ifconfig', [interfaceName], { superuser: 'try' });
    const t1 = (window.performance && performance.now) ? performance.now() : Date.now();
    const dt = (t1 - t0).toFixed(2);
    console.log(`Command execution (${interfaceName}): ${dt} ms`);
    
    // Cache the result
    interfaceDetailsCache.set(interfaceName, ifconfigInfo);
    interfaceDetailsCacheTime.set(interfaceName, now);
    
    return ifconfigInfo;
  } catch (error) {
    console.warn(`Failed to get details for interface ${interfaceName}:`, error);
    return '';
  }
}

async function getBondBridgeDetails(interfaceName) {
  const details = {
    isBond: false,
    isBridge: false,
    members: [],
    memberOf: null,
    role: null,
    bondMode: null,
    bridgeInfo: null
  };

  try {
    // Check if this is a bond interface
    if (interfaceName.startsWith('bond')) {
      details.isBond = true;
      
      // Get bond information
      try {
        const bondInfo = await run('cat', [`/proc/net/bonding/${interfaceName}`], { superuser: 'try' });
        if (bondInfo) {
          // Parse bond mode
          const modeMatch = bondInfo.match(/Bonding Mode: ([^\n]+)/);
          if (modeMatch) {
            details.bondMode = modeMatch[1];
          }
          
          // Parse slave interfaces
          const slaveMatches = bondInfo.match(/Slave Interface: (\w+)/g);
          if (slaveMatches) {
            details.members = slaveMatches.map(match => match.replace('Slave Interface: ', ''));
          }
        }
      } catch (e) {
        console.warn('Could not read bond info from /proc/net/bonding/', e);
      }
    }

    // Check if this is a bridge interface  
    if (interfaceName.startsWith('br')) {
      details.isBridge = true;
      
      // Only attempt member detection for standard Linux bridges (not OVS bridges)
      if (/^br\d+$/.test(interfaceName) || interfaceName === 'bridge0') {
        try {
          const bridgePath = `/sys/class/net/${interfaceName}/brif`;
          const members = await run('ls', [bridgePath], { superuser: 'try' });
          if (members && members.trim()) {
            details.members = members.trim().split('\n').filter(Boolean);
          }
        } catch (sysError) {
          // Silent fallback - /sys might not be available
        }

        // If no members found and we have brctl, try it (only for standard bridges)
        if ((!details.members || details.members.length === 0) && 
            typeof checkCommandAvailable === 'function') {
          try {
            const hasBrctl = await checkCommandAvailable('brctl');
            if (hasBrctl) {
              const bridgeInfo = await run('brctl', ['show', interfaceName], { superuser: 'try' });
              if (bridgeInfo && bridgeInfo.includes(interfaceName)) {
                const lines = bridgeInfo.split('\n');
                details.members = lines
                  .slice(1)
                  .map(line => line.trim().split('\t'))
                  .filter(parts => parts.length > 1 && parts[1])
                  .map(parts => parts[1])
                  .filter(Boolean);
              }
            }
          } catch (brcltError) {
            // Silent fallback
          }
        }
      }
      
      // Initialize members array
      details.members = details.members || [];
    }

    // Check if this interface is a member of a bond or bridge
    // Use ifconfig output to detect SLAVE status first (much faster than /sys)
    if (!interfaceName.startsWith('lo') && 
        !interfaceName.startsWith('virbr') && 
        !interfaceName.startsWith('br-') &&  // Skip OVS bridges
        !interfaceName.startsWith('ovs-')) {
      
      try {
        const ifconfigInfo = await getCachedInterfaceDetails(interfaceName);
        
        // Check ifconfig output for SLAVE flag (this is much more reliable)
        if (ifconfigInfo && ifconfigInfo.includes('SLAVE')) {
          // Only now try to get the master name from /sys
          try {
            const masterPath = `/sys/class/net/${interfaceName}/master`;
            const masterLink = await run('readlink', [masterPath], { superuser: 'try' });
            if (masterLink && masterLink.trim()) {
              const masterName = masterLink.split('/').pop();
              details.memberOf = masterName;
              
              if (masterName.startsWith('bond')) {
                details.role = 'Bond Member';
              } else if (masterName.startsWith('br')) {
                details.role = 'Bridge Member';
              } else {
                details.role = 'Member';
              }
            }
          } catch (sysError) {
            // If /sys fails, try to guess from interface name patterns
            const bondMatch = ifconfigInfo.match(/bond\d+/);
            const bridgeMatch = ifconfigInfo.match(/br[\w-]+/);
            
            if (bondMatch) {
              details.memberOf = bondMatch[0];
              details.role = 'Bond Member';
            } else if (bridgeMatch) {
              details.memberOf = bridgeMatch[0];
              details.role = 'Bridge Member';
            }
          }
        }
      } catch (e) {
        // Silent fallback - interface might not exist
      }
    }

  } catch (error) {
    console.warn('Error getting bond/bridge details for', interfaceName, ':', error);
  }

  return details;
}

// Enhanced device name display with bonding/bridging information
async function createEnhancedDeviceDisplayName(interfaceName, interfaceType) {
  const vlanInfo = parseVlanInfo(interfaceName);
  const bondBridgeInfo = await getBondBridgeDetails(interfaceName);
  
  let displayInfo = {
    displayName: interfaceName,
    subtitle: null,
    isVlan: vlanInfo.isVlan,
    isBond: bondBridgeInfo.isBond,
    isBridge: bondBridgeInfo.isBridge,
    memberOf: bondBridgeInfo.memberOf,
    members: bondBridgeInfo.members,
    role: bondBridgeInfo.role,
    bondMode: bondBridgeInfo.bondMode
  };
  
  // Build subtitle with all relevant information
  const subtitleParts = [];
  
  if (vlanInfo.isVlan) {
    if (vlanInfo.parent) {
      subtitleParts.push(`Parent interface: ${vlanInfo.parent}`);
    } else {
      subtitleParts.push(`VLAN interface`);
    }
  }
  
  if (bondBridgeInfo.isBond) {
    if (bondBridgeInfo.members.length > 0) {
      // Show member names if not too many, otherwise just count
      if (bondBridgeInfo.members.length <= 3) {
        const memberList = bondBridgeInfo.members.join(', ');
        subtitleParts.push(`Members: ${memberList}`);
      } else {
        subtitleParts.push(`Members: ${bondBridgeInfo.members.length} interfaces`);
      }
    } else {
      // Provide meaningful subtitle even when members aren't detected
      subtitleParts.push(`Bond interface`);
    }
  }
  
  if (bondBridgeInfo.isBridge) {
    if (bondBridgeInfo.members.length > 0) {
      // Show port names if not too many, otherwise just count
      if (bondBridgeInfo.members.length <= 3) {
        const portList = bondBridgeInfo.members.join(', ');
        subtitleParts.push(`Bridge: ${portList}`);
      } else {
        subtitleParts.push(`Bridge: ${bondBridgeInfo.members.length} ports`);
      }
    } else {
      // Provide meaningful subtitle even when ports aren't detected
      subtitleParts.push(`Bridge interface`);
    }
  }
  
  if (bondBridgeInfo.memberOf) {
    subtitleParts.push(`Member interface`);
  }
  
  // Always provide a subtitle for special interface types to avoid null
  if (subtitleParts.length === 0) {
    if (interfaceName.startsWith('bond')) {
      subtitleParts.push('Bond interface');
    } else if (interfaceName.startsWith('br-') || interfaceName.startsWith('virbr')) {
      subtitleParts.push('Bridge interface');
    } else if (interfaceName.includes('.')) {
      subtitleParts.push('VLAN interface');
    }
  }
  
  if (subtitleParts.length > 0) {
    displayInfo.subtitle = subtitleParts.join(' � ');
  }
  
  return displayInfo;
}

// Cache for physical interfaces to avoid redundant calls
let physicalInterfacesCache = null;
let physicalInterfacesCacheTime = 0;
const PHYSICAL_INTERFACES_CACHE_TTL = 30000; // 30 seconds

// Shared cache for all interface data to avoid duplicate ifconfig calls
let allInterfacesCache = null;
let allInterfacesCacheTime = 0;
const ALL_INTERFACES_CACHE_TTL = 30000; // 30 seconds

// Loading state to prevent concurrent loads
let isLoadingInterfaces = false;
let lastInterfaceLoad = null;

// Cache for individual interface details to reduce ifconfig calls
let interfaceDetailsCache = new Map();
let interfaceDetailsCacheTime = new Map();
const INTERFACE_DETAILS_CACHE_TTL = 30000; // 30 seconds

// Shared function to get ifconfig data with caching
async function getCachedIfconfigData() {
  const now = Date.now();
  
  // Return cached data if it's still fresh
  if (allInterfacesCache && (now - allInterfacesCacheTime < ALL_INTERFACES_CACHE_TTL)) {
    console.log('Using cached ifconfig data');
    return allInterfacesCache;
  }
  
  console.log('Loading fresh ifconfig data...');
  const output = await run('ifconfig', ['-a'], { superuser: 'try' });
  
  // Cache the raw output
  allInterfacesCache = output;
  allInterfacesCacheTime = now;
  
  return output;
}

async function getPhysicalInterfaces() {
  try {
    const now = Date.now();
    
    // Return cached interfaces if they're still fresh
    if (physicalInterfacesCache && (now - physicalInterfacesCacheTime < PHYSICAL_INTERFACES_CACHE_TTL)) {
      console.log('Using cached physical interfaces:', physicalInterfacesCache);
      return physicalInterfacesCache;
    }
    
    console.log('Loading fresh physical interfaces...');
    
    // Use cached ifconfig data to avoid duplicate calls
    const output = await getCachedIfconfigData();
    const interfaces = [];

    // Parse ifconfig output to get physical interfaces
    const interfaceBlocks = output.split(/\n(?=\S)/);
    
    interfaceBlocks.forEach(block => {
      if (!block.trim() || !block.includes(':')) return;
      
      const firstLine = block.split('\n')[0];
      const nameMatch = firstLine.match(/^([^:\s]+)/);
      
      if (nameMatch) {
        const dev = nameMatch[1].trim();
        if (dev !== 'lo' &&
            !dev.startsWith('virbr') &&
            !dev.startsWith('docker') &&
            !dev.startsWith('veth') &&
            !dev.startsWith('bond') &&
            !dev.startsWith('br') &&
            !dev.includes('.')) {
          interfaces.push(dev);
        }
      }
    });

    // Cache the results
    physicalInterfacesCache = interfaces;
    physicalInterfacesCacheTime = now;

    console.log('Found physical interfaces:', interfaces);
    return interfaces;
  } catch (e) {
    console.error('Failed to get physical interfaces:', e);
    console.log('Returning default test interfaces');
    // Return some default interfaces for testing
    return ['eth0', 'enp0s3', 'wlan0'];
  }
}

// Function to clear physical interfaces cache
function clearPhysicalInterfacesCache() {
  console.log('Clearing physical interfaces cache');
  physicalInterfacesCache = null;
  physicalInterfacesCacheTime = 0;
  // Also clear the interface details cache
  interfaceDetailsCache.clear();
  interfaceDetailsCacheTime.clear();
}

async function loadInterfaces(force = false) {
  console.time('loadInterfaces');
  if (window.performance && performance.mark) {
    performance.mark('xavs:load:start');
  }
  // Prevent concurrent loading
  if (isLoadingInterfaces) {
    console.log('Interface loading already in progress, skipping...');
    return;
  }
  
  // For operations that modify interfaces, force should be true to ensure fresh data
  const cacheTimeout = force ? 0 : 30000; // 30 seconds for normal loads, no cache for forced loads
  
  // Check if we have recently loaded interfaces and cache is still valid
  if (lastInterfaceLoad && (Date.now() - lastInterfaceLoad) < cacheTimeout) {
    console.log('Using cached interface data');
    // Even with cached data, we should refresh the display
    await sortAndDisplayInterfaces();
    return;
  }

  isLoadingInterfaces = true;
  lastInterfaceLoad = Date.now();
  
  try {
    console.log(`Loading interfaces${force ? ' (forced)' : ''}...`);
    setStatus('Loading interfaces...');
    
    // Clear cached interface classification when reloading interfaces
    window.cachedInterfaceClassification = null;

    const tbody = $('#table-interfaces tbody');
    if (!tbody) {
      console.error('Interface table body not found');
      setStatus('Interface table not found');
      return;
    }

  // If this is a forced load but we already have interfaces in memory, display them immediately
    if (force && Array.isArray(globalInterfaces) && globalInterfaces.length > 0) {
      try {
        console.log('Forced load: rendering cached interfaces immediately (stale-while-revalidate)');
        await sortAndDisplayInterfaces();
      } catch (e) {
        // Ignore rendering cache errors; proceed to fetch fresh data
      }
    }

  // Skip extra sanity command; rely on downstream error handling

    // Use ifconfig for all interface discovery - no fallback
    let interfaces = [];
    
    try {
      console.log('Using ifconfig for interface discovery...');
      
      // Get ifconfig data asynchronously
      const ifconfigPromise = getCachedIfconfigData();
      
      // While waiting for ifconfig, clear the table and show loading state
      const tbody = $('#table-interfaces tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" class="text-center">
              <div class="spinner-border spinner-border-sm" role="status">
                <span class="sr-only">Loading...</span>
              </div>
              Loading interfaces...
            </td>
          </tr>
        `;
      }
      
      // Now wait for ifconfig data
      const ifconfigOutput = await ifconfigPromise;
      if (window.performance && performance.mark) {
        performance.mark('xavs:ifconfig:received');
      }
      
      // Parse in the background
      await new Promise(resolve => setTimeout(resolve, 0));
      interfaces = parseIfconfigOutput(ifconfigOutput);
      if (window.performance && performance.mark) {
        performance.mark('xavs:ifconfig:parsed');
      }
      console.log('Successfully parsed interfaces using ifconfig:', interfaces.length);
      
      if (interfaces.length === 0) {
        throw new Error('No interfaces found with ifconfig');
      }
    } catch (ifconfigError) {
      console.error('Failed to get interfaces with ifconfig:', ifconfigError.message);
      throw new Error('Interface discovery failed. Please ensure ifconfig is available on the system.');
    }

  // Keep logs light to reduce console overhead during message handling
  console.log('Parsed', interfaces.length, 'interfaces');

    // Store interfaces globally for sorting
    globalInterfaces = interfaces;

    // Initialize table sorting on first load
    if (!document.querySelector('#table-interfaces th.sort-active')) {
      initializeTableSorting();
      updateSortHeaders(); // Set initial sort state
    }

    // Display sorted interfaces
    const sortedInterfaces = sortInterfaces(interfaces);
    if (window.performance && performance.mark) {
      performance.mark('xavs:display:start');
    }
    await displayInterfaces(sortedInterfaces);
    if (window.performance && performance.mark) {
      performance.mark('xavs:display:end');
    }

    setStatus(`Loaded ${interfaces.length} interfaces`);
    console.log('Interfaces loaded successfully');
    
    // Run one-time immediate search to avoid debounce delay on first render
    if (typeof window.performSearch === 'function') {
      try { window.performSearch(''); } catch (e) { /* ignore */ }
      window.__xavsInitialSearchDone = true;
    }
    // Defer a secondary search call only if initial couldn't run
    setTimeout(() => {
      if (!window.__xavsInitialSearchDone && typeof window.updateInterfaceSearch === 'function') {
        window.updateInterfaceSearch('');
      }
      if (window.performance && performance.mark && performance.measure) {
        performance.mark('xavs:search:scheduled');
      }
    }, 50);
    
  } catch (error) {
    console.error('Failed to load interfaces:', error);
    setStatus('Failed to load interfaces: ' + error.message);
    tbody.innerHTML = '';
    const row = document.createElement('tr');
    row.innerHTML = `<td colspan="8" style="text-align: center; color: red; padding: 2rem;">Error: ${error.message}</td>`;
    tbody.appendChild(row);
  } finally {
    isLoadingInterfaces = false;
    console.timeEnd('loadInterfaces');
    if (window.performance && performance.measure) {
      try {
        performance.measure('xavs:ifconfig:wait', 'xavs:load:start', 'xavs:ifconfig:received');
        performance.measure('xavs:parse:duration', 'xavs:ifconfig:received', 'xavs:ifconfig:parsed');
        performance.measure('xavs:display:duration', 'xavs:display:start', 'xavs:display:end');
        const measures = performance.getEntriesByType('measure').filter(m => m.name.startsWith('xavs:'));
        measures.forEach(m => console.log(`[perf] ${m.name}: ${m.duration.toFixed(2)} ms`));
      } catch (e) {
        // ignore measure errors if marks missing
      }
    }
  }
}

// Parse ifconfig -a output
function parseIfconfigOutput(output) {
  console.time('Ifconfig parsing');
  const interfaces = [];
  const interfaceBlocks = output.split(/\n(?=\S)/); // Split on lines that start with non-whitespace
  
  // Pre-populate interface details cache while parsing
  const now = Date.now();
  
  for (const block of interfaceBlocks) {
    if (!block.trim() || !block.includes(':')) continue;
    
    const lines = block.split('\n');
    const firstLine = lines[0];
    
    // Extract interface name (everything before the first colon)
    const nameMatch = firstLine.match(/^([^:\s]+)/);
    if (!nameMatch) continue;
    
    let dev = nameMatch[1].trim();
    let mac = '';
    let ipv4 = '';
    let ipv6 = '';
    let mtu = '';
    let type = '';
    
    // Parse interface state more comprehensively
    let state = 'DOWN'; // Default
    
    // Check flags in the first line for ifconfig output
    // Examples: "eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST> mtu 1500"
    //          "lo: flags=73<UP,LOOPBACK,RUNNING> mtu 65536"
    const flagsMatch = firstLine.match(/flags=\d+<([^>]+)>/);
    if (flagsMatch) {
      const flags = flagsMatch[1].split(',');
      if (flags.includes('UP') && (flags.includes('RUNNING') || flags.includes('LOWER_UP'))) {
        state = 'UP';
      } else if (flags.includes('UP')) {
        // Interface is administratively UP but may not be running
        state = 'UP';
      } else {
        state = 'DOWN';
      }
    } else {
      // Fallback to simpler detection
      if (firstLine.match(/\bUP\b/) && !firstLine.match(/\bDOWN\b/)) {
        state = 'UP';
      } else if (firstLine.match(/\bDOWN\b/)) {
        state = 'DOWN';
      } else if (firstLine.includes('RUNNING')) {
        state = 'UP';
      }
    }
    
    // Extract MTU
    const mtuMatch = firstLine.match(/mtu (\d+)/);
    if (mtuMatch) {
      mtu = mtuMatch[1];
    }
    
    // Parse remaining lines for addresses and MAC
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Extract MAC address (ether)
      if (line.startsWith('ether ')) {
        const macMatch = line.match(/ether ([a-f0-9:]{17})/);
        if (macMatch) mac = macMatch[1];
      }
      
      // Extract IPv4 address
      if (line.startsWith('inet ') && !line.includes('127.0.0.1')) {
        const ipMatch = line.match(/inet ([^\s]+)/);
        if (ipMatch) ipv4 = ipMatch[1];
      }
      
      // Extract IPv6 address (skip link-local)
      if (line.startsWith('inet6 ') && !line.includes('fe80::')) {
        const ip6Match = line.match(/inet6 ([^\s]+)/);
        if (ip6Match) ipv6 = ip6Match[1];
      }
    }
    
    // Determine interface type
    type = getInterfaceTypeFriendlyName(dev, '', firstLine);
    
    // Normalize interface name (remove any @parent suffix for display consistency)
    const displayDev = dev.includes('@') ? dev.split('@')[0] : dev;
    
    // Pre-populate the interface details cache with this block data
    interfaceDetailsCache.set(displayDev, block);
    interfaceDetailsCacheTime.set(displayDev, now);
    
    // Ensure we have proper default values instead of empty strings
    interfaces.push({ 
      dev: displayDev, // Use normalized name for consistency
      originalName: dev, // Keep original for reference
      type: type || 'Unknown', 
      state: state || 'UNKNOWN', 
      mac: mac || null, // null will be handled by display function
      ipv4: ipv4 || null, // null will be handled by display function
      ipv6: ipv6 || null, // null will be handled by display function 
      mtu: mtu || '1500' // Default MTU
    });
  }
  
  console.timeEnd('Ifconfig parsing');
  return interfaces;
}

// Table sorting functionality
let currentSort = {
  column: 'device',
  direction: 'asc'
};

function initializeTableSorting() {
  const headers = $$('#table-interfaces th.sortable');
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const sortColumn = header.getAttribute('data-sort');
      handleColumnSort(sortColumn);
    });
  });
}

function handleColumnSort(column) {
  // Toggle direction if same column, otherwise default to ascending
  if (currentSort.column === column) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.column = column;
    currentSort.direction = 'asc';
  }
  
  updateSortHeaders();
  sortAndDisplayInterfaces();
}

function updateSortHeaders() {
  // Clear all sort classes
  $$('#table-interfaces th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc', 'sort-active');
  });
  
  // Add sort class to active column
  const activeHeader = $(`#table-interfaces th[data-sort="${currentSort.column}"]`);
  if (activeHeader) {
    activeHeader.classList.add('sort-active');
    activeHeader.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
  }
}

function sortInterfaces(interfaces) {
  return [...interfaces].sort((a, b) => {
    let aVal, bVal;
    
    switch (currentSort.column) {
      case 'device':
        aVal = a.dev.toLowerCase();
        bVal = b.dev.toLowerCase();
        break;
      case 'type':
        aVal = a.type.toLowerCase();
        bVal = b.type.toLowerCase();
        break;
      case 'state':
        aVal = a.state.toLowerCase();
        bVal = b.state.toLowerCase();
        break;
      case 'mac':
        aVal = a.mac.toLowerCase();
        bVal = b.mac.toLowerCase();
        break;
      case 'ipv4':
        aVal = a.ipv4 || '';
        bVal = b.ipv4 || '';
        // Sort IP addresses numerically
        if (aVal && bVal) {
          const aIP = aVal.split('.').map(num => parseInt(num.split('/')[0]));
          const bIP = bVal.split('.').map(num => parseInt(num.split('/')[0]));
          for (let i = 0; i < 4; i++) {
            if (aIP[i] !== bIP[i]) {
              return currentSort.direction === 'asc' ? aIP[i] - bIP[i] : bIP[i] - aIP[i];
            }
          }
          return 0;
        }
        break;
      case 'ipv6':
        aVal = a.ipv6 || '';
        bVal = b.ipv6 || '';
        break;
      case 'mtu':
        aVal = parseInt(a.mtu) || 0;
        bVal = parseInt(b.mtu) || 0;
        return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
      default:
        aVal = a.dev.toLowerCase();
        bVal = b.dev.toLowerCase();
    }
    
    if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// Create detailed information row for interface
function createDetailRow(iface, deviceInfo) {
  const detailRow = document.createElement('tr');
  detailRow.style.display = 'none';
  detailRow.style.backgroundColor = '#f8f9fa';
  detailRow.style.borderTop = '2px solid #007bff';
  
  const detailCell = document.createElement('td');
  detailCell.colSpan = 8;
  detailCell.style.padding = '1rem';
  
  let detailContent = `
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem;">
      <div>
        <strong style="color: #007bff;"><i class="fas fa-info-circle"></i> Basic Information</strong>
        <div style="margin-top: 0.5rem;">
          <div><strong>Interface:</strong> ${iface.dev}</div>
          <div><strong>Type:</strong> ${iface.type}</div>
          <div><strong>State:</strong> <span style="color: ${iface.state === 'UP' ? '#28a745' : '#dc3545'};">${iface.state}</span></div>
          <div><strong>MTU:</strong> ${iface.mtu} bytes</div>
          ${iface.mac ? `<div><strong>MAC Address:</strong> ${iface.mac}</div>` : ''}
        </div>
      </div>
      
      <div>
        <strong style="color: #007bff;"><i class="fas fa-network-wired"></i> Network Configuration</strong>
        <div style="margin-top: 0.5rem;">
          ${iface.ipv4 ? `<div><strong>IPv4:</strong> ${iface.ipv4}</div>` : '<div><em>No IPv4 address</em></div>'}
          ${iface.ipv6 ? `<div><strong>IPv6:</strong> ${iface.ipv6}</div>` : '<div><em>No IPv6 address</em></div>'}
          <div><strong>Link Status:</strong> ${iface.state === 'UP' ? '<i class="fas fa-circle" style="color: #28a745;"></i> Connected' : '<i class="fas fa-circle" style="color: #dc3545;"></i> Disconnected'}</div>
        </div>
      </div>
      
      <div>
        <strong style="color: #007bff;"><i class="fas fa-list"></i> Additional Details</strong>
        <div style="margin-top: 0.5rem;">
  `;

  // Add specific information based on interface type
  if (deviceInfo.isVlan) {
    const vlanInfo = parseVlanInfo(iface.dev);
    detailContent += `
      <div><strong>VLAN ID:</strong> ${vlanInfo.id}</div>
      <div><strong>Parent Interface:</strong> ${vlanInfo.parent}</div>
      <div><strong>VLAN Type:</strong> 802.1Q</div>
    `;
  } else if (deviceInfo.isBond) {
    detailContent += `
      <div><strong>Bond Mode:</strong> ${deviceInfo.bondMode || 'Unknown'}</div>
      <div><strong>Slave Interfaces:</strong> ${deviceInfo.members?.length || 0}</div>
      ${deviceInfo.members?.length > 0 ? `<div><strong>Members:</strong> ${deviceInfo.members.join(', ')}</div>` : ''}
    `;
  } else if (deviceInfo.isBridge) {
    detailContent += `
      <div><strong>Bridge Type:</strong> Linux Bridge</div>
      <div><strong>Port Count:</strong> ${deviceInfo.members?.length || 0}</div>
      ${deviceInfo.members?.length > 0 ? `<div><strong>Ports:</strong> ${deviceInfo.members.join(', ')}</div>` : ''}
    `;
  } else if (deviceInfo.memberOf) {
    detailContent += `
      <div><strong>Member of:</strong> ${deviceInfo.memberOf}</div>
      <div><strong>Role:</strong> ${deviceInfo.role}</div>
    `;
  } else if (iface.type === 'Loopback') {
    detailContent += `
      <div><strong>Purpose:</strong> System loopback</div>
      <div><strong>Local Only:</strong> Yes</div>
    `;
  } else if (iface.type === 'Ethernet') {
    detailContent += `
      <div><strong>Physical Port:</strong> Yes</div>
      <div><strong>Speed:</strong> Auto-negotiated</div>
    `;
  } else if (iface.type === 'Wireless') {
    detailContent += `
      <div><strong>Wireless Type:</strong> 802.11</div>
      <div><strong>Mode:</strong> Station</div>
    `;
  } else {
    detailContent += `
      <div><strong>Category:</strong> ${getInterfaceCategory(iface)}</div>
      <div><strong>Description:</strong> ${getInterfaceDescription(iface)}</div>
    `;
  }

  detailContent += `
        </div>
      </div>
    </div>
    
    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #dee2e6; font-size: 0.8rem; color: #6c757d;">
      <strong><i class="fas fa-lightbulb"></i> Tip:</strong> Click on the interface name again to hide these details. Use the Action buttons for interface management.
    </div>
  `;

  detailCell.innerHTML = detailContent;
  detailRow.appendChild(detailCell);
  
  return detailRow;
}

// Helper functions for interface categorization
// Cache interface categories and descriptions
const interfaceCategoryMap = new Map();
const interfaceDescriptionMap = new Map();

function getInterfaceCategory(iface) {
  const cached = interfaceCategoryMap.get(iface.dev);
  if (cached) return cached;
  
  let category;
  if (iface.dev.startsWith('docker')) category = 'Container Network';
  else if (iface.dev.startsWith('virbr')) category = 'Virtual Machine Network';
  else if (iface.dev.startsWith('veth')) category = 'Virtual Ethernet';
  else if (iface.dev.startsWith('tun') || iface.dev.startsWith('tap')) category = 'VPN/Tunnel';
  else if (iface.dev.startsWith('ppp')) category = 'Point-to-Point Protocol';
  else category = 'Network Interface';
  
  interfaceCategoryMap.set(iface.dev, category);
  return category;
}

function getInterfaceDescription(iface) {
  const cached = interfaceDescriptionMap.get(iface.dev);
  if (cached) return cached;
  
  let description;
  if (iface.dev.startsWith('docker')) description = 'Used by Docker containers for networking';
  else if (iface.dev.startsWith('virbr')) description = 'Virtual bridge for VM networking';
  else if (iface.dev.startsWith('veth')) description = 'Virtual ethernet pair for containers';
  else if (iface.dev.startsWith('tun')) description = 'TUN interface for VPN/tunneling';
  else if (iface.dev.startsWith('tap')) description = 'TAP interface for VPN/tunneling';
  else if (iface.dev.startsWith('ppp')) description = 'Point-to-point connection interface';
  else if (iface.dev === 'lo') description = 'System loopback interface (127.0.0.1)';
  else description = 'Standard network interface for system connectivity';
  
  interfaceDescriptionMap.set(iface.dev, description);
  return description;
}

let globalInterfaces = []; // Store interfaces for sorting

async function sortAndDisplayInterfaces() {
  if (globalInterfaces.length === 0) return;
  
  const sortedInterfaces = sortInterfaces(globalInterfaces);
  await displayInterfaces(sortedInterfaces);
}

async function displayInterfaces(interfaces) {
  const tbody = $('#table-interfaces tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  // Cache interface classification once for all interfaces to improve performance
  if (!window.cachedInterfaceClassification) {
    try {
      const classificationResult = await netplanAction('get_interface_classification');
      if (classificationResult.success) {
        window.cachedInterfaceClassification = classificationResult.classification;
        console.log('Interface classification cached for performance');
      }
    } catch (error) {
      console.warn('Failed to cache interface classification:', error);
      window.cachedInterfaceClassification = { systemManaged: {}, cockpitManaged: {} };
    }
  }
  
  // Pre-process interface details in smaller chunks to avoid blocking
  console.log('Pre-processing interface details...');
  console.time('Pre-processing interface details');
  const interfaceDetails = [];
  const chunkSize = 5; // Process 5 interfaces at a time
  
  for (let i = 0; i < interfaces.length; i += chunkSize) {
    const chunk = interfaces.slice(i, i + chunkSize);
    const chunkDetails = await Promise.all(
      chunk.map(async (iface) => {
        const deviceInfo = await createEnhancedDeviceDisplayName(iface.dev, iface.type);
        return { iface, deviceInfo };
      })
    );
    interfaceDetails.push(...chunkDetails);
    
    // Yield to main thread after each chunk
    if (i + chunkSize < interfaces.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  console.timeEnd('Pre-processing interface details');
  console.log('Interface details pre-processed');
  
  // Use document fragment for batch DOM operations (performance optimization)
  const fragment = document.createDocumentFragment();
  
  // Process interfaces in larger batches for better performance
  for (let i = 0; i < interfaceDetails.length; i++) {
    const { iface, deviceInfo } = interfaceDetails[i];
    
    // Yield control every 8 interfaces instead of 5 (less frequent yielding)
    if (i > 0 && i % 8 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    const row = document.createElement('tr');
    row.style.opacity = '0';
    row.style.transform = 'translateY(-10px)';
    
    // Check if this interface is system-managed for visual differentiation
    let isSystemManaged = false;
    let interfaceClassification = null;
    
    // Use cached classification to avoid repeated API calls
    if (window.cachedInterfaceClassification) {
      interfaceClassification = window.cachedInterfaceClassification;
      isSystemManaged = !!(interfaceClassification.systemManaged && interfaceClassification.systemManaged[iface.dev] && 
                          !(interfaceClassification.cockpitManaged && interfaceClassification.cockpitManaged[iface.dev]));
    }

    // Enhanced device name display with bonding/bridging info (now synchronous)
    const deviceCell = document.createElement('td');
    
    // Apply styling based on interface type
    if (isSystemManaged) {
      deviceCell.innerHTML = `
        <div style="font-weight: 600; color: var(--warning-color); position: relative;">
          ${deviceInfo.displayName}
          <span style="background: #ffa500; color: white; font-size: 0.6rem; padding: 1px 4px; border-radius: 3px; margin-left: 8px;">SYS</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
          ${deviceInfo.subtitle ? deviceInfo.subtitle + ' • ' : ''}System-managed interface
        </div>
      `;
      row.style.background = 'linear-gradient(90deg, rgba(255,165,0,0.08) 0%, rgba(255,255,255,0) 100%)';
      row.style.borderLeft = '3px solid #ffa500';
      row.title = 'System-managed interface (defined in system configuration files)';
    } else if (deviceInfo.isVlan) {
      deviceCell.innerHTML = `
        <div style="font-weight: 600; color: var(--primary-color);">${deviceInfo.displayName}</div>
        <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
          ${deviceInfo.subtitle || ''}
        </div>
      `;
      row.style.background = 'linear-gradient(90deg, rgba(0,102,204,0.05) 0%, rgba(255,255,255,0) 100%)';
    } else if (deviceInfo.isBond) {
      deviceCell.innerHTML = `
        <div style="font-weight: 600; color: var(--warning-color);">${deviceInfo.displayName}</div>
        <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
          ${deviceInfo.subtitle || ''}
        </div>
      `;
      row.style.background = 'linear-gradient(90deg, rgba(255,193,7,0.05) 0%, rgba(255,255,255,0) 100%)';
    } else if (deviceInfo.isBridge) {
      deviceCell.innerHTML = `
        <div style="font-weight: 600; color: var(--info-color);">${deviceInfo.displayName}</div>
        <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
          ${deviceInfo.subtitle || ''}
        </div>
      `;
      row.style.background = 'linear-gradient(90deg, rgba(23,162,184,0.05) 0%, rgba(255,255,255,0) 100%)';
    } else if (deviceInfo.memberOf) {
      deviceCell.innerHTML = `
        <div style="font-weight: 600;">${deviceInfo.displayName}</div>
        <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
          ${deviceInfo.subtitle || ''}
        </div>
      `;
      row.style.background = 'linear-gradient(90deg, rgba(108,117,125,0.03) 0%, rgba(255,255,255,0) 100%)';
    } else if (deviceInfo.subtitle) {
      deviceCell.innerHTML = `
        <div style="font-weight: 600;">${deviceInfo.displayName}</div>
        <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
          ${deviceInfo.subtitle || ''}
        </div>
      `;
    } else {
      deviceCell.textContent = deviceInfo.displayName;
    }

    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';
    
    // Create professional action container
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'interface-actions';

    // Create a toggle button instead of separate Up/Down buttons
    const btnToggle = createActionButton(
      iface.state === 'UP' ? 'Down' : 'Up',
      iface.state === 'UP' ? '<i class="fas fa-arrow-down"></i>' : '<i class="fas fa-arrow-up"></i>',
      async () => {
        if (iface.state === 'UP') {
          // Bring interface DOWN
          // Check if interface is critical before allowing it to be brought down
          const isCritical = checkIfInterfaceCritical(iface);
          
          if (isCritical.critical) {
            // Show critical interface warning before proceeding
            const confirmationResult = await showCriticalInterfaceDownConfirmation(iface, isCritical);
            if (!confirmationResult) {
              return; // User cancelled or didn't type confirmation correctly
            }
          } else {
            // Show simple warning for non-critical UP interfaces
            const confirmMessage = `Bring Down Interface ${iface.dev}?\n\n` +
                                 `Current Status: ${iface.state}\n` +
                                 `${iface.ipv4 ? `IP Address: ${iface.ipv4}\n` : ''}` +
                                 `\nThis will temporarily disable network connectivity on this interface.\n\n` +
                                 `Are you sure you want to bring it down?`;
            
            if (!confirm(confirmMessage)) {
              return;
            }
          }

          try {
            setStatus('Bringing interface down via netplan...');
            
            // Use netplan to set interface down
            const result = await netplanAction('set_interface_state', {
              name: iface.dev,
              state: 'down'
            });
            
            if (result.error) {
              throw new Error(`Failed to bring down interface: ${result.error}`);
            }
            
            // Apply netplan configuration safely
            await safeNetplanApply();
            
            setStatus('Interface brought down');
            setTimeout(() => setStatus('Ready'), 2000);
            await loadInterfaces();
          } catch (error) {
            console.error('Failed to bring down interface:', error);
            alert(`Failed to bring down interface ${iface.dev}: ${error}`);
            setStatus('Ready');
          }
        } else {
          // Bring interface UP
          try {
            setStatus('Bringing interface up via netplan...');
            
            // Use netplan to set interface up
            const result = await netplanAction('set_interface_state', {
              name: iface.dev,
              state: 'up'
            });
            
            if (result.error) {
              throw new Error(`Failed to bring up interface: ${result.error}`);
            }
            
            // Apply netplan configuration safely
            await safeNetplanApply();
            
            setStatus('Interface brought up');
            setTimeout(() => setStatus('Ready'), 2000);
            await loadInterfaces();
          } catch (error) {
            console.error('Failed to bring up interface:', error);
            alert(`Failed to bring up interface ${iface.dev}: ${error}`);
            setStatus('Ready');
          }
        }
      },
      iface.state === 'UP' ? 'state-up' : 'state-down'
    );

    // Use the interface classification we already retrieved
    const btnSetIP = createActionButton('IP', '<i class="fas fa-network-wired"></i>', async () => {
      // Check if interface is critical before allowing IP changes
      const isCritical = checkIfInterfaceCritical(iface);
      
      if (isCritical.critical) {
        // Show critical interface warning before proceeding
        const confirmationResult = await showCriticalIPChangeConfirmation(iface, isCritical);
        if (!confirmationResult) {
          return; // User cancelled or didn't type confirmation correctly
        }
      }

      const modal = document.createElement('dialog');
      modal.className = 'ip-config-modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h2>ℹ️ Set IP Address for ${iface.dev}</h2>
          <form id="set-ip-form">
            <label>⚬ Current IPv4 Address
              <input type="text" value="${iface.ipv4 || 'None assigned'}" readonly class="readonly-input">
            </label>
            <label>⚬ New IPv4 Address/CIDR
              <input type="text" id="new-ip-addr" placeholder="192.168.1.100/24" required 
                     pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$"
                     value="${iface.ipv4 || ''}" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Use CIDR notation (e.g., 192.168.1.100/24)</small>
            </label>
            <label><i class="fas fa-door-open"></i> Gateway (optional)
              <input type="text" id="new-gateway" placeholder="192.168.1.1"
                     pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$" 
                     style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Default gateway for this interface</small>
            </label>
            <label><i class="fas fa-server"></i> DNS Servers (optional, comma separated)
              <input type="text" id="new-dns" placeholder="8.8.8.8,1.1.1.1" 
                     style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Comma separated list of DNS servers</small>
            </label>
            <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
              <label style="display: flex; align-items: flex-start; gap: 0.5rem; margin: 0;">
                <input type="checkbox" id="persist-ip-config" checked style="margin-top: 0.25rem;">
                <div>
                  <strong><i class="fas fa-save"></i> Persist configuration to netplan (recommended)</strong>
                  <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">
                    When enabled, configuration survives reboots. When disabled, changes are temporary.
                  </small>
                </div>
              </label>
            </div>
            ${isCritical.critical ? `
            <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: var(--border-radius);">
              <strong><i class="fas fa-exclamation-triangle"></i> CRITICAL INTERFACE WARNING:</strong> You are modifying a critical interface that ${isCritical.reasons.join(' and ')}.
              <br><small>Changes may affect network connectivity. Ensure you have alternative access before proceeding.</small>
            </div>
            ` : `
            <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
              <strong><i class="fas fa-exclamation-triangle"></i> Note:</strong> This will replace any existing IP configuration for this interface.
            </div>
            `}
            <div style="margin: 1rem 0; padding: 1rem; background: #d4edda; border-radius: var(--border-radius); border: 1px solid #c3e6cb;">
              <strong><i class="fas fa-search"></i> Debugging:</strong> Check browser console (F12) for detailed logging during IP configuration process.
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
              <button type="button" class="btn" id="cancel-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;"><i class="fas fa-times"></i> Cancel</button>
              <button type="button" class="btn ${isCritical.critical ? 'btn-warning' : 'primary'}" id="apply-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;"><i class="fas fa-bolt"></i> Apply Configuration</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
      setupModal(modal);

      modal.querySelector('#cancel-ip-config').addEventListener('click', () => {
        modal.close();
      });

      modal.querySelector('#apply-ip-config').addEventListener('click', async () => {
        const newIp = modal.querySelector('#new-ip-addr').value.trim();
        const gateway = modal.querySelector('#new-gateway').value.trim();
        const dns = modal.querySelector('#new-dns').value.trim();
        const persist = modal.querySelector('#persist-ip-config').checked;

        if (!newIp) {
          alert('ℹ️ IP address is required!');
          modal.querySelector('#new-ip-addr').focus();
          return;
        }

  if (!window.isValidCIDR(newIp)) {
          alert('ℹ️ Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
          modal.querySelector('#new-ip-addr').focus();
          return;
        }

        if (gateway && !/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(gateway)) {
          alert('ℹ️ Invalid gateway address format!');
          modal.querySelector('#new-gateway').focus();
          return;
        }

        try {
          setStatus('Configuring IP address via netplan...');
          
          console.log(`Configuring IP ${newIp} for ${iface.dev} via netplan`);
          
          // Build configuration object for netplan
          const config = {
            name: iface.dev,
            static_ip: newIp
          };
          
          if (gateway) {
            config.gateway = gateway;
            console.log(`Including gateway: ${gateway}`);
          }
          
          if (dns) {
            config.dns = dns;
            console.log(`Including DNS servers: ${dns}`);
          }
          
          console.log('Sending configuration to netplan manager:', config);
          
          // Use netplan action to configure IP
          const result = await netplanAction('set_ip', config);
          
          console.log('→ Netplan manager response:', result);
          
          if (result.error) {
            throw new Error(`Netplan configuration failed: ${result.error}`);
          }
          
          console.log('Netplan configuration updated successfully');
          
          // Apply the netplan configuration safely
          console.log('ℹ️ Testing and applying netplan configuration...');
          setStatus('Testing and applying netplan configuration...');
          
          await safeNetplanApply();

          alert('✓ VLAN IP address set successfully!');
          modal.close();
          setStatus('IP configuration applied via netplan');
          setTimeout(() => setStatus('Ready'), 3000);
          await loadInterfaces();

        } catch (error) {
          console.error('✗ IP configuration error:', error);
          alert(`ℹ️ Failed to set IP address: ${error.message || error}`);
          setStatus('ℹ️ IP configuration failed');
          setTimeout(() => setStatus('Ready'), 3000);
        }
      });

      modal.showModal();
    }, 'configure');

    // Add buttons to the container with staggered animation
    actionsContainer.appendChild(btnToggle);
    // Note: Removed btnSetIP - IP changes now handled through Edit button
    
    // Add visual indication for system-managed interfaces
    if (isSystemManaged) {
      actionsContainer.style.borderLeft = '3px solid #ffa500';
      actionsContainer.title = 'System-managed interface (defined in system configuration)';
      
      // Add system badge
      const systemBadge = document.createElement('span');
      systemBadge.className = 'badge badge-warning system-managed-badge';
      systemBadge.textContent = 'SYS';
      systemBadge.title = 'System-managed interface';
      systemBadge.style.cssText = `
        position: absolute;
        top: -5px;
        right: -5px;
        font-size: 0.6rem;
        background: #ffa500;
        color: white;
        border-radius: 3px;
        padding: 1px 4px;
        pointer-events: none;
      `;
      actionsContainer.style.position = 'relative';
      actionsContainer.appendChild(systemBadge);
    }

    // Add the container to the cell
    actionsCell.appendChild(actionsContainer);
    
    // Add subtle staggered animation to buttons (only toggle button now)
    setTimeout(() => {
      [btnToggle].forEach((btn, index) => {
        setTimeout(() => {
          btn.style.opacity = '0';
          btn.style.transform = 'scale(0.8)';
          btn.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
          
          setTimeout(() => {
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1)';
          }, 50);
        }, index * 50);
      });
    }, 100);

    // Add advanced actions for constructed interfaces (VLAN, Bridge, Bond)
    if (typeof addAdvancedInterfaceActions === 'function') {
      await addAdvancedInterfaceActions(iface, actionsContainer);
    }

    // Helper functions to display meaningful values instead of null/empty
    const getMacDisplay = (mac, ifaceName) => {
      if (!mac) {
        // For virtual interfaces, show appropriate message
        if (ifaceName.startsWith('bond') || ifaceName.startsWith('br-') || ifaceName.includes('.')) {
          return '<span class="text-muted">Virtual</span>';
        }
        return '<span class="text-muted">�</span>';
      }
      return mac;
    };
    
    const getIpDisplay = (ip, type = 'IPv4', ifaceName) => {
      if (!ip) {
        // Different messages based on interface type
        if (ifaceName === 'lo') {
          return type === 'IPv4' ? '127.0.0.1' : '::1';
        }
        if (ifaceName.startsWith('bond') || ifaceName.startsWith('br-')) {
          return `<span class="text-muted">Managed</span>`;
        }
        return `<span class="text-muted">Not assigned</span>`;
      }
      return ip;
    };
    
    const getMtuDisplay = (mtu, ifaceName) => {
      const mtuValue = mtu || '1500';
      // Add context for common MTU values
      if (mtuValue === '65536' && ifaceName === 'lo') {
        return `${mtuValue} <span class="text-muted">(loopback)</span>`;
      }
      if (mtuValue === '1500') {
        return `${mtuValue} <span class="text-muted">(standard)</span>`;
      }
      return mtuValue;
    };

    const cells = [
      deviceCell, // Already created with enhanced VLAN info
      iface.type,
      createStatusBadge(iface.state),
      getMacDisplay(iface.mac, iface.dev),
      getIpDisplay(iface.ipv4, 'IPv4', iface.dev),
      getIpDisplay(iface.ipv6, 'IPv6', iface.dev),
      getMtuDisplay(iface.mtu, iface.dev),
      actionsCell
    ];
    

    // Skip the first cell since we already created deviceCell
    cells.slice(1).forEach(content => {
      const cell = document.createElement('td');
      if (typeof content === 'string') {
        // Check if content contains HTML (like span tags)
        if (content.includes('<')) {
          cell.innerHTML = content;
        } else {
          cell.textContent = content;
        }
      } else {
        cell.appendChild(content);
      }
      row.appendChild(cell);
    });
    
    // Add the deviceCell as the first cell
    row.insertBefore(deviceCell, row.firstChild);

    // Add to fragment instead of direct DOM manipulation
    fragment.appendChild(row);
    
    // Add detailed information row (initially hidden)
    const detailRow = createDetailRow(iface, deviceInfo);
    fragment.appendChild(detailRow);
    
    // Add click handler to toggle details (click on device name area)
    deviceCell.style.cursor = 'pointer';
    
    // Set tooltip text based on interface type
    if (deviceInfo.isBond) {
      if (deviceInfo.members && deviceInfo.members.length > 0) {
        const memberList = deviceInfo.members.join(', ');
        deviceCell.title = `Bond Interface\nMembers: ${memberList}\nMode: ${deviceInfo.bondMode || 'unknown'}`;
      } else {
        deviceCell.title = 'Bond Interface';
      }
    } else if (deviceInfo.isBridge) {
      if (deviceInfo.members && deviceInfo.members.length > 0) {
        const portList = deviceInfo.members.join(', ');
        deviceCell.title = `Bridge Interface\nPorts: ${portList}`;
      } else {
        deviceCell.title = 'Bridge Interface';
      }
    } else if (deviceInfo.isVlan) {
      deviceCell.title = 'VLAN Interface';
    } else {
      deviceCell.title = 'Click to show/hide detailed information';
    }
    
    deviceCell.addEventListener('click', (e) => {
      const isVisible = detailRow.style.display !== 'none';
      detailRow.style.display = isVisible ? 'none' : 'table-row';
      
      // Add visual feedback
      if (detailRow.style.display === 'table-row') {
        row.style.backgroundColor = 'rgba(0, 123, 255, 0.05)';
        detailRow.style.animation = 'fadeIn 0.3s ease-in';
      } else {
        row.style.backgroundColor = '';
      }
    });

    // Animate row appearance
    setTimeout(() => {
      row.style.transition = 'all 0.3s ease-out';
      row.style.opacity = '1';
      row.style.transform = 'translateY(0)';
    }, 50);
  }
  
  // Append all rows at once using document fragment (major performance optimization)
  console.time('DOM updates for interfaces');
  tbody.appendChild(fragment);
  console.timeEnd('DOM updates for interfaces');
}

// Interface dependency checker
async function checkInterfaceDependencies(interfaceName) {
  const dependencies = {
    hasDependencies: false,
    dependentInterfaces: [],
    usedByBonds: [],
    usedByBridges: [],
    hasVlans: [],
    criticalDependencies: [],
    warnings: [],
    canDelete: true,
    suggestedOrder: []
  };

  try {
    console.log(`→ Checking dependencies for interface: ${interfaceName}`);

    // 1. Check if this interface is used by any bonds
    try {
      const bondFiles = await run('ls', ['/proc/net/bonding/'], { superuser: 'try' });
      if (bondFiles) {
        const bondNames = bondFiles.split('\n').filter(name => name.trim());
        
        for (const bondName of bondNames) {
          try {
            const bondInfo = await run('cat', [`/proc/net/bonding/${bondName.trim()}`], { superuser: 'try' });
            if (bondInfo && bondInfo.includes(`Slave Interface: ${interfaceName}`)) {
              dependencies.usedByBonds.push(bondName.trim());
              dependencies.dependentInterfaces.push({
                name: bondName.trim(),
                type: 'bond',
                relationship: 'slave'
              });
            }
          } catch (e) {
            console.warn(`Could not read bond info for ${bondName}:`, e);
          }
        }
      }
    } catch (e) {
      console.warn('Could not check bond dependencies:', e);
    }

    // 2. Check if this interface is used by any bridges (i.e., this interface is a PORT of a bridge)
    try {
      const bridgeInfo = await run('bridge', ['link', 'show'], { superuser: 'try' });
      if (bridgeInfo) {
        const lines = bridgeInfo.split('\n');
        for (const line of lines) {
          // Look for lines where THIS interface is mentioned as having a master bridge
          // Format: "4: eno3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master br2 state disabled priority 32 cost 4"
          // We want to match: "4: interfaceName: ... master someBridge ..."
          const interfaceMatch = line.match(/^\d+:\s+([^:@\s]+):/);
          if (interfaceMatch && interfaceMatch[1] === interfaceName && line.includes('master')) {
            const masterMatch = line.match(/master (\S+)/);
            if (masterMatch) {
              const bridgeName = masterMatch[1];
              dependencies.usedByBridges.push(bridgeName);
              dependencies.dependentInterfaces.push({
                name: bridgeName,
                type: 'bridge',
                relationship: 'port'
              });
              console.log(`→ Found: ${interfaceName} is a port of bridge ${bridgeName}`);
            }
          }
        }
      }
    } catch (e) {
      // Try alternative method with /sys filesystem
      try {
        const masterPath = `/sys/class/net/${interfaceName}/master`;
        const masterLink = await run('readlink', [masterPath], { superuser: 'try' });
        if (masterLink) {
          const masterName = masterLink.split('/').pop();
          // Only add if this interface is NOT the bridge itself
          if (masterName !== interfaceName) {
            dependencies.usedByBridges.push(masterName);
            dependencies.dependentInterfaces.push({
              name: masterName,
              type: masterName.startsWith('br') ? 'bridge' : 'unknown',
              relationship: 'member'
            });
            console.log(`→ Found: ${interfaceName} is a member of ${masterName}`);
          }
        }
      } catch (sysError) {
        console.warn('Could not check bridge membership via /sys:', sysError);
      }
    }

    // 2.5. Check if this interface is itself a bridge that has ports
    if (interfaceName.startsWith('br') || interfaceName.includes('bridge')) {
      console.log(`→ Checking if bridge ${interfaceName} has ports...`);
      try {
        const bridgePortsInfo = await run('bridge', ['link', 'show'], { superuser: 'try' });
        if (bridgePortsInfo) {
          const lines = bridgePortsInfo.split('\n');
          for (const line of lines) {
            // Look for ports that belong to this bridge
            // Format: "4: eno3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master br2 state disabled priority 32 cost 4"
            // We want to match: "4: somePort: ... master interfaceName ..."
            const masterMatch = line.match(/master (\S+)/);
            if (masterMatch && masterMatch[1] === interfaceName) {
              // Extract the port interface name
              const portMatch = line.match(/^\d+:\s+([^:@\s]+):/);
              if (portMatch) {
                const portName = portMatch[1];
                dependencies.dependentInterfaces.push({
                  name: portName,
                  type: 'bridge-port',
                  relationship: 'port'
                });
                console.log(`→ Found: ${portName} is a port of bridge ${interfaceName}`);
              }
            }
          }
        }
      } catch (e) {
        console.warn('Could not check if bridge has ports:', e);
      }
    }

    // 2.6. Check if this interface is itself a bond that has slaves
    try {
      const bondInfo = await run('cat', [`/proc/net/bonding/${interfaceName}`], { superuser: 'try' });
      if (bondInfo) {
        // Parse slave interfaces from bond info
        const slaveMatches = bondInfo.match(/Slave Interface: (\S+)/g);
        if (slaveMatches) {
          for (const match of slaveMatches) {
            const slaveName = match.replace('Slave Interface: ', '');
            dependencies.dependentInterfaces.push({
              name: slaveName,
              type: 'bond-slave',
              relationship: 'slave'
            });
          }
        }
      }
    } catch (e) {
      // Not a bond or bond doesn't exist, that's fine
    }

    // 3. Check for VLAN interfaces on this interface
    try {
      const allInterfaces = await run('ifconfig', ['-a'], { superuser: 'try' });
      if (allInterfaces) {
        const interfaceBlocks = allInterfaces.split(/\n(?=\S)/);
        for (const block of interfaceBlocks) {
          if (!block.trim() || !block.includes(':')) continue;
          
          const firstLine = block.split('\n')[0];
          const nameMatch = firstLine.match(/^([^:\s]+)/);
          
          if (nameMatch) {
            const iface = nameMatch[1].trim();
            // Look for VLAN interfaces that use this interface as parent
            if (iface.includes(`@${interfaceName}`) || iface.includes(`${interfaceName}.`)) {
              dependencies.hasVlans.push(iface);
              dependencies.dependentInterfaces.push({
                name: iface,
                type: 'vlan',
                relationship: 'child'
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not check VLAN dependencies:', e);
    }

    // 4. Determine if there are any dependencies
    dependencies.hasDependencies = dependencies.dependentInterfaces.length > 0;

    // 5. Assess criticality and create warnings
    if (dependencies.usedByBonds.length > 0) {
      dependencies.criticalDependencies.push(...dependencies.usedByBonds);
      dependencies.warnings.push(`⚠ Interface is a slave in bond(s): ${dependencies.usedByBonds.join(', ')}`);
      dependencies.warnings.push(`   Removing this interface will affect bond redundancy and may cause network disruption.`);
    }

    if (dependencies.usedByBridges.length > 0) {
      dependencies.criticalDependencies.push(...dependencies.usedByBridges);
      dependencies.warnings.push(`⚠ Interface is a port in bridge(s): ${dependencies.usedByBridges.join(', ')}`);
      dependencies.warnings.push(`   Removing this interface will affect bridge connectivity.`);
    }

    // Add warnings for bridge/bond ports and slaves
    const bridgePorts = dependencies.dependentInterfaces.filter(dep => dep.relationship === 'port');
    const bondSlaves = dependencies.dependentInterfaces.filter(dep => dep.relationship === 'slave');
    
    if (bridgePorts.length > 0) {
      const portNames = bridgePorts.map(p => p.name);
      dependencies.warnings.push(`→ Bridge has ${bridgePorts.length} port(s): ${portNames.join(', ')}`);
      dependencies.warnings.push(`   Deleting this bridge will remove all ports from the bridge.`);
    }
    
    if (bondSlaves.length > 0) {
      const slaveNames = bondSlaves.map(s => s.name);
      dependencies.warnings.push(`→ Bond has ${bondSlaves.length} slave(s): ${slaveNames.join(', ')}`);
      dependencies.warnings.push(`   Deleting this bond will free all slave interfaces.`);
    }

    if (dependencies.hasVlans.length > 0) {
      dependencies.criticalDependencies.push(...dependencies.hasVlans);
      dependencies.warnings.push(`→ Interface has VLAN(s): ${dependencies.hasVlans.join(', ')}`);
      dependencies.warnings.push(`   VLANs will be automatically removed when parent interface is deleted.`);
    }

    // 6. Determine if deletion should be allowed
    console.log(`→ Dependency Assessment for ${interfaceName}:`);
    console.log(`   - usedByBonds: ${dependencies.usedByBonds.length} (${dependencies.usedByBonds.join(', ')})`);
    console.log(`   - usedByBridges: ${dependencies.usedByBridges.length} (${dependencies.usedByBridges.join(', ')})`);
    console.log(`   - bridgePorts: ${bridgePorts.length} (${bridgePorts.map(p => p.name).join(', ')})`);
    console.log(`   - bondSlaves: ${bondSlaves.length} (${bondSlaves.map(s => s.name).join(', ')})`);
  console.log(`   - hasVlans: ${dependencies.hasVlans.length} (${dependencies.hasVlans.join(', ')})`);
    
    if (dependencies.usedByBonds.length > 0 || dependencies.usedByBridges.length > 0) {
      // Interface is a member/slave of another construct - block deletion
  dependencies.canDelete = false;
  dependencies.warnings.push(`✗ Cannot delete: Interface is actively used by other network constructs.`);
  console.log(`⛔ Blocking deletion: interface is used by other constructs`);
    } else if (bridgePorts.length > 0 || bondSlaves.length > 0 || dependencies.hasVlans.length > 0) {
      // Interface is a bridge/bond/parent with dependents - allow with confirmation
    dependencies.canDelete = true;
  dependencies.warnings.push(`ℹ️ Deletion allowed but will affect dependent interfaces.`);
    console.log(`⚠ Allowing deletion with confirmation: interface has dependents`);
    }

    // 7. Generate suggested deletion order
    if (dependencies.hasDependencies) {
  dependencies.suggestedOrder.push(`ℹ️ Suggested deletion order:`);
      
      if (dependencies.hasVlans.length > 0) {
        dependencies.suggestedOrder.push(`1. Delete VLAN interfaces: ${dependencies.hasVlans.join(', ')}`);
      }
      
      if (dependencies.usedByBonds.length > 0) {
        dependencies.suggestedOrder.push(`2. Remove from bond(s) or delete bond(s): ${dependencies.usedByBonds.join(', ')}`);
      }
      
      if (dependencies.usedByBridges.length > 0) {
        dependencies.suggestedOrder.push(`3. Remove from bridge(s) or delete bridge(s): ${dependencies.usedByBridges.join(', ')}`);
      }
      
      // For bridges/bonds being deleted, show what will happen to dependents
      if (bridgePorts.length > 0) {
  dependencies.suggestedOrder.push(`ℹ️ Deleting this bridge will automatically remove ports: ${bridgePorts.map(p => p.name).join(', ')}`);
      }
      
      if (bondSlaves.length > 0) {
  dependencies.suggestedOrder.push(`ℹ️ Deleting this bond will automatically free slaves: ${bondSlaves.map(s => s.name).join(', ')}`);
      }
      
      if (dependencies.usedByBonds.length > 0 || dependencies.usedByBridges.length > 0) {
        dependencies.suggestedOrder.push(`4. Then delete interface: ${interfaceName}`);
      }
    }

  } catch (error) {
    console.error('Error checking interface dependencies:', error);
  dependencies.warnings.push(`ℹ️ Could not fully check dependencies: ${error.message}`);
  }

  console.log(`✅ Dependency check completed for ${interfaceName}:`, dependencies);
  return dependencies;
}

// Enhanced dependency confirmation dialog
async function showDependencyConfirmationDialog(interfaceName, dependencies) {
  return new Promise((resolve) => {
    const modal = document.createElement('dialog');
    modal.className = 'dependency-check-modal';
    
    const canDeleteClass = dependencies.canDelete ? 'btn-warning' : 'btn-danger';
    const actionText = dependencies.canDelete ? '⚠ Delete with Dependencies' : '✗ Cannot Delete';
    
    modal.innerHTML = `
      <div class="modal-content">
        <h2>⚠ Interface Dependency Check</h2>
        
        <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px;">
          <div style="display: flex; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 2rem; margin-right: 0.5rem;">ℹ️</span>
            <strong style="color: #856404;">Dependency Analysis for Interface: ${interfaceName}</strong>
          </div>
        </div>

        ${dependencies.hasDependencies ? `
        <div style="margin: 1rem 0; padding: 1rem; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
          <strong style="color: #721c24;">ℹ️ Dependencies Found:</strong>
          <ul style="color: #721c24; margin: 0.5rem 0; padding-left: 2rem;">
            ${dependencies.dependentInterfaces.map(dep => 
              `<li><strong>${dep.name}</strong> (${dep.type}) - Interface is ${dep.relationship}</li>`
            ).join('')}
          </ul>
        </div>

        <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px;">
          <strong style="color: #856404;">ℹ️ Impact Assessment:</strong>
          <div style="color: #856404; margin-top: 0.5rem; font-family: monospace; white-space: pre-line;">
${dependencies.warnings.join('\n')}
          </div>
        </div>

        ${dependencies.suggestedOrder.length > 0 ? `
        <div style="margin: 1rem 0; padding: 1rem; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px;">
          <strong style="color: #0c5460;">ℹ️ Recommended Action:</strong>
          <div style="color: #0c5460; margin-top: 0.5rem; font-family: monospace; white-space: pre-line;">
${dependencies.suggestedOrder.join('\n')}
          </div>
        </div>
        ` : ''}
        ` : `
        <div style="margin: 1rem 0; padding: 1rem; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px;">
          <strong style="color: #155724;">✔ No Dependencies Found</strong>
          <p style="color: #155724; margin: 0.5rem 0;">This interface can be safely deleted without affecting other network constructs.</p>
        </div>
        `}

        ${!dependencies.canDelete ? `
        <div style="margin: 1.5rem 0; padding: 1rem; border: 2px solid #dc3545; border-radius: 4px; background: #f8d7da;">
          <strong style="color: #721c24;">ℹ️ Deletion Blocked</strong>
          <p style="color: #721c24; margin: 0.5rem 0;">This interface cannot be deleted because it is actively used by other network constructs. Please follow the suggested deletion order above.</p>
        </div>
        ` : dependencies.hasDependencies ? `
        <div style="margin: 1.5rem 0; padding: 1rem; border: 2px dashed #ffc107; border-radius: 4px;">
          <label style="font-weight: 600; color: #856404; display: block; margin-bottom: 0.5rem;">
            ℹ️ Type "DELETE WITH DEPENDENCIES" to confirm:
          </label>
          <input 
            type="text" 
            id="dependency-confirmation-input" 
            placeholder="Enter: DELETE WITH DEPENDENCIES" 
            style="width: 100%; padding: 0.75rem; font-family: monospace; font-size: 1rem; border: 2px solid #ffc107; border-radius: 4px; text-transform: uppercase;"
            autocomplete="off"
            spellcheck="false"
          >
          <small style="color: #6c757d; display: block; margin-top: 0.25rem;">
            You must type exactly: <code>DELETE WITH DEPENDENCIES</code>
          </small>
        </div>
        ` : ''}

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
          <button type="button" class="btn" id="cancel-dependency-check" style="min-width: 120px; padding: 0.75rem 1.25rem;">
            ✖ Cancel
          </button>
          ${dependencies.canDelete ? `
          <button type="button" class="btn ${canDeleteClass}" id="confirm-dependency-delete" style="min-width: 200px; padding: 0.75rem 1.25rem;" ${dependencies.hasDependencies ? 'disabled' : ''}>
            ${actionText}
          </button>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModal(modal);

    const cancelButton = modal.querySelector('#cancel-dependency-check');
    const confirmButton = modal.querySelector('#confirm-dependency-delete');
    const confirmInput = modal.querySelector('#dependency-confirmation-input');

    // Handle confirmation input if dependencies exist
    if (confirmInput && dependencies.hasDependencies) {
      confirmInput.addEventListener('input', () => {
        const inputValue = confirmInput.value.trim().toUpperCase();
        const isValid = inputValue === 'DELETE WITH DEPENDENCIES';
        confirmButton.disabled = !isValid;
        
        if (isValid) {
          confirmButton.style.backgroundColor = '#ffc107';
          confirmButton.style.borderColor = '#ffc107';
          confirmButton.style.color = '#212529';
        } else {
          confirmButton.style.backgroundColor = '#6c757d';
          confirmButton.style.borderColor = '#6c757d';
          confirmButton.style.color = '#ffffff';
        }
      });

      confirmInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !confirmButton.disabled) {
          confirmButton.click();
        }
      });
    }

    cancelButton.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    if (confirmButton) {
      confirmButton.addEventListener('click', () => {
        if (!dependencies.hasDependencies || 
            (confirmInput && confirmInput.value.trim().toUpperCase() === 'DELETE WITH DEPENDENCIES')) {
          modal.close();
          resolve(true);
        }
      });
    }

    modal.addEventListener('close', () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    });

    modal.showModal();
    if (confirmInput) {
      confirmInput.focus();
    }
  });
}

// Helper function to check if interface is critical (imported from advanced-actions.js logic)
function checkIfInterfaceCritical(iface) {
  const reasons = [];
  let critical = false;

  // Check for public IP (not private ranges)
  if (iface.ipv4) {
    const ip = iface.ipv4.split('/')[0]; // Remove CIDR notation
    if (!isPrivateIP(ip)) {
      reasons.push(`has public IP address ${iface.ipv4}`);
      critical = true;
    }
  }

  // Check if it has a gateway configured (might be default route)
  if (iface.ipv4 && (iface.ipv4.includes('192.168.1.') || iface.ipv4.includes('10.0.0.') || iface.ipv4.includes('172.'))) {
    reasons.push('may be used for default gateway');
    critical = true;
  }

  // Check for specific critical interface names
  const criticalNames = ['br0', 'bond0', 'eth0', 'eno1', 'enp0s3'];
  if (criticalNames.some(name => iface.dev.toLowerCase().includes(name.toLowerCase()))) {
    reasons.push('is a primary network interface');
    critical = true;
  }

  // Check if interface is UP and has traffic (high usage interfaces)
  if (iface.state === 'UP' && iface.ipv4) {
    reasons.push('is currently active with IP configuration');
    critical = true;
  }

  return { critical, reasons };
}

// Helper function to check if IP is private
function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true;
  
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  return false;
}

// Critical IP change confirmation dialog
async function showCriticalIPChangeConfirmation(iface, criticalInfo) {
  return new Promise((resolve) => {
    const modal = document.createElement('dialog');
    modal.className = 'critical-ip-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>⚠ Change IP Address on Critical Interface</h2>
        <div style="margin:0.75rem 0; padding:0.75rem; background:#fff3cd; border:1px solid #ffc107; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
            <span style="font-size:1.5rem;">⚠</span>
            <strong style="color:#856404;">WARNING: This interface appears to be critical!</strong>
          </div>
          <div style="color:#856404; font-size:0.95rem;">
            <p style="margin:0 0 0.25rem;"><strong>Interface:</strong> <code>${iface.dev}</code></p>
            <p style="margin:0 0 0.25rem;"><strong>IP Address:</strong> <code>${iface.ipv4 || 'None'}</code></p>
            <p style="margin:0 0 0.5rem;"><strong>Status:</strong> <code>${iface.state}</code></p>
            <p style="margin:0 0 0.25rem;"><strong>Critical because it:</strong></p>
            ${criticalInfo.reasons && criticalInfo.reasons.length > 1 ? `<ul style="margin:0.25rem 0; padding-left:1.25rem;">${criticalInfo.reasons.map(reason=>`<li style="margin:0.25rem 0;">${reason}</li>`).join('')}</ul>` : `<p style="margin:0.25rem 0;"><code>${(criticalInfo.reasons && criticalInfo.reasons[0])||''}</code></p>`}
          </div>
        </div>
        
        <div style="margin:0.5rem 0; padding:0.75rem; background:#f8d7da; border:1px solid #f5c6cb; border-radius:4px;">
          <strong style="color:#721c24;">⚠ Changing the IP address on this interface may:</strong>
          <ul style="color:#721c24; margin:0.5rem 0; padding-left:2rem;">
            <li style="margin:0.25rem 0;">Cause immediate loss of network connectivity</li>
            <li style="margin:0.25rem 0;">Make the system unreachable via current IP address</li>
            <li style="margin:0.25rem 0;">Disrupt SSH sessions and remote management</li>
            <li style="margin:0.25rem 0;">Affect services depending on this interface</li>
            <li style="margin:0.25rem 0;">Require console/physical access to restore connectivity</li>
          </ul>
        </div>
        
        <div style="margin:1.5rem 0; padding:0.75rem; border:2px dashed #dc3545; border-radius:4px;">
          <label style="font-weight:600; color:#dc3545; display:block; margin-bottom:0.5rem;">⚠ Type "CHANGE IP" to confirm you understand the risks:</label>
          <input type="text" id="ip-change-confirmation-input" placeholder="Enter: CHANGE IP" style="width:100%; padding:0.5rem; font-family:monospace; font-size:0.95rem; border:2px solid #dc3545; border-radius:4px; text-transform:uppercase;" autocomplete="off" spellcheck="false">
          <small style="color:#6c757d; display:block; margin-top:0.25rem;">You must type exactly: <code>CHANGE IP</code></small>
        </div>
        
        <div style="margin:1rem 0; padding:0.75rem; background:#d1ecf1; border:1px solid #bee5eb; border-radius:4px;">
          <strong style="color:#0c5460;">ℹ Safety Recommendations:</strong>
          <ul style="color:#0c5460; margin:0.5rem 0 0 1rem; padding:0;">
            <li style="margin:0.25rem 0;"><strong>Have console/KVM access</strong> available before proceeding</li>
            <li style="margin:0.25rem 0;"><strong>Verify the new IP</strong> is correct and reachable</li>
            <li style="margin:0.25rem 0;"><strong>Check gateway settings</strong> match your network</li>
            <li style="margin:0.25rem 0;"><strong>Consider temporary changes first</strong> (uncheck persist option)</li>
            <li style="margin:0.25rem 0;"><strong>Have a rollback plan</strong> ready</li>
          </ul>
        </div>
        
        <div style="display:flex; gap:1rem; justify-content:flex-end; margin-top:1rem;">
          <button type="button" class="btn" id="cancel-critical-ip-change" style="min-width:120px; padding:0.65rem 1.15rem;">✗ Cancel</button>
          <button type="button" class="btn btn-warning" id="confirm-critical-ip-change" style="min-width:170px; padding:0.65rem 1.15rem;" disabled>⚠ Proceed with IP Change</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModal(modal);

    const confirmInput = modal.querySelector('#ip-change-confirmation-input');
    const confirmButton = modal.querySelector('#confirm-critical-ip-change');
    const cancelButton = modal.querySelector('#cancel-critical-ip-change');

    // Enable/disable confirm button based on input
    confirmInput.addEventListener('input', () => {
      const inputValue = confirmInput.value.trim().toUpperCase();
      const isValid = inputValue === 'CHANGE IP';
      confirmButton.disabled = !isValid;
      
      if (isValid) {
        confirmButton.style.backgroundColor = '#ffc107';
        confirmButton.style.borderColor = '#ffc107';
        confirmButton.style.color = '#212529';
      } else {
        confirmButton.style.backgroundColor = '#6c757d';
        confirmButton.style.borderColor = '#6c757d';
        confirmButton.style.color = '#ffffff';
      }
    });

    // Handle Enter key in input
    confirmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmButton.disabled) {
        confirmButton.click();
      }
    });

    cancelButton.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    confirmButton.addEventListener('click', () => {
      if (confirmInput.value.trim().toUpperCase() === 'CHANGE IP') {
        modal.close();
        resolve(true);
      }
    });

    modal.addEventListener('close', () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    });

    modal.showModal();
    confirmInput.focus();
  });
}

// Critical interface down confirmation dialog
async function showCriticalInterfaceDownConfirmation(iface, criticalInfo) {
  return new Promise((resolve) => {
    const modal = document.createElement('dialog');
    modal.className = 'critical-down-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>⚠ Bring Down Critical Interface</h2>
        <div style="margin:0.75rem 0; padding:0.75rem; background:#fff3cd; border:1px solid #ffc107; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
            <span style="font-size:1.5rem;">⚠</span>
            <strong style="color:#856404;">WARNING: You are about to disable a critical network interface!</strong>
          </div>
          <div style="color:#856404; font-size:0.95rem;">
            <p style="margin:0 0 0.25rem;"><strong>Interface:</strong> <code>${iface.dev}</code></p>
            <p style="margin:0 0 0.25rem;"><strong>IP Address:</strong> <code>${iface.ipv4 || 'None'}</code></p>
            <p style="margin:0 0 0.5rem;"><strong>Status:</strong> <code>${iface.state}</code></p>
            <p style="margin:0 0 0.25rem;"><strong>Critical because it:</strong></p>
            ${criticalInfo.reasons && criticalInfo.reasons.length > 1 ? `<ul style="margin:0.25rem 0; padding-left:1.25rem;">${criticalInfo.reasons.map(reason=>`<li style="margin:0.25rem 0;">${reason}</li>`).join('')}</ul>` : `<p style="margin:0.25rem 0;"><code>${(criticalInfo.reasons && criticalInfo.reasons[0])||''}</code></p>`}
          </div>
        </div>
        
        <div style="margin:0.5rem 0; padding:0.75rem; background:#f8d7da; border:1px solid #f5c6cb; border-radius:4px;">
          <strong style="color:#721c24;">⚠ Bringing down this interface will:</strong>
          <ul style="color:#721c24; margin:0.5rem 0; padding-left:2rem;">
            <li style="margin:0.25rem 0;">Immediately disconnect all network traffic on this interface</li>
            <li style="margin:0.25rem 0;">Make the system unreachable via this IP address</li>
            <li style="margin:0.25rem 0;">Terminate active SSH sessions and connections</li>
            <li style="margin:0.25rem 0;">Affect services and applications using this interface</li>
            <li style="margin:0.25rem 0;">May require console/physical access to bring it back up</li>
          </ul>
        </div>

        <div style="margin:1.5rem 0; padding:0.75rem; border:2px dashed #dc3545; border-radius:4px;">
          <label style="font-weight:600; color:#dc3545; display:block; margin-bottom:0.5rem;">⚠ Type "BRING DOWN" to confirm you understand the risks:</label>
          <input type="text" id="interface-down-confirmation-input" placeholder="Enter: BRING DOWN" style="width:100%; padding:0.5rem; font-family:monospace; font-size:0.95rem; border:2px solid #dc3545; border-radius:4px; text-transform:uppercase;" autocomplete="off" spellcheck="false">
          <small style="color:#6c757d; display:block; margin-top:0.25rem;">You must type exactly: <code>BRING DOWN</code></small>
        </div>

        <div style="margin:1rem 0; padding:0.75rem; background:#d1ecf1; border:1px solid #bee5eb; border-radius:4px;">
          <strong style="color:#0c5460;">⚠ Before Proceeding:</strong>
          <ul style="color:#0c5460; margin:0.5rem 0 0 1rem; padding:0;">
            <li style="margin:0.25rem 0;">Ensure console/KVM access is available</li>
            <li style="margin:0.25rem 0;">Verify alternative network paths exist</li>
            <li style="margin:0.25rem 0;">Consider the timing - avoid during critical operations</li>
            <li style="margin:0.25rem 0;">Notify users/services that may be affected</li>
            <li style="margin:0.25rem 0;">Have a recovery plan ready</li>
          </ul>
        </div>

        <div style="margin:1rem 0; padding:0.75rem; background:#e2e3e5; border:1px solid #d6d8db; border-radius:4px;">
          <strong style="color:#383d41;">ℹ Alternative Options:</strong>
          <ul style="color:#383d41; margin:0.5rem 0 0 1rem; padding:0;">
            <li style="margin:0.25rem 0;">Consider temporarily removing IP addresses instead</li>
            <li style="margin:0.25rem 0;">Check if you can modify interface settings without bringing it down</li>
            <li style="margin:0.25rem 0;">Test the operation during a maintenance window</li>
          </ul>
        </div>

        <div style="display:flex; gap:1rem; justify-content:flex-end; margin-top:1rem;">
          <button type="button" class="btn" id="cancel-critical-interface-down" style="min-width:120px; padding:0.65rem 1.15rem;">✗ Cancel</button>
          <button type="button" class="btn btn-warning" id="confirm-critical-interface-down" style="min-width:120px; padding:0.75rem 1.25rem;" disabled>
            ℹ️ Bring Interface Down
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModal(modal);

    const confirmInput = modal.querySelector('#interface-down-confirmation-input');
    const confirmButton = modal.querySelector('#confirm-critical-interface-down');
    const cancelButton = modal.querySelector('#cancel-critical-interface-down');

    // Enable/disable confirm button based on input
    confirmInput.addEventListener('input', () => {
      const inputValue = confirmInput.value.trim().toUpperCase();
      const isValid = inputValue === 'BRING DOWN';
      confirmButton.disabled = !isValid;
      
      if (isValid) {
        confirmButton.style.backgroundColor = '#ffc107';
        confirmButton.style.borderColor = '#ffc107';
        confirmButton.style.color = '#212529';
      } else {
        confirmButton.style.backgroundColor = '#6c757d';
        confirmButton.style.borderColor = '#6c757d';
        confirmButton.style.color = '#ffffff';
      }
    });

    // Handle Enter key in input
    confirmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmButton.disabled) {
        confirmButton.click();
      }
    });

    cancelButton.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    confirmButton.addEventListener('click', () => {
      if (confirmInput.value.trim().toUpperCase() === 'BRING DOWN') {
        modal.close();
        resolve(true);
      }
    });

    modal.addEventListener('close', () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    });

    modal.showModal();
    confirmInput.focus();
  });
}

// Expose core functions only
window.getPhysicalInterfaces = getPhysicalInterfaces;
window.clearPhysicalInterfacesCache = clearPhysicalInterfacesCache;
window.loadInterfaces = loadInterfaces;
window.safeNetplanApply = safeNetplanApply;
window.quickNetplanApply = quickNetplanApply;
window.showNetplanTryProgress = showNetplanTryProgress;
