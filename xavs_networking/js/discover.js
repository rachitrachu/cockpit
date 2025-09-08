/**
 * XAVS Networking Discovery Module
 * Discovers network interfaces and their configuration
 */

async function discover() {
  const [links, addrs, routes] = await Promise.all([
    run("ip -json link"), run("ip -json addr"), run("ip -json route")
  ]);
  
  // Get list of netplan YAML files
  const files = await run("ls -1 /etc/netplan/*.yaml 2>/dev/null || true");
  const yamlFiles = files.split("\n").filter(Boolean);
  
  // Parse YAML files to build ownership map
  const yamlInfo = await parseYamlFiles(yamlFiles);
  
  return { 
    runtime: { 
      links: JSON.parse(links), 
      addrs: JSON.parse(addrs), 
      routes: JSON.parse(routes) 
    },
    yaml: yamlInfo 
  };
}

function categorizeNics(discoveryData) {
  const { runtime, yaml } = discoveryData;
  const nics = runtime.links;
  
  return {
    baseline: nics.filter(n => {
      const ownership = getInterfaceOwnership(n.ifname, yaml);
      return ownership === "baseline";
    }),
    spare: nics.filter(n => isSpareNic(n, runtime, yaml)),
    xavs: nics.filter(n => {
      const ownership = getInterfaceOwnership(n.ifname, yaml);
      return ownership === "xavs";
    }),
    overlay: nics.filter(n => {
      const ownership = getInterfaceOwnership(n.ifname, yaml);
      return ownership === "overlay";
    })
  };
}

function isSpareNic(nic, runtime, yaml) {
  // Spare NIC = interface that:
  // - is not present in baseline YAML,
  // - has no non‑link‑local addresses,
  // - is not a member of any bond/bridge.
  
  const ownership = getInterfaceOwnership(nic.ifname, yaml);
  if (ownership !== "unmanaged") {
    return false; // already managed
  }
  
  const hasNonLLAddresses = runtime.addrs
    .filter(addr => addr.ifname === nic.ifname)
    .some(addr => addr.addr_info?.some(info => 
      !info.local?.startsWith('169.254.') && // not link-local
      !info.local?.startsWith('fe80:') &&    // not IPv6 link-local
      !info.local?.startsWith('127.')        // not loopback
    ));
  
  const isBondBridgeMember = checkBondBridgeMembership(nic.ifname, yaml);
  
  return !hasNonLLAddresses && !isBondBridgeMember;
}

function checkBondBridgeMembership(ifname, yaml) {
  // Check if interface is a member of any bond or bridge
  const { merged } = yaml;
  
  // Check bonds
  if (merged.bonds) {
    for (const [bondName, bondConfig] of Object.entries(merged.bonds)) {
      if (bondConfig.interfaces?.includes(ifname)) {
        return true;
      }
    }
  }
  
  // Check bridges
  if (merged.bridges) {
    for (const [bridgeName, bridgeConfig] of Object.entries(merged.bridges)) {
      if (bridgeConfig.interfaces?.includes(ifname)) {
        return true;
      }
    }
  }
  
  return false;
}

function detectCriticalPath(routes) {
  const defaultRoute = routes.find(r => r.dst === "default" || r.dst === "0.0.0.0/0");
  return defaultRoute?.dev || null;
}

// Export to global scope
window.discover = discover;
window.detectCriticalPath = detectCriticalPath;
