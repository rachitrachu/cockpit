'use strict';

/**
 * Mock Cockpit functionality for standalone testing
 * This provides basic implementations when Cockpit is not available
 */

// Mock the run function for testing
if (typeof window.run === 'undefined') {
    console.log('🔧 Initializing mock run function for standalone testing');
    
    window.run = async function(command, args = [], options = {}) {
        console.log('🖥️ Mock run command:', command, args);
        
        // Mock ifconfig output for interface discovery
        if (command === 'ifconfig') {
            return `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255
        inet6 fe80::a00:27ff:fe4e:66a1  prefixlen 64  scopeid 0x20<link>
        ether 08:00:27:4e:66:a1  txqueuelen 1000  (Ethernet)
        RX packets 1000  bytes 85000 (85.0 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 800  bytes 65000 (65.0 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

wlan0: flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500
        ether 02:00:00:00:01:00  txqueuelen 1000  (Ethernet)
        RX packets 0  bytes 0 (0.0 B)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 0  bytes 0 (0.0 B)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

enp0s3: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 10.0.2.15  netmask 255.255.255.0  broadcast 10.0.2.255
        inet6 fe80::a00:27ff:fe8d:c04d  prefixlen 64  scopeid 0x20<link>
        ether 08:00:27:8d:c0:4d  txqueuelen 1000  (Ethernet)
        RX packets 500  bytes 45000 (45.0 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 300  bytes 25000 (25.0 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0

lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0
        inet6 ::1  prefixlen 128  scopeid 0x10<host>
        loop  txqueuelen 1000  (Local Loopback)
        RX packets 200  bytes 15000 (15.0 KB)
        RX errors 0  dropped 0  overruns 0  frame 0
        TX packets 200  bytes 15000 (15.0 KB)
        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0`;
        }
        
        // Mock for basic test command
        if (command === 'echo') {
            return 'test';
        }
        
        // Mock for ping command
        if (command === 'ping') {
            return `PING google.com (172.217.14.238) 56(84) bytes of data.
64 bytes from lga25s62-in-f14.1e100.net (172.217.14.238): icmp_seq=1 ttl=54 time=12.4 ms
64 bytes from lga25s62-in-f14.1e100.net (172.217.14.238): icmp_seq=2 ttl=54 time=11.9 ms
64 bytes from lga25s62-in-f14.1e100.net (172.217.14.238): icmp_seq=3 ttl=54 time=12.1 ms
64 bytes from lga25s62-in-f14.1e100.net (172.217.14.238): icmp_seq=4 ttl=54 time=12.0 ms

--- google.com ping statistics ---
4 packets transmitted, 4 received, 0% packet loss
time 3004ms
rtt min/avg/max/mdev = 11.928/12.100/12.412/0.179 ms`;
        }
        
        // Mock for traceroute
        if (command === 'traceroute') {
            return `traceroute to google.com (172.217.14.238), 30 hops max, 60 byte packets
 1  192.168.1.1 (192.168.1.1)  1.234 ms  1.123 ms  1.045 ms
 2  10.0.0.1 (10.0.0.1)  5.678 ms  5.234 ms  5.123 ms
 3  172.217.14.238 (172.217.14.238)  12.345 ms  12.234 ms  12.123 ms`;
        }
        
        // Default mock response
        return 'Mock command executed successfully';
    };
}

// Mock setStatus if not available
if (typeof window.setStatus === 'undefined') {
    window.setStatus = function(message, detail = '') {
        console.log('📊 Status:', message, detail);
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
        }
    };
}

// Mock netplanAction if not available
if (typeof window.netplanAction === 'undefined') {
    window.netplanAction = async function(action, config) {
        console.log('⚙️ Mock netplan action:', action, config);
        return 'Mock netplan action completed';
    };
}

console.log('✅ Mock functions initialized for standalone testing');

// Auto-initialize forms when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 DOM loaded, initializing mock environment');
    
    // Small delay to ensure all scripts are loaded
    setTimeout(() => {
        console.log('🔄 Triggering setupNetworkingForms...');
        if (typeof window.setupNetworkingForms === 'function') {
            window.setupNetworkingForms().then(() => {
                console.log('✅ setupNetworkingForms completed');
            }).catch(error => {
                console.error('❌ setupNetworkingForms failed:', error);
            });
        } else {
            console.error('❌ setupNetworkingForms function not found');
        }
    }, 1000);
});
