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
        <h2>??? Edit VLAN ${iface.dev}</h2>
        <form id="edit-vlan-form">
          <label>?? Parent Interface
            <input type="text" id="edit-vlan-parent" value="${parent}" readonly style="background: #f5f5f5;">
          </label>
          <label>?? VLAN ID
            <input type="number" id="edit-vlan-id" value="${vlanId}" readonly style="background: #f5f5f5;">
          </label>
          <label>?? MTU
            <input type="number" id="edit-vlan-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>?? IPv4 Address
            <input type="text" id="edit-vlan-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-vlan">? Cancel</button>
            <button type="button" class="btn primary" id="save-edit-vlan">?? Save Changes</button>
          </div>
        </form>
      </div>
    `;
  } else if (iface.dev.startsWith('br')) {
    // Bridge interface
    modalContent = `
      <div class="modal-content">
        <h2>?? Edit Bridge ${iface.dev}</h2>
        <form id="edit-bridge-form">
          <label>?? Bridge Name
            <input type="text" id="edit-bridge-name" value="${iface.dev}" readonly style="background: #f5f5f5;">
          </label>
          <label>?? MTU
            <input type="number" id="edit-bridge-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>?? IPv4 Address
            <input type="text" id="edit-bridge-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 4px;">
            <strong>?? Note:</strong> To modify bridge ports, delete and recreate the bridge.
          </div>
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-bridge">? Cancel</button>
            <button type="button" class="btn primary" id="save-edit-bridge">?? Save Changes</button>
          </div>
        </form>
      </div>
    `;
  } else if (iface.dev.startsWith('bond')) {
    // Bond interface
    modalContent = `
      <div class="modal-content">
        <h2>?? Edit Bond ${iface.dev}</h2>
        <form id="edit-bond-form">
          <label>?? Bond Name
            <input type="text" id="edit-bond-name" value="${iface.dev}" readonly style="background: #f5f5f5;">
          </label>
          <label>?? MTU
            <input type="number" id="edit-bond-mtu" value="${iface.mtu}" min="68" max="9000">
          </label>
          <label>?? IPv4 Address
            <input type="text" id="edit-bond-ip" value="${iface.ipv4 || ''}" placeholder="192.168.1.100/24">
          </label>
          <div style="margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 4px;">
            <strong>?? Note:</strong> To modify bond mode or slave interfaces, delete and recreate the bond.
          </div>
          <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
            <button type="button" class="btn" id="cancel-edit-bond">? Cancel</button>
            <button type="button" class="btn primary" id="save-edit-bond">?? Save Changes</button>
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
    alert('? VLAN configuration updated successfully!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save VLAN edits:', error);
    alert(`? Failed to save changes: ${error}`);
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
    alert('? Bridge configuration updated successfully!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save bridge edits:', error);
    alert(`? Failed to save changes: ${error}`);
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
    alert('? Bond configuration updated successfully!');
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to save bond edits:', error);
    alert(`? Failed to save changes: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

async function deleteConstructedInterface(iface) {
  const confirmMessage = `??? Delete ${iface.dev}?\n\nThis will permanently remove the ${iface.dev.includes('.') ? 'VLAN' : iface.dev.startsWith('br') ? 'bridge' : 'bond'} interface and its configuration.\n\nThis action cannot be undone.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    setStatus(`Deleting ${iface.dev}...`);

    // Remove from netplan first
    const result = await netplanAction('remove_interface', { name: iface.dev });
    if (result.error) {
      console.warn('Failed to remove from netplan:', result.error);
    }

    // Bring interface down
    try {
      await run('ip', ['link', 'set', iface.dev, 'down'], { superuser: 'require' });
    } catch (e) {
      console.warn('Could not bring interface down:', e);
    }

    // Delete interface
    try {
      await run('ip', ['link', 'delete', iface.dev], { superuser: 'require' });
    } catch (e) {
      console.warn('Could not delete interface via ip command:', e);
    }

    alert(`? ${iface.dev} deleted successfully!`);
    await loadInterfaces();

  } catch (error) {
    console.error('Failed to delete interface:', error);
    alert(`? Failed to delete ${iface.dev}: ${error}`);
  } finally {
    setStatus('Ready');
  }
}

// Expose globally
window.addAdvancedInterfaceActions = addAdvancedInterfaceActions;