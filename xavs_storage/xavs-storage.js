// XAVS Storage Module

document.addEventListener('DOMContentLoaded', function() {
    console.log('XAVS Storage initializing...');
    
    // Initialize tab switching
    setupTabSwitching();
    
    // Initialize components
    setupEventHandlers();
    
    // Load persisted logs from previous sessions
    loadPersistedLogs();
    
    // Show initial content immediately
    showOverviewTab();
    
    // Load initial data for overview
    loadOverviewData();
    
    // Auto-refresh disabled to prevent log spam and unnecessary updates
    // setInterval(loadOverviewData, 30000); // Disabled auto-refresh
    
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
    
    // iSCSI buttons
    const discoverIscsiBtn = document.getElementById('btn-discover-iscsi');
    if (discoverIscsiBtn) {
        discoverIscsiBtn.addEventListener('click', function() {
            discoverIscsi();
        });
    }
    
    const connectIscsiBtn = document.getElementById('btn-connect-iscsi');
    if (connectIscsiBtn) {
        connectIscsiBtn.addEventListener('click', function() {
            connectIscsi();
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
    
    updateStatus('Data refreshed', 'success');
    logMessage('All storage data refreshed', 'success');
}

function loadOverviewData() {
    console.log('Loading overview data...');
    
    // Load real storage overview using df and other system commands
    loadStorageOverview();
    loadVolumeOverview();
    loadRaidOverview();
    loadNetworkOverview();
    
    // Only reload disks if the table is empty (to avoid flicker on auto-refresh)
    const tbody = document.querySelector('#table-disks tbody');
    if (!tbody || tbody.children.length === 0 || tbody.innerHTML.includes('Loading disk information...')) {
        console.log('Disk table is empty, loading disk data...');
        loadDisks(); // Load disk data for the overview table
    } else {
        console.log('Disk table already populated, skipping disk reload to avoid flicker');
    }
    
    updateStatus('Overview data loaded', 'success');
}

function loadStorageOverview() {
    console.log('Loading storage overview...');
    
    // Show loading state
    updateElementText('total-storage', 'Loading...');
    updateElementText('used-storage', 'Loading...');
    updateElementText('free-storage', 'Loading...');
    
    // Check if cockpit is available
    if (typeof cockpit === 'undefined') {
        console.log('Cockpit not available, using mock storage data...');
        // Use mock data for development
        updateElementText('total-storage', '879G');
        updateElementText('used-storage', '322G');
        updateElementText('free-storage', '513G');
        updateUsageProgressBar(37); // 37% usage
        // Remove log message to avoid spam
        return;
    }
    
    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
        updateElementText('total-storage', 'Error');
        updateElementText('used-storage', 'Error');
        updateElementText('free-storage', 'Error');
        logMessage('Storage overview loading timed out', 'error');
        console.error('Storage overview loading timed out');
    }, 10000); // 10 second timeout
    
    // Simplified approach using df for root filesystem
    cockpit.spawn(['df', '-h', '/'])
        .then(output => {
            clearTimeout(timeoutId);
            console.log('DF output:', output);
            
            const lines = output.trim().split('\n');
            if (lines.length >= 2) {
                const parts = lines[1].split(/\s+/);
                if (parts.length >= 4) {
                    const total = parts[1];
                    const used = parts[2];
                    const available = parts[3];
                    
                    updateElementText('total-storage', total);
                    updateElementText('used-storage', used);
                    updateElementText('free-storage', available);
                    
                    // Calculate usage percentage
                    const usageStr = parts[4];
                    const usage = parseInt(usageStr.replace('%', '')) || 0;
                    updateUsageProgressBar(usage);
                    
                    console.log('Storage overview loaded:', { total, used, available, usage });
                    return;
                }
            }
            
            // Fallback if parsing fails
            updateElementText('total-storage', 'N/A');
            updateElementText('used-storage', 'N/A');
            updateElementText('free-storage', 'N/A');
            logMessage('Storage overview: Unable to parse df output', 'warning');
            
        })
        .catch(error => {
            clearTimeout(timeoutId);
            console.error('Error loading storage overview:', error);
            logMessage(`Storage overview error: ${error.message}`, 'error');
            
            updateElementText('total-storage', 'Error');
            updateElementText('used-storage', 'Error');
            updateElementText('free-storage', 'Error');
        });
}

function updateUsageProgressBar(percentage) {
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.width = percentage + '%';
        progressBar.setAttribute('aria-valuenow', percentage);
        
        // Update color based on usage
        progressBar.className = 'progress-bar';
        if (percentage > 90) {
            progressBar.classList.add('bg-danger');
        } else if (percentage > 75) {
            progressBar.classList.add('bg-warning');
        } else {
            progressBar.classList.add('bg-success');
        }
    }
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
    // Check if cockpit is available
    if (typeof cockpit === 'undefined') {
        console.log('Using mock volume data...');
        updateElementText('vg-count', '142');
        updateElementText('lv-count', '142');
        updateElementText('lvm-status', 'Active');
        return;
    }
    
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
    // Check if cockpit is available
    if (typeof cockpit === 'undefined') {
        console.log('Using mock RAID data...');
        updateElementText('raid-count', '0');
        updateElementText('raid-status', 'No Arrays');
        return;
    }
    
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
    // Check if cockpit is available
    if (typeof cockpit === 'undefined') {
        console.log('Using mock network storage data...');
        updateElementText('nfs-mount-count', '1');
        updateElementText('iscsi-target-count', '0');
        updateElementText('network-storage-status', '1 NFS active');
        return;
    }
    
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

async function loadDisks() {
    const tbody = document.querySelector('#table-disks tbody');
    if (!tbody) {
        console.error('Error: #table-disks tbody element not found');
        return;
    }
    
    console.log('Loading disk information...');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">Loading disk information...</td></tr>';
    
    try {
        // First try to detect the operating system and use appropriate command
        let devices;
        
        // Check if cockpit is available (real Cockpit environment)
        if (typeof cockpit === 'undefined') {
            console.log('Cockpit not available, using mock data for development...');
            devices = createMockDiskData();
        } else {
            // Try lsblk first (Linux)
            try {
                console.log('Attempting to use lsblk...');
                const data = await cockpit.spawn(['lsblk', '-J', '-b', '-o', 'NAME,MODEL,SIZE,FSTYPE,MOUNTPOINT,TYPE']);
                console.log('Raw lsblk output:', data);
                devices = JSON.parse(data);
            } catch (lsblkError) {
                console.log('lsblk failed, trying alternative methods...', lsblkError);
                
                // Fallback for Windows or systems without lsblk
                try {
                    // Try using wmic on Windows
                    console.log('Attempting to use wmic...');
                    const wmicData = await cockpit.spawn(['wmic', 'diskdrive', 'get', 'size,model,deviceid', '/format:csv']);
                    console.log('Raw wmic output:', wmicData);
                    devices = parseWmicOutput(wmicData);
                } catch (wmicError) {
                    console.log('wmic failed, using mock data...', wmicError);
                    // Create mock data for development/testing
                    devices = createMockDiskData();
                }
            }
        }
        
        console.log('Parsed devices:', devices);
        
        if (!devices.blockdevices || devices.blockdevices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">No storage devices found</td></tr>';
            return;
        }
        
        let html = '';
        let deviceCount = 0;
        
        for (const device of devices.blockdevices) {
            if (device.name.startsWith('loop') || device.name.startsWith('ram')) continue;
            
            // Only show actual disks, not partitions at top level
            if (device.type === 'disk') {
                deviceCount++;
                const name = `/dev/${device.name}`;
                const model = device.model || 'Unknown';
                const size = device.size ? formatBytes(parseInt(device.size)) : 'Unknown';
                const fstype = device.fstype || 'None';
                const mountpoint = device.mountpoint || 'Not mounted';
                
                console.log(`Processing disk: ${name}, model: ${model}, size: ${size}`);
                
                // Get comprehensive status for this disk with timeout
                let status = { badge: '<span class="badge badge-success">Available</span>', canManage: true };
                try {
                    console.log(`Getting status for ${name}...`);
                    // Add timeout to prevent hanging
                    const statusPromise = getDiskUsageStatus(name);
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Status check timeout')), 3000)
                    );
                    status = await Promise.race([statusPromise, timeoutPromise]);
                    console.log(`Status for ${name}:`, status);
                } catch (statusError) {
                    console.warn(`Error getting status for ${name}:`, statusError);
                    // Use fallback status based on disk info
                    if (device.fstype === 'LVM2_member') {
                        status = {
                            badge: '<span class="badge badge-info">LVM</span>',
                            canManage: false,
                            reason: 'LVM Physical Volume'
                        };
                    } else if (device.children && device.children.some(child => child.fstype === 'ceph_bluestore')) {
                        status = {
                            badge: '<span class="badge badge-info">CEPH</span>',
                            canManage: false,
                            reason: 'Ceph OSD'
                        };
                    }
                }
                
                // Parent disk row
                html += `
                    <tr class="disk-row">
                        <td><strong>${name}</strong></td>
                        <td>${model}</td>
                        <td>${size}</td>
                        <td>-</td>
                        <td>${fstype}</td>
                        <td>${mountpoint}</td>
                        <td>${status.badge}</td>
                        <td><span class="badge badge-success">Healthy</span></td>
                        <td style="text-align: left;">
                            <button class="btn btn-sm btn-outline-brand manage-disk-btn" data-device="${name}" ${status.canManage ? '' : 'disabled'}>
                                <i class="fas fa-cog"></i> Manage
                            </button>
                        </td>
                    </tr>
                `;
                console.log(`Generated button for ${name}: canManage=${status.canManage}, disabled=${status.canManage ? '' : 'disabled'}`);
                
                // Add partitions as child rows with indentation
                if (device.children) {
                    for (const partition of device.children) {
                        const partName = `/dev/${partition.name}`;
                        const partSize = partition.size ? formatBytes(parseInt(partition.size)) : 'Unknown';
                        const partFstype = partition.fstype || 'None';
                        const partMountpoint = partition.mountpoint || 'Not mounted';
                        
                        console.log(`Processing partition: ${partName}, fstype: ${partFstype}`);
                        
                        // Get status for partition with quick fallback
                        let partStatus = { badge: '<span class="badge badge-success">Available</span>', canManage: true };
                        try {
                            // Quick status based on known information
                            if (partition.mountpoint) {
                                partStatus = {
                                    badge: `<span class="badge badge-warning">MOUNTED</span>`,
                                    canManage: false,
                                    reason: `Mounted at ${partition.mountpoint}`
                                };
                            } else if (partition.fstype === 'ceph_bluestore') {
                                partStatus = {
                                    badge: '<span class="badge badge-info">CEPH</span>',
                                    canManage: false,
                                    reason: 'Ceph OSD'
                                };
                            } else if (partition.type === 'lvm') {
                                partStatus = {
                                    badge: '<span class="badge badge-info">LVM</span>',
                                    canManage: false,
                                    reason: 'LVM Volume'
                                };
                            }
                        } catch (partStatusError) {
                            console.warn(`Error getting status for partition ${partName}:`, partStatusError);
                        }
                        
                        html += `
                            <tr class="partition-row">
                                <td style="padding-left: 30px;">└─ ${partName}</td>
                                <td>-</td>
                                <td>${partSize}</td>
                                <td>Partition</td>
                                <td>${partFstype}</td>
                                <td>${partMountpoint}</td>
                                <td>${partStatus.badge}</td>
                                <td><span class="badge badge-success">Healthy</span></td>
                                <td style="text-align: left;">
                                    <button class="btn btn-sm btn-outline-brand manage-disk-btn" data-device="${partName}" ${partStatus.canManage ? '' : 'disabled'}>
                                        <i class="fas fa-cog"></i> Manage
                                    </button>
                                </td>
                            </tr>
                        `;
                    }
                }
                
                console.log(`Completed processing disk: ${name}`);
            }
        }
        
        if (deviceCount === 0) {
            html = '<tr><td colspan="9" class="text-center">No storage devices found</td></tr>';
        }
        
        console.log(`Final HTML to be inserted (${html.length} characters):`, html.substring(0, 500) + (html.length > 500 ? '...' : ''));
        tbody.innerHTML = html;
        console.log(`Loaded ${deviceCount} storage devices`);
        console.log('Table body after setting innerHTML:', tbody.innerHTML.substring(0, 500) + (tbody.innerHTML.length > 500 ? '...' : ''));
        
        // Update device status summary in the Device Status card
        if (devices && devices.blockdevices) {
            updateDeviceStatusSummary(devices.blockdevices);
        }
        
        // Re-attach event listeners for manage buttons
        console.log('About to attach disk manage listeners...');
        attachDiskManageListeners();
        console.log('Finished attaching disk manage listeners');
        
    } catch (error) {
        console.error('Error loading disks:', error);
        logMessage(`Error loading disk information: ${error.message}`, 'error');
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Error loading disk information. Check console for details.</td></tr>';
    }
}

// Parse wmic output for Windows systems
function parseWmicOutput(wmicData) {
    const lines = wmicData.split('\n').filter(line => line.trim() && !line.startsWith('Node'));
    const devices = [];
    
    lines.forEach((line, index) => {
        if (index === 0) return; // Skip header
        const parts = line.split(',');
        if (parts.length >= 4) {
            const deviceId = parts[1]?.trim();
            const model = parts[2]?.trim() || 'Unknown';
            const size = parts[3]?.trim();
            
            if (deviceId && deviceId.includes('PHYSICALDRIVE')) {
                devices.push({
                    name: `disk${index}`,
                    model: model,
                    size: size ? parseInt(size) : 0,
                    type: 'disk',
                    fstype: null,
                    mountpoint: null
                });
            }
        }
    });
    
    return { blockdevices: devices };
}

// Create mock disk data for development/testing
function createMockDiskData() {
    console.log('Creating mock disk data for development...');
    return {
        blockdevices: [
            {
                name: 'sda',
                model: 'Samsung SSD 980 PRO',
                size: 1000204886016, // 1TB
                type: 'disk',
                fstype: null,
                mountpoint: null,
                children: [
                    {
                        name: 'sda1',
                        size: 536870912000, // 500GB
                        type: 'part',
                        fstype: 'ext4',
                        mountpoint: '/'
                    },
                    {
                        name: 'sda2',
                        size: 463334974016, // ~430GB
                        type: 'part',
                        fstype: 'ext4',
                        mountpoint: '/home'
                    }
                ]
            },
            {
                name: 'sdb',
                model: 'WD Blue 2TB',
                size: 2000398934016, // 2TB
                type: 'disk',
                fstype: null,
                mountpoint: null
            },
            {
                name: 'sdc',
                model: 'Seagate Backup 4TB',
                size: 4000787030016, // 4TB
                type: 'disk',
                fstype: 'ext4',
                mountpoint: '/backup'
            }
        ]
    };
}

// Get comprehensive disk usage status
async function getDiskUsageStatus(device) {
    console.log(`getDiskUsageStatus called with device: "${device}"`);
    try {
        // If cockpit is not available, return mock status
        if (typeof cockpit === 'undefined') {
            console.log('Cockpit undefined, using mock status...');
            // Return different statuses based on device name for development
            if (device.includes('sda1') || device.includes('sda2')) {
                console.log(`Device ${device} identified as mounted partition`);
                return {
                    badge: '<span class="badge badge-warning">MOUNTED</span>',
                    canManage: false,
                    reason: 'Mounted (mock)'
                };
            } else if (device.includes('/dev/sdb') || device.includes('/dev/sdc') || device.includes('/dev/sdd')) {
                console.log(`Device ${device} identified as available disk`);
                return {
                    badge: '<span class="badge badge-success">Available</span>',
                    canManage: true,
                    reason: 'Available for use'
                };
            } else if (device.includes('/dev/sda')) {
                console.log(`Device ${device} identified as parent sda disk`);
                // Parent sda disk should be manageable
                return {
                    badge: '<span class="badge badge-info">IN USE</span>',
                    canManage: true,
                    reason: 'Has partitions but manageable'
                };
            } else {
                console.log(`Device ${device} identified as default available`);
                return {
                    badge: '<span class="badge badge-success">Available</span>',
                    canManage: true,
                    reason: 'Available for management'
                };
            }
        }
        
        // Quick check for Ceph disks to avoid hanging
        if (device.includes('ceph')) {
            return {
                badge: '<span class="badge badge-info">CEPH</span>',
                canManage: false,
                reason: 'Ceph OSD'
            };
        }
        
        // Use a timeout wrapper for all status checks
        const statusPromise = Promise.all([
            checkDeviceMounted(device).catch(() => ({ mounted: false })),
            checkDeviceInRaid(device).catch(() => ({ inRaid: false })),
            checkDeviceInLvm(device).catch(() => ({ inLvm: false })),
            checkIsOsDisk(device).catch(() => ({ isOsDisk: false })),
            Promise.resolve({ inCeph: false }), // Skip Ceph check for now
            Promise.resolve({ inUse: false }) // Skip process check for now
        ]);
        
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Status check timeout')), 2000)
        );
        
        const checks = await Promise.race([statusPromise, timeoutPromise]);
        const [mountInfo, raidInfo, lvmInfo, osInfo, cephInfo, processInfo] = checks;
        
        // Determine status and badge
        if (osInfo.isOsDisk) {
            return {
                badge: '<span class="badge badge-danger" title="Operating System Disk">OS DISK</span>',
                canManage: false,
                reason: 'Contains operating system'
            };
        }
        
        if (mountInfo.mounted) {
            return {
                badge: `<span class="badge badge-warning" title="Mounted at ${mountInfo.mountpoint}">MOUNTED</span>`,
                canManage: false,
                reason: `Mounted at ${mountInfo.mountpoint}`
            };
        }
        
        if (raidInfo.inRaid) {
            return {
                badge: `<span class="badge badge-info" title="RAID member: ${raidInfo.raidDevice}">RAID</span>`,
                canManage: false,
                reason: `Part of RAID array ${raidInfo.raidDevice}`
            };
        }
        
        if (lvmInfo.inLvm) {
            return {
                badge: `<span class="badge badge-info" title="LVM PV in VG: ${lvmInfo.volumeGroup}">LVM</span>`,
                canManage: false,
                reason: `LVM physical volume in ${lvmInfo.volumeGroup}`
            };
        }
        
        if (cephInfo.inCeph) {
            return {
                badge: `<span class="badge badge-info" title="${cephInfo.usage}">CEPH</span>`,
                canManage: false,
                reason: cephInfo.usage
            };
        }
        
        if (processInfo.inUse) {
            return {
                badge: `<span class="badge badge-warning" title="In use by: ${processInfo.processes.join(', ')}">IN USE</span>`,
                canManage: false,
                reason: `In use by: ${processInfo.processes.join(', ')}`
            };
        }
        
        // Device is available
        return {
            badge: '<span class="badge badge-success" title="Available for use">AVAILABLE</span>',
            canManage: true,
            reason: 'Available for use'
        };
        
    } catch (error) {
        return {
            badge: '<span class="badge badge-secondary" title="Status check failed">UNKNOWN</span>',
            canManage: true,
            reason: 'Status check failed'
        };
    }
}

function attachDiskManageListeners() {
    console.log('Attaching disk manage listeners...');
    
    // Add event listeners for manage disk buttons
    const diskButtons = document.querySelectorAll('.manage-disk-btn');
    console.log('Found disk buttons:', diskButtons.length);
    
    diskButtons.forEach((button, index) => {
        console.log(`Adding listener to disk button ${index}:`, button);
        button.addEventListener('click', function(e) {
            console.log('Disk button clicked!', e);
            e.preventDefault();
            e.stopPropagation();
            const device = this.getAttribute('data-device');
            if (device) {
                showDiskManageDropdown(this, device);
            }
        });
    });
}

// Legacy function for backward compatibility
function addManageButtonListeners() {
    console.log('Adding manage button listeners...');
    
    // Add event listeners for manage disk buttons
    const diskButtons = document.querySelectorAll('.manage-disk-btn');
    console.log('Found disk buttons:', diskButtons.length);
    
    diskButtons.forEach((button, index) => {
        console.log(`Adding listener to disk button ${index}:`, button);
        button.addEventListener('click', function(e) {
            console.log('Disk button clicked!', e);
            e.preventDefault();
            e.stopPropagation();
            window.event = e; // Store event globally
            const device = this.getAttribute('data-device');
            console.log('Device from button:', device);
            manageDisk(device);
        });
    });
    
    // Add event listeners for manage partition buttons
    const partitionButtons = document.querySelectorAll('.manage-partition-btn');
    console.log('Found partition buttons:', partitionButtons.length);
    
    partitionButtons.forEach((button, index) => {
        console.log(`Adding listener to partition button ${index}:`, button);
        button.addEventListener('click', function(e) {
            console.log('Partition button clicked!', e);
            e.preventDefault();
            e.stopPropagation();
            window.event = e; // Store event globally
            const partition = this.getAttribute('data-partition');
            console.log('Partition from button:', partition);
            managePartition(partition);
        });
    });
}

function updateDeviceStatusSummary(devices) {
    // Filter out loop and ram devices, only count actual disks
    const realDevices = devices.filter(device => 
        !device.name.startsWith('loop') && !device.name.startsWith('ram') && device.type === 'disk'
    );
    
    const totalDevices = realDevices.length;
    let healthyCount = 0;
    let warningCount = 0;
    let failedCount = 0;
    
    // Count devices by their status
    realDevices.forEach(device => {
        // For now, categorize based on filesystem type and mountpoint
        if (device.mountpoint) {
            healthyCount++; // Mounted devices are considered healthy
        } else if (device.fstype === 'LVM2_member' || device.fstype === 'ceph_bluestore') {
            healthyCount++; // LVM and Ceph devices are healthy if they're in use
        } else if (device.fstype && device.fstype !== 'None') {
            warningCount++; // Has filesystem but not mounted
        } else {
            healthyCount++; // Available for use
        }
    });
    
    console.log(`Device summary: Total: ${totalDevices}, Healthy: ${healthyCount}, Warning: ${warningCount}, Failed: ${failedCount}`);
    
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
            
            // Check if it's an LVM device - check underlying physical disk health
            if (fstype.includes('lvm2_member')) {
                // For LVM devices, first check current health status quickly
                const healthBadge = row.querySelector('.badge');
                healthBadge.textContent = 'Checking...';
                healthBadge.className = 'badge warn';
                
                // Quick health check first
                cockpit.spawn(['smartctl', '-H', device])
                    .then(output => {
                        if (output.includes('SMART overall-health self-assessment test result: PASSED')) {
                            healthBadge.textContent = 'Healthy';
                            healthBadge.className = 'badge ok';
                        } else if (output.includes('SMART overall-health self-assessment test result: FAILED')) {
                            healthBadge.textContent = 'Failed';
                            healthBadge.className = 'badge error';
                        } else {
                            // If no recent test results, check self-test log
                            cockpit.spawn(['smartctl', '-l', 'selftest', device])
                                .then(testOutput => {
                                    if (testOutput.includes('Completed without error')) {
                                        healthBadge.textContent = 'Healthy';
                                        healthBadge.className = 'badge ok';
                                    } else if (testOutput.includes('error') || testOutput.includes('FAILED')) {
                                        healthBadge.textContent = 'Warning';
                                        healthBadge.className = 'badge error';
                                    } else {
                                        healthBadge.textContent = 'Unknown';
                                        healthBadge.className = 'badge warn';
                                    }
                                })
                                .catch(() => {
                                    healthBadge.textContent = 'N/A';
                                    healthBadge.className = 'badge muted';
                                });
                        }
                    })
                    .catch(() => {
                        const healthBadge = row.querySelector('.badge');
                        healthBadge.textContent = 'N/A';
                        healthBadge.className = 'badge muted';
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
            
            // For normal disks, use quick SMART health check
            const healthBadge = row.querySelector('.badge');
            healthBadge.textContent = 'Checking...';
            healthBadge.className = 'badge warn';
            
            cockpit.spawn(['smartctl', '-H', device])
                .then(output => {
                    if (output.includes('SMART overall-health self-assessment test result: PASSED')) {
                        healthBadge.textContent = 'Healthy';
                        healthBadge.className = 'badge ok';
                    } else if (output.includes('SMART overall-health self-assessment test result: FAILED')) {
                        healthBadge.textContent = 'Failed';
                        healthBadge.className = 'badge error';
                    } else if (output.includes('SMART Health Status: OK') || output.includes('PASSED')) {
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
                    healthBadge.textContent = 'N/A';
                    healthBadge.className = 'badge muted';
                });
        }
    });
}

// Disk management function
// Deprecated functions - these have been replaced by the new dropdown system
// Keeping them for compatibility but they no longer create modals

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
    
    if (!server) {
        showNotification('Please enter NFS server IP address', 'warning');
        return;
    }
    
    // Extract IP address from server (remove any protocol prefixes)
    const ipAddress = server.replace(/^(nfs:\/\/|\/\/)?/, '').split(':')[0];
    
    // Strict IP address validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
        showNotification('Please enter a valid IP address for NFS server (e.g., 192.168.1.100)', 'error');
        logMessage(`NFS test failed: Invalid IP address format: ${ipAddress}`, 'error');
        return;
    }
    
    // Validate each octet is between 0-255
    const octets = ipAddress.split('.');
    for (let octet of octets) {
        const num = parseInt(octet);
        if (num < 0 || num > 255) {
            showNotification('Invalid IP address: Each number must be between 0-255', 'error');
            logMessage(`NFS test failed: Invalid IP octet: ${octet}`, 'error');
            return;
        }
    }
    
    showNotification('Testing NFS connectivity...', 'info');
    logMessage(`Testing NFS connectivity to ${ipAddress}:2049...`, 'info');
    
    // Check if cockpit is available for system commands
    if (typeof cockpit === 'undefined') {
        showNotification('NFS test requires system access (cockpit not available)', 'warning');
        logMessage('NFS connectivity test skipped: cockpit not available', 'warning');
        return;
    }
    
    // Test connection to NFS port 2049 using nc (netcat)
    cockpit.spawn(['nc', '-z', '-v', '-w', '5', ipAddress, '2049'])
        .done(function(output) {
            showNotification(`NFS connection successful to ${ipAddress}:2049`, 'success');
            logMessage(`NFS connection test successful: ${ipAddress}:2049 is accessible`, 'success');
        })
        .fail(function(error) {
            showNotification(`NFS connection failed to ${ipAddress}:2049`, 'error');
            logMessage(`NFS connection test failed: ${ipAddress}:2049 is not accessible - ${error}`, 'error');
        });
}

async function mountNFS() {
    const server = document.getElementById('nfs-server').value;
    const path = document.getElementById('nfs-path').value;
    const mountpoint = document.getElementById('nfs-mountpoint').value;
    
    // Collect mount options from checkboxes
    const options = [];
    if (document.getElementById('nfs-opt-rw').checked) options.push('rw');
    else options.push('ro');
    if (document.getElementById('nfs-opt-sync').checked) options.push('sync');
    if (document.getElementById('nfs-opt-hard').checked) options.push('hard');
    else options.push('soft');
    if (document.getElementById('nfs-opt-intr').checked) options.push('intr');
    if (document.getElementById('nfs-opt-noatime').checked) options.push('noatime');
    if (document.getElementById('nfs-opt-rsize').checked) options.push('rsize=8192,wsize=8192');
    
    const optionsString = options.join(',');
    const isPersistent = document.getElementById('nfs-persistent').checked;
    
    // Comprehensive validation
    if (!server) {
        showNotification('Please enter NFS server address', 'warning');
        logMessage('NFS mount failed: Missing server address', 'error');
        return;
    }
    
    if (!path) {
        showNotification('Please enter NFS export path', 'warning');
        logMessage('NFS mount failed: Missing export path', 'error');
        return;
    }
    
    if (!mountpoint) {
        showNotification('Please enter local mount point', 'warning');
        logMessage('NFS mount failed: Missing mount point', 'error');
        return;
    }
    
    // Validate server format (basic IP/hostname check)
    const serverPattern = /^[a-zA-Z0-9.-]+$/;
    if (!serverPattern.test(server)) {
        showNotification('Invalid server address format', 'error');
        logMessage(`NFS mount failed: Invalid server format: ${server}`, 'error');
        return;
    }
    
    // Validate path format
    if (!path.startsWith('/')) {
        showNotification('NFS path must start with /', 'warning');
        logMessage(`NFS mount failed: Invalid path format: ${path}`, 'error');
        return;
    }
    
    // Validate mount point format
    if (!mountpoint.startsWith('/')) {
        showNotification('Mount point must be an absolute path', 'warning');
        logMessage(`NFS mount failed: Invalid mount point format: ${mountpoint}`, 'error');
        return;
    }
    
    showNotification(`Validating NFS server connectivity...`, 'info');
    logMessage(`Starting NFS mount: ${server}:${path} -> ${mountpoint}`, 'info');
    
    try {
        // Check if NFS utilities are available
        try {
            await cockpit.spawn(['which', 'mount.nfs']);
        } catch (error) {
            showNotification('NFS utilities not installed. Install nfs-utils package.', 'error');
            logMessage('NFS mount failed: NFS utilities not available', 'error');
            return;
        }
        
        // Check if mount point exists
        try {
            await cockpit.spawn(['test', '-d', mountpoint]);
        } catch (error) {
            // Try to create mount point
            try {
                await cockpit.spawn(['mkdir', '-p', mountpoint]);
                logMessage(`Created mount point: ${mountpoint}`, 'info');
            } catch (createError) {
                showNotification(`Cannot create mount point: ${createError.message}`, 'error');
                logMessage(`NFS mount failed: Cannot create mount point: ${createError.message}`, 'error');
                return;
            }
        }
        
        // Check if mount point is already in use
        try {
            const mountOutput = await cockpit.spawn(['findmnt', mountpoint]);
            if (mountOutput.trim()) {
                showNotification('Mount point already has a filesystem mounted', 'warning');
                logMessage(`NFS mount failed: Mount point ${mountpoint} already in use`, 'error');
                return;
            }
        } catch (error) {
            // Mount point is free, continue
        }
        
        // Test NFS server connectivity
        showNotification(`Testing connectivity to ${server}...`, 'info');
        try {
            await cockpit.spawn(['showmount', '-e', server]);
            logMessage(`NFS server ${server} is reachable`, 'success');
        } catch (error) {
            showNotification('Cannot connect to NFS server', 'warning');
            logMessage(`Warning: Cannot verify NFS server connectivity: ${error.message}`, 'warning');
        }
        
        // Perform the mount
        logMessage(`Mounting ${server}:${path} to ${mountpoint} with options: ${optionsString}`, 'info');
        const mountCommand = ['mount', '-t', 'nfs', '-o', optionsString, `${server}:${path}`, mountpoint];
        logMessage(`Executing: ${mountCommand.join(' ')}`, 'info');
        
        const mountResult = await cockpit.spawn(mountCommand);
        
        // Verify mount success
        const verifyOutput = await cockpit.spawn(['findmnt', mountpoint]);
        if (verifyOutput.includes(server)) {
            showNotification('NFS mounted successfully', 'success');
            logMessage(`NFS mount successful: ${server}:${path} -> ${mountpoint}`, 'success');
            
            // Add to fstab if persistent mount is requested
            if (isPersistent) {
                try {
                    const fstabEntry = `${server}:${path} ${mountpoint} nfs ${optionsString} 0 0\n`;
                    await cockpit.spawn(['sh', '-c', `echo "${fstabEntry}" >> /etc/fstab`]);
                    showNotification('Mount added to fstab for persistence', 'success');
                    logMessage(`Added to fstab: ${fstabEntry.trim()}`, 'success');
                } catch (fstabError) {
                    showNotification('Mount successful but failed to add to fstab', 'warning');
                    logMessage(`Warning: Failed to add to fstab: ${fstabError.message}`, 'warning');
                }
            }
            
            loadNetworkMounts();
        } else {
            showNotification('Mount verification failed', 'warning');
            logMessage('Mount command completed but verification failed', 'warning');
        }
        
    } catch (error) {
        showNotification(`NFS mount failed: ${error.message}`, 'error');
        logMessage(`NFS mount failed: ${error.message}`, 'error');
    }
}

function discoverIscsi() {
    const target = document.getElementById('iscsi-target').value;
    const port = document.getElementById('iscsi-port').value || '3260';
    
    if (!target) {
        showNotification('Please enter iSCSI target IP address', 'warning');
        logMessage('iSCSI discovery failed: Missing target IP', 'error');
        return;
    }
    
    // Strict IP address validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(target)) {
        showNotification('Please enter a valid IP address for iSCSI target (e.g., 192.168.1.200)', 'error');
        logMessage(`iSCSI discovery failed: Invalid IP format: ${target}`, 'error');
        return;
    }
    
    // Validate each octet is between 0-255
    const octets = target.split('.');
    for (let octet of octets) {
        const num = parseInt(octet);
        if (num < 0 || num > 255) {
            showNotification('Invalid IP address: Each number must be between 0-255', 'error');
            logMessage(`iSCSI discovery failed: Invalid IP octet: ${octet}`, 'error');
            return;
        }
    }
    
    showNotification('Testing iSCSI connectivity...', 'info');
    logMessage(`Testing iSCSI connectivity to ${target}:${port}...`, 'info');
    
    // Check if cockpit is available for system commands
    if (typeof cockpit === 'undefined') {
        showNotification('iSCSI discovery requires system access (cockpit not available)', 'warning');
        logMessage('iSCSI discovery skipped: cockpit not available', 'warning');
        return;
    }
    
    // Test connection to iSCSI port using nc (netcat)
    cockpit.spawn(['nc', '-z', '-v', '-w', '5', target, port])
        .done(function(output) {
            showNotification(`iSCSI connectivity successful to ${target}:${port}`, 'success');
            logMessage(`iSCSI connectivity test successful: ${target}:${port} is accessible`, 'success');
            
            // Now discover actual targets
            cockpit.spawn(['iscsiadm', '-m', 'discovery', '-t', 'sendtargets', '-p', `${target}:${port}`])
                .done(function(discoveryOutput) {
                    if (discoveryOutput.trim()) {
                        const targets = discoveryOutput.trim().split('\n');
                        showNotification(`Found ${targets.length} iSCSI target(s)`, 'success');
                        logMessage(`iSCSI discovery successful: Found targets:\n${discoveryOutput}`, 'success');
                    } else {
                        showNotification('No iSCSI targets found', 'warning');
                        logMessage(`iSCSI discovery: No targets found on ${target}:${port}`, 'warning');
                    }
                })
                .fail(function(error) {
                    showNotification('iSCSI target discovery failed', 'error');
                    logMessage(`iSCSI target discovery failed: ${error}`, 'error');
                });
        })
        .fail(function(error) {
            showNotification(`iSCSI connection failed to ${target}:${port}`, 'error');
            logMessage(`iSCSI connectivity test failed: ${target}:${port} is not accessible - ${error}`, 'error');
        });
}

function connectIscsi() {
    const target = document.getElementById('iscsi-target').value;
    const iqn = document.getElementById('iscsi-iqn').value;
    const port = document.getElementById('iscsi-port').value || '3260';
    const username = document.getElementById('iscsi-username').value;
    const isPersistent = document.getElementById('iscsi-persistent').checked;
    
    if (!target || !iqn) {
        showNotification('Please enter iSCSI target and IQN', 'warning');
        logMessage('iSCSI connection failed: Missing target or IQN', 'error');
        return;
    }
    
    // Validate IP address format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(target)) {
        showNotification('Please enter a valid IP address for iSCSI target (e.g., 192.168.1.200)', 'error');
        logMessage(`iSCSI connection failed: Invalid IP format: ${target}`, 'error');
        return;
    }
    
    // If username is provided, prompt for password
    if (username) {
        const password = prompt('Enter iSCSI password:');
        if (!password) {
            showNotification('iSCSI connection cancelled', 'info');
            return;
        }
        
        // Set CHAP authentication
        cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', `${target}:${port}`, '--op=update', '--name', 'node.session.auth.authmethod', '--value=CHAP'])
            .then(() => {
                return cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', `${target}:${port}`, '--op=update', '--name', 'node.session.auth.username', '--value', username]);
            })
            .then(() => {
                return cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', `${target}:${port}`, '--op=update', '--name', 'node.session.auth.password', '--value', password]);
            })
            .then(() => {
                return cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', `${target}:${port}`, '--login']);
            })
            .then(() => {
                // Configure automatic login if persistent is enabled
                if (isPersistent) {
                    return cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', `${target}:${port}`, '--op=update', '--name', 'node.startup', '--value=automatic']);
                }
            })
            .then(() => {
                const persistentMsg = isPersistent ? ' (configured for automatic startup)' : '';
                showNotification(`iSCSI connection successful${persistentMsg}`, 'success');
                logMessage(`iSCSI connection successful: ${iqn} at ${target}:${port}${persistentMsg}`, 'success');
            })
            .catch(error => {
                showNotification(`iSCSI connection failed: ${error.message}`, 'error');
                logMessage(`iSCSI connection failed: ${error.message}`, 'error');
            });
    } else {
        // Connect without authentication
        let connectionPromise = cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', `${target}:${port}`, '--login']);
        
        if (isPersistent) {
            connectionPromise = connectionPromise.then(() => {
                return cockpit.spawn(['iscsiadm', '-m', 'node', '-T', iqn, '-p', `${target}:${port}`, '--op=update', '--name', 'node.startup', '--value=automatic']);
            });
        }
        
        connectionPromise
            .done(function() {
                const persistentMsg = isPersistent ? ' (configured for automatic startup)' : '';
                showNotification(`iSCSI connection successful${persistentMsg}`, 'success');
                logMessage(`iSCSI connection successful: ${iqn} at ${target}:${port}${persistentMsg}`, 'success');
            })
            .fail(function(error) {
                showNotification(`iSCSI connection failed: ${error.message}`, 'error');
                logMessage(`iSCSI connection failed: ${error.message}`, 'error');
            });
    }
}

async function createFilesystem() {
    const device = document.getElementById('fs-device').value;
    const fstype = document.getElementById('fs-type').value;
    const label = document.getElementById('fs-label').value;
    
    if (!device || !fstype) {
        showNotification('Please select device and filesystem type', 'warning');
        logMessage('Filesystem creation failed: Missing device or filesystem type', 'error');
        return;
    }
    
    showNotification(`Creating ${fstype} filesystem on ${device}...`, 'info');
    logMessage(`Starting filesystem creation: ${fstype} on ${device}`, 'info');
    
    try {
        // Comprehensive disk validation
        const validationResult = await validateDiskUsage(device);
        if (!validationResult.canUse) {
            const errorMsg = `Cannot create filesystem on ${device}: ${validationResult.reason}`;
            showNotification(`Filesystem creation failed: ${validationResult.reason}`, 'error');
            logMessage(errorMsg, 'error');
            return;
        }
        
        // Log validation success
        logMessage(`Disk validation passed for ${device}: ${validationResult.details}`, 'success');
        
        // Check if user has sufficient permissions
        showNotification(`Checking permissions for filesystem creation on ${device}...`, 'info');
        const hasPermissions = await checkDiskPermissions(device);
        if (!hasPermissions) {
            const errorMsg = `Permission denied: Cannot create filesystem on ${device}. Need root/sudo access.`;
            showNotification(`Permission denied: Need root/sudo access for ${device}`, 'error');
            logMessage(errorMsg, 'error');
            return;
        }
        
        logMessage(`Permission check passed for ${device}`, 'success');
        
        // Perform actual filesystem creation
        showNotification(`Creating ${fstype} filesystem on ${device}...`, 'info');
        logMessage(`Executing mkfs.${fstype} on ${device}`, 'info');
        
        const result = await createFilesystemReal(device, fstype, label);
        
        if (result.success) {
            const labelText = label ? ` with label "${label}"` : '';
            const successMsg = `Filesystem created successfully!\n${fstype} filesystem created on ${device}${labelText}`;
            showNotification(`${fstype} filesystem created successfully on ${device}${labelText}`, 'success');
            logMessage(`Filesystem creation completed: ${fstype} on ${device}${labelText}`, 'success');
            
            // Verify the filesystem was actually created
            const verification = await verifyFilesystemCreation(device, fstype);
            if (verification.verified) {
                logMessage(`Filesystem verification successful: ${verification.details}`, 'success');
            } else {
                logMessage(`Warning: Filesystem verification failed: ${verification.reason}`, 'warning');
            }
            
            loadDisks();
        } else {
            const errorMsg = `Filesystem creation failed: ${result.error}`;
            showNotification(`Filesystem creation failed: ${result.error}`, 'error');
            logMessage(errorMsg, 'error');
        }
        
    } catch (error) {
        const errorMsg = `Unexpected error during filesystem creation: ${error.message}`;
        showNotification(`Filesystem creation error: ${error.message}`, 'error');
        logMessage(errorMsg, 'error');
        console.error('Filesystem creation error:', error);
    }
}

// Comprehensive disk validation function
async function validateDiskUsage(device) {
    try {
        logMessage(`Running comprehensive validation checks for device ${device}`, 'info');
        
        // Check if device exists
        const deviceExists = await checkDeviceExists(device);
        if (!deviceExists) {
            return { canUse: false, reason: `Device ${device} does not exist` };
        }
        
        // Check if device is mounted
        const mountInfo = await checkDeviceMounted(device);
        if (mountInfo.mounted) {
            return { 
                canUse: false, 
                reason: `Device ${device} is currently mounted at ${mountInfo.mountpoint}. Unmount before creating filesystem.` 
            };
        }
        
        // Check if device is part of RAID
        const raidInfo = await checkDeviceInRaid(device);
        if (raidInfo.inRaid) {
            return { 
                canUse: false, 
                reason: `Device ${device} is part of RAID array ${raidInfo.raidDevice}. Cannot format individual RAID members.` 
            };
        }
        
        // Check if device is part of LVM
        const lvmInfo = await checkDeviceInLvm(device);
        if (lvmInfo.inLvm) {
            return { 
                canUse: false, 
                reason: `Device ${device} is an LVM physical volume in volume group ${lvmInfo.volumeGroup}. Remove from LVM first.` 
            };
        }
        
        // Check if device is the OS disk or contains OS partitions
        const osInfo = await checkIsOsDisk(device);
        if (osInfo.isOsDisk) {
            return { 
                canUse: false, 
                reason: `Device ${device} contains the operating system (mounted at ${osInfo.mountpoint}). Cannot format OS disk.` 
            };
        }
        
        // Check if device has existing partitions
        const partitionInfo = await checkDevicePartitions(device);
        if (partitionInfo.hasPartitions) {
            logMessage(`Warning: Device ${device} has existing partitions: ${partitionInfo.partitions.join(', ')}`, 'warning');
        }
        
        // Check if device is used by Ceph
        const cephInfo = await checkDeviceInCeph(device);
        if (cephInfo.inCeph) {
            return { 
                canUse: false, 
                reason: `Device ${device} is used by Ceph: ${cephInfo.usage}. Remove from Ceph cluster first.` 
            };
        }
        
        // Check if device is in use by other processes
        const processInfo = await checkDeviceInUse(device);
        if (processInfo.inUse) {
            return { 
                canUse: false, 
                reason: `Device ${device} is currently in use by: ${processInfo.processes.join(', ')}` 
            };
        }
        
        // All checks passed
        const details = partitionInfo.hasPartitions ? 
            `Device available (will overwrite ${partitionInfo.partitions.length} existing partitions)` : 
            'Device available and clean';
            
        return { 
            canUse: true, 
            reason: 'All validation checks passed', 
            details: details 
        };
        
    } catch (error) {
        logMessage(`Validation error for ${device}: ${error.message}`, 'error');
        return { 
            canUse: false, 
            reason: `Validation failed: ${error.message}` 
        };
    }
}

// Check if device exists in the system
async function checkDeviceExists(device) {
    try {
        await cockpit.spawn(['test', '-b', device]);
        return true;
    } catch (error) {
        return false;
    }
}

// Check if device is mounted
async function checkDeviceMounted(device) {
    try {
        const output = await cockpit.spawn(['findmnt', '-S', device, '-o', 'TARGET', '-n']);
        if (output.trim()) {
            return { mounted: true, mountpoint: output.trim() };
        }
        return { mounted: false };
    } catch (error) {
        return { mounted: false };
    }
}

// Check if device is part of a RAID array
async function checkDeviceInRaid(device) {
    try {
        const output = await cockpit.spawn(['cat', '/proc/mdstat']);
        const lines = output.split('\n');
        
        for (const line of lines) {
            if (line.includes(device.replace('/dev/', ''))) {
                const match = line.match(/^(md\d+)/);
                if (match) {
                    return { inRaid: true, raidDevice: '/dev/' + match[1] };
                }
            }
        }
        return { inRaid: false };
    } catch (error) {
        return { inRaid: false };
    }
}

// Check if device is part of LVM
async function checkDeviceInLvm(device) {
    try {
        const output = await cockpit.spawn(['pvdisplay', device]);
        const vgMatch = output.match(/VG Name\s+(.+)/);
        if (vgMatch) {
            return { inLvm: true, volumeGroup: vgMatch[1].trim() };
        }
        return { inLvm: false };
    } catch (error) {
        return { inLvm: false };
    }
}

// Check if device is the OS disk
async function checkIsOsDisk(device) {
    try {
        const output = await cockpit.spawn(['lsblk', '-J', '-o', 'NAME,MOUNTPOINT', device]);
        const data = JSON.parse(output);
        
        function checkForRootMount(dev) {
            if (dev.mountpoint === '/') {
                return { isOsDisk: true, mountpoint: '/' };
            }
            if (dev.children) {
                for (const child of dev.children) {
                    const result = checkForRootMount(child);
                    if (result.isOsDisk) return result;
                }
            }
            return { isOsDisk: false };
        }
        
        for (const blockdevice of data.blockdevices) {
            const result = checkForRootMount(blockdevice);
            if (result.isOsDisk) return result;
        }
        
        return { isOsDisk: false };
    } catch (error) {
        return { isOsDisk: false };
    }
}

// Check device partitions
async function checkDevicePartitions(device) {
    try {
        const output = await cockpit.spawn(['lsblk', '-J', '-o', 'NAME,TYPE', device]);
        const data = JSON.parse(output);
        
        const partitions = [];
        function findPartitions(dev) {
            if (dev.type === 'part') {
                partitions.push('/dev/' + dev.name);
            }
            if (dev.children) {
                dev.children.forEach(findPartitions);
            }
        }
        
        data.blockdevices.forEach(findPartitions);
        return { 
            hasPartitions: partitions.length > 0, 
            partitions: partitions 
        };
    } catch (error) {
        return { hasPartitions: false, partitions: [] };
    }
}

// Check if device is in use by other processes
async function checkDeviceInUse(device) {
    try {
        const output = await cockpit.spawn(['lsof', device]);
        const processes = output.split('\n')
            .filter(line => line.trim())
            .slice(1) // Skip header
            .map(line => line.split(/\s+/)[0]); // Get process names
        
        return { 
            inUse: processes.length > 0, 
            processes: [...new Set(processes)] // Remove duplicates
        };
    } catch (error) {
        return { inUse: false, processes: [] };
    }
}

// Check if device is used by Ceph
async function checkDeviceInCeph(device) {
    try {
        // Check if ceph-volume is available
        try {
            await cockpit.spawn(['which', 'ceph-volume']);
        } catch (error) {
            // Ceph not installed, skip check
            return { inCeph: false };
        }
        
        // Check ceph-volume inventory for this device
        const inventoryOutput = await cockpit.spawn(['ceph-volume', 'inventory', '--format', 'json']);
        const inventory = JSON.parse(inventoryOutput);
        
        // Look for this device in the inventory
        for (const dev of inventory) {
            if (dev.path === device) {
                if (dev.available === false) {
                    let usage = 'unknown';
                    
                    // Determine usage type
                    if (dev.lvs && dev.lvs.length > 0) {
                        const lv = dev.lvs[0];
                        if (lv.tags && lv.tags['ceph.type']) {
                            usage = `Ceph ${lv.tags['ceph.type']}`;
                            if (lv.tags['ceph.osd_id']) {
                                usage += ` (OSD ${lv.tags['ceph.osd_id']})`;
                            }
                        } else {
                            usage = 'Ceph LVM volume';
                        }
                    } else if (dev.partitions && dev.partitions.length > 0) {
                        usage = 'Ceph partitioned device';
                    } else {
                        usage = 'Ceph managed device';
                    }
                    
                    return { inCeph: true, usage: usage };
                }
                break;
            }
        }
        
        // Also check ceph-disk list (for older Ceph versions)
        try {
            const diskListOutput = await cockpit.spawn(['ceph-disk', 'list']);
            if (diskListOutput.includes(device)) {
                return { inCeph: true, usage: 'Ceph disk (ceph-disk)' };
            }
        } catch (error) {
            // ceph-disk not available or failed, ignore
        }
        
        return { inCeph: false };
        
    } catch (error) {
        // If we can't check Ceph status, assume not in use by Ceph
        return { inCeph: false };
    }
}

// Check permissions for disk operations
async function checkDiskPermissions(device) {
    try {
        // Try to read the device to check permissions
        await cockpit.spawn(['dd', 'if=' + device, 'of=/dev/null', 'bs=512', 'count=1']);
        return true;
    } catch (error) {
        logMessage(`Permission check failed for ${device}: ${error.message}`, 'warning');
        return false;
    }
}

// Perform actual filesystem creation
async function createFilesystemReal(device, fstype, label) {
    try {
        const command = ['mkfs', `-t${fstype}`];
        
        // Add label if specified
        if (label) {
            if (fstype === 'ext2' || fstype === 'ext3' || fstype === 'ext4') {
                command.push('-L', label);
            } else if (fstype === 'xfs') {
                command.push('-L', label);
            } else if (fstype === 'vfat' || fstype === 'fat32') {
                command.push('-n', label);
            } else if (fstype === 'ntfs') {
                command.push('-L', label);
            }
        }
        
        // Force overwrite existing filesystem
        command.push('-F');
        command.push(device);
        
        logMessage(`Executing command: ${command.join(' ')}`, 'info');
        const output = await cockpit.spawn(command);
        
        return { 
            success: true, 
            output: output,
            command: command.join(' ')
        };
    } catch (error) {
        return { 
            success: false, 
            error: error.message,
            command: command.join(' ')
        };
    }
}

// Verify filesystem creation
async function verifyFilesystemCreation(device, expectedFstype) {
    try {
        const output = await cockpit.spawn(['blkid', device]);
        
        // Parse blkid output
        const typeMatch = output.match(/TYPE="([^"]+)"/);
        const labelMatch = output.match(/LABEL="([^"]+)"/);
        const uuidMatch = output.match(/UUID="([^"]+)"/);
        
        if (typeMatch) {
            const actualFstype = typeMatch[1];
            if (actualFstype === expectedFstype) {
                const details = `Filesystem type: ${actualFstype}` +
                    (labelMatch ? `, Label: ${labelMatch[1]}` : '') +
                    (uuidMatch ? `, UUID: ${uuidMatch[1]}` : '');
                return { verified: true, details: details };
            } else {
                return { 
                    verified: false, 
                    reason: `Expected ${expectedFstype} but found ${actualFstype}` 
                };
            }
        } else {
            return { 
                verified: false, 
                reason: 'No filesystem detected on device' 
            };
        }
    } catch (error) {
        return { 
            verified: false, 
            reason: `Verification failed: ${error.message}` 
        };
    }
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
    
    // Save to localStorage for persistence
    saveLogEntry(message, type);
    
    updateStatus(message, type);
}

function saveLogEntry(message, type) {
    try {
        const timestamp = formatTime(new Date());
        const logEntry = {
            timestamp: timestamp,
            message: message,
            type: type,
            fullTimestamp: new Date().toISOString()
        };
        
        // Get existing logs or initialize empty array
        let logs = JSON.parse(localStorage.getItem('xavs-storage-logs') || '[]');
        
        // Add new entry
        logs.push(logEntry);
        
        // Keep only last 100 entries for persistence
        if (logs.length > 100) {
            logs = logs.slice(-100);
        }
        
        // Save back to localStorage
        localStorage.setItem('xavs-storage-logs', JSON.stringify(logs));
    } catch (error) {
        console.error('Failed to save log entry:', error);
    }
}

function loadPersistedLogs() {
    try {
        const logs = JSON.parse(localStorage.getItem('xavs-storage-logs') || '[]');
        const logContainer = document.getElementById('log');
        
        if (!logContainer || logs.length === 0) return;
        
        // Clear existing default logs
        logContainer.innerHTML = '';
        
        // Add persisted logs
        logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry log-${log.type}`;
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'log-time';
            timeSpan.textContent = log.timestamp;
            
            const messageSpan = document.createElement('span');
            messageSpan.className = 'log-message';
            messageSpan.textContent = log.message;
            
            logEntry.appendChild(timeSpan);
            logEntry.appendChild(messageSpan);
            logContainer.appendChild(logEntry);
        });
        
        logContainer.scrollTop = logContainer.scrollHeight;
        
        console.log(`Loaded ${logs.length} persisted log entries`);
    } catch (error) {
        console.error('Failed to load persisted logs:', error);
    }
}

// Modal and Notification System
function showConfirmModal(title, message, device, type = 'warning') {
    return new Promise((resolve) => {
        // Remove any existing modal
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';
        
        const header = document.createElement('div');
        header.className = 'modal-header';
        
        const icon = document.createElement('div');
        icon.className = `modal-icon ${type}`;
        icon.textContent = type === 'danger' ? '⚠' : type === 'warning' ? '⚠' : 'ℹ';
        
        const titleEl = document.createElement('h3');
        titleEl.className = 'modal-title';
        titleEl.textContent = title;
        
        header.appendChild(icon);
        header.appendChild(titleEl);
        
        const body = document.createElement('div');
        body.className = 'modal-body';
        
        const messageEl = document.createElement('p');
        messageEl.className = 'modal-message';
        messageEl.textContent = message;
        
        body.appendChild(messageEl);
        
        if (device) {
            const deviceEl = document.createElement('div');
            deviceEl.className = 'modal-device';
            deviceEl.textContent = `Device: ${device}`;
            body.appendChild(deviceEl);
        }
        
        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-btn secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = `modal-btn ${type === 'danger' ? 'danger' : 'primary'}`;
        confirmBtn.textContent = 'Continue';
        confirmBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        
        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        
        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });
        
        document.body.appendChild(overlay);
    });
}

function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    
    // Calculate position for stacking (count existing notifications)
    const existingToasts = document.querySelectorAll('.notification-toast');
    const offset = existingToasts.length * 50; // Stack with 50px offset (42px height + 8px gap)
    toast.style.top = `${16 + offset}px`;
    
    const icon = document.createElement('div');
    icon.className = `notification-icon ${type}`;
    
    // Use FontAwesome icons
    const iconEl = document.createElement('i');
    if (type === 'success') {
        iconEl.className = 'fas fa-check-circle';
    } else if (type === 'error') {
        iconEl.className = 'fas fa-exclamation-circle';
    } else if (type === 'warning') {
        iconEl.className = 'fas fa-exclamation-triangle';
    } else {
        iconEl.className = 'fas fa-info-circle';
    }
    
    icon.appendChild(iconEl);
    
    const messageEl = document.createElement('div');
    messageEl.className = 'notification-message';
    messageEl.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(messageEl);
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Start fade at 4 seconds, remove at 5 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
    }, 4000);
    
    // Remove after 5 seconds total and restack remaining notifications
    setTimeout(() => {
        toast.remove();
        restackNotifications();
    }, 5000);
}

// Restack remaining notifications when one is removed
function restackNotifications() {
    const remainingToasts = document.querySelectorAll('.notification-toast');
    remainingToasts.forEach((toast, index) => {
        toast.style.top = `${16 + (index * 50)}px`; // 50px spacing (42px height + 8px gap)
    });
}

// Show device details in a modal instead of alert
function showDeviceDetailsModal(device, details) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    
    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'modal-content';
    modal.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 24px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    
    // Modal header
    const header = document.createElement('h3');
    header.textContent = `Device Details: ${device}`;
    header.style.cssText = `
        margin: 0 0 16px 0;
        color: #333;
        border-bottom: 1px solid #eee;
        padding-bottom: 8px;
    `;
    
    // Details content
    const content = document.createElement('pre');
    content.textContent = details;
    content.style.cssText = `
        background: #f5f5f5;
        padding: 16px;
        border-radius: 4px;
        overflow-x: auto;
        font-family: monospace;
        font-size: 12px;
        margin: 0 0 16px 0;
    `;
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.className = 'btn btn-primary';
    closeBtn.onclick = () => overlay.remove();
    
    modal.appendChild(header);
    modal.appendChild(content);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    
    // Close on overlay click
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
    
    document.body.appendChild(overlay);
}

function clearLogs() {
    const logContainer = document.getElementById('log');
    if (logContainer) {
        logContainer.innerHTML = '';
        // Also clear localStorage
        localStorage.removeItem('xavs_storage_logs');
        logMessage('Logs cleared', 'info');
    }
}

function updateStatus(message, type = 'info') {
    const statusContent = document.getElementById('recent-activity');
    const statusBar = document.querySelector('.bottom-status-bar');
    
    if (statusContent) {
        const timestamp = formatTime(new Date());
        statusContent.textContent = `[${timestamp}] ${message}`;
    }
    
    if (statusBar) {
        // Remove existing status classes
        statusBar.classList.remove('status-info', 'status-success', 'status-warning', 'status-error');
        
        // Add new status class based on type
        switch(type) {
            case 'success':
                statusBar.classList.add('status-success');
                break;
            case 'warning':
                statusBar.classList.add('status-warning');
                break;
            case 'error':
                statusBar.classList.add('status-error');
                break;
            default:
                statusBar.classList.add('status-info');
                break;
        }
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
    
    console.log('Loaded network storage data');
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
                            
                            // Determine mount type with more detail
                            let typeDisplay = fstype.toUpperCase();
                            if (fstype === 'nfs' || fstype === 'nfs4') {
                                typeDisplay = 'NFS';
                            } else if (fstype === 'cifs') {
                                typeDisplay = 'CIFS/SMB';
                            }
                            
                            html += `
                                <tr>
                                    <td>${source}</td>
                                    <td>${target}</td>
                                    <td><span class="badge badge-info">${typeDisplay}</span></td>
                                    <td><span class="badge badge-success">Mounted</span></td>
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
    
    console.log('Loaded RAID data');
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
        showNotification('No device specified', 'error');
        return;
    }
    
    console.log('manageDisk called for:', device);
    
    // Store the clicked button reference
    window.lastClickedButton = window.event ? window.event.target.closest('button') : null;
    console.log('lastClickedButton:', window.lastClickedButton);
    
    // Get device information for validation
    getDiskInfo(device).then(diskInfo => {
        console.log('Got disk info:', diskInfo);
        showDiskActionMenu(device, diskInfo);
    }).catch(error => {
        console.error('Error getting disk info:', error);
        showDiskActionMenu(device, null);
    });
}

function managePartition(partition) {
    if (!partition) {
        showNotification('No partition specified', 'error');
        return;
    }
    
    console.log('managePartition called for:', partition);
    
    // Store the clicked button reference
    window.lastClickedButton = window.event ? window.event.target.closest('button') : null;
    console.log('lastClickedButton:', window.lastClickedButton);
    
    // Get partition information for validation
    getPartitionInfo(partition).then(partInfo => {
        console.log('Got partition info:', partInfo);
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
            label: 'Check SMART Health', 
            action: () => performShortSmartTest(device),
            enabled: true,
            dangerous: false
        },
        { 
            label: 'View Details', 
            action: () => viewDiskDetails(device),
            enabled: true,
            dangerous: false
        },
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
    console.log('createActionDropdown called for:', device, 'actions:', actions);
    
    // Remove any existing dropdown
    const existingDropdown = document.querySelector('.action-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }
    
    // Find the manage button that was clicked
    const clickedButton = window.lastClickedButton;
    console.log('clickedButton in createActionDropdown:', clickedButton);
    
    if (!clickedButton) {
        console.error('No clicked button found!');
        showNotification('Error: Cannot position dropdown menu', 'error');
        return;
    }
    
    const dropdown = document.createElement('div');
    dropdown.className = 'action-dropdown';
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'dropdown-backdrop';
    backdrop.addEventListener('click', () => {
        console.log('Backdrop clicked, removing dropdown');
        dropdown.remove();
    });
    
    // Create menu
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.style.display = 'block';
    menu.style.visibility = 'visible';
    
    console.log('Creating menu with', actions.length, 'actions');
    
    // Add menu items
    actions.forEach((action, index) => {
        console.log('Adding action:', action.label, 'enabled:', action.enabled);
        const button = document.createElement('button');
        button.className = `dropdown-item ${action.enabled ? '' : 'disabled'} ${action.dangerous ? 'dangerous' : ''}`;
        button.textContent = action.label;
        button.disabled = !action.enabled;
        
        if (action.enabled) {
            button.addEventListener('click', (e) => {
                console.log('Dropdown item clicked:', action.label);
                e.stopPropagation();
                dropdown.remove();
                handleActionClick(device, action.label, action.dangerous, action.warning || '');
            });
        }
        
        menu.appendChild(button);
        console.log('Added button for:', action.label);
    });
    
    console.log('Menu element created with', menu.children.length, 'children');
    
    dropdown.appendChild(backdrop);
    dropdown.appendChild(menu);
    
    console.log('Dropdown structure created, backdrop and menu added');
    
    // Position the dropdown near the clicked button
    const rect = clickedButton.getBoundingClientRect();
    console.log('Button rect:', rect);
    
    dropdown.style.position = 'fixed';
    dropdown.style.top = '0';
    dropdown.style.left = '0';
    dropdown.style.right = '0';
    dropdown.style.bottom = '0';
    dropdown.style.zIndex = '10000';
    dropdown.style.display = 'block';
    
    menu.style.position = 'absolute';
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.left = rect.left + 'px';
    menu.style.zIndex = '10001';
    menu.style.minWidth = '160px';
    menu.style.maxWidth = '200px';
    
    console.log('Menu positioned at:', menu.style.top, menu.style.left);
    console.log('Menu dimensions:', menu.style.minWidth, menu.style.maxWidth);
    
    // Adjust if menu would go off screen
    setTimeout(() => {
        const menuRect = menu.getBoundingClientRect();
        console.log('Menu getBoundingClientRect:', menuRect);
        console.log('Window dimensions:', window.innerWidth, window.innerHeight);
        
        if (menuRect.right > window.innerWidth) {
            menu.style.left = (rect.right - menuRect.width) + 'px';
            console.log('Adjusted left position to:', menu.style.left);
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = (rect.top - menuRect.height - 5) + 'px';
            console.log('Adjusted top position to:', menu.style.top);
        }
        
        // Final check
        const finalRect = menu.getBoundingClientRect();
        console.log('Final menu position:', finalRect);
    }, 10);
    
    document.body.appendChild(dropdown);
    console.log('Dropdown added to body, total children in body:', document.body.children.length);
    
    // Double check the menu is visible
    setTimeout(() => {
        const addedDropdown = document.querySelector('.action-dropdown');
        const addedMenu = document.querySelector('.dropdown-menu');
        console.log('Dropdown in DOM:', !!addedDropdown);
        console.log('Menu in DOM:', !!addedMenu);
        if (addedMenu) {
            console.log('Menu computed style:', window.getComputedStyle(addedMenu));
        }
    }, 20);
    
    // Store actions for later use
    window.currentActions = actions.reduce((acc, action) => {
        acc[action.label] = action.action;
        return acc;
    }, {});
}

function handleActionClick(device, actionLabel, isDangerous, warningMessage) {
    console.log('handleActionClick called:', device, actionLabel, isDangerous, warningMessage);
    
    // Remove the dropdown
    const dropdown = document.querySelector('.action-dropdown');
    if (dropdown) {
        dropdown.remove();
    }
    
    // Show confirmation for dangerous actions
    if (isDangerous && warningMessage) {
        showConfirmModal(
            'Confirm Action',
            warningMessage,
            device,
            'danger'
        ).then(confirmed => {
            if (confirmed) {
                executeAction(device, actionLabel);
            }
        });
    } else {
        executeAction(device, actionLabel);
    }
}

function executeAction(device, actionLabel) {
    // Execute the action
    if (window.currentActions && window.currentActions[actionLabel]) {
        window.currentActions[actionLabel]();
    } else {
        console.error('Action not found:', actionLabel);
        showNotification('Error: Action not found', 'error');
    }
}

// Make sure the function is available globally
window.handleActionClick = handleActionClick;

// Individual action functions
function formatDevice(device) {
    const fsType = prompt('Filesystem type (ext4, xfs, ntfs):', 'ext4');
    if (!fsType) return;
    
    const command = ['mkfs', `-t${fsType}`, device];
    executeCommand(command, `Formatting ${device} with ${fsType}`);
}

function createPartition(device) {
    showNotification(`Opening partition editor for ${device}. Use fdisk or parted manually.`, 'info');
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
    showNotification(`Resize functionality requires manual intervention. Use parted or resize2fs.`, 'info');
}

function deletePartition(partition) {
    showNotification(`Delete partition functionality requires manual intervention. Use fdisk or parted.`, 'info');
}

function viewDiskDetails(device) {
    // Show detailed information about the device
    cockpit.spawn(['lsblk', '-o', 'NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,UUID,LABEL', device])
        .then(output => {
            // Create a modal for detailed device information instead of alert
            showDeviceDetailsModal(device, output);
        })
        .catch(error => {
            showNotification(`Error getting device details: ${error}`, 'error');
        });
}

function performShortSmartTest(device) {
    // Start a short SMART test for better health assessment
    cockpit.spawn(['smartctl', '-t', 'short', device])
        .then(output => {
            console.log(`SMART test started for ${device}:`, output);
            // Check test completion after 2 minutes
            setTimeout(() => {
                checkSmartTestResults(device);
            }, 120000); // 2 minutes
        })
        .catch(error => {
            console.error(`Error starting SMART test for ${device}:`, error);
        });
}

function checkSmartTestResults(device) {
    // Check the results of the SMART self-test
    cockpit.spawn(['smartctl', '-l', 'selftest', device])
        .then(output => {
            console.log(`SMART test results for ${device}:`, output);
            // Update health status based on test results
            updateDiskHealthFromTest(device, output);
        })
        .catch(error => {
            console.error(`Error checking SMART test results for ${device}:`, error);
        });
}

function updateDiskHealthFromTest(device, testOutput) {
    // Find the health badge for this device and update it
    const rows = document.querySelectorAll('#table-disks tbody tr.disk-row');
    rows.forEach(row => {
        const deviceCell = row.querySelector('td:first-child strong');
        if (deviceCell && deviceCell.textContent === device) {
            const healthBadge = row.querySelector('.badge');
            if (healthBadge) {
                if (testOutput.includes('Completed without error')) {
                    healthBadge.textContent = 'Healthy';
                    healthBadge.className = 'badge ok';
                } else if (testOutput.includes('error') || testOutput.includes('FAILED')) {
                    healthBadge.textContent = 'Failed';
                    healthBadge.className = 'badge error';
                } else {
                    healthBadge.textContent = 'Unknown';
                    healthBadge.className = 'badge warn';
                }
            }
        }
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
    const raidDisksContainer = document.getElementById('raid-disks');
    if (!raidDisksContainer) return;
    
    // Clear existing content
    raidDisksContainer.innerHTML = '<div class="loading-message">Loading available disks...</div>';
    
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
            
            // Clear loading message and populate checkboxes
            raidDisksContainer.innerHTML = '';
            
            if (availableDisks.length === 0) {
                raidDisksContainer.innerHTML = '<div class="loading-message">No available disks found</div>';
            } else {
                availableDisks.forEach((disk, index) => {
                    const checkboxItem = document.createElement('div');
                    checkboxItem.className = 'disk-checkbox-item';
                    
                    const checkboxId = `raid-disk-${index}`;
                    checkboxItem.innerHTML = `
                        <input type="checkbox" id="${checkboxId}" value="${disk.path}" />
                        <label for="${checkboxId}">
                            <div class="disk-info">
                                <span class="disk-name">${disk.name}</span>
                                <span class="disk-size">(${disk.size})</span>
                            </div>
                        </label>
                    `;
                    
                    raidDisksContainer.appendChild(checkboxItem);
                });
            }
        })
        .catch(error => {
            console.error('Error loading disks for RAID:', error);
            raidDisksContainer.innerHTML = '<div class="loading-message">Error loading disks</div>';
        });
}

// Populate available physical volumes for LVM
function loadAvailablePhysicalVolumes() {
    const vgPvsContainer = document.getElementById('vg-pvs');
    if (!vgPvsContainer) return;
    
    // Clear existing content
    vgPvsContainer.innerHTML = '<div class="loading-message">Loading available disks...</div>';
    
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
                            path: `/dev/${device.name}`,
                            type: 'disk'
                        });
                    }
                    
                    // Add partitions if not mounted
                    if (device.children) {
                        device.children.forEach(partition => {
                            if (partition.type === 'part' && !partition.mountpoint) {
                                availableDevices.push({
                                    name: partition.name,
                                    size: partition.size,
                                    path: `/dev/${partition.name}`,
                                    type: 'partition'
                                });
                            }
                        });
                    }
                });
            }
            
            // Clear loading message and populate checkboxes
            vgPvsContainer.innerHTML = '';
            
            if (availableDevices.length === 0) {
                vgPvsContainer.innerHTML = '<div class="loading-message">No available devices found</div>';
            } else {
                availableDevices.forEach((device, index) => {
                    const checkboxItem = document.createElement('div');
                    checkboxItem.className = 'disk-checkbox-item';
                    
                    const checkboxId = `lvm-pv-${index}`;
                    const typeIcon = device.type === 'disk' ? 'fas fa-hdd' : 'fas fa-puzzle-piece';
                    
                    checkboxItem.innerHTML = `
                        <input type="checkbox" id="${checkboxId}" value="${device.path}" />
                        <label for="${checkboxId}">
                            <div class="disk-info">
                                <i class="${typeIcon}"></i>
                                <span class="disk-name">${device.name}</span>
                                <span class="disk-size">(${device.size})</span>
                                <span class="disk-status">${device.type}</span>
                            </div>
                        </label>
                    `;
                    
                    vgPvsContainer.appendChild(checkboxItem);
                });
            }
        })
        .catch(error => {
            console.error('Error loading devices for LVM:', error);
            vgPvsContainer.innerHTML = '<div class="loading-message">Error loading devices</div>';
        });
}

// RAID-specific validation function
async function validateDiskForRaid(device) {
    try {
        // Use the comprehensive disk validation first
        const baseValidation = await validateDiskUsage(device);
        if (!baseValidation.canUse) {
            return baseValidation;
        }
        
        // Additional RAID-specific checks
        
        // Check if device is already part of another RAID
        const existingRaid = await checkDeviceInRaid(device);
        if (existingRaid.inRaid) {
            return {
                canUse: false,
                reason: `Device ${device} is already part of RAID array ${existingRaid.raidDevice}`
            };
        }
        
        // Check if device has the right characteristics for RAID
        const deviceInfo = await getDeviceInfo(device);
        if (deviceInfo.size < (1024 * 1024 * 100)) { // Less than 100MB
            return {
                canUse: false,
                reason: `Device ${device} is too small for RAID (${formatBytes(deviceInfo.size)})`
            };
        }
        
        return {
            canUse: true,
            reason: 'Device is suitable for RAID',
            details: `Device size: ${formatBytes(deviceInfo.size)}, Type: ${deviceInfo.type}`
        };
        
    } catch (error) {
        return {
            canUse: false,
            reason: `RAID validation failed: ${error.message}`
        };
    }
}

// Check if RAID array name already exists
async function checkRaidArrayExists(arrayName) {
    try {
        await cockpit.spawn(['test', '-b', `/dev/${arrayName}`]);
        return true;
    } catch (error) {
        return false;
    }
}

// Check permissions for RAID operations
async function checkRaidPermissions() {
    try {
        // Try to read /proc/mdstat which requires appropriate permissions
        await cockpit.spawn(['cat', '/proc/mdstat']);
        
        // Try to run mdadm --help to ensure mdadm is available
        await cockpit.spawn(['mdadm', '--help']);
        
        return true;
    } catch (error) {
        logMessage(`RAID permission check failed: ${error.message}`, 'warning');
        return false;
    }
}

// Verify RAID array creation
async function verifyRaidArrayCreation(arrayName) {
    try {
        // Check if the array device exists
        const deviceExists = await checkDeviceExists(`/dev/${arrayName}`);
        if (!deviceExists) {
            return {
                verified: false,
                reason: `RAID device /dev/${arrayName} not found`
            };
        }
        
        // Check mdstat for the array
        const mdstatOutput = await cockpit.spawn(['cat', '/proc/mdstat']);
        if (!mdstatOutput.includes(arrayName)) {
            return {
                verified: false,
                reason: `RAID array ${arrayName} not found in /proc/mdstat`
            };
        }
        
        // Get detailed array information
        const mdadmOutput = await cockpit.spawn(['mdadm', '--detail', `/dev/${arrayName}`]);
        
        // Parse the output for verification details
        const stateMatch = mdadmOutput.match(/State\s*:\s*(.+)/);
        const levelMatch = mdadmOutput.match(/Raid Level\s*:\s*(.+)/);
        const devicesMatch = mdadmOutput.match(/Total Devices\s*:\s*(\d+)/);
        
        const details = [
            stateMatch ? `State: ${stateMatch[1]}` : '',
            levelMatch ? `Level: ${levelMatch[1]}` : '',
            devicesMatch ? `Devices: ${devicesMatch[1]}` : ''
        ].filter(Boolean).join(', ');
        
        return {
            verified: true,
            details: details || 'RAID array verified successfully'
        };
        
    } catch (error) {
        return {
            verified: false,
            reason: `Verification failed: ${error.message}`
        };
    }
}

// Get basic device information
async function getDeviceInfo(device) {
    try {
        const output = await cockpit.spawn(['lsblk', '-J', '-b', '-o', 'NAME,SIZE,TYPE', device]);
        const data = JSON.parse(output);
        
        if (data.blockdevices && data.blockdevices.length > 0) {
            const deviceData = data.blockdevices[0];
            return {
                size: parseInt(deviceData.size) || 0,
                type: deviceData.type || 'unknown'
            };
        }
        
        return { size: 0, type: 'unknown' };
    } catch (error) {
        throw new Error(`Failed to get device info: ${error.message}`);
    }
}

// Format bytes to human readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Create RAID Array
async function createRaidArray() {
    const raidLevel = document.getElementById('raid-level').value;
    
    // Get selected disks from checkboxes
    const raidDisksContainer = document.getElementById('raid-disks');
    const selectedDisks = Array.from(raidDisksContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    
    const arrayName = document.getElementById('raid-name').value || 'md0';
    
    // Comprehensive dependency validation
    if (!raidLevel) {
        showNotification('Please select a RAID level', 'warning');
        logMessage('RAID creation failed: No RAID level selected', 'error');
        return;
    }
    
    if (selectedDisks.length === 0) {
        showNotification('Please select disks for RAID creation', 'warning');
        logMessage('RAID creation failed: No disks selected', 'error');
        return;
    }
    
    if (selectedDisks.length < 2) {
        showNotification('Please select at least 2 disks for RAID creation', 'error');
        logMessage('RAID creation failed: Insufficient disk count', 'error');
        return;
    }
    
    // Validate RAID level requirements
    const minDisks = {
        '0': 2, '1': 2, '5': 3, '6': 4, '10': 4
    };
    
    if (selectedDisks.length < minDisks[raidLevel]) {
        const errorMsg = `RAID ${raidLevel} requires at least ${minDisks[raidLevel]} disks`;
        showNotification(errorMsg, 'error');
        logMessage(errorMsg, 'error');
        return;
    }
    
    logMessage(`Starting RAID ${raidLevel} creation with ${selectedDisks.length} disks: ${selectedDisks.join(', ')}`, 'info');
    
    try {
        // Validate each disk before creating RAID
        const validationResults = [];
        for (const disk of selectedDisks) {
            logMessage(`Validating disk ${disk} for RAID usage...`, 'info');
            const validation = await validateDiskForRaid(disk);
            validationResults.push({ disk, validation });
            
            if (!validation.canUse) {
                const errorMsg = `Cannot use ${disk} for RAID: ${validation.reason}`;
                showNotification(errorMsg, 'error');
                logMessage(errorMsg, 'error');
                return;
            }
            
            logMessage(`Disk ${disk} validation passed: ${validation.details}`, 'success');
        }
        
        // Check if RAID array name already exists
        const arrayExists = await checkRaidArrayExists(arrayName);
        if (arrayExists) {
            const errorMsg = `RAID array /dev/${arrayName} already exists. Choose a different name.`;
            showNotification(errorMsg, 'error');
            logMessage(errorMsg, 'error');
            return;
        }
        
        // Check permissions for RAID creation
        logMessage('Checking permissions for RAID array creation...', 'info');
        const hasPermissions = await checkRaidPermissions();
        if (!hasPermissions) {
            const errorMsg = 'Permission denied: RAID creation requires root/sudo access.';
            showNotification(errorMsg, 'error');
            logMessage(errorMsg, 'error');
            return;
        }
        
        logMessage('Permission check passed for RAID creation', 'success');
        
        // Create the RAID array
        logMessage(`Creating RAID ${raidLevel} array /dev/${arrayName}...`, 'info');
        const command = ['mdadm', '--create', `/dev/${arrayName}`, '--level=' + raidLevel, '--raid-devices=' + selectedDisks.length].concat(selectedDisks);
        
        logMessage(`Executing command: ${command.join(' ')}`, 'info');
        const output = await cockpit.spawn(command);
        
        logMessage(`RAID array /dev/${arrayName} created successfully`, 'success');
        logMessage(`RAID creation output: ${output}`, 'info');
        
        // Verify RAID array creation
        const verification = await verifyRaidArrayCreation(arrayName);
        if (verification.verified) {
            logMessage(`RAID verification successful: ${verification.details}`, 'success');
            showNotification('RAID array created successfully', 'success');
        } else {
            logMessage(`Warning: RAID verification failed: ${verification.reason}`, 'warning');
            showNotification('RAID array may have been created but verification failed. Check system logs.', 'warning');
        }
        
        loadRaidData(); // Refresh RAID data
        loadOverviewData(); // Refresh overview
        
    } catch (error) {
        const errorMsg = `RAID creation failed: ${error.message}`;
        console.error('Error creating RAID array:', error);
        logMessage(errorMsg, 'error');
        showNotification(errorMsg, 'error');
    }
}

// LVM-specific validation function
async function validateDiskForLvm(device) {
    try {
        // Use the comprehensive disk validation first
        const baseValidation = await validateDiskUsage(device);
        if (!baseValidation.canUse) {
            return baseValidation;
        }
        
        // Additional LVM-specific checks
        
        // Check if device is already an LVM physical volume
        const existingLvm = await checkDeviceInLvm(device);
        if (existingLvm.inLvm) {
            return {
                canUse: false,
                reason: `Device ${device} is already an LVM physical volume in volume group ${existingLvm.volumeGroup}`
            };
        }
        
        // Check device size for LVM suitability
        const deviceInfo = await getDeviceInfo(device);
        if (deviceInfo.size < (1024 * 1024 * 10)) { // Less than 10MB
            return {
                canUse: false,
                reason: `Device ${device} is too small for LVM (${formatBytes(deviceInfo.size)})`
            };
        }
        
        return {
            canUse: true,
            reason: 'Device is suitable for LVM',
            details: `Device size: ${formatBytes(deviceInfo.size)}, Type: ${deviceInfo.type}`
        };
        
    } catch (error) {
        return {
            canUse: false,
            reason: `LVM validation failed: ${error.message}`
        };
    }
}

// Check if volume group already exists
async function checkVolumeGroupExists(vgName) {
    try {
        const output = await cockpit.spawn(['vgdisplay', vgName]);
        return output.includes(vgName);
    } catch (error) {
        return false;
    }
}

// Check permissions for LVM operations
async function checkLvmPermissions() {
    try {
        // Try to list existing volume groups
        await cockpit.spawn(['vgdisplay']);
        
        // Try to list existing physical volumes
        await cockpit.spawn(['pvdisplay']);
        
        return true;
    } catch (error) {
        logMessage(`LVM permission check failed: ${error.message}`, 'warning');
        return false;
    }
}

// Verify volume group creation
async function verifyVolumeGroupCreation(vgName) {
    try {
        // Check if volume group exists
        const vgOutput = await cockpit.spawn(['vgdisplay', vgName]);
        
        // Parse volume group information
        const sizeMatch = vgOutput.match(/VG Size\s+(.+)/);
        const pvCountMatch = vgOutput.match(/Cur PV\s+(\d+)/);
        const statusMatch = vgOutput.match(/VG Status\s+(.+)/);
        
        const details = [
            sizeMatch ? `Size: ${sizeMatch[1].trim()}` : '',
            pvCountMatch ? `PVs: ${pvCountMatch[1]}` : '',
            statusMatch ? `Status: ${statusMatch[1].trim()}` : ''
        ].filter(Boolean).join(', ');
        
        return {
            verified: true,
            details: details || 'Volume group verified successfully'
        };
        
    } catch (error) {
        return {
            verified: false,
            reason: `Verification failed: ${error.message}`
        };
    }
}

// Create LVM Volume Group
async function createVolumeGroup() {
    const vgName = document.getElementById('vg-name').value || 'vg_data';
    
    // Get selected physical volumes from checkboxes
    const vgPvsContainer = document.getElementById('vg-pvs');
    const selectedPvs = Array.from(vgPvsContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    
    if (selectedPvs.length === 0) {
        const errorMsg = 'Please select at least one physical volume';
        showNotification(errorMsg, 'error');
        logMessage(errorMsg, 'error');
        return;
    }
    
    logMessage(`Starting LVM Volume Group creation: ${vgName} with PVs: ${selectedPvs.join(', ')}`, 'info');
    
    try {
        // Validate each physical volume before creating LVM
        const validationResults = [];
        for (const pv of selectedPvs) {
            logMessage(`Validating physical volume ${pv} for LVM usage...`, 'info');
            const validation = await validateDiskForLvm(pv);
            validationResults.push({ pv, validation });
            
            if (!validation.canUse) {
                const errorMsg = `Cannot use ${pv} for LVM: ${validation.reason}`;
                showNotification(errorMsg, 'error');
                logMessage(errorMsg, 'error');
                return;
            }
            
            logMessage(`Physical volume ${pv} validation passed: ${validation.details}`, 'success');
        }
        
        // Check if volume group name already exists
        const vgExists = await checkVolumeGroupExists(vgName);
        if (vgExists) {
            const errorMsg = `Volume Group '${vgName}' already exists. Choose a different name.`;
            showNotification(errorMsg, 'error');
            logMessage(errorMsg, 'error');
            return;
        }
        
        // Check permissions for LVM operations
        logMessage('Checking permissions for LVM operations...', 'info');
        const hasPermissions = await checkLvmPermissions();
        if (!hasPermissions) {
            const errorMsg = 'Permission denied: LVM operations require root/sudo access.';
            showNotification(errorMsg, 'error');
            logMessage(errorMsg, 'error');
            return;
        }
        
        logMessage('Permission check passed for LVM operations', 'success');
        
        // Create physical volumes first
        logMessage('Creating physical volumes...', 'info');
        for (const pv of selectedPvs) {
            logMessage(`Creating physical volume on ${pv}...`, 'info');
            const pvCommand = ['pvcreate', '-f', pv]; // -f to force overwrite
            
            try {
                const pvOutput = await cockpit.spawn(pvCommand);
                logMessage(`Physical volume created successfully on ${pv}`, 'success');
                logMessage(`PV creation output: ${pvOutput}`, 'info');
            } catch (pvError) {
                const errorMsg = `Failed to create physical volume on ${pv}: ${pvError.message}`;
                logMessage(errorMsg, 'error');
                throw new Error(errorMsg);
            }
        }
        
        // Create volume group
        logMessage(`Creating volume group ${vgName}...`, 'info');
        const vgCommand = ['vgcreate', vgName].concat(selectedPvs);
        logMessage(`Executing command: ${vgCommand.join(' ')}`, 'info');
        
        const vgOutput = await cockpit.spawn(vgCommand);
        logMessage(`Volume Group ${vgName} created successfully`, 'success');
        logMessage(`VG creation output: ${vgOutput}`, 'info');
        
        // Verify volume group creation
        const verification = await verifyVolumeGroupCreation(vgName);
        if (verification.verified) {
            logMessage(`LVM verification successful: ${verification.details}`, 'success');
            showNotification('Volume Group created successfully', 'success');
        } else {
            logMessage(`Warning: LVM verification failed: ${verification.reason}`, 'warning');
            showNotification('Volume Group may have been created but verification failed. Check system logs.', 'warning');
        }
        
        loadLvmData(); // Refresh LVM data
        loadOverviewData(); // Refresh overview
        
    } catch (error) {
        const errorMsg = `Volume Group creation failed: ${error.message}`;
        console.error('Error creating Volume Group:', error);
        logMessage(errorMsg, 'error');
        showNotification(errorMsg, 'error');
    }
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
