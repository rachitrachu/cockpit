/*!
 * xDeploy Checks - Cockpit Module
 * System validation and preparation for Xloud xDeploy (OpenStack) deployment
 * 
 * Features:
 * - System overview with real-time status monitoring
 * - Hardware validation against xDeploy requirements  
 * - Automated dependency installation and management
 * - Cross-tab logging with persistence
 * - Support for Debian/Ubuntu and RHEL/Rocky/CentOS/Fedora
 * 
 * Structure:
 * - Utility Functions (DOM helpers, logging, UI updates)
 * - System Information (OS detection, hardware checks, status monitoring)
 * - Dependency Management (detection, installation, verification)
 * - Event Handlers and Initialization
 * 
 * @version 1.0.0
 * @author Xloud Technologies
 */

/* global cockpit */

(() => {
    'use strict';

    //  helpers 
    const $  = (id) => document.getElementById(id);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    
    // Simple notification helper
    const showNotification = (message, type = 'info') => {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" style="margin-left: 10px; background: none; border: none; cursor: pointer;"></button>
        `;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 100;
            padding: 12px 16px; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            background: white; border: 1px solid #d1d5db; max-width: 400px;
        `;
        
        if (type === 'error') {
            notification.style.background = '#fef2f2';
            notification.style.borderColor = '#fecaca';
            notification.style.color = '#dc2626';
        } else if (type === 'success') {
            notification.style.background = '#f0fdf4';
            notification.style.borderColor = '#bbf7d0';
            notification.style.color = '#16a34a';
        }
        
        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, 5000);
    };
    
    const setBadge = (id, cls, text) => {
        const el = $(id);
        if (!el) return;
        el.className = "badge " + (cls || "");
        
        if (text && text.includes('<i class="fas')) {
            el.innerHTML = text;
        } else {
            el.textContent = text || "";
        }
        
        // Update card visual state
        const card = el.closest('.dep-card');
        if (card) {
            card.className = card.className.replace(/dep-(ready|error|warning|working)/g, '');
            if (cls === "ok") card.classList.add('dep-ready');
            else if (cls === "err") card.classList.add('dep-error');
            else if (cls === "warn") card.classList.add('dep-warning');
            else if (text === "" || text.includes('fa-clock')) card.classList.add('dep-working');
        }
    };
    const setText = (id, text) => {
        const el = $(id);
        if (el) {
            if (text.includes('<i class="fas')) {
                el.innerHTML = text;
            } else {
                el.textContent = text;
            }
        }
    };
    const setTextWithSpinner = (id, text) => {
        const el = $(id);
        if (el) {
            el.innerHTML = '<span class="spinner"></span>' + text;
            el.className = "status-working";
        }
    };
    const setTextSuccess = (id, text) => {
        const el = $(id);
        if (el) {
            if (text.includes('<i class="fas')) {
                el.innerHTML = text;
            } else {
                el.textContent = text;
            }
            el.className = "status-success";
        }
    };
    const setTextError = (id, text) => {
        const el = $(id);
        if (el) {
            if (text.includes('<i class="fas')) {
                el.innerHTML = text;
            } else {
                el.textContent = text;
            }
            el.className = "status-error";
        }
    };
    const pb = (id, v) => {
        const el = $(id);
        if (el) el.style.width = Math.max(0, Math.min(100, v)) + "%";
    };
    const logEl = $("log");
    const log = (t="", type = 'info') => {
        if (!logEl) return;
        
        const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        // Create log entry element
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.innerHTML = `
            <span class="log-time">${timestamp}</span>
            <span class="log-message">${t}</span>
        `;
        
        logEl.appendChild(logEntry);
        
        // Auto-scroll to bottom
        logEl.scrollTop = logEl.scrollHeight;
        
        // Update status bar (strip HTML for status bar)
        const statusElement = $('recent-activity');
        if (statusElement) {
            const cleanText = t.replace(/<[^>]*>/g, '').trim() || "Ready";
            statusElement.textContent = `${timestamp} - ${cleanText}`;
            
            // Update status bar color coding
            const statusBar = document.querySelector('.bottom-status-bar');
            if (statusBar) {
                // Remove existing status classes
                statusBar.classList.remove('status-info', 'status-success', 'status-warning', 'status-error');
                
                // Add appropriate status class for color coding
                const statusClass = type === 'success' ? 'status-success' : 
                                   type === 'warning' ? 'status-warning' : 
                                   type === 'error' ? 'status-error' : 'status-info';
                statusBar.classList.add(statusClass);
            }
        }
        
        // Store logs for persistence across tabs (localStorage for better cross-tab sync)
        try {
            const logData = { timestamp, message: t, type };
            const existingLogs = JSON.parse(localStorage.getItem('xavs-bootstrap-logs') || '[]');
            existingLogs.push(logData);
            
            // Keep only last 50 entries
            if (existingLogs.length > 50) {
                existingLogs.shift();
            }
            
            localStorage.setItem('xavs-bootstrap-logs', JSON.stringify(existingLogs));
        } catch (e) {
            console.warn('Could not store logs:', e);
        }
    };
    
    // Load existing logs from storage on page load
    const loadStoredLogs = () => {
        try {
            let storedLogs = localStorage.getItem('xavs-bootstrap-logs');
            
            if (storedLogs) {
                const logEntries = JSON.parse(storedLogs);
                const logElement = $("log");
                if (logElement) {
                    // Clear existing logs
                    logElement.innerHTML = '';
                    
                    // Add each stored log entry
                    logEntries.forEach(entry => {
                        const logEntry = document.createElement('div');
                        logEntry.className = `log-entry log-${entry.type || 'info'}`;
                        logEntry.innerHTML = `
                            <span class="log-time">${entry.timestamp}</span>
                            <span class="log-message">${entry.message}</span>
                        `;
                        logElement.appendChild(logEntry);
                    });
                    
                    logElement.scrollTop = logElement.scrollHeight;
                } else {
                    // Retry after a short delay if element not ready
                    setTimeout(loadStoredLogs, 100);
                }
            } else {
                // No stored logs found - add initial log
                const logElement = $("log");
                if (logElement && logElement.children.length === 0) {
                    log("Bootstrap system initialized", "info");
                }
            }
        } catch (e) {
            console.warn('Could not load logs from storage:', e);
            // Add initial log on error
            const logElement = $("log");
            if (logElement && logElement.children.length === 0) {
                log("Bootstrap system initialized", "info");
            }
        }
    };

    // Continuously sync logs between tabs every 2 seconds
    const startLogSync = () => {
        // Listen for storage changes from other tabs (more efficient than polling)
        window.addEventListener('storage', (e) => {
            if (e.key === 'xavs-bootstrap-logs' && e.newValue) {
                try {
                    const logEntries = JSON.parse(e.newValue);
                    const logElement = $("log");
                    if (logElement) {
                        // Clear and rebuild log display
                        logElement.innerHTML = '';
                        logEntries.forEach(entry => {
                            const logEntry = document.createElement('div');
                            logEntry.className = `log-entry log-${entry.type || 'info'}`;
                            logEntry.innerHTML = `
                                <span class="log-time">${entry.timestamp}</span>
                                <span class="log-message">${entry.message}</span>
                            `;
                            logElement.appendChild(logEntry);
                        });
                        logElement.scrollTop = logElement.scrollHeight;
                    }
                } catch (e) {
                    console.warn('Could not sync logs:', e);
                }
            }
        });

        // Fallback polling for sessionStorage (storage event only works for localStorage)
        setInterval(() => {
            if ($("log")) { // Only sync if log element exists
                loadStoredLogs();
            }
        }, 2000); // Check every 2 seconds
    };

    //  tab management 
    let currentPanel = 'panel-overview';
    const links = $$('#tabs .nav-link');
    
    function showPanel(panelId) {
        if (panelId === currentPanel) return;
        
        // Hide all panels first
        $$('.tab-pane').forEach(p => {
            p.classList.remove('active', 'show');
            p.setAttribute('aria-hidden', 'true');
        });
        
        // Deactivate all nav links
        $$('.nav-link').forEach(a => a.classList.remove('active'));
        
        // Show target panel
        const panel = $(panelId);
        const link = links.find(a => a.dataset.target === panelId);
        
        if (panel) {
            // Add active class first
            panel.classList.add('active');
            // Then add show class after a brief delay for transition
            setTimeout(() => panel.classList.add('show'), 50);
            panel.setAttribute('aria-hidden', 'false');
        }
        
        if (link) {
            link.classList.add('active');
        }

        currentPanel = panelId;
    }

    // Wire up tab clicks
    links.forEach(a => a.addEventListener('click', (e) => {
        e.preventDefault();
        const targetPanel = a.dataset.target;
        showPanel(targetPanel);
        
        // Run checks when switching to these tabs
        if (targetPanel === 'panel-hw')   runHardwareChecks().catch(console.error);
        // Removed auto-check for dependencies - user must click "Check Dependencies"
    }));

    // Wire up status bar link
    const statusLink = document.querySelector('.status-link');
    if (statusLink) {
        statusLink.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = statusLink.dataset.tab;
            if (targetTab) {
                showPanel(targetTab);
            }
        });
    }

    //  OS Detection 
    let osInfo = {
        name: "Unknown",
        id: "",
        like: "",
        version: "",
        kernel: "",
        isXOS: false,
        branch: "unknown"
    };

    async function detectOS() {
        try {
            setText("os-name", "Detecting");
            log("[OS] Starting OS detection...", "info");
            
            const out = await cockpit.spawn([
                "bash", "-c", 
                "source /etc/os-release 2>/dev/null; echo \"$NAME|$ID|$ID_LIKE|$VERSION_ID\""
            ]);
            const ker = await cockpit.spawn(["uname", "-r"]);
            
            const [name, id, like, ver] = (out.trim() || "Unknown|||").split("|");
            osInfo = {
                name: name || "Unknown",
                id: id || "",
                like: like || "",
                version: ver || "",
                kernel: ker.trim(),
                isXOS: /xos/i.test(name) || /xos/i.test(id),
                branch: "unknown"
            };

            // Determine OS branch
            if (/debian|ubuntu/i.test(osInfo.id) || /debian|ubuntu/i.test(osInfo.like)) {
                osInfo.branch = "debian";
            } else if (/rhel|rocky|centos|almalinux|fedora/i.test(osInfo.id) || /rhel|rocky|centos|almalinux|fedora/i.test(osInfo.like)) {
                osInfo.branch = "rhel";
            }

            // Update UI
            setText("os-name", osInfo.name + (osInfo.version ? " " + osInfo.version : ""));
            setText("os-kernel", osInfo.kernel);
            setText("os-branch", osInfo.branch === "debian" ? "Debian/Ubuntu" : 
                               osInfo.branch === "rhel" ? "RHEL/Rocky/CentOS/Fedora" : "Unknown");
            setText("os-mode", osInfo.isXOS ? "XOS: hardware-only checks" : "Standard: HW + packages");

            // Update XOS banner visibility
            const banner = $("xos-reco");
            if (banner) banner.style.display = osInfo.isXOS ? "none" : "";

            // Update Dependencies UI state
            setText("dep-branch", osInfo.isXOS ? "XOS (skips packages)" : 
                                osInfo.branch === "debian" ? "Debian/Ubuntu" :
                                osInfo.branch === "rhel" ? "RHEL/Rocky/CentOS/Fedora" : "Unknown");

            const depGrid = $("dep-grid");
            const installBtn = $("btn-install-all");
            const checkBtn = $("btn-check-deps");

            if (osInfo.isXOS) {
                if (depGrid) depGrid.style.opacity = "0.5";
                if (installBtn) installBtn.disabled = true;
                if (checkBtn) checkBtn.disabled = true;
                setText("dep-status", "Skipped on XOS");
            } else {
                if (depGrid) depGrid.style.opacity = "1";
                if (installBtn) installBtn.disabled = false;
                if (checkBtn) checkBtn.disabled = false;
                setText("dep-status", "");
            }

            log(`[OS] ${osInfo.name} (id=${osInfo.id}, like=${osInfo.like}) kernel=${osInfo.kernel} branch=${osInfo.branch} XOS=${osInfo.isXOS}`);
        } catch (error) {
            setText("os-name", "Detection Failed");
            setText("os-kernel", "");
            setText("os-branch", "");
            setText("os-mode", "");
            showNotification("OS detection failed: " + (error.message || error), 'error');
            log("[OS] Detection failed: " + (error.message || error), "error");
        }
    }

    //  Enhanced System Information Functions 
    async function refreshSystemStatus() {
        try {
            setText("sys-uptime", "Loading...");
            setText("sys-load", "Loading...");
            setText("sys-cpu", "Loading...");
            setText("sys-memory", "Loading...");
            
            log("[System] Refreshing system status information...");

            // Get uptime
            const uptime = await cockpit.spawn(["bash", "-c", "uptime -p 2>/dev/null || uptime | awk '{print $3\" \"$4}' | sed 's/,$//'"]);
            setText("sys-uptime", uptime.trim() || "");

            // Get load average
            const load = await cockpit.spawn(["bash", "-c", "uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//' || echo ''"]);
            setText("sys-load", load.trim() || "");

            // Get CPU usage (5-second average)
            const cpu = await cockpit.spawn(["bash", "-c", "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | sed 's/%us,//' || echo ''"]);
            setText("sys-cpu", cpu.trim() ? cpu.trim() + "%" : "");

            // Get memory usage
            const memory = await cockpit.spawn(["bash", "-c", "free -h | awk 'NR==2{printf \"%s / %s (%s)\", $3, $2, $5}'"]);
            setText("sys-memory", memory.trim() || "");

            log("[System] System status updated successfully", "success");
        } catch (error) {
            setText("sys-uptime", "Error");
            setText("sys-load", "Error");
            setText("sys-cpu", "Error");
            setText("sys-memory", "Error");
            log("[System] Failed to refresh system status: " + (error.message || error), "error");
        }
    }

    async function refreshStorageOverview() {
        try {
            setText("storage-root", "Loading...");
            setText("storage-disks", "Loading...");
            setText("storage-free", "Loading...");
            setText("storage-type", "Loading...");
            
            log("[Storage] Refreshing storage overview...");

            // Get root filesystem info - simple approach
            try {
                const rootSize = await cockpit.spawn(["bash", "-c", "df -h / | tail -1 | awk '{print $2}'"]);
                const rootUsed = await cockpit.spawn(["bash", "-c", "df -h / | tail -1 | awk '{print $5}'"]);
                setText("storage-root", (rootSize.trim() || "") + " (" + (rootUsed.trim() || "") + " used)");
            } catch {
                setText("storage-root", "");
            }

            // Count disks - simple approach
            try {
                const disks = await cockpit.spawn(["bash", "-c", "lsblk -d | grep disk | wc -l"]);
                setText("storage-disks", (disks.trim() || "0") + " disk(s)");
            } catch {
                setText("storage-disks", "");
            }

            // Total available space
            try {
                const free = await cockpit.spawn(["bash", "-c", "df -h / | tail -1 | awk '{print $4}'"]);
                setText("storage-free", free.trim() || "");
            } catch {
                setText("storage-free", "");
            }

            // Storage type detection
            try {
                const fstype = await cockpit.spawn(["bash", "-c", "df -T / | tail -1 | awk '{print $2}'"]);
                setText("storage-type", fstype.trim() || "unknown");
            } catch {
                try {
                    const fstype2 = await cockpit.spawn(["bash", "-c", "findmnt -n -o FSTYPE /"]);
                    setText("storage-type", fstype2.trim() || "unknown");
                } catch {
                    setText("storage-type", "unknown");
                }
            }

            log("[Storage] Storage overview updated successfully", "success");
        } catch (error) {
            setText("storage-root", "Error");
            setText("storage-disks", "Error");
            setText("storage-free", "Error");
            setText("storage-type", "Error");
            log("[Storage] Failed to refresh storage overview: " + (error.message || error));
        }
    }

    async function refreshNetworkOverview() {
        try {
            setText("net-interfaces", "Loading...");
            setText("net-connectivity", "Loading...");
            setText("net-primary-ip", "Loading...");
            setText("net-dns", "Loading...");
            
            log("[Network] Refreshing network overview...");

            // Count active interfaces
            const interfaces = await cockpit.spawn(["bash", "-c", "ip link show | grep -c 'state UP' || echo '0'"]);
            setText("net-interfaces", interfaces.trim() + " active");

            // Test connectivity
            try {
                await cockpit.spawn(["bash", "-c", "timeout 5 ping -c 1 8.8.8.8 >/dev/null 2>&1"]);
                setText("net-connectivity", '<i class="fas fa-check text-success"></i> Connected');
            } catch {
                setText("net-connectivity", '<i class="fas fa-times text-danger"></i> No internet');
            }

            // Get primary IP
            const primaryIp = await cockpit.spawn(["bash", "-c", "ip route get 8.8.8.8 2>/dev/null | awk 'NR==1{print $7}' || echo ''"]);
            setText("net-primary-ip", primaryIp.trim() || "");

            // Test DNS
            try {
                await cockpit.spawn(["bash", "-c", "timeout 3 nslookup google.com >/dev/null 2>&1"]);
                setText("net-dns", '<i class="fas fa-check text-success"></i> Working');
            } catch {
                setText("net-dns", '<i class="fas fa-times text-danger"></i> Failed');
            }

            log("[Network] Network overview updated successfully", "success");
        } catch (error) {
            setText("net-interfaces", "Error");
            setText("net-connectivity", "Error");
            setText("net-primary-ip", "Error");
            setText("net-dns", "Error");
            log("[Network] Failed to refresh network overview: " + (error.message || error));
        }
    }

    async function refreshHardwareDetails() {
        try {
            log("[Hardware] Refreshing detailed hardware information...");

            // CPU Information
            setText("cpu-model", "Loading...");
            setText("cpu-cores", "Loading...");
            setText("cpu-threads", "Loading...");
            setText("cpu-arch", "Loading...");
            setText("cpu-virt", "Loading...");

            const cpuModel = await cockpit.spawn(["bash", "-c", "lscpu | grep 'Model name' | cut -d':' -f2 | sed 's/^ *//' || echo ''"]);
            setText("cpu-model", cpuModel.trim() || "");

            const cpuCores = await cockpit.spawn(["bash", "-c", "lscpu | grep '^CPU(s):' | awk '{print $2}' || echo ''"]);
            setText("cpu-cores", cpuCores.trim() || "");

            const cpuThreads = await cockpit.spawn(["bash", "-c", "lscpu | grep 'Thread(s) per core' | awk '{print $4}' || echo ''"]);
            setText("cpu-threads", cpuThreads.trim() || "");

            const cpuArch = await cockpit.spawn(["bash", "-c", "lscpu | grep Architecture | cut -d':' -f2 | sed 's/^ *//' || echo ''"]);
            setText("cpu-arch", cpuArch.trim() || "");

            // Check for virtualization support
            try {
                const virtSupport = await cockpit.spawn(["bash", "-c", "lscpu | grep -i virtualization | cut -d':' -f2 | sed 's/^ *//' || echo 'Not supported'"]);
                setText("cpu-virt", virtSupport.trim() || "Not supported");
            } catch {
                setText("cpu-virt", "Not detected");
            }

            // Memory Information
            setText("mem-total", "Loading...");
            setText("mem-available", "Loading...");
            setText("mem-used", "Loading...");
            setText("mem-swap", "Loading...");

            const memTotal = await cockpit.spawn(["bash", "-c", "free -h | awk 'NR==2{print $2}'"]);
            setText("mem-total", memTotal.trim() || "");

            const memAvailable = await cockpit.spawn(["bash", "-c", "free -h | awk 'NR==2{print $7}'"]);
            setText("mem-available", memAvailable.trim() || "");

            const memUsed = await cockpit.spawn(["bash", "-c", "free -h | awk 'NR==2{print $3}'"]);
            setText("mem-used", memUsed.trim() || "");

            const memSwap = await cockpit.spawn(["bash", "-c", "free -h | awk 'NR==3{print $2}' | grep -v '^$' || echo 'None'"]);
            setText("mem-swap", memSwap.trim() || "None");

            // Storage Information
            setText("disk-rootfs", "Loading...");
            setText("disk-devices", "Loading...");
            setText("disk-vgs", "Loading...");
            setText("disk-mounts", "Loading...");

            const rootfsType = await cockpit.spawn(["bash", "-c", "findmnt -n -o FSTYPE / || echo ''"]);
            setText("disk-rootfs", rootfsType.trim() || "");

            const blockDevices = await cockpit.spawn(["bash", "-c", "lsblk -dn -o NAME,SIZE,TYPE | grep disk | wc -l"]);
            setText("disk-devices", blockDevices.trim() + " disk(s)");

            // Check for LVM volume groups
            try {
                const vgs = await cockpit.spawn(["bash", "-c", "vgs --noheadings -o vg_name 2>/dev/null | wc -l"]);
                setText("disk-vgs", vgs.trim() + " VG(s)");
            } catch {
                setText("disk-vgs", "LVM not available");
            }

            const mountCount = await cockpit.spawn(["bash", "-c", "mount | grep -v tmpfs | grep -v proc | grep -v sys | wc -l"]);
            setText("disk-mounts", mountCount.trim() + " mount(s)");

            // Network Information
            setText("net-active", "Loading...");
            setText("net-types", "Loading...");
            setText("net-ips", "Loading...");
            setText("net-gateway", "Loading...");

            const activeNics = await cockpit.spawn(["bash", "-c", "ip link show | grep -c 'state UP'"]);
            setText("net-active", activeNics.trim() || "0");

            const nicTypes = await cockpit.spawn(["bash", "-c", "ip link show | grep '^[0-9]' | awk '{print $2}' | cut -d':' -f1 | grep -v lo | head -3 | tr '\\n' ', ' | sed 's/,$//' || echo ''"]);
            setText("net-types", nicTypes.trim() || "");

            const ipAddresses = await cockpit.spawn(["bash", "-c", "ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -6 || echo ''"]);
            setText("net-ips", ipAddresses.trim() || "");

            const gateway = await cockpit.spawn(["bash", "-c", "ip route | grep default | awk '{print $3}' | head -1 || echo ''"]);
            setText("net-gateway", gateway.trim() || "");

            log("[Hardware] Hardware details updated successfully", "success");
        } catch (error) {
            log("[Hardware] Failed to refresh hardware details: " + (error.message || error));
        }
    }

    async function detectVirtualization() {
        try {
            setText("virt-type", "Loading...");
            setText("virt-platform", "Loading...");
            setText("virt-hypervisor", "Loading...");
            setText("virt-nested", "Loading...");
            
            log("[Virtualization] Detecting virtualization environment...");

            // Detect virtualization type
            try {
                const virtType = await cockpit.spawn(["bash", "-c", "systemd-detect-virt 2>/dev/null || echo 'none'"]);
                setText("virt-type", virtType.trim() === "none" ? "Physical/Bare Metal" : virtType.trim());
            } catch {
                setText("virt-type", "Unknown");
            }

            // Platform detection
            try {
                const platform = await cockpit.spawn(["bash", "-c", "dmidecode -s system-product-name 2>/dev/null | head -1 || echo ''"]);
                setText("virt-platform", platform.trim() || "");
            } catch {
                setText("virt-platform", "Access denied");
            }

            // Hypervisor detection
            try {
                const hypervisor = await cockpit.spawn(["bash", "-c", "lscpu | grep 'Hypervisor vendor' | cut -d':' -f2 | sed 's/^ *//' || echo 'None'"]);
                setText("virt-hypervisor", hypervisor.trim() || "None");
            } catch {
                setText("virt-hypervisor", "Not detected");
            }

            // Check nested virtualization support
            try {
                const nested = await cockpit.spawn(["bash", "-c", "cat /sys/module/kvm_*/parameters/nested 2>/dev/null | head -1 || echo 'N/A'"]);
                const nestedText = nested.trim() === "Y" ? '<i class="fas fa-check text-success"></i> Enabled' : 
                                 nested.trim() === "N" ? '<i class="fas fa-times text-danger"></i> Disabled' : "N/A";
                setText("virt-nested", nestedText);
            } catch {
                setText("virt-nested", "Not available");
            }

            log("[Virtualization] Virtualization detection completed");
        } catch (error) {
            setText("virt-type", "Error");
            setText("virt-platform", "Error");
            setText("virt-hypervisor", "Error");
            setText("virt-nested", "Error");
            log("[Virtualization] Failed to detect virtualization: " + (error.message || error));
        }
    }

    async function exportSystemInfo() {
        try {
            log("[Export] Generating system information export...");
            
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `xdeploy-system-info-${timestamp}.txt`;
            
            let systemInfo = `xDeploy System Information Export
Generated: ${new Date().toLocaleString()}
========================================

OPERATING SYSTEM:
- Distribution: ${$("os-name").textContent}
- Kernel: ${$("os-kernel").textContent}
- Package Manager: ${$("os-branch").textContent}
- xDeploy Mode: ${$("os-mode").textContent}

SYSTEM STATUS:
- Uptime: ${$("sys-uptime").textContent}
- Load Average: ${$("sys-load").textContent}
- CPU Usage: ${$("sys-cpu").textContent}
- Memory Usage: ${$("sys-memory").textContent}

STORAGE:
- Root Filesystem: ${$("storage-root").textContent}
- Total Disks: ${$("storage-disks").textContent}
- Available Space: ${$("storage-free").textContent}
- Storage Type: ${$("storage-type").textContent}

NETWORK:
- Interfaces: ${$("net-interfaces").textContent}
- Connectivity: ${$("net-connectivity").textContent}
- Primary IP: ${$("net-primary-ip").textContent}
- DNS Status: ${$("net-dns").textContent}

HARDWARE REQUIREMENTS:
- Root Space: ${$("chk-root").textContent}
- Network Interfaces: ${$("chk-nics").textContent}
- Additional Storage: ${$("chk-extra").textContent}
- CPU Cores: ${$("chk-cores").textContent}
- RAM: ${$("chk-ram").textContent}

========================================
End of Report
`;

            // Create and download the file
            const blob = new Blob([systemInfo], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            log("[Export] System information exported as " + filename, "success");
        } catch (error) {
            log("[Export] Failed to export system information: " + (error.message || error));
        }
    }

    //  Hardware Checks 
    async function runHardwareChecks() {
        // Reset badges
        ['root', 'nics', 'extra', 'cores', 'ram'].forEach(id => 
            setBadge(`chk-${id}`, "", '<i class="fas fa-clock text-warning"></i>')
        );
        setText("hw-summary", "Running hardware checks...");
        log("[HW] Starting hardware validation checks");

        try {
            // Check root space
            log("[HW] Checking root filesystem free space...");
            const df = await cockpit.spawn([
                "bash", "-c",
                "df -BG / | awk 'NR==2{gsub(\"G\",\"\",$4); print $4}'"
            ]);
            const freeSpace = parseInt(df.trim(), 10) || 0;
            setBadge("chk-root", freeSpace >= 100 ? "ok" : "err", `${freeSpace} GB`);

            // Check network interfaces
            log("[HW] Checking network interfaces...");
            const nc = await cockpit.spawn([
                "bash", "-c",
                "ls -1 /sys/class/net | grep -v '^lo$' | wc -l"
            ]);
            const nics = parseInt(nc.trim(), 10) || 0;
            setBadge("chk-nics", nics >= 2 ? "ok" : "err", String(nics));

            // Check for extra storage
            log("[HW] Checking for additional storage...");
            const storageCheck = 
                "rootdev=$(findmnt -n -o SOURCE / | sed 's/[0-9]*$//');" +
                "disks=$(lsblk -dn -o NAME,TYPE | awk '$2==\"disk\"{print \"/dev/\"$1}');" +
                "extra=0; for d in $disks; do " +
                "  if [ \"$d\" != \"$rootdev\" ]; then " +
                "    parts=$(lsblk -no NAME,MOUNTPOINT \"$d\" | tail -n +2 | awk 'NF');" +
                "    [ -z \"$parts\" ] && extra=1 && break;" +
                "  fi;" +
                "done;" +
                "if [ $extra -eq 0 ]; then " +
                "  if command -v vgs >/dev/null 2>&1; then " +
                "    vgs --noheadings -o vg_name,lv_count,vg_free | " +
                "    awk '($2==0)||($3!~/0B/){found=1} END{exit !(found)}' && " +
                "    echo YES || echo NO;" +
                "  else echo NO; fi;" +
                "else echo YES; fi";

            const extra = (await cockpit.spawn(["bash", "-c", storageCheck])).trim() === "YES";
            setBadge("chk-extra", extra ? "ok" : "warn", extra ? "Available" : "Not found");

            // Check CPU cores
            log("[HW] Checking CPU cores...");
            const cores = parseInt((await cockpit.spawn(["nproc"])).trim(), 10) || 0;
            setBadge("chk-cores", cores >= 4 ? "ok" : "err", String(cores));

            // Check RAM
            log("[HW] Checking memory...");
            const meminfo = await cockpit.spawn([
                "bash", "-c",
                "awk '/MemTotal/ {print int($2/1024/1024)}' /proc/meminfo"
            ]);
            const ramGB = parseInt(meminfo.trim(), 10) || 0;
            setBadge("chk-ram", ramGB >= 8 ? "ok" : "err", `${ramGB} GB`);

            // Summarize results
            const errors = ['root', 'nics', 'cores', 'ram']
                .filter(id => $(`chk-${id}`).className.includes("err"));
            const warnings = ['extra']
                .filter(id => $(`chk-${id}`).className.includes("warn"));

            let summary = "";
            if (errors.length === 0 && warnings.length === 0) {
                summary = '<i class="fas fa-check text-success"></i> All hardware requirements met!';
            } else {
                if (errors.length) {
                    summary += "Fix red items before proceeding. ";
                }
                if (warnings.length) {
                    summary += "Additional disk/VG not found  block storage won't be used; ephemeral only.";
                }
            }
            setText("hw-summary", summary);

            log(`[HW] Hardware check completed: root=${freeSpace}G nics=${nics} extra=${extra} cores=${cores} ram=${ramGB}G`);
        } catch (error) {
            setText("hw-summary", "Hardware check failed. See logs for details.");
            log("[HW] Hardware check failed: " + (error.message || error));
        }
    }

    //  Dependencies 
    let isRunningBulkInstall = false;  // Flag to prevent individual checks during bulk install
    
    async function checkDependencies() {
        log("[Deps] Check All button clicked - starting dependency check");
        
        if (osInfo.isXOS) {
            setText("dep-status", "Skipped on XOS");
            log("[Deps] Skipping dependency check on XOS system");
            return;
        }

        // Reset all badges to loading state
        ['dep-py', 'dep-tools', 'dep-env', 'dep-xdep', 'dep-oscli', 'dep-cfg', 'dep-pwd'].forEach(id => 
            setBadge(id, "", '<i class="fas fa-clock text-warning"></i>')
        );
        
        setTextWithSpinner("dep-status", "Checking dependencies...");
        log("[Deps] Starting dependency check for " + osInfo.branch + " system");
        log("[Deps] OS Info: " + JSON.stringify(osInfo));

        try {
            if (osInfo.branch === "debian") {
                await checkDebianDeps();
            } else if (osInfo.branch === "rhel") {
                await checkRHELDeps();
            } else {
                setTextError("dep-status", '<i class="fas fa-times text-danger"></i> Unknown OS - cannot check dependencies');
                log("[Deps] Unknown OS branch: " + osInfo.branch);
                return;
            }
            
            // Analyze results and provide summary
            const badges = ['dep-py', 'dep-tools', 'dep-env', 'dep-xdep', 'dep-oscli', 'dep-cfg', 'dep-pwd'];
            const errors = badges.filter(id => $(`${id}`).className.includes("err"));
            const warnings = badges.filter(id => $(`${id}`).className.includes("warn"));
            
            if (errors.length === 0 && warnings.length === 0) {
                setTextSuccess("dep-status", '<i class="fas fa-check text-success"></i> All dependencies ready!');
            } else if (errors.length === 0) {
                setText("dep-status", `<i class="fas fa-exclamation-triangle text-warning"></i> ${warnings.length} item(s) need attention`);
            } else {
                setTextError("dep-status", `<i class="fas fa-times text-danger"></i> ${errors.length} missing dependencies`);
            }
            
            log(`[Deps] Check completed - ${errors.length} errors, ${warnings.length} warnings`);
            
        } catch (error) {
            setTextError("dep-status", '<i class="fas fa-times text-danger"></i> Check failed');
            log("[Deps] Check failed: " + (error.message || error));
        }
    }

    async function checkDebianDeps() {
        const script = `
            # More fault-tolerant script - don't exit on first error
            step() { echo "[STEP] $1"; }
            
            # Python deps
            pkgs='git python3-dev python3-pip libffi-dev gcc libssl-dev python3-venv python3-docker'
            missing=$(dpkg-query -W -f='\${Status} \${Package}\\n' $pkgs 2>/dev/null | 
                     awk '$3!="installed"{print $5}') || true
            [ -z "$missing" ] && echo PY_OK || echo PY_MISS

            # System tools (checking representative packages from each installation step)
            # Step 1: Core monitoring/networking
            step1_tools='btop htop iftop nethogs iotop'
            missing_step1=$(dpkg-query -W -f='\${Status} \${Package}\\n' $step1_tools 2>/dev/null | 
                           awk '$3!="installed"{print $5}')
            
            # Step 2: Development tools  
            step2_tools='git curl wget vim nano'
            missing_step2=$(dpkg-query -W -f='\${Status} \${Package}\\n' $step2_tools 2>/dev/null | 
                           awk '$3!="installed"{print $5}')
            
            # Step 3: System services
            step3_tools='snmp snmpd bridge-utils build-essential'
            missing_step3=$(dpkg-query -W -f='\${Status} \${Package}\\n' $step3_tools 2>/dev/null | 
                           awk '$3!="installed"{print $5}')
            
            # Step 4: Storage/virtualization
            step4_tools='lvm2 parted docker.io'
            missing_step4=$(dpkg-query -W -f='\${Status} \${Package}\\n' $step4_tools 2>/dev/null | 
                           awk '$3!="installed"{print $5}')
            
            # Check if majority of representative packages are installed (at least 75%)
            total_checked=$(echo "$step1_tools $step2_tools $step3_tools $step4_tools" | wc -w)
            total_missing=$(echo "$missing_step1 $missing_step2 $missing_step3 $missing_step4" | wc -w)
            installed_count=$((total_checked - total_missing))
            threshold=$((total_checked * 3 / 4))  # 75% threshold
            
            [ $installed_count -ge $threshold ] && echo TOOLS_OK || echo TOOLS_MISS

            # Environment
            [ -d /opt/xenv ] && echo ENV_OK || echo ENV_MISS

            # OpenStack clients (check globally via pip3)
            python3 - <<'PY'
import sys
import subprocess

try:
    # Check if key OpenStack packages are installed globally via pip3
    result = subprocess.run(['pip3', 'list'], 
                          capture_output=True, text=True, check=True)
    pip_packages = result.stdout.lower()
    
    # Check for key client packages
    required_clients = [
        'python-openstackclient',
        'python-cinderclient', 
        'python-neutronclient',
        'python-keystoneclient'
    ]
    
    found_clients = []
    for client in required_clients:
        if client in pip_packages:
            found_clients.append(client)
    
    
    if len(found_clients) >= 3:  # At least 3 out of 4 key clients
        print("OSCLI_OK")
    else:
        print("OSCLI_MISS")
        
except Exception as e:
    print("OSCLI_MISS")
PY

            # xDeploy deps - comprehensive check
            if [ -x /opt/xenv/bin/python ]; then
                /opt/xenv/bin/python - <<'PY'
import pkgutil
import sys
import subprocess

# Initialize status tracking
components = {
    'ansible': False,
    'ansible_version': False, 
    'kolla_ansible': False,
    'requests': False,
    'urllib3': False,
    'docker': False,
    'collections': False
}

# Check ansible-core
try:
    import ansible
    components['ansible'] = True
    from packaging import version
    ansible_version = ansible.__version__
    components['ansible_version'] = version.parse(ansible_version) >= version.parse("2.15.0")
except Exception as e:
    pass

# Check kolla-ansible
try:
    import kolla_ansible
    components['kolla_ansible'] = True
except Exception:
    components['kolla_ansible'] = pkgutil.find_loader('kolla_ansible') is not None

# Check specific package versions
try:
    result = subprocess.run([sys.executable, '-m', 'pip', 'list'], capture_output=True, text=True, check=True)
    pip_output = result.stdout.lower()
    
    # Check for specific versions
    components['requests'] = 'requests' in pip_output and '2.31.0' in pip_output
    components['urllib3'] = 'urllib3' in pip_output and '1.26.20' in pip_output  
    components['docker'] = 'docker' in pip_output and '6.1.3' in pip_output
    
except Exception as e:
    pass

# Check ansible collections
try:
    result = subprocess.run(['ansible-galaxy', 'collection', 'list'], capture_output=True, text=True, check=True)
    collections_output = result.stdout.lower()
    # Basic check - if we have any collections listed, consider it working
    components['collections'] = len(collections_output.strip()) > 0 and 'community' in collections_output
except Exception as e:
    pass

# Determine overall status
critical_components = ['ansible', 'ansible_version', 'kolla_ansible']
all_critical = all(components[comp] for comp in critical_components)

# Check if partially installed
installed_count = sum(1 for comp in components.values() if comp)
total_count = len(components)


if all_critical and installed_count >= 5:  # At least 5/7 components working
    print('XDEP_OK')
elif installed_count >= 2:  # Some components installed but not complete
    print('XDEP_PARTIAL')
else:
    print('XDEP_MISS')
PY
            else
                echo XDEP_MISS
            fi

            # Config & passwords - comprehensive check
            config_status=0
            
            # Check basic directory structure
            [ -d /etc/xavs ] && config_status=$((config_status + 1))
            [ -L /etc/kolla ] && config_status=$((config_status + 1))
            
            # Check key configuration files
            [ -f /etc/xavs/globals.yml ] && config_status=$((config_status + 1))
            [ -f /etc/xavs/nodes ] && config_status=$((config_status + 1))
            
            # Check if kolla-ansible install-deps was run (collections available)
            if [ -x /opt/xenv/bin/ansible-galaxy ]; then
                /opt/xenv/bin/ansible-galaxy collection list >/dev/null 2>&1 && config_status=$((config_status + 1))
            fi
            
            
            if [ $config_status -ge 4 ]; then
                echo CFG_OK
            elif [ $config_status -ge 2 ]; then
                echo CFG_PARTIAL
            else
                echo CFG_MISS
            fi
            
            # Password check - verify file exists and contains actual passwords
            password_status=0
            
            # Check if password file exists
            if [ -f /etc/xavs/passwords.yml ]; then
                password_file="/etc/xavs/passwords.yml"
                password_status=$((password_status + 1))
            elif [ -f /etc/kolla/passwords.yml ]; then
                password_file="/etc/kolla/passwords.yml"
                password_status=$((password_status + 1))
            fi
            
            # If file exists, check if it contains actual generated passwords
            if [ $password_status -gt 0 ]; then
                # Check for key password entries that should be generated
                if grep -q "keystone_admin_password:" "$password_file" && \
                   grep -q "database_password:" "$password_file" && \
                   grep -q "rabbitmq_password:" "$password_file" && \
                   ! grep -q "keystone_admin_password: $" "$password_file"; then
                    password_status=$((password_status + 1))
                fi
            fi
            
            
            if [ $password_status -ge 2 ]; then
                echo PWD_OK
            elif [ $password_status -eq 1 ]; then
                echo PWD_PARTIAL
            else
                echo PWD_MISS
            fi
        `;

        try {
            log("[Deps:Debian] Checking Python packages, environment, and configuration...");
            log("[Deps:Debian] Executing dependency check script...");
            const out = await cockpit.spawn(["bash", "-c", script], { superuser: "try", err: "message" });
            log("[Deps:Debian] Script completed successfully");
            log("[Deps:Debian] Raw output: " + out);
            const results = out.trim().split("\n");
            log("[Deps:Debian] Parsed results: " + JSON.stringify(results));
            
            setBadge("dep-py",    results.includes("PY_OK")   ? "ok" : "err", results.includes("PY_OK")   ? '<i class="fas fa-check text-success"></i> installed' : '<i class="fas fa-times text-danger"></i> missing');
            setBadge("dep-tools", results.includes("TOOLS_OK") ? "ok" : "err", results.includes("TOOLS_OK") ? '<i class="fas fa-check text-success"></i> installed' : '<i class="fas fa-times text-danger"></i> missing');
            setBadge("dep-env",   results.includes("ENV_OK")  ? "ok" : "err", results.includes("ENV_OK")  ? '<i class="fas fa-check text-success"></i> present' : '<i class="fas fa-times text-danger"></i> missing');
            
            // Enhanced xDeploy status handling
            if (results.includes("XDEP_OK")) {
                setBadge("dep-xdep", "ok", '<i class="fas fa-check text-success"></i> ready');
            } else if (results.includes("XDEP_PARTIAL")) {
                setBadge("dep-xdep", "warn", '<i class="fas fa-exclamation-triangle text-warning"></i> partial');
                log("[Deps:Debian] xDeploy dependencies partially installed - please reinstall xDeploy Dependencies");
            } else {
                setBadge("dep-xdep", "err", '<i class="fas fa-times text-danger"></i> missing');
            }
            
            setBadge("dep-oscli", results.includes("OSCLI_OK") ? "ok" : "err", results.includes("OSCLI_OK") ? '<i class="fas fa-check text-success"></i> ready' : '<i class="fas fa-times text-danger"></i> missing');
            
            // Enhanced config status handling  
            if (results.includes("CFG_OK")) {
                setBadge("dep-cfg", "ok", '<i class="fas fa-check text-success"></i> ready');
            } else if (results.includes("CFG_PARTIAL")) {
                setBadge("dep-cfg", "warn", '<i class="fas fa-exclamation-triangle text-warning"></i> partial');
                log("[Deps:Debian] Configuration partially set up - please reinstall Configuration");
            } else {
                setBadge("dep-cfg", "err", '<i class="fas fa-times text-danger"></i> missing');
            }
            
            setBadge("dep-pwd",   
                results.includes("PWD_OK") ? "ok" : 
                results.includes("PWD_PARTIAL") ? "warn" : "warn", 
                results.includes("PWD_OK") ? '<i class="fas fa-check text-success"></i> ready' : 
                results.includes("PWD_PARTIAL") ? '<i class="fas fa-exclamation-triangle text-warning"></i> incomplete' : '<i class="fas fa-exclamation-triangle text-warning"></i> generate');
            
            // Log helpful message for partial password state
            if (results.includes("PWD_PARTIAL")) {
                log("[Deps:Debian] Password file exists but appears incomplete - please regenerate passwords");
            }
            
            log("[Deps:Debian] Check completed\n" + out.trim());
        } catch (error) {
            setTextError("dep-status", '<i class="fas fa-times text-danger"></i> Check failed');
            log("[Deps:Debian] Check failed with error: " + (error.message || error));
            log("[Deps:Debian] Error details: " + JSON.stringify(error));
            if (error.exit_status) {
                log("[Deps:Debian] Script exit status: " + error.exit_status);
            }
            if (error.stderr) {
                log("[Deps:Debian] Script stderr: " + error.stderr);
            }
            
            // Reset badges to error state
            ['dep-py', 'dep-tools', 'dep-env', 'dep-xdep', 'dep-oscli', 'dep-cfg', 'dep-pwd'].forEach(id => 
                setBadge(id, "err", '<i class="fas fa-times text-danger"></i> error')
            );
        }
    }

    async function checkRHELDeps() {
        const script = `
            # More fault-tolerant script - don't exit on first error
            step() { echo "[STEP] $1"; }
            
            # Python deps
            missing=$(rpm -q git python3-devel python3-pip libffi-devel gcc openssl-devel python3-libselinux 2>/dev/null |
                     awk '/is not installed/{print $1}') || true
            [ -z "$missing" ] && echo PY_OK || echo PY_MISS

            # System tools (checking representative packages from each installation step)
            # Step 1: Core monitoring/networking
            step1_tools='btop htop iftop nethogs iotop'
            missing_step1=$(rpm -q $step1_tools 2>/dev/null | awk '/is not installed/{print $1}')
            
            # Step 2: Development tools
            step2_tools='git curl wget vim nano'
            missing_step2=$(rpm -q $step2_tools 2>/dev/null | awk '/is not installed/{print $1}')
            
            # Step 3: System services  
            step3_tools='net-snmp net-snmp-utils bridge-utils'
            missing_step3=$(rpm -q $step3_tools 2>/dev/null | awk '/is not installed/{print $1}')
            
            # Check if majority of representative packages are installed (at least 75%)
            total_checked=$(echo "$step1_tools $step2_tools $step3_tools" | wc -w)
            total_missing=$(echo "$missing_step1 $missing_step2 $missing_step3" | wc -w)
            installed_count=$((total_checked - total_missing))
            threshold=$((total_checked * 3 / 4))  # 75% threshold
            
            [ $installed_count -ge $threshold ] && echo TOOLS_OK || echo TOOLS_MISS

            # OpenStack clients (check via pip globally on RHEL)
            python3 - <<'PY'
import sys
import subprocess

try:
    # Check if key OpenStack packages are installed via pip
    result = subprocess.run([sys.executable, '-m', 'pip', 'list'], 
                          capture_output=True, text=True, check=True)
    pip_packages = result.stdout.lower()
    
    # Check for key client packages
    required_clients = [
        'python-openstackclient',
        'python-cinderclient', 
        'python-neutronclient',
        'python-keystoneclient'
    ]
    
    found_clients = []
    for client in required_clients:
        if client in pip_packages:
            found_clients.append(client)
    
    
    if len(found_clients) >= 3:  # At least 3 out of 4 key clients
        print("OSCLI_OK")
    else:
        print("OSCLI_MISS")
        
except Exception as e:
    print("OSCLI_MISS")
PY

            echo ENV_NA

            # xDeploy deps - comprehensive check (same as Debian but for global pip3)
            python3 - <<'PY'
import pkgutil
import sys
import subprocess

# Initialize status tracking
components = {
    'ansible': False,
    'ansible_version': False, 
    'kolla_ansible': False,
    'requests': False,
    'urllib3': False,
    'docker': False,
    'collections': False
}

# Check ansible-core
try:
    import ansible
    components['ansible'] = True
    from packaging import version
    ansible_version = ansible.__version__
    components['ansible_version'] = version.parse(ansible_version) >= version.parse("2.15.0")
except Exception as e:

# Check kolla-ansible
try:
    import kolla_ansible
    components['kolla_ansible'] = True
except Exception:
    components['kolla_ansible'] = pkgutil.find_loader('kolla_ansible') is not None

# Check specific package versions (global pip3 for RHEL)
try:
    result = subprocess.run(['pip3', 'list'], capture_output=True, text=True, check=True)
    pip_output = result.stdout.lower()
    
    # Check for specific versions
    components['requests'] = 'requests' in pip_output and '2.31.0' in pip_output
    components['urllib3'] = 'urllib3' in pip_output and '1.26.20' in pip_output  
    components['docker'] = 'docker' in pip_output and '6.1.3' in pip_output
    
except Exception as e:

# Check ansible collections (global)
try:
    result = subprocess.run(['ansible-galaxy', 'collection', 'list'], capture_output=True, text=True, check=True)
    collections_output = result.stdout.lower()
    components['collections'] = len(collections_output.strip()) > 0 and 'community' in collections_output
except Exception as e:

# Determine overall status
critical_components = ['ansible', 'ansible_version', 'kolla_ansible']
all_critical = all(components[comp] for comp in critical_components)

# Check if partially installed
installed_count = sum(1 for comp in components.values() if comp)
total_count = len(components)


if all_critical and installed_count >= 5:  # At least 5/7 components working
    print('XDEP_OK')
elif installed_count >= 2:  # Some components installed but not complete
    print('XDEP_PARTIAL')
else:
    print('XDEP_MISS')
PY

            # Config & passwords - comprehensive check
            config_status=0
            
            # Check basic directory structure
            [ -d /etc/xavs ] && config_status=$((config_status + 1))
            [ -L /etc/kolla ] && config_status=$((config_status + 1))
            
            # Check key configuration files
            [ -f /etc/xavs/globals.yml ] && config_status=$((config_status + 1))
            [ -f /etc/xavs/nodes ] && config_status=$((config_status + 1))
            
            # Check if ansible-galaxy collections are available
            ansible-galaxy collection list >/dev/null 2>&1 && config_status=$((config_status + 1))
            
            
            if [ $config_status -ge 4 ]; then
                echo CFG_OK
            elif [ $config_status -ge 2 ]; then
                echo CFG_PARTIAL
            else
                echo CFG_MISS
            fi
            
            # Password check - verify file exists and contains actual passwords
            password_status=0
            
            # Check if password file exists
            if [ -f /etc/xavs/passwords.yml ]; then
                password_file="/etc/xavs/passwords.yml"
                password_status=$((password_status + 1))
            elif [ -f /etc/kolla/passwords.yml ]; then
                password_file="/etc/kolla/passwords.yml"
                password_status=$((password_status + 1))
            fi
            
            # If file exists, check if it contains actual generated passwords
            if [ $password_status -gt 0 ]; then
                # Check for key password entries that should be generated
                if grep -q "keystone_admin_password:" "$password_file" && \
                   grep -q "database_password:" "$password_file" && \
                   grep -q "rabbitmq_password:" "$password_file" && \
                   ! grep -q "keystone_admin_password: $" "$password_file"; then
                    password_status=$((password_status + 1))
                else
                fi
            fi
            
            
            if [ $password_status -ge 2 ]; then
                echo PWD_OK
            elif [ $password_status -eq 1 ]; then
                echo PWD_PARTIAL
            else
                echo PWD_MISS
            fi
        `;

        try {
            log("[Deps:RHEL] Checking Python packages, configuration, and dependencies...");
            log("[Deps:RHEL] Executing dependency check script...");
            const out = await cockpit.spawn(["bash", "-c", script], { superuser: "try", err: "message" });
            log("[Deps:RHEL] Script completed successfully");
            log("[Deps:RHEL] Raw output: " + out);
            const results = out.trim().split("\n");
            log("[Deps:RHEL] Parsed results: " + JSON.stringify(results));
            
            setBadge("dep-py",   results.includes("PY_OK")   ? "ok" : "err",  results.includes("PY_OK")   ? '<i class="fas fa-check text-success"></i> installed' : '<i class="fas fa-times text-danger"></i> missing');
            setBadge("dep-tools", results.includes("TOOLS_OK") ? "ok" : "err", results.includes("TOOLS_OK") ? '<i class="fas fa-check text-success"></i> installed' : '<i class="fas fa-times text-danger"></i> missing');
            setBadge("dep-env",  "warn", '<i class="fas fa-exclamation-triangle text-warning"></i> N/A (global)');
            
            // Enhanced xDeploy status handling
            if (results.includes("XDEP_OK")) {
                setBadge("dep-xdep", "ok", '<i class="fas fa-check text-success"></i> ready');
            } else if (results.includes("XDEP_PARTIAL")) {
                setBadge("dep-xdep", "warn", '<i class="fas fa-exclamation-triangle text-warning"></i> partial');
                log("[Deps:RHEL] xDeploy dependencies partially installed - please reinstall xDeploy Dependencies");
            } else {
                setBadge("dep-xdep", "err", '<i class="fas fa-times text-danger"></i> missing');
            }
            
            setBadge("dep-oscli", results.includes("OSCLI_OK") ? "ok" : "err", results.includes("OSCLI_OK") ? '<i class="fas fa-check text-success"></i> ready' : '<i class="fas fa-times text-danger"></i> missing');
            
            // Enhanced config status handling  
            if (results.includes("CFG_OK")) {
                setBadge("dep-cfg", "ok", '<i class="fas fa-check text-success"></i> ready');
            } else if (results.includes("CFG_PARTIAL")) {
                setBadge("dep-cfg", "warn", '<i class="fas fa-exclamation-triangle text-warning"></i> partial');
                log("[Deps:RHEL] Configuration partially set up - please reinstall Configuration");
            } else {
                setBadge("dep-cfg", "err", '<i class="fas fa-times text-danger"></i> missing');
            }
            
            setBadge("dep-pwd",   
                results.includes("PWD_OK") ? "ok" : 
                results.includes("PWD_PARTIAL") ? "warn" : "warn", 
                results.includes("PWD_OK") ? '<i class="fas fa-check text-success"></i> ready' : 
                results.includes("PWD_PARTIAL") ? '<i class="fas fa-exclamation-triangle text-warning"></i> incomplete' : '<i class="fas fa-exclamation-triangle text-warning"></i> generate');
            
            // Log helpful message for partial password state
            if (results.includes("PWD_PARTIAL")) {
                log("[Deps:RHEL] Password file exists but appears incomplete - please regenerate passwords");
            }
            
            log("[Deps:RHEL] Check completed\n" + out.trim());
        } catch (error) {
            setTextError("dep-status", '<i class="fas fa-times text-danger"></i> Check failed');
            log("[Deps:RHEL] Check failed with error: " + (error.message || error));
            log("[Deps:RHEL] Error details: " + JSON.stringify(error));
            if (error.exit_status) {
                log("[Deps:RHEL] Script exit status: " + error.exit_status);
            }
            if (error.stderr) {
                log("[Deps:RHEL] Script stderr: " + error.stderr);
            }
            
            // Reset badges to error state  
            ['dep-py', 'dep-tools', 'dep-env', 'dep-xdep', 'dep-oscli', 'dep-cfg', 'dep-pwd'].forEach(id => 
                setBadge(id, "err", '<i class="fas fa-times text-danger"></i> error')
            );
        }
    }

    async function installDebianDeps() {
        try {
            log("[Install:Debian] Starting installation...");
            pb("dep-progress", 5);
            
            // Step 1: Update package lists
            setTextWithSpinner("dep-note", "Updating package lists...");
            log("[Install:Debian] Step 1/5: Updating package lists");
            await cockpit.spawn(["apt-get", "update"], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 20);
            setTextWithSpinner("dep-note", "Installing system packages...");
            log("[Install:Debian] Step 2/5: Installing system packages (git, python3-dev, python3-pip, libffi-dev, gcc, libssl-dev, python3-venv, python3-docker)");
            
            // Step 2: Install system packages
            await cockpit.spawn([
                "apt-get", "install", "-y", 
                "git", "python3-dev", "python3-pip", "libffi-dev", "gcc", "libssl-dev", "python3-venv", "python3-docker"
            ], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 45);
            setTextWithSpinner("dep-note", "Creating Python environment...");
            log("[Install:Debian] Step 3/5: Creating Python virtual environment at /opt/xenv");
            
            // Step 3: Create Python environment
            await cockpit.spawn([
                "bash", "-c",
                "mkdir -p /opt && python3 -m venv /opt/xenv"
            ], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 65);
            setTextWithSpinner("dep-note", "Upgrading pip...");
            log("[Install:Debian] Step 4/5: Upgrading pip and installing Python dependencies");
            
            // Step 4: Upgrade pip
            await cockpit.spawn([
                "/opt/xenv/bin/pip", "install", "--upgrade", "pip"
            ], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 80);
            setTextWithSpinner("dep-note", "Installing Ansible and Kolla-Ansible...");
            
            // Install Python packages
            await cockpit.spawn([
                "/opt/xenv/bin/pip", "install", "ansible-core>=2.15,<2.16.99", "kolla-ansible"
            ], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 85);
            setTextWithSpinner("dep-note", "Setting up configuration directories...");
            log("[Install:Debian] Step 5/6: Creating configuration directories");
            
            // Step 5: Create config directories
            await cockpit.spawn([
                "bash", "-c",
                "mkdir -p /etc/xavs && chown $SUDO_USER:$SUDO_USER /etc/xavs 2>/dev/null || true"
            ], { 
                superuser: "require",
                err: "message"
            });

            pb("dep-progress", 90);
            setTextWithSpinner("dep-note", "Creating globals.yml configuration...");
            log("[Install:Debian] Step 6/6: Creating xAVS globals.yml configuration");
            
            // Step 6: Create globals.yml file with xAVS configuration
            const globalsContent = `---
# xdeploy generated globals for XAVS

config_strategy: "COPY_ALWAYS"
workaround_ansible_issue_8743: yes
openstack_release: "2024.1"

prometheus_port: "9291"
prometheus_node_exporter_port: "9290"
prometheus_alertmanager_port: "9296"
prometheus_alertmanager_cluster_port: "9294"
grafana_server_port: "3200"



octavia_loadbalancer_topology: "ACTIVE_STANDBY"
`;

            try {
                await cockpit.spawn(["tee", "/etc/xavs/globals.yml"], { 
                    superuser: "require", 
                    err: "message" 
                }).input(globalsContent);
                log("[Install:Debian]  Created /etc/xavs/globals.yml with default configuration");
            } catch (e) {
                log("[Install:Debian]  Warning: Could not create globals.yml - " + (e.message || e));
            }
            
            pb("dep-progress", 100);
            setTextSuccess("dep-note", '<i class="fas fa-check text-success"></i> Installation completed successfully!');
            log("[Install:Debian] Installation completed successfully", "success");
            
        } catch (error) {
            const errorMsg = error.message || error.toString();
            setTextError("dep-note", '<i class="fas fa-times text-danger"></i> Installation failed - check logs');
            log("[Install:Debian] Failed: " + errorMsg, "error");
            if (error.exit_status) {
                log("[Install:Debian] Exit code: " + error.exit_status);
            }
            throw error;
        }
    }
    
    async function installRHELDeps() {
        try {
            log("[Install:RHEL] Starting installation...");
            pb("dep-progress", 5);
            
            // Step 1: Install system packages
            setTextWithSpinner("dep-note", "Installing system packages...");
            log("[Install:RHEL] Step 1/4: Installing system packages (git, python3-devel, python3-pip, libffi-devel, gcc, openssl-devel, python3-libselinux)");
            await cockpit.spawn([
                "dnf", "install", "-y", 
                "git", "python3-devel", "python3-pip", "libffi-devel", "gcc", "openssl-devel", "python3-libselinux"
            ], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 35);
            setTextWithSpinner("dep-note", "Upgrading pip...");
            log("[Install:RHEL] Step 2/4: Upgrading pip");
            
            // Step 2: Upgrade pip
            await cockpit.spawn([
                "pip3", "install", "--upgrade", "pip"
            ], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 65);
            setTextWithSpinner("dep-note", "Installing Ansible and Kolla-Ansible...");
            log("[Install:RHEL] Step 3/4: Installing Python dependencies (ansible-core>=2.15,<2.16.99, kolla-ansible)");
            
            // Step 3: Install Python packages globally (no venv on RHEL approach)
            await cockpit.spawn([
                "pip3", "install", "ansible-core>=2.15,<2.16.99", "kolla-ansible"
            ], { 
                superuser: "require",
                err: "message"
            });
            
            pb("dep-progress", 85);
            setTextWithSpinner("dep-note", "Setting up configuration directories...");
            log("[Install:RHEL] Step 4/5: Creating configuration directories");
            
            // Step 4: Create config directories
            await cockpit.spawn([
                "bash", "-c",
                "mkdir -p /etc/xavs && chown $SUDO_USER:$SUDO_USER /etc/xavs 2>/dev/null || true"
            ], { 
                superuser: "require",
                err: "message"
            });

            pb("dep-progress", 90);
            setTextWithSpinner("dep-note", "Creating globals.yml configuration...");
            log("[Install:RHEL] Step 5/5: Creating xAVS globals.yml configuration");
            
            // Step 5: Create globals.yml file with xAVS configuration
            const globalsContent = `---
# xdeploy generated globals for XAVS

config_strategy: "COPY_ALWAYS"
workaround_ansible_issue_8743: yes
openstack_release: "2024.1"

prometheus_port: "9291"
prometheus_node_exporter_port: "9290"
prometheus_alertmanager_port: "9296"
prometheus_alertmanager_cluster_port: "9294"
grafana_server_port: "3200"



octavia_loadbalancer_topology: "ACTIVE_STANDBY"
`;

            try {
                await cockpit.spawn(["tee", "/etc/xavs/globals.yml"], { 
                    superuser: "require", 
                    err: "message" 
                }).input(globalsContent);
                log("[Install:RHEL]  Created /etc/xavs/globals.yml with default configuration");
            } catch (e) {
                log("[Install:RHEL]  Warning: Could not create globals.yml - " + (e.message || e));
            }
            
            pb("dep-progress", 100);
            setTextSuccess("dep-note", '<i class="fas fa-check text-success"></i> Installation completed successfully!');
            log("[Install:RHEL] Installation completed successfully", "success");
            
        } catch (error) {
            const errorMsg = error.message || error.toString();
            setTextError("dep-note", '<i class="fas fa-times text-danger"></i> Installation failed - check logs');
            log("[Install:RHEL] Failed: " + errorMsg);
            if (error.exit_status) {
                log("[Install:RHEL] Exit code: " + error.exit_status);
            }
            throw error;
        }
    }

    async function installDependencies() {
        if (osInfo.isXOS) {
            setText("dep-note", "Installation skipped on XOS systems");
            return;
        }
        
        // Set bulk install flag to prevent individual checks
        isRunningBulkInstall = true;
        
        const installBtn = $("btn-install-all");
        const checkBtn = $("btn-check-deps");
        
        // Disable buttons during installation
        if (installBtn) installBtn.disabled = true;
        if (checkBtn) checkBtn.disabled = true;
        
        // Reset progress and show starting message
        pb("dep-progress", 0);
        setTextWithSpinner("dep-note", "Starting sequential installation...");
        log("[Install:All] Starting complete dependency installation in proper sequence");

        try {
            // Step 1: Python Dependencies
            pb("dep-progress", 10);
            setTextWithSpinner("dep-note", "Step 1/7: Installing Python Dependencies...");
            log("[Install:All] Step 1/7: Python Dependencies");
            await installPythonDeps();
            
            // Step 2: System Tools
            pb("dep-progress", 25);
            setTextWithSpinner("dep-note", "Step 2/7: Installing System Tools...");
            log("[Install:All] Step 2/7: System Tools");
            await installSystemTools();
            
            // Step 3: Python Environment
            pb("dep-progress", 40);
            setTextWithSpinner("dep-note", "Step 3/7: Setting up Python Environment...");
            log("[Install:All] Step 3/7: Python Environment");
            await installEnvironment();
            
            // Step 4: xDeploy Dependencies
            pb("dep-progress", 55);
            setTextWithSpinner("dep-note", "Step 4/7: Installing xAVS Dependencies...");
            log("[Install:All] Step 4/7: xAVS Dependencies");
            await installXDeployDeps();
            
            // Step 5: OpenStack Clients
            pb("dep-progress", 70);
            setTextWithSpinner("dep-note", "Step 5/7: Installing CLI Clients...");
            log("[Install:All] Step 5/7: CLI Clients");
            await installCLIClients();
            
            // Step 6: Configuration Setup
            pb("dep-progress", 85);
            setTextWithSpinner("dep-note", "Step 6/7: Setting up Configuration...");
            log("[Install:All] Step 6/7: Configuration Setup");
            await installConfiguration();
            
            // Step 7: Password Configuration
            pb("dep-progress", 95);
            setTextWithSpinner("dep-note", "Step 7/7: Generating Passwords...");
            log("[Install:All] Step 7/7: Password Configuration");
            await generatePasswords();

            // Final verification
            pb("dep-progress", 100);
            setTextWithSpinner("dep-note", "Verifying complete installation...");
            log("[Install:All] Running final verification check");
            await checkDependencies();
            
            // Show final success message
            setTextSuccess("dep-note", '<i class="fas fa-check text-success"></i> Complete installation successful!');
            log("[Install:All] All 7 steps completed successfully in proper sequence", "success");
            
        } catch (error) {
            const errorMsg = error.message || error.toString();
            setTextError("dep-note", '<i class="fas fa-times text-danger"></i> Installation failed: ' + errorMsg);
            log("[Install:All] Installation failed at current step: " + errorMsg);
            log("[Install:All] You can continue by clicking individual component install buttons");
            
            // Reset progress on failure
            pb("dep-progress", 0);
            
        } finally {
            // Reset bulk install flag
            isRunningBulkInstall = false;
            
            // Re-enable buttons
            if (installBtn) installBtn.disabled = false;
            if (checkBtn) checkBtn.disabled = false;
        }
    }

    //  Individual Installation Functions 
    async function installPythonDeps() {
        if (osInfo.isXOS) {
            log("[Install:Python] Skipped on XOS system");
            return;
        }

        const btn = $("btn-install-py");
        if (btn) btn.disabled = true;

        try {
            setBadge("dep-py", "", '<i class="fas fa-clock text-warning"></i> Installing...');
            log("[Install:Python] Installing system Python packages...");

            if (osInfo.branch === "debian") {
                setBadge("dep-py", "", '<i class="fas fa-clock text-warning"></i> Updating apt...');
                log("[Install:Python] Updating package lists...");
                await cockpit.spawn(["apt-get", "update"], { superuser: "require", err: "message" });
                
                setBadge("dep-py", "", '<i class="fas fa-clock text-warning"></i> Installing packages...');
                log("[Install:Python] Installing: git, python3-dev, python3-pip, libffi-dev, gcc, libssl-dev, python3-venv, python3-docker");
                await cockpit.spawn([
                    "apt-get", "install", "-y", 
                    "git", "python3-dev", "python3-pip", "libffi-dev", "gcc", "libssl-dev", "python3-venv", "python3-docker"
                ], { superuser: "require", err: "message" });
            } else if (osInfo.branch === "rhel") {
                setBadge("dep-py", "", '<i class="fas fa-clock text-warning"></i> Installing packages...');
                log("[Install:Python] Installing: git, python3-devel, python3-pip, libffi-devel, gcc, openssl-devel, python3-libselinux");
                await cockpit.spawn([
                    "dnf", "install", "-y", 
                    "git", "python3-devel", "python3-pip", "libffi-devel", "gcc", "openssl-devel", "python3-libselinux"
                ], { superuser: "require", err: "message" });
            }

            setBadge("dep-py", "ok", '<i class="fas fa-check text-success"></i> installed');
            log("[Install:Python] Python dependencies installed successfully");
            
            // Refresh detection to verify installation (unless in bulk install mode)
            if (!isRunningBulkInstall) {
                if (!isRunningBulkInstall) { setTimeout(() => checkDependencies(), 1000); }
            }

        } catch (error) {
            setBadge("dep-py", "err", '<i class="fas fa-times text-danger"></i> failed');
            log("[Install:Python] Failed: " + (error.message || error));
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function installSystemTools() {
        if (osInfo.isXOS) {
            log("[Install:SystemTools] Skipped on XOS system");
            return;
        }

        const btn = $("btn-install-tools");
        if (btn) btn.disabled = true;

        try {
            setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Updating packages...');
            log("[Install:SystemTools] Installing comprehensive system tools and utilities...");

            if (osInfo.branch === "debian") {
                // Update package lists first
                log("[Install:SystemTools] Updating package lists...");
                await cockpit.spawn(["apt-get", "update"], { superuser: "require", err: "message" });
                
                setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Installing core tools...');
                log("[Install:SystemTools] Step 1/4: Installing core monitoring and networking tools...");
                
                // Step 1: Core monitoring and networking tools
                await cockpit.spawn([
                    "apt-get", "install", "-y",
                    "btop", "htop", "iftop", "iotop", "net-tools", "tcpdump", "traceroute", 
                    "curl", "wget", "vim", "nano", "tmux", "jq", "pv", "rsync", "lsof"
                ], { superuser: "require", err: "message" });
                
                setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Installing development tools...');
                log("[Install:SystemTools] Step 2/4: Installing development and build tools...");
                
                // Step 2: Development tools
                await cockpit.spawn([
                    "apt-get", "install", "-y",
                    "build-essential", "make", "cmake", "gcc", "git", "zip", "unzip", "bzip2"
                ], { superuser: "require", err: "message" });
                
                setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Installing system services...');
                log("[Install:SystemTools] Step 3/4: Installing system services and utilities...");
                
                // Step 3: System services (install what's available, skip missing)
                await cockpit.spawn([
                    "bash", "-c", 
                    "for pkg in docker.io apache2 chrony rsyslog logrotate auditd fail2ban ssh; do " +
                    "  apt-get install -y $pkg 2>/dev/null || echo 'Skipping $pkg'; " +
                    "done"
                ], { superuser: "require", err: "message" });
                
                setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Installing storage tools...');
                log("[Install:SystemTools] Step 4/4: Installing storage and virtualization tools...");
                
                // Step 4: Storage and virtualization (install what's available)
                await cockpit.spawn([
                    "bash", "-c",
                    "for pkg in lvm2 cryptsetup parted gdisk smartmontools; do " +
                    "  apt-get install -y $pkg 2>/dev/null || echo 'Skipping $pkg'; " +
                    "done"
                ], { superuser: "require", err: "message" });
                
            } else if (osInfo.branch === "rhel") {
                setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Installing core tools...');
                log("[Install:SystemTools] Step 1/3: Installing core monitoring and networking tools...");
                
                // Step 1: Core tools for RHEL
                await cockpit.spawn([
                    "dnf", "install", "-y",
                    "btop", "htop", "iftop", "iotop", "net-tools", "tcpdump", "traceroute",
                    "curl", "wget", "vim", "nano", "tmux", "jq", "rsync", "lsof"
                ], { superuser: "require", err: "message" });
                
                setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Installing development tools...');
                log("[Install:SystemTools] Step 2/3: Installing development tools...");
                
                // Step 2: Development tools
                await cockpit.spawn([
                    "dnf", "install", "-y",
                    "@development-tools", "cmake", "git", "zip", "unzip", "bzip2"
                ], { superuser: "require", err: "message" });
                
                setBadge("dep-tools", "", '<i class="fas fa-clock text-warning"></i> Installing system services...');
                log("[Install:SystemTools] Step 3/3: Installing system services and storage tools...");
                
                // Step 3: System services and storage tools (install what's available)
                await cockpit.spawn([
                    "bash", "-c",
                    "for pkg in docker httpd chrony rsyslog logrotate audit fail2ban lvm2 cryptsetup parted gdisk smartmontools openssh-server; do " +
                    "  dnf install -y $pkg 2>/dev/null || echo 'Skipping $pkg'; " +
                    "done"
                ], { superuser: "require", err: "message" });
            }

            setBadge("dep-tools", "ok", '<i class="fas fa-check text-success"></i> installed');
            log("[Install:SystemTools]  System tools installed successfully");
            
            // Refresh detection to verify installation
            if (!isRunningBulkInstall) { setTimeout(() => checkDependencies(), 1000); }

        } catch (error) {
            setBadge("dep-tools", "err", '<i class="fas fa-times text-danger"></i> failed');
            log("[Install:SystemTools]  Failed: " + (error.message || error));
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function installEnvironment() {
        if (osInfo.isXOS || osInfo.branch === "rhel") {
            log("[Install:Environment] Skipped on XOS or RHEL system");
            return;
        }

        const btn = $("btn-install-env");
        if (btn) btn.disabled = true;

        try {
            setBadge("dep-env", "", " Creating environment...");
            log("[Install:Environment] Creating Python virtual environment at /opt/xenv...");

            await cockpit.spawn([
                "bash", "-c",
                "mkdir -p /opt && python3 -m venv /opt/xenv"
            ], { superuser: "require", err: "message" });

            setBadge("dep-env", "ok", '<i class="fas fa-check text-success"></i> present');
            log("[Install:Environment]  Python environment created successfully");
            
            // Refresh detection to verify installation
            if (!isRunningBulkInstall) { setTimeout(() => checkDependencies(), 1000); }

        } catch (error) {
            setBadge("dep-env", "err", '<i class="fas fa-times text-danger"></i> failed');
            log("[Install:Environment]  Failed: " + (error.message || error));
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function installXDeployDeps() {
        if (osInfo.isXOS) {
            log("[Install:XDeploy] Skipped on XOS system");
            return;
        }

        const btn = $("btn-install-xdep");
        if (btn) btn.disabled = true;

        try {
            setBadge("dep-xdep", "", " Installing...");
            log("[Install:XDeploy] Installing xAVS deployment framework in virtual environment...");

            // Check if virtual environment exists
            try {
                await cockpit.spawn(["test", "-d", "/opt/xenv"], { err: "message" });
            } catch (e) {
                log("[Install:XDeploy]  Virtual environment not found. Please install Python Environment first.");
                setBadge("dep-xdep", "err", " venv missing");
                return;
            }

            setBadge("dep-xdep", "", " Upgrading pip...");
            log("[Install:XDeploy] Step 1/3: Upgrading pip in virtual environment");
            // Step 1: Upgrade pip
            await cockpit.spawn([
                "/opt/xenv/bin/pip", "install", "-U", "pip"
            ], { superuser: "require", err: "message" });
            
            setBadge("dep-xdep", "", " Installing Ansible...");
            log("[Install:XDeploy] Step 2/3: Installing ansible-core>=2.15,<2.16.99 and kolla-ansible");
            // Step 2: Install ansible-core and kolla-ansible
            await cockpit.spawn([
                "/opt/xenv/bin/pip", "install", 
                "ansible-core>=2.15,<2.16.99",
                "git+https://opendev.org/openstack/kolla-ansible@stable/2024.1"
            ], { superuser: "require", err: "message" });

            setBadge("dep-xdep", "", " Installing packages...");
            log("[Install:XDeploy] Step 3/5: Installing specific Python package versions in virtual environment");
            // Step 3: Install specific package versions in venv
            await cockpit.spawn([
                "/opt/xenv/bin/pip", "install", 
                "requests==2.31.0", 
                "urllib3==1.26.20", 
                "docker==6.1.3"
            ], { superuser: "require", err: "message" });

            setBadge("dep-xdep", "", " Installing globally...");
            log("[Install:XDeploy] Step 4/5: Installing specific Python package versions globally");
            // Step 4: Install same package versions globally
            await cockpit.spawn([
                "pip3", "install", 
                "requests==2.31.0", 
                "urllib3==1.26.20", 
                "docker==6.1.3"
            ], { superuser: "require", err: "message" });

            setBadge("dep-xdep", "", " Creating config...");
            log("[Install:XDeploy] Step 5/6: Creating xAVS configuration directory and globals.yml");
            
            // Step 5: Create /etc/xavs directory if it doesn't exist
            try {
                await cockpit.spawn(["mkdir", "-p", "/etc/xavs"], { superuser: "require", err: "message" });
                log("[Install:XDeploy]  Created /etc/xavs directory");
            } catch (e) {
                // Directory might already exist, that's fine
                log("[Install:XDeploy]  /etc/xavs directory exists or created");
            }

            // Step 6: Create globals.yml file with xAVS configuration
            const globalsContent = `---
# xdeploy generated globals for XAVS

config_strategy: "COPY_ALWAYS"
workaround_ansible_issue_8743: yes
openstack_release: "2024.1"

prometheus_port: "9291"
prometheus_node_exporter_port: "9290"
prometheus_alertmanager_port: "9296"
prometheus_alertmanager_cluster_port: "9294"
grafana_server_port: "3200"



octavia_loadbalancer_topology: "ACTIVE_STANDBY"
`;

            try {
                await cockpit.spawn(["tee", "/etc/xavs/globals.yml"], { 
                    superuser: "require", 
                    err: "message" 
                }).input(globalsContent);
                log("[Install:XDeploy]  Created /etc/xavs/globals.yml with default configuration");
            } catch (e) {
                log("[Install:XDeploy]  Warning: Could not create globals.yml - " + (e.message || e));
            }

            setBadge("dep-xdep", "", " Finalizing...");
            log("[Install:XDeploy] Step 6/6: Installation complete");

            setBadge("dep-xdep", "ok", '<i class="fas fa-check text-success"></i> ready');
            log("[Install:XDeploy]  All XDeploy dependencies installed successfully");
            log("[Install:XDeploy]  Virtual env: ansible-core>=2.15, kolla-ansible@stable/2024.1, requests==2.31.0, urllib3==1.26.20, docker==6.1.3");
            log("[Install:XDeploy]  Global: requests==2.31.0, urllib3==1.26.20, docker==6.1.3");
            
            // Refresh detection to verify installation
            if (!isRunningBulkInstall) { setTimeout(() => checkDependencies(), 1000); }

        } catch (error) {
            setBadge("dep-xdep", "err", '<i class="fas fa-times text-danger"></i> failed');
            log("[Install:XDeploy]  Failed: " + (error.message || error));
            log("[Install:XDeploy]  Tip: Make sure Python Environment is installed first");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function installCLIClients() {
        if (osInfo.isXOS) {
            log("[Install:CLIClients] Skipped on XOS system");
            return;
        }

        const btn = $("btn-install-oscli");
        if (btn) btn.disabled = true;

        try {
            setBadge("dep-oscli", "", " Installing...");
            log("[Install:CLIClients] Installing latest CLI clients via pip...");

            // Check if pip3 is available first
            try {
                await cockpit.spawn(["which", "pip3"], { err: "message" });
            } catch (e) {
                log("[Install:CLIClients]  pip3 not found. Please install Python Dependencies first.");
                setBadge("dep-oscli", "err", " pip3 missing");
                return;
            }

            const clients = [
                "python-barbicanclient",
                "python-cinderclient", 
                "python-dateutil",
                "python-keystoneclient",
                "python-magnumclient",
                "python-masakariclient",
                "python-neutronclient",
                "python-octaviaclient",
                "python-openstackclient",
                "python-swiftclient",
                "python-watcherclient",
                "python-zunclient"
            ];

            if (osInfo.branch === "debian") {
                // Install globally on Debian/Ubuntu (not in venv for direct CLI access)
                log("[Install:CLIClients] Installing CLI clients globally: " + clients.join(", "));
                setBadge("dep-oscli", "", " Upgrading pip...");
                
                // First upgrade pip globally
                await cockpit.spawn([
                    "pip3", "install", "--upgrade", "pip"
                ], { superuser: "require", err: "message" });
                
                setBadge("dep-oscli", "", " Installing clients...");
                // Then install all clients globally
                await cockpit.spawn([
                    "pip3", "install", "--upgrade", ...clients
                ], { superuser: "require", err: "message" });
            } else if (osInfo.branch === "rhel") {
                // Install globally on RHEL/Rocky
                log("[Install:CLIClients] Installing globally: " + clients.join(", "));
                setBadge("dep-oscli", "", " Upgrading pip...");
                
                // First upgrade pip
                await cockpit.spawn([
                    "pip3", "install", "--upgrade", "pip"
                ], { superuser: "require", err: "message" });
                
                setBadge("dep-oscli", "", " Installing clients...");
                // Then install all clients
                await cockpit.spawn([
                    "pip3", "install", "--upgrade", ...clients
                ], { superuser: "require", err: "message" });
            }

            setBadge("dep-oscli", "ok", '<i class="fas fa-check text-success"></i> ready');
            log("[Install:CLIClients]  CLI clients installed successfully");
            
            // Refresh detection to verify installation
            if (!isRunningBulkInstall) { setTimeout(() => checkDependencies(), 1000); }

        } catch (error) {
            setBadge("dep-oscli", "err", '<i class="fas fa-times text-danger"></i> failed');
            log("[Install:CLIClients]  Failed: " + (error.message || error));
            log("[Install:CLIClients]  Tip: Make sure Python Dependencies are installed first");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function installConfiguration() {
        const btn = $("btn-install-cfg");
        if (btn) btn.disabled = true;

        try {
            setBadge("dep-cfg", "", " Setting up directories...");
            log("[Install:Config] Setting up xavs configuration directories and files...");

            // Check if virtual environment and kolla-ansible are available
            try {
                await cockpit.spawn(["test", "-d", "/opt/xenv/share/kolla-ansible"], { err: "message" });
            } catch (e) {
                log("[Install:Config]  Kolla-ansible not found. Please install xDeploy Dependencies first.");
                setBadge("dep-cfg", "err", " kolla missing");
                return;
            }

            setBadge("dep-cfg", "", " Creating directories...");
            log("[Install:Config] Step 1/5: Creating /etc/xavs directory with proper ownership");
            // Step 1: Create directory with proper ownership
            await cockpit.spawn([
                "bash", "-c",
                "mkdir -p /etc/xavs && chown root:root /etc/xavs"
            ], { superuser: "require", err: "message" });

            setBadge("dep-cfg", "", " Copying kolla config...");
            log("[Install:Config] Step 2/5: Copying kolla-ansible configuration files to /etc/xavs");
            // Step 2: Copy kolla configuration files
            await cockpit.spawn([
                "bash", "-c",
                "cp -r /opt/xenv/share/kolla-ansible/etc_examples/kolla/* /etc/xavs"
            ], { superuser: "require", err: "message" });

            setBadge("dep-cfg", "", " Copying inventory...");
            log("[Install:Config] Step 3/5: Copying all-in-one inventory to /etc/xavs/nodes");
            // Step 3: Copy inventory file
            await cockpit.spawn([
                "bash", "-c",
                "cp /opt/xenv/share/kolla-ansible/ansible/inventory/all-in-one /etc/xavs/nodes"
            ], { superuser: "require", err: "message" });

            setBadge("dep-cfg", "", " Creating symlink...");
            log("[Install:Config] Step 4/7: Creating symbolic link /etc/kolla -> /etc/xavs");
            // Step 4: Create symbolic link
            await cockpit.spawn([
                "bash", "-c",
                "ln -sf /etc/xavs /etc/kolla"
            ], { superuser: "require", err: "message" });

            setBadge("dep-cfg", "", " Installing deps...");
            log("[Install:Config] Step 5/7: Running kolla-ansible install-deps");
            // Step 5: Install kolla-ansible dependencies
            await cockpit.spawn([
                "bash", "-c",
                "source /opt/xenv/bin/activate && kolla-ansible install-deps"
            ], { superuser: "require", err: "message" });

            setBadge("dep-cfg", "", " Verifying...");
            log("[Install:Config] Step 6/7: Verifying ansible and collections installation");
            // Step 6: Verify installation
            const verifyResult = await cockpit.spawn([
                "bash", "-c",
                "source /opt/xenv/bin/activate && pip list | grep ansible && ansible-galaxy collection list"
            ], { superuser: "require", err: "message" });
            
            log("[Install:Config] Verification output:");
            log(verifyResult.trim());

            setBadge("dep-cfg", "", " Finalizing...");
            log("[Install:Config] Step 7/7: Configuration setup complete");

            setBadge("dep-cfg", "ok", '<i class="fas fa-check text-success"></i> ready');
            log("[Install:Config]  xavs configuration setup completed successfully", "success");
            log("[Install:Config]  Created: /etc/xavs (kolla config), /etc/xavs/nodes (inventory), /etc/kolla -> /etc/xavs (symlink)");
            log("[Install:Config]  Executed: kolla-ansible install-deps and verified ansible collections");
            
            // Refresh detection to verify installation
            if (!isRunningBulkInstall) { setTimeout(() => checkDependencies(), 1000); }

        } catch (error) {
            setBadge("dep-cfg", "err", '<i class="fas fa-times text-danger"></i> failed');
            log("[Install:Config]  Failed: " + (error.message || error));
            log("[Install:Config]  Tip: Make sure xDeploy Dependencies (kolla-ansible) are installed first");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function generatePasswords() {
        const btn = $("btn-install-pwd");
        if (btn) btn.disabled = true;

        try {
            setBadge("dep-pwd", "", "");
            log("[Install:Passwords] Generating passwords using kolla-genpwd...");

            if (osInfo.branch === "debian") {
                // Use virtual environment on Debian
                await cockpit.spawn([
                    "bash", "-c",
                    "mkdir -p /etc/xavs && " +
                    "/opt/xenv/bin/kolla-genpwd -p /etc/xavs/passwords.yml && " +
                    "chown $SUDO_USER:$SUDO_USER /etc/xavs/passwords.yml 2>/dev/null || true"
                ], { superuser: "require", err: "message" });
            } else if (osInfo.branch === "rhel") {
                // Use global installation on RHEL
                await cockpit.spawn([
                    "bash", "-c",
                    "mkdir -p /etc/xavs && " +
                    "kolla-genpwd -p /etc/xavs/passwords.yml && " +
                    "chown $SUDO_USER:$SUDO_USER /etc/xavs/passwords.yml 2>/dev/null || true"
                ], { superuser: "require", err: "message" });
            } else {
                throw new Error("Unsupported OS branch: " + osInfo.branch);
            }

            setBadge("dep-pwd", "ok", '<i class="fas fa-check text-success"></i> ready');
            log("[Install:Passwords]  Passwords generated successfully using kolla-genpwd");
            
            // Refresh detection to verify installation
            if (!isRunningBulkInstall) { setTimeout(() => checkDependencies(), 1000); }

        } catch (error) {
            setBadge("dep-pwd", "err", '<i class="fas fa-times text-danger"></i> failed');
            log("[Install:Passwords]  Failed: " + (error.message || error));
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    //  Event Listeners 
    $("btn-detect-os").addEventListener("click", detectOS);
    $("btn-run-hw-top").addEventListener("click", () => {
        document.querySelector('#tabs .nav-link[data-target="panel-hw"]').click();
    });
    $("btn-run-hw").addEventListener("click", runHardwareChecks);
    $("btn-check-deps").addEventListener("click", () => {
        log("[UI] Check All button clicked");
        checkDependencies();
    });
    $("btn-install-all").addEventListener("click", installDependencies);
    
    // Enhanced Overview buttons
    $("btn-refresh-status").addEventListener("click", refreshSystemStatus);
    $("btn-refresh-storage").addEventListener("click", refreshStorageOverview);
    $("btn-refresh-network").addEventListener("click", refreshNetworkOverview);
    $("btn-refresh-all").addEventListener("click", async () => {
        await detectOS();
        await refreshSystemStatus();
        await refreshStorageOverview();
        await refreshNetworkOverview();
        await runHardwareChecks();
        await checkDependencies();
    });
    $("btn-system-info").addEventListener("click", exportSystemInfo);
    
    // Enhanced Hardware buttons
    $("btn-hw-details").addEventListener("click", refreshHardwareDetails);
    $("btn-virt-detect").addEventListener("click", detectVirtualization);
    
    // Individual dependency install buttons
    $("btn-install-py").addEventListener("click", installPythonDeps);
    $("btn-install-tools").addEventListener("click", installSystemTools);
    $("btn-install-env").addEventListener("click", installEnvironment);
    $("btn-install-xdep").addEventListener("click", installXDeployDeps);
    $("btn-install-oscli").addEventListener("click", installCLIClients);
    $("btn-install-cfg").addEventListener("click", installConfiguration);
    $("btn-install-pwd").addEventListener("click", generatePasswords);
    
    $("btn-refresh").addEventListener("click", async () => {
        // Disable button during operation
        const refreshBtn = $("btn-refresh");
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.textContent = " Running all detections...";
        }
        
        try {
            log("[Refresh] Starting comprehensive system detection...");
            
            // Core system detection
            await detectOS();
            
            // Enhanced overview functions
            await refreshSystemStatus();
            await refreshStorageOverview();
            await refreshNetworkOverview();
            
            // Hardware checks
            await runHardwareChecks();
            await refreshHardwareDetails();
            await detectVirtualization();
            
            // Dependency checks
            await checkDependencies();
            
            log("[Refresh]  All detections completed successfully");
        } catch (error) {
            log("[Refresh]  Error during detection: " + (error.message || error));
        } finally {
            // Re-enable button
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = " Re-run all detections";
            }
        }
    });
    $("btn-clear-log").addEventListener("click", () => {
        const logElement = $("log");
        if (logElement) {
            logElement.innerHTML = '';
            log("Log cleared", "info");
        }
        // Clear stored logs too
        try {
            localStorage.removeItem('xavs-bootstrap-logs');
        } catch (e) {
            console.warn('Could not clear stored logs:', e);
        }
    });

    // Initialize with first tab and load stored logs
    showPanel('panel-overview');
    // Ensure DOM is ready before loading logs
    setTimeout(() => {
        loadStoredLogs();
        startLogSync(); // Start continuous log synchronization
    }, 10);
    
    // Initialize enhanced overview information
    detectOS().then(() => {
        // After OS detection, load system information
        refreshSystemStatus().catch(console.error);
        refreshStorageOverview().catch(console.error);
        refreshNetworkOverview().catch(console.error);
    }).catch(console.error);
})();




