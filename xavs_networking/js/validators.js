/**
 * XAVS Networking Validators (2024)
 * Centralized validation for Netplan networking configuration
 * Production-grade validation with business logic awareness
 */

const XAVSValidators = {
  
  // **1. Generic Network Validators**
  
  ipAddress(value) {
    if (!value || typeof value !== 'string') return false;
    
    // IPv4 regex
    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // IPv6 regex (simplified)
    const ipv6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4.test(value) || ipv6.test(value);
  },
  
  cidrNetwork(value) {
    if (!value || typeof value !== 'string') return false;
    
    const parts = value.split('/');
    if (parts.length !== 2) return false;
    
    const [ip, prefixStr] = parts;
    const prefix = parseInt(prefixStr, 10);
    
    if (!this.ipAddress(ip)) return false;
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;
    
    // IPv4: max prefix 32, IPv6: max prefix 128
    if (ip.includes('.') && prefix > 32) return false;
    if (ip.includes(':') && prefix > 128) return false;
    
    return true;
  },
  
  interfaceName(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Linux interface naming: alphanumeric, dots, underscores, hyphens, colons
    const validName = /^[A-Za-z0-9_.:-]+$/;
    
    // Reasonable length
    if (value.length > 15) return false;
    
    return validName.test(value);
  },
  
  vlanId(value) {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 1 && num <= 4094;
  },
  
  mtu(value) {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 576 && num <= 9216;
  },
  
  routeMetric(value) {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 0 && num <= 4294967295;
  },
  
  // **2. Route-Specific Validators**
  
  routeDestination(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Accept 'default' keyword
    if (value === 'default') return true;
    
    // Otherwise must be valid CIDR
    return this.cidrNetwork(value);
  },
  
  routeGateway(value) {
    return this.ipAddress(value);
  },
  
  // **3. DNS Validators**
  
  dnsServer(value) {
    return this.ipAddress(value);
  },
  
  searchDomain(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Basic domain name validation
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
    
    return value.length <= 253 && domainPattern.test(value);
  },
  
  // **4. Bond Mode Validators**
  
  bondMode(value) {
    const validModes = [
      'active-backup', '802.3ad', 'balance-rr', 
      'balance-xor', 'broadcast', 'balance-tlb', 'balance-alb'
    ];
    return validModes.includes(value);
  },
  
  lacpRate(value) {
    return ['slow', 'fast'].includes(value);
  },
  
  // **5. Business Logic Validators**
  
  overlayConfiguration(config, baselineInterfaces = []) {
    const errors = [];
    
    if (!config || typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return errors;
    }
    
    const { name, nameservers, dhcp4_overrides } = config;
    
    // Interface name validation
    if (!name || !this.interfaceName(name)) {
      errors.push(`Invalid interface name: ${name}`);
    }
    
    // Check if this is a baseline interface (overlay rules)
    const isBaseline = baselineInterfaces.includes(name);
    
    if (isBaseline) {
      // For baseline interfaces, static DNS requires use-dns: false
      if (nameservers && nameservers.addresses && nameservers.addresses.length > 0) {
        if (!dhcp4_overrides || dhcp4_overrides.use_dns !== false) {
          errors.push(`Static DNS on baseline interface '${name}' requires dhcp4-overrides.use-dns: false`);
        }
      }
    }
    
    // Validate nameservers
    if (nameservers) {
      if (nameservers.addresses) {
        nameservers.addresses.forEach((dns, idx) => {
          if (!this.dnsServer(dns)) {
            errors.push(`Invalid DNS server at index ${idx}: ${dns}`);
          }
        });
      }
      
      if (nameservers.search) {
        nameservers.search.forEach((domain, idx) => {
          if (!this.searchDomain(domain)) {
            errors.push(`Invalid search domain at index ${idx}: ${domain}`);
          }
        });
      }
    }
    
    // Validate routes
    if (config.routes_additive) {
      config.routes_additive.forEach((route, idx) => {
        if (!route.to || !this.routeDestination(route.to)) {
          errors.push(`Invalid route destination at index ${idx}: ${route.to}`);
        }
        if (!route.via || !this.routeGateway(route.via)) {
          errors.push(`Invalid route gateway at index ${idx}: ${route.via}`);
        }
        if (route.metric !== undefined && !this.routeMetric(route.metric)) {
          errors.push(`Invalid route metric at index ${idx}: ${route.metric}`);
        }
      });
    }
    
    return errors;
  },
  
  vlanConfiguration(config, availableInterfaces = []) {
    const errors = [];
    
    if (!config || typeof config !== 'object') {
      errors.push('VLAN configuration must be an object');
      return errors;
    }
    
    const { name, id, link, addresses } = config;
    
    // Validate VLAN name
    if (!name || !this.interfaceName(name)) {
      errors.push(`Invalid VLAN interface name: ${name}`);
    }
    
    // Validate VLAN ID
    if (!this.vlanId(id)) {
      errors.push(`Invalid VLAN ID: ${id} (must be 1-4094)`);
    }
    
    // Validate parent link
    if (!link || !this.interfaceName(link)) {
      errors.push(`Invalid parent interface: ${link}`);
    } else if (!availableInterfaces.includes(link)) {
      errors.push(`Parent interface '${link}' not found or not available`);
    }
    
    // Validate static addresses
    if (addresses && Array.isArray(addresses)) {
      addresses.forEach((addr, idx) => {
        if (!this.cidrNetwork(addr)) {
          errors.push(`Invalid static address at index ${idx}: ${addr}`);
        }
      });
    }
    
    return errors;
  },
  
  bondConfiguration(config, spareInterfaces = []) {
    const errors = [];
    
    if (!config || typeof config !== 'object') {
      errors.push('Bond configuration must be an object');
      return errors;
    }
    
    const { name, interfaces, mode, parameters, addresses } = config;
    
    // Validate bond name
    if (!name || !this.interfaceName(name)) {
      errors.push(`Invalid bond interface name: ${name}`);
    }
    
    // Validate member interfaces
    if (!interfaces || !Array.isArray(interfaces) || interfaces.length < 2) {
      errors.push('Bond must have at least 2 member interfaces');
    } else {
      interfaces.forEach((iface, idx) => {
        if (!this.interfaceName(iface)) {
          errors.push(`Invalid member interface at index ${idx}: ${iface}`);
        } else if (!spareInterfaces.includes(iface)) {
          errors.push(`Interface '${iface}' is not available as a spare (may be in use by baseline or another XAVS interface)`);
        }
      });
    }
    
    // Validate bond mode
    if (!this.bondMode(mode)) {
      errors.push(`Invalid bond mode: ${mode}`);
    }
    
    // Validate mode-specific parameters
    if (parameters) {
      if (mode === 'active-backup' && parameters.primary) {
        if (!interfaces.includes(parameters.primary)) {
          errors.push(`Primary interface '${parameters.primary}' must be one of the bond members`);
        }
      }
      
      if (mode === '802.3ad' && parameters.lacp_rate) {
        if (!this.lacpRate(parameters.lacp_rate)) {
          errors.push(`Invalid LACP rate: ${parameters.lacp_rate}`);
        }
      }
    }
    
    // Validate static addresses
    if (addresses && Array.isArray(addresses)) {
      addresses.forEach((addr, idx) => {
        if (!this.cidrNetwork(addr)) {
          errors.push(`Invalid static address at index ${idx}: ${addr}`);
        }
      });
    }
    
    return errors;
  },
  
  // **6. Management Interface Safety**
  
  managementInterfaceCheck(config, managementInterface = null) {
    const warnings = [];
    
    if (!managementInterface) return warnings;
    
    const { name, dhcp4, addresses } = config;
    
    if (name === managementInterface) {
      if (dhcp4 === false && (!addresses || addresses.length === 0)) {
        warnings.push(`WARNING: Disabling DHCP on management interface '${name}' without static IP may cause loss of connectivity`);
      }
    }
    
    return warnings;
  },
  
  // **7. Master Validation Function**
  
  validateConfiguration(config, context = {}) {
    const {
      baselineInterfaces = [],
      spareInterfaces = [],
      availableInterfaces = [],
      managementInterface = null
    } = context;
    
    const results = {
      valid: true,
      errors: [],
      warnings: []
    };
    
    // Determine config type and validate accordingly
    if (config.id && config.link) {
      // VLAN configuration
      const vlanErrors = this.vlanConfiguration(config, availableInterfaces);
      results.errors.push(...vlanErrors);
    } else if (config.interfaces && Array.isArray(config.interfaces)) {
      if (config.mode) {
        // Bond configuration
        const bondErrors = this.bondConfiguration(config, spareInterfaces);
        results.errors.push(...bondErrors);
      } else {
        // Bridge configuration (similar to bond)
        const bridgeErrors = this.bondConfiguration(config, spareInterfaces);
        results.errors.push(...bridgeErrors);
      }
    } else {
      // Overlay configuration
      const overlayErrors = this.overlayConfiguration(config, baselineInterfaces);
      results.errors.push(...overlayErrors);
    }
    
    // Management interface safety check
    const mgmtWarnings = this.managementInterfaceCheck(config, managementInterface);
    results.warnings.push(...mgmtWarnings);
    
    results.valid = results.errors.length === 0;
    
    return results;
  }
  
};

// Export for browser environments
window.XAVSValidators = XAVSValidators;
