/* global cockpit */
(() => {
  'use strict';
  // Using systemd-networkd and networkctl only
  const $  = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));
  const statusEl = $('#status');

  function setStatus(msg) { statusEl.textContent = msg || ''; }

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
    b.addEventListener('click', async () => {
      try { setStatus(`${label}…`); await handler(); }
      catch (e) { alert(`${label} failed:\n${e}`); }
      finally { setStatus(''); }
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
        const cidr = prompt(`Enter IPv4 address/CIDR for ${iface.dev} (blank to skip):`, iface.ipv4 || '');
        if (!cidr) return;
        await run('ip', ['addr', 'add', cidr, 'dev', iface.dev]);
        await refreshAll();
      });
      const btnDelIP = btn('Clear IP', async () => {
        if (!iface.ipv4) return alert('No IP found to delete.');
        await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev]);
        await refreshAll();
      });
      acts.append(btnUp, btnDown, btnEditIP, btnDelIP);
      // Add Delete Bond button if interface is a bond
      if (iface.dev.startsWith('bond')) {
        const btnDeleteBond = btn('Delete Bond', async () => {
          if (!confirm(`Delete bond "${iface.dev}"? This will remove it now and update Netplan.`)) return;
          try {
            // Delete the runtime bond immediately
            await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
          } catch (e) {
            alert('Failed to delete bond interface: ' + e);
            return;
          }
          // Clean up Netplan to persist removal across reboots
          const res = await netplanAction('delete', { type: 'bonds', name: iface.dev });
          if (res.error) {
            alert('Netplan cleanup failed: ' + res.error);
          }
          await refreshAll();
        });
        acts.append(btnDeleteBond);
      }
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
      if (cur) {
        const d = map.get(cur);
        if (line.includes('MTU:')) d.mtu = line.split('MTU:')[1].trim();
        if (line.includes('MAC:')) d.mac = line.split('MAC:')[1].trim();
        if (line.includes('IPv4:')) d.ipv4 = line.split('IPv4:')[1].trim();
        if (line.includes('IPv6:')) d.ipv6 = line.split('IPv6:')[1].trim();
      }
    });
    return map;
  }

  async function bestConnectionFor(dev) {
    try {
      // Use networkctl status to find associated .network file for the device
      const out = await run('networkctl', ['status', dev]);
      const nf = out.split('\n').map(l => l.trim()).find(l => l.startsWith('Network File:') || l.startsWith('Network:') );
      if (!nf) return null;
      const val = nf.split(':').slice(1).join(':').trim();
      return val || null;
    } catch { return null; }
  }

  // -------- Connections --------
  async function listConnections() {
    setStatus('Loading links…');
    let out = '';
    try {
      out = await run('networkctl', ['list']);
    } catch (e) {
      const tbody = $('#table-connections tbody');
      tbody.innerHTML = '';
      const tr = document.createElement('tr');
      tr.append(td('networkctl error: ' + e), td('—'), td('—'), td('—'), td('—'), td('—'), td('—'), td('—'));
      tbody.appendChild(tr);
      setStatus('');
      return;
    }
    const lines = out.split('\n').slice(1).filter(Boolean);
    const tbody = $('#table-connections tbody');
    tbody.innerHTML = '';
    for (const l of lines) {
      const parts = l.trim().split(/\s+/);
      const name = parts[1];
      const type = parts[2];
      const state = parts[3];
      const tr = document.createElement('tr');
      const acts = document.createElement('td'); acts.className = 'actions';

      const up   = btn('Up',   async () => { await run('ip', ['link', 'set', name, 'up']);   await refreshAll(); });
      const down = btn('Down', async () => { await run('ip', ['link', 'set', name, 'down']); await refreshAll(); });
      const edit = btn('Edit', async () => openConnModal({name, type}));
      const del  = btn('Delete', async () => {
        if (confirm(`Delete link "${name}"?`)) { await run('ip', ['link', 'delete', name]); await refreshAll(); }
      });

      acts.append(up, down, edit, del);

      tr.append(td(name||''), td('—'), td(type||''), td(state||''), td('—'), td('—'), td('—'), acts);
      tbody.appendChild(tr);
    }
    setStatus('');
  }

  // Filter boxes
  $('#search-iface').addEventListener('input', () => filterTable('#table-interfaces', $('#search-iface').value));
  $('#search-conn').addEventListener('input',  () => filterTable('#table-connections', $('#search-conn').value));
  function filterTable(sel, term) {
    const t = (term || '').toLowerCase();
    $$(sel + ' tbody tr').forEach(tr => { tr.style.display = tr.textContent.toLowerCase().includes(t) ? '' : 'none'; });
  }

  // Add/Edit connection modal
  const connModal = $('#conn-modal');
  const connForm  = $('#conn-form');
  $('#btn-add-connection').addEventListener('click', () => openConnModal({}));

  function openConnModal(data) {
    $('#conn-modal-title').textContent = data.uuid ? 'Edit Connection' : 'Add Connection';
    connForm.name.value   = data.name   || '';
    connForm.device.value = data.device || '';
    connForm.type.value   = data.type   || 'ethernet';
    connForm.ip4addr.value= data.ip4addr|| '';
    connForm.ip4gw.value  = data.ip4gw  || '';
    connForm.ip4dns.value = data.ip4dns || '';
    connForm.dataset.uuid = data.uuid || '';
    connModal.showModal();
  }
  $('#conn-cancel').addEventListener('click', () => connModal.close());
  $('#conn-save').addEventListener('click', async (e) => {
    e.preventDefault();
    const f = connForm;
    const name = f.name.value.trim();
    const dev  = f.device.value.trim();
    const type = f.type.value;
    const uuid = f.dataset.uuid || null;
    const ip4  = f.ip4addr.value.trim();
    const gw   = f.ip4gw.value.trim();
    const dns  = f.ip4dns.value.trim();

    try {
      // Create a simple systemd-networkd .network file to represent this "connection".
      if (!name) return alert('Name required for network file.');
      const safe = name.replace(/[^a-zA-Z0-9_.-]/g, '-');
      const path = `/etc/systemd/network/${safe}.network`;
      const lines = [];
      // Match section
      if (dev) {
        lines.push('[Match]', `Name=${dev}`);
      } else {
        lines.push('[Match]', `Name=*`);
      }
      // Network section
      lines.push('', '[Network]');
      if (!ip4) lines.push('DHCP=yes'); else lines.push('DHCP=no');
      if (dns) lines.push(`DNS=${dns.replace(/,/g,' ')}`);
      if (gw) {
        // add route via [Route]
        lines.push('', '[Route]', `Gateway=${gw}`);
      }
      if (ip4) {
        lines.push('', '[Address]', `Address=${ip4}`);
      }
      const content = lines.join('\n') + '\n';
      // Write file with elevated privilege
      await run('bash', ['-lc', `cat > ${path} <<'EOF'\n${content}EOF`]);
      // Restart systemd-networkd to apply
      await run('systemctl', ['restart', 'systemd-networkd']);
      connModal.close();
      await refreshAll();
    } catch (err) {
      alert('Save failed:\n' + err);
    }
  });

  // -------- Constructs: VLAN / Bridge / Bond --------
  async function netplanAction(action, config) {
    console.log('netplanAction called with:', { action, config });
    try {
      console.log('About to spawn netplan script...');
      const result = await cockpit.spawn([
        'python3',
        '/usr/share/cockpit/xos-networking/netplan_manager.py'
      ], {
        input: JSON.stringify({ action, config }),
        superuser: 'require',
        err: 'out'
      });
      console.log('Netplan script raw output:', result);
      const parsed = JSON.parse(result);
      console.log('Netplan script parsed output:', parsed);
      return parsed;
    } catch (e) {
      console.error('netplanAction exception:', e);
      alert('Netplan error: ' + e);
      return { error: e.toString() };
    }
  }

  // Helper to get available interfaces using ip (more reliable than networkctl)
  async function getInterfacesIP({ physicalOnly = false } = {}) {
    const ifaces = [];
    try {
      const out = await run('bash', ['-lc', "ip -o link show | awk -F': ' '{print $2}'"], { superuser: 'try' });
      out.split('\n').map(s => s.trim()).filter(Boolean).forEach(dev => {
        // Skip loopback and virtuals when physicalOnly requested
        if (physicalOnly) {
          if (dev === 'lo') return;
          if (dev.startsWith('bond')) return;
          if (dev.startsWith('br')) return;
          if (dev.includes('.')) return; // vlan like eth0.10
          if (dev.startsWith('veth') || dev.startsWith('docker') || dev.startsWith('virbr') || dev.startsWith('tap')) return;
        }
        ifaces.push(dev);
      });
    } catch (e) {
      console.error('Failed to get interfaces via ip:', e);
    }
    return ifaces;
  }

  // Populate VLAN parent dropdown
  async function populateVlanParentDropdown() {
    const select = document.getElementById('vlan-parent');
    if (!select) return;
    select.innerHTML = '';
    const interfaces = await getInterfacesIP({ physicalOnly: true });
    interfaces.forEach(dev => {
      const option = document.createElement('option');
      option.value = dev;
      option.textContent = dev;
      select.appendChild(option);
    });
  }

  // Populate Bridge ports multi-select
  async function populateBridgePortsDropdown() {
    const select = document.getElementById('br-ports');
    if (!select) return;
    select.innerHTML = '';
    const interfaces = await getInterfacesIP({ physicalOnly: true });
    interfaces.forEach(dev => {
      const option = document.createElement('option');
      option.value = dev;
      option.textContent = dev;
      select.appendChild(option);
    });
  }

  // Populate Bond slaves multi-select
  async function populateBondSlavesDropdown() {
    const select = document.getElementById('bond-slaves');
    if (!select) return;
    select.innerHTML = '';
    const interfaces = await getInterfacesIP({ physicalOnly: true });
    interfaces.forEach(dev => {
      const option = document.createElement('option');
      option.value = dev;
      option.textContent = dev;
      select.appendChild(option);
    });
  }

  // Filter function for multi-selects
  function filterDropdown(inputId, selectId) {
    const input = document.getElementById(inputId);
    const select = document.getElementById(selectId);
    input.addEventListener('input', () => {
      const term = input.value.toLowerCase();
      Array.from(select.options).forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
  }

  // Setup dropdowns and filters on tab activation and page load
  function setupDropdowns() {
    $$('.tab').forEach(btn => {
      if (btn.dataset.tab === 'constructs') {
        btn.addEventListener('click', () => {
          populateVlanParentDropdown();
          populateBridgePortsDropdown();
          populateBondSlavesDropdown();
        });
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      populateVlanParentDropdown();
      populateBridgePortsDropdown();
      populateBondSlavesDropdown();
      filterDropdown('br-ports-filter', 'br-ports');
      filterDropdown('bond-slaves-filter', 'bond-slaves');
    });
  }
  setupDropdowns();

  $('#btn-create-bridge').addEventListener('click', async () => {
    const br = $('#br-name').value.trim();
    const select = document.getElementById('br-ports');
    const ports = Array.from(select.selectedOptions).map(opt => opt.value);
    // Validation
    if (!br.match(/^[a-zA-Z0-9_.-]+$/)) return alert('Bridge name is invalid.');
    if (ports.length < 1 || !ports.every(p => p.match(/^[a-zA-Z0-9_.-]+$/))) return alert('At least one valid port required.');
    const res = await netplanAction('add_bridge', { name: br, interfaces: ports });
    if (res.error) {
      $('#br-out').textContent = res.error;
    } else {
      $('#br-out').textContent = `Bridge ${br} created with ports: ${ports.join(', ')}`;
      await refreshAll();
    }
  });

  $('#btn-create-bond').addEventListener('click', async () => {
    console.log('Create Bond clicked');
    const bond = $('#bond-name').value.trim();
    const mode = $('#bond-mode').value;
    const select = document.getElementById('bond-slaves');
    const slaves = Array.from(select.selectedOptions).map(opt => opt.value);
    console.log('Create Bond inputs:', { bond, mode, slaves });
    
    // Validation
    if (!bond.match(/^[a-zA-Z0-9_.-]+$/)) { 
      alert('Bond name is invalid.'); 
      console.log('Validation failed: Bond name invalid');
      return; 
    }
    if (slaves.length < 2 || !slaves.every(s => s.match(/^[a-zA-Z0-9_.-]+$/))) { 
      alert('At least two valid slave interfaces required.'); 
      console.log('Validation failed: Slaves invalid', slaves);
      return; 
    }
    if (!mode) { 
      alert('Bond mode is required.'); 
      console.log('Validation failed: Mode required');
      return; 
    }
    
    console.log('Validation passed, calling netplanAction...');
    const btnEl = $('#btn-create-bond');
    btnEl.disabled = true;
    
    try {
      const res = await netplanAction('add_bond', { name: bond, mode, interfaces: slaves });
      console.log('netplanAction result:', res);
      
      if (res.error) {
        $('#bond-out').textContent = res.error;
        console.error('Bond creation failed with error:', res.error);
      } else {
        $('#bond-out').textContent = `Bond ${bond} (${mode}) created with slaves: ${slaves.join(', ')}`;
        console.log('Bond creation successful, refreshing interfaces...');
        await refreshAll();
      }
    } catch (error) {
      console.error('Exception during bond creation:', error);
      $('#bond-out').textContent = 'Error: ' + error;
    } finally {
      btnEl.disabled = false;
    }
  });

  // Update VLAN creation to use dropdown value
  $('#btn-create-vlan').addEventListener('click', async () => {
    const parent = $('#vlan-parent').value.trim();
    const id = $('#vlan-id').value.trim();
    const ifname = $('#vlan-name').value.trim() || `${parent}.${id}`;
    // Validation
    if (!parent.match(/^[a-zA-Z0-9_.-]+$/)) return alert('Parent interface name is invalid.');
    if (!id.match(/^\d+$/) || parseInt(id) < 1 || parseInt(id) > 4094) return alert('VLAN ID must be between 1 and 4094.');
    if (ifname && !ifname.match(/^[a-zA-Z0-9_.-]+$/)) return alert('Interface name is invalid.');
    const res = await netplanAction('add_vlan', { name: ifname, id: parseInt(id), link: parent });
    if (res.error) {
      $('#vlan-out').textContent = res.error;
    } else {
      $('#vlan-out').textContent = `VLAN ${ifname} created.`;
      await refreshAll();
    }
  });

  // -------- Diagnostics --------
  async function refreshDiagnostics() {
    try { $('#routes-out').textContent = await run('ip', ['route']) || '(no routes)'; }
    catch (e) { $('#routes-out').textContent = String(e); }
    try {
      const resolv = await run('bash', ['-lc', 'grep -E "^(nameserver|search)" -n /etc/resolv.conf || true']);
      $('#dns-out').textContent = resolv || '(no resolv.conf)';
    } catch (e) { $('#dns-out').textContent = String(e); }
  }

  $('#btn-ping').addEventListener('click', async () => {
    const host = $('#diag-host').value.trim() || '8.8.8.8';
    try { $('#ping-out').textContent = await run('ping', ['-c', '4', host]); }
    catch (e) { $('#ping-out').textContent = String(e); }
  });

  $('#btn-traceroute').addEventListener('click', async () => {
    const host = $('#diag-host').value.trim() || '8.8.8.8';
    try {
      const out = await run('bash', ['-lc', `command -v traceroute >/dev/null && traceroute -n '${host.replace(/'/g,"'\\''")}' || (command -v tracepath >/dev/null && tracepath -n '${host.replace(/'/g,"'\\''")}' || echo "traceroute/tracepath not installed")`]);
      $('#ping-out').textContent = out;
    } catch (e) { $('#ping-out').textContent = String(e); }
  });

  // -------- Refresh all --------
  async function refreshAll() {
    await Promise.all([listInterfaces(), listConnections(), refreshDiagnostics()]);
  }

  // Header refresh
  $('#btn-refresh').addEventListener('click', refreshAll);

  // Test function to verify cockpit.spawn works
  window.testSpawn = async function() {
    try {
      console.log('Testing basic spawn...');
      const result = await cockpit.spawn(['ls', '-la', '/usr/share/cockpit/xos-networking/'], {
        superuser: 'require'
      });
      console.log('Basic spawn result:', result);
      return result;
    } catch (e) {
      console.error('Basic spawn failed:', e);
      return e;
    }
  };

  // Initial
  document.addEventListener('DOMContentLoaded', () => {
    refreshAll().catch(e => setStatus(String(e)));
  });
})();
