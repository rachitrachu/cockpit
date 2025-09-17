/**
 * XAVS Module Interface
 * Standardized interface for all XAVS wizard modules
 * Provides consistent lifecycle management and state handling
 */

/**
 * Base class for all XAVS wizard modules
 * Modules should extend this class or implement the interface methods
 */
class XAVSModuleBase {
    constructor(moduleId, moduleName) {
        this.moduleId = moduleId;
        this.moduleName = moduleName;
        this.initialized = false;
        this.moduleState = {};
        this.validationRules = {};
        this.eventListeners = new Map();
    }

    /**
     * Initialize the module
     * Cal        // Also check for any elements with 'welcome' in ID
        const welcomeElements = document.querySelectorAll('[id*="welcome"]');
        
        // More specific debug for the target container
        const byId = document.getElementById(`${moduleId}-container`);
        const byDataAttr = document.querySelector(`[data-module-id="${moduleId}"]`);
        
        if (!byId && !byDataAttr) {
            console.log(`[ModuleInterface] Container not found by standard selectors for ${moduleId}`);
        }module is first loaded
     * @param {HTMLElement} container - The container element for the module
     * @param {Object} options - Module initialization options
     */
    async initialize(container = null, options = {}) {
        this.container = container;
        this.options = { ...this.getDefaultOptions(), ...options };
        
        try {
            // Perform module-specific initialization
            await this.onInitialize();
            
            this.initialized = true;
            console.log(`[${this.moduleId}] Module initialized successfully`);
            return true;
        } catch (error) {
            console.error(`[${this.moduleId}] Module initialization failed:`, error);
            return false;
        }
    }

    /**
     * Called when the module becomes active in the wizard
     * Override this method for module-specific entry logic
     */
    async onEnter() {
        console.log(`[${this.moduleId}] Module entered`);
        
        // Restore UI state if available
        if (this.moduleState && Object.keys(this.moduleState).length > 0) {
            await this.restoreUIState();
        }
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Perform module-specific entry tasks
        await this.onModuleEnter();
    }

    /**
     * Called when the module is being left for another step
     * Override this method for module-specific exit logic
     */
    async onExit() {
        console.log(`[${this.moduleId}] Module exiting`);
        
        // Save current UI state
        await this.saveUIState();
        
        // Clean up event listeners
        this.cleanupEventListeners();
        
        // Perform module-specific exit tasks
        await this.onModuleExit();
    }

    /**
     * Validate the current module state
     * @returns {Object} Validation result with { valid, errors, warnings }
     */
    async validate() {
        try {
            const validationResult = {
                valid: true,
                errors: [],
                warnings: [],
                moduleId: this.moduleId,
                timestamp: new Date().toISOString()
            };

            // Perform built-in validation
            const builtInValidation = await this.performBuiltInValidation();
            if (!builtInValidation.valid) {
                validationResult.valid = false;
                validationResult.errors.push(...builtInValidation.errors);
            }

            // Perform module-specific validation
            const moduleValidation = await this.onValidate();
            if (!moduleValidation.valid) {
                validationResult.valid = false;
                validationResult.errors.push(...moduleValidation.errors);
            }
            
            if (moduleValidation.warnings) {
                validationResult.warnings.push(...moduleValidation.warnings);
            }

            console.log(`[${this.moduleId}] Validation result:`, validationResult);
            return validationResult;
            
        } catch (error) {
            console.error(`[${this.moduleId}] Validation failed:`, error);
            return {
                valid: false,
                errors: [`Validation error: ${error.message}`],
                warnings: [],
                moduleId: this.moduleId,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get the current module state for persistence
     * @returns {Object} Current module state
     */
    async getState() {
        // Get UI state
        const uiState = await this.getUIState();
        
        // Get module-specific state
        const moduleSpecificState = await this.onGetState();
        
        return {
            ...this.moduleState,
            ui: uiState,
            moduleSpecific: moduleSpecificState,
            moduleId: this.moduleId,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Set the module state from persistence
     * @param {Object} state - The state to restore
     */
    async setState(state) {
        if (!state || typeof state !== 'object') {
            console.warn(`[${this.moduleId}] Invalid state provided for restoration`);
            return false;
        }

        try {
            this.moduleState = { ...state };
            
            // Restore UI state if available
            if (state.ui) {
                await this.setUIState(state.ui);
            }
            
            // Restore module-specific state
            if (state.moduleSpecific) {
                await this.onSetState(state.moduleSpecific);
            }
            
            console.log(`[${this.moduleId}] State restored successfully`);
            return true;
            
        } catch (error) {
            console.error(`[${this.moduleId}] Failed to restore state:`, error);
            return false;
        }
    }

    /**
     * Reset the module to its initial state
     */
    async reset() {
        this.moduleState = {};
        
        // Reset UI to initial state
        await this.resetUIState();
        
        // Perform module-specific reset
        await this.onReset();
        
        console.log(`[${this.moduleId}] Module reset to initial state`);
    }

    /**
     * Check if the module can proceed to the next step
     * @returns {Object} { canProceed: boolean, reason?: string }
     */
    async canProceed() {
        const validation = await this.validate();
        
        if (!validation.valid) {
            return {
                canProceed: false,
                reason: 'Validation failed',
                errors: validation.errors
            };
        }
        
        // Check module-specific proceed conditions
        const moduleCheck = await this.onCanProceed();
        
        return moduleCheck;
    }

    /**
     * Get module progress as a percentage (0-100)
     * @returns {number} Progress percentage
     */
    getProgress() {
        return this.onGetProgress();
    }

    /**
     * Show validation errors to the user
     * @param {Array} errors - Array of error messages
     */
    showValidationErrors(errors) {
        if (!errors || errors.length === 0) return;
        
        const errorContainer = (this.container && this.container.querySelector('.module-validation-errors')) ||
                              this.createErrorContainer();
        
        errorContainer.innerHTML = `
            <div class="validation-error-list">
                <h4><i class="fas fa-exclamation-triangle"></i> Please correct the following issues:</h4>
                <ul>
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
        `;
        
        errorContainer.style.display = 'block';
        errorContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /**
     * Hide validation errors
     */
    hideValidationErrors() {
        const errorContainer = this.container && this.container.querySelector('.module-validation-errors');
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }

    /**
     * Show loading state
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        if (!this.container) return;
        
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'module-loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-message">${message}</div>
            </div>
        `;
        
        this.container.appendChild(loadingOverlay);
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        const loadingOverlay = this.container && this.container.querySelector('.module-loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    /**
     * Add an event listener with automatic cleanup
     * @param {string} event - Event name
     * @param {HTMLElement} element - Element to listen on
     * @param {Function} handler - Event handler
     */
    addEventListener(event, element, handler) {
        const listenerKey = `${event}_${Date.now()}_${Math.random()}`;
        element.addEventListener(event, handler);
        this.eventListeners.set(listenerKey, { event, element, handler });
        return listenerKey;
    }

    /**
     * Remove a specific event listener
     * @param {string} listenerKey - Key returned from addEventListener
     */
    removeEventListener(listenerKey) {
        const listener = this.eventListeners.get(listenerKey);
        if (listener) {
            listener.element.removeEventListener(listener.event, listener.handler);
            this.eventListeners.delete(listenerKey);
        }
    }

    /**
     * Clean up all event listeners
     */
    cleanupEventListeners() {
        for (const [key, listener] of this.eventListeners) {
            listener.element.removeEventListener(listener.event, listener.handler);
        }
        this.eventListeners.clear();
    }

    // ===== Abstract Methods - Override in subclasses =====

    /**
     * Module-specific initialization logic
     * Override this method in subclasses
     */
    async onInitialize() {
        // Override in subclass
    }

    /**
     * Module-specific entry logic
     * Override this method in subclasses
     */
    async onModuleEnter() {
        // Override in subclass
    }

    /**
     * Module-specific exit logic
     * Override this method in subclasses
     */
    async onModuleExit() {
        // Override in subclass
    }

    /**
     * Module-specific validation logic
     * Override this method in subclasses
     * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
     */
    async onValidate() {
        return { valid: true, errors: [], warnings: [] };
    }

    /**
     * Get module-specific state
     * Override this method in subclasses
     * @returns {Object} Module state
     */
    async onGetState() {
        return {};
    }

    /**
     * Set module-specific state
     * Override this method in subclasses
     * @param {Object} state - State to restore
     */
    async onSetState(state) {
        // Override in subclass
    }

    /**
     * Reset module-specific state
     * Override this method in subclasses
     */
    async onReset() {
        // Override in subclass
    }

    /**
     * Check if module can proceed to next step
     * Override this method in subclasses
     * @returns {Object} { canProceed: boolean, reason?: string }
     */
    async onCanProceed() {
        return { canProceed: true };
    }

    /**
     * Get module progress percentage
     * Override this method in subclasses
     * @returns {number} Progress percentage (0-100)
     */
    onGetProgress() {
        return 100; // Default to complete
    }

    /**
     * Get default options for the module
     * Override this method in subclasses
     * @returns {Object} Default options
     */
    getDefaultOptions() {
        return {};
    }

    // ===== Helper Methods =====

    /**
     * Perform built-in validation (common validation rules)
     */
    async performBuiltInValidation() {
        const errors = [];
        
        // Validate required fields if defined
        if (this.validationRules.required) {
            for (const field of this.validationRules.required) {
                if (!this.moduleState[field]) {
                    errors.push(`${field} is required`);
                }
            }
        }
        
        return { valid: errors.length === 0, errors };
    }

    /**
     * Get current UI state from form elements
     */
    async getUIState() {
        if (!this.container) return {};
        
        const state = {};
        
        // Get form data
        const forms = this.container.querySelectorAll('form');
        forms.forEach(form => {
            const formData = new FormData(form);
            for (const [key, value] of formData.entries()) {
                state[key] = value;
            }
        });
        
        // Get input values
        const inputs = this.container.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.name) {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    state[input.name] = input.checked;
                } else {
                    state[input.name] = input.value;
                }
            }
        });
        
        return state;
    }

    /**
     * Set UI state to form elements
     */
    async setUIState(state) {
        if (!this.container || !state) return;
        
        for (const [key, value] of Object.entries(state)) {
            const elements = this.container.querySelectorAll(`[name="${key}"]`);
            elements.forEach(element => {
                if (element.type === 'checkbox' || element.type === 'radio') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            });
        }
    }

    /**
     * Save current UI state to module state
     */
    async saveUIState() {
        const uiState = await this.getUIState();
        this.moduleState.ui = uiState;
    }

    /**
     * Restore UI state from module state
     */
    async restoreUIState() {
        if (this.moduleState.ui) {
            await this.setUIState(this.moduleState.ui);
        }
    }

    /**
     * Reset UI to initial state
     */
    async resetUIState() {
        if (!this.container) return;
        
        // Reset all form elements
        const forms = this.container.querySelectorAll('form');
        forms.forEach(form => form.reset());
        
        // Clear validation errors
        this.hideValidationErrors();
    }

    /**
     * Create error container if it doesn't exist
     */
    createErrorContainer() {
        if (!this.container) return null;
        
        let errorContainer = this.container.querySelector('.module-validation-errors');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.className = 'module-validation-errors';
            errorContainer.style.display = 'none';
            this.container.insertBefore(errorContainer, this.container.firstChild);
        }
        
        return errorContainer;
    }

    /**
     * Set up module event listeners
     * Override this method in subclasses
     */
    setupEventListeners() {
        // Override in subclass
    }

    /**
     * Static method to load a module by ID
     * This is used by the navigation system
     */
    static loadModule(moduleId) {
        console.log(`[ModuleInterface] Loading module: ${moduleId}`);
        
        // Hide loading spinner
        const loadingElement = document.getElementById('wizard-loading');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
        
        // Update the UI to show the correct module container
        const containers = document.querySelectorAll('.module-container, [data-module-id]');
        containers.forEach(container => {
            container.style.display = 'none';
        });
        
        // Show the target module container
        const targetContainer = document.getElementById(`${moduleId}-container`) || 
                               document.querySelector(`[data-module-id="${moduleId}"]`);
        if (targetContainer) {
            targetContainer.style.display = 'block';
            console.log(`[ModuleInterface] Activated container for ${moduleId}`);
        } else {
            console.warn(`[ModuleInterface] No container found for module ${moduleId}`);
            // Show loading if no container found
            if (loadingElement) {
                loadingElement.style.display = 'block';
            }
        }
        
        return true;
    }

    /**
     * Static method to get module data by ID
     * Used by validation system
     */
    static getModuleData(moduleId) {
        console.log(`[ModuleInterface] Getting data for module: ${moduleId}`);
        
        // Debug: Check what containers exist (reduced logging)
        const allContainers = document.querySelectorAll('[id*="container"], [data-module-id]');
        console.log(`[ModuleInterface] Total containers found: ${allContainers.length}`);
        
        // Debug: Check wizard container children
        const wizardContainer = document.getElementById('wizard-module-container');
        if (wizardContainer) {
            const children = Array.from(wizardContainer.children).map(child => ({
                id: child.id,
                moduleId: child.getAttribute('data-module-id'),
                tagName: child.tagName,
                classes: child.className,
                visible: child.style.display !== 'none'
            }));
            console.log(`[ModuleInterface] Wizard container has ${children.length} children`);
            console.log(`[ModuleInterface] Looking for child with moduleId: ${moduleId}`);
            
            // Show only relevant children
            const relevantChildren = children.filter(child => 
                child.moduleId === moduleId || child.id.includes(moduleId)
            );
            if (relevantChildren.length > 0) {
                console.log(`[ModuleInterface] Found relevant children:`, relevantChildren);
            }
        }
        
        // Also check for any elements with 'welcome' in their ID
        const welcomeElements = document.querySelectorAll('[id*="welcome"]');
        console.log(`[ModuleInterface] Elements with 'welcome' in ID:`, Array.from(welcomeElements).map(e => ({
            id: e.id,
            tagName: e.tagName,
            moduleId: e.getAttribute('data-module-id')
        })));
        
        // More specific debug for the target container
        const byId = document.getElementById(`${moduleId}-container`);
        const byDataAttr = document.querySelector(`[data-module-id="${moduleId}"]`);
        console.log(`[ModuleInterface] getElementById('${moduleId}-container'):`, byId);
        console.log(`[ModuleInterface] querySelector('[data-module-id="${moduleId}"]'):`, byDataAttr);
        
        // Try to find the module container and extract data
        let container = document.getElementById(`${moduleId}-container`) || 
                       document.querySelector(`[data-module-id="${moduleId}"]`);
        
        // If not found, try more aggressive searching
        if (!container) {
            // Try searching within the wizard container first
            const wizardContainer = document.getElementById('wizard-module-container');
            if (wizardContainer) {
                // Search for direct children with the correct moduleId
                container = wizardContainer.querySelector(`#${moduleId}-container`) || 
                           wizardContainer.querySelector(`[data-module-id="${moduleId}"]`);
                
                // If still not found, search all children
                if (!container) {
                    const children = Array.from(wizardContainer.children);
                    container = children.find(child => 
                        child.id === `${moduleId}-container` ||
                        child.getAttribute('data-module-id') === moduleId ||
                        child.id.includes(moduleId)
                    );
                }
            }
            
            // Final fallback: search for any element with the module ID in its ID
            if (!container) {
                container = document.querySelector(`[id*="${moduleId}"]`);
            }
            
            // Last resort: search for any div containing module-specific content
            if (!container && wizardContainer) {
                const moduleContent = wizardContainer.querySelector('.module-container');
                if (moduleContent && moduleContent.style.display !== 'none') {
                    container = moduleContent;
                }
            }
        }
        
        console.log(`[ModuleInterface] Looking for container: ${moduleId}-container`);
        console.log(`[ModuleInterface] Found container:`, container ? `${container.tagName}#${container.id}` : null);
        
        if (!container) {
            console.warn(`[ModuleInterface] No container found for module ${moduleId}`);
            return {};
        }
        
        // Basic data extraction - look for form inputs, data attributes, etc.
        const data = {};
        
        // Collect form data
        const forms = container.querySelectorAll('form');
        forms.forEach(form => {
            const formData = new FormData(form);
            for (const [key, value] of formData.entries()) {
                data[key] = value;
            }
        });
        
        // Collect input data
        const inputs = container.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.name || input.id) {
                const key = input.name || input.id;
                data[key] = input.value;
            }
        });
        
        // Collect data attributes
        if (container.dataset) {
            Object.assign(data, container.dataset);
        }
        
        console.log(`[ModuleInterface] Collected data for ${moduleId}:`, Object.keys(data).length > 0 ? Object.keys(data) : 'no data');
        return data;
    }
}

/**
 * Module Interface Definition
 * All XAVS modules should implement these methods
 */
const XAVSModuleInterface = {
    // Lifecycle methods
    initialize: 'async function(container, options)',
    onEnter: 'async function()',
    onExit: 'async function()',
    
    // State management
    getState: 'async function()',
    setState: 'async function(state)',
    reset: 'async function()',
    
    // Validation
    validate: 'async function()',
    canProceed: 'async function()',
    
    // Progress tracking
    getProgress: 'function()',
    
    // Optional utility methods
    showLoading: 'function(message)',
    hideLoading: 'function()',
    showValidationErrors: 'function(errors)',
    hideValidationErrors: 'function()'
};

/**
 * Module Registration Helper
 * Helps register modules with the wizard system
 */
class XAVSModuleRegistry {
    static modules = new Map();
    
    /**
     * Register a module with the wizard system
     * @param {string} moduleId - Unique module identifier
     * @param {Object} moduleDefinition - Module class or factory function
     * @param {Object} metadata - Module metadata
     */
    static register(moduleId, moduleDefinition, metadata = {}) {
        this.modules.set(moduleId, {
            definition: moduleDefinition,
            metadata: {
                name: metadata.name || moduleId,
                description: metadata.description || '',
                version: metadata.version || '1.0.0',
                dependencies: metadata.dependencies || [],
                ...metadata
            }
        });
        
        console.log(`[XAVS Registry] Registered module: ${moduleId}`);
    }
    
    /**
     * Get a registered module
     * @param {string} moduleId - Module identifier
     */
    static get(moduleId) {
        return this.modules.get(moduleId);
    }
    
    /**
     * Check if a module is registered
     * @param {string} moduleId - Module identifier
     */
    static has(moduleId) {
        return this.modules.has(moduleId);
    }
    
    /**
     * Get all registered modules
     */
    static getAll() {
        return Array.from(this.modules.entries()).map(([id, module]) => ({
            id,
            ...module
        }));
    }
    
    /**
     * Validate that a module implements the required interface
     * @param {Object} moduleInstance - Module instance to validate
     */
    static validateInterface(moduleInstance) {
        const requiredMethods = [
            'initialize', 'onEnter', 'onExit', 'getState', 'setState', 'validate'
        ];
        
        const missingMethods = requiredMethods.filter(method => 
            typeof moduleInstance[method] !== 'function'
        );
        
        if (missingMethods.length > 0) {
            console.warn('Module missing required methods:', missingMethods);
            return false;
        }
        
        return true;
    }
}

/**
 * Export utility function for creating module instances
 * @param {string} moduleId - Module identifier
 * @param {Object} options - Module options
 */
async function createModuleInstance(moduleId, options = {}) {
    const module = XAVSModuleRegistry.get(moduleId);
    
    if (!module) {
        throw new Error(`Module ${moduleId} not found in registry`);
    }
    
    try {
        const ModuleClass = module.definition;
        const instance = new ModuleClass(moduleId, module.metadata.name);
        
        // Validate interface
        if (!XAVSModuleRegistry.validateInterface(instance)) {
            console.warn(`Module ${moduleId} does not fully implement required interface`);
        }
        
        return instance;
    } catch (error) {
        console.error(`Failed to create module instance for ${moduleId}:`, error);
        throw error;
    }
}

// Make classes available globally
window.XAVSModuleBase = XAVSModuleBase;
window.XAVSModuleInterface = XAVSModuleInterface;
window.ModuleInterface = {
    ...XAVSModuleInterface,
    loadModule: XAVSModuleBase.loadModule,
    getModuleData: XAVSModuleBase.getModuleData
}; // Alias for consistency with static methods
window.XAVSModuleRegistry = XAVSModuleRegistry;
window.createModuleInstance = createModuleInstance;