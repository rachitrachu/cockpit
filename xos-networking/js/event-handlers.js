/* XOS Networking - Event Handlers */
/* global XOSNetworking */

(() => {
  'use strict';

  const { $, setStatus, run, getSymbol, createSymbolMessage, createSymbolElement, createSVGSymbol } = XOSNetworking.core;
  const { setupModal } = XOSNetworking.modals;
  const { 
    applyNetplan, 
    showNetplanConfig, 
    testNetplan, 
    checkNetplanFile, 
    backupNetplan 
  } = XOSNetworking.netplan;

  // Setup all event handlers
  function setupEventHandlers() {
    console.log('Setting up event handlers...');
    
    setupMainButtons();
    setupNetplanButtons();
    setupImportExportButtons();
    
    // Setup diagnostics handlers
    if (window.XOSNetworking.diagnostics?.setupDiagnosticHandlers) {
      window.XOSNetworking.diagnostics.setupDiagnosticHandlers();
    }
  }

  // Setup main navigation and refresh buttons
  function setupMainButtons() {
    // Main refresh button (in header)
    const refreshBtn = $('#btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        console.log('Main refresh button clicked');
        setStatus('Refreshing all data...');
        await Promise.all([
          window.XOSNetworking.networkInterface?.loadInterfaces?.() || Promise.resolve(),
          window.XOSNetworking.diagnostics?.loadDiagnostics?.() || Promise.resolve()
        ]);
        setStatus('All data refreshed');
      });
    }

    // Refresh interfaces button (in toolbar)
    const refreshIfacesBtn = $('#btn-refresh-interfaces');
    if (refreshIfacesBtn) {
      refreshIfacesBtn.addEventListener('click', async () => {
        console.log('Refresh interfaces button clicked');
        if (window.XOSNetworking.networkInterface?.loadInterfaces) {
          await window.XOSNetworking.networkInterface.loadInterfaces();
        }
      });
    }
  }

  // Setup netplan-related buttons
  function setupNetplanButtons() {
    // Show netplan config button
    const btnShowNetplan = $('#btn-show-netplan');
    if (btnShowNetplan) {
      btnShowNetplan.addEventListener('click', async () => {
        console.log('Show netplan config button clicked');
        const result = await showNetplanConfig();
        
        if (result.error) {
          alert(result.error);
          return;
        }
        
        // Create a modal to display the configuration
        const modal = document.createElement('dialog');
        modal.innerHTML = `
          <div class="modal-content">
            <h2><span class="simple-info"></span>${result.filename}</h2>
            <div style="margin: 1rem 0;">
              <label>
                <span style="font-weight: 500;">Configuration Content:</span>
                <textarea readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 0.875rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; resize: vertical;">${result.config}</textarea>
              </label>
            </div>
            <div class="modal-buttons">
              <button type="button" class="btn primary" id="close-config-modal">
                <span class="simple-check"></span>Close
              </button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
        setupModal(modal);
        
        // Add explicit close button handler
        const closeBtn = modal.querySelector('#close-config-modal');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.close();
          });
        }
        
        modal.showModal();
      });
    }

    // Apply netplan configuration button
    const btnApplyNetplan = $('#btn-apply-netplan');
    if (btnApplyNetplan) {
      btnApplyNetplan.addEventListener('click', async () => {
        if (!confirm('[!] Apply Netplan configuration?\n\nThis may temporarily disrupt network connectivity while the configuration is applied.')) return;
        
        const result = await applyNetplan();
        
        if (result.error) {
          alert(`[ERROR] Failed to apply Netplan configuration:\n${result.error}`);
        } else {
          alert('[SUCCESS] Netplan configuration applied successfully!\n\nNetwork interfaces have been reconfigured.');
        }
      });
    }

    // Test netplan button
    const btnTestNetplan = $('#btn-test-netplan');
    if (btnTestNetplan) {
      btnTestNetplan.addEventListener('click', async () => {
        const result = await testNetplan();
        
        if (result.error) {
          alert(`[ERROR] Netplan test failed:\n${result.error}\n\nCheck console for details.`);
        } else {
          alert('[SUCCESS] Netplan test successful!\n\nCheck /etc/netplan/99-cockpit.yaml for changes.');
        }
      });
    }

    // Check netplan file status
    const btnCheckNetplan = $('#btn-check-netplan');
    if (btnCheckNetplan) {
      btnCheckNetplan.addEventListener('click', async () => {
        const result = await checkNetplanFile();
        
        if (result.error) {
          alert(result.error);
          return;
        }
        
        let message = '';
        if (result.fileExists) {
          message = `? Netplan file exists at /etc/netplan/99-cockpit.yaml\n\n?? Current contents:\n${result.fileContent}`;
        } else {
          message = '? Netplan file does not exist at /etc/netplan/99-cockpit.yaml\n\nThe file will be created when you first configure an IP address.';
        }
        
        alert(message);
      });
    }

    // Backup netplan button  
    const btnBackupNetplan = $('#btn-backup-netplan');
    if (btnBackupNetplan) {
      btnBackupNetplan.addEventListener('click', async () => {
        console.log('Backup netplan button clicked');
        const result = await backupNetplan();
        
        if (result.error) {
          alert(result.error);
          return;
        }
        
        // Show success message with details
        const modal = document.createElement('dialog');
        modal.className = 'backup-modal';
        modal.innerHTML = `
          <div class="modal-content">
            <h2><span class="simple-check"></span>Backup Created Successfully</h2>
            <div class="file-info">
              <p><strong>Backup File:</strong><br><code>${result.backupFile}</code></p>
              <p><strong>File Details:</strong><br><code>${result.backupInfo}</code></p>
              <details>
                <summary><strong>Recent Backups</strong></summary>
                <pre style="background: #f8f9fa; padding: 1rem; border-radius: 4px; font-size: 0.875rem; max-height: 200px; overflow-y: auto;">${result.backupList}</pre>
              </details>
              <div class="command-example">
                <strong>To restore from this backup:</strong><br>
                sudo tar -xzf ${result.backupFile} -C /etc/netplan/
              </div>
            </div>
            <div class="modal-buttons">
              <button type="button" class="btn primary btn-with-text-icon" id="close-backup-modal">
                <span class="simple-check"></span>Close
              </button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
        setupModal(modal);
        
        // Add explicit close button handler
        const closeBtn = modal.querySelector('#close-backup-modal');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.close();
          });
        }
        
        modal.showModal();
      });
    }
  }

  // Setup import/export configuration buttons
  function setupImportExportButtons() {
    // Setup import config button
    const btnImportConfig = $('#btn-import-config');
    if (btnImportConfig) {
      btnImportConfig.addEventListener('click', async () => {
        await importConfiguration();
      });
    }

    // Setup export config button
    const btnExportConfig = $('#btn-export-config');
    if (btnExportConfig) {
      btnExportConfig.addEventListener('click', async () => {
        await exportConfiguration();
      });
    }
  }

  // Import configuration functionality
  async function importConfiguration() {
    // Create file input for importing
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,.json';
    input.style.display = 'none';
    
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        setStatus('Importing configuration...');
        
        const content = await file.text();
        let config;
        
        // Try to parse as YAML first, then JSON
        try {
          // Simple YAML parsing (for basic netplan configs)
          if (file.name.endsWith('.json')) {
            config = JSON.parse(content);
            
            // Convert JSON to YAML-like structure for netplan
            if (config.network) {
              config = content; // Keep as JSON for now, implement conversion later
            } else {
              throw new Error('Invalid netplan JSON structure - missing "network" key');
            }
          } else {
            // For YAML, validate basic structure
            if (!content.includes('network:') && !content.includes('version:')) {
              const addHeader = confirm('?? This file doesn\'t appear to be a standard netplan configuration.\n\nWould you like to add a basic netplan header?');
              if (addHeader) {
                config = 'network:\n  version: 2\n  renderer: networkd\n\n' + content;
              } else {
                config = content;
              }
            } else {
              config = content;
            }
          }
        } catch (parseError) {
          throw new Error(`Failed to parse config file: ${parseError.message}`);
        }
        
        // Show preview and confirmation
        const proceed = confirm(`?? Import Network Configuration?\n\nFile: ${file.name}\nSize: ${file.size} bytes\n\n?? This will replace the current netplan configuration.\n\nProceed with import?`);
        
        if (!proceed) {
          setStatus('Import cancelled');
          return;
        }
        
        // Writer