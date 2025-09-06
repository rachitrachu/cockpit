// Browser Console Test Commands for Network Configuration Preservation
// Open Cockpit UI, go to Network page, open browser developer tools (F12), paste these commands:

console.log("🧪 Testing Network Configuration Preservation System");

// Test 1: Check current preservation function exists
if (typeof preserveExistingConfiguration === 'function') {
    console.log("✅ Preservation function available");
} else {
    console.log("❌ Preservation function not found");
}

// Test 2: Load current config and see what's preserved
async function testConfigLoad() {
    try {
        console.log("🔍 Loading current configuration...");
        const config = await loadNetplanConfig();
        console.log("Current config:", config);
        
        // Show interfaces with properties
        if (config.network) {
            for (const sectionType of ['vlans', 'ethernets', 'bridges', 'bonds']) {
                if (config.network[sectionType]) {
                    console.log(`📋 ${sectionType}:`, config.network[sectionType]);
                }
            }
        }
    } catch (error) {
        console.error("❌ Config load failed:", error);
    }
}

// Test 3: Simulate preservation on a test config
async function testPreservation() {
    try {
        console.log("🧪 Testing preservation logic...");
        
        // Create a minimal test config that would normally lose properties
        const testConfig = {
            network: {
                version: 2,
                vlans: {
                    'eno3.1199': {
                        id: 1199,
                        link: 'eno3',
                        addresses: ['192.168.0.100/24']  // New IP only
                    }
                }
            }
        };
        
        console.log("Test config (before preservation):", testConfig);
        
        // Apply preservation
        const preserved = await preserveExistingConfiguration(testConfig);
        console.log("Test config (after preservation):", preserved);
        
        // Check if existing properties were preserved
        if (preserved.network && preserved.network.vlans) {
            for (const ifName in preserved.network.vlans) {
                const iface = preserved.network.vlans[ifName];
                console.log(`Interface ${ifName} properties:`, Object.keys(iface));
            }
        }
        
    } catch (error) {
        console.error("❌ Preservation test failed:", error);
    }
}

// Test 4: Monitor actual UI operations
function monitorOperations() {
    console.log("🔍 Monitoring network operations...");
    console.log("Now perform a UI operation (change IP, add VLAN, etc.) and watch the console for preservation logs");
    console.log("Look for messages starting with '🔒' indicating what properties were preserved");
}

// Run the tests
console.log("Running preservation tests...");
testConfigLoad();
setTimeout(() => testPreservation(), 2000);
setTimeout(() => monitorOperations(), 4000);

// Helper function to check specific interface
function checkInterface(interfaceName) {
    console.log(`🔍 Checking interface: ${interfaceName}`);
    loadNetplanConfig().then(config => {
        if (config.network) {
            for (const sectionType of ['vlans', 'ethernets', 'bridges', 'bonds']) {
                if (config.network[sectionType] && config.network[sectionType][interfaceName]) {
                    console.log(`Found ${interfaceName} in ${sectionType}:`, config.network[sectionType][interfaceName]);
                    return;
                }
            }
        }
        console.log(`❌ Interface ${interfaceName} not found`);
    });
}

// Usage examples:
// checkInterface('eno3.1199');
// checkInterface('eno4.1199');
