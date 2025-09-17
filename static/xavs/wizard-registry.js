/**
 * XAVS Wizard Module Registry
 * Defines the integration mapping between existing XAVS modules and wizard steps
 */

// Define the complete wizard workflow
const WIZARD_STEPS = [
    {
        id: 'welcome',
        title: 'Welcome & Overview',
        description: 'Introduction to XAVS OpenStack deployment wizard',
        moduleId: 'xavs-welcome',
        order: 1,
        required: true,
        estimatedTime: '2 minutes',
        prerequisites: [],
        validation: {
            required: false,
            custom: 'welcomeStepValidation'
        }
    },
    {
        id: 'globals',
        title: 'Global Configuration',
        description: 'Configure global settings, networks, and VIPs',
        moduleId: 'xavs-globals',
        order: 2,
        required: true,
        estimatedTime: '5-10 minutes',
        prerequisites: ['welcome'],
        validation: {
            required: true,
            fields: ['network_interface', 'kolla_internal_vip_address'],
            custom: 'globalsStepValidation'
        }
    },
    {
        id: 'hosts',
        title: 'Host Configuration',
        description: 'Define target hosts and inventory',
        moduleId: 'xavs-hosts',
        order: 3,
        required: true,
        estimatedTime: '10-15 minutes',
        prerequisites: ['globals'],
        validation: {
            required: true,
            fields: ['target_hosts', 'ssh_config'],
            custom: 'hostsStepValidation'
        }
    },
    {
        id: 'networking',
        title: 'Network Configuration',
        description: 'Configure OpenStack networking and interfaces',
        moduleId: 'xavs-networking',
        order: 4,
        required: true,
        estimatedTime: '10-20 minutes',
        prerequisites: ['hosts'],
        validation: {
            required: true,
            fields: ['network_interfaces', 'neutron_config'],
            custom: 'networkingStepValidation'
        }
    },
    {
        id: 'storage',
        title: 'Storage Configuration',
        description: 'Configure Cinder storage and backend',
        moduleId: 'xavs-storage',
        order: 5,
        required: true,
        estimatedTime: '5-15 minutes',
        prerequisites: ['networking'],
        validation: {
            required: true,
            fields: ['storage_backend'],
            custom: 'storageStepValidation'
        }
    },
    {
        id: 'bootstrap',
        title: 'Bootstrap Configuration',
        description: 'Initialize and bootstrap OpenStack services',
        moduleId: 'xavs-bootstrap',
        order: 6,
        required: true,
        estimatedTime: '3-5 minutes',
        prerequisites: ['storage'],
        validation: {
            required: true,
            fields: ['bootstrap_config'],
            custom: 'bootstrapStepValidation'
        }
    },
    {
        id: 'deploy',
        title: 'Deployment Setup',
        description: 'Configure deployment parameters and start deployment',
        moduleId: 'xavs-deploy',
        order: 7,
        required: true,
        estimatedTime: '5-10 minutes',
        prerequisites: ['bootstrap'],
        validation: {
            required: true,
            fields: ['deployment_config'],
            custom: 'deployStepValidation'
        }
    },
    {
        id: 'summary',
        title: 'Summary & Launch',
        description: 'Review configuration and launch deployment',
        moduleId: 'xavs-main',
        order: 8,
        required: true,
        estimatedTime: '2-5 minutes',
        prerequisites: ['deploy'],
        validation: {
            required: true,
            custom: 'summaryStepValidation'
        }
    }
];

// Module integration specifications
const MODULE_INTEGRATIONS = {
    'xavs-welcome': {
        type: 'embedded',
        entryPoint: 'welcome.js',
        containerSelector: '#wizard-module-container',
        initFunction: 'initWelcomeModule',
        exportFunction: 'getWelcomeData',
        validateFunction: 'validateWelcome',
        cleanupFunction: 'cleanupWelcome'
    },
    'xavs-globals': {
        type: 'iframe', // Large existing module, use iframe
        entryPoint: 'index.html',
        containerSelector: '#wizard-module-container',
        initFunction: 'initGlobalsModule',
        exportFunction: 'getGlobalsData',
        validateFunction: 'validateGlobals',
        cleanupFunction: 'cleanupGlobals',
        communication: 'postMessage' // For iframe communication
    },
    'xavs-hosts': {
        type: 'iframe',
        entryPoint: 'index.html',
        containerSelector: '#wizard-module-container',
        initFunction: 'initHostsModule',
        exportFunction: 'getHostsData',
        validateFunction: 'validateHosts',
        cleanupFunction: 'cleanupHosts',
        communication: 'postMessage'
    },
    'xavs-networking': {
        type: 'iframe',
        entryPoint: 'index.html',
        containerSelector: '#wizard-module-container',
        initFunction: 'initNetworkingModule',
        exportFunction: 'getNetworkingData',
        validateFunction: 'validateNetworking',
        cleanupFunction: 'cleanupNetworking',
        communication: 'postMessage'
    },
    'xavs-storage': {
        type: 'iframe',
        entryPoint: 'index.html',
        containerSelector: '#wizard-module-container',
        initFunction: 'initStorageModule',
        exportFunction: 'getStorageData',
        validateFunction: 'validateStorage',
        cleanupFunction: 'cleanupStorage',
        communication: 'postMessage'
    },
    'xavs-bootstrap': {
        type: 'iframe',
        entryPoint: 'index.html',
        containerSelector: '#wizard-module-container',
        initFunction: 'initBootstrapModule',
        exportFunction: 'getBootstrapData',
        validateFunction: 'validateBootstrap',
        cleanupFunction: 'cleanupBootstrap',
        communication: 'postMessage'
    },
    'xavs-deploy': {
        type: 'iframe',
        entryPoint: 'index.html',
        containerSelector: '#wizard-module-container',
        initFunction: 'initDeployModule',
        exportFunction: 'getDeployData',
        validateFunction: 'validateDeploy',
        cleanupFunction: 'cleanupDeploy',
        communication: 'postMessage'
    }
};

// Export registry for use by wizard framework
window.XAVS_WIZARD_REGISTRY = {
    steps: WIZARD_STEPS,
    integrations: MODULE_INTEGRATIONS,
    
    // Helper functions
    getStepById(stepId) {
        return WIZARD_STEPS.find(step => step.id === stepId);
    },
    
    getStepByOrder(order) {
        return WIZARD_STEPS.find(step => step.order === order);
    },
    
    getNextStep(currentStepId) {
        const currentStep = this.getStepById(currentStepId);
        if (!currentStep) return null;
        return this.getStepByOrder(currentStep.order + 1);
    },
    
    getPreviousStep(currentStepId) {
        const currentStep = this.getStepById(currentStepId);
        if (!currentStep) return null;
        return this.getStepByOrder(currentStep.order - 1);
    },
    
    getIntegration(moduleId) {
        return MODULE_INTEGRATIONS[moduleId];
    },
    
    getTotalSteps() {
        return WIZARD_STEPS.length;
    },
    
    getEstimatedTotalTime() {
        // Calculate total estimated time (in minutes, taking average of ranges)
        let totalMinutes = 0;
        WIZARD_STEPS.forEach(step => {
            const timeStr = step.estimatedTime;
            const match = timeStr.match(/(\d+)(?:-(\d+))?\s*minutes?/);
            if (match) {
                const min = parseInt(match[1]);
                const max = match[2] ? parseInt(match[2]) : min;
                totalMinutes += (min + max) / 2;
            }
        });
        return Math.ceil(totalMinutes);
    }
};

console.log('[XAVS Registry] Wizard module registry loaded');
console.log(`[XAVS Registry] ${WIZARD_STEPS.length} steps configured`);
console.log(`[XAVS Registry] Estimated total time: ${window.XAVS_WIZARD_REGISTRY.getEstimatedTotalTime()} minutes`);