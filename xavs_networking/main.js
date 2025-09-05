'use strict';
/* global cockpit, waitForReady, loadInterfaces, setupEvents, loadDiagnostics */

/**
 * Main entry point for XOS Networking module
 * Integrates with xavs-bootstrap framework and Cockpit API
 */

console.log('XOS Networking module initializing...');

// Module state
const NetworkingModule = {
    currentTab: 'interfaces',
    initialized: false,
    cockpitReady: false
};

/**
 * Initialize tab switching functionality
 */
function initTabSwitching() {
    const tabs = document.querySelectorAll('.nav-tabs .nav-link');
    const panels = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', async (e) => {
            e.preventDefault();
            const targetPanel = tab.getAttribute('data-target');
            const targetTab = tab.getAttribute('data-tab');
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active panel
            panels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === targetPanel) {
                    panel.classList.add('active');
                }
            });
            
            NetworkingModule.currentTab = targetTab;
            
            // Load content for specific tabs
            switch (targetTab) {
                case 'interfaces':
                    console.log('🔌 Loading interfaces tab');
                    if (typeof loadInterfaces === 'function') {
                        if (!NetworkingModule.interfacesLoaded) {
                            await loadInterfaces();
                            NetworkingModule.interfacesLoaded = true;
                        }
                        // Reset status back to Ready after loading interfaces
                        updateStatus('Ready', 'XOS Networking Management Interface');
                    } else {
                        console.error('❌ loadInterfaces function not found');
                    }
                    break;
                case 'constructs':
                    console.log('🏗️ Loading constructs tab - setting up networking forms');
                    if (typeof setupNetworkingForms === 'function') {
                        setupNetworkingForms().then(() => {
                            console.log('✅ Networking forms setup completed');
                        }).catch(error => {
                            console.error('❌ Networking forms setup failed:', error);
                        });
                    } else {
                        console.error('❌ setupNetworkingForms function not found');
                    }
                    break;
                case 'diagnostics':
                    console.log('🔍 Loading diagnostics tab');
                    if (typeof loadDiagnostics === 'function') {
                        loadDiagnostics();
                    } else {
                        console.error('❌ loadDiagnostics function not found');
                    }
                    break;
                default:
                    console.log('ℹ️ No specific loader for tab:', targetTab);
            }
            
            console.log(`Switched to ${targetTab} tab`);
        });
    });
}

/**
 * Update status in footer
 */
function updateStatus(message, detail = '') {
    const statusEl = document.getElementById('status');
    const statusDetailEl = document.querySelector('.status-detail');
    
    if (statusEl) {
        statusEl.textContent = message;
    }
    
    if (statusDetailEl && detail) {
        statusDetailEl.textContent = detail;
    }
}

/**
 * Show loading state
 */
function showLoading(element, message = 'Loading...') {
    if (element) {
        element.classList.add('loading');
        updateStatus(message);
    }
}

/**
 * Hide loading state
 */
function hideLoading(element) {
    if (element) {
        element.classList.remove('loading');
    }
}

/**
 * Display error message
 */
function showError(message, details = '') {
    console.error('XOS Networking Error:', message, details);
    updateStatus(`Error: ${message}`, details);
    
    // You could also show a toast notification here if implemented
}

/**
 * Display success message
 */
function showSuccess(message, details = '') {
    console.log('XOS Networking Success:', message);
    updateStatus(`Success: ${message}`, details);
}

/**
 * Initialize keyboard shortcuts
 */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + R for refresh
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            if (NetworkingModule.currentTab === 'interfaces') {
                const refreshBtn = document.getElementById('btn-refresh-interfaces');
                if (refreshBtn) {
                    refreshBtn.click();
                }
            }
        }
        
        // Escape to close modals or reset forms
        if (e.key === 'Escape') {
            const resetBtn = document.getElementById('btn-reset-forms');
            if (resetBtn && NetworkingModule.currentTab === 'constructs') {
                resetBtn.click();
            }
        }
    });
}

/**
 * Initialize responsive behavior
 */
function initResponsiveBehavior() {
    // Handle window resize for table responsiveness
    function handleResize() {
        const tables = document.querySelectorAll('.table-responsive');
        tables.forEach(table => {
            if (window.innerWidth < 768) {
                table.style.fontSize = '0.8rem';
            } else {
                table.style.fontSize = '';
            }
        });
    }
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial call
}

/**
 * Initialize interface search functionality
 */
function initInterfaceSearch() {
    const searchInput = document.getElementById('search-iface');
    if (!searchInput) {
        console.warn('Search input not found');
        return;
    }

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        const tableBody = document.querySelector('#table-interfaces tbody');
        
        if (!tableBody) {
            console.warn('Interface table body not found');
            return;
        }

        const rows = tableBody.querySelectorAll('tr');
        let visibleCount = 0;

        rows.forEach(row => {
            // Skip detail rows (they have display: none initially)
            if (row.style.display === 'none' && row.querySelector('td[colspan]')) {
                return;
            }

            // Get the interface name from the first cell, but only the actual name
            const firstCell = row.querySelector('td:first-child');
            let interfaceName = '';
            
            if (firstCell) {
                // Check if it has a nested div structure (like VLAN interfaces)
                const nameDiv = firstCell.querySelector('div:first-child');
                if (nameDiv) {
                    interfaceName = nameDiv.textContent?.trim()?.toLowerCase() || '';
                } else {
                    interfaceName = firstCell.textContent?.trim()?.toLowerCase() || '';
                }
            }
            
            const matches = interfaceName.startsWith(searchTerm) || searchTerm === '';

            if (matches) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        // Show/hide "no results" message
        let noResultsRow = tableBody.querySelector('.no-results-row');
        if (visibleCount === 0 && searchTerm !== '') {
            if (!noResultsRow) {
                noResultsRow = document.createElement('tr');
                noResultsRow.className = 'no-results-row';
                noResultsRow.innerHTML = `
                    <td colspan="8" style="text-align: center; padding: 2rem; color: var(--muted);">
                        <i class="fas fa-search"></i> No interfaces found matching "${searchTerm}"
                    </td>
                `;
                tableBody.appendChild(noResultsRow);
            }
        } else if (noResultsRow) {
            noResultsRow.remove();
        }
    });

    console.log('✅ Interface search functionality initialized');
}

/**
 * Main initialization function
 */
async function initNetworkingModule() {
    console.log('Starting XOS Networking module initialization...');
    
    try {
        updateStatus('Initializing...', 'Setting up networking interface');
        
        // Wait for DOM and Cockpit to be ready
        if (typeof waitForReady === 'function') {
            await waitForReady();
        }
        
        NetworkingModule.cockpitReady = typeof cockpit !== 'undefined';
        console.log('Cockpit ready:', NetworkingModule.cockpitReady);
        
        // Initialize UI components
        initTabSwitching();
        initKeyboardShortcuts();
        initResponsiveBehavior();
        initInterfaceSearch();
        
        // Initialize events if available
        if (typeof setupEvents === 'function') {
            setupEvents();
        }
        
        // Load initial data for interfaces tab (only if not already loaded)
        if (typeof loadInterfaces === 'function' && !NetworkingModule.interfacesLoaded) {
            await loadInterfaces();
            NetworkingModule.interfacesLoaded = true;
            // Reset status back to Ready after loading interfaces
            updateStatus('Ready', 'XOS Networking Management Interface');
        }
        
        // Load initial diagnostics data
        if (typeof loadDiagnostics === 'function') {
            await loadDiagnostics();
        }
        
        // Initialize networking forms for constructs tab
        if (typeof setupNetworkingForms === 'function') {
            console.log('🏗️ Initializing networking forms...');
            await setupNetworkingForms();
        }
        
        NetworkingModule.initialized = true;
        
        console.log('XOS Networking module initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize XOS Networking module:', error);
        showError('Initialization failed', error.message);
    }
}

/**
 * Cleanup function
 */
function cleanup() {
    console.log('Cleaning up XOS Networking module...');
    NetworkingModule.initialized = false;
}

// Global error handlers
window.addEventListener('error', (e) => {
    console.error('JavaScript Error in XOS Networking:', e.error);
    showError('JavaScript error occurred', e.error?.message || 'Unknown error');
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection in XOS Networking:', e.reason);
    showError('Promise rejection', e.reason?.message || 'Unknown error');
});

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNetworkingModule);
} else {
    // DOM already loaded
    initNetworkingModule();
}

// Export for use by other modules
window.NetworkingModule = NetworkingModule;
window.updateStatus = updateStatus;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showError = showError;
window.showSuccess = showSuccess;
