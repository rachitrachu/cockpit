/**
 * XAVS Welcome Module
 * First module in the XAVS deployment workflow
 */

export default class XAVSWelcomeModule {
    constructor() {
        this.container = null;
        this.stateManager = null;
        this.moduleId = 'welcome';
    }

    async initialize(container, stateManager) {
        this.container = container;
        this.stateManager = stateManager;
        
        console.log('[XAVS Welcome] Initializing welcome module');
        
        await this.render();
        await this.loadState();
        
        // Auto-complete this module since it's informational
        setTimeout(() => this.completeModule(), 1000);
    }

    async render() {
        this.container.innerHTML = `
            <div class="welcome-container">
                <div class="welcome-hero">
                    <h1>🚀 Welcome to XAVS OpenStack Platform</h1>
                    <p class="hero-subtitle">
                        Your comprehensive solution for OpenStack deployment and management
                    </p>
                </div>

                <div class="welcome-content">
                    <div class="deployment-modes">
                        <h2>Choose Your Deployment Mode</h2>
                        <div class="mode-cards">
                            <div class="mode-card" data-mode="online">
                                <div class="card-icon">🌐</div>
                                <h3>Online Deployment</h3>
                                <p>Deploy with internet connectivity for package downloads and updates</p>
                                <ul>
                                    <li>Automatic package downloads</li>
                                    <li>Latest container images</li>
                                    <li>Real-time updates</li>
                                    <li>Cloud integration ready</li>
                                </ul>
                                <button class="btn btn-primary mode-select" data-mode="online">
                                    Select Online Mode
                                </button>
                            </div>
                            
                            <div class="mode-card" data-mode="offline">
                                <div class="card-icon">📦</div>
                                <h3>Offline Deployment</h3>
                                <p>Deploy in air-gapped environments with pre-downloaded packages</p>
                                <ul>
                                    <li>Air-gapped deployment</li>
                                    <li>Pre-packaged images</li>
                                    <li>No internet required</li>
                                    <li>Security focused</li>
                                </ul>
                                <button class="btn btn-secondary mode-select" data-mode="offline">
                                    Select Offline Mode
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="architecture-selection" style="display: none;">
                        <h2>Choose Your Architecture</h2>
                        <div class="arch-cards">
                            <div class="arch-card" data-arch="all-in-one">
                                <div class="card-icon">🖥️</div>
                                <h3>All-in-One</h3>
                                <p>Single node deployment for development and testing</p>
                                <ul>
                                    <li>Single server deployment</li>
                                    <li>All services on one node</li>
                                    <li>Minimal resource requirements</li>
                                    <li>Perfect for PoC and testing</li>
                                </ul>
                                <button class="btn btn-primary arch-select" data-arch="all-in-one">
                                    Select All-in-One
                                </button>
                            </div>
                            
                            <div class="arch-card" data-arch="multi-node">
                                <div class="card-icon">🏢</div>
                                <h3>Multi-Node</h3>
                                <p>Distributed deployment for production environments</p>
                                <ul>
                                    <li>Multiple server deployment</li>
                                    <li>High availability</li>
                                    <li>Scalable architecture</li>
                                    <li>Production ready</li>
                                </ul>
                                <button class="btn btn-primary arch-select" data-arch="multi-node">
                                    Select Multi-Node
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="workflow-overview">
                        <h2>Deployment Workflow</h2>
                        <div class="workflow-steps">
                            <div class="workflow-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <h4>🚀 Bootstrap</h4>
                                    <p>Prepare the deployment environment and verify system requirements</p>
                                </div>
                            </div>
                            <div class="workflow-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <h4>🖥️ Host Management</h4>
                                    <p>Configure deployment hosts and create the Ansible inventory</p>
                                </div>
                            </div>
                            <div class="workflow-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <h4>⚙️ Global Configuration</h4>
                                    <p>Set up OpenStack service configuration and global parameters</p>
                                </div>
                            </div>
                            <div class="workflow-step">
                                <div class="step-number">4</div>
                                <div class="step-content">
                                    <h4>💾 Storage Configuration</h4>
                                    <p>Configure storage backends and policies for your deployment</p>
                                </div>
                            </div>
                            <div class="workflow-step">
                                <div class="step-number">5</div>
                                <div class="step-content">
                                    <h4>🌐 Network Configuration</h4>
                                    <p>Set up network topology and configure networking services</p>
                                </div>
                            </div>
                            <div class="workflow-step">
                                <div class="step-number">6</div>
                                <div class="step-content">
                                    <h4>📦 Image Management</h4>
                                    <p>Manage container images and configure image repositories</p>
                                </div>
                            </div>
                            <div class="workflow-step">
                                <div class="step-number">7</div>
                                <div class="step-content">
                                    <h4>🚢 Deployment</h4>
                                    <p>Execute the OpenStack deployment and monitor progress</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="getting-started">
                        <h2>Getting Started</h2>
                        <div class="start-info">
                            <div class="info-card">
                                <h4>📋 Prerequisites</h4>
                                <ul>
                                    <li>Linux servers with SSH access</li>
                                    <li>Sufficient hardware resources</li>
                                    <li>Network connectivity between nodes</li>
                                    <li>Root or sudo access</li>
                                </ul>
                            </div>
                            <div class="info-card">
                                <h4>⏱️ Estimated Time</h4>
                                <ul>
                                    <li>All-in-One: 30-60 minutes</li>
                                    <li>Multi-Node: 1-2 hours</li>
                                    <li>Depends on network speed</li>
                                    <li>Hardware performance matters</li>
                                </ul>
                            </div>
                            <div class="info-card">
                                <h4>🔧 What You'll Need</h4>
                                <ul>
                                    <li>Server IP addresses</li>
                                    <li>SSH credentials</li>
                                    <li>Network configuration details</li>
                                    <li>Storage requirements</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="welcome-actions">
                    <button class="btn btn-lg btn-primary" id="start-deployment" disabled>
                        Start Deployment Wizard
                    </button>
                    <button class="btn btn-lg btn-outline" id="load-existing">
                        Load Existing Configuration
                    </button>
                </div>
            </div>
        `;

        this.attachEventHandlers();
    }

    attachEventHandlers() {
        // Mode selection
        const modeButtons = this.container.querySelectorAll('.mode-select');
        modeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.selectDeploymentMode(mode);
            });
        });

        // Architecture selection
        const archButtons = this.container.querySelectorAll('.arch-select');
        archButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const arch = e.target.dataset.arch;
                this.selectArchitecture(arch);
            });
        });

        // Start deployment
        const startButton = this.container.querySelector('#start-deployment');
        startButton.addEventListener('click', () => {
            this.startDeployment();
        });

        // Load existing
        const loadButton = this.container.querySelector('#load-existing');
        loadButton.addEventListener('click', () => {
            this.loadExistingConfiguration();
        });
    }

    async selectDeploymentMode(mode) {
        console.log(`[XAVS Welcome] Selected deployment mode: ${mode}`);
        
        // Update UI
        const modeCards = this.container.querySelectorAll('.mode-card');
        modeCards.forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.mode === mode) {
                card.classList.add('selected');
            }
        });

        // Show architecture selection
        const archSection = this.container.querySelector('.architecture-selection');
        archSection.style.display = 'block';
        archSection.scrollIntoView({ behavior: 'smooth' });

        // Save to state
        await this.stateManager.updateModuleState(this.moduleId, {
            deploymentMode: mode
        });

        // Update workflow state
        const currentState = await this.stateManager.loadState();
        currentState.workflow.deploymentMode = mode;
        await this.stateManager.saveState(currentState);

        // Log action
        await this.stateManager.auditLog('deployment_mode_selected', { mode });
    }

    async selectArchitecture(architecture) {
        console.log(`[XAVS Welcome] Selected architecture: ${architecture}`);
        
        // Update UI
        const archCards = this.container.querySelectorAll('.arch-card');
        archCards.forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.arch === architecture) {
                card.classList.add('selected');
            }
        });

        // Enable start button
        const startButton = this.container.querySelector('#start-deployment');
        startButton.disabled = false;

        // Save to state
        await this.stateManager.updateModuleState(this.moduleId, {
            architecture: architecture
        });

        // Update workflow state
        const currentState = await this.stateManager.loadState();
        currentState.workflow.architecture = architecture;
        await this.stateManager.saveState(currentState);

        // Log action
        await this.stateManager.auditLog('architecture_selected', { architecture });
    }

    async startDeployment() {
        console.log('[XAVS Welcome] Starting deployment wizard');
        
        await this.stateManager.auditLog('deployment_wizard_started', {
            timestamp: new Date().toISOString()
        });

        // Complete this module and move to next
        await this.completeModule();
        
        // Navigate to bootstrap module
        if (window.xavsModules) {
            await window.xavsModules.loadModule('bootstrap');
        }
    }

    async loadExistingConfiguration() {
        console.log('[XAVS Welcome] Loading existing configuration');
        
        // Create file input for JSON import
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const content = await file.text();
                    const data = JSON.parse(content);
                    
                    // Import the state
                    const success = await this.stateManager.importState(data);
                    
                    if (success) {
                        alert('Configuration loaded successfully!');
                        // Reload the page to reflect new state
                        window.location.reload();
                    } else {
                        alert('Failed to load configuration');
                    }
                } catch (error) {
                    console.error('[XAVS Welcome] Failed to load configuration:', error);
                    alert('Invalid configuration file: ' + error.message);
                }
            }
        };
        
        input.click();
    }

    async loadState() {
        const state = await this.stateManager.loadState();
        if (!state) return;

        const moduleState = state.modules[this.moduleId];
        if (!moduleState) return;

        // Restore deployment mode selection
        if (moduleState.deploymentMode) {
            const modeCard = this.container.querySelector(`[data-mode="${moduleState.deploymentMode}"]`);
            if (modeCard) {
                modeCard.classList.add('selected');
                
                // Show architecture selection
                const archSection = this.container.querySelector('.architecture-selection');
                archSection.style.display = 'block';
            }
        }

        // Restore architecture selection
        if (moduleState.architecture) {
            const archCard = this.container.querySelector(`[data-arch="${moduleState.architecture}"]`);
            if (archCard) {
                archCard.classList.add('selected');
                
                // Enable start button
                const startButton = this.container.querySelector('#start-deployment');
                startButton.disabled = false;
            }
        }
    }

    async completeModule() {
        const state = await this.stateManager.loadState();
        const moduleState = state?.modules[this.moduleId];
        
        const completionData = {
            deploymentMode: moduleState?.deploymentMode || null,
            architecture: moduleState?.architecture || null,
            completedAt: new Date().toISOString()
        };

        await this.stateManager.completeModule(this.moduleId, completionData);
        console.log('[XAVS Welcome] Module completed');
    }
}