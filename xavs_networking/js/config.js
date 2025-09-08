// Configuration for XAVS Networking Module
const CONFIG = {
  // Apply settings
  defaultTryTimeout: 120, // seconds
  minTryTimeout: 60,
  maxTryTimeout: 300,
  
  // File paths
  xavsConfigFile: "/etc/netplan/90-xavs.yaml",
  stateFile: "/var/lib/xavs-networking/state.json",
  
  // DNS override settings
  enableDnsOverrideByDefault: true,
  defaultDnsServers: ["1.1.1.1", "8.8.8.8"],
  
  // Route metrics
  dhcpDefaultMetric: 100,
  preferredStaticMetric: 50,
  backupStaticMetric: 200,
  
  // UI settings
  enablePromoteToXavsWizard: true,
  showSpareNicsBadge: true,
  
  // Safety settings
  requireConfirmationForCriticalOps: true,
  autoDetectManagementInterface: true
};

// Form schemas for different interface types
const FORM_SCHEMAS = {
  ethernet_overlay: {
    title: "Ethernet Overlay (Baseline NIC)",
    description: "Safe overlay settings for baseline-managed interface",
    fields: {
      mtu: { type: "number", min: 68, max: 9000, label: "MTU" },
      optional: { type: "boolean", label: "Optional (skip boot wait)" },
      "dhcp4-overrides": {
        type: "object",
        label: "DHCP Overrides",
        fields: {
          "route-metric": { type: "number", min: 1, max: 999, label: "Route Metric" },
          "use-dns": { type: "boolean", label: "Use DHCP DNS" },
          "use-routes": { type: "boolean", label: "Use DHCP Routes" },
          "send-hostname": { type: "boolean", label: "Send Hostname" }
        }
      },
      nameservers: {
        type: "object",
        label: "Custom DNS (requires DHCP DNS disabled)",
        fields: {
          addresses: { type: "array", items: "ip", label: "DNS Servers" },
          search: { type: "array", items: "domain", label: "Search Domains" }
        }
      },
      routes_additive: {
        type: "array",
        label: "Additional Static Routes",
        items: {
          type: "object",
          fields: {
            to: { type: "cidr", required: true, label: "Destination" },
            via: { type: "ip", label: "Gateway" },
            metric: { type: "number", min: 1, max: 999, label: "Metric" }
          }
        }
      }
    }
  },
  
  ethernet_full: {
    title: "Ethernet Configuration",
    description: "Full configuration for XAVS-managed interface",
    fields: {
      dhcp4: { type: "boolean", label: "DHCP IPv4" },
      dhcp6: { type: "boolean", label: "DHCP IPv6" },
      addresses: {
        type: "array",
        items: "cidr", 
        label: "Static IP Addresses",
        condition: { field: "dhcp4", value: false }
      },
      nameservers: {
        type: "object",
        label: "DNS Settings",
        fields: {
          addresses: { type: "array", items: "ip", label: "DNS Servers" },
          search: { type: "array", items: "domain", label: "Search Domains" }
        }
      },
      routes: {
        type: "array",
        label: "Static Routes",
        items: {
          type: "object",
          fields: {
            to: { type: "cidr", required: true, label: "Destination" },
            via: { type: "ip", label: "Gateway" },
            metric: { type: "number", min: 1, max: 999, label: "Metric" }
          }
        }
      },
      mtu: { type: "number", min: 68, max: 9000, label: "MTU" },
      optional: { type: "boolean", label: "Optional (skip boot wait)" }
    }
  },
  
  vlan: {
    title: "VLAN Configuration",
    description: "Create VLAN interface on parent",
    fields: {
      id: { type: "number", min: 1, max: 4094, required: true, label: "VLAN ID" },
      link: { type: "select", options: "parent_interfaces", required: true, label: "Parent Interface" },
      dhcp4: { type: "boolean", label: "DHCP IPv4" },
      dhcp6: { type: "boolean", label: "DHCP IPv6" },
      addresses: {
        type: "array",
        items: "cidr",
        label: "Static IP Addresses",
        condition: { field: "dhcp4", value: false }
      },
      nameservers: {
        type: "object",
        label: "DNS Settings",
        fields: {
          addresses: { type: "array", items: "ip", label: "DNS Servers" },
          search: { type: "array", items: "domain", label: "Search Domains" }
        }
      },
      routes: {
        type: "array",
        label: "Static Routes",
        items: {
          type: "object",
          fields: {
            to: { type: "cidr", required: true, label: "Destination" },
            via: { type: "ip", label: "Gateway" },
            metric: { type: "number", min: 1, max: 999, label: "Metric" }
          }
        }
      }
    }
  },
  
  bond: {
    title: "Bond Configuration",
    description: "Create bonded interface from spare NICs",
    fields: {
      interfaces: {
        type: "array",
        items: "select",
        options: "spare_interfaces",
        required: true,
        minItems: 2,
        label: "Member Interfaces"
      },
      mode: {
        type: "select",
        required: true,
        options: [
          { value: "active-backup", label: "Active-Backup (Failover)" },
          { value: "802.3ad", label: "802.3ad (LACP)" },
          { value: "balance-rr", label: "Balance Round-Robin" },
          { value: "balance-xor", label: "Balance XOR" },
          { value: "broadcast", label: "Broadcast" },
          { value: "balance-tlb", label: "Balance TLB" },
          { value: "balance-alb", label: "Balance ALB" }
        ],
        label: "Bonding Mode"
      },
      dhcp4: { type: "boolean", label: "DHCP IPv4" },
      dhcp6: { type: "boolean", label: "DHCP IPv6" },
      addresses: {
        type: "array",
        items: "cidr",
        label: "Static IP Addresses",
        condition: { field: "dhcp4", value: false }
      },
      parameters: {
        type: "object",
        label: "Advanced Parameters",
        fields: {
          primary: { type: "select", options: "member_interfaces", label: "Primary Interface" },
          "mii-monitor-interval": { type: "number", min: 0, label: "MII Monitor Interval (ms)" },
          "lacp-rate": { type: "select", options: ["slow", "fast"], label: "LACP Rate" }
        }
      }
    }
  },
  
  bridge: {
    title: "Bridge Configuration", 
    description: "Create bridge interface from spare NICs",
    fields: {
      interfaces: {
        type: "array",
        items: "select",
        options: "spare_interfaces",
        required: true,
        minItems: 1,
        label: "Member Interfaces"
      },
      dhcp4: { type: "boolean", label: "DHCP IPv4" },
      dhcp6: { type: "boolean", label: "DHCP IPv6" },
      addresses: {
        type: "array",
        items: "cidr",
        label: "Static IP Addresses",
        condition: { field: "dhcp4", value: false }
      },
      parameters: {
        type: "object",
        label: "Advanced Parameters",
        fields: {
          stp: { type: "boolean", label: "Spanning Tree Protocol" },
          "forward-delay": { type: "number", min: 2, max: 30, label: "Forward Delay (seconds)" },
          "hello-time": { type: "number", min: 1, max: 10, label: "Hello Time (seconds)" }
        }
      }
    }
  }
};

// Export to global scope
window.CONFIG = CONFIG;
window.FORM_SCHEMAS = FORM_SCHEMAS;
