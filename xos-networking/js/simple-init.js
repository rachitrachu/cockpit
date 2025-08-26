// Simple initialization fallback for XOS Networking
export async function setupTabs() {
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.tab-panel'));
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      panels.forEach(p => p.classList.remove('active'));
      const targetPanel = document.querySelector(`#tab-${targetId}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

export async function run(cmd, args = [], opts = {}) {
  console.log('Running command:', cmd, args);
  
  if (typeof cockpit === 'undefined') {
    throw new Error('Cockpit API not available');
  }
  
  const proc = cockpit.spawn([cmd, ...args], {
    superuser: "try",
    err: "out",
    ...opts
  });
  
  let output = "";
  proc.stream(data => output += data);
  await proc;
  
  return output.trim();
}

export async function loadInterfaces() {
  console.log('Loading interfaces...');
  
  const tbody = document.querySelector('#table-interfaces tbody');
  if (!tbody) return;

  try {
    const output = await run('ip', ['-details', 'addr', 'show']);
    const interfaces = [];
    const blocks = output.split(/\n(?=\d+: )/);
    
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

    // Clear table
    tbody.innerHTML = '';
    
    if (interfaces.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">No network interfaces found</td></tr>';
      return;
    }

    // Sort and populate
    interfaces.sort((a, b) => a.dev.localeCompare(b.dev));

    interfaces.forEach(iface => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${iface.dev}</td>
        <td>${iface.type}</td>
        <td><span class="badge state-${iface.state.toLowerCase()}">${iface.state}</span></td>
        <td>${iface.mac}</td>
        <td>${iface.ipv4}</td>
        <td>${iface.ipv6}</td>
        <td>${iface.mtu}</td>
        <td class="actions">
          <button class="btn" onclick="toggleInterface('${iface.dev}', 'up')">Up</button>
          <button class="btn" onclick="toggleInterface('${iface.dev}', 'down')">Down</button>
        </td>
      `;
      tbody.appendChild(row);
    });
    
    console.log(`Loaded ${interfaces.length} interfaces`);
    
  } catch (e) {
    console.error('Failed to load interfaces:', e);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: red;">Error: ${e}</td></tr>`;
  }
}

export function setupEventHandlers() {
  // Refresh buttons
  document.getElementById('btn-refresh')?.addEventListener('click', loadInterfaces);
  document.getElementById('btn-refresh-interfaces')?.addEventListener('click', loadInterfaces);

  // Show netplan config
  document.getElementById('btn-show-netplan')?.addEventListener('click', async () => {
    try {
      const config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
      alert(`Netplan Configuration:\n\n${config}`);
    } catch (e) {
      alert('No netplan configuration found or error reading file.');
    }
  });

  // Apply netplan
  document.getElementById('btn-apply-netplan')?.addEventListener('click', async () => {
    if (!confirm('Apply Netplan configuration? This may disrupt network connectivity.')) return;
    try {
      await run('netplan', ['apply'], { superuser: 'require' });
      alert('Netplan configuration applied successfully!');
      await loadInterfaces();
    } catch (e) {
      alert(`Failed to apply Netplan configuration: ${e}`);
    }
  });

  // Backup netplan
  document.getElementById('btn-backup-netplan')?.addEventListener('click', async () => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = `/tmp/netplan-backup-${timestamp}.tar.gz`;
      await run('tar', ['-czf', backupFile, '-C', '/etc', 'netplan/'], { superuser: 'require' });
      alert(`Backup created successfully!\n\nFile: ${backupFile}`);
    } catch (e) {
      alert(`Backup failed: ${e}`);
    }
  });

  // Ping
  document.getElementById('btn-ping')?.addEventListener('click', async () => {
    const host = document.getElementById('diag-host').value || '8.8.8.8';
    const output = document.getElementById('ping-out');
    try {
      output.textContent = 'Pinging...';
      const result = await run('ping', ['-c', '4', host]);
      output.textContent = result;
    } catch (e) {
      output.textContent = `Ping failed: ${e}`;
    }
  });
}

// Global function for interface toggling
window.toggleInterface = async function(dev, action) {
  try {
    await run('ip', ['link', 'set', dev, action], { superuser: 'require' });
    await loadInterfaces();
  } catch (e) {
    alert(`Failed to ${action} interface ${dev}: ${e}`);
  }
};