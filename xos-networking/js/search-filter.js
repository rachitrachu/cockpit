'use strict';
/* global $, $$ */

function setupSearchAndFilters() {
  console.log('Setting up search and filter functionality...');

  // Interface search functionality
  const searchIface = $('#search-iface');
  const sortIface = $('#iface-sort');

  if (searchIface) {
    searchIface.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = $$('#table-interfaces tbody tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          const text = Array.from(cells).map(cell => cell.textContent.toLowerCase()).join(' ');
          const matches = !query || text.includes(query);
          row.style.display = matches ? '' : 'none';
        }
      });
    });
  }

  if (sortIface) {
    sortIface.addEventListener('change', (e) => {
      const sortBy = e.target.value;
      const tbody = $('#table-interfaces tbody');
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll('tr'));
      if (rows.length === 0) return;

      rows.sort((a, b) => {
        let aValue = '', bValue = '';
        
        switch (sortBy) {
          case 'name':
            aValue = a.cells[0]?.textContent || '';
            bValue = b.cells[0]?.textContent || '';
            break;
          case 'type':
            aValue = a.cells[1]?.textContent || '';
            bValue = b.cells[1]?.textContent || '';
            break;
          case 'state':
            aValue = a.cells[2]?.textContent || '';
            bValue = b.cells[2]?.textContent || '';
            break;
          default:
            return 0;
        }
        
        return aValue.localeCompare(bValue);
      });

      // Clear tbody and re-add sorted rows
      tbody.innerHTML = '';
      rows.forEach(row => tbody.appendChild(row));
    });
  }

  // Connection search functionality
  const searchConn = $('#search-conn');
  if (searchConn) {
    searchConn.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = $$('#table-connections tbody tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          const text = Array.from(cells).map(cell => cell.textContent.toLowerCase()).join(' ');
          const matches = !query || text.includes(query);
          row.style.display = matches ? '' : 'none';
        }
      });
    });
  }

  // Bridge and Bond port filtering
  const brPortsFilter = $('#br-ports-filter');
  const brPorts = $('#br-ports');
  
  if (brPortsFilter && brPorts) {
    brPortsFilter.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const options = brPorts.querySelectorAll('option');
      
      options.forEach(option => {
        const matches = !query || option.textContent.toLowerCase().includes(query);
        option.style.display = matches ? '' : 'none';
      });
    });
  }

  const bondSlavesFilter = $('#bond-slaves-filter');
  const bondSlaves = $('#bond-slaves');
  
  if (bondSlavesFilter && bondSlaves) {
    bondSlavesFilter.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const options = bondSlaves.querySelectorAll('option');
      
      options.forEach(option => {
        const matches = !query || option.textContent.toLowerCase().includes(query);
        option.style.display = matches ? '' : 'none';
      });
    });
  }

  // Bond mode change handler for primary interface
  const bondMode = $('#bond-mode');
  const bondPrimary = $('#bond-primary');
  
  if (bondMode && bondPrimary) {
    bondMode.addEventListener('change', (e) => {
      const mode = e.target.value;
      const showPrimary = mode === 'active-backup';
      
      const primaryContainer = bondPrimary.closest('label');
      if (primaryContainer) {
        primaryContainer.style.display = showPrimary ? '' : 'none';
      }
      
      // Update primary options with current bond slaves
      if (showPrimary && bondSlaves) {
        bondPrimary.innerHTML = '<option value="">Select primary interface...</option>';
        Array.from(bondSlaves.selectedOptions).forEach(option => {
          const primaryOption = document.createElement('option');
          primaryOption.value = option.value;
          primaryOption.textContent = option.textContent;
          bondPrimary.appendChild(primaryOption);
        });
      }
    });

    // Update primary options when bond slaves change
    if (bondSlaves) {
      bondSlaves.addEventListener('change', () => {
        if (bondMode.value === 'active-backup') {
          const currentPrimary = bondPrimary.value;
          bondPrimary.innerHTML = '<option value="">Select primary interface...</option>';
          
          Array.from(bondSlaves.selectedOptions).forEach(option => {
            const primaryOption = document.createElement('option');
            primaryOption.value = option.value;
            primaryOption.textContent = option.textContent;
            if (option.value === currentPrimary) {
              primaryOption.selected = true;
            }
            bondPrimary.appendChild(primaryOption);
          });
        }
      });
    }
  }
}

// Expose globally
window.setupSearchAndFilters = setupSearchAndFilters;