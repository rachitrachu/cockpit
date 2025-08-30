'use strict';
/* global $, $$ */

function setupSearchAndFilters() {
  console.log('Setting up search and filter functionality...');

  // Interface search functionality with debouncing
  const searchIface = $('#search-iface');
  console.log('Search input element found:', !!searchIface);

  if (searchIface) {
    let searchTimeout;
    
    const performSearch = (query) => {
      console.log('Performing search for:', query);
      const rows = $$('#table-interfaces tbody tr');
      console.log('Found table rows:', rows.length);
      let visibleCount = 0;
      let totalInterfaces = 0;
      
      rows.forEach(row => {
        // Skip detail rows - they'll be handled by their parent interface row
        if (row.style.backgroundColor === 'rgb(248, 249, 250)' || 
            row.style.borderTop === '2px solid rgb(0, 123, 255)' ||
            row.classList.contains('detail-row')) {
          return;
        }
        
        totalInterfaces++;
        
        const cells = row.querySelectorAll('td');
        if (cells.length > 0) {
          // Get text content from interface row
          const interfaceText = Array.from(cells).map(cell => cell.textContent.toLowerCase()).join(' ');
          
          // Check if query matches interface data
          const matches = !query || 
            interfaceText.includes(query) ||
            // Also search in device name, type, IP addresses
            cells[0]?.textContent.toLowerCase().includes(query) ||  // Device name
            cells[1]?.textContent.toLowerCase().includes(query) ||  // Type  
            cells[2]?.textContent.toLowerCase().includes(query) ||  // State
            cells[3]?.textContent.toLowerCase().includes(query) ||  // IPv4
            cells[4]?.textContent.toLowerCase().includes(query);    // IPv6
          
          // Show/hide the interface row with smooth transition
          if (matches) {
            row.style.display = '';
            row.style.opacity = '1';
            visibleCount++;
          } else {
            row.style.opacity = '0.5';
            setTimeout(() => {
              if (row.style.opacity === '0.5') {
                row.style.display = 'none';
              }
            }, 150);
          }
          
          // Handle associated detail row
          const detailRow = row.nextElementSibling;
          if (detailRow && (detailRow.style.backgroundColor === 'rgb(248, 249, 250)' || 
                           detailRow.style.borderTop === '2px solid rgb(0, 123, 255)' ||
                           detailRow.classList.contains('detail-row'))) {
            // Hide detail row if parent is hidden
            if (!matches) {
              detailRow.style.display = 'none';
            } else if (detailRow.style.display === 'none' && query) {
              // If parent becomes visible and we're searching, keep detail hidden until user clicks
              detailRow.style.display = 'none';
            }
          }
        }
      });
      
      // Show search status with better messaging
      const statusMsg = query ? 
        (visibleCount === 0 ? 
          `No interfaces found matching "${query}"` :
          `${visibleCount} of ${totalInterfaces} interface${visibleCount !== 1 ? 's' : ''} matching "${query}"`) :
        `Showing all ${totalInterfaces} interface${totalInterfaces !== 1 ? 's' : ''}`;
      
      // Update or create search status indicator
      let searchStatus = document.querySelector('#search-status');
      if (!searchStatus) {
        searchStatus = document.createElement('div');
        searchStatus.id = 'search-status';
        searchIface.parentElement.appendChild(searchStatus);
      }
      searchStatus.textContent = statusMsg;
      
      // Add visual feedback for empty results
      searchStatus.style.color = (query && visibleCount === 0) ? '#dc3545' : 'var(--muted-color)';
    };

    searchIface.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      
      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      // Debounce search for better performance
      searchTimeout = setTimeout(() => {
        performSearch(query);
      }, 200);
    });
    
    // Expose search function globally for interface loading callback
    window.updateInterfaceSearch = performSearch;
    
    // Initial load - show all interfaces count
    // Wait for interfaces to be loaded by checking periodically
    const waitForInterfaces = () => {
      const rows = $$('#table-interfaces tbody tr');
      if (rows && rows.length > 0) {
        performSearch('');
      } else {
        setTimeout(waitForInterfaces, 200);
      }
    };
    setTimeout(waitForInterfaces, 100);
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