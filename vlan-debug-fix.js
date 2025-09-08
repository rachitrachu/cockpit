// VLAN IP Edit Debug and Fix Script
// Add this to your browser console or as a debug module

// Debug function to trace VLAN configuration changes
window.debugVlanIpEdit = function() {
  console.log('🐛 VLAN IP Edit Debug Mode Activated');
  
  // Store original functions for debugging
  const originalSetInterfaceIP = window.setInterfaceIP;
  const originalLoadNetplanConfig = window.loadNetplanConfig;
  const originalWriteNetplanConfig = window.writeNetplanConfig;
  
  // Enhanced debug wrapper for setInterfaceIP
  window.setInterfaceIP = async function(config) {
    console.log('🔧 DEBUG: setInterfaceIP called with:', config);
    
    // Pre-edit snapshot
    const preEditConfig = await originalLoadNetplanConfig();
    const preEditVlans = preEditConfig.network?.vlans || {};
    console.log('📸 PRE-EDIT VLAN Snapshot:', {
      count: Object.keys(preEditVlans).length,
      vlans: Object.keys(preEditVlans).map(name => ({
        name,
        id: preEditVlans[name].id,
        link: preEditVlans[name].link,
        addresses: preEditVlans[name].addresses || [],
        dhcp4: preEditVlans[name].dhcp4
      }))
    });
    
    // Call original function
    const result = await originalSetInterfaceIP(config);
    
    // Post-edit snapshot
    const postEditConfig = await originalLoadNetplanConfig();
    const postEditVlans = postEditConfig.network?.vlans || {};
    console.log('📸 POST-EDIT VLAN Snapshot:', {
      count: Object.keys(postEditVlans).length,
      vlans: Object.keys(postEditVlans).map(name => ({
        name,
        id: postEditVlans[name].id,
        link: postEditVlans[name].link,
        addresses: postEditVlans[name].addresses || [],
        dhcp4: postEditVlans[name].dhcp4
      }))
    });
    
    // Compare snapshots
    const preVlanNames = Object.keys(preEditVlans);
    const postVlanNames = Object.keys(postEditVlans);
    const lostVlans = preVlanNames.filter(name => !postVlanNames.includes(name));
    const addedVlans = postVlanNames.filter(name => !preVlanNames.includes(name));
    
    if (lostVlans.length > 0) {
      console.error('❌ LOST VLANs:', lostVlans);
    }
    if (addedVlans.length > 0) {
      console.log('✅ ADDED VLANs:', addedVlans);
    }
    
    console.log('🔧 DEBUG: setInterfaceIP result:', result);
    return result;
  };
  
  // Enhanced debug wrapper for writeNetplanConfig
  window.writeNetplanConfig = async function(config) {
    console.log('💾 DEBUG: writeNetplanConfig called with:', config);
    
    // Log what's being written
    const vlans = config.network?.vlans || {};
    console.log('💾 Writing VLANs:', Object.keys(vlans).map(name => ({
      name,
      id: vlans[name].id,
      link: vlans[name].link,
      addresses: vlans[name].addresses || [],
      dhcp4: vlans[name].dhcp4
    })));
    
    const result = await originalWriteNetplanConfig(config);
    console.log('💾 DEBUG: writeNetplanConfig result:', result);
    return result;
  };
  
  console.log('✅ VLAN IP Edit Debug Mode Active - all VLAN operations will be logged');
};

// Function to restore original functions
window.restoreVlanDebug = function() {
  if (window.originalSetInterfaceIP) {
    window.setInterfaceIP = window.originalSetInterfaceIP;
  }
  if (window.originalWriteNetplanConfig) {
    window.writeNetplanConfig = window.originalWriteNetplanConfig;
  }
  console.log('🔄 VLAN debug mode disabled');
};

// Function to check current VLAN state
window.checkVlanState = async function() {
  console.log('🔍 Checking current VLAN state...');
  
  try {
    // Check netplan configuration
    const config = await window.loadNetplanConfig();
    const vlans = config.network?.vlans || {};
    
    console.log('📋 Netplan VLANs:', {
      count: Object.keys(vlans).length,
      vlans: Object.keys(vlans).map(name => ({
        name,
        id: vlans[name].id,
        link: vlans[name].link,
        addresses: vlans[name].addresses || [],
        dhcp4: vlans[name].dhcp4,
        mtu: vlans[name].mtu
      }))
    });
    
    // Check system interfaces
    const ipLinks = await window.run('ip', ['link', 'show'], { superuser: 'try' });
    const vlanPattern = /(\w+\.\d+)[@:]|\s+vlan\s+/g;
    const systemVlans = [];
    let match;
    while ((match = vlanPattern.exec(ipLinks)) !== null) {
      if (match[1]) systemVlans.push(match[1]);
    }
    
    console.log('🖥️ System VLANs:', systemVlans);
    
    // Check for mismatches
    const netplanVlanNames = Object.keys(vlans);
    const missingFromSystem = netplanVlanNames.filter(name => !systemVlans.includes(name));
    const missingFromNetplan = systemVlans.filter(name => !netplanVlanNames.includes(name));
    
    if (missingFromSystem.length > 0) {
      console.warn('⚠️ VLANs in netplan but not in system:', missingFromSystem);
    }
    if (missingFromNetplan.length > 0) {
      console.warn('⚠️ VLANs in system but not in netplan:', missingFromNetplan);
    }
    
  } catch (error) {
    console.error('❌ Error checking VLAN state:', error);
  }
};

// Quick fix function for immediate VLAN preservation
window.fixVlanPreservation = function() {
  console.log('🔧 Applying VLAN preservation fix...');
  
  // Enhanced setInterfaceIP with better preservation
  const originalSetInterfaceIP = window.setInterfaceIP;
  
  window.setInterfaceIP = async function(config) {
    const { name, static_ip } = config;
    
    if (!name) {
      return { error: 'Interface name is required' };
    }
    
    try {
      console.log(`🔧 Setting IP address for ${name} to ${static_ip} with enhanced preservation`);
      
      // CRITICAL: Load current config and preserve EVERYTHING
      const currentConfig = await window.loadNetplanConfig();
      console.log('📥 Loaded current config for preservation');
      
      // Create a deep copy to work with
      const netplanConfig = JSON.parse(JSON.stringify(currentConfig));
      
      // Ensure network structure exists
      if (!netplanConfig.network) {
        netplanConfig.network = { version: 2, renderer: 'networkd' };
      }
      
      const sections = ['ethernets', 'vlans', 'bridges', 'bonds'];
      sections.forEach(section => {
        if (!netplanConfig.network[section]) {
          netplanConfig.network[section] = {};
        }
      });
      
      // Find the target interface
      let targetSection = null;
      let targetInterface = null;
      
      for (const section of sections) {
        if (netplanConfig.network[section][name]) {
          targetSection = section;
          targetInterface = netplanConfig.network[section][name];
          break;
        }
      }
      
      // If interface doesn't exist, create it
      if (!targetInterface) {
        if (name.includes('.')) {
          // VLAN interface
          const [parent, vlanIdStr] = name.split('.', 2);
          const vlanId = parseInt(vlanIdStr, 10);
          if (!isNaN(vlanId) && parent) {
            targetSection = 'vlans';
            if (!netplanConfig.network.ethernets[parent]) {
              netplanConfig.network.ethernets[parent] = { optional: true };
            }
            netplanConfig.network.vlans[name] = { id: vlanId, link: parent };
            targetInterface = netplanConfig.network.vlans[name];
          }
        } else {
          // Ethernet interface
          targetSection = 'ethernets';
          netplanConfig.network.ethernets[name] = {};
          targetInterface = netplanConfig.network.ethernets[name];
        }
      }
      
      // Update IP configuration
      if (static_ip && static_ip.trim() !== '') {
        targetInterface.addresses = [static_ip];
        targetInterface.dhcp4 = false;
        targetInterface.dhcp6 = false;
      } else {
        delete targetInterface.addresses;
        targetInterface.dhcp4 = true;
      }
      
      console.log(`✅ Updated ${name} in ${targetSection} section`);
      
      // Write configuration using atomic strategy
      console.log('💾 Writing configuration atomically...');
      
      // Write everything to a single file to avoid splitting issues
      const success = await window.writeNetplanFile('/etc/netplan/80-cockpit-interfaces.yaml', netplanConfig);
      
      if (success) {
        console.log('✅ IP address updated successfully with enhanced preservation');
        return {
          success: true,
          message: `IP address for ${name} updated to ${static_ip || 'DHCP'} with preservation`
        };
      } else {
        return { error: 'Failed to write netplan configuration' };
      }
      
    } catch (error) {
      console.error('❌ Enhanced setInterfaceIP failed:', error);
      return { error: `Failed to set IP address: ${error.message}` };
    }
  };
  
  console.log('✅ VLAN preservation fix applied - IP edits should now preserve all VLANs');
};

// Auto-activate debug mode if this script is loaded
console.log('🚀 VLAN Debug Script Loaded');
console.log('Available functions:');
console.log('  - debugVlanIpEdit(): Enable debug mode for VLAN IP edits');
console.log('  - restoreVlanDebug(): Disable debug mode');
console.log('  - checkVlanState(): Check current VLAN configuration');
console.log('  - fixVlanPreservation(): Apply immediate fix for VLAN preservation');
console.log('');
console.log('Quick start: Run fixVlanPreservation() then try editing a VLAN IP');
