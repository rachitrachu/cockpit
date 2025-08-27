'use strict';
/* global createButton, createStatusBadge, netplanAction, run, setStatus, setupModal, addAdvancedInterfaceActions, $, $$ */

async function getPhysicalInterfaces() {
  try {
    const output = await run('ip', ['-o', 'link', 'show']);
    const interfaces = [];

    output.split('\n').forEach(line => {
      const match = line.match(/^\d+:\s+([^:]+):/);
      if (match) {
        const dev = match[1].trim();
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

    const interfaces = [];
    const blocks = output.split(/\n(?=\d+: )/);
    console.log('Processing', blocks.length, 'interface blocks');

    for (const block of blocks) {
      if (!block.trim()) continue;

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

    tbody.innerHTML = '';

    if (interfaces.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="8" style="text-align: center; padding: 2rem;">No network interfaces found</td>';
      tbody.appendChild(row);
      setStatus('No interfaces found');
      return;
    }

    interfaces.sort((a, b) => a.dev.localeCompare(b.dev));

    for (const iface of interfaces) {
      const row = document.createElement('tr');

      const actionsCell = document.createElement('td');
      actionsCell.className = 'actions';

      const btnUp = createButton('Up', async () => {
        await run('ip', ['link', 'set', iface.dev, 'up'], { superuser: 'require' });
        await loadInterfaces();
      });

      const btnDown = createButton('Down', async () => {
        // Check if interface is critical before allowing it to be brought down
        const isCritical = checkIfInterfaceCritical(iface);
        
        if (isCritical.critical) {
          // Show critical interface warning before proceeding
          const confirmationResult = await showCriticalInterfaceDownConfirmation(iface, isCritical);
          if (!confirmationResult) {
            return; // User cancelled or didn't type confirmation correctly
          }
        } else if (iface.state === 'UP') {
          // Show simple warning for non-critical UP interfaces
          const confirmMessage = `📉 Bring Down Interface ${iface.dev}?\n\n` +
                               `Current Status: ${iface.state}\n` +
                               `${iface.ipv4 ? `IP Address: ${iface.ipv4}\n` : ''}` +
                               `\nThis will temporarily disable network connectivity on this interface.\n\n` +
                               `Are you sure you want to bring it down?`;
          
          if (!confirm(confirmMessage)) {
            return;
          }
        }

        try {
          await run('ip', ['link', 'set', iface.dev, 'down'], { superuser: 'require' });
          await loadInterfaces();
        } catch (error) {
          alert(`❌ Failed to bring down interface ${iface.dev}: ${error}`);
        }
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
        // Check if interface is critical before allowing IP changes
        const isCritical = checkIfInterfaceCritical(iface);
        
        if (isCritical.critical) {
          // Show critical interface warning before proceeding
          const confirmationResult = await showCriticalIPChangeConfirmation(iface, isCritical);
          if (!confirmationResult) {
            return; // User cancelled or didn't type confirmation correctly
          }
        }

        const modal = document.createElement('dialog');
        modal.style.maxWidth = '650px';
        modal.innerHTML = `
          <div class="modal-content">
            <h2>🌐 Set IP Address for ${iface.dev}</h2>
            <form id="set-ip-form">
              <label>📍 Current IPv4 Address
                <input type="text" value="${iface.ipv4 || 'None assigned'}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              </label>
              <label>🆕 New IPv4 Address/CIDR
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
              ${isCritical.critical ? `
              <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: var(--border-radius);">
                <strong>⚠️ CRITICAL INTERFACE WARNING:</strong> You are modifying a critical interface that ${isCritical.reasons.join(' and ')}.
                <br><small>Changes may affect network connectivity. Ensure you have alternative access before proceeding.</small>
              </div>
              ` : `
              <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                <strong>⚠️ Note:</strong> This will replace any existing IP configuration for this interface.
              </div>
              `}
              <div style="margin: 1rem 0; padding: 1rem; background: #d4edda; border-radius: var(--border-radius); border: 1px solid #c3e6cb;">
                <strong>🔍 Debugging:</strong> Check browser console (F12) for detailed logging during IP configuration process.
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <button type="button" class="btn" id="cancel-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">❌ Cancel</button>
                <button type="button" class="btn ${isCritical.critical ? 'btn-warning' : 'primary'}" id="apply-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">⚡ Apply Configuration</button>
              </div>
            </form>
          </div>
        `;

        document.body.appendChild(modal);
        setupModal(modal);

        modal.querySelector('#cancel-ip-config').addEventListener('click', () => {
          modal.close();
        });

        modal.querySelector('#apply-ip-config').addEventListener('click', async () => {
          const newIp = modal.querySelector('#new-ip-addr').value.trim();
          const gateway = modal.querySelector('#new-gateway').value.trim();
          const dns = modal.querySelector('#new-dns').value.trim();
          const persist = modal.querySelector('#persist-ip-config').checked;

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
            
            // Step 1: Ensure interface is UP before configuring IP
            console.log(`🔍 Checking interface ${iface.dev} status before IP configuration`);
            try {
              if (iface.state !== 'UP') {
                console.log(`📈 Interface ${iface.dev} is ${iface.state}, bringing it UP first`);
                await run('ip', ['link', 'set', iface.dev, 'up'], { superuser: 'require' });
                console.log(`✅ Interface ${iface.dev} brought UP successfully`);
                
                // Wait a moment for interface to come up
                await new Promise(resolve => setTimeout(resolve, 1000));
              } else {
                console.log(`✅ Interface ${iface.dev} is already UP`);
              }
            } catch (upError) {
              console.warn(`⚠️ Could not bring interface UP: ${upError}`);
              // Continue anyway, might still work
            }

            // Step 2: Remove old IP if exists
            if (iface.ipv4) {
              try {
                console.log(`🗑️ Removing old IP ${iface.ipv4} from ${iface.dev}`);
                await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
                console.log(`✅ Removed old IP ${iface.ipv4} from ${iface.dev}`);
              } catch (e) {
                console.warn('⚠️ Could not remove old IP (may not exist):', e);
                // Continue anyway, might not exist
              }
            }

            // Step 3: Add new IP address
            try {
              console.log(`➕ Adding new IP ${newIp} to ${iface.dev}`);
              await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
              console.log(`✅ Added new IP ${newIp} to ${iface.dev}`);
            } catch (ipError) {
              console.error('❌ Failed to add IP address:', ipError);
              throw new Error(`Failed to add IP address ${newIp}: ${ipError.message || ipError}`);
            }

            // Step 4: Configure gateway if provided
            if (gateway) {
              try {
                console.log(`🚪 Configuring gateway ${gateway} for ${iface.dev}`);
                
                // Try to remove any existing default route for this interface
                try {
                  await run('ip', ['route', 'del', 'default', 'dev', iface.dev], { superuser: 'require' });
                  console.log(`🗑️ Removed existing default route for ${iface.dev}`);
                } catch (e) {
                  console.log('ℹ️ No existing default route to remove (this is fine)');
                }
                
                // Add new default route
                await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', iface.dev], { superuser: 'require' });
                console.log(`✅ Added gateway ${gateway} for ${iface.dev}`);
              } catch (gwError) {
                console.warn('⚠️ Failed to configure gateway:', gwError);
                // Don't fail the entire operation for gateway issues
              }
            }

            // Step 5: Verify the IP was actually set
            try {
              console.log(`🔍 Verifying IP configuration was applied`);
              const verifyResult = await run('ip', ['addr', 'show', iface.dev], { superuser: 'try' });
              console.log(`📋 Current interface status:\n${verifyResult}`);
              
              if (!verifyResult.includes(newIp.split('/')[0])) {
                throw new Error(`IP address ${newIp} does not appear to be configured on ${iface.dev}`);
              }
              console.log(`✅ Verified IP ${newIp} is configured on ${iface.dev}`);
            } catch (verifyError) {
              console.warn('⚠️ Could not verify IP configuration:', verifyError);
              // Continue anyway, the set might have worked
            }

            if (persist) {
              console.log('💾 Persisting IP configuration to netplan...');
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

                console.log('📤 Sending netplan config:', netplanConfig);
                const result = await netplanAction('set_ip', netplanConfig);
                console.log('📥 Netplan result:', result);

                if (result.error) {
                  console.warn('❌ Netplan persistence failed:', result.error);
                  alert(`⚠️ IP configured successfully, but netplan persistence failed:\n${result.error}\n\nThe IP is set but may not survive a reboot.`);
                } else {
                  console.log('✅ Successfully persisted to netplan');
                  alert(`✅ IP address configured and persisted successfully!\n\n📍 Address: ${newIp}\n${gateway ? `🚪 Gateway: ${gateway}\n` : ''}${dns ? `🌐 DNS: ${dns}\n` : ''}💾 Configuration saved to netplan`);
                }
              } catch (error) {
                console.error('💥 Netplan persistence error:', error);
                alert(`⚠️ IP configured successfully, but netplan persistence failed:\n${error}\n\nThe IP is set but may not survive a reboot.`);
              }
            } else {
              alert(`✅ IP address configured successfully!\n\n📍 Address: ${newIp}\n${gateway ? `🚪 Gateway: ${gateway}\n` : ''}⚠️ Note: Configuration is temporary and will be lost after reboot.`);
            }

            modal.close();
            setStatus('✅ IP configuration applied');
            setTimeout(() => setStatus('Ready'), 3000);
            await loadInterfaces();

          } catch (error) {
            console.error('💥 IP configuration error:', error);
            alert(`❌ Failed to set IP address: ${error.message || error}`);
            setStatus('❌ IP configuration failed');
            setTimeout(() => setStatus('Ready'), 3000);
          }
        });

        modal.showModal();
      });

      const btnSetMTU = createButton('Set MTU', async () => {
        const modal = document.createElement('dialog');
        modal.style.maxWidth = '550px';
        modal.innerHTML = `
          <div class="modal-content">
            <h2>📏 Set MTU for ${iface.dev}</h2>
            <form id="set-mtu-form">
              <label>📊 Current MTU
                <input type="text" value="${iface.mtu || 'Unknown'}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              </label>
              <label>🆕 New MTU Value
                <input type="number" id="new-mtu-value" min="68" max="9000" value="${iface.mtu || '1500'}" required 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Valid range: 68 - 9000 bytes</small>
              </label>
              <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
                <label style="display: flex; align-items: flex-start; gap: 0.5rem; margin: 0;">
                  <input type="checkbox" id="persist-mtu-config" checked>
                  💾 <strong>Persist configuration to netplan (recommended)</strong>
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
                <button type="button" class="btn primary" id="apply-mtu-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">⚡ Apply MTU</button>
              </div>
            </form>
          </div>
        `;

        document.body.appendChild(modal);
        setupModal(modal);

        modal.querySelector('#cancel-mtu-config').addEventListener('click', () => {
          modal.close();
        });

        modal.querySelector('#apply-mtu-config').addEventListener('click', async () => {
          const newMtu = parseInt(modal.querySelector('#new-mtu-value').value);
          const persist = modal.querySelector('#persist-mtu-config').checked;

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
            setStatus('Setting MTU...' );

            await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu.toString()], { superuser: 'require' });
            console.log(`Set MTU ${newMtu} on ${iface.dev}`);

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
            await loadInterfaces();

          } catch (error) {
            console.error('MTU configuration error:', error);
            alert(`❌ Failed to set MTU: ${error.message || error}`);
            setStatus('❌ MTU configuration failed');
            setTimeout(() => setStatus('Ready'), 3000);
          }
        });

        modal.showModal();
      });

      actionsCell.appendChild(btnUp);
      actionsCell.appendChild(btnDown);
      actionsCell.appendChild(btnSetIP);
      actionsCell.appendChild(btnSetMTU);
      actionsCell.appendChild(btnInfo);

      // Add advanced actions for constructed interfaces (VLAN, Bridge, Bond)
      if (typeof addAdvancedInterfaceActions === 'function') {
        await addAdvancedInterfaceActions(iface, actionsCell);
      }

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
    }

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

// Helper function to check if interface is critical (imported from advanced-actions.js logic)
function checkIfInterfaceCritical(iface) {
  const reasons = [];
  let critical = false;

  // Check for public IP (not private ranges)
  if (iface.ipv4) {
    const ip = iface.ipv4.split('/')[0]; // Remove CIDR notation
    if (!isPrivateIP(ip)) {
      reasons.push(`has public IP address ${iface.ipv4}`);
      critical = true;
    }
  }

  // Check if it has a gateway configured (might be default route)
  if (iface.ipv4 && (iface.ipv4.includes('192.168.1.') || iface.ipv4.includes('10.0.0.') || iface.ipv4.includes('172.'))) {
    reasons.push('may be used for default gateway');
    critical = true;
  }

  // Check for specific critical interface names
  const criticalNames = ['br0', 'bond0', 'eth0', 'eno1', 'enp0s3'];
  if (criticalNames.some(name => iface.dev.toLowerCase().includes(name.toLowerCase()))) {
    reasons.push('is a primary network interface');
    critical = true;
  }

  // Check if interface is UP and has traffic (high usage interfaces)
  if (iface.state === 'UP' && iface.ipv4) {
    reasons.push('is currently active with IP configuration');
    critical = true;
  }

  return { critical, reasons };
}

// Helper function to check if IP is private
function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true;
  
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  return false;
}

// Critical IP change confirmation dialog
async function showCriticalIPChangeConfirmation(iface, criticalInfo) {
  return new Promise((resolve) => {
    const modal = document.createElement('dialog');
    modal.style.maxWidth = '700px';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>⚠️ Change IP Address on Critical Interface</h2>
        <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px;">
          <div style="display: flex; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 2rem; margin-right: 0.5rem;">🚨</span>
            <strong style="color: #856404;">WARNING: You are about to modify a critical network interface!</strong>
          </div>
          <div style="color: #856404;">
            <p><strong>Interface:</strong> <code>${iface.dev}</code></p>
            <p><strong>Current IP:</strong> <code>${iface.ipv4 || 'None'}</code></p>
            <p><strong>Status:</strong> <code>${iface.state}</code></p>
            <p><strong>Critical because it:</strong></p>
            <ul style="margin: 0.5rem 0; padding-left: 2rem;">
              ${criticalInfo.reasons.map(reason => `<li>${reason}</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <div style="margin: 1rem 0; padding: 1rem; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
          <strong style="color: #721c24;">⚠️ Changing the IP address on this interface may:</strong>
          <ul style="color: #721c24; margin: 0.5rem 0; padding-left: 2rem;">
            <li>Cause immediate loss of network connectivity</li>
            <li>Make the system unreachable via current IP address</li>
            <li>Disrupt SSH sessions and remote management</li>
            <li>Affect services depending on this interface</li>
            <li>Require console/physical access to restore connectivity</li>
          </ul>
        </div>

        <div style="margin: 1.5rem 0; padding: 1rem; border: 2px dashed #dc3545; border-radius: 4px;">
          <label style="font-weight: 600; color: #dc3545; display: block; margin-bottom: 0.5rem;">
            🔒 Type "CHANGE IP" to confirm you understand the risks:
          </label>
          <input 
            type="text" 
            id="ip-change-confirmation-input" 
            placeholder="Enter: CHANGE IP" 
            style="width: 100%; padding: 0.75rem; font-family: monospace; font-size: 1rem; border: 2px solid #dc3545; border-radius: 4px; text-transform: uppercase;"
            autocomplete="off"
            spellcheck="false"
          >
          <small style="color: #6c757d; display: block; margin-top: 0.25rem;">
            You must type exactly: <code>CHANGE IP</code>
          </small>
        </div>

        <div style="margin: 1rem 0; padding: 1rem; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px;">
          <strong style="color: #0c5460;">💡 Safety Recommendations:</strong>
          <ul style="color: #0c5460; margin: 0.5rem 0; padding-left: 2rem;">
            <li><strong>Have console/KVM access</strong> available before proceeding</li>
            <li><strong>Verify the new IP</strong> is correct and reachable</li>
            <li><strong>Check gateway settings</strong> match your network</li>
            <li><strong>Consider temporary changes first</strong> (uncheck persist option)</li>
            <li><strong>Have a rollback plan</strong> ready</li>
          </ul>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
          <button type="button" class="btn" id="cancel-critical-ip-change" style="min-width: 120px; padding: 0.75rem 1.25rem;">
            ❌ Cancel
          </button>
          <button type="button" class="btn btn-warning" id="confirm-critical-ip-change" style="min-width: 120px; padding: 0.75rem 1.25rem;" disabled>
            ⚠️ Proceed with IP Change
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModal(modal);

    const confirmInput = modal.querySelector('#ip-change-confirmation-input');
    const confirmButton = modal.querySelector('#confirm-critical-ip-change');
    const cancelButton = modal.querySelector('#cancel-critical-ip-change');

    // Enable/disable confirm button based on input
    confirmInput.addEventListener('input', () => {
      const inputValue = confirmInput.value.trim().toUpperCase();
      const isValid = inputValue === 'CHANGE IP';
      confirmButton.disabled = !isValid;
      
      if (isValid) {
        confirmButton.style.backgroundColor = '#ffc107';
        confirmButton.style.borderColor = '#ffc107';
        confirmButton.style.color = '#212529';
      } else {
        confirmButton.style.backgroundColor = '#6c757d';
        confirmButton.style.borderColor = '#6c757d';
        confirmButton.style.color = '#ffffff';
      }
    });

    // Handle Enter key in input
    confirmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmButton.disabled) {
        confirmButton.click();
      }
    });

    cancelButton.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    confirmButton.addEventListener('click', () => {
      if (confirmInput.value.trim().toUpperCase() === 'CHANGE IP') {
        modal.close();
        resolve(true);
      }
    });

    modal.addEventListener('close', () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    });

    modal.showModal();
    confirmInput.focus();
  });
}

// Critical interface down confirmation dialog
async function showCriticalInterfaceDownConfirmation(iface, criticalInfo) {
  return new Promise((resolve) => {
    const modal = document.createElement('dialog');
    modal.style.maxWidth = '650px';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>⚠️ Bring Down Critical Interface</h2>
        <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px;">
          <div style="display: flex; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 2rem; margin-right: 0.5rem;">🚨</span>
            <strong style="color: #856404;">WARNING: You are about to disable a critical network interface!</strong>
          </div>
          <div style="color: #856404;">
            <p><strong>Interface:</strong> <code>${iface.dev}</code></p>
            <p><strong>Current IP:</strong> <code>${iface.ipv4 || 'None'}</code></p>
            <p><strong>Current Status:</strong> <code>${iface.state}</code></p>
            <p><strong>Critical because it:</strong></p>
            <ul style="margin: 0.5rem 0; padding-left: 2rem;">
              ${criticalInfo.reasons.map(reason => `<li>${reason}</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <div style="margin: 1rem 0; padding: 1rem; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
          <strong style="color: #721c24;">⚠️ Bringing down this interface will:</strong>
          <ul style="color: #721c24; margin: 0.5rem 0; padding-left: 2rem;">
            <li>Immediately disconnect all network traffic on this interface</li>
            <li>Make the system unreachable via this IP address</li>
            <li>Terminate active SSH sessions and connections</li>
            <li>Disrupt services and applications using this interface</li>
            <li>May require console/physical access to bring it back up</li>
            <li>Could isolate the system if this is the primary network path</li>
          </ul>
        </div>

        <div style="margin: 1.5rem 0; padding: 1rem; border: 2px dashed #dc3545; border-radius: 4px;">
          <label style="font-weight: 600; color: #dc3545; display: block; margin-bottom: 0.5rem;">
            🔒 Type "BRING DOWN" to confirm you understand the risks:
          </label>
          <input 
            type="text" 
            id="interface-down-confirmation-input" 
            placeholder="Enter: BRING DOWN" 
            style="width: 100%; padding: 0.75rem; font-family: monospace; font-size: 1rem; border: 2px solid #dc3545; border-radius: 4px; text-transform: uppercase;"
            autocomplete="off"
            spellcheck="false"
          >
          <small style="color: #6c757d; display: block; margin-top: 0.25rem;">
            You must type exactly: <code>BRING DOWN</code>
          </small>
        </div>

        <div style="margin: 1rem 0; padding: 1rem; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px;">
          <strong style="color: #0c5460;">💡 Before Proceeding:</strong>
          <ul style="color: #0c5460; margin: 0.5rem 0; padding-left: 2rem;">
            <li><strong>Ensure console/KVM access</strong> is available</li>
            <li><strong>Verify alternative network paths</strong> exist</li>
            <li><strong>Consider the timing</strong> - avoid during critical operations</li>
            <li><strong>Notify users/services</strong> that may be affected</li>
            <li><strong>Have a recovery plan</strong> ready</li>
          </ul>
        </div>

        <div style="margin: 1rem 0; padding: 1rem; background: #e2e3e5; border: 1px solid #d6d8db; border-radius: 4px;">
          <strong style="color: #383d41;">ℹ️ Alternative Options:</strong>
          <ul style="color: #383d41; margin: 0.5rem 0; padding-left: 2rem;">
            <li>Consider temporarily removing IP addresses instead</li>
            <li>Check if you can modify interface settings without bringing it down</li>
            <li>Test the operation during a maintenance window</li>
          </ul>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
          <button type="button" class="btn" id="cancel-critical-interface-down" style="min-width: 120px; padding: 0.75rem 1.25rem;">
            ❌ Cancel
          </button>
          <button type="button" class="btn btn-warning" id="confirm-critical-interface-down" style="min-width: 120px; padding: 0.75rem 1.25rem;" disabled>
            📉 Bring Interface Down
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModal(modal);

    const confirmInput = modal.querySelector('#interface-down-confirmation-input');
    const confirmButton = modal.querySelector('#confirm-critical-interface-down');
    const cancelButton = modal.querySelector('#cancel-critical-interface-down');

    // Enable/disable confirm button based on input
    confirmInput.addEventListener('input', () => {
      const inputValue = confirmInput.value.trim().toUpperCase();
      const isValid = inputValue === 'BRING DOWN';
      confirmButton.disabled = !isValid;
      
      if (isValid) {
        confirmButton.style.backgroundColor = '#ffc107';
        confirmButton.style.borderColor = '#ffc107';
        confirmButton.style.color = '#212529';
      } else {
        confirmButton.style.backgroundColor = '#6c757d';
        confirmButton.style.borderColor = '#6c757d';
        confirmButton.style.color = '#ffffff';
      }
    });

    // Handle Enter key in input
    confirmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmButton.disabled) {
        confirmButton.click();
      }
    });

    cancelButton.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    confirmButton.addEventListener('click', () => {
      if (confirmInput.value.trim().toUpperCase() === 'BRING DOWN') {
        modal.close();
        resolve(true);
      }
    });

    modal.addEventListener('close', () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    });

    modal.showModal();
    confirmInput.focus();
  });
}

// expose
window.getPhysicalInterfaces = getPhysicalInterfaces;
window.loadInterfaces = loadInterfaces;
