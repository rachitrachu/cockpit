'use strict';
/* global $, $$, run, setStatus, setupModal, netplanAction, loadInterfaces */

async function loadConnections() {
  console.log('Loading connections...');
  const tbody = $('#table-connections tbody');
  if (!tbody) return;

  try {
    const output = await run('networkctl', ['list']);
    const lines = output.split('\n').slice(1).filter(line => line.trim());

    tbody.innerHTML = '';

    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${parts[1] || ''}</td>
          <td>�</td>
          <td>${parts[2] || ''}</td>
          <td>${parts[3] || ''}</td>
          <td>�</td>
          <td>�</td>
          <td>�</td>
          <td class="actions">�</td>
        `;
        tbody.appendChild(row);
      }
    });

    console.log('Loaded', lines.length, 'connections');

  } catch (e) {
    console.warn('Failed to load connections:', e);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Connection data unavailable</td></tr>';
  }
}

async function loadDiagnostics() {
  console.log('Loading diagnostics...');

  try {
    const routes = await run('route', ['-n'], { superuser: 'try' });
    const routesEl = $('#routes-out');
    if (routesEl) routesEl.textContent = routes || '(no routes)';
  } catch (e) {
    // Fallback to netstat if route command fails
    try {
      const routes = await run('netstat', ['-rn'], { superuser: 'try' });
      const routesEl = $('#routes-out');
      if (routesEl) routesEl.textContent = routes || '(no routes)';
    } catch (e2) {
      const routesEl = $('#routes-out');
      if (routesEl) routesEl.textContent = 'Error loading routes: ' + e2;
    }
  }

  try {
    const dns = await run('cat', ['/etc/resolv.conf']);
    const dnsEl = $('#dns-out');
    if (dnsEl) dnsEl.textContent = dns || '(no DNS configuration)';
  } catch (e) {
    const dnsEl = $('#dns-out');
    if (dnsEl) dnsEl.textContent = 'Error loading DNS config: ' + e;
  }
}

function setupTabs() {
  const tabs = $$('.tab');
  const panels = $$('.tab-panel');

  console.log('Found', tabs.length, 'tabs and', panels.length, 'panels');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      console.log('Tab clicked:', targetId);

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      panels.forEach(p => p.classList.remove('active'));
      const targetPanel = document.querySelector(`#tab-${targetId}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

function setupEventHandlers() {
  console.log('Setting up event handlers...');

  // Main refresh button (updated ID)
  const refreshBtn = $('#btn-refresh-all');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      console.log('Main refresh button clicked');
      setStatus('Refreshing all data...');
      await Promise.all([
        loadInterfaces(),
        loadConnections(),
        loadDiagnostics()
      ]);
      setStatus('All data refreshed');
    });
  }

  const refreshIfacesBtn = $('#btn-refresh-interfaces');
  if (refreshIfacesBtn) {
    refreshIfacesBtn.addEventListener('click', async () => {
      console.log('Refresh interfaces button clicked');
      await loadInterfaces();
    });
  }

  const btnShowNetplan = $('#btn-show-netplan');
  if (btnShowNetplan) {
    btnShowNetplan.addEventListener('click', async () => {
      console.log('Show netplan config button clicked');
      try {
        setStatus('Loading netplan configuration...');

        let config = '';
        let filename = '99-cockpit.yaml';

        try {
          config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
        } catch (e) {
          console.warn('99-cockpit.yaml not found, trying other netplan files');

          try {
            const allConfigs = await run('bash', ['-c', 'for f in /etc/netplan/*.yaml; do echo "=== $f ==="; cat "$f" 2>/dev/null; echo ""; done'], { superuser: 'try' });
            config = allConfigs;
            filename = 'All Netplan Files';
          } catch (e2) {
            config = 'No netplan configuration files found.\n\nNetplan files are typically located in /etc/netplan/ and end with .yaml';
            filename = 'No Configuration Found';
          }
        }

        const modal = document.createElement('dialog');
        modal.style.maxWidth = '80vw';
        modal.style.maxHeight = '80vh';
        modal.innerHTML = `
          <div class="modal-content">
            <h2><i class="fas fa-file-alt"></i> ${filename}</h2>
            <div style="margin: 1rem 0;">
              <label style="font-weight: 500; display: block; margin-bottom: 0.5rem;">
                <i class="fas fa-cog"></i> Configuration Content:
              </label>
              <textarea readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 0.875rem; padding: 1rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; resize: vertical;">${config}</textarea>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: space-between; margin-top: 1rem;">
              <button type="button" class="btn secondary" id="copy-config">
                <i class="fas fa-copy"></i> Copy to Clipboard
              </button>
              <button type="button" class="btn primary" id="close-config-modal">
                <i class="fas fa-times"></i> Close
              </button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);
        setupModal(modal);

        const closeBtn = modal.querySelector('#close-config-modal');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.close();
          });
        }

        const copyBtn = modal.querySelector('#copy-config');
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(config);
              copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
              copyBtn.className = 'btn success';
              setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy to Clipboard';
                copyBtn.className = 'btn secondary';
              }, 2000);
            } catch (err) {
              // Fallback for older browsers
              const textarea = modal.querySelector('textarea');
              textarea.select();
              document.execCommand('copy');
              copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
              copyBtn.className = 'btn success';
              setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy to Clipboard';
                copyBtn.className = 'btn secondary';
              }, 2000);
            }
          });
        }

        modal.showModal();

      } catch (error) {
        console.error('Show config failed:', error);
        alert(`Failed to show netplan configuration:\n${error.message || error}`);
      } finally {
        setStatus('Ready');
      }
    });
  }

  const btnBackupNetplan = $('#btn-backup-netplan');
  console.log('?? Backup button element found:', !!btnBackupNetplan);
  if (btnBackupNetplan) {
    console.log('? Adding event listener to backup button');
    btnBackupNetplan.addEventListener('click', async (event) => {
      console.log('?? Backup netplan button clicked - event fired!');
      event.preventDefault();
      event.stopPropagation();
      
      try {
        console.log('?? Starting backup process...');
        setStatus('Creating netplan backup...');

        // First, check if netplan directory exists
        console.log('?? Checking if /etc/netplan exists...');
        try {
          const netplanCheck = await run('ls', ['-la', '/etc/netplan'], { superuser: 'try' });
          console.log('? /etc/netplan directory exists:', netplanCheck);
        } catch (e) {
          console.error('? /etc/netplan directory not found:', e);
          alert('⚠️ Failed to create backup:\n/etc/netplan directory not found. This system may not use netplan for network configuration.');
          return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = `/tmp/netplan-backups`;  // Changed to /tmp for better compatibility
        const backupFile = `${backupDir}/netplan-backup-${timestamp}.tar.gz`;

        console.log('?? Creating backup directory:', backupDir);
        try {
          await run('mkdir', ['-p', backupDir], { superuser: 'try' });
          console.log('? Backup directory created/exists');
        } catch (e) {
          console.error('? Failed to create backup directory:', e);
          alert(`? Failed to create backup directory:\n${e}`);
          return;
        }

        // Check what's actually in the netplan directory
        console.log('?? Listing netplan directory contents...');
        try {
          const netplanContents = await run('find', ['/etc/netplan', '-type', 'f', '-name', '*.yaml'], { superuser: 'try' });
          console.log('?? Netplan files found:', netplanContents);
          
          if (!netplanContents.trim()) {
            console.log('?? No .yaml files found in /etc/netplan');
            // Create a simple backup anyway
            const emptyConfig = `# No netplan configuration files found
# Backup created on ${new Date().toISOString()}
# Location: /etc/netplan/
# This backup contains directory structure only
`;
            await run('bash', ['-c', `echo '${emptyConfig}' > ${backupDir}/netplan-empty-backup-${timestamp}.txt`], { superuser: 'try' });
            
            alert(`?? Backup created with warning!\n\nNo netplan .yaml files were found, but a backup record was created at:\n${backupDir}/netplan-empty-backup-${timestamp}.txt`);
            return;
          }
        } catch (e) {
          console.warn('?? Could not list netplan contents, proceeding with backup attempt:', e);
        }

        console.log('?? Creating tar archive:', backupFile);
        try {
          // More robust tar command with better error handling
          await run('tar', ['-czf', backupFile, '-C', '/etc', 'netplan'], { superuser: 'require' });
          console.log('? Tar archive created successfully');
        } catch (e) {
          console.error('? Tar command failed:', e);
          
          // Try alternative backup method
          console.log('?? Trying alternative backup method...');
          try {
            await run('bash', ['-c', `cp -r /etc/netplan ${backupDir}/netplan-${timestamp}`], { superuser: 'require' });
            const altBackupPath = `${backupDir}/netplan-${timestamp}`;
            
            alert(`? Backup created using alternative method!\n\n?? Backup Location:\n${altBackupPath}\n\n?? The netplan directory has been copied to the backup location.`);
            return;
          } catch (e2) {
            console.error('? Alternative backup method also failed:', e2);
            throw new Error(`Both tar and cp backup methods failed. Tar error: ${e}. Copy error: ${e2}`);
          }
        }

        console.log('?? Getting file info...');
        let backupInfo;
        try {
          backupInfo = await run('ls', ['-lh', backupFile], { superuser: 'try' });
        } catch (e) {
          backupInfo = 'File info unavailable';
          console.warn('Could not get backup file info:', e);
        }

        console.log('?? Getting backup list...');
        let backupList = '';
        try {
          backupList = await run('bash', ['-c', `ls -lht ${backupDir}/*.tar.gz 2>/dev/null | head -10 || echo "This is the first backup."`], { superuser: 'try' });
        } catch (e) {
          backupList = 'This is the first backup.';
        }

        console.log('?? Creating success modal dialog...');
        const modal = document.createElement('dialog');
        modal.style.maxWidth = '600px';
        modal.innerHTML = `
          <div class="modal-content">
            <h2>? Backup Created Successfully</h2>
            <div style="margin: 1rem 0;">
              <p><strong>?? Backup File:</strong><br><code>${backupFile}</code></p>
              <p><strong>?? File Details:</strong><br><code>${backupInfo}</code></p>
              <details>
                <summary><strong>?? Recent Backups</strong></summary>
                <pre style="background: #f8f9fa; padding: 1rem; border-radius: 4px; font-size: 0.875rem;">${backupList}</pre>
              </details>
              <p><strong>?? Tip:</strong> To restore from backup, extract the tar.gz file to /etc/</p>
              <p><strong>?? Access:</strong> You can access backup files at <code>${backupDir}</code></p>
            </div>
            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
              <button type="button" class="btn primary" id="close-backup-modal">? OK</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);
        setupModal(modal);

        const closeBtn = modal.querySelector('#close-backup-modal');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            modal.close();
          });
        }

        console.log('?? Showing backup success modal...');
        modal.showModal();

      } catch (error) {
        console.error('?? Backup failed with error:', error);
        
        // Provide detailed error information
        let errorMessage = '? Failed to create backup:\n\n';
        errorMessage += `Error: ${error.message || error}\n\n`;
        errorMessage += 'Possible causes:\n';
        errorMessage += '� Insufficient permissions (try running with sudo)\n';
        errorMessage += '� /etc/netplan directory does not exist\n';
        errorMessage += '� Disk space issues\n';
        errorMessage += '� tar command not available\n\n';
        errorMessage += 'Check the browser console for detailed logs.';
        
        alert(errorMessage);
      } finally {
        setStatus('Ready');
      }
    });
    console.log('? Backup button event listener attached successfully');
  } else {
    console.error('? Backup button not found! Checking DOM...');
    console.log('?? All buttons with backup in ID:', $$('[id*="backup"]'));
    console.log('?? All buttons in quick-actions:', $$('.quick-actions button'));
  }

  const btnApplyNetplan = $('#btn-apply-netplan');
  if (btnApplyNetplan) {
    btnApplyNetplan.addEventListener('click', async () => {
      if (!confirm('⚙️ Apply Netplan configuration?\n\nThis may temporarily disrupt network connectivity while the configuration is applied.')) return;

      try {
        setStatus('Applying Netplan configuration...');
        await run('netplan', ['apply'], { superuser: 'require' });
        alert('✅ Netplan configuration applied successfully!\n\nNetwork interfaces have been reconfigured.');
        await loadInterfaces();
      } catch (e) {
        alert(`❌ Failed to apply Netplan configuration:\n${e}`);
      } finally {
        setStatus('Ready');
      }
    });
  }

  const btnTestNetplan = $('#btn-test-netplan');
  if (btnTestNetplan) {
    btnTestNetplan.addEventListener('click', async () => {
      try {
        setStatus('Testing netplan write...');

        const testConfig = {
          name: 'eth0',
          static_ip: '192.168.1.100/24',
          gateway: '192.168.1.1',
          dns: '8.8.8.8,1.1.1.1'
        };

        console.log('Testing netplan action with config:', testConfig);
        const result = await netplanAction('set_ip', testConfig);

        console.log('Netplan test result:', result);

        if (result.error) {
          alert(`? Netplan test failed:\n${result.error}\n\nCheck console for details.`);
        } else {
          alert('? Netplan test successful!\n\nCheck /etc/netplan/99-cockpit.yaml for changes.');

          try {
            const netplanContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
            console.log('Current netplan content:', netplanContent);
          } catch (e) {
            console.warn('Could not read netplan file:', e);
          }
        }
      } catch (error) {
        console.error('Netplan test error:', error);
        alert(`? Netplan test failed: ${error}`);
      } finally {
        setStatus('Ready');
      }
    });
  }

  const btnCheckNetplan = $('#btn-check-netplan');
  if (btnCheckNetplan) {
    btnCheckNetplan.addEventListener('click', async () => {
      try {
        setStatus('Checking netplan file...');

        let fileExists = true;
        let fileContent = '';

        try {
          fileContent = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
        } catch (e) {
          fileExists = false;
          console.log('Netplan file does not exist:', e);
        }

        let message = '';
        if (fileExists) {
          message = `? Netplan file exists at /etc/netplan/99-cockpit.yaml\n\n?? Current contents:\n${fileContent}`;
        } else {
          message = 'ℹ️ Netplan file does not exist at /etc/netplan/99-cockpit.yaml\n\nThe file will be created when you first configure an IP address.';
        }

        alert(message);

        try {
          const dirInfo = await run('ls', ['-la', '/etc/netplan/'], { superuser: 'try' });
          console.log('Netplan directory contents:', dirInfo);
        } catch (e) {
          console.warn('Could not list netplan directory:', e);
        }

      } catch (error) {
        alert(`? Failed to check netplan file: ${error}`);
      } finally {
        setStatus('Ready');
      }
    });
  }

  // Add diagnostic event handlers
  const btnPing = $('#btn-ping');
  console.log('Ping button found:', !!btnPing);
  if (btnPing) {
    btnPing.addEventListener('click', async () => {
      console.log('Ping button clicked');
      const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
      const pingOut = $('#ping-out');
      console.log('Ping target:', host, 'Output element:', !!pingOut);
      
      if (pingOut) {
        pingOut.textContent = `🔄 Pinging ${host}...\n`;
        setStatus(`Pinging ${host}...`);
        
        try {
          const result = await run('ping', ['-c', '4', host]);
          pingOut.textContent = `📡 Ping Results for ${host}:\n\n${result}`;
          setStatus('Ping completed');
        } catch (e) {
          pingOut.textContent = `❌ Ping failed:\n${e}`;
          setStatus('Ping failed');
          console.error('Ping error:', e);
        }
      }
    });
  }

  const btnTraceroute = $('#btn-traceroute');
  console.log('Traceroute button found:', !!btnTraceroute);
  if (btnTraceroute) {
    btnTraceroute.addEventListener('click', async () => {
      console.log('Traceroute button clicked');
      const host = $('#diag-host')?.value?.trim() || '8.8.8.8';
      const pingOut = $('#ping-out');
      console.log('Traceroute target:', host, 'Output element:', !!pingOut);
      
      if (pingOut) {
        pingOut.textContent = `🔍 Tracing route to ${host}...\n`;
        setStatus(`Tracing route to ${host}...`);
        
        try {
          const result = await run('traceroute', [host]);
          pingOut.textContent = `🗺️ Traceroute to ${host}:\n\n${result}`;
          setStatus('Traceroute completed');
        } catch (e) {
          pingOut.textContent = `❌ Traceroute failed:\n${e}`;
          setStatus('Traceroute failed');
          console.error('Traceroute error:', e);
        }
      }
    });
  }

  const btnImportConfig = $('#btn-import-config');
  if (btnImportConfig) {
    btnImportConfig.addEventListener('click', async () => {
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

          try {
            if (file.name.endsWith('.json')) {
              config = JSON.parse(content);
              if (config.network) {
                config = content;
              } else {
                throw new Error('Invalid netplan JSON structure - missing "network" key');
              }
            } else {
              if (!content.includes('network:') && !content.includes('version:')) {
                const addHeader = confirm('⚙️ This file doesn\'t appear to be a standard netplan configuration.\n\nWould you like to add a basic netplan header?');
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

          const proceed = confirm(`📥 Import Network Configuration?\n\nFile: ${file.name}\nSize: ${file.size} bytes\n\n⚠️ This will replace the current netplan configuration.\n\nProceed with import?`);

          if (!proceed) {
            setStatus('Import cancelled');
            return;
          }

          if (typeof config === 'string') {
            await run('bash', ['-c', `echo '${config.replace(/'/g, "'\\''")}' > /etc/netplan/99-cockpit.yaml`], { superuser: 'require' });
          } else {
            alert('ℹ️ JSON import not fully implemented yet. Please use YAML format.');
            setStatus('Ready');
            return;
          }

          await run('netplan', ['apply'], { superuser: 'require' });

          alert('✅ Configuration imported and applied successfully!\n\nReloading interfaces...');
          await loadInterfaces();

        } catch (error) {
          console.error('Import failed:', error);
          alert(`❌ Failed to import configuration:\n${error.message || error}`);
        } finally {
          setStatus('Ready');
          document.body.removeChild(input);
        }
      });

      document.body.appendChild(input);
      input.click();
    });
  }

  const btnExportConfig = $('#btn-export-config');
  if (btnExportConfig) {
    btnExportConfig.addEventListener('click', async () => {
      try {
        setStatus('Exporting configuration...');

        const exportType = await new Promise((resolve) => {
          const modal = document.createElement('dialog');
          modal.innerHTML = `
            <div class="modal-content">
              <h2><i class="fas fa-download"></i> Export Network Configuration</h2>
              <p style="margin-bottom: 1.5rem; color: var(--muted-color);">Choose what to export:</p>
              <div class="export-options" style="margin: 1rem 0; display: flex; flex-direction: column; gap: 0.75rem;">
                <label class="export-option">
                  <input type="radio" name="export-type" value="cockpit" checked>
                  <i class="fas fa-cog"></i>
                  <div>
                    <strong>XOS Networking Config</strong>
                    <div style="font-size: 0.875rem; color: var(--muted-color); margin-top: 0.25rem;">
                      99-cockpit.yaml only
                    </div>
                  </div>
                </label>
                <label class="export-option">
                  <input type="radio" name="export-type" value="all">
                  <i class="fas fa-folder"></i>
                  <div>
                    <strong>All Netplan Files</strong>
                    <div style="font-size: 0.875rem; color: var(--muted-color); margin-top: 0.25rem;">
                      Entire /etc/netplan/ directory
                    </div>
                  </div>
                </label>
                <label class="export-option">
                  <input type="radio" name="export-type" value="current">
                  <i class="fas fa-network-wired"></i>
                  <div>
                    <strong>Current Network State</strong>
                    <div style="font-size: 0.875rem; color: var(--muted-color); margin-top: 0.25rem;">
                      Live interface configuration
                    </div>
                  </div>
                </label>
              </div>
              <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <button type="button" class="btn secondary" id="export-cancel">
                  <i class="fas fa-times"></i> Cancel
                </button>
                <button type="button" class="btn primary" id="export-confirm">
                  <i class="fas fa-download"></i> Export
                </button>
              </div>
            </div>
          `;

          document.body.appendChild(modal);
          setupModal(modal);

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
          try {
            config = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
            filename = '99-cockpit.yaml';
          } catch (e) {
            config = '# No XOS Networking configuration found\n# Generated by XOS Networking\nnetwork:\n  version: 2\n  renderer: networkd\n';
            filename = '99-cockpit-empty.yaml';
          }
        } else if (exportType === 'all') {
          try {
            const allConfigs = await run('bash', ['-c', 'for f in /etc/netplan/*.yaml; do echo "# --- $f ---"; cat "$f" 2>/dev/null; echo; done'], { superuser: 'try' });
            config = allConfigs;
            filename = 'netplan-all-configs.yaml';
          } catch (e) {
            config = '# No netplan configuration found\n';
            filename = 'netplan-all-empty.yaml';
          }
        } else if (exportType === 'current') {
          try {
            const interfaces = await run('ifconfig', ['-a'], { superuser: 'try' });
            const routes = await run('route', ['-n'], { superuser: 'try' }).catch(() => 
              run('netstat', ['-rn'], { superuser: 'try' }));
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

        if (exportType !== 'current') {
          const timestamp = new Date().toISOString();
          const header = `# Netplan Configuration Export
# Generated by XOS Networking on ${timestamp}
# Hostname: ${window.location.hostname}
# Export Type: ${exportType}

`;
          config = header + config;
        }

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

        alert(`✓ Configuration exported successfully!\n\nFile: ${filename}\nSize: ${config.length} bytes\nType: ${exportType}`);

      } catch (error) {
        console.error('Export failed:', error);
        alert(`✗ Failed to export configuration:\n${error.message || error}`);
      } finally {
        setStatus('Ready');
      }
    });
  }

  const btnResetForms = $('#btn-reset-forms');
  if (btnResetForms) {
    btnResetForms.addEventListener('click', () => {
      const forms = ['vlan', 'br', 'bond'];
      forms.forEach(prefix => {
        const inputs = $$(`[id^="${prefix}-"]`);
        inputs.forEach(input => {
          if (input.tagName === 'INPUT') {
            if (input.type === 'text' || input.type === 'number') {
              input.value = '';
            }
          } else if (input.tagName === 'SELECT') {
            input.selectedIndex = 0;
            if (input.multiple) {
              Array.from(input.options).forEach(opt => opt.selected = false);
            }
          }
        });

        const output = document.querySelector(`#${prefix}-out`);
        if (output) {
          output.textContent = '';
        }
      });

      alert('? All forms have been reset!');
    });
  }
}

// Main setup function to initialize all events
function setupEvents() {
  console.log('Setting up all event handlers...');
  
  // Set up event handlers
  setupEventHandlers();
  
  // Set up search and filters
  if (typeof setupSearchAndFilters === 'function') {
    setupSearchAndFilters();
  }
  
  // Set up networking forms
  if (typeof setupNetworkingForms === 'function') {
    setupNetworkingForms();
  }
  
  console.log('All event handlers setup complete');
}

// expose
window.loadConnections = loadConnections;
window.loadDiagnostics = loadDiagnostics;
window.setupTabs = setupTabs;
window.setupEventHandlers = setupEventHandlers;
window.setupEvents = setupEvents;
