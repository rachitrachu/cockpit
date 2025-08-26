/* XOS Networking - Core Utilities and Helpers */
/* global cockpit */

// Core utility functions and DOM helpers
window.XOSNetworking = window.XOSNetworking || {};

(() => {
  'use strict';

  // DOM Query selectors with error handling
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

  // Status management
  function setStatus(msg) { 
    const statusEl = $('#status');
    if (statusEl) {
      statusEl.textContent = msg || 'Ready'; 
      console.log('Status:', msg || 'Ready');
    }
  }

  // Wait for both DOM and Cockpit to be ready
  function waitForReady() {
    return new Promise((resolve) => {
      let domReady = document.readyState === 'complete' || document.readyState === 'interactive';
      let cockpitReady = typeof cockpit !== 'undefined';
      
      console.log('Wait check - DOM ready:', domReady, 'Cockpit ready:', cockpitReady);
      
      if (domReady && cockpitReady) {
        // Double check that key DOM elements exist
        const hasTableBody = !!document.querySelector('#table-interfaces tbody');
        const hasStatusEl = !!document.querySelector('#status');
        
        console.log('DOM elements check - table:', hasTableBody, 'status:', hasStatusEl);
        
        if (hasTableBody && hasStatusEl) {
          resolve();
        } else {
          // Wait a bit more for DOM elements to be available
          setTimeout(() => {
            console.log('DOM elements retry check...');
            resolve();
          }, 1000);
        }
      } else {
        // Wait for DOM
        if (!domReady) {
          console.log('Waiting for DOM ready event...');
          document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM ready event fired');
            if (typeof cockpit !== 'undefined') {
              setTimeout(resolve, 100);
            }
          });
        }
        
        // Wait for Cockpit
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
        
        // Fallback timeout
        setTimeout(() => {
          console.log('Fallback timeout reached, proceeding...');
          resolve();
        }, 5000);
      }
    });
  }

  // Robust spawn wrapper
  async function run(cmd, args = [], opts = {}) {
    try {
      console.log('Running command:', cmd, args);
      setStatus(`Running ${cmd}...`);
      
      if (typeof cockpit === 'undefined') {
        throw new Error('Cockpit API not available');
      }
      
      const proc = cockpit.spawn([cmd, ...args], {
        superuser: "try",
        err: "out",
        ...opts
      });
      
      let out = "";
      proc.stream(d => out += d);
      await proc;
      
      console.log(`Command ${cmd} completed, output length:`, out.length);
      return out.trim();
      
    } catch (e) {
      console.error(`Command failed: ${cmd}`, e);
      setStatus('');
      throw e.toString();
    }
  }

  // Create button with async handler and loading state
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

  // Create status badge for interface states
  function createStatusBadge(state) {
    const span = document.createElement('span');
    const s = (state || 'unknown').toUpperCase();
    span.className = 'badge ' + (s === 'UP' || s === 'CONNECTED' ? 'state-up'
                      : s === 'DOWN' || s === 'DISCONNECTED' ? 'state-down'
                      : 'state-unknown');
    span.textContent = s;
    return span;
  }

  // Get physical interfaces for dropdowns (filters out virtual interfaces)
  async function getPhysicalInterfaces() {
    try {
      const output = await run('ip', ['-o', 'link', 'show']);
      const interfaces = [];
      
      output.split('\n').forEach(line => {
        const match = line.match(/^\d+:\s+([^:]+):/);
        if (match) {
          const dev = match[1].trim();
          // Skip virtual and special interfaces
          if (dev !== 'lo' && 
              !dev.startsWith('virbr') && 
              !dev.startsWith('docker') && 
              !dev.startsWith('veth') && 
              !dev.startsWith('bond') && 
              !dev.startsWith('br') && 
              !dev.includes('.') &&
              !dev.startsWith('tun') &&
              !dev.startsWith('tap')) {
            interfaces.push(dev);
          }
        }
      });
      
      return interfaces.sort();
    } catch (e) {
      console.error('Failed to get physical interfaces:', e);
      return [];
    }
  }

  // Setup tab functionality
  function setupTabs() {
    const tabs = $$('.tab');
    const panels = $$('.tab-panel');
    
    console.log('Found', tabs.length, 'tabs and', panels.length, 'panels');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.dataset.tab;
        console.log('Tab clicked:', targetId);
        
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active panel
        panels.forEach(p => p.classList.remove('active'));
        const targetPanel = $(`#tab-${targetId}`);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  // Global error handling
  function setupErrorHandlers() {
    window.addEventListener('error', (e) => {
      console.error('JavaScript Error:', e.error, e.filename, e.lineno);
    });
    
    window.addEventListener('unhandledrejection', (e) => {
      console.error('Unhandled Promise Rejection:', e.reason);
    });
  }

  // Export core functions
  window.XOSNetworking.core = {
    $,
    $$,
    setStatus,
    waitForReady,
    run,
    createButton,
    createStatusBadge,
    getPhysicalInterfaces,
    setupTabs,
    setupErrorHandlers
  };

})();