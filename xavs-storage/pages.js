/*
 * XAVS Storage Pages Management
 * Handles page routing and navigation
 */

import { init_client } from './client.js';
import { init_overview } from './overview.js';
import { init_drives } from './drives.js';
import { init_partitions } from './partitions.js';
import { init_filesystem } from './filesystem.js';
import { init_lvm } from './lvm.js';
import { init_raid } from './raid.js';
import { init_nfs } from './nfs.js';

// Page state
let current_page = 'overview';
let pages_initialized = false;

// Initialize all pages
export function init_pages() {
    if (pages_initialized) return;
    
    console.log("Initializing XAVS Storage pages...");
    
    // Initialize storage client
    const client = init_client();
    
    // Create main page structure
    create_page_structure();
    
    // Initialize individual page modules
    init_overview();
    init_drives();
    init_partitions();
    init_filesystem();
    init_lvm();
    init_raid();
    init_nfs();
    
    // Set up navigation
    setup_navigation();
    
    // Show initial page
    show_page('overview');
    
    pages_initialized = true;
    console.log("XAVS Storage pages initialized");
}

// Create main page structure
function create_page_structure() {
    const container = document.getElementById('storage');
    
    container.innerHTML = `
        <!-- Header -->
        <div class="ct-page-header">
            <h1>
                <i class="fa fa-hdd" aria-hidden="true"></i>
                XAVS Storage
            </h1>
        </div>
        
        <!-- Storage Overview Cards -->
        <div class="storage-overview" id="storage-overview">
            <!-- Overview cards will be populated by overview.js -->
        </div>
        
        <!-- Navigation Tabs -->
        <div class="storage-nav">
            <div class="pf-v5-c-tabs" role="tablist">
                <ul class="pf-v5-c-tabs__list" role="tablist">
                    <li class="pf-v5-c-tabs__item" role="presentation">
                        <a class="pf-v5-c-tabs__link pf-v5-m-current" 
                           href="#overview" data-page="overview" role="tab">
                            <span class="pf-v5-c-tabs__item-text">
                                <i class="fa fa-tachometer-alt" aria-hidden="true"></i>
                                Overview
                            </span>
                        </a>
                    </li>
                    <li class="pf-v5-c-tabs__item" role="presentation">
                        <a class="pf-v5-c-tabs__link" 
                           href="#drives" data-page="drives" role="tab">
                            <span class="pf-v5-c-tabs__item-text">
                                <i class="fa fa-hdd" aria-hidden="true"></i>
                                Drives
                            </span>
                        </a>
                    </li>
                    <li class="pf-v5-c-tabs__item" role="presentation">
                        <a class="pf-v5-c-tabs__link" 
                           href="#partitions" data-page="partitions" role="tab">
                            <span class="pf-v5-c-tabs__item-text">
                                <i class="fa fa-th-large" aria-hidden="true"></i>
                                Partitions
                            </span>
                        </a>
                    </li>
                    <li class="pf-v5-c-tabs__item" role="presentation">
                        <a class="pf-v5-c-tabs__link" 
                           href="#filesystem" data-page="filesystem" role="tab">
                            <span class="pf-v5-c-tabs__item-text">
                                <i class="fa fa-database" aria-hidden="true"></i>
                                Filesystems
                            </span>
                        </a>
                    </li>
                    <li class="pf-v5-c-tabs__item" role="presentation">
                        <a class="pf-v5-c-tabs__link" 
                           href="#lvm" data-page="lvm" role="tab">
                            <span class="pf-v5-c-tabs__item-text">
                                <i class="fa fa-layer-group" aria-hidden="true"></i>
                                LVM
                            </span>
                        </a>
                    </li>
                    <li class="pf-v5-c-tabs__item" role="presentation">
                        <a class="pf-v5-c-tabs__link" 
                           href="#raid" data-page="raid" role="tab">
                            <span class="pf-v5-c-tabs__item-text">
                                <i class="fa fa-shield-alt" aria-hidden="true"></i>
                                RAID
                            </span>
                        </a>
                    </li>
                    <li class="pf-v5-c-tabs__item" role="presentation">
                        <a class="pf-v5-c-tabs__link" 
                           href="#nfs" data-page="nfs" role="tab">
                            <span class="pf-v5-c-tabs__item-text">
                                <i class="fa fa-network-wired" aria-hidden="true"></i>
                                Network Storage
                            </span>
                        </a>
                    </li>
                </ul>
            </div>
        </div>
        
        <!-- Content Area -->
        <div class="storage-content">
            <!-- Overview Page -->
            <div id="page-overview" class="storage-page" data-page="overview">
                <!-- Overview content will be populated by overview.js -->
            </div>
            
            <!-- Drives Page -->
            <div id="page-drives" class="storage-page" data-page="drives" style="display: none;">
                <!-- Drives content will be populated by drives.js -->
            </div>
            
            <!-- Partitions Page -->
            <div id="page-partitions" class="storage-page" data-page="partitions" style="display: none;">
                <!-- Partitions content will be populated by partitions.js -->
            </div>
            
            <!-- Filesystems Page -->
            <div id="page-filesystem" class="storage-page" data-page="filesystem" style="display: none;">
                <!-- Filesystem content will be populated by filesystem.js -->
            </div>
            
            <!-- LVM Page -->
            <div id="page-lvm" class="storage-page" data-page="lvm" style="display: none;">
                <!-- LVM content will be populated by lvm.js -->
            </div>
            
            <!-- RAID Page -->
            <div id="page-raid" class="storage-page" data-page="raid" style="display: none;">
                <!-- RAID content will be populated by raid.js -->
            </div>
            
            <!-- NFS Page -->
            <div id="page-nfs" class="storage-page" data-page="nfs" style="display: none;">
                <!-- NFS content will be populated by nfs.js -->
            </div>
        </div>
    `;
}

// Set up navigation event handlers
function setup_navigation() {
    const tabs = document.querySelectorAll('.pf-v5-c-tabs__link');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const page = tab.getAttribute('data-page');
            show_page(page);
        });
    });
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', (e) => {
        const page = get_page_from_hash();
        show_page(page, false);
    });
}

// Show specific page
export function show_page(page_name, update_history = true) {
    if (!page_name) page_name = 'overview';
    
    console.log("Showing page:", page_name);
    
    // Update tab highlighting
    const tabs = document.querySelectorAll('.pf-v5-c-tabs__link');
    tabs.forEach(tab => {
        tab.classList.remove('pf-v5-m-current');
        if (tab.getAttribute('data-page') === page_name) {
            tab.classList.add('pf-v5-m-current');
        }
    });
    
    // Show/hide page content
    const pages = document.querySelectorAll('.storage-page');
    pages.forEach(page => {
        if (page.getAttribute('data-page') === page_name) {
            page.style.display = 'block';
        } else {
            page.style.display = 'none';
        }
    });
    
    // Update browser history
    if (update_history) {
        const url = page_name === 'overview' ? '#' : '#' + page_name;
        history.pushState({ page: page_name }, '', url);
    }
    
    current_page = page_name;
    
    // Trigger page-specific refresh
    refresh_current_page();
}

// Get page name from URL hash
function get_page_from_hash() {
    const hash = window.location.hash.slice(1);
    return hash || 'overview';
}

// Refresh current page content
function refresh_current_page() {
    const event = new CustomEvent('storage-page-refresh', {
        detail: { page: current_page }
    });
    document.dispatchEvent(event);
}

// Get current page
export function get_current_page() {
    return current_page;
}

// Utility function to create storage sections
export function create_storage_section(title, icon, content_id) {
    return `
        <div class="storage-section">
            <div class="storage-section-header">
                <h3 class="storage-section-title">
                    <i class="fa ${icon}" aria-hidden="true"></i>
                    ${title}
                </h3>
            </div>
            <div class="storage-section-content" id="${content_id}">
                <!-- Content will be populated -->
            </div>
        </div>
    `;
}

// Utility function to show loading state
export function show_loading(container_id, message = "Loading...") {
    const container = document.getElementById(container_id);
    if (container) {
        container.innerHTML = `
            <div class="loading-container">
                <div class="pf-v5-c-spinner" role="progressbar">
                    <span class="pf-v5-c-spinner__clipper"></span>
                    <span class="pf-v5-c-spinner__lead-ball"></span>
                    <span class="pf-v5-c-spinner__tail-ball"></span>
                </div>
                <span class="loading-text">${message}</span>
            </div>
        `;
    }
}

// Utility function to show empty state
export function show_empty_state(container_id, icon, title, message, action_button = null) {
    const container = document.getElementById(container_id);
    if (container) {
        let button_html = '';
        if (action_button) {
            button_html = `
                <button class="btn btn-primary" onclick="${action_button.onclick}">
                    <i class="fa ${action_button.icon}" aria-hidden="true"></i>
                    ${action_button.text}
                </button>
            `;
        }
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa ${icon}" aria-hidden="true"></i>
                <h3>${title}</h3>
                <p>${message}</p>
                ${button_html}
            </div>
        `;
    }
}

// Utility function to show error state
export function show_error_state(container_id, title, message, retry_callback = null) {
    const container = document.getElementById(container_id);
    if (container) {
        let button_html = '';
        if (retry_callback) {
            button_html = `
                <button class="btn btn-primary" onclick="${retry_callback}">
                    <i class="fa fa-sync" aria-hidden="true"></i>
                    Retry
                </button>
            `;
        }
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-exclamation-triangle" aria-hidden="true"></i>
                <h3>${title}</h3>
                <p>${message}</p>
                ${button_html}
            </div>
        `;
    }
}
