'use strict';

/**
 * Multi-file Netplan UI Support
 * Provides UI components for viewing and managing multiple netplan files
 */

/**
 * Show file selection dialog for viewing netplan configurations
 */
function showNetplanFileDialog() {
  const fileDialog = document.createElement('dialog');
  fileDialog.style.maxWidth = '600px';
  fileDialog.className = 'netplan-file-dialog';
  fileDialog.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2><i class="fas fa-file-code"></i> View Netplan Configuration</h2>
        <button class="close-btn" onclick="this.closest('dialog').close()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="color: var(--muted-color); margin-bottom: 1rem;">Choose which configuration to view:</p>
        
        <div class="file-selection-grid" style="display: grid; gap: 0.75rem; margin-bottom: 1rem;">
          <button class="btn btn-outline-primary" id="view-cockpit-legacy">
            <i class="fas fa-file-alt"></i> <strong>99-cockpit.yaml</strong> (Legacy/Complete)
            <small style="display: block; opacity: 0.7; margin-top: 0.25rem;">Current single-file config</small>
          </button>
          
          <button class="btn btn-outline-success" id="view-cockpit-interfaces">
            <i class="fas fa-network-wired"></i> <strong>80-cockpit-interfaces.yaml</strong> (Interfaces)
            <small style="display: block; opacity: 0.7; margin-top: 0.25rem;">VLANs, bridges, bonds</small>
          </button>
          
          <button class="btn btn-outline-info" id="view-cockpit-overrides">
            <i class="fas fa-edit"></i> <strong>85-cockpit-overrides.yaml</strong> (Overrides)
            <small style="display: block; opacity: 0.7; margin-top: 0.25rem;">Physical interface modifications</small>
          </button>
          
          <button class="btn btn-outline-warning" id="view-cockpit-routes">
            <i class="fas fa-route"></i> <strong>70-cockpit-routes.yaml</strong> (Routes)
            <small style="display: block; opacity: 0.7; margin-top: 0.25rem;">Route preservation</small>
          </button>
          
          <button class="btn btn-outline-secondary" id="view-all-files">
            <i class="fas fa-folder-open"></i> <strong>All Netplan Files</strong>
            <small style="display: block; opacity: 0.7; margin-top: 0.25rem;">System + Cockpit files</small>
          </button>
          
          <button class="btn btn-outline-dark" id="view-merged-config">
            <i class="fas fa-layer-group"></i> <strong>Merged Configuration</strong>
            <small style="display: block; opacity: 0.7; margin-top: 0.25rem;">Combined effective config</small>
          </button>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn btn-secondary" id="file-dialog-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(fileDialog);
  fileDialog.showModal();

  // Handle file selection
  const handleFileView = async (filename, description, command) => {
    try {
      setStatus(`Loading ${description}...`);
      const config = await run('bash', ['-c', command], { superuser: 'try' });
      fileDialog.close();
      showConfigModal(config || `# ${description} not found or empty`, `${description} (${filename})`);
    } catch (error) {
      console.warn(`Failed to load ${description}:`, error);
      fileDialog.close();
      showConfigModal(`# ${description} not found\n# Error: ${error.message}`, `${description} (Error)`);
    } finally {
      setStatus('Ready');
    }
  };

  // Event handlers
  $('#view-cockpit-legacy', fileDialog).addEventListener('click', () => {
    handleFileView('99-cockpit.yaml', 'Legacy Cockpit Config', 'cat /etc/netplan/99-cockpit.yaml 2>/dev/null || echo "# File not found"');
  });

  $('#view-cockpit-interfaces', fileDialog).addEventListener('click', () => {
    handleFileView('80-cockpit-interfaces.yaml', 'Cockpit Interfaces', 'cat /etc/netplan/80-cockpit-interfaces.yaml 2>/dev/null || echo "# File not found"');
  });

  $('#view-cockpit-overrides', fileDialog).addEventListener('click', () => {
    handleFileView('85-cockpit-overrides.yaml', 'Cockpit Overrides', 'cat /etc/netplan/85-cockpit-overrides.yaml 2>/dev/null || echo "# File not found"');
  });

  $('#view-cockpit-routes', fileDialog).addEventListener('click', () => {
    handleFileView('70-cockpit-routes.yaml', 'Cockpit Routes', 'cat /etc/netplan/70-cockpit-routes.yaml 2>/dev/null || echo "# File not found"');
  });

  $('#view-all-files', fileDialog).addEventListener('click', () => {
    const command = 'for f in /etc/netplan/*.yaml; do echo "# === $f ==="; cat "$f" 2>/dev/null || echo "# Could not read file"; echo ""; done';
    handleFileView('*.yaml', 'All Netplan Files', command);
  });

  $('#view-merged-config', fileDialog).addEventListener('click', async () => {
    try {
      setStatus('Loading merged configuration...');
      // Use the JavaScript function to get merged config
      if (typeof window.loadNetplanConfig === 'function') {
        const mergedConfig = await window.loadNetplanConfig();
        fileDialog.close();
        
        // Convert config to YAML-like format for display
        const yamlContent = convertConfigToYAML(mergedConfig);
        showConfigModal(yamlContent, 'Merged Configuration (JavaScript)');
      } else {
        handleFileView('merged', 'Merged Configuration', 'cat /etc/netplan/99-cockpit.yaml 2>/dev/null || echo "# No configuration found"');
      }
    } catch (error) {
      console.warn('Failed to load merged config:', error);
      fileDialog.close();
      showConfigModal(`# Failed to load merged configuration\n# Error: ${error.message}`, 'Merged Configuration (Error)');
    } finally {
      setStatus('Ready');
    }
  });

  $('#file-dialog-cancel', fileDialog).addEventListener('click', () => {
    fileDialog.close();
    setStatus('Ready');
  });

  // Auto-cleanup
  fileDialog.addEventListener('close', () => {
    setTimeout(() => {
      if (document.body.contains(fileDialog)) {
        document.body.removeChild(fileDialog);
      }
    }, 100);
  });
}

/**
 * Show configuration modal with copy/download functionality
 */
function showConfigModal(config, title) {
  const modal = document.createElement('dialog');
  modal.style.maxWidth = '90vw';
  modal.style.maxHeight = '80vh';
  modal.className = 'config-view-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2><i class="fas fa-file-code"></i> ${title}</h2>
        <button class="close-btn" onclick="this.closest('dialog').close()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
          <button class="btn btn-sm btn-outline-primary" id="copy-config">
            <i class="fas fa-copy"></i> Copy
          </button>
          <button class="btn btn-sm btn-outline-success" id="download-config">
            <i class="fas fa-download"></i> Download
          </button>
          <div style="margin-left: auto; font-size: 0.9rem; color: var(--muted-color); align-self: center;">
            ${config.split('\n').length} lines
          </div>
        </div>
        <pre style="background: var(--card-bg); padding: 1rem; border-radius: 4px; overflow: auto; max-height: 60vh; font-family: 'Courier New', monospace; font-size: 0.9rem; white-space: pre-wrap; line-height: 1.4;">${config}</pre>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('dialog').close()">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.showModal();

  // Copy functionality
  modal.querySelector('#copy-config').addEventListener('click', () => {
    navigator.clipboard.writeText(config).then(() => {
      if (typeof window.showToast === 'function') {
        window.showToast('Configuration copied to clipboard', 'success', 2000);
      } else {
        alert('Configuration copied to clipboard');
      }
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = config;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (typeof window.showToast === 'function') {
        window.showToast('Configuration copied to clipboard', 'success', 2000);
      } else {
        alert('Configuration copied to clipboard');
      }
    });
  });

  // Download functionality
  modal.querySelector('#download-config').addEventListener('click', () => {
    const blob = new Blob([config], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = title.replace(/[^a-zA-Z0-9.-]/g, '_') + '.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    if (typeof window.showToast === 'function') {
      window.showToast('Configuration downloaded', 'success', 2000);
    }
  });

  // Auto-cleanup
  modal.addEventListener('close', () => {
    setTimeout(() => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    }, 100);
  });
}

/**
 * Convert JavaScript config object to YAML-like format for display
 */
function convertConfigToYAML(config) {
  if (!config || !config.network) {
    return '# No configuration available';
  }

  let yaml = '# Merged Netplan Configuration\n';
  yaml += '# Generated by XAVS Networking\n\n';
  yaml += 'network:\n';
  yaml += `  version: ${config.network.version || 2}\n`;
  yaml += `  renderer: ${config.network.renderer || 'networkd'}\n`;

  // Add each section
  const sections = ['ethernets', 'vlans', 'bridges', 'bonds'];
  
  for (const section of sections) {
    if (config.network[section] && Object.keys(config.network[section]).length > 0) {
      yaml += `\n  ${section}:\n`;
      
      for (const [name, iface] of Object.entries(config.network[section])) {
        yaml += `    ${name}:\n`;
        
        // Add interface properties with proper indentation
        for (const [key, value] of Object.entries(iface)) {
          if (Array.isArray(value)) {
            yaml += `      ${key}:\n`;
            value.forEach(item => {
              yaml += `        - ${item}\n`;
            });
          } else if (typeof value === 'object' && value !== null) {
            yaml += `      ${key}:\n`;
            for (const [subKey, subValue] of Object.entries(value)) {
              if (Array.isArray(subValue)) {
                yaml += `        ${subKey}: [${subValue.join(', ')}]\n`;
              } else {
                yaml += `        ${subKey}: ${subValue}\n`;
              }
            }
          } else {
            yaml += `      ${key}: ${value}\n`;
          }
        }
      }
    }
  }

  return yaml;
}

/**
 * Show multi-file status information in the interface
 */
function showMultiFileStatus() {
  // This will be called to show status of multiple files in the UI
  const statusContainer = document.querySelector('#netplan-file-status');
  if (!statusContainer) return;

  // Get file status
  const fileStatus = getNetplanFileStatus();
  
  statusContainer.innerHTML = `
    <div class="multi-file-status">
      <h4><i class="fas fa-files"></i> Netplan Files Status</h4>
      <div class="file-status-grid">
        ${Object.entries(fileStatus).map(([file, status]) => `
          <div class="file-status-item ${status.exists ? 'exists' : 'missing'}">
            <span class="file-name">${file}</span>
            <span class="file-status">${status.exists ? '✓' : '✗'}</span>
            ${status.size ? `<span class="file-size">${status.size}</span>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Get status of all netplan files
 */
async function getNetplanFileStatus() {
  const files = {
    '70-cockpit-routes.yaml': { purpose: 'Routes' },
    '80-cockpit-interfaces.yaml': { purpose: 'Interfaces' },
    '85-cockpit-overrides.yaml': { purpose: 'Overrides' },
    '99-cockpit.yaml': { purpose: 'Legacy' }
  };

  const status = {};
  
  for (const filename of Object.keys(files)) {
    try {
      const result = await run('ls', ['-la', `/etc/netplan/${filename}`], { superuser: 'try' });
      status[filename] = {
        exists: true,
        size: result.split(/\s+/)[4] + ' bytes',
        purpose: files[filename].purpose
      };
    } catch (e) {
      status[filename] = {
        exists: false,
        purpose: files[filename].purpose
      };
    }
  }
  
  return status;
}

// Export functions globally
window.showNetplanFileDialog = showNetplanFileDialog;
window.showConfigModal = showConfigModal;
window.convertConfigToYAML = convertConfigToYAML;
window.showMultiFileStatus = showMultiFileStatus;
window.getNetplanFileStatus = getNetplanFileStatus;

console.log('✅ Multi-file Netplan UI support loaded');
