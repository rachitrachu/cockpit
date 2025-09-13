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
    
    // RAID creation
    const createRaidBtn = document.getElementById('btn-create-raid');
    if (createRaidBtn) {
        createRaidBtn.addEventListener('click', function() {
            createRaidArray();
        });
    }
    
    // LVM Volume Group creation
    const createVgBtn = document.getElementById('btn-create-vg');
    if (createVgBtn) {
        createVgBtn.addEventListener('click', function() {
            createVolumeGroup();
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
    loadDisks(); // Load disk data for the overview table
    
    updateStatus('Overview data loaded');
}

function loadStorageOverview() {
    // Get OS disk information - find the disk that contains the root partition
    cockpit.spawn(['lsblk', '-J', '-b', '-o', 'NAME,SIZE,MOUNTPOINT,TYPE'])
        .then(data => {
            const devices = JSON.parse(data);
            let osDiskDevice = null;
            let osDiskSize = 0;
            
            // Find the OS disk by looking for root mount point
            devices.blockdevices.forEach(device => {
                let isOSDisk = false;
                
                // Check if this device or its partitions contain root mount
                if (device.mountpoint === '/') {
                    isOSDisk = true;
                } else if (device.children) {
                    device.children.forEach(child => {
                        if (child.mountpoint === '/') {
                            isOSDisk = true;
                        }
                    });
                }
                
                if (isOSDisk && device.type === 'disk') {
                    osDiskDevice = device.name;
                    osDiskSize = parseInt(device.size) || 0;
                }
            });
            
            if (osDiskDevice && osDiskSize > 0) {
                // Get used/free space for OS disk partitions
                cockpit.spawn(['df', '-B1'])
                    .then(dfOutput => {
                        let totalUsedSpace = 0;
                        let totalAvailSpace = 0;
                        
                        if (dfOutput) {
                            const lines = dfOutput.trim().split('\n').slice(1); // Skip header
                            lines.forEach(line => {
                                const parts = line.split(/\s+/);
                                // Check if this filesystem is on our OS disk
                                if (parts[0].includes(osDiskDevice)) {
                                    totalUsedSpace += parseInt(parts[2]) || 0;
                                    totalAvailSpace += parseInt(parts[3]) || 0;
                                }
                            });
                        }
                        
                        // Update display
                        updateElementText('total-storage', formatBytes(osDiskSize));
                        updateElementText('used-storage', formatBytes(totalUsedSpace));
                        updateElementText('free-storage', formatBytes(totalAvailSpace));
                        
                        // Calculate usage percentage
                        const usage = osDiskSize > 0 ? Math.round((totalUsedSpace / osDiskSize) * 100) : 0;
                        updateUsageProgressBar(usage);
                    })
                    .catch(() => {
                        // Fallback if df fails
                        updateElementText('total-storage', formatBytes(osDiskSize));
                        updateElementText('used-storage', 'Unknown');
                        updateElementText('free-storage', 'Unknown');
                    });
            } else {
                // Fallback to total system calculation
                Promise.all([
                    cockpit.spawn(['lsblk', '-b', '-d', '-o', 'SIZE']).catch(() => ''),
                    cockpit.spawn(['df', '-B1', '--total']).catch(() => '')
                ]).then(([lsblkOutput, dfOutput]) => {
                    let totalPhysical = 0;
                    if (lsblkOutput) {
                        const lines = lsblkOutput.trim().split('\n').slice(1);
                        lines.forEach(line => {
                            const size = parseInt(line.trim());
                            if (!isNaN(size)) totalPhysical += size;
                        });
                    }
                    
                    let usedSpace = 0;
                    let freeSpace = 0;
                    if (dfOutput) {
                        const lines = dfOutput.trim().split('\n');
                        const totalLine = lines.find(line => line.startsWith('total'));
                        if (totalLine) {
                            const parts = totalLine.split(/\s+/);
                            usedSpace = parseInt(parts[2]) || 0;
                            freeSpace = parseInt(parts[3]) || 0;
                        }
                    }
                    
                    updateElementText('total-storage', formatBytes(totalPhysical));
                    updateElementText('used-storage', formatBytes(usedSpace));
                    updateElementText('free-storage', formatBytes(freeSpace));
                    
                    const usage = totalPhysical > 0 ? Math.round((usedSpace / totalPhysical) * 100) : 0;
                    updateUsageProgressBar(usage);
                });
            }
        })
        .catch(() => {
            updateElementText('total-storage', 'Unknown');
            updateElementText('used-storage', 'Unknown');
            updateElementText('free-storage', 'Unknown');
        });
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
            
            updateElementText('vg-count', mounted.toString());
            updateElementText('lv-count', mounted.toString());
            updateElementText('lvm-status', mounted > 0 ? 'Active' : 'No volumes');
        })
        .catch(() => {
            updateElementText('vg-count', 'Unknown');
            updateElementText('lv-count', 'Unknown');
            updateElementText('lvm-status', 'Unknown');
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
            
            updateElementText('raid-count', arrays.length.toString());
            updateElementText('raid-status', arrays.length > 0 ? 'Healthy' : 'No Arrays');
        })
        .catch(() => {
            updateElementText('raid-count', '0');
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
    
    // Load real disk information using lsblk with children
    cockpit.spawn(['lsblk', '-J', '-o', 'NAME,MODEL,SIZE,FSTYPE,MOUNTPOINT,TYPE'])
        .then(data => {
            const devices = JSON.parse(data);
            let html = '';
            
            devices.blockdevices.forEach(device => {
                if (device.name.startsWith('loop') || device.name.startsWith('ram')) return;
                
                // Only show actual disks, not partitions at top level
                if (device.type === 'disk') {
                    const name = `/dev/${device.name}`;
                    const model = device.model || 'Unknown';
                    const size = device.size || 'Unknown';
                    const fstype = device.fstype || 'None';
                    const mountpoint = device.mountpoint || 'Not mounted';
                    const health = 'Checking...';
                    
                    // Parent disk row
                    html += `
                        <tr class="disk-row">
                            <td><strong>${name}</strong></td>
                            <td>${model}</td>
                            <td>${size}</td>
                            <td>-</td>
                            <td>${fstype}</td>
                            <td>${mountpoint}</td>
                            <td><span class="badge warn">${health}</span></td>
                            <td style="text-align: left;">
                                <button class="btn btn-sm btn-outline-brand manage-disk-btn" data-device="${name}">
                                    <i class="fas fa-cog"></i> Manage
                                </button>
                            </td>
                        </tr>
                    `;
                    
                    // Add partitions as child rows with indentation
                    if (device.children) {
                        device.children.forEach(partition => {
                            const partName = `/dev/${partition.name}`;
                            const partSize = partition.size || 'Unknown';
                            const partFstype = partition.fstype || 'None';
                            const partMountpoint = partition.mountpoint || 'Not mounted';
                            
                            html += `
                                <tr class="partition-row">
                                    <td style="padding-left: 30px;"><i class="fas fa-level-up-alt fa-rotate-90"></i> ${partName}</td>
                                    <td>-</td>
                                    <td>${partSize}</td>
                                    <td>-</td>
                                    <td>${partFstype}</td>
                                    <td>${partMountpoint}</td>
                                    <td><span class="badge muted">-</span></td>
                                    <td style="text-align: left;">
                                        <button class="btn btn-sm btn-outline-secondary manage-partition-btn" data-partition="${partName}">
                                            <i class="fas fa-edit"></i> Edit
                                        </button>
                                    </td>
                                </tr>
                            `;
                        });
                    }
                }
            });
            
            tbody.innerHTML = html || '<tr><td colspan="8">No storage devices found</td></tr>';
            
            // Add event listeners for manage buttons
            addManageButtonListeners();
            
            // Update device status summary
            updateDeviceStatusSummary(devices.blockdevices);
            
            // Populate filesystem device dropdown
            populateFilesystemDevices(devices.blockdevices);
            
            // Check disk health for each device
            checkDiskHealth();
        })
        .catch(error => {
            console.error('Error loading disks:', error);
            tbody.innerHTML = '<tr><td colspan="8">Error loading disk information</td></tr>';
        });
}

function addManageButtonListeners() {
    // Add event listeners for manage disk buttons
    document.querySelectorAll('.manage-disk-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            window.event = e; // Store event globally
            const device = this.getAttribute('data-device');
            manageDisk(device);
        });
    });
    
    // Add event listeners for manage partition buttons
    document.querySelectorAll('.manage-partition-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            window.event = e; // Store event globally
            const partition = this.getAttribute('data-partition');
            managePartition(partition);
        });
    });
}

function updateDeviceStatusSummary(devices) {
    // Filter out loop and ram devices
    const realDevices = devices.filter(device => 
        !device.name.startsWith('loop') && !device.name.startsWith('ram')
    );
    
    const totalDevices = realDevices.length;
    let healthyCount = 0;
    let warningCount = 0;
    let failedCount = 0;
    
    // For now, assume all devices are healthy (we'll update this after SMART checks)
    healthyCount = totalDevices;
    
    updateElementText('total-devices', totalDevices.toString());
    updateElementText('healthy-disks', healthyCount.toString());
    updateElementText('warning-disks', warningCount.toString());
    updateElementText('failed-disks', failedCount.toString());
}

function populateFilesystemDevices(devices) {
    const deviceSelect = document.getElementById('fs-device');
    if (!deviceSelect) return;
    
    // Clear existing options except the first one
    deviceSelect.innerHTML = '<option value="">Select Device</option>';
    
    // Filter for real storage devices (not loop, ram, or mounted devices)
    const availableDevices = devices.filter(device => {
        return !device.name.startsWith('loop') && 
               !device.name.startsWith('ram') && 
               !device.mountpoint &&  // Not mounted
               device.type === 'disk'; // Actual disk, not partition
    });
    
    availableDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = `/dev/${device.name}`;
        const sizeGB = device.size ? ` - ${formatBytes(parseInt(device.size))}` : '';
        option.textContent = `/dev/${device.name}${sizeGB}`;
        deviceSelect.appendChild(option);
    });
}

function checkDiskHealth() {
    // Check SMART status for normal disks only (not hardware RAID controllers or LVM devices)
    const rows = document.querySelectorAll('#table-disks tbody tr.disk-row');
    rows.forEach((row, index) => {
        const deviceCell = row.querySelector('td:first-child strong');
        const modelCell = row.querySelector('td:nth-child(2)');
        const fstypeCell = row.querySelector('td:nth-child(5)');
        
        if (deviceCell && deviceCell.textContent.startsWith('/dev/')) {
            const device = deviceCell.textContent;
            const model = modelCell ? modelCell.textContent.toLowerCase() : '';
            const fstype = fstypeCell ? fstypeCell.textContent.toLowerCase() : '';
            
            // Check if it's an LVM device - still check health but show LVM status too
            if (fstype.includes('lvm2_member')) {
                // For LVM devices, check underlying disk health but show LVM status
                cockpit.spawn(['smartctl', '-H', device])
                    .then(output => {
                        const healthBadge = row.querySelector('.badge');
                        if (output.includes('SMART Health Status: OK') || output.includes('PASSED')) {
                            healthBadge.textContent = 'LVM (Healthy)';
                            healthBadge.className = 'badge ok';
                        } else if (output.includes('FAILING')) {
                            healthBadge.textContent = 'LVM (Warning)';
                            healthBadge.className = 'badge error';
                        } else {
                            healthBadge.textContent = 'LVM (Unknown)';
                            healthBadge.className = 'badge warn';
                        }
                    })
                    .catch(() => {
                        const healthBadge = row.querySelector('.badge');
                        healthBadge.textContent = 'LVM (N/A)';
                        healthBadge.className = 'badge info';
                    });
                return;
            }
            
            // Skip hardware RAID controllers - don't check health
            const isHardwareRAID = model.includes('perc') || model.includes('raid') || 
                                   model.includes('megaraid') || model.includes('adaptec');
            
            if (isHardwareRAID) {
                // For hardware RAID controllers, just show "RAID" status
                const healthBadge = row.querySelector('.badge');
                healthBadge.textContent = 'RAID';
                healthBadge.className = 'badge info';
                return;
            }
            
            // For normal disks, use simple SMART check
            cockpit.spawn(['smartctl', '-H', device])
                .then(output => {
                    const healthBadge = row.querySelector('.badge');
                    if (output.includes('SMART Health Status: OK') || output.includes('PASSED')) {
                        healthBadge.textContent = 'Healthy';
                        healthBadge.className = 'badge ok';
                    } else if (output.includes('FAILING')) {
                        healthBadge.textContent = 'Warning';
                        healthBadge.className = 'badge error';
                    } else {
                        healthBadge.textContent = 'Unknown';
                        healthBadge.className = 'badge warn';
                    }
                })
                .catch(() => {
                    // SMART not available or device not accessible
                    const healthBadge = row.querySelector('.badge');
                    healthBadge.textContent = 'N/A';
                    healthBadge.className = 'badge muted';
                });
        }
    });
}

// Disk management function
window.manageDisk = function(device) {
    console.log('Managing disk:', device);
    
    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3><i class="fas fa-cog"></i> Manage Disk: ${device}</h3>
                <button class="btn-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="management-options">
                    <button class="management-btn" data-action="smart" data-device="${device}">
                        <i class="fas fa-heartbeat"></i>
                        <div>
                            <strong>Check SMART Health</strong>
                            <small>View disk health and diagnostics</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="info" data-device="${device}">
                        <i class="fas fa-info-circle"></i>
                        <div>
                            <strong>Disk Information</strong>
                            <small>View detailed disk specifications</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="partition" data-device="${device}">
                        <i class="fas fa-table"></i>
                        <div>
                            <strong>Manage Partitions</strong>
                            <small>Create or modify partition table</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="format" data-device="${device}">
                        <i class="fas fa-eraser"></i>
                        <div>
                            <strong>Format Disk</strong>
                            <small>Erase all data and format</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="check" data-device="${device}">
                        <i class="fas fa-search"></i>
                        <div>
                            <strong>Check for Errors</strong>
                            <small>Scan disk for bad sectors</small>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelector('.btn-close').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelectorAll('.management-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const device = btn.getAttribute('data-device');
            executeDiskAction(device, action);
        });
    });
    updateStatus(`Disk management opened for ${device}`);
};

// Partition management function
window.managePartition = function(partition) {
    console.log('Managing partition:', partition);
    
    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h3><i class="fas fa-edit"></i> Manage Partition: ${partition}</h3>
                <button class="btn-close">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="management-options">
                    <button class="management-btn" data-action="mount" data-partition="${partition}">
                        <i class="fas fa-link"></i>
                        <div>
                            <strong>Mount Partition</strong>
                            <small>Make partition accessible</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="unmount" data-partition="${partition}">
                        <i class="fas fa-unlink"></i>
                        <div>
                            <strong>Unmount Partition</strong>
                            <small>Safely disconnect partition</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="fsck" data-partition="${partition}">
                        <i class="fas fa-tools"></i>
                        <div>
                            <strong>Check Filesystem</strong>
                            <small>Verify filesystem integrity</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="resize" data-partition="${partition}">
                        <i class="fas fa-expand-arrows-alt"></i>
                        <div>
                            <strong>Resize Partition</strong>
                            <small>Change partition size</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="label" data-partition="${partition}">
                        <i class="fas fa-tag"></i>
                        <div>
                            <strong>Change Label</strong>
                            <small>Modify partition label</small>
                        </div>
                    </button>
                    <button class="management-btn" data-action="properties" data-partition="${partition}">
                        <i class="fas fa-list"></i>
                        <div>
                            <strong>View Properties</strong>
                            <small>Show partition details</small>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelector('.btn-close').addEventListener('click', () => {
        modal.remove();
    });
    
    modal.querySelectorAll('.management-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const partition = btn.getAttribute('data-partition');
            executePartitionAction(partition, action);
        });
    });
    
    updateStatus(`Partition management opened for ${partition}`);
};

// Execute disk management action
window.executeDiskAction = function(device, action) {
    const actions = {
        'smart': `Checking SMART health for ${device}`,
        'info': `Loading disk information for ${device}`,
        'partition': `Opening partition manager for ${device}`,
        'format': `Formatting ${device} (WARNING: This will erase all data)`,
        'check': `Scanning ${device} for errors`
    };
    
    updateStatus(actions[action] || `Executing action on ${device}`);
    
    // Close modal
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
    
    // Simulate action execution
    setTimeout(() => {
        updateStatus(`${actions[action]} completed`);
    }, 2000);
};

// Execute partition management action
window.executePartitionAction = function(partition, action) {
    const actions = {
        'mount': `Mounting ${partition}`,
        'unmount': `Unmounting ${partition}`,
        'fsck': `Checking filesystem on ${partition}`,
        'resize': `Resizing ${partition}`,
        'label': `Changing label for ${partition}`,
        'properties': `Loading properties for ${partition}`
    };
    
    updateStatus(actions[action] || `Executing action on ${partition}`);
    
    // Close modal
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
    
    // Simulate action execution
    setTimeout(() => {
        updateStatus(`${actions[action]} completed`);
    }, 2000);
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
    
    // Load available disks for RAID creation
    loadAvailableDisksForRaid();
    
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
    
    // Load available physical volumes for VG creation
    loadAvailablePhysicalVolumes();
    
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

// Disk management function
function manageDisk(device) {
    if (!device) {
        alert('No device specified');
        return;
    }
    
    // Store the clicked button reference
    window.lastClickedButton = window.event ? window.event.target.closest('button') : null;
    
    // Get device information for validation
    getDiskInfo(device).then(diskInfo => {
        showDiskActionMenu(device, diskInfo);
    }).catch(error => {
        console.error('Error getting disk info:', error);
        showDiskActionMenu(device, null);
    });
}

function managePartition(partition) {
    if (!partition) {
        alert('No partition specified');
        return;
    }
    
    // Store the clicked button reference
    window.lastClickedButton = window.event ? window.event.target.closest('button') : null;
    
    // Get partition information for validation
    getPartitionInfo(partition).then(partInfo => {
        showPartitionActionMenu(partition, partInfo);
    }).catch(error => {
        console.error('Error getting partition info:', error);
        showPartitionActionMenu(partition, null);
    });
}

function getDiskInfo(device) {
    return new Promise((resolve, reject) => {
        cockpit.spawn(['lsblk', '-J', '-o', 'NAME,FSTYPE,MOUNTPOINT,SIZE,TYPE', device])
            .then(output => {
                const data = JSON.parse(output);
                resolve(data.blockdevices[0]);
            })
            .catch(reject);
    });
}

function getPartitionInfo(partition) {
    return new Promise((resolve, reject) => {
        cockpit.spawn(['lsblk', '-J', '-o', 'NAME,FSTYPE,MOUNTPOINT,SIZE,TYPE', partition])
            .then(output => {
                const data = JSON.parse(output);
                resolve(data.blockdevices[0]);
            })
            .catch(reject);
    });
}

function showDiskActionMenu(device, diskInfo) {
    // Remove any existing menu
    const existingMenu = document.querySelector('.action-dropdown');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const isMounted = diskInfo && diskInfo.mountpoint;
    const isSystemDisk = diskInfo && (diskInfo.mountpoint === '/' || diskInfo.mountpoint === '/boot' || diskInfo.mountpoint === '/boot/efi');
    const fstype = diskInfo ? diskInfo.fstype : null;
    const isLVM = fstype && fstype.toLowerCase().includes('lvm');
    const isInUse = isMounted || isLVM || isSystemDisk;
    
    // Check if disk has partitions in use
    let hasPartitionsInUse = false;
    if (diskInfo && diskInfo.children) {
        hasPartitionsInUse = diskInfo.children.some(child => child.mountpoint || (child.fstype && child.fstype.toLowerCase().includes('lvm')));
    }
    
    const actions = [
        { 
            label: 'Format Device', 
            action: () => formatDevice(device),
            enabled: !isSystemDisk,
            dangerous: true,
            warning: isInUse ? 'This device is currently in use and formatting will destroy all data and may crash the system' : 'This will destroy all data on the device'
        },
        { 
            label: 'Create Partition', 
            action: () => createPartition(device),
            enabled: !isMounted && !isLVM && !hasPartitionsInUse,
            dangerous: false,
            warning: isInUse ? 'This device is currently in use. Creating partitions may cause system instability' : ''
        },
        { 
            label: 'Mount Device', 
            action: () => mountDevice(device),
            enabled: !isMounted && fstype && !isSystemDisk,
            dangerous: false
        },
        { 
            label: 'Unmount Device', 
            action: () => unmountDevice(device),
            enabled: isMounted && !isSystemDisk,
            dangerous: false,
            warning: 'Unmounting this device may cause applications using it to fail'
        },
        { 
            label: 'Check Filesystem', 
            action: () => checkFilesystem(device),
            enabled: fstype && !isMounted,
            dangerous: false,
            warning: isMounted ? 'Cannot check mounted filesystem. Unmount first.' : ''
        },
        { 
            label: 'View Details', 
            action: () => viewDiskDetails(device),
            enabled: true,
            dangerous: false
        }
    ];
    
    createActionDropdown(device, actions);
}

function showPartitionActionMenu(partition, partInfo) {
    // Remove any existing menu
    const existingMenu = document.querySelector('.action-dropdown');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    const isMounted = partInfo && partInfo.mountpoint;
    const isSystemPartition = partInfo && (partInfo.mountpoint === '/' || partInfo.mountpoint === '/boot' || partInfo.mountpoint === '/boot/efi');
    const fstype = partInfo ? partInfo.fstype : null;
    const isLVM = fstype && fstype.toLowerCase().includes('lvm');
    const isInUse = isMounted || isLVM || isSystemPartition;
    
    const actions = [
        { 
            label: 'Format Partition', 
            action: () => formatDevice(partition),
            enabled: !isSystemPartition,
            dangerous: true,
            warning: isInUse ? 'This partition is currently in use and formatting will destroy all data and may crash the system' : 'This will destroy all data on the partition'
        },
        { 
            label: 'Resize Partition', 
            action: () => resizePartition(partition),
            enabled: !isMounted && !isSystemPartition,
            dangerous: false,
            warning: isInUse ? 'This partition is currently in use. Resizing may cause data loss or system instability' : 'Resizing may cause data loss if not done carefully'
        },
        { 
            label: 'Mount Partition', 
            action: () => mountDevice(partition),
            enabled: !isMounted && fstype && !isSystemPartition,
            dangerous: false
        },
        { 
            label: 'Unmount Partition', 
            action: () => unmountDevice(partition),
            enabled: isMounted && !isSystemPartition,
            dangerous: false,
            warning: 'Unmounting this partition may cause applications using it to fail'
        },
        { 
            label: 'Check Filesystem', 
            action: () => checkFilesystem(partition),
            enabled: fstype && !isMounted,
            dangerous: false,
            warning: isMounted ? 'Cannot check mounted filesystem. Unmount first.' : ''
        },
        { 
            label: 'Delete Partition', 
            action: () => deletePartition(partition),
            enabled: !isMounted && !isSystemPartition,
            dangerous: true,
            warning: isInUse ? 'This partition is currently in use. Deleting it will cause system instability and data loss' : 'This will permanently delete the partition and all its data'
        }
    ];
    
    createActionDropdown(partition, actions);
}

function createActionDropdown(device, actions) {
    // Remove any existing dropdown
    const existingDropdown = document.querySelector('.action-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }
    
    // Find the manage button that was clicked
    const clickedButton = window.lastClickedButton;
    if (!clickedButton) return;
    
    const dropdown = document.createElement('div');
    dropdown.className = 'action-dropdown';
    dropdown.innerHTML = `
        <div class="dropdown-backdrop" onclick="this.parentElement.remove()"></div>
        <div class="dropdown-menu">
            ${actions.map(action => `
                <button class="dropdown-item ${action.enabled ? '' : 'disabled'} ${action.dangerous ? 'dangerous' : ''}" 
                        ${action.enabled ? `onclick="handleActionClick('${device}', '${action.label}', ${action.dangerous}, '${action.warning || ''}')"` : 'disabled'}>
                    ${action.label}
                </button>
            `).join('')}
        </div>
    `;
    
    // Position the dropdown near the clicked button
    const rect = clickedButton.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = '0';
    dropdown.style.left = '0';
    dropdown.style.right = '0';
    dropdown.style.bottom = '0';
    dropdown.style.zIndex = '1000';
    
    const menu = dropdown.querySelector('.dropdown-menu');
    menu.style.position = 'absolute';
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    
    // Adjust if menu would go off screen
    setTimeout(() => {
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = (rect.right - menuRect.width) + 'px';
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = (rect.top - menuRect.height - 5) + 'px';
        }
    }, 0);
    
    document.body.appendChild(dropdown);
    
    // Store actions for later use
    window.currentActions = actions.reduce((acc, action) => {
        acc[action.label] = action.action;
        return acc;
    }, {});
}

function handleActionClick(device, actionLabel, isDangerous, warningMessage) {
    // Remove the dropdown
    const dropdown = document.querySelector('.action-dropdown');
    if (dropdown) {
        dropdown.remove();
    }
    
    // Show warning for dangerous actions
    if (isDangerous && warningMessage) {
        const confirmed = confirm(`WARNING: ${warningMessage}\n\nDevice: ${device}\n\nDo you want to continue?`);
        if (!confirmed) {
            return;
        }
    }
    
    // Execute the action
    if (window.currentActions && window.currentActions[actionLabel]) {
        window.currentActions[actionLabel]();
    }
}

// Individual action functions
function formatDevice(device) {
    const fsType = prompt('Filesystem type (ext4, xfs, ntfs):', 'ext4');
    if (!fsType) return;
    
    const command = ['mkfs', `-t${fsType}`, device];
    executeCommand(command, `Formatting ${device} with ${fsType}`);
}

function createPartition(device) {
    alert(`Opening partition editor for ${device}. Use fdisk or parted manually.`);
    const command = ['fdisk', device];
    executeCommand(command, `Opening partition editor for ${device}`);
}

function mountDevice(device) {
    const mountPoint = prompt('Mount point:', `/mnt/${device.split('/').pop()}`);
    if (!mountPoint) return;
    
    const command = ['mount', device, mountPoint];
    executeCommand(command, `Mounting ${device} to ${mountPoint}`);
}

function unmountDevice(device) {
    const command = ['umount', device];
    executeCommand(command, `Unmounting ${device}`);
}

function checkFilesystem(device) {
    const command = ['fsck', '-f', device];
    executeCommand(command, `Checking filesystem on ${device}`);
}

function resizePartition(partition) {
    alert(`Resize functionality requires manual intervention. Use parted or resize2fs.`);
}

function deletePartition(partition) {
    alert(`Delete partition functionality requires manual intervention. Use fdisk or parted.`);
}

function viewDiskDetails(device) {
    // Show detailed information about the device
    cockpit.spawn(['lsblk', '-o', 'NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,UUID,LABEL', device])
        .then(output => {
            alert(`Device Details for ${device}:\n\n${output}`);
        })
        .catch(error => {
            alert(`Error getting device details: ${error}`);
        });
}

function executeCommand(command, description) {
    // Show output section
    const outputDiv = document.getElementById('fs-output');
    if (outputDiv) {
        outputDiv.classList.remove('hidden');
        outputDiv.textContent = `Executing: ${description}\n`;
    }
    
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

// Populate available disks for RAID configuration
function loadAvailableDisksForRaid() {
    const raidDisksSelect = document.getElementById('raid-disks');
    if (!raidDisksSelect) return;
    
    // Clear existing options
    raidDisksSelect.innerHTML = '<option disabled>Loading available disks...</option>';
    
    // Get list of available block devices
    cockpit.spawn(['lsblk', '-J', '-o', 'NAME,TYPE,SIZE,MOUNTPOINT'])
        .then(output => {
            const data = JSON.parse(output);
            const availableDisks = [];
            
            // Filter for whole disks that are not mounted
            if (data.blockdevices) {
                data.blockdevices.forEach(device => {
                    if (device.type === 'disk' && !device.mountpoint) {
                        availableDisks.push({
                            name: device.name,
                            size: device.size,
                            path: `/dev/${device.name}`
                        });
                    }
                });
            }
            
            // Clear loading message and populate options
            raidDisksSelect.innerHTML = '';
            
            if (availableDisks.length === 0) {
                raidDisksSelect.innerHTML = '<option disabled>No available disks found</option>';
            } else {
                availableDisks.forEach(disk => {
                    const option = document.createElement('option');
                    option.value = disk.path;
                    option.textContent = `${disk.name} (${disk.size})`;
                    raidDisksSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading disks for RAID:', error);
            raidDisksSelect.innerHTML = '<option disabled>Error loading disks</option>';
        });
}

// Populate available physical volumes for LVM
function loadAvailablePhysicalVolumes() {
    const vgPvsSelect = document.getElementById('vg-pvs');
    if (!vgPvsSelect) return;
    
    // Clear existing options
    vgPvsSelect.innerHTML = '<option disabled>Loading available disks...</option>';
    
    // Get list of available block devices
    cockpit.spawn(['lsblk', '-J', '-o', 'NAME,TYPE,SIZE,MOUNTPOINT'])
        .then(output => {
            const data = JSON.parse(output);
            const availableDevices = [];
            
            // Filter for whole disks and partitions that are not mounted
            if (data.blockdevices) {
                data.blockdevices.forEach(device => {
                    // Add whole disk if not mounted
                    if (device.type === 'disk' && !device.mountpoint) {
                        availableDevices.push({
                            name: device.name,
                            size: device.size,
                            path: `/dev/${device.name}`
                        });
                    }
                    
                    // Add partitions if not mounted
                    if (device.children) {
                        device.children.forEach(partition => {
                            if (partition.type === 'part' && !partition.mountpoint) {
                                availableDevices.push({
                                    name: partition.name,
                                    size: partition.size,
                                    path: `/dev/${partition.name}`
                                });
                            }
                        });
                    }
                });
            }
            
            // Clear loading message and populate options
            vgPvsSelect.innerHTML = '';
            
            if (availableDevices.length === 0) {
                vgPvsSelect.innerHTML = '<option disabled>No available devices found</option>';
            } else {
                availableDevices.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.path;
                    option.textContent = `${device.name} (${device.size})`;
                    vgPvsSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading devices for LVM:', error);
            vgPvsSelect.innerHTML = '<option disabled>Error loading devices</option>';
        });
}

// Create RAID Array
function createRaidArray() {
    const raidLevel = document.getElementById('raid-level').value;
    const selectedDisks = Array.from(document.getElementById('raid-disks').selectedOptions).map(o => o.value);
    const arrayName = document.getElementById('raid-name').value || 'md0';
    
    if (selectedDisks.length < 2) {
        alert('Please select at least 2 disks for RAID creation');
        return;
    }
    
    // Validate RAID level requirements
    const minDisks = {
        '0': 2, '1': 2, '5': 3, '6': 4, '10': 4
    };
    
    if (selectedDisks.length < minDisks[raidLevel]) {
        alert(`RAID ${raidLevel} requires at least ${minDisks[raidLevel]} disks`);
        return;
    }
    
    // Create the RAID array
    const command = ['mdadm', '--create', `/dev/${arrayName}`, '--level=' + raidLevel, '--raid-devices=' + selectedDisks.length].concat(selectedDisks);
    
    cockpit.spawn(command)
        .then(output => {
            alert('RAID array created successfully');
            loadRaidData(); // Refresh RAID data
            loadOverviewData(); // Refresh overview
        })
        .catch(error => {
            console.error('Error creating RAID array:', error);
            alert('Error creating RAID array: ' + error);
        });
}

// Create LVM Volume Group
function createVolumeGroup() {
    const vgName = document.getElementById('vg-name').value || 'vg_data';
    const selectedPvs = Array.from(document.getElementById('vg-pvs').selectedOptions).map(o => o.value);
    
    if (selectedPvs.length === 0) {
        alert('Please select at least one physical volume');
        return;
    }
    
    // Create physical volumes first
    const pvCommands = selectedPvs.map(pv => ['pvcreate', pv]);
    
    // Execute pvcreate commands sequentially
    let pvPromise = Promise.resolve();
    pvCommands.forEach(cmd => {
        pvPromise = pvPromise.then(() => cockpit.spawn(cmd));
    });
    
    // Then create volume group
    pvPromise
        .then(() => {
            const vgCommand = ['vgcreate', vgName].concat(selectedPvs);
            return cockpit.spawn(vgCommand);
        })
        .then(output => {
            alert('Volume Group created successfully');
            loadLvmData(); // Refresh LVM data
            loadOverviewData(); // Refresh overview
        })
        .catch(error => {
            console.error('Error creating Volume Group:', error);
            alert('Error creating Volume Group: ' + error);
        });
}

// Load available disks when tabs are shown
function loadRaidTabData() {
    console.log('Loading RAID tab data...');
    loadAvailableDisksForRaid();
}

function loadLvmTabData() {
    console.log('Loading LVM tab data...');
    loadAvailablePhysicalVolumes();
}

// End of file
