/* XOS Networking - Modal Management */
/* global XOSNetworking */

(() => {
  'use strict';

  const { $, setStatus, run } = XOSNetworking.core;

  // Modal helper function with cleanup
  function setupModal(modal) {
    if (!modal) {
      console.warn('setupModal called with null/undefined modal');
      return null;
    }
    
    // Handle ESC key
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        modal.close();
      }
    };
    
    // Handle backdrop clicks (click outside modal content)
    const handleBackdropClick = (e) => {
      if (e.target === modal) {
        modal.close();
      }
    };
    
    modal.addEventListener('keydown', handleEscKey);
    modal.addEventListener('click', handleBackdropClick);
    
    // Cleanup when modal closes
    modal.addEventListener('close', () => {
      // Remove event listeners to prevent memory leaks
      modal.removeEventListener('keydown', handleEscKey);
      modal.removeEventListener('click', handleBackdropClick);
      
      // Remove from DOM
      if (modal.parentNode) {
        try {
          document.body.removeChild(modal);
          console.log('Modal cleaned up successfully');
        } catch (e) {
          console.warn('Failed to remove modal from DOM:', e);
        }
      }
    });
    
    // Also handle browser's built-in cancel event (ESC key or close button)
    modal.addEventListener('cancel', (e) => {
      // Allow the default behavior (closing the modal)
      console.log('Modal cancelled via ESC key or browser close button');
    });
    
    return modal;
  }

  // Create IP configuration modal
  function createIPConfigModal(iface, netplanAction) {
    const modal = document.createElement('dialog');
    modal.innerHTML = `
      <div class="modal-content">
        <h2>?? Set IP Address for ${iface.dev}</h2>
        <form id="set-ip-form">
          <label>
            <span>?? Current IPv4 Address</span>
            <input type="text" value="${iface.ipv4 || 'None assigned'}" readonly style="background: #f5f5f5; color: #666;">
          </label>
          
          <label>
            <span>?? New IPv4 Address/CIDR</span>
            <input type="text" id="new-ip-addr" placeholder="192.168.1.100/24" required 
                   pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$"
                   value="${iface.ipv4 || ''}">
            <small>Use CIDR notation (e.g., 192.168.1.100/24)</small>
          </label>
          
          <label>
            <span>?? Gateway (optional)</span>
            <input type="text" id="new-gateway" placeholder="192.168.1.1"
                   pattern="^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$">
            <small>Default gateway for this interface</small>
          </label>
          
          <label>
            <span>?? DNS Servers (optional, comma separated)</span>
            <input type="text" id="new-dns" placeholder="8.8.8.8,1.1.1.1">
            <small>Comma separated list of DNS servers</small>
          </label>
          
          <div class="modal-section info">
            <label style="flex-direction: row; align-items: flex-start; gap: 0.5rem;">
              <input type="checkbox" id="persist-ip-config" checked style="margin-top: 0.25rem; width: auto;">
              <div>
                <strong>?? Persist configuration to netplan (recommended)</strong>
                <small style="display: block; margin-top: 0.25rem;">
                  When enabled, configuration survives reboots. When disabled, changes are temporary.
                </small>
              </div>
            </label>
          </div>
          
          <div class="modal-section warning">
            <strong>?? Note:</strong> This will replace any existing IP configuration for this interface.
          </div>
          
          <div class="modal-buttons">
            <button type="button" class="btn" id="cancel-ip-config">? Cancel</button>
            <button type="button" class="btn primary" id="apply-ip-config">?? Apply Configuration</button>
          </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);
    setupModal(modal);
    
    // Handle cancel button
    modal.querySelector('#cancel-ip-config').addEventListener('click', () => {
      modal.close();
    });
    
    // Handle form submission
    modal.querySelector('#apply-ip-config').addEventListener('click', async () => {
      const newIp = modal.querySelector('#new-ip-addr').value.trim();
      const gateway = modal.querySelector('#new-gateway').value.trim();
      const dns = modal.querySelector('#new-dns').value.trim();
      const persist = modal.querySelector('#persist-ip-config').checked;
      
      // Validation
      if (!newIp) {
        alert('? IP address is required!');
        modal.querySelector('#new-ip-addr').focus();
        return;
      }
      
      const ipRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[1-2][0-9]|3[0-2])$/;
      if (!ipRegex.test(newIp)) {
        alert('? Invalid IP address format! Use CIDR notation (e.g., 192.168.1.100/24)');
        modal.querySelector('#new-ip-addr').focus();
        return;
      }
      
      if (gateway && !/^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(gateway)) {
        alert('? Invalid gateway address format!');
        modal.querySelector('#new-gateway').focus();
        return;
      }
      
      try {
        setStatus('Configuring IP address...');
        
        // Step 1: Apply immediate IP configuration
        try {
          // Remove existing IP addresses first
          if (iface.ipv4) {
            try {
              await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
              console.log(`Removed old IP ${iface.ipv4} from ${iface.dev}`);
            } catch (e) {
              console.warn('Could not remove old IP (may not exist):', e);
            }
          }
          
          // Add new IP address immediately
          await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
          console.log(`Added new IP ${newIp} to ${iface.dev}`);
          
          // Add gateway if specified
          if (gateway) {
            try {
              // Remove existing default route for this interface (best effort)
              await run('ip', ['route', 'del', 'default', 'dev', iface.dev], { superuser: 'require' });
            } catch (e) {
              // Ignore if no existing route
            }
            await run('ip', ['route', 'add', 'default', 'via', gateway, 'dev', iface.dev], { superuser: 'require' });
            console.log(`Added gateway ${gateway} for ${iface.dev}`);
          }
          
        } catch (error) {
          throw new Error(`Failed to apply IP configuration: ${error}`);
        }
        
        // Step 2: Persist to netplan if requested
        if (persist) {
          console.log('Persisting IP configuration to netplan...');
          try {
            const netplanConfig = {
              name: iface.dev,
              static_ip: newIp
            };
            
            if (gateway) {
              netplanConfig.gateway = gateway;
            }
            
            if (dns) {
              netplanConfig.dns = dns;
            }
            
            const result = await netplanAction('set_ip', netplanConfig);
            
            if (result.error) {
              console.warn('Netplan persistence failed:', result.error);
              alert(`?? IP configured successfully, but netplan persistence failed:\n${result.error}\n\nThe IP is set but may not survive a reboot.`);
            } else {
              console.log('Successfully persisted to netplan');
              alert(`? IP address configured and persisted successfully!\n\n?? Address: ${newIp}\n${gateway ? `?? Gateway: ${gateway}\n` : ''}${dns ? `?? DNS: ${dns}\n` : ''}?? Configuration saved to netplan`);
            }
          } catch (error) {
            console.error('Netplan persistence error:', error);
            alert(`?? IP configured successfully, but netplan persistence failed:\n${error}\n\nThe IP is set but may not survive a reboot.`);
          }
        } else {
          alert(`? IP address configured successfully!\n\n?? Address: ${newIp}\n${gateway ? `?? Gateway: ${gateway}\n` : ''}?? Note: Configuration is temporary and will be lost after reboot.`);
        }
        
        modal.close();
        setStatus('? IP configuration applied');
        setTimeout(() => setStatus('Ready'), 3000);
        
        // Trigger interface reload
        if (window.XOSNetworking.networkInterface?.loadInterfaces) {
          await window.XOSNetworking.networkInterface.loadInterfaces();
        }
        
      } catch (error) {
        console.error('IP configuration error:', error);
        alert(`? Failed to set IP address: ${error.message || error}`);
        setStatus('? IP configuration failed');
        setTimeout(() => setStatus('Ready'), 3000);
      }
    });
    
    return modal;
  }

  // Create MTU configuration modal
  function createMTUConfigModal(iface, netplanAction) {
    const modal = document.createElement('dialog');
    modal.innerHTML = `
      <div class="modal-content">
        <h2>?? Set MTU for ${iface.dev}</h2>
        <form id="set-mtu-form">
          <label>
            <span>?? Current MTU</span>
            <input type="text" value="${iface.mtu || 'Unknown'}" readonly style="background: #f5f5f5; color: #666;">
          </label>
          
          <label>
            <span>?? New MTU Value</span>
            <input type="number" id="new-mtu-value" min="68" max="9000" value="${iface.mtu || '1500'}" required>
            <small>Valid range: 68 - 9000 bytes</small>
          </label>
          
          <div style="margin: 1rem 0;">
            <h4 style="margin: 0.5rem 0; color: var(--primary-color);">?? Common MTU Values:</h4>
            <ul style="margin: 0; padding-left: 1.5rem; font-size: 0.875rem;">
              <li><strong>1500:</strong> Standard Ethernet</li>
              <li><strong>9000:</strong> Jumbo frames (high-speed LAN)</li>
              <li><strong>1492:</strong> PPPoE connections</li>
              <li><strong>1280:</strong> IPv6 minimum requirement</li>
            </ul>
          </div>
          
          ${iface.dev.includes('.') ? `
          <div class="modal-section warning">
            <strong>??? VLAN Interface Notice:</strong> For VLAN interfaces, MTU changes may require the parent interface to support the same or larger MTU.
          </div>
          ` : ''}
          
          <div class="modal-section info">
            <label style="flex-direction: row; align-items: flex-start; gap: 0.5rem;">
              <input type="checkbox" id="persist-mtu-config" checked style="width: auto;">
              <div>
                <strong>?? Persist configuration to netplan (recommended)</strong>
                <small style="display: block; margin-top: 0.25rem;">
                  When enabled, configuration survives reboots. When disabled, changes are temporary.
                </small>
              </div>
            </label>
          </div>
          
          <div class="modal-section warning">
            <strong>?? Note:</strong> Changing MTU may temporarily disrupt network connectivity on this interface.
          </div>
          
          <div class="modal-buttons">
            <button type="button" class="btn" id="cancel-mtu-config">? Cancel</button>
            <button type="button" class="btn primary" id="apply-mtu-config">?? Apply MTU</button>
          </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);
    setupModal(modal);
    
    // Handle cancel button
    modal.querySelector('#cancel-mtu-config').addEventListener('click', () => {
      modal.close();
    });
    
    // Handle form submission
    modal.querySelector('#apply-mtu-config').addEventListener('click', async () => {
      const newMtu = parseInt(modal.querySelector('#new-mtu-value').value);
      const persist = modal.querySelector('#persist-mtu-config').checked;
      
      // Validation
      if (isNaN(newMtu) || newMtu < 68 || newMtu > 9000) {
        alert('? MTU must be between 68 and 9000!');
        modal.querySelector('#new-mtu-value').focus();
        return;
      }
      
      if (iface.mtu && parseInt(iface.mtu) === newMtu) {
        alert(`?? MTU is already set to ${newMtu}`);
        modal.close();
        return;
      }
      
      // Special validation for VLAN interfaces
      if (iface.dev.includes('.') && !iface.dev.startsWith('br')) {
        console.log(`Setting MTU for VLAN interface: ${iface.dev}`);
        // Check if parent interface MTU is adequate
        const vlanParts = iface.dev.split('.');
        const parentInterface = vlanParts[0];
        
        // Find parent interface in the current interface list to check its MTU
        const tableRows = document.querySelectorAll('#table-interfaces tbody tr');
        let parentMtu = null;
        
        tableRows.forEach(row => {
          const cells = row.cells;
          if (cells && cells[0] && cells[0].textContent === parentInterface) {
            parentMtu = parseInt(cells[6]?.textContent || '1500');
          }
        });
        
        if (parentMtu && newMtu > parentMtu) {
          const proceedWithHigherMtu = confirm(
            `?? VLAN MTU Warning\n\n` +
            `You're setting VLAN ${iface.dev} MTU to ${newMtu}, but parent interface ${parentInterface} has MTU ${parentMtu}.\n\n` +
            `This may cause packet drops. Consider setting parent interface MTU to ${newMtu} or higher first.\n\n` +
            `Do you want to proceed anyway?`
          );
          if (!proceedWithHigherMtu) return;
        }
      }
      
      try {
        setStatus('Setting MTU...');
        console.log(`Setting MTU ${newMtu} on ${iface.dev} (persist: ${persist})`);
        
        // Step 1: Apply MTU immediately if not persisting (for immediate feedback)
        if (!persist) {
          try {
            await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu.toString()], { superuser: 'require' });
            console.log(`Applied MTU ${newMtu} immediately to ${iface.dev}`);
          } catch (immediateError) {
            console.warn('Failed to apply MTU immediately:', immediateError);
          }
        }
        
        // Step 2: Apply via netplan if persisting (recommended path)
        if (persist) {
          console.log('Applying MTU via netplan for persistence...');
          const result = await netplanAction('set_mtu', { name: iface.dev, mtu: newMtu });
          
          if (result.error) {
            throw new Error('Netplan MTU configuration failed: ' + result.error);
          } else {
            console.log('Successfully applied MTU via netplan');
            alert(`? MTU configured and persisted successfully!\n\n?? MTU: ${newMtu} bytes\n?? Configuration saved to netplan`);
          }
        } else {
          alert(`? MTU configured successfully!\n\n?? MTU: ${newMtu} bytes\n?? Note: Configuration is temporary and will be lost after reboot.`);
        }
        
        modal.close();
        setStatus('? MTU configuration applied');
        setTimeout(() => setStatus('Ready'), 3000);
        
        // Trigger interface reload
        if (window.XOSNetworking.networkInterface?.loadInterfaces) {
          await window.XOSNetworking.networkInterface.loadInterfaces();
        }
        
      } catch (error) {
        console.error('MTU configuration error:', error);
        let errorMsg = error.message || error;
        
        // Provide specific error messages for common VLAN MTU issues
        if (iface.dev.includes('.') && errorMsg.includes('RTNETLINK')) {
          errorMsg += '\n\nFor VLAN interfaces, ensure:\n• Parent interface exists and is up\n• Parent interface MTU >= VLAN MTU\n• VLAN interface is properly configured';
        }
        
        alert(`? Failed to set MTU: ${errorMsg}`);
        setStatus('? MTU configuration failed');
        setTimeout(() => setStatus('Ready'), 3000);
      }
    });
    
    return modal;
  }

  // Export modal functions
  window.XOSNetworking.modals = {
    setupModal,
    createIPConfigModal,
    createMTUConfigModal
  };

})();