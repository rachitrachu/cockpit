'use strict';
/* global createButton, createStatusBadge, netplanAction, run, setStatus, setupModal, $, $$ */

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

    interfaces.forEach(iface => {
      const row = document.createElement('tr');

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
        const modal = document.createElement('dialog');
        modal.style.maxWidth = '650px';
        modal.innerHTML = `
          <div class="modal-content">
            <h2>?? Set IP Address for ${iface.dev}</h2>
            <form id="set-ip-form">
              <label>?? Current IPv4 Address
                <input type="text" value="${iface.ipv4 || 'None assigned'}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              </label>
              <label>?? New IPv4 Address/CIDR
                <input type="text" id="new-ip-addr" placeholder="192.168.1.100/24" required 
                       pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$"
                       value="${iface.ipv4 || ''}" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Use CIDR notation (e.g., 192.168.1.100/24)</small>
              </label>
              <label>?? Gateway (optional)
                <input type="text" id="new-gateway" placeholder="192.168.1.1"
                       pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$" 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Default gateway for this interface</small>
              </label>
              <label>?? DNS Servers (optional, comma separated)
                <input type="text" id="new-dns" placeholder="8.8.8.8,1.1.1.1" 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Comma separated list of DNS servers</small>
              </label>
              <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
                <label style="display: flex; align-items: flex-start; gap: 0.5rem; margin: 0;">
                  <input type="checkbox" id="persist-ip-config" checked style="margin-top: 0.25rem;">
                  <div>
                    <strong>?? Persist configuration to netplan (recommended)</strong>
                    <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">
                      When enabled, configuration survives reboots. When disabled, changes are temporary.
                    </small>
                  </div>
                </label>
              </div>
              <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                <strong>?? Note:</strong> This will replace any existing IP configuration for this interface.
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <button type="button" class="btn" id="cancel-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">? Cancel</button>
                <button type="button" class="btn primary" id="apply-ip-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">?? Apply Configuration</button>
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
            alert('? IP address is required!');
            modal.querySelector('#new-ip-addr').focus();
            return;
          }

          const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
          if (!ipRegex.test(newIp)) {
            alert('? Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
            modal.querySelector('#new-ip-addr').focus();
            return;
          }

          if (gateway && !/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(gateway)) {
            alert('? Invalid gateway address format!');
            modal.querySelector('#new-gateway').focus();
            return;
          }

          try {
            setStatus('Configuring IP address...');

            try {
              if (iface.ipv4) {
                try {
                  await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
                  console.log(`Removed old IP ${iface.ipv4} from ${iface.dev}`);
                } catch (e) {
                  console.warn('Could not remove old IP (may not exist):', e);
                }
              }

              await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
              console.log(`Added new IP ${newIp} to ${iface.dev}`);

              if (gateway) {
                try {
                  await run('ip', ['route', 'del', 'default', 'dev', iface.dev], { superuser: 'require' });
                } catch (e) {
                }
                await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', iface.dev], { superuser: 'require' });
                console.log(`Added gateway ${gateway} for ${iface.dev}`);
              }

            } catch (error) {
              throw new Error(`Failed to apply IP configuration: ${error}`);
            }

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
                  alert(`?? IP configured successfully, but netplan persistence failed:\n${result.error}\n\nThe IP is set but may not survive a reboot.`);
                } else {
                  console.log('Successfully persisted to netplan');
                  alert(`? IP address configured and persisted successfully!\n\n?? Address: ${newIp}\n${gateway ? `?? Gateway: ${gateway}\n` : ''}${dns ? `?? DNS: ${dns}\n` : ''}?? Configuration saved to netplan`);
                }
              } catch (error) {
                console.error('Netplan persistence error:', error);
                alert(`?? IP configured successfully, but netplan persistence failed:\n${error}\n\nThe IP is set but may not survive a reboot.`);
              }
            } else {
              alert(`? IP address configured successfully!\n\n?? Address: ${newIp}\n${gateway ? `?? Gateway: ${gateway}\n` : ''}?? Note: Configuration is temporary and will be lost after reboot.`);
            }

            modal.close();
            setStatus('? IP configuration applied');
            setTimeout(() => setStatus('Ready'), 3000);
            await loadInterfaces();

          } catch (error) {
            console.error('IP configuration error:', error);
            alert(`? Failed to set IP address: ${error.message || error}`);
            setStatus('? IP configuration failed');
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
            <h2>?? Set MTU for ${iface.dev}</h2>
            <form id="set-mtu-form">
              <label>?? Current MTU
                <input type="text" value="${iface.mtu || 'Unknown'}" readonly style="background: #f5f5f5; color: #666; width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
              </label>
              <label>?? New MTU Value
                <input type="number" id="new-mtu-value" min="68" max="9000" value="${iface.mtu || '1500'}" required 
                       style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem;">
                <small style="color: var(--muted-color); font-size: 0.875rem; display: block; margin-top: 0.25rem;">Valid range: 68 - 9000 bytes</small>
              </label>
              <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
                <label style="display: flex; align-items: flex-start; gap: 0.5rem; margin: 0;">
                  <input type="checkbox" id="persist-mtu-config" checked>
                  ?? <strong>Persist configuration to netplan (recommended)
                </label>
                <small style="color: var(--muted-color); font-size: 0.875rem; margin-left: 1.5rem;">
                  When enabled, configuration survives reboots. When disabled, changes are temporary.
                </small>
              </div>
              <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                <strong>?? Note:</strong> Changing MTU may temporarily disrupt network connectivity on this interface.
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <button type="button" class="btn" id="cancel-mtu-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">? Cancel</button>
                <button type="button" class="btn primary" id="apply-mtu-config" style="min-width: 120px; padding: 0.75rem 1.25rem;">?? Apply MTU</button>
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
            alert('? MTU must be between 68 and 9000!');
            modal.querySelector('#new-mtu-value').focus();
            return;
          }

          if (iface.mtu && parseInt(iface.mtu) === newMtu) {
            alert(`?? MTU is already set to ${newMtu}`);
            modal.close();
            return;
          }

          try {
            setStatus('Setting MTU...');

            await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu.toString()], { superuser: 'require' });
            console.log(`Set MTU ${newMtu} on ${iface.dev}`);

            if (persist) {
              console.log('Persisting MTU configuration to netplan...');
              try {
                const result = await netplanAction('set_mtu', { name: iface.dev, mtu: newMtu });

                if (result.error) {
                  console.warn('Netplan persistence failed:', result.error);
                  alert(`?? MTU set successfully, but netplan persistence failed:\n${result.error}\n\nThe MTU is set but may not survive a reboot.`);
                } else {
                  console.log('Successfully persisted MTU to netplan');
                  alert(`? MTU configured and persisted successfully!\n\n?? MTU: ${newMtu} bytes\n?? Configuration saved to netplan`);
                }
              } catch (error) {
                console.error('Netplan persistence error:', error);
                alert(`?? MTU set successfully, but netplan persistence failed:\n${error}\n\nThe MTU is set but may not survive a reboot.`);
              }
            } else {
              alert(`? MTU configured successfully!\n\n?? MTU: ${newMtu} bytes\n?? Note: Configuration is temporary and will be lost after reboot.`);
            }

            modal.close();
            setStatus('? MTU configuration applied');
            setTimeout(() => setStatus('Ready'), 3000);
            await loadInterfaces();

          } catch (error) {
            console.error('MTU configuration error:', error);
            alert(`? Failed to set MTU: ${error.message || error}`);
            setStatus('? MTU configuration failed');
            setTimeout(() => setStatus('Ready'), 3000);
          }
        });

        modal.showModal();
      });

      // Note: Editing constructs (bond/vlan/bridge) handled in constructs.js

      actionsCell.appendChild(btnUp);
      actionsCell.appendChild(btnDown);
      actionsCell.appendChild(btnSetIP);
      actionsCell.appendChild(btnSetMTU);
      actionsCell.appendChild(btnInfo);

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

// expose
window.getPhysicalInterfaces = getPhysicalInterfaces;
window.loadInterfaces = loadInterfaces;
