'use strict';
/* global $, $$, run, setStatus, netplanAction, setupModal, createButton, loadInterfaces */

async function addAdvancedInterfaceActions(iface, actionsCell) {
  // Check if this is a constructed interface (VLAN, bridge, bond)
  const isVlan = iface.dev.includes('.');
  const isBridge = iface.dev.startsWith('br');
  const isBond = iface.dev.startsWith('bond');
  const isConstructed = isVlan || isBridge || isBond;

  if (isConstructed) {
    const btnEdit = createButton('Edit', async () => {
      await editConstructedInterface(iface);
    }, 'btn btn-sm');

    const btnDelete = createButton('Delete', async () => {
      await deleteConstructedInterface(iface);
    }, 'btn btn-sm btn-danger');

    actionsCell.appendChild(btnEdit);
    actionsCell.appendChild(btnDelete);
  }
}

async function editConstructedInterface(iface) {
  const modal = document.createElement('dialog');
  modal.style.maxWidth = '600px';
  
  let modalContent = '';
  
  if (iface.dev.includes('.')) {
    // VLAN interface
    const parts = iface.dev.split('.');
    const parent = parts[0];
    const vlanId = parts[1];
    
    modalContent = `
      <div class="modal-content">
        <h2>🏷️ Edit VLAN ${iface.dev}</h2>
        <form id="edit-vlan-form">
          <label>🔌 Parent Interface
            <input type="text" id="edit-vlan-parent" value="${parent}" readonly style="background: #f5f5f5;">
          </label>
          <label>🔢 VLAN ID
            <input type="number" id="edit-vlan-id" value="${vlanId}" readonly style="background: #f5f5f5;">
          </label>
          <label>📏 MTU
            <input type="number" id="edit-vlan-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>🌐 IPv4 Address
            <input type="text" id="edit-vlan-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-vlan">❌ Cancel</button>
            <button type="button" class="btn primary" id="save-edit-vlan">💾 Save Changes</button>
          </div>
        </form>
      </div>
    `;
  } else if (iface.dev.startsWith('br')) {
    // Bridge interface
    modalContent = `
      <div class="modal-content">
        <h2>🌉 Edit Bridge ${iface.dev}</h2>
        <form id="edit-bridge-form">
          <label>🏷️ Bridge Name
            <input type="text" id="edit-bridge-name" value="${iface.dev}" readonly style="background: #f5f5f5;">
          </label>
          <label>📏 MTU
            <input type="number" id="edit-bridge-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>🌐 IPv4 Address
            <input type="text" id="edit-bridge-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 4px;">
            <strong>ℹ️ Note:</strong> To modify bridge ports, delete and recreate the bridge.
          </div>
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-bridge">❌ Cancel</button>
            <button type="button" class="btn primary" id="save-edit-bridge">💾 Save Changes</button>
          </div>
        </form>
      </div>
    `;
  } else if (iface.dev.startsWith('bond')) {
    // Bond interface
    modalContent = `
      <div class="modal-content">
        <h2>🔗 Edit Bond ${iface.dev}</h2>
        <form id="edit-bond-form">
          <label>🏷️ Bond Name
            <input type="text" id="edit-bond-name" value="${iface.dev}" readonly style="background: #f5f5f5;">
          </label>
          <label>📏 MTU
            <input type="number" id="edit-bond-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>🌐 IPv4 Address
            <input type="text" id="edit-bond-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 4px;">
            <strong>ℹ️ Note:</strong> To modify bond mode or slave interfaces, delete and recreate the bond.
          </div>
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-bond">❌ Cancel</button>
            <button type="button" class="btn primary" id="save-edit-bond">💾 Save Changes</button>
          </div>
        </form>
      </div>
    `;
  }

  modal.innerHTML = modalContent;
  document.body.appendChild(modal);
  setupModal(modal);

  // Add event handlers based on interface type
  if (iface.dev.includes('.')) {
    modal.querySelector('#cancel-edit-vlan').addEventListener('click', () => modal.close());
    modal.querySelector('#save-edit-vlan').addEventListener('click', async () => {
      await saveVlanEdits(modal, iface);
    });
  } else if (iface.dev.startsWith('br')) {
    modal.querySelector('#cancel-edit-bridge').addEventListener('click', () => modal.close());
    modal.querySelector('#save-edit-bridge').addEventListener('click', async () => {
      await saveBridgeEdits(modal, iface);
    });
  } else if (iface.dev.startsWith('bond')) {
    modal.querySelector('#cancel-edit-bond').addEventListener('click', () => modal.close());
    modal.querySelector('#save-edit-bond').addEventListener('click', async () => {
      await saveBondEdits(modal, iface);
    });
  }

  modal.showModal();
}

async function saveVlanEdits(modal, iface) {
  const newMtu = modal.querySelector('#edit-vlan-mtu').value.trim();
  const newIp = modal.querySelector('#edit-vlan-ip').value.trim();

  try {
    setStatus('Saving VLAN changes...');

    // Update MTU if changed
    if (newMtu && newMtu !== iface.mtu) {
      await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu], { superuser: 'require' });
      
      const result = await netplanAction('set_mtu', { name: iface.dev, mtu: parseInt(newMtu) });
      if (result.error) {
        console.warn('Failed to persist MTU to netplan:', result.error);
      }
    }

    // Update IP if changed
    if (newIp !== iface.ipv4) {
      if (iface.ipv4) {
        try {
          await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
        } catch (e) {
          console.warn('Could not remove old IP:', e);
        }
      }

      if (newIp) {
        await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
        
        const result = await netplanAction('set_ip', { name: iface.dev, static_ip: newIp });
        if (result.error) {
          console.warn('Failed to persist IP to netplan:', result.error);
        }
      }
    }

    modal.close();
    alert('✅ VLAN configuration updated successfully!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save VLAN edits:', error);
    alert(`❌ Failed to save changes: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

async function saveBridgeEdits(modal, iface) {
  const newMtu = modal.querySelector('#edit-bridge-mtu').value.trim();
  const newIp = modal.querySelector('#edit-bridge-ip').value.trim();

  try {
    setStatus('Saving bridge changes...');

    // Update MTU if changed
    if (newMtu && newMtu !== iface.mtu) {
      await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu], { superuser: 'require' });
      
      const result = await netplanAction('set_mtu', { name: iface.dev, mtu: parseInt(newMtu) });
      if (result.error) {
        console.warn('Failed to persist MTU to netplan:', result.error);
      }
    }

    // Update IP if changed
    if (newIp !== iface.ipv4) {
      if (iface.ipv4) {
        try {
          await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
        } catch (e) {
          console.warn('Could not remove old IP:', e);
        }
      }

      if (newIp) {
        await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
        
        const result = await netplanAction('set_ip', { name: iface.dev, static_ip: newIp });
        if (result.error) {
          console.warn('Failed to persist IP to netplan:', result.error);
        }
      }
    }

    modal.close();
    alert('✅ Bridge configuration updated successfully!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save bridge edits:', error);
    alert(`❌ Failed to save changes: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

async function saveBondEdits(modal, iface) {
  const newMtu = modal.querySelector('#edit-bond-mtu').value.trim();
  const newIp = modal.querySelector('#edit-bond-ip').value.trim();

  try {
    setStatus('Saving bond changes...');

    // Update MTU if changed
    if (newMtu && newMtu !== iface.mtu) {
      await run('ip', ['link', 'set', 'dev', iface.dev, 'mtu', newMtu], { superuser: 'require' });
      
      const result = await netplanAction('set_mtu', { name: iface.dev, mtu: parseInt(newMtu) });
      if (result.error) {
        console.warn('Failed to persist MTU to netplan:', result.error);
      }
    }

    // Update IP if changed
    if (newIp !== iface.ipv4) {
      if (iface.ipv4) {
        try {
          await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
        } catch (e) {
          console.warn('Could not remove old IP:', e);
        }
      }

      if (newIp) {
        await run('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
        
        const result = await netplanAction('set_ip', { name: iface.dev, static_ip: newIp });
        if (result.error) {
          console.warn('Failed to persist IP to netplan:', result.error);
        }
      }
    }

    modal.close();
    alert('✅ Bond configuration updated successfully!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save bond edits:', error);
    alert(`❌ Failed to save changes: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

async function deleteConstructedInterface(iface) {
  const interfaceType = iface.dev.includes('.') ? 'VLAN' : iface.dev.startsWith('br') ? 'bridge' : 'bond';
  
  // Check if interface is critical (has public IP, gateway, or is in use)
  const isCritical = checkIfInterfaceCritical(iface);
  
  if (isCritical.critical) {
    // Show enhanced confirmation dialog for critical interfaces
    const confirmationResult = await showCriticalInterfaceConfirmation(iface, interfaceType, isCritical);
    if (!confirmationResult) {
      return; // User cancelled or didn't type confirmation correctly
    }
  } else {
    // Standard confirmation for non-critical interfaces
    const confirmMessage = `🗑️ Delete ${iface.dev}?\n\nThis will permanently remove the ${interfaceType} interface and its configuration.\n\nThis action cannot be undone.`;
    if (!confirm(confirmMessage)) {
      return;
    }
  }

  let operationSuccess = false;
  let errorMessages = [];

  try {
    setStatus(`Deleting ${iface.dev}...`);

    // Step 1: Remove any IP addresses first
    if (iface.ipv4) {
      try {
        console.log(`Removing IP address ${iface.ipv4} from ${iface.dev}`);
        await run('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
        console.log(`IP address removed successfully`);
      } catch (e) {
        console.warn('Could not remove IP address:', e);
        errorMessages.push(`Failed to remove IP address: ${e}`);
      }
    }

    // Step 2: Bring interface down
    try {
      console.log(`Bringing interface ${iface.dev} down`);
      await run('ip', ['link', 'set', iface.dev, 'down'], { superuser: 'require' });
      console.log(`Interface ${iface.dev} brought down successfully`);
    } catch (e) {
      console.warn('Could not bring interface down:', e);
      errorMessages.push(`Failed to bring interface down: ${e}`);
    }

    // Step 3: Delete the interface using the correct method
    try {
      if (iface.dev.includes('.')) {
        // For VLAN interfaces, use 'ip link delete' (this should work for VLANs)
        console.log(`Deleting VLAN interface ${iface.dev}`);
        await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
        console.log(`VLAN interface ${iface.dev} deleted successfully`);
      } else if (iface.dev.startsWith('br')) {
        // For bridge interfaces
        console.log(`Deleting bridge interface ${iface.dev}`);
        await run('ip', ['link', 'delete', iface.dev, 'type', 'bridge'], { superuser: 'require' });
        console.log(`Bridge interface ${iface.dev} deleted successfully`);
      } else if (iface.dev.startsWith('bond')) {
        // For bond interfaces
        console.log(`Deleting bond interface ${iface.dev}`);
        await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
        console.log(`Bond interface ${iface.dev} deleted successfully`);
      }
      
      operationSuccess = true;
      
    } catch (e) {
      console.error('Failed to delete interface via ip command:', e);
      errorMessages.push(`Failed to delete interface: ${e}`);
      
      // Try alternative method for VLAN deletion
      if (iface.dev.includes('.')) {
        try {
          console.log(`Trying alternative VLAN deletion method for ${iface.dev}`);
          const parts = iface.dev.split('.');
          const parent = parts[0];
          const vlanId = parts[1];
          
          // Try using vconfig if available (fallback method)
          await run('bash', ['-c', `if command -v vconfig >/dev/null 2>&1; then vconfig rem ${iface.dev}; else echo "vconfig not available"; fi`], { superuser: 'require' });
          console.log(`Alternative VLAN deletion attempted`);
          operationSuccess = true;
        } catch (altError) {
          console.error('Alternative VLAN deletion also failed:', altError);
          errorMessages.push(`Alternative deletion method failed: ${altError}`);
        }
      }
    }

    // Step 4: Remove from netplan configuration
    try {
      let deleteType;
      let normalizedName = iface.dev;
      
      if (iface.dev.includes('.')) {
        deleteType = 'vlans';
        // Enhanced VLAN name normalization
        // Handle cases like: eno4.1188@eno4@eno4 -> eno4.1188@eno4
        if (normalizedName.includes('@')) {
          // Split by @ and keep only the first two parts (interface.vlan@parent)
          const parts = normalizedName.split('@');
          if (parts.length > 2) {
            // If we have eno4.1188@eno4@eno4, normalize to eno4.1188@eno4
            normalizedName = `${parts[0]}@${parts[1]}`;
          }
          // If it's already eno4.1188@eno4, keep it as is
        }
      } else if (iface.dev.startsWith('br')) {
        deleteType = 'bridges';
      } else if (iface.dev.startsWith('bond')) {
        deleteType = 'bonds';
      }

      console.log(`🔧 Removing ${deleteType} interface ${iface.dev} from netplan`);
      console.log(`📝 Original interface name: ${iface.dev}`);
      console.log(`📝 Normalized name for netplan: ${normalizedName}`);
      console.log(`📤 Sending to netplan_manager: action='delete', config={type: '${deleteType}', name: '${normalizedName}'}`);
      
      const result = await netplanAction('delete', { 
        type: deleteType, 
        name: normalizedName  // Use properly normalized name
      });
      
      console.log(`📥 Netplan response:`, result);
      
      if (result.error) {
        console.warn('❌ Failed to remove from netplan:', result.error);
        errorMessages.push(`Netplan removal failed: ${result.error}`);
      } else {
        console.log('✅ Successfully removed from netplan configuration');
      }
    } catch (netplanError) {
      console.error('💥 Netplan deletion failed:', netplanError);
      errorMessages.push(`Netplan operation failed: ${netplanError}`);
    }

    // Step 5: Verify deletion by checking if interface still exists
    try {
      console.log(`Verifying deletion of ${iface.dev}`);
      const checkResult = await run('ip', ['link', 'show', iface.dev], { superuser: 'try' });
      if (checkResult && checkResult.trim()) {
        console.warn(`Interface ${iface.dev} still exists after deletion attempt`);
        operationSuccess = false;
        errorMessages.push(`Interface still exists after deletion`);
      } else {
        console.log(`Interface ${iface.dev} successfully deleted - no longer exists`);
        operationSuccess = true;
      }
    } catch (e) {
      // If 'ip link show' fails, it means the interface doesn't exist (good!)
      console.log(`Interface ${iface.dev} verified as deleted (ip link show failed as expected)`);
      operationSuccess = true;
    }

    // Step 6: Double-check netplan file was actually updated
    try {
      console.log(`🔍 Verifying netplan configuration was updated`);
      const showConfigResult = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
      console.log(`📋 Current netplan config after deletion:`);
      console.log(showConfigResult);
      
      // Enhanced normalization for checking (handle double @parent suffixes)
      let checkName = iface.dev;
      if (checkName.includes('@')) {
        // Handle cases like eno4.1188@eno4@eno4 -> eno4.1188@eno4
        const parts = checkName.split('@');
        if (parts.length > 2) {
          checkName = `${parts[0]}@${parts[1]}`;
        }
        // If it's already normalized (eno4.1188@eno4), keep it as is
      }
      
      // Check if the normalized interface name still appears in the config
      if (showConfigResult && showConfigResult.includes(checkName + ':')) {
        console.warn(`⚠️ Interface ${checkName} still appears in netplan config after deletion`);
        errorMessages.push(`Interface still appears in netplan configuration`);
      } else {
        console.log(`✅ Interface ${checkName} successfully removed from netplan config`);
      }
    } catch (configCheckError) {
      console.warn('Could not verify netplan config:', configCheckError);
    }

    // Show result to user
    if (operationSuccess) {
      alert(`✅ ${interfaceType} ${iface.dev} deleted successfully!`);
      setStatus(`${interfaceType} deleted successfully`);
    } else {
      const errorSummary = errorMessages.length > 0 ? `\n\nErrors encountered:\n${errorMessages.join('\n')}` : '';
      alert(`⚠️ ${interfaceType} ${iface.dev} may not have been completely deleted.${errorSummary}\n\nCheck the console for detailed logs.`);
      setStatus('Delete operation completed with warnings');
    }
    
    // Always reload interfaces to reflect the actual current state
    console.log('Reloading interfaces to reflect current state');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to delete interface:', error);
    const errorMsg = `❌ Failed to delete ${iface.dev}: ${error.message || error}`;
    alert(errorMsg);
    setStatus('Delete operation failed');
  } finally {
    // Always ensure we end with a clean state
    setTimeout(() => setStatus('Ready'), 3000);
  }
}

// Helper function to check if interface is critical
function checkIfInterfaceCritical(iface) {
  const reasons = [];
  let critical = false;

  // Check for public IP (not private ranges)
  if (iface.ipv4) {
    const ip = iface.ipv4.split('/')[0]; // Remove CIDR notation
    if (!isPrivateIP(ip)) {
      reasons.push(`has public IP address ${iface.ipv4}`);
      critical = true;
    }
  }

  // Check if it has a gateway configured (might be default route)
  if (iface.ipv4 && (iface.ipv4.includes('192.168.1.') || iface.ipv4.includes('10.0.0.') || iface.ipv4.includes('172.'))) {
    reasons.push('may be used for default gateway');
    critical = true;
  }

  // Check for specific critical interface names
  const criticalNames = ['br0', 'bond0', 'eth0', 'eno1', 'enp0s3'];
  if (criticalNames.some(name => iface.dev.toLowerCase().includes(name.toLowerCase()))) {
    reasons.push('is a primary network interface');
    critical = true;
  }

  // Check if interface is UP and has traffic (high usage interfaces)
  if (iface.state === 'UP' && iface.ipv4) {
    reasons.push('is currently active with IP configuration');
    critical = true;
  }

  return { critical, reasons };
}

// Helper function to check if IP is private
function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  
  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // 127.0.0.0/8 (loopback)
  if (parts[0] === 127) return true;
  
  // 169.254.0.0/16 (link-local)
  if (parts[0] === 169 && parts[1] === 254) return true;
  
  return false;
}

// Enhanced confirmation dialog for critical interfaces
async function showCriticalInterfaceConfirmation(iface, interfaceType, criticalInfo) {
  return new Promise((resolve) => {
    const modal = document.createElement('dialog');
    modal.style.maxWidth = '600px';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>⚠️ Delete Critical ${interfaceType} Interface</h2>
        <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px;">
          <div style="display: flex; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 2rem; margin-right: 0.5rem;">🚨</span>
            <strong style="color: #856404;">WARNING: This interface appears to be critical!</strong>
          </div>
          <div style="color: #856404;">
            <p><strong>Interface:</strong> <code>${iface.dev}</code></p>
            <p><strong>IP Address:</strong> <code>${iface.ipv4 || 'None'}</code></p>
            <p><strong>Status:</strong> <code>${iface.state}</code></p>
            <p><strong>Critical because it:</strong></p>
            <ul style="margin: 0.5rem 0; padding-left: 2rem;">
              ${criticalInfo.reasons.map(reason => `<li>${reason}</li>`).join('')}
            </ul>
          </div>
        </div>
        
        <div style="margin: 1rem 0; padding: 1rem; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
          <strong style="color: #721c24;">⚠️ Deleting this interface may:</strong>
          <ul style="color: #721c24; margin: 0.5rem 0; padding-left: 2rem;">
            <li>Cause loss of network connectivity</li>
            <li>Make the system unreachable remotely</li>
            <li>Disrupt running services and applications</li>
            <li>Require physical access to restore connectivity</li>
          </ul>
        </div>

        <div style="margin: 1.5rem 0; padding: 1rem; border: 2px dashed #dc3545; border-radius: 4px;">
          <label style="font-weight: 600; color: #dc3545; display: block; margin-bottom: 0.5rem;">
            🔒 Type the interface name to confirm deletion:
          </label>
          <input 
            type="text" 
            id="delete-confirmation-input" 
            placeholder="Enter: ${iface.dev}" 
            style="width: 100%; padding: 0.75rem; font-family: monospace; font-size: 1rem; border: 2px solid #dc3545; border-radius: 4px;"
            autocomplete="off"
            spellcheck="false"
          >
          <small style="color: #6c757d; display: block; margin-top: 0.25rem;">
            You must type the exact interface name: <code>${iface.dev}</code>
          </small>
        </div>

        <div style="margin: 1rem 0; padding: 1rem; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px;">
          <strong style="color: #0c5460;">💡 Alternative Options:</strong>
          <ul style="color: #0c5460; margin: 0.5rem 0; padding-left: 2rem;">
            <li>Consider editing the interface instead of deleting it</li>
            <li>Remove the IP address first, then delete if still needed</li>
            <li>Create a backup of the current configuration</li>
            <li>Ensure you have alternative network access before proceeding</li>
          </ul>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
          <button type="button" class="btn" id="cancel-critical-delete" style="min-width: 120px; padding: 0.75rem 1.25rem;">
            ❌ Cancel
          </button>
          <button type="button" class="btn btn-danger" id="confirm-critical-delete" style="min-width: 120px; padding: 0.75rem 1.25rem;" disabled>
            🗑️ Delete Interface
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModal(modal);

    const confirmInput = modal.querySelector('#delete-confirmation-input');
    const confirmButton = modal.querySelector('#confirm-critical-delete');
    const cancelButton = modal.querySelector('#cancel-critical-delete');

    // Enable/disable confirm button based on input
    confirmInput.addEventListener('input', () => {
      const inputValue = confirmInput.value.trim();
      const isValid = inputValue === iface.dev;
      confirmButton.disabled = !isValid;
      
      if (isValid) {
        confirmButton.style.backgroundColor = '#dc3545';
        confirmButton.style.borderColor = '#dc3545';
      } else {
        confirmButton.style.backgroundColor = '#6c757d';
        confirmButton.style.borderColor = '#6c757d';
      }
    });

    // Handle Enter key in input
    confirmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmButton.disabled) {
        confirmButton.click();
      }
    });

    cancelButton.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    confirmButton.addEventListener('click', () => {
      if (confirmInput.value.trim() === iface.dev) {
        modal.close();
        resolve(true);
      }
    });

    modal.addEventListener('close', () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    });

    modal.showModal();
    confirmInput.focus();
  });
}