import { CONFIG_DIR, CONFIG_PATH, NODES_PATH } from "./constants.js";

/* Cockpit FS helpers */
export function ensureDir() {
  return cockpit.spawn(["bash","-lc", `mkdir -p '${CONFIG_DIR}' && echo OK`], { superuser: "try" }).then(() => true);
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
export async function saveHostsAndNodes(hosts, patchNodesFile) {
  const jsonData = JSON.stringify(hosts, null, 2) + "\n";
  await ensureDir();
  await cockpit.file(CONFIG_PATH, { superuser: "try" }).replace(jsonData);

  const existingNodes = await cockpit.file(NODES_PATH, { superuser: "try" }).read().catch(() => "");
  const patched = patchNodesFile(existingNodes, hosts);
  await cockpit.file(NODES_PATH, { superuser: "try" }).replace(patched);
  return patched;
}
