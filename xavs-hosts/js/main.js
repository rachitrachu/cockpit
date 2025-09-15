import { CONFIG_PATH, DEPLOYMENT_ROLE } from "./constants.js";
import { setStatus } from "./utils.js";
import { loadHosts, saveHostsAndFormats } from "./store.js";
import { createTableUI } from "./ui_table.js";
import { createAddUI } from "./ui_add.js";
import { createSSHUI } from "./ssh.js";
import { saveEtcHosts } from "./hostsfile.js";
import { checkRequiredTools, logCommand } from "./ssh-new.js";
import { firstRunManager } from "./first-run.js";

const statusEl   = document.getElementById("recent-activity");
const previewJsonEl = document.getElementById("preview-json");
const previewYamlEl = document.getElementById("preview-yaml");
const previewInventoryEl = document.getElementById("preview-inventory");

// Tab navigation elements
const tabLinks = document.querySelectorAll('.nav-link');
const tabPanes = document.querySelectorAll('.tab-pane');

// Add Host sub-tab elements  
const subTabBtns = document.querySelectorAll('.sub-nav-tabs .nav-link');
const subTabContents = document.querySelectorAll('.sub-tab-content');

// Log elements
const logContainer = document.getElementById("log-container");
const clearLogBtn = document.getElementById("btn-clear-log");
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
    const isActive = link.getAttribute('data-tab') === targetId;
    link.classList.toggle('active', isActive);
  });
  
  // Update tab panes
  tabPanes.forEach(pane => {
    const isActive = pane.id === targetId;
    pane.classList.toggle('show', isActive);
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

// Format tab switching for Config & Outputs section
function switchFormatTab(targetId) {
  const formatBtns = document.querySelectorAll('#format-json, #format-yaml, #format-inventory');
  const formatContents = document.querySelectorAll('#format-json-content, #format-yaml-content, #format-inventory-content');
  
  // Update format tab buttons
  formatBtns.forEach(btn => {
    const isActive = btn.id === targetId;
    btn.classList.toggle('active', isActive);
  });
  
  // Update format tab contents
  formatContents.forEach(content => {
    const isActive = content.id === targetId + '-content';
    content.classList.toggle('active', isActive);
  });
}

// Initialize tab event listeners
tabLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = link.getAttribute('data-tab');
    switchTab(targetId);
  });
});

// Initialize sub-tab event listeners
subTabBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = btn.getAttribute('aria-controls');
    // Remove active from all
    subTabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
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

// Enhanced console logging for SSH commands
function addCommandLog(command, output = "", isError = false) {
  const timestamp = new Date().toLocaleTimeString();
  
  if (logContainer) {
    // Command entry
    const cmdEntry = document.createElement('div');
    cmdEntry.className = `log-entry log-command`;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-time';
    timeSpan.textContent = timestamp;
    
    const commandSpan = document.createElement('span');
    commandSpan.className = 'log-command-text';
    commandSpan.textContent = command;
    
    cmdEntry.appendChild(timeSpan);
    cmdEntry.appendChild(commandSpan);
    logContainer.appendChild(cmdEntry);
    
    // Output entry (if any)
    if (output) {
      const outputEntry = document.createElement('div');
      outputEntry.className = `log-entry log-output ${isError ? 'log-error' : 'log-success'}`;
      
      const outputSpan = document.createElement('span');
      outputSpan.className = 'log-output-text';
      outputSpan.textContent = output;
      
      outputEntry.appendChild(outputSpan);
      logContainer.appendChild(outputEntry);
    }
    
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Limit to 100 entries
    const entries = logContainer.querySelectorAll('.log-entry');
    if (entries.length > 100) {
      entries[0].remove();
    }
  }
}

// Listen for SSH command log events
window.addEventListener('ssh-command-log', (event) => {
  const { command, output, isError } = event.detail;
  addCommandLog(command, output, isError);
});

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

// Debounced auto-persist to /root/xdeploy/hosts.json and /root/xdeploy/nodes
let persistTimer = null;
function persistDebounced(reason = "Auto-saved.") {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const formats = await saveHostsAndFormats(hosts);
      // Update all preview formats
      if (previewJsonEl) previewJsonEl.textContent = formats.json;
      if (previewYamlEl) previewYamlEl.textContent = formats.yaml;
      if (previewInventoryEl) previewInventoryEl.textContent = formats.inventory;

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

async function renderPreview() {
  // Generate all formats
  const jsonData = JSON.stringify(hosts, null, 2);
  
  // Generate YAML manually
  const yamlLines = ["nodes:"];
  hosts.forEach(node => {
    yamlLines.push(`  - hostname: "${node.hostname}"`);
    yamlLines.push(`    ip: "${node.ip}"`);
    if (node.roles && node.roles.length > 0) {
      yamlLines.push(`    roles:`);
      node.roles.forEach(role => {
        yamlLines.push(`      - "${role}"`);
      });
    }
  });
  const yamlData = yamlLines.join("\n");
  
  // Generate Ansible inventory
  const invLines = ["[all:vars]", "ansible_user=root", "ansible_ssh_private_key_file=/root/.ssh/xavs", ""];
  const roleGroups = {};
  const allHosts = [];
  
  hosts.forEach(node => {
    const hostLine = `${node.hostname} ansible_host=${node.ip}`;
    allHosts.push(hostLine);
    
    if (node.roles && node.roles.length > 0) {
      node.roles.forEach(role => {
        if (!roleGroups[role]) roleGroups[role] = [];
        roleGroups[role].push(hostLine);
      });
    }
  });
  
  invLines.push("[all]");
  allHosts.forEach(host => invLines.push(host));
  invLines.push("");
  
  Object.keys(roleGroups).forEach(role => {
    invLines.push(`[${role}]`);
    roleGroups[role].forEach(host => invLines.push(host));
    invLines.push("");
  });
  
  const inventoryData = invLines.join("\n");
  
  // Update preview elements
  if (previewJsonEl) previewJsonEl.textContent = jsonData;
  if (previewYamlEl) previewYamlEl.textContent = yamlData;
  if (previewInventoryEl) previewInventoryEl.textContent = inventoryData;
}

// First-run wizard initialization
async function initializeFirstRunWizard() {
  try {
    addToLog("Initializing first-run wizard...", "info");
    
    // Initialize wizard data
    await firstRunManager.initializeWizardData();
    
    // Hide standard interface
    hideStandardInterface();
    
    // Show first-run wizard
    showFirstRunWizard();
    
    addToLog("First-run wizard initialized successfully", "success");
  } catch (error) {
    addToLog("Failed to initialize first-run wizard: " + error.message, "error");
    // Fallback to standard interface
    showStandardInterface();
  }
}

// Hide standard interface for first-run
function hideStandardInterface() {
  const standardContent = document.querySelector('.tab-content');
  const tabs = document.querySelector('.nav-tabs');
  
  if (standardContent) standardContent.style.display = 'none';
  if (tabs) tabs.style.display = 'none';
}

// Show standard interface (fallback)
function showStandardInterface() {
  const standardContent = document.querySelector('.tab-content');
  const tabs = document.querySelector('.nav-tabs');
  
  if (standardContent) standardContent.style.display = 'block';
  if (tabs) tabs.style.display = 'flex';
  
  // Hide wizard if it exists
  const wizard = document.getElementById('first-run-wizard');
  if (wizard) wizard.style.display = 'none';
}

// Show first-run wizard
function showFirstRunWizard() {
  // Create wizard container if it doesn't exist
  let wizard = document.getElementById('first-run-wizard');
  if (!wizard) {
    wizard = createFirstRunWizardElement();
    document.querySelector('.app').appendChild(wizard);
  }
  
  wizard.style.display = 'block';
  renderCurrentWizardStep();
}

// Create the wizard DOM element
function createFirstRunWizardElement() {
  const wizard = document.createElement('div');
  wizard.id = 'first-run-wizard';
  wizard.className = 'first-run-wizard';
  wizard.innerHTML = `
    <div class="wizard-container">
      <div class="wizard-header">
        <h2 class="wizard-title">
          <img src="logo-x.png" alt="X" class="logo-x">AVS Cluster Setup
        </h2>
        <div class="wizard-progress">
          <div class="progress-steps">
            <div class="step active" data-step="0">
              <span class="step-number">1</span>
              <span class="step-label">Welcome</span>
            </div>
            <div class="step" data-step="1">
              <span class="step-number">2</span>
              <span class="step-label">Architecture</span>
            </div>
            <div class="step" data-step="2">
              <span class="step-number">3</span>
              <span class="step-label">Hosts</span>
            </div>
            <div class="step" data-step="3">
              <span class="step-number">4</span>
              <span class="step-label">SSH Setup</span>
            </div>
            <div class="step" data-step="4">
              <span class="step-number">5</span>
              <span class="step-label">Review</span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="wizard-content" id="wizard-content">
        <!-- Dynamic content will be rendered here -->
      </div>
      
      <div class="wizard-footer">
        <button id="wizard-back" class="btn btn-default" style="display: none;">
          <i class="fas fa-arrow-left"></i> Back
        </button>
        <div class="wizard-actions">
          <button id="wizard-skip" class="btn btn-outline-default">
            Skip Wizard
          </button>
          <button id="wizard-next" class="btn btn-brand">
            Next <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners
  const backBtn = wizard.querySelector('#wizard-back');
  const nextBtn = wizard.querySelector('#wizard-next');
  const skipBtn = wizard.querySelector('#wizard-skip');
  
  backBtn.addEventListener('click', () => previousWizardStep());
  nextBtn.addEventListener('click', () => nextWizardStep());
  skipBtn.addEventListener('click', () => skipWizard());
  
  return wizard;
}

// Render current wizard step
function renderCurrentWizardStep() {
  const step = firstRunManager.getCurrentStep();
  const content = document.getElementById('wizard-content');
  const backBtn = document.getElementById('wizard-back');
  const nextBtn = document.getElementById('wizard-next');
  
  // Update progress indicators
  updateWizardProgress(step);
  
  // Show/hide back button
  backBtn.style.display = step > 0 ? 'inline-block' : 'none';
  
  // Render step content
  switch (step) {
    case 0:
      renderWelcomeStep(content);
      nextBtn.innerHTML = 'Get Started <i class="fas fa-arrow-right"></i>';
      break;
    case 1:
      renderArchitectureStep(content);
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      break;
    case 2:
      renderHostsStep(content);
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      break;
    case 3:
      renderSSHStep(content);
      nextBtn.innerHTML = 'Next <i class="fas fa-arrow-right"></i>';
      break;
    case 4:
      renderReviewStep(content);
      nextBtn.innerHTML = 'Complete Setup <i class="fas fa-check"></i>';
      break;
    default:
      completeWizard();
      break;
  }
}

// Update wizard progress indicators
function updateWizardProgress(currentStep) {
  const steps = document.querySelectorAll('.progress-steps .step');
  steps.forEach((step, index) => {
    step.classList.toggle('active', index === currentStep);
    step.classList.toggle('completed', index < currentStep);
  });
}

// Wizard navigation
function nextWizardStep() {
  const currentStep = firstRunManager.getCurrentStep();
  
  // Validate current step before proceeding
  if (validateCurrentWizardStep(currentStep)) {
    firstRunManager.nextStep();
    renderCurrentWizardStep();
  }
}

function previousWizardStep() {
  firstRunManager.previousStep();
  renderCurrentWizardStep();
}

// Validate current wizard step
function validateCurrentWizardStep(step) {
  const wizardData = firstRunManager.getWizardData();
  
  switch (step) {
    case 0: // Welcome - always valid
      return true;
    case 1: // Architecture selection
      if (!wizardData.deploymentType) {
        addToLog("Please select a deployment type", "warning");
        return false;
      }
      return true;
    case 2: // Hosts configuration
      if (!wizardData.currentHost) {
        addToLog("Current host information is required", "warning");
        return false;
      }
      return true;
    case 3: // SSH setup
      return true; // SSH setup is optional
    case 4: // Review
      return true;
    default:
      return true;
  }
}

// Skip wizard and go to standard interface
function skipWizard() {
  if (confirm('Are you sure you want to skip the guided setup? You can configure hosts manually.')) {
    firstRunManager.markCompleted();
    showStandardInterface();
    addToLog("Wizard skipped - switched to manual configuration", "info");
  }
}

// Complete wizard
function completeWizard() {
  addToLog("Completing wizard setup...", "info");
  
  const wizardData = firstRunManager.getWizardData();
  
  // Set up hosts based on wizard data
  const allHosts = [];
  
  // Add current host
  if (wizardData.currentHost) {
    allHosts.push(wizardData.currentHost);
  }
  
  // Add additional hosts
  if (wizardData.additionalHosts && wizardData.additionalHosts.length > 0) {
    allHosts.push(...wizardData.additionalHosts);
  }
  
  // Update hosts and save
  if (allHosts.length > 0) {
    hosts = allHosts;
    persistDebounced("Wizard setup completed - hosts configured.");
  }
  
  // Mark wizard as completed
  firstRunManager.markCompleted();
  
  // Switch to standard interface
  showStandardInterface();
  
  // Render hosts in the standard interface
  if (table) table.renderTable();
  renderPreview();
  
  addToLog(`Wizard completed successfully! Added ${allHosts.length} hosts.`, "success");
  addToLog("You can now review and modify your configuration or proceed to deployment.", "info");
}

// Wizard Step Renderers
function renderWelcomeStep(container) {
  const wizardData = firstRunManager.getWizardData();
  const currentHost = wizardData.currentHost || { hostname: 'detecting...', ip: 'detecting...' };
  
  container.innerHTML = `
    <div class="wizard-step wizard-welcome">
      <div class="welcome-content">
        <div class="welcome-icon">
          <i class="fas fa-rocket"></i>
        </div>
        <h3>Welcome to XAVS Cluster Setup!</h3>
        <p class="welcome-message">
          Congratulations! You've successfully completed the system preparation with xAVS Bootstrap. 
          Now let's set up your cluster hosts for OpenStack deployment.
        </p>
        
        <div class="setup-preview">
          <h4><i class="fas fa-info-circle"></i> What we'll configure:</h4>
          <ul class="setup-checklist">
            <li><i class="fas fa-check text-success"></i> Cluster architecture selection</li>
            <li><i class="fas fa-check text-success"></i> Host configuration and roles</li>
            <li><i class="fas fa-check text-success"></i> SSH access setup</li>
            <li><i class="fas fa-check text-success"></i> Deployment readiness validation</li>
          </ul>
        </div>
        
        <div class="current-host-info">
          <h4><i class="fas fa-desktop"></i> Current Host Detected:</h4>
          <div class="host-card">
            <div class="host-details">
              <strong>Hostname:</strong> ${currentHost.hostname}<br>
              <strong>IP Address:</strong> ${currentHost.ip}<br>
              <strong>Role:</strong> <span class="role-tag deployment">deployment</span>
            </div>
            <div class="host-note">
              <i class="fas fa-lightbulb"></i> This machine will be configured as your deployment host
            </div>
          </div>
        </div>
        
        <div class="time-estimate">
          <i class="fas fa-clock"></i> Estimated time: 5-10 minutes
        </div>
      </div>
    </div>
  `;
}

function renderArchitectureStep(container) {
  const wizardData = firstRunManager.getWizardData();
  
  container.innerHTML = `
    <div class="wizard-step wizard-architecture">
      <h3><i class="fas fa-sitemap"></i> Choose Your Deployment Architecture</h3>
      <p>Select the type of OpenStack deployment that best fits your needs:</p>
      
      <div class="architecture-options">
        <div class="arch-option ${wizardData.deploymentType === 'all-in-one' ? 'selected' : ''}" 
             data-type="all-in-one">
          <div class="arch-header">
            <div class="arch-icon">
              <i class="fas fa-server"></i>
            </div>
            <h4>All-in-One</h4>
            <span class="arch-subtitle">Single Node Deployment</span>
          </div>
          <div class="arch-description">
            <p>Perfect for development, testing, or small-scale deployments.</p>
            <ul>
              <li>All services on one machine</li>
              <li>Minimal resource requirements</li>
              <li>Quick setup and deployment</li>
              <li>Ideal for learning OpenStack</li>
            </ul>
          </div>
          <div class="arch-requirements">
            <strong>Requirements:</strong> 8GB RAM, 40GB disk space
          </div>
        </div>
        
        <div class="arch-option ${wizardData.deploymentType === 'multi-node' ? 'selected' : ''}" 
             data-type="multi-node">
          <div class="arch-header">
            <div class="arch-icon">
              <i class="fas fa-network-wired"></i>
            </div>
            <h4>Multi-Node</h4>
            <span class="arch-subtitle">Distributed Deployment</span>
          </div>
          <div class="arch-description">
            <p>Production-ready setup with role separation and high availability.</p>
            <ul>
              <li>Dedicated roles per node</li>
              <li>High availability support</li>
              <li>Better performance and scalability</li>
              <li>Production-grade deployment</li>
            </ul>
          </div>
          <div class="arch-requirements">
            <strong>Requirements:</strong> 3+ nodes, 16GB RAM each
          </div>
        </div>
      </div>
      
      <div class="architecture-preview" id="arch-preview" style="display: none;">
        <h4><i class="fas fa-eye"></i> Your Configuration Preview:</h4>
        <div id="arch-preview-content"></div>
      </div>
    </div>
  `;
  
  // Add click handlers for architecture selection
  const options = container.querySelectorAll('.arch-option');
  options.forEach(option => {
    option.addEventListener('click', () => {
      // Remove previous selection
      options.forEach(opt => opt.classList.remove('selected'));
      
      // Add selection to clicked option
      option.classList.add('selected');
      
      // Update wizard data
      const type = option.dataset.type;
      firstRunManager.updateWizardData({ deploymentType: type });
      
      // Show preview
      showArchitecturePreview(type);
      
      addToLog(`Selected deployment type: ${type}`, "info");
    });
  });
}

function showArchitecturePreview(type) {
  const preview = document.getElementById('arch-preview');
  const content = document.getElementById('arch-preview-content');
  
  if (type === 'all-in-one') {
    content.innerHTML = `
      <div class="preview-node">
        <div class="node-info">
          <i class="fas fa-server"></i>
          <span class="node-name">Current Host</span>
          <div class="node-roles">
            <span class="role-tag deployment">deployment</span>
            <span class="role-tag control">control</span>
            <span class="role-tag compute">compute</span>
            <span class="role-tag storage">storage</span>
            <span class="role-tag network">network</span>
          </div>
        </div>
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="preview-nodes">
        <div class="preview-node">
          <i class="fas fa-desktop"></i>
          <span class="node-name">Current Host</span>
          <span class="role-tag deployment">deployment</span>
        </div>
        <div class="preview-node placeholder">
          <i class="fas fa-plus"></i>
          <span class="node-name">Additional Hosts</span>
          <span class="node-note">To be configured in next step</span>
        </div>
      </div>
    `;
  }
  
  preview.style.display = 'block';
}

function renderHostsStep(container) {
  const wizardData = firstRunManager.getWizardData();
  const isMultiNode = wizardData.deploymentType === 'multi-node';
  
  container.innerHTML = `
    <div class="wizard-step wizard-hosts">
      <h3><i class="fas fa-server"></i> Configure Your Hosts</h3>
      
      <div class="current-host-section">
        <h4><i class="fas fa-desktop"></i> Current Host (Deployment Node)</h4>
        <div class="host-card confirmed">
          <div class="host-info">
            <div class="host-basic">
              <strong>${wizardData.currentHost?.hostname || 'Unknown'}</strong>
              <span class="host-ip">${wizardData.currentHost?.ip || 'Unknown'}</span>
            </div>
            <div class="host-roles">
              <span class="role-tag deployment">deployment</span>
              ${!isMultiNode ? '<span class="role-tag control">control</span><span class="role-tag compute">compute</span><span class="role-tag storage">storage</span><span class="role-tag network">network</span>' : ''}
            </div>
          </div>
          <div class="host-status">
            <i class="fas fa-check-circle text-success"></i> Ready
          </div>
        </div>
      </div>
      
      ${isMultiNode ? `
        <div class="additional-hosts-section">
          <h4><i class="fas fa-plus-circle"></i> Additional Hosts</h4>
          <p>Add the other hosts that will be part of your OpenStack cluster:</p>
          
          <div class="host-discovery">
            <div class="discovery-options">
              <button id="scan-network" class="btn btn-outline-brand">
                <i class="fas fa-search"></i> Scan Network
              </button>
              <button id="add-manual" class="btn btn-outline-brand">
                <i class="fas fa-plus"></i> Add Manually
              </button>
            </div>
            
            <div class="network-range">
              <label>Network to scan:</label>
              <input type="text" id="scan-range" class="form-control" 
                     value="${getNetworkRange(wizardData.currentHost?.ip)}" 
                     placeholder="192.168.1.0/24">
            </div>
          </div>
          
          <div id="discovered-hosts" class="discovered-hosts" style="display: none;">
            <h5>Discovered Hosts:</h5>
            <div id="discovered-list"></div>
          </div>
          
          <div id="manual-add" class="manual-add" style="display: none;">
            <h5>Add Host Manually:</h5>
            <div class="manual-host-form">
              <div class="form-row">
                <input type="text" id="manual-hostname" placeholder="hostname" class="form-control">
                <input type="text" id="manual-ip" placeholder="IP address" class="form-control">
                <button id="add-host-btn" class="btn btn-brand">Add</button>
              </div>
              <div class="role-selection" id="manual-roles">
                <label>Roles:</label>
                <div class="role-checkboxes">
                  <label><input type="checkbox" value="control"> control</label>
                  <label><input type="checkbox" value="compute"> compute</label>
                  <label><input type="checkbox" value="storage"> storage</label>
                  <label><input type="checkbox" value="network"> network</label>
                  <label><input type="checkbox" value="monitoring"> monitoring</label>
                </div>
              </div>
            </div>
          </div>
          
          <div class="added-hosts" id="added-hosts">
            <h5>Additional Hosts:</h5>
            <div id="hosts-list"></div>
          </div>
        </div>
      ` : `
        <div class="all-in-one-info">
          <div class="info-box">
            <i class="fas fa-info-circle"></i>
            <p>In All-in-One mode, all OpenStack services will be deployed on your current host. 
               No additional hosts are needed.</p>
          </div>
        </div>
      `}
    </div>
  `;
  
  // Add event handlers for multi-node configuration
  if (isMultiNode) {
    setupHostsStepHandlers(container);
  }
  
  // Update wizard data based on deployment type
  updateHostsForDeploymentType(wizardData);
}

function getNetworkRange(ip) {
  if (!ip || ip === 'detecting...') return '192.168.1.0/24';
  
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  return '192.168.1.0/24';
}

function updateHostsForDeploymentType(wizardData) {
  if (wizardData.deploymentType === 'all-in-one' && wizardData.currentHost) {
    // For all-in-one, add all roles to current host
    const updatedHost = {
      ...wizardData.currentHost,
      roles: ['deployment', 'control', 'compute', 'storage', 'network', 'monitoring']
    };
    firstRunManager.updateWizardData({ 
      currentHost: updatedHost,
      additionalHosts: []
    });
  }
}

function setupHostsStepHandlers(container) {
  const scanBtn = container.querySelector('#scan-network');
  const manualBtn = container.querySelector('#add-manual');
  const addHostBtn = container.querySelector('#add-host-btn');
  
  if (scanBtn) {
    scanBtn.addEventListener('click', () => startNetworkScan());
  }
  
  if (manualBtn) {
    manualBtn.addEventListener('click', () => showManualAdd());
  }
  
  if (addHostBtn) {
    addHostBtn.addEventListener('click', () => addManualHost());
  }
}

async function startNetworkScan() {
  const range = document.getElementById('scan-range').value;
  const discoveredSection = document.getElementById('discovered-hosts');
  const discoveredList = document.getElementById('discovered-list');
  
  addToLog(`Scanning network range: ${range}`, "info");
  
  try {
    // Simple ping sweep (this is a placeholder - actual implementation would be more complex)
    discoveredList.innerHTML = '<div class="scanning">Scanning network... <i class="fas fa-spinner fa-spin"></i></div>';
    discoveredSection.style.display = 'block';
    
    // Simulate network discovery
    setTimeout(() => {
      discoveredList.innerHTML = `
        <div class="discovered-host" data-ip="192.168.1.101">
          <div class="host-info">
            <strong>192.168.1.101</strong>
            <span class="host-status">Responding</span>
          </div>
          <button class="btn btn-sm btn-outline-brand add-discovered">Add</button>
        </div>
        <div class="discovery-note">
          <i class="fas fa-info-circle"></i> 
          Note: Actual network scanning would be implemented based on your specific requirements.
        </div>
      `;
      
      // Add handlers for discovered hosts
      const addBtns = discoveredList.querySelectorAll('.add-discovered');
      addBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          const hostElement = e.target.closest('.discovered-host');
          const ip = hostElement.dataset.ip;
          addDiscoveredHost(ip);
        });
      });
    }, 2000);
    
  } catch (error) {
    addToLog("Network scan failed: " + error.message, "error");
    discoveredList.innerHTML = '<div class="error">Network scan failed. Please add hosts manually.</div>';
  }
}

function showManualAdd() {
  const manualSection = document.getElementById('manual-add');
  manualSection.style.display = manualSection.style.display === 'none' ? 'block' : 'none';
}

function addManualHost() {
  const hostname = document.getElementById('manual-hostname').value.trim();
  const ip = document.getElementById('manual-ip').value.trim();
  const roleCheckboxes = document.querySelectorAll('#manual-roles input[type="checkbox"]:checked');
  const roles = Array.from(roleCheckboxes).map(cb => cb.value);
  
  if (!hostname || !ip) {
    addToLog("Hostname and IP are required", "warning");
    return;
  }
  
  if (roles.length === 0) {
    addToLog("At least one role must be selected", "warning");
    return;
  }
  
  const newHost = { hostname, ip, roles };
  
  // Add to wizard data
  const wizardData = firstRunManager.getWizardData();
  const additionalHosts = wizardData.additionalHosts || [];
  additionalHosts.push(newHost);
  
  firstRunManager.updateWizardData({ additionalHosts });
  
  // Update UI
  updateHostsList();
  
  // Clear form
  document.getElementById('manual-hostname').value = '';
  document.getElementById('manual-ip').value = '';
  roleCheckboxes.forEach(cb => cb.checked = false);
  
  addToLog(`Added host: ${hostname} (${ip})`, "success");
}

function addDiscoveredHost(ip) {
  // This would typically involve more discovery to get hostname
  const hostname = `host-${ip.split('.').pop()}`;
  const roles = ['compute']; // Default role for discovered hosts
  
  const newHost = { hostname, ip, roles };
  
  // Add to wizard data
  const wizardData = firstRunManager.getWizardData();
  const additionalHosts = wizardData.additionalHosts || [];
  additionalHosts.push(newHost);
  
  firstRunManager.updateWizardData({ additionalHosts });
  
  // Update UI
  updateHostsList();
  
  addToLog(`Added discovered host: ${hostname} (${ip})`, "success");
}

function updateHostsList() {
  const hostsList = document.getElementById('hosts-list');
  const wizardData = firstRunManager.getWizardData();
  const additionalHosts = wizardData.additionalHosts || [];
  
  if (additionalHosts.length === 0) {
    hostsList.innerHTML = '<div class="no-hosts">No additional hosts added yet.</div>';
    return;
  }
  
  hostsList.innerHTML = additionalHosts.map((host, index) => `
    <div class="added-host-card">
      <div class="host-info">
        <strong>${host.hostname}</strong>
        <span class="host-ip">${host.ip}</span>
        <div class="host-roles">
          ${host.roles.map(role => `<span class="role-tag ${role}">${role}</span>`).join('')}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger remove-host" data-index="${index}">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
  
  // Add remove handlers
  const removeBtns = hostsList.querySelectorAll('.remove-host');
  removeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('.remove-host').dataset.index);
      removeAdditionalHost(index);
    });
  });
}

function removeAdditionalHost(index) {
  const wizardData = firstRunManager.getWizardData();
  const additionalHosts = wizardData.additionalHosts || [];
  
  if (index >= 0 && index < additionalHosts.length) {
    const removedHost = additionalHosts.splice(index, 1)[0];
    firstRunManager.updateWizardData({ additionalHosts });
    updateHostsList();
    addToLog(`Removed host: ${removedHost.hostname}`, "info");
  }
}

function renderSSHStep(container) {
  container.innerHTML = `
    <div class="wizard-step wizard-ssh">
      <h3><i class="fas fa-key"></i> SSH Access Setup</h3>
      <p>Configure SSH access to enable automated deployment to your hosts.</p>
      
      <div class="ssh-explanation">
        <div class="info-box">
          <i class="fas fa-info-circle"></i>
          <p>SSH keys are required for Ansible to connect to your hosts during deployment. 
             We'll generate a key pair and help you distribute the public key to your hosts.</p>
        </div>
      </div>
      
      <div class="ssh-configuration">
        <h4>SSH Configuration</h4>
        
        <div class="ssh-form">
          <div class="form-group">
            <label for="ssh-username">Remote Username:</label>
            <input type="text" id="ssh-username" class="form-control" value="root" 
                   placeholder="Username for remote hosts">
            <small class="form-text">Username to use when connecting to remote hosts</small>
          </div>
          
          <div class="form-group">
            <label for="ssh-key-type">Key Type:</label>
            <select id="ssh-key-type" class="form-control">
              <option value="ed25519" selected>ed25519 (recommended)</option>
              <option value="rsa">RSA (legacy compatibility)</option>
            </select>
          </div>
        </div>
        
        <div class="ssh-actions">
          <button id="generate-ssh-key" class="btn btn-brand">
            <i class="fas fa-key"></i> Generate SSH Key
          </button>
          <span id="ssh-status" class="status-text"></span>
        </div>
        
        <div id="ssh-key-info" class="ssh-key-info" style="display: none;">
          <h5>Generated SSH Key</h5>
          <div class="key-details">
            <div class="key-path">
              <strong>Private Key:</strong> /root/.ssh/xavs<br>
              <strong>Public Key:</strong> /root/.ssh/xavs.pub
            </div>
          </div>
          
          <div class="key-distribution">
            <h5>Key Distribution</h5>
            <p>The public key needs to be installed on each remote host. Choose your method:</p>
            
            <div class="distribution-options">
              <div class="distribution-option">
                <input type="radio" id="dist-password" name="distribution" value="password" checked>
                <label for="dist-password">
                  <strong>Use Password Authentication</strong><br>
                  <small>We'll use your password to install the key automatically</small>
                </label>
              </div>
              
              <div class="distribution-option">
                <input type="radio" id="dist-manual" name="distribution" value="manual">
                <label for="dist-manual">
                  <strong>Manual Installation</strong><br>
                  <small>Copy the public key manually to each host</small>
                </label>
              </div>
            </div>
            
            <div id="password-method" class="distribution-method">
              <div class="form-group">
                <label for="remote-password">Password for remote hosts:</label>
                <input type="password" id="remote-password" class="form-control" 
                       placeholder="Enter password for remote user">
                <small class="form-text">This will be used once to install the SSH key</small>
              </div>
              
              <button id="distribute-keys" class="btn btn-brand" disabled>
                <i class="fas fa-share"></i> Distribute Keys to All Hosts
              </button>
            </div>
            
            <div id="manual-method" class="distribution-method" style="display: none;">
              <div class="manual-instructions">
                <p><strong>Manual Installation Instructions:</strong></p>
                <ol>
                  <li>Copy the public key content below</li>
                  <li>Log into each remote host</li>
                  <li>Add the key to <code>~/.ssh/authorized_keys</code></li>
                </ol>
                
                <div class="public-key-display">
                  <label>Public Key Content:</label>
                  <textarea id="public-key-content" class="form-control" rows="3" readonly 
                            placeholder="Public key will appear here after generation"></textarea>
                  <button id="copy-public-key" class="btn btn-sm btn-outline-brand">
                    <i class="fas fa-copy"></i> Copy to Clipboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="ssh-skip">
          <label>
            <input type="checkbox" id="skip-ssh"> Skip SSH setup for now
          </label>
          <small class="form-text">You can configure SSH access later in the SSH tab</small>
        </div>
      </div>
    </div>
  `;
  
  setupSSHStepHandlers(container);
}

function setupSSHStepHandlers(container) {
  const generateBtn = container.querySelector('#generate-ssh-key');
  const distributeBtn = container.querySelector('#distribute-keys');
  const copyBtn = container.querySelector('#copy-public-key');
  const distributionRadios = container.querySelectorAll('input[name="distribution"]');
  
  if (generateBtn) {
    generateBtn.addEventListener('click', generateSSHKey);
  }
  
  if (distributeBtn) {
    distributeBtn.addEventListener('click', distributeSSHKeys);
  }
  
  if (copyBtn) {
    copyBtn.addEventListener('click', copyPublicKeyToClipboard);
  }
  
  distributionRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const passwordMethod = container.querySelector('#password-method');
      const manualMethod = container.querySelector('#manual-method');
      
      if (e.target.value === 'password') {
        passwordMethod.style.display = 'block';
        manualMethod.style.display = 'none';
      } else {
        passwordMethod.style.display = 'none';
        manualMethod.style.display = 'block';
      }
    });
  });
}

async function generateSSHKey() {
  const keyType = document.getElementById('ssh-key-type').value;
  const statusEl = document.getElementById('ssh-status');
  const keyInfoEl = document.getElementById('ssh-key-info');
  const distributeBtn = document.getElementById('distribute-keys');
  
  try {
    statusEl.textContent = 'Generating SSH key...';
    statusEl.style.color = '#666';
    
    // Generate SSH key
    await cockpit.spawn([
      'ssh-keygen', '-t', keyType, '-f', '/root/.ssh/xavs', '-N', '', '-q'
    ], { superuser: "try", err: "message" });
    
    // Read public key for display
    const publicKeyContent = await cockpit.file('/root/.ssh/xavs.pub', { superuser: "try" }).read();
    
    // Update UI
    statusEl.textContent = 'SSH key generated successfully';
    statusEl.style.color = '#27ae60';
    
    keyInfoEl.style.display = 'block';
    
    const publicKeyTextarea = document.getElementById('public-key-content');
    if (publicKeyTextarea) {
      publicKeyTextarea.value = publicKeyContent.trim();
    }
    
    if (distributeBtn) {
      distributeBtn.disabled = false;
    }
    
    // Update wizard data
    firstRunManager.updateWizardData({ sshSetup: true });
    
    addToLog('SSH key generated successfully', 'success');
    
  } catch (error) {
    statusEl.textContent = 'Failed to generate SSH key: ' + error.message;
    statusEl.style.color = '#d9534f';
    addToLog('SSH key generation failed: ' + error.message, 'error');
  }
}

async function distributeSSHKeys() {
  const password = document.getElementById('remote-password').value;
  const username = document.getElementById('ssh-username').value;
  const statusEl = document.getElementById('ssh-status');
  
  if (!password) {
    addToLog('Password is required for key distribution', 'warning');
    return;
  }
  
  const wizardData = firstRunManager.getWizardData();
  const allHosts = [];
  
  // Add additional hosts (current host doesn't need key distribution)
  if (wizardData.additionalHosts) {
    allHosts.push(...wizardData.additionalHosts);
  }
  
  if (allHosts.length === 0) {
    addToLog('No remote hosts to configure', 'info');
    return;
  }
  
  statusEl.textContent = `Distributing keys to ${allHosts.length} hosts...`;
  statusEl.style.color = '#666';
  
  try {
    for (const host of allHosts) {
      addToLog(`Installing SSH key on ${host.hostname} (${host.ip})...`, 'info');
      
      // Use ssh-copy-id to install the key
      await cockpit.spawn([
        'sshpass', '-p', password, 'ssh-copy-id', 
        '-i', '/root/.ssh/xavs.pub',
        '-o', 'StrictHostKeyChecking=no',
        `${username}@${host.ip}`
      ], { superuser: "try", err: "message" });
      
      addToLog(`SSH key installed on ${host.hostname}`, 'success');
    }
    
    statusEl.textContent = 'SSH keys distributed successfully';
    statusEl.style.color = '#27ae60';
    
    addToLog('SSH key distribution completed', 'success');
    
  } catch (error) {
    statusEl.textContent = 'Key distribution failed: ' + error.message;
    statusEl.style.color = '#d9534f';
    addToLog('SSH key distribution failed: ' + error.message, 'error');
  }
}

function copyPublicKeyToClipboard() {
  const textarea = document.getElementById('public-key-content');
  if (textarea && textarea.value) {
    textarea.select();
    document.execCommand('copy');
    addToLog('Public key copied to clipboard', 'success');
  }
}

function renderReviewStep(container) {
  const wizardData = firstRunManager.getWizardData();
  const allHosts = [];
  
  if (wizardData.currentHost) {
    allHosts.push(wizardData.currentHost);
  }
  
  if (wizardData.additionalHosts) {
    allHosts.push(...wizardData.additionalHosts);
  }
  
  container.innerHTML = `
    <div class="wizard-step wizard-review">
      <h3><i class="fas fa-check-circle"></i> Review Your Configuration</h3>
      <p>Please review your cluster configuration before completing the setup:</p>
      
      <div class="review-sections">
        <div class="review-section">
          <h4><i class="fas fa-sitemap"></i> Deployment Type</h4>
          <div class="review-item">
            <strong>${wizardData.deploymentType === 'all-in-one' ? 'All-in-One' : 'Multi-Node'}</strong>
            <p>${wizardData.deploymentType === 'all-in-one' 
              ? 'All OpenStack services on a single host' 
              : 'Distributed deployment across multiple hosts'}</p>
          </div>
        </div>
        
        <div class="review-section">
          <h4><i class="fas fa-server"></i> Configured Hosts (${allHosts.length})</h4>
          <div class="hosts-review">
            ${allHosts.map(host => `
              <div class="host-review-card">
                <div class="host-info">
                  <strong>${host.hostname}</strong>
                  <span class="host-ip">${host.ip}</span>
                </div>
                <div class="host-roles">
                  ${(host.roles || []).map(role => `<span class="role-tag ${role}">${role}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="review-section">
          <h4><i class="fas fa-key"></i> SSH Configuration</h4>
          <div class="review-item">
            <div class="ssh-status">
              ${wizardData.sshSetup ? 
                '<i class="fas fa-check-circle text-success"></i> SSH keys configured' :
                '<i class="fas fa-exclamation-triangle text-warning"></i> SSH setup skipped'
              }
            </div>
            <p>${wizardData.sshSetup ? 
              'SSH keys have been generated and are ready for deployment' :
              'You can configure SSH access later in the SSH tab'
            }</p>
          </div>
        </div>
        
        <div class="review-section">
          <h4><i class="fas fa-file-alt"></i> Generated Files</h4>
          <div class="review-item">
            <p>The following configuration files will be created:</p>
            <ul>
              <li><code>/etc/xavs/nodes.json</code> - Host configuration (JSON format)</li>
              <li><code>/etc/xavs/nodes.yml</code> - Host configuration (YAML format)</li>
              <li><code>/etc/xavs/inventory/multinode</code> - Ansible inventory file</li>
            </ul>
          </div>
        </div>
      </div>
      
      <div class="next-steps">
        <h4><i class="fas fa-rocket"></i> What's Next?</h4>
        <div class="next-steps-content">
          <div class="step-item">
            <i class="fas fa-check"></i>
            <span>Configuration files will be saved</span>
          </div>
          <div class="step-item">
            <i class="fas fa-check"></i>
            <span>Hosts will be validated for deployment readiness</span>
          </div>
          <div class="step-item">
            <i class="fas fa-arrow-right"></i>
            <span>You'll be able to proceed to the deployment module</span>
          </div>
        </div>
      </div>
      
      <div class="completion-note">
        <div class="info-box">
          <i class="fas fa-lightbulb"></i>
          <p>After completing this wizard, you can always return to modify your configuration 
             using the advanced interface.</p>
        </div>
      </div>
    </div>
  `;
}

async function loadConfig() {
  addToLog("Loading configuration...");
  
  // First-run detection
  try {
    const isFirstRun = await firstRunManager.detectFirstRun();
    
    if (isFirstRun) {
      addToLog("First-run detected - initializing guided setup", "info");
      await initializeFirstRunWizard();
      return;
    }
  } catch (error) {
    addToLog("First-run detection failed, continuing with standard mode: " + error.message, "warning");
  }
  
  // Standard configuration loading
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

// Save button functionality
const saveAllBtn = document.getElementById('save-all-formats');
const saveJsonBtn = document.getElementById('save-json');
const saveYamlBtn = document.getElementById('save-yaml');
const saveInventoryBtn = document.getElementById('save-inventory');

if (saveAllBtn) {
  saveAllBtn.addEventListener('click', async () => {
    try {
      addToLog("Saving all formats...");
      await saveHostsAndFormats(hosts);
      addToLog("All formats saved successfully", "success");
    } catch (error) {
      addToLog("Failed to save formats: " + error.message, "error");
    }
  });
}

if (saveJsonBtn) {
  saveJsonBtn.addEventListener('click', async () => {
    try {
      addToLog("Saving JSON format...");
      const jsonData = JSON.stringify(hosts, null, 2) + "\n";
      await cockpit.file(CONFIG_PATH, { superuser: "try" }).replace(jsonData);
      addToLog("JSON saved successfully", "success");
    } catch (error) {
      addToLog("Failed to save JSON: " + error.message, "error");
    }
  });
}

if (saveYamlBtn) {
  saveYamlBtn.addEventListener('click', async () => {
    try {
      addToLog("Saving YAML format...");
      const formats = await saveHostsAndFormats(hosts);
      addToLog("YAML saved successfully", "success");
    } catch (error) {
      addToLog("Failed to save YAML: " + error.message, "error");
    }
  });
}

if (saveInventoryBtn) {
  saveInventoryBtn.addEventListener('click', async () => {
    try {
      addToLog("Saving Ansible inventory...");
      const formats = await saveHostsAndFormats(hosts);
      addToLog("Ansible inventory saved successfully", "success");
    } catch (error) {
      addToLog("Failed to save inventory: " + error.message, "error");
    }
  });
}

/* Initialize everything */
// Set default active tabs
switchTab('panel-hosts');
switchSubTab('tab-single');

// Initialize format tab event listeners  
const formatBtns = document.querySelectorAll('#format-json, #format-yaml, #format-inventory');
formatBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    switchFormatTab(btn.id);
  });
});

// Module initialization
addToLog("xAVS Host Management module started", "info");
addToLog("Initializing user interface components", "info");

// Check for required tools
checkRequiredTools().then(result => {
  if (result.missing.length > 0) {
    addToLog(`Missing tools: ${result.missing.join(', ')}. Some features may not work.`, "warning");
  } else {
    addToLog("All required tools are available", "success");
  }
}).catch(error => {
  addToLog("Failed to check required tools: " + error.message, "error");
});

// Load configuration
loadConfig();
