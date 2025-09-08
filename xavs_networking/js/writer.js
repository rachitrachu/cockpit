// Using dynamic import for js-yaml since we can't use npm in Cockpit
let yaml;

async function loadYaml() {
  if (!yaml) {
    yaml = await import("https://cdn.skypack.dev/js-yaml@4.1.0");
  }
  return yaml;
}

export async function emitXavsYaml(model) {
  const yamlLib = await loadYaml();
  
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
  const yamlStr = yamlLib.dump(doc, { lineWidth: 120, noRefs: true });
  return `# Managed by XAVS Networking (Cockpit). Do not edit manually.\n${yamlStr}`;
}
