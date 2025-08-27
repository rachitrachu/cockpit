// Helper function to determine user-friendly interface type names
function getInterfaceTypeFriendlyName(interfaceName, rawType, fullLine) {
  // VLAN interfaces
  if (interfaceName.includes('.') || interfaceName.includes('@')) {
    return '??? VLAN';
  }
  
  // Bridge interfaces
  if (interfaceName.startsWith('br') || rawType === 'bridge') {
    return '?? Bridge';
  }
  
  // Bond interfaces
  if (interfaceName.startsWith('bond')) {
    return '?? Bond';
  }
  
  // Loopback
  if (interfaceName === 'lo' || rawType === 'loopback') {
    return '?? Loopback';
  }
  
  // Virtual interfaces
  if (interfaceName.startsWith('virbr') || interfaceName.startsWith('veth')) {
    return '?? Virtual';
  }
  
  // Docker interfaces
  if (interfaceName.startsWith('docker')) {
    return '?? Docker';
  }
  
  // Open vSwitch
  if (interfaceName.includes('ovs') || interfaceName.startsWith('br-')) {
    return '?? OVS';
  }
  
  // Wireless interfaces
  if (interfaceName.startsWith('wl') || interfaceName.startsWith('wifi') || interfaceName.startsWith('wlan')) {
    return '?? Wireless';
  }
  
  // Tunnel interfaces
  if (interfaceName.startsWith('tun') || interfaceName.startsWith('tap')) {
    return '?? Tunnel';
  }
  
  // Physical Ethernet (common naming patterns)
  if (interfaceName.startsWith('eth') || 
      interfaceName.startsWith('eno') || 
      interfaceName.startsWith('ens') || 
      interfaceName.startsWith('enp') || 
      interfaceName.startsWith('em')) {
    return '?? Ethernet';
  }
  
  // PPP interfaces
  if (interfaceName.startsWith('ppp')) {
    return '?? PPP';
  }
  
  // Default mapping based on raw type
  const typeMap = {
    'ether': '?? Ethernet',
    'loopback': '?? Loopback', 
    'bridge': '?? Bridge',
    'vlan': '??? VLAN',
    'bond': '?? Bond',
    'wifi': '?? Wireless',
    'ppp': '?? PPP',
    'tunnel': '?? Tunnel'
  };
  
  return typeMap[rawType] || `?? ${rawType.charAt(0).toUpperCase() + rawType.slice(1)}`;
}

      if (match) {
        const dev = match[2];
        let type = 'ethernet', state = 'DOWN', mac = '', ipv4 = '', ipv6 = '', mtu = '1500';

        for (const line of lines) {
          if (line.includes('mtu')) {
            const mtuMatch = line.match(/mtu (\d+)/);
            if (mtuMatch) mtu = mtuMatch[1];
          }
          if (line.includes('link/')) {
            const macMatch = line.match(/link\/\w+ ([0-9a-fA-F:]+)/);
            if (macMatch) mac = macMatch[1];
            const typeMatch = line.match(/link\/(\w+)/);
            if (typeMatch) {
              const rawType = typeMatch[1];
              // Enhanced type detection with user-friendly names
              type = getInterfaceTypeFriendlyName(dev, rawType, line);
            }
          }
          if (line.includes('state')) {
            const stateMatch = line.match(/state (\w+)/);
            if (stateMatch) state = stateMatch[1];
          }
          if (line.trim().startsWith('inet ')) {
            const ipMatch = line.match(/inet ([^\s]+)/);
            if (ipMatch) ipv4 = ipMatch[1];
          }
          if (line.trim().startsWith('inet6 ')) {
            const ip6Match = line.match(/inet6 ([^\s]+)/);
            if (ip6Match && !ip6Match[1].startsWith('fe80')) ipv6 = ip6Match[1];
          }
        }

        interfaces.push({ dev, type, state, mac, ipv4, ipv6, mtu });
      }
async function loadInterfaces() {