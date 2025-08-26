'use strict';
/* global $, $$, run, setStatus, netplanAction, setupModal, getPhysicalInterfaces, loadInterfaces */

async function setupNetworkingForms() {
  console.log('Setting up networking forms...');

  const physicalInterfaces = await getPhysicalInterfaces();
  console.log('Available physical interfaces:', physicalInterfaces);

  const vlanParent = $('#vlan-parent');
  if (vlanParent) {
    vlanParent.innerHTML = '<option value="">Select parent interface...</option>';
    physicalInterfaces.forEach(iface => {
      const option = document.createElement('option');
      option.value = iface;
      option.textContent = iface;
      vlanParent.appendChild(option);
    });
  }

  const bridgePorts = $('#br-ports');
  if (bridgePorts) {
    bridgePorts.innerHTML = '';
    physicalInterfaces.forEach(iface => {
      const option = document.createElement('option');
      option.value = iface;
      option.textContent = iface;
      bridgePorts.appendChild(option);
    });
  }

  const bondSlaves = $('#bond-slaves');
  if (bondSlaves) {
    bondSlaves.innerHTML = '';
    physicalInterfaces.forEach(iface => {
      const option = document.createElement('option');
      option.value = iface;
      option.textContent = iface;
      bondSlaves.appendChild(option);
    });
  }

  const btnCreateVlan = $('#btn-create-vlan');
  if (btnCreateVlan) {
    btnCreateVlan.addEventListener('click', async () => {
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

      try {
        setStatus('Creating VLAN...');

        const vlanConfig = {
          name: name,
          id: parseInt(id),
          link: parent
        };

        if (mtu && parseInt(mtu) !== 1500) {
          vlanConfig.mtu = parseInt(mtu);
        }

        const result = await netplanAction('add_vlan', vlanConfig);

        if (result.error) {
          throw new Error(result.error);
        }

        if (staticIp) {
          console.log('Configuring IP for VLAN interface...');

          try {
            await run('ip', ['addr', 'add', staticIp, 'dev', name], { superuser: 'require' });
            console.log(`Added IP ${staticIp} to VLAN ${name}`);

            if (gateway) {
              await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', name], { superuser: 'require' });
              console.log(`Added gateway ${gateway} for VLAN ${name}`);
            }
          } catch (ipError) {
            console.warn('Failed to apply IP immediately:', ipError);
          }

          try {
            const ipConfig = {
              name: name,
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

        const output = $('#vlan-out');
        if (output) {
          let successMsg = `? VLAN ${name} created successfully!`;
          if (staticIp) {
            successMsg += `\n?? IP: ${staticIp}`;
          }
          if (gateway) {
            successMsg += `\n?? Gateway: ${gateway}`;
          }
          output.textContent = successMsg;
        }

        $('#vlan-parent').selectedIndex = 0;
        $('#vlan-id').value = '';
        $('#vlan-name').value = '';
        if ($('#vlan-static-ip')) $('#vlan-static-ip').value = '';
        if ($('#vlan-gateway')) $('#vlan-gateway').value = '';
        if ($('#vlan-mtu')) $('#vlan-mtu').value = '';

        await loadInterfaces();

      } catch (e) {
        const output = $('#vlan-out');
        if (output) output.textContent = `? Failed to create VLAN: ${e}`;
      } finally {
        setStatus('Ready');
      }
    });
  }

  const btnCreateBridge = $('#btn-create-bridge');
  if (btnCreateBridge) {
    btnCreateBridge.addEventListener('click', async () => {
      const name = $('#br-name')?.value?.trim();
      const portsSelect = $('#br-ports');
      const ports = portsSelect ? Array.from(portsSelect.selectedOptions).map(opt => opt.value) : [];

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
        const result = await netplanAction('add_bridge', {
          name: name,
          interfaces: ports
        });

        const output = $('#br-out');
        if (result.error) {
          if (output) output.textContent = `? Error: ${result.error}`;
        } else {
          if (output) output.textContent = `? Bridge ${name} created with ports: ${ports.join(', ')}`;
          $('#br-name').value = '';
          if (portsSelect) {
            Array.from(portsSelect.options).forEach(opt => opt.selected = false);
          }
          await loadInterfaces();
        }
      } catch (e) {
        const output = $('#br-out');
        if (output) output.textContent = `? Failed to create bridge: ${e}`;
      } finally {
        setStatus('Ready');
      }
    });
  }

  const btnCreateBond = $('#btn-create-bond');
  if (btnCreateBond) {
    btnCreateBond.addEventListener('click', async () => {
      const name = $('#bond-name')?.value?.trim();
      const mode = $('#bond-mode')?.value;
      const slavesSelect = $('#bond-slaves');
      const slaves = slavesSelect ? Array.from(slavesSelect.selectedOptions).map(opt => opt.value) : [];

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
        const result = await netplanAction('add_bond', {
          name: name,
          mode: mode,
          interfaces: slaves
        });

        const output = $('#bond-out');
        if (result.error) {
          if (output) output.textContent = `? Error: ${result.error}`;
        } else {
          if (output) output.textContent = `? Bond ${name} (${mode}) created with slaves: ${slaves.join(', ')}`;
          $('#bond-name').value = '';
          $('#bond-mode').selectedIndex = 0;
          if (slavesSelect) {
            Array.from(slavesSelect.options).forEach(opt => opt.selected = false);
          }
          await loadInterfaces();
        }
      } catch (e) {
        const output = $('#bond-out');
        if (output) output.textContent = `? Failed to create bond: ${e}`;
      } finally {
        setStatus('Ready');
      }
    });
  }
}

// expose
window.setupNetworkingForms = setupNetworkingForms;
