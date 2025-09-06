// ============================================================================
// BROWSER CONSOLE TEST COMMANDS for Comprehensive Configuration Preservation
// ============================================================================
// Copy and paste these commands in browser console to test the preservation system
// Location: /xavs_networking/js/console-test-commands.js

console.log("🧪 === COMPREHENSIVE PRESERVATION TEST COMMANDS ===");

// Test 1: Check current preservation function availability
console.log("📋 Test 1: Checking preservation function availability...");
if (typeof preserveExistingConfiguration === 'function') {
    console.log("✅ preserveExistingConfiguration function is available");
} else {
    console.log("❌ preserveExistingConfiguration function not found - check if netplan-js-manager.js loaded");
}

// Test 2: Enable verbose preservation logging
console.log("📋 Test 2: Enabling verbose logging...");
window.PRESERVATION_DEBUG = true;
console.log("✅ Verbose preservation logging enabled");

// Test 3: Check current netplan configuration
console.log("📋 Test 3: Loading current configuration...");
if (typeof loadNetplanConfig === 'function') {
    loadNetplanConfig().then(config => {
        console.log("✅ Current netplan config:", config);
        
        // Count interfaces with various properties
        let stats = {
            withIPs: 0,
            withMTU: 0,
            withVLANProps: 0,
            withBridgeProps: 0
        };
        
        ['vlans', 'ethernets', 'bridges', 'bonds'].forEach(section => {
            if (config.network && config.network[section]) {
                Object.keys(config.network[section]).forEach(ifName => {
                    const iface = config.network[section][ifName];
                    if (iface.addresses) stats.withIPs++;
                    if (iface.mtu) stats.withMTU++;
                    if (iface.id || iface.link) stats.withVLANProps++;
                    if (iface.stp !== undefined || iface.interfaces) stats.withBridgeProps++;
                });
            }
        });
        
        console.log("📊 Configuration Stats:", stats);
    }).catch(err => {
        console.error("❌ Failed to load config:", err);
    });
} else {
    console.log("❌ loadNetplanConfig function not available");
}

// Test 4: Manual preservation test
console.log("📋 Test 4: Manual preservation test function...");
window.testPreservation = async function() {
    console.log("🔧 Running manual preservation test...");
    
    try {
        // Load current config
        const currentConfig = await loadNetplanConfig();
        console.log("Current config loaded:", currentConfig);
        
        // Create a mock modification (add a test VLAN)
        const testConfig = JSON.parse(JSON.stringify(currentConfig));
        if (!testConfig.network.vlans) testConfig.network.vlans = {};
        
        // Add a test VLAN
        testConfig.network.vlans['test.999'] = {
            id: 999,
            link: 'eno1',
            dhcp4: true
        };
        
        console.log("Test config created with new VLAN");
        
        // Test the preservation function
        const preservedConfig = await preserveExistingConfiguration(testConfig);
        console.log("✅ Preservation completed:", preservedConfig);
        
        // Compare configs
        console.log("🔍 Comparing original vs preserved...");
        ['vlans', 'ethernets'].forEach(section => {
            if (currentConfig.network && currentConfig.network[section]) {
                Object.keys(currentConfig.network[section]).forEach(ifName => {
                    const original = currentConfig.network[section][ifName];
                    const preserved = preservedConfig.network[section] && preservedConfig.network[section][ifName];
                    
                    if (original && preserved) {
                        console.log(`Interface ${ifName}:`);
                        ['addresses', 'mtu', 'gateway4', 'id', 'link'].forEach(prop => {
                            if (original[prop]) {
                                const originalVal = JSON.stringify(original[prop]);
                                const preservedVal = JSON.stringify(preserved[prop]);
                                if (originalVal === preservedVal) {
                                    console.log(`  ✅ ${prop}: preserved (${originalVal})`);
                                } else {
                                    console.log(`  ❌ ${prop}: changed from ${originalVal} to ${preservedVal}`);
                                }
                            }
                        });
                    }
                });
            }
        });
        
    } catch (error) {
        console.error("❌ Preservation test failed:", error);
    }
};

console.log("✅ Test function created. Run: testPreservation()");

// Test 5: Monitor real operations
console.log("📋 Test 5: Setting up operation monitoring...");
window.monitorOperations = function() {
    // Override console.log to capture preservation logs
    const originalLog = console.log;
    console.log = function(...args) {
        const message = args.join(' ');
        if (message.includes('🔒') || message.includes('preservation') || message.includes('Preserving')) {
            originalLog.apply(console, ['🎯 PRESERVATION:', ...args]);
        } else {
            originalLog.apply(console, args);
        }
    };
    
    console.log("✅ Operation monitoring enabled - preservation logs will be highlighted");
};

// Test 6: Quick property check
console.log("📋 Test 6: Quick property check function...");
window.checkProperties = async function(interfaceName = 'eno3.1199') {
    try {
        const config = await loadNetplanConfig();
        
        // Find the interface
        let found = null;
        ['vlans', 'ethernets', 'bridges', 'bonds'].forEach(section => {
            if (config.network && config.network[section] && config.network[section][interfaceName]) {
                found = config.network[section][interfaceName];
            }
        });
        
        if (found) {
            console.log(`📋 Properties for ${interfaceName}:`);
            Object.keys(found).forEach(prop => {
                console.log(`  • ${prop}: ${JSON.stringify(found[prop])}`);
            });
        } else {
            console.log(`❌ Interface ${interfaceName} not found in netplan config`);
        }
    } catch (error) {
        console.error("❌ Property check failed:", error);
    }
};

console.log("✅ Property check function created. Run: checkProperties('eno3.1199')");

// Instructions
console.log(`
🎯 === HOW TO USE THESE TESTS ===

1. Run: testPreservation()
   - Tests the preservation function directly

2. Run: monitorOperations()
   - Enables monitoring of preservation logs during UI operations

3. Run: checkProperties('eno3.1199')
   - Shows all properties for a specific interface

4. Perform UI operations (change IP, MTU, add VLAN, etc.)
   - Watch for preservation logs in console

5. Look for these log patterns:
   ✅ "🔒 Starting comprehensive network configuration preservation"
   ✅ "🔒 Preserving [property] for [interface]: [value]"
   ✅ "🔒 Comprehensive Configuration Preservation Summary"
   ✅ "Properties preserved: addresses, mtu, gateway4, id, link"

6. Expected behavior:
   - All unmodified interfaces keep their properties
   - Preservation logs show what was kept vs changed
   - No unexpected property loss

❌ Signs of problems:
   - Missing preservation logs
   - Properties lost from unmodified interfaces
   - Console errors during preservation

Happy testing! 🚀
`);
