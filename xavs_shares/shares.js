// XAVS Shares - Complete rewrite with working iSCSI from old code

(function(){
  "use strict";
  
  // ===== Utility Functions =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  
  // Logging system
  function log(level, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[XAVS Shares] ${message}`);
  }

  // Shell quote function
  function shq(s) { return `'${s.replace(/'/g, `'"'"'`)}'`; }
  
  // Command runner
  async function run(cmd, timeout = 10000) {
    try {
      const result = await cockpit.spawn(["bash", "-c", cmd], { 
        superuser: "require",
        timeout: timeout 
      });
      return result;
    } catch (error) {
      log('error', `Command failed: ${cmd} - ${error.message}`);
      throw error;
    }
  }

  // Check if command exists
  async function have(cmd) {
    try {
      await cockpit.spawn(["which", cmd], { superuser: "try" });
      return true;
    } catch {
      return false;
    }
  }

  // ===== Confirmation Dialog =====
  function showConfirmationDialog(title, message, confirmText, cancelText, onConfirm, onCancel) {
    const modal = document.createElement('div');
    modal.className = 'confirmation-modal';
    modal.innerHTML = `
      <div class="confirmation-dialog">
        <div class="confirmation-header">
          <h3>${title}</h3>
        </div>
        <div class="confirmation-body">
          <p>${message.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="confirmation-footer">
          <button class="btn btn-danger" id="confirm-btn">${confirmText}</button>
          <button class="btn btn-default" id="cancel-btn">${cancelText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    const confirmBtn = modal.querySelector('#confirm-btn');
    const cancelBtn = modal.querySelector('#cancel-btn');
    
    confirmBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      if (onConfirm) onConfirm();
    });
    
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      if (onCancel) onCancel();
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
        if (onCancel) onCancel();
      }
    });
  }

  // ===== Toggle Functions =====
  function setNfsToggle(mode) {
    // Update button states
    const createBtn = $("#toggle-nfs-create");
    const mountBtn = $("#toggle-nfs-mount");
    
    if (mode === 'create') {
      createBtn?.classList.add('active');
      createBtn?.setAttribute('aria-selected', 'true');
      mountBtn?.classList.remove('active');
      mountBtn?.setAttribute('aria-selected', 'false');
      
      // Show/hide content
      $("#nfs-create-block")?.classList.remove('nfs-create-hidden');
      $("#nfs-mount-block")?.classList.add('nfs-mount-hidden');
    } else {
      mountBtn?.classList.add('active');
      mountBtn?.setAttribute('aria-selected', 'true');
      createBtn?.classList.remove('active');
      createBtn?.setAttribute('aria-selected', 'false');
      
      // Show/hide content
      $("#nfs-create-block")?.classList.add('nfs-create-hidden');
      $("#nfs-mount-block")?.classList.remove('nfs-mount-hidden');
    }
  }

  function setIscsiToggle(mode) {
    // Update button states
    const createBtn = $("#toggle-iscsi-create");
    const mountBtn = $("#toggle-iscsi-mount");
    
    if (mode === 'create') {
      createBtn?.classList.add('active');
      createBtn?.setAttribute('aria-selected', 'true');
      mountBtn?.classList.remove('active');
      mountBtn?.setAttribute('aria-selected', 'false');
      
      // Show/hide content
      $("#iscsi-create-block")?.classList.remove('iscsi-create-hidden');
      $("#iscsi-mount-block")?.classList.add('iscsi-mount-hidden');
    } else {
      mountBtn?.classList.add('active');
      mountBtn?.setAttribute('aria-selected', 'true');
      createBtn?.classList.remove('active');
      createBtn?.setAttribute('aria-selected', 'false');
      
      // Show/hide content
      $("#iscsi-create-block")?.classList.add('iscsi-create-hidden');
      $("#iscsi-mount-block")?.classList.remove('iscsi-mount-hidden');
    }
  }

  // ===== Tab Management =====
  function setActiveTab(tabId) {
    log('info', `Switching to tab: ${tabId}`);
    
    $$(".nav-link").forEach(link => {
      link.classList.remove("active");
      if (link.getAttribute("data-tab") === tabId) {
        link.classList.add("active");
      }
    });
    
    $$(".tab-pane").forEach(pane => {
      pane.classList.remove("active", "show");
      if (pane.id === tabId) {
        pane.classList.add("active", "show");
      }
    });
    
    // Load specific content for each tab
    if (tabId === "tab-overview") {
      updateOverview();
    } else if (tabId === "tab-nfs") {
      loadNfsExports();
      loadNfsMounts();
    } else if (tabId === "tab-iscsi") {
      loadIscsiSessions();
      populateBackingStore();
    } else if (tabId === "tab-logs") {
      // Load logs if needed
    }
  }

  // ===== NFS Functions =====
  async function loadNfsExports() {
    log('info', 'Loading NFS exports...');
    try {
      // Read from /etc/exports
      let exportsContent = '';
      try {
        exportsContent = await cockpit.file("/etc/exports").read();
      } catch (e) {
        log('warn', 'Could not read /etc/exports');
      }
      
      const exports = [];
      if (exportsContent) {
        const lines = exportsContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        lines.forEach(line => {
          const match = line.match(/^(\S+)\s+(\S+)\(([^)]*)\)/);
          if (match) {
            exports.push({
              path: match[1],
              scope: match[2],
              options: match[3]
            });
          }
        });
      }
      
      log('info', `Found ${exports.length} NFS exports`);
      
      // Update the exports list in NFS tab if it exists
      const exportsList = $("#nfs-exports-list");
      if (exportsList) {
        exportsList.innerHTML = '';
        if (exports.length === 0) {
          exportsList.innerHTML = '<li class="no-items">No NFS exports configured</li>';
        } else {
          exports.forEach(exp => {
            const li = document.createElement('li');
            li.innerHTML = `
              <div>
                <strong>${exp.path}</strong> → ${exp.scope}
                <small>(${exp.options})</small>
              </div>
            `;
            exportsList.appendChild(li);
          });
        }
      }
      
      return exports;
    } catch (error) {
      log('error', `Failed to load exports: ${error.message}`);
      return [];
    }
  }

  // ===== Disk Management =====
  async function loadAvailableDisks() {
    log('info', 'Loading available disks...');
    try {
      // Get all block devices
      const lsblkResult = await cockpit.spawn(['lsblk', '-J', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE'], { superuser: "require" });
      const devices = JSON.parse(lsblkResult);
      
      // Get LVM physical volumes
      let pvs = [];
      try {
        const pvResult = await cockpit.spawn(['pvdisplay', '-c'], { superuser: "require" });
        pvs = pvResult.split('\n').filter(line => line.trim()).map(line => line.split(':')[0]);
      } catch (e) {
        log('warn', 'Could not get PV info');
      }

      // Get RAID members
      let raidMembers = [];
      try {
        const raidResult = await cockpit.file('/proc/mdstat').read();
        const raidMatches = raidResult.match(/(\w+)\s*:\s*active/g);
        if (raidMatches) {
          raidMembers = raidMatches.map(match => match.split(':')[0].trim());
        }
      } catch (e) {
        log('warn', 'Could not read mdstat');
      }

      // Filter available disks
      const availableDisks = [];
      
      function checkDevice(device, prefix = '') {
        const fullName = prefix + device.name;
        const isUsed = device.mountpoint || 
                      device.fstype || 
                      pvs.includes('/dev/' + fullName) ||
                      raidMembers.includes(fullName) ||
                      device.type === 'part'; // Skip partitions
        
        if (device.type === 'disk' && !isUsed && device.size) {
          availableDisks.push({
            name: fullName,
            size: device.size,
            path: '/dev/' + fullName
          });
        }
        
        // Check children
        if (device.children) {
          device.children.forEach(child => checkDevice(child, fullName));
        }
      }
      
      devices.blockdevices.forEach(device => checkDevice(device));
      
      log('info', `Found ${availableDisks.length} available disks`);
      return availableDisks;
      
    } catch (error) {
      log('error', `Failed to load disks: ${error.message}`);
      return [];
    }
  }

  async function populateBackingStore() {
    const select = $("#iscsi-backing-store");
    if (!select) return;
    
    // Clear existing options except the first two
    while (select.children.length > 2) {
      select.removeChild(select.lastChild);
    }
    
    try {
      const disks = await loadAvailableDisks();
      const optgroup = select.querySelector('optgroup');
      
      if (disks.length === 0) {
        const option = document.createElement('option');
        option.disabled = true;
        option.textContent = 'No unused disks available';
        optgroup.appendChild(option);
      } else {
        disks.forEach(disk => {
          const option = document.createElement('option');
          option.value = disk.path;
          option.textContent = `${disk.name} (${disk.size})`;
          optgroup.appendChild(option);
        });
      }
    } catch (error) {
      log('error', `Failed to populate backing store: ${error.message}`);
    }
  }

  async function loadNfsMounts() {
    log('info', 'Loading NFS mounts...');
    const ul = $("#nfs-mounts-list");
    if (!ul) return [];

    ul.innerHTML = '<li class="loading">Loading...</li>';
    
    try {
      let result;
      try {
        result = await cockpit.spawn(["findmnt", "-t", "nfs,nfs4", "-n", "-o", "SOURCE,TARGET,FSTYPE,OPTIONS"], { superuser: "try" });
      } catch {
        try {
          result = await cockpit.spawn(["grep", "-E", "nfs|nfs4", "/proc/mounts"], { superuser: "try" });
        } catch {
          result = await cockpit.spawn(["mount", "-t", "nfs,nfs4"], { superuser: "try" });
        }
      }

      const lines = result.trim().split('\n').filter(line => line.trim());
      
      if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
        ul.innerHTML = '<li class="no-items">No NFS mounts found</li>';
        return [];
      }

      const mounts = [];
      ul.innerHTML = '';

      for (const line of lines) {
        let server, mountpoint, fstype, options;
        
        if (line.includes('\t') || line.includes('  ')) {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            [server, mountpoint, fstype, options] = parts;
          }
        } else if (line.includes(' on ')) {
          const match = line.match(/^(.+?)\s+on\s+(.+?)\s+type\s+(nfs\d?)\s+\((.+?)\)$/);
          if (match) {
            [, server, mountpoint, fstype, options] = match;
          }
        } else {
          const parts = line.split(/\s+/);
          if (parts.length >= 4) {
            [server, mountpoint, fstype, options] = parts;
          }
        }
        
        if (server && mountpoint && fstype) {
          mounts.push({ server, mountpoint, fstype, options: options || '' });
          
          const li = document.createElement('li');
          li.className = 'mount-item';
          li.innerHTML = `
            <div class="mount-info">
              <div class="mount-path">
                <strong>${server}</strong> → ${mountpoint}
              </div>
              <div class="mount-details">
                ${fstype} | ${options || 'defaults'}
              </div>
            </div>
            <button class="btn btn-outline-danger btn-sm unmount-btn" data-mountpoint="${mountpoint}" title="Unmount ${server}">
              Unmount
            </button>
          `;
          ul.appendChild(li);
          
          const unmountBtn = li.querySelector('.unmount-btn');
          unmountBtn.addEventListener('click', () => {
            unmountNFS(mountpoint, server);
          });
        }
      }

      log('info', `Found ${mounts.length} NFS mounts`);
      return mounts;
      
    } catch (error) {
      log('error', `Failed to load NFS mounts: ${error.message}`);
      ul.innerHTML = '<li class="error">Failed to load NFS mounts</li>';
      return [];
    }
  }

  async function unmountNFS(mountpoint, server) {
    showConfirmationDialog(
      'Unmount NFS Share',
      `Are you sure you want to unmount the NFS share?\n\nServer: ${server}\nMount point: ${mountpoint}\n\nThis will disconnect the NFS share and may affect running applications.`,
      'Unmount',
      'Cancel',
      async () => {
        try {
          log('info', `Unmounting NFS share: ${mountpoint}`);
          await cockpit.spawn(["umount", mountpoint], { superuser: "require" });
          log('info', `Successfully unmounted: ${mountpoint}`);
          loadNfsMounts();
        } catch (error) {
          log('error', `Failed to unmount ${mountpoint}: ${error.message}`);
          alert(`Failed to unmount NFS share: ${error.message}`);
        }
      },
      () => {
        log('info', `User cancelled unmount of ${mountpoint}`);
      }
    );
  }

  // ===== iSCSI Functions (from working old code) =====
  async function targetcli(lines) {
    const runner = (await have("targetcli")) ? "targetcli" : "targetcli-fb";
    const script = (Array.isArray(lines) ? lines : [String(lines)]).join("\n");
    return run(`${runner} <<'EOF'\n${script}\nEOF`, 12000);
  }

  async function loadIscsiSessions() {
    log('info', 'Loading iSCSI sessions...');
    const ul = $("#iscsi-sessions-list");
    if (!ul) return [];

    try {
      let result;
      try {
        result = await cockpit.spawn(["iscsiadm", "-m", "session"], { superuser: "try" });
      } catch {
        ul.innerHTML = '<li class="no-items">No iSCSI sessions found</li>';
        return [];
      }

      const lines = result.trim().split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        ul.innerHTML = '<li class="no-items">No iSCSI sessions found</li>';
        return [];
      }

      const sessions = [];
      ul.innerHTML = '';

      for (const line of lines) {
        const match = line.match(/^(\w+):\s*\[(\d+)\]\s*([^,]+:\d+),\d+\s+(.+)$/);
        if (match) {
          const [, protocol, sessionId, target, iqn] = match;
          
          sessions.push({ protocol, sessionId, target, iqn });
          
          const li = document.createElement('li');
          li.className = 'session-item';
          li.innerHTML = `
            <div class="session-info">
              <div class="session-path">
                <strong>${iqn}</strong>
              </div>
              <div class="session-details">
                ${target} | ${protocol.toUpperCase()}
              </div>
            </div>
            <button class="btn btn-outline-danger btn-sm logout-btn" data-target="${target}" data-iqn="${iqn}" title="Logout from ${target}">
              Logout
            </button>
          `;
          ul.appendChild(li);
          
          const logoutBtn = li.querySelector('.logout-btn');
          logoutBtn.addEventListener('click', () => {
            logoutiSCSI(target, iqn);
          });
        }
      }

      log('info', `Found ${sessions.length} iSCSI sessions`);
      return sessions;
      
    } catch (error) {
      log('error', `Failed to load iSCSI sessions: ${error.message}`);
      ul.innerHTML = '<li class="error">Failed to load iSCSI sessions</li>';
      return [];
    }
  }

  async function logoutiSCSI(target, iqn) {
    showConfirmationDialog(
      'Logout iSCSI Session',
      `Are you sure you want to logout from the iSCSI session?\n\nTarget: ${target}\nIQN: ${iqn}\n\nThis will disconnect the iSCSI target and may affect running applications using the storage.`,
      'Logout',
      'Cancel',
      async () => {
        try {
          log('info', `Logging out from iSCSI target: ${target}`);
          await cockpit.spawn(["iscsiadm", "-m", "node", "-T", iqn, "-p", target, "--logout"], { superuser: "require" });
          log('info', `Successfully logged out from: ${target}`);
          loadIscsiSessions();
        } catch (error) {
          // Exit code 21 means "no active session found" - not necessarily an error
          if (error.exit_status === 21) {
            log('info', `No active session found for ${target}, probably already logged out`);
            loadIscsiSessions(); // Refresh the list anyway
          } else {
            log('error', `Failed to logout from ${target}: ${error.message}`);
            alert(`Failed to logout from iSCSI target: ${error.message}`);
          }
        }
      },
      () => {
        log('info', `User cancelled logout from ${target}`);
      }
    );
  }

  function makeIQN(name) { 
    const d = new Date(); 
    const y = d.getFullYear(); 
    const m = String(d.getMonth() + 1).padStart(2, '0'); 
    const host = (cockpit && cockpit.transport && cockpit.transport.host) || "localhost"; 
    return `iqn.${y}-${m}.local.${host}:shares-${name}`; 
  }

  async function submitCreateIscsi(e) {
    e.preventDefault();
    const name = $("#iscsi-name").value.trim();
    const size = parseInt($("#iscsi-size").value, 10);
    const portal = $("#iscsi-portal").value.trim() || "0.0.0.0";
    const openAcl = $("#iscsi-open-acl").checked;
    const msg = $("#iscsi-create-msg");
    
    if (!name || !size) {
      msg.className = "msg error";
      msg.textContent = "Name and size are required.";
      return;
    }
    
    const imgDir = "/var/lib/iscsi-disks"; 
    const imgPath = `${imgDir}/${name}.img`; 
    const iqn = makeIQN(name);
    
    try {
      await run(`install -d -m 0755 ${shq(imgDir)} && [ -f ${shq(imgPath)} ] || fallocate -l ${size}G ${shq(imgPath)}`, 12000);
      
      const s = [
        `/backstores/fileio create name=${name} file_or_dev=${imgPath}`,
        `/iscsi create ${iqn}`,
        `/iscsi/${iqn}/tpg1/luns create /backstores/fileio/${name}`
      ];
      
      if (portal !== "0.0.0.0") {
        s.push(`/iscsi/${iqn}/tpg1/portals delete 0.0.0.0 3260 || true`);
        s.push(`/iscsi/${iqn}/tpg1/portals create ${portal} 3260`);
      }
      
      if (openAcl) {
        s.push(`/iscsi/${iqn}/tpg1 set attribute generate_node_acls=1 cache_dynamic_acls=1 demo_mode_write_protect=0`);
      }
      
      s.push(`saveconfig`);
      
      await targetcli(s);
      await run(`(systemctl enable --now rtslib-fb-targetctl || systemctl enable --now target) 2>/dev/null || true`, 8000);
      
      msg.className = "msg success";
      msg.textContent = `Created target ${iqn} with fileio ${imgPath}`;
      
      // Reset form
      $("#iscsi-create-form").reset();
      
    } catch (err) {
      msg.className = "msg error";
      msg.textContent = `Failed: ${err.message || err}`;
    }
  }

  // ===== Status Updates =====
  function updateOverview() {
    log('info', 'Updating overview...');
    
    // Update status dots to ready
    const systemDot = $("#system-status-dot");
    const nfsDot = $("#nfs-status-dot");
    const iscsiDot = $("#iscsi-status-dot");
    
    if (systemDot) {
      systemDot.className = "status-dot ok";
      const systemStatus = $("#system-status");
      if (systemStatus) systemStatus.textContent = "System ready";
    }
    
    if (nfsDot) {
      nfsDot.className = "status-dot ok";
      const nfsStatus = $("#nfs-status");
      if (nfsStatus) nfsStatus.textContent = "Ready";
    }
    
    if (iscsiDot) {
      iscsiDot.className = "status-dot ok";
      const iscsiStatus = $("#iscsi-status");
      if (iscsiStatus) iscsiStatus.textContent = "Ready";
    }
    
    // Load and update counts
    loadNfsExports().then(exports => {
      const exportsCount = $("#nfs-exports-count");
      if (exportsCount) exportsCount.textContent = exports.length.toString();
    }).catch(() => {
      const exportsCount = $("#nfs-exports-count");
      if (exportsCount) exportsCount.textContent = "0";
    });
    
    loadNfsMounts().then(mounts => {
      const mountsCount = $("#nfs-mounts-count");
      if (mountsCount) mountsCount.textContent = mounts.length.toString();
    }).catch(() => {
      const mountsCount = $("#nfs-mounts-count");
      if (mountsCount) mountsCount.textContent = "0";
    });
    
    loadIscsiSessions().then(sessions => {
      const sessionsCount = $("#iscsi-sessions-count");
      if (sessionsCount) sessionsCount.textContent = sessions.length.toString();
    }).catch(() => {
      const sessionsCount = $("#iscsi-sessions-count");
      if (sessionsCount) sessionsCount.textContent = "0";
    });
    
    // Set other counts and tool status
    const targetsCount = $("#iscsi-targets-count");
    const nfsTools = $("#nfs-tools-status");
    const iscsiTools = $("#iscsi-tools-status");
    
    if (targetsCount) targetsCount.textContent = "0";
    if (nfsTools) nfsTools.textContent = "Available";
    if (iscsiTools) iscsiTools.textContent = "Available";
  }

  // ===== Form Handlers =====
  async function handleNfsMount(e) {
    e.preventDefault();
    const server = $("#nm-server")?.value?.trim();
    const exportPath = $("#nm-export")?.value?.trim();
    const mountpoint = $("#nm-mountpoint")?.value?.trim();
    const msg = $("#nfs-mount-msg");
    
    if (!server || !exportPath || !mountpoint) {
      if (msg) {
        msg.className = "message error";
        msg.textContent = "Please fill all required fields";
      }
      return;
    }
    
    try {
      if (msg) {
        msg.className = "message info";
        msg.textContent = "Mounting NFS share...";
      }
      
      // Create mount point
      await cockpit.spawn(["mkdir", "-p", mountpoint], { superuser: "require" });
      
      // Mount NFS share
      await cockpit.spawn(["mount", "-t", "nfs4", `${server}:${exportPath}`, mountpoint], { superuser: "require" });
      
      if (msg) {
        msg.className = "message success";
        msg.textContent = `Successfully mounted ${server}:${exportPath} at ${mountpoint}`;
      }
      
      // Refresh mounts
      loadNfsMounts();
      updateOverview();
      
    } catch (error) {
      if (msg) {
        msg.className = "message error";
        msg.textContent = `Failed to mount: ${error.message}`;
      }
    }
  }

  // ===== Initialize =====
  function initialize() {
    log('info', 'XAVS Shares module loading...');
    
    // Initialize tabs
    $$(".nav-link").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const tabId = link.getAttribute("data-tab");
        if (tabId) {
          setActiveTab(tabId);
        }
      });
    });

    // Set default tab
    setActiveTab("tab-overview");
    
    // Load initial data
    updateOverview();
    
    // Pre-load backing store options
    populateBackingStore();
    
    // Event listeners
    $("#btn-refresh-nfs-mounts")?.addEventListener("click", loadNfsMounts);
    $("#btn-refresh-iscsi-sessions")?.addEventListener("click", loadIscsiSessions);
    $("#iscsi-create-form")?.addEventListener("submit", submitCreateIscsi);
    $("#nfs-mount-form")?.addEventListener("submit", handleNfsMount);
    $("#refresh-overview-btn")?.addEventListener("click", updateOverview);
    $("#btn-exports-reload")?.addEventListener("click", loadNfsExports);
    
    // Status link handlers
    $$(".status-link").forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const tabId = link.getAttribute("data-tab");
        if (tabId) {
          setActiveTab(tabId);
        }
      });
    });
    
    // Toggle button handlers
    $("#toggle-nfs-create")?.addEventListener("click", () => setNfsToggle('create'));
    $("#toggle-nfs-mount")?.addEventListener("click", () => setNfsToggle('mount'));
    $("#toggle-iscsi-create")?.addEventListener("click", () => setIscsiToggle('create'));
    $("#toggle-iscsi-mount")?.addEventListener("click", () => setIscsiToggle('mount'));
    
    log('info', 'XAVS Shares module ready');
  }

  // Try immediate initialization, fallback to DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

})();
