/* global cockpit */
(() => {
  'use strict';

  const NM = '/usr/bin/nmcli';        // absolute path to avoid PATH issues in cockpit hi hello
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
    let lines = [];
    try {
      const terse = await run(NM, ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device']);
      lines = terse.split('\n').filter(Boolean);
    } catch (e) {
      // If nmcli is missing or blocked, show a single error row
      const tbody = $('#table-interfaces tbody');
      tbody.innerHTML = '';
      const tr = document.createElement('tr');
      tr.append(td('—'), td('—'), tdEl(stateBadge('unknown')), td('—'), td('—'), td('—'), td('—'), td('nmcli error: ' + e));
      tbody.appendChild(tr);
      setStatus('');
      return;
    }

    const devMap = await parseDevicesDetail().catch(() => new Map());
    const tbody = $('#table-interfaces tbody');
    tbody.innerHTML = '';

    for (const l of lines) {
      const [dev, type, state, conn] = l.split(':');
      const d = devMap.get(dev) || {};
      const tr = document.createElement('tr');
      const acts = document.createElement('td'); acts.className = 'actions';

      // When unmanaged, Up/Down via nmcli device connect/disconnect will fail.
      // We still render buttons, but disable if state says unmanaged.
      const unmanaged = (state || '').toLowerCase() === 'unmanaged';

      const btnUp   = btn('Up',   async () => { await run(NM, ['device', 'connect', dev]); await refreshAll(); });
      const btnDown = btn('Down', async () => { await run(NM, ['device', 'disconnect', dev]); await refreshAll(); });
      const btnEditIP = btn('Set IP', async () => {
        const cidr = prompt(`Enter IPv4 address/CIDR for ${dev} (blank to skip):`, d.ipv4 || '');
        if (!cidr) return;
        const conname = `xos-${dev}-manual`;
        try { await run(NM, ['con','add','type','ethernet','ifname',dev,'con-name',conname]); } catch (_) { /* may already exist */ }
        await run(NM, ['con','mod', conname, 'ipv4.addresses', cidr, 'ipv4.method', 'manual']);
        if (d.ipv4gw) await run(NM, ['con','mod', conname, 'ipv4.gateway', d.ipv4gw]);
        await run(NM, ['con','up', conname]);
        await refreshAll();
      });
      const btnDelIP = btn('Clear IP', async () => {
        const con = await bestConnectionFor(dev);
        if (!con) return alert('No connection found to modify.');
        await run(NM, ['con','mod', con, 'ipv4.method', 'auto', 'ipv4.addresses', '', 'ipv4.gateway', '']);
        await run(NM, ['con','up', con]);
        await refreshAll();
      });

      if (unmanaged) [btnUp, btnDown, btnEditIP, btnDelIP].forEach(b => b.disabled = true);

      acts.append(btnUp, btnDown, btnEditIP, btnDelIP);

      tr.append(
        td(dev),
        td(type),
        tdEl(stateBadge(state || 'unknown')),
        td(d.mac || ''),
        td(d.ipv4 || ''),
        td(d.ipv6 || ''),
        td(d.mtu || ''),
        acts
      );
      tbody.appendChild(tr);
    }
    setStatus('');
  }

  async function parseDevicesDetail() {
    // Use absolute nmcli path inside a login shell to get all fields reliably
    const out = await run('bash', ['-lc', `${NM} -t -f GENERAL.DEVICE,GENERAL.MTU,GENERAL.HWADDR,IP4.ADDRESS,IP6.ADDRESS device show`]);
    const map = new Map();
    let cur = null;
    out.split('\n').forEach(line => {
      if (!line.includes(':')) return;
      const [k, vRaw] = line.split(':');
      const v = (vRaw || '').trim();
      if (k === 'GENERAL.DEVICE') { cur = v; map.set(cur, {}); }
      else if (cur) {
        const d = map.get(cur);
        if (k === 'GENERAL.MTU') d.mtu = v;
        if (k === 'GENERAL.HWADDR') d.mac = v;
        if (k.startsWith('IP4.ADDRESS')) d.ipv4 = (v.split(' ')[0] || '');
        if (k.startsWith('IP6.ADDRESS')) d.ipv6 = (v.split(' ')[0] || '');
      }
    });
    return map;
  }

  async function bestConnectionFor(dev) {
    try {
      const out = await run(NM, ['-t', '-f', 'NAME,DEVICE,UUID,TYPE', 'con', 'show', '--active']);
      const match = out.split('\n').map(l => l.split(':')).find(a => a[1] === dev);
      return match ? match[0] : null;
    } catch { return null; }
  }

  // -------- Connections --------
  async function listConnections() {
    setStatus('Loading connections…');
    let out = '';
    try {
      out = await run(NM, ['-t', '-f', 'NAME,UUID,TYPE,DEVICE,AUTOCONNECT,IP4.ADDRESS,IP6.ADDRESS', 'connection', 'show']);
    } catch (e) {
      const tbody = $('#table-connections tbody');
      tbody.innerHTML = '';
      const tr = document.createElement('tr');
      tr.append(td('nmcli error: ' + e), td('—'), td('—'), td('—'), td('—'), td('—'), td('—'), td('—'));
      tbody.appendChild(tr);
      setStatus('');
      return;
    }
    const lines = out.split('\n').filter(Boolean);
    const tbody = $('#table-connections tbody');
    tbody.innerHTML = '';
    for (const l of lines) {
      const [name, uuid, type, dev, auto, ip4, ip6] = l.split(':');
      const tr = document.createElement('tr');
      const acts = document.createElement('td'); acts.className = 'actions';

      const up   = btn('Up',   async () => { await run(NM, ['con', 'up', uuid || name]);   await refreshAll(); });
      const down = btn('Down', async () => { await run(NM, ['con', 'down', uuid || name]); await refreshAll(); });
      const edit = btn('Edit', async () => openConnModal({name, device: dev, type, uuid}));
      const del  = btn('Delete', async () => {
        if (confirm(`Delete connection "${name}"?`)) { await run(NM, ['con', 'delete', uuid || name]); await refreshAll(); }
      });

      // If everything is unmanaged, these are likely no-ops; keep enabled for environments where NM manages some links.
      acts.append(up, down, edit, del);

      tr.append(td(name||''), td(uuid||''), td(type||''), td(dev||''), td(auto||''), td(ip4||''), td(ip6||''), acts);
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
      if (!uuid) {
        const args = ['con','add','type',type];
        if (dev) args.push('ifname', dev);
        args.push('con-name', name || `${type}-${dev || '0'}`);
        await run(NM, args);
      } else {
        if (name) await run(NM, ['con','mod', uuid, 'connection.id', name]);
      }
      if (ip4) await run(NM, ['con','mod', name || uuid, 'ipv4.addresses', ip4, 'ipv4.method', 'manual']);
      if (gw)  await run(NM, ['con','mod', name || uuid, 'ipv4.gateway', gw]);
      if (dns) await run(NM, ['con','mod', name || uuid, 'ipv4.dns', dns.replace(/,/g,' ')]);
      await run(NM, ['con','up', name || uuid]);
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
      await run(NM, ['con','add','type','vlan','ifname',ifname,'dev',parent,'id',id,'con-name',ifname]);
      await run(NM, ['con','up', ifname]);
      $('#vlan-out').textContent = `VLAN ${ifname} created.`;
      await refreshAll();
    } catch (e) { $('#vlan-out').textContent = String(e); }
  });

  $('#btn-create-bridge').addEventListener('click', async () => {
    const br = $('#br-name').value.trim();
    const ports = $('#br-ports').value.trim().split(',').map(s => s.trim()).filter(Boolean);
    if (!br) return alert('Bridge name required.');
    try {
      await run(NM, ['con','add','type','bridge','ifname',br,'con-name',br]);
      for (const p of ports) await run(NM, ['con','add','type','bridge-slave','ifname',p,'master',br]);
      await run(NM, ['con','up', br]);
      $('#br-out').textContent = `Bridge ${br} created with ports: ${ports.join(', ')}`;
      await refreshAll();
    } catch (e) { $('#br-out').textContent = String(e); }
  });

  $('#btn-create-bond').addEventListener('click', async () => {
    const bond = $('#bond-name').value.trim();
    const mode = $('#bond-mode').value;
    const slaves = $('#bond-slaves').value.trim().split(',').map(s => s.trim()).filter(Boolean);
    if (!bond || slaves.length < 2) return alert('Bond name and at least two slaves required.');
    try {
      await run(NM, ['con','add','type','bond','ifname',bond,'con-name',bond]);
      await run(NM, ['con','mod', bond, 'bond.options', `mode=${mode}`]);
      for (const s of slaves) await run(NM, ['con','add','type','bond-slave','ifname',s,'master',bond]);
      await run(NM, ['con','up', bond]);
      $('#bond-out').textContent = `Bond ${bond} (${mode}) created with slaves: ${slaves.join(', ')}`;
      await refreshAll();
    } catch (e) { $('#bond-out').textContent = String(e); }
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

  // Initial
  document.addEventListener('DOMContentLoaded', () => {
    refreshAll().catch(e => setStatus(String(e)));
  });
})();
