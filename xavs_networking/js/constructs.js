'use strict';
/* global $, $$, run, setStatus, netplanAction, getPhysicalInterfaces, loadInterfaces, clearPhysicalInterfacesCache */

async function setupNetworkingForms() {
  console.log('Setting up networking forms...');
  
  try {
    console.log('Loading physical interfaces for forms...');

    let interfaces = await getPhysicalInterfaces();
    console.log('Physical interfaces for forms (raw):', interfaces);

    // Deduplicate interfaces
    interfaces = [...new Set(interfaces)];
    console.log('Physical interfaces for forms (deduped):', interfaces);

    if (interfaces.length === 0) {
      console.warn('No physical interfaces found - using default interfaces for testing');
      // Provide default interfaces for testing when none are found
      interfaces.push('eth0', 'enp0s3', 'wlan0');
    }

    // Populate VLAN parent select
    const vlanParent = $('#vlan-parent');
    if (vlanParent) {
      vlanParent.innerHTML = '<option value="">Choose parent interface...</option>';
      interfaces.forEach(iface => {
        vlanParent.innerHTML += `<option value="${iface}">${iface}</option>`;
      });
      console.log('Populated VLAN parent select with', interfaces.length, 'interfaces');
    } else {
      console.error('VLAN parent select element not found (#vlan-parent)');
    }

    // Populate bridge ports select
    const brPorts = $('#br-ports');
    if (brPorts) {
      brPorts.innerHTML = '';
      interfaces.forEach(iface => {
        brPorts.innerHTML += `<option value="${iface}">${iface}</option>`;
      });
      console.log('Populated bridge ports select with', interfaces.length, 'interfaces');
    } else {
      console.error('Bridge ports select element not found (#br-ports)');
    }

    // Populate bond slaves select
    const bondSlaves = $('#bond-slaves');
    if (bondSlaves) {
      bondSlaves.innerHTML = '';
      interfaces.forEach(iface => {
        bondSlaves.innerHTML += `<option value="${iface}">${iface}</option>`;
      });
      console.log('Populated bond slaves select with', interfaces.length, 'interfaces');
    } else {
      console.error('Bond slaves select element not found (#bond-slaves)');
    }

    // Populate bond primary select
    const bondPrimary = $('#bond-primary');
    if (bondPrimary) {
      bondPrimary.innerHTML = '<option value="">Auto-select primary</option>';
      interfaces.forEach(iface => {
        bondPrimary.innerHTML += `<option value="${iface}">${iface}</option>`;
      });
      console.log('Populated bond primary select with', interfaces.length, 'interfaces');
    } else {
      console.error('Bond primary select element not found (#bond-primary)');
    }

    console.log('✅ Populated form selectors with', interfaces.length, 'interfaces');
  } catch (e) {
    console.error('❌ Failed to populate networking forms:', e);
  }

  setupConstructEventHandlers();
}

// Flag to prevent multiple event handler setups
let eventHandlersSetup = false;

// Function to reset event handlers if needed
function resetEventHandlers() {
  console.log('Resetting event handlers...');
  eventHandlersSetup = false;
  setupConstructEventHandlers();
}

// Export for debugging
window.resetEventHandlers = resetEventHandlers;

function setupConstructEventHandlers() {
  console.log('Setting up construct event handlers...');
  
  // Prevent multiple setups
  if (eventHandlersSetup) {
    console.log('Event handlers already setup, skipping...');
    return;
  }

  // VLAN creation
  const btnCreateVlan = $('#btn-create-vlan');
  console.log('VLAN create button found:', !!btnCreateVlan);
  if (btnCreateVlan) {
    // Remove any existing listeners by cloning the element
    const newBtnCreateVlan = btnCreateVlan.cloneNode(true);
    btnCreateVlan.parentNode.replaceChild(newBtnCreateVlan, btnCreateVlan);
    
    newBtnCreateVlan.addEventListener('click', async () => {
      console.log('VLAN create button clicked');
      
      // Prevent double submission
      if (newBtnCreateVlan.disabled) {
        console.log('VLAN creation already in progress, ignoring click');
        return;
      }
      
      const parent = $('#vlan-parent')?.value?.trim();
      const vlanId = $('#vlan-id')?.value?.trim();
      const vlanName = $('#vlan-name')?.value?.trim();
      const vlanMtu = $('#vlan-mtu')?.value?.trim();
      const staticIp = $('#vlan-static-ip')?.value?.trim();
      const gateway = $('#vlan-gateway')?.value?.trim();

      console.log('VLAN form values:', { parent, vlanId, vlanName, vlanMtu, staticIp, gateway });

      if (!parent || !vlanId) {
        alert('❌ Parent interface and VLAN ID are required!');
        return;
      }

      const vlanIdNum = parseInt(vlanId);
      if (vlanIdNum < 1 || vlanIdNum > 4094) {
        alert('⚠️ VLAN ID must be between 1 and 4094!');
        return;
      }

      if (staticIp) {
        const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
        if (!ipRegex.test(staticIp)) {
          alert('⚠️ Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
          return;
        }
      }

      if (gateway) {
        const gatewayRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!gatewayRegex.test(gateway)) {
          alert('⚠️ Invalid gateway address format!');
          return;
        }
      }

      // Disable button and show progress
      newBtnCreateVlan.disabled = true;
      newBtnCreateVlan.textContent = '⏳ Creating VLAN...';
      
      const vlanOut = $('#vlan-out');
      if (vlanOut) vlanOut.textContent = '⏳ Creating VLAN...\n';

      try {
        setStatus('Creating VLAN...');

        const config = {
          name: vlanName || `${parent}.${vlanId}`,    // VLAN interface name
          id: vlanIdNum,                               // VLAN ID (expected by Python script)
          link: parent,                                // Parent interface (expected by Python script)
          mtu: vlanMtu ? parseInt(vlanMtu) : undefined,
          static_ip: staticIp || undefined,
          gateway: gateway || undefined
        };

        console.log('VLAN config:', config);
        const result = await netplanAction('add_vlan', config);
        console.log('VLAN result:', result);

        if (result.error) {
          if (vlanOut) vlanOut.textContent = `❌ Error: ${result.error}\n`;
          alert(`❌ Failed to create VLAN: ${result.error}`);
        } else {
          let successMsg = result.message || `✅ VLAN ${config.name} created and applied successfully!`;
          let outputMsg = successMsg;
          
          // Check for warnings (like IP assignment issues)
          if (result.warning) {
            successMsg += `\n\n⚠️ Warning: ${result.warning}`;
            outputMsg += `\n\nWarning: ${result.warning}`;
            
            if (result.details && result.details.expected_ip) {
              successMsg += `\nExpected IP: ${result.details.expected_ip}`;
              outputMsg += `\nExpected IP: ${result.details.expected_ip}`;
              successMsg += '\nPlease check network connectivity and run "Apply Config" to retry.';
              outputMsg += '\nSuggestion: Check network connectivity and apply config again.';
            }
          }
          
          // Add configuration details to the message
          if (result.details) {
            const details = result.details;
            outputMsg += '\n\nConfiguration Details:';
            outputMsg += `\nVLAN ID: ${details.vlan_id || config.id}`;
            outputMsg += `\nParent Interface: ${details.parent || config.link}`;
            if (details.static_ip) {
              outputMsg += `\nStatic IP: ${details.static_ip}`;
              if (details.gateway) {
                outputMsg += `\nGateway: ${details.gateway}`;
              }
            } else {
              outputMsg += '\nIP Configuration: DHCP enabled';
            }
            if (details.mtu) {
              outputMsg += `\nMTU: ${details.mtu} bytes`;
            }
          } else {
            // Add IP configuration details from config
            if (staticIp) {
              successMsg += `\n\n🔗 Static IP: ${staticIp}`;
              outputMsg += `\nStatic IP: ${staticIp}`;
              if (gateway) {
                successMsg += `\n🌐 Gateway: ${gateway}`;
                outputMsg += `\nGateway: ${gateway}`;
              }
            } else {
              successMsg += '\n\n⚙️ IP Configuration: DHCP enabled';
              outputMsg += '\nIP Configuration: DHCP enabled';
            }
            if (vlanMtu) {
              successMsg += `\n📏 MTU: ${vlanMtu} bytes`;
              outputMsg += `\nMTU: ${vlanMtu} bytes`;
            }
          }
          
          outputMsg += '\n\n📁 Configuration written to: /etc/netplan/99-cockpit.yaml';
          outputMsg += '\n⚡ Applied using: netplan generate && netplan try && netplan apply';
          
          if (vlanOut) vlanOut.textContent = outputMsg + '\n';
          alert(successMsg);
          
          // Clear form
          ['#vlan-parent', '#vlan-id', '#vlan-name', '#vlan-mtu', '#vlan-static-ip', '#vlan-gateway'].forEach(sel => {
            const el = $(sel);
            if (el) el.value = '';
          });
          // Clear cache since we created a new interface
          if (typeof clearPhysicalInterfacesCache === 'function') {
            clearPhysicalInterfacesCache();
          }
          await loadInterfaces();
        }
      } catch (error) {
        console.error('VLAN creation error:', error);
        const errorMsg = `❌ Failed to create VLAN: ${error}`;
        if (vlanOut) vlanOut.textContent = errorMsg + '\n';
        alert(errorMsg);
      } finally {
        // Re-enable button and restore text
        newBtnCreateVlan.disabled = false;
        newBtnCreateVlan.textContent = '🔗 Create VLAN';
        setStatus('Ready');
      }
    });
  }

  // Bridge creation
  const btnCreateBridge = $('#btn-create-bridge');
  if (btnCreateBridge) {
    // Remove any existing listeners by cloning the element
    const newBtnCreateBridge = btnCreateBridge.cloneNode(true);
    btnCreateBridge.parentNode.replaceChild(newBtnCreateBridge, btnCreateBridge);
    
    newBtnCreateBridge.addEventListener('click', async () => {
      // Prevent double submission
      if (newBtnCreateBridge.disabled) {
        console.log('Bridge creation already in progress, ignoring click');
        return;
      }
      
      const brName = $('#br-name')?.value?.trim();
      const brPorts = Array.from($('#br-ports')?.selectedOptions || []).map(opt => opt.value);
      const brStp = $('#br-stp')?.value === 'true';
      const brForwardDelay = $('#br-forward-delay')?.value?.trim();
      const brHelloTime = $('#br-hello-time')?.value?.trim();

      if (!brName) {
        alert('❌ Bridge name is required!');
        return;
      }

      if (!brPorts.length) {
        alert('❌ At least one port interface must be selected!');
        return;
      }

      // Disable button and show progress
      newBtnCreateBridge.disabled = true;
      newBtnCreateBridge.textContent = '⏳ Creating Bridge...';

      const brOut = $('#br-out');
      if (brOut) brOut.textContent = '⏳ Creating bridge...\n';

      try {
        setStatus('Creating bridge...');

        const config = {
          name: brName,                                // Bridge name
          interfaces: brPorts,                         // Port interfaces
          stp: brStp,
          forward_delay: brForwardDelay ? parseInt(brForwardDelay) : undefined,
          hello_time: brHelloTime ? parseInt(brHelloTime) : undefined
        };

        console.log('Bridge config:', config);
        const result = await netplanAction('add_bridge', config);
        console.log('Bridge result:', result);

        if (result.error) {
          if (brOut) brOut.textContent = `❌ Error: ${result.error}\n`;
          alert(`❌ Failed to create bridge: ${result.error}`);
        } else {
          let successMsg = result.message || `✅ Bridge ${brName} created and applied successfully!`;
          let outputMsg = successMsg;
          
          // Add configuration details
          if (result.details) {
            const details = result.details;
            outputMsg += '\n\nConfiguration Details:';
            outputMsg += `\nMember Interfaces: ${details.interfaces.join(', ')}`;
            outputMsg += `\nSTP: ${details.stp ? 'Enabled' : 'Disabled'}`;
            outputMsg += `\nDHCP: ${details.dhcp4 ? 'Enabled' : 'Disabled'}`;
            if (details.static_ip) {
              outputMsg += `\nStatic IP: ${details.static_ip}`;
            }
            if (details.forward_delay) {
              outputMsg += `\nForward Delay: ${details.forward_delay}s`;
            }
            if (details.hello_time) {
              outputMsg += `\nHello Time: ${details.hello_time}s`;
            }
          } else {
            outputMsg += `\nMember Interfaces: ${brPorts.join(', ')}`;
            outputMsg += `\nSTP: ${brStp ? 'Enabled' : 'Disabled'}`;
          }
          
          outputMsg += '\n\n📁 Configuration written to: /etc/netplan/99-cockpit.yaml';
          outputMsg += '\n⚠️  Applied using: netplan generate && netplan apply (bridges require direct apply)';
          
          if (brOut) brOut.textContent = outputMsg + '\n';
          alert(successMsg + '\n\n⚠️ Note: Bridge changes applied immediately (netplan try not supported for bridges)');
          
          // Clear form
          const nameField = $('#br-name');
          if (nameField) nameField.value = '';
          const portsSelect = $('#br-ports');
          if (portsSelect) {
            Array.from(portsSelect.options).forEach(opt => opt.selected = false);
          }
          const stpField = $('#br-stp');
          if (stpField) stpField.value = 'true'; // Reset to default
          const forwardDelayField = $('#br-forward-delay');
          if (forwardDelayField) forwardDelayField.value = '';
          const helloTimeField = $('#br-hello-time');
          if (helloTimeField) helloTimeField.value = '';
          
          // Clear cache since we created a new interface
          if (typeof clearPhysicalInterfacesCache === 'function') {
            clearPhysicalInterfacesCache();
          }
          await loadInterfaces();
        }
      } catch (error) {
        console.error('Bridge creation error:', error);
        const errorMsg = `❌ Failed to create bridge: ${error}`;
        if (brOut) brOut.textContent = errorMsg + '\n';
        alert(errorMsg);
      } finally {
        // Re-enable button and restore text
        newBtnCreateBridge.disabled = false;
        newBtnCreateBridge.textContent = '🌉 Create Bridge';
        setStatus('Ready');
      }
    });
  }

  // Bond creation
  const btnCreateBond = $('#btn-create-bond');
  if (btnCreateBond) {
    // Remove any existing listeners by cloning the element
    const newBtnCreateBond = btnCreateBond.cloneNode(true);
    btnCreateBond.parentNode.replaceChild(newBtnCreateBond, btnCreateBond);
    
    newBtnCreateBond.addEventListener('click', async () => {
      // Prevent double submission
      if (newBtnCreateBond.disabled) {
        console.log('Bond creation already in progress, ignoring click');
        return;
      }
      
      const bondName = $('#bond-name')?.value?.trim();
      const bondMode = $('#bond-mode')?.value;
      const bondSlaves = Array.from($('#bond-slaves')?.selectedOptions || []).map(opt => opt.value);
      const bondMiimon = $('#bond-miimon')?.value?.trim();
      const bondPrimary = $('#bond-primary')?.value?.trim();

      if (!bondName) {
        alert('❌ Bond name is required!');
        return;
      }

      if (!bondMode) {
        alert('❌ Bonding mode must be selected!');
        return;
      }

      if (bondSlaves.length < 2) {
        alert('❌ At least two slave interfaces must be selected!');
        return;
      }

      // Disable button and show progress
      newBtnCreateBond.disabled = true;
      newBtnCreateBond.textContent = '⏳ Creating Bond...';

      const bondOut = $('#bond-out');
      if (bondOut) bondOut.textContent = '⏳ Creating bond...\n';

      try {
        setStatus('Creating bond...');

        const config = {
          name: bondName,                              // Bond name
          mode: bondMode,                              // Bonding mode
          interfaces: bondSlaves,                      // Slave interfaces
          miimon: bondMiimon ? parseInt(bondMiimon) : undefined,
          primary: bondPrimary || undefined
        };

        console.log('Bond config:', config);
        const result = await netplanAction('add_bond', config);
        console.log('Bond result:', result);

        if (result.error) {
          if (bondOut) bondOut.textContent = `❌ Error: ${result.error}\n`;
          alert(`❌ Failed to create bond: ${result.error}`);
        } else {
          let successMsg = result.message || `✅ Bond ${bondName} created and applied successfully!`;
          let outputMsg = successMsg;
          
          // Add configuration details
          if (result.details) {
            const details = result.details;
            outputMsg += '\n\nConfiguration Details:';
            outputMsg += `\nBond Mode: ${details.mode}`;
            outputMsg += `\nSlave Interfaces: ${details.interfaces.join(', ')}`;
            outputMsg += `\nMII Monitor: ${details.mii_monitor}ms`;
            if (details.primary) {
              outputMsg += `\nPrimary Interface: ${details.primary}`;
            }
          } else {
            outputMsg += `\nBond Mode: ${bondMode}`;
            outputMsg += `\nSlave Interfaces: ${bondSlaves.join(', ')}`;
            if (bondMiimon) {
              outputMsg += `\nMII Monitor: ${bondMiimon}ms`;
            }
            if (bondPrimary) {
              outputMsg += `\nPrimary Interface: ${bondPrimary}`;
            }
          }
          
          outputMsg += '\n\n📁 Configuration written to: /etc/netplan/99-cockpit.yaml';
          outputMsg += '\n⚠️  Applied using: netplan generate && netplan apply (bonds require direct apply)';
          
          if (bondOut) bondOut.textContent = outputMsg + '\n';
          alert(successMsg + '\n\n⚠️ Note: Bond changes applied immediately (netplan try not supported for bonds)');
          
          // Clear form
          const nameField = $('#bond-name');
          if (nameField) nameField.value = '';
          const modeField = $('#bond-mode');
          if (modeField) modeField.value = '802.3ad'; // Default to LACP
          const slavesSelect = $('#bond-slaves');
          if (slavesSelect) {
            Array.from(slavesSelect.options).forEach(opt => opt.selected = false);
          }
          const miimonField = $('#bond-miimon');
          if (miimonField) miimonField.value = '';
          const primaryField = $('#bond-primary');
          if (primaryField) primaryField.value = '';
          
          // Clear cache since we created a new interface
          if (typeof clearPhysicalInterfacesCache === 'function') {
            clearPhysicalInterfacesCache();
          }
          await loadInterfaces();
        }
      } catch (error) {
        console.error('Bond creation error:', error);
        const errorMsg = `❌ Failed to create bond: ${error}`;
        if (bondOut) bondOut.textContent = errorMsg + '\n';
        alert(errorMsg);
      } finally {
        // Re-enable button and restore text
        newBtnCreateBond.disabled = false;
        newBtnCreateBond.textContent = '⚡ Create Bond';
        setStatus('Ready');
      }
    });
  }

  // Mark event handlers as setup
  eventHandlersSetup = true;
  console.log('✅ Event handlers setup complete, duplicate prevention active');

  // Bridge port filtering
  const brPortsFilter = $('#br-ports-filter');
  const brPorts = $('#br-ports');
  if (brPortsFilter && brPorts) {
    brPortsFilter.addEventListener('input', () => {
      const filter = brPortsFilter.value.toLowerCase();
      Array.from(brPorts.options).forEach(option => {
        const visible = option.textContent.toLowerCase().includes(filter);
        option.style.display = visible ? '' : 'none';
      });
    });
  }

  // Bond slaves filtering
  const bondSlavesFilter = $('#bond-slaves-filter');
  const bondSlaves = $('#bond-slaves');
  if (bondSlavesFilter && bondSlaves) {
    bondSlavesFilter.addEventListener('input', () => {
      const filter = bondSlavesFilter.value.toLowerCase();
      Array.from(bondSlaves.options).forEach(option => {
        const visible = option.textContent.toLowerCase().includes(filter);
        option.style.display = visible ? '' : 'none';
      });
    });
  }

  console.log('Construct event handlers setup complete');
}

// expose
window.setupNetworkingForms = setupNetworkingForms;
