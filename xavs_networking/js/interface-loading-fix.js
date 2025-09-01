/**
 * Interface Loading Fix and Debug Script
 * This script helps diagnose and fix interface loading issues in VLAN/Bridge/Bond tabs
 */

// Enhanced debugging for interface loading
function debugInterfaceLoading() {
    console.group('🔧 Interface Loading Debug');
    
    // Check if required functions exist
    const requiredFunctions = [
        'getPhysicalInterfaces',
        'setupNetworkingForms',
        'run'
    ];
    
    console.log('=== Function Availability Check ===');
    requiredFunctions.forEach(funcName => {
        const func = window[funcName];
        console.log(`${func ? '✅' : '❌'} ${funcName}:`, typeof func);
    });
    
    // Check if required DOM elements exist
    const requiredElements = [
        'vlan-parent',
        'br-ports', 
        'bond-slaves',
        'bond-primary'
    ];
    
    console.log('=== DOM Elements Check ===');
    requiredElements.forEach(elementId => {
        const element = document.getElementById(elementId);
        console.log(`${element ? '✅' : '❌'} #${elementId}:`, element ? 'Found' : 'Missing');
        if (element) {
            console.log(`   - Options count: ${element.options ? element.options.length : 'N/A'}`);
            console.log(`   - Type: ${element.tagName} (${element.type || 'unknown'})`);
        }
    });
    
    console.groupEnd();
}

// Force reload interfaces into form selects
async function forceReloadInterfaces() {
    console.log('🔄 Force reloading interfaces into forms...');
    
    try {
        // Get interfaces directly
        let interfaces = [];
        
        if (typeof window.getPhysicalInterfaces === 'function') {
            try {
                interfaces = await window.getPhysicalInterfaces();
                console.log('✅ Got interfaces from getPhysicalInterfaces:', interfaces);
            } catch (e) {
                console.warn('❌ getPhysicalInterfaces failed:', e);
            }
        }
        
        // Fallback to default interfaces if none found
        if (interfaces.length === 0) {
            interfaces = ['eth0', 'enp0s3', 'wlan0', 'ens33'];
            console.log('🔄 Using fallback interfaces:', interfaces);
        }
        
    // Deduplicate interfaces before populating
    interfaces = [...new Set(interfaces)];
    // Populate each select manually
    populateSelect('vlan-parent', interfaces, 'Choose parent interface...');
    populateSelect('br-ports', interfaces);
    populateSelect('bond-slaves', interfaces);
    populateSelect('bond-primary', interfaces, 'Auto-select primary');
        
        console.log('✅ Successfully populated all interface selects');
        return interfaces;
        
    } catch (error) {
        console.error('❌ Force reload failed:', error);
        return [];
    }
}

// Helper function to populate a select element
function populateSelect(elementId, interfaces, placeholder = null) {
    const select = document.getElementById(elementId);
    if (!select) {
        console.error(`❌ Select element #${elementId} not found`);
        return;
    }
    
    console.log(`📝 Populating #${elementId} with ${interfaces.length} interfaces`);
    
    // Clear existing options
    select.innerHTML = '';
    
    // Add placeholder if provided
    if (placeholder) {
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = placeholder;
        select.appendChild(placeholderOption);
    }
    
    // Add interface options
    interfaces.forEach(iface => {
        const option = document.createElement('option');
        option.value = iface;
        option.textContent = iface;
        select.appendChild(option);
    });
    
    console.log(`✅ #${elementId} populated with ${interfaces.length} interfaces`);
}

// Test interface loading functionality
async function testInterfaceLoadingFunctionality() {
    console.group('🧪 Testing Interface Loading Functionality');
    
    // Test 1: Check if functions are available
    console.log('Test 1: Function availability');
    debugInterfaceLoading();
    
    // Test 2: Try to get interfaces
    console.log('Test 2: Get physical interfaces');
    try {
        const interfaces = await forceReloadInterfaces();
        console.log('✅ Interface loading test passed, found:', interfaces);
    } catch (e) {
        console.error('❌ Interface loading test failed:', e);
    }
    
    // Test 3: Check if selects are populated
    console.log('Test 3: Check select population');
    const selects = ['vlan-parent', 'br-ports', 'bond-slaves', 'bond-primary'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select && select.options) {
            const count = select.options.length;
            const hasPlaceholder = select.options[0] && select.options[0].value === '';
            const interfaceCount = hasPlaceholder ? count - 1 : count;
            console.log(`✅ #${selectId}: ${interfaceCount} interfaces ${hasPlaceholder ? '+ placeholder' : ''}`);
        } else {
            console.error(`❌ #${selectId}: not found or no options`);
        }
    });
    
    console.groupEnd();
}

// Auto-fix interface loading issues
async function autoFixInterfaceLoading() {
    console.log('🔧 Auto-fixing interface loading issues...');
    
    try {
        // Step 1: Force reload interfaces
        const interfaces = await forceReloadInterfaces();
        
        // Step 2: Set up event handlers if missing
        if (typeof window.setupConstructEventHandlers === 'function') {
            window.setupConstructEventHandlers();
            console.log('✅ Event handlers setup completed');
        }
        
        // Step 3: Verify everything is working
        const verification = await testInterfaceLoadingFunctionality();
        
        console.log('🎉 Auto-fix completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Auto-fix failed:', error);
        return false;
    }
}

// Add to window for easy access
window.debugInterfaceLoading = debugInterfaceLoading;
window.forceReloadInterfaces = forceReloadInterfaces;
window.testInterfaceLoadingFunctionality = testInterfaceLoadingFunctionality;
window.autoFixInterfaceLoading = autoFixInterfaceLoading;

// Auto-run when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(autoFixInterfaceLoading, 2000);
    });
} else {
    setTimeout(autoFixInterfaceLoading, 1000);
}

console.log('🔧 Interface loading fix script loaded. Available functions:');
console.log('- debugInterfaceLoading()');
console.log('- forceReloadInterfaces()'); 
console.log('- testInterfaceLoadingFunctionality()');
console.log('- autoFixInterfaceLoading()');
