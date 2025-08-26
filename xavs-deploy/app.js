/*
 * Streaming approach (plain spawn, no colors, no PTY) + UX fixes:
 * - Services & hosts wrap responsively (CSS change in index.html)
 * - Shows "Stopped" (not "Completed") when user cancels
 * - Never prints an error line if the process succeeds
 * - bootstrap-servers default; services disabled for commands without -t
 */

(() => {
  const INVENTORY = "/etc/xavs/nodes";
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
    selectedHosts: document.getElementById("selected-hosts"),
    runBtn: document.getElementById("runBtn"),
    clearBtn: document.getElementById("clearBtn"),
    console: document.getElementById("console-output")
  };

  let runningProc = null;
  let userStopped = false;

  const selectedHosts = new Set();
  const selectedServices = new Set();
  let allHostsMode = true;

  /* ---------- console ---------- */
  function appendConsole(text) {
    els.console.textContent += text;
    els.console.scrollTop = els.console.scrollHeight;
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
    // (all)
    const lbAll = document.createElement("label");
    const cbAll = document.createElement("input");
    cbAll.type = "checkbox"; cbAll.className="bxc"; cbAll.dataset.all="1"; cbAll.value="__all__"; cbAll.checked=true;
    cbAll.addEventListener("change", e => onHostToggle("__all__", e.target.checked));
    lbAll.appendChild(cbAll); lbAll.append(" (all)");
    els.hostsBox.appendChild(lbAll);
    // each host
    hosts.forEach(h => {
      const lb = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.className="bxc"; cb.value = h;
      cb.addEventListener("change", e => onHostToggle(h, e.target.checked));
      lb.appendChild(cb); lb.append(` ${h}`);
      els.hostsBox.appendChild(lb);
    });
    renderSelectedPills();
  }

  /* ---------- inventory parsing ---------- */
  function parseInventory(text) {
    const hosts = new Set();
    const lines = text.split(/\r?\n/);
    let collecting=false, sawDeployment=false;
    for (const raw of lines) {
      const line = raw.replace(/[#;].*$/, "").trim();
      if (!line) continue;
      const g = line.match(/^\[([^\]]+)\]$/);
      if (g) {
        const name = g[1].trim();
        if (name==="control"){collecting=true; sawDeployment=false;}
        else if (name==="deployment"){collecting=true; sawDeployment=true;}
        else if (collecting && sawDeployment){collecting=false;}
        continue;
      }
      if (collecting) {
        const host = line.split(/\s+/)[0];
        if (host && !host.startsWith("[")) hosts.add(host);
      }
    }
    return [...hosts].sort((a,b)=>a.localeCompare(b));
  }
  async function loadHosts() {
    try {
      const file = cockpit.file(INVENTORY, { superuser:"try" });
      const txt = await file.read();
      renderHostCheckboxes(parseInventory(txt));
    } catch {
      renderHostCheckboxes([]); // at least show (all)
      appendConsole(`(warn) Unable to read hosts from inventory. Using all hosts.\n`);
    }
  }

  /* ---------- build command ---------- */
  function buildCommand() {
    const cmd = els.command.value;
    const tags = getSelectedServices();
    const tagArg = NO_TAG_COMMANDS.has(cmd) ? "" : (tags.length ? ` -t ${tags.join(",")}` : "");
    const limitArg = (!allHostsMode && selectedHosts.size) ? ` --limit ${[...selectedHosts].join(",")}` : "";
    return `source ${VENV_ACTIVATE} && kolla-ansible -i ${INVENTORY} ${cmd}${tagArg}${limitArg}`.trim();
  }

  /* ---------- run / stop ---------- */
  function setRunningUI(on){
    if (on){ els.runBtn.classList.remove("primary"); els.runBtn.classList.add("danger"); els.runBtn.textContent="Stop"; }
    else   { els.runBtn.classList.remove("danger");  els.runBtn.classList.add("primary"); els.runBtn.textContent="Run"; }
  }

  function start() {
    const finalCmd = buildCommand();
    userStopped = false;
    setRunningUI(true);
    appendConsole(`▶ ${els.command.value} started at ${new Date().toLocaleString()}\n`);

    const opts = { err:"out", superuser:"try" }; // same approach as your working console
    runningProc = cockpit.spawn(["bash","-lc", finalCmd], opts);

    runningProc.stream(data => appendConsole(data));

    runningProc.done(() => {
      if (userStopped) {
        appendConsole(`\n⏹ Stopped\n`);
      } else {
        appendConsole(`\n✔ Completed\n`);
      }
      runningProc = null; setRunningUI(false);
    });

    runningProc.fail(ex => {
      if (userStopped) {
        appendConsole(`\n⏹ Stopped\n`);
      } else {
        appendConsole(`\n✖ Failed: ${ex}\n`);
      }
      runningProc = null; setRunningUI(false);
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
    els.clearBtn.addEventListener("click", () => { els.console.textContent = ""; });

    els.command.addEventListener("change", () => grayServices(NO_TAG_COMMANDS.has(els.command.value)));

    grayServices(NO_TAG_COMMANDS.has(els.command.value)); // bootstrap-servers disables -t
    loadHosts();
  }
  document.addEventListener("DOMContentLoaded", init);
})();
