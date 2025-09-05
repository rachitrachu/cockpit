'use strict';
/* global $, $$ */

function setupSearchAndFilters() {
  console.log('Setting up search and filter functionality...');

  // Interface search functionality with debouncing
  const searchIface = $('#search-iface');
  console.log('Search input element found:', !!searchIface);

  if (searchIface) {
    // Core search implementation: filter interface rows and update a status line
    function performSearch(queryRaw) {
      const query = (queryRaw || '').toLowerCase().trim();
      const rows = $$('#table-interfaces tbody tr');
      let visibleCount = 0;
      let totalInterfaces = 0;

      rows.forEach(row => {
        // Skip detail rows
        if (row.classList.contains('detail-row') ||
            row.style.backgroundColor === 'rgb(248, 249, 250)' ||
            row.style.borderTop?.includes('2px solid')) {
          return;
        }

        totalInterfaces++;
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        // Extract interface name from first column: first line, first token
        const nameCellText = (cells[0]?.textContent || '').trim();
        const firstLine = nameCellText.split('\n')[0].trim();
        const ifaceName = (firstLine.split(/\s+/)[0] || '').toLowerCase();

        const matches = !query || ifaceName.startsWith(query);

        if (matches) {
          row.style.display = '';
          row.style.opacity = '1';
          visibleCount++;
        } else {
          row.style.opacity = '0.5';
          setTimeout(() => {
            if (row.style.opacity === '0.5') row.style.display = 'none';
          }, 120);
        }

        // Hide following detail row if parent hidden
        const detailRow = row.nextElementSibling;
        if (detailRow && (detailRow.classList.contains('detail-row') ||
                           detailRow.style.backgroundColor === 'rgb(248, 249, 250)' ||
                           detailRow.style.borderTop?.includes('2px solid'))) {
          if (!matches) detailRow.style.display = 'none';
        }
      });

      // Update status helper text
      const statusMsg = query ?
        (visibleCount === 0 ? `No interfaces found starting with "${query}"` : `${visibleCount} of ${totalInterfaces} starting with "${query}"`) :
        `Showing all ${totalInterfaces}`;
      let statusEl = document.getElementById('search-status');
      if (!statusEl && searchIface && searchIface.parentElement) {
        statusEl = document.createElement('div');
        statusEl.id = 'search-status';
        searchIface.parentElement.appendChild(statusEl);
      }
      if (statusEl) {
        statusEl.textContent = statusMsg;
        statusEl.style.color = (query && visibleCount === 0) ? '#dc3545' : 'var(--muted-color)';
      }
    }

  // Expose for immediate initial invocation post-render
  window.performSearch = performSearch;

    const _debounce = window.debounce || (function(func, wait) {
      let timeout;
      return function(...args) {
        const later = () => {
          timeout = null;
          func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    });

    const debouncedSearch = _debounce(() => {
      if (window.performance && performance.mark) {
        performance.mark('xavs:search:exec');
        if (performance.getEntriesByName('xavs:search:queued').length && performance.measure) {
          try {
            performance.measure('xavs:search:queueDelay', 'xavs:search:queued', 'xavs:search:exec');
            const m = performance.getEntriesByName('xavs:search:queueDelay').pop();
            if (m) console.log(`[perf] search queue delay: ${m.duration.toFixed(2)} ms`);
          } catch (e) { /* ignore */ }
        }
      }
      const input = document.getElementById('interfaceSearchInput') || searchIface;
      const query = input ? (input.value || '').toLowerCase().trim() : '';
      performSearch(query);
  }, 120);
    
    // Expose search function globally for interface loading callback
  searchIface.addEventListener('input', (e) => {
      if (window.performance && performance.mark) {
        performance.mark('xavs:search:queued');
      }
      debouncedSearch(e);
    });
  window.updateInterfaceSearch = debouncedSearch;
    
    // Note: Initial search is now triggered by interfaces.js after loading completes
    // This eliminates the need for polling and prevents duplicate search operations
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