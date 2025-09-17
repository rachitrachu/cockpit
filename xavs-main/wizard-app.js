/**
 * XAVS Wizard Application
 * Main orchestrator for the XAVS OpenStack deployment wizard
 * Integrates state management, navigation, and UI components
 */

// Dependencies will be loaded via script tags and available as globals

class XAVSWizardApp {
    constructor() {
        this.initialized = false;
        this.currentModuleInstance = null;
        this.uiElements = {};
        this.autoSaveInterval = null;
        this.emergencyStopRequested = false;
    }

    /**
     * Initialize the wizard application
     */
    async initialize() {
        try {
            console.log('[XAVS Wizard] Starting XAVS Deployment Wizard...');
            
            // Check if required globals are available
            if (!window.xavsWizardState || !window.xavsWizardNavigation) {
                throw new Error('Required wizard modules not loaded');
            }
            
            // Initialize UI elements
            this.initializeUIElements();
            
            // Initialize core systems
            await this.initializeCoreystems();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Load initial state and UI
            await this.loadInitialState();
            
            // Start auto-save
            this.startAutoSave();
            
            this.initialized = true;
            console.log('[XAVS Wizard] Wizard application initialized successfully');
            
        } catch (error) {
            console.error('[XAVS Wizard] Initialization failed:', error);
            this.showErrorState(error);
        }
    }

    /**
     * Initialize UI element references
     */
    initializeUIElements() {
        this.uiElements = {
            // Progress elements
            progressFill: document.getElementById('progress-fill'),
            progressText: document.getElementById('progress-text'),
            progressPercentage: document.getElementById('progress-percentage'),
            
            // Breadcrumbs
            breadcrumbs: document.getElementById('wizard-breadcrumbs'),
            
            // Steps list
            stepsList: document.getElementById('wizard-steps-list'),
            
            // Step header
            stepIcon: document.getElementById('step-icon'),
            stepTitle: document.getElementById('step-title'),
            stepDescription: document.getElementById('step-description'),
            stepStatus: document.getElementById('step-status'),
            
            // Mode and architecture indicators
            modeIcon: document.getElementById('mode-icon'),
            modeTitle: document.getElementById('mode-title'),
            modeSubtitle: document.getElementById('mode-subtitle'),
            archIndicator: document.getElementById('wizard-arch'),
            archIcon: document.getElementById('arch-icon'),
            archTitle: document.getElementById('arch-title'),
            archSubtitle: document.getElementById('arch-subtitle'),
            
            // Module container
            moduleContainer: document.getElementById('wizard-module-container'),
            loading: document.getElementById('wizard-loading'),
            validation: document.getElementById('wizard-validation'),
            validationContent: document.getElementById('validation-content'),
            
            // Footer elements
            workflowStatus: document.getElementById('workflow-status'),
            workflowTime: document.getElementById('workflow-time'),
            autoSave: document.getElementById('auto-save'),
            footerStepCounter: document.getElementById('footer-step-counter'),
            footerStepName: document.getElementById('footer-step-name'),
            
            // Navigation buttons
            prevButton: document.getElementById('wizard-prev'),
            nextButton: document.getElementById('wizard-next'),
            skipButton: document.getElementById('wizard-skip'),
            deployButton: document.getElementById('wizard-deploy'),
            
            // Header actions
            helpButton: document.getElementById('wizard-help'),
            exportButton: document.getElementById('wizard-export'),
            resetButton: document.getElementById('wizard-reset'),
            
            // Overlays
            overlay: document.getElementById('wizard-overlay'),
            overlayTitle: document.getElementById('overlay-title'),
            overlayBody: document.getElementById('overlay-body'),
            overlayClose: document.getElementById('overlay-close'),
            overlayCancel: document.getElementById('overlay-cancel'),
            overlayConfirm: document.getElementById('overlay-confirm'),
            
            // Emergency stop
            emergency: document.getElementById('wizard-emergency'),
            emergencyCancel: document.getElementById('emergency-cancel'),
            emergencyConfirm: document.getElementById('emergency-confirm')
        };

        console.log('[XAVS Wizard] UI elements initialized');
    }

    /**
     * Initialize core wizard systems
     */
    async initializeCoreystems() {
        // Navigation controller is auto-initialized in constructor
        // Just verify it exists and is ready
        if (!window.xavsWizardNavigation) {
            throw new Error('Navigation controller not available');
        }

        console.log('[XAVS Wizard] Core systems initialized');
    }

    /**
     * Set up event handlers for the wizard UI
     */
    setupEventHandlers() {
        // Navigation buttons
        this.uiElements.prevButton && this.uiElements.prevButton.addEventListener('click', () => this.handlePreviousStep());
        this.uiElements.nextButton && this.uiElements.nextButton.addEventListener('click', () => this.handleNextStep());
        this.uiElements.skipButton && this.uiElements.skipButton.addEventListener('click', () => this.handleSkipStep());
        this.uiElements.deployButton && this.uiElements.deployButton.addEventListener('click', () => this.handleDeploy());

        // Header actions
        this.uiElements.helpButton && this.uiElements.helpButton.addEventListener('click', () => this.showHelp());
        this.uiElements.exportButton && this.uiElements.exportButton.addEventListener('click', () => this.exportConfiguration());
        this.uiElements.resetButton && this.uiElements.resetButton.addEventListener('click', () => this.showResetConfirmation());

        // Overlay handlers
        this.uiElements.overlayClose && this.uiElements.overlayClose.addEventListener('click', () => this.hideOverlay());
        this.uiElements.overlayCancel && this.uiElements.overlayCancel.addEventListener('click', () => this.hideOverlay());
        this.uiElements.overlayConfirm && this.uiElements.overlayConfirm.addEventListener('click', () => this.handleOverlayConfirm());

        // Emergency stop handlers
        this.uiElements.emergencyCancel && this.uiElements.emergencyCancel.addEventListener('click', () => this.hideEmergencyDialog());
        this.uiElements.emergencyConfirm && this.uiElements.emergencyConfirm.addEventListener('click', () => this.performEmergencyStop());

        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => this.handleKeyboardShortcuts(event));

        // Window beforeunload for unsaved changes
        window.addEventListener('beforeunload', (event) => this.handleBeforeUnload(event));

        console.log('[XAVS Wizard] Event handlers set up');
    }

    /**
     * Load initial state and update UI
     */
    async loadInitialState() {
        // Get current wizard state
        const summary = window.xavsWizardState.getWorkflowSummary();
        
        // Update mode indicator
        this.updateModeIndicator(summary.deploymentMode);
        
        // Update architecture indicator if set
        if (window.xavsWizardState.architecture) {
            this.updateArchitectureIndicator(window.xavsWizardState.architecture);
        }
        
        // Update workflow status
        this.updateWorkflowStatus(summary);
        
        // Load current step
        await this.loadCurrentStep();
        
        console.log('[XAVS Wizard] Initial state loaded');
    }

    /**
     * Load and display the current wizard step
     */
    async loadCurrentStep() {
        try {
            this.showLoading('Loading wizard step...');
            
            // Get navigation info
            const navInfo = window.xavsWizardNavigation.getNavigationInfo();
            
            // Update progress
            this.updateProgress(navInfo);
            
            // Update steps list
            this.updateStepsList(navInfo.steps);
            
            // Update breadcrumbs
            this.updateBreadcrumbs(navInfo.steps, navInfo.currentStepIndex);
            
            // Update step header
            this.updateStepHeader(navInfo.currentStep);
            
            // Update navigation buttons
            this.updateNavigationButtons(navInfo);
            
            // Load current module
            await this.loadCurrentModule();
            
            this.hideLoading();
            
        } catch (error) {
            console.error('[XAVS Wizard] Failed to load current step:', error);
            this.showError('Failed to load wizard step');
        }
    }

    /**
     * Load the current module instance
     */
    async loadCurrentModule() {
        const navInfo = window.xavsWizardNavigation.getNavigationInfo();
        const currentStep = navInfo.currentStep;
        
        if (!currentStep) {
            console.warn('[XAVS Wizard] No current step to load');
            return;
        }

        try {
            // Unload previous module if exists
            if (this.currentModuleInstance) {
                await this.currentModuleInstance.onExit();
                this.currentModuleInstance = null;
            }

            // Clear module container
            this.uiElements.moduleContainer.innerHTML = '';
            
            // Try to load module dynamically
            const moduleContainer = document.createElement('div');
            moduleContainer.className = 'module-content';
            this.uiElements.moduleContainer.appendChild(moduleContainer);
            
            // For now, show a placeholder - modules will be integrated later
            this.showModulePlaceholder(currentStep, moduleContainer);
            
        } catch (error) {
            console.error(`[XAVS Wizard] Failed to load module ${currentStep.id}:`, error);
            this.showModuleError(error, currentStep);
        }
    }

    /**
     * Show a placeholder for modules (temporary)
     */
    showModulePlaceholder(step, container) {
        container.innerHTML = `
            <div class="module-placeholder">
                <div class="placeholder-icon">
                    <i class="${step.icon || 'fas fa-cog'}"></i>
                </div>
                <h3>${step.title} Module</h3>
                <p>${step.description}</p>
                <div class="placeholder-info">
                    <p><strong>Module ID:</strong> ${step.id}</p>
                    <p><strong>Module Path:</strong> ${step.module}</p>
                    <p><strong>Required:</strong> ${step.required ? 'Yes' : 'No'}</p>
                    ${step.condition ? `<p><strong>Condition:</strong> ${step.condition}</p>` : ''}
                </div>
                <div class="placeholder-actions">
                    <button class="btn btn-outline" onclick="this.closest('.module-placeholder').querySelector('.placeholder-details').style.display = this.closest('.module-placeholder').querySelector('.placeholder-details').style.display === 'none' ? 'block' : 'none'">
                        Show Details
                    </button>
                </div>
                <div class="placeholder-details" style="display: none;">
                    <h4>Module Integration Status</h4>
                    <p>This module is ready to be integrated into the wizard framework. The module will implement:</p>
                    <ul>
                        <li>Module-specific configuration interface</li>
                        <li>Validation logic for user inputs</li>
                        <li>State persistence and restoration</li>
                        <li>Integration with the wizard navigation flow</li>
                    </ul>
                </div>
            </div>
        `;
    }

    /**
     * Show module loading error
     */
    showModuleError(error, step) {
        this.uiElements.moduleContainer.innerHTML = `
            <div class="module-error">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Failed to Load Module</h3>
                <p>There was an error loading the ${step.title} module.</p>
                <div class="error-details">
                    <strong>Error:</strong> ${error.message}
                </div>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick="location.reload()">Reload Page</button>
                    <button class="btn btn-outline" onclick="console.log('Error details:', ${JSON.stringify(error)})">Show Console</button>
                </div>
            </div>
        `;
    }

    /**
     * Update progress indicators
     */
    updateProgress(navInfo) {
        const percentage = navInfo.progress;
        
        // Update progress bar
        if (this.uiElements.progressFill) {
            this.uiElements.progressFill.style.width = `${percentage}%`;
        }
        
        // Update progress text
        if (this.uiElements.progressText) {
            this.uiElements.progressText.textContent = `Step ${navInfo.currentStepIndex + 1} of ${navInfo.totalSteps}`;
        }
        
        // Update progress percentage
        if (this.uiElements.progressPercentage) {
            this.uiElements.progressPercentage.textContent = `${Math.round(percentage)}%`;
        }
        
        // Update footer step counter
        if (this.uiElements.footerStepCounter) {
            this.uiElements.footerStepCounter.textContent = `Step ${navInfo.currentStepIndex + 1} of ${navInfo.totalSteps}`;
        }
        
        // Update footer step name
        if (this.uiElements.footerStepName) {
            this.uiElements.footerStepName.textContent = navInfo.currentStep && navInfo.currentStep.title ? navInfo.currentStep.title : 'Unknown';
        }
    }

    /**
     * Update steps list in sidebar
     */
    updateStepsList(steps) {
        if (!this.uiElements.stepsList) return;
        
        this.uiElements.stepsList.innerHTML = steps.map((step, index) => `
            <div class="wizard-step-item ${step.isActive ? 'active' : ''} ${step.isCompleted ? 'completed' : ''}" 
                 data-step-id="${step.id}" 
                 onclick="xavsWizardApp.jumpToStep('${step.id}')">
                <div class="step-icon">
                    <i class="${step.icon || 'fas fa-circle'}"></i>
                </div>
                <div class="step-content">
                    <div class="step-title">${step.title}</div>
                    <div class="step-desc">${step.description}</div>
                </div>
                ${step.isCompleted ? '<div class="step-status"><i class="fas fa-check"></i></div>' : ''}
                ${step.isValidated ? '<div class="step-status"><i class="fas fa-check-circle"></i></div>' : ''}
            </div>
        `).join('');
    }

    /**
     * Update breadcrumbs navigation
     */
    updateBreadcrumbs(steps, currentIndex) {
        if (!this.uiElements.breadcrumbs) return;
        
        const breadcrumbItems = steps.slice(0, currentIndex + 1).map((step, index) => `
            <li class="breadcrumb-item ${index === currentIndex ? 'active' : ''}" 
                ${index < currentIndex ? `onclick="xavsWizardApp.jumpToStep('${step.id}')"` : ''}>
                <i class="${step.icon || 'fas fa-circle'}"></i>
                ${step.title}
            </li>
        `).join('');
        
        this.uiElements.breadcrumbs.innerHTML = `<ol class="breadcrumb">${breadcrumbItems}</ol>`;
    }

    /**
     * Update step header information
     */
    updateStepHeader(step) {
        if (!step) return;
        
        if (this.uiElements.stepIcon) {
            this.uiElements.stepIcon.innerHTML = `<i class="${step.icon || 'fas fa-circle'}"></i>`;
        }
        
        if (this.uiElements.stepTitle) {
            this.uiElements.stepTitle.textContent = step.title || 'Unknown Step';
        }
        
        if (this.uiElements.stepDescription) {
            this.uiElements.stepDescription.textContent = step.description || '';
        }
        
        // Update step status
        if (this.uiElements.stepStatus) {
            let statusHTML = '';
            if (step.isCompleted) {
                statusHTML = '<i class="fas fa-check-circle" style="color: var(--success);"></i> <span>Completed</span>';
            } else if (step.isActive) {
                statusHTML = '<i class="fas fa-circle" style="color: var(--brand);"></i> <span>In Progress</span>';
            }
            this.uiElements.stepStatus.innerHTML = statusHTML;
        }
    }

    /**
     * Update navigation buttons state
     */
    updateNavigationButtons(navInfo) {
        // Previous button
        if (this.uiElements.prevButton) {
            this.uiElements.prevButton.disabled = !navInfo.canGoBack;
        }
        
        // Next button
        if (this.uiElements.nextButton) {
            this.uiElements.nextButton.disabled = !navInfo.canGoNext;
            
            // Change text for last step
            if (navInfo.currentStepIndex === navInfo.totalSteps - 1) {
                this.uiElements.nextButton.innerHTML = '<i class="fas fa-check"></i> Complete';
            } else {
                this.uiElements.nextButton.innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
            }
        }
        
        // Skip button (show for optional steps)
        if (this.uiElements.skipButton) {
            const currentStep = navInfo.currentStep;
            if (currentStep && !currentStep.required) {
                this.uiElements.skipButton.style.display = 'inline-flex';
            } else {
                this.uiElements.skipButton.style.display = 'none';
            }
        }
        
        // Deploy button (show on last step)
        if (this.uiElements.deployButton) {
            if (navInfo.currentStepIndex === navInfo.totalSteps - 1) {
                this.uiElements.deployButton.style.display = 'inline-flex';
            } else {
                this.uiElements.deployButton.style.display = 'none';
            }
        }
    }

    /**
     * Update mode indicator
     */
    updateModeIndicator(deploymentMode) {
        if (!deploymentMode) return;
        
        const modeConfig = {
            'online': {
                icon: 'fas fa-globe',
                title: 'Online Deployment',
                subtitle: 'Internet-connected installation'
            },
            'offline': {
                icon: 'fas fa-server',
                title: 'Offline Deployment', 
                subtitle: 'Air-gapped installation'
            }
        };
        
        const config = modeConfig[deploymentMode];
        if (config) {
            if (this.uiElements.modeIcon) {
                this.uiElements.modeIcon.className = config.icon;
            }
            if (this.uiElements.modeTitle) {
                this.uiElements.modeTitle.textContent = config.title;
            }
            if (this.uiElements.modeSubtitle) {
                this.uiElements.modeSubtitle.textContent = config.subtitle;
            }
        }
    }

    /**
     * Update architecture indicator
     */
    updateArchitectureIndicator(architecture) {
        if (!architecture) return;
        
        const archConfig = {
            'allinone': {
                icon: 'fas fa-server',
                title: 'All-in-One',
                subtitle: 'Single node deployment'
            },
            'multinode': {
                icon: 'fas fa-sitemap',
                title: 'Multi-Node',
                subtitle: 'Distributed deployment'
            }
        };
        
        const config = archConfig[architecture];
        if (config && this.uiElements.archIndicator) {
            this.uiElements.archIndicator.style.display = 'flex';
            
            if (this.uiElements.archIcon) {
                this.uiElements.archIcon.className = config.icon;
            }
            if (this.uiElements.archTitle) {
                this.uiElements.archTitle.textContent = config.title;
            }
            if (this.uiElements.archSubtitle) {
                this.uiElements.archSubtitle.textContent = config.subtitle;
            }
        }
    }

    /**
     * Update workflow status information
     */
    updateWorkflowStatus(summary) {
        if (this.uiElements.workflowTime) {
            if (summary.startTime) {
                const startTime = new Date(summary.startTime);
                const elapsed = Date.now() - startTime.getTime();
                const minutes = Math.floor(elapsed / 60000);
                this.uiElements.workflowTime.textContent = `Started ${minutes}m ago`;
            } else {
                this.uiElements.workflowTime.textContent = 'Not started';
            }
        }
    }

    // ===== Event Handlers =====

    /**
     * Handle previous step navigation
     */
    async handlePreviousStep() {
        const result = await window.xavsWizardNavigation.goToPrevious();
        if (result.success) {
            await this.loadCurrentStep();
        } else {
            this.showError(`Cannot go to previous step: ${result.reason}`);
        }
    }

    /**
     * Handle next step navigation
     */
    async handleNextStep() {
        // Validate current step first
        if (this.currentModuleInstance) {
            const validation = await this.currentModuleInstance.validate();
            if (!validation.valid) {
                this.showValidationErrors(validation.errors);
                return;
            }
        }

        const result = await window.xavsWizardNavigation.proceedToNext();
        if (result.success) {
            await this.loadCurrentStep();
        } else {
            this.showError(`Cannot proceed to next step: ${result.reason}`);
        }
    }

    /**
     * Handle skip step (for optional steps)
     */
    async handleSkipStep() {
        // Skip validation and proceed
        const result = await window.xavsWizardNavigation.proceedToNext();
        if (result.success) {
            await this.loadCurrentStep();
        }
    }

    /**
     * Handle deploy action
     */
    async handleDeploy() {
        this.showOverlay('Deploy OpenStack', `
            <p>You are about to start the OpenStack deployment process. This will:</p>
            <ul>
                <li>Execute Ansible playbooks on your target hosts</li>
                <li>Deploy and configure OpenStack services</li>
                <li>Set up networking and storage backends</li>
            </ul>
            <p><strong>This process may take 30-60 minutes to complete.</strong></p>
            <p>Are you ready to proceed?</p>
        `, 'Start Deployment');
    }

    /**
     * Jump to a specific step
     */
    async jumpToStep(stepId) {
        const result = await window.xavsWizardNavigation.jumpToStep(stepId);
        if (result.success) {
            await this.loadCurrentStep();
        } else {
            this.showError(`Cannot jump to step: ${result.reason}`);
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(event) {
        // Don't interfere with input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key) {
            case 'ArrowLeft':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.handlePreviousStep();
                }
                break;
            case 'ArrowRight':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.handleNextStep();
                }
                break;
            case 'Escape':
                this.hideOverlay();
                this.hideEmergencyDialog();
                break;
        }
    }

    /**
     * Handle before unload (unsaved changes warning)
     */
    handleBeforeUnload(event) {
        if (window.xavsWizardState.workflowStarted && !this.emergencyStopRequested) {
            event.preventDefault();
            event.returnValue = 'You have an active deployment workflow. Are you sure you want to leave?';
            return event.returnValue;
        }
    }

    // ===== Utility Methods =====

    /**
     * Show loading state
     */
    showLoading(message = 'Loading...') {
        if (this.uiElements.loading) {
            this.uiElements.loading.style.display = 'flex';
            const loadingText = this.uiElements.loading.querySelector('.loading-text');
            if (loadingText) {
                loadingText.textContent = message;
            }
        }
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        if (this.uiElements.loading) {
            this.uiElements.loading.style.display = 'none';
        }
    }

    /**
     * Show validation errors
     */
    showValidationErrors(errors) {
        if (!errors || errors.length === 0) return;
        
        if (this.uiElements.validation && this.uiElements.validationContent) {
            this.uiElements.validationContent.innerHTML = `
                <div class="error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <h4>Please correct the following issues:</h4>
                        <ul>
                            ${errors.map(error => `<li>${error}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
            this.uiElements.validation.style.display = 'block';
            this.uiElements.validation.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Hide validation errors
     */
    hideValidationErrors() {
        if (this.uiElements.validation) {
            this.uiElements.validation.style.display = 'none';
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showOverlay('Error', `<p>${message}</p>`, 'OK');
    }

    /**
     * Show error state for critical failures
     */
    showErrorState(error) {
        document.body.innerHTML = `
            <div class="wizard-error-state">
                <div class="error-container">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h1>Wizard Initialization Failed</h1>
                    <p>The XAVS deployment wizard encountered an error during startup.</p>
                    <div class="error-details">
                        <strong>Error:</strong> ${error.message}
                    </div>
                    <div class="error-actions">
                        <button class="btn btn-primary" onclick="location.reload()">Reload Page</button>
                        <button class="btn btn-outline" onclick="window.history.back()">Go Back</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Show overlay dialog
     */
    showOverlay(title, content, confirmText = 'OK') {
        if (this.uiElements.overlay) {
            if (this.uiElements.overlayTitle) {
                this.uiElements.overlayTitle.textContent = title;
            }
            if (this.uiElements.overlayBody) {
                this.uiElements.overlayBody.innerHTML = content;
            }
            if (this.uiElements.overlayConfirm) {
                this.uiElements.overlayConfirm.textContent = confirmText;
            }
            this.uiElements.overlay.style.display = 'flex';
        }
    }

    /**
     * Hide overlay dialog
     */
    hideOverlay() {
        if (this.uiElements.overlay) {
            this.uiElements.overlay.style.display = 'none';
        }
    }

    /**
     * Handle overlay confirm action
     */
    handleOverlayConfirm() {
        // This would be customized based on the overlay context
        this.hideOverlay();
    }

    /**
     * Show reset confirmation
     */
    showResetConfirmation() {
        this.showOverlay('Reset Wizard', `
            <p>This will reset the wizard to its initial state. All progress and configuration will be lost.</p>
            <p><strong>This action cannot be undone.</strong></p>
            <p>Are you sure you want to continue?</p>
        `, 'Reset Wizard');
    }

    /**
     * Show emergency dialog
     */
    showEmergencyDialog() {
        if (this.uiElements.emergency) {
            this.uiElements.emergency.style.display = 'flex';
        }
    }

    /**
     * Hide emergency dialog
     */
    hideEmergencyDialog() {
        if (this.uiElements.emergency) {
            this.uiElements.emergency.style.display = 'none';
        }
    }

    /**
     * Perform emergency stop
     */
    async performEmergencyStop() {
        this.emergencyStopRequested = true;
        this.hideEmergencyDialog();
        
        try {
            // Stop any running processes
            await this.stopAllProcesses();
            
            // Reset wizard state
            await window.xavsWizardNavigation.resetWorkflow();
            
            // Reload to initial state
            location.reload();
            
        } catch (error) {
            console.error('[XAVS Wizard] Emergency stop failed:', error);
            this.showError('Emergency stop failed. Please refresh the page manually.');
        }
    }

    /**
     * Stop all running processes
     */
    async stopAllProcesses() {
        // This would stop any running Ansible processes, etc.
        console.log('[XAVS Wizard] Stopping all processes...');
    }

    /**
     * Show help documentation
     */
    showHelp() {
        this.showOverlay('Wizard Help', `
            <h4>XAVS Deployment Wizard</h4>
            <p>This wizard guides you through the OpenStack deployment process.</p>
            
            <h5>Navigation</h5>
            <ul>
                <li>Use <strong>Next</strong> and <strong>Previous</strong> buttons to navigate</li>
                <li>Click on steps in the sidebar to jump between completed steps</li>
                <li>Use <strong>Ctrl + Arrow Keys</strong> for keyboard navigation</li>
            </ul>
            
            <h5>Features</h5>
            <ul>
                <li><strong>Auto-save:</strong> Your progress is automatically saved</li>
                <li><strong>Validation:</strong> Each step validates your configuration</li>
                <li><strong>Resume:</strong> You can resume from where you left off</li>
            </ul>
        `, 'Close');
    }

    /**
     * Export configuration
     */
    async exportConfiguration() {
        try {
            const exportData = await window.xavsWizardState.exportState();
            const blob = new Blob([exportData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `xavs-config-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('[XAVS Wizard] Export failed:', error);
            this.showError('Failed to export configuration');
        }
    }

    /**
     * Start auto-save functionality
     */
    startAutoSave() {
        this.autoSaveInterval = setInterval(async () => {
            try {
                if (this.currentModuleInstance && typeof this.currentModuleInstance.getState === 'function') {
                    const moduleState = await this.currentModuleInstance.getState();
                    const currentStep = window.xavsWizardNavigation.getCurrentStep();
                    if (currentStep) {
                        await window.xavsWizardState.saveModuleState(currentStep.id, moduleState);
                    }
                }
                
                // Update auto-save indicator
                if (this.uiElements.autoSave) {
                    this.uiElements.autoSave.style.opacity = '1';
                    setTimeout(() => {
                        this.uiElements.autoSave.style.opacity = '0.7';
                    }, 1000);
                }
                
            } catch (error) {
                console.warn('[XAVS Wizard] Auto-save failed:', error);
            }
        }, 30000); // Auto-save every 30 seconds
    }

    /**
     * Stop auto-save
     */
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Cleanup wizard application
     */
    cleanup() {
        this.stopAutoSave();
        
        if (this.currentModuleInstance && typeof this.currentModuleInstance.onExit === 'function') {
            this.currentModuleInstance.onExit();
        }
        
        // Remove event listeners
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
        
        console.log('[XAVS Wizard] Wizard application cleaned up');
    }
}

// Create global instance
const xavsWizardApp = new XAVSWizardApp();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => xavsWizardApp.initialize());
} else {
    xavsWizardApp.initialize();
}

// Make available globally for debugging and module access
window.xavsWizardApp = xavsWizardApp;

// Export for module usage (not used in non-module version)
// export default xavsWizardApp;