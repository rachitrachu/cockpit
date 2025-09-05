'use strict';
/* global $, $$, run, setStatus, netplanAction, setupModal, createButton, loadInterfaces, runInterfaceCommand, getAlternativeInterfaceNames, createActionButton, clearPhysicalInterfacesCache */

// Use createActionButton from ui-utils.js

async function addAdvancedInterfaceActions(iface, actionsContainer) {
  // Check if this is a constructed interface (VLAN, bridge, bond)
  const isVlan = iface.dev.includes('.');
  const isBridge = iface.dev.startsWith('br');
  const isBond = iface.dev.startsWith('bond');
  const isConstructed = isVlan || isBridge || isBond;

  if (isConstructed) {
    const btnEdit = createActionButton('Edit', '<i class="fas fa-edit"></i>', async () => {
      await editConstructedInterface(iface);
    }, 'configure');

    const btnDelete = createActionButton('Delete', '<i class="fas fa-trash"></i>', async () => {
      await deleteConstructedInterface(iface);
    }, 'warning');

    actionsContainer.appendChild(btnEdit);
    actionsContainer.appendChild(btnDelete);
  }
}

async function editConstructedInterface(iface) {
  const modal = document.createElement('dialog');
  modal.className = 'edit-interface-modal';
  
  // Check if interface is critical
  const isCritical = checkIfInterfaceCritical(iface);
  
  let modalContent = '';
  
  // Add warning section for critical interfaces
  let warningSection = '';
  if (isCritical.critical) {
    const trimmedReasons = (isCritical.reasons || []).map(r => (r || '').trim()).filter(Boolean);
    const reasonsHtml = trimmedReasons.length > 1
      ? `<ul style="margin: 0.25rem 0; padding-left: 1.25rem;">${trimmedReasons.map(reason => `<li style="margin: 0.25rem 0;">${reason}</li>`).join('')}</ul>`
      : `<p style="margin: 0.25rem 0;"><code>${trimmedReasons[0] || ''}</code></p>`;

    warningSection = `
      <div style="margin: 0.75rem 0; padding: 0.75rem; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px;">
        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
          <span style="font-size:1.5rem;">⚠</span>
          <strong style="color:#856404;">WARNING: You are editing a critical network interface!</strong>
        </div>
        <div style="color:#856404; font-size:0.95rem;">
          <p style="margin:0 0 0.25rem;"><strong>Interface:</strong> <code>${iface.dev}</code></p>
          <p style="margin:0 0 0.25rem;"><strong>Current IP:</strong> <code>${iface.ipv4 || 'None'}</code></p>
          <p style="margin:0 0 0.5rem;"><strong>Status:</strong> <code>${iface.state}</code></p>
          <p style="margin:0 0 0.25rem;"><strong>Critical because it:</strong></p>
          ${reasonsHtml}
        </div>
      </div>

      <div style="margin: 0.5rem 0; padding: 0.75rem; background:#f8d7da; border:1px solid #f5c6cb; border-radius:4px;">
        <strong style="color:#721c24;">⚠ Changes to this interface may:</strong>
        <ul style="color:#721c24; margin:0.5rem 0 0 1rem; padding:0;">
          <li style="margin:0.25rem 0;">Cause immediate loss of network connectivity</li>
          <li style="margin:0.25rem 0;">Make the system unreachable via current configuration</li>
          <li style="margin:0.25rem 0;">Disrupt SSH sessions and remote management</li>
          <li style="margin:0.25rem 0;">Affect services depending on this interface</li>
          <li style="margin:0.25rem 0;">Require console/physical access to restore connectivity</li>
        </ul>
      </div>

      <div style="margin:0.5rem 0; padding:0.75rem; background:#d1ecf1; border:1px solid #bee5eb; border-radius:4px;">
        <strong style="color:#0c5460;">ℹ Safety Recommendations:</strong>
        <ul style="color:#0c5460; margin:0.5rem 0 0 1rem; padding:0;">
          <li style="margin:0.25rem 0;"><strong>Have console/KVM access</strong> available before proceeding</li>
          <li style="margin:0.25rem 0;"><strong>Verify the new configuration</strong> is correct and reachable</li>
          <li style="margin:0.25rem 0;"><strong>Check network dependencies</strong> and gateway settings</li>
          <li style="margin:0.25rem 0;"><strong>Consider testing changes first</strong> on a non-critical interface</li>
          <li style="margin:0.25rem 0;"><strong>Have a rollback plan</strong> ready</li>
        </ul>
      </div>
    `;
  }
  
  if (iface.dev.includes('.')) {
    // VLAN interface
    const parts = iface.dev.split('.');
    const parent = parts[0];
    const vlanId = parts[1];
    
    modalContent = `
      <div class="modal-content">
        <h2>⚡ Edit VLAN ${iface.dev}</h2>
        ${warningSection}
        <form id="edit-vlan-form">
          <label>⚬ Parent Interface
            <input type="text" id="edit-vlan-parent" value="${parent}" readonly class="readonly-input">
          </label>
          <label># VLAN ID
            <input type="number" id="edit-vlan-id" value="${vlanId}" readonly class="readonly-input">
          </label>
          <label>⚬ MTU
            <input type="number" id="edit-vlan-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>⚬ IPv4 Address
            <input type="text" id="edit-vlan-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          ${isCritical.critical ? `
          <div style="margin: 1.5rem 0; padding: 1rem; border: 2px dashed #dc3545; border-radius: 4px;">
            <label style="font-weight: 600; color: #dc3545; display: block; margin-bottom: 0.5rem;">
              ⚠ Type "EDIT CRITICAL" to confirm you understand the risks:
            </label>
            <input 
              type="text" 
              id="edit-confirmation-input" 
              placeholder="Enter: EDIT CRITICAL" 
              style="width: 100%; padding: 0.75rem; font-family: monospace; font-size: 1rem; border: 2px solid #dc3545; border-radius: 4px; text-transform: uppercase;"
              autocomplete="off"
              spellcheck="false"
            >
            <small style="color: #6c757d; display: block; margin-top: 0.25rem;">
              You must type exactly: <code>EDIT CRITICAL</code>
            </small>
          </div>
          ` : ''}
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-vlan">✗ Cancel</button>
            <button type="button" class="btn primary" id="save-edit-vlan"${isCritical.critical ? ' disabled' : ''}>💾 Save Changes</button>
          </div>
        </form>
      </div>
    `;
  } else if (iface.dev.startsWith('br')) {
    // Bridge interface
    modalContent = `
      <div class="modal-content">
        <h2>⧉ Edit Bridge ${iface.dev}</h2>
        ${warningSection}
        <form id="edit-bridge-form">
          <label>⚬ Bridge Name
            <input type="text" id="edit-bridge-name" value="${iface.dev}" readonly class="readonly-input">
          </label>
          <label>⚬ MTU
            <input type="number" id="edit-bridge-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>⚬ IPv4 Address
            <input type="text" id="edit-bridge-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 4px;">
            <strong>ⓘ Note:</strong> To modify bridge ports, delete and recreate the bridge.
          </div>
          ${isCritical.critical ? `
          <div style="margin: 1.5rem 0; padding: 1rem; border: 2px dashed #dc3545; border-radius: 4px;">
            <label style="font-weight: 600; color: #dc3545; display: block; margin-bottom: 0.5rem;">
              ⚠ Type "EDIT CRITICAL" to confirm you understand the risks:
            </label>
            <input 
              type="text" 
              id="edit-confirmation-input" 
              placeholder="Enter: EDIT CRITICAL" 
              style="width: 100%; padding: 0.75rem; font-family: monospace; font-size: 1rem; border: 2px solid #dc3545; border-radius: 4px; text-transform: uppercase;"
              autocomplete="off"
              spellcheck="false"
            >
            <small style="color: #6c757d; display: block; margin-top: 0.25rem;">
              You must type exactly: <code>EDIT CRITICAL</code>
            </small>
          </div>
          ` : ''}
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-bridge">✗ Cancel</button>
            <button type="button" class="btn primary" id="save-edit-bridge"${isCritical.critical ? ' disabled' : ''}>💾 Save Changes</button>
          </div>
        </form>
      </div>
    `;
  } else if (iface.dev.startsWith('bond')) {
    // Bond interface
    modalContent = `
      <div class="modal-content">
        <h2>⊞ Edit Bond ${iface.dev}</h2>
        ${warningSection}
        <form id="edit-bond-form">
          <label>⚬ Bond Name
            <input type="text" id="edit-bond-name" value="${iface.dev}" readonly class="readonly-input">
          </label>
          <label>⚬ MTU
            <input type="number" id="edit-bond-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>⚬ IPv4 Address
            <input type="text" id="edit-bond-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 4px;">
            <strong>ⓘ Note:</strong> To modify bond mode or slave interfaces, delete and recreate the bond.
          </div>
          ${isCritical.critical ? `
          <div style="margin: 1.5rem 0; padding: 1rem; border: 2px dashed #dc3545; border-radius: 4px;">
            <label style="font-weight: 600; color: #dc3545; display: block; margin-bottom: 0.5rem;">
              ⚠ Type "EDIT CRITICAL" to confirm you understand the risks:
            </label>
            <input 
              type="text" 
              id="edit-confirmation-input" 
              placeholder="Enter: EDIT CRITICAL" 
              style="width: 100%; padding: 0.75rem; font-family: monospace; font-size: 1rem; border: 2px solid #dc3545; border-radius: 4px; text-transform: uppercase;"
              autocomplete="off"
              spellcheck="false"
            >
            <small style="color: #6c757d; display: block; margin-top: 0.25rem;">
              You must type exactly: <code>EDIT CRITICAL</code>
            </small>
          </div>
          ` : ''}
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-bond">✗ Cancel</button>
            <button type="button" class="btn primary" id="save-edit-bond"${isCritical.critical ? ' disabled' : ''}>💾 Save Changes</button>
          </div>
        </form>
      </div>
    `;
  }

  modal.innerHTML = modalContent;
  document.body.appendChild(modal);
  setupModal(modal);

  // Add confirmation input validation for critical interfaces
  if (isCritical.critical) {
    const confirmInput = modal.querySelector('#edit-confirmation-input');
    const saveButtons = modal.querySelectorAll('[id^="save-edit-"]');
    
    if (confirmInput && saveButtons.length > 0) {
      confirmInput.addEventListener('input', () => {
        const inputValue = confirmInput.value.trim().toUpperCase();
        const isValid = inputValue === 'EDIT CRITICAL';
        
        saveButtons.forEach(button => {
          button.disabled = !isValid;
          if (isValid) {
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
          } else {
            button.style.opacity = '0.5';
            button.style.cursor = 'not-allowed';
          }
        });
      });
    }
  }

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

  // Check if interface is critical and validate confirmation
  const isCritical = checkIfInterfaceCritical(iface);
  if (isCritical.critical) {
    const confirmInput = modal.querySelector('#edit-confirmation-input');
    if (!confirmInput || confirmInput.value.trim().toUpperCase() !== 'EDIT CRITICAL') {
      alert('⚠ Please type "EDIT CRITICAL" in the confirmation field to proceed with changes to this critical interface.');
      return;
    }
  }

  try {
    setStatus('Saving VLAN changes...');

    // Update MTU if changed
    if (newMtu && newMtu !== iface.mtu) {
      const result = await netplanAction('set_mtu', { name: iface.dev, mtu: parseInt(newMtu) });
      if (result.error) {
        alert('Failed to persist MTU to netplan: ' + (result.error + (result.hint ? '\nHint: ' + result.hint : '')));
        return;
      } else if (result.message && result.message.includes('Note:')) {
        // Show the special message for VLAN MTU requirements
        console.log('MTU update info:', result.message);
      }
    }

    // Update IP if changed
    if (newIp !== iface.ipv4) {
      if (iface.ipv4) {
        try {
          await runInterfaceCommand('ip', ['addr', 'del', iface.ipv4, 'dev', iface.dev], { superuser: 'require' });
        } catch (e) {
          console.warn('Could not remove old IP:', e);
        }
      }

      if (newIp) {
        await runInterfaceCommand('ip', ['addr', 'add', newIp, 'dev', iface.dev], { superuser: 'require' });
        const result = await netplanAction('set_ip', { name: iface.dev, static_ip: newIp });
        if (result.error) {
          console.warn('Failed to persist IP to netplan:', result.error);
        }
      }
    }

    // Apply netplan changes safely
    try {
      await safeNetplanApply();
    } catch (e) {
      alert('⚠ Failed to apply netplan changes: ' + e.message);
    }

    // Post-apply validation for VLAN MTU changes
    let mtuWarning = '';
    if (newMtu && newMtu !== iface.mtu && iface.dev.includes('.')) {
      try {
        // Small delay to let the interface update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if the MTU actually took effect
        const actualMtuResult = await run('ip', ['link', 'show', iface.dev], { superuser: 'try' });
        if (actualMtuResult) {
          const mtuMatch = actualMtuResult.match(/mtu (\d+)/);
          if (mtuMatch) {
            const actualMtu = parseInt(mtuMatch[1]);
            console.log(`Post-apply MTU check: expected ${newMtu}, actual ${actualMtu}`);
            if (actualMtu !== parseInt(newMtu)) {
              const parentInterface = iface.dev.split('.')[0];
              mtuWarning = `\n\n⚠️ Warning: The interface MTU is still ${actualMtu} instead of ${newMtu}. The parent interface (${parentInterface}) likely has a lower MTU. Please set ${parentInterface} MTU to at least ${newMtu} first.`;
            }
          }
        }
      } catch (checkError) {
        console.warn('Could not verify actual MTU after apply:', checkError);
      }
    }

    modal.close();
    
    // Build success message
    let successMessage = '✓ VLAN configuration updated and applied!';
    
    // Add special note for VLAN MTU changes
    if (newMtu && newMtu !== iface.mtu && iface.dev.includes('.')) {
      const parentInterface = iface.dev.split('.')[0];
      successMessage += `\n\n⚠️ Note: If the MTU change doesn't take effect, please verify that the parent interface (${parentInterface}) has an MTU of at least ${newMtu}.`;
      successMessage += mtuWarning; // Add the actual verification result
    }
    
    alert(successMessage);
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save VLAN edits:', error);
    alert(`✗ Failed to save changes: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

async function saveBridgeEdits(modal, iface) {
  const newMtu = modal.querySelector('#edit-bridge-mtu').value.trim();
  const newIp = modal.querySelector('#edit-bridge-ip').value.trim();

  // Check if interface is critical and validate confirmation
  const isCritical = checkIfInterfaceCritical(iface);
  if (isCritical.critical) {
    const confirmInput = modal.querySelector('#edit-confirmation-input');
    if (!confirmInput || confirmInput.value.trim().toUpperCase() !== 'EDIT CRITICAL') {
      alert('⚠ Please type "EDIT CRITICAL" in the confirmation field to proceed with changes to this critical interface.');
      return;
    }
  }

  try {
    setStatus('Saving bridge changes...');


    // Update MTU if changed
    if (newMtu && newMtu !== iface.mtu) {
      const result = await netplanAction('set_mtu', { name: iface.dev, mtu: parseInt(newMtu) });
      if (result.error) {
        alert('Failed to persist MTU to netplan: ' + (result.error + (result.hint ? '\nHint: ' + result.hint : '')));
        return;
      }
    }

    // Update IP if changed
    if (newIp !== iface.ipv4) {
      const result = await netplanAction('set_ip', { name: iface.dev, static_ip: newIp });
      if (result.error) {
        alert('Failed to set IP address: ' + (result.error + (result.hint ? '\nHint: ' + result.hint : '')));
        return;
      }
    }

    // Apply netplan changes safely
    try {
      await safeNetplanApply();
    } catch (e) {
      alert('⚠ Failed to apply netplan changes: ' + e.message);
    }

    modal.close();
    alert('✓ Bridge configuration updated and applied!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save bridge edits:', error);
    alert(`✗ Failed to save changes: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

async function saveBondEdits(modal, iface) {
  const newMtu = modal.querySelector('#edit-bond-mtu').value.trim();
  const newIp = modal.querySelector('#edit-bond-ip').value.trim();

  // Check if interface is critical and validate confirmation
  const isCritical = checkIfInterfaceCritical(iface);
  if (isCritical.critical) {
    const confirmInput = modal.querySelector('#edit-confirmation-input');
    if (!confirmInput || confirmInput.value.trim().toUpperCase() !== 'EDIT CRITICAL') {
      alert('⚠ Please type "EDIT CRITICAL" in the confirmation field to proceed with changes to this critical interface.');
      return;
    }
  }

  try {
    setStatus('Saving bond changes...');


    // Update MTU if changed
    if (newMtu && newMtu !== iface.mtu) {
      const result = await netplanAction('set_mtu', { name: iface.dev, mtu: parseInt(newMtu) });
      if (result.error) {
        alert('Failed to persist MTU to netplan: ' + (result.error + (result.hint ? '\nHint: ' + result.hint : '')));
        return;
      }
    }

    // Update IP if changed
    if (newIp !== iface.ipv4) {
      const result = await netplanAction('set_ip', { name: iface.dev, static_ip: newIp });
      if (result.error) {
        alert('Failed to set IP address: ' + (result.error + (result.hint ? '\nHint: ' + result.hint : '')));
        return;
      }
    }

    // Apply netplan changes safely
    try {
      await safeNetplanApply();
    } catch (e) {
      alert('⚠ Failed to apply netplan changes: ' + e.message);
    }

    modal.close();
    alert('✓ Bond configuration updated and applied!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save bond edits:', error);
    alert(`✗ Failed to save changes: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

async function deleteConstructedInterface(iface) {
  const interfaceType = iface.dev.includes('.') ? 'VLAN' : iface.dev.startsWith('br') ? 'bridge' : 'bond';
  
  // Step 1: Check dependencies first
  console.log(`🔍 Checking dependencies for ${iface.dev} before deletion`);
  const dependencies = await checkInterfaceDependencies(iface.dev);
  
  if (dependencies.hasDependencies) {
    // Show dependency confirmation dialog
    const dependencyConfirmed = await showDependencyConfirmationDialog(iface.dev, dependencies);
    if (!dependencyConfirmed) {
      console.log('User cancelled deletion due to dependencies');
      return;
    }
    
    if (!dependencies.canDelete) {
      alert('⚠️ Cannot proceed with deletion due to critical dependencies. Please resolve dependencies first.');
      return;
    }
  }
  
  // Step 2: Check if interface is critical (has public IP, gateway, or is in use)
  const isCritical = checkIfInterfaceCritical(iface);
  
  if (isCritical.critical) {
    // Show enhanced confirmation dialog for critical interfaces
    const confirmationResult = await showCriticalInterfaceConfirmation(iface, interfaceType, isCritical);
    if (!confirmationResult) {
      return; // User cancelled or didn't type confirmation correctly
    }
  } else {
    // Standard confirmation for non-critical interfaces with no dependencies
    const confirmMessage = `🗑️ Delete ${iface.dev}?\n\nThis will permanently remove the ${interfaceType} interface and its configuration.\n\nThis action cannot be undone.`;
    if (!confirm(confirmMessage)) {
      return;
    }
  }

  let operationSuccess = false;
  let errorMessages = [];

  try {
    setStatus(`Deleting ${iface.dev}...`);

    // Step 1: Remove from netplan configuration (this is the only step we need)
    try {
      let deleteType;
      let normalizedName = iface.dev;
      
      if (iface.dev.includes('.')) {
        deleteType = 'vlans';
        // Enhanced VLAN name normalization
        // Handle cases like: eno4.1188@eno4@eno4 -> eno4.1188
        if (normalizedName.includes('@')) {
          // Split by @ and keep only the first part (interface.vlan)
          const parts = normalizedName.split('@');
          normalizedName = parts[0];
        }
      } else if (iface.dev.startsWith('br')) {
        deleteType = 'bridges';
      } else if (iface.dev.startsWith('bond')) {
        deleteType = 'bonds';
      }

      console.log(`🔧 Removing ${deleteType} interface ${iface.dev} from netplan`);
      console.log(`📝 Original interface name: ${iface.dev}`);
      console.log(`🏷️ Normalized name for netplan: ${normalizedName}`);
      console.log(`📤 Sending to netplan_manager: action='delete', config={type: '${deleteType}', name: '${normalizedName}'}`);
      
      const result = await netplanAction('delete', { 
        type: deleteType, 
        name: normalizedName  // Use properly normalized name
      });
      
      console.log(`📋 Netplan response:`, result);
      
      if (result.error) {
        console.error('❌ Failed to remove from netplan:', result.error);
        errorMessages.push(`Netplan removal failed: ${result.error}`);
        operationSuccess = false;
      } else {
        console.log('✅ Successfully removed from netplan configuration and applied changes');
        operationSuccess = true;
      }
    } catch (netplanError) {
      console.error('❌ Netplan deletion failed:', netplanError);
      errorMessages.push(`Netplan operation failed: ${netplanError}`);
      operationSuccess = false;
    }

    // Verify deletion by checking netplan configuration
    try {
      console.log(`🔍 Verifying deletion by checking netplan configuration`);
      const showConfigResult = await run('cat', ['/etc/netplan/99-cockpit.yaml'], { superuser: 'try' });
      console.log(`📄 Current netplan config after deletion:`);
      console.log(showConfigResult);
      
      // Enhanced normalization for checking (handle @parent suffixes)
      let checkName = iface.dev;
      if (checkName.includes('@')) {
        // Handle cases like eno4.1188@eno4@eno4 -> eno4.1188
        const parts = checkName.split('@');
        checkName = parts[0];
      }
      
      // Check if the normalized interface name still appears in the config
      if (showConfigResult && showConfigResult.includes(checkName + ':')) {
        console.warn(`⚠️ Interface ${checkName} still appears in netplan config after deletion`);
        errorMessages.push(`Interface still appears in netplan configuration`);
        operationSuccess = false;
      } else {
        console.log(`✅ Interface ${checkName} successfully removed from netplan config`);
        // The interface removal was successful if it's no longer in netplan
        operationSuccess = true;
      }
    } catch (configCheckError) {
      console.warn('Could not verify netplan config:', configCheckError);
    }

    // Show result to user
    if (operationSuccess) {
      alert(`? ${interfaceType} ${iface.dev} deleted successfully!`);
      setStatus(`${interfaceType} deleted successfully`);
    } else {
      const errorSummary = errorMessages.length > 0 ? `\n\nErrors encountered:\n${errorMessages.join('\n')}` : '';
      alert(`?? ${interfaceType} ${iface.dev} may not have been completely deleted.${errorSummary}\n\nCheck the console for detailed logs.`);
      setStatus('Delete operation completed with warnings');
    }
    
    // Always reload interfaces to reflect the actual current state
    console.log('Reloading interfaces to reflect current state');
    // Clear cache since interface was deleted
    if (typeof clearPhysicalInterfacesCache === 'function') {
      clearPhysicalInterfacesCache();
    }
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to delete interface:', error);
    const errorMsg = `? Failed to delete ${iface.dev}: ${error.message || error}`;
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

    // Prepare reasons HTML (inline single reason)
    const reasons = (criticalInfo.reasons || []).map(r => (r || '').trim()).filter(Boolean);
    const reasonsHtml = reasons.length > 1
      ? `<ul style="margin:0.25rem 0; padding-left:1.25rem;">${reasons.map(r => `<li style="margin:0.25rem 0;">${r}</li>`).join('')}</ul>`
      : `<p style="margin:0.25rem 0;"><code>${reasons[0] || ''}</code></p>`;

    modal.innerHTML = `
      <div class="modal-content">
        <h2>⚠ Delete Critical ${interfaceType} Interface</h2>

        <div style="margin:0.75rem 0; padding:0.75rem; background:#fff3cd; border:1px solid #ffc107; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
            <span style="font-size:1.5rem;">⚠</span>
            <strong style="color:#856404;">WARNING: This interface appears to be critical!</strong>
          </div>
          <div style="color:#856404; font-size:0.95rem;">
            <p style="margin:0 0 0.25rem;"><strong>Interface:</strong> <code>${iface.dev}</code></p>
            <p style="margin:0 0 0.25rem;"><strong>IP Address:</strong> <code>${iface.ipv4 || 'None'}</code></p>
            <p style="margin:0 0 0.5rem;"><strong>Status:</strong> <code>${iface.state}</code></p>
            <p style="margin:0 0 0.25rem;"><strong>Critical because it:</strong></p>
            ${reasonsHtml}
          </div>
        </div>

        <div style="margin:0.5rem 0; padding:0.75rem; background:#f8d7da; border:1px solid #f5c6cb; border-radius:4px;">
          <strong style="color:#721c24;">⚠ Deleting this interface may:</strong>
          <ul style="color:#721c24; margin:0.5rem 0 0 1rem; padding:0;">
            <li style="margin:0.25rem 0;">Cause loss of network connectivity</li>
            <li style="margin:0.25rem 0;">Make the system unreachable remotely</li>
            <li style="margin:0.25rem 0;">Disrupt running services and applications</li>
            <li style="margin:0.25rem 0;">Require physical access to restore connectivity</li>
          </ul>
        </div>

        <div style="margin:0.75rem 0; padding:0.75rem; border:2px dashed #dc3545; border-radius:4px;">
          <label style="font-weight:600; color:#dc3545; display:block; margin-bottom:0.5rem;">⚠ Type the interface name to confirm deletion:</label>
          <input type="text" id="delete-confirmation-input" placeholder="Enter: ${iface.dev}" style="width:100%; padding:0.5rem; font-family:monospace; font-size:0.95rem; border:2px solid #dc3545; border-radius:4px;" autocomplete="off" spellcheck="false">
          <small style="color:#6c757d; display:block; margin-top:0.25rem;">You must type the exact interface name: <code>${iface.dev}</code></small>
        </div>

        <div style="margin:0.5rem 0; padding:0.75rem; background:#d1ecf1; border:1px solid #bee5eb; border-radius:4px;">
          <strong style="color:#0c5460;">⚠ Alternative Options:</strong>
          <ul style="color:#0c5460; margin:0.5rem 0 0 1rem; padding:0;">
            <li style="margin:0.25rem 0;">Consider editing the interface instead of deleting it</li>
            <li style="margin:0.25rem 0;">Remove the IP address first, then delete if still needed</li>
            <li style="margin:0.25rem 0;">Create a backup of the current configuration</li>
            <li style="margin:0.25rem 0;">Ensure you have alternative network access before proceeding</li>
          </ul>
        </div>

        <div style="display:flex; gap:1rem; justify-content:flex-end; margin-top:1rem;">
          <button type="button" class="btn" id="cancel-critical-delete" style="min-width:120px; padding:0.65rem 1.15rem;">✗ Cancel</button>
          <button type="button" class="btn btn-danger" id="confirm-critical-delete" style="min-width:170px; padding:0.65rem 1.15rem;" disabled>⚠ Delete Interface</button>
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

// New function to check for interface dependencies
async function checkInterfaceDependencies(ifaceName) {
  // Initial dummy implementation - replace with real checks
  // For example, check if interface is used as a default route, has active connections, etc.
  const dependencies = {
    hasDependencies: false,
    canDelete: true,
    details: []
  };

  // Check if interface has any active connections
  const activeConnections = await run('ss', ['-In'], { superuser: 'try' });
  if (activeConnections && activeConnections.includes(`dev ${ifaceName}`)) {
    dependencies.hasDependencies = true;
    dependencies.canDelete = false;
    dependencies.details.push('Interface has active network connections');
  }

  // Check if interface is configured as a default route
  const routes = await run('route', ['-n'], { superuser: 'try' }).catch(() => 
    run('netstat', ['-rn'], { superuser: 'try' }));
  if (routes && routes.includes(ifaceName)) {
    dependencies.hasDependencies = true;
    dependencies.canDelete = false;
    dependencies.details.push('Interface is configured as the default route');
  }

  // Here you can add more checks as needed...

  return dependencies;
}

// Show a confirmation dialog if there are dependencies blocking the deletion
async function showDependencyConfirmationDialog(ifaceName, dependencies) {
  return new Promise((resolve) => {
    const modal = document.createElement('dialog');
    modal.style.maxWidth = '600px';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>?? Delete Interface Dependencies Detected</h2>
        <div style="margin: 1.5rem 0; padding: 1rem; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px;">
          <div style="display: flex; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 2rem; margin-right: 0.5rem;">??</span>
            <strong style="color: #856404;">WARNING: This interface has dependencies!</strong>
          </div>
          <div style="color: #856404;">
            <p><strong>Interface:</strong> <code>${ifaceName}</code></p>
            <p><strong>Dependencies:</strong></p>
            <ul style="margin: 0.5rem 0; padding-left: 2rem;">
              ${dependencies.details.map(detail => `<li>${detail}</li>`).join('')}
            </ul>
          </div>
        </div>

        <div style="margin: 1rem 0; padding: 1rem; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 4px;">
          <strong style="color: #0c5460;">?? Consider the following before proceeding:</strong>
          <ul style="color: #0c5460; margin: 0.5rem 0; padding-left: 2rem;">
            <li>Resolve any active connections using this interface</li>
            <li>Reconfigure or remove the default route if applicable</li>
            <li>Check for any running services that might be using this interface</li>
          </ul>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
          <button type="button" class="btn" id="cancel-dependency-delete" style="min-width: 120px; padding: 0.75rem 1.25rem;">
            ? Cancel
          </button>
          <button type="button" class="btn btn-danger" id="confirm-dependency-delete" style="min-width: 120px; padding: 0.75rem 1.25rem;">
            ??? Force Delete Interface
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModal(modal);

    const cancelButton = modal.querySelector('#cancel-dependency-delete');
    const confirmButton = modal.querySelector('#confirm-dependency-delete');

    cancelButton.addEventListener('click', () => {
      modal.close();
      resolve(false);
    });

    confirmButton.addEventListener('click', () => {
      modal.close();
      resolve(true);
    });

    modal.addEventListener('close', () => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    });

    modal.showModal();
  });
}
