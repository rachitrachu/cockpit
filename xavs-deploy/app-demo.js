/*
 * Demo version with local sample inventory file
 */

(() => {
  // Use local sample file for demo
  const INVENTORY = "./sample-inventory.ini";
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
    hostsBox: document.getElementById("hosts-box"),
    availableHosts: document.getElementById("available-hosts"),
    selectedHosts: document.getElementById("selected-hosts"),
    refreshHostsBtn: document.getElementById("refreshHostsBtn"),
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
  let currentTaskName = "";
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
  let allHostsMode = true;

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
    currentTaskName = "";
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
    
    if (els.taskCount) {
      els.taskCount.textContent = `(${playbookStats.total} tasks)`;
    }
  }

  /* ---------- hosts ---------- */
  function renderSelectedPills() {
    els.selectedHosts.innerHTML = "";
    if (allHostsMode || selectedHosts.size === 0) {
      const p = document.createElement("span");
      p.className = "pill"; p.textContent = "All hosts";
      els.selectedHosts.appendChild(p); return;
    }
    [...selectedHosts].sort().forEach(h => {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.innerHTML = `${h}<span class="x" data-host="${h}">×</span>`;
      els.selectedHosts.appendChild(pill);
    });
  }

  function setAllCb(checked) {
    const cb = els.hostsBox.querySelector('input[type=checkbox][data-all="1"]');
    if (cb) cb.checked = checked;
  }

  function onHostToggle(host, checked) {
    if (host === "__all__") {
      allHostsMode = checked;
      if (checked) {
        selectedHosts.clear();
        els.hostsBox.querySelectorAll('input[type=checkbox]:not([data-all="1"])').forEach(cb => cb.checked = false);
      }
    } else {
      if (checked) { selectedHosts.add(host); allHostsMode = false; setAllCb(false); }
      else { selectedHosts.delete(host); if (selectedHosts.size === 0) { allHostsMode = true; setAllCb(true); } }
    }
    renderSelectedPills();
  }

  function renderHostCheckboxes(hosts) {
    els.hostsBox.innerHTML = "";
    
    if (hosts === null) {
      els.hostsBox.innerHTML = '<div class="muted">Loading hosts from inventory...</div>';
      if (els.availableHosts) {
        els.availableHosts.innerHTML = '<div class="muted">Loading...</div>';
      }
      return;
    }
    
    // (all)
    const lbAll = document.createElement("label");
    const cbAll = document.createElement("input");
    cbAll.type = "checkbox"; cbAll.className="bxc"; cbAll.dataset.all="1"; cbAll.value="__all__"; cbAll.checked=true;
    cbAll.addEventListener("change", e => onHostToggle("__all__", e.target.checked));
    lbAll.appendChild(cbAll); lbAll.append(" (all)");
    els.hostsBox.appendChild(lbAll);
    
    if (hosts.length > 0) {
      const countDiv = document.createElement("div");
      countDiv.className = "muted";
      countDiv.style.fontSize = "12px";
      countDiv.style.marginTop = "4px";
      countDiv.textContent = `${hosts.length} host${hosts.length === 1 ? '' : 's'} found in inventory`;
      els.hostsBox.appendChild(countDiv);
    }
    
    hosts.forEach(h => {
      const lb = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.className="bxc"; cb.value = h;
      cb.addEventListener("change", e => onHostToggle(h, e.target.checked));
      lb.appendChild(cb); lb.append(` ${h}`);
      els.hostsBox.appendChild(lb);
    });
    
    // Update available hosts list
    renderAvailableHostsList(hosts);
    renderSelectedPills();
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
      
      const sectionMatch = line.match(/^\[([^\]]+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].trim();
        console.log(`[DEBUG] Found section: [${currentSection}]`);
        continue;
      }
      
      if (currentSection && (currentSection.endsWith(':children') || currentSection.endsWith(':vars'))) {
        continue;
      }
      
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
      // For demo purposes, use fetch instead of cockpit.file
      const response = await fetch(INVENTORY);
      if (!response.ok) {
        throw new Error(`Failed to load inventory: ${response.status}`);
      }
      const txt = await response.text();
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
      renderHostCheckboxes([]);
      appendConsole(`(warn) Unable to read hosts from inventory file: ${error.message || error}. Using all hosts.\n`);
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

  /* ---------- build command ---------- */
  function buildCommand() {
    const cmd = els.command.value;
    const tags = getSelectedServices();
    const tagArg = NO_TAG_COMMANDS.has(cmd) ? "" : (tags.length ? ` -t ${tags.join(",")}` : "");
    const limitArg = (!allHostsMode && selectedHosts.size) ? ` --limit ${[...selectedHosts].join(",")}` : "";
    return `source ${VENV_ACTIVATE} && kolla-ansible -i ${INVENTORY} ${cmd}${tagArg}${limitArg}`.trim();
  }

  /* ---------- demo simulation ---------- */
  function simulateRun() {
    appendConsole(`▶ ${els.command.value} started at ${new Date().toLocaleString()}\n`);
    appendConsole(`Debug - allHostsMode: ${allHostsMode}, selectedHosts.size: ${selectedHosts.size}\n`);
    appendConsole(`Debug - Command: ${buildCommand()}\n\n`);
    appendConsole(`(demo) This is a demo version. In the actual application, Ansible commands would run here.\n\n`);
  }

  /* ---------- init ---------- */
  function init() {
    els.servicesGrid.addEventListener("click", onChipClick);
    els.runBtn.addEventListener("click", simulateRun);
    els.clearBtn.addEventListener("click", () => { 
      els.console.textContent = "";
      resetProgress();
    });
    
    if (els.refreshHostsBtn) {
      els.refreshHostsBtn.addEventListener("click", () => {
        appendConsole("(info) Refreshing hosts from inventory...\n");
        renderHostCheckboxes(null);
        loadHosts();
      });
    }

    els.command.addEventListener("change", () => grayServices(NO_TAG_COMMANDS.has(els.command.value)));

    grayServices(NO_TAG_COMMANDS.has(els.command.value));
    resetProgress();
    
    renderHostCheckboxes(null);
    loadHosts();
  }
  
  document.addEventListener("DOMContentLoaded", init);
})();
