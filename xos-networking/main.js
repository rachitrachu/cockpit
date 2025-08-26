/* XOS Networking - Main Application */
/* global cockpit */

// Initialize the application
(() => {
  'use strict';
  
  console.log('XOS Networking main.js starting...');

  // Initialize when everything is ready
  async function init() {
    try {
      console.log('Waiting for DOM and Cockpit...');
      
      // Wait for DOM
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }

      // Wait for Cockpit API
      if (typeof cockpit === 'undefined') {
        console.log('Waiting for Cockpit API...');
        await new Promise(resolve => {
          const check = () => {
            if (typeof cockpit !== 'undefined') {
              console.log('Cockpit API ready');
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
      }

      // Check if core module is available
      if (typeof window.XOSNetworking === 'undefined' || !window.XOSNetworking.core) {
        console.log('XOS core module not available, using fallback initialization');
        
        // Fallback initialization without modules
        const { setupTabs, loadInterfaces, setupEventHandlers } = await import('./js/simple-init.js');
        setupTabs();
        setupEventHandlers();
        await loadInterfaces();
        
      } else {
        console.log('Using XOS core modules');
        
        // Use the core module system
        const { waitForReady, setupTabs, setStatus } = window.XOSNetworking.core;
        const { refreshInterfaces } = window.XOSNetworking.networkInterface;
        
        await waitForReady();
        setupTabs();
        
        // Load initial data
        await refreshInterfaces();
        
        setStatus('Ready');
      }
      
      console.log('XOS Networking initialized successfully');
      
    } catch (e) {
      console.error('XOS Networking initialization failed:', e);
      
      // Try to show error to user
      const statusEl = document.querySelector('#status');
      if (statusEl) {
        statusEl.textContent = 'Initialization failed';
        statusEl.style.color = 'red';
      }
    }
  }

  // Start initialization
  init();
})();
