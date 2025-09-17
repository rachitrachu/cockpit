/**
 * XAVS Wizard Navigation
 * Provides navigation and flow control for the wizard framework
 * Integrates with XAVS_WIZARD_REGISTRY for step definitions
 */

(function() {
    'use strict';

    class XAVSWizardNavigation {
        constructor() {
            this.currentModuleId = null;
            this.currentStepIndex = 0;
            this.visitedSteps = new Set();
            this.completedSteps = new Set();
            this.registry = window.XAVS_WIZARD_REGISTRY;
            
            if (!this.registry) {
                console.warn('XAVS_WIZARD_REGISTRY not found, navigation may be limited');
                this.registry = { steps: [], integrations: {} };
            }
            
            this.initializeNavigation();
        }

        initializeNavigation() {
            this.bindEvents();
            this.loadInitialStep();
        }

        bindEvents() {
            // Navigation button handlers
            this.bindButton('wizard-prev-btn', () => this.navigatePrevious());
            this.bindButton('wizard-next-btn', () => this.navigateNext());
            this.bindButton('wizard-finish-btn', () => this.finishWizard());
            this.bindButton('wizard-cancel-btn', () => this.cancelWizard());

            // Step click handlers
            this.bindStepNavigation();
        }

        bindButton(buttonId, handler) {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', handler);
            }
        }

        bindStepNavigation() {
            document.addEventListener('click', (event) => {
                if (event.target.matches('.wizard-step-item, .wizard-step-item *')) {
                    const stepItem = event.target.closest('.wizard-step-item');
                    if (stepItem) {
                        const moduleId = stepItem.dataset.moduleId;
                        const stepIndex = parseInt(stepItem.dataset.stepIndex, 10);
                        if (moduleId && !isNaN(stepIndex)) {
                            this.navigateToStep(moduleId, stepIndex);
                        }
                    }
                }
            });
        }

        loadInitialStep() {
            if (this.registry.steps.length > 0) {
                const firstStep = this.registry.steps[0];
                this.navigateToStep(firstStep.moduleId, 0);
            } else {
                // Fallback to welcome module
                this.navigateToStep('xavs-welcome', 0);
            }
        }

        navigateToStep(moduleId, stepIndex = 0) {
            console.log('Navigating to step:', moduleId, 'index:', stepIndex);
            
            // Update current position
            this.currentModuleId = moduleId;
            this.currentStepIndex = stepIndex;
            
            // Mark as visited
            this.visitedSteps.add(moduleId + '-' + stepIndex);
            
            // Update UI
            this.updateStepIndicators();
            this.updateNavigationButtons();
            
            // Load the module
            this.loadModule(moduleId);
            
            // Update wizard state
            if (window.xavsWizardState) {
                window.xavsWizardState.setCurrentStep(moduleId, stepIndex);
            }
            
            // Fire navigation event
            this.fireNavigationEvent('stepChanged', {
                moduleId: moduleId,
                stepIndex: stepIndex,
                isVisited: this.visitedSteps.has(moduleId + '-' + stepIndex),
                isCompleted: this.completedSteps.has(moduleId + '-' + stepIndex)
            });
        }

        navigateNext() {
            const currentStep = this.getCurrentStepInfo();
            if (!currentStep) return;
            
            // Validate current step before proceeding
            if (!this.validateCurrentStep()) {
                console.warn('Current step validation failed');
                return;
            }
            
            // Mark current step as completed
            this.markStepCompleted(this.currentModuleId, this.currentStepIndex);
            
            // Find next step
            const nextStep = this.getNextStep();
            if (nextStep) {
                this.navigateToStep(nextStep.moduleId, nextStep.stepIndex);
            } else {
                console.log('No next step available');
                this.updateNavigationButtons();
            }
        }

        navigatePrevious() {
            const prevStep = this.getPreviousStep();
            if (prevStep) {
                this.navigateToStep(prevStep.moduleId, prevStep.stepIndex);
            } else {
                console.log('No previous step available');
            }
        }

        getNextStep() {
            const currentStepGlobalIndex = this.getCurrentStepGlobalIndex();
            if (currentStepGlobalIndex >= 0 && currentStepGlobalIndex < this.registry.steps.length - 1) {
                const nextStep = this.registry.steps[currentStepGlobalIndex + 1];
                return {
                    moduleId: nextStep.moduleId,
                    stepIndex: this.getModuleStepIndex(nextStep.moduleId, nextStep.stepId)
                };
            }
            return null;
        }

        getPreviousStep() {
            const currentStepGlobalIndex = this.getCurrentStepGlobalIndex();
            if (currentStepGlobalIndex > 0) {
                const prevStep = this.registry.steps[currentStepGlobalIndex - 1];
                return {
                    moduleId: prevStep.moduleId,
                    stepIndex: this.getModuleStepIndex(prevStep.moduleId, prevStep.stepId)
                };
            }
            return null;
        }

        getCurrentStepGlobalIndex() {
            for (let i = 0; i < this.registry.steps.length; i++) {
                const step = this.registry.steps[i];
                if (step.moduleId === this.currentModuleId) {
                    const moduleStepIndex = this.getModuleStepIndex(step.moduleId, step.stepId);
                    if (moduleStepIndex === this.currentStepIndex) {
                        return i;
                    }
                }
            }
            return -1;
        }

        getModuleStepIndex(moduleId, stepId) {
            // For now, return 0 as we're treating each module as having one main step
            return 0;
        }

        getCurrentStepInfo() {
            const globalIndex = this.getCurrentStepGlobalIndex();
            if (globalIndex >= 0) {
                return this.registry.steps[globalIndex];
            }
            return null;
        }

        validateCurrentStep() {
            // Get validation function from integration mapping
            const integration = this.registry.integrations[this.currentModuleId];
            if (integration && integration.validate) {
                try {
                    return integration.validate();
                } catch (error) {
                    console.error('Validation error for', this.currentModuleId, ':', error);
                    return false;
                }
            }
            
            // Default validation - check if module interface reports valid state
            if (window.ModuleInterface) {
                try {
                    // Special cases for steps that should always allow progression
                    if (this.currentModuleId === 'xavs-welcome' || 
                        this.currentModuleId === 'xavs-main') {
                        console.log(`[Wizard Navigation] ${this.currentModuleId} step - allowing progression`);
                        return true;
                    }
                    
                    // Small delay to ensure DOM is updated after container creation
                    setTimeout(() => {}, 10);
                    
                    const moduleData = window.ModuleInterface.getModuleData(this.currentModuleId);
                    
                    // If no data found, check if we have basic form inputs directly
                    if (!moduleData || Object.keys(moduleData).length === 0) {
                        // Try multiple search strategies for the container
                        let container = document.getElementById(`${this.currentModuleId}-container`) ||
                                       document.querySelector(`[data-module-id="${this.currentModuleId}"]`) ||
                                       document.querySelector(`[id*="${this.currentModuleId}"]`);
                        
                        if (container) {
                            const inputs = container.querySelectorAll('input, select, textarea');
                            console.log(`[Wizard Navigation] Found ${inputs.length} form inputs in ${this.currentModuleId}`);
                            return inputs.length > 0; // Allow if we have any form inputs
                        } else {
                            console.log(`[Wizard Navigation] No container found for ${this.currentModuleId}, allowing progression`);
                            return true; // Allow progression if no container found
                        }
                    }
                    
                    return moduleData && Object.keys(moduleData).length > 0;
                } catch (error) {
                    console.warn('Default validation failed for', this.currentModuleId, ':', error);
                    return true; // Allow progression if validation fails
                }
            }
            
            return true; // Default to valid
        }

        markStepCompleted(moduleId, stepIndex) {
            this.completedSteps.add(moduleId + '-' + stepIndex);
            this.updateStepIndicators();
            
            // Fire completion event
            this.fireNavigationEvent('stepCompleted', {
                moduleId: moduleId,
                stepIndex: stepIndex
            });
        }

        updateStepIndicators() {
            const stepItems = document.querySelectorAll('.wizard-step-item');
            stepItems.forEach(item => {
                const moduleId = item.dataset.moduleId;
                const stepIndex = parseInt(item.dataset.stepIndex, 10);
                const stepKey = moduleId + '-' + stepIndex;
                
                // Update classes
                item.classList.toggle('current', 
                    moduleId === this.currentModuleId && stepIndex === this.currentStepIndex);
                item.classList.toggle('visited', this.visitedSteps.has(stepKey));
                item.classList.toggle('completed', this.completedSteps.has(stepKey));
            });
        }

        updateNavigationButtons() {
            const prevBtn = document.getElementById('wizard-prev-btn');
            const nextBtn = document.getElementById('wizard-next-btn');
            const finishBtn = document.getElementById('wizard-finish-btn');
            
            if (prevBtn) {
                prevBtn.disabled = !this.getPreviousStep();
            }
            
            const nextStep = this.getNextStep();
            if (nextBtn) {
                nextBtn.disabled = !nextStep;
                nextBtn.style.display = nextStep ? 'inline-block' : 'none';
            }
            
            if (finishBtn) {
                finishBtn.style.display = nextStep ? 'none' : 'inline-block';
            }
        }

        async loadModule(moduleId) {
            console.log('Loading module:', moduleId);
            
            // Update URL hash for browser navigation
            window.location.hash = '#' + moduleId;
            
            try {
                // Find the target container for this module
                let targetContainer = document.getElementById(`${moduleId}-container`) || 
                                     document.querySelector(`[data-module-id="${moduleId}"]`);
                
                if (!targetContainer) {
                    console.warn(`No container found for module ${moduleId}, creating one`);
                    
                    // Create a container dynamically
                    targetContainer = document.createElement('div');
                    targetContainer.id = `${moduleId}-container`;
                    targetContainer.className = 'module-container fade-in';
                    targetContainer.setAttribute('data-module-id', moduleId);
                    targetContainer.style.display = 'none';
                    
                    // Add module-specific class for enhanced styling
                    const moduleType = moduleId.replace('xavs-', '');
                    targetContainer.classList.add(`${moduleType}-container`);
                    
                    // Add it to the wizard module container
                    const wizardContainer = document.getElementById('wizard-module-container') || 
                                          document.querySelector('.wizard-module-container') ||
                                          document.querySelector('.wizard-content') ||
                                          document.body;
                    
                    console.log(`[Wizard Navigation] Adding container to wizard module container`);
                    wizardContainer.appendChild(targetContainer);
                    
                    // Add basic content based on the module
                    const content = this.getDefaultModuleContent(moduleId);
                    targetContainer.innerHTML = content;
                    
                    // Debug: Check if form elements were created
                    const inputs = targetContainer.querySelectorAll('input, select, textarea');
                    const labels = targetContainer.querySelectorAll('label');
                    console.log(`[Wizard Navigation] Container created for ${moduleId}: ${inputs.length} inputs, ${labels.length} labels`);
                    
                    // Ensure CSS classes are properly applied
                    inputs.forEach(input => {
                        if (!input.classList.contains('form-control')) {
                            input.classList.add('form-control');
                        }
                    });
                    
                    console.log(`[Wizard Navigation] Enhanced form elements for ${moduleId}`);
                }
                
                // Hide all module containers
                const allContainers = document.querySelectorAll('.module-container, [data-module-id]');
                allContainers.forEach(container => {
                    container.style.display = 'none';
                });
                
                // Show loading
                const loadingElement = document.getElementById('wizard-loading');
                if (loadingElement) {
                    loadingElement.style.display = 'block';
                }
                
                // Skip ES6 module loading for now - use embedded container content
                console.log(`[Wizard Navigation] Loading ${moduleId} module (${targetContainer.innerHTML.length} chars)`);
                
                // Hide loading and show the target container
                if (loadingElement) {
                    loadingElement.style.display = 'none';
                }
                
                // Show container with smooth transition
                targetContainer.style.display = 'block';
                
                // Force reflow and apply styles
                targetContainer.offsetHeight; // Trigger reflow
                
                // Ensure all form elements are properly styled
                setTimeout(() => {
                    const formElements = targetContainer.querySelectorAll('input, select, textarea, label');
                    formElements.forEach(element => {
                        element.style.visibility = 'visible';
                        element.style.opacity = '1';
                    });
                    
                    // Trigger the UI enhancements if available
                    if (window.xavsWizardUI) {
                        window.xavsWizardUI.enhanceElement(targetContainer);
                    }
                }, 100);
                
                // Trigger animation after a brief delay to ensure display is applied
                setTimeout(() => {
                    targetContainer.classList.add('fade-in');
                }, 150);
                
                console.log(`[Wizard Navigation] ${moduleId} module displayed`);
                
            } catch (error) {
                console.error('Failed to load module', moduleId, ':', error);
                this.fallbackModuleLoad(moduleId);
            }
        }
        
        getModuleInfo(moduleId) {
            // Map module IDs to their paths - using relative paths from the wizard
            const moduleMap = {
                'xavs-welcome': { path: 'static/xavs-modules/welcome.js' },
                'xavs-globals': { path: 'static/xavs-modules/xavs-globals.js' },
                'xavs-hosts': { path: 'static/xavs-modules/xavs-hosts.js' },
                'xavs-networking': { path: 'static/xavs-modules/xavs-networking.js' },
                'xavs-storage': { path: 'static/xavs-modules/xavs-storage.js' },
                'xavs-bootstrap': { path: 'static/xavs-modules/xavs-bootstrap.js' },
                'xavs-deploy': { path: 'static/xavs-modules/xavs-deploy.js' },
                'xavs-main': { path: 'static/xavs-modules/xavs-main.js' }
            };
            
            return moduleMap[moduleId] || null;
        }
        
        getDefaultModuleContent(moduleId) {
            const moduleContentMap = {
                'xavs-globals': `
                    <div class="globals-container">
                        <h2>Global Configuration</h2>
                        <p>Configure global OpenStack settings and network parameters.</p>
                        
                        <div class="form-group">
                            <label for="kolla-internal-vip">Kolla Internal VIP Address</label>
                            <input type="text" id="kolla-internal-vip" name="kolla_internal_vip_address" 
                                   placeholder="192.168.1.100" class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="network-interface">Network Interface</label>
                            <input type="text" id="network-interface" name="network_interface" 
                                   placeholder="eth0" class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="openstack-release">OpenStack Release</label>
                            <select id="openstack-release" name="openstack_release" class="form-control">
                                <option value="2024.1">2024.1 (Caracal)</option>
                                <option value="2023.2">2023.2 (Bobcat)</option>
                                <option value="2023.1">2023.1 (Antelope)</option>
                            </select>
                        </div>
                    </div>
                `,
                'xavs-hosts': `
                    <div class="hosts-container">
                        <h2>Host Configuration</h2>
                        <p>Define target hosts and deployment inventory.</p>
                        
                        <div class="form-group">
                            <label for="target-hosts">Target Hosts</label>
                            <textarea id="target-hosts" name="target_hosts" rows="4" 
                                      placeholder="host1.example.com&#10;host2.example.com&#10;host3.example.com" 
                                      class="form-control"></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label for="ssh-user">SSH User</label>
                            <input type="text" id="ssh-user" name="ssh_user" 
                                   value="ubuntu" class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="ssh-key-path">SSH Key Path</label>
                            <input type="text" id="ssh-key-path" name="ssh_key_path" 
                                   placeholder="/path/to/ssh/key" class="form-control">
                        </div>
                    </div>
                `,
                'xavs-networking': `
                    <div class="networking-container">
                        <h2>Network Configuration</h2>
                        <p>Configure OpenStack networking and interfaces.</p>
                        
                        <div class="form-group">
                            <label for="external-interface">External Network Interface</label>
                            <input type="text" id="external-interface" name="neutron_external_interface" 
                                   placeholder="eth1" class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="tenant-network-type">Tenant Network Type</label>
                            <select id="tenant-network-type" name="neutron_tenant_network_types" class="form-control">
                                <option value="vxlan">VXLAN</option>
                                <option value="vlan">VLAN</option>
                                <option value="flat">Flat</option>
                            </select>
                        </div>
                    </div>
                `,
                'xavs-storage': `
                    <div class="storage-container">
                        <h2>Storage Configuration</h2>
                        <p>Configure Cinder storage backend.</p>
                        
                        <div class="form-group">
                            <label for="storage-backend">Storage Backend</label>
                            <select id="storage-backend" name="storage_backend" class="form-control">
                                <option value="lvm">LVM</option>
                                <option value="ceph">Ceph</option>
                                <option value="nfs">NFS</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label for="storage-devices">Storage Devices</label>
                            <textarea id="storage-devices" name="storage_devices" rows="3" 
                                      placeholder="/dev/sdb&#10;/dev/sdc" 
                                      class="form-control"></textarea>
                        </div>
                    </div>
                `,
                'xavs-bootstrap': `
                    <div class="bootstrap-container">
                        <h2>Bootstrap Configuration</h2>
                        <p>Initialize and bootstrap OpenStack services.</p>
                        
                        <div class="form-group">
                            <label for="admin-password">Admin Password</label>
                            <input type="password" id="admin-password" name="keystone_admin_password" 
                                   class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="database-password">Database Password</label>
                            <input type="password" id="database-password" name="database_password" 
                                   class="form-control">
                        </div>
                    </div>
                `,
                'xavs-deploy': `
                    <div class="deploy-container">
                        <h2>Deployment Setup</h2>
                        <p>Configure deployment parameters and start deployment.</p>
                        
                        <div class="deployment-status">
                            <h3>Ready to Deploy</h3>
                            <p>All configuration steps completed. Click deploy to start the OpenStack installation.</p>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" name="confirm_deployment" required>
                                I confirm the configuration is correct and ready for deployment
                            </label>
                        </div>
                    </div>
                `,
                'xavs-main': `
                    <div class="main-container">
                        <h2>Deployment Summary</h2>
                        <p>Review and finalize your OpenStack deployment.</p>
                        
                        <div class="deployment-summary">
                            <h3>Deployment Complete!</h3>
                            <p>Your OpenStack environment has been successfully deployed.</p>
                        </div>
                    </div>
                `
            };
            
            return moduleContentMap[moduleId] || `
                <div class="module-placeholder">
                    <h2>${moduleId.replace('xavs-', '').replace('-', ' ').toUpperCase()}</h2>
                    <p>This module is under development.</p>
                    <input type="hidden" name="module_completed" value="true">
                </div>
            `;
        }

        fallbackModuleLoad(moduleId) {
            // Fallback: try to find and show the module container
            const containers = document.querySelectorAll('.module-container');
            containers.forEach(container => {
                container.style.display = 'none';
            });
            
            const targetContainer = document.getElementById(moduleId + '-container') || 
                                    document.querySelector('[data-module-id="' + moduleId + '"]');
            if (targetContainer) {
                targetContainer.style.display = 'block';
            }
        }

        finishWizard() {
            console.log('Finishing wizard');
            
            // Validate all steps if required
            if (!this.validateAllSteps()) {
                alert('Please complete all required steps before finishing.');
                return;
            }
            
            // Fire finish event
            this.fireNavigationEvent('wizardFinished', {
                completedSteps: Array.from(this.completedSteps),
                visitedSteps: Array.from(this.visitedSteps)
            });
            
            // Redirect to final page or close wizard
            this.redirectToFinalPage();
        }

        validateAllSteps() {
            // Check if all required steps are completed
            const requiredSteps = this.registry.steps.filter(step => step.required !== false);
            
            for (const step of requiredSteps) {
                const stepKey = step.moduleId + '-0'; // Assuming single step per module
                if (!this.completedSteps.has(stepKey)) {
                    console.warn('Required step not completed:', step.moduleId);
                    return false;
                }
            }
            
            return true;
        }

        redirectToFinalPage() {
            // Check for final page in registry
            const finalStep = this.registry.steps.find(step => step.stepId === 'deploy' || step.moduleId === 'xavs-deploy');
            
            if (finalStep) {
                this.navigateToStep(finalStep.moduleId, 0);
            } else {
                // Default redirect
                window.location.href = '../xavs-main/index.html';
            }
        }

        cancelWizard() {
            if (confirm('Are you sure you want to cancel the wizard? All progress will be lost.')) {
                this.fireNavigationEvent('wizardCancelled', {});
                window.location.href = '../xavs-main/index.html';
            }
        }

        fireNavigationEvent(eventName, detail) {
            const event = new CustomEvent('xavs-wizard-' + eventName, {
                detail: detail,
                bubbles: true
            });
            document.dispatchEvent(event);
        }

        // Public API methods
        getCurrentModule() {
            return this.currentModuleId;
        }

        getCurrentStepIndex() {
            return this.currentStepIndex;
        }

        getCompletedSteps() {
            return Array.from(this.completedSteps);
        }

        getVisitedSteps() {
            return Array.from(this.visitedSteps);
        }

        isStepCompleted(moduleId, stepIndex) {
            stepIndex = stepIndex || 0;
            return this.completedSteps.has(moduleId + '-' + stepIndex);
        }

        isStepVisited(moduleId, stepIndex) {
            stepIndex = stepIndex || 0;
            return this.visitedSteps.has(moduleId + '-' + stepIndex);
        }

        resetWizard() {
            this.currentModuleId = null;
            this.currentStepIndex = 0;
            this.visitedSteps.clear();
            this.completedSteps.clear();
            this.loadInitialStep();
        }

        // Method to manually set step as completed (for external use)
        setStepCompleted(moduleId, stepIndex) {
            stepIndex = stepIndex || 0;
            this.markStepCompleted(moduleId, stepIndex);
        }

        // Get navigation information for UI updates
        getNavigationInfo() {
            const currentStepInfo = this.getCurrentStepInfo();
            return {
                currentModule: this.currentModuleId,
                currentStepIndex: this.currentStepIndex,
                currentStep: currentStepInfo,
                totalSteps: this.registry.steps.length,
                completedSteps: Array.from(this.completedSteps),
                visitedSteps: Array.from(this.visitedSteps),
                steps: this.registry.steps,
                canGoNext: !!this.getNextStep(),
                canGoPrevious: !!this.getPreviousStep(),
                isLastStep: !this.getNextStep()
            };
        }

        // Alias methods for compatibility with wizard-app
        async goToPrevious() {
            const prevStep = this.getPreviousStep();
            if (!prevStep) {
                return {
                    success: false,
                    reason: 'No previous step available'
                };
            }
            
            try {
                this.navigatePrevious();
                return {
                    success: true,
                    reason: 'Navigation successful'
                };
            } catch (error) {
                console.error('Previous navigation error:', error);
                return {
                    success: false,
                    reason: error.message || 'Navigation failed'
                };
            }
        }

        async proceedToNext() {
            // Validate current step before proceeding
            if (!this.validateCurrentStep()) {
                console.warn('Current step validation failed');
                return {
                    success: false,
                    reason: 'Current step validation failed'
                };
            }
            
            // Check if there's a next step
            const nextStep = this.getNextStep();
            if (!nextStep) {
                return {
                    success: false,
                    reason: 'No next step available'
                };
            }
            
            try {
                this.navigateNext();
                return {
                    success: true,
                    reason: 'Navigation successful'
                };
            } catch (error) {
                console.error('Navigation error:', error);
                return {
                    success: false,
                    reason: error.message || 'Navigation failed'
                };
            }
        }

        async jumpToStep(stepId) {
            // Find step by ID in registry
            const step = this.registry.steps.find(s => s.id === stepId);
            if (step) {
                try {
                    this.navigateToStep(step.moduleId, 0);
                    return {
                        success: true,
                        reason: 'Jump to step successful'
                    };
                } catch (error) {
                    console.error('Jump to step error:', error);
                    return {
                        success: false,
                        reason: error.message || 'Jump to step failed'
                    };
                }
            }
            return {
                success: false,
                reason: 'Step not found'
            };
        }

        async resetWorkflow() {
            this.resetWizard();
            return true;
        }

        getCurrentStep() {
            return {
                moduleId: this.currentModuleId,
                stepIndex: this.currentStepIndex,
                ...this.getCurrentStepInfo()
            };
        }
    }

    // Create global instance
    window.XAVSWizardNavigation = XAVSWizardNavigation;
    window.xavsWizardNavigation = new XAVSWizardNavigation();

    console.log('XAVS Wizard Navigation initialized');

})();
