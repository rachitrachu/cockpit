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

    console.log('Wait check - DOM ready:', domReady, 'Cockpit ready:', cockpitReady);

    if (domReady && cockpitReady) {
      const hasTableBody = !!document.querySelector('#table-interfaces tbody');
      const hasStatusEl = !!document.querySelector('#status');

      console.log('DOM elements check - table:', hasTableBody, 'status:', hasStatusEl);

      if (hasTableBody && hasStatusEl) {
        resolve();
      } else {
        setTimeout(() => {
          console.log('DOM elements retry check...');
          resolve();
        }, 1000);
      }
    } else {
      if (!domReady) {
        console.log('Waiting for DOM ready event...');
        document.addEventListener('DOMContentLoaded', () => {
          console.log('DOM ready event fired');
          if (typeof cockpit !== 'undefined') {
            setTimeout(resolve, 100);
          }
        });
      }

      if (!cockpitReady) {
        console.log('Waiting for Cockpit API...');
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
        console.log('Fallback timeout reached, proceeding...');
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

function createButton(label, handler, className = 'btn') {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = className;

  btn.addEventListener('click', async () => {
    const originalText = btn.textContent;
    try {
      btn.disabled = true;
      btn.textContent = 'Loading...';
      await handler();
    } catch (e) {
      console.error(`${label} failed:`, e);
      alert(`${label} failed:\n${e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  return btn;
}

function createStatusBadge(state) {
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
window.createButton = createButton;
window.createStatusBadge = createStatusBadge;
