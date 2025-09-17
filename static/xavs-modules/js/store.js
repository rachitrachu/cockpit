import { CONFIG_DIR, CONFIG_PATH, NODES_YAML_PATH, INVENTORY_DIR, INVENTORY_PATH } from "./constants.js";

/* Cockpit FS helpers */
export function ensureDir() {
  return cockpit.spawn(["bash","-lc", `mkdir -p '${CONFIG_DIR}' '${INVENTORY_DIR}' && echo OK`], { superuser: "try" }).then(() => true);
}

export function readFile(path) {
  return cockpit.file(path, { superuser: "try" }).read().catch(() => "");
}

export async function loadHosts() {
  try {
    const text = await cockpit.file(CONFIG_PATH, { superuser: "try" }).read();
    if (text && text.trim()) return JSON.parse(text);
  } catch {}
  return [];
}

// Generate YAML format manually (no external libraries)
function generateYAML(nodes) {
  const lines = ["nodes:"];
  nodes.forEach(node => {
    lines.push(`  - hostname: "${node.hostname}"`);
    lines.push(`    ip: "${node.ip}"`);
    if (node.roles && node.roles.length > 0) {
      lines.push(`    roles:`);
      node.roles.forEach(role => {
        lines.push(`      - "${role}"`);
      });
    }
  });
  return lines.join("\n") + "\n";
}

// Generate Ansible inventory format
function generateInventory(nodes) {
  const lines = ["[all:vars]", "ansible_user=root", "ansible_ssh_private_key_file=/root/.ssh/xavs", ""];
  
  // Group nodes by roles
  const roleGroups = {};
  const allHosts = [];
  
  nodes.forEach(node => {
    const hostLine = `${node.hostname} ansible_host=${node.ip}`;
    allHosts.push(hostLine);
    
    if (node.roles && node.roles.length > 0) {
      node.roles.forEach(role => {
        if (!roleGroups[role]) roleGroups[role] = [];
        roleGroups[role].push(hostLine);
      });
    }
  });
  
  // Add [all] group
  lines.push("[all]");
  allHosts.forEach(host => lines.push(host));
  lines.push("");
  
  // Add role groups
  Object.keys(roleGroups).forEach(role => {
    lines.push(`[${role}]`);
    roleGroups[role].forEach(host => lines.push(host));
    lines.push("");
  });
  
  return lines.join("\n");
}

export async function saveHostsAndFormats(hosts) {
  const jsonData = JSON.stringify(hosts, null, 2) + "\n";
  const yamlData = generateYAML(hosts);
  const inventoryData = generateInventory(hosts);
  
  await ensureDir();
  
  // Save all three formats
  await cockpit.file(CONFIG_PATH, { superuser: "try" }).replace(jsonData);
  await cockpit.file(NODES_YAML_PATH, { superuser: "try" }).replace(yamlData);
  await cockpit.file(INVENTORY_PATH, { superuser: "try" }).replace(inventoryData);
  
  return {
    json: jsonData,
    yaml: yamlData,
    inventory: inventoryData
  };
}

// Legacy compatibility
export async function saveHostsAndNodes(hosts, patchNodesFile) {
  return await saveHostsAndFormats(hosts);
}
