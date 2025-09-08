/**
 * XAVS Networking YAML Writer Module
 * Handles writing YAML configurations safely
 */

async function emitXavsYaml(model) {
  // model = { ethernets, vlans, bonds, bridges, overlays }
  const doc = {
    network: { 
      version: 2, 
      renderer: "networkd", 
      ethernets: {}, 
      vlans: {}, 
      bonds: {}, 
      bridges: {} 
    }
  };

  // Emit XAVS-owned interfaces
  Object.assign(doc.network.ethernets, model.ethernets || {});
  Object.assign(doc.network.vlans,     model.vlans     || {});
  Object.assign(doc.network.bonds,     model.bonds     || {});
  Object.assign(doc.network.bridges,   model.bridges   || {});

  // Emit baseline overlays (safe-only keys)
  for (const [name, overlay] of Object.entries(model.overlays || {})) {
    // Validate overlay only contains allowed keys
    const allowedKeys = ['mtu', 'optional', 'accept-ra', 'dhcp4-overrides', 'dhcp6-overrides', 'nameservers', 'routes'];
    const hasDisallowedKeys = Object.keys(overlay).some(key => 
      !allowedKeys.includes(key) && 
      !key.startsWith('dhcp4-overrides.') && 
      !key.startsWith('dhcp6-overrides.')
    );
    
    if (hasDisallowedKeys) {
      throw new Error(`Overlay for ${name} contains disallowed keys. Only safe overlay fields allowed.`);
    }
    
    // Merge overlay into ethernets section
    doc.network.ethernets[name] = { 
      ...(doc.network.ethernets[name] || {}), 
      ...overlay 
    };
  }
  
  // Add header comment
  const yamlStr = jsyaml.dump(doc, { lineWidth: 120, noRefs: true });
  return `# Managed by XAVS Networking (Cockpit). Do not edit manually.\n${yamlStr}`;
}

// Export to global scope
window.emitXavsYaml = emitXavsYaml;
