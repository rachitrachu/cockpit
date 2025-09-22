import { ROLES } from "./constants.js";

/**
 * Patch the /etc/xavs/nodes file.
 *
 * Structure:
 * 1. Top header (2 fixed comment lines)
 * 2. All role sections (even if empty)
 * 3. Second header (2 fixed comment lines)
 * 4. Preserved non-managed content (e.g. [common:children]…)
 */
export function patchNodesFile(existingText, currentHosts) {
  const src = String(existingText || "");
  const NL = "\n";

  // First header lines
  const headerTop = [
    "# These initial groups are the only groups required to be modified. The",
    "# additional groups are for more control of the environment."
  ].join(NL) + NL + NL;

  // Second header lines
  const headerBottom = [
    "# You can explicitly specify which hosts run each project by updating the",
    "# groups in the sections below. Common services are grouped together."
  ].join(NL) + NL + NL;

  // Build host list for each role
  const roleLines = new Map();
  for (const role of ROLES) {
    const hostsForRole = currentHosts
      .filter(h => {
        // Deduplicate roles for each host and check if this role exists
        const uniqueRoles = [...new Set(h.roles || [])];
        return uniqueRoles.includes(role);
      })
      .map(h => (h.hostname || "").trim())
      .filter(Boolean)
      .filter((hostname, index, arr) => arr.indexOf(hostname) === index); // Remove duplicate hostnames
    roleLines.set(role, hostsForRole);
  }

  // Build role blocks (always include all roles, even empty)
  const roleBlocks = [];
  for (const role of ROLES) {
    const hostsForRole = roleLines.get(role) || [];
    roleBlocks.push(`[${role}]${NL}${hostsForRole.join(NL)}${NL}${NL}`);
  }
  const managedRolesText = roleBlocks.join("");

  // Remove old managed role sections from existing file
  let preserved = src;
  for (const role of ROLES) {
    const re = new RegExp(
      String.raw`^\[${role.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\][^\n]*\n(?:.*\n)*?(?=^\[|\Z)`,
      "gmi"
    );
    preserved = preserved.replace(re, "");
  }

  // Remove any existing occurrences of our two headers from preserved content
  preserved = preserved.split(/\r?\n/).filter(line => {
    if (line.startsWith("# These initial groups are the only groups required to be modified.")) return false;
    if (line.startsWith("# additional groups are for more control of the environment.")) return false;
    if (line.startsWith("# You can explicitly specify which hosts run each project by updating the")) return false;
    if (line.startsWith("# groups in the sections below. Common services are grouped together.")) return false;
    return true;
  }).join(NL);

  // Trim preserved content and collapse excessive newlines
  preserved = preserved.replace(/^[\s\r\n]+/, "");
  preserved = preserved.replace(/[ \t]+$/gm, "");
  preserved = preserved.replace(/\n{3,}/g, "\n\n");

  // Compose final file
  let out = headerTop + managedRolesText + headerBottom;
  if (preserved.length) {
    out += preserved.endsWith(NL) ? preserved : preserved + NL;
  }

  // Ensure max two newlines at end
  out = out.replace(/\n{3,}$/g, "\n\n");

  return out;
}
