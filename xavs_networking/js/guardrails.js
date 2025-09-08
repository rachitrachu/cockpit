// Enhanced guardrails supporting baseline overlays
export function canOverlay(nic) { 
  return nic.isBaselineOwned; 
}

export function canFullEdit(nic) { 
  return !nic.isBaselineOwned; 
}

export function canVlan(nic) { 
  return true; // safe on any parent NIC
}

export function canBridge(nic) { 
  return nic.isSpare; // only spare NICs to avoid baseline conflicts
}

export function canBond(nics) { 
  return nics.every(n => n.isSpare); // only spare NICs
}

// Overlay-safe fields for baseline NICs
export const OVERLAY_FIELDS = {
  mtu: "number", 
  optional: "boolean", 
  "accept-ra": "boolean",
  "dhcp4-overrides": { 
    "route-metric": "number", 
    "use-dns": "boolean", 
    "use-routes": "boolean", 
    "send-hostname": "boolean" 
  },
  "dhcp6-overrides": { 
    "route-metric": "number", 
    "use-dns": "boolean", 
    "use-routes": "boolean" 
  },
  nameservers: { 
    addresses: "string[]", 
    search: "string[]" 
  }, // only valid if dhcp4-overrides.use-dns === false
  routes_additive: [{ 
    to: "string", 
    via: "string", 
    metric: "number?" 
  }] // additive only
};

export function canDelete(iface) {
  return !iface.isBaselineOwned;
}

export function checkDependencies(iface, inventory) {
  const dependencies = [];
  
  // Check for VLANs using this interface as parent
  for (const [name, vlan] of Object.entries(inventory.vlans || {})) {
    if (vlan.link === iface.name) {
      dependencies.push({ type: 'vlan', name, description: `VLAN ${vlan.id}` });
    }
  }
  
  // Check for bonds using this interface
  for (const [name, bond] of Object.entries(inventory.bonds || {})) {
    if (bond.interfaces.includes(iface.name)) {
      dependencies.push({ type: 'bond', name, description: `Bond member` });
    }
  }
  
  // Check for bridges using this interface
  for (const [name, bridge] of Object.entries(inventory.bridges || {})) {
    if (bridge.interfaces.includes(iface.name)) {
      dependencies.push({ type: 'bridge', name, description: `Bridge member` });
    }
  }
  
  return dependencies;
}

export function isManagementInterface(iface, criticalPath) {
  // Check if this interface provides the management/default route path
  return iface.name === criticalPath;
}
