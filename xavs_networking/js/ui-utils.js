'use strict';

/**
 * UI Utilities for XAVS Networking module
 * Provides common UI functions for status badges, buttons, and animations
 */

/**
 * Create a status badge based on interface state
 * @param {string} state - Interface state (up, down, dormant, etc.)
 * @param {string} text - Display text for the badge
 * @returns {HTMLElement} Badge element
 */
function createStatusBadge(state, text) {
    const badge = document.createElement('span');
    badge.className = `badge ${state.toLowerCase()}`;
    badge.textContent = text || state;
    
    // Add appropriate icon based on state
    const icon = document.createElement('i');
    switch (state.toLowerCase()) {
        case 'up':
            icon.className = 'fas fa-arrow-up';
            badge.classList.add('up');
            break;
        case 'down':
            icon.className = 'fas fa-arrow-down';
            badge.classList.add('down');
            break;
        case 'dormant':
            icon.className = 'fas fa-pause';
            badge.classList.add('dormant');
            break;
        default:
            icon.className = 'fas fa-question';
            break;
    }
    
    badge.prepend(icon, ' ');
    return badge;
}

/**
 * Create an action button with icon
 * @param {string} text - Button text
 * @param {string} icon - Icon HTML or FontAwesome class
 * @param {function} onClick - Click handler function
 * @param {string} buttonType - Button type for styling (default, state-up, state-down, etc.)
 * @returns {HTMLElement} Button element
 */
function createActionButton(text, icon, onClick = null, buttonType = 'default') {
    const button = document.createElement('button');
    button.className = `action-btn btn-${buttonType}`;
    button.setAttribute('type', 'button');
    button.setAttribute('title', `${text}`); // Tooltip for accessibility
    
    // Handle both HTML icons and CSS classes
    let iconHTML = icon;
    if (icon && !icon.includes('<') && !icon.includes('⚬') && !icon.includes('✎') && !icon.includes('🗑')) {
        // Assume it's a FontAwesome class
        iconHTML = `<i class="${icon}"></i>`;
    }
    
    button.innerHTML = `
        <span class="btn-icon">${iconHTML}</span>
        <span class="btn-text">${text}</span>
    `;
    
    if (onClick && typeof onClick === 'function') {
        button.addEventListener('click', async (event) => {
            // Add loading state
            const originalHTML = button.innerHTML;
            button.classList.add('loading');
            button.disabled = true;
            
            try {
                await onClick(event);
            } catch (error) {
                console.error('Action button error:', error);
            } finally {
                // Remove loading state
                button.classList.remove('loading');
                button.disabled = false;
                button.innerHTML = originalHTML;
            }
        });
    }
    
    return button;
}

/**
 * Show a toast notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - Display duration in milliseconds
 */
function showToast(message, type = 'info', duration = 3000) {
    // Remove existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    
    const icon = document.createElement('i');
    switch (type) {
        case 'success':
            icon.className = 'fas fa-check-circle';
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle';
            break;
        case 'warning':
            icon.className = 'fas fa-exclamation-triangle';
            break;
        default:
            icon.className = 'fas fa-info-circle';
            break;
    }
    
    toast.appendChild(icon);
    toast.appendChild(document.createTextNode(` ${message}`));
    
    // Add toast styles if not already present
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 16px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 1000;
                min-width: 300px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                animation: slideInRight 0.3s ease-out;
            }
            
            .toast-success { background: var(--network-success, #059669); }
            .toast-error { background: var(--network-danger, #dc2626); }
            .toast-warning { background: var(--network-warning, #d97706); }
            .toast-info { background: var(--network-info, #0891b2); }
            
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(100%);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            @keyframes slideOutRight {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(100%);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * Add loading spinner to element
 * @param {HTMLElement} element - Element to add spinner to
 * @param {string} text - Loading text
 */
function addLoadingSpinner(element, text = 'Loading...') {
    const originalContent = element.innerHTML;
    element.dataset.originalContent = originalContent;
    
    const spinner = document.createElement('i');
    spinner.className = 'fas fa-spinner fa-spin';
    
    element.innerHTML = '';
    element.appendChild(spinner);
    element.appendChild(document.createTextNode(` ${text}`));
    element.disabled = true;
}

/**
 * Remove loading spinner from element
 * @param {HTMLElement} element - Element to remove spinner from
 */
function removeLoadingSpinner(element) {
    if (element.dataset.originalContent) {
        element.innerHTML = element.dataset.originalContent;
        delete element.dataset.originalContent;
    }
    element.disabled = false;
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Debounce function to limit rapid calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Simple event emitter for module communication
 */
class EventEmitter {
    constructor() {
        this.events = {};
    }
    
    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }
    
    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(data));
        }
    }
    
    off(event, callback) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        }
    }
}

// Global event emitter for the module
window.networkingEvents = new EventEmitter();

// Export utilities (avoid overwriting if another module already defined them)
window.debounce = window.debounce || debounce;
window.createActionButton = window.createActionButton || createActionButton;
// Prefer existing createStatusBadge (e.g., from utils.js) and only set if not already defined
window.createStatusBadge = window.createStatusBadge || createStatusBadge;
window.showToast = window.showToast || showToast;
window.addLoadingSpinner = window.addLoadingSpinner || addLoadingSpinner;
window.removeLoadingSpinner = window.removeLoadingSpinner || removeLoadingSpinner;
window.formatBytes = window.formatBytes || formatBytes;
