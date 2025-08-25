/* global cockpit */
(() => {
  'use strict';
  // Using systemd-networkd and networkctl only
  const $  = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));
  const statusEl = $('#status');

  function setStatus(msg) { 
    statusEl.textContent = msg || 'Ready'; 
    // Add visual feedback
    if (msg) {
      statusEl.style.color = 'var(--primary-color)';
      statusEl.style.fontWeight = '600';
    } else {
      statusEl.style.color = '';
      statusEl.style.fontWeight = '';
    }
  }

  // spawn wrapper: default to non-blocking privilege behavior
  async function run(cmd, args = [], opts = {}) {
    const proc = cockpit.spawn([cmd, ...args], {
      superuser: "try",     // don't force polkit for read ops; write ops still escalate as needed
      err: "out",
      ...opts
    });
    let out = "";
    proc.stream(d => out += d);
    try {
      await proc;
      return out.trim();
    } catch (e) {
      // surface errors in UI and rethrow for caller to handle
      console.error(`spawn failed: ${cmd} ${args.join(' ')}`, e, out);
      throw (out || e).toString();
    }
  }

  function td(text) { const e = document.createElement('td'); e.textContent = text; return e; }
  function tdEl(el) { const e = document.createElement('td'); e.appendChild(el); return e; }
  function btn(label, handler) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'btn';
    b.addEventListener('click', async (e) => {
      try { 
        // Add loading state
        const originalText = b.textContent;
        b.disabled = true;
        b.textContent = 'Loading...';
        setStatus(`${label}…`); 
        
        await handler(); 
      }
      catch (e) { 
        alert(`${label} failed:\n${e}`);
        console.error(`${label} failed:`, e);
      }
      finally { 
        // Restore button state
        b.disabled = false;
        b.textContent = b.textContent === 'Loading...' ? label : b.textContent;
        setStatus(''); 
      }
    });
    return b;
  }
  function stateBadge(state) {
    const span = document.createElement('span');
    const s = (state || 'unknown').toUpperCase();
    span.className = 'badge ' + (s === 'CONNECTED' || s === 'UP' ? 'state-up'
                      : s === 'DISCONNECTED' || s === 'DOWN' ? 'state-down'
                      : 'state-unknown');
    span.textContent = s;
    return span;
  }

  // -------- Tabs --------
  function setActiveTab(id) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + id));
  }
  $$('.tab').forEach(btn => btn.addEventListener('click', () => setActiveTab(btn.dataset.tab)));

  // -------- Interfaces --------
  async function listInterfaces() {
    setStatus('Loading interfaces…');
    let ifaceList = [];
    try {
      const out = await run('ip', ['-details', 'addr', 'show']);
      // Parse output
      const blocks = out.split(/\n(?=\d+: )/); // Each interface starts with 'N: '
      for (const block of blocks) {
        const lines = block.split('\n');
        const first = lines[0];
        const match = first.match(/^(\d+): ([^:]+):/);
        if (!match) continue;
        const dev = match[2];
        let type = 'unknown';
        let state = 'DOWN';
        let mac = '';
        let mtu = '';
        let ipv4 = '';
        let ipv6 = '';
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
            if (ip6Match) ipv6 = ip6Match[1];
          }
        }
        ifaceList.push({ dev, type, state, mac, mtu, ipv4, ipv6 });
      }
    } catch (e) {
      const tbody = $('#table-interfaces tbody');
      tbody.innerHTML = '';
      const tr = document.createElement('tr');
      tr.append(td('—'), td('—'), tdEl(stateBadge('unknown')), td('—'), td('—'), td('—'), td('—'), td('ip addr error: ' + e));
      tbody.appendChild(tr);
      setStatus('');
      return;
    }

    // Sort interfaces
    const sortValue = document.getElementById('iface-sort')?.value || 'name';
    ifaceList.sort((a, b) => {
      if (sortValue === 'name') return a.dev.localeCompare(b.dev);
      if (sortValue === 'type') return a.type.localeCompare(b.type);
      if (sortValue === 'state' ) return a.state.localeCompare(b.state);
      return 0;
    });

    const tbody = $('#table-interfaces tbody');
    tbody.innerHTML = '';
    for (const iface of ifaceList) {
      const tr = document.createElement('tr');
      const acts = document.createElement('td'); acts.className = 'actions';
      const btnUp   = btn('Up',   async () => { await run('ip', ['link', 'set', iface.dev, 'up']); await refreshAll(); });
      const btnDown = btn('Down', async () => { await run('ip', ['link', 'set', iface.dev, 'down']); await refreshAll(); });
      const btnEditIP = btn('Set IP', async () => {
        const modal = document.createElement('dialog');
        modal.innerHTML = `
          <div class="modal-content" style="min-width: 400px;">
            <h2>🌐 Set IP Address for ${iface.dev}</h2>
            <form id="set-ip-form">
              <label>Current IPv4 Address
                <input type="text" value="${iface.ipv4 || 'None'}" readonly style="background: #f5f5f5;">
              </label>
              <label>New IPv4 Address/CIDR
                <input type="text" id="new-ip-addr" placeholder="192.168.1.10/24" required 
                       pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$">
              </label>
              <label>Gateway (optional)
                <input type="text" id="new-gateway" placeholder="192.168.1.1"
                       pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$">
              </label>
              <label>DNS Servers (optional, comma separated)
                <input type="text" id="new-dns" placeholder="8.8.8.8,1.1.1.1">
              </label>
              <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
                <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                  <input type="checkbox" id="persist-ip" checked>
                  💾 Persist configuration to netplan (recommended)
                </label>
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <button type="button" class="btn" onclick="this.closest('dialog').close()">❌ Cancel</button>
                <button type="button" class="btn primary" id="apply-ip-config">💾 Apply Configuration</button>
              </div>
            </form>
          </div>
        `;
        
        document.body.appendChild(modal);
        
        $('#apply-ip-config', modal).addEventListener('click', async () => {
          const newIp = $('#new-ip-addr', modal).value.trim();
          const gateway = $('#new-gateway', modal).value.trim();
          const dns = $('#new-dns', modal).value.trim();
          const persist = $('#persist-ip', modal).checked;
          
          // Validation
          if (!newIp) {
            alert('❌ IP address is required!');
            return;
          }
          
          const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
          if (!ipRegex.test(newIp)) {
            alert('❌ Invalid IP address format! Use CIDR notation (e.g., 192.168.1.10/24)');
            return;
          }
          
          if (gateway && !/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(gateway)) {
            alert('❌ Invalid gateway address format!');
            return;
          }
          
          try {
            setStatus('Configuring IP address...');
            
            // Remove existing IP addresses first
            if (iface.ipv4) {
              try {
                await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
              } catch (e) {
                console.warn('Could not remove old IP:', e);
              }
            }
            
            // Add new IP address
            await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
            
            // Add gateway if specified
            if (gateway) {
              try {
                // Remove existing default route for this interface (best effort)
                await run('ip', ['route', 'del', 'default', 'dev', iface.dev], { superuser: 'require' });
              } catch (e) {
                // Ignore if no existing route
              }
              await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', iface.dev], { superuser: 'require' });
            }
            
            // Persist to netplan if requested
            if (persist) {
              try {
                const netplanConfig = {
                  name: iface.dev,
                  static_ip: newIp,
                  gateway: gateway || undefined,
                  dns: dns || undefined
                };
                
                const res = await netplanAction('set_ip', netplanConfig);
                if (res.error) {
                  console.warn('Netplan persistence failed:', res.error);
                  alert('⚠️ IP set successfully but netplan persistence failed: ' + res.error);
                } else {
                  alert('✅ IP address configured and persisted successfully!');
                }
              } catch (error) {
                console.warn('Netplan error:', error);
                alert('⚠️ IP set successfully but netplan persistence failed: ' + error.message);
              }
            } else {
              alert('✅ IP address configured successfully!\\n\\n⚠️ Note: Configuration is temporary and will be lost after reboot.');
            }
            
            modal.close();
            setStatus('✅ IP configuration applied');
            setTimeout(() => setStatus(''), 3000);
            await refreshAll();
            
          } catch (error) {
            alert('❌ Failed to set IP address: ' + error.message);
            console.error('IP configuration error:', error);
          }
        });
        
        modal.showModal();
        modal.addEventListener('close', () => document.body.removeChild(modal));
      });
      const btnDelIP = btn('Remove IP', async () => {
        if (!confirm(`Remove IP configuration from "${iface.dev}"?`)) return;
        try {
          // Remove IP address
          if (iface.ipv4) {
            await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
          }
          
          // Remove from netplan
          await netplanAction('delete_ip', { name: iface.dev });
          
          setStatus('IP configuration removed');
          setTimeout(() => setStatus(''), 3000);
          await refreshAll();
        } catch (e) {
          alert('Failed to remove IP configuration: ' + e);
        }
      });
      const btnSetMTU = btn('Set MTU', async () => {
        const modal = document.createElement('dialog');
        modal.innerHTML = `
          <div class="modal-content" style="min-width: 400px;">
            <h2>📏 Set MTU for ${iface.dev}</h2>
            <form id="set-mtu-form">
              <label>Current MTU
                <input type="text" value="${iface.mtu || 'Unknown'}" readonly style="background: #f5f5f5;">
              </label>
              <label>New MTU Value
                <input type="number" id="new-mtu" min="68" max="9000" value="${iface.mtu || '1500'}" required>
              </label>
              <div style="margin: 1rem 0; padding: 1rem; background: #fff3cd; border-radius: var(--border-radius); border: 1px solid #ffeaa7;">
                <h4 style="margin: 0 0 0.5rem 0;">📋 Common MTU Values:</h4>
                <ul style="margin: 0; padding-left: 1.5rem;">
                  <li><strong>1500:</strong> Standard Ethernet</li>
                  <li><strong>9000:</strong> Jumbo frames (LAN)</li>
                  <li><strong>1492:</strong> PPPoE connections</li>
                  <li><strong>1280:</strong> IPv6 minimum</li>
                </ul>
              </div>
              <div style="margin: 1rem 0; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius); border: 1px solid #bee5eb;">
                <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                  <input type="checkbox" id="persist-mtu" checked>
                  💾 Persist configuration to netplan (recommended)
                </label>
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <button type="button" class="btn" onclick="this.closest('dialog').close()">❌ Cancel</button>
                <button type="button" class="btn primary" id="apply-mtu-config">💾 Apply MTU</button>
              </div>
            </form>
          </div>
        `;
        
        document.body.appendChild(modal);
        
        $('#apply-mtu-config', modal).addEventListener('click', async () => {
          const newMtu = parseInt($('#new-mtu', modal).value);
          const persist = $('#persist-mtu', modal).checked;
          
          // Validation
          if (!newMtu || newMtu < 68 || newMtu > 9000) {
            alert('❌ MTU must be between 68 and 9000!');
            return;
          }
          
          if (iface.mtu && parseInt(iface.mtu) === newMtu) {
            alert('ℹ️ MTU is already set to ' + newMtu);
            modal.close();
            return;
          }
          
          try {
            setStatus('Setting MTU...');
            
            // Set MTU via ip command
            await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu.toString()], { superuser: 'require' });
            
            // Persist to netplan if requested
            if (persist) {
              try {
                const res = await netplanAction('set_mtu', { name: iface.dev, mtu: newMtu });
                if (res.error) {
                  console.warn('Netplan persistence failed:', res.error);
                  alert('⚠️ MTU set successfully but netplan persistence failed: ' + res.error);
                } else {
                  alert('✅ MTU configured and persisted successfully!');
                }
              } catch (error) {
                console.warn('Netplan error:', error);
                alert('⚠️ MTU set successfully but netplan persistence failed: ' + error.message);
              }
            } else {
              alert('✅ MTU configured successfully!\\n\\n⚠️ Note: Configuration is temporary and will be lost after reboot.');
            }
            
            modal.close();
            setStatus('✅ MTU configuration applied');
            setTimeout(() => setStatus(''), 3000);
            await refreshAll();
            
          } catch (error) {
            alert('❌ Failed to set MTU: ' + error.message);
            console.error('MTU configuration error:', error);
          }
        });
        
        modal.showModal();
        modal.addEventListener('close', () => document.body.removeChild(modal));
      });
      
      acts.append(btnUp, btnDown, btnEditIP, btnDelIP, btnSetMTU);
      tr.append(
        td(iface.dev),
        td(iface.type),
        tdEl(stateBadge(iface.state || 'unknown')),
        td(iface.mac),
        td(iface.ipv4),
        td(iface.ipv6),
        td(iface.mtu),
        acts
      );
      tbody.appendChild(tr);
    }
    setStatus('');
  }

  // Re-render interfaces when sort option changes
  $('#iface-sort').addEventListener('change', listInterfaces);

  async function parseDevicesDetail() {
    // Use networkctl and ip to get device details
    const out = await run('networkctl', ['status']);
    const map = new Map();
    let cur = null;
    out.split('\n').forEach(line => {
      if (line.startsWith('Link File:')) {
        cur = line.split(':')[1].trim();
        map.set(cur, {});
      }
      if cur?
