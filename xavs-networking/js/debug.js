'use strict';

/**
 * Debug utilities for XAVS Networking module
 * Helps identify common issues and provides debugging information
 */

// Debug function to check if all required elements are present
function debugElementCheck() {
    console.group('🔍 XAVS Networking Debug - Element Check');
    
    const requiredElements = [
        // Search elements
        { id: 'search-iface', name: 'Search Input' },
        { id: 'table-interfaces', name: 'Interfaces Table' },
        
        // VLAN elements
        { id: 'btn-create-vlan', name: 'Create VLAN Button' },
        { id: 'vlan-parent', name: 'VLAN Parent Select' },
        { id: 'vlan-id', name: 'VLAN ID Input' },
        { id: 'vlan-out', name: 'VLAN Output' },
        
        // Diagnostics elements
        { id: 'btn-ping', name: 'Ping Button' },
        { id: 'btn-traceroute', name: 'Traceroute Button' },
        { id: 'diag-host', name: 'Diagnostic Host Input' },
        { id: 'ping-out', name: 'Ping Output' },
        { id: 'routes-out', name: 'Routes Output' },
        { id: 'dns-out', name: 'DNS Output' },
        
        // Status elements
        { id: 'status', name: 'Status Element' },
        
        // Tab elements
        { class: 'nav-link', name: 'Tab Links', type: 'class' },
        { class: 'tab-pane', name: 'Tab Panels', type: 'class' }
    ];
    
    requiredElements.forEach(element => {
        if (element.type === 'class') {
            const elements = document.querySelectorAll(`.${element.class}`);
            console.log(`${elements.length > 0 ? '✅' : '❌'} ${element.name}:`, elements.length, 'found');
        } else {
            const el = document.getElementById(element.id);
            console.log(`${el ? '✅' : '❌'} ${element.name}:`, el ? 'Found' : 'Missing');
        }
    });
    
    console.groupEnd();
}

// Debug function to check if all required functions are available
function debugFunctionCheck() {
    console.group('🔍 XAVS Networking Debug - Function Check');
    
    const requiredFunctions = [
        'setupEvents',
        'setupEventHandlers', 
        'setupSearchAndFilters',
        'setupNetworkingForms',
        'loadInterfaces',
        'loadDiagnostics',
        'netplanAction',
        'getPhysicalInterfaces',
        'run',
        'setStatus',
        '$',
        '$$'
    ];
    
    requiredFunctions.forEach(funcName => {
        const func = window[funcName];
        console.log(`${func ? '✅' : '❌'} ${funcName}:`, typeof func);
    });
    
    console.groupEnd();
}

// Debug function to test basic functionality
function debugBasicTests() {
    console.group('🔍 XAVS Networking Debug - Basic Tests');
    
    // Test $ function
    try {
        const testEl = document.querySelector('body');
        const $testEl = window.$('body');
        console.log('✅ $ function works:', $testEl === testEl);
    } catch (e) {
        console.log('❌ $ function error:', e);
    }
    
    // Test $$ function
    try {
        const testEls = document.querySelectorAll('div');
        const $$testEls = window.$$('div');
        console.log('✅ $$ function works:', $$testEls.length === testEls.length);
    } catch (e) {
        console.log('❌ $$ function error:', e);
    }
    
    // Test if Cockpit is available
    console.log(`${typeof cockpit !== 'undefined' ? '✅' : '❌'} Cockpit API:`, typeof cockpit);
    
    console.groupEnd();
}

// Main debug function
function runDebugCheck() {
    console.log('🚀 Starting XAVS Networking Debug Check...');
    debugElementCheck();
    debugFunctionCheck();
    debugBasicTests();
    console.log('✅ Debug check complete! Check the console output above for any issues.');
}

// Test specific functionality
function testSearch() {
    console.log('🔍 Testing search functionality...');
    const searchInput = document.getElementById('search-iface');
    if (searchInput) {
        // Trigger a search
        searchInput.value = 'eth';
        searchInput.dispatchEvent(new Event('input'));
        console.log('✅ Search test triggered');
    } else {
        console.log('❌ Search input not found');
    }
}

function testVlanCreation() {
    console.log('🏷️ Testing VLAN creation form...');
    const vlanParent = document.getElementById('vlan-parent');
    const vlanId = document.getElementById('vlan-id');
    const createBtn = document.getElementById('btn-create-vlan');
    
    if (vlanParent && vlanId && createBtn) {
        console.log('✅ VLAN form elements found');
        console.log('VLAN parent options:', vlanParent.options.length);
    } else {
        console.log('❌ VLAN form elements missing:', {
            parent: !!vlanParent,
            id: !!vlanId,
            button: !!createBtn
        });
    }
}

function testDiagnostics() {
    console.log('🩺 Testing diagnostics functionality...');
    const pingBtn = document.getElementById('btn-ping');
    const tracerouteBtn = document.getElementById('btn-traceroute');
    const hostInput = document.getElementById('diag-host');
    const pingOut = document.getElementById('ping-out');
    
    if (pingBtn && tracerouteBtn && hostInput && pingOut) {
        console.log('✅ Diagnostics elements found');
    } else {
        console.log('❌ Diagnostics elements missing:', {
            pingBtn: !!pingBtn,
            tracerouteBtn: !!tracerouteBtn,
            hostInput: !!hostInput,
            pingOut: !!pingOut
        });
    }
}

// Export debug functions
window.debugNetworking = {
    runDebugCheck,
    debugElementCheck,
    debugFunctionCheck,
    debugBasicTests,
    testSearch,
    testVlanCreation,
    testDiagnostics
};

console.log('🔧 Debug utilities loaded. Run debugNetworking.runDebugCheck() to diagnose issues.');
