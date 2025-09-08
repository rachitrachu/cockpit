/*
 * XAVS Storage Drives Page
 * Manages physical storage drives
 */

import { client } from './client.js';
import * as utils from './utils.js';
import { show_loading, show_empty_state } from './pages.js';

let drives_initialized = false;

// Initialize drives page
export function init_drives() {
    if (drives_initialized) return;
    
    console.log("Initializing drives page...");
    
    // Set up drives content
    setup_drives_content();
    
    // Listen for storage changes
    if (client) {
        client.add_callback(refresh_drives);
    }
    
    // Listen for page refresh events
    document.addEventListener('storage-page-refresh', (e) => {
        if (e.detail.page === 'drives') {
            refresh_drives();
        }
    });
    
    drives_initialized = true;
    console.log("Drives page initialized");
}

// Set up drives page content structure
function setup_drives_content() {
    const page_container = document.getElementById('page-drives');
    if (page_container) {
        page_container.innerHTML = `
            <div class="storage-section">
                <div class="storage-section-header">
                    <h3 class="storage-section-title">
                        <i class="fa fa-hdd" aria-hidden="true"></i>
                        Physical Drives
                    </h3>
                </div>
                <div class="storage-section-content" id="drives-list">
                    <!-- Drives list will be populated -->
                </div>
            </div>
        `;
    }
    
    // Initial refresh
    refresh_drives();
}

// Refresh drives list
function refresh_drives() {
    if (!client) return;
    
    console.log("Refreshing drives list...");
    
    const container = document.getElementById('drives-list');
    if (!container) return;
    
    // Show loading state
    show_loading('drives-list', 'Loading storage drives...');
    
    // Get drives data
    const drives = Array.from(client.drives.values());
    
    if (drives.length === 0) {
        show_empty_state('drives-list', 'fa-hdd', 'No storage drives found', 
                        'No storage drives were detected on this system.');
        return;
    }
    
    // Sort drives by device name
    const sorted_drives = utils.sort_devices(drives);
    
    // Generate drives list HTML
    let html = '<div class="device-list">';
    
    sorted_drives.forEach(drive => {
        const device_desc = utils.fmt_device_desc(drive);
        const size = utils.fmt_size(drive.Size?.v || 0);
        const connection = utils.get_connection_type(drive);
        const removable = utils.is_removable_device(drive);
        const blocks = client.get_blocks_for_drive(drive.path);
        
        // Determine drive status
        let status = 'healthy';
        let status_text = 'Healthy';
        
        if (removable) {
            status = 'removable';
            status_text = 'Removable';
        }
        
        html += `
            <div class="device-item" onclick="show_drive_details('${drive.path}')">
                <div class="device-header">
                    <div class="device-name">
                        <i class="fa fa-hdd" aria-hidden="true"></i>
                        ${utils.escape_html(device_desc)}
                    </div>
                    <div class="device-status">
                        <span class="status-indicator ${utils.get_status_class(status)}">${status_text}</span>
                    </div>
                </div>
                <div class="device-details">
                    <div class="device-detail">
                        <div class="device-detail-label">Size</div>
                        <div class="device-detail-value">${size}</div>
                    </div>
                    <div class="device-detail">
                        <div class="device-detail-label">Connection</div>
                        <div class="device-detail-value">${connection}</div>
                    </div>
                    <div class="device-detail">
                        <div class="device-detail-label">Block Devices</div>
                        <div class="device-detail-value">${blocks.length}</div>
                    </div>
                    <div class="device-detail">
                        <div class="device-detail-label">Model</div>
                        <div class="device-detail-value">${utils.escape_html(drive.Model?.v || 'Unknown')}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Show drive details (placeholder for future implementation)
window.show_drive_details = function(drive_path) {
    console.log("Show drive details for:", drive_path);
    // TODO: Implement drive details modal/page
    alert('Drive details functionality will be implemented in a future version.');
};
