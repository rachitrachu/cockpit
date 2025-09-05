// XAVS Shares - Complete rewrite with working iSCSI from old code

(function(){
  "use strict";
  
  // ===== Utility Functions =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  
  // Logging system
  let systemStatus = 'ready'; // 'ready', 'not-ready', 'working'
  let activityLog = [];
  const MAX_LOG_ENTRIES = 100;
  
  // Mount tracking system
  let activeMounts = new Map(); // Track active mounts: device -> {mountpoint, type, iqn, portal}
  
  function log(level, message) {
    const timestamp = new Date();
    const timeStr = timestamp.toLocaleTimeString();
    
    // Console logging removed - GUI logging only
    
    // Add to activity log
    activityLog.push({
      time: timestamp,
      level: level,
      message: message,
      timeStr: timeStr
    });
    
    // Keep only recent entries
    if (activityLog.length > MAX_LOG_ENTRIES) {
      activityLog = activityLog.slice(-MAX_LOG_ENTRIES);
    }
    
    // Update status bar with latest message
    updateStatusBar(message, level);
    
    // Update log display if visible
    updateLogDisplay();
    
    // Add to new-style log container
    addToLog(message, level);
  }
  
  // New xAVS Globals style logging function
  function addToLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logContainer = document.getElementById("log-container");
    
    if (logContainer) {
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry log-${type}`;
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'log-time';
      timeSpan.textContent = timestamp;
      
      const messageSpan = document.createElement('span');
      messageSpan.className = 'log-message';
      messageSpan.textContent = message;
      
      logEntry.appendChild(timeSpan);
      logEntry.appendChild(messageSpan);
      logContainer.appendChild(logEntry);
      logContainer.scrollTop = logContainer.scrollHeight;
      
      // Limit to 100 entries
      const entries = logContainer.querySelectorAll('.log-entry');
      if (entries.length > 100) {
        entries[0].remove();
      }
    }
  }
  
  function updateStatusBar(message, level) {
    const statusText = document.getElementById("recent-activity");
    if (!statusText) return;
    
    // Determine system status
    if (level === 'error') {
      systemStatus = 'not-ready';
    } else if (message.includes('Checking') || message.includes('Loading') || message.includes('Creating') || message.includes('Mounting') || message.includes('Logging in') || message.includes('Refreshing')) {
      systemStatus = 'working';
    } else if (systemStatus === 'working' && (message.includes('Success') || message.includes('completed') || message.includes('Found') || message.includes('No ') || message.includes('ready'))) {
      systemStatus = 'ready';
    }
    
    // Update status text and class
    const statusBar = document.querySelector('.bottom-status-bar');
    if (statusBar) {
      statusBar.className = statusBar.className.replace(/status-(info|success|warning|error)/g, '');
      if (level === 'error') statusBar.classList.add('status-error');
      else if (level === 'warn') statusBar.classList.add('status-warning');
      else if (level === 'success') statusBar.classList.add('status-success');
      else statusBar.classList.add('status-info');
    }
    
    // Always show the current message
    statusText.textContent = message.length > 50 ? message.substring(0, 47) + '...' : message;
    
    // Force update the display (in case of CSS conflicts)
    statusText.style.display = 'inline';
  }
  
  function updateLogDisplay() {
    const logDisplay = $("#log-display");
    if (!logDisplay) return;
    
    let logContent = '';
    activityLog.forEach(entry => {
      const levelClass = `log-${entry.level}`;
      logContent += `<span class="${levelClass}">[${entry.timeStr}] ${entry.message}</span>\n`;
    });
    
    logDisplay.innerHTML = logContent;
    // Auto-scroll to bottom
    logDisplay.scrollTop = logDisplay.scrollHeight;
  }
  
  function clearActivityLog() {
    activityLog = [];
    updateLogDisplay();
    
    // Clear new-style log container
    const logContainer = document.getElementById("log-container");
    if (logContainer) {
      logContainer.innerHTML = `
        <div class="log-entry log-info">
          <span class="log-time">System</span>
          <span class="log-message">Log cleared</span>
        </div>
      `;
    }
    
    log('info', 'Activity log cleared');
  }

  // Mount tracking functions
  function addMountTracking(device, mountpoint, type, iqn = null, portal = null) {
    activeMounts.set(device, {
      mountpoint: mountpoint,
      type: type,
      iqn: iqn,
      portal: portal,
      timestamp: new Date()
    });
    
    // Save to localStorage for persistence
    const mountData = {};
    activeMounts.forEach((value, key) => {
      mountData[key] = value;
    });
    localStorage.setItem('xavs-active-mounts', JSON.stringify(mountData));
    
    log('info', `Mount tracking added: ${device} -> ${mountpoint} (${type})`);
  }
  
  function removeMountTracking(device) {
    if (activeMounts.has(device)) {
      const mountInfo = activeMounts.get(device);
      activeMounts.delete(device);
      
      // Update localStorage
      const mountData = {};
      activeMounts.forEach((value, key) => {
        mountData[key] = value;
      });
      localStorage.setItem('xavs-active-mounts', JSON.stringify(mountData));
      
      log('info', `Mount tracking removed: ${device} -> ${mountInfo.mountpoint}`);
      return mountInfo;
    }
    return null;
  }
  
  function loadMountTracking() {
    try {
      const stored = localStorage.getItem('xavs-active-mounts');
      if (stored) {
        const mountData = JSON.parse(stored);
        activeMounts.clear();
        Object.entries(mountData).forEach(([device, info]) => {
          activeMounts.set(device, info);
        });
        log('info', `Loaded ${activeMounts.size} tracked mounts from storage`);
      }
    } catch (error) {
      log('warn', `Failed to load mount tracking: ${error.message}`);
      activeMounts.clear();
    }
  }
  
  function getMountByDevice(device) {
    return activeMounts.get(device);
  }
  
  function getMountByIqn(iqn) {
    for (const [device, mountInfo] of activeMounts) {
      if (mountInfo.iqn === iqn) {
        return { device, ...mountInfo };
      }
    }
    return null;
  }
  
  function validateMountPoint(mountpoint) {
    // Check if mountpoint is already in use by another device
    for (const [device, mountInfo] of activeMounts) {
      if (mountInfo.mountpoint === mountpoint) {
        throw new Error(`Mount point ${mountpoint} is already in use by device ${device}. Please choose a different mount point.`);
      }
    }
    
    // Additional validation
    if (!mountpoint.startsWith('/')) {
      throw new Error('Mount point must be an absolute path starting with /');
    }
    
    if (mountpoint === '/' || mountpoint === '/boot' || mountpoint === '/proc' || mountpoint === '/sys') {
      throw new Error('Cannot mount to system directories');
    }
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

  // ===== Message Display Utility =====
  function showMessage(message, type = 'info') {
    // Create or update global message area
    let messageDiv = $("#global-message");
    if (!messageDiv) {
      messageDiv = document.createElement('div');
      messageDiv.id = 'global-message';
      messageDiv.className = 'alert';
      
      // Insert after topbar
      const topbar = $(".topbar");
      if (topbar && topbar.parentNode) {
        topbar.parentNode.insertBefore(messageDiv, topbar.nextSibling);
      } else {
        document.body.insertBefore(messageDiv, document.body.firstChild);
      }
    }
    
    // Set message content and type
    messageDiv.className = `alert alert-${type === 'error' ? 'danger' : type}`;
    messageDiv.textContent = message;
    messageDiv.style.display = 'block';
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        if (messageDiv && messageDiv.parentNode) {
          messageDiv.style.display = 'none';
        }
      }, 5000);
    }
  }

  // ===== Package and Service Detection =====
  async function have(cmd) {
    try {
      await cockpit.spawn(["which", cmd], { superuser: "try" });
      return true;
    } catch {
      return false;
    }
  }

  async function getOsInfo() {
    try {
      const osRelease = await cockpit.file("/etc/os-release").read();
      const lines = osRelease.split('\n');
      const info = {};
      
      lines.forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          info[key] = value.replace(/"/g, '');
        }
      });
      
      return info;
    } catch {
      return { ID: 'unknown' };
    }
  }

  function showInstallHelp(type, osInfo) {
    let command, title, description;
    const osId = osInfo.ID || 'unknown';
    
    if (type === 'nfs') {
      title = 'Install NFS Tools';
      description = 'Run this command to install NFS tools:';
      
      if (['ubuntu', 'debian'].includes(osId)) {
        command = 'sudo apt install nfs-kernel-server';
      } else if (['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(osId)) {
        const manager = osId === 'fedora' ? 'dnf' : 'yum';
        command = `sudo ${manager} install nfs-utils`;
      } else if (['opensuse', 'sles'].includes(osId)) {
        command = 'sudo zypper install nfs-kernel-server';
      } else if (['arch', 'manjaro'].includes(osId)) {
        command = 'sudo pacman -S nfs-utils';
      } else {
        command = '# Install NFS server tools using your distribution package manager';
      }
      
    } else if (type === 'iscsi') {
      title = 'Install iSCSI Tools';
      description = 'Run this command to install iSCSI tools:';
      
      if (['ubuntu', 'debian'].includes(osId)) {
        command = 'sudo apt install targetcli-fb open-iscsi';
      } else if (['fedora', 'rhel', 'centos', 'rocky', 'almalinux'].includes(osId)) {
        const manager = osId === 'fedora' ? 'dnf' : 'yum';
        command = `sudo ${manager} install targetcli iscsi-initiator-utils`;
      } else if (['opensuse', 'sles'].includes(osId)) {
        command = 'sudo zypper install targetcli-fb open-iscsi';
      } else if (['arch', 'manjaro'].includes(osId)) {
        command = 'sudo pacman -S targetcli-fb open-iscsi';
      } else {
        command = '# Install iSCSI target and initiator tools using your distribution package manager';
      }
    }
    
    const modal = document.createElement('div');
    modal.className = 'install-help-modal';
    modal.innerHTML = `
      <div class="install-help-dialog">
        <div class="install-help-header">
          <h3><i class="fa fa-download"></i> ${title}</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="install-help-body">
          <p>${description}</p>
          <div class="install-command">
            <pre><code>${command}</code></pre>
            <button class="btn btn-outline-secondary copy-btn" title="Copy to clipboard">
              <i class="fa fa-copy"></i> Copy
            </button>
          </div>
          <p><small><strong>Note:</strong> After installation, you may need to start and enable the services.</small></p>
        </div>
        <div class="install-help-footer">
          <button class="btn btn-default close-help-btn">Close</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Event listeners
    const closeBtn = modal.querySelector('.close-btn');
    const closeHelpBtn = modal.querySelector('.close-help-btn');
    const copyBtn = modal.querySelector('.copy-btn');
    
    const closeModal = () => document.body.removeChild(modal);
    
    closeBtn.addEventListener('click', closeModal);
    closeHelpBtn.addEventListener('click', closeModal);
    
    copyBtn.addEventListener('click', () => {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(command).then(() => {
          copyBtn.innerHTML = '<i class="fa fa-check"></i> Copied!';
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa fa-copy"></i> Copy';
          }, 2000);
        }).catch(() => {
          // Fallback to textarea selection method
          fallbackCopy(command, copyBtn);
        });
      } else {
        // Fallback for older browsers
        fallbackCopy(command, copyBtn);
      }
    });
    
    // Fallback copy function
    function fallbackCopy(text, button) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          button.innerHTML = '<i class="fa fa-check"></i> Copied!';
          setTimeout(() => {
            button.innerHTML = '<i class="fa fa-copy"></i> Copy';
          }, 2000);
        } else {
          button.innerHTML = '<i class="fa fa-exclamation"></i> Failed';
          setTimeout(() => {
            button.innerHTML = '<i class="fa fa-copy"></i> Copy';
          }, 2000);
        }
      } catch (err) {
        button.innerHTML = '<i class="fa fa-exclamation"></i> Failed';
        setTimeout(() => {
          button.innerHTML = '<i class="fa fa-copy"></i> Copy';
        }, 2000);
      }
      
      document.body.removeChild(textarea);
    }
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  async function checkNfsTools() {
    try {
      // Check for NFS server tools
      const hasExportfs = await have("exportfs");
      const hasNfsServer = await have("rpc.nfsd");
      return hasExportfs && hasNfsServer;
    } catch {
      return false;
    }
  }

  async function checkIscsiTools() {
    try {
      // Check for iSCSI tools
      const hasTargetcli = await have("targetcli") || await have("targetcli-fb");
      const hasIscsiadm = await have("iscsiadm");
      return hasTargetcli && hasIscsiadm;
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
        
        // Load content when switching to specific tabs
        if (tabId === "tab-logs") {
          updateLogDisplay(); // Show current activity log
        } else if (tabId === "tab-overview") {
          updateOverview();
        }
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
      loadIscsiTargets();
      populateBackingStore();
    } else if (tabId === "tab-logs") {
      loadSystemLogs();
    }
  }

  // ===== NFS Functions =====
  async function loadNfsExports() {
    log('info', 'Checking NFS exports...');
    try {
      // Read from /etc/exports
      let exportsContent = '';
      try {
        exportsContent = await cockpit.file("/etc/exports").read();
      } catch (e) {
        log('warn', 'Could not read NFS exports configuration');
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
      
      if (exports.length === 0) {
        log('info', 'No NFS exports found');
      } else {
        log('info', `Found ${exports.length} NFS export${exports.length > 1 ? 's' : ''}`);
      }
      
      // Update the exports list in NFS tab if it exists
      const exportsList = $("#nfs-exports-list");
      if (exportsList) {
        exportsList.innerHTML = '';
        if (exports.length === 0) {
          exportsList.innerHTML = '<li class="no-items">No NFS exports configured</li>';
        } else {
          exports.forEach((exp, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
              <div class="export-item">
                <div class="export-info">
                  <strong>${exp.path}</strong> → ${exp.scope}
                  <small>(${exp.options})</small>
                </div>
                <button class="btn btn-sm btn-outline-danger delete-export-btn" data-path="${exp.path}" data-scope="${exp.scope}" title="Delete export">
                  <i class="fa fa-trash"></i>
                </button>
              </div>
            `;
            exportsList.appendChild(li);
          });
          
          // Add event listeners for delete buttons
          exportsList.querySelectorAll('.delete-export-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const path = e.currentTarget.dataset.path;
              const scope = e.currentTarget.dataset.scope;
              
              // Show confirmation dialog
              if (await showConfirmDialog('Delete NFS Export', 
                  `Are you sure you want to delete the export:\n${path} → ${scope}\n\nThis action cannot be undone.`)) {
                await deleteNfsExport(path, scope);
              }
            });
          });
        }
      }
      
      return exports;
    } catch (error) {
      log('error', `Failed to load exports: ${error.message}`);
      return [];
    }
  }

  // ===== NFS Export Deletion =====
  async function deleteNfsExport(path, scope) {
    try {
      log('info', `Deleting NFS export: ${path} → ${scope}`);
      
      // Read current exports
      let exportsContent = '';
      try {
        exportsContent = await cockpit.file("/etc/exports").read();
      } catch (e) {
        log('warn', 'Could not read /etc/exports');
        return;
      }
      
      // Remove the specific export line
      const lines = exportsContent.split('\n');
      const filteredLines = lines.filter(line => {
        if (line.trim() && !line.startsWith('#')) {
          const match = line.match(/^(\S+)\s+(\S+)\(([^)]*)\)/);
          if (match) {
            return !(match[1] === path && match[2] === scope);
          }
        }
        return true;
      });
      
      // Write back to /etc/exports
      const newContent = filteredLines.join('\n');
      await cockpit.file("/etc/exports").replace(newContent);
      
      // Reload NFS exports to refresh the daemon
      try {
        await cockpit.spawn(['exportfs', '-ra'], { superuser: "require" });
        log('info', 'NFS exports reloaded successfully');
      } catch (e) {
        log('warn', 'Could not reload NFS exports daemon');
      }
      
      // Refresh the UI
      await loadNfsExports();
      showMessage('NFS export deleted successfully', 'success');
      
    } catch (error) {
      log('error', `Failed to delete NFS export: ${error.message}`);
      showMessage(`Failed to delete export: ${error.message}`, 'error');
    }
  }

  // ===== Confirmation Dialog =====
  function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'install-help-modal';
      modal.innerHTML = `
        <div class="install-help-dialog">
          <div class="install-help-header">
            <h3><i class="fa fa-exclamation-triangle"></i> ${title}</h3>
          </div>
          <div class="install-help-body">
            <p style="white-space: pre-line;">${message}</p>
          </div>
          <div class="install-help-footer">
            <button class="btn btn-outline-secondary cancel-btn">Cancel</button>
            <button class="btn btn-danger confirm-btn" style="margin-left: 8px;">Delete</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      const cancelBtn = modal.querySelector('.cancel-btn');
      const confirmBtn = modal.querySelector('.confirm-btn');
      
      const closeModal = (result) => {
        document.body.removeChild(modal);
        resolve(result);
      };
      
      cancelBtn.addEventListener('click', () => closeModal(false));
      confirmBtn.addEventListener('click', () => closeModal(true));
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(false);
      });
    });
  }

  // ===== Disk Management =====
  async function loadAvailableDisks() {
    log('info', 'Checking available disks...');
    try {
      // Get all block devices with detailed info
      const lsblkResult = await cockpit.spawn(['lsblk', '-J', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,PKNAME'], { superuser: "require" });
      const devices = JSON.parse(lsblkResult);
      
      // Get LVM physical volumes
      let pvs = [];
      try {
        const pvResult = await cockpit.spawn(['pvdisplay', '-c'], { superuser: "require" });
        pvs = pvResult.split('\n').filter(line => line.trim()).map(line => {
          const parts = line.split(':');
          return parts[0]; // PV device path
        });
        log('info', `Found PVs: ${pvs.join(', ')}`);
      } catch (e) {
        log('warn', 'Could not get PV info (LVM may not be available)');
      }

      // Get RAID members
      let raidMembers = [];
      try {
        const raidResult = await cockpit.file('/proc/mdstat').read();
        const raidMatches = raidResult.match(/(\w+)\s*:\s*active/g);
        if (raidMatches) {
          raidMembers = raidMatches.map(match => match.split(':')[0].trim());
        }
        log('info', `Found RAID members: ${raidMembers.join(', ')}`);
      } catch (e) {
        log('warn', 'Could not read mdstat');
      }

      // Get mounted filesystems to identify boot/system disks
      let mountedDevices = [];
      try {
        const mountResult = await cockpit.spawn(['mount'], { superuser: "require" });
        mountedDevices = mountResult.split('\n')
          .filter(line => line.startsWith('/dev/'))
          .map(line => line.split(' ')[0]);
        log('info', `Found mounted devices: ${mountedDevices.join(', ')}`);
      } catch (e) {
        log('warn', 'Could not get mount info');
      }

      const availableDisks = [];
      
      function hasChildrenInUse(device) {
        if (!device.children) return false;
        
        return device.children.some(child => {
          const childPath = `/dev/${child.name}`;
          return child.mountpoint || 
                 child.fstype || 
                 pvs.includes(childPath) ||
                 raidMembers.includes(child.name) ||
                 mountedDevices.includes(childPath) ||
                 hasChildrenInUse(child);
        });
      }
      
      function checkDevice(device) {
        const devicePath = `/dev/${device.name}`;
        
        // Skip if not a disk
        if (device.type !== 'disk') return;
        
        // Skip if size is 0 or null
        if (!device.size || device.size === '0B') {
          log('info', `Skipping ${device.name}: zero size`);
          return;
        }
        
        // Skip if device itself is mounted
        if (device.mountpoint) {
          log('info', `Skipping ${device.name}: mounted at ${device.mountpoint}`);
          return;
        }
        
        // Skip if device has filesystem
        if (device.fstype) {
          log('info', `Skipping ${device.name}: has filesystem ${device.fstype}`);
          return;
        }
        
        // Skip if device is a PV
        if (pvs.includes(devicePath)) {
          log('info', `Skipping ${device.name}: is LVM physical volume`);
          return;
        }
        
        // Skip if device is in RAID
        if (raidMembers.includes(device.name)) {
          log('info', `Skipping ${device.name}: is RAID member`);
          return;
        }
        
        // Skip if any children are in use (partitioned disks with active partitions)
        if (hasChildrenInUse(device)) {
          log('info', `Skipping ${device.name}: has partitions in use`);
          return;
        }
        
        // Parse size to get actual bytes for validation
        const sizeInBytes = parseSizeToBytes(device.size);
        
        availableDisks.push({
          name: device.name,
          size: device.size,
          path: devicePath,
          sizeInBytes: sizeInBytes
        });
        
        log('info', `Available disk: ${device.name} (${device.size})`);
      }
      
      devices.blockdevices.forEach(device => checkDevice(device));
      
      log('info', `Found ${availableDisks.length} truly available disks`);
      return availableDisks;
      
    } catch (error) {
      log('error', `Failed to load disks: ${error.message}`);
      return [];
    }
  }

  // Helper function to parse size strings to bytes
  function parseSizeToBytes(sizeStr) {
    if (!sizeStr || sizeStr === '0B') return 0;
    
    const units = {
      'B': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024,
      'P': 1024 * 1024 * 1024 * 1024 * 1024
    };
    
    const match = sizeStr.match(/^([\d.]+)([KMGTP]?)B?$/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase() || 'B';
    
    return Math.floor(value * (units[unit] || 1));
  }

  async function populateBackingStore() {
    const select = $("#iscsi-backing-store");
    if (!select) {
      log('warn', 'Backing store select element not found');
      return;
    }
    
    log('info', 'Populating backing store options...');
    
    try {
      const disks = await loadAvailableDisks();
      let optgroup = select.querySelector('optgroup');
      
      if (!optgroup) {
        log('warn', 'Optgroup not found, creating one');
        optgroup = document.createElement('optgroup');
        optgroup.label = 'Available Disks (WARNING: Will be completely wiped!)';
        select.appendChild(optgroup);
      }
      
      // Clear optgroup contents
      optgroup.innerHTML = '';
      
      if (disks.length === 0) {
        const option = document.createElement('option');
        option.disabled = true;
        option.textContent = 'No unused disks available';
        optgroup.appendChild(option);
        log('info', 'No unused disks found');
      } else {
        log('info', `Adding ${disks.length} disks to backing store options`);
        disks.forEach(disk => {
          const option = document.createElement('option');
          option.value = disk.path;
          option.textContent = `${disk.name} (${disk.size})`;
          optgroup.appendChild(option);
          log('info', `Added disk: ${disk.name} (${disk.size})`);
        });
      }
      
      // Add event listener to show/hide warning based on selection (only once)
      if (!select.hasAttribute('data-listener-added')) {
        select.addEventListener('change', async (e) => {
          const warningDiv = $("#iscsi-disk-warning");
          const fileOptionsDiv = $("#iscsi-file-options");
          const sizeInput = $("#iscsi-size");
          const selectedValue = e.target.value;
          
          log('info', `Backing store selection changed to: ${selectedValue}`);
          
          if (selectedValue === 'file') {
            // File-based storage - show file options, hide disk warning
            if (fileOptionsDiv) fileOptionsDiv.classList.remove('hidden');
            if (warningDiv) warningDiv.classList.add('hidden');
            
            // Reset size input constraints for file-based
            if (sizeInput) {
              sizeInput.removeAttribute('max');
              sizeInput.title = '';
              sizeInput.required = true; // Size required for file-based
            }
            
            // Remove disk capacity hint
            const hint = select.parentNode.querySelector('.disk-capacity-hint');
            if (hint) hint.remove();
            
            log('info', 'Showing file options');
            
          } else if (selectedValue && selectedValue !== '') {
            // Disk-based storage - hide file options, show disk warning
            if (fileOptionsDiv) fileOptionsDiv.classList.add('hidden');
            if (warningDiv) warningDiv.classList.remove('hidden');
            
            // Size is optional for disk-based
            if (sizeInput) sizeInput.required = false;
            
            log('info', 'Showing disk warning');
            
            // Find the selected disk and update size constraint
            const availableDisks = await loadAvailableDisks();
            const selectedDisk = availableDisks.find(disk => disk.path === selectedValue);
            
            if (selectedDisk && sizeInput) {
              const maxSizeGB = Math.floor(selectedDisk.sizeInBytes / (1024 * 1024 * 1024) * 0.99);
              sizeInput.max = maxSizeGB;
              sizeInput.title = `Maximum size: ${maxSizeGB}GB (99% of ${selectedDisk.size}) - leave empty to use entire disk`;
              
              // Update or create hint about disk capacity
              let hint = select.parentNode.querySelector('.disk-capacity-hint');
              if (!hint) {
                hint = document.createElement('div');
                hint.className = 'hint disk-capacity-hint';
                select.parentNode.appendChild(hint);
              }
              hint.textContent = `Disk capacity: ${selectedDisk.size} (max usable: ${maxSizeGB}GB) - leave size empty to use entire disk`;
              hint.style.color = 'var(--brand)';
            }
            
          } else {
            // No selection - hide both options
            if (fileOptionsDiv) fileOptionsDiv.classList.add('hidden');
            if (warningDiv) warningDiv.classList.add('hidden');
            
            if (sizeInput) {
              sizeInput.removeAttribute('max');
              sizeInput.title = '';
              sizeInput.required = false;
            }
            
            // Remove disk capacity hint
            const hint = select.parentNode.querySelector('.disk-capacity-hint');
            if (hint) hint.remove();
            
            log('info', 'Hiding all options');
          }
        });
        select.setAttribute('data-listener-added', 'true');
      }
      
      // Initialize warning and file options visibility
      const warningDiv = $("#iscsi-disk-warning");
      const fileOptionsDiv = $("#iscsi-file-options");
      
      if (warningDiv) {
        warningDiv.classList.add('hidden'); // Hide by default
        log('info', 'Initialized warning div to hidden');
      } else {
        log('warn', 'Warning div not found during initialization');
      }
      
      if (fileOptionsDiv) {
        fileOptionsDiv.classList.add('hidden'); // Hide by default until file is selected
        log('info', 'Initialized file options div to hidden');
      } else {
        log('warn', 'File options div not found during initialization');
      }
      
    } catch (error) {
      log('error', `Failed to populate backing store: ${error.message}`);
    }
  }

  async function loadNfsMounts() {
    log('info', 'Checking NFS mounts...');
    const ul = $("#nfs-mounts-list");
    if (!ul) return [];

    ul.innerHTML = '<li class="loading">Checking...</li>';
    
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
        log('info', 'No active NFS mounts found');
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

      if (mounts.length > 0) {
        log('info', `Found ${mounts.length} active NFS mount${mounts.length > 1 ? 's' : ''}`);
      }
      return mounts;
      
    } catch (error) {
      log('error', `Failed to check NFS mounts: ${error.message}`);
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

  async function unmountIscsiDevice(device, mountpoint) {
    log('info', `Unmounting iSCSI device ${device} from ${mountpoint}...`);
    
    try {
      // Step 1: Unmount the device
      try {
        await cockpit.spawn(['umount', device], { superuser: "require" });
        log('info', `Successfully unmounted ${device}`);
      } catch (error) {
        // Try unmounting by mountpoint if device unmount fails
        await cockpit.spawn(['umount', mountpoint], { superuser: "require" });
        log('info', `Successfully unmounted ${mountpoint}`);
      }
      
      // Step 2: Remove mount point directory if it's empty and safe to remove
      try {
        // Only remove if it's not a system directory and appears to be empty
        if (mountpoint !== '/' && mountpoint !== '/mnt' && mountpoint.startsWith('/mnt/')) {
          const lsResult = await cockpit.spawn(['ls', '-la', mountpoint], { superuser: "require" });
          const lines = lsResult.trim().split('\n');
          // If directory only contains . and .. entries, it's empty
          if (lines.length <= 3) {
            await cockpit.spawn(['rmdir', mountpoint], { superuser: "require" });
            log('info', `Removed empty mount directory: ${mountpoint}`);
          } else {
            log('info', `Mount directory ${mountpoint} not empty, leaving intact`);
          }
        }
      } catch (error) {
        log('warn', `Could not remove mount directory ${mountpoint}: ${error.message}`);
      }
      
      // Step 3: Remove from mount tracking
      removeMountTracking(device);
      
      log('info', `Successfully unmounted and cleaned up ${device}`);
      
    } catch (error) {
      log('error', `Failed to unmount ${device}: ${error.message}`);
      throw error;
    }
  }

  // ===== iSCSI Functions (from working old code) =====
  async function targetcli(lines) {
    const runner = (await have("targetcli")) ? "targetcli" : "targetcli-fb";
    const script = (Array.isArray(lines) ? lines : [String(lines)]).join("\n");
    return run(`${runner} <<'EOF'\n${script}\nEOF`, 12000);
  }

  // Comprehensive error handling functions for iSCSI and NFS operations
  function handleIscsiError(error, operation = 'iSCSI operation') {
    const errorMessage = error.message || error.toString();
    const exitCode = error.exit_status || error.exit_code || 0;
    
    // Common iSCSI error patterns and user-friendly messages
    if (exitCode === 21 || errorMessage.includes('No active sessions')) {
      return { 
        type: 'info', 
        message: 'No active iSCSI sessions found',
        shouldLog: false 
      };
    }
    
    if (exitCode === 15 || errorMessage.includes('already exists')) {
      return { 
        type: 'warning', 
        message: 'Target or session already exists',
        shouldLog: true 
      };
    }
    
    if (exitCode === 8 || errorMessage.includes('already logged in')) {
      return { 
        type: 'info', 
        message: 'Already logged in to target',
        shouldLog: false 
      };
    }
    
    if (exitCode === 24 || errorMessage.includes('not logged in')) {
      return { 
        type: 'warning', 
        message: 'Not currently logged in to target',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('Connection refused') || errorMessage.includes('No route to host')) {
      return { 
        type: 'error', 
        message: 'Cannot connect to iSCSI portal - check network connectivity and portal address',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('permission denied') || errorMessage.includes('Permission denied')) {
      return { 
        type: 'error', 
        message: 'Permission denied - check authentication credentials and ACL settings',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return { 
        type: 'error', 
        message: 'Operation timed out - check network connectivity and target availability',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('invalid option') || errorMessage.includes('unknown option')) {
      return { 
        type: 'error', 
        message: 'Invalid command syntax - this may be a tool compatibility issue',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('No such file or directory')) {
      return { 
        type: 'error', 
        message: 'Required files or directories not found - check tool installation',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('Device or resource busy')) {
      return { 
        type: 'error', 
        message: 'Device is busy - ensure it\'s not mounted or in use by other processes',
        shouldLog: true 
      };
    }
    
    // Default error handling
    return { 
      type: 'error', 
      message: `${operation} failed: ${errorMessage}`,
      shouldLog: true 
    };
  }
  
  function handleNfsError(error, operation = 'NFS operation') {
    const errorMessage = error.message || error.toString();
    const exitCode = error.exit_status || error.exit_code || 0;
    
    // Common NFS error patterns
    if (errorMessage.includes('No such file or directory')) {
      return { 
        type: 'error', 
        message: 'NFS export path or mount point not found',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('Permission denied')) {
      return { 
        type: 'error', 
        message: 'Permission denied - check NFS export permissions and client access rights',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('Connection refused') || errorMessage.includes('No route to host')) {
      return { 
        type: 'error', 
        message: 'Cannot connect to NFS server - check network connectivity and server status',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('already mounted') || errorMessage.includes('busy')) {
      return { 
        type: 'warning', 
        message: 'Filesystem is already mounted or busy',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('not mounted')) {
      return { 
        type: 'warning', 
        message: 'Filesystem is not currently mounted',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('RPC') || errorMessage.includes('rpc')) {
      return { 
        type: 'error', 
        message: 'RPC communication error - check NFS service status and firewall settings',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('Stale file handle')) {
      return { 
        type: 'error', 
        message: 'Stale NFS file handle - try unmounting and remounting the filesystem',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return { 
        type: 'error', 
        message: 'NFS operation timed out - check network and server responsiveness',
        shouldLog: true 
      };
    }
    
    // Default error handling
    return { 
      type: 'error', 
      message: `${operation} failed: ${errorMessage}`,
      shouldLog: true 
    };
  }
  
  function handleFilesystemError(error, operation = 'Filesystem operation') {
    const errorMessage = error.message || error.toString();
    
    if (errorMessage.includes('invalid option') && errorMessage.includes('mkfs')) {
      return { 
        type: 'error', 
        message: 'Filesystem formatting failed - unsupported options for this filesystem type',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('Device or resource busy')) {
      return { 
        type: 'error', 
        message: 'Device is busy - ensure it\'s unmounted before formatting',
        shouldLog: true 
      };
    }
    
    if (errorMessage.includes('No space left on device')) {
      return { 
        type: 'error', 
        message: 'Insufficient disk space for operation',
        shouldLog: true 
      };
    }
    
    return handleIscsiError(error, operation);
  }

  // Enhanced error handler that uses the specific error handlers
  function handleOperationError(error, operation, type = 'general') {
    let errorInfo;
    
    switch (type) {
      case 'iscsi':
        errorInfo = handleIscsiError(error, operation);
        break;
      case 'nfs':
        errorInfo = handleNfsError(error, operation);
        break;
      case 'filesystem':
        errorInfo = handleFilesystemError(error, operation);
        break;
      default:
        errorInfo = { type: 'error', message: `${operation} failed: ${error.message}`, shouldLog: true };
    }
    
    if (errorInfo.shouldLog) {
      log(errorInfo.type === 'error' ? 'error' : 'warn', `[${operation.toUpperCase()}] ${errorInfo.message}`);
    }
    
    if (errorInfo.type !== 'info' || errorInfo.shouldLog) {
      showMessage(errorInfo.message, errorInfo.type);
    }
    
    return errorInfo;
  }

  async function cleanupOrphanedBackstores() {
    // Show warning dialog first
    showWarningDialog(
      'Cleanup All Backstores',
      '⚠️ DANGER: This action will remove ALL backstores from the system.\n\nThis includes:\n• Block device backstores\n• File-based backstores\n• Associated storage files\n\nThis action is IRREVERSIBLE and will permanently delete all storage configurations.\n\nAre you absolutely sure you want to proceed?',
      'Yes, Delete Everything',
      'Cancel',
      async () => {
        await performBackstoreCleanup();
      }
    );
  }
  
  function showWarningDialog(title, message, confirmText, cancelText, onConfirm, onCancel) {
    const dialog = document.createElement('div');
    dialog.className = 'warning-dialog';
    dialog.innerHTML = `
      <div class="warning-dialog-content">
        <div class="warning-dialog-header">
          <i class="fa fa-exclamation-triangle"></i>
          <h3>${title}</h3>
        </div>
        <div class="warning-dialog-body">
          <p style="white-space: pre-line;">${message}</p>
        </div>
        <div class="warning-dialog-footer">
          <button class="btn btn-outline-secondary cancel-btn">${cancelText}</button>
          <button class="btn btn-danger confirm-btn">${confirmText}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    const confirmBtn = dialog.querySelector('.confirm-btn');
    const cancelBtn = dialog.querySelector('.cancel-btn');
    
    const cleanup = () => {
      document.body.removeChild(dialog);
    };
    
    confirmBtn.addEventListener('click', () => {
      cleanup();
      if (onConfirm) onConfirm();
    });
    
    cancelBtn.addEventListener('click', () => {
      cleanup();
      if (onCancel) onCancel();
    });
    
    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        cleanup();
        if (onCancel) onCancel();
      }
    });
  }

  async function performBackstoreCleanup() {
    try {
      log('info', 'Starting complete backstore cleanup...');
      showMessage('Starting complete backstore cleanup...', 'info');
      
      // Get all backstores directly from targetcli
      const targetList = await cockpit.spawn(["targetcli", "ls"], { superuser: "require" });
      
      // Parse ALL backstores (not just orphaned ones)
      const backstores = [];
      const lines = targetList.split('\n');
      let inBackstores = false;
      let currentType = null;
      
      for (const line of lines) {
        if (line.includes('o- backstores')) {
          inBackstores = true;
          continue;
        }
        if (inBackstores && line.includes('o- iscsi')) {
          break; // End of backstores section
        }
        if (inBackstores) {
          if (line.includes('o- fileio') || line.includes('o- block')) {
            currentType = line.includes('fileio') ? 'fileio' : 'block';
          } else if (currentType && line.includes('o-') && !line.includes('alua') && !line.includes('default_tg_pt_gp')) {
            const match = line.match(/o- ([^\s]+)/);
            if (match) {
              backstores.push({ type: currentType, name: match[1] });
            }
          }
        }
      }
      
      if (backstores.length === 0) {
        showMessage('No backstores found to clean up.', 'info');
        log('info', 'No backstores found');
        return;
      }
      
      log('info', `Found ${backstores.length} backstores to clean up: ${backstores.map(b => `${b.type}/${b.name}`).join(', ')}`);

      // Remove all backstores and their associated files
      let cleanedCount = 0;
      for (const backstore of backstores) {
        try {
          // First, try to get the file path if it's a fileio backstore
          let filePath = null;
          if (backstore.type === 'fileio') {
            try {
              const backstoreInfo = await cockpit.spawn(["targetcli", "ls", `/backstores/fileio/${backstore.name}`], { superuser: "require" });
              const fileMatch = backstoreInfo.match(/file=([^\s)]+)/);
              if (fileMatch) {
                filePath = fileMatch[1];
                log('info', `Found file path for ${backstore.name}: ${filePath}`);
              }
            } catch (e) {
              log('warn', `Could not get file info for ${backstore.name}: ${e.message}`);
            }
          }
          
          // Get block device path if it's a block backstore
          let blockDevice = null;
          if (backstore.type === 'block') {
            try {
              const backstoreInfo = await cockpit.spawn(["targetcli", "ls", `/backstores/block/${backstore.name}`], { superuser: "require" });
              const deviceMatch = backstoreInfo.match(/dev=([^\s)]+)/);
              if (deviceMatch) {
                blockDevice = deviceMatch[1];
                log('info', `Found block device for ${backstore.name}: ${blockDevice}`);
              }
            } catch (e) {
              log('warn', `Could not get block device info for ${backstore.name}: ${e.message}`);
            }
          }
          
          // Remove the backstore
          await cockpit.spawn(["targetcli", `/backstores/${backstore.type}`, "delete", backstore.name], { superuser: "require" });
          log('info', `Removed ${backstore.type} backstore: ${backstore.name}`);
          cleanedCount++;
          
          // Remove associated file if it exists
          if (filePath) {
            try {
              await cockpit.spawn(["rm", "-f", filePath], { superuser: "require" });
              log('info', `Removed associated file: ${filePath}`);
            } catch (error) {
              log('warn', `Could not remove file ${filePath}: ${error.message}`);
            }
          }
          
          // Wipe block device if it exists
          if (blockDevice) {
            try {
              await cockpit.spawn(["wipefs", "-a", blockDevice], { superuser: "require" });
              log('info', `Wiped filesystem signatures from: ${blockDevice}`);
            } catch (error) {
              log('warn', `Could not wipe device ${blockDevice}: ${error.message}`);
            }
          }
          
        } catch (error) {
          log('warn', `Could not remove ${backstore.type} backstore ${backstore.name}: ${error.message}`);
        }
      }
      
      // Clean up any orphaned files in common iSCSI directories
      const cleanupDirs = ['/var/lib/iscsi-disks', '/var/lib/iscsi'];
      for (const dir of cleanupDirs) {
        try {
          log('info', `Checking for orphaned files in ${dir}...`);
          const files = await cockpit.spawn(["find", dir, "-name", "*.img", "-type", "f"], { superuser: "require" });
          const fileList = files.trim().split('\n').filter(f => f.trim());
          
          for (const file of fileList) {
            try {
              await cockpit.spawn(["rm", "-f", file], { superuser: "require" });
              log('info', `Removed orphaned file: ${file}`);
            } catch (e) {
              log('warn', `Could not remove orphaned file ${file}: ${e.message}`);
            }
          }
        } catch (error) {
          if (!error.message.includes("No such file")) {
            log('warn', `Could not clean directory ${dir}: ${error.message}`);
          }
        }
      }
      
      // Save configuration if any backstores were cleaned
      if (cleanedCount > 0) {
        try {
          await cockpit.spawn(["targetcli", "saveconfig"], { superuser: "require" });
          log('info', 'Configuration saved after backstore cleanup');
          showMessage(`Successfully cleaned up ${cleanedCount} backstore(s) and associated files.`, 'success');
        } catch (error) {
          log('warn', `Could not save configuration: ${error.message}`);
          showMessage(`Cleaned ${cleanedCount} backstore(s) but failed to save configuration: ${error.message}`, 'warning');
        }
        
        // Refresh the targets list
        await loadIscsiTargets();
      } else {
        showMessage('No backstores were cleaned.', 'info');
      }
      
    } catch (error) {
      log('error', `Backstore cleanup failed: ${error.message}`);
      showMessage(`Backstore cleanup failed: ${error.message}`, 'error');
    }
  }

  // Function to detect iSCSI disks visible to the host and clean up logged-out list
  async function cleanupVisibleIscsiTargets() {
    try {
      log('info', '[CLEANUP] Checking for visible iSCSI disks to clean up logged-out list...');
      
      // Get logged-out targets from localStorage
      const loggedOutTargets = JSON.parse(localStorage.getItem('xavs-iscsi-logged-out') || '[]');
      if (loggedOutTargets.length === 0) {
        log('info', '[CLEANUP] No logged-out targets to check');
        return;
      }
      
      // Get current active sessions to see what's connected
      let activeSessions = [];
      try {
        const sessionResult = await cockpit.spawn(["iscsiadm", "-m", "session"], { superuser: "try" });
        const lines = sessionResult.trim().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          const match = line.match(/^(\w+):\s*\[(\d+)\]\s*([^,]+:\d+),\d+\s+(.+)$/);
          if (match) {
            const [, protocol, sessionId, target, iqnRaw] = match;
            const iqn = iqnRaw.replace(/\s*\([^)]*\)\s*$/, '').trim();
            activeSessions.push({ iqn, target });
          }
        }
      } catch (error) {
        if (error.exit_status !== 21 && !error.message.includes("No active sessions")) {
          log('warn', `[CLEANUP] Could not check active sessions: ${error.message}`);
        }
      }
      
      // Check if any logged-out targets are now active and remove them
      let updated = false;
      const remainingTargets = loggedOutTargets.filter(loggedOut => {
        const isActive = activeSessions.some(active => 
          active.iqn === loggedOut.iqn && active.target === loggedOut.target
        );
        
        if (isActive) {
          log('info', `[CLEANUP] Removing ${loggedOut.iqn} -> ${loggedOut.target} from logged-out list (now active)`);
          updated = true;
          return false; // Remove from list
        }
        return true; // Keep in list
      });
      
      // Update localStorage if changes were made
      if (updated) {
        localStorage.setItem('xavs-iscsi-logged-out', JSON.stringify(remainingTargets));
        log('info', `[CLEANUP] Updated logged-out list, removed ${loggedOutTargets.length - remainingTargets.length} active targets`);
      }
      
    } catch (error) {
      log('warn', `[CLEANUP] Error during iSCSI cleanup: ${error.message}`);
    }
  }

  async function loadIscsiSessions() {
    log('info', 'Checking iSCSI sessions...');
    const ul = $("#iscsi-sessions-list");
    if (!ul) {
      log('warn', '[SESSION-LOAD] Sessions list element not found');
      return [];
    }

    // Clean up logged-out targets that are now visible/active
    await cleanupVisibleIscsiTargets();

    try {
      let result;
      try {
        // Force refresh of iscsiadm database first
        log('info', 'Refreshing iSCSI session database...');
        await cockpit.spawn(["iscsiadm", "-m", "session", "-R"], { superuser: "try" }).catch(() => {});
        
        log('info', 'Querying active sessions...');
        result = await cockpit.spawn(["iscsiadm", "-m", "session"], { superuser: "try" });
      } catch (error) {
        // Check if error is really "no sessions" vs actual error
        if (error.exit_status === 21 || error.message.includes("No active sessions")) {
          ul.innerHTML = '<li class="no-items">No iSCSI sessions found</li>';
          log('info', 'No active iSCSI sessions found');
          return [];
        } else {
          log('warn', `iSCSI session check failed: ${error.message}`);
          ul.innerHTML = '<li class="no-items">Error checking iSCSI sessions</li>';
          return [];
        }
      }

      const lines = result.trim().split('\n').filter(line => line.trim());
      log('info', `[SESSION-LOAD] Found ${lines.length} session lines: ${JSON.stringify(lines)}`);
      
      if (lines.length === 0) {
        ul.innerHTML = '<li class="no-items">No iSCSI sessions found</li>';
        log('info', '[SESSION-LOAD] Found 0 iSCSI sessions (empty result)');
        return [];
      }

      const sessions = [];
      const seenSessions = new Set(); // Track unique IQN+target combinations
      ul.innerHTML = '';

      for (const line of lines) {
        log('info', `[SESSION-LOAD] Processing line: "${line}"`);
        const match = line.match(/^(\w+):\s*\[(\d+)\]\s*([^,]+:\d+),\d+\s+(.+)$/);
        if (match) {
          const [, protocol, sessionId, target, iqnRaw] = match;
          
          // Clean the IQN by removing "(non-flash)" or other suffixes
          const iqn = iqnRaw.replace(/\s*\([^)]*\)\s*$/, '').trim();
          
          // Create unique key to prevent duplicates
          const sessionKey = `${iqn}:${target}`;
          if (seenSessions.has(sessionKey)) {
            log('info', `[SESSION-LOAD] Skipping duplicate session: ${sessionKey}`);
            continue;
          }
          seenSessions.add(sessionKey);
          
          log('info', `[SESSION-LOAD] Added session - Protocol: ${protocol}, ID: ${sessionId}, Target: ${target}, IQN: ${iqn}`);
          
          sessions.push({ protocol, sessionId, target, iqn });
          
          // Check if this session has any mounts
          const mountInfo = getMountByIqn(iqn);
          const mountDisplay = mountInfo ? 
            `<div class="mount-info">
              <i class="fa fa-hdd text-success"></i> 
              <span>Mounted at: <code>${mountInfo.mountpoint}</code></span>
              <button class="btn btn-outline-danger btn-xs unmount-btn" data-device="${mountInfo.device}" data-mountpoint="${mountInfo.mountpoint}" title="Unmount device">
                <i class="fa fa-eject"></i> Unmount
              </button>
            </div>` : 
            '<div class="mount-info"><i class="fa fa-circle-o text-muted"></i> <span>Not mounted</span></div>';
          
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
              ${mountDisplay}
            </div>
            <div class="session-actions">
              <button class="btn btn-outline-success btn-sm login-btn" data-target="${target}" data-iqn="${iqn}" title="Re-login to ${target}" style="display: none;">
                <i class="fa fa-sign-in-alt"></i> Login
              </button>
              <button class="btn btn-outline-danger btn-sm logout-btn" data-target="${target}" data-iqn="${iqn}" title="Logout from ${target}">
                <i class="fa fa-sign-out-alt"></i> Logout
              </button>
            </div>
          `;
          ul.appendChild(li);
          
          const logoutBtn = li.querySelector('.logout-btn');
          const loginBtn = li.querySelector('.login-btn');
          const unmountBtn = li.querySelector('.unmount-btn');
          
          logoutBtn.addEventListener('click', () => {
            logoutiSCSI(target, iqn);
          });
          
          loginBtn.addEventListener('click', async () => {
            await loginiSCSI(target, iqn);
          });
          
          if (unmountBtn) {
            unmountBtn.addEventListener('click', async () => {
              const device = unmountBtn.getAttribute('data-device');
              const mountpoint = unmountBtn.getAttribute('data-mountpoint');
              
              showConfirmationDialog(
                'Unmount iSCSI Device',
                `Are you sure you want to unmount the iSCSI device?\n\nDevice: ${device}\nMount point: ${mountpoint}\n\nThis will unmount the device but keep the iSCSI session active.`,
                'Unmount',
                'Cancel',
                async () => {
                  try {
                    await unmountIscsiDevice(device, mountpoint);
                    log('info', `Successfully unmounted ${device} from UI`);
                    // Refresh the sessions list to update mount status
                    await loadIscsiSessions();
                  } catch (error) {
                    log('error', `Failed to unmount ${device}: ${error.message}`);
                    showMessage(`Failed to unmount device: ${error.message}`, "error");
                  }
                },
                () => {
                  log('info', `User cancelled unmount of ${device}`);
                }
              );
            });
          }
        } else {
          log('warn', `[SESSION-LOAD] Failed to parse session line: "${line}"`);
        }
      }

      log('info', `[SESSION-LOAD] Successfully loaded ${sessions.length} active iSCSI sessions`);
      
      // Load manually logged-out targets (stored in localStorage)
      try {
        const loggedOutTargets = JSON.parse(localStorage.getItem('xavs-iscsi-logged-out') || '[]');
        
        for (const loggedOutTarget of loggedOutTargets) {
          const { iqn, target } = loggedOutTarget;
          const sessionKey = `${iqn}:${target}`;
          
          // Only show if not currently active
          if (!seenSessions.has(sessionKey)) {
            seenSessions.add(sessionKey);
            log('info', `[SESSION-LOAD] Adding logged-out target: ${iqn} -> ${target}`);
            
            const li = document.createElement('li');
            li.className = 'session-item offline';
            li.innerHTML = `
              <div class="session-info">
                <div class="session-path">
                  <strong>${iqn}</strong> <span class="status-offline">(logged out)</span>
                </div>
                <div class="session-details">
                  ${target} | Previously connected
                </div>
              </div>
              <div class="session-actions">
                <button class="btn btn-outline-success btn-sm login-btn" data-target="${target}" data-iqn="${iqn}" title="Login to ${target}">
                  <i class="fa fa-sign-in-alt"></i> Login
                </button>
                <button class="btn btn-outline-danger btn-sm remove-node-btn" data-target="${target}" data-iqn="${iqn}" title="Remove from list">
                  <i class="fa fa-times"></i> Remove
                </button>
              </div>
            `;
            ul.appendChild(li);
            
            const loginBtn = li.querySelector('.login-btn');
            const removeBtn = li.querySelector('.remove-node-btn');
            
            loginBtn.addEventListener('click', async () => {
              await loginiSCSI(target, iqn);
              // Remove from logged-out list when successfully logged in
              removeFromLoggedOutList(iqn, target);
            });
            
            removeBtn.addEventListener('click', async () => {
              removeFromLoggedOutList(iqn, target);
              await loadIscsiSessions(); // Refresh the list
            });
          }
        }
      } catch (error) {
        log('warn', `[SESSION-LOAD] Could not load logged-out targets: ${error.message}`);
      }
      
      if (sessions.length === 0 && ul.children.length === 0) {
        ul.innerHTML = '<li class="no-items">No iSCSI sessions or logged-out targets found</li>';
      }
      
      return sessions;
      
    } catch (error) {
      log('error', `[SESSION-LOAD] Failed to load iSCSI sessions: ${error.message}`);
      ul.innerHTML = '<li class="error">Failed to load iSCSI sessions</li>';
      return [];
    }
  }

  // Functions to manage logged-out targets list
  function addToLoggedOutList(iqn, target) {
    try {
      const loggedOutTargets = JSON.parse(localStorage.getItem('xavs-iscsi-logged-out') || '[]');
      const exists = loggedOutTargets.some(t => t.iqn === iqn && t.target === target);
      
      if (!exists) {
        loggedOutTargets.push({ iqn, target, timestamp: Date.now() });
        localStorage.setItem('xavs-iscsi-logged-out', JSON.stringify(loggedOutTargets));
        log('info', `Added ${iqn} to logged-out targets list`);
      }
    } catch (error) {
      log('warn', `Could not save logged-out target: ${error.message}`);
    }
  }

  function removeFromLoggedOutList(iqn, target) {
    try {
      const loggedOutTargets = JSON.parse(localStorage.getItem('xavs-iscsi-logged-out') || '[]');
      const filtered = loggedOutTargets.filter(t => !(t.iqn === iqn && t.target === target));
      localStorage.setItem('xavs-iscsi-logged-out', JSON.stringify(filtered));
      log('info', `Removed ${iqn} from logged-out targets list`);
    } catch (error) {
      log('warn', `Could not remove logged-out target: ${error.message}`);
    }
  }

  async function removeDiscoveredTarget(target, iqn) {
    try {
      log('info', `Removing discovered target: ${iqn} from ${target}`);
      
      const targetWithPort = target.includes(':') ? target : `${target}:3260`;
      await cockpit.spawn(["iscsiadm", "-m", "node", "-T", iqn, "-p", targetWithPort, "--op=delete"], { superuser: "require" });
      log('info', `Successfully removed discovered target: ${iqn}`);
      showMessage(`Removed discovered target: ${iqn}`, 'success');
      
      // Refresh sessions
      await loadIscsiSessions();
      
    } catch (error) {
      log('error', `Failed to remove discovered target: ${error.message}`);
      showMessage(`Failed to remove target: ${error.message}`, 'error');
    }
  }

  async function loadIscsiTargets() {
    log('info', 'Checking iSCSI targets...');
    const ul = $("#iscsi-targets-list");
    if (!ul) return [];

    try {
      // Try to get existing targets using targetcli
      let result;
      try {
        const runner = (await have("targetcli")) ? "targetcli" : "targetcli-fb";
        result = await cockpit.spawn([runner, "ls", "/iscsi"], { superuser: "require" });
      } catch (error) {
        log('info', 'No targetcli available or no targets configured');
        ul.innerHTML = '<li class="no-items">No iSCSI targets configured</li>';
        return [];
      }

      const targets = [];
      const lines = result.split('\n').filter(line => line.trim());
      
      // Parse targetcli output for IQN targets
      for (const line of lines) {
        const iqnMatch = line.match(/iqn\.[\w\-.:]+/);
        if (iqnMatch) {
          targets.push({
            iqn: iqnMatch[0],
            status: 'active'
          });
        }
      }

      ul.innerHTML = '';
      if (targets.length === 0) {
        ul.innerHTML = '<li class="no-items">No iSCSI targets configured</li>';
      } else {
        targets.forEach(target => {
          const li = document.createElement('li');
          li.className = 'target-item';
          li.innerHTML = `
            <div class="target-info">
              <div class="target-iqn">
                <strong>${target.iqn}</strong>
              </div>
              <div class="target-status">
                Status: ${target.status}
              </div>
            </div>
            <button class="btn btn-outline-danger btn-sm delete-target-btn" data-iqn="${target.iqn}" title="Delete target ${target.iqn}">
              <i class="fa fa-trash"></i> Delete
            </button>
          `;
          ul.appendChild(li);

          // Add delete event listener
          const deleteBtn = li.querySelector('.delete-target-btn');
          deleteBtn.addEventListener('click', async () => {
            if (await showConfirmDialog('Delete iSCSI Target', 
                `Are you sure you want to delete the iSCSI target?\n\nIQN: ${target.iqn}\n\nThis will permanently remove the target and may affect connected clients.`)) {
              await deleteIscsiTarget(target.iqn);
            }
          });
        });
      }

      if (targets.length === 0) {
        log('info', 'No iSCSI targets found');
      } else {
        log('info', `Found ${targets.length} iSCSI target${targets.length > 1 ? 's' : ''}`);
      }
      return targets;

    } catch (error) {
      log('error', `Failed to check iSCSI targets: ${error.message}`);
      ul.innerHTML = '<li class="error">Failed to load iSCSI targets</li>';
      return [];
    }
  }

  async function deleteIscsiTarget(iqn) {
    try {
      log('info', `Starting complete iSCSI target deletion: ${iqn}`);
      
      // Clean the IQN to remove any suffixes like "(non-flash)"
      const cleanIqn = iqn.replace(/\s*\([^)]*\)\s*$/, '').trim();
      log('info', `Using cleaned IQN: ${cleanIqn}`);
      
      // Step 1: First check if target exists in targetcli
      let targetExists = false;
      let backstoreName = null;
      let backstoreType = null;
      let storageFile = null;
      
      try {
        const targetcliList = await cockpit.spawn(["bash", "-c", "targetcli ls"], { superuser: "require" });
        targetExists = targetcliList.includes(cleanIqn);
        
        if (targetExists) {
          log('info', `Target ${cleanIqn} found in targetcli configuration`);
          
          // Try to extract backstore information
          const detailedList = await cockpit.spawn(["bash", "-c", `targetcli ls /iscsi/${cleanIqn}`], { superuser: "require" });
          
          // Look for backstore references in the output
          const backstoreMatch = detailedList.match(/-> \.\.\/\.\.\/backstores\/(fileio|block)\/([^\s\]]+)/);
          if (backstoreMatch) {
            backstoreType = backstoreMatch[1]; // fileio or block
            backstoreName = backstoreMatch[2];
            log('info', `Found backstore: ${backstoreType}/${backstoreName}`);
            
            // Get storage file path if it's fileio
            if (backstoreType === 'fileio') {
              try {
                const backstoreInfo = await cockpit.spawn(["bash", "-c", `targetcli ls /backstores/fileio/${backstoreName}`], { superuser: "require" });
                const fileMatch = backstoreInfo.match(/file=([^\s)]+)/);
                if (fileMatch) {
                  storageFile = fileMatch[1];
                  log('info', `Storage file: ${storageFile}`);
                }
              } catch (e) {
                log('warn', `Could not get fileio details: ${e.message}`);
              }
            }
          }
        } else {
          log('info', `Target ${cleanIqn} not found in targetcli, proceeding with session cleanup only`);
        }
      } catch (error) {
        log('warn', `Could not check targetcli status: ${error.message}`);
      }
      
      // Step 2: Force logout any active sessions (client-side cleanup)
      try {
        log('info', 'Checking for active sessions to logout...');
        const sessionCheck = await cockpit.spawn(['iscsiadm', '-m', 'session'], { superuser: "try" });
        
        if (sessionCheck.includes(cleanIqn)) {
          log('info', 'Found active sessions, attempting logout...');
          
          // Parse sessions to find targets for this IQN
          const lines = sessionCheck.trim().split('\n');
          for (const line of lines) {
            if (line.includes(cleanIqn)) {
              const match = line.match(/^(\w+):\s*\[(\d+)\]\s*([^,]+:\d+),\d+\s+(.+)$/);
              if (match) {
                const [, , , target] = match;
                try {
                  const targetWithPort = target.includes(':') ? target : `${target}:3260`;
                  await cockpit.spawn(["iscsiadm", "-m", "node", "-T", cleanIqn, "-p", targetWithPort, "--logout"], { superuser: "require" });
                  log('info', `Logged out session: ${target}`);
                } catch (e) {
                  if (e.exit_status !== 21) {
                    log('warn', `Could not logout from ${target}: ${e.message}`);
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        if (error.exit_status !== 21) {
          log('warn', `Session cleanup warning: ${error.message}`);
        }
      }
      
      // Step 3: Delete iSCSI target (server-side)
      if (targetExists) {
        try {
          log('info', `Deleting iSCSI target: ${cleanIqn}`);
          // Use direct targetcli command to avoid parameter parsing issues
          await cockpit.spawn(["targetcli", "/iscsi", "delete", cleanIqn], { superuser: "require" });
          log('info', `Successfully deleted iSCSI target: ${cleanIqn}`);
        } catch (error) {
          if (!error.message.includes("does not exist")) {
            log('error', `Failed to delete iSCSI target: ${error.message}`);
            throw error;
          } else {
            log('info', 'Target already deleted or does not exist');
          }
        }
        
        // Step 4: Delete backstore if found
        if (backstoreName && backstoreType) {
          try {
            log('info', `Deleting backstore: ${backstoreType}/${backstoreName}`);
            // Use direct targetcli command to avoid parameter parsing issues
            await cockpit.spawn(["targetcli", `/backstores/${backstoreType}`, "delete", backstoreName], { superuser: "require" });
            log('info', `Successfully deleted backstore: ${backstoreType}/${backstoreName}`);
          } catch (error) {
            if (!error.message.includes("does not exist")) {
              log('warn', `Could not delete backstore: ${error.message}`);
            } else {
              log('info', 'Backstore already deleted or does not exist');
            }
          }
        }
        
        // Step 5: Clean up underlying storage
        if (storageFile && backstoreType === 'fileio') {
          try {
            log('info', `Cleaning up storage file: ${storageFile}`);
            // Check if file exists before trying to delete
            await cockpit.spawn(["test", "-f", storageFile], { superuser: "require" });
            await cockpit.spawn(["rm", "-f", storageFile], { superuser: "require" });
            log('info', `Successfully removed storage file: ${storageFile}`);
          } catch (error) {
            if (error.exit_status === 1) {
              log('info', 'Storage file already removed or does not exist');
            } else {
              log('warn', `Could not remove storage file: ${error.message}`);
            }
          }
        } else if (backstoreName && backstoreType === 'block') {
          // For block devices, try to get the device path and wipe it
          try {
            log('info', `Checking block device for cleanup: ${backstoreName}`);
            const backstoreInfo = await cockpit.spawn(["bash", "-c", `targetcli ls /backstores/block/${backstoreName} 2>/dev/null || echo "not found"`], { superuser: "require" });
            
            // Extract device path from backstore info if available
            const deviceMatch = backstoreInfo.match(/dev=([^\s)]+)/);
            if (deviceMatch) {
              const devicePath = deviceMatch[1];
              log('info', `Found block device: ${devicePath}, wiping filesystem signatures...`);
              
              // Wipe filesystem signatures to clean the device
              try {
                await cockpit.spawn(["wipefs", "-a", devicePath], { superuser: "require" });
                log('info', `Successfully wiped filesystem signatures from: ${devicePath}`);
              } catch (error) {
                log('warn', `Could not wipe device ${devicePath}: ${error.message}`);
              }
            }
          } catch (error) {
            log('warn', `Could not process block device cleanup: ${error.message}`);
          }
        }
        
        // Step 6: Save targetcli configuration
        try {
          log('info', 'Saving targetcli configuration...');
          await cockpit.spawn(["bash", "-c", "targetcli saveconfig"], { superuser: "require" });
          log('info', 'targetcli configuration saved');
        } catch (error) {
          log('warn', `Could not save targetcli config: ${error.message}`);
        }
      }
      
      // Step 7: Clean up any remaining node configurations on client side
      try {
        log('info', 'Cleaning up client-side node configurations...');
        await cockpit.spawn(["bash", "-c", `find /var/lib/iscsi/nodes -name "*${cleanIqn}*" -type d -exec rm -rf {} + 2>/dev/null || true`], { superuser: "require" });
        log('info', 'Client-side cleanup completed');
      } catch (error) {
        log('warn', `Client-side cleanup warning: ${error.message}`);
      }
      
      // Step 8: Check for and clean up any remaining standalone backstores
      try {
        log('info', 'Checking for standalone backstores after target deletion...');
        await cleanupStandaloneBackstores();
      } catch (error) {
        log('warn', `Standalone backstore cleanup warning: ${error.message}`);
      }
      
      log('info', `Complete iSCSI target deletion finished: ${cleanIqn}`);
      showMessage('iSCSI target and associated storage deleted successfully', 'success');
      
      // Refresh displays
      await loadIscsiTargets();
      await loadIscsiSessions();
      await updateOverview();
      
    } catch (error) {
      log('error', `Failed to delete iSCSI target ${iqn}: ${error.message}`);
      showMessage(`Failed to delete iSCSI target: ${error.message}`, 'error');
    }
  }
  
  // Function to clean up backstores that have no associated iSCSI targets
  async function cleanupStandaloneBackstores() {
    try {
      log('info', 'Checking for standalone backstores...');
      
      const targetList = await cockpit.spawn(["targetcli", "ls"], { superuser: "require" });
      
      // Check if there are any iSCSI targets
      const hasIscsiTargets = targetList.includes('o- iscsi') && 
                             targetList.match(/iqn\.\d{4}-\d{2}\./);
      
      if (hasIscsiTargets) {
        log('info', 'iSCSI targets still exist, skipping standalone cleanup');
        return;
      }
      
      log('info', 'No iSCSI targets found, cleaning up standalone backstores...');
      
      // Parse backstores
      const backstores = [];
      const lines = targetList.split('\n');
      let inBackstores = false;
      let currentType = null;
      
      for (const line of lines) {
        if (line.includes('o- backstores')) {
          inBackstores = true;
          continue;
        }
        if (inBackstores && line.includes('o- iscsi')) {
          break; // End of backstores section
        }
        if (inBackstores) {
          if (line.includes('o- fileio') || line.includes('o- block')) {
            currentType = line.includes('fileio') ? 'fileio' : 'block';
          } else if (currentType && line.includes('o-') && !line.includes('alua') && !line.includes('default_tg_pt_gp')) {
            const match = line.match(/o- ([^\s]+)/);
            if (match) {
              backstores.push({ type: currentType, name: match[1] });
            }
          }
        }
      }
      
      if (backstores.length === 0) {
        log('info', 'No standalone backstores found');
        return;
      }
      
      log('info', `Found ${backstores.length} standalone backstores to clean up`);
      
      // Remove all standalone backstores and their files
      for (const backstore of backstores) {
        try {
          let filePath = null;
          let blockDevice = null;
          
          // Get file path for fileio backstores
          if (backstore.type === 'fileio') {
            try {
              const backstoreInfo = await cockpit.spawn(["targetcli", "ls", `/backstores/fileio/${backstore.name}`], { superuser: "require" });
              const fileMatch = backstoreInfo.match(/file=([^\s)]+)/);
              if (fileMatch) {
                filePath = fileMatch[1];
                log('info', `Found file path for ${backstore.name}: ${filePath}`);
              }
            } catch (e) {
              log('warn', `Could not get file info for ${backstore.name}: ${e.message}`);
            }
          }
          
          // Get device path for block backstores
          if (backstore.type === 'block') {
            try {
              const backstoreInfo = await cockpit.spawn(["targetcli", "ls", `/backstores/block/${backstore.name}`], { superuser: "require" });
              const deviceMatch = backstoreInfo.match(/dev=([^\s)]+)/);
              if (deviceMatch) {
                blockDevice = deviceMatch[1];
                log('info', `Found block device for ${backstore.name}: ${blockDevice}`);
              }
            } catch (e) {
              log('warn', `Could not get device info for ${backstore.name}: ${e.message}`);
            }
          }
          
          // Remove the backstore
          await cockpit.spawn(["targetcli", `/backstores/${backstore.type}`, "delete", backstore.name], { superuser: "require" });
          log('info', `Removed standalone ${backstore.type} backstore: ${backstore.name}`);
          
          // Remove associated file
          if (filePath) {
            try {
              await cockpit.spawn(["rm", "-f", filePath], { superuser: "require" });
              log('info', `Removed associated file: ${filePath}`);
            } catch (error) {
              log('warn', `Could not remove file ${filePath}: ${error.message}`);
            }
          }
          
          // Wipe block device
          if (blockDevice) {
            try {
              await cockpit.spawn(["wipefs", "-a", blockDevice], { superuser: "require" });
              log('info', `Wiped filesystem signatures from: ${blockDevice}`);
            } catch (error) {
              log('warn', `Could not wipe device ${blockDevice}: ${error.message}`);
            }
          }
          
        } catch (error) {
          log('warn', `Could not remove standalone backstore ${backstore.name}: ${error.message}`);
        }
      }
      
      // Save configuration
      try {
        await cockpit.spawn(["targetcli", "saveconfig"], { superuser: "require" });
        log('info', 'Configuration saved after standalone backstore cleanup');
      } catch (error) {
        log('warn', `Could not save configuration: ${error.message}`);
      }
      
      log('info', `Cleaned up ${backstores.length} standalone backstores`);
      
    } catch (error) {
      log('warn', `Standalone backstore cleanup failed: ${error.message}`);
    }
  }

  async function logoutiSCSI(target, iqn) {
    // Create a custom dialog with multiple options
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>iSCSI Session Management</h3>
        </div>
        <div class="modal-body">
          <p><strong>Target:</strong> ${target}</p>
          <p><strong>IQN:</strong> ${iqn}</p>
          <p>Choose an action:</p>
          <div class="button-group">
            <button id="btn-logout-only" class="btn btn-warning">
              <i class="fa fa-sign-out-alt"></i> Logout Only
              <small class="btn-help">Disconnect session but keep target</small>
            </button>
            <button id="btn-delete-target" class="btn btn-danger">
              <i class="fa fa-trash"></i> Delete Target
              <small class="btn-help">Remove target completely from server</small>
            </button>
          </div>
          <div class="action-descriptions">
            <div class="action-desc">
              <strong>Logout Only:</strong> Disconnects your session but leaves the iSCSI target available for other clients or future connections.
            </div>
            <div class="action-desc">
              <strong>Delete Target:</strong> Completely removes the iSCSI target from the server, including backing storage. This cannot be undone.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="btn-cancel-action" class="btn btn-outline-secondary">Cancel</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // Handle button clicks
    const logoutBtn = modal.querySelector('#btn-logout-only');
    const deleteBtn = modal.querySelector('#btn-delete-target');
    const cancelBtn = modal.querySelector('#btn-cancel-action');
    
    const cleanup = () => {
      document.body.removeChild(modal);
    };
    
    logoutBtn.addEventListener('click', async () => {
      cleanup();
      log('info', `User chose logout only for ${target}`);
      await forceIscsiLogout(target, iqn);
    });
    
    deleteBtn.addEventListener('click', async () => {
      cleanup();
      log('info', `User chose delete target for ${iqn}`);
      
      // Show final confirmation for deletion
      showConfirmationDialog(
        'Delete iSCSI Target',
        `⚠️ WARNING: This will permanently delete the iSCSI target and all associated data.\n\nTarget: ${target}\nIQN: ${iqn}\n\nThis action cannot be undone. Are you sure?`,
        'Delete Target',
        'Cancel',
        async () => {
          await deleteIscsiTarget(iqn);
        },
        () => {
          log('info', `User cancelled target deletion for ${iqn}`);
        }
      );
    });
    
    cancelBtn.addEventListener('click', () => {
      cleanup();
      log('info', `User cancelled iSCSI action for ${target}`);
    });
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        cleanup();
      }
    });
  }

  async function forceIscsiLogout(target, iqn) {
    try {
      log('info', `[LOGOUT] Starting forceful logout from iSCSI target: ${target}, IQN: ${iqn}`);
      
      // Step 0: Check if device is mounted and unmount it
      const mountInfo = getMountByIqn(iqn);
      if (mountInfo) {
        log('info', `[LOGOUT-0] Found mounted device ${mountInfo.device} at ${mountInfo.mountpoint}, unmounting...`);
        try {
          await unmountIscsiDevice(mountInfo.device, mountInfo.mountpoint);
        } catch (unmountError) {
          log('warn', `[LOGOUT-0] Failed to unmount device: ${unmountError.message}, continuing with logout...`);
        }
      }
      
      // Step 1: Try normal logout first
      try {
        log('info', `[LOGOUT-1] Attempting normal logout for ${target}...`);
        // Ensure target includes port - add :3260 if not present
        const targetWithPort = target.includes(':') ? target : `${target}:3260`;
        const logoutResult = await cockpit.spawn(["iscsiadm", "-m", "node", "-T", iqn, "-p", targetWithPort, "--logout"], { superuser: "require" });
        log('info', `[LOGOUT-1] Normal logout successful for: ${targetWithPort}. Output: ${logoutResult}`);
      } catch (error) {
        if (error.exit_status === 21) {
          log('info', `[LOGOUT-1] No active session found for ${target}, continuing with cleanup`);
        } else {
          log('warn', `[LOGOUT-1] Normal logout failed (exit ${error.exit_status}): ${error.message}, trying forceful methods`);
        }
      }
      
      // Step 2: Force logout all sessions for this IQN
      try {
        log('info', `[LOGOUT-2] Attempting to logout all sessions for IQN ${iqn}...`);
        const logoutAllResult = await cockpit.spawn(["iscsiadm", "-m", "node", "-T", iqn, "--logout"], { superuser: "require" });
        log('info', `[LOGOUT-2] Successfully logged out all sessions for IQN. Output: ${logoutAllResult}`);
      } catch (error) {
        if (error.exit_status !== 21) {
          log('warn', `[LOGOUT-2] Failed to logout all sessions (exit ${error.exit_status}): ${error.message}`);
        } else {
          log('info', `[LOGOUT-2] No sessions found for IQN ${iqn}`);
        }
      }
      
      // Step 3: Delete the node configuration
      try {
        log('info', `[LOGOUT-3] Deleting iSCSI node configuration for ${target}...`);
        // Ensure target includes port - add :3260 if not present
        const targetWithPort = target.includes(':') ? target : `${target}:3260`;
        const deleteResult = await cockpit.spawn(["iscsiadm", "-m", "node", "-T", iqn, "-p", targetWithPort, "--op=delete"], { superuser: "require" });
        log('info', `[LOGOUT-3] Successfully deleted node configuration. Output: ${deleteResult}`);
      } catch (error) {
        log('warn', `[LOGOUT-3] Failed to delete node configuration (exit ${error.exit_status}): ${error.message}`);
      }
      
      // Step 4: Try targetcli cleanup
      try {
        log('info', `[LOGOUT-4] Attempting targetcli cleanup for IQN ${iqn}...`);
        await cleanupIscsiWithTargetcli(iqn);
        log('info', `[LOGOUT-4] targetcli cleanup completed`);
      } catch (targetcliError) {
        log('warn', `[LOGOUT-4] targetcli cleanup failed: ${targetcliError.message}`);
      }
      
      // Step 5: Restart iSCSI service if needed
      try {
        log('info', `[LOGOUT-5] Restarting iSCSI initiator service...`);
        await cockpit.spawn(["systemctl", "restart", "iscsid"], { superuser: "require" });
        log('info', `[LOGOUT-5] iSCSI service restarted successfully`);
      } catch (error) {
        log('warn', `[LOGOUT-5] Failed to restart iSCSI service: ${error.message}`);
      }
      
      // Step 6: Nuclear option - clear iSCSI database if session still persists
      try {
        log('info', `[LOGOUT-6] Clearing iSCSI database to remove persistent sessions...`);
        
        // Stop iSCSI service
        log('info', `[LOGOUT-6] Stopping iscsid service...`);
        await cockpit.spawn(["systemctl", "stop", "iscsid"], { superuser: "require" });
        
        // Clear the iSCSI database
        log('info', `[LOGOUT-6] Removing iSCSI database files...`);
        await cockpit.spawn(["rm", "-rf", "/var/lib/iscsi/nodes"], { superuser: "require" });
        await cockpit.spawn(["rm", "-rf", "/var/lib/iscsi/send_targets"], { superuser: "require" });
        
        // Restart iSCSI service
        log('info', `[LOGOUT-6] Restarting iscsid service...`);
        await cockpit.spawn(["systemctl", "start", "iscsid"], { superuser: "require" });
        
        log('info', `[LOGOUT-6] iSCSI database cleared and service restarted`);
      } catch (error) {
        log('warn', `[LOGOUT-6] Failed to clear iSCSI database: ${error.message}`);
      }
      
      log('info', `[LOGOUT] Forceful logout completed for ${target}`);
      
      // Add target to logged-out list for future display
      addToLoggedOutList(iqn, target);
      
      // Force a more thorough refresh with multiple attempts
      log('info', `[LOGOUT] Refreshing session list after logout...`);
      
      // Clear any cached iscsiadm data
      try {
        log('info', `[LOGOUT] Clearing iscsiadm cache...`);
        await cockpit.spawn(["iscsiadm", "-m", "session", "-R"], { superuser: "require" });
        log('info', `[LOGOUT] iscsiadm cache cleared`);
      } catch (e) {
        log('info', `[LOGOUT] Cache clear failed (normal if no sessions): ${e.message}`);
      }
      
      // Wait and refresh multiple times to ensure clean state
      log('info', `[LOGOUT] Starting delayed refreshes...`);
      for (let i = 0; i < 3; i++) {
        setTimeout(async () => {
          log('info', `[LOGOUT] Refresh attempt ${i + 1} of 3`);
          await loadIscsiSessions();
          if (i === 2) {
            log('info', `[LOGOUT] Final refresh - updating overview`);
            await updateOverview(); // Update overview on final refresh
          }
        }, (i + 1) * 1000);
      }
      
      // Also force an immediate refresh
      log('info', `[LOGOUT] Immediate session refresh`);
      setTimeout(async () => {
        await loadIscsiSessions();
      }, 500);
      
    } catch (error) {
      log('error', `[LOGOUT] Forceful logout failed: ${error.message}`);
      
      // Even if logout failed, still refresh the session list
      setTimeout(async () => {
        await loadIscsiSessions();
      }, 1000);
      
      alert(`Failed to logout from iSCSI target: ${error.message}\nCheck logs for details.`);
    }
  }

  async function loginiSCSI(target, iqn) {
    try {
      log('info', `Starting iSCSI login for target: ${target}, IQN: ${iqn}`);
      
      // Ensure target includes port
      const targetWithPort = target.includes(':') ? target : `${target}:3260`;
      
      // Step 1: Discover the target if not already in database
      try {
        log('info', `Discovering target on ${targetWithPort}...`);
        await cockpit.spawn(["iscsiadm", "-m", "discovery", "-t", "st", "-p", targetWithPort], { superuser: "require" });
        log('info', `Discovery completed for ${targetWithPort}`);
      } catch (error) {
        const errorInfo = handleOperationError(error, 'iSCSI discovery', 'iscsi');
        if (errorInfo.type === 'error' && !error.message.includes("already exists")) {
          throw error;
        }
      }
      
      // Step 2: Login to the target
      try {
        log('info', `Logging in to target ${iqn} on ${targetWithPort}...`);
        await cockpit.spawn(["iscsiadm", "-m", "node", "-T", iqn, "-p", targetWithPort, "--login"], { superuser: "require" });
        log('info', `Successfully logged in to ${iqn}`);
        showMessage(`Successfully logged in to iSCSI target: ${iqn}`, 'success');
        
        // Remove from logged-out list when successfully logged in
        removeFromLoggedOutList(iqn, target);
        
      } catch (error) {
        const errorInfo = handleOperationError(error, 'iSCSI login', 'iscsi');
        if (errorInfo.type === 'info') {
          // Already logged in - still consider this success
          removeFromLoggedOutList(iqn, target);
        } else if (errorInfo.type === 'error') {
          throw error;
        }
      }
      
      // Refresh sessions
      await loadIscsiSessions();
      await updateOverview();
      
    } catch (error) {
      handleOperationError(error, 'iSCSI login', 'iscsi');
    }
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
    const backingStore = $("#iscsi-backing-store").value.trim();
    const storagePath = $("#iscsi-path").value.trim();
    const portal = $("#iscsi-portal").value.trim() || "0.0.0.0";
    const openAcl = $("#iscsi-open-acl").checked;
    const msg = $("#iscsi-create-msg");
    
    if (!name || !backingStore) {
      showMessage("Name and backing store are required.", "error");
      return;
    }
    
    // For file-based storage, size is required
    if (backingStore === 'file' && (!size || size <= 0)) {
      showMessage("Size is required for file-based backing store.", "error");
      return;
    }
    
    const iqn = makeIQN(name);
    let backingPath;
    let isFileBased = false;
    
    try {
      if (msg) {
        msg.className = "message info";
        msg.textContent = "Creating iSCSI target...";
      }
      
      // Determine backing store configuration
      if (backingStore === 'file') {
        // File-based storage
        isFileBased = true;
        // Ensure storagePath doesn't have trailing slash and provide proper default
        const basePath = (storagePath || "/var/lib/iscsi-disks").replace(/\/+$/, '');
        const imgDir = basePath;
        backingPath = `${imgDir}/${name}.img`;
        
        // Create directory and file
        await run(`install -d -m 0755 ${shq(imgDir)}`, 12000);
        log('info', `Created directory: ${imgDir}`);
        
        // Check if file already exists, if not create it
        const fileExists = await run(`test -f ${shq(backingPath)} && echo "exists" || echo "missing"`);
        if (fileExists.trim() === "missing") {
          await run(`fallocate -l ${size}G ${shq(backingPath)}`, 12000);
          log('info', `Created backing file: ${backingPath} (${size}GB)`);
        } else {
          log('info', `Using existing backing file: ${backingPath}`);
        }
        
        // Verify file was created successfully
        const verifyFile = await run(`ls -la ${shq(backingPath)}`);
        log('info', `File verification: ${verifyFile.trim()}`);
        log('info', `Created file-based backing store: ${backingPath}`);
        
      } else {
        // Disk-based storage
        backingPath = backingStore; // This should be something like /dev/sdc
        
        // Validate disk selection
        const availableDisks = await loadAvailableDisks();
        const selectedDisk = availableDisks.find(disk => disk.path === backingPath);
        
        if (!selectedDisk) {
          throw new Error(`Selected disk ${backingPath} is no longer available or in use`);
        }
        
        // If size is provided, validate it doesn't exceed disk capacity
        if (size && size > 0) {
          const maxSizeGB = Math.floor(selectedDisk.sizeInBytes / (1024 * 1024 * 1024) * 0.99);
          if (size > maxSizeGB) {
            throw new Error(`Size ${size}GB exceeds available disk capacity ${maxSizeGB}GB (99% of ${selectedDisk.size})`);
          }
        }
        
        log('info', `Using disk-based backing store: ${backingPath} (${selectedDisk.size})`);
        
        // Warn user this will wipe the disk
        if (msg) {
          msg.className = "message warning";
          msg.textContent = `WARNING: This will completely wipe disk ${selectedDisk.name}. Creating target...`;
        }
      }
      
      // Clean up any orphaned backstores that might cause validation issues
      try {
        log('info', `Cleaning up orphaned backstores...`);
        
        // Remove known problematic backstores
        const cleanupCommands = [
          'cd /',
          'backstores/fileio/ delete iscsi1-xd9 || true',
          'backstores/block/ delete disk-b || true',
          'backstores/fileio/ delete rtht || true'
        ];
        
        for (const cmd of cleanupCommands) {
          try {
            await targetcli([cmd]);
          } catch (e) {
            // Ignore errors for cleanup
          }
        }
        
        log('info', `Orphaned backstores cleanup completed`);
      } catch (error) {
        log('warn', `Backstores cleanup warning: ${error.message}`);
      }
      
      // Create targetcli configuration
      const commands = [];
      
      if (isFileBased) {
        commands.push(`/backstores/fileio create name=${name} file_or_dev=${backingPath}`);
      } else {
        commands.push(`/backstores/block create name=${name} dev=${backingPath}`);
      }
      
      commands.push(`/iscsi create ${iqn}`);
      commands.push(`/iscsi/${iqn}/tpg1/luns create /backstores/${isFileBased ? 'fileio' : 'block'}/${name}`);
      
      if (portal !== "0.0.0.0") {
        commands.push(`/iscsi/${iqn}/tpg1/portals delete 0.0.0.0 3260 || true`);
        commands.push(`/iscsi/${iqn}/tpg1/portals create ${portal} 3260`);
      }
      
      if (openAcl) {
        commands.push(`/iscsi/${iqn}/tpg1 set attribute generate_node_acls=1 cache_dynamic_acls=1 demo_mode_write_protect=0`);
      }
      
      commands.push('saveconfig');
      
      // Execute targetcli commands
      await targetcli(commands);
      
      if (msg) {
        msg.className = "message success";
        msg.textContent = `Successfully created iSCSI target: ${iqn}`;
      }
      
      // Clear form and refresh
      e.target.reset();
      await loadIscsiTargets();
      await updateOverview();
      
    } catch (error) {
      log('error', `Failed to create iSCSI target: ${error.message}`);
      if (msg) {
        msg.className = "message error";
        msg.textContent = `Failed to create target: ${error.message}`;
      }
    }
  }

  // ===== Status Updates =====
  async function updateOverview() {
    log('info', 'Updating overview...');
    
    // Check actual tool availability
    const nfsAvailable = await checkNfsTools();
    const iscsiAvailable = await checkIscsiTools();
    const osInfo = await getOsInfo();
    
    // Update status dots and messages
    const systemDot = $("#system-status-dot");
    const nfsDot = $("#nfs-status-dot");
    const iscsiDot = $("#iscsi-status-dot");
    
    // System status should be error if tools are missing
    const systemReady = nfsAvailable && iscsiAvailable;
    if (systemDot) {
      systemDot.className = systemReady ? "status-dot ok" : "status-dot warning";
      const systemStatus = $("#system-status");
      if (systemStatus) systemStatus.textContent = systemReady ? "System ready" : "Missing dependencies";
    }
    
    if (nfsDot) {
      nfsDot.className = nfsAvailable ? "status-dot ok" : "status-dot error";
      const nfsStatus = $("#nfs-status");
      if (nfsStatus) nfsStatus.textContent = nfsAvailable ? "Ready" : "NFS tools not installed";
    }
    
    if (iscsiDot) {
      iscsiDot.className = iscsiAvailable ? "status-dot ok" : "status-dot error";
      const iscsiStatus = $("#iscsi-status");
      if (iscsiStatus) iscsiStatus.textContent = iscsiAvailable ? "Ready" : "iSCSI tools not installed";
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
    
    // Load iSCSI targets and update count
    loadIscsiTargets().then(targets => {
      const targetsCount = $("#iscsi-targets-count");
      if (targetsCount) targetsCount.textContent = targets.length.toString();
    }).catch(() => {
      const targetsCount = $("#iscsi-targets-count");
      if (targetsCount) targetsCount.textContent = "0";
    });
    
    // Set tool status with help buttons
    const nfsTools = $("#nfs-tools-status");
    const iscsiTools = $("#iscsi-tools-status");
    
    if (nfsTools) {
      if (nfsAvailable) {
        nfsTools.innerHTML = "Available";
      } else {
        nfsTools.innerHTML = `Not Installed <button class="btn btn-link btn-xs help-btn" data-help-type="nfs" title="Show installation instructions">?</button>`;
        // Add event listener for the help button
        const helpBtn = nfsTools.querySelector('.help-btn');
        if (helpBtn) {
          helpBtn.addEventListener('click', () => showInstallHelp('nfs', osInfo));
        }
      }
    }
    
    if (iscsiTools) {
      if (iscsiAvailable) {
        iscsiTools.innerHTML = "Available";
      } else {
        iscsiTools.innerHTML = `Not Installed <button class="btn btn-link btn-xs help-btn" data-help-type="iscsi" title="Show installation instructions">?</button>`;
        // Add event listener for the help button
        const helpBtn = iscsiTools.querySelector('.help-btn');
        if (helpBtn) {
          helpBtn.addEventListener('click', () => showInstallHelp('iscsi', osInfo));
        }
      }
    }
    
    // Store OS info globally for help functions
    window.osInfo = osInfo;
    
    // Update system status based on tool availability
    if (!nfsAvailable || !iscsiAvailable) {
      systemStatus = 'not-ready';
      updateStatusBar('System dependencies missing', 'error');
    } else if (systemStatus === 'not-ready') {
      systemStatus = 'ready';
      updateStatusBar('System ready', 'info');
    }
  }

  // ===== iSCSI Session Management with targetcli =====
  async function cleanupIscsiWithTargetcli(iqn) {
    try {
      log('info', `Attempting targetcli cleanup for IQN: ${iqn}`);
      
      // Clean the IQN to remove any suffixes like "(non-flash)"
      const cleanIqn = iqn.replace(/\s*\([^)]*\)\s*$/, '').trim();
      log('info', `Using cleaned IQN for targetcli: ${cleanIqn}`);
      
      // Simple targetcli commands to clean up
      try {
        // Try to delete the IQN target using bash with proper quoting
        await cockpit.spawn(["bash", "-c", `targetcli '/iscsi delete "${cleanIqn}"'`], { superuser: "require" });
        log('info', `Deleted iSCSI target: ${cleanIqn}`);
      } catch (error) {
        // If it doesn't exist, that's fine
        if (!error.message.includes("does not exist")) {
          log('warn', `Could not delete iSCSI target ${cleanIqn}: ${error.message}`);
        }
      }
      
      try {
        // Save configuration
        await cockpit.spawn(["bash", "-c", "targetcli saveconfig"], { superuser: "require" });
        log('info', 'targetcli configuration saved');
      } catch (error) {
        log('warn', `Could not save targetcli config: ${error.message}`);
      }
      
      log('info', `targetcli cleanup completed for: ${cleanIqn}`);
      
    } catch (error) {
      log('warn', `targetcli cleanup failed: ${error.message}`);
    }
  }

  // ===== Logs Management =====
  async function loadSystemLogs() {
    log('info', 'Refreshing system logs...');
    updateLogDisplay(); // Just refresh the current activity log
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

  // ===== NFS Export Creation =====
  async function handleNfsCreate(event) {
    event.preventDefault();
    
    const form = event.target;
    
    // Get values directly from form elements
    const shareName = $("#nfs-name")?.value?.trim();
    const basePath = $("#nfs-base")?.value?.trim();
    const scope = $("#nfs-scope")?.value?.trim();
    const permission = $("#nfs-perm")?.value?.trim() || 'rw';
    
    // Construct full path
    const fullPath = `${basePath}/${shareName}`;
    
    // Handle checkboxes
    const noRootSquash = $("#nfs-no-root-squash")?.checked;
    
    // Build options
    let options = `${permission},sync,no_subtree_check`;
    if (noRootSquash) {
      options += ',no_root_squash';
    }
    
    // Validate required fields
    if (!shareName || !basePath || !scope) {
      showMessage('Please fill in all required fields (Share Name, Base Path, and Access Scope)', 'error');
      return;
    }
    
    // Create directory if it doesn't exist
    try {
      await cockpit.spawn(['mkdir', '-p', fullPath], { superuser: "require" });
      log('info', `Created/verified directory: ${fullPath}`);
    } catch (error) {
      showMessage(`Failed to create directory ${fullPath}: ${error.message}`, 'error');
      return;
    }
    
    const msg = $("#nfs-create-msg");
    
    try {
      if (msg) {
        msg.className = "message info";
        msg.textContent = "Creating NFS export...";
      }
      
      log('info', `Creating NFS export: ${fullPath} → ${scope} (${options})`);
      
      // Add export to /etc/exports
      const exportLine = `${fullPath} ${scope}(${options})`;
      
      // Read current exports
      let exportsContent = '';
      try {
        exportsContent = await cockpit.file("/etc/exports").read();
      } catch (e) {
        // File doesn't exist, will be created
        log('info', '/etc/exports does not exist, will be created');
      }
      
      // Check if export already exists
      if (exportsContent.includes(`${fullPath} ${scope}`)) {
        throw new Error(`Export already exists: ${fullPath} → ${scope}`);
      }
      
      // Add new export (ensure proper line ending)
      const newContent = exportsContent ? `${exportsContent.trim()}\n${exportLine}\n` : `${exportLine}\n`;
      await cockpit.file("/etc/exports").replace(newContent);
      
      // Reload NFS exports
      try {
        await cockpit.spawn(['exportfs', '-ra'], { superuser: "require" });
        log('info', 'NFS exports reloaded successfully');
      } catch (e) {
        log('warn', 'Could not reload NFS exports daemon, may need manual restart');
        // Still show success since export was added to file
      }
      
      if (msg) {
        msg.className = "message success";
        msg.textContent = `Successfully created NFS export: ${fullPath} → ${scope}`;
      }
      
      // Clear form
      form.reset();
      
      // Refresh exports list and overview
      await loadNfsExports();
      await updateOverview();
      
    } catch (error) {
      log('error', `Failed to create NFS export: ${error.message}`);
      if (msg) {
        msg.className = "message error";
        msg.textContent = `Failed to create export: ${error.message}`;
      }
    }
  }

  // ===== iSCSI Discovery & Mount =====
  let selectedTarget = null; // Store selected target info

  async function handleIscsiDiscovery(event) {
    event.preventDefault();
    
    const portal = $("#im-portal")?.value?.trim();
    const msg = $("#iscsi-discovery-msg");
    const resultsDiv = $("#iscsi-discovery-results");
    const tableBody = $("#iscsi-targets-table");
    
    if (!portal) {
      showMessage("Portal address is required", "error");
      return;
    }
    
    try {
      if (msg) {
        msg.className = "message info";
        msg.textContent = "Discovering iSCSI targets...";
      }
      
      log('info', `Discovering iSCSI targets on portal: ${portal}`);
      
      // Use iscsiadm to discover targets temporarily (without persisting to database)
      const result = await cockpit.spawn(['iscsiadm', '-m', 'discovery', '-t', 'st', '-p', portal, '--op=nonpersistent'], { superuser: "require" });
      
      const targets = [];
      if (result.trim()) {
        const lines = result.trim().split('\n');
        for (const line of lines) {
          // Format: "192.168.1.100:3260,1 iqn.2025-01.local.server:shares-test"
          const match = line.match(/^(.+?),\d+\s+(.+)$/);
          if (match) {
            const [, discoveredPortal, iqn] = match;
            targets.push({
              portal: discoveredPortal,
              iqn: iqn.trim(),
              status: 'available'
            });
          }
        }
      }
      
      if (targets.length === 0) {
        if (msg) {
          msg.className = "message warning";
          msg.textContent = "No iSCSI targets found on this portal";
        }
        if (resultsDiv) resultsDiv.classList.add('hidden');
        return;
      }
      
      // Check which targets are already logged in
      try {
        const sessionResult = await cockpit.spawn(['iscsiadm', '-m', 'session'], { superuser: "require" });
        const sessionLines = sessionResult.trim().split('\n');
        
        for (const target of targets) {
          for (const sessionLine of sessionLines) {
            if (sessionLine.includes(target.iqn)) {
              target.status = 'connected';
              break;
            }
          }
        }
      } catch (e) {
        // No active sessions, all targets are available
        log('info', 'No active iSCSI sessions found');
      }
      
      // Populate the results table
      if (tableBody) {
        tableBody.innerHTML = '';
        targets.forEach((target, index) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><code>${target.iqn}</code></td>
            <td>${target.portal}</td>
            <td><span class="target-status ${target.status}">${target.status}</span></td>
            <td>
              <button class="btn btn-sm btn-brand select-target-btn" 
                      data-iqn="${target.iqn}"
                      data-portal="${target.portal}"
                      ${target.status === 'connected' ? 'disabled' : ''}>
                ${target.status === 'connected' ? 'Connected' : 'Select'}
              </button>
            </td>
          `;
          tableBody.appendChild(row);
          
          // Add event listener to the select button
          const selectBtn = row.querySelector('.select-target-btn');
          if (selectBtn && target.status !== 'connected') {
            selectBtn.addEventListener('click', (e) => {
              e.preventDefault();
              log('info', `Button clicked for target: ${target.iqn}`);
              selectTarget(target.iqn, target.portal);
            });
          }
        });
      }
      
      if (msg) {
        msg.className = "message success";
        msg.textContent = `Found ${targets.length} iSCSI target(s)`;
      }
      
      if (resultsDiv) resultsDiv.classList.remove('hidden');
      
    } catch (error) {
      log('error', `iSCSI discovery failed: ${error.message}`);
      if (msg) {
        msg.className = "message error";
        msg.textContent = `Discovery failed: ${error.message}`;
      }
      if (resultsDiv) resultsDiv.classList.add('hidden');
    }
  }

  // Local function to select a target
  function selectTarget(iqn, portal) {
    log('info', `selectTarget called with iqn: ${iqn}, portal: ${portal}`);
    
    selectedTarget = { iqn, portal };
    
    log('info', `selectedTarget set to: ${JSON.stringify(selectedTarget)}`);
    
    // Update the selected target info
    const infoDiv = $("#selected-target-info");
    if (infoDiv) {
      infoDiv.innerHTML = `
        <strong>Target:</strong> <code>${iqn}</code><br>
        <strong>Portal:</strong> <code>${portal}</code>
      `;
      log('info', 'Updated selected target info div');
    } else {
      log('error', 'Could not find selected-target-info div');
    }
    
    // Show the mount stage
    const discoveryStage = $("#iscsi-discovery-stage");
    const mountStage = $("#iscsi-mount-stage");
    
    if (discoveryStage && mountStage) {
      discoveryStage.classList.add('hidden');
      mountStage.classList.remove('hidden');
      log('info', 'Switched to mount stage');
    } else {
      log('error', `Could not find stage divs: discovery=${!!discoveryStage}, mount=${!!mountStage}`);
    }
    
    log('info', `Successfully selected target: ${iqn} on ${portal}`);
  }

  async function handleIscsiMount(event) {
    event.preventDefault();
    
    log('info', `Mount function called, selectedTarget: ${JSON.stringify(selectedTarget)}`);
    
    if (!selectedTarget) {
      const errorMsg = "No target selected. Please go back and select a target first.";
      log('error', errorMsg);
      showMessage(errorMsg, "error");
      return;
    }
    
    const fstype = $("#im-fstype")?.value || 'ext4';
    const mountpoint = $("#im-mountpoint")?.value?.trim();
    const msg = $("#iscsi-mount-msg");
    
    log('info', `Mount parameters: fstype=${fstype}, mountpoint=${mountpoint}, auto-format=true`);
    
    if (!mountpoint) {
      showMessage("Mountpoint is required", "error");
      return;
    }
    
    // Validate mount point before proceeding
    try {
      validateMountPoint(mountpoint);
    } catch (error) {
      log('error', `Mount point validation failed: ${error.message}`);
      showMessage(error.message, "error");
      return;
    }
    
    let sessionCreated = false;
    let iscsiDevice = null;
    
    try {
      if (msg) {
        msg.className = "message info";
        msg.textContent = "Checking for existing session...";
      }
      
      const { iqn, portal } = selectedTarget;
      log('info', `Checking for existing session for: ${iqn} on ${portal}`);
      
      // First check if session already exists
      let sessionExists = false;
      try {
        const sessionCheck = await cockpit.spawn(['iscsiadm', '-m', 'session'], { superuser: "try" });
        sessionExists = sessionCheck.includes(iqn) && sessionCheck.includes(portal.split(':')[0]);
        log('info', `Session exists check: ${sessionExists}`);
      } catch (e) {
        if (e.exit_status !== 21) {
          log('warn', `Session check failed: ${e.message}`);
        }
        sessionExists = false;
      }
      
      if (!sessionExists) {
        if (msg) {
          msg.textContent = "Adding target to database and logging in...";
        }
        
        log('info', `Adding target to database and logging in: ${iqn} on ${portal}`);
        
        // First discover the target to add it to the database (persistent this time)
        try {
          await cockpit.spawn(['iscsiadm', '-m', 'discovery', '-t', 'st', '-p', portal], { superuser: "require" });
          log('info', `Target added to database: ${iqn}`);
        } catch (error) {
          if (!error.message.includes("already exists")) {
            log('warn', `Discovery failed but continuing: ${error.message}`);
          }
        }
        
        // Login to the iSCSI target
        await cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', portal, '--login'], { superuser: "require" });
        log('info', 'Successfully logged in to iSCSI target');
        sessionCreated = true;
        
        // Wait a moment for the device to appear
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        log('info', 'Session already exists, using existing connection');
        if (msg) {
          msg.textContent = "Using existing session...";
        }
      }
      
      // Find the new device
      if (msg) {
        msg.textContent = "Finding iSCSI device...";
      }
      
      // Find the new device using a more reliable method
      const targetIqn = selectedTarget.iqn;
      
      // Use a more direct approach to find the device
      iscsiDevice = null;
      
      try {
        // Get all SCSI devices and their associated iSCSI sessions
        const sessionDevicesResult = await cockpit.spawn(['ls', '-la', '/dev/disk/by-path/'], { superuser: "require" });
        const lines = sessionDevicesResult.split('\n');
        
        for (const line of lines) {
          if (line.includes('iscsi') && line.includes(portal.split(':')[0])) {
            const match = line.match(/-> \.\.\/\.\.\/(sd[a-z]+)/);
            if (match) {
              iscsiDevice = `/dev/${match[1]}`;
              log('info', `Found iSCSI device via by-path: ${iscsiDevice}`);
              break;
            }
          }
        }
      } catch (e) {
        log('warn', 'Could not use by-path method, trying lsblk');
      }
      
      // Fallback method if by-path didn't work
      if (!iscsiDevice) {
        try {
          const lsblkResult = await cockpit.spawn(['lsblk', '-J', '-o', 'NAME,SIZE,MOUNTPOINT,TYPE'], { superuser: "require" });
          const devices = JSON.parse(lsblkResult);
          
          // Look for unmounted disk devices
          const candidates = [];
          for (const device of devices.blockdevices) {
            if (device.type === 'disk' && device.name.startsWith('sd') && !device.mountpoint) {
              // Check if this device is iSCSI by looking at its path
              try {
                const deviceInfo = await cockpit.spawn(['readlink', '-f', `/sys/block/${device.name}`], { superuser: "require" });
                if (deviceInfo.includes('iscsi')) {
                  candidates.push({
                    device: `/dev/${device.name}`,
                    size: device.size
                  });
                }
              } catch (e) {
                // Check by device size or other means
                if (device.size && !device.children) {
                  candidates.push({
                    device: `/dev/${device.name}`,
                    size: device.size
                  });
                }
              }
            }
          }
          
          // Pick the first candidate (or most recent)
          if (candidates.length > 0) {
            iscsiDevice = candidates[0].device;
            log('info', `Found iSCSI device via lsblk: ${iscsiDevice}`);
          }
        } catch (e) {
          log('error', `lsblk fallback failed: ${e.message}`);
        }
      }
      
      if (!iscsiDevice) {
        throw new Error("Could not find the iSCSI device after login. The device may take longer to appear or there may be a connection issue.");
      }
      
      log('info', `Found iSCSI device: ${iscsiDevice}`);
      
      // Verify the device actually exists and is accessible
      try {
        await cockpit.spawn(['test', '-b', iscsiDevice], { superuser: "require" });
        log('info', `Verified device exists: ${iscsiDevice}`);
      } catch (e) {
        throw new Error(`Device ${iscsiDevice} is not accessible: ${e.message}`);
      }
      
      // Check current filesystem type
      let currentFsType = null;
      let needsFormat = false;
      
      try {
        const blkidResult = await cockpit.spawn(['blkid', '-o', 'value', '-s', 'TYPE', iscsiDevice], { superuser: "require" });
        currentFsType = blkidResult.trim();
        log('info', `Device has filesystem: ${currentFsType}`);
        
        // Check if filesystem type matches what user selected
        if (currentFsType !== fstype) {
          log('info', `Filesystem type mismatch: device has ${currentFsType}, user wants ${fstype}`);
          needsFormat = true;
        } else {
          log('info', `Filesystem type matches: ${currentFsType}`);
          needsFormat = false;
        }
      } catch (e) {
        needsFormat = true;
        log('info', 'Device needs formatting (no filesystem detected)');
      }
      
      // Format if needed or if user wants different filesystem
      if (needsFormat) {
        if (msg) {
          msg.textContent = `Formatting device with ${fstype}...`;
        }
        
        log('info', `Formatting device with ${fstype}`);
        
        // First unmount if mounted
        try {
          await cockpit.spawn(['umount', iscsiDevice], { superuser: "require" });
        } catch (e) {
          // Device not mounted, that's fine
        }
        
        // Format the device with filesystem-specific commands and proper flags
        let formatCmd;
        switch (fstype) {
          case 'xfs':
            formatCmd = ['mkfs.xfs', '-f', iscsiDevice];
            break;
          case 'btrfs':
            formatCmd = ['mkfs.btrfs', '-f', iscsiDevice];
            break;
          case 'ext4':
            formatCmd = ['mkfs.ext4', '-F', iscsiDevice];
            break;
          case 'ext3':
            formatCmd = ['mkfs.ext3', '-F', iscsiDevice];
            break;
          case 'ext2':
            formatCmd = ['mkfs.ext2', '-F', iscsiDevice];
            break;
          default:
            formatCmd = ['mkfs.ext4', '-F', iscsiDevice];
        }
        
        try {
          await cockpit.spawn(formatCmd, { superuser: "require" });
          log('info', `Successfully formatted ${iscsiDevice} with ${fstype} using: ${formatCmd.join(' ')}`);
        } catch (formatError) {
          handleOperationError(formatError, 'Filesystem formatting', 'filesystem');
          throw formatError;
        }
      } else {
        log('info', `Device already has correct filesystem (${currentFsType}), skipping format`);
      }
      
      // Create mountpoint directory with proper error handling
      if (msg) {
        msg.textContent = `Creating mount directory ${mountpoint}...`;
      }
      
      try {
        // Create parent directories if needed
        const parentDir = mountpoint.substring(0, mountpoint.lastIndexOf('/'));
        if (parentDir && parentDir !== '/') {
          await cockpit.spawn(['mkdir', '-p', parentDir], { superuser: "require" });
        }
        
        // Create the mount directory
        await cockpit.spawn(['mkdir', '-p', mountpoint], { superuser: "require" });
        log('info', `Created mount directory: ${mountpoint}`);
        
        // Verify directory was created and is accessible
        await cockpit.spawn(['test', '-d', mountpoint], { superuser: "require" });
        
        // Set proper permissions
        await cockpit.spawn(['chmod', '755', mountpoint], { superuser: "require" });
        
      } catch (error) {
        throw new Error(`Failed to create mount directory ${mountpoint}: ${error.message}. Check if the path is valid and you have permissions.`);
      }
      
      // Mount the device
      if (msg) {
        msg.textContent = `Mounting ${iscsiDevice} to ${mountpoint}...`;
      }
      
      try {
        await cockpit.spawn(['mount', iscsiDevice, mountpoint], { superuser: "require" });
        log('info', `Successfully mounted ${iscsiDevice} to ${mountpoint}`);
        
        // Verify mount was successful
        const mountCheck = await cockpit.spawn(['mountpoint', mountpoint], { superuser: "require" });
        if (!mountCheck.includes('is a mountpoint')) {
          throw new Error('Mount verification failed');
        }
        
        // Add to mount tracking
        const { iqn, portal } = selectedTarget;
        addMountTracking(iscsiDevice, mountpoint, 'iscsi', iqn, portal);
        
      } catch (error) {
        // If mount fails, clean up the directory we created
        try {
          await cockpit.spawn(['rmdir', mountpoint], { superuser: "require" });
        } catch (e) {
          // Ignore cleanup errors
        }
        throw new Error(`Failed to mount ${iscsiDevice} to ${mountpoint}: ${error.message}`);
      }
      
      if (msg) {
        msg.className = "message success";
        msg.textContent = `Successfully mounted iSCSI device to ${mountpoint}`;
      }
      
      log('info', `Mount operation completed successfully`);
      
      // Reset to discovery stage
      backToDiscovery();
      
      // Refresh sessions and overview
      setTimeout(() => {
        loadIscsiSessions();
        updateOverview();
      }, 1000);
      
    } catch (error) {
      log('error', `iSCSI mount failed: ${error.message}`);
      
      // If we created a session and mount failed, clean it up
      if (sessionCreated && selectedTarget) {
        log('info', 'Mount failed, cleaning up iSCSI session...');
        try {
          const { iqn, portal } = selectedTarget;
          await cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', portal, '--logout'], { superuser: "require" });
          log('info', 'Successfully cleaned up failed session');
        } catch (logoutError) {
          log('warn', `Failed to cleanup session after mount failure: ${logoutError.message}`);
        }
      }
      
      if (msg) {
        msg.className = "message error";
        msg.textContent = `Mount failed: ${error.message}`;
      }
      
      // Show user-friendly error message
      showMessage(`Failed to mount iSCSI device: ${error.message}`, "error");
    }
  }

  function backToDiscovery() {
    const discoveryStage = $("#iscsi-discovery-stage");
    const mountStage = $("#iscsi-mount-stage");
    
    if (discoveryStage) discoveryStage.classList.remove('hidden');
    if (mountStage) mountStage.classList.add('hidden');
    
    selectedTarget = null;
    
    // Clear the discovery results to force re-discovery
    const resultsDiv = $("#iscsi-discovery-results");
    if (resultsDiv) resultsDiv.classList.add('hidden');
    
    log('info', 'Returned to discovery stage');
  }

  // ===== Initialize =====
  function initialize() {
    log('info', 'XAVS Shares module initializing...');
    
    // Load mount tracking data
    loadMountTracking();
    
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
    $("#btn-targets-refresh")?.addEventListener("click", loadIscsiTargets);
    $("#btn-cleanup-backstores")?.addEventListener("click", cleanupOrphanedBackstores);
    $("#iscsi-create-form")?.addEventListener("submit", submitCreateIscsi);
    $("#nfs-create-form")?.addEventListener("submit", handleNfsCreate);
    $("#nfs-mount-form")?.addEventListener("submit", handleNfsMount);
    $("#iscsi-discovery-form")?.addEventListener("submit", handleIscsiDiscovery);
    $("#iscsi-mount-form")?.addEventListener("submit", handleIscsiMount);
    $("#btn-back-to-discovery")?.addEventListener("click", backToDiscovery);
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
    
    // Log management handlers
    $("#btn-refresh-logs")?.addEventListener("click", loadSystemLogs);
    $("#btn-clear-logs")?.addEventListener("click", clearActivityLog);
    $("#view-logs-btn")?.addEventListener("click", () => {
      setActiveTab('tab-logs');
    });
    
    // Initialize dropdown menus
    initializeDropdowns();
    
    // Clear button handlers
    $("#btn-nfs-clear")?.addEventListener("click", () => {
      $("#nfs-create-form").reset();
      log('info', 'NFS create form cleared');
    });
    
    $("#btn-nfs-mount-clear")?.addEventListener("click", () => {
      $("#nfs-mount-form").reset();
      log('info', 'NFS mount form cleared');
    });
    
    $("#btn-iscsi-clear")?.addEventListener("click", () => {
      $("#iscsi-create-form").reset();
      // Reset backing store selection to show file options by default
      const backingStoreSelect = $("#iscsi-backing-store");
      backingStoreSelect.value = "file";
      // Trigger the change event to update the UI
      const changeEvent = new Event('change', { bubbles: true });
      backingStoreSelect.dispatchEvent(changeEvent);
      log('info', 'iSCSI create form cleared');
    });
    
    // IP address validation
    function validateIP(input) {
      const ipPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      const ipPortPattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?::\d{1,5})?$/;
      
      const value = input.value.trim();
      if (!value) return true; // Allow empty values
      
      const isValid = input.id === 'im-portal' ? ipPortPattern.test(value) : ipPattern.test(value);
      
      if (isValid) {
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
      } else {
        input.classList.remove('is-valid');
        input.classList.add('is-invalid');
      }
      
      return isValid;
    }
    
    // Add IP validation to portal fields
    $("#iscsi-portal")?.addEventListener("input", (e) => validateIP(e.target));
    $("#im-portal")?.addEventListener("input", (e) => validateIP(e.target));
    
    log('info', 'XAVS Shares module ready');
  }
  
  function initializeDropdowns() {
    // Handle all dropdown toggles
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const dropdown = toggle.closest('.dropdown');
        const menu = dropdown.querySelector('.dropdown-menu');
        
        // Close all other dropdowns
        document.querySelectorAll('.dropdown-menu.show').forEach(otherMenu => {
          if (otherMenu !== menu) {
            otherMenu.classList.remove('show');
          }
        });
        
        // Toggle current dropdown
        menu.classList.toggle('show');
      });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
          menu.classList.remove('show');
        });
      }
    });
    
    // Handle dropdown item clicks
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Close the dropdown after clicking an item
        const menu = item.closest('.dropdown-menu');
        if (menu) {
          menu.classList.remove('show');
        }
      });
    });
  }

  // Try immediate initialization, fallback to DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

})();
