/**
 * XAVS Central State Management System
 * Handles state persistence, inter-module communication, and workflow orchestration
 */

export class XAVSStateManager {
    constructor() {
        this.stateFile = "/etc/xavs/state.json";
        this.auditFile = "/var/log/xavs/audit.log";
        this.configFile = "/etc/xavs/config.json";
        this.initialized = false;
    }

    /**
     * Initialize the state management system
     */
    async initialize() {
        try {
            // Ensure directories exist
            await this.ensureDirectories();
            
            // Initialize state file if it doesn't exist
            await this.initializeStateFile();
            
            this.initialized = true;
            console.log('[XAVS State] State management system initialized');
            return true;
        } catch (error) {
            console.error('[XAVS State] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Ensure required directories exist
     */
    async ensureDirectories() {
        const directories = [
            "/etc/xavs",
            "/var/log/xavs",
            "/etc/xavs/inventory",
            "/etc/xavs/backups"
        ];

        for (const dir of directories) {
            try {
                await cockpit.spawn(["mkdir", "-p", dir], { superuser: "try" });
            } catch (error) {
                console.warn(`[XAVS State] Could not create directory ${dir}:`, error);
            }
        }
    }

    /**
     * Initialize state file with default structure
     */
    async initializeStateFile() {
        try {
            // Check if state file exists
            await cockpit.file(this.stateFile, { superuser: "try" }).read();
        } catch (error) {
            // File doesn't exist, create it with default structure
            const defaultState = {
                version: "1.0.0",
                lastModified: new Date().toISOString(),
                workflow: {
                    currentStep: "welcome",
                    completedSteps: [],
                    deploymentMode: null, // 'online' | 'offline'
                    architecture: null    // 'all-in-one' | 'multi-node'
                },
                modules: {
                    welcome: { completed: false },
                    bootstrap: { completed: false },
                    hosts: { completed: false },
                    globals: { completed: false },
                    storage: { completed: false },
                    images: { completed: false },
                    deploy: { completed: false }
                },
                deployment: {
                    status: "not_started", // 'not_started' | 'in_progress' | 'completed' | 'failed'
                    startTime: null,
                    endTime: null,
                    hosts: [],
                    configuration: {}
                },
                user: {
                    lastUser: null,
                    sessionId: null
                }
            };

            await cockpit.file(this.stateFile, { superuser: "try" })
                .replace(JSON.stringify(defaultState, null, 2));
            
            console.log('[XAVS State] Default state file created');
        }
    }

    /**
     * Load current state
     */
    async loadState() {
        try {
            const content = await cockpit.file(this.stateFile, { superuser: "try" }).read();
            return JSON.parse(content);
        } catch (error) {
            console.error('[XAVS State] Failed to load state:', error);
            return null;
        }
    }

    /**
     * Save state to file
     */
    async saveState(newState) {
        try {
            const currentState = await this.loadState();
            const mergedState = { ...currentState, ...newState };
            mergedState.lastModified = new Date().toISOString();
            
            // Get current user for audit trail
            try {
                const user = await cockpit.user();
                mergedState.user.lastUser = user.name;
            } catch (error) {
                mergedState.user.lastUser = 'unknown';
            }

            await cockpit.file(this.stateFile, { superuser: "try" })
                .replace(JSON.stringify(mergedState, null, 2));
            
            console.log('[XAVS State] State saved successfully');
            return true;
        } catch (error) {
            console.error('[XAVS State] Failed to save state:', error);
            return false;
        }
    }

    /**
     * Update module state
     */
    async updateModuleState(moduleId, moduleData) {
        const currentState = await this.loadState();
        if (!currentState) return false;

        currentState.modules[moduleId] = {
            ...currentState.modules[moduleId],
            ...moduleData,
            lastModified: new Date().toISOString()
        };

        return await this.saveState(currentState);
    }

    /**
     * Mark module as completed
     */
    async completeModule(moduleId, data = {}) {
        const currentState = await this.loadState();
        if (!currentState) return false;

        // Update module
        currentState.modules[moduleId] = {
            ...currentState.modules[moduleId],
            ...data,
            completed: true,
            completedAt: new Date().toISOString()
        };

        // Add to completed steps if not already there
        if (!currentState.workflow.completedSteps.includes(moduleId)) {
            currentState.workflow.completedSteps.push(moduleId);
        }

        // Update current step to next module
        const moduleOrder = ['welcome', 'bootstrap', 'hosts', 'globals', 'storage', 'images', 'deploy'];
        const currentIndex = moduleOrder.indexOf(moduleId);
        if (currentIndex !== -1 && currentIndex < moduleOrder.length - 1) {
            currentState.workflow.currentStep = moduleOrder[currentIndex + 1];
        }

        await this.auditLog('module_completed', { moduleId, data });
        return await this.saveState(currentState);
    }

    /**
     * Get workflow status
     */
    async getWorkflowStatus() {
        const state = await this.loadState();
        if (!state) return null;

        const moduleOrder = ['welcome', 'bootstrap', 'hosts', 'globals', 'storage', 'images', 'deploy'];
        const totalSteps = moduleOrder.length;
        const completedSteps = state.workflow.completedSteps.length;
        const progress = Math.round((completedSteps / totalSteps) * 100);

        return {
            currentStep: state.workflow.currentStep,
            completedSteps: state.workflow.completedSteps,
            totalSteps: totalSteps,
            progress: progress,
            canProceed: this.canProceedToNextStep(state),
            deploymentStatus: state.deployment.status
        };
    }

    /**
     * Check if user can proceed to next step
     */
    canProceedToNextStep(state) {
        const moduleOrder = ['welcome', 'bootstrap', 'hosts', 'globals', 'storage', 'images', 'deploy'];
        const currentIndex = moduleOrder.indexOf(state.workflow.currentStep);
        
        if (currentIndex === 0) return true; // Can always start with welcome
        
        // Check if previous step is completed
        const previousStep = moduleOrder[currentIndex - 1];
        return state.modules[previousStep]?.completed || false;
    }

    /**
     * Navigate to specific module
     */
    async navigateToModule(moduleId) {
        const state = await this.loadState();
        if (!state) return false;

        // Check if user can access this module
        const moduleOrder = ['welcome', 'bootstrap', 'hosts', 'globals', 'storage', 'images', 'deploy'];
        const moduleIndex = moduleOrder.indexOf(moduleId);
        
        if (moduleIndex === -1) return false;

        // Check prerequisites
        for (let i = 0; i < moduleIndex; i++) {
            const prerequisite = moduleOrder[i];
            if (!state.modules[prerequisite]?.completed) {
                console.warn(`[XAVS State] Cannot navigate to ${moduleId}: ${prerequisite} not completed`);
                return false;
            }
        }

        state.workflow.currentStep = moduleId;
        await this.auditLog('navigation', { from: state.workflow.currentStep, to: moduleId });
        
        return await this.saveState(state);
    }

    /**
     * Audit logging
     */
    async auditLog(action, details = {}) {
        try {
            const user = await cockpit.user();
            const timestamp = new Date().toISOString();
            
            const auditEntry = {
                timestamp,
                user: user.name || 'unknown',
                action,
                details,
                sessionId: cockpit.transport?.options?.channel || 'unknown'
            };

            // Append to audit file
            const logLine = JSON.stringify(auditEntry) + '\n';
            await cockpit.file(this.auditFile, { superuser: "try" }).modify(
                content => (content || '') + logLine
            );

            // Also log to systemd journal
            cockpit.spawn([
                "systemd-cat", "-t", "xavs-audit", "-p", "info"
            ], {
                input: JSON.stringify(auditEntry),
                superuser: "try"
            }).catch(() => {}); // Don't fail if systemd-cat is not available

            console.log(`[XAVS Audit] ${action}:`, details);
        } catch (error) {
            console.error('[XAVS Audit] Failed to write audit log:', error);
        }
    }

    /**
     * Get audit logs
     */
    async getAuditLogs(limit = 100) {
        try {
            const content = await cockpit.file(this.auditFile, { superuser: "try" }).read();
            const lines = content.split('\n').filter(line => line.trim());
            
            return lines
                .slice(-limit)
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(entry => entry !== null)
                .reverse(); // Most recent first
        } catch (error) {
            console.error('[XAVS Audit] Failed to read audit logs:', error);
            return [];
        }
    }

    /**
     * Export state for backup
     */
    async exportState() {
        const state = await this.loadState();
        const auditLogs = await this.getAuditLogs(1000);
        
        return {
            state,
            auditLogs,
            exportTime: new Date().toISOString(),
            version: "1.0.0"
        };
    }

    /**
     * Import state from backup
     */
    async importState(exportedData) {
        try {
            await this.saveState(exportedData.state);
            
            // Import audit logs
            const auditContent = exportedData.auditLogs
                .map(entry => JSON.stringify(entry))
                .join('\n') + '\n';
            
            await cockpit.file(this.auditFile, { superuser: "try" }).replace(auditContent);
            
            await this.auditLog('state_imported', { 
                version: exportedData.version,
                importTime: new Date().toISOString() 
            });
            
            return true;
        } catch (error) {
            console.error('[XAVS State] Failed to import state:', error);
            return false;
        }
    }
}

// Export singleton instance
export const xavsState = new XAVSStateManager();