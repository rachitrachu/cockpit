/* XOS Networking - Main Application */
/* global cockpit */

// Initialize the application
(() => {
  'use strict';
  
  console.log('XOS Networking starting...');

  // Main initialization function
  async function init() {
    console.log('Initializing XOS Networking...');
    
    try {
      // Setup global error handlers
      if (window.XOSNetworking?.core?.setupErrorHandlers) {
        window.XOSNetworking.core.setupErrorHandlers();
      }
      
      // Wait for DOM and Cockpit to be ready
      if (window.XOSNetworking?.core?.waitForReady) {
        await window.XOSNetworking.core.waitForReady();
      } else {
        console.error('Core module not loaded!');
        return;
      }
      
      const { setStatus } = window.XOSNetworking.core;
      setStatus('Starting up...');
      
      // Setup tabs
      if (window.XOSNetworking?.core?.setupTabs) {
        window.XOSNetworking.core.setupTabs();
      }
      
      // Setup event handlers
      if (window.XOSNetworking?.eventHandlers?.setupEventHandlers) {
        window.XOSNetworking.eventHandlers.setupEventHandlers();
      }
      
      // Setup networking forms - this populates dropdowns
      if (window.XOSNetworking?.forms?.setupNetworkingForms) {
        await window.XOSNetworking.forms.setupNetworkingForms();
      }
      
      // Load initial data
      const loadPromises = [];
      
      if (window.XOSNetworking?.networkInterface?.loadInterfaces) {
        loadPromises.push(window.XOSNetworking.networkInterface.loadInterfaces());
      }
      
      if (window.XOSNetworking?.diagnostics?.loadDiagnostics) {
        loadPromises.push(window.XOSNetworking.diagnostics.loadDiagnostics());
      }
      
      if (loadPromises.length > 0) {
        await Promise.all(loadPromises);
      }
      
      setStatus('Ready');
      console.log('XOS Networking initialization complete');
      
    } catch (e) {
      console.error('Initialization failed:', e);
      if (window.XOSNetworking?.core?.setStatus) {
        window.XOSNetworking.core.setStatus('Initialization failed: ' + e);
      }
    }
  }

  // Check if all modules are loaded before initializing
  function checkModulesLoaded() {
    const requiredModules = [
      'XOSNetworking.core',
      'XOSNetworking.modals',
      'XOSNetworking.networkInterface',
      'XOSNetworking.netplan',
      'XOSNetworking.forms',
      'XOSNetworking.diagnostics',
      'XOSNetworking.eventHandlers'
    ];
    
    const missing = requiredModules.filter(module => {
      const parts = module.split('.');
      let obj = window;
      for (const part of parts) {
        if (!obj[part]) return true;
        obj = obj[part];
      }
      return false;
    });
    
    if (missing.length > 0) {
      console.warn('Missing modules:', missing);
      console.log('Retrying in 100ms...');
      setTimeout(checkModulesLoaded, 100);
      return;
    }
    
    console.log('All modules loaded, starting initialization');
    init().catch(e => console.error('Init failed:', e));
  }

  // Wait for DOM to be ready, then check for modules
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM ready, checking for modules...');
      checkModulesLoaded();
    });
  } else {
    console.log('DOM already ready, checking for modules...');
    checkModulesLoaded();
  }

})();
