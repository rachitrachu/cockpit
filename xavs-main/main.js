/**
 * XAVS Main Application
 * Entry point for the XAVS OpenStack deployment platform
 * Now enhanced with integrated wizard functionality
 */

class XAVSApplication {
    constructor() {
        this.initialized = false;
        this.rbacEnabled = true;
        this.wizardMode = false;
        this.isWizardAvailable = false;
    }

    /**
     * Initialize the XAVS application
     */
    async initialize() {
        try {
            console.log('[XAVS App] Starting XAVS OpenStack Deployment Platform...');
            
            // Check if wizard mode should be used
            await this.checkWizardMode();
            
            // Check user permissions
            await this.checkPermissions();
            
            // Initialize UI based on mode
            if (this.wizardMode) {
                await this.initializeWizardMode();
            } else {
                await this.initializeStandardMode();
            }
            
            this.initialized = true;
            console.log('[XAVS App] Application initialized successfully');
            
            // Log successful startup
            await window.xavsState.auditLog('application_started', {
                version: '1.0.0',
                rbacEnabled: this.rbacEnabled,
                wizardMode: this.wizardMode
            });
            
        } catch (error) {
            console.error('[XAVS App] Initialization failed:', error);
            this.showInitError(error);
        }
    }

    /**
     * Check if wizard mode should be activated
     */
    async checkWizardMode() {
        try {
            // Check URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const forceWizard = urlParams.get('wizard') === 'true';
            const forceStandard = urlParams.get('wizard') === 'false';
            
            if (forceWizard) {
                this.wizardMode = true;
                this.isWizardAvailable = true;
                console.log('[XAVS App] Wizard mode forced via URL parameter');
                return;
            }
            
            if (forceStandard) {
                this.wizardMode = false;
                console.log('[XAVS App] Standard mode forced via URL parameter');
                return;
            }
            
            // Check if wizard state exists and workflow is active
            if (!window.xavsWizardState) {
                console.log('[XAVS App] Wizard modules not loaded, using standard mode');
                return;
            }
            
            await window.xavsWizardState.initialize();
            const summary = window.xavsWizardState.getWorkflowSummary();
            
            if (summary.isResumable) {
                this.wizardMode = true;
                this.isWizardAvailable = true;
                console.log('[XAVS App] Resuming existing wizard workflow');
                return;
            }
            
            // Check if this is a first-time setup (no previous deployment)
            const hasExistingConfig = await this.checkExistingDeployment();
            if (!hasExistingConfig) {
                this.wizardMode = true;
                this.isWizardAvailable = true;
                console.log('[XAVS App] First-time setup detected, using wizard mode');
                return;
            }
            
            // Default to standard mode for existing deployments
            this.wizardMode = false;
            this.isWizardAvailable = true;
            console.log('[XAVS App] Existing deployment detected, using standard mode');
            
        } catch (error) {
            console.warn('[XAVS App] Failed to check wizard mode, defaulting to standard:', error);
            this.wizardMode = false;
            this.isWizardAvailable = false;
        }
    }

    /**
     * Check if there's an existing OpenStack deployment
     */
    async checkExistingDeployment() {
        try {
            // Check for existing configuration files
            const configPaths = [
                '/etc/kolla/globals.yml',
                '/etc/kolla/passwords.yml',
                '/etc/xavs/deployment.json'
            ];
            
            for (const path of configPaths) {
                try {
                    await cockpit.file(path).read();
                    console.log(`[XAVS App] Found existing config: ${path}`);
                    return true;
                } catch (error) {
                    // File doesn't exist, continue checking
                }
            }
            
            return false;
        } catch (error) {
            console.warn('[XAVS App] Error checking existing deployment:', error);
            return false;
        }
    }

    /**
     * Initialize wizard mode
     */
    async initializeWizardMode() {
        console.log('[XAVS App] Initializing wizard mode...');
        
        // Redirect to wizard interface
        window.location.href = 'wizard.html';
    }

    /**
     * Initialize standard mode (existing functionality)
     */
    async initializeStandardMode() {
        console.log('[XAVS App] Initializing standard mode...');
        
        // Initialize UI
        this.initializeUI();
        
        // Initialize module manager
        const mainContainer = document.getElementById('main-content');
        if (window.xavsModules) {
            await window.xavsModules.initialize(mainContainer);
        } else {
            console.warn('[XAVS App] Module manager not available, skipping module initialization');
        }
        
        // Setup event handlers
        this.setupEventHandlers();
        
        // Initialize RBAC if enabled
        if (this.rbacEnabled) {
            await this.initializeRBAC();
        }
    }

    /**
     * Check user permissions
     */
    async checkPermissions() {
        try {
            const user = await cockpit.user();
            console.log(`[XAVS App] Current user: ${user.name}`);
            
            // Check if user can write to XAVS directories
            try {
                await cockpit.spawn(['test', '-w', '/etc'], { superuser: 'try' });
                console.log('[XAVS App] User has sufficient permissions');
            } catch (error) {
                console.warn('[XAVS App] User may have limited permissions:', error);
            }
            
        } catch (error) {
            console.error('[XAVS App] Failed to check user permissions:', error);
            throw new Error('Unable to verify user permissions');
        }
    }

    /**
     * Initialize the UI layout
     */
    initializeUI() {
        document.body.innerHTML = `
            <div class="xavs-app">
                <header class="xavs-header">
                    <div class="header-brand">
                        <h1>🚀 XAVS OpenStack Platform</h1>
                        <span class="version">v1.0.0</span>
                    </div>
                    <div class="header-controls">
                        <div class="user-info">
                            <span id="current-user">Loading...</span>
                        </div>
                        <div class="header-actions">
                            <button class="btn btn-sm btn-outline" id="emergency-stop" title="Emergency Stop">
                                🛑
                            </button>
                            <button class="btn btn-sm btn-outline" id="help-button" title="Help">
                                ❓
                            </button>
                        </div>
                    </div>
                </header>
                
                <div class="xavs-main">
                    <nav class="xavs-navigation">
                        <!-- Navigation will be populated by module manager -->
                    </nav>
                    
                    <main id="main-content" class="xavs-content">
                        <!-- Module content will be loaded here -->
                    </main>
                </div>
                
                <footer class="xavs-footer">
                    <div class="footer-info">
                        <span>XAVS OpenStack Deployment Platform</span>
                        <span>•</span>
                        <span id="connection-status">Connected</span>
                        <span>•</span>
                        <span id="last-activity">Just now</span>
                    </div>
                    <div class="footer-actions">
                        <button class="btn btn-sm" id="export-logs">Export Logs</button>
                        <button class="btn btn-sm" id="system-info">System Info</button>
                    </div>
                </footer>
            </div>
        `;

        // Update user info
        this.updateUserInfo();
        
        // Start connection monitoring
        this.startConnectionMonitoring();
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Emergency stop button
        document.getElementById('emergency-stop').onclick = () => this.emergencyStop();
        
        // Help button
        document.getElementById('help-button').onclick = () => this.showHelp();
        
        // Export logs button
        document.getElementById('export-logs').onclick = () => this.exportLogs();
        
        // System info button
        document.getElementById('system-info').onclick = () => this.showSystemInfo();
        
        // Handle window unload
        window.addEventListener('beforeunload', () => {
            window.xavsState.auditLog('application_closed', {
                timestamp: new Date().toISOString()
            });
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'h':
                        e.preventDefault();
                        this.showHelp();
                        break;
                    case 'e':
                        e.preventDefault();
                        this.exportLogs();
                        break;
                    case '`':
                        e.preventDefault();
                        this.toggleDebugMode();
                        break;
                }
            }
        });
    }

    /**
     * Initialize Role-Based Access Control
     */
    async initializeRBAC() {
        try {
            // Check if user is in XAVS groups
            const groups = await this.getUserGroups();
            const xavsGroups = groups.filter(group => group.startsWith('xavs-'));
            
            console.log(`[XAVS RBAC] User groups: ${xavsGroups.join(', ')}`);
            
            // Set up permissions based on groups
            const permissions = this.calculatePermissions(xavsGroups);
            
            // Store permissions in session
            sessionStorage.setItem('xavs-permissions', JSON.stringify(permissions));
            
            console.log('[XAVS RBAC] RBAC initialized successfully');
            
        } catch (error) {
            console.warn('[XAVS RBAC] RBAC initialization failed, using default permissions:', error);
            
            // Default permissions for non-RBAC environments
            const defaultPermissions = {
                canDeploy: true,
                canModifyHosts: true,
                canModifyGlobals: true,
                canViewAudit: true,
                canExportState: true
            };
            
            sessionStorage.setItem('xavs-permissions', JSON.stringify(defaultPermissions));
        }
    }

    /**
     * Get user's groups
     */
    async getUserGroups() {
        try {
            const user = await cockpit.user();
            const result = await cockpit.spawn(['groups', user.name], { superuser: 'try' });
            return result.trim().split(/\\s+/);
        } catch (error) {
            console.error('[XAVS RBAC] Failed to get user groups:', error);
            return [];
        }
    }

    /**
     * Calculate permissions based on groups
     */
    calculatePermissions(groups) {
        const permissions = {
            canDeploy: false,
            canModifyHosts: false,
            canModifyGlobals: false,
            canViewAudit: false,
            canExportState: false
        };

        // xavs-admins: Full access
        if (groups.includes('xavs-admins')) {
            Object.keys(permissions).forEach(key => permissions[key] = true);
        }
        
        // xavs-operators: Can deploy and modify hosts
        else if (groups.includes('xavs-operators')) {
            permissions.canDeploy = true;
            permissions.canModifyHosts = true;
            permissions.canViewAudit = true;
        }
        
        // xavs-viewers: Read-only access
        else if (groups.includes('xavs-viewers')) {
            permissions.canViewAudit = true;
        }

        return permissions;
    }

    /**
     * Update user info display
     */
    async updateUserInfo() {
        try {
            const user = await cockpit.user();
            const userElement = document.getElementById('current-user');
            if (userElement) {
                userElement.textContent = `${user.name} (${user.full_name || 'User'})`;
            }
        } catch (error) {
            console.error('[XAVS App] Failed to update user info:', error);
        }
    }

    /**
     * Start connection monitoring
     */
    startConnectionMonitoring() {
        const updateStatus = () => {
            const statusElement = document.getElementById('connection-status');
            const activityElement = document.getElementById('last-activity');
            
            // Only update if elements exist
            if (!statusElement || !activityElement) return;
            
            if (cockpit.transport && cockpit.transport.ready) {
                statusElement.textContent = 'Connected';
                statusElement.className = 'status-connected';
                activityElement.textContent = 'Just now';
            } else {
                statusElement.textContent = 'Disconnected';
                statusElement.className = 'status-disconnected';
            }
        };

        // Update every 30 seconds
        setInterval(updateStatus, 30000);
        updateStatus();
    }

    /**
     * Emergency stop functionality
     */
    async emergencyStop() {
        const confirmed = confirm(
            'This will stop all running XAVS operations. Are you sure?'
        );
        
        if (!confirmed) return;

        try {
            console.log('[XAVS App] Emergency stop initiated');
            
            // Log emergency stop
            await window.xavsState.auditLog('emergency_stop', {
                timestamp: new Date().toISOString(),
                reason: 'User initiated'
            });
            
            // Try to stop any running deployments
            try {
                await cockpit.spawn(['pkill', '-f', 'kolla-ansible'], { superuser: 'try' });
            } catch (error) {
                console.log('[XAVS App] No kolla-ansible processes to stop');
            }
            
            alert('Emergency stop completed. All operations have been halted.');
            
        } catch (error) {
            console.error('[XAVS App] Emergency stop failed:', error);
            alert('Emergency stop failed: ' + error.message);
        }
    }

    /**
     * Show help modal
     */
    showHelp() {
        const modal = document.createElement('div');
        modal.className = 'xavs-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>XAVS Help</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="help-content">
                        <h4>Keyboard Shortcuts</h4>
                        <ul>
                            <li><kbd>Ctrl+H</kbd> - Show this help</li>
                            <li><kbd>Ctrl+E</kbd> - Export logs</li>
                            <li><kbd>Ctrl+\`</kbd> - Toggle debug mode</li>
                        </ul>
                        
                        <h4>Navigation</h4>
                        <p>Follow the modules in order from Welcome to Deployment. Each module must be completed before proceeding to the next.</p>
                        
                        <h4>Emergency Procedures</h4>
                        <ul>
                            <li>Click 🛑 to stop all operations</li>
                            <li>Use Export Logs to save diagnostic information</li>
                            <li>All actions are logged for audit purposes</li>
                        </ul>
                        
                        <h4>Support</h4>
                        <p>For technical support, export your state and logs and contact the XAVS team.</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal handlers
        modal.querySelector('.modal-close').onclick = () => document.body.removeChild(modal);
        modal.onclick = (e) => {
            if (e.target === modal) document.body.removeChild(modal);
        };
    }

    /**
     * Export logs functionality
     */
    async exportLogs() {
        try {
            console.log('[XAVS App] Exporting logs...');
            
            // Get system logs
            const systemLogs = await this.getSystemLogs();
            
            // Get XAVS state and audit logs
            const xavsData = await window.xavsState.exportState();
            
            // Combine all data
            const exportData = {
                timestamp: new Date().toISOString(),
                systemLogs,
                xavsData,
                systemInfo: await this.getSystemInfo()
            };
            
            // Create and download file
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `xavs-logs-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            console.log('[XAVS App] Logs exported successfully');
            
        } catch (error) {
            console.error('[XAVS App] Failed to export logs:', error);
            alert('Failed to export logs: ' + error.message);
        }
    }

    /**
     * Get system logs
     */
    async getSystemLogs() {
        try {
            const result = await cockpit.spawn([
                'journalctl', '-u', 'cockpit', '-n', '100', '--output=json'
            ], { superuser: 'try' });
            
            return result.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(entry => entry !== null);
                
        } catch (error) {
            console.error('[XAVS App] Failed to get system logs:', error);
            return [];
        }
    }

    /**
     * Show system info modal
     */
    async showSystemInfo() {
        const systemInfo = await this.getSystemInfo();
        
        const modal = document.createElement('div');
        modal.className = 'xavs-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>System Information</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="system-info">
                        <pre>${JSON.stringify(systemInfo, null, 2)}</pre>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close modal handlers
        modal.querySelector('.modal-close').onclick = () => document.body.removeChild(modal);
        modal.onclick = (e) => {
            if (e.target === modal) document.body.removeChild(modal);
        };
    }

    /**
     * Get system information
     */
    async getSystemInfo() {
        try {
            const info = {};
            
            // Get hostname
            try {
                info.hostname = (await cockpit.spawn(['hostname'])).trim();
            } catch (error) {
                info.hostname = 'unknown';
            }
            
            // Get OS info
            try {
                info.os = (await cockpit.spawn(['lsb_release', '-d'])).trim();
            } catch (error) {
                try {
                    info.os = (await cockpit.file('/etc/os-release').read()).split('\n')[0];
                } catch {
                    info.os = 'unknown';
                }
            }
            
            // Get uptime
            try {
                info.uptime = (await cockpit.spawn(['uptime'])).trim();
            } catch (error) {
                info.uptime = 'unknown';
            }
            
            // Get memory info
            try {
                const meminfo = await cockpit.file('/proc/meminfo').read();
                const lines = meminfo.split('\n');
                const memTotalLine = lines.find(l => l.startsWith('MemTotal:'));
                const memAvailableLine = lines.find(l => l.startsWith('MemAvailable:'));
                info.memTotal = memTotalLine ? memTotalLine.split(/\\s+/)[1] : 'unknown';
                info.memAvailable = memAvailableLine ? memAvailableLine.split(/\\s+/)[1] : 'unknown';
            } catch (error) {
                info.memory = 'unknown';
            }
            
            return info;
            
        } catch (error) {
            console.error('[XAVS App] Failed to get system info:', error);
            return { error: error.message };
        }
    }

    /**
     * Toggle debug mode
     */
    toggleDebugMode() {
        const currentLevel = localStorage.getItem('xavs-debug') || 'false';
        const newLevel = currentLevel === 'true' ? 'false' : 'true';
        
        localStorage.setItem('xavs-debug', newLevel);
        
        if (newLevel === 'true') {
            document.body.classList.add('debug-mode');
            console.log('[XAVS App] Debug mode enabled');
        } else {
            document.body.classList.remove('debug-mode');
            console.log('[XAVS App] Debug mode disabled');
        }
    }

    /**
     * Show initialization error
     */
    showInitError(error) {
        document.body.innerHTML = `
            <div class="xavs-error-page">
                <div class="error-container">
                    <h1>🚨 XAVS Initialization Error</h1>
                    <p>Failed to initialize the XAVS application.</p>
                    <div class="error-details">
                        <pre>${error.message}</pre>
                    </div>
                    <button class="btn btn-primary" onclick="window.location.reload()">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }
}

// Make class globally available
window.XAVSApplication = XAVSApplication;

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const app = new XAVSApplication();
    window.xavsApp = app; // Make instance globally available
    await app.initialize();
});