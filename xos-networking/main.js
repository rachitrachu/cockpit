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
          modal.style.maxWidth = '650px';
          modal.innerHTML = `
            <div class="modal-content">
              <h2>🌐 Set IP Address for ${iface.dev}</h2>
              <form id="set-ip-form">
                <label>📍 Current IPv4 Address
                  <input type="text" value="${iface.ipv4 || 'None assigned'}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                </label>
                
                <label>🌐 New IPv4 Address/CIDR
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
                
                <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                  <strong>⚠️ Note:</strong> This will replace any existing IP configuration for this interface.
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                  <button type="button" class="btn" id="cancel-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">❌ Cancel</button>
                  <button type="button" class="btn primary" id="apply-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">💾 Apply Configuration</button>
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
          modal.style.maxWidth = '550px';
          modal.innerHTML = `
            <div class="modal-content">
              <h2>📏 Set MTU for ${iface.dev}</h2>
              <form id="set-mtu-form">
                <label>📏 Current MTU
                  <input type="text" value="${iface.mtu || 'Unknown'}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                </label>
                
                <label>🔧 New MTU Value
                  <input type="number" id="new-mtu-value" min="68" max="9000" value="${iface.mtu || '1500'}" required 
                         style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                  <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Valid range: 68 - 9000 bytes</small>
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
                
                <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
                  <label style="display: flex; align-items: flex-start; gap: 0.5rem; margin: 0;">
                    <input type="checkbox" id="persist-mtu-config" checked>
                    💾 <strong>Persist configuration to netplan (recommended)
                  </label>
                  <small style="color: var(--muted-color); font-size: 0.875rem; margin-left: 1.5rem;">
                    When enabled, configuration survives reboots. When disabled, changes are temporary.
                  </small>
                </div>
                
                <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                  <strong>⚠️ Note:</strong> Changing MTU may temporarily disrupt network connectivity on this interface.
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                  <button type="button" class="btn" id="cancel-mtu-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">❌ Cancel</button>
                  <button type="button" class="btn primary" id="apply-mtu-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">💾 Apply MTU</button>
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
            
            try {
              setStatus('Setting MTU...');
              
              // Step 1: Apply MTU immediately
              await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu.toString()], { superuser: 'require' });
              console.log(`Set MTU ${newMtu} on ${iface.dev}`);
              
              // Step 2: Persist to netplan if requested
              if (persist) {
                console.log('Persisting MTU configuration to netplan...');
                try {
                  const result = await netplanAction('set_mtu', { name: iface.dev, mtu: newMtu });
                  
                  if (result.error) {
                    console.warn('Netplan persistence failed:', result.error);
                    alert(`⚠️ MTU set successfully, but netplan persistence failed:\n${result.error}\n\nThe MTU is set but may not survive a reboot.`);
                  } else {
                    console.log('Successfully persisted MTU to netplan');
                    alert(`✅ MTU configured and persisted successfully!\n\n📏 MTU: ${newMtu} bytes\n💾 Configuration saved to netplan`);
                  }
                } catch (error) {
                  console.error('Netplan persistence error:', error);
                  alert(`⚠️ MTU set successfully, but netplan persistence failed:\n${error}\n\nThe MTU is set but may not survive a reboot.`);
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
              alert(`❌ Failed to set MTU: ${error.message || error}`);
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
                const newName = `${newParent}.${newId}`;
                
                if (!newParent || isNaN(newId) || newId < 1 || newId > 4094) {
                  alert('❌ Valid parent interface and VLAN ID (1-4094) are required!');
                  return;
                }
                
                // Check if anything changed
                const parentChanged = newParent !== vlanConfig.link;
                const idChanged = newId !== vlanConfig.id;
                const nameChanged = newName !== iface.dev;
                
                if (!parentChanged && !idChanged && !newMtu) {
                  alert('ℹ️ No changes detected.');
                  modal.close();
                  return;
                }
                
                if (!confirm(`💾 Apply VLAN changes?\\n\\n` +
                  `Interface: ${iface.dev} → ${newName}\\n` +
                  `Parent: ${vlanConfig.link} → ${newParent}\\n` +
                  `VLAN ID: ${vlanConfig.id} → ${newId}\\n` +
                  `${newMtu ? `MTU: ${newMtu}\\n` : ''}\\n` +
                  `⚠️ This will recreate the VLAN interface.`)) return;
                
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
                  alert(`✅ VLAN updated successfully!`);
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
                      <input type="text" id="bridge-ports-filter" placeholder="Filter interfaces..." style="width: 100%; margin-bottom: 0.5rem; padding: 0.5rem;">
                      <select id="edit-bridge-ports" multiple style="height: 120px; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;" onchange="this.size= this.options.length > 5 ? 5 : 1">
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
    
    // Main refresh button (in header)
    const refreshBtn = $('#btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        console.log('Main refresh button clicked');
        setStatus('Refreshing all data...');
        await Promise.all([
          loadInterfaces(),
          loadConnections(), 
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
          modal.style.maxWidth = '80vw';
          modal.style.maxHeight = '80vh';
          modal.innerHTML = `
            <div class="modal-content">
              <h2>📋 ${filename}</h2>
              <div style="margin: 1rem 0;">
                <label style="font-weight: 500;">Configuration Content:</label>
                <textarea readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 0.875rem; padding: 1rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px;">${config}</textarea>
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
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
          modal.style.maxWidth = '600px';
          modal.innerHTML = `
            <div class="modal-content">
              <h2>✅ Backup Created Successfully</h2>
              <div style="margin: 1rem 0;">
                <p><strong>📁 Backup File:</strong><br><code>${backupFile}</code></p>
                <p><strong>📊 File Details:</strong><br><code>${backupInfo}</code></p>
                <details>
                  <summary><strong>📋 Recent Backups</strong></summary>
                  <pre style="background: #f8f9fa; padding: 1rem; border-radius: 4px; font-size: 0.875rem;">${backupList}</pre>
                </details>
                <p><strong>💡 Tip:</strong> To restore from backup, extract the tar.gz file to /etc/</p>
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
                <button type="button" class="btn primary" id="close-backup-modal">✅ OK</button>
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
          alert(`❌ Failed to create backup:\n${error.message || error}`);
        } finally {
          setStatus('Ready');
        }
      });
    }

    // Apply netplan configuration button
    const btnApplyNetplan = $('#btn-apply-netplan');
    if (btnApplyNetplan) {
      btnApplyNetplan.addEventListener('click', async () => {
        if (!confirm('⚡ Apply Netplan configuration?\n\nThis may temporarily disrupt network connectivity while the configuration is applied.')) return;
        
        try {
          setStatus('Applying Netplan configuration...');
          await run('netplan', ['apply'], { superuser: 'require' });
          alert('✅ Netplan configuration applied successfully!\n\nNetwork interfaces have been reconfigured.');
          await loadInterfaces(); // Refresh interface list
        } catch (e) {
          alert(`❌ Failed to apply Netplan configuration:\n${e}`);
        } finally {
          setStatus('Ready');
        }
      });
    }

    // Debug button to test netplan writing
    const btnTestNetplan = $('#btn-test-netplan');
    if (btnTestNetplan) {
      btnTestNetplan.addEventListener('click', async () => {
        try {
          setStatus('Testing netplan write...');
          
          // Test netplan action with a simple configuration
          const testConfig = {
            name: 'eth0',
            static_ip: '192.168.1.100/24',
            gateway: '192.168.1.1',
            dns: '8.8.8.8,1.1.1.1'
          };
          
          console.log('Testing netplan action with config:', testConfig);
          const result = await netplanAction('set_ip', testConfig);
          
          console.log('Netplan test result:', result);
          
          // netplanAction already returns a parsed object, not raw text
          if (result.error) {
   alert(`❌ Netplan test failed:\n${result.error}\n\nCheck console for details.`);
          } else {
            alert('✅ Netplan test successful!\n\nCheck /etc/netplan/99-cockpit.yaml for changes.');
            
            // Show current netplan content
            try {
              const netplanContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
              console.log('Current netplan content:', netplanContent);
            } catch (e) {
              console.warn('Could not read netplan file:', e);
            }
          }
        } catch (error) {
          console.error('Netplan test error:', error);
          alert(`❌ Netplan test failed: ${error}`);
        } finally {
          setStatus('Ready');
        }
      });
    }

    // Check netplan file status
    const btnCheckNetplan = $('#btn-check-netplan');
    if (btnCheckNetplan) {
      btnCheckNetplan.addEventListener('click', async () => {
        try {
          setStatus('Checking netplan file...');
          
          // Check if file exists and show its contents
          let fileExists = true;
          let fileContent = '';
          
          try {
            fileContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
          } catch (e) {
            fileExists = false;
            console.log('Netplan file does not exist:', e);
          }
          
          // Show file status
          let message = '';
          if (fileExists) {
            message = `✅ Netplan file exists at /etc/netplan/99-cockpit.yaml\n\n📄 Current contents:\n${fileContent}`;
          } else {
            message = '❌ Netplan file does not exist at /etc/netplan/99-cockpit.yaml\n\nThe file will be created when you first configure an IP address.';
          }
          
          alert(message);
          
          // Also check directory permissions
          try {
            const dirInfo = await run('ls', ['-la', '/etc/netplan/'], { superuser: 'try' });
            console.log('Netplan directory contents:', dirInfo);
          } catch (e) {
            console.warn('Could not list netplan directory:', e);
          }
          
        } catch (error) {
          alert(`❌ Failed to check netplan file: ${error}`);
        } finally {
          setStatus('Ready');
        }
      });
    }
    
    // Setup import/export config buttons
    const btnImportConfig = $('#btn-import-config');
    if (btnImportConfig) {
      btnImportConfig.addEventListener('click', async () => {
        // Create file input for importing
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.yaml,.yml,.json';
        input.style.display = 'none';
        
        input.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          try {
            setStatus('Importing configuration...');
            
            const content = await file.text();
            let config;
            
            // Try to parse as YAML first, then JSON
            try {
              // Simple YAML parsing (for basic netplan configs)
              if (file.name.endsWith('.json')) {
                config = JSON.parse(content);
                
                // Convert JSON to YAML-like structure for netplan
                if (config.network) {
                  config = content; // Keep as JSON for now, implement conversion later
                } else {
                  throw new Error('Invalid netplan JSON structure - missing "network" key');
                }
              } else {
                // For YAML, validate basic structure
                if (!content.includes('network:') && !content.includes('version:')) {
                  const addHeader = confirm('⚠️ This file doesn\'t appear to be a standard netplan configuration.\n\nWould you like to add a basic netplan header?');
                  if (addHeader) {
                    config = 'network:\n  version: 2\n  renderer: networkd\n\n' + content;
                  } else {
                    config = content;
                  }
                } else {
                  config = content;
                }
              }
            } catch (parseError) {
              throw new Error(`Failed to parse config file: ${parseError.message}`);
            }
            
            // Show preview and confirmation
            const proceed = confirm(`📤 Import Network Configuration?\n\nFile: ${file.name}\nSize: ${file.size} bytes\n\n⚠️ This will replace the current netplan configuration.\n\nProceed with import?`);
            
            if (!proceed) {
              setStatus('Import cancelled');
              return;
            }
            
            // Write the configuration
            if (typeof config === 'string') {
              // Direct YAML content
              await cockpit.spawn([
                'bash', '-c', `echo '${config.replace(/'/g, "'\\''")}' > /etc/netplan/99-cockpit.yaml`
              ], {
                superuser: 'require',
                err: 'out'
              });
            } else {
              // JSON config - convert to netplan action
              // This is a simplified approach - you might want to enhance this
              alert('⚠️ JSON import not fully implemented yet. Please use YAML format.');
              setStatus('Ready');
              return;
            }
            
            // Apply the configuration
            await run('netplan', ['apply'], { superuser: 'require' });
            
            alert('✅ Configuration imported and applied successfully!\n\nReloading interfaces...');
            await loadInterfaces();
            
          } catch (error) {
            console.error('Import failed:', error);
            alert(`❌ Failed to import configuration:\n${error.message || error}`);
          } finally {
            setStatus('Ready');
            document.body.removeChild(input);
          }
        });
        
        document.body.appendChild(input);
        input.click();
      });
    }

    const btnExportConfig = $('#btn-export-config');
    if (btnExportConfig) {
      btnExportConfig.addEventListener('click', async () => {
        try {
          setStatus('Exporting configuration...');
          
          // Show export options
          const exportType = await new Promise((resolve) => {
            const modal = document.createElement('dialog');
            modal.innerHTML = `
              <div class="modal-content">
                <h2>📥 Export Network Configuration</h2>
                <p>Choose what to export:</p>
                
                <div style="margin: 1rem 0;">
                  <label style="display: block; margin: 0.5rem 0;">
                    <input type="radio" name="export-type" value="cockpit" checked>
                    🎯 <strong>XOS Networking Config</strong> (99-cockpit.yaml only)
                  </label>
                  <label style="display: block; margin: 0.5rem 0;">
                    <input type="radio" name="export-type" value="all">
                    📋 <strong>All Netplan Files</strong> (entire /etc/netplan/ directory)
                  </label>
                  <label style="display: block; margin: 0.5rem 0;">
                    <input type="radio" name="export-type" value="current">
                    📊 <strong>Current Network State</strong> (live interface configuration)
                  </label>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                  <button type="button" class="btn" id="export-cancel">❌ Cancel</button>
                  <button type="button" class="btn primary" id="export-confirm">📥 Export</button>
                </div>
              </div>
            `;
            
            document.body.appendChild(modal);
            setupModal(modal);
            
            // Handle cancel button
            modal.querySelector('#export-cancel').addEventListener('click', () => {
              resolve(null);
              modal.close();
            });
            
            modal.querySelector('#export-confirm').addEventListener('click', () => {
              const selected = modal.querySelector('input[name="export-type"]:checked');
              resolve(selected ? selected.value : 'cockpit');
              modal.close();
            });
            
            modal.showModal();
          });
          
          if (!exportType) {
            setStatus('Ready');
            return;
          }
          
          let config = '';
          let filename = 'netplan-export.yaml';
          
          if (exportType === 'cockpit') {
            // Export only XOS Networking config
            try {
              config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
              filename = '99-cockpit.yaml';
            } catch (e) {
              config = '# No XOS Networking configuration found\n# Generated by XOS Networking\nnetwork:\n  version: 2\n  renderer: networkd\n';
              filename = '99-cockpit-empty.yaml';
            }
          } else if (exportType === 'all') {
            // Export all netplan files
            try {
              const allConfigs = await run('bash', ['-c', 'for f in /etc/netplan/*.yaml; do echo "# --- $f ---"; cat "$f" 2>/dev/null; echo; done'], { superuser: 'try' });
              config = allConfigs;
              filename = 'netplan-all-configs.yaml';
            } catch (e) {
              config = '# No netplan configuration found\n';
              filename = 'netplan-all-empty.yaml';
            }
          } else if (exportType === 'current') {
            // Export current network state
            try {
              const interfaces = await run('ip', ['-details', 'addr', 'show']);
              const routes = await run('ip', ['route']);
              const dns = await run('cat', ['/etc/resolv.conf']).catch(() => '# DNS info not available');
              
              config = `# Current Network State Export
# Generated by XOS Networking on ${new Date().toISOString()}
# This is NOT a netplan configuration file - it's a snapshot of current network state

# === INTERFACE INFORMATION ===
${interfaces}

# === ROUTING TABLE ===
${routes}

# === DNS CONFIGURATION ===
${dns}`;
              filename = 'network-state-snapshot.txt';
            } catch (e) {
              throw new Error('Failed to gather current network state: ' + e);
            }
          }
          
          // Add timestamp and metadata (except for current state which has its own header)
          if (exportType !== 'current') {
            const timestamp = new Date().toISOString();
            const header = `# Netplan Configuration Export
# Generated by XOS Networking on ${timestamp}
# Hostname: ${window.location.hostname}
# Export Type: ${exportType}

`;
            config = header + config;
          }
          
          // Create download
          const mimeType = filename.endsWith('.txt') ? 'text/plain' : 'text/yaml';
          const blob = new Blob([config], { type: mimeType });
          const url = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          alert(`✅ Configuration exported successfully!\n\n📄 File: ${filename}\n📊 Size: ${config.length} bytes\n📋 Type: ${exportType}`);
          
        } catch (error) {
          console.error('Export failed:', error);
          alert(`❌ Failed to export configuration:\n${error.message || error}`);
        } finally {
          setStatus('Ready');
        }
      });
    }

    const btnResetForms = $('#btn-reset-forms');
    if (btnResetForms) {
      btnResetForms.addEventListener('click', () => {
        // Reset all form fields
        const forms = ['vlan', 'br', 'bond'];
        forms.forEach(prefix => {
          // Reset text inputs
          const inputs = $$(`[id^="${prefix}-"]`);
          inputs.forEach(input => {
            if (input.tagName === 'INPUT') {
              if (input.type === 'text' || input.type === 'number') {
                input.value = '';
              }
            } else if (input.tagName === 'SELECT') {
              input.selectedIndex = 0;
              // Clear multi-select options
              if (input.multiple) {
                Array.from(input.options).forEach(opt => opt.selected = false);
              }
            }
          });
          
          // Clear output areas
          const output = $(`#${prefix}-out`);
          if (output) {
            output.textContent = '';
          }
        });
        
        alert('✅ All forms have been reset!');
      });
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
        const staticIp = $('#vlan-static-ip')?.value?.trim();
        const gateway = $('#vlan-gateway')?.value?.trim();
        const mtu = $('#vlan-mtu')?.value?.trim();
        
        if (!parent || !id) {
          alert('❌ Parent interface and VLAN ID are required!');
          return;
        }
        
        if (!id.match(/^\d+$/) || parseInt(id) < 1 || parseInt(id) > 4094) {
          alert('❌ VLAN ID must be between 1 and 4094!');
          return;
        }
        
        // Validate IP format if provided
        if (staticIp) {
          const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
          if (!ipRegex.test(staticIp)) {
            alert('❌ Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
            return;
          }
        }
        
        // Validate gateway format if provided
        if (gateway) {
          const gatewayRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
          if (!gatewayRegex.test(gateway)) {
            alert('❌ Invalid gateway address format!');
            return;
          }
        }
        
        try {
          setStatus('Creating VLAN...');
          
          // Step 1: Create VLAN interface
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
          
          // Step 2: Configure IP if provided
          if (staticIp) {
            console.log('Configuring IP for VLAN interface...');
            
            // Apply IP immediately
            try {
              await run('ip', ['addr', 'add', staticIp, 'dev', name], { superuser: 'require' });
              console.log(`Added IP ${staticIp} to VLAN ${name}`);
              
              // Add gateway if specified
              if (gateway) {
                await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', name], { superuser: 'require' });
                console.log(`Added gateway ${gateway} for VLAN ${name}`);
              }
            } catch (ipError) {
              console.warn('Failed to apply IP immediately:', ipError);
            }
            
            // Persist IP to netplan
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
            let successMsg = `✅ VLAN ${name} created successfully!`;
            if (staticIp) {
              successMsg += `\n📍 IP: ${staticIp}`;
            }
            if (gateway) {
              successMsg += `\n🚪 Gateway: ${gateway}`;
            }
            output.textContent = successMsg;
          }
          
          // Clear form
          $('#vlan-parent').selectedIndex = 0;
          $('#vlan-id').value = '';
          $('#vlan-name').value = '';
          if ($('#vlan-static-ip')) $('#vlan-static-ip').value = '';
          if ($('#vlan-gateway')) $('#vlan-gateway').value = '';
          if ($('#vlan-mtu')) $('#vlan-mtu').value = '';
          
          await loadInterfaces();
          
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
          alert('❌ At least two slave interfaces are required for bonding!');
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
  }

  // Enhanced netplan action function
  async function netplanAction(action, config) {
    console.log('netplanAction called with:', { action, config });
    const payload = JSON.stringify({ action, config });
    console.log('JSON payload to send:', payload);
    
    try {
      console.log('About to spawn netplan script...');
      
      // Use a more direct approach - create a temporary file and execute it
      const timestamp = Date.now();
      const tempFile = `/tmp/netplan-${timestamp}.json`;
      
      // Write payload to temp file first
      await cockpit.spawn([
        'bash', '-c', `echo '${payload.replace(/'/g, "'\\''")}' > ${tempFile}`
      ], {
        superuser: 'require',
        err: 'out'
      });
      
      // Execute the python script with the temp file
      const result = await cockpit.spawn([
        'bash', '-c', `cd /usr/share/cockpit/xos-networking && cat ${tempFile} | python3 netplan_manager.py 2>&1; rm -f ${tempFile}`
      ], {
        superuser: 'require',
        err: 'out'
      });
      
      console.log('Netplan script raw output:', result);
      const cleanResult = result.trim();
      console.log('Cleaned result:', cleanResult);
      
      // Look for JSON response - it should be the last line starting with {
      const lines = cleanResult.split('\n');
      let jsonLine = null;
      
      // Find the last line that looks like JSON
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.includes('result')) {
          jsonLine = line;
          break;
        }
      }
      
      if (jsonLine) {
        try {
          const parsed = JSON.parse(jsonLine);
          console.log('Netplan script parsed output:', parsed);
          return parsed;
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          return { error: `Failed to parse response: ${jsonLine}` };
        }
      } else {
        // Look for error JSON
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line.startsWith('{') && line.includes('error')) {
            try {
              const parsed = JSON.parse(line);
              console.log('Netplan script error output:', parsed);
              return parsed;
            } catch (parseError) {
              // Continue looking
            }
          }
        }
        return { error: 'No valid JSON response found in output', debug_output: cleanResult };
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
      return { error: errorMsg, debug_info: e.toString() };
    }
  }

  // Main initialization
  async function initialize() {
    console.log('Initializing XOS Networking...');
    
    try {
      console.log('Waiting for ready state...');
      await waitForReady();
      console.log('Ready state achieved');
      
      setStatus('Initializing...');
      
      // Ensure DOM is fully loaded
      console.log('Checking DOM elements...');
      const tableBody = $('#table-interfaces tbody');
      if (!tableBody) {
        console.warn('Interface table body not found, waiting...');
        // Wait a bit more for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Setup UI components
      console.log('Setting up tabs...');
      setupTabs();
      
      console.log('Setting up event handlers...');
      setupEventHandlers();
      
      console.log('Setting up networking forms...');
      await setupNetworkingForms();
      
      // Load initial data with more robust error handling
      console.log('Loading initial data...');
      setStatus('Loading data...');
      
      try {
        console.log('Loading interfaces...');
        await loadInterfaces();
        console.log('Interfaces loaded successfully');
      } catch (error) {
        console.error('Failed to load interfaces:', error);
        setStatus('Failed to load interfaces: ' + error);
        
        // Try again after a delay
        setTimeout(async () => {
          console.log('Retrying interface load...');
          try {
            await loadInterfaces();
          } catch (retryError) {
            console.error('Retry failed:', retryError);
          }
        }, 2000);
      }
      
      try {
        console.log('Loading connections...');
        await loadConnections();
        console.log('Connections loaded successfully');
      } catch (error) {
        console.warn('Failed to load connections:', error);
        // Don't fail initialization for connections
      }
      
      try {
        console.log('Loading diagnostics...');
        await loadDiagnostics();
        console.log('Diagnostics loaded successfully');
      } catch (error) {
        console.warn('Failed to load diagnostics:', error);
        // Don't fail initialization for diagnostics
      }
      
      setStatus('Ready');
      console.log('XOS Networking initialized successfully');
      
      // Set a flag to indicate successful initialization
      window.xosNetworkingReady = true;
      
    } catch (e) {
      console.error('Initialization failed:', e);
      setStatus('Initialization failed: ' + e);
      
      // Try to initialize again after a delay
      setTimeout(() => {
        console.log('Retrying initialization...');
        initialize();
      }, 3000);
    }
  }

  // Start the application
  initialize();

})();
