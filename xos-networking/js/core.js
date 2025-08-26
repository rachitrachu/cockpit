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

  // Symbol helper functions for cross-browser compatibility
  function getSymbol(type) {
    const symbols = {
      check: '\u2713',      // ?
      cross: '\u2717',      // ?
      tick: '\u2713',       // ?
      cancel: '\u2717',     // ?
      success: '\u2713',    // ? (using check mark instead of emoji)
      error: '\u2717',      // ? (using X instead of emoji)
      warning: '\u26A0',    // ?
      info: '\u2139',       // ?
      ok: '\u2713',         // ?
      fail: '\u2717'        // ?
    };
    
    // Fallback for systems with poor Unicode support
    const fallbacks = {
      check: '[OK]',
      cross: '[X]',
      tick: '[OK]', 
      cancel: '[X]',
      success: '[SUCCESS]',
      error: '[ERROR]',
      warning: '[WARNING]',
      info: '[INFO]',
      ok: '[OK]',
      fail: '[FAIL]'
    };
    
    // Test if Unicode symbols are supported by creating a test element
    function testUnicodeSupport() {
      const testElement = document.createElement('span');
      testElement.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;font-family:"Segoe UI Symbol","Symbola","DejaVu Sans",serif;';
      testElement.innerHTML = '&check;'; // HTML entity for check mark
      document.body.appendChild(testElement);
      
      const rect = testElement.getBoundingClientRect();
      const hasWidth = rect.width > 0;
      document.body.removeChild(testElement);
      
      return hasWidth;
    }
    
    const supportsUnicode = testUnicodeSupport();
    console.log('Unicode support detected:', supportsUnicode);
    
    return supportsUnicode ? (symbols[type] || type) : (fallbacks[type] || `[${type.toUpperCase()}]`);
  }
  
  // Create element with reliable symbol using HTML entities
  function createSymbolElement(type, className = '') {
    const element = document.createElement('span');
    element.className = `symbol symbol-${type} unicode-symbol ${className}`.trim();
    
    // Use HTML entities for better compatibility
    const htmlEntities = {
      check: '&#10003;',    // ?
      cross: '&#10007;',    // ?
      tick: '&#10003;',     // ?
      cancel: '&#10007;',   // ?
      success: '&#10003;',  // ?
      error: '&#10007;',    // ?
      warning: '&#9888;',   // ?
      info: '&#8505;',      // ?
      ok: '&#10003;',       // ?
      fail: '&#10007;'      // ?
    };
    
    if (htmlEntities[type]) {
      element.innerHTML = htmlEntities[type];
    } else {
      element.textContent = getSymbol(type);
    }
    
    return element;
  }

  // Create message with symbol - using HTML entities when possible
  function createSymbolMessage(type, message) {
    const htmlEntities = {
      check: '&#10003;',
      cross: '&#10007;',
      success: '&#10003;',
      error: '&#10007;',
      warning: '&#9888;',
      info: '&#8505;'
    };
    
    // Create a temporary element to convert HTML entity to text
    if (htmlEntities[type]) {
      const temp = document.createElement('div');
      temp.innerHTML = htmlEntities[type];
      const symbol = temp.textContent || temp.innerText || getSymbol(type);
      return `${symbol} ${message}`;
    }
    
    return `${getSymbol(type)} ${message}`;
  }
  
  // Alternative function that creates SVG icons as fallback
  function createSVGSymbol(type, size = '1em') {
    const svg = document.createElement('span');
    svg.className = `icon-svg ${type}`;
    svg.style.width = size;
    svg.style.height = size;
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';
    
    const svgContent = {
      check: `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="#28a745"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`,
      cross: `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="#dc3545"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>`,
      warning: `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="#ffc107"><path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>`
    };
    
    if (svgContent[type]) {
      svg.innerHTML = svgContent[type];
    } else {
      svg.textContent = getSymbol(type);
    }
    
    return svg;
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
    setupErrorHandlers,
    getSymbol,
    createSymbolElement,
    createSymbolMessage,
    createSVGSymbol
  };

})();