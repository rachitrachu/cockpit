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
  
  // Bui
