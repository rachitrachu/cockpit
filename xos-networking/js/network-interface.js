/* XOS Networking - Network Interface Management */
/* global XOSNetworking, cockpit */

(() => {
  'use strict';

  const { $, $$, setStatus, run, createButton, createStatusBadge } = XOSNetworking.core;
  const { createIPConfigModal, createMTUConfigModal } = XOSNetworking.modals;

  // Load and display network interfaces
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
        if (!block.trim()) continue; // Skip empty blocks
        
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
          const modal = createIPConfigModal(iface, window.XOSNetworking.netplan.netplanAction);
          modal.showModal();
        });

        const btnSetMTU = createButton('Set MTU', async () => {
          const modal = createMTUConfigModal(iface, window.XOSNetworking.netplan.netplanAction);
          modal.showModal();
        });

        // Add specialized buttons for different interface types
        if (iface.dev.startsWith('bond')) {
          // Bond edit/delete buttons
          const btnEditBond = createButton('Edit', async () => {
            // TODO: Implement bond editing modal
            alert('Bond editing functionality will be implemented in the forms module');
          });
          
          const btnDeleteBond = createButton('Delete', async () => {
            if (!confirm(`Delete bond ${iface.dev}?`)) return;
            try {
              await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
              await window.XOSNetworking.netplan.netplanAction('delete', { type: 'bonds', name: iface.dev });
              await loadInterfaces();
            } catch (e) {
              alert(`? Failed to delete bond: ${e}`);
            }
          }, 'btn btn-danger');
          
          actionsCell.appendChild(btnEditBond);
          actionsCell.appendChild(btnDeleteBond);
          
        } else if (iface.dev.includes('.') && !iface.dev.startsWith('br')) {
          // VLAN edit/delete buttons
          const btnEditVlan = createButton('Edit', async () => {
            // TODO: Implement VLAN editing modal
            alert('VLAN editing functionality will be implemented in the forms module');
          });

          const btnDeleteVlan = createButton('Delete', async () => {
            if (!confirm(`Delete VLAN ${iface.dev}?`)) return;
            try {
              await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
              await window.XOSNetworking.netplan.netplanAction('delete', { type: 'vlans', name: iface.dev });
              await loadInterfaces();
            } catch (e) {
              alert(`? Failed to delete VLAN: ${e}`);
            }
          }, 'btn btn-danger');
          
          actionsCell.appendChild(btnEditVlan);
          actionsCell.appendChild(btnDeleteVlan);
          
        } else if (iface.dev.startsWith('br')) {
          // Bridge edit/delete buttons
          const btnEditBridge = createButton('Edit', async () => {
            // TODO: Implement bridge editing modal
            alert('Bridge editing functionality will be implemented in the forms module');
          });

          const btnDeleteBridge = createButton('Delete', async () => {
            if (!confirm(`Delete bridge ${iface.dev}?`)) return;
            try {
              await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
              await window.XOSNetworking.netplan.netplanAction('delete', { type: 'bridges', name: iface.dev });
              await loadInterfaces();
            } catch (e) {
              alert(`? Failed to delete bridge: ${e}`);
            }
          }, 'btn btn-danger');
          
          actionsCell.appendChild(btnEditBridge);
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
      
      // Update interface search and sort functionality
      setupInterfaceFiltering(interfaces);
      
    } catch (e) {
      console.error('Failed to load interfaces:', e);
      tbody.innerHTML = '';
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="8" style="text-align: center; padding: 2rem; color: red;">Error: ${e}</td>`;
      tbody.appendChild(row);
      setStatus('Error loading interfaces');
    }
  }

  // Setup interface search and sorting
  function setupInterfaceFiltering(interfaces) {
    const searchInput = $('#search-iface');
    const sortSelect = $('#iface-sort');
    
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        filterInterfaces();
      });
    }
    
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        sortInterfaces();
      });
    }
  }

  // Filter interfaces based on search term
  function filterInterfaces() {
    const searchTerm = $('#search-iface')?.value?.toLowerCase() || '';
    const rows = $$('#table-interfaces tbody tr');
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const isVisible = text.includes(searchTerm);
      row.style.display = isVisible ? '' : 'none';
    });
  }

  // Sort interfaces by selected criteria
  function sortInterfaces() {
    const sortBy = $('#iface-sort')?.value || 'name';
    const tbody = $('#table-interfaces tbody');
    const rows = Array.from($$('#table-interfaces tbody tr'));
    
    rows.sort((a, b) => {
      let aValue = '';
      let bValue = '';
      
      switch (sortBy) {
        case 'name':
          aValue = a.cells[0]?.textContent || '';
          bValue = b.cells[0]?.textContent || '';
          break;
        case 'type':
          aValue = a.cells[1]?.textContent || '';
          bValue = b.cells[1]?.textContent || '';
          break;
        case 'state':
          aValue = a.cells[2]?.textContent || '';
          bValue = b.cells[2]?.textContent || '';
          break;
        default:
          aValue = a.cells[0]?.textContent || '';
          bValue = b.cells[0]?.textContent || '';
      }
      
      return aValue.localeCompare(bValue);
    });
    
    // Clear tbody and append sorted rows
    if (tbody) {
      tbody.innerHTML = '';
      rows.forEach(row => tbody.appendChild(row));
    }
  }

  // Export network interface functions
  window.XOSNetworking.networkInterface = {
    loadInterfaces,
    setupInterfaceFiltering,
    filterInterfaces,
    sortInterfaces
  };

})();