/**
 * XAVS Module Loader and Manager
 * Handles dynamic loading of XAVS modules and navigation
 */

import { xavsState } from './state-manager.js';

export class XAVSModuleManager {
    constructor() {
        this.modules = new Map();
        this.currentModule = null;
        this.container = null;
        this.initialized = false;
    }

    /**
     * Initialize the module manager
     */
    async initialize(container) {
        this.container = container;
        
        // Register all XAVS modules
        this.registerModules();
        
        // Initialize state manager
        await xavsState.initialize();
        
        // Load initial module based on state
        await this.loadInitialModule();
        
        this.initialized = true;
        console.log('[XAVS Modules] Module manager initialized');
    }

    /**
     * Register all available XAVS modules
     */
    registerModules() {
        const modules = [
            {
                id: 'welcome',
                name: 'Welcome & Overview',
                description: 'Introduction and deployment mode selection',
                path: '../xavs-welcome/welcome.js',
                icon: '🏠',
                order: 1
            },
            {
                id: 'bootstrap',
                name: 'Bootstrap',
                description: 'Initial system configuration and requirements',
                path: '../xavs-bootstrap/bootstrap.js',
                icon: '🚀',
                order: 2
            },
            {
                id: 'hosts',
                name: 'Host Management',
                description: 'Configure deployment hosts and inventory',
                path: '../xavs-hosts/hosts.js',
                icon: '🖥️',
                order: 3
            },
            {
                id: 'globals',
                name: 'Global Configuration',
                description: 'OpenStack service configuration and globals',
                path: '../xavs-globals/globals.js',
                icon: '⚙️',
                order: 4
            },
            {
                id: 'storage',
                name: 'Storage Configuration',
                description: 'Configure storage backends and policies',
                path: '../xavs-storage/storage.js',
                icon: '💾',
                order: 5
            },
            {
                id: 'networking',
                name: 'Network Configuration',
                description: 'Configure network topology and settings',
                path: '../xavs-networking/networking.js',
                icon: '🌐',
                order: 6
            },
            {
                id: 'images',
                name: 'Image Management',
                description: 'Manage container images and repositories',
                path: '../xavs-images/images.js',
                icon: '📦',
                order: 7
            },
            {
                id: 'deploy',
                name: 'Deployment',
                description: 'Execute OpenStack deployment',
                path: '../xavs-deploy/deploy.js',
                icon: '🚢',
                order: 8
            }
        ];

        modules.forEach(module => {
            this.modules.set(module.id, module);
        });

        console.log(`[XAVS Modules] Registered ${modules.length} modules`);
    }

    /**
     * Load initial module based on current state
     */
    async loadInitialModule() {
        const workflowStatus = await xavsState.getWorkflowStatus();
        
        if (workflowStatus) {
            await this.loadModule(workflowStatus.currentStep);
        } else {
            // Fallback to welcome module
            await this.loadModule('welcome');
        }
    }

    /**
     * Load a specific module
     */
    async loadModule(moduleId) {
        try {
            const moduleInfo = this.modules.get(moduleId);
            if (!moduleInfo) {
                throw new Error(`Module ${moduleId} not found`);
            }

            // Check if user can access this module
            const canNavigate = await xavsState.navigateToModule(moduleId);
            if (!canNavigate && moduleId !== 'welcome') {
                console.warn(`[XAVS Modules] Access denied to module ${moduleId}`);
                return false;
            }

            console.log(`[XAVS Modules] Loading module: ${moduleInfo.name}`);

            // Clear current container
            this.container.innerHTML = '';

            // Show loading indicator
            this.showLoadingIndicator(moduleInfo);

            try {
                // Dynamically import the module
                const moduleClass = await import(moduleInfo.path);
                
                // Instantiate the module
                const moduleInstance = new moduleClass.default();
                
                // Initialize the module
                await moduleInstance.initialize(this.container, xavsState);
                
                // Update current module
                this.currentModule = {
                    id: moduleId,
                    info: moduleInfo,
                    instance: moduleInstance
                };

                // Update navigation
                this.updateNavigation();

                console.log(`[XAVS Modules] Successfully loaded module: ${moduleInfo.name}`);
                return true;

            } catch (importError) {
                console.error(`[XAVS Modules] Failed to import module ${moduleId}:`, importError);
                this.showModuleError(moduleInfo, importError);
                return false;
            }

        } catch (error) {
            console.error(`[XAVS Modules] Failed to load module ${moduleId}:`, error);
            this.showLoadError(moduleId, error);
            return false;
        }
    }

    /**
     * Show loading indicator
     */
    showLoadingIndicator(moduleInfo) {
        this.container.innerHTML = `
            <div class="xavs-loading">
                <div class="loading-spinner"></div>
                <h3>Loading ${moduleInfo.name}</h3>
                <p>${moduleInfo.description}</p>
            </div>
        `;
    }

    /**
     * Show module error
     */
    showModuleError(moduleInfo, error) {
        this.container.innerHTML = `
            <div class="xavs-error">
                <div class="error-icon">⚠️</div>
                <h3>Module Load Error</h3>
                <p>Failed to load <strong>${moduleInfo.name}</strong></p>
                <div class="error-details">
                    <pre>${error.message}</pre>
                </div>
                <button class="btn btn-primary" onclick="window.xavsModules.retryModule('${moduleInfo.id}')">
                    Retry
                </button>
                <button class="btn btn-secondary" onclick="window.xavsModules.loadModule('welcome')">
                    Go to Welcome
                </button>
            </div>
        `;
    }

    /**
     * Show general load error
     */
    showLoadError(moduleId, error) {
        this.container.innerHTML = `
            <div class="xavs-error">
                <div class="error-icon">❌</div>
                <h3>Load Error</h3>
                <p>Failed to load module: <code>${moduleId}</code></p>
                <div class="error-details">
                    <pre>${error.message}</pre>
                </div>
                <button class="btn btn-primary" onclick="window.xavsModules.loadModule('welcome')">
                    Go to Welcome
                </button>
            </div>
        `;
    }

    /**
     * Retry loading a module
     */
    async retryModule(moduleId) {
        console.log(`[XAVS Modules] Retrying module: ${moduleId}`);
        await this.loadModule(moduleId);
    }

    /**
     * Update navigation based on current state
     */
    async updateNavigation() {
        const nav = document.querySelector('.xavs-navigation');
        if (!nav) return;

        const workflowStatus = await xavsState.getWorkflowStatus();
        const moduleArray = Array.from(this.modules.values()).sort((a, b) => a.order - b.order);

        nav.innerHTML = `
            <div class="nav-header">
                <h4>XAVS Deployment</h4>
                <div class="progress-indicator">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${workflowStatus?.progress || 0}%"></div>
                    </div>
                    <span class="progress-text">${workflowStatus?.progress || 0}% Complete</span>
                </div>
            </div>
            <div class="nav-modules">
                ${moduleArray.map(module => this.renderNavItem(module, workflowStatus)).join('')}
            </div>
            <div class="nav-footer">
                <button class="btn btn-sm btn-outline audit-btn" onclick="window.xavsModules.showAuditLog()">
                    📋 Audit Log
                </button>
                <button class="btn btn-sm btn-outline export-btn" onclick="window.xavsModules.exportState()">
                    💾 Export State
                </button>
            </div>
        `;
    }

    /**
     * Render navigation item
     */
    renderNavItem(module, workflowStatus) {
        const isCompleted = workflowStatus?.completedSteps?.includes(module.id) || false;
        const isCurrent = workflowStatus?.currentStep === module.id;
        const canAccess = this.canAccessModule(module.id, workflowStatus);
        
        const classes = [
            'nav-item',
            isCompleted ? 'completed' : '',
            isCurrent ? 'current' : '',
            canAccess ? 'accessible' : 'locked'
        ].filter(c => c).join(' ');

        const statusIcon = isCompleted ? '✅' : (isCurrent ? '▶️' : (canAccess ? '⭕' : '🔒'));

        return `
            <div class="${classes}" ${canAccess ? `onclick="window.xavsModules.loadModule('${module.id}')"` : ''}>
                <div class="nav-item-icon">
                    <span class="module-icon">${module.icon}</span>
                    <span class="status-icon">${statusIcon}</span>
                </div>
                <div class="nav-item-content">
                    <h5>${module.name}</h5>
                    <p>${module.description}</p>
                </div>
            </div>
        `;
    }

    /**
     * Check if user can access a module
     */
    canAccessModule(moduleId, workflowStatus) {
        if (moduleId === 'welcome') return true;
        
        const moduleArray = Array.from(this.modules.values()).sort((a, b) => a.order - b.order);
        const moduleIndex = moduleArray.findIndex(m => m.id === moduleId);
        
        if (moduleIndex === -1) return false;

        // Check if all previous modules are completed
        for (let i = 0; i < moduleIndex; i++) {
            const prerequisite = moduleArray[i];
            if (!workflowStatus?.completedSteps?.includes(prerequisite.id)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Show audit log modal
     */
    async showAuditLog() {
        const logs = await xavsState.getAuditLogs(50);
        
        const modal = document.createElement('div');
        modal.className = 'xavs-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Audit Log</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="audit-logs">
                        ${logs.map(log => `
                            <div class="audit-entry">
                                <div class="audit-time">${new Date(log.timestamp).toLocaleString()}</div>
                                <div class="audit-user">${log.user}</div>
                                <div class="audit-action">${log.action}</div>
                                <div class="audit-details">${JSON.stringify(log.details, null, 2)}</div>
                            </div>
                        `).join('')}
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
     * Export current state
     */
    async exportState() {
        try {
            const exportData = await xavsState.exportState();
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = `xavs-state-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);
            
            console.log('[XAVS Modules] State exported successfully');
        } catch (error) {
            console.error('[XAVS Modules] Failed to export state:', error);
            alert('Failed to export state: ' + error.message);
        }
    }

    /**
     * Get module list for external use
     */
    getModuleList() {
        return Array.from(this.modules.values()).sort((a, b) => a.order - b.order);
    }

    /**
     * Get current module info
     */
    getCurrentModule() {
        return this.currentModule;
    }

    /**
     * Check if a module is loaded
     */
    isModuleLoaded(moduleId) {
        return this.currentModule?.id === moduleId;
    }
}

// Export singleton instance
export const xavsModules = new XAVSModuleManager();

// Make it globally available for onclick handlers
window.xavsModules = xavsModules;