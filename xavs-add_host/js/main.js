import { CONFIG_PATH, NODES_PATH, DEPLOYMENT_ROLE } from "./constants.js";
import { setStatus } from "./utils.js";
import { patchNodesFile } from "./nodes.js";
import { loadHosts, saveHostsAndNodes } from "./store.js";
import { createTableUI } from "./ui_table.js";
import { createAddUI } from "./ui_add.js";
import { createSSHUI } from "./ssh.js";
import { saveEtcHosts } from "./hostsfile.js";

const statusEl   = document.getElementById("recent-activity");
const previewEl  = document.getElementById("preview");
const nodesPrev  = document.getElementById("nodes-preview");

// Tab navigation elements
const tabLinks = document.querySelectorAll('.nav-link');
const tabPanes = document.querySelectorAll('.tab-pane');

// Add Host sub-tab elements  
const subTabBtns = document.querySelectorAll('.sub-tabs .btn');
const subTabContents = document.querySelectorAll('.tab-content');

// Log elements
const logContainer = document.getElementById("log-container");
const clearLogBtn = document.getElementById("btn-clear-log");
const viewLogsBtn = document.getElementById("view-logs-btn");
const statusBar = document.querySelector('.bottom-status-bar');
const statusText = document.getElementById('recent-activity');

let hosts = [];
let currentLog = "";

const getHosts = () => hosts.slice();
const setHosts = (h) => { hosts = h.slice(); renderPreview(); persistDebounced("Auto-saved changes."); };

// Tab switching functionality
function switchTab(targetId) {
  // Update tab links
  tabLinks.forEach(link => {
    const isActive = link.getAttribute('data-target') === targetId;
    link.classList.toggle('active', isActive);
  });
  
  // Update tab panes
  tabPanes.forEach(pane => {
    const isActive = pane.id === targetId;
    pane.classList.toggle('active', isActive);
  });

  // Log tab switch
  const tabNames = {
    'panel-hosts': 'Hosts Management',
    'panel-ssh': 'SSH Access',
    'panel-logs': 'Activity Logs'
  };
  if (tabNames[targetId]) {
    addToLog(`Switched to ${tabNames[targetId]} tab`);
  }

  // If switching to SSH panel, refresh it
  if (targetId === 'panel-ssh' && sshUI && sshUI.refresh) {
    sshUI.refresh();
    addToLog("SSH access panel refreshed");
  }
}

// Sub-tab switching for Add Host section
function switchSubTab(targetId) {
  // Update sub-tab buttons
  subTabBtns.forEach(btn => {
    const isActive = btn.getAttribute('aria-controls') === targetId;
    btn.classList.toggle('active', isActive);
  });
  
  // Update sub-tab contents
  subTabContents.forEach(content => {
    const isActive = content.id === targetId;
    content.classList.toggle('active', isActive);
    content.classList.toggle('hidden', !isActive);
  });

  // Log sub-tab switch
  const subTabNames = {
    'add-single': 'Single Host Entry',
    'add-bulk': 'Bulk Entry',
    'add-table': 'Table View',
    'add-preview': 'JSON Preview'
  };
  if (subTabNames[targetId]) {
    addToLog(`Switched to ${subTabNames[targetId]}`);
  }
}

// Initialize tab event listeners
tabLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = link.getAttribute('data-target');
    switchTab(targetId);
  });
});

// Initialize sub-tab event listeners
subTabBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = btn.getAttribute('aria-controls');
    switchSubTab(targetId);
  });
});

// Log functionality - uses CSS for styling
function addToLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  
  if (logContainer) {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = timestamp;
    
    const messageSpan = document.createElement('span');
    messageSpan.className = 'log-message';
    messageSpan.textContent = message;
    
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(messageSpan);
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Limit to 100 entries
    const entries = logContainer.querySelectorAll('.log-entry');
    if (entries.length > 100) {
      entries[0].remove();
    }
  }
  
  // Update status bar
  if (statusText) {
    statusText.textContent = message;
    
    // Update status bar color based on type
    if (statusBar) {
      statusBar.className = statusBar.className.replace(/status-(info|success|warning|error)/g, '');
      statusBar.classList.add(`status-${type}`);
    }
  }
}

// Clear log function
function clearLog() {
  if (logContainer) {
    logContainer.innerHTML = `
      <div class="log-entry log-info">
        <span class="log-time">System</span>
        <span class="log-message">Log cleared</span>
      </div>
    `;
  }
  if (statusText) {
    statusText.textContent = "Ready";
    if (statusBar) {
      statusBar.className = statusBar.className.replace(/status-(info|success|warning|error)/g, '');
    }
  }
}

// Log event listeners
if (clearLogBtn) {
  clearLogBtn.addEventListener('click', clearLog);
}

if (viewLogsBtn) {
  viewLogsBtn.addEventListener('click', () => {
    switchTab('panel-logs');
  });
}

// Help button functionality (tooltip handled by CSS)
const helpBtn = document.querySelector('.help');
if (helpBtn) {
  helpBtn.addEventListener('click', (e) => {
    // Prevent any default action, tooltip is shown via CSS hover
    e.preventDefault();
  });
}

// Refresh button functionality
const refreshBtn = document.getElementById('btn-refresh');
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    addToLog("Refreshing all data...");
    loadConfig();
    if (sshUI && sshUI.refresh) {
      sshUI.refresh();
    }
  });
}

const etcToggle = document.getElementById("etc-hosts-toggle");
const etcStatus = document.getElementById("etc-hosts-status");

// Debounced auto-persist to /etc/xavs/hosts.json and /etc/xavs/nodes
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
          addToLog("Updated /etc/hosts successfully");
        } catch (e) {
          console.error(e);
          if (etcStatus) etcStatus.textContent = "Failed to update /etc/hosts (need privilege?)";
          addToLog("Failed to update /etc/hosts: " + e.message, "error");
        }
      }

      addToLog(reason, "success");
    } catch (e) {
      console.error(e);
      addToLog("Auto-save failed: " + e.message, "error");
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
  addToLog("Loading configuration...");
  try {
    hosts = await loadHosts();
    table.renderTable();
    renderPreview();
    addToLog(`Loaded ${hosts.length} hosts successfully`, "success");
  } catch {
    hosts = [];
    table.renderTable();
    renderPreview();
    addToLog("No config found, starting fresh");
  }
  // make sure SSH table reflects current hosts after load
  if (sshUI && sshUI.refresh) sshUI.refresh();
}

// Local validation used when needed
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

let sshUI; // declare first so callbacks can safely reference it

/* UI modules */
const table = createTableUI({
  getHosts,
  setHosts,
  onChange: () => renderPreview(),
  onDelete: (deletedHost) => { 
    persistDebounced("Deleted host — nodes updated."); 
    if (sshUI && sshUI.refresh) sshUI.refresh(); 
    if (deletedHost) {
      addToLog(`Deleted host: ${deletedHost.hostname} (${deletedHost.ip})`, "warning");
    } else {
      addToLog("Host deleted", "warning");
    }
  }
});

createAddUI({
  getHosts,
  setHosts,
  anyHasDeployment: () => hosts.some(h => (h.roles||[]).includes(DEPLOYMENT_ROLE)),
  onHostsChanged: (jumpToLast=false, addedCount=1) => {
    if (jumpToLast && table.goLastPage) table.goLastPage(); else table.renderTable();
    renderPreview();
    persistDebounced("Added hosts — nodes updated.");
    if (sshUI && sshUI.refresh) sshUI.refresh();
    const hostText = addedCount === 1 ? "host" : "hosts";
    addToLog(`${addedCount} ${hostText} added successfully`, "success");
  }
});

// Initialize the SSH UI
sshUI = createSSHUI({
  getHosts: () => hosts.slice()
});

/* Initialize everything */
// Set default active tabs
switchTab('panel-hosts');
switchSubTab('tab-single');

// Module initialization
addToLog("xAVS Host Management module started", "info");
addToLog("Initializing user interface components", "info");

// Load configuration
loadConfig();
