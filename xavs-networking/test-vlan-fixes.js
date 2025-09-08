// Test script to verify VLAN edit function fixes
console.log('Testing VLAN edit function fixes...');

// Test the IP parsing with sample data
function testIpParsing() {
    const sampleIpOutput = `
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
2: eno1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000
    link/ether 00:25:90:8e:7e:f8 brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.100/24 brd 192.168.1.255 scope global eno1
       valid_lft forever preferred_lft forever
3: eno1.100@eno1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000
    link/ether 00:25:90:8e:7e:f8 brd ff:ff:ff:ff:ff:ff
    inet 10.100.1.50/24 brd 10.100.1.255 scope global eno1.100
       valid_lft forever preferred_lft forever
    inet 10.100.1.51/24 scope global secondary eno1.100
       valid_lft forever preferred_lft forever
4: eno1.200@eno1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default qlen 1000
    link/ether 00:25:90:8e:7e:f8 brd ff:ff:ff:ff:ff:ff
    inet 10.200.1.50/24 brd 10.200.1.255 scope global eno1.200
       valid_lft forever preferred_lft forever
`;

    console.log('Testing IP parsing with sample data...');
    
    // Simulate the parsing logic
    const interfaceName = 'eno1.100';
    const details = {
        ipAddresses: [],
        status: 'unknown'
    };

    const lines = sampleIpOutput.split('\n');
    let inInterfaceBlock = false;
    let interfaceFound = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this line starts a new interface block
        const interfaceMatch = line.match(/^\d+:\s+([^@:\s]+)(?:@([^:\s]+))?:/);
        if (interfaceMatch) {
            const currentInterface = interfaceMatch[1];
            if (currentInterface === interfaceName) {
                inInterfaceBlock = true;
                interfaceFound = true;
                
                // Check interface status from this line
                if (line.includes('state UP')) {
                    details.status = 'up';
                } else if (line.includes('state DOWN')) {
                    details.status = 'down';
                } else if (line.includes('<UP,')) {
                    details.status = 'up';
                } else {
                    details.status = 'down';
                }
                
                console.log(`Found interface ${interfaceName}, status: ${details.status}`);
                continue;
            } else {
                // Different interface, stop processing if we were in our block
                if (inInterfaceBlock) {
                    break;
                }
                inInterfaceBlock = false;
            }
        }
        
        // If we're in our interface block, look for IP addresses
        if (inInterfaceBlock && line.trim().startsWith('inet ')) {
            const ipMatch = line.match(/inet\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(?:\/[0-9]+)?)/);
            if (ipMatch) {
                const ipWithCidr = ipMatch[1];
                details.ipAddresses.push(ipWithCidr);
                console.log(`Found IP address: ${ipWithCidr}`);
            }
        }
    }
    
    console.log('Final parsed details:', details);
    console.log(`Expected: 2 IP addresses (10.100.1.50/24, 10.100.1.51/24), status: up`);
    console.log(`Actual: ${details.ipAddresses.length} IP addresses (${details.ipAddresses.join(', ')}), status: ${details.status}`);
    
    return details;
}

// Test the populateEditIpAddresses function logic
function testPopulateLogic() {
    console.log('\nTesting populateEditIpAddresses logic...');
    
    const testIpAddresses = ['10.100.1.50/24', '10.100.1.51/24', '10.100.1.52/24'];
    
    console.log('Input IP addresses:', testIpAddresses);
    
    // Simulate the logic
    testIpAddresses.forEach((ip, index) => {
        console.log(`Processing IP ${index}: '${ip}'`);
        if (index === 0) {
            console.log(`Creating first entry with value: '${ip}'`);
        } else {
            console.log(`Creating additional entry ${index} with value: '${ip}'`);
        }
    });
    
    return true;
}

// Run tests
console.log('=== Running VLAN Edit Function Tests ===');
testIpParsing();
testPopulateLogic();
console.log('=== Tests completed ===');
