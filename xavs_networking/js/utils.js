'use strict';
/* global cockpit */

// Basic startup log
console.log('XOS Networking starting...');

// Global error logging for easier debugging
window.addEventListener('error', (e) => {
  console.error('JavaScript Error:', e.error, e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled Promise Rejection:', e.reason);
});

// Wait for both DOM and Cockpit to be ready
function waitForReady() {
  return new Promise((resolve) => {
    let domReady = document.readyState === 'complete' || document.readyState === 'interactive';
    let cockpitReady = typeof cockpit !== 'undefined';

    // Checking initialization state

    if (domReady && cockpitReady) {
      const hasTableBody = !!document.querySelector('#table-interfaces tbody');
      const hasStatusEl = !!document.querySelector('#status');

      // Checking for required DOM elements

      if (hasTableBody && hasStatusEl) {
        resolve();
      } else {
        setTimeout(() => {
          // Retrying DOM element check
          resolve();
        }, 1000);
      }
    } else {
      if (!domReady) {
        // Waiting for DOM ready event
        document.addEventListener('DOMContentLoaded', () => {
          // DOM ready event fired
          if (typeof cockpit !== 'undefined') {
            setTimeout(resolve, 100);
          }
        });
      }

      if (!cockpitReady) {
        // Waiting for Cockpit API
        const checkCockpit = () => {
          if (typeof cockpit !== 'undefined') {
            setTimeout(resolve, 100);
          } else {
            setTimeout(checkCockpit, 100);
          }
        };
        setTimeout(checkCockpit, 100);
      }

      setTimeout(() => {
        // Fallback timeout reached, proceeding
        resolve();
      }, 5000);
    }
  });
}

// DOM helpers
const $ = (q, root = document) => {
  try {
    return root.querySelector(q);
  } catch (e) {
    console.warn('Selector error:', q, e);
    return null;
  }
};

const $$ = (q, root = document) => {
  try {
    return Array.from(root.querySelectorAll(q));
  } catch (e) {
    console.warn('Selector error:', q, e);
    return [];
  }
};

// Modal helper
function setupModal(modal) {
  if (!modal) {
    console.warn('setupModal called with null/undefined modal');
    return null;
  }

  const handleEscKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      modal.close();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === modal) {
      modal.close();
    }
  };

  modal.addEventListener('keydown', handleEscKey);
  modal.addEventListener('click', handleBackdropClick);

  modal.addEventListener('close', () => {
    modal.removeEventListener('keydown', handleEscKey);
    modal.removeEventListener('click', handleBackdropClick);

    if (modal.parentNode) {
      try {
        document.body.removeChild(modal);
        console.log('Modal cleaned up successfully');
      } catch (e) {
        console.warn('Failed to remove modal from DOM:', e);
      }
    }
  });

  modal.addEventListener('cancel', () => {
    console.log('Modal cancelled via ESC key or browser close button');
  });

  return modal;
}

function setStatus(msg) {
  const statusEl = $('#status');
  if (statusEl) {
    statusEl.textContent = msg || 'Ready';
    console.log('Status:', msg || 'Ready');
  }
}

// Validate IPv4 CIDR notation (e.g., 192.168.1.100/24)
function isValidCIDR(value) {
  if (!value || typeof value !== 'string') return false;
  const m = value.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) return false;
  const octets = m.slice(1, 5).map(Number);
  const mask = Number(m[5]);
  if (mask < 0 || mask > 32) return false;
  return octets.every(o => o >= 0 && o <= 255);
}

// Simple status badge; prefer ui-utils.createStatusBadge if available
function createStatusBadgeSimple(state) {
  const span = document.createElement('span');
  const s = (state || 'unknown').toUpperCase();
  span.className = 'badge ' + (s === 'UP' || s === 'CONNECTED' ? 'state-up'
                    : s === 'DOWN' || s === 'DISCONNECTED' ? 'state-down'
                    : 'state-unknown');
  span.textContent = s;
  return span;
}

// Expose helpers globally
window.waitForReady = waitForReady;
window.$ = $;
window.$$ = $$;
window.setupModal = setupModal;
window.setStatus = setStatus;
window.isValidCIDR = isValidCIDR;
// Only assign the simple badge if no richer implementation exists
if (typeof window.createStatusBadge !== 'function') {
  window.createStatusBadge = createStatusBadgeSimple;
}
// Always expose the simple variant explicitly for opt-in use
window.createStatusBadgeSimple = createStatusBadgeSimple;
