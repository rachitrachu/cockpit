/* global cockpit */
(() => {
  'use strict';

  async function initialize() {
    console.log('Initializing XOS Networking...');

    try {
      console.log('Waiting for ready state...');
      await waitForReady();
      console.log('Ready state achieved');

      setStatus('Initializing...');

      console.log('Checking DOM elements...');
      const tableBody = document.querySelector('#table-interfaces tbody');
      if (!tableBody) {
        console.warn('Interface table body not found, waiting...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('Setting up tabs...');
      setupTabs();

      console.log('Setting up event handlers...');
      setupEventHandlers();

      console.log('Setting up networking forms...');
      await setupNetworkingForms();

      console.log('Loading initial data...');
      setStatus('Loading data...');

      try {
        console.log('Loading interfaces...');
        await loadInterfaces();
        console.log('Interfaces loaded successfully');
      } catch (error) {
        console.error('Failed to load interfaces:', error);
        setStatus('Failed to load interfaces: ' + error);
        setTimeout(async () => {
          console.log('Retrying interface load...');
          try {
            await loadInterfaces();
          } catch (retryError) {
            console.error('Retry failed:', retryError);
          }
        }, 2000);
      }

      try {
        console.log('Loading connections...');
        await loadConnections();
        console.log('Connections loaded successfully');
      } catch (error) {
        console.warn('Failed to load connections:', error);
      }

      try {
        console.log('Loading diagnostics...');
        await loadDiagnostics();
        console.log('Diagnostics loaded successfully');
      } catch (error) {
        console.warn('Failed to load diagnostics:', error);
      }

      setStatus('Ready');
      console.log('XOS Networking initialized successfully');
      window.xosNetworkingReady = true;

    } catch (e) {
      console.error('Initialization failed:', e);
      setStatus('Initialization failed: ' + e);
      setTimeout(() => {
        console.log('Retrying initialization...');
        initialize();
      }, 3000);
    }
  }

  initialize();

})();
