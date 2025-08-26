/* XOS Networking - Event Handlers */
/* global XOSNetworking */

(() => {
  'use strict';

  const { $, setStatus, run, getSymbol, createSymbolMessage } = XOSNetworking.core;
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
            <h2>?? ${result.filename}</h2>
            <div style="margin: 1rem 0;">
              <label>
                <span style="font-weight: 500;">Configuration Content:</span>
                <textarea readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 0.875rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; resize: vertical;">${result.config}</textarea>
              </label>
            </div>
            <div class="modal-buttons">
              <button type="button" class="btn primary" id="close-config-modal">${getSymbol('success')} Close</button>
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
        if (!confirm(createSymbolMessage('warning', 'Apply Netplan configuration?\n\nThis may temporarily disrupt network connectivity while the configuration is applied.'))) return;
        
        const result = await applyNetplan();
        
        if (result.error) {
          alert(createSymbolMessage('error', `Failed to apply Netplan configuration:\n${result.error}`));
        } else {
          alert(createSymbolMessage('success', 'Netplan configuration applied successfully!\n\nNetwork interfaces have been reconfigured.'));
        }
      });
    }

    // Test netplan button
    const btnTestNetplan = $('#btn-test-netplan');
    if (btnTestNetplan) {
      btnTestNetplan.addEventListener('click', async () => {
        const result = await testNetplan();
        
        if (result.error) {
          alert(createSymbolMessage('error', `Netplan test failed:\n${result.error}\n\nCheck console for details.`));
        } else {
          alert(createSymbolMessage('success', 'Netplan test successful!\n\nCheck /etc/netplan/99-cockpit.yaml for changes.'));
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
        modal.innerHTML = `
          <div class="modal-content">
            <h2>? Backup Created Successfully</h2>
            <div style="margin: 1rem 0;">
              <p><strong>?? Backup File:</strong><br><code>${result.backupFile}</code></p>
              <p><strong>?? File Details:</strong><br><code>${result.backupInfo}</code></p>
              <details>
                <summary><strong>?? Recent Backups</strong></summary>
                <pre style="background: #f8f9fa; padding: 1rem; border-radius: 4px; font-size: 0.875rem; max-height: 200px; overflow-y: auto;">${result.backupList}</pre>
              </details>
              <p><strong>?? Next Steps:</strong><br>To restore from this backup, use the command:<br><code>sudo tar -xzf ${result.backupFile} -C /etc/netplan/</code></p>
            </div>
            <div class="modal-buttons">
              <button type="button" class="btn primary" id="close-backup-modal">? Close</button>
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
        
        // Write the configuration
        if (typeof config === 'string') {
          // Direct YAML content
          await cockpit.spawn([
            'bash', '-c', `echo '${config.replace(/'/g, "'\\''")}' > /etc/netplan/99-cockpit.yaml`
          ], {
            superuser: 'require',
            err: 'out'
          });
        } else {
          // JSON config - convert to netplan action
          // This is a simplified approach - you might want to enhance this
          alert('?? JSON import not fully implemented yet. Please use YAML format.');
          setStatus('Ready');
          return;
        }
        
        // Apply the configuration
        await run('netplan', ['apply'], { superuser: 'require' });
        
        alert('? Configuration imported and applied successfully!\n\nReloading interfaces...');
        
        // Refresh interfaces and forms
        if (window.XOSNetworking.networkInterface?.loadInterfaces) {
          await window.XOSNetworking.networkInterface.loadInterfaces();
        }
        if (window.XOSNetworking.forms?.setupNetworkingForms) {
          await window.XOSNetworking.forms.setupNetworkingForms();
        }
        
      } catch (error) {
        console.error('Import failed:', error);
        alert(`? Failed to import configuration:\n${error.message || error}`);
      } finally {
        setStatus('Ready');
        document.body.removeChild(input);
      }
    });
    
    document.body.appendChild(input);
    input.click();
  }

  // Export configuration functionality
  async function exportConfiguration() {
    try {
      setStatus('Exporting configuration...');
      
      // Show export options
      const exportType = await new Promise((resolve) => {
        const modal = document.createElement('dialog');
        modal.innerHTML = `
          <div class="modal-content">
            <h2>?? Export Network Configuration</h2>
            <p>Choose what to export:</p>
            
            <div style="margin: 1rem 0;">
              <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); cursor: pointer;">
                <input type="radio" name="export-type" value="cockpit" checked>
                <div>
                  <strong>?? XOS Networking Config</strong> (99-cockpit.yaml only)
                  <br><small style="color: var(--muted-color);">Export only the XOS Networking configuration file</small>
                </div>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); cursor: pointer;">
                <input type="radio" name="export-type" value="all">
                <div>
                  <strong>?? All Netplan Files</strong> (entire /etc/netplan/ directory)
                  <br><small style="color: var(--muted-color);">Export all netplan configuration files</small>
                </div>
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: var(--border-radius); cursor: pointer;">
                <input type="radio" name="export-type" value="current">
                <div>
                  <strong>?? Current Network State</strong> (live interface configuration)
                  <br><small style="color: var(--muted-color);">Export current runtime network configuration</small>
                </div>
              </label>
            </div>
            
            <div class="modal-buttons">
              <button type="button" class="btn" id="export-cancel">? Cancel</button>
              <button type="button" class="btn primary" id="export-confirm">?? Export</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(modal);
        setupModal(modal);
        
        // Handle cancel button
        modal.querySelector('#export-cancel').addEventListener('click', () => {
          resolve(null);
          modal.close();
        });
        
        modal.querySelector('#export-confirm').addEventListener('click', () => {
          const selected = modal.querySelector('input[name="export-type"]:checked');
          resolve(selected ? selected.value : 'cockpit');
          modal.close();
        });
        
        modal.showModal();
      });
      
      if (!exportType) {
        setStatus('Ready');
        return;
      }
      
      let config = '';
      let filename = 'netplan-export.yaml';
      
      if (exportType === 'cockpit') {
        // Export only XOS Networking config
        try {
          config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
          filename = '99-cockpit.yaml';
        } catch (e) {
          config = '# No XOS Networking configuration found\n# Generated by XOS Networking\nnetwork:\n  version: 2\n  renderer: networkd\n\n';
          filename = '99-cockpit-empty.yaml';
        }
      } else if (exportType === 'all') {
        // Export all netplan files
        try {
          const allConfigs = await run('bash', ['-c', 'for f in /etc/netplan/*.yaml; do echo "# --- $f ---"; cat "$f" 2>/dev/null; echo; done'], { superuser: 'try' });
          config = allConfigs;
          filename = 'netplan-all-configs.yaml';
        } catch (e) {
          config = '# No netplan configuration found\n';
          filename = 'netplan-all-empty.yaml';
        }
      } else if (exportType === 'current') {
        // Export current network state
        try {
          const interfaces = await run('ip', ['-details', 'addr', 'show']);
          const routes = await run('ip', ['route']);
          const dns = await run('cat', ['/etc/resolv.conf']).catch(() => '# DNS info not available');
          
          config = `# Current Network State Export
# Generated by XOS Networking on ${new Date().toISOString()}
# This is NOT a netplan configuration file - it's a snapshot of current network state

# === INTERFACE INFORMATION ===
${interfaces}

# === ROUTING TABLE ===
${routes}

# === DNS CONFIGURATION ===
${dns}`;
          filename = 'network-state-snapshot.txt';
        } catch (e) {
          throw new Error('Failed to gather current network state: ' + e);
        }
      }
      
      // Add timestamp and metadata (except for current state which has its own header)
      if (exportType !== 'current') {
        const timestamp = new Date().toISOString();
        const header = `# Netplan Configuration Export
# Generated by XOS Networking on ${timestamp}
# Hostname: ${window.location.hostname}
# Export Type: ${exportType}

`;
        config = header + config;
      }
      
      // Create download
      const mimeType = filename.endsWith('.txt') ? 'text/plain' : 'text/yaml';
      const blob = new Blob([config], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert(`? Configuration exported successfully!\n\n?? File: ${filename}\n?? Size: ${config.length} bytes\n?? Type: ${exportType}`);
      
    } catch (error) {
      console.error('Export failed:', error);
      alert(`? Failed to export configuration:\n${error.message || error}`);
    } finally {
      setStatus('Ready');
    }
  }

  // Export event handler functions
  window.XOSNetworking.eventHandlers = {
    setupEventHandlers,
    setupMainButtons,
    setupNetplanButtons,
    setupImportExportButtons,
    importConfiguration,
    exportConfiguration
  };

})();