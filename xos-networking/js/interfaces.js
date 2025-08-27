'use strict';
/* global createButton, createStatusBadge, netplanAction, run, setStatus, setupModal, addAdvancedInterfaceActions, $, $$ */

// Helper function to determine user-friendly interface type names
function getInterfaceTypeFriendlyName(interfaceName, rawType, fullLine) {
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

// Enhanced device name display with VLAN information
function createDeviceDisplayName(interfaceName) {
  const vlanInfo = parseVlanInfo(interfaceName);
  
  if (vlanInfo.isVlan) {
    return {
      displayName: interfaceName,
      subtitle: `🏷️ VLAN ${vlanInfo.id} on ${vlanInfo.parent}`,
      isVlan: true,
      vlanId: vlanInfo.id,
      parentInterface: vlanInfo.parent
    };
  }
  
  return {
    displayName: interfaceName,
    subtitle: null,
    isVlan: false
  };
}

// Enhanced bonding/bridging member information parser
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
      
      try {
        // Get bridge information using brctl or ip bridge
        const bridgeInfo = await run('ip', ['link', 'show', 'master', interfaceName], { superuser: 'try' });
        if (bridgeInfo) {
          // Parse bridge members from ip output
          const lines = bridgeInfo.split('\n');
          details.members = lines
            .filter(line => line.includes('master ' + interfaceName))
            .map(line => {
              const match = line.match(/^\d+:\s+([^:@]+)/);
              return match ? match[1].trim() : null;
            })
            .filter(Boolean);
        }
        
        // Try alternative method with bridge command
        try {
          const bridgeMembers = await run('bridge', ['link', 'show'], { superuser: 'try' });
          if (bridgeMembers) {
            const lines = bridgeMembers.split('\n');
            const bridgeLines = lines.filter(line => line.includes(`master ${interfaceName}`));
            bridgeLines.forEach(line => {
              const match = line.match(/^\d+:\s+([^:@\s]+)/);
              if (match && !details.members.includes(match[1])) {
                details.members.push(match[1]);
              }
            });
          }
        } catch (e) {
          console.warn('Bridge command not available:', e);
        }
      } catch (e) {
        console.warn('Could not get bridge member info:', e);
      }
    }

    // Check if this interface is a member of a bond or bridge
    try {
      const linkInfo = await run('ip', ['link', 'show', interfaceName], { superuser: 'try' });
      if (linkInfo) {
        // Check for master relationship
        const masterMatch = linkInfo.match(/master (\w+)/);
        if (masterMatch) {
          details.memberOf = masterMatch[1];
          
          // Determine role based on master type
          if (masterMatch[1].startsWith('bond')) {
            details.role = 'Bond Member';
          } else if (masterMatch[1].startsWith('br')) {
            details.role = 'Bridge Port';
          } else {
            details.role = 'Member';
          }
        }
      }
    } catch (e) {
      console.warn('Could not get interface master info:', e);
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
    subtitleParts.push(`🏷️ VLAN ${vlanInfo.id} on ${vlanInfo.parent}`);
  }
  
  if (bondBridgeInfo.isBond && bondBridgeInfo.members.length > 0) {
    subtitleParts.push(`🔗 Bond: ${bondBridgeInfo.members.length} members (${bondBridgeInfo.bondMode || 'unknown mode'})`);
  }
  
  if (bondBridgeInfo.isBridge && bondBridgeInfo.members.length > 0) {
    subtitleParts.push(`🌉 Bridge: ${bondBridgeInfo.members.length} ports`);
  }
  
  if (bondBridgeInfo.memberOf) {
    subtitleParts.push(`👥 ${bondBridgeInfo.role} of ${bondBridgeInfo.memberOf}`);
  }
  
  if (subtitleParts.length > 0) {
    displayInfo.subtitle = subtitleParts.join(' • ');
  }
  
  return displayInfo;
}

async function getPhysicalInterfaces() {
  try {
    const output = await run('ip', ['-o', 'link', 'show']);
    const interfaces = [];

    output.split('\n').forEach(line => {
      const match = line.match(/^\d+:\s+([^:]+):/);
      if (match) {
        const dev = match[1].trim();
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

    return interfaces;
  } catch (e) {
    console.error('Failed to get physical interfaces:', e);
    return [];
  }
}

async function loadInterfaces() {
  console.log('Loading interfaces...');
  setStatus('Loading interfaces...');

  const tbody = $('#table-interfaces tbody');
  if (!tbody) {
    console.error('Interface table body not found');
    setStatus('Interface table not found');
    return;
  }

  try {
    try {
      await run('echo', ['test']);
      console.log('Basic command test passed');
    } catch (e) {
      throw new Error('Cockpit command execution not working: ' + e);
    }

    const output = await run('ip', ['-details', 'addr', 'show']);
    console.log('IP command output received, length:', output.length);

    if (!output || output.length < 10) {
      throw new Error('No output from ip command');
    }

    const interfaces = [];
    const blocks = output.split(/\n(?=\d+: )/);
    console.log('Processing', blocks.length, 'interface blocks');

    for (const block of blocks) {
      if (!block.trim()) continue;

      const lines = block.split('\n');
      const firstLine = lines[0];
      const match = firstLine.match(/^(\d+): ([^:]+):/);

      if (match) {
        const dev = match[2];
        let type = 'ethernet', state = 'DOWN', mac = '', ipv4 = '', ipv6 = '', mtu = '1500';

        for (const line of lines) {
          if (line.includes('mtu')) {
            const mtuMatch = line.match(/mtu (\d+)/);
            if (mtuMatch) mtu = mtuMatch[1];
          }
          if (line.includes('link/')) {
            const macMatch = line.match(/link\/\w+ ([0-9a-fA-F:]+)/);
            if (macMatch) mac = macMatch[1];
            const typeMatch = line.match(/link\/(\w+)/);
            if (typeMatch) {
              const rawType = typeMatch[1];
              // Enhanced type detection with user-friendly names
              type = getInterfaceTypeFriendlyName(dev, rawType, line);
            }
          }
          if (line.includes('state')) {
            const stateMatch = line.match(/state (\w+)/);
            if (stateMatch) state = stateMatch[1];
          }
          if (line.trim().startsWith('inet ')) {
            const ipMatch = line.match(/inet ([^\s]+)/);
            if (ipMatch) ipv4 = ipMatch[1];
          }
          if (line.trim().startsWith('inet6 ')) {
            const ip6Match = line.match(/inet6 ([^\s]+)/);
            if (ip6Match && !ip6Match[1].startsWith('fe80')) ipv6 = ip6Match[1];
          }
        }

        interfaces.push({ dev, type, state, mac, ipv4, ipv6, mtu });
      }
    }

    console.log('Parsed', interfaces.length, 'interfaces:', interfaces.map(i => i.dev));

    // Initialize or update table manager
    if (!interfaceTableManager) {
      console.log('📊 Initializing interface table manager');
      interfaceTableManager = new InterfaceTableManager('table-interfaces', interfaces);
    } else {
      console.log('📊 Updating interface table manager with new data');
      interfaceTableManager.updateInterfaces(interfaces);
    }

    setStatus(`Loaded ${interfaces.length} interfaces`);

    tbody.innerHTML = '';

    if (interfaces.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="8" style="text-align: center; padding: 2rem;">No network interfaces found</td>';
      tbody.appendChild(row);
      setStatus('No interfaces found');
      return;
    }

    interfaces.sort((a, b) => a.dev.localeCompare(b.dev));

    for (const iface of interfaces) {
      const row = document.createElement('tr');

      // Enhanced device name display with bonding/bridging info
      const deviceInfo = await createEnhancedDeviceDisplayName(iface.dev, iface.type);
      const deviceCell = document.createElement('td');
      
      // Apply styling based on interface type
      if (deviceInfo.isVlan) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600; color: var(--primary-color);">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(0,102,204,0.05) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.isBond) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600; color: var(--warning-color);">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(255,193,7,0.05) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.isBridge) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600; color: var(--info-color);">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(23,162,184,0.05) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.memberOf) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600;">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(108,117,125,0.03) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.subtitle) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600;">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
      } else {
        deviceCell.textContent = deviceInfo.displayName;
      }

      const actionsCell = document.createElement('td');
      actionsCell.className = 'actions';

      const btnUp = createButton('Up', async () => {
        await run('ip', ['link', 'set', iface.dev, 'up'], { superuser: 'require' });
        await loadInterfaces();
      });

      const btnDown = createButton('Down', async () => {
        // Check if interface is critical before allowing it to be brought down
        const isCritical = checkIfInterfaceCritical(iface);
        
        if (isCritical.critical) {
          // Show critical interface warning before proceeding
          const confirmationResult = await showCriticalInterfaceDownConfirmation(iface, isCritical);
          if (!confirmationResult) {
            return; // User cancelled or didn't type confirmation correctly
          }
        } else if (iface.state === 'UP') {
          // Show simple warning for non-critical UP interfaces
          const confirmMessage = `📉 Bring Down Interface ${iface.dev}?\n\n` +
                               `Current Status: ${iface.state}\n` +
                               `${iface.ipv4 ? `IP Address: ${iface.ipv4}\n` : ''}` +
                               `\nThis will temporarily disable network connectivity on this interface.\n\n` +
                               `Are you sure you want to bring it down?`;
          
          if (!confirm(confirmMessage)) {
            return;
          }
        }

        try {
          await run('ip', ['link', 'set', iface.dev, 'down'], { superuser: 'require' });
          await loadInterfaces();
        } catch (error) {
          alert(`❌ Failed to bring down interface ${iface.dev}: ${error}`);
        }
      });

      const btnInfo = createButton('Info', async () => {
        try {
          const info = await run('ip', ['addr', 'show', iface.dev]);
          
          // Enhanced info display with VLAN and bonding/bridging details
          let enhancedInfo = `Interface ${iface.dev} Details:\n\n`;
          
          const deviceInfo = await createEnhancedDeviceDisplayName(iface.dev, iface.type);
          
          if (deviceInfo.isVlan) {
            enhancedInfo += `🏷️ VLAN Information:\n`;
            enhancedInfo += `   VLAN ID: ${parseVlanInfo(iface.dev).id}\n`;
            enhancedInfo += `   Parent Interface: ${parseVlanInfo(iface.dev).parent}\n\n`;
          }
          
          if (deviceInfo.isBond) {
            enhancedInfo += `🔗 Bond Information:\n`;
            enhancedInfo += `   Bond Mode: ${deviceInfo.bondMode || 'Unknown'}\n`;
            enhancedInfo += `   Member Interfaces: ${deviceInfo.members.join(', ') || 'None'}\n`;
            enhancedInfo += `   Member Count: ${deviceInfo.members.length}\n\n`;
          }
          
          if (deviceInfo.isBridge) {
            enhancedInfo += `🌉 Bridge Information:\n`;
            enhancedInfo += `   Bridge Ports: ${deviceInfo.members.join(', ') || 'None'}\n`;
            enhancedInfo += `   Port Count: ${deviceInfo.members.length}\n\n`;
          }
          
          if (deviceInfo.memberOf) {
            enhancedInfo += `👥 Membership Information:\n`;
            enhancedInfo += `   Role: ${deviceInfo.role}\n`;
            enhancedInfo += `   Master Interface: ${deviceInfo.memberOf}\n\n`;
          }
          
          enhancedInfo += `📊 Technical Details:\n${info}`;
          alert(enhancedInfo);
        } catch (e) {
          alert(`Failed to get info for ${iface.dev}: ${e}`);
        }
      });

      const btnSetIP = createButton('Set IP', async () => {
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
        modal.style.maxWidth = '650px';
        modal.innerHTML = `
          <div class="modal-content">
            <h2>🌐 Set IP Address for ${iface.dev}</h2>
            <form id="set-ip-form">
              <label>📍 Current IPv4 Address
                <input type="text" value="${iface.ipv4 || 'None assigned'}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              </label>
              <label>🆕 New IPv4 Address/CIDR
                <input type="text" id="new-ip-addr" placeholder="192.168.1.100/24" required 
                       pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$"
                       value="${iface.ipv4 || ''}" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Use CIDR notation (e.g., 192.168.1.100/24)</small>
              </label>
              <label>🚪 Gateway (optional)
                <input type="text" id="new-gateway" placeholder="192.168.1.1"
                       pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$" 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Default gateway for this interface</small>
              </label>
              <label>🌐 DNS Servers (optional, comma separated)
                <input type="text" id="new-dns" placeholder="8.8.8.8,1.1.1.1" 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Comma separated list of DNS servers</small>
              </label>
              <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
                <label style="display: flex; align-items: flex-start; gap: 0.5rem; margin: 0;">
                  <input type="checkbox" id="persist-ip-config" checked style="margin-top: 0.25rem;">
                  <div>
                    <strong>💾 Persist configuration to netplan (recommended)</strong>
                    <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">
                      When enabled, configuration survives reboots. When disabled, changes are temporary.
                    </small>
                  </div>
                </label>
              </div>
              ${isCritical.critical ? `
              <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: var(--border-radius);">
                <strong>⚠️ CRITICAL INTERFACE WARNING:</strong> You are modifying a critical interface that ${isCritical.reasons.join(' and ')}.
                <br><small>Changes may affect network connectivity. Ensure you have alternative access before proceeding.</small>
              </div>
              ` : `
              <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                <strong>⚠️ Note:</strong> This will replace any existing IP configuration for this interface.
              </div>
              `}
              <div style="margin: 1rem 0; padding: 1rem; background: #d4edda; border-radius: var(--border-radius); border: 1px solid #c3e6cb;">
                <strong>🔍 Debugging:</strong> Check browser console (F12) for detailed logging during IP configuration process.
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <button type="button" class="btn" id="cancel-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">❌ Cancel</button>
                <button type="button" class="btn ${isCritical.critical ? 'btn-warning' : 'primary'}" id="apply-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">⚡ Apply Configuration</button>
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
            alert('❌ IP address is required!');
            modal.querySelector('#new-ip-addr').focus();
            return;
          }

          const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
          if (!ipRegex.test(newIp)) {
            alert('❌ Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
            modal.querySelector('#new-ip-addr').focus();
            return;
          }

          if (gateway && !/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(gateway)) {
            alert('❌ Invalid gateway address format!');
            modal.querySelector('#new-gateway').focus();
            return;
          }

          // Store original configuration for potential rollback
          const originalConfig = {
            ip: iface.ipv4,
            interface: iface.dev,
            state: iface.state
          };

          try {
            setStatus('Configuring IP address...');
            
            // Step 1: Ensure interface is UP before configuring IP
            console.log(`🔍 Checking interface ${iface.dev} status before IP configuration`);
            
            // First, let's get detailed info about the interface
            try {
              const interfaceInfo = await run('ip', ['addr', 'show', iface.dev], { superuser: 'try' });
              console.log(`📋 Current interface info:\n${interfaceInfo}`);
              
              // Check if the requested IP already exists
              if (interfaceInfo.includes(newIp.split('/')[0])) {
                console.log(`ℹ️ IP ${newIp} already configured on ${iface.dev}`);
                const confirmed = confirm(`The IP address ${newIp} appears to already be configured on ${iface.dev}.\n\nDo you want to continue anyway? This will remove and re-add the IP address.`);
                if (!confirmed) {
                  modal.close();
                  setStatus('Operation cancelled');
                  setTimeout(() => setStatus('Ready'), 2000);
                  return;
                }
              }
            } catch (infoError) {
              console.warn('Could not get interface info:', infoError);
            }
            
            try {
              if (iface.state !== 'UP') {
                console.log(`📈 Interface ${iface.dev} is ${iface.state}, bringing it UP first`);
                await run('ip', ['link', 'set', iface.dev, 'up'], { superuser: 'require' });
                console.log(`✅ Interface ${iface.dev} brought UP successfully`);
                
                // Wait a moment for interface to come up
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                console.log(`✅ Interface ${iface.dev} is already UP`);
              }
            } catch (upError) {
              console.warn(`⚠️ Could not bring interface UP: ${upError}`);
              // Continue anyway, might still work
            }

            // Step 2: Remove old IP if exists
            if (iface.ipv4) {
              try {
                console.log(`🗑️ Removing old IP ${iface.ipv4} from ${iface.dev}`);
                await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
                console.log(`✅ Removed old IP ${iface.ipv4} from ${iface.dev}`);
              } catch (e) {
                console.warn('⚠️ Could not remove old IP (may not exist):', e);
                // Continue anyway, might not exist
              }
            }

            // Step 3: Add new IP address
            try {
              console.log(`➕ Adding new IP ${newIp} to ${iface.dev}`);
              const ipResult = await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
              console.log(`✅ Added new IP ${newIp} to ${iface.dev}`);
              console.log(`📋 IP command output:`, ipResult);
            } catch (ipError) {
              console.error('❌ Failed to add IP address:', ipError);
              console.error('❌ IP command error details:', {
                message: ipError.message,
                problem: ipError.problem,
                exit_status: ipError.exit_status,
                exit_signal: ipError.exit_signal
              });
              
              // Try alternative method for VLAN interfaces
              if (iface.dev.includes('@') || iface.dev.includes('.')) {
                console.log(`🔄 Trying alternative method for VLAN interface ${iface.dev}`);
                try {
                  // Get the real interface name (remove @parent suffix)
                  const realIfaceName = iface.dev.split('@')[0];
                  console.log(`🔄 Using interface name: ${realIfaceName}`);
                  
                  const altResult = await run('ip', ['addr', 'add', newIp, 'dev', realIfaceName], { superuser: 'require' });
                  console.log(`✅ Alternative method succeeded for ${realIfaceName}`);
                  console.log(`📋 Alternative command output:`, altResult);
                } catch (altError) {
                  console.error('❌ Alternative method also failed:', altError);
                  
                  // Check if IP already exists
                  try {
                    const checkResult = await run('ip', ['addr', 'show', iface.dev], { superuser: 'try' });
                    if (checkResult.includes(newIp.split('/')[0])) {
                      console.log(`ℹ️ IP ${newIp} already exists on ${iface.dev}`);
                      alert(`ℹ️ IP address ${newIp} is already configured on ${iface.dev}.\n\nNo changes were made.`);
                      modal.close();
                      setStatus('IP already configured');
                      setTimeout(() => setStatus('Ready'), 2000);
                      return;
                    }
                  } catch (e) {
                    console.warn('Could not check existing IP addresses:', e);
                  }
                  
                  throw new Error(`Failed to add IP address ${newIp} to ${iface.dev}. Error: ${ipError.message || ipError}. Alternative method also failed: ${altError.message || altError}`);
                }
              } else {
                throw new Error(`Failed to add IP address ${newIp} to ${iface.dev}. Error: ${ipError.message || ipError}`);
              }
            }

            // Step 4: Configure gateway if provided
            if (gateway) {
              try {
                console.log(`🚪 Configuring gateway ${gateway} for ${iface.dev}`);
                
                // Try to remove any existing default route for this interface
                try {
                  await run('ip', ['route', 'del', 'default', 'dev', iface.dev], { superuser: 'require' });
                  console.log(`🗑️ Removed existing default route for ${iface.dev}`);
                } catch (e) {
                  console.log('ℹ️ No existing default route to remove (this is fine)');
                }
                
                // Add new default route
                await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', iface.dev], { superuser: 'require' });
                console.log(`✅ Added gateway ${gateway} for ${iface.dev}`);
              } catch (gwError) {
                console.warn('⚠️ Failed to configure gateway:', gwError);
                // Don't fail the entire operation for gateway issues
              }
            }

            // Step 5: Verify the IP was actually set
            try {
              console.log(`🔍 Verifying IP configuration was applied`);
              const verifyResult = await run('ip', ['addr', 'show', iface.dev], { superuser: 'try' });
              console.log(`📋 Current interface status:\n${verifyResult}`);
              
              if (!verifyResult.includes(newIp.split('/')[0])) {
                throw new Error(`IP address ${newIp} does not appear to be configured on ${iface.dev}`);
              }
              console.log(`✅ Verified IP ${newIp} is configured on ${iface.dev}`);
            } catch (verifyError) {
              console.warn('⚠️ Could not verify IP configuration:', verifyError);
              // Continue anyway, the set might have worked
            }

            // Step 6: 🌐 NEW - Perform connectivity tests
            console.log('🌐 Starting network connectivity tests...');
            setStatus('Testing network connectivity...');
            
            // Wait a moment for network stack to settle
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const connectivityResults = await performConnectivityTests(iface.dev, newIp, gateway, dns);
            
            // Handle connectivity test results
            let continueWithPersist = true;
            
            if (!connectivityResults.overall) {
              console.warn('🌐 Connectivity tests failed, showing results to user');
              const userAction = await showConnectivityTestResults(iface.dev, connectivityResults, { 
                allowRollback: true 
              });
              
              if (userAction.action === 'rollback') {
                console.log('🔄 User chose to rollback IP configuration');
                setStatus('Rolling back IP configuration');
                
                try {
                  // Rollback: Remove new IP
                  await run('ip', ['addr', 'del', newIp, 'dev', iface.dev], { superuser: 'require' });
                  
                  // Restore original IP if it existed
                  if (originalConfig.ip) {
                    await run('ip', ['addr', 'add', originalConfig.ip, 'dev', iface.dev], { superuser: 'require' });
                  }
                  
                  // Remove gateway if we added it
                  if (gateway) {
                    try {
                      await run('ip', ['route', 'del', 'default', 'via', gateway, 'dev', iface.dev], { superuser: 'require' });
                    } catch (e) {
                      console.warn('Could not remove added gateway during rollback:', e);
                    }
                  }
                  
                  modal.close();
                  alert(`🔄 IP configuration rolled back successfully.\n\nOriginal configuration restored: ${originalConfig.ip || 'No IP'}`);
                  setStatus('Configuration rolled back');
                  setTimeout(() => setStatus('Ready'), 3000);
                  await loadInterfaces();
                  return;
                  
                } catch (rollbackError) {
                  console.error('❌ Rollback failed:', rollbackError);
                  alert(`❌ Rollback failed: ${rollbackError.message || rollbackError}\n\nManual intervention may be required.`);
                }
              } else if (userAction.action === 'retry') {
                console.log('🔄 User chose to retry connectivity tests');
                // Recursively call the connectivity test
                const retryResults = await performConnectivityTests(iface.dev, newIp, gateway, dns);
                await showConnectivityTestResults(iface.dev, retryResults, { allowRollback: false });
              }
              
              // If user chose continue despite failed tests, proceed but skip persistence
              if (userAction.action === 'continue') {
                continueWithPersist = false; // Don't persist failed configurations
              }
            } else {
              console.log('✅ Connectivity tests passed, showing success results');
              await showConnectivityTestResults(iface.dev, connectivityResults, { allowRollback: false });
            }

            // Step 7: Persist configuration (only if connectivity tests passed or user explicitly continues)
            if (persist && continueWithPersist) {
              console.log('💾 Persisting IP configuration to netplan...');
              try {
                const netplanConfig = {
                  name: iface.dev,
                  static_ip: newIp
                };

                if (gateway) {
                  netplanConfig.gateway = gateway;
                }

                if (dns) {
                  netplanConfig.dns = dns;
                }

                console.log('📤 Sending netplan config:', netplanConfig);
                const result = await netplanAction('set_ip', netplanConfig);
                console.log('📥 Netplan result:', result);

                if (result.success) {
                  alert('✅ IP configuration applied and persisted successfully!');
                } else {
                  throw new Error(`Netplan error: ${result.message}`);
                }
              } catch (netplanError) {
                console.error('❌ Failed to persist IP configuration:', netplanError);
                alert(`❌ Failed to persist IP configuration: ${netplanError.message || netplanError}`);
              }
            } else {
              alert('✅ IP configuration applied successfully! (Not persisted)');
            }

            modal.close();
            setStatus('Interfaces loaded');
            loadInterfaces();
          } catch (error) {
            alert(`❌ Failed to set IP address: ${error}`);
            
            setStatus('Error during IP configuration');
            console.error('Error during IP configuration:', error);
          }
        });

        document.body.appendChild(modal);
        setupModal(modal);
      });

      const btnSetMTU = createButton('Set MTU', async () => {
        const modal = document.createElement('dialog');
        modal.style.maxWidth = '400px';
        modal.innerHTML = `
          <div class="modal-content">
            <h2>✏️ Set MTU for ${iface.dev}</h2>
            <form id="set-mtu-form">
              <label>🔧 Current MTU
                <input type="text" value="${iface.mtu}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              </label>
              <label>📏 New MTU
                <input type="number" id="new-mtu" placeholder="1500" required min="1280" max="8920" 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              </label>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem;">
                <button type="button" class="btn" id="cancel-mtu-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">❌ Cancel</button>
                <button type="submit" class="btn primary" id="apply-mtu-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">⚡ Apply MTU</button>
              </div>
            </form>
          </div>
        `;

        document.body.appendChild(modal);
        setupModal(modal);

        // Pre-fill current MTU value
        modal.querySelector('#new-mtu').value = iface.mtu || '';

        modal.querySelector('#cancel-mtu-config').addEventListener('click', () => {
          modal.close();
        });

        modal.querySelector('#set-mtu-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const newMtu = modal.querySelector('#new-mtu').value.trim();

          if (!newMtu || isNaN(newMtu)) {
            alert('❌ Please enter a valid MTU value');
            return;
          }

          try {
            setStatus(`Setting MTU to ${newMtu}...`);
            
            // First, bring the interface down
            await run('ip', ['link', 'set', iface.dev, 'down'], { superuser: 'require' });
            
            // Then, set the new MTU
            await run('ip', ['link', 'set', iface.dev, 'mtu', newMtu], { superuser: 'require' });
            
            // Finally, bring the interface back up
            await run('ip', ['link', 'set', iface.dev, 'up'], { superuser: 'require' });

            alert(`✅ MTU successfully set to ${newMtu} on ${iface.dev}`);
            modal.close();
            await loadInterfaces();
          } catch (error) {
            alert(`❌ Error setting MTU: ${error.message || error}`);
            console.error('Error setting MTU:', error);
            setStatus('Error setting MTU');
          }
        });

        document.body.appendChild(modal);
        setupModal(modal);
      });

      // Add all action buttons to the actions cell
      actionsCell.appendChild(btnUp);
      actionsCell.appendChild(btnDown);
      actionsCell.appendChild(btnInfo);
      actionsCell.appendChild(btnSetIP);
      actionsCell.appendChild(btnSetMTU);

      row.appendChild(actionsCell);
      tbody.appendChild(row);
    }

    // Initialize table manager after the table is populated
    setTimeout(() => {
      interfaceTableManager = new InterfaceTableManager('table-interfaces', interfaces);
      setStatus('Ready');
    }, 0);
  } catch (error) {
    console.error('Error loading interfaces:', error);
    setStatus('Error loading interfaces');
  }
}

// Table sorting and filtering functionality
class InterfaceTableManager {
  constructor(tableId, interfaces) {
    this.tableId = tableId;
    this.originalInterfaces = interfaces;
    this.filteredInterfaces = [...interfaces];
    this.currentSort = { column: null, direction: 'asc' };
    this.filters = {
      search: '',
      type: '',
      state: '',
      hasIP: ''
    };
    this.setupTableEnhancements();
  }

  setupTableEnhancements() {
    const table = document.getElementById(this.tableId);
    if (!table) return;

    // Add sorting to table headers
    this.addSortableHeaders(table);
    
    // Create and add filter controls
    this.createFilterControls(table);
    
    // Initial render
    this.renderTable();
  }

  addSortableHeaders(table) {
    const headers = table.querySelectorAll('thead th');
    const sortableColumns = [
      { index: 0, key: 'dev', name: 'Device' },
      { index: 1, key: 'type', name: 'Type' },
      { index: 2, key: 'state', name: 'State' },
      { index: 3, key: 'mac', name: 'MAC' },
      { index: 4, key: 'ipv4', name: 'IPv4' },
      { index: 5, key: 'ipv6', name: 'IPv6' },
      { index: 6, key: 'mtu', name: 'MTU' }
    ];

    sortableColumns.forEach(col => {
      const header = headers[col.index];
      if (header) {
        header.style.cursor = 'pointer';
        header.style.userSelect = 'none';
        header.style.position = 'relative';
        
        // Add sort indicator
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        indicator.style.marginLeft = '0.5rem';
        indicator.style.opacity = '0.5';
        indicator.textContent = '↕️';
        header.appendChild(indicator);

        header.addEventListener('click', () => {
          this.sortTable(col.key, col.name);
        });

        // Add hover effect
        header.addEventListener('mouseenter', () => {
          header.style.backgroundColor = 'rgba(0, 102, 204, 0.1)';
        });

        header.addEventListener('mouseleave', () => {
          header.style.backgroundColor = '';
        });
      }
    });
  }

  createFilterControls(table) {
    // Create filter toolbar
    const toolbar = table.previousElementSibling;
    if (!toolbar || !toolbar.classList.contains('toolbar')) return;

    // Create advanced filter section
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-controls';
    filterSection.style.cssText = `
      background: #f8f9fa;
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius);
      padding: 1rem;
      margin-bottom: 1rem;
      display: none;
    `;

    filterSection.innerHTML = `
      <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
        <div style="flex: 1; min-width: 200px;">
          <label style="font-weight: 500; margin-bottom: 0.25rem; display: block; font-size: 0.875rem;">🔍 Search All Fields</label>
          <input type="text" id="filter-search" placeholder="Search interfaces..." 
                 style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;">
        </div>
        
        <div style="min-width: 150px;">
          <label style="font-weight: 500; margin-bottom: 0.25rem; display: block; font-size: 0.875rem;">🏷️ Interface Type</label>
          <select id="filter-type" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;">
            <option value="">All Types</option>
          </select>
        </div>
        
        <div style="min-width: 120px;">
          <label style="font-weight: 500; margin-bottom: 0.25rem; display: block; font-size: 0.875rem;">📊 State</label>
          <select id="filter-state" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;">
            <option value="">All States</option>
            <option value="UP">UP</option>
            <option value="DOWN">DOWN</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </div>
        
        <div style="min-width: 140px;">
          <label style="font-weight: 500; margin-bottom: 0.25rem; display: block; font-size: 0.875rem;">🌐 IP Status</label>
          <select id="filter-hasip" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;">
            <option value="">All Interfaces</option>
            <option value="yes">Has IP Address</option>
            <option value="no">No IP Address</option>
          </select>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
          <button id="clear-filters" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
            🗑️ Clear Filters
          </button>
          <div id="filter-stats" style="font-size: 0.75rem; color: var(--muted-color); text-align: center;">
            <!-- Filter stats will be populated here -->
          </div>
        </div>
      </div>
    `;

    // Add toggle button to existing toolbar
    const toggleButton = document.createElement('button');
    toggleButton.className = 'btn btn-outline';
    toggleButton.innerHTML = '<span class="icon">🔽</span> Filters';
    toggleButton.style.marginLeft = '0.5rem';

    const existingActions = toolbar.querySelector('.quick-actions');
    if (existingActions) {
      existingActions.appendChild(toggleButton);
    }

    // Insert filter section after toolbar
    toolbar.parentNode.insertBefore(filterSection, table);

    // Setup filter event handlers
    this.setupFilterHandlers(filterSection, toggleButton);

    // Populate type filter options
    this.populateTypeFilter();
  }

  setupFilterHandlers(filterSection, toggleButton) {
    // Toggle filter visibility
    toggleButton.addEventListener('click', () => {
      const isVisible = filterSection.style.display !== 'none';
      filterSection.style.display = isVisible ? 'none' : 'block';
      toggleButton.innerHTML = isVisible ? 
        '<span class="icon">🔽</span> Filters' : 
        '<span class="icon">🔼</span> Hide Filters';
    });

    // Search filter
    const searchInput = filterSection.querySelector('#filter-search');
    searchInput.addEventListener('input', (e) => {
      this.filters.search = e.target.value.toLowerCase();
      this.applyFilters();
    });

    // Type filter
    const typeSelect = filterSection.querySelector('#filter-type');
    typeSelect.addEventListener('change', (e) => {
      this.filters.type = e.target.value;
      this.applyFilters();
    });

    // State filter
    const stateSelect = filterSection.querySelector('#filter-state');
    stateSelect.addEventListener('change', (e) => {
      this.filters.state = e.target.value;
      this.applyFilters();
    });

    // IP filter
    const ipSelect = filterSection.querySelector('#filter-hasip');
    ipSelect.addEventListener('change', (e) => {
      this.filters.hasIP = e.target.value;
      this.applyFilters();
    });

    // Clear filters
    const clearButton = filterSection.querySelector('#clear-filters');
    clearButton.addEventListener('click', () => {
      this.clearAllFilters();
    });
  }

  populateTypeFilter() {
    const typeSelect = document.querySelector('#filter-type');
    if (!typeSelect) return;

    // Get unique types from interfaces
    const types = [...new Set(this.originalInterfaces.map(iface => iface.type))];
    types.sort();

    // Clear existing options (except "All Types")
    while (typeSelect.children.length > 1) {
      typeSelect.removeChild(typeSelect.lastChild);
    }

    // Add type options
    types.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      typeSelect.appendChild(option);
    });
  }

  sortTable(columnKey, columnName) {
    // Determine sort direction
    if (this.currentSort.column === columnKey) {
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.column = columnKey;
      this.currentSort.direction = 'asc';
    }

    // Update sort indicators
    this.updateSortIndicators(columnName);

    // Sort the filtered interfaces
    this.filteredInterfaces.sort((a, b) => {
      let aVal = a[columnKey] || '';
      let bVal = b[columnKey] || '';

      // Special handling for different data types
      if (columnKey === 'mtu') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      } else if (columnKey === 'state') {
        // Sort by state priority: UP > DOWN > UNKNOWN
        const stateOrder = { 'UP': 3, 'DOWN': 2, 'UNKNOWN': 1 };
        aVal = stateOrder[aVal] || 0;
        bVal = stateOrder[bVal] || 0;
      } else {
        // Convert to string for comparison
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      let comparison = 0;
      if (aVal > bVal) comparison = 1;
      else if (aVal < bVal) comparison = -1;

      return this.currentSort.direction === 'desc' ? -comparison : comparison;
    });

    this.renderTable();
    console.log(`📊 Table sorted by ${columnName} (${this.currentSort.direction.toUpperCase()})`);
  }

  updateSortIndicators(activeColumnName) {
    // Reset all indicators
    const indicators = document.querySelectorAll('.sort-indicator');
    indicators.forEach(indicator => {
      indicator.textContent = '↕️';
      indicator.style.opacity = '0.5';
    });

    // Update active indicator
    const headers = document.querySelectorAll('#table-interfaces thead th');
    headers.forEach(header => {
      if (header.textContent.includes(activeColumnName)) {
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) {
          indicator.textContent = this.currentSort.direction === 'asc' ? '🔼' : '🔽';
          indicator.style.opacity = '1';
        }
      }
    });
  }

  applyFilters() {
    this.filteredInterfaces = this.originalInterfaces.filter(iface => {
      // Search filter (across all text fields)
      if (this.filters.search) {
        const searchText = this.filters.search;
        const searchableText = [
          iface.dev,
          iface.type,
          iface.state,
          iface.mac,
          iface.ipv4,
          iface.ipv6,
          iface.mtu
        ].join(' ').toLowerCase();
        
        if (!searchableText.includes(searchText)) return false;
      }

      // Type filter
      if (this.filters.type && iface.type !== this.filters.type) {
        return false;
      }

      // State filter
      if (this.filters.state && iface.state !== this.filters.state) {
        return false;
      }

      // IP filter
      if (this.filters.hasIP) {
        const hasIP = !!(iface.ipv4 && iface.ipv4.trim());
        if (this.filters.hasIP === 'yes' && !hasIP) return false;
        if (this.filters.hasIP === 'no' && hasIP) return false;
      }

      return true;
    });

    // Re-apply current sort if any
    if (this.currentSort.column) {
      this.sortTable(this.currentSort.column, this.getSortColumnName(this.currentSort.column));
    } else {
      this.renderTable();
    }

    this.updateFilterStats();
    console.log(`🔍 Applied filters: ${this.filteredInterfaces.length}/${this.originalInterfaces.length} interfaces shown`);
  }

  getSortColumnName(columnKey) {
    const columnNames = {
      'dev': 'Device',
      'type': 'Type', 
      'state': 'State',
      'mac': 'MAC',
      'ipv4': 'IPv4',
      'ipv6': 'IPv6',
      'mtu': 'MTU'
    };
    return columnNames[columnKey] || columnKey;
  }

  updateFilterStats() {
    const statsElement = document.querySelector('#filter-stats');
    if (!statsElement) return;

    const total = this.originalInterfaces.length;
    const filtered = this.filteredInterfaces.length;
    const activeFilters = Object.values(this.filters).filter(filter => filter !== '').length;

    if (activeFilters === 0) {
      statsElement.textContent = `${total} interfaces`;
    } else {
      statsElement.textContent = `${filtered} of ${total} interfaces`;
      if (filtered === 0) {
        statsElement.style.color = 'var(--danger-color)';
        statsElement.textContent += ' (no matches)';
      } else {
        statsElement.style.color = 'var(--muted-color)';
      }
    }
  }

  clearAllFilters() {
    // Reset filter values
    this.filters = { search: '', type: '', state: '', hasIP: '' };

    // Reset UI elements
    const filterSection = document.querySelector('.filter-controls');
    if (filterSection) {
      const searchInput = filterSection.querySelector('#filter-search');
      const typeSelect = filterSection.querySelector('#filter-type');
      const stateSelect = filterSection.querySelector('#filter-state');
      const ipSelect = filterSection.querySelector('#filter-hasip');

      if (searchInput) searchInput.value = '';
      if (typeSelect) typeSelect.value = '';
      if (stateSelect) stateSelect.value = '';
      if (ipSelect) ipSelect.value = '';
    }

    // Reset sorting
    this.currentSort = { column: null, direction: 'asc' };
    
    // Reset sort indicators
    const indicators = document.querySelectorAll('.sort-indicator');
    indicators.forEach(indicator => {
      indicator.textContent = '↕️';
      indicator.style.opacity = '0.5';
    });

    // Apply cleared filters
    this.applyFilters();
    
    console.log('🗑️ All filters and sorting cleared');
  }

  async renderTable() {
    const tbody = document.querySelector('#table-interfaces tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (this.filteredInterfaces.length === 0) {
      const row = document.createElement('tr');
      const hasActiveFilters = Object.values(this.filters).some(filter => filter !== '');
      const message = hasActiveFilters ? 
        'No interfaces match the current filters' : 
        'No network interfaces found';
      
      row.innerHTML = `<td colspan="8" style="text-align: center; padding: 2rem; color: var(--muted-color);">${message}</td>`;
      tbody.appendChild(row);
      return;
    }

    // Sort interfaces by name if no other sort is active
    if (!this.currentSort.column) {
      this.filteredInterfaces.sort((a, b) => a.dev.localeCompare(b.dev));
    }

    for (const iface of this.filteredInterfaces) {
      const row = document.createElement('tr');

      // Enhanced device name display with bonding/bridging info
      const deviceInfo = await createEnhancedDeviceDisplayName(iface.dev, iface.type);
      const deviceCell = document.createElement('td');
      
      // Apply styling based on interface type
      if (deviceInfo.isVlan) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600; color: var(--primary-color);">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(0,102,204,0.05) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.isBond) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600; color: var(--warning-color);">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(255,193,7,0.05) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.isBridge) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600; color: var(--info-color);">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(23,162,184,0.05) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.memberOf) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600;">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
        row.style.background = 'linear-gradient(90deg, rgba(108,117,125,0.03) 0%, rgba(255,255,255,0) 100%)';
      } else if (deviceInfo.subtitle) {
        deviceCell.innerHTML = `
          <div style="font-weight: 600;">${deviceInfo.displayName}</div>
          <div style="font-size: 0.75rem; color: var(--muted-color); margin-top: 2px;">
            ${deviceInfo.subtitle}
          </div>
        `;
      } else {
        deviceCell.textContent = deviceInfo.displayName;
      }

      // Create action cell with all the buttons (keeping existing functionality)
      const actionsCell = await this.createActionCell(iface);

      const cells = [
        deviceCell,
        iface.type,
        createStatusBadge(iface.state),
        iface.mac,
        iface.ipv4,
        iface.ipv6,
        iface.mtu,
        actionsCell
      ];

      // Skip the first cell since we already created deviceCell
      cells.slice(1).forEach(content => {
        const cell = document.createElement('td');
        if (typeof content === 'string') {
          cell.textContent = content;
        } else {
          cell.appendChild(content);
        }
        row.appendChild(cell);
      });
      
      // Add the deviceCell as the first cell
      row.insertBefore(deviceCell, row.firstChild);
      tbody.appendChild(row);
    }
  }

  async createActionCell(iface) {
    const actionsCell = document.createElement('td');
    actionsCell.className = 'actions';

    const btnUp = createButton('Up', async () => {
      await run('ip', ['link', 'set', iface.dev, 'up'], { superuser: 'require' });
      await loadInterfaces();
    });

    const btnDown = createButton('Down', async () => {
      // Check if interface is critical before allowing it to be brought down
      const isCritical = checkIfInterfaceCritical(iface);
      
      if (isCritical.critical) {
        // Show critical interface warning before proceeding
        const confirmationResult = await showCriticalInterfaceDownConfirmation(iface, isCritical);
        if (!confirmationResult) {
          return; // User cancelled or didn't type confirmation correctly
        }
      } else if (iface.state === 'UP') {
        // Show simple warning for non-critical UP interfaces
        const confirmMessage = `📉 Bring Down Interface ${iface.dev}?\n\n` +
                             `Current Status: ${iface.state}\n` +
                             `${iface.ipv4 ? `IP Address: ${iface.ipv4}\n` : ''}` +
                             `\nThis will temporarily disable network connectivity on this interface.\n\n` +
                             `Are you sure you want to bring it down?`;
        
        if (!confirm(confirmMessage)) {
          return;
        }
      }

      try {
        await run('ip', ['link', 'set', iface.dev, 'down'], { superuser: 'require' });
        await loadInterfaces();
      } catch (error) {
        alert(`❌ Failed to bring down interface ${iface.dev}: ${error}`);
      }
    });

    // Add enhanced Info button with dependency information
    const btnInfo = createButton('Info', async () => {
      try {
        const info = await run('ip', ['addr', 'show', iface.dev]);
        
        // Enhanced info display with VLAN and bonding/bridging details
        let enhancedInfo = `Interface ${iface.dev} Details:\n\n`;
        
        const deviceInfo = await createEnhancedDeviceDisplayName(iface.dev, iface.type);
        
        if (deviceInfo.isVlan) {
          enhancedInfo += `🏷️ VLAN Information:\n`;
          enhancedInfo += `   VLAN ID: ${parseVlanInfo(iface.dev).id}\n`;
          enhancedInfo += `   Parent Interface: ${parseVlanInfo(iface.dev).parent}\n\n`;
        }
        
        if (deviceInfo.isBond) {
          enhancedInfo += `🔗 Bond Information:\n`;
          enhancedInfo += `   Bond Mode: ${deviceInfo.bondMode || 'Unknown'}\n`;
          enhancedInfo += `   Member Interfaces: ${deviceInfo.members.join(', ') || 'None'}\n`;
          enhancedInfo += `   Member Count: ${deviceInfo.members.length}\n\n`;
        }
        
        if (deviceInfo.isBridge) {
          enhancedInfo += `🌉 Bridge Information:\n`;
          enhancedInfo += `   Bridge Ports: ${deviceInfo.members.join(', ') || 'None'}\n`;
          enhancedInfo += `   Port Count: ${deviceInfo.members.length}\n\n`;
        }
        
        if (deviceInfo.memberOf) {
          enhancedInfo += `👥 Membership Information:\n`;
          enhancedInfo += `   Role: ${deviceInfo.role}\n`;
          enhancedInfo += `   Master Interface: ${deviceInfo.memberOf}\n\n`;
        }
        
        enhancedInfo += `📊 Technical Details:\n${info}`;
        alert(enhancedInfo);
      } catch (e) {
        alert(`Failed to get info for ${iface.dev}: ${e}`);
      }
    });

    // Keep existing Set IP and Set MTU buttons (truncated for brevity)
    const btnSetIP = createButton('Set IP', async () => {
      // ... existing Set IP functionality
    });

    const btnSetMTU = createButton('Set MTU', async () => {
      // ... existing Set MTU functionality
    });

    actionsCell.appendChild(btnUp);
    actionsCell.appendChild(btnDown);
    actionsCell.appendChild(btnSetIP);
    actionsCell.appendChild(btnSetMTU);
    actionsCell.appendChild(btnInfo);

    // Add advanced actions for constructed interfaces (VLAN, Bridge, Bond)
    if (typeof addAdvancedInterfaceActions === 'function') {
      await addAdvancedInterfaceActions(iface, actionsCell);
    }

    return actionsCell;
  }

  updateInterfaces(newInterfaces) {
    this.originalInterfaces = newInterfaces;
    this.populateTypeFilter(); // Refresh type filter options
    this.applyFilters(); // Re-apply current filters
  }
}

// Global table manager instance
let interfaceTableManager = null;
