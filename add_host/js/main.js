import { CONFIG_PATH, NODES_PATH, DEPLOYMENT_ROLE } from "./constants.js";
import { setStatus } from "./utils.js";
import { patchNodesFile } from "./nodes.js";
import { loadHosts, saveHostsAndNodes } from "./store.js";
import { createTableUI } from "./ui_table.js";
import { createAddUI } from "./ui_add.js";
import { createSSHUI } from "./ssh.js";
import { saveEtcHosts } from "./hostsfile.js";


const statusEl   = document.getElementById("status");
const previewEl  = document.getElementById("preview");
const nodesPrev  = document.getElementById("nodes-preview");
const pathEl     = document.getElementById("config-path");
const nodesPath  = document.getElementById("nodes-path");
// Top-level nav tabs
const navHostsBtn = document.getElementById("nav-hosts");
const navSshBtn   = document.getElementById("nav-ssh");
const panelHosts  = document.getElementById("hosts-panel");
const panelSsh    = document.getElementById("ssh-panel");
//if (pathEl) pathEl.textContent = CONFIG_PATH;
//if (nodesPath) nodesPath.textContent = NODES_PATH;

let hosts = [];
const getHosts = () => hosts.slice();
const setHosts = (h) => { hosts = h.slice(); renderPreview(); persistDebounced("Auto-saved changes."); };


function switchTopTab(which) {
  const isHosts = which === "hosts";
  navHostsBtn.classList.toggle("active", isHosts);
  navHostsBtn.setAttribute("aria-selected", isHosts ? "true" : "false");
  navSshBtn.classList.toggle("active", !isHosts);
  navSshBtn.setAttribute("aria-selected", !isHosts ? "true" : "false");
  panelHosts.classList.toggle("hidden", !isHosts);
  panelSsh.classList.toggle("hidden", isHosts);
    // ✅ whenever we show the SSH panel, refresh from current hosts
  if (!isHosts && sshUI && sshUI.refresh) sshUI.refresh();
}
navHostsBtn.addEventListener("click", () => switchTopTab("hosts"));
navSshBtn.addEventListener("click",   () => switchTopTab("ssh"));
switchTopTab("hosts");


const etcToggle = document.getElementById("etc-hosts-toggle");
const etcStatus = document.getElementById("etc-hosts-status");


// Debounced auto-persist to /root/xdeploy/hosts.json and /root/xdeploy/nodes
let persistTimer = null;
function persistDebounced(reason = "Auto-saved.") {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const patchedNodes = await saveHostsAndNodes(hosts, patchNodesFile);
      if (nodesPrev) nodesPrev.textContent = patchedNodes;

      if (etcToggle?.checked) {
        try {
          await saveEtcHosts(hosts);
          if (etcStatus) etcStatus.textContent = "Updated /etc/hosts";
        } catch (e) {
          console.error(e);
          if (etcStatus) etcStatus.textContent = "Failed to update /etc/hosts (need privilege?)";
        }
      }

      setStatus(statusEl, reason, "ok");
    } catch (e) {
      console.error(e);
      setStatus(statusEl, "Auto-save failed. Check privileges.", "err");
    }
  }, 400);
}


function renderPreview() {
  if (previewEl) previewEl.textContent = JSON.stringify(hosts, null, 2);
  // show ACTUAL nodes file on disk (not hypothetical)
  if (nodesPrev) {
    cockpit.file(NODES_PATH, { superuser: "try" }).read()
      .then(text => { nodesPrev.textContent = text || ""; })
      .catch(()   => { nodesPrev.textContent = ""; });
  }
}

async function loadConfig() {
  setStatus(statusEl,"Loading...");
  try {
    hosts = await loadHosts();
    table.renderTable();
    renderPreview();
    setStatus(statusEl,"Loaded.","ok");
  } catch {
    hosts = [];
    table.renderTable();
    renderPreview();
    setStatus(statusEl,"No config found, create new.");
  }
    // ✅ make sure SSH table reflects current hosts after (success OR empty) load
  if (sshUI && sshUI.refresh) sshUI.refresh();
}

// Local validation used when needed (e.g., a manual Save you might add later)
function validateLocal() {
  const seenHost = new Set(), seenIP = new Set();
  let deploymentCount = 0;
  for (const h of hosts) {
    if (!h.hostname) return "Hostname is required";
    if (!h.ip) return "IP is required";
    if (seenHost.has(h.hostname)) return `Duplicate hostname: ${h.hostname}`;
    if (seenIP.has(h.ip)) return `Duplicate IP: ${h.ip}`;
    seenHost.add(h.hostname); seenIP.add(h.ip);
    if ((h.roles||[]).includes(DEPLOYMENT_ROLE)) deploymentCount++;
  }
  if (deploymentCount > 1) return "Only one host can have the 'deployment' role.";
  return null;
}

/* UI modules */
// Make sure you imported DEPLOYMENT_ROLE and createSSHUI above.
// import { DEPLOYMENT_ROLE } from "./constants.js";
// import { createSSHUI } from "./ssh.js";

let sshUI; // declare first so callbacks can safely reference it

/* UI modules */
const table = createTableUI({
  getHosts,
  setHosts,
  onChange: () => renderPreview(),
  onDelete: () => { persistDebounced("Deleted host — nodes updated."); if (sshUI && sshUI.refresh) sshUI.refresh(); }
});

createAddUI({
  getHosts,
  setHosts,
  anyHasDeployment: () => hosts.some(h => (h.roles||[]).includes(DEPLOYMENT_ROLE)),
  onHostsChanged: (jumpToLast=false) => {
    if (jumpToLast && table.goLastPage) table.goLastPage(); else table.renderTable();
    renderPreview();
    persistDebounced("Added hosts — nodes updated.");
    if (sshUI && sshUI.refresh) sshUI.refresh();  // ✅ keep this
  }
});

// Now initialize the SSH UI
sshUI = createSSHUI({
  getHosts: () => hosts.slice()
});


/* Init */
loadConfig();
