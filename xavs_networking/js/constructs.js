'use strict';
/* global $, $$, run, setStatus, netplanAction, getPhysicalInterfaces, loadInterfaces */

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

function setupConstructEventHandlers() {
  console.log('Setting up construct event handlers...');

  // VLAN creation
  const btnCreateVlan = $('#btn-create-vlan');
  console.log('VLAN create button found:', !!btnCreateVlan);
  if (btnCreateVlan) {
  btnCreateVlan.addEventListener('click', async () => {
      console.log('VLAN create button clicked');
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
          alert('? Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
          return;
        }
      }

      if (gateway) {
        const gatewayRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!gatewayRegex.test(gateway)) {
          alert('? Invalid gateway address format!');
          return;
        }
      }

      const vlanOut = $('#vlan-out');
      if (vlanOut) vlanOut.textContent = '? Creating VLAN...\n';

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
          if (vlanOut) vlanOut.textContent = `? Error: ${result.error}\n`;
          alert(`❌ Failed to create VLAN: ${result.error}`);
        } else {
          // Apply netplan changes safely
          try {
            await safeNetplanApply();
          } catch (e) {
            alert('⚠ Failed to apply netplan changes: ' + e.message);
          }
          let successMsg = `✅ VLAN ${config.name} created and applied successfully!`;
          let outputMsg = successMsg;
          // Add IP configuration details to the message
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
          if (vlanOut) vlanOut.textContent = outputMsg + '\n';
          alert(successMsg);
          // Clear form
          ['#vlan-parent', '#vlan-id', '#vlan-name', '#vlan-mtu', '#vlan-static-ip', '#vlan-gateway'].forEach(sel => {
            const el = $(sel);
            if (el) el.value = '';
          });
          await loadInterfaces();
        }
      } catch (error) {
        console.error('VLAN creation error:', error);
        const errorMsg = `? Failed to create VLAN: ${error}`;
        if (vlanOut) vlanOut.textContent = errorMsg + '\n';
        alert(errorMsg);
      } finally {
        setStatus('Ready');
      }
    });
  }

  // Bridge creation
  const btnCreateBridge = $('#btn-create-bridge');
  if (btnCreateBridge) {
  btnCreateBridge.addEventListener('click', async () => {
      const brName = $('#br-name')?.value?.trim();
      const brPorts = Array.from($('#br-ports')?.selectedOptions || []).map(opt => opt.value);
      const brStp = $('#br-stp')?.value === 'true';
      const brForwardDelay = $('#br-forward-delay')?.value?.trim();
      const brHelloTime = $('#br-hello-time')?.value?.trim();

      if (!brName) {
        alert('? Bridge name is required!');
        return;
      }

      if (!brPorts.length) {
        alert('? At least one port interface must be selected!');
        return;
      }

      const brOut = $('#br-out');
      if (brOut) brOut.textContent = '? Creating bridge...\n';

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
          if (brOut) brOut.textContent = `? Error: ${result.error}\n`;
          alert(`? Failed to create bridge: ${result.error}`);
        } else {
          // Apply netplan changes safely
          try {
            await safeNetplanApply();
          } catch (e) {
            alert('⚠ Failed to apply netplan changes: ' + e.message);
          }
          if (brOut) brOut.textContent = `? Bridge ${brName} created and applied successfully!\n`;
          alert(`? Bridge ${brName} created and applied successfully!`);
          // Clear form
          const nameField = $('#br-name');
          if (nameField) nameField.value = '';
          const portsSelect = $('#br-ports');
          if (portsSelect) {
            Array.from(portsSelect.options).forEach(opt => opt.selected = false);
          }
          await loadInterfaces();
        }
      } catch (error) {
        console.error('Bridge creation error:', error);
        const errorMsg = `? Failed to create bridge: ${error}`;
        if (brOut) brOut.textContent = errorMsg + '\n';
        alert(errorMsg);
      } finally {
        setStatus('Ready');
      }
    });
  }

  // Bond creation
  const btnCreateBond = $('#btn-create-bond');
  if (btnCreateBond) {
  btnCreateBond.addEventListener('click', async () => {
      const bondName = $('#bond-name')?.value?.trim();
      const bondMode = $('#bond-mode')?.value;
      const bondSlaves = Array.from($('#bond-slaves')?.selectedOptions || []).map(opt => opt.value);
      const bondMiimon = $('#bond-miimon')?.value?.trim();
      const bondPrimary = $('#bond-primary')?.value?.trim();

      if (!bondName) {
        alert('? Bond name is required!');
        return;
      }

      if (!bondMode) {
        alert('? Bonding mode must be selected!');
        return;
      }

      if (bondSlaves.length < 2) {
        alert('? At least two slave interfaces must be selected!');
        return;
      }

      const bondOut = $('#bond-out');
      if (bondOut) bondOut.textContent = '? Creating bond...\n';

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
          if (bondOut) bondOut.textContent = `? Error: ${result.error}\n`;
          alert(`? Failed to create bond: ${result.error}`);
        } else {
          // Apply netplan changes safely
          try {
            await safeNetplanApply();
          } catch (e) {
            alert('⚠ Failed to apply netplan changes: ' + e.message);
          }
          if (bondOut) bondOut.textContent = `? Bond ${bondName} created and applied successfully!\n`;
          alert(`? Bond ${bondName} created and applied successfully!`);
          // Clear form
          const nameField = $('#bond-name');
          if (nameField) nameField.value = '';
          const slavesSelect = $('#bond-slaves');
          if (slavesSelect) {
            Array.from(slavesSelect.options).forEach(opt => opt.selected = false);
          }
          await loadInterfaces();
        }
      } catch (error) {
        console.error('Bond creation error:', error);
        const errorMsg = `? Failed to create bond: ${error}`;
        if (bondOut) bondOut.textContent = errorMsg + '\n';
        alert(errorMsg);
      } finally {
        setStatus('Ready');
      }
    });
  }

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
