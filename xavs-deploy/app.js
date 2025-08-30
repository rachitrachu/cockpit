/*
 * Streaming approach (plain spawn, no colors, no PTY) + UX fixes:
 * - Services & hosts wrap responsively (CSS change in index.html)
 * - Shows "Stopped" (not "Completed") when user cancels
 * - Never prints an error line if the process succeeds
 * - bootstrap-servers default; services disabled for commands without -t
 */

(() => {
  const INVENTORY = "/root/xdeploy/nodes";
  const VENV_ACTIVATE = "/opt/xenv/bin/activate";

  // Commands that DO NOT support -t (services)
  const NO_TAG_COMMANDS = new Set([
    "bootstrap-servers",
    "mariadb_recovery",
    "prune-images",
    "gather-facts"
  ]);

  const els = {
    command: document.getElementById("command"),
    servicesSection: document.getElementById("services-section"),
    servicesGrid: document.getElementById("services-grid"),
    customServices: document.getElementById("custom-services"),
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
    taskCount: document.getElementById("task-count")
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
      els.tasksList.scrollTop = els.tasksList.scrollHeight;
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
          
          // Debug logging
          console.log(`[DEBUG] Matched result: status=${status}, host=${host}, line="${lineText}"`);
          
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
          
          console.log(`[DEBUG] Adding task with status: ${status}`, taskData);
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
  function grayServices(disabled) {
    els.servicesSection.style.opacity = disabled ? 0.4 : 1;
    els.servicesSection.style.pointerEvents = disabled ? "none" : "auto";
    els.customServices.disabled = disabled;
    els.servicesGrid.querySelectorAll(".chip")
      .forEach(c => c.setAttribute("aria-disabled", disabled ? "true" : "false"));
  }
  function onChipClick(e) {
    const chip = e.target.closest(".chip");
    if (!chip || els.servicesSection.style.pointerEvents === "none") return;
    const svc = chip.dataset.svc;
    chip.classList.toggle("active");
    if (chip.classList.contains("active")) selectedServices.add(svc);
    else selectedServices.delete(svc);
  }
  function getSelectedServices() {
    const extra = els.customServices.value.split(",").map(s => s.trim()).filter(Boolean);
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
  }
  
  function updateHostInputStates() {
    // Enable/disable tag input based on selection
    if (els.tagInput) {
      els.tagInput.disabled = hostMode !== 'tags';
    }
  }
  
  function updateSelectedConfiguration() {
    if (!els.selectedHosts) return;
    
    let configText = '';
    
    switch (hostMode) {
      case 'all':
        configText = `All hosts (${availableHostsList.length} hosts)`;
        break;
      case 'limit':
        const limitedHosts = [...selectedHosts];
        if (limitedHosts.length === 0) {
          configText = 'No hosts selected for limit';
        } else {
          configText = `Limited to: ${limitedHosts.join(', ')}`;
        }
        break;
      case 'tags':
        const tags = els.tagInput?.value.trim();
        if (!tags) {
          configText = 'No tags specified';
        } else {
          configText = `Hosts with tags: ${tags}`;
        }
        break;
    }
    
    els.selectedHosts.innerHTML = `<span class="pill">${configText}</span>`;
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
    
    els.availableHosts.innerHTML = '';
    hosts.forEach((host, index) => {
      const hostSpan = document.createElement('span');
      hostSpan.className = 'host-item';
      hostSpan.textContent = host;
      els.availableHosts.appendChild(hostSpan);
      
      // Add comma separator except for last item
      if (index < hosts.length - 1) {
        const separator = document.createElement('span');
        separator.className = 'host-separator';
        separator.textContent = ', ';
        els.availableHosts.appendChild(separator);
      }
    });
  }

  /* ---------- inventory parsing ---------- */
  function parseInventory(text) {
    const hosts = new Set();
    const lines = text.split(/\r?\n/);
    let currentSection = null;
    
    console.log("[DEBUG] Parsing inventory file...");
    
    for (const raw of lines) {
      const line = raw.replace(/[#;].*$/, "").trim();
      if (!line) continue;
      
      // Check for section headers [section_name]
      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        console.log(`[DEBUG] Found section: [${currentSection}]`);
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
          console.log(`[DEBUG] Added host: ${host} from section [${currentSection}]`);
        }
      }
    }
    
    const hostList = [...hosts].sort((a,b)=>a.localeCompare(b));
    console.log(`[DEBUG] Total hosts found: ${hostList.length}`, hostList);
    return hostList;
  }
  async function loadHosts() {
    console.log(`[DEBUG] Loading hosts from inventory: ${INVENTORY}`);
    try {
      const file = cockpit.file(INVENTORY, { superuser:"try" });
      const txt = await file.read();
      console.log(`[DEBUG] Inventory file content length: ${txt.length} characters`);
      
      if (!txt.trim()) {
        console.log("[DEBUG] Inventory file is empty");
        renderHostCheckboxes([]);
        appendConsole(`(warn) Inventory file is empty. Using all hosts.\n`);
        return;
      }
      
      const hosts = parseInventory(txt);
      console.log(`[DEBUG] Parsed ${hosts.length} hosts from inventory`);
      
      if (hosts.length === 0) {
        console.log("[DEBUG] No hosts found in inventory");
        appendConsole(`(warn) No hosts found in inventory file. Using all hosts.\n`);
      } else {
        appendConsole(`(info) Loaded ${hosts.length} hosts from inventory: ${hosts.join(', ')}\n`);
      }
      
      renderHostCheckboxes(hosts);
    } catch (error) {
      console.log(`[DEBUG] Error loading inventory:`, error);
      renderHostCheckboxes([]); // at least show (all)
      appendConsole(`(warn) Unable to read hosts from inventory file: ${error.message || error}. Using all hosts.\n`);
    }
  }

  /* ---------- collapsible sections ---------- */
  function initCollapsibleSections() {
    if (els.toggleTasksBtn) {
      els.toggleTasksBtn.addEventListener('click', () => {
        const isCollapsed = els.tasksList.style.display === 'none';
        els.tasksList.style.display = isCollapsed ? 'block' : 'none';
        els.toggleTasksBtn.textContent = isCollapsed ? '−' : '+';
      });
    }
    
    if (els.toggleConsoleBtn) {
      els.toggleConsoleBtn.addEventListener('click', () => {
        const isCollapsed = els.consoleBody.style.display === 'none';
        els.consoleBody.style.display = isCollapsed ? 'block' : 'none';
        els.toggleConsoleBtn.textContent = isCollapsed ? '−' : '+';
        els.toggleConsoleBtn.parentElement.parentElement.parentElement.classList.toggle('minimized', !isCollapsed);
      });
    }
  }

  /* ---------- build command ---------- */
  function buildCommand() {
    const cmd = els.command.value;
    const services = getSelectedServices();
    const dryRun = els.dryRunFlag && els.dryRunFlag.checked;
    
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
    
    // Add --check for dry run
    const checkArg = dryRun ? " --check" : "";
    
    // Build command to match manual execution format
    return `source ${VENV_ACTIVATE} && kolla-ansible -i ${INVENTORY} ${cmd}${tagsArg}${limitArg}${checkArg}`.trim();
  }

  // Backup button logic
  if (els.backupFullBtn) {
    els.backupFullBtn.addEventListener('click', () => {
      const backupCmd = `source ${VENV_ACTIVATE} && kolla-ansible -i ${INVENTORY} mariadb_backup --full`;
      appendConsole(`▶ Full DB backup: ${backupCmd}\n`);
      // ...run backupCmd logic here...
    });
  }
  if (els.backupIncBtn) {
    els.backupIncBtn.addEventListener('click', () => {
      const backupCmd = `source ${VENV_ACTIVATE} && kolla-ansible -i ${INVENTORY} mariadb_backup --incremental`;
      appendConsole(`▶ Incremental DB backup: ${backupCmd}\n`);
      // ...run backupCmd logic here...
    });
  }
  /* ---------- run / stop ---------- */
  function setRunningUI(on){
    if (on){ els.runBtn.classList.remove("primary"); els.runBtn.classList.add("danger"); els.runBtn.textContent="Stop"; }
    else   { els.runBtn.classList.remove("danger");  els.runBtn.classList.add("primary"); els.runBtn.textContent="Run"; }
  }

  function start() {
    const finalCmd = buildCommand();
    userStopped = false;
    resetProgress();
    setRunningUI(true);
    appendConsole(`▶ ${els.command.value} started at ${new Date().toLocaleString()}\n`);
    appendConsole(`Debug - hostMode: ${hostMode}, selectedHosts.size: ${selectedHosts.size}\n`);
    appendConsole(`Debug - Command: ${finalCmd}\n\n`);

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
    els.servicesGrid.addEventListener("click", onChipClick);
    els.runBtn.addEventListener("click", () => runningProc ? stop() : start());
    els.clearBtn.addEventListener("click", () => { 
      els.console.textContent = "";
      resetProgress();
    });
    
    // Add refresh hosts button
    if (els.refreshHostsBtn) {
      els.refreshHostsBtn.addEventListener("click", () => {
        appendConsole("(info) Refreshing hosts from inventory...\n");
        renderHostCheckboxes(null);
        loadHosts();
      });
    }

    els.command.addEventListener("change", () => grayServices(NO_TAG_COMMANDS.has(els.command.value)));

    grayServices(NO_TAG_COMMANDS.has(els.command.value)); // bootstrap-servers disables -t
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
