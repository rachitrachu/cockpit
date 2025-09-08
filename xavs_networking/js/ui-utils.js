/**
 * UI Utilities for XAVS Networking
 * Common UI functions and helpers
 */

const UIUtils = {
  
  // Show/hide loading states
  showLoading(element, message = 'Loading...') {
    if (element) {
      element.classList.add('loading');
      if (element.querySelector('.loading-text')) {
        element.querySelector('.loading-text').textContent = message;
      }
    }
  },
  
  hideLoading(element) {
    if (element) {
      element.classList.remove('loading');
    }
  },
  
  // Display messages
  showMessage(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Could implement toast notifications here
  },
  
  // Update status
  updateStatus(message, detail = '') {
    if (typeof updateStatus === 'function') {
      updateStatus(message, detail);
    }
  }
  
};

// Export to global scope
window.UIUtils = UIUtils;