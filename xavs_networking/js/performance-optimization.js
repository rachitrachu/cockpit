'use strict';

/**
 * Performance optimization to prevent multiple simultaneous interface loading
 */

let interfaceLoadingInProgress = false;
let lastInterfaceLoadTime = 0;
const INTERFACE_LOAD_DEBOUNCE_MS = 2000; // 2 seconds

// Store the original functions
const originalSetupNetworkingForms = window.setupNetworkingForms;
const originalGetPhysicalInterfaces = window.getPhysicalInterfaces;

/**
 * Debounced version of setupNetworkingForms
 */
function debouncedSetupNetworkingForms() {
  const now = Date.now();
  
  // If we just loaded interfaces recently, skip
  if (now - lastInterfaceLoadTime < INTERFACE_LOAD_DEBOUNCE_MS) {
    console.log('⏭️ Skipping setupNetworkingForms - debounced');
    return Promise.resolve();
  }
  
  // If already in progress, skip
  if (interfaceLoadingInProgress) {
    console.log('⏭️ Skipping setupNetworkingForms - already in progress');
    return Promise.resolve();
  }
  
  interfaceLoadingInProgress = true;
  lastInterfaceLoadTime = now;
  
  console.log('🚀 Running setupNetworkingForms (debounced)');
  
  return originalSetupNetworkingForms().finally(() => {
    interfaceLoadingInProgress = false;
  });
}

/**
 * Cached version of getPhysicalInterfaces
 */
let cachedInterfaces = null;
let lastInterfaceCacheTime = 0;
const INTERFACE_CACHE_TTL_MS = 5000; // 5 seconds cache

function cachedGetPhysicalInterfaces() {
  const now = Date.now();
  
  // Return cached version if still valid
  if (cachedInterfaces && (now - lastInterfaceCacheTime < INTERFACE_CACHE_TTL_MS)) {
    console.log('🎯 Using cached physical interfaces:', cachedInterfaces.length);
    return Promise.resolve(cachedInterfaces);
  }
  
  console.log('🔄 Loading fresh physical interfaces');
  return originalGetPhysicalInterfaces().then(interfaces => {
    cachedInterfaces = interfaces;
    lastInterfaceCacheTime = now;
    return interfaces;
  });
}

// Replace the global functions with optimized versions
window.setupNetworkingForms = debouncedSetupNetworkingForms;
window.getPhysicalInterfaces = cachedGetPhysicalInterfaces;

// Function to clear cache when needed
window.clearInterfaceCache = function() {
  console.log('🧹 Clearing interface cache');
  cachedInterfaces = null;
  lastInterfaceCacheTime = 0;
  interfaceLoadingInProgress = false;
};

// Function to force reload interfaces
window.forceReloadInterfaces = function() {
  console.log('🔄 Force reloading interfaces');
  window.clearInterfaceCache();
  return window.setupNetworkingForms();
};

console.log('⚡ Performance optimizations loaded - interface loading debounced and cached');
