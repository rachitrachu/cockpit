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
        
        actionsCell.appendChild(btnUp);
        actionsCell.appendChild(btnDown);
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
