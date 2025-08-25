/* global cockpit */
(() => {
  'use strict';
  
  console.log('XOS Networking starting...');
  
  // Wait for both DOM and Cockpit to be ready
  function waitForReady() {
    return new Promise((resolve) => {
      let domReady = document.readyState === 'complete' || document.readyState === 'interactive';
      let cockpitReady = typeof cockpit !== 'undefined';
      
      console.log('DOM ready:', domReady, 'Cockpit ready:', cockpitReady);
      
      if (domReady && cockpitReady) {
        resolve();
      } else {
        // Wait for DOM
        if (!domReady) {
          document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM ready event fired');
            if (typeof cockpit !== 'undefined') resolve();
          });
        }
        
        // Fallback timeout
        setTimeout(resolve, 2000);
      }
    });
  }
  
  const $ = (q, root = document) => {
    try {
      return root.querySelector(q);
    } catch (e) {
      console.warn('Selector error:', q, e);
      return null;
    }
  };
  
  const $$ = (q, root = document) => {
    try {
      return Array.from(root.querySelectorAll(q));
    } catch (e) {
      console.warn('Selector error:', q, e);
      return [];
    }
  };

  function setStatus(msg) { 
    const statusEl = $('#status');
    if (statusEl) {
      statusEl.textContent = msg || 'Ready'; 
      console.log('Status:', msg || 'Ready');
    }
  }

  // Robust spawn wrapper
  async function run(cmd, args = [], opts = {}) {
    try {
      console.log('Running command:', cmd, args);
      setStatus(`Running ${cmd}...`);
      
      if (typeof cockpit === 'undefined') {
        throw new Error('Cockpit API not available');
      }
      
      const proc = cockpit.spawn([cmd, ...args], {
        superuser: "try",
        err: "out",
        ...opts
      });
      
      let out = "";
      proc.stream(d => out += d);
      await proc;
      
      console.log(`Command ${cmd} completed, output length:`, out.length);
      return out.trim();
      
    } catch (e) {
      console.error(`Command failed: ${cmd}`, e);
      setStatus('');
      throw e.toString();
    }
  }

  function createButton(label, handler, className = 'btn') {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = className;
    
    btn.addEventListener('click', async () => {
      const originalText = btn.textContent;
      try {
        btn.disabled = true;
        btn.textContent = 'Loading...';
        await handler();
      } catch (e) {
        console.error(`${label} failed:`, e);
        alert(`${label} failed:\n${e}`);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
    
    return btn;
  }

  function createStatusBadge(state) {
    const span = document.createElement('span');
    const s = (state || 'unknown').toUpperCase();
    span.className = 'badge ' + (s === 'UP' || s === 'CONNECTED' ? 'state-up'
                      : s === 'DOWN' || s === 'DISCONNECTED' ? 'state-down'
                      : 'state-unknown');
    span.textContent = s;
    return span;
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
      // Test basic connectivity first
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
      
      // Parse interfaces
      const interfaces = [];
      const blocks = output.split(/\n(?=\d+: )/);
      console.log('Processing', blocks.length, 'interface blocks');
      
      for (const block of blocks) {
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
              if (typeMatch) type = typeMatch[1];
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
      
      // Clear and populate table
      tbody.innerHTML = '';
      
      if (interfaces.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" style="text-align: center; padding: 2rem;">No network interfaces found</td>';
        tbody.appendChild(row);
        setStatus('No interfaces found');
        return;
      }

      // Sort by name
      interfaces.sort((a, b) => a.dev.localeCompare(b.dev));

      // Create table rows
      interfaces.forEach(iface => {
        const row = document.createElement('tr');
        
        // Create action buttons
        const actionsCell = document.createElement('td');
        actionsCell.className = 'actions';
        
        const btnUp = createButton('Up', async () => {
          await run('ip', ['link', 'set', iface.dev, 'up'], { superuser: 'require' });
          await loadInterfaces();
        });
        
        const btnDown = createButton('Down', async () => {
          await run('ip', ['link', 'set', iface.dev, 'down'], { superuser: 'require' });
          await loadInterfaces();
        });
        
        const btnInfo = createButton('Info', async () => {
          try {
            const info = await run('ip', ['addr', 'show', iface.dev]);
            alert(`Interface ${iface.dev} details:\n\n${info}`);
          } catch (e) {
            alert(`Failed to get info for ${iface.dev}: ${e}`);
          }
        });

        const btnSetIP = createButton('Set IP', async () => {
          const newIP = prompt(`Enter IPv4 address/CIDR for ${iface.dev}:`, iface.ipv4 || '192.168.1.100/24');
          if (!newIP) return;
          
          // Basic IP validation
          const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
          if (!ipRegex.test(newIP)) {
            alert('❌ Invalid IP format! Use CIDR notation (e.g., 192.168.1.100/24)');
            return;
          }
          
          try {
            // Remove old IP if exists
            if (iface.ipv4) {
              try {
                await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
              } catch (e) {
                console.warn('Could not remove old IP:', e);
              }
            }
            
            // Add new IP
            await run('ip', ['addr', 'add', newIP, 'dev', iface.dev], { superuser: 'require' });
            alert(`✅ IP ${newIP} set on ${iface.dev}`);
            await loadInterfaces();
          } catch (e) {
            alert(`❌ Failed to set IP: ${e}`);
          }
        });

        const btnSetMTU = createButton('Set MTU', async () => {
          const newMTU = prompt(`Enter MTU for ${iface.dev}:`, iface.mtu || '1500');
          if (!newMTU) return;
          
          const mtu = parseInt(newMTU);
          if (isNaN(mtu) || mtu < 68 || mtu > 9000) {
            alert('❌ MTU must be between 68 and 9000');
            return;
          }
          
          try {
            await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', mtu.toString()], { superuser: 'require' });
            alert(`✅ MTU ${mtu} set on ${iface.dev}`);
            await loadInterfaces();
          } catch (e) {
            alert(`❌ Failed to set MTU: ${e}`);
          }
        });

        // Add delete buttons for constructed interfaces
        if (iface.dev.startsWith('bond')) {
          const btnDeleteBond = createButton('Delete', async () => {
            if (!confirm(`Delete bond ${iface.dev}?`)) return;
            try {
              await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
              await netplanAction('delete', { type: 'bonds', name: iface.dev });
              await loadInterfaces();
            } catch (e) {
              alert(`❌ Failed to delete bond: ${e}`);
            }
          }, 'btn btn-danger');
          actionsCell.appendChild(btnDeleteBond);
        } else if (iface.dev.includes('.') && !iface.dev.startsWith('br')) {
          const btnDeleteVlan = createButton('Delete', async () => {
            if (!confirm(`Delete VLAN ${iface.dev}?`)) return;
            try {
              await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
              await netplanAction('delete', { type: 'vlans', name: iface.dev });
              await loadInterfaces();
            } catch (e) {
              alert(`❌ Failed to delete VLAN: ${e}`);
            }
          }, 'btn btn-danger');
          actionsCell.appendChild(btnDeleteVlan);
        } else if (iface.dev.startsWith('br')) {
          const btnDeleteBridge = createButton('Delete', async () => {
            if (!confirm(`Delete bridge ${iface.dev}?`)) return;
            try {
              await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
              await netplanAction('delete', { type: 'bridges', name: iface.dev });
              await loadInterfaces();
            } catch (e) {
              alert(`❌ Failed to delete bridge: ${e}`);
            }
          }, 'btn btn-danger');
          actionsCell.appendChild(btnDeleteBridge);
        }
        
        actionsCell.appendChild(btnUp);
        actionsCell.appendChild(btnDown);
        actionsCell.appendChild(btnSetIP);
        actionsCell.appendChild(btnSetMTU);
        actionsCell.appendChild(btnInfo);
        
        // Create cells
        const cells = [
          iface.dev,
          iface.type,
          createStatusBadge(iface.state),
          iface.mac,
          iface.ipv4,
          iface.ipv6,
          iface.mtu,
          actionsCell
        ];
        
        cells.forEach(content => {
          const cell = document.createElement('td');
          if (typeof content === 'string') {
            cell.textContent = content;
          } else {
            cell.appendChild(content);
          }
          row.appendChild(cell);
        });
        
        tbody.appendChild(row);
      });
      
      setStatus(`Loaded ${interfaces.length} interfaces`);
      
    } catch (e) {
      console.error('Failed to load interfaces:', e);
      tbody.innerHTML = '';
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="8" style="text-align: center; padding: 2rem; color: red;">Error: ${e}</td>`;
      tbody.appendChild(row);
      setStatus('Error loading interfaces');
    }
  }

  async function loadConnections() {
    console.log('Loading connections...');
    const tbody = $('#table-connections tbody');
    if (!tbody) return;

    try {
      const output = await run('networkctl', ['list']);
      const lines = output.split('\n').slice(1).filter(line => line.trim());
      
      tbody.innerHTML = '';
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${parts[1] || ''}</td>
            <td>—</td>
            <td>${parts[2] || ''}</td>
            <td>${parts[3] || ''}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td class="actions">—</td>
          `;
          tbody.appendChild(row);
        }
      });
      
      console.log('Loaded', lines.length, 'connections');
      
    } catch (e) {
      console.warn('Failed to load connections:', e);
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Connection data unavailable</td></tr>';
    }
  }

  async function loadDiagnostics() {
    console.log('Loading diagnostics...');
    
    // Routes
    try {
      const routes = await run('ip', ['route']);
      const routesEl = $('#routes-out');
      if (routesEl) routesEl.textContent = routes || '(no routes)';
    } catch (e) {
      const routesEl = $('#routes-out');
      if (routesEl) routesEl.textContent = 'Error loading routes: ' + e;
    }

    // DNS
    try {
      const dns = await run('cat', ['/etc/resolv.conf']);
      const dnsEl = $('#dns-out');
      if (dnsEl) dnsEl.textContent = dns || '(no DNS configuration)';
    } catch (e) {
      const dnsEl = $('#dns-out');
      if (dnsEl) dnsEl.textContent = 'Error loading DNS config: ' + e;
    }
  }

  function setupTabs() {
    const tabs = $$('.tab');
    const panels = $$('.tab-panel');
    
    console.log('Found', tabs.length, 'tabs and', panels.length, 'panels');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.tab;
        console.log('Tab clicked:', targetId);
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active panel
        panels.forEach(p => p.classList.remove('active'));
        const targetPanel = $(`#tab-${targetId}`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  function setupEventHandlers() {
    console.log('Setting up event handlers...');
    
    // Main refresh button
    const refreshBtn = $('#btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await Promise.all([
          loadInterfaces(),
          loadConnections(), 
          loadDiagnostics()
        ]);
      });
    }

    // Ping button
    const pingBtn = $('#btn-ping');
    if (pingBtn) {
      pingBtn.addEventListener('click', async () => {
        const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
        const pingOut = $('#ping-out');
        if (!pingOut) return;
        
        try {
          pingOut.textContent = 'Running ping...';
          const result = await run('ping', ['-c', '4', host]);
          pingOut.textContent = result;
        } catch (e) {
          pingOut.textContent = 'Ping failed: ' + e;
        }
      });
    }

    // Traceroute button
    const traceBtn = $('#btn-traceroute');
    if (traceBtn) {
      traceBtn.addEventListener('click', async () => {
        const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
        const pingOut = $('#ping-out');
        if (!pingOut) return;
        
        try {
          pingOut.textContent = 'Running traceroute...';
          const result = await run('traceroute', [host]);
          pingOut.textContent = result;
        } catch (e) {
          pingOut.textContent = 'Traceroute failed: ' + e;
        }
      });
    }
  }

  // Enhanced netplan action function
  async function netplanAction(action, config) {
    console.log('netplanAction called with:', { action, config });
    const payload = JSON.stringify({ action, config });
    console.log('JSON payload to send:', payload);
    
    try {
      console.log('About to spawn netplan script...');
      
      // Use a simpler approach - write to temp file and execute
      const tempScript = `
#!/bin/bash
cd /usr/share/cockpit/xos-networking
echo '${payload.replace(/'/g, "'\\''")}' | python3 netplan_manager.py
`;
      
      const result = await cockpit.spawn([
        'bash', '-c', tempScript
      ], {
        superuser: 'require',
        err: 'out'
      });
      
      console.log('Netplan script raw output:', result);
      const cleanResult = result.trim();
      console.log('Cleaned result:', cleanResult);
      
      // Find JSON in the output (might have other text before it)
      const jsonMatch = cleanResult.match(/\{.*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log('Netplan script parsed output:', parsed);
        return parsed;
      } else {
        return { error: 'No JSON response found in output: ' + cleanResult };
      }
    } catch (e) {
      console.error('netplanAction exception:', e);
      let errorMsg = 'Script execution failed';
      if (e.exit_status !== undefined) {
        errorMsg = `Script exited with code ${e.exit_status}`;
      }
      if (e.message && e.message.trim()) {
        errorMsg += `: ${e.message}`;
      }
      console.error('Processed error message:', errorMsg);
      return { error: errorMsg };
    }
  }

  // Get available physical interfaces for dropdowns
  async function getPhysicalInterfaces() {
    try {
      const output = await run('ip', ['-o', 'link', 'show']);
      const interfaces = [];
      
      output.split('\n').forEach(line => {
        const match = line.match(/^\d+:\s+([^:]+):/);
        if (match) {
          const dev = match[1].trim();
          // Skip virtual and special interfaces
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
    }

    // Setup VLAN creation
    const btnCreateVlan = $('#btn-create-vlan');
    if (btnCreateVlan) {
      btnCreateVlan.addEventListener('click', async () => {
        const parent = $('#vlan-parent')?.value?.trim();
        const id = $('#vlan-id')?.value?.trim();
        const name = $('#vlan-name')?.value?.trim() || `${parent}.${id}`;
        
        if (!parent || !id) {
          alert('❌ Parent interface and VLAN ID are required!');
          return;
        }
        
        if (!id.match(/^\d+$/) || parseInt(id) < 1 || parseInt(id) > 4094) {
          alert('❌ VLAN ID must be between 1 and 4094!');
          return;
        }
        
        try {
          setStatus('Creating VLAN...');
          const result = await netplanAction('add_vlan', {
            name: name,
            id: parseInt(id),
            link: parent
          });
          
          const output = $('#vlan-out');
          if (result.error) {
            if (output) output.textContent = `❌ Error: ${result.error}`;
          } else {
            if (output) output.textContent = `✅ VLAN ${name} created successfully!`;
            // Clear form
            $('#vlan-parent').selectedIndex = 0;
            $('#vlan-id').value = '';
            $('#vlan-name').value = '';
            await loadInterfaces();
          }
        } catch (e) {
          const output = $('#vlan-out');
          if (output) output.textContent = `❌ Failed to create VLAN: ${e}`;
        } finally {
          setStatus('Ready');
        }
      });
    }

    // Setup Bridge creation
    const btnCreateBridge = $('#btn-create-bridge');
    if (btnCreateBridge) {
      btnCreateBridge.addEventListener('click', async () => {
        const name = $('#br-name')?.value?.trim();
        const portsSelect = $('#br-ports');
        const ports = portsSelect ? Array.from(portsSelect.selectedOptions).map(opt => opt.value) : [];
        
        if (!name) {
          alert('❌ Bridge name is required!');
          return;
        }
        
        if (ports.length === 0) {
          alert('❌ At least one port interface is required!');
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
            if (output) output.textContent = `❌ Error: ${result.error}`;
          } else {
            if (output) output.textContent = `✅ Bridge ${name} created with ports: ${ports.join(', ')}`;
            // Clear form
            $('#br-name').value = '';
            if (portsSelect) {
              Array.from(portsSelect.options).forEach(opt => opt.selected = false);
            }
            await loadInterfaces();
          }
        } catch (e) {
          const output = $('#br-out');
          if (output) output.textContent = `❌ Failed to create bridge: ${e}`;
        } finally {
          setStatus('Ready');
        }
      });
    }

    // Setup Bond creation
    const btnCreateBond = $('#btn-create-bond');
    if (btnCreateBond) {
      btnCreateBond.addEventListener('click', async () => {
        const name = $('#bond-name')?.value?.trim();
        const mode = $('#bond-mode')?.value;
        const slavesSelect = $('#bond-slaves');
        const slaves = slavesSelect ? Array.from(slavesSelect.selectedOptions).map(opt => opt.value) : [];
        
        if (!name) {
          alert('❌ Bond name is required!');
          return;
        }
        
        if (!mode) {
          alert('❌ Bond mode is required!');
          return;
        }
        
        if (slaves.length < 2) {
          alert('❌ At least two slave interfaces are required!');
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
            if (output) output.textContent = `❌ Error: ${result.error}`;
          } else {
            if (output) output.textContent = `✅ Bond ${name} (${mode}) created with slaves: ${slaves.join(', ')}`;
            // Clear form
            $('#bond-name').value = '';
            $('#bond-mode').selectedIndex = 0;
            if (slavesSelect) {
              Array.from(slavesSelect.options).forEach(opt => opt.selected = false);
            }
            await loadInterfaces();
          }
        } catch (e) {
          const output = $('#bond-out');
          if (output) output.textContent = `❌ Failed to create bond: ${e}`;
        } finally {
          setStatus('Ready');
        }
      });
    }

    // Setup other networking buttons
    const btnShowNetplan = $('#btn-show-netplan');
    if (btnShowNetplan) {
      btnShowNetplan.addEventListener('click', async () => {
        try {
          const config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
          alert(`Current Netplan Configuration:\n\n${config}`);
        } catch (e) {
          alert(`Failed to show Netplan config: ${e}`);
        }
      });
    }

    const btnApplyNetplan = $('#btn-apply-netplan');
    if (btnApplyNetplan) {
      btnApplyNetplan.addEventListener('click', async () => {
        if (!confirm('Apply Netplan configuration? This may disrupt network connectivity.')) return;
        
        try {
          setStatus('Applying Netplan...');
          await run('netplan', ['apply'], { superuser: 'require' });
          alert('✅ Netplan configuration applied successfully!');
          await loadInterfaces();
        } catch (e) {
          alert(`❌ Failed to apply Netplan: ${e}`);
        } finally {
          setStatus('Ready');
        }
      });
    }
  }

  // Main initialization
  async function initialize() {
    console.log('Initializing XOS Networking...');
    
    try {
      await waitForReady();
      console.log('Ready state achieved');
      
      setStatus('Initializing...');
      
      // Setup UI components
      setupTabs();
      setupEventHandlers();
      await setupNetworkingForms();
      
      // Load initial data
      setStatus('Loading data...');
      await Promise.all([
        loadInterfaces(),
        loadConnections(),
        loadDiagnostics()
      ]);
      
      setStatus('Ready');
      console.log('XOS Networking initialized successfully');
      
    } catch (e) {
      console.error('Initialization failed:', e);
      setStatus('Initialization failed: ' + e);
    }
  }

  // Start the application
  initialize();

})();
