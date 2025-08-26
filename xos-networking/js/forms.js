/* XOS Networking - Form Management for VLAN/Bridge/Bond Creation */
/* global XOSNetworking */

(() => {
  'use strict';

  const { $, $$, setStatus, getPhysicalInterfaces } = XOSNetworking.core;
  const { netplanAction } = XOSNetworking.netplan;

  // Setup network construction forms
  async function setupNetworkingForms() {
    console.log('Setting up networking forms...');
    
    // Get physical interfaces for dropdowns
    const physicalInterfaces = await getPhysicalInterfaces();
    console.log('Available physical interfaces:', physicalInterfaces);
    
    // Populate VLAN parent dropdown
    const vlanParent = $('#vlan-parent');
    if (vlanParent) {
      vlanParent.innerHTML = '<option value="">Select parent interface...</option>';
      physicalInterfaces.forEach(iface => {
        const option = document.createElement('option');
        option.value = iface;
        option.textContent = iface;
        vlanParent.appendChild(option);
      });
      console.log('Populated VLAN parent dropdown with', physicalInterfaces.length, 'interfaces');
    } else {
      console.warn('VLAN parent dropdown not found');
    }
    
    // Populate bridge ports multi-select
    const bridgePorts = $('#br-ports');
    if (bridgePorts) {
      bridgePorts.innerHTML = '';
      physicalInterfaces.forEach(iface => {
        const option = document.createElement('option');
        option.value = iface;
        option.textContent = iface;
        bridgePorts.appendChild(option);
      });
      console.log('Populated bridge ports with', physicalInterfaces.length, 'interfaces');
    }
    
    // Populate bond slaves multi-select
    const bondSlaves = $('#bond-slaves');
    if (bondSlaves) {
      bondSlaves.innerHTML = '';
      physicalInterfaces.forEach(iface => {
        const option = document.createElement('option');
        option.value = iface;
        option.textContent = iface;
        bondSlaves.appendChild(option);
      });
      console.log('Populated bond slaves with', physicalInterfaces.length, 'interfaces');
    }
    
    // Setup form event handlers
    setupNetworkingFormHandlers();
  }

  // Setup event handlers for networking forms
  function setupNetworkingFormHandlers() {
    console.log('Setting up networking form handlers...');
    
    // Setup VLAN creation
    const btnCreateVlan = $('#btn-create-vlan');
    if (btnCreateVlan) {
      btnCreateVlan.addEventListener('click', async () => {
        await createVLAN();
      });
    }

    // Setup Bridge creation  
    const btnCreateBridge = $('#btn-create-bridge');
    if (btnCreateBridge) {
      btnCreateBridge.addEventListener('click', async () => {
        await createBridge();
      });
    }

    // Setup Bond creation
    const btnCreateBond = $('#btn-create-bond');
    if (btnCreateBond) {
      btnCreateBond.addEventListener('click', async () => {
        await createBond();
      });
    }

    // Setup Reset Forms button
    const btnResetForms = $('#btn-reset-forms');
    if (btnResetForms) {
      btnResetForms.addEventListener('click', () => {
        resetAllForms();
      });
    }
  }

  // Create VLAN function
  async function createVLAN() {
    const parent = $('#vlan-parent')?.value?.trim();
    const id = $('#vlan-id')?.value?.trim();
    const name = $('#vlan-name')?.value?.trim() || `${parent}.${id}`;
    const staticIp = $('#vlan-static-ip')?.value?.trim();
    const gateway = $('#vlan-gateway')?.value?.trim();
    const mtu = $('#vlan-mtu')?.value?.trim();
    
    if (!parent || !id) {
      alert('? Parent interface and VLAN ID are required!');
      return;
    }
    
    if (!id.match(/^\d+$/) || parseInt(id) < 1 || parseInt(id) > 4094) {
      alert('? VLAN ID must be between 1 and 4094!');
      return;
    }
    
    // Validate IP format if provided
    if (staticIp) {
      const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
      if (!ipRegex.test(staticIp)) {
        alert('? Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
        return;
      }
    }
    
    // Validate gateway format if provided
    if (gateway) {
      const gatewayRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!gatewayRegex.test(gateway)) {
        alert('? Invalid gateway address format!');
        return;
      }
    }
    
    // Validate MTU if provided
    if (mtu && (isNaN(parseInt(mtu)) || parseInt(mtu) < 68 || parseInt(mtu) > 9000)) {
      alert('? MTU must be between 68 and 9000!');
      return;
    }
    
    try {
      setStatus('Creating VLAN...');
      
      // Step 1: Create VLAN interface with improved config
      const vlanConfig = {
        name: name,
        id: parseInt(id),
        link: parent
      };
      
      // Add MTU to VLAN creation if specified
      if (mtu && parseInt(mtu) !== 1500) {
        vlanConfig.mtu = parseInt(mtu);
        console.log(`Including MTU ${mtu} in VLAN creation config`);
      }
      
      console.log('Creating VLAN with config:', vlanConfig);
      const result = await netplanAction('add_vlan', vlanConfig);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      console.log('VLAN created successfully');
      
      // Step 2: Configure IP if provided
      if (staticIp) {
        console.log('Configuring IP for VLAN interface...');
        await configureVLANIP(name, staticIp, gateway);
      }
      
      const output = $('#vlan-out');
      if (output) {
        let successMsg = `? VLAN ${name} created successfully!`;
        if (mtu && parseInt(mtu) !== 1500) {
          successMsg += `\n?? MTU: ${mtu} bytes`;
        }
        if (staticIp) {
          successMsg += `\n?? IP: ${staticIp}`;
        }
        if (gateway) {
          successMsg += `\n?? Gateway: ${gateway}`;
        }
        output.textContent = successMsg;
      }
      
      // Clear form
      resetVLANForm();
      
      // Refresh interfaces
      if (window.XOSNetworking.networkInterface?.loadInterfaces) {
        await window.XOSNetworking.networkInterface.loadInterfaces();
      }
      
    } catch (e) {
      const output = $('#vlan-out');
      if (output) output.textContent = `? Failed to create VLAN: ${e}`;
    } finally {
      setStatus('Ready');
    }
  }

  // Configure IP for VLAN
  async function configureVLANIP(vlanName, staticIp, gateway) {
    const { run } = XOSNetworking.core;
    
    // Apply IP immediately
    try {
      await run('ip', ['addr', 'add', staticIp, 'dev', vlanName], { superuser: 'require' });
      console.log(`Added IP ${staticIp} to VLAN ${vlanName}`);
      
      // Add gateway if specified
      if (gateway) {
        await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', vlanName], { superuser: 'require' });
        console.log(`Added gateway ${gateway} for VLAN ${vlanName}`);
      }
    } catch (ipError) {
      console.warn('Failed to apply IP immediately:', ipError);
    }
    
    // Persist IP to netplan
    try {
      const ipConfig = {
        name: vlanName,
        static_ip: staticIp
      };
      
      if (gateway) {
        ipConfig.gateway = gateway;
      }
      
      const ipResult = await netplanAction('set_ip', ipConfig);
      
      if (ipResult.error) {
        console.warn('Failed to persist IP to netplan:', ipResult.error);
      } else {
        console.log('Successfully persisted VLAN IP to netplan');
      }
    } catch (ipError) {
      console.warn('Failed to persist IP configuration:', ipError);
    }
  }

  // Create Bridge function
  async function createBridge() {
    const name = $('#br-name')?.value?.trim();
    const portsSelect = $('#br-ports');
    const ports = portsSelect ? Array.from(portsSelect.selectedOptions).map(opt => opt.value) : [];
    const stp = $('#br-stp')?.value === 'true';
    const forwardDelay = $('#br-forward-delay')?.value?.trim();
    const helloTime = $('#br-hello-time')?.value?.trim();
    
    if (!name) {
      alert('? Bridge name is required!');
      return;
    }
    
    if (ports.length === 0) {
      alert('? At least one port interface is required!');
      return;
    }
    
    try {
      setStatus('Creating bridge...');
      
      const bridgeConfig = {
        name: name,
        interfaces: ports
      };
      
      if (stp) {
        bridgeConfig.stp = true;
      }
      
      if (forwardDelay && parseInt(forwardDelay) > 0) {
        bridgeConfig.forward_delay = parseInt(forwardDelay);
      }
      
      if (helloTime && parseInt(helloTime) > 0) {
        bridgeConfig.hello_time = parseInt(helloTime);
      }
      
      const result = await netplanAction('add_bridge', bridgeConfig);
      
      const output = $('#br-out');
      if (result.error) {
        if (output) output.textContent = `? Error: ${result.error}`;
      } else {
        if (output) output.textContent = `? Bridge ${name} created with ports: ${ports.join(', ')}`;
        resetBridgeForm();
        
        // Refresh interfaces
        if (window.XOSNetworking.networkInterface?.loadInterfaces) {
          await window.XOSNetworking.networkInterface.loadInterfaces();
        }
      }
    } catch (e) {
      const output = $('#br-out');
      if (output) output.textContent = `? Failed to create bridge: ${e}`;
    } finally {
      setStatus('Ready');
    }
  }

  // Create Bond function
  async function createBond() {
    const name = $('#bond-name')?.value?.trim();
    const mode = $('#bond-mode')?.value;
    const slavesSelect = $('#bond-slaves');
    const slaves = slavesSelect ? Array.from(slavesSelect.selectedOptions).map(opt => opt.value) : [];
    const miimon = $('#bond-miimon')?.value?.trim();
    const primary = $('#bond-primary')?.value?.trim();
    
    if (!name) {
      alert('? Bond name is required!');
      return;
    }
    
    if (!mode) {
      alert('? Bond mode is required!');
      return;
    }
    
    if (slaves.length < 2) {
      alert('? At least two slave interfaces are required for bonding!');
      return;
    }
    
    try {
      setStatus('Creating bond...');
      
      const bondConfig = {
        name: name,
        mode: mode,
        interfaces: slaves
      };
      
      if (miimon && parseInt(miimon) > 0) {
        bondConfig.miimon = parseInt(miimon);
      }
      
      if (primary && slaves.includes(primary)) {
        bondConfig.primary = primary;
      }
      
      const result = await netplanAction('add_bond', bondConfig);
      
      const output = $('#bond-out');
      if (result.error) {
        if (output) output.textContent = `? Error: ${result.error}`;
      } else {
        if (output) output.textContent = `? Bond ${name} (${mode}) created with slaves: ${slaves.join(', ')}`;
        resetBondForm();
        
        // Refresh interfaces
        if (window.XOSNetworking.networkInterface?.loadInterfaces) {
          await window.XOSNetworking.networkInterface.loadInterfaces();
        }
      }
    } catch (e) {
      const output = $('#bond-out');
      if (output) output.textContent = `? Failed to create bond: ${e}`;
    } finally {
      setStatus('Ready');
    }
  }

  // Reset form functions
  function resetVLANForm() {
    const vlanParent = $('#vlan-parent');
    if (vlanParent) vlanParent.selectedIndex = 0;
    
    const fields = ['#vlan-id', '#vlan-name', '#vlan-static-ip', '#vlan-gateway', '#vlan-mtu'];
    fields.forEach(field => {
      const el = $(field);
      if (el) el.value = '';
    });
  }

  function resetBridgeForm() {
    const brName = $('#br-name');
    if (brName) brName.value = '';
    
    const portsSelect = $('#br-ports');
    if (portsSelect) {
      Array.from(portsSelect.options).forEach(opt => opt.selected = false);
    }
    
    const fields = ['#br-forward-delay', '#br-hello-time'];
    fields.forEach(field => {
      const el = $(field);
      if (el) el.value = '';
    });
    
    const stp = $('#br-stp');
    if (stp) stp.selectedIndex = 1; // Default to disabled
  }

  function resetBondForm() {
    const bondName = $('#bond-name');
    if (bondName) bondName.value = '';
    
    const modeSelect = $('#bond-mode');
    if (modeSelect) modeSelect.selectedIndex = 0;
    
    const slavesSelect = $('#bond-slaves');
    if (slavesSelect) {
      Array.from(slavesSelect.options).forEach(opt => opt.selected = false);
    }
    
    const fields = ['#bond-miimon'];
    fields.forEach(field => {
      const el = $(field);
      if (el) el.value = '';
    });
    
    const primary = $('#bond-primary');
    if (primary) primary.selectedIndex = 0;
  }

  function resetAllForms() {
    resetVLANForm();
    resetBridgeForm();
    resetBondForm();
    
    // Clear output areas
    const outputs = ['#vlan-out', '#br-out', '#bond-out'];
    outputs.forEach(outputId => {
      const output = $(outputId);
      if (output) output.textContent = '';
    });
    
    alert('? All forms have been reset!');
  }

  // Export forms functions
  window.XOSNetworking.forms = {
    setupNetworkingForms,
    setupNetworkingFormHandlers,
    createVLAN,
    createBridge,
    createBond,
    resetAllForms,
    resetVLANForm,
    resetBridgeForm,
    resetBondForm
  };

})();