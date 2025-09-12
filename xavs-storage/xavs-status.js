// XAVS Storage Status and Log Management
// This script handles the status bar, logging, and XAVS-specific UI interactions

(function() {
    'use strict';

    // Status management
    let recentActivity = document.getElementById('recent-activity');
    let statusPanel = document.getElementById('status_panel');
    let viewLogsBtn = document.getElementById('view-logs-btn');

    // Activity log
    let activityLog = [];
    let maxLogEntries = 100;

    // Update status message
    function updateStatus(message, type = 'info') {
        if (recentActivity) {
            recentActivity.textContent = message;
            activityLog.unshift({
                timestamp: new Date(),
                message: message,
                type: type
            });
            
            // Keep log size manageable
            if (activityLog.length > maxLogEntries) {
                activityLog = activityLog.slice(0, maxLogEntries);
            }
        }
    }

    // Show status panel with message
    function showStatusPanel(message, type = 'info') {
        if (statusPanel) {
            statusPanel.className = `alert alert-${type}`;
            statusPanel.textContent = message;
            statusPanel.style.display = 'block';
            
            // Auto-hide after 5 seconds for non-error messages
            if (type !== 'danger') {
                setTimeout(() => {
                    statusPanel.style.display = 'none';
                }, 5000);
            }
        }
    }

    // Hide status panel
    function hideStatusPanel() {
        if (statusPanel) {
            statusPanel.style.display = 'none';
        }
    }

    // Show logs modal
    function showLogsModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('logs-modal');
        if (!modal) {
            modal = createLogsModal();
        }
        
        // Update log content
        updateLogsContent();
        
        // Show modal
        modal.style.display = 'flex';
    }

    // Create logs modal
    function createLogsModal() {
        const modal = document.createElement('div');
        modal.id = 'logs-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h5 class="mb-0">
                            <i class="fas fa-list"></i> Storage Activity Log
                        </h5>
                        <button type="button" class="btn btn-sm btn-outline-brand" id="close-logs-modal">
                            <i class="fas fa-times"></i> Close
                        </button>
                    </div>
                    <div id="logs-content" class="yaml-terminal" style="max-height: 400px; overflow-y: auto;">
                        Loading logs...
                    </div>
                </div>
                <div class="modal-foot">
                    <button type="button" class="btn btn-outline-brand" id="clear-logs-btn">
                        <i class="fas fa-trash"></i> Clear Logs
                    </button>
                    <button type="button" class="btn btn-brand" id="refresh-logs-btn">
                        <i class="fas fa-sync"></i> Refresh
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add event listeners
        modal.querySelector('#close-logs-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        modal.querySelector('#clear-logs-btn').addEventListener('click', () => {
            activityLog = [];
            updateLogsContent();
            updateStatus('Logs cleared', 'info');
        });
        
        modal.querySelector('#refresh-logs-btn').addEventListener('click', () => {
            updateLogsContent();
            updateStatus('Logs refreshed', 'info');
        });
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        return modal;
    }

    // Update logs content
    function updateLogsContent() {
        const logsContent = document.getElementById('logs-content');
        if (!logsContent) return;
        
        if (activityLog.length === 0) {
            logsContent.textContent = 'No recent activity';
            return;
        }
        
        const logText = activityLog.map(entry => {
            const timestamp = entry.timestamp.toLocaleString();
            const type = entry.type.toUpperCase().padEnd(7);
            return `[${timestamp}] ${type} ${entry.message}`;
        }).join('\n');
        
        logsContent.textContent = logText;
    }

    // Initialize tooltips for help
    function initializeTooltips() {
        const helpElement = document.querySelector('.help');
        if (helpElement) {
            helpElement.addEventListener('click', (e) => {
                e.preventDefault();
                const tip = helpElement.getAttribute('data-tip');
                showStatusPanel(tip, 'info');
            });
        }
    }

    // Initialize storage-specific functionality
    function initializeStorage() {
        updateStatus('Initializing XAVS Storage...', 'info');
        
        // Simulate loading process
        setTimeout(() => {
            updateStatus('Storage services loaded', 'success');
        }, 1000);
        
        setTimeout(() => {
            updateStatus('Scanning storage devices...', 'info');
        }, 2000);
        
        setTimeout(() => {
            updateStatus('Ready', 'success');
        }, 3000);
    }

    // Initialize when DOM is ready
    function initialize() {
        console.log('XAVS Storage: Initializing status management');
        
        // Set up event listeners
        if (viewLogsBtn) {
            viewLogsBtn.addEventListener('click', showLogsModal);
        }
        
        // Initialize tooltips
        initializeTooltips();
        
        // Initialize storage
        initializeStorage();
        
        console.log('XAVS Storage: Status management initialized');
    }

    // Start initialization when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Expose functions for use by storaged.js
    window.xavsStorage = {
        updateStatus: updateStatus,
        showStatusPanel: showStatusPanel,
        hideStatusPanel: hideStatusPanel,
        showLogsModal: showLogsModal
    };

})();
