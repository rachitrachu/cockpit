/**
 * XAVS Wizard State Management System
 * Extends the existing state manager with wizard-specific functionality
 * Manages step progression, validation gates, and deployment workflow state
 */

// Import the base state manager (will be available as global)
// import { window.xavsState } from './state-manager.js';

class XAVSWizardState {
    constructor() {
        this.wizardStateFile = "/etc/xavs/wizard-state.json";
        this.initialized = false;
        
        // Wizard-specific state properties
        this.currentStep = 0;
        this.currentModule = null;      // Current module ID
        this.deploymentMode = null;     // 'online' | 'offline'
        this.architecture = null;       // 'allinone' | 'multinode'
        this.workflowStarted = false;
        this.stepHistory = [];
        this.moduleStates = {};
        this.validationResults = {};
        this.workflowMetadata = {
            startTime: null,
            lastUpdate: null,
            estimatedDuration: null,
            currentModule: null,
            userPreferences: {}
        };
    }

    /**
     * Initialize the wizard state management system
     */
    async initialize() {
        try {
            // Initialize base state manager first
            // We'll assume window.xavsState is available globally
            if (window.xavsState) {
                await window.xavsState.initialize();
            }
            
            // Load existing wizard state or create new
            await this.loadWizardState();
            
            this.initialized = true;
            console.log('[XAVS Wizard] Wizard state management initialized');
            
            // Log wizard initialization
            if (window.xavsState) {
                await window.xavsState.auditLog('wizard_initialized', {
                    currentStep: this.currentStep,
                    deploymentMode: this.deploymentMode,
                    workflowStarted: this.workflowStarted
                });
            }
            
            return true;
        } catch (error) {
            console.error('[XAVS Wizard] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Load wizard state from persistent storage
     */
    async loadWizardState() {
        try {
            const file = cockpit.file(this.wizardStateFile);
            const content = await file.read();
            
            if (content && content.trim()) {
                const state = JSON.parse(content);
                
                // Restore wizard state
                this.currentStep = state.currentStep || 0;
                this.deploymentMode = state.deploymentMode || null;
                this.architecture = state.architecture || null;
                this.workflowStarted = state.workflowStarted || false;
                this.stepHistory = state.stepHistory || [];
                this.moduleStates = state.moduleStates || {};
                this.validationResults = state.validationResults || {};
                this.workflowMetadata = {
                    ...this.workflowMetadata,
                    ...state.workflowMetadata
                };
                
                console.log(`[XAVS Wizard] Loaded existing wizard state - Step ${this.currentStep}`);
                return true;
            }
        } catch (error) {
            console.log('[XAVS Wizard] No existing wizard state found, creating fresh state');
        }
        
        // Initialize fresh wizard state
        await this.resetWizardState();
        return false;
    }

    /**
     * Set the current step and module
     */
    setCurrentStep(moduleId, stepIndex = 0) {
        this.currentStep = stepIndex;
        this.currentModule = moduleId;
        
        // Update workflow metadata
        this.workflowMetadata.currentModule = moduleId;
        this.workflowMetadata.lastStepChange = new Date().toISOString();
        
        // Save state asynchronously
        this.saveWizardState().catch(error => {
            console.warn('[XAVS Wizard] Failed to save state after step change:', error);
        });
        
        console.log(`[XAVS Wizard] Set current step to ${stepIndex} in module ${moduleId}`);
    }

    /**
     * Get the current step information
     */
    getCurrentStep() {
        return {
            step: this.currentStep,
            module: this.currentModule || null,
            metadata: this.workflowMetadata
        };
    }

    /**
     * Save wizard state to persistent storage
     */
    async saveWizardState() {
        try {
            const state = {
                currentStep: this.currentStep,
                deploymentMode: this.deploymentMode,
                architecture: this.architecture,
                workflowStarted: this.workflowStarted,
                stepHistory: this.stepHistory,
                moduleStates: this.moduleStates,
                validationResults: this.validationResults,
                workflowMetadata: {
                    ...this.workflowMetadata,
                    lastUpdate: new Date().toISOString()
                },
                version: '1.0.0',
                timestamp: new Date().toISOString()
            };

            const file = cockpit.file(this.wizardStateFile);
            await file.replace(JSON.stringify(state, null, 2));
            
            console.log(`[XAVS Wizard] Wizard state saved - Step ${this.currentStep}`);
            
            // Also update the main state for compatibility
            const currentMainState = await window.xavsState.loadState() || {};
            await window.xavsState.saveState({
                ...currentMainState,
                wizard: state
            });
            
            return true;
        } catch (error) {
            console.error('[XAVS Wizard] Failed to save wizard state:', error);
            return false;
        }
    }

    /**
     * Start the wizard workflow
     */
    async startWorkflow(deploymentMode = null) {
        this.workflowStarted = true;
        this.deploymentMode = deploymentMode;
        this.workflowMetadata.startTime = new Date().toISOString();
        this.currentStep = 0;
        this.stepHistory = [];
        
        await this.saveWizardState();
        
        console.log(`[XAVS Wizard] Workflow started in ${deploymentMode} mode`);
        
        // Log workflow start
        await window.xavsState.auditLog('wizard_workflow_started', {
            deploymentMode: deploymentMode,
            timestamp: this.workflowMetadata.startTime
        });
    }

    /**
     * Advance to the next step in the wizard
     */
    async proceedToNextStep(validationData = null) {
        try {
            // Record current step in history
            this.stepHistory.push({
                step: this.currentStep,
                timestamp: new Date().toISOString(),
                validationData: validationData
            });

            // Advance step
            this.currentStep++;
            
            // Save state
            await this.saveWizardState();
            
            console.log(`[XAVS Wizard] Advanced to step ${this.currentStep}`);
            
            // Log step progression
            await window.xavsState.auditLog('wizard_step_advanced', {
                fromStep: this.currentStep - 1,
                toStep: this.currentStep,
                validationPassed: validationData ? true : false
            });
            
            return true;
        } catch (error) {
            console.error('[XAVS Wizard] Failed to advance step:', error);
            return false;
        }
    }

    /**
     * Go back to previous step
     */
    async goToPreviousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            await this.saveWizardState();
            
            console.log(`[XAVS Wizard] Went back to step ${this.currentStep}`);
            
            // Log step regression
            await window.xavsState.auditLog('wizard_step_back', {
                toStep: this.currentStep
            });
            
            return true;
        }
        return false;
    }

    /**
     * Jump to a specific step (with validation)
     */
    async jumpToStep(stepNumber, skipValidation = false) {
        if (!skipValidation) {
            // Validate that user can jump to this step
            // (implement step prerequisites logic here)
        }
        
        this.currentStep = stepNumber;
        await this.saveWizardState();
        
        console.log(`[XAVS Wizard] Jumped to step ${stepNumber}`);
        
        // Log step jump
        await window.xavsState.auditLog('wizard_step_jump', {
            targetStep: stepNumber,
            skipValidation: skipValidation
        });
        
        return true;
    }

    /**
     * Save state for a specific module
     */
    async saveModuleState(moduleId, moduleState) {
        this.moduleStates[moduleId] = {
            ...moduleState,
            timestamp: new Date().toISOString()
        };
        
        await this.saveWizardState();
        console.log(`[XAVS Wizard] Saved state for module: ${moduleId}`);
    }

    /**
     * Get state for a specific module
     */
    getModuleState(moduleId) {
        return this.moduleStates[moduleId] || null;
    }

    /**
     * Save validation results for a step
     */
    async saveValidationResults(stepId, results) {
        this.validationResults[stepId] = {
            ...results,
            timestamp: new Date().toISOString()
        };
        
        await this.saveWizardState();
        console.log(`[XAVS Wizard] Saved validation results for step: ${stepId}`);
    }

    /**
     * Check if a step has passed validation
     */
    isStepValidated(stepId) {
        const results = this.validationResults[stepId];
        return results && results.valid === true;
    }

    /**
     * Reset wizard state to initial conditions
     */
    async resetWizardState() {
        this.currentStep = 0;
        this.deploymentMode = null;
        this.architecture = null;
        this.workflowStarted = false;
        this.stepHistory = [];
        this.moduleStates = {};
        this.validationResults = {};
        this.workflowMetadata = {
            startTime: null,
            lastUpdate: null,
            estimatedDuration: null,
            userPreferences: {}
        };
        
        await this.saveWizardState();
        
        console.log('[XAVS Wizard] Wizard state reset to initial conditions');
        
        // Log state reset
        await window.xavsState.auditLog('wizard_state_reset', {
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get workflow progress percentage
     */
    getProgressPercentage(totalSteps = 8) {
        return Math.round((this.currentStep / totalSteps) * 100);
    }

    /**
     * Check if workflow is resumable
     */
    isWorkflowResumable() {
        return this.workflowStarted && this.currentStep > 0;
    }

    /**
     * Get workflow summary for display
     */
    getWorkflowSummary() {
        return {
            currentStep: this.currentStep,
            deploymentMode: this.deploymentMode,
            architecture: this.architecture,
            workflowStarted: this.workflowStarted,
            progressPercentage: this.getProgressPercentage(),
            isResumable: this.isWorkflowResumable(),
            stepCount: this.stepHistory.length,
            lastUpdate: this.workflowMetadata.lastUpdate,
            startTime: this.workflowMetadata.startTime
        };
    }

    /**
     * Export wizard state for debugging/support
     */
    async exportState() {
        const state = {
            wizard: {
                currentStep: this.currentStep,
                deploymentMode: this.deploymentMode,
                architecture: this.architecture,
                workflowStarted: this.workflowStarted,
                stepHistory: this.stepHistory,
                moduleStates: this.moduleStates,
                validationResults: this.validationResults,
                workflowMetadata: this.workflowMetadata
            },
            baseState: await window.xavsState.getState(),
            exportTimestamp: new Date().toISOString()
        };
        
        return JSON.stringify(state, null, 2);
    }
}

// Create and export singleton instance
// Export class and create singleton instance
window.XAVSWizardState = XAVSWizardState;
window.xavsWizardState = new XAVSWizardState();