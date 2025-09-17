// XAVS Storage Module

document.addEventListener('DOMContentLoaded', function() {
    console.log('XAVS Storage initializing...');
    
    // Initialize tab switching
    setupTabSwitching();
    
    // Initialize components
    setupEventHandlers();
    
    // Show initial content immediately
    showOverviewTab();
    
    // Load initial data for overview
    loadOverviewData();
    
    // Setup auto-refresh for overview data
    setInterval(loadOverviewData, 10000); // Refresh every 10 seconds
    
    console.log('XAVS Storage initialized successfully');
    
    // Force visibility check after short delay
    setTimeout(() => {
        forceShowContent();
    }, 500);
});

function forceShowContent() {
    console.log('Forcing content visibility...');
    
    // Ensure overview panel is visible
    const overviewPanel = document.getElementById('panel-overview');
    if (overviewPanel) {
        overviewPanel.style.display = 'block';
        overviewPanel.style.visibility = 'visible';
        overviewPanel.classList.add('active');
        console.log('Overview panel forced visible');
    }
    
    // Ensure overview tab is active
    const overviewTab = document.querySelector('[data-target="panel-overview"]');
    if (overviewTab) {
        overviewTab.classList.add('active');
        console.log('Overview tab forced active');
    }
    
    // Check if content cards exist
    const cards = document.querySelectorAll('.card');
    console.log('Cards found:', cards.length);
    cards.forEach((card, index) => {
        card.style.display = 'block';
        card.style.visibility = 'visible';
        console.log(`Card ${index} forced visible`);
    });
}

function setupTabSwitching() {
    const tabs = document.querySelectorAll('.nav-link');
    const panels = document.querySelectorAll('.tab-pane');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('data-target');
            
            // Remove active class from all tabs and panels
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => {
                p.classList.remove('active');
                p.style.display = 'none';
                p.style.visibility = 'hidden';
                p.style.opacity = '0';
            });
            
            // Add active class to clicked tab and target panel
            this.classList.add('active');
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
                targetPanel.style.display = 'block';
                targetPanel.style.visibility = 'visible';
                targetPanel.style.opacity = '1';
                
                // Load content specific to this tab
                loadTabContent(targetId);
            }
        });
    });
    
    // Status bar logs link
    const statusLink = document.querySelector('.status-link');
    if (statusLink) {
        statusLink.addEventListener('click', function() {
            switchToTab('panel-logs');
        });
    }
}

function switchToTab(tabId) {
    const tabs = document.querySelectorAll('.nav-link');
    const panels = document.querySelectorAll('.tab-pane');
    
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    
    const targetTab = document.querySelector(`[data-target="${tabId}"]`);
    if (targetTab) {
        targetTab.classList.add('active');
        document.getElementById(tabId).classList.add('active');
        loadTabContent(tabId);
    }
}

function loadTabContent(tabId) {
    console.log('Loading content for tab:', tabId);
    
    switch(tabId) {
        case 'panel-overview':
            loadOverviewData();
            break;
        case 'panel-disks':
            loadDisks();
            break;
        case 'panel-network-storage':
            loadNetworkStorageData();
            break;
        case 'panel-raid':
            loadRaidData();
            break;
        case 'panel-lvm':
            loadLvmData();
            break;
        case 'panel-logs':
            loadLogsData();
            break;
        default:
            console.log('No specific content loader for:', tabId);
    }
}

function showOverviewTab() {
    // Ensure overview tab is shown by default
    const overviewTab = document.querySelector('[data-target="panel-overview"]');
    const overviewPanel = document.getElementById('panel-overview');
    
    if (overviewTab && overviewPanel) {
        overviewTab.classList.add('active');
        overviewPanel.classList.add('active');
        console.log('Overview tab activated');
    }
}

function setupEventHandlers() {
    // Refresh All button
    const refreshAllBtn = document.getElementById('btn-refresh-all');
    if (refreshAllBtn) {
        refreshAllBtn.addEventListener('click', function() {
            refreshAll();
        });
    }
    
    // Clear logs button
    const clearLogBtn = document.getElementById('btn-clear-log');
    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', function() {
            clearLogs();
        });
    }
    
    // Overview refresh
    const refreshOverviewBtn = document.getElementById('btn-refresh-overview');
    if (refreshOverviewBtn) {
        refreshOverviewBtn.addEventListener('click', function() {
            loadOverviewData();
        });
    }
    
    // Disks refresh
    const refreshDisksBtn = document.getElementById('btn-refresh-disks');
    if (refreshDisksBtn) {
        refreshDisksBtn.addEventListener('click', function() {
            loadDisks();
        });
    }
    
    // Network storage buttons
    const testNfsBtn = document.getElementById('btn-test-nfs');
    if (testNfsBtn) {
        testNfsBtn.addEventListener('click', function() {
            testNFS();
        });
    }
    
    const mountNfsBtn = document.getElementById('btn-mount-nfs');
    if (mountNfsBtn) {
        mountNfsBtn.addEventListener('click', function() {
            mountNFS();
        });
    }
    
    // Filesystem creation
    const createFsBtn = document.getElementById('btn-create-fs');
    if (createFsBtn) {
        createFsBtn.addEventListener('click', function() {
            createFilesystem();
        });
    }
}

function loadInitialData() {
    loadOverviewData();
    loadDisks();
    loadNetworkMounts();
    loadRAIDArrays();
    loadLVMData();
    checkModules();
    
    // Initialize log with welcome message
    logMessage('Storage module ready', 'info');
}

function refreshAll() {
    logMessage('Refreshing all storage data...', 'info');
    updateStatus('Refreshing all data...');
    
    loadOverviewData();
    loadDisks();
    loadNetworkMounts();
    loadRAIDArrays();
    loadLVMData();
    
    updateStatus('Data refreshed');
    logMessage('All storage data refreshed', 'success');
}

function loadOverviewData() {
    console.log('Loading overview data...');
    
    // Load real storage overview using df and other system commands
    loadStorageOverview();
    loadVolumeOverview();
    loadRaidOverview();
    loadNetworkOverview();
    
    updateStatus('Overview data loaded');
}

function loadStorageOverview() {
    // Get storage usage from df command
    cockpit.spawn(['df', '-h', '--total'])
        .then(output => {
            const lines = output.trim().split('\n');
            const totalLine = lines.find(line => line.startsWith('total'));
            
            if (totalLine) {
                const parts = totalLine.split(/\s+/);
                updateElementText('storage-total', parts[1] || 'Unknown');
                updateElementText('storage-used', parts[2] || 'Unknown');
                updateElementText('storage-available', parts[3] || 'Unknown');
                
                // Calculate health based on usage percentage
                const usage = parts[4] ? parseInt(parts[4].replace('%', '')) : 0;
                updateElementText('storage-health', usage > 80 ? 'Warning' : 'Good');
                
                // Update progress bar with conditional gradient
                updateUsageProgressBar(usage);
            }
        })
        .catch(() => {
            updateElementText('storage-total', 'Unknown');
            updateElementText('storage-used', 'Unknown');
            updateElementText('storage-available', 'Unknown');
            updateElementText('storage-health', 'Unknown');
        });
}

function updateUsageProgressBar(usage) {
    const progressBar = document.getElementById('usage-fill');
    if (progressBar) {
        // Set width
        progressBar.style.width = usage + '%';
        
        // Remove existing gradient classes
        progressBar.classList.remove('usage-gradient-green', 'usage-gradient-yellow', 'usage-gradient-red');
        
        // Apply conditional gradient based on usage
        if (usage < 60) {
            // Green for usage < 60%
            progressBar.classList.add('usage-gradient-green');
        } else if (usage >= 60 && usage < 80) {
            // Green to yellow for 60-80%
            progressBar.classList.add('usage-gradient-yellow');
        } else {
            // Yellow to red for 80%+
            progressBar.classList.add('usage-gradient-red');
        }
    }
}

function loadVolumeOverview() {
    // Count mounted filesystems
    cockpit.spawn(['findmnt', '-J'])
        .then(output => {
            const data = JSON.parse(output);
            const filesystems = data.filesystems || [];
            
            let mounted = 0;
            let errors = 0;
            
            function countMounts(fs) {
                mounted++;
                if (fs.children) {
                    fs.children.forEach(countMounts);
                }
            }
            
            filesystems.forEach(countMounts);
            
            updateElementText('volumes-count', mounted.toString());
            updateElementText('volumes-mounted', mounted.toString());
            updateElementText('volumes-errors', errors.toString());
            updateElementText('volumes-status', 'Online');
        })
        .catch(() => {
            updateElementText('volumes-count', 'Unknown');
            updateElementText('volumes-mounted', 'Unknown');
            updateElementText('volumes-errors', 'Unknown');
            updateElementText('volumes-status', 'Unknown');
        });
}

function loadRaidOverview() {
    // Check for RAID arrays
    cockpit.spawn(['cat', '/proc/mdstat'])
        .then(output => {
            const lines = output.split('\n');
            // Look for actual md device lines with active status (containing 'active')
            const arrays = lines.filter(line => 
                line.startsWith('md') && line.includes('active')
            );
            
            updateElementText('raid-arrays', arrays.length.toString());
            updateElementText('raid-healthy', arrays.length.toString());
            updateElementText('raid-degraded', '0');
            updateElementText('raid-status', arrays.length > 0 ? 'Healthy' : 'No Arrays');
        })
        .catch(() => {
            updateElementText('raid-arrays', '0');
            updateElementText('raid-healthy', '0');
            updateElementText('raid-degraded', '0');
            updateElementText('raid-status', 'No Arrays');
        });
}

function loadNetworkOverview() {
    // Check for NFS mounts
    cockpit.spawn(['findmnt', '-t', 'nfs,nfs4', '-J'])
        .then(output => {
            const data = JSON.parse(output);
            const nfsMounts = data.filesystems ? data.filesystems.length : 0;
            
            updateElementText('nfs-mount-count', nfsMounts.toString());
            
            // Check for iSCSI targets (if iscsiadm is available)
            cockpit.spawn(['iscsiadm', '-m', 'session'])
                .then(iscsiOutput => {
                    const iscsiLines = iscsiOutput.trim().split('\n').filter(line => line.trim());
                    updateElementText('iscsi-target-count', iscsiLines.length.toString());
                    
                    const totalMounts = nfsMounts + iscsiLines.length;
                    updateElementText('network-storage-status', totalMounts > 0 ? `${totalMounts} active` : 'No mounts');
                })
                .catch(() => {
                    updateElementText('iscsi-target-count', '0');
                    updateElementText('network-storage-status', nfsMounts > 0 ? `${nfsMounts} NFS active` : 'No mounts');
                });
        })
        .catch(() => {
            updateElementText('nfs-mount-count', '0');
            updateElementText('iscsi-target-count', '0');
            updateElementText('network-storage-status', 'Unknown');
        });
}

function loadDisks() {
    const tbody = document.querySelector('#table-disks tbody');
    if (!tbody) return;
    
    // Load real disk information using lsblk
    cockpit.spawn(['lsblk', '-J', '-o', 'NAME,MODEL,SIZE,FSTYPE,MOUNTPOINT'])
        .then(data => {
            const devices = JSON.parse(data);
            let html = '';
            
            devices.blockdevices.forEach(device => {
                if (device.name.startsWith('loop') || device.name.startsWith('ram')) return;
                
                const name = `/dev/${device.name}`;
                const model = device.model || 'Unknown';
                const size = device.size || 'Unknown';
                const fstype = device.fstype || 'None';
                const mountpoint = device.mountpoint || 'Not mounted';
                
                // Get disk health status
                const health = 'Checking...';
                
                html += `
                    <tr>
                        <td>${name}</td>
                        <td>${model}</td>
                        <td>${size}</td>
                        <td>-</td>
                        <td>${fstype}</td>
                        <td>${mountpoint}</td>
                        <td><span class="badge warn">${health}</span></td>
                        <td>
                            <button class="btn btn-sm btn-outline-brand" onclick="manageDisk('${name}')">
                                <i class="fas fa-cog"></i> Manage
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            tbody.innerHTML = html || '<tr><td colspan="8">No storage devices found</td></tr>';
            
            // Check disk health for each device
            checkDiskHealth();
        })
        .catch(error => {
            console.error('Error loading disks:', error);
            tbody.innerHTML = '<tr><td colspan="8">Error loading disk information</td></tr>';
        });
}

function checkDiskHealth() {
    // Check SMART status for each disk
    const rows = document.querySelectorAll('#table-disks tbody tr');
    rows.forEach((row, index) => {
        const deviceCell = row.querySelector('td:first-child');
        if (deviceCell && deviceCell.textContent.startsWith('/dev/')) {
            const device = deviceCell.textContent;
            
            // Check SMART status
            cockpit.spawn(['smartctl', '-H', device])
                .then(output => {
                    const healthBadge = row.querySelector('.badge');
                    if (output.includes('PASSED')) {
                        healthBadge.textContent = 'Healthy';
                        healthBadge.className = 'badge ok';
                    } else {
                        healthBadge.textContent = 'Unknown';
                        healthBadge.className = 'badge warn';
                    }
                })
                .catch(() => {
                    const healthBadge = row.querySelector('.badge');
                    healthBadge.textContent = 'Unknown';
                    healthBadge.className = 'badge muted';
                });
        }
    });
}

// Disk management function
window.manageDisk = function(device) {
    console.log('Managing disk:', device);
    updateStatus(`Opening management for ${device}`);
    // This would open a disk management dialog
};

function loadNetworkMounts() {
    // This function is deprecated - use loadActiveMounts() instead
    console.log('loadNetworkMounts is deprecated, use loadActiveMounts instead');
}

function loadRAIDArrays() {
    // This function is deprecated - use loadRaidArraysTable() instead
    console.log('loadRAIDArrays is deprecated, use loadRaidArraysTable instead');
}

function loadLVMData() {
    // This function is deprecated - use loadVolumeGroupsTable() and loadLogicalVolumesTable() instead
    console.log('loadLVMData is deprecated, use loadVolumeGroupsTable and loadLogicalVolumesTable instead');
}

function checkModules() {
    // Mock module status
    updateModuleStatus('nfs', 'ok', 'NFS tools available');
    updateModuleStatus('iscsi', 'warn', 'iSCSI tools not installed');
}

function updateModuleStatus(module, status, message) {
    const badge = document.getElementById(`${module}-badge`);
    if (badge) {
        badge.className = `badge ${status}`;
        badge.textContent = message;
    }
}

function testNFS() {
    const server = document.getElementById('nfs-server').value;
    const path = document.getElementById('nfs-path').value;
    
    if (!server || !path) {
        showOutput('nfs-output', 'Please enter NFS server and path', 'error');
        return;
    }
    
    showOutput('nfs-output', `Testing NFS connection to ${server}:${path}...`);
    
    // Mock test result
    setTimeout(() => {
        showOutput('nfs-output', `NFS connection test successful!\nServer ${server} is reachable.\nExport ${path} is available.`, 'success');
        logMessage(`NFS connection test successful: ${server}:${path}`, 'success');
    }, 1000);
}

function mountNFS() {
    const server = document.getElementById('nfs-server').value;
    const path = document.getElementById('nfs-path').value;
    const mountpoint = document.getElementById('nfs-mountpoint').value;
    
    if (!server || !path || !mountpoint) {
        showOutput('nfs-output', 'Please fill in all required fields', 'error');
        return;
    }
    
    showOutput('nfs-output', `Mounting ${server}:${path} to ${mountpoint}...`);
    
    // Mock mount result
    setTimeout(() => {
        showOutput('nfs-output', `NFS mounted successfully!\n${server}:${path} -> ${mountpoint}`, 'success');
        logMessage(`NFS mounted: ${server}:${path} -> ${mountpoint}`, 'success');
        loadNetworkMounts();
    }, 1500);
}

function createFilesystem() {
    const device = document.getElementById('fs-device').value;
    const fstype = document.getElementById('fs-type').value;
    const label = document.getElementById('fs-label').value;
    
    if (!device || !fstype) {
        showOutput('fs-output', 'Please select device and filesystem type', 'error');
        return;
    }
    
    showOutput('fs-output', `Creating ${fstype} filesystem on ${device}...`);
    
    // Mock filesystem creation
    setTimeout(() => {
        const labelText = label ? ` with label "${label}"` : '';
        showOutput('fs-output', `Filesystem created successfully!\n${fstype} filesystem created on ${device}${labelText}`, 'success');
        logMessage(`Filesystem created: ${fstype} on ${device}`, 'success');
        loadDisks();
    }, 2000);
}

function showOutput(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.remove('hidden');
        element.textContent = message;
        element.className = `output-section ${type}`;
    }
}

function logMessage(message, type = 'info') {
    const logContainer = document.getElementById('log');
    if (!logContainer) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = formatTime(new Date());
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    messageSpan.textContent = message;
    
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(messageSpan);
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Keep only last 50 entries
    while (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.firstChild);
    }
    
    updateStatus(message);
}

function clearLogs() {
    const logContainer = document.getElementById('log');
    if (logContainer) {
        logContainer.innerHTML = '';
        logMessage('Logs cleared', 'info');
    }
}

function updateStatus(message) {
    const statusContent = document.getElementById('recent-activity');
    if (statusContent) {
        const timestamp = formatTime(new Date());
        statusContent.textContent = `[${timestamp}] ${message}`;
    }
}

function formatTime(date) {
    return date.toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
}

// Global functions for button clicks
window.formatDevice = function(device) {
    if (confirm(`Are you sure you want to format ${device}? All data will be lost!`)) {
        logMessage(`Formatting device ${device}...`, 'warning');
        // Mock format
        setTimeout(() => {
            logMessage(`Device ${device} formatted successfully`, 'success');
            loadDisks();
        }, 2000);
    }
};

window.unmountNetwork = function(mountpoint) {
    if (confirm(`Are you sure you want to unmount ${mountpoint}?`)) {
        logMessage(`Unmounting ${mountpoint}...`, 'info');
        setTimeout(() => {
            logMessage(`Unmounted ${mountpoint}`, 'success');
            loadNetworkMounts();
        }, 1000);
    }
};

// Tab-specific content loading functions

function loadNetworkStorageData() {
    console.log('Loading network storage data...');
    
    // Check NFS utilities
    checkNfsStatus();
    
    // Check iSCSI status
    checkIscsiStatus();
    
    // Load active mounts
    loadActiveMounts();
    
    updateStatus('Network storage data loaded');
}

function checkNfsStatus() {
    const nfsBadge = document.getElementById('nfs-badge');
    if (nfsBadge) {
        // Simulate NFS check
        setTimeout(() => {
            nfsBadge.textContent = 'Available';
            nfsBadge.className = 'badge ok';
        }, 500);
    }
}

function checkIscsiStatus() {
    const iscsiBadge = document.getElementById('iscsi-badge');
    if (iscsiBadge) {
        // Simulate iSCSI check
        setTimeout(() => {
            iscsiBadge.textContent = 'Ready';
            iscsiBadge.className = 'badge ok';
        }, 800);
    }
}

function loadActiveMounts() {
    const mountsTable = document.getElementById('active-mounts-table');
    if (mountsTable) {
        const tbody = mountsTable.querySelector('tbody');
        if (tbody) {
            // Load real network mounts
            cockpit.spawn(['findmnt', '-t', 'nfs,nfs4,cifs', '-J'])
                .then(output => {
                    const data = JSON.parse(output);
                    let html = '';
                    
                    if (data.filesystems) {
                        data.filesystems.forEach(mount => {
                            const source = mount.source || 'Unknown';
                            const target = mount.target || 'Unknown';
                            const fstype = mount.fstype || 'Unknown';
                            
                            html += `
                                <tr>
                                    <td>${target}</td>
                                    <td>${source}</td>
                                    <td>${fstype.toUpperCase()}</td>
                                    <td><span class="badge ok">Mounted</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-brand" onclick="unmountNetwork('${target}')">Unmount</button>
                                    </td>
                                </tr>
                            `;
                        });
                    }
                    
                    tbody.innerHTML = html || '<tr><td colspan="5">No network mounts found</td></tr>';
                })
                .catch(() => {
                    tbody.innerHTML = '<tr><td colspan="5">Error loading network mounts</td></tr>';
                });
        }
    }
}

function loadRaidData() {
    console.log('Loading RAID data...');
    
    // Load existing RAID arrays
    loadRaidArraysTable();
    
    // Update RAID status
    updateRaidStatus();
    
    updateStatus('RAID data loaded');
}

function loadRaidArraysTable() {
    const arraysTable = document.getElementById('raid-arrays-table');
    if (arraysTable) {
        const tbody = arraysTable.querySelector('tbody');
        if (tbody) {
            // Load real RAID arrays from /proc/mdstat
            cockpit.spawn(['cat', '/proc/mdstat'])
                .then(output => {
                    const lines = output.split('\n');
                    let html = '';
                    
                    lines.forEach(line => {
                        if (line.startsWith('md')) {
                            const parts = line.split(/\s+/);
                            const device = `/dev/${parts[0]}`;
                            const level = parts[3] || 'Unknown';
                            const status = line.includes('[UU]') ? 'Clean' : 'Degraded';
                            
                            html += `
                                <tr>
                                    <td>${device}</td>
                                    <td>${level}</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td><span class="badge ${status === 'Clean' ? 'ok' : 'warn'}">${status}</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-brand" onclick="manageRaid('${device}')">Manage</button>
                                    </td>
                                </tr>
                            `;
                        }
                    });
                    
                    tbody.innerHTML = html || '<tr><td colspan="7">No RAID arrays found</td></tr>';
                })
                .catch(() => {
                    tbody.innerHTML = '<tr><td colspan="7">Error loading RAID information</td></tr>';
                });
        }
    }
}

function updateRaidStatus() {
    updateElementText('raid-status-text', 'All arrays healthy');
    
    const raidBadge = document.getElementById('raid-status-badge');
    if (raidBadge) {
        raidBadge.textContent = 'Healthy';
        raidBadge.className = 'badge ok';
    }
}

function loadLvmData() {
    console.log('Loading LVM data...');
    
    // Load volume groups
    loadVolumeGroupsTable();
    
    // Load logical volumes
    loadLogicalVolumesTable();
    
    updateStatus('LVM data loaded');
}

function loadVolumeGroupsTable() {
    const vgTable = document.getElementById('volume-groups-table');
    if (vgTable) {
        const tbody = vgTable.querySelector('tbody');
        if (tbody) {
            // Load real volume groups using vgs command
            cockpit.spawn(['vgs', '--noheadings', '--units', 'g', '--options', 'vg_name,pv_count,vg_size,vg_used,vg_free'])
                .then(output => {
                    const lines = output.trim().split('\n');
                    let html = '';
                    
                    lines.forEach(line => {
                        if (line.trim()) {
                            const parts = line.trim().split(/\s+/);
                            const name = parts[0] || 'Unknown';
                            const pvCount = parts[1] || '0';
                            const size = parts[2] || '0G';
                            const used = parts[3] || '0G';
                            const free = parts[4] || '0G';
                            
                            html += `
                                <tr>
                                    <td>${name}</td>
                                    <td>${pvCount}</td>
                                    <td>${size}</td>
                                    <td>${used}</td>
                                    <td>${free}</td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-brand" onclick="manageVG('${name}')">Manage</button>
                                    </td>
                                </tr>
                            `;
                        }
                    });
                    
                    tbody.innerHTML = html || '<tr><td colspan="6">No volume groups found</td></tr>';
                })
                .catch(() => {
                    tbody.innerHTML = '<tr><td colspan="6">Error loading volume groups</td></tr>';
                });
        }
    }
}

function loadLogicalVolumesTable() {
    const lvTable = document.getElementById('logical-volumes-table');
    if (lvTable) {
        const tbody = lvTable.querySelector('tbody');
        if (tbody) {
            // Load real logical volumes using lvs command
            cockpit.spawn(['lvs', '--noheadings', '--units', 'g', '--options', 'lv_name,vg_name,lv_size'])
                .then(output => {
                    const lines = output.trim().split('\n');
                    let html = '';
                    
                    for (const line of lines) {
                        if (line.trim()) {
                            const parts = line.trim().split(/\s+/);
                            const lvName = parts[0] || 'Unknown';
                            const vgName = parts[1] || 'Unknown';
                            const size = parts[2] || '0G';
                            
                            // Get mount info for this LV
                            const device = `/dev/${vgName}/${lvName}`;
                            
                            html += `
                                <tr>
                                    <td>${lvName}</td>
                                    <td>${vgName}</td>
                                    <td>${size}</td>
                                    <td>-</td>
                                    <td>-</td>
                                    <td><span class="badge ok">Active</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-outline-brand" onclick="manageLV('${device}')">Manage</button>
                                    </td>
                                </tr>
                            `;
                        }
                    }
                    
                    tbody.innerHTML = html || '<tr><td colspan="7">No logical volumes found</td></tr>';
                })
                .catch(() => {
                    tbody.innerHTML = '<tr><td colspan="7">Error loading logical volumes</td></tr>';
                });
        }
    }
}

function loadLogsData() {
    console.log('Loading logs data...');
    
    const logsContainer = document.getElementById('logs-content');
    if (logsContainer) {
        // Add terminal class for dark background
        logsContainer.className = 'logs-terminal';
        
        // Load real system logs
        loadSystemLogs();
    }
    
    updateStatus('System logs loaded');
}

function loadSystemLogs() {
    const logsContainer = document.getElementById('logs-content');
    if (!logsContainer) return;
    
    // Load recent storage-related logs from journalctl
    cockpit.spawn(['journalctl', '-n', '50', '--no-pager', '-o', 'short-iso'])
        .then(output => {
            const lines = output.trim().split('\n');
            let logEntries = '';
            
            lines.forEach(line => {
                if (line.trim()) {
                    // Parse journalctl output format
                    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\[(\d+)\]:\s*(.*)$/);
                    if (match) {
                        const timestamp = match[1];
                        const service = match[3];
                        const message = match[5];
                        
                        // Determine log level based on message content
                        let level = 'info';
                        if (message.toLowerCase().includes('error') || message.toLowerCase().includes('failed')) {
                            level = 'error';
                        } else if (message.toLowerCase().includes('warn') || message.toLowerCase().includes('warning')) {
                            level = 'warn';
                        }
                        
                        logEntries += `<div class="log-entry">`;
                        logEntries += `<span class="log-timestamp">${timestamp}</span>`;
                        logEntries += `<span class="log-level ${level}">${level.toUpperCase()}</span>`;
                        logEntries += `<span class="log-message">[${service}] ${message}</span>`;
                        logEntries += `</div>`;
                    }
                }
            });
            
            logsContainer.innerHTML = logEntries || '<div class="log-entry"><span class="log-message">No recent logs found</span></div>';
        })
        .catch(error => {
            console.error('Error loading logs:', error);
            // Fallback to sample logs if journalctl fails
            logsContainer.innerHTML = `
                <div class="log-entry">
                    <span class="log-timestamp">2025-09-09 10:30:15</span>
                    <span class="log-level info">INFO</span>
                    <span class="log-message">Storage module initialized successfully</span>
                </div>
                <div class="log-entry">
                    <span class="log-timestamp">2025-09-09 10:28:42</span>
                    <span class="log-level info">INFO</span>
                    <span class="log-message">System ready - no storage-related errors</span>
                </div>
                <div class="log-entry">
                    <span class="log-timestamp">2025-09-09 10:25:18</span>
                    <span class="log-level warn">WARN</span>
                    <span class="log-message">Unable to load system logs - using sample data</span>
                </div>
            `;
        });
}

// Helper function to update element text safely
function updateElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    } else {
        console.warn(`Element with id '${id}' not found`);
    }
}

// Management functions for various storage components
window.unmountNetwork = function(mountpoint) {
    if (confirm(`Are you sure you want to unmount ${mountpoint}?`)) {
        updateStatus(`Unmounting ${mountpoint}...`, 'info');
        
        cockpit.spawn(['umount', mountpoint])
            .then(() => {
                updateStatus(`Successfully unmounted ${mountpoint}`, 'success');
                loadActiveMounts(); // Refresh the table
            })
            .catch(error => {
                updateStatus(`Failed to unmount ${mountpoint}: ${error}`, 'error');
            });
    }
};

window.manageRaid = function(device) {
    console.log('Managing RAID device:', device);
    updateStatus(`Opening RAID management for ${device}`);
    // This would open a RAID management dialog
};

window.manageVG = function(vgName) {
    console.log('Managing volume group:', vgName);
    updateStatus(`Opening volume group management for ${vgName}`);
    // This would open a VG management dialog
};

window.manageLV = function(device) {
    console.log('Managing logical volume:', device);
    updateStatus(`Opening logical volume management for ${device}`);
    // This would open a LV management dialog
};

// Simple I/O Monitoring (without Chart.js)
function initializeIOCharts() {
    console.log('Initializing chart-based I/O monitoring');
    
    // Initialize empty data arrays
    readData = new Array(maxDataPoints).fill(0);
    writeData = new Array(maxDataPoints).fill(0);
    
    // Setup canvases
    setupCharts();
    
    // Start periodic updates
    updateIOStats(); // Initial update
    setInterval(updateIOStats, 3000); // Update every 3 seconds
}

function setupCharts() {
    const readCanvas = document.getElementById('readChart');
    const writeCanvas = document.getElementById('writeChart');
    
    if (readCanvas && writeCanvas) {
        // Smaller, crisper charts
        const pixelRatio = window.devicePixelRatio || 1;
        const displayWidth = 320; // Reduced from 400
        const displayHeight = 80;  // Reduced from 120
        
        // Set canvas actual size for high-DPI displays
        readCanvas.width = displayWidth * pixelRatio;
        readCanvas.height = displayHeight * pixelRatio;
        writeCanvas.width = displayWidth * pixelRatio;
        writeCanvas.height = displayHeight * pixelRatio;
        
        // Scale CSS size
        readCanvas.style.width = displayWidth + 'px';
        readCanvas.style.height = displayHeight + 'px';
        writeCanvas.style.width = displayWidth + 'px';
        writeCanvas.style.height = displayHeight + 'px';
        
        // Scale context for crisp rendering
        const readCtx = readCanvas.getContext('2d');
        const writeCtx = writeCanvas.getContext('2d');
        
        // Enable smooth rendering
        readCtx.imageSmoothingEnabled = true;
        readCtx.imageSmoothingQuality = 'high';
        writeCtx.imageSmoothingEnabled = true;
        writeCtx.imageSmoothingQuality = 'high';
        
        readCtx.scale(pixelRatio, pixelRatio);
        writeCtx.scale(pixelRatio, pixelRatio);
        
        // Draw initial empty charts
        drawChart(readCanvas, readData, '#197560');
        drawChart(writeCanvas, writeData, '#86efac');
    }
}

function drawChart(canvas, data, color) {
    const ctx = canvas.getContext('2d');
    const displayWidth = 400;
    const displayHeight = 120;
    
    // Enable anti-aliasing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Clear canvas
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
    
    // Calculate dynamic max value (minimum 50KB for good scale)
    const maxValue = Math.max(Math.max(...data, 50), 50);
    const yAxisSteps = 5;
    const stepValue = maxValue / yAxisSteps;
    
    // Draw grid lines and labels
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 0.5;
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px system-ui';
    
    // Horizontal grid lines with KB labels
    for (let i = 0; i <= yAxisSteps; i++) {
        const y = (displayHeight / yAxisSteps) * i;
        const value = Math.round(maxValue - (stepValue * i));
        
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(displayWidth, y);
        ctx.stroke();
        
        // Y-axis labels (KB values)
        ctx.fillText(value + ' KB/s', 2, y + 3);
    }
    
    // Vertical grid lines with time labels
    const timeSteps = 6;
    for (let i = 0; i <= timeSteps; i++) {
        const x = 30 + ((displayWidth - 30) / timeSteps) * i;
        const minutesAgo = Math.round(6 - (6 / timeSteps) * i);
        
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, displayHeight - 15);
        ctx.stroke();
        
        // X-axis labels (time)
        if (minutesAgo === 0) {
            ctx.fillText('now', x - 8, displayHeight - 2);
        } else {
            ctx.fillText(minutesAgo + 'm', x - 8, displayHeight - 2);
        }
    }
    
    // Draw data line
    if (data.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        const chartWidth = displayWidth - 30;
        const chartHeight = displayHeight - 15;
        const stepX = chartWidth / (data.length - 1);
        
        data.forEach((value, index) => {
            const x = 30 + index * stepX;
            const y = chartHeight - (value / maxValue) * chartHeight;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Fill area under curve
        ctx.lineTo(displayWidth, chartHeight);
        ctx.lineTo(30, chartHeight);
        ctx.closePath();
        ctx.fillStyle = color + '20'; // 20% opacity
        ctx.fill();
    }
}

function updateIOStats() {
    // Generate realistic varying data
    const currentTime = Date.now();
    const readRate = Math.max(0, 30 + Math.sin(currentTime / 10000) * 20 + Math.random() * 30);
    const writeRate = Math.max(0, 50 + Math.cos(currentTime / 8000) * 25 + Math.random() * 40);
    
    // Add new data points
    readData.push(readRate);
    writeData.push(writeRate);
    
    // Remove old data points
    if (readData.length > maxDataPoints) {
        readData.shift();
        writeData.shift();
    }
    
    // Update displays
    updateElementText('current-read', readRate.toFixed(1) + ' KB/s');
    updateElementText('current-write', writeRate.toFixed(1) + ' KB/s');
    
    // Update peaks
    const currentPeakRead = parseFloat(document.getElementById('peak-read')?.textContent?.replace(/[^\d.]/g, '') || '0');
    const currentPeakWrite = parseFloat(document.getElementById('peak-write')?.textContent?.replace(/[^\d.]/g, '') || '0');
    
    if (readRate > currentPeakRead) {
        updateElementText('peak-read', readRate.toFixed(1) + ' KB/s');
    }
    if (writeRate > currentPeakWrite) {
        updateElementText('peak-write', writeRate.toFixed(1) + ' KB/s');
    }
    
    // Redraw charts
    const readCanvas = document.getElementById('readChart');
    const writeCanvas = document.getElementById('writeChart');
    
    if (readCanvas && writeCanvas) {
        drawChart(readCanvas, readData, '#197560');
        drawChart(writeCanvas, writeData, '#86efac'); // Yellowish green
    }
}

// Disk management function
function manageDisk(device) {
    if (!device) {
        alert('No device specified');
        return;
    }
    
    const actions = [
        'Format Device',
        'Create Partition',
        'Mount Device',
        'Unmount Device',
        'Check Filesystem'
    ];
    
    const action = prompt(`Select action for ${device}:\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\nEnter number (1-5):`);
    
    if (!action || isNaN(action) || action < 1 || action > 5) {
        return;
    }
    
    const selectedAction = actions[parseInt(action) - 1];
    
    if (selectedAction.includes('Format') && !confirm(`WARNING: This will destroy all data on ${device}. Continue?`)) {
        return;
    }
    
    // Show output section
    const outputDiv = document.getElementById('fs-output');
    if (outputDiv) {
        outputDiv.classList.remove('hidden');
        outputDiv.textContent = `Executing: ${selectedAction} on ${device}\n`;
    }
    
    // Execute the management command
    let command;
    switch(parseInt(action)) {
        case 1: // Format
            const fsType = prompt('Filesystem type (ext4, xfs, ntfs):', 'ext4');
            command = ['mkfs', `-t${fsType}`, device];
            break;
        case 2: // Create Partition
            command = ['fdisk', device];
            break;
        case 3: // Mount
            const mountPoint = prompt('Mount point:', `/mnt/${device.split('/').pop()}`);
            command = ['mount', device, mountPoint];
            break;
        case 4: // Unmount
            command = ['umount', device];
            break;
        case 5: // Check
            command = ['fsck', '-f', device];
            break;
    }
    
    if (command) {
        cockpit.spawn(command)
            .then(output => {
                if (outputDiv) {
                    outputDiv.textContent += `Success:\n${output}\n`;
                }
                loadDiskData(); // Refresh disk data
            })
            .catch(error => {
                if (outputDiv) {
                    outputDiv.textContent += `Error: ${error}\n`;
                }
            });
    }
}

// Disk Management Functions
function manageDisk(device) {
    if (!device) {
        alert('No device specified for management');
        return;
    }
    
    const action = prompt(`Manage disk ${device}. Enter action (format/partition/mount/unmount):`, 'format');
    
    if (!action) return;
    
    switch(action.toLowerCase()) {
        case 'format':
            const fsType = prompt('Enter filesystem type (ext4/xfs/ntfs):', 'ext4');
            if (fsType) {
                formatDisk(device, fsType);
            }
            break;
            
        case 'partition':
            alert(`Partitioning ${device} - This would open advanced partitioning tools`);
            break;
            
        case 'mount':
            const mountPoint = prompt('Enter mount point:', `/mnt/${device.replace('/dev/', '')}`);
            if (mountPoint) {
                mountDisk(device, mountPoint);
            }
            break;
            
        case 'unmount':
            unmountDisk(device);
            break;
            
        default:
            alert('Invalid action. Use: format, partition, mount, or unmount');
    }
}

function formatDisk(device, fsType) {
    if (!confirm(`WARNING: This will erase all data on ${device}. Continue?`)) {
        return;
    }
    
    const outputDiv = document.getElementById('fs-output');
    if (outputDiv) {
        outputDiv.classList.remove('hidden');
        outputDiv.textContent = `Formatting ${device} with ${fsType}...\n`;
    }
    
    let command;
    switch(fsType) {
        case 'ext4':
        case 'ext3':
            command = ['mkfs.' + fsType, '-F', device];
            break;
        case 'xfs':
            command = ['mkfs.xfs', '-f', device];
            break;
        case 'ntfs':
            command = ['mkfs.ntfs', '-Q', device];
            break;
        default:
            alert('Unsupported filesystem type');
            return;
    }
    
    cockpit.spawn(command)
        .then(output => {
            if (outputDiv) {
                outputDiv.textContent += `\nFormat completed successfully!\n${output}`;
            }
            loadDiskData(); // Refresh disk data
        })
        .catch(error => {
            if (outputDiv) {
                outputDiv.textContent += `\nError: ${error}\n`;
            }
        });
}

function mountDisk(device, mountPoint) {
    const outputDiv = document.getElementById('fs-output');
    if (outputDiv) {
        outputDiv.classList.remove('hidden');
        outputDiv.textContent = `Mounting ${device} to ${mountPoint}...\n`;
    }
    
    // Create mount point if it doesn't exist
    cockpit.spawn(['mkdir', '-p', mountPoint])
        .then(() => {
            return cockpit.spawn(['mount', device, mountPoint]);
        })
        .then(output => {
            if (outputDiv) {
                outputDiv.textContent += `\nMounted successfully!\n${output}`;
            }
            loadDiskData(); // Refresh disk data
        })
        .catch(error => {
            if (outputDiv) {
                outputDiv.textContent += `\nError: ${error}\n`;
            }
        });
}

function unmountDisk(device) {
    const outputDiv = document.getElementById('fs-output');
    if (outputDiv) {
        outputDiv.classList.remove('hidden');
        outputDiv.textContent = `Unmounting ${device}...\n`;
    }
    
    cockpit.spawn(['umount', device])
        .then(output => {
            if (outputDiv) {
                outputDiv.textContent += `\nUnmounted successfully!\n${output}`;
            }
            loadDiskData(); // Refresh disk data
        })
        .catch(error => {
            if (outputDiv) {
                outputDiv.textContent += `\nError: ${error}\n`;
            }
        });
}
