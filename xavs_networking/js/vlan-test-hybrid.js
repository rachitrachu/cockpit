// Hybrid Windows->Linux VLAN Testing Script
// Load this in your browser console while connected to Linux cockpit

window.VlanTestSuite = {
    
    // Enhanced debug mode with SSH correlation
    enableDebugMode: function() {
        console.log('🔧 VLAN Debug Mode - SSH Correlation Enabled');
        
        // Store original functions
        this.originalSetInterfaceIP = window.setInterfaceIP;
        this.originalWriteNetplanConfig = window.writeNetplanConfig;
        
        // Generate unique test session ID
        this.sessionId = 'vlan-test-' + Date.now();
        console.log(`📋 Test Session ID: ${this.sessionId}`);
        
        // Enhanced setInterfaceIP with SSH correlation markers
        window.setInterfaceIP = async (config) => {
            console.log(`🔄 [${this.sessionId}] VLAN Edit Starting:`, config);
            console.log(`🔗 SSH Command: ssh user@server "echo 'VLAN_EDIT_START_${this.sessionId}' >> /tmp/vlan-debug.log"`);
            
            // Pre-edit state
            const preState = await this.captureVlanState();
            console.log('📸 Pre-edit VLAN state:', preState);
            
            // Call original function
            const result = await this.originalSetInterfaceIP(config);
            
            // Post-edit state
            setTimeout(async () => {
                const postState = await this.captureVlanState();
                console.log('📸 Post-edit VLAN state:', postState);
                console.log(`🔗 SSH Command: ssh user@server "echo 'VLAN_EDIT_END_${this.sessionId}' >> /tmp/vlan-debug.log"`);
                
                // Compare states
                this.compareVlanStates(preState, postState, config);
            }, 1000);
            
            return result;
        };
    },
    
    // Capture current VLAN state from browser perspective
    captureVlanState: async function() {
        try {
            const config = await window.loadNetplanConfig();
            const vlans = config.network?.vlans || {};
            
            return {
                timestamp: new Date().toISOString(),
                vlanCount: Object.keys(vlans).length,
                vlans: Object.keys(vlans).map(name => ({
                    name,
                    id: vlans[name].id,
                    link: vlans[name].link,
                    addresses: vlans[name].addresses || [],
                    dhcp4: vlans[name].dhcp4
                }))
            };
        } catch (error) {
            console.error('❌ Failed to capture VLAN state:', error);
            return { error: error.message };
        }
    },
    
    // Compare VLAN states and identify changes
    compareVlanStates: function(preState, postState, config) {
        console.log('🔍 VLAN State Comparison:');
        
        if (preState.error || postState.error) {
            console.error('❌ Cannot compare states due to errors');
            return;
        }
        
        const preVlans = new Map(preState.vlans.map(v => [v.name, v]));
        const postVlans = new Map(postState.vlans.map(v => [v.name, v]));
        
        // Check for lost VLANs
        const lostVlans = [...preVlans.keys()].filter(name => !postVlans.has(name));
        if (lostVlans.length > 0) {
            console.error('❌ LOST VLANs detected:', lostVlans);
        }
        
        // Check for added VLANs
        const addedVlans = [...postVlans.keys()].filter(name => !preVlans.has(name));
        if (addedVlans.length > 0) {
            console.log('✅ NEW VLANs detected:', addedVlans);
        }
        
        // Check for modified VLANs
        for (const [name, postVlan] of postVlans) {
            const preVlan = preVlans.get(name);
            if (preVlan) {
                const preAddrs = JSON.stringify(preVlan.addresses);
                const postAddrs = JSON.stringify(postVlan.addresses);
                
                if (preAddrs !== postAddrs) {
                    console.log(`🔄 VLAN ${name} IP changed:`, {
                        from: preVlan.addresses,
                        to: postVlan.addresses,
                        expected: config.name === name ? config.static_ip : 'unchanged'
                    });
                }
            }
        }
        
        // Summary
        console.log('📊 Change Summary:', {
            before: { count: preState.vlanCount, vlans: [...preVlans.keys()] },
            after: { count: postState.vlanCount, vlans: [...postVlans.keys()] },
            lost: lostVlans,
            added: addedVlans,
            target: config.name
        });
    },
    
    // Generate SSH commands for correlation
    generateSSHCommands: function() {
        console.log('🔗 SSH Commands for correlation:');
        console.log('');
        console.log('# Before editing VLAN:');
        console.log('ssh user@server "ip link show | grep -E \'\\.\' > /tmp/vlan-before.txt"');
        console.log('ssh user@server "ip addr show > /tmp/addr-before.txt"');
        console.log('');
        console.log('# After editing VLAN:');
        console.log('ssh user@server "ip link show | grep -E \'\\.\' > /tmp/vlan-after.txt"');
        console.log('ssh user@server "ip addr show > /tmp/addr-after.txt"');
        console.log('');
        console.log('# Compare changes:');
        console.log('ssh user@server "diff /tmp/vlan-before.txt /tmp/vlan-after.txt"');
        console.log('ssh user@server "diff /tmp/addr-before.txt /tmp/addr-after.txt"');
    },
    
    // Test VLAN editing with automatic validation
    testVlanEdit: async function(vlanName, newIP) {
        console.log(`🧪 Testing VLAN edit: ${vlanName} -> ${newIP}`);
        
        // Enable debug mode
        this.enableDebugMode();
        
        // Generate SSH commands
        this.generateSSHCommands();
        
        // Simulate VLAN edit
        try {
            await window.setInterfaceIP({
                name: vlanName,
                static_ip: newIP
            });
            console.log('✅ VLAN edit completed - check SSH output for system state');
        } catch (error) {
            console.error('❌ VLAN edit failed:', error);
        }
    },
    
    // Restore original functions
    disableDebugMode: function() {
        if (this.originalSetInterfaceIP) {
            window.setInterfaceIP = this.originalSetInterfaceIP;
        }
        if (this.originalWriteNetplanConfig) {
            window.writeNetplanConfig = this.originalWriteNetplanConfig;
        }
        console.log('🔧 Debug mode disabled');
    }
};

// Quick access functions
window.startVlanDebug = () => VlanTestSuite.enableDebugMode();
window.testVlan = (name, ip) => VlanTestSuite.testVlanEdit(name, ip);
window.stopVlanDebug = () => VlanTestSuite.disableDebugMode();

console.log('🔧 VLAN Test Suite loaded!');
console.log('Usage:');
console.log('  startVlanDebug()              - Enable debug mode');
console.log('  testVlan("vlan10", "1.2.3.4") - Test VLAN edit');
console.log('  VlanTestSuite.generateSSHCommands() - Get SSH commands');
console.log('  stopVlanDebug()               - Disable debug mode');
