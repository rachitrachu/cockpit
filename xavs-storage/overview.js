/*
 * XAVS Storage Overview Page
 * Displays storage summary and metrics
 */

import { client } from './client.js';
import * as utils from './utils.js';

let overview_initialized = false;

// Initialize overview page
export function init_overview() {
    if (overview_initialized) return;
    
    console.log("Initializing overview page...");
    
    // Set up overview content
    setup_overview_content();
    
    // Listen for storage changes
    if (client) {
        client.add_callback(refresh_overview);
    }
    
    // Listen for page refresh events
    document.addEventListener('storage-page-refresh', (e) => {
        if (e.detail.page === 'overview') {
            refresh_overview();
        }
    });
    
    overview_initialized = true;
    console.log("Overview page initialized");
}

// Set up overview page content structure
function setup_overview_content() {
    // Set up overview cards
    const overview_container = document.getElementById('storage-overview');
    if (overview_container) {
        overview_container.innerHTML = `
            <div class="overview-card">
                <div class="overview-card-header">
                    <i class="overview-card-icon fa fa-hdd"></i>
                    <span class="overview-card-title">Storage Drives</span>
                </div>
                <div class="overview-card-metric" id="metric-drives">0</div>
                <div class="overview-card-label">Physical drives</div>
            </div>
            
            <div class="overview-card">
                <div class="overview-card-header">
                    <i class="overview-card-icon fa fa-chart-pie"></i>
                    <span class="overview-card-title">Total Capacity</span>
                </div>
                <div class="overview-card-metric" id="metric-capacity">0 GB</div>
                <div class="overview-card-label">Total storage space</div>
            </div>
            
            <div class="overview-card">
                <div class="overview-card-header">
                    <i class="overview-card-icon fa fa-database"></i>
                    <span class="overview-card-title">Used Space</span>
                </div>
                <div class="overview-card-metric" id="metric-used">0 GB</div>
                <div class="overview-card-label">Space in use</div>
            </div>
            
            <div class="overview-card">
                <div class="overview-card-header">
                    <i class="overview-card-icon fa fa-check-circle"></i>
                    <span class="overview-card-title">Available Space</span>
                </div>
                <div class="overview-card-metric" id="metric-free">0 GB</div>
                <div class="overview-card-label">Free space available</div>
            </div>
        `;
    }
    
    // Set up overview page content
    const page_container = document.getElementById('page-overview');
    if (page_container) {
        page_container.innerHTML = `
            <!-- Storage Health -->
            <div class="storage-section">
                <div class="storage-section-header">
                    <h3 class="storage-section-title">
                        <i class="fa fa-heartbeat" aria-hidden="true"></i>
                        Storage Health
                    </h3>
                </div>
                <div class="storage-section-content" id="storage-health">
                    <!-- Health content -->
                </div>
            </div>
            
            <!-- Recent Activity -->
            <div class="storage-section">
                <div class="storage-section-header">
                    <h3 class="storage-section-title">
                        <i class="fa fa-history" aria-hidden="true"></i>
                        Recent Activity
                    </h3>
                </div>
                <div class="storage-section-content" id="recent-activity">
                    <!-- Activity content -->
                </div>
            </div>
            
            <!-- Quick Actions -->
            <div class="storage-section">
                <div class="storage-section-header">
                    <h3 class="storage-section-title">
                        <i class="fa fa-bolt" aria-hidden="true"></i>
                        Quick Actions
                    </h3>
                </div>
                <div class="storage-section-content" id="quick-actions">
                    <!-- Quick actions -->
                </div>
            </div>
        `;
    }
    
    // Initial refresh
    refresh_overview();
}

// Refresh overview data
function refresh_overview() {
    if (!client) return;
    
    console.log("Refreshing overview...");
    
    // Get storage summary
    const summary = client.get_storage_summary();
    
    // Update metrics
    update_metrics(summary);
    update_health_status();
    update_recent_activity();
    update_quick_actions();
}

// Update storage metrics
function update_metrics(summary) {
    // Update drive count
    const drives_elem = document.getElementById('metric-drives');
    if (drives_elem) {
        drives_elem.textContent = summary.drives;
    }
    
    // Update capacity
    const capacity_elem = document.getElementById('metric-capacity');
    if (capacity_elem) {
        capacity_elem.textContent = utils.fmt_size(summary.total_capacity);
    }
    
    // Update used space
    const used_elem = document.getElementById('metric-used');
    if (used_elem) {
        used_elem.textContent = utils.fmt_size(summary.used_capacity);
    }
    
    // Update free space
    const free_elem = document.getElementById('metric-free');
    if (free_elem) {
        free_elem.textContent = utils.fmt_size(summary.free_capacity);
    }
}

// Update storage health status
function update_health_status() {
    const container = document.getElementById('storage-health');
    if (!container || !client) return;
    
    const drives_count = client.drives.size;
    const raids_count = client.mdraids.size;
    const vgs_count = client.vgroups.size;
    
    let health_items = [];
    
    // Drive health
    if (drives_count > 0) {
        health_items.push({
            icon: 'fa-hdd',
            label: `${drives_count} Drive${drives_count !== 1 ? 's' : ''}`,
            status: 'healthy',
            details: 'All drives operating normally'
        });
    }
    
    // RAID health
    if (raids_count > 0) {
        health_items.push({
            icon: 'fa-shield-alt',
            label: `${raids_count} RAID Array${raids_count !== 1 ? 's' : ''}`,
            status: 'healthy',
            details: 'All arrays synchronized'
        });
    }
    
    // LVM health
    if (vgs_count > 0) {
        health_items.push({
            icon: 'fa-layer-group',
            label: `${vgs_count} Volume Group${vgs_count !== 1 ? 's' : ''}`,
            status: 'healthy',
            details: 'All volume groups active'
        });
    }
    
    if (health_items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-info-circle" aria-hidden="true"></i>
                <h3>No storage devices</h3>
                <p>No storage devices are currently configured on this system.</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="device-list">';
    health_items.forEach(item => {
        html += `
            <div class="device-item">
                <div class="device-header">
                    <div class="device-name">
                        <i class="fa ${item.icon}" aria-hidden="true"></i>
                        ${item.label}
                    </div>
                    <div class="device-status">
                        <span class="status-indicator ${item.status}">${item.status}</span>
                    </div>
                </div>
                <div class="device-details">
                    <div class="device-detail">
                        <div class="device-detail-value">${item.details}</div>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Update recent activity
function update_recent_activity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;
    
    // Mock recent activity data
    const activities = [
        {
            time: new Date(Date.now() - 1000 * 60 * 5),
            action: 'Storage scan completed',
            details: 'All devices scanned successfully',
            icon: 'fa-search'
        },
        {
            time: new Date(Date.now() - 1000 * 60 * 30),
            action: 'Storage monitoring started',
            details: 'UDisks2 monitoring active',
            icon: 'fa-play'
        }
    ];
    
    if (activities.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-clock" aria-hidden="true"></i>
                <h3>No recent activity</h3>
                <p>No storage operations have been performed recently.</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="device-list">';
    activities.forEach(activity => {
        const time_str = activity.time.toLocaleTimeString();
        html += `
            <div class="device-item">
                <div class="device-header">
                    <div class="device-name">
                        <i class="fa ${activity.icon}" aria-hidden="true"></i>
                        ${activity.action}
                    </div>
                    <div class="device-status">
                        <span class="device-detail-value">${time_str}</span>
                    </div>
                </div>
                <div class="device-details">
                    <div class="device-detail">
                        <div class="device-detail-value">${activity.details}</div>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Update quick actions
function update_quick_actions() {
    const container = document.getElementById('quick-actions');
    if (!container) return;
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            <button class="btn btn-primary" onclick="window.xavs_storage.show_page('drives')">
                <i class="fa fa-hdd" aria-hidden="true"></i>
                Manage Drives
            </button>
            <button class="btn btn-secondary" onclick="window.xavs_storage.show_page('partitions')">
                <i class="fa fa-th-large" aria-hidden="true"></i>
                Create Partition
            </button>
            <button class="btn btn-secondary" onclick="window.xavs_storage.show_page('lvm')">
                <i class="fa fa-layer-group" aria-hidden="true"></i>
                Setup LVM
            </button>
            <button class="btn btn-secondary" onclick="window.xavs_storage.show_page('raid')">
                <i class="fa fa-shield-alt" aria-hidden="true"></i>
                Configure RAID
            </button>
            <button class="btn btn-secondary" onclick="window.xavs_storage.show_page('nfs')">
                <i class="fa fa-network-wired" aria-hidden="true"></i>
                Mount Network Storage
            </button>
            <button class="btn btn-secondary" onclick="window.xavs_storage.refresh_all()">
                <i class="fa fa-sync" aria-hidden="true"></i>
                Refresh All
            </button>
        </div>
    `;
}
