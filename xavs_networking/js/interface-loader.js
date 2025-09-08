/**
 * Interface Loading and Rendering Module
 * Uses the discover() function to load and display network interfaces
 */

/* global discover, categorizeNics, detectCriticalPath, updateStatus, showError, showLoading, hideLoading */

let interfaceCache = null;
let lastLoadTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

/**
 * Load and display network interfaces
 * @param {boolean} forceRefresh - Skip cache and force fresh data
 */
async function loadInterfaces(forceRefresh = false) {
    console.log('🔌 Loading interfaces...', forceRefresh ? '(force refresh)' : '(cache allowed)');
    
    const now = Date.now();
    const useCache = !forceRefresh && interfaceCache && (now - lastLoadTime) < CACHE_DURATION;
    
    if (useCache) {
        console.log('📋 Using cached interface data');
        renderInterfacesTable(interfaceCache);
        return;
    }
    
    const tableBody = document.querySelector('#table-interfaces tbody');
    if (!tableBody) {
        console.error('❌ Interface table not found');
        return;
    }
    
    try {
        updateStatus('Loading interfaces...', 'Discovering network configuration');
        showLoading(tableBody, 'Discovering interfaces...');
        
        // Use the discover function to get interface data
        console.log('🔍 Running interface discovery...');
        const discoveryData = await discover();
        
        // Categorize interfaces
        const categorized = categorizeNics(discoveryData);
        
        // Detect critical path
        const criticalPath = detectCriticalPath(discoveryData.runtime.routes);
        
        // Combine data for rendering
        const interfaceData = {
            discovery: discoveryData,
            categorized: categorized,
            criticalPath: criticalPath
        };
        
        // Cache the data
        interfaceCache = interfaceData;
        lastLoadTime = now;
        
        console.log('✅ Interface discovery completed:', {
            baseline: categorized.baseline.length,
            spare: categorized.spare.length,
            xavs: categorized.xavs.length,
            overlay: categorized.overlay.length,
            criticalPath: criticalPath
        });
        
        // Render the interfaces table
        renderInterfacesTable(interfaceData);
        
        updateStatus('Ready', `Found ${getTotalInterfaceCount(categorized)} network interfaces`);
        
    } catch (error) {
        console.error('❌ Failed to load interfaces:', error);
        showError('Interface Loading Failed', error.message || 'Unknown error');
        renderErrorState(tableBody, error);
    } finally {
        hideLoading(tableBody);
    }
}

/**
 * Render interfaces data to the table
 */
function renderInterfacesTable(data) {
    const tableBody = document.querySelector('#table-interfaces tbody');
    if (!tableBody) return;
    
    const { discovery, categorized, criticalPath } = data;
    const { runtime } = discovery;
    
    // Clear existing content
    tableBody.innerHTML = '';
    
    // Combine all interfaces for display
    const allInterfaces = [
        ...categorized.baseline.map(iface => ({ ...iface, category: 'baseline' })),
        ...categorized.spare.map(iface => ({ ...iface, category: 'spare' })),
        ...categorized.xavs.map(iface => ({ ...iface, category: 'xavs' })),
        ...categorized.overlay.map(iface => ({ ...iface, category: 'overlay' }))
    ];
    
    if (allInterfaces.length === 0) {
        renderEmptyState(tableBody);
        return;
    }
    
    // Sort interfaces by name
    allInterfaces.sort((a, b) => a.ifname.localeCompare(b.ifname));
    
    // Render each interface
    allInterfaces.forEach(iface => {
        const row = createInterfaceRow(iface, runtime, criticalPath);
        tableBody.appendChild(row);
    });
    
    console.log(`📊 Rendered ${allInterfaces.length} interfaces to table`);
}

/**
 * Create a table row for an interface
 */
function createInterfaceRow(iface, runtime, criticalPath) {
    const row = document.createElement('tr');
    row.dataset.interface = iface.ifname;
    row.dataset.category = iface.category;
    
    // Add CSS class based on category
    row.classList.add(`interface-${iface.category}`);
    
    // Mark critical path interface
    if (iface.ifname === criticalPath) {
        row.classList.add('interface-critical');
    }
    
    // Get IP addresses for this interface
    const addresses = getInterfaceAddresses(iface.ifname, runtime.addrs);
    
    // Get interface state
    const state = getInterfaceState(iface);
    
    row.innerHTML = `
        <td>
            <div class="interface-name">
                <span class="name">${escapeHtml(iface.ifname)}</span>
                ${iface.ifname === criticalPath ? '<span class="badge badge-critical">MGMT</span>' : ''}
                <span class="badge badge-${iface.category}">${iface.category.toUpperCase()}</span>
            </div>
        </td>
        <td>
            <span class="interface-type">${getInterfaceType(iface)}</span>
        </td>
        <td>
            <span class="interface-state ${state.class}">${state.text}</span>
        </td>
        <td>
            <span class="mac-address">${iface.address || 'N/A'}</span>
        </td>
        <td>
            <div class="ip-addresses">
                ${addresses.ipv4.map(ip => `<div class="ip-addr ipv4">${escapeHtml(ip)}</div>`).join('')}
            </div>
        </td>
        <td>
            <div class="ip-addresses">
                ${addresses.ipv6.map(ip => `<div class="ip-addr ipv6">${escapeHtml(ip)}</div>`).join('')}
            </div>
        </td>
        <td>
            <span class="mtu">${iface.mtu || 'N/A'}</span>
        </td>
        <td>
            <div class="interface-actions">
                ${createActionButtons(iface, criticalPath)}
            </div>
        </td>
    `;
    
    return row;
}

/**
 * Get IP addresses for an interface
 */
function getInterfaceAddresses(ifname, addrs) {
    const result = { ipv4: [], ipv6: [] };
    
    const ifaceAddrs = addrs.filter(addr => addr.ifname === ifname);
    
    ifaceAddrs.forEach(addr => {
        if (addr.addr_info) {
            addr.addr_info.forEach(info => {
                const addrStr = `${info.local}/${info.prefixlen}`;
                if (info.family === 'inet') {
                    result.ipv4.push(addrStr);
                } else if (info.family === 'inet6' && !info.local.startsWith('fe80:')) {
                    // Skip link-local IPv6 addresses
                    result.ipv6.push(addrStr);
                }
            });
        }
    });
    
    return result;
}

/**
 * Get interface state information
 */
function getInterfaceState(iface) {
    const flags = iface.flags || [];
    
    if (flags.includes('UP')) {
        if (flags.includes('RUNNING')) {
            return { class: 'state-up', text: 'UP' };
        } else {
            return { class: 'state-no-carrier', text: 'NO-CARRIER' };
        }
    } else {
        return { class: 'state-down', text: 'DOWN' };
    }
}

/**
 * Get interface type description
 */
function getInterfaceType(iface) {
    const type = iface.link_type || iface.type || 'unknown';
    
    switch (type) {
        case 'ether': return 'Ethernet';
        case 'vlan': return 'VLAN';
        case 'bond': return 'Bond';
        case 'bridge': return 'Bridge';
        case 'loopback': return 'Loopback';
        case 'tun': return 'Tunnel';
        case 'veth': return 'Virtual Ethernet';
        default: return type.charAt(0).toUpperCase() + type.slice(1);
    }
}

/**
 * Create action buttons for an interface
 */
function createActionButtons(iface, criticalPath) {
    const isManagement = iface.ifname === criticalPath;
    const category = iface.category;
    
    let buttons = [];
    
    // Configure button - available for all except spare
    if (category !== 'spare') {
        const configType = category === 'baseline' ? 'overlay' : 'full';
        buttons.push(`
            <button class="btn btn-sm btn-outline-primary" 
                    onclick="configureInterface('${iface.ifname}', '${configType}')"
                    title="Configure interface">
                <i class="fas fa-cog"></i>
            </button>
        `);
    }
    
    // Promote to XAVS button - for spare interfaces
    if (category === 'spare') {
        buttons.push(`
            <button class="btn btn-sm btn-outline-success" 
                    onclick="promoteInterface('${iface.ifname}')"
                    title="Promote to XAVS management">
                <i class="fas fa-arrow-up"></i>
            </button>
        `);
    }
    
    // Delete/Reset button - not for management interface
    if (!isManagement && category !== 'baseline') {
        const action = category === 'spare' ? 'Reset' : 'Delete';
        const iconClass = category === 'spare' ? 'fa-undo' : 'fa-trash';
        buttons.push(`
            <button class="btn btn-sm btn-outline-danger" 
                    onclick="resetInterface('${iface.ifname}')"
                    title="${action} interface configuration">
                <i class="fas ${iconClass}"></i>
            </button>
        `);
    }
    
    return buttons.join('');
}

/**
 * Render empty state
 */
function renderEmptyState(tableBody) {
    tableBody.innerHTML = `
        <tr class="empty-state">
            <td colspan="8" style="text-align: center; padding: 3rem; color: var(--muted);">
                <i class="fas fa-network-wired fa-2x"></i>
                <h4>No Network Interfaces Found</h4>
                <p>No network interfaces were discovered on this system.</p>
                <button class="btn btn-outline-primary" onclick="loadInterfaces(true)">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </td>
        </tr>
    `;
}

/**
 * Render error state
 */
function renderErrorState(tableBody, error) {
    tableBody.innerHTML = `
        <tr class="error-state">
            <td colspan="8" style="text-align: center; padding: 3rem; color: var(--danger);">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <h4>Failed to Load Interfaces</h4>
                <p>${escapeHtml(error.message || 'Unknown error occurred')}</p>
                <button class="btn btn-outline-primary" onclick="loadInterfaces(true)">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </td>
        </tr>
    `;
}

/**
 * Helper functions
 */
function getTotalInterfaceCount(categorized) {
    return categorized.baseline.length + 
           categorized.spare.length + 
           categorized.xavs.length + 
           categorized.overlay.length;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Interface action handlers (will be implemented elsewhere)
 */
function configureInterface(ifname, type) {
    console.log(`Configure ${ifname} as ${type}`);
    // TODO: Implement interface configuration
}

function promoteInterface(ifname) {
    console.log(`Promote ${ifname} to XAVS`);
    // TODO: Implement interface promotion
}

function resetInterface(ifname) {
    console.log(`Reset ${ifname}`);
    // TODO: Implement interface reset
}

// Export to global scope
window.loadInterfaces = loadInterfaces;
window.renderInterfacesTable = renderInterfacesTable;
window.configureInterface = configureInterface;
window.promoteInterface = promoteInterface;
window.resetInterface = resetInterface;

// Setup refresh button handler when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const refreshBtn = document.getElementById('btn-refresh-interfaces');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            console.log('🔄 Manual interface refresh requested');
            loadInterfaces(true); // Force refresh
        });
    }
});
