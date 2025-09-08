/*
 * XAVS Storage Partitions Page
 * Manages disk partitions
 */

import { client } from './client.js';
import * as utils from './utils.js';
import { show_loading, show_empty_state } from './pages.js';

let partitions_initialized = false;

export function init_partitions() {
    if (partitions_initialized) return;
    
    console.log("Initializing partitions page...");
    
    const page_container = document.getElementById('page-partitions');
    if (page_container) {
        page_container.innerHTML = `
            <div class="storage-section">
                <div class="storage-section-header">
                    <h3 class="storage-section-title">
                        <i class="fa fa-th-large" aria-hidden="true"></i>
                        Disk Partitions
                    </h3>
                </div>
                <div class="storage-section-content">
                    <div class="empty-state">
                        <i class="fa fa-th-large" aria-hidden="true"></i>
                        <h3>Partition Management</h3>
                        <p>Partition management functionality will be available in a future version.</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    partitions_initialized = true;
}
