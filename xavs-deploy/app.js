/*
 * XAVS Deploy - Kolla Ansible GUI
 * Production version - Complete SOP integration with safety features
 * Copyright 2025 - XAVS Project
 */

(() => {
  const INVENTORY = "/root/xdeploy/nodes";
  const VENV_ACTIVATE = "/opt/xenv/bin/activate";

  // Commands that DO NOT support -t (services/tags) based on SOP
  const NO_TAG_COMMANDS = new Set([
    "bootstrap-servers",
    "mariadb_recovery",
    "mariadb_backup",
    "rabbitmq-reset-state",
    "rabbitmq-upgrade",
    "deploy-bifrost",
    "deploy-servers", 
    "upgrade-bifrost",
    "certificates",
    "octavia-certificates",
    "nova-libvirt-cleanup",
    "genconfig",
    "validate-config",
    "gather-facts",
    "stop",
    "destroy"
  ]);

  // Commands that require --yes-i-really-really-mean-it flag
  const DANGEROUS_COMMANDS = new Set([
    "stop",
    "destroy"
  ]);

  const els = {
    command: document.getElementById("command"),
    servicesSection: document.getElementById("services-section"),
    servicesDropdown: document.getElementById("services-dropdown"),
    servicesTrigger: document.getElementById("services-trigger"),
    servicesContent: document.getElementById("services-content"),
    servicesPlaceholder: document.getElementById("services-placeholder"),
    servicesSearch: document.getElementById("services-search"),
    servicesOptions: document.getElementById("services-options"),
    customServices: document.getElementById("custom-services"),
    serviceStatus: document.getElementById("service-status"),
    servicesSummary: document.getElementById("services-summary"),
    limitHostsBox: document.getElementById("limit-hosts-box"),
    tagInput: document.getElementById("tag-input"),
    availableHosts: document.getElementById("available-hosts"),
    selectedHosts: document.getElementById("selected-hosts"),
    refreshHostsBtn: document.getElementById("refreshHostsBtn"),
    toggleTasksBtn: document.getElementById("toggleTasksBtn"),
    toggleConsoleBtn: document.getElementById("toggleConsoleBtn"),
    progressBody: document.getElementById("progress-body"),
    consoleBody: document.getElementById("console-body"),
    runBtn: document.getElementById("runBtn"),
    clearBtn: document.getElementById("clearBtn"),
    console: document.getElementById("console-output"),
    progressSection: document.getElementById("progress-section"),
    playbookProgress: document.getElementById("playbook-progress"),
    tasksList: document.getElementById("tasks-list"),
    summaryStats: document.getElementById("summary-stats"),
    taskCount: document.getElementById("task-count"),
    dryRunCheck: document.getElementById("dryRunCheck"),
    backupType: document.getElementById("backupType"),
    backupOptions: document.getElementById("backup-options"),
    dangerWarning: document.getElementById("danger-warning")
  };

  let runningProc = null;
  let userStopped = false;
  let currentPlaybook = "";
  let currentTaskName = ""; // Track current task name for text parsing
  let taskBuffer = "";
  let playbookStats = {
    ok: 0,
    changed: 0,
    unreachable: 0,
    failed: 0,
    skipped: 0,
    total: 0
  };

  const selectedHosts = new Set();
  const selectedServices = new Set();
  let hostMode = 'all'; // 'all', 'limit', 'tags'
  let availableHostsList = [];

  /* ---------- console ---------- */
  function appendConsole(text) {
    if (!els.console) return;
    els.console.textContent += text;
    els.console.scrollTop = els.console.scrollHeight;
  }

  /* ---------- progress tracking ---------- */
  function resetProgress() {
    playbookStats = { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, total: 0 };
    taskBuffer = "";
    currentPlaybook = "";
    currentTaskName = ""; // Reset current task name
    if (els.tasksList) els.tasksList.innerHTML = "";
    if (els.summaryStats) updateSummaryStats();
    if (els.playbookProgress) els.playbookProgress.innerHTML = "";
  }

  function updateSummaryStats() {
    if (!els.summaryStats) return;
    els.summaryStats.innerHTML = `
      <div class="stat-item ok">✓ ${playbookStats.ok}</div>
      <div class="stat-item changed">⚡ ${playbookStats.changed}</div>
      <div class="stat-item failed">✗ ${playbookStats.failed}</div>
      <div class="stat-item skipped">⊘ ${playbookStats.skipped}</div>
      <div class="stat-item unreachable">⚠ ${playbookStats.unreachable}</div>
    `;
    
    // Update task count
    if (els.taskCount) {
      els.taskCount.textContent = `(${playbookStats.total} tasks)`;
    }
  }

  function addTaskToDisplay(taskData) {
    if (!els.tasksList) return;
    
    const taskElement = document.createElement("div");
    taskElement.className = `task-item ${taskData.status}`;
    
    const statusIcon = {
      'ok': '✓',
      'changed': '⚡',
      'failed': '✗',
      'skipped': '⊘',
      'unreachable': '⚠'
    }[taskData.status] || '?';

    const duration = taskData.duration ? ` (${taskData.duration}s)` : '';
    
    taskElement.innerHTML = `
      <div class="task-header">
        <span class="task-status">${statusIcon}</span>
        <span class="task-name">${taskData.name}</span>
        <span class="task-host">${taskData.host}</span>
        <span class="task-duration">${duration}</span>
      </div>
      ${taskData.msg ? `<div class="task-msg">${taskData.msg}</div>` : ''}
    `;
    
    els.tasksList.appendChild(taskElement);
    
    // Auto-scroll to bottom to show latest task
    requestAnimationFrame(() => {
      if (els.tasksList) {
        els.tasksList.scrollTop = els.tasksList.scrollHeight;
      }
    });
  }

  function updatePlaybookProgress(playbookName) {
    if (!els.playbookProgress) return;
    currentPlaybook = playbookName;
    els.playbookProgress.innerHTML = `
      <div class="playbook-name">📋 ${playbookName}</div>
      <div class="playbook-status">Running...</div>
    `;
  }

  function parseAnsibleOutput(data) {
    taskBuffer += data;
    const lines = taskBuffer.split('\n');
    taskBuffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Try to parse as JSON first
      try {
        const jsonData = JSON.parse(line);
        
        if (jsonData.type === 'playbook_start') {
          updatePlaybookProgress(jsonData.playbook);
          appendConsole(`📋 Starting playbook: ${jsonData.playbook}\n`);
        }
        else if (jsonData.type === 'task_start') {
          appendConsole(`⏱ Task: ${jsonData.task}\n`);
        }
        else if (jsonData.type === 'runner_on_ok') {
          const taskData = {
            name: jsonData.task || 'Unknown task',
            host: jsonData.host || 'localhost',
            status: jsonData.changed ? 'changed' : 'ok',
            duration: jsonData.duration,
            msg: jsonData.res?.msg || ''
          };
          addTaskToDisplay(taskData);
          playbookStats[taskData.status]++;
          playbookStats.total++;
          updateSummaryStats();
        }
        else if (jsonData.type === 'runner_on_failed') {
          const taskData = {
            name: jsonData.task || 'Unknown task',
            host: jsonData.host || 'localhost',
            status: 'failed',
            duration: jsonData.duration,
            msg: jsonData.res?.msg || jsonData.res?.stderr || 'Task failed'
          };
          addTaskToDisplay(taskData);
          playbookStats.failed++;
          playbookStats.total++;
          updateSummaryStats();
        }
        else if (jsonData.type === 'runner_on_skipped') {
          const taskData = {
            name: jsonData.task || 'Unknown task',
            host: jsonData.host || 'localhost',
            status: 'skipped',
            duration: jsonData.duration,
            msg: jsonData.res?.msg || 'Task skipped'
          };
          addTaskToDisplay(taskData);
          playbookStats.skipped++;
          playbookStats.total++;
          updateSummaryStats();
        }
        else if (jsonData.type === 'runner_on_unreachable') {
          const taskData = {
            name: jsonData.task || 'Unknown task',
            host: jsonData.host || 'localhost',
            status: 'unreachable',
            duration: jsonData.duration,
            msg: jsonData.res?.msg || 'Host unreachable'
          };
          addTaskToDisplay(taskData);
          playbookStats.unreachable++;
          playbookStats.total++;
          updateSummaryStats();
        }
        else if (jsonData.type === 'playbook_stats') {
          if (els.playbookProgress) {
            const totalHosts = Object.keys(jsonData.stats || {}).length;
            els.playbookProgress.innerHTML = `
              <div class="playbook-name">📋 ${currentPlaybook}</div>
              <div class="playbook-status">✅ Completed (${totalHosts} hosts)</div>
            `;
          }
          appendConsole(`\n📊 Playbook completed. Final stats:\n`);
          Object.entries(jsonData.stats || {}).forEach(([host, stats]) => {
            appendConsole(`  ${host}: ok=${stats.ok} changed=${stats.changed} unreachable=${stats.unreachable} failed=${stats.failed} skipped=${stats.skipped}\n`);
          });
        }
        continue; // Successfully parsed JSON, continue to next line
      } catch (e) {
        // Not JSON output, parse as regular Ansible text output
      }

      // Parse regular Ansible text output for key information
      const lineText = line.trim();
      
      // Detect task names in standard format
      if (lineText.startsWith('TASK [') && lineText.includes(']')) {
        const taskMatch = lineText.match(/TASK \[(.*?)\]/);
        if (taskMatch) {
          currentTaskName = taskMatch[1]; // Store current task name
          appendConsole(`⏱ ${currentTaskName}\n`);
          if (els.playbookProgress && !currentPlaybook) {
            updatePlaybookProgress('Ansible Playbook');
          }
        }
        continue;
      }

      // Detect play names
      if (lineText.startsWith('PLAY [') && lineText.includes(']')) {
        const playMatch = lineText.match(/PLAY \[(.*?)\]/);
        if (playMatch) {
          const playName = playMatch[1];
          updatePlaybookProgress(playName);
          appendConsole(`📋 ${playName}\n`);
          currentTaskName = ""; // Reset task name for new play
        }
        continue;
      }

      // Detect task results (ok, changed, failed, etc.)
      const resultPatterns = [
        { pattern: /^ok:\s*\[(.*?)\]/, status: 'ok' },
        { pattern: /^changed:\s*\[(.*?)\]/, status: 'changed' },
        { pattern: /^failed:\s*\[(.*?)\]/, status: 'failed' },
        { pattern: /^skipping:\s*\[(.*?)\]/, status: 'skipped' },
        { pattern: /^unreachable:\s*\[(.*?)\]/, status: 'unreachable' },
        { pattern: /^fatal:\s*\[(.*?)\]/, status: 'failed' } // Add fatal as failed
      ];

      for (const { pattern, status } of resultPatterns) {
        const match = lineText.match(pattern);
        if (match) {
          const host = match[1];
          
          // Try to extract additional message information
          let msg = '';
          if ((status === 'failed') && lineText.includes('=>')) {
            // Extract failure message if available
            const msgMatch = lineText.match(/=>\s*(.*)$/);
            if (msgMatch) {
              msg = msgMatch[1].trim();
            }
          } else if (status === 'skipped' && lineText.includes('=>')) {
            // Extract skip reason if available  
            const msgMatch = lineText.match(/=>\s*(.*)$/);
            if (msgMatch) {
              msg = msgMatch[1].trim();
            }
          }
          
          const taskData = {
            name: currentTaskName || 'Unknown Task', // Use stored task name
            host: host,
            status: status,
            msg: msg
          };
          
          addTaskToDisplay(taskData);
          playbookStats[status]++;
          playbookStats.total++;
          updateSummaryStats();
          break;
        }
      }

      // Always append to console for full visibility
      appendConsole(line + '\n');
    }
  }

  /* ---------- services ---------- */
  function updateServiceStatus() {
    if (!els.serviceStatus) return;
    
    const cmd = els.command?.value;
    const selectedCount = selectedServices.size;
    const customCount = getCustomServices().length;
    const totalSelected = selectedCount + customCount;
    
    if (NO_TAG_COMMANDS.has(cmd)) {
      els.serviceStatus.innerHTML = '<span class="pill warning">Services disabled for this command</span>';
      updateServicesSummary('disabled');
    } else if (totalSelected === 0) {
      els.serviceStatus.innerHTML = '<span class="pill info">All services (default)</span>';
      updateServicesSummary('all');
    } else {
      els.serviceStatus.innerHTML = `<span class="pill success">${totalSelected} service${totalSelected > 1 ? 's' : ''} selected</span>`;
      updateServicesSummary('selected', totalSelected);
    }
  }
  
  function updateServicesSummary(state, count = 0) {
    if (!els.servicesSummary) return;
    
    let content = '';
    let className = 'services-summary';
    
    switch (state) {
      case 'disabled':
        content = '⚠️ Service selection is disabled for this command. The operation will apply to all relevant services automatically.';
        className += ' disabled';
        break;
      case 'all':
        content = '🌐 No specific services selected. The command will apply to all relevant services (default behavior).';
        break;
      case 'selected':
        const services = [...selectedServices];
        const customServices = getCustomServices();
        const allSelected = [...services, ...customServices];
        content = `🎯 Selected services: <strong>${allSelected.join(', ')}</strong> (${count} service${count > 1 ? 's' : ''})`;
        break;
    }
    
    els.servicesSummary.innerHTML = content;
    els.servicesSummary.className = className;
  }
  
  function grayServices(disabled) {
    if (!els.servicesSection) return;
    
    els.servicesSection.style.opacity = disabled ? 0.4 : 1;
    els.servicesSection.style.pointerEvents = disabled ? "none" : "auto";
    
    if (els.customServices) {
      els.customServices.disabled = disabled;
    }
    
    // Add visual feedback to multiselect dropdown
    if (els.servicesOptions) {
      const checkboxes = els.servicesOptions.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        const option = checkbox.closest('.multiselect-option');
        if (option) {
          checkbox.disabled = disabled;
          if (disabled) {
            checkbox.checked = false;
            selectedServices.delete(checkbox.value);
            option.style.opacity = "0.5";
            option.style.cursor = "not-allowed";
          } else {
            option.style.opacity = "1";
            option.style.cursor = "pointer";
          }
        }
      });
      updateServiceSelection();
    }
    
    updateServiceStatus();
  }

  function initMultiselectDropdown() {
    if (!els.servicesDropdown || !els.servicesTrigger || !els.servicesContent) return;

    // Toggle dropdown
    els.servicesTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      els.servicesDropdown.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!els.servicesDropdown.contains(e.target)) {
        els.servicesDropdown.classList.remove('open');
      }
    });

    // Search functionality
    if (els.servicesSearch) {
      els.servicesSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const options = els.servicesOptions.querySelectorAll('.multiselect-option');
        
        options.forEach(option => {
          const label = option.querySelector('.option-label').textContent.toLowerCase();
          const description = option.querySelector('.option-description').textContent.toLowerCase();
          const matches = label.includes(searchTerm) || description.includes(searchTerm);
          option.style.display = matches ? 'flex' : 'none';
        });

        // Hide/show groups based on visible options
        const groups = els.servicesOptions.querySelectorAll('.multiselect-group');
        groups.forEach(group => {
          const visibleOptions = group.querySelectorAll('.multiselect-option:not([style*="none"])');
          group.style.display = visibleOptions.length > 0 ? 'block' : 'none';
        });
      });
    }

    // Handle checkbox changes
    if (els.servicesOptions) {
      els.servicesOptions.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
          const service = e.target.value;
          if (e.target.checked) {
            selectedServices.add(service);
          } else {
            selectedServices.delete(service);
          }
          updateServiceSelection();
        }
      });
    }

    // Initialize custom services input handler
    if (els.customServices) {
      els.customServices.addEventListener('input', () => {
        updateServiceSelection();
      });
    }
  }

  function updateServiceSelection() {
    updateServicePlaceholder();
    updateServicesSummary();
    updateServiceStatus();
  }

  function updateServicePlaceholder() {
    if (!els.servicesPlaceholder) return;

    const selectedCount = selectedServices.size;
    const customServices = getCustomServices();
    const totalSelected = selectedCount + customServices.length;

    if (totalSelected === 0) {
      els.servicesPlaceholder.textContent = 'Select services...';
      els.servicesPlaceholder.classList.remove('has-selection');
    } else if (totalSelected === 1) {
      const allSelected = [...selectedServices, ...customServices];
      els.servicesPlaceholder.textContent = allSelected[0];
      els.servicesPlaceholder.classList.add('has-selection');
    } else {
      els.servicesPlaceholder.textContent = `${totalSelected} services selected`;
      els.servicesPlaceholder.classList.add('has-selection');
    }
  }

  function getCustomServices() {
    return els.customServices?.value ? 
      els.customServices.value.split(",").map(s => s.trim()).filter(Boolean) : [];
  }
  function getSelectedServices() {
    const extra = getCustomServices();
    return [...selectedServices, ...extra];
  }

  /* ---------- hosts ---------- */
  function initHostTabs() {
    const tabs = document.querySelectorAll('.host-tab');
    const tabContents = document.querySelectorAll('.host-tab-content');
    const hostModeRadios = document.querySelectorAll('input[name="host-mode"]');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        
        // Update tab appearance
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update tab content
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabId}-hosts-tab`).classList.add('active');
        
        // Update radio button
        const radio = document.querySelector(`input[name="host-mode"][value="${tabId}"]`);
        if (radio) {
          radio.checked = true;
          hostMode = tabId;
        }
        
        // Enable/disable inputs based on selection
        updateHostInputStates();
        updateSelectedConfiguration();
      });
    });
    
    hostModeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        hostMode = radio.value;
        updateHostInputStates();
        updateSelectedConfiguration();
      });
    });
    
    // Tag input handling
    if (els.tagInput) {
      els.tagInput.addEventListener('input', updateSelectedConfiguration);
    }
    
    // Custom services input handling  
    if (els.customServices) {
      els.customServices.addEventListener('input', updateServiceStatus);
    }
  }
  
  function updateHostInputStates() {
    // Enable/disable tag input based on selection
    if (els.tagInput) {
      els.tagInput.disabled = hostMode !== 'tags';
    }
    
    // Clear selections when switching modes for better UX
    if (hostMode !== 'limit') {
      selectedHosts.clear();
      // Uncheck all checkboxes in limit hosts
      els.limitHostsBox?.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
      });
    }
    
    if (hostMode !== 'tags') {
      if (els.tagInput) {
        els.tagInput.value = '';
      }
    }
    
    // Reset all tabs to their default state (remove any inline styles)
    const allTabs = document.querySelectorAll('.host-tab');
    allTabs.forEach(tab => {
      tab.style.backgroundColor = '';
      tab.style.color = '';
      tab.classList.remove('active');
    });
    
    // Add active class to current tab (CSS will handle the styling)
    const activeTab = document.querySelector(`[data-tab="${hostMode}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }
  }
  
  function updateSelectedConfiguration() {
    if (!els.selectedHosts) return;
    
    let configText = '';
    let statusClass = 'info';
    let hostCount = 0;
    
    switch (hostMode) {
      case 'all':
        hostCount = availableHostsList.length;
        configText = `🌐 All hosts from inventory (${hostCount} hosts)`;
        if (hostCount === 0) {
          configText = '⚠️ No hosts found in inventory - check inventory file';
          statusClass = 'warning';
        } else {
          statusClass = 'success';
        }
        break;
      case 'limit':
        const limitedHosts = [...selectedHosts];
        hostCount = limitedHosts.length;
        if (hostCount === 0) {
          configText = '⚠️ No hosts selected - please select hosts in the "Select Hosts" tab above';
          statusClass = 'warning';
        } else {
          configText = `🎯 Selected hosts: ${limitedHosts.join(', ')} (${hostCount} hosts)`;
          statusClass = 'success';
        }
        break;
      case 'tags':
        const tags = els.tagInput?.value.trim();
        if (!tags) {
          configText = '⚠️ No host patterns specified - enter patterns in the "Host Patterns" tab above';
          statusClass = 'warning';
        } else {
          configText = `🏷️ Host patterns: ${tags}`;
          statusClass = 'success';
        }
        break;
    }
    
    const pillClass = `pill ${statusClass}`;
    const hostInfo = hostCount > 0 ? `<div class="host-count-info">Targeting ${hostCount} host${hostCount !== 1 ? 's' : ''}</div>` : '';
    els.selectedHosts.innerHTML = `
      <div class="${pillClass}">${configText}</div>
      ${hostInfo}
    `;
  }

  function renderSelectedPills() {
    updateSelectedConfiguration();
  }

  function onHostToggle(host, checked) {
    if (checked) {
      selectedHosts.add(host);
    } else {
      selectedHosts.delete(host);
    }
    updateSelectedConfiguration();
  }

  function renderHostCheckboxes(hosts) {
    if (!els.limitHostsBox) return;
    
    els.limitHostsBox.innerHTML = "";
    
    if (hosts === null) {
      els.limitHostsBox.innerHTML = '<div class="muted">Loading hosts from inventory...</div>';
      if (els.availableHosts) {
        els.availableHosts.innerHTML = '<div class="muted">Loading...</div>';
      }
      return;
    }
    
    // Store available hosts for reference
    availableHostsList = hosts;
    
    // Render checkboxes for limit selection
    hosts.forEach(h => {
      const lb = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; 
      cb.className = "bxc"; 
      cb.value = h;
      cb.addEventListener("change", e => onHostToggle(h, e.target.checked));
      lb.appendChild(cb); 
      lb.append(` ${h}`);
      els.limitHostsBox.appendChild(lb);
    });
    
    // Update available hosts list
    renderAvailableHostsList(hosts);
    updateSelectedConfiguration();
  }
  
  function renderAvailableHostsList(hosts) {
    if (!els.availableHosts) return;
    
    if (hosts.length === 0) {
      els.availableHosts.innerHTML = '<div class="muted">No hosts found in inventory</div>';
      return;
    }
    
    // Add header with clear explanation
    els.availableHosts.innerHTML = '<div class="host-info-header" style="font-size: 11px; color: #666; margin-bottom: 4px; font-style: italic;">📋 Inventory hosts (for reference - use tabs above to select):</div>';
    
    const hostContainer = document.createElement('div');
    hostContainer.className = 'host-container';
    hostContainer.style.cssText = 'background: #f8f9fa; padding: 8px; border-radius: 4px; border: 1px solid #e9ecef;';
    
    hosts.forEach((host, index) => {
      const hostSpan = document.createElement('span');
      hostSpan.className = 'host-item';
      hostSpan.style.cssText = 'color: #495057; font-weight: 500;';
      hostSpan.textContent = host;
      hostContainer.appendChild(hostSpan);
      
      // Add comma separator except for last item
      if (index < hosts.length - 1) {
        const separator = document.createElement('span');
        separator.className = 'host-separator';
        separator.textContent = ', ';
        separator.style.color = '#6c757d';
        hostContainer.appendChild(separator);
      }
    });
    
    els.availableHosts.appendChild(hostContainer);
  }

  /* ---------- inventory parsing ---------- */
  function parseInventory(text) {
    const hosts = new Set();
    const lines = text.split(/\r?\n/);
    let currentSection = null;
    
    for (const raw of lines) {
      const line = raw.replace(/[#;].*$/, "").trim();
      if (!line) continue;
      
      // Check for section headers [section_name]
      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        continue;
      }
      
      // Skip :children and :vars sections
      if (currentSection && (currentSection.endsWith(':children') || currentSection.endsWith(':vars'))) {
        continue;
      }
      
      // Extract hostname from any section (except special sections)
      if (currentSection && !currentSection.includes(':')) {
        const host = line.split(/\s+/)[0];
        if (host && !host.startsWith("[")) {
          hosts.add(host);
        }
      }
    }
    
    const hostList = [...hosts].sort((a,b)=>a.localeCompare(b));
    return hostList;
  }
  async function loadHosts() {
    try {
      const file = cockpit.file(INVENTORY, { superuser:"try" });
      const txt = await file.read();
      
      if (!txt.trim()) {
        renderHostCheckboxes([]);
        appendConsole(`(warn) Inventory file is empty. Using all hosts.\n`);
        return;
      }
      
      const hosts = parseInventory(txt);
      
      if (hosts.length === 0) {
        appendConsole(`(warn) No hosts found in inventory file. Using all hosts.\n`);
      } else {
        appendConsole(`(info) Loaded ${hosts.length} hosts from inventory: ${hosts.join(', ')}\n`);
      }
      
      renderHostCheckboxes(hosts);
    } catch (error) {
      renderHostCheckboxes([]); // at least show (all)
      appendConsole(`(warn) Unable to read hosts from inventory file: ${error.message || error}. Using all hosts.\n`);
    }
  }

  /* ---------- collapsible sections ---------- */
  function initCollapsibleSections() {
    if (els.toggleTasksBtn && els.tasksList) {
      els.toggleTasksBtn.addEventListener('click', () => {
        // Check if element is currently visible using computed style
        const currentDisplay = window.getComputedStyle(els.tasksList).display;
        const isCurrentlyVisible = currentDisplay !== 'none';
        
        els.tasksList.style.display = isCurrentlyVisible ? 'none' : '';
        els.toggleTasksBtn.textContent = isCurrentlyVisible ? '+' : '−';
        
        // Toggle minimized class on the tasks container for proper collapsing
        const tasksContainer = els.tasksList.closest('.tasks-container');
        if (tasksContainer) {
          tasksContainer.classList.toggle('minimized', isCurrentlyVisible);
        }
        
        // Add some visual feedback
        els.toggleTasksBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
          els.toggleTasksBtn.style.transform = '';
        }, 100);
      });
    }
    
    if (els.toggleConsoleBtn && els.consoleBody) {
      els.toggleConsoleBtn.addEventListener('click', () => {
        // Check if element is currently visible using computed style
        const currentDisplay = window.getComputedStyle(els.consoleBody).display;
        const isCurrentlyVisible = currentDisplay !== 'none';
        
        els.consoleBody.style.display = isCurrentlyVisible ? 'none' : '';
        els.toggleConsoleBtn.textContent = isCurrentlyVisible ? '+' : '−';
        
        // Toggle minimized class on the card
        const card = els.toggleConsoleBtn.closest('.card');
        if (card) {
          card.classList.toggle('minimized', isCurrentlyVisible);
        }
        
        // Add some visual feedback
        els.toggleConsoleBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
          els.toggleConsoleBtn.style.transform = '';
        }, 100);
      });
    }
  }

  /* ---------- options handling ---------- */
  function updateOptionsVisibility() {
    const cmd = els.command.value;
    
    // Show backup options only for mariadb_backup command
    if (els.backupOptions) {
      els.backupOptions.style.display = cmd === "mariadb_backup" ? "block" : "none";
    }
    
    // Show warning for dangerous commands
    if (els.dangerWarning) {
      if (DANGEROUS_COMMANDS.has(cmd)) {
        els.dangerWarning.style.display = "block";
        els.dangerWarning.innerHTML = `
          <div class="warning-box">
            ⚠️ <strong>Dangerous Operation!</strong><br>
            <small>This command will automatically include --yes-i-really-really-mean-it</small>
          </div>
        `;
      } else {
        els.dangerWarning.style.display = "none";
      }
    }
  }

  /* ---------- build command ---------- */
  function buildCommand() {
    if (!els.command) {
      appendConsole("Error: Command element not found\n");
      return '';
    }
    
    const cmd = els.command.value;
    const services = getSelectedServices();
    let extraFlags = "";
    
    // Add --check flag if dry run is selected
    if (els.dryRunCheck && els.dryRunCheck.checked) {
      extraFlags += " --check";
    }

    // Add dangerous command confirmation flag
    if (DANGEROUS_COMMANDS.has(cmd)) {
      extraFlags += " --yes-i-really-really-mean-it";
    }

    // Build --tags argument for service-specific operations
    const tagsArg = NO_TAG_COMMANDS.has(cmd) ? "" : (services.length ? ` --tags ${services.join(",")}` : "");

    // Build --limit argument for host targeting
    let limitArg = "";
    switch (hostMode) {
      case 'limit':
        if (selectedHosts.size > 0) {
          limitArg = ` --limit ${[...selectedHosts].join(",")}`;
        }
        break;
      case 'tags':
        const hostTags = els.tagInput?.value.trim();
        if (hostTags) {
          limitArg = ` --limit ${hostTags}`;
        }
        break;
      case 'all':
      default:
        // No limit argument for all hosts mode
        break;
    }

    // Special handling for specific commands
    let specialArgs = "";
    
    // MariaDB backup type
    if (cmd === "mariadb_backup") {
      const backupType = els.backupType?.value || "full";
      if (backupType === "incremental") {
        specialArgs += " --incremental";
      } else {
        specialArgs += " --full";
      }
    }
    
    // RabbitMQ upgrade version (example)
    if (cmd === "rabbitmq-upgrade") {
      // Could add UI for version selection
      specialArgs += " 3.13";
    }
    
    // Octavia certificate expiry check
    if (cmd === "octavia-certificates" && els.dryRunCheck && els.dryRunCheck.checked) {
      specialArgs += " --check-expiry 30";
    }

    // Build command to match manual execution format
    return `source ${VENV_ACTIVATE} && kolla-ansible -i ${INVENTORY} ${cmd}${tagsArg}${limitArg}${specialArgs}${extraFlags}`.trim();
  }

  /* ---------- run / stop ---------- */
  function setRunningUI(on){
    if (!els.runBtn) return;
    if (on){ els.runBtn.classList.remove("primary"); els.runBtn.classList.add("danger"); els.runBtn.textContent="Stop"; }
    else   { els.runBtn.classList.remove("danger");  els.runBtn.classList.add("primary"); els.runBtn.textContent="Run"; }
  }

  function start() {
    const finalCmd = buildCommand();
    userStopped = false;
    resetProgress();
    setRunningUI(true);
    
    if (els.command && els.command.value) {
      appendConsole(`▶ ${els.command.value} started at ${new Date().toLocaleString()}\n`);
    } else {
      appendConsole(`▶ Command started at ${new Date().toLocaleString()}\n`);
    }

    const opts = { err:"out", superuser:"try" };
    runningProc = cockpit.spawn(["bash","-lc", finalCmd], opts);

    runningProc.stream(data => {
      parseAnsibleOutput(data);
    });

    runningProc.done(() => {
      if (userStopped) {
        appendConsole(`\n⏹ Stopped\n`);
        if (els.playbookProgress) {
          els.playbookProgress.innerHTML = `
            <div class="playbook-name">📋 ${currentPlaybook || 'Unknown'}</div>
            <div class="playbook-status">⏹ Stopped by user</div>
          `;
        }
      } else {
        appendConsole(`\n✔ Completed\n`);
      }
      runningProc = null; 
      setRunningUI(false);
    });

    runningProc.fail(ex => {
      if (userStopped) {
        appendConsole(`\n⏹ Stopped\n`);
        if (els.playbookProgress) {
          els.playbookProgress.innerHTML = `
            <div class="playbook-name">📋 ${currentPlaybook || 'Unknown'}</div>
            <div class="playbook-status">⏹ Stopped by user</div>
          `;
        }
      } else {
        appendConsole(`\n✖ Failed: ${ex}\n`);
        if (els.playbookProgress) {
          els.playbookProgress.innerHTML = `
            <div class="playbook-name">📋 ${currentPlaybook || 'Unknown'}</div>
            <div class="playbook-status">❌ Failed</div>
          `;
        }
      }
      runningProc = null; 
      setRunningUI(false);
    });
  }

  function stop() {
    if (!runningProc) return;
    userStopped = true;
    try { runningProc.input && runningProc.input("\x03"); } catch {}
    setTimeout(() => { try { runningProc.close && runningProc.close(); } catch {} }, 200);
    appendConsole(`\n… stopping\n`);
  }

  /* ---------- init ---------- */
  function init() {
    // Initialize multiselect dropdown
    initMultiselectDropdown();
    
    if (els.runBtn) {
      els.runBtn.addEventListener("click", () => runningProc ? stop() : start());
    }
    
    if (els.clearBtn) {
      els.clearBtn.addEventListener("click", () => { 
        if (els.console) {
          els.console.textContent = "";
        }
        resetProgress();
      });
    }
    
    // Add refresh hosts button
    if (els.refreshHostsBtn) {
      els.refreshHostsBtn.addEventListener("click", () => {
        appendConsole("(info) Refreshing hosts from inventory...\n");
        renderHostCheckboxes(null);
        loadHosts();
      });
    }

    els.command.addEventListener("change", () => {
      grayServices(NO_TAG_COMMANDS.has(els.command.value));
      updateOptionsVisibility();
      updateServiceStatus();
    });

    grayServices(NO_TAG_COMMANDS.has(els.command.value)); // bootstrap-servers disables -t
    updateOptionsVisibility(); // Initialize options visibility
    updateServiceStatus(); // Initialize service status
    resetProgress(); // Initialize progress display
    
    // Initialize new features
    initHostTabs();
    initCollapsibleSections();
    
    // Show loading state while loading hosts
    renderHostCheckboxes(null);
    loadHosts();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
