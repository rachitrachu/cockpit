/* global cockpit */
(() => {
  'use strict';

  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => Array.from(root.querySelectorAll(q));
  const statusEl = $('#status');

  function setStatus(msg) {
    statusEl.textContent = msg || '';
  }

  async function run(cmd, args = [], opts = {}) {
    const proc = cockpit.spawn([cmd, ...args], {
      superuser: "require",
      err: "out",
      ...opts
    });
    let out = "";
    proc.stream(d => out += d);
    await proc;
    return out.trim();
  }

  function stateBadge(state) {
    const span = document.createElement('span');
    span.className = 'badge ' + (state === 'connected' || state === 'UP' ? 'state-up'
                      : state === 'disconnected' || state === 'DOWN' ? 'state-down'
                      : 'state-unknown');
    span.textContent = state.toUpperCase();
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
    // nmcli device show / device status
    const terse = await run('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']);
    const lines = terse.split('\n').filter(Boolean);
    const devices = await parseDevicesDetail();
    const tbody = $('#table-interfaces tbody');
    tbody.innerHTML = '';

    for (const l of lines) {
      const [dev, type, state, conn] = l.split(':');
      const d = devices.get(dev) || {};
      const tr = document.createElement('tr');
      const act = document.createElement('td');
      act.className = 'actions';

      const btnUp = btn(`Up`, async () => {
        await run('nmcli', ['device', 'connect', dev]);
        await refreshAll();
      });
      const btnDown = btn('Down', async () => {
        await run('nmcli', ['device', 'disconnect', dev]);
        await refreshAll();
      });

      const btnEditIP = btn('Set IP', async () => {
        const cidr = prompt(`Enter IPv4 address/CIDR for ${dev} (blank to skip):`, d.ipv4 || '');
        if (cidr) {
          // create or modify a dummy connection for manual IPv4
          const conname = `xos-${dev}-manual`;
          try {
            await run('nmcli', ['con', 'add', 'type', 'ethernet', 'ifname', dev, 'con-name', conname]);
          } catch (e) { /* may exist */ }
          await run('nmcli', ['con', 'mod', conname, 'ipv4.addresses', cidr, 'ipv4.method', 'manual']);
          if (d.ipv4gw) {
            await run('nmcli', ['con', 'mod', conname, 'ipv4.gateway', d.ipv4gw]);
          }
          await run('nmcli', ['con', 'up', conname]);
          await refreshAll();
        }
      });

      const btnDelIP = btn('Clear IP', async () => {
        const con = await bestConnectionFor(dev);
        if (con) {
          await run('nmcli', ['con', 'mod', con, 'ipv4.method', 'auto', 'ipv4.addresses', '', 'ipv4.gateway', '']);
          await run('nmcli', ['con', 'up', con]);
          await refreshAll();
        } else {
          alert('No connection found to modify.');
        }
      });

      act.append(btnUp, btnDown, btnEditIP, btnDelIP);

      tr.append(
        td(dev),
        td(type),
        tdEl(stateBadge(state)),
        td(d.mac || ''),
        td(d.ipv4 || ''),
        td(d.ipv6 || ''),
        td(d.mtu || ''),
        act
      );
      tbody.appendChild(tr);
    }
    setStatus('');
  }

  async function parseDevicesDetail() {
    const out = await run('bash', ['-lc', "nmcli -t -f GENERAL.DEVICE,GENERAL.MTU,GENERAL.HWADDR,IP4.ADDRESS,IP6.ADDRESS device show | sed 's/  */ /g'"]);
    const map = new Map();
    let cur = null;
    out.split('\n').forEach(line => {
      if (!line.includes(':')) return;
      const [k, v] = line.split(':').map(s => s.trim());
      if (k === 'GENERAL.DEVICE') {
        cur = v;
        map.set(cur, {});
      } else if (cur) {
        const d = map.get(cur);
        if (k === 'GENERAL.MTU') d.mtu = v;
        if (k === 'GENERAL.HWADDR') d.mac = v;
        if (k === 'IP4.ADDRESS[1]' || k === 'IP4.ADDRESS') d.ipv4 = v.split(' ')[0];
        if (k === 'IP6.ADDRESS[1]' || k === 'IP6.ADDRESS') d.ipv6 = v.split(' ')[0];
      }
    });
    return map;
  }

  function td(text) { const e = document.createElement('td'); e.textContent = text; return e; }
  function tdEl(el) { const e = document.createElement('td'); e.appendChild(el); return e; }
  function btn(label, handler) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = 'btn';
    b.addEventListener('click', async () => {
      try {
        setStatus(`${label}…`);
        await handler();
      } catch (e) {
        alert(`${label} failed:\n` + e);
      } finally {
        setStatus('');
      }
    });
    return b;
  }

  async function bestConnectionFor(dev) {
    try {
      const out = await run('nmcli', ['-t', '-f', 'NAME,DEVICE,UUID,TYPE', 'con', 'show', '--active']);
      const match = out.split('\n').map(l => l.split(':')).find(a => a[1] === dev);
      return match ? match[0] : null;
    } catch { return null; }
  }

  // -------- Connections --------
  async function listConnections() {
    setStatus('Loading connections…');
    const out = await run('nmcli', ['-t', '-f', 'NAME,UUID,TYPE,DEVICE,AUTOCONNECT,IP4.ADDRESS,IP6.ADDRESS', 'connection', 'show']);
    const lines = out.split('\n').filter(Boolean);
    const tbody = $('#table-connections tbody');
    tbody.innerHTML = '';
    for (const l of lines) {
      const [name, uuid, type, dev, auto, ip4, ip6] = l.split(':');
      const tr = document.createElement('tr');
      const acts = document.createElement('td'); acts.className = 'actions';

      const up = btn('Up', async () => { await run('nmcli', ['con', 'up', uuid]); await refreshAll(); });
      const down = btn('Down', async () => { await run('nmcli', ['con', 'down', uuid]); await refreshAll(); });
      const edit = btn('Edit', async () => openConnModal({name, device: dev, type, uuid}));
      const del = btn('Delete', async () => {
        if (confirm(`Delete connection "${name}"?`)) {
          await run('nmcli', ['con', 'delete', uuid]); await refreshAll();
        }
      });

      acts.append(up, down, edit, del);

      tr.append(
        td(name), td(uuid), td(type), td(dev || ''), td(auto || ''), td(ip4 || ''), td(ip6 || ''), acts
      );
      tbody.appendChild(tr);
    }
    setStatus('');
  }

  // Filter boxes
  $('#search-iface').addEventListener('input', () => filterTable('#table-interfaces', $('#search-iface').value));
  $('#search-conn').addEventListener('input',  () => filterTable('#table-connections', $('#search-conn').value));
  function filterTable(sel, term) {
    const t = term.toLowerCase();
    $$(sel + ' tbody tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(t) ? '' : 'none';
    });
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
      if (!uuid) {
        // add
        const args = ['con','add','type',type];
        if (dev) args.push('ifname', dev);
        args.push('con-name', name || `${type}-${dev || '0'}`);
        await run('nmcli', args);
      } else {
        // rename if changed
        if (name) await run('nmcli', ['con','mod', uuid, 'connection.id', name]);
      }
      // IP config
      if (ip4) {
        await run('nmcli', ['con','mod', name || uuid, 'ipv4.addresses', ip4, 'ipv4.method', 'manual']);
      }
      if (gw) {
        await run('nmcli', ['con','mod', name || uuid, 'ipv4.gateway', gw]);
      }
      if (dns) {
        await run('nmcli', ['con','mod', name || uuid, 'ipv4.dns', dns.replace(/,/g,' ')]);
      }
      await run('nmcli', ['con','up', name || uuid]);
      connModal.close();
      await refreshAll();
    } catch (err) {
      alert('Save failed:\n' + err);
    }
  });

  // -------- Constructs: VLAN / Bridge / Bond --------
  $('#btn-create-vlan').addEventListener('click', async () => {
    const parent = $('#vlan-parent').value.trim();
    const id = $('#vlan-id').value.trim();
    const ifname = $('#vlan-name').value.trim() || `${parent}.${id}`;
    if (!parent || !id) return alert('Parent and VLAN ID required.');
    try {
      const out = await run('nmcli', ['con','add','type','vlan','ifname',ifname,'dev',parent,'id',id,'con-name',ifname]);
      $('#vlan-out').textContent = out || 'VLAN created.';
      await run('nmcli', ['con','up', ifname]);
      await refreshAll();
    } catch (e) {
      $('#vlan-out').textContent = String(e);
    }
  });

  $('#btn-create-bridge').addEventListener('click', async () => {
    const br = $('#br-name').value.trim();
    const ports = $('#br-ports').value.trim().split(',').map(s => s.trim()).filter(Boolean);
    if (!br) return alert('Bridge name required.');
    try {
      await run('nmcli', ['con','add','type','bridge','ifname',br,'con-name',br]);
      for (const p of ports) {
        await run('nmcli', ['con','add','type','bridge-slave','ifname',p,'master',br]);
      }
      await run('nmcli', ['con','up', br]);
      $('#br-out').textContent = `Bridge ${br} created with ports: ${ports.join(', ')}`;
      await refreshAll();
    } catch (e) {
      $('#br-out').textContent = String(e);
    }
  });

  $('#btn-create-bond').addEventListener('click', async () => {
    const bond = $('#bond-name').value.trim();
    const mode = $('#bond-mode').value;
    const slaves = $('#bond-slaves').value.trim().split(',').map(s => s.trim()).filter(Boolean);
    if (!bond || slaves.length < 2) return alert('Bond name and at least two slaves required.');
    try {
      await run('nmcli', ['con','add','type','bond','ifname',bond,'con-name',bond]);
      await run('nmcli', ['con','mod', bond, 'bond.options', `mode=${mode}`]);
      for (const s of slaves) {
        await run('nmcli', ['con','add','type','bond-slave','ifname',s,'master',bond]);
      }
      await run('nmcli', ['con','up', bond]);
      $('#bond-out').textContent = `Bond ${bond} (${mode}) created with slaves: ${slaves.join(', ')}`;
      await refreshAll();
    } catch (e) {
      $('#bond-out').textContent = String(e);
    }
  });

  // -------- Diagnostics --------
  async function refreshDiagnostics() {
    try {
      const routes = await run('ip', ['route']);
      $('#routes-out').textContent = routes || '(no routes)';
    } catch (e) { $('#routes-out').textContent = String(e); }

    try {
      const resolv = await run('bash', ['-lc', 'grep -E "^(nameserver|search)" -n /etc/resolv.conf || true']);
      $('#dns-out').textContent = resolv || '(no resolv.conf)';
    } catch (e) { $('#dns-out').textContent = String(e); }
  }

  $('#btn-ping').addEventListener('click', async () => {
    const host = $('#diag-host').value.trim() || '8.8.8.8';
    try {
      const out = await run('ping', ['-c', '4', host]);
      $('#ping-out').textContent = out;
    } catch (e) {
      $('#ping-out').textContent = String(e);
    }
  });

  $('#btn-traceroute').addEventListener('click', async () => {
    const host = $('#diag-host').value.trim() || '8.8.8.8';
    try {
      const out = await run('bash', ['-lc', `command -v traceroute >/dev/null && traceroute -n ${shq(host)} || (command -v tracepath >/dev/null && tracepath -n ${shq(host)} || echo "traceroute/tracepath not installed")`]);
      $('#ping-out').textContent = out;
    } catch (e) {
      $('#ping-out').textContent = String(e);
    }
  });

  function shq(s){ return `'${String(s).replace(/'/g,"'\\''")}'`; }

  // -------- Refresh all --------
  async function refreshAll() {
    await Promise.all([listInterfaces(), listConnections(), refreshDiagnostics()]);
  }

  // Header refresh
  $('#btn-refresh').addEventListener('click', refreshAll);

  // Initial
  document.addEventListener('DOMContentLoaded', () => {
    refreshAll().catch(e => setStatus(String(e)));
  });
})();
