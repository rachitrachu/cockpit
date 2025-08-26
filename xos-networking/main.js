/* global cockpit */
(() => {
  'use strict';
  
  console.log('XOS Networking starting...');
  
  // Add debugging
  window.addEventListener('error', (e) => {
    console.error('JavaScript Error:', e.error, e.filename, e.lineno);
  });
  
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
  });
  
  // Wait for both DOM and Cockpit to be ready
  function waitForReady() {
    return new Promise((resolve) => {
      let domReady = document.readyState === 'complete' || document.readyState === 'interactive';
      let cockpitReady = typeof cockpit !== 'undefined';
      
      console.log('Wait check - DOM ready:', domReady, 'Cockpit ready:', cockpitReady);
      
      if (domReady && cockpitReady) {
        // Double check that key DOM elements exist
        const hasTableBody = !!document.querySelector('#table-interfaces tbody');
        const hasStatusEl = !!document.querySelector('#status');
        
        console.log('DOM elements check - table:', hasTableBody, 'status:', hasStatusEl);
        
        if (hasTableBody && hasStatusEl) {
          resolve();
        } else {
          // Wait a bit more for DOM elements to be available
          setTimeout(() => {
            console.log('DOM elements retry check...');
            resolve();
          }, 1000);
        }
      } else {
        // Wait for DOM
        if (!domReady) {
          console.log('Waiting for DOM ready event...');
          document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM ready event fired');
            if (typeof cockpit !== 'undefined') {
              setTimeout(resolve, 100);
            }
          });
        }
        
        // Wait for Cockpit
        if (!cockpitReady) {
          console.log('Waiting for Cockpit API...');
          const checkCockpit = () => {
            if (typeof cockpit !== 'undefined') {
              setTimeout(resolve, 100);
            } else {
              setTimeout(checkCockpit, 100);
            }
          };
          setTimeout(checkCockpit, 100);
        }
        
        // Fallback timeout
        setTimeout(() => {
          console.log('Fallback timeout reached, proceeding...');
          resolve();
        }, 5000);
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

  // Modal helper function
  function setupModal(modal) {
    if (!modal) {
      console.warn('setupModal called with null/undefined modal');
      return null;
    }
    
    // Handle ESC key
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        modal.close();
      }
    };
    
    // Handle backdrop clicks (click outside modal content)
    const handleBackdropClick = (e) => {
      if (e.target === modal) {
        modal.close();
      }
    };
    
    modal.addEventListener('keydown', handleEscKey);
    modal.addEventListener('click', handleBackdropClick);
    
    // Cleanup when modal closes
    modal.addEventListener('close', () => {
      // Remove event listeners to prevent memory leaks
      modal.removeEventListener('keydown', handleEscKey);
      modal.removeEventListener('click', handleBackdropClick);
      
      // Remove from DOM
      if (modal.parentNode) {
        try {
          document.body.removeChild(modal);
          console.log('Modal cleaned up successfully');
        } catch (e) {
          console.warn('Failed to remove modal from DOM:', e);
        }
      }
    });
    
    // Also handle browser's built-in cancel event (ESC key or close button)
    modal.addEventListener('cancel', (e) => {
      // Allow the default behavior (closing the modal)
      console.log('Modal cancelled via ESC key or browser close button');
    });
    
    return modal;
  }

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
          // Create a professional modal for IP configuration
          const modal = document.createElement('dialog');
          modal.innerHTML = `
            <div class="modal-content">
              <h2>🌐 Set IP Address for ${iface.dev}</h2>
              <form id="set-ip-form">
                <label>
                  <span>📍 Current IPv4 Address</span>
                  <input type="text" value="${iface.ipv4 || 'None assigned'}" readonly style="background: #f5f5f5; color: #666;">
                </label>
                
                <label>
                  <span>🌐 New IPv4 Address/CIDR</span>
                  <input type="text" id="new-ip-addr" placeholder="192.168.1.100/24" required 
                         pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$"
                         value="${iface.ipv4 || ''}">
                  <small>Use CIDR notation (e.g., 192.168.1.100/24)</small>
                </label>
                
                <label>
                  <span>🚪 Gateway (optional)</span>
                  <input type="text" id="new-gateway" placeholder="192.168.1.1"
                         pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$">
                  <small>Default gateway for this interface</small>
                </label>
                
                <label>
                  <span>🌐 DNS Servers (optional, comma separated)</span>
                  <input type="text" id="new-dns" placeholder="8.8.8.8,1.1.1.1">
                  <small>Comma separated list of DNS servers</small>
                </label>
                
                <div class="modal-section info">
                  <label style="flex-direction: row; align-items: flex-start; gap: 0.5rem;">
                    <input type="checkbox" id="persist-ip-config" checked style="margin-top: 0.25rem; width: auto;">
                    <div>
                      <strong>💾 Persist configuration to netplan (recommended)</strong>
                      <small style="display: block; margin-top: 0.25rem;">
                        When enabled, configuration survives reboots. When disabled, changes are temporary.
                      </small>
                    </div>
                  </label>
                </div>
                
                <div class="modal-section warning">
                  <strong>⚠️ Note:</strong> This will replace any existing IP configuration for this interface.
                </div>
                
                <div class="modal-buttons">
                  <button type="button" class="btn" id="cancel-ip-config">❌ Cancel</button>
                  <button type="button" class="btn primary" id="apply-ip-config">💾 Apply Configuration</button>
                </div>
              </form>
            </div>
          `;
          
          document.body.appendChild(modal);
          setupModal(modal);
          
          // Handle cancel button
          modal.querySelector('#cancel-ip-config').addEventListener('click', () => {
            modal.close();
          });
          
          // Handle form submission
          modal.querySelector('#apply-ip-config').addEventListener('click', async () => {
            const newIp = modal.querySelector('#new-ip-addr').value.trim();
            const gateway = modal.querySelector('#new-gateway').value.trim();
            const dns = modal.querySelector('#new-dns').value.trim();
            const persist = modal.querySelector('#persist-ip-config').checked;
            
            // Validation
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
            
            try {
              setStatus('Configuring IP address...');
              
              // Step 1: Apply immediate IP configuration
              try {
                // Remove existing IP addresses first
                if (iface.ipv4) {
                  try {
                    await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
                    console.log(`Removed old IP ${iface.ipv4} from ${iface.dev}`);
                  } catch (e) {
                    console.warn('Could not remove old IP (may not exist):', e);
                  }
                }
                
                // Add new IP address immediately
                await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
                console.log(`Added new IP ${newIp} to ${iface.dev}`);
                
                // Add gateway if specified
                if (gateway) {
                  try {
                    // Remove existing default route for this interface (best effort)
                    await run('ip', ['route', 'del', 'default', 'dev', iface.dev], { superuser: 'require' });
                  } catch (e) {
                    // Ignore if no existing route
                  }
                  await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', iface.dev], { superuser: 'require' });
                  console.log(`Added gateway ${gateway} for ${iface.dev}`);
                }
                
              } catch (error) {
                throw new Error(`Failed to apply IP configuration: ${error}`);
              }
              
              // Step 2: Persist to netplan if requested
              if (persist) {
                console.log('Persisting IP configuration to netplan...');
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
                  
                  const result = await netplanAction('set_ip', netplanConfig);
                  
                  if (result.error) {
                    console.warn('Netplan persistence failed:', result.error);
                    alert(`⚠️ IP configured successfully, but netplan persistence failed:\n${result.error}\n\nThe IP is set but may not survive a reboot.`);
                  } else {
                    console.log('Successfully persisted to netplan');
                    alert(`✅ IP address configured and persisted successfully!\n\n🌐 Address: ${newIp}\n${gateway ? `🚪 Gateway: ${gateway}\n` : ''}${dns ? `🌐 DNS: ${dns}\n` : ''}💾 Configuration saved to netplan`);
                  }
                } catch (error) {
                  console.error('Netplan persistence error:', error);
                  alert(`⚠️ IP configured successfully, but netplan persistence failed:\n${error}\n\nThe IP is set but may not survive a reboot.`);
                }
              } else {
                alert(`✅ IP address configured successfully!\n\n🌐 Address: ${newIp}\n${gateway ? `🚪 Gateway: ${gateway}\n` : ''}⚠️ Note: Configuration is temporary and will be lost after reboot.`);
              }
              
              modal.close();
              setStatus('✅ IP configuration applied');
              setTimeout(() => setStatus('Ready'), 3000);
              await loadInterfaces(); // Refresh the interface list
              
            } catch (error) {
              console.error('IP configuration error:', error);
              alert(`❌ Failed to set IP address: ${error.message || error}`);
              setStatus('❌ IP configuration failed');
              setTimeout(() => setStatus('Ready'), 3000);
            }
          });
          
          modal.showModal();
        });

        const btnSetMTU = createButton('Set MTU', async () => {
          // Create a professional modal for MTU configuration
          const modal = document.createElement('dialog');
          modal.innerHTML = `
            <div class="modal-content">
              <h2>📏 Set MTU for ${iface.dev}</h2>
              <form id="set-mtu-form">
                <label>
                  <span>📏 Current MTU</span>
                  <input type="text" value="${iface.mtu || 'Unknown'}" readonly style="background: #f5f5f5; color: #666;">
                </label>
                
                <label>
                  <span>🔧 New MTU Value</span>
                  <input type="number" id="new-mtu-value" min="68" max="9000" value="${iface.mtu || '1500'}" required>
                  <small>Valid range: 68 - 9000 bytes</small>
                </label>
                
                <div style="margin: 1rem 0;">
                  <h4 style="margin: 0.5rem 0; color: var(--primary-color);">📋 Common MTU Values:</h4>
                  <ul style="margin: 0; padding-left: 1.5rem; font-size: 0.875rem;">
                    <li><strong>1500:</strong> Standard Ethernet</li>
                    <li><strong>9000:</strong> Jumbo frames (high-speed LAN)</li>
                    <li><strong>1492:</strong> PPPoE connections</li>
                    <li><strong>1280:</strong> IPv6 minimum requirement</li>
                  </ul>
                </div>
                
                ${iface.dev.includes('.') ? `
                <div class="modal-section warning">
                  <strong>🏷️ VLAN Interface Notice:</strong> For VLAN interfaces, MTU changes may require the parent interface to support the same or larger MTU.
                </div>
                ` : ''}
                
                <div class="modal-section info">
                  <label style="flex-direction: row; align-items: flex-start; gap: 0.5rem;">
                    <input type="checkbox" id="persist-mtu-config" checked style="width: auto;">
                    <div>
                      <strong>💾 Persist configuration to netplan (recommended)</strong>
                      <small style="display: block; margin-top: 0.25rem;">
                        When enabled, configuration survives reboots. When disabled, changes are temporary.
                      </small>
                    </div>
                  </label>
                </div>
                
                <div class="modal-section warning">
                  <strong>⚠️ Note:</strong> Changing MTU may temporarily disrupt network connectivity on this interface.
                </div>
                
                <div class="modal-buttons">
                  <button type="button" class="btn" id="cancel-mtu-config">❌ Cancel</button>
                  <button type="button" class="btn primary" id="apply-mtu-config">💾 Apply MTU</button>
                </div>
              </form>
            </div>
          `;
          
          document.body.appendChild(modal);
          setupModal(modal);
          
          // Handle cancel button
          modal.querySelector('#cancel-mtu-config').addEventListener('click', () => {
            modal.close();
          });
          
          // Handle form submission
          modal.querySelector('#apply-mtu-config').addEventListener('click', async () => {
            const newMtu = parseInt(modal.querySelector('#new-mtu-value').value);
            const persist = modal.querySelector('#persist-mtu-config').checked;
            
            // Validation
            if (isNaN(newMtu) || newMtu < 68 || newMtu > 9000) {
              alert('❌ MTU must be between 68 and 9000!');
              modal.querySelector('#new-mtu-value').focus();
              return;
            }
            
            if (iface.mtu && parseInt(iface.mtu) === newMtu) {
              alert(`ℹ️ MTU is already set to ${newMtu}`);
              modal.close();
              return;
            }
            
            // Special validation for VLAN interfaces
            if (iface.dev.includes('.') && !iface.dev.startsWith('br')) {
              console.log(`Setting MTU for VLAN interface: ${iface.dev}`);
              // Check if parent interface MTU is adequate
              const vlanParts = iface.dev.split('.');
              const parentInterface = vlanParts[0];
              
              // Find parent interface in the current interface list to check its MTU
              const tableRows = document.querySelectorAll('#table-interfaces tbody tr');
              let parentMtu = null;
              
              tableRows.forEach(row => {
                const cells = row.cells;
                if (cells && cells[0] && cells[0].textContent === parentInterface) {
                  parentMtu = parseInt(cells[6]?.textContent || '1500');
                }
              });
              
              if (parentMtu && newMtu > parentMtu) {
                const proceedWithHigherMtu = confirm(
                  `⚠️ VLAN MTU Warning\n\n` +
                  `You're setting VLAN ${iface.dev} MTU to ${newMtu}, but parent interface ${parentInterface} has MTU ${parentMtu}.\n\n` +
                  `This may cause packet drops. Consider setting parent interface MTU to ${newMtu} or higher first.\n\n` +
                  `Do you want to proceed anyway?`
                );
                if (!proceedWithHigherMtu) return;
              }
            }
            
            try {
              setStatus('Setting MTU...');
              console.log(`Setting MTU ${newMtu} on ${iface.dev} (persist: ${persist})`);
              
              // Step 1: Apply MTU immediately if not persisting (for immediate feedback)
              if (!persist) {
                try {
                  await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu.toString()], { superuser: 'require' });
                  console.log(`Applied MTU ${newMtu} immediately to ${iface.dev}`);
                } catch (immediateError) {
                  console.warn('Failed to apply MTU immediately:', immediateError);
                }
              }
              
              // Step 2: Apply via netplan if persisting (recommended path)
              if (persist) {
                console.log('Applying MTU via netplan for persistence...');
                const result = await netplanAction('set_mtu', { name: iface.dev, mtu: newMtu });
                
                if (result.error) {
                  throw new Error('Netplan MTU configuration failed: ' + result.error);
                } else {
                  console.log('Successfully applied MTU via netplan');
                  alert(`✅ MTU configured and persisted successfully!\n\n📏 MTU: ${newMtu} bytes\n💾 Configuration saved to netplan`);
                }
              } else {
                alert(`✅ MTU configured successfully!\n\n📏 MTU: ${newMtu} bytes\n⚠️ Note: Configuration is temporary and will be lost after reboot.`);
              }
              
              modal.close();
              setStatus('✅ MTU configuration applied');
              setTimeout(() => setStatus('Ready'), 3000);
              await loadInterfaces(); // Refresh the interface list
              
            } catch (error) {
              console.error('MTU configuration error:', error);
              let errorMsg = error.message || error;
              
              // Provide specific error messages for common VLAN MTU issues
              if (iface.dev.includes('.') && errorMsg.includes('RTNETLINK')) {
                errorMsg += '\n\nFor VLAN interfaces, ensure:\n• Parent interface exists and is up\n• Parent interface MTU >= VLAN MTU\n• VLAN interface is properly configured';
              }
              
              alert(`❌ Failed to set MTU: ${errorMsg}`);
              setStatus('❌ MTU configuration failed');
              setTimeout(() => setStatus('Ready'), 3000);
            }
          });
          
          modal.showModal();
        });

        // Add delete buttons for constructed interfaces
        if (iface.dev.startsWith('bond')) {
          const btnEditBond = createButton('Edit', async () => {
            try {
              setStatus('Loading bond configuration...');
              
              // Get current bond configuration from netplan
              let bondConfig = null;
              try {
                const netplanContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
                const lines = netplanContent.split('\n');
                let inBondsSection = false;
                let currentBondName = null;
                let bondData = {};
                
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed === 'bonds:') {
                    inBondsSection = true;
                    continue;
                  }
                  if (inBondsSection && trimmed.startsWith(iface.dev + ':')) {
                    currentBondName = iface.dev;
                    bondData = { interfaces: [], parameters: {} };
                    continue;
                  }
                  if (currentBondName === iface.dev) {
                    if (trimmed.startsWith('interfaces:')) {
                      // Next lines will be the interface list
                      continue;
                    } else if (trimmed.startsWith('- ')) {
                      bondData.interfaces.push(trimmed.substring(2));
                    } else if (trimmed.includes('mode:')) {
                      bondData.parameters.mode = trimmed.split('mode:')[1]?.trim();
                    } else if (trimmed.startsWith('vlans:') || trimmed.startsWith('bridges:') || trimmed.startsWith('ethernets:')) {
                      break;
                    }
                  }
                }
                
                if (currentBondName === iface.dev) {
                  bondConfig = bondData;
                }
              } catch (e) {
                console.warn('Could not read netplan config:', e);
              }
              
              // Get current runtime bond info
              const bondInfo = await run('cat', [`/proc/net/bonding/${iface.dev}`]);
              let currentMode = 'active-backup';
              let currentSlaves = [];
              
              bondInfo.split('\n').forEach(line => {
                if (line.includes('Bonding Mode:')) {
                  const modeMatch = line.match(/Bonding Mode: ([^\\s]+)/);
                  if (modeMatch) currentMode = modeMatch[1].toLowerCase();
                }
                if (line.startsWith('Slave Interface:')) {
                  const slaveMatch = line.match(/Slave Interface: (\\w+)/);
                  if (slaveMatch) currentSlaves.push(slaveMatch[1]);
                }
              });
              
              // Use netplan config if available, otherwise runtime info
              const slaves = bondConfig?.interfaces || currentSlaves;
              const mode = bondConfig?.parameters?.mode || currentMode;
              
              // Get available interfaces for potential new slaves
              const availableInterfaces = await getPhysicalInterfaces();
              
              // Create edit modal
              const modal = document.createElement('dialog');
              modal.style.maxWidth = '600px';
              modal.innerHTML = `
                <div class="modal-content">
                  <h2>✏️ Edit Bond: ${iface.dev}</h2>
                  <form id="edit-bond-form">
                    <label>📛 Bond Name
                      <input type="text" id="edit-bond-name" value="${iface.dev}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                    </label>
                    
                    <label>⚙️ Bonding Mode
                      <select id="edit-bond-mode" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                        <option value="active-backup">🔄 Active-Backup (Failover)</option>
                        <option value="balance-rr">⚖️ Balance Round-Robin</option>
                        <option value="balance-xor">🔀 Balance XOR</option>
                        <option value="broadcast">📡 Broadcast</option>
                        <option value="802.3ad">🔗 802.3ad (LACP)</option>
                        <option value="balance-tlb">⚡ Balance TLB</option>
                        <option value="balance-alb">⚡ Balance ALB</option>
                      </select>
                    </label>
                    
                    <div style="margin: 1rem 0;">
                      <h4 style="margin: 0.5rem 0; color: var(--primary-color);">🔌 Current Slave Interfaces:</h4>
                      <div id="current-slaves" style="background: #f8f9fa; padding: 1rem; border-radius: var(--border-radius); border: 1px solid var(--border-color);">
                        ${slaves.length > 0 ? slaves.map(s => `<span style="display: inline-block; background: #e8f4fd; padding: 0.25rem 0.5rem; margin: 0.25rem; border-radius: 3px;">${s}</span>`).join('') : '<em>No slaves found</em>'}
                      </div>
                    </div>
                    
                    <div style="margin: 1rem 0;">
                      <h4 style="margin: 0.5rem 0; color: var(--primary-color);">➕ Add/Remove Slave Interfaces:</h4>
                      <p style="font-size: 0.875rem; color: var(--muted-color); margin: 0.5rem 0;">Select interfaces to include in the bond. Current slaves will be replaced.</p>
                      <select id="edit-bond-slaves" multiple style="height: 120px; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                        ${availableInterfaces.concat(slaves).filter((v, i, a) => a.indexOf(v) === i).map(iface => 
                          `<option value="${iface}" ${slaves.includes(iface) ? 'selected' : ''}>${iface}${slaves.includes(iface) ? ' (current)' : ''}</option>`
                        ).join('')}
                      </select>
                      <p style="font-size: 0.75rem; color: var(--muted-color); margin: 0.5rem 0;">Hold Ctrl/Cmd to select multiple interfaces. At least 2 required for bonding.</p>
                    </div>
                    
                    <div class="advanced-options">
                      <details>
                        <summary style="cursor: pointer; font-weight: 500; color: var(--primary-color); padding: 0.5rem;">⚙️ Advanced Bond Options</summary>
                        <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: var(--border-radius);">
                          <label>⏱️ MII Monitoring Interval (ms)
                            <input type="number" id="edit-bond-miimon" min="0" max="2000" placeholder="100" style="margin-top: 0.5rem; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                          </label>
                          <label>👑 Primary Interface (for active-backup mode)
                            <select id="edit-bond-primary" style="margin-top: 0.5rem; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                              <option value="">-- Auto select --</option>
                            </select>
                          </label>
                        </div>
                      </details>
                    </div>
                    
                    <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                      <strong>⚠️ Important:</strong> Modifying a bond will temporarily disrupt network connectivity on the affected interfaces. The bond will be recreated with new settings.
                    </div>
                    
                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                      <button type="button" class="btn" id="cancel-bond-edit">❌ Cancel</button>
                      <button type="button" class="btn primary" id="save-bond-changes">💾 Apply Changes</button>
                    </div>
                  </form>
                </div>
              `;
              
              document.body.appendChild(modal);
              setupModal(modal);
              
              // Handle cancel button
              modal.querySelector('#cancel-bond-edit').addEventListener('click', () => {
                modal.close();
              });
              
              // Set current values
              const modeSelect = modal.querySelector('#edit-bond-mode');
              if (modeSelect) {
                modeSelect.value = mode;
              }
              
              // Update primary interface dropdown based on selected slaves
              const updatePrimaryOptions = () => {
                const slavesSelect = modal.querySelector('#edit-bond-slaves');
                const primarySelect = modal.querySelector('#edit-bond-primary');
                if (slavesSelect && primarySelect) {
                  const selectedSlaves = Array.from(slavesSelect.selectedOptions).map(opt => opt.value);
                  primarySelect.innerHTML = '<option value="">-- Auto select --</option>';
                  selectedSlaves.forEach(slave => {
                    const option = document.createElement('option');
                    option.value = slave;
                    option.textContent = slave;
                    primarySelect.appendChild(option);
                  });
                }
              };
              
              // Set up event listeners
              const slavesSelect = modal.querySelector('#edit-bond-slaves');
              if (slavesSelect) {
                slavesSelect.addEventListener('change', updatePrimaryOptions);
                updatePrimaryOptions(); // Initial call
              }
              
              // Handle save
              modal.querySelector('#save-bond-changes').addEventListener('click', async () => {
                const newMode = modal.querySelector('#edit-bond-mode').value;
                const newSlaves = Array.from(modal.querySelector('#edit-bond-slaves').selectedOptions).map(opt => opt.value);
                const miimon = modal.querySelector('#edit-bond-miimon').value;
                const primary = modal.querySelector('#edit-bond-primary').value;
                
                if (newSlaves.length < 2) {
                  alert('❌ At least two slave interfaces are required for bonding!');
                  return;
                }
                
                // Check if anything changed
                const modeChanged = newMode !== mode;
                const slavesChanged = JSON.stringify(newSlaves.sort()) !== JSON.stringify(slaves.sort());
                
                if (!modeChanged && !slavesChanged && !miimon && !primary) {
                  alert('ℹ️ No changes detected.');
                  modal.close();
                  return;
                }
                
                if (!confirm(`💾 Apply bond changes?\\n\\n` +
                  `Mode: ${mode} → ${newMode}\\n` +
                  `Slaves: [${slaves.join(', ')}] → [${newSlaves.join(', ')}]\\n\\n` +
                  `⚠️ This will temporarily disrupt connectivity on these interfaces.`)) return;
                
                try {
                  setStatus('Updating bond configuration...');
                  
                  // Step 1: Delete the existing bond
                  try {
                    await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
                  } catch (e) {
                    console.warn('Failed to delete existing bond interface:', e);
                  }
                  
                  // Step 2: Remove from netplan
                  try {
                    await netplanAction('delete', { type: 'bonds', name: iface.dev });
                  } catch (e) {
                    console.warn('Failed to remove from netplan:', e);
                  }
                  
                  // Step 3: Create new bond configuration
                  const bondNewConfig = {
                    name: iface.dev,
                    mode: newMode,
                    interfaces: newSlaves
                  };
                  
                  if (miimon && parseInt(miimon) > 0) {
                    bondNewConfig.miimon = parseInt(miimon);
                  }
                  
                  if (primary && newSlaves.includes(primary)) {
                    bondNewConfig.primary = primary;
                  }
                  
                  const result = await netplanAction('add_bond', bondNewConfig);
                  
                  if (result.error) {
                    throw new Error('Failed to create updated bond: ' + result.error);
                  }
                  
                  modal.close();
                  alert(`✅ Bond ${iface.dev} updated successfully!\n\n` +
                    `New Mode: ${newMode}\n` +
                    `New Slaves: ${newSlaves.join(', ')}`);
                  
                  setStatus('✅ Bond updated successfully');
                  setTimeout(() => setStatus('Ready'), 3000);
                  await loadInterfaces();
                } catch (error) {
                  console.error('Bond update failed:', error);
                  alert(`❌ Failed to update bond: ${error.message || error}`);
                  setStatus('❌ Bond update failed');
                  setTimeout(() => setStatus('Ready'), 3000);
                }
              });
              
              modal.showModal();
            } catch (error) {
              console.error('Failed to load bond configuration:', error);
              alert(`❌ Failed to load bond configuration: ${error}`);
            } finally {
              setStatus('Ready');
            }
          });
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
          
          actionsCell.appendChild(btnEditBond);
          actionsCell.appendChild(btnDeleteBond);
        } else if (iface.dev.includes('.') && !iface.dev.startsWith('br')) {
          const btnEditVlan = createButton('Edit', async () => {
            try {
              setStatus('Loading VLAN configuration...');
              
              // Get current VLAN configuration
              let vlanConfig = null;
              try {
                const netplanContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
                const lines = netplanContent.split('\n');
                let inVlansSection = false;
                let currentVlanName = null;
                let vlanData = {};
                
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed === 'vlans:') {
                    inVlansSection = true;
                    continue;
                  }
                  if (inVlansSection && trimmed.startsWith(iface.dev + ':')) {
                    currentVlanName = iface.dev;
                    vlanData = {};
                    continue;
                  }
                  if (currentVlanName === iface.dev) {
                    if (trimmed.includes('id:')) {
                      vlanData.id = parseInt(trimmed.split('id:')[1]?.trim());
                    } else if (trimmed.includes('link:')) {
                      vlanData.link = trimmed.split('link:')[1]?.trim();
                    } else if (trimmed.startsWith('bonds:') || trimmed.startsWith('bridges:') || trimmed.startsWith('ethernets:')) {
                      break;
                    }
                  }
                }
                
                if (currentVlanName === iface.dev) {
                  vlanConfig = vlanData;
                }
              } catch (e) {
                console.warn('Could not read netplan config:', e);
                vlanConfig = { interfaces: [], parameters: {} };
              }
              
              // Parse VLAN info from interface name if config not found
              if (!vlanConfig && iface.dev.includes('.')) {
                const parts = iface.dev.split('.');
                vlanConfig = {
                  link: parts[0],
                  id: parseInt(parts[1])
                };
              }
              
              if (!vlanConfig) {
                throw new Error('Could not determine VLAN configuration');
              }
              
              // Get available parent interfaces
              const availableInterfaces = await getPhysicalInterfaces();
              
              // Create edit modal
              const modal = document.createElement('dialog');
              modal.style.maxWidth = '500px';
              modal.innerHTML = `
                <div class="modal-content">
                  <h2>✏️ Edit VLAN: ${iface.dev}</h2>
                  <form id="edit-vlan-form">
                    <label>📛 VLAN Interface Name
                      <input type="text" id="edit-vlan-name" value="${iface.dev}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                    </label>
                    
                    <label>🔌 Parent Interface
                      <select id="edit-vlan-parent" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                        ${availableInterfaces.map(iface => 
                          `<option value="${iface}" ${iface === vlanConfig.link ? 'selected' : ''}>${iface}</option>`
                        ).join('')}
                      </select>
                    </label>
                    
                    <label>🔢 VLAN ID
                      <input type="number" id="edit-vlan-id" value="${vlanConfig.id || ''}" min="1" max="4094" required style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                    </label>
                    
                    <label>📏 MTU (optional)
                      <input type="number" id="edit-vlan-mtu" value="${iface.mtu !== '1500' ? iface.mtu : ''}" min="68" max="9000" placeholder="1500" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                    </label>
                    
                    <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                      <strong>⚠️ Note:</strong> Changing VLAN configuration will recreate the interface and may cause temporary connectivity loss.
                    </div>
                    
                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                      <button type="button" class="btn" id="cancel-vlan-edit">❌ Cancel</button>
                      <button type="button" class="btn primary" id="save-vlan-changes">💾 Apply Changes</button>
                    </div>
                  </form>
                </div>
              `;
              
              document.body.appendChild(modal);
              setupModal(modal);
              
              // Handle cancel button
              modal.querySelector('#cancel-vlan-edit').addEventListener('click', () => {
                modal.close();
              });
              
              // Handle form submission
              modal.querySelector('#save-vlan-changes').addEventListener('click', async () => {
                const newParent = modal.querySelector('#edit-vlan-parent').value;
                const newId = parseInt(modal.querySelector('#edit-vlan-id').value);
                const newMtu = modal.querySelector('#edit-vlan-mtu').value;
                const staticIp = modal.querySelector('#vlan-static-ip').value.trim();
                const gateway = modal.querySelector('#vlan-gateway').value.trim();
                const newName = `${newParent}.${newId}`;
                
                if (!newParent || isNaN(newId) || newId < 1 || newId > 4094) {
                  alert('❌ Valid parent interface and VLAN ID (1-4094) are required!');
                  return;
                }
                
                // Check if VLAN exists
                const existingVlan = await getVlanConfig(newName);
                if (existingVlan && existingVlan.id !== vlanConfig.id) {
                  alert(`❌ VLAN ${newName} already exists!`);
                  return;
                }
                
                // Validate MTU
                if (newMtu && (isNaN(newMtu) || newMtu < 68 || newMtu > 9000)) {
                  alert('❌ MTU must be between 68 and 9000!');
                  modal.querySelector('#edit-vlan-mtu').focus();
                  return;
                }
                
                try {
                  setStatus('Updating VLAN configuration...');
                  
                  // Step 1: Delete existing VLAN
                  try {
                    await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
                  } catch (e) {
                    console.warn('Failed to delete existing VLAN interface:', e);
                  }
                  
                  // Step 2: Remove from netplan
                  try {
                    await netplanAction('delete', { type: 'vlans', name: iface.dev });
                  } catch (e) {
                    console.warn('Failed to remove from netplan:', e);
                  }
                  
                  // Step 3: Create new VLAN configuration
                  const vlanNewConfig = {
                    name: newName,
                    id: newId,
                    link: newParent
                  };
                  
                  if (newMtu && parseInt(newMtu) !== 1500) {
                    vlanNewConfig.mtu = parseInt(newMtu);
                  }
                  
                  const result = await netplanAction('add_vlan', vlanNewConfig);
                  
                  if (result.error) {
                    throw new Error('Failed to create updated VLAN: ' + result.error);
                  }
                  
                  // Step 4: Configure IP if provided
                  if (staticIp) {
                    console.log('Configuring IP for VLAN interface...');
                    
                    // Apply IP immediately
                    try {
                      await run('ip', ['addr', 'add', staticIp, 'dev', newName], { superuser: 'require' });
                      console.log(`Added IP ${staticIp} to VLAN ${newName}`);
                      
                      // Add gateway if specified
                      if (gateway) {
                        await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', newName], { superuser: 'require' });
                        console.log(`Added gateway ${gateway} for VLAN ${newName}`);
                      }
                    } catch (ipError) {
                      console.warn('Failed to apply IP immediately:', ipError);
                    }
                    
                    // Persist IP to netplan
                    try {
                      const ipConfig = {
                        name: newName,
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
                  
                  modal.close();
                  alert(`✅ VLAN ${newName} updated successfully!`);
                  await loadInterfaces();
                } catch (error) {
                  console.error('VLAN update failed:', error);
                  alert(`❌ Failed to update VLAN: ${error.message || error}`);
                  setStatus('❌ VLAN update failed');
                  setTimeout(() => setStatus('Ready'), 3000);
                }
              });
              
              modal.showModal();
            } catch (error) {
              console.error('Failed to load VLAN configuration:', error);
              alert(`❌ Failed to load VLAN configuration: ${error}`);
            } finally {
              setStatus('Ready');
            }
          });

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
          
          actionsCell.appendChild(btnEditVlan);
          actionsCell.appendChild(btnDeleteVlan);
        } else if (iface.dev.startsWith('br')) {
          const btnEditBridge = createButton('Edit', async () => {
            try {
              setStatus('Loading bridge configuration...');


              // Get current bridge configuration
              let bridgeConfig = null;
              try {
                const netplanContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
                const lines = netplanContent.split('\n');
                let inBridgesSection = false;
                let currentBridgeName = null;
                let bridgeData = { interfaces: [], parameters: {} };
                
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed === 'bridges:') {
                    inBridgesSection = true;
                    continue;
                  }
                  if (inBridgesSection && trimmed.startsWith(iface.dev + ':')) {
                    currentBridgeName = iface.dev;
                    bridgeData = { interfaces: [], parameters: {} };
                    continue;
                  }
                  if (currentBridgeName === iface.dev) {
                    if (trimmed.startsWith('interfaces:')) {
                      continue;
                    } else if (trimmed.startsWith('- ')) {
                      bridgeData.interfaces.push(trimmed.substring(2));
                    } else if (trimmed.includes('stp:')) {
                      bridgeData.parameters.stp = trimmed.split('stp:')[1]?.trim() === 'true';
                    } else if (trimmed.includes('forward-delay:')) {
                      bridgeData.parameters['forward-delay'] = parseInt(trimmed.split('forward-delay:')[1]?.trim());
                    } else if (trimmed.includes('hello-time:')) {
                      bridgeData.parameters['hello-time'] = parseInt(trimmed.split('hello-time:')[1]?.trim());
                    } else if (trimmed.startsWith('bonds:') || trimmed.startsWith('vlans:') || trimmed.startsWith('ethernets:')) {
                      break;
                    }
                  }
                }
                
                if (currentBridgeName === iface.dev) {
                  bridgeConfig = bridgeData;
                }
              } catch (e) {
                console.warn('Could not read netplan config:', e);
                bridgeConfig = { interfaces: [], parameters: {} };
              }
              
              // Get available interfaces for bridge ports
              const availableInterfaces = await getPhysicalInterfaces();
              const currentPorts = bridgeConfig.interfaces || [];
              
              // Create edit modal
              const modal = document.createElement('dialog');
              modal.style.maxWidth = '600px';
              modal.innerHTML = `
                <div class="modal-content">
                  <h2>✏️ Edit Bridge: ${iface.dev}</h2>
                  <form id="edit-bridge-form">
                    <label>📛 Bridge Name
                      <input type="text" id="edit-bridge-name" value="${iface.dev}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                    </label>
                    
                    <div style="margin: 1rem 0;">
                      <h4 style="margin: 0.5rem 0; color: var(--primary-color);">🔌 Current Bridge Ports:</h4>
                      <div id="current-ports" style="background: #f8f9fa; padding: 1rem; border-radius: var(--border-radius); border: 1px solid var(--border-color);">
                        ${currentPorts.length > 0 ? currentPorts.map(p => `<span style="display: inline-block; background: #e8f4fd; padding: 0.25rem 0.5rem; margin: 0.25rem; border-radius: 3px;">${p}</span>`).join('') : '<em>No ports found</em>'}
                      </div>
                    </div>
                
                    <div style="margin: 1rem 0;">
                      <h4 style="margin: 0.5rem 0; color: var(--primary-color);">➕ Select Bridge Ports:</h4>
                      <p style="font-size: 0.875rem; color: var(--muted-color); margin: 0.5rem 0;">Select interfaces to include in the bridge. Current ports will be replaced.</p>
                      <select id="edit-bridge-ports" multiple style="height: 120px; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                        ${availableInterfaces.concat(currentPorts).filter((v, i, a) => a.indexOf(v) === i).map(iface => 
                          `<option value="${iface}" ${currentPorts.includes(iface) ? 'selected' : ''}>${iface}${currentPorts.includes(iface) ? ' (current)' : ''}</option>`
                        ).join('')}
                      </select>
                      <p style="font-size: 0.75rem; color: var(--muted-color); margin: 0.5rem 0;">Hold Ctrl/Cmd to select multiple interfaces. At least 1 required.</p>
                    </div>
                    
                    <div class="advanced-options">
                      <details>
                        <summary style="cursor: pointer; font-weight: 500; color: var(--primary-color); padding: 0.5rem;">⚙️ Advanced Bridge Options</summary>
                        <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: var(--border-radius);">
                          <label>🌲 STP (Spanning Tree Protocol)
                            <select id="edit-bridge-stp" style="margin-top: 0.5rem; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                              <option value="false" ${!bridgeConfig.parameters?.stp ? 'selected' : ''}>❌ Disable</option>
                              <option value="true" ${bridgeConfig.parameters?.stp ? 'selected' : ''}>✅ Enable</option>
                            </select>
                          </label>
                          <label>⏱️ Forward Delay (seconds)
                            <input type="number" id="edit-bridge-forward-delay" value="${bridgeConfig.parameters?.['forward-delay'] || ''}" min="2" max="30" placeholder="15" style="margin-top: 0.5rem; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                          </label>
                          <label>👋 Hello Time (seconds)
                            <input type="number" id="edit-bridge-hello-time" value="${bridgeConfig.parameters?.['hello-time'] || ''}" min="1" max="10" placeholder="2" style="margin-top: 0.5rem; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                          </label>
                        </div>
                      </details>
                    </div>
                    
                    <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                      <strong>⚠️ Important:</strong> Modifying a bridge will temporarily disrupt network connectivity on the bridge and its ports.
                    </div>
                    
                    <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                      <button type="button" class="btn" id="cancel-bridge-edit">❌ Cancel</button>
                      <button type="button" class="btn primary" id="save-bridge-changes">💾 Apply Changes</button>
                    </div>
                  </form>
                </div>
              `;
              
              document.body.appendChild(modal);
              setupModal(modal);
              
              // Handle cancel button
              modal.querySelector('#cancel-bridge-edit').addEventListener('click', () => {
                modal.close();
              });
              
              // Setup port filtering
              const filterInput = modal.querySelector('#bridge-ports-filter');
              const portsSelect = modal.querySelector('#edit-bridge-ports');
              
              filterInput.addEventListener('input', () => {
                const term = filterInput.value.toLowerCase();
                Array.from(portsSelect.options).forEach(opt => {
                  opt.style.display = opt.textContent.toLowerCase().includes(term) ? '' : 'none';
                });
              });
              
              // Handle save
              modal.querySelector('#save-bridge-changes').addEventListener('click', async () => {
                const newPorts = Array.from(modal.querySelector('#edit-bridge-ports').selectedOptions).map(opt => opt.value);
                const newStp = modal.querySelector('#edit-bridge-stp').value === 'true';
                const newForwardDelay = modal.querySelector('#edit-bridge-forward-delay').value;
                const newHelloTime = modal.querySelector('#edit-bridge-hello-time').value;
                
                if (newPorts.length === 0) {
                  alert('❌ At least one port interface is required for bridge!');
                  return;
                }
                
                // Check if anything changed
                const portsChanged = JSON.stringify(newPorts.sort()) !== JSON.stringify(currentPorts.sort());
                const stpChanged = newStp !== (bridgeConfig.parameters?.stp || false);
                const forwardDelayChanged = newForwardDelay && parseInt(newForwardDelay) !== (bridgeConfig.parameters?.['forward-delay'] || 0);
                const helloTimeChanged = newHelloTime && parseInt(newHelloTime) !== (bridgeConfig.parameters?.['hello-time'] || 0);
                
                if (!portsChanged && !stpChanged && !forwardDelayChanged && !helloTimeChanged) {
                  alert('ℹ️ No changes detected.');
                  modal.close();
                  return;
                }
                
                if (!confirm(`💾 Apply bridge changes?\\n\\n` +
                  `Ports: [${currentPorts.join(', ')}] → [${newPorts.join(', ')}]\\n` +
                  `STP: ${bridgeConfig.parameters?.stp || false} → ${newStp}\\n` +
                  `${newForwardDelay ? `Forward Delay: ${newForwardDelay}s\\n` : ''}` +
                  `${newHelloTime ? `Hello Time: ${newHelloTime}s\\n` : ''}\\n` +
                  `⚠️ This will temporarily disrupt connectivity on the bridge.`)) return;
                
                try {
                  setStatus('Updating bridge configuration...');
                  
                  // Step 1: Delete existing bridge
                  try {
                    await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
                  } catch (e) {
                    console.warn('Failed to delete existing bridge interface:', e);
                  }
                  
                  // Step 2: Remove from netplan
                  try {
                    await netplanAction('delete', { type: 'bridges', name: iface.dev });
                  } catch (e) {
                    console.warn('Failed to remove from netplan:', e);
                  }
                  
                  // Step 3: Create new bridge configuration
                  const bridgeNewConfig = {
                    name: iface.dev,
                    interfaces: newPorts
                  };
                  
                  if (newStp) {
                    bridgeNewConfig.stp = true;
                  }
                  
                  if (newForwardDelay && parseInt(newForwardDelay) > 0) {
                    bridgeNewConfig.forward_delay = parseInt(newForwardDelay);
                  }
                  
                  if (newHelloTime && parseInt(newHelloTime) > 0) {
                    bridgeNewConfig.hello_time = parseInt(newHelloTime);
                  }
                  
                  const result = await netplanAction('add_bridge', bridgeNewConfig);
                  
                  if (result.error) {
                    throw new Error('Failed to create updated bridge: ' + result.error);
                  }
                  
                  modal.close();
                  alert(`✅ Bridge ${iface.dev} updated successfully!\n\n` +
                    `New Ports: ${newPorts.join(', ')}\n` +
                    `STP: ${newStp ? 'Enabled' : 'Disabled'}`);
                  
                  setStatus('✅ Bridge updated successfully');
                  setTimeout(() => setStatus('Ready'), 3000);
                  await loadInterfaces();
                  
                } catch (error) {
                  console.error('Bridge update failed:', error);
                  alert(`❌ Failed to update bridge: ${error.message || error}`);
                  setStatus('❌ Bridge update failed');
                  setTimeout(() => setStatus('Ready'), 3000);
                }
              });
            
              modal.showModal();
            } catch (error) {
              console.error('Failed to load bridge configuration:', error);
              alert(`❌ Failed to load bridge configuration: ${error}`);
            } finally {
              setStatus('Ready');
            }
          });

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
      
    } catch (e) {
      console.error('Failed to load interfaces:', e);
      tbody.innerHTML = '';
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="8" style="text-align: center; padding: 2rem; color: red;">Error: ${e}</td>`;
      tbody.appendChild(row);
      setStatus('Error loading interfaces');
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
    
    // Main refresh button (in header)
    const refreshBtn = $('#btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        console.log('Main refresh button clicked');
        setStatus('Refreshing all data...');
        await Promise.all([
          loadInterfaces(),
          loadDiagnostics()
        ]);
        setStatus('All data refreshed');
      });
    }

    // Refresh interfaces button (in toolbar)
    const refreshIfacesBtn = $('#btn-refresh-interfaces');
    if (refreshIfacesBtn) {
      refreshIfacesBtn.addEventListener('click', async () => {
        console.log('Refresh interfaces button clicked');
        await loadInterfaces();
      });
    }

    // Show netplan config button
    const btnShowNetplan = $('#btn-show-netplan');
    if (btnShowNetplan) {
      btnShowNetplan.addEventListener('click', async () => {
        console.log('Show netplan config button clicked');
        try {
          setStatus('Loading netplan configuration...');
          
          // Try to get the XOS Networking specific config first
          let config = '';
          let filename = '99-cockpit.yaml';
          
          try {
            config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
          } catch (e) {
            console.warn('99-cockpit.yaml not found, trying other netplan files');
            
            // If XOS config doesn't exist, show all netplan files
            try {
              const allConfigs = await run('bash', ['-c', 'for f in /etc/netplan/*.yaml; do echo "=== $f ==="; cat "$f" 2>/dev/null; echo ""; done'], { superuser: 'try' });
              config = allConfigs;
              filename = 'All Netplan Files';
            } catch (e2) {
              config = 'No netplan configuration files found.\n\nNetplan files are typically located in /etc/netplan/ and end with .yaml';
              filename = 'No Configuration Found';
            }
          }
          
          // Create a modal to display the configuration
          const modal = document.createElement('dialog');
          modal.innerHTML = `
            <div class="modal-content">
              <h2>📋 ${filename}</h2>
              <div style="margin: 1rem 0;">
                <label>
                  <span style="font-weight: 500;">Configuration Content:</span>
                  <textarea readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 0.875rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; resize: vertical;">${config}</textarea>
                </label>
              </div>
              <div class="modal-buttons">
                <button type="button" class="btn primary" id="close-config-modal">✅ Close</button>
              </div>
            </div>
          `;
          
          document.body.appendChild(modal);
          setupModal(modal);
          
          // Add explicit close button handler
          const closeBtn = modal.querySelector('#close-config-modal');
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              modal.close();
            });
          }
          
          modal.showModal();
          
        } catch (error) {
          console.error('Show config failed:', error);
          alert(`❌ Failed to show netplan configuration:\n${error.message || error}`);
        } finally {
          setStatus('Ready');
        }
      });
    }

    // Backup netplan button  
    const btnBackupNetplan = $('#btn-backup-netplan');
    if (btnBackupNetplan) {
      btnBackupNetplan.addEventListener('click', async () => {
        console.log('Backup netplan button clicked');
        try {
          setStatus('Creating netplan backup...');
          
          // Create backup with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupDir = `/etc/netplan/backups`;
          const backupFile = `${backupDir}/netplan-backup-${timestamp}.tar.gz`;
          
          // Create backup directory if it doesn't exist
          try {
            await run('mkdir', ['-p', backupDir], { superuser: 'require' });
          } catch (e) {
            console.warn('Backup directory might already exist:', e);
          }
          
          // Create backup archive of entire netplan directory
          await run('tar', ['-czf', backupFile, '-C', '/etc', 'netplan/'], { superuser: 'require' });
          
          // Verify backup was created and get file info
          const backupInfo = await run('ls', ['-lh', backupFile], { superuser: 'try' });
          
          // List recent backups
          let backupList = '';
          try {
            backupList = await run('bash', ['-c', `ls -lht ${backupDir}/*.tar.gz 2>/dev/null | head -10 || echo "This is the first backup."`], { superuser: 'try' });
          } catch (e) {
            backupList = 'This is the first backup.';
          }
          
          // Show success message with details
          const modal = document.createElement('dialog');
          modal.innerHTML = `
            <div class="modal-content">
              <h2>✅ Backup Created Successfully</h2>
              <div style="margin: 1rem 0;">
                <p><strong>📁 Backup File:</strong><br><code>${backupFile}</code></p>
                <p><strong>📊 File Details:</strong><br><code>${backupInfo}</code></p>
                <details>
                  <summary><strong>📋 Recent Backups</strong></summary>
                  <pre style="background: #f8f9fa; padding: 1rem; border-radius: 4px; font-size: 0.875rem; max-height: 200px; overflow-y: auto;">${backupList}</pre>
                </details>
                <p><strong>🚀 Next Steps:</strong><br>To restore from this backup, use the command:<br><code>sudo tar -xzf ${backupFile} -C /etc/netplan/</code></p>
              </div>
              <div class="modal-buttons">
                <button type="button" class="btn primary" id="close-backup-modal">✅ Close</button>
              </div>
            </div>
          `;
          
          document.body.appendChild(modal);
          setupModal(modal);
          
          // Add explicit close button handler
          const closeBtn = modal.querySelector('#close-backup-modal');
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              modal.close();
            });
          }
          
          modal.showModal();
          
        } catch (error) {
          console.error('Backup failed:', error);
          alert(`❌ Failed to create netplan backup:\n${error.message || error}`);
        } finally {
          setStatus('Ready');
        }
      });
    }
    
    // Setup ping functionality
    const btnPing = $('#btn-ping');
    if (btnPing) {
      btnPing.addEventListener('click', async () => {
        const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
        const output = $('#ping-out');
        
        try {
          setStatus(`Pinging ${host}...`);
          if (output) output.textContent = 'Pinging...';
          
          const result = await run('ping', ['-c', '4', host], { superuser: 'try' });
          if (output) output.textContent = result;
          setStatus('Ping completed');
        } catch (e) {
          if (output) output.textContent = `Ping failed: ${e}`;
          setStatus('Ping failed');
        }
      });
    }
    
    // Setup traceroute functionality  
    const btnTraceroute = $('#btn-traceroute');
    if (btnTraceroute) {
      btnTraceroute.addEventListener('click', async () => {
        const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
        const output = $('#ping-out'); // Reuse ping output area
        
        try {
          setStatus(`Tracing route to ${host}...`);
          if (output) output.textContent = 'Tracing route...';
          
          // Try traceroute first, then fallback to tracepath
          let result;
          try {
            result = await run('traceroute', ['-n', '-m', '15', host], { superuser: 'try' });
          } catch (e) {
            result = await run('tracepath', [host], { superuser: 'try' });
          }
          
          if (output) output.textContent = result;
          setStatus('Traceroute completed');
        } catch (e) {
          if (output) output.textContent = `Traceroute failed: ${e}`;
          setStatus('Traceroute failed');
        }
      });
    }
  }

  // Main initialization function
  async function init() {
    // Wait for DOM and Cockpit to be ready
    await waitForReady();
    
    setStatus('Starting up...');
    
    // Setup tabs
    setupTabs();
    
    // Load initial data
    await Promise.all([
      loadInterfaces(),
      loadDiagnostics()
    ]);
    
    setStatus('Ready');
  }

  // Start the application
  init();
})();
