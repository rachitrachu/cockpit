/* XOS Networking - Main Application Entry Point */
/* global cockpit, waitForReady, setStatus, setupTabs, setupEventHandlers, setupNetworkingForms, setupSearchAndFilters, loadInterfaces, loadConnections, loadDiagnostics */
(() => {
  'use strict';

  async function initialize() {
    console.log('?? Initializing XOS Networking...');

    try {
      console.log('? Waiting for ready state...');
      await waitForReady();
      console.log('? Ready state achieved');

      setStatus('Initializing...');

      console.log('?? Checking DOM elements...');
      const tableBody = document.querySelector('#table-interfaces tbody');
      if (!tableBody) {
        console.warn('?? Interface table body not found, waiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log('?? Setting up tabs...');
      if (typeof setupTabs === 'function') {
        setupTabs();
      }

      console.log('? Setting up event handlers...');
      if (typeof setupEventHandlers === 'function') {
        setupEventHandlers();
      }

      console.log('?? Setting up search and filters...');
      if (typeof setupSearchAndFilters === 'function') {
        setupSearchAndFilters();
      }

      console.log('??? Setting up networking forms...');
      if (typeof setupNetworkingForms === 'function') {
        await setupNetworkingForms();
      }

      console.log('?? Loading initial data...');
      setStatus('Loading data...');

      // Load interfaces with retry
      try {
        console.log('?? Loading interfaces...');
        if (typeof loadInterfaces === 'function') {
          await loadInterfaces();
          console.log('? Interfaces loaded successfully');
        } else {
          console.error('? loadInterfaces function not found');
        }
      } catch (error) {
        console.error('? Failed to load interfaces:', error);
        setStatus('Failed to load interfaces: ' + error);
        
        // Retry once
        setTimeout(async () => {
          console.log('?? Retrying interface load...');
          try {
            if (typeof loadInterfaces === 'function') {
              await loadInterfaces();
              console.log('? Interfaces loaded on retry');
            }
          } catch (retryError) {
            console.error('? Retry failed:', retryError);
          }
        }, 3000);
      }

      // Load connections (optional)
      try {
        console.log('?? Loading connections...');
        if (typeof loadConnections === 'function') {
          await loadConnections();
          console.log('? Connections loaded successfully');
        }
      } catch (error) {
        console.warn('?? Failed to load connections:', error);
      }

      // Load diagnostics (optional)
      try {
        console.log('?? Loading diagnostics...');
        if (typeof loadDiagnostics === 'function') {
          await loadDiagnostics();
          console.log('? Diagnostics loaded successfully');
        }
      } catch (error) {
        console.warn('?? Failed to load diagnostics:', error);
      }

      setStatus('Ready');
      console.log('?? XOS Networking initialized successfully');
      window.xosNetworkingReady = true;

    } catch (e) {
      console.error('?? Initialization failed:', e);
      setStatus('Initialization failed: ' + e);
      
      // Retry initialization after delay
      setTimeout(() => {
        console.log('?? Retrying initialization...');
        initialize();
      }, 5000);
    }
  }

  // Start initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
