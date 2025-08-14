(function () {
  "use strict";

  const $ = (q) => document.querySelector(q);
  const $$ = (q) => Array.from(document.querySelectorAll(q));

  // Version badge
  cockpit.spawn(["cockpit-bridge", "--version"], { superuser: "try" })
    .done(txt => { $("#ver").textContent = (txt.split("\n")[0] || "").trim(); })
    .fail(() => { $("#ver").textContent = "Cockpit"; });

  // Tabs
  $$(".tab").forEach(b => b.addEventListener("click", () => {
    $$(".tab").forEach(t => t.classList.remove("active"));
    $$(".pane").forEach(p => p.classList.remove("active"));
    b.classList.add("active");
    $("#" + b.dataset.tab).classList.add("active");
  }));

  // ===== Horizon =====
  const hzUrl = $("#hz-url"), hzFrame = $("#hz-frame"), hzNew = $("#hz-newtab");
  const saved = localStorage.getItem("xos.hz");
  if (saved) { hzUrl.value = saved; hzNew.href = saved; }
  $("#hz-save").addEventListener("click", () => {
    const v = (hzUrl.value || "").trim();
    localStorage.setItem("xos.hz", v);
    hzNew.href = v || "about:blank";
  });
  $("#hz-open").addEventListener("click", () => {
    const u = (hzUrl.value || "").trim();
    if (u) hzFrame.src = u;
  });

  // ===== OpenStack CLI =====
  const osOut = $("#os-out");
  let osProc = null;
  function streamTo(el){ return d => { el.textContent += d; el.scrollTop = el.scrollHeight; }; }
  function runOpenStack(cmd) {
    if (!cmd.trim()) return;
    if (osProc) osProc.close("cancel");
    osOut.textContent = "";
    $("#os-stop").disabled = false;

    const mode = $("#auth-mode").value;
    const cloud = $("#cloud-name").value.trim();

    const args = ["/usr/local/bin/xos-cli.sh", mode];
    if (cloud) args.push("--cloud", cloud);
    args.push("--", cmd);

    osProc = cockpit.spawn(args, { superuser: "require" });
    osProc.stream(streamTo(osOut));
    osProc.done(() => { osOut.textContent += "\n==> Done.\n"; $("#os-stop").disabled = true; osProc=null; });
    osProc.fail(ex  => { osOut.textContent += `\n[ERROR] ${ex}\n`; $("#os-stop").disabled = true; osProc=null; });
  }
  $("#btn-os-list").addEventListener("click", () => { $("#os-cmd").value = "openstack server list --long"; runOpenStack($("#os-cmd").value); });
  $("#btn-os-projects").addEventListener("click", () => { $("#os-cmd").value = "openstack project list"; runOpenStack($("#os-cmd").value); });
  $("#btn-os-nova").addEventListener("click", () => { $("#os-cmd").value = "openstack hypervisor list"; runOpenStack($("#os-cmd").value); });
  $("#os-run").addEventListener("click", () => runOpenStack($("#os-cmd").value));
  $("#os-stop").addEventListener("click", () => { if (osProc) osProc.close("cancelled"); $("#os-stop").disabled = true; });

  // ===== Containers =====
  const ctOut = $("#ct-out"), ctTable = $("#ct-table"), ctFilter = $("#ct-filter");
  const btnLogs = $("#ct-logs"), btnStart = $("#ct-start"), btnStop = $("#ct-stop");
  let selectedId = null, currentList = [];

  function renderTable(list) {
    ctTable.innerHTML = "";
    const header = document.createElement("div"); header.className = "row header";
    ["ID","Name","Image","State","Created"].forEach(t => {
      const c = document.createElement("div"); c.className="cell"; c.textContent=t; header.appendChild(c);
    });
    ctTable.appendChild(header);

    list.forEach(it => {
      const r = document.createElement("div"); r.className="row"; r.dataset.id = it.id;
      ["id","name","image","state","created"].forEach(k => {
        const c = document.createElement("div"); c.className="cell"; c.textContent = it[k] || ""; r.appendChild(c);
      });
      r.addEventListener("click", () => {
        $$("#containers .row").forEach(x => x.classList.remove("selected"));
        r.classList.add("selected");
        selectedId = it.id;
        btnLogs.disabled = btnStart.disabled = btnStop.disabled = false;
      });
      ctTable.appendChild(r);
    });
  }

  function refreshContainers() {
    ctOut.textContent = "";
    selectedId = null; btnLogs.disabled = btnStart.disabled = btnStop.disabled = true;

    const p = cockpit.spawn(["/usr/local/bin/xcontainers.sh", "list"], { superuser: "require" });
    p.done(txt => {
      try { currentList = JSON.parse(txt); } catch(e) { currentList = []; }
      const f = (ctFilter.value || "").toLowerCase();
      renderTable(currentList.filter(x => x.name.toLowerCase().includes(f)));
    });
    p.fail(ex => { ctOut.textContent = `\n[ERROR] ${ex}\n`; });
  }

  $("#ct-refresh").addEventListener("click", refreshContainers);
  ctFilter.addEventListener("input", () => {
    const f = (ctFilter.value || "").toLowerCase();
    renderTable(currentList.filter(x => x.name.toLowerCase().includes(f)));
  });

  btnLogs.addEventListener("click", () => {
    if (!selectedId) return;
    ctOut.textContent = "";
    const p = cockpit.spawn(["/usr/local/bin/xcontainers.sh", "logs", selectedId], { superuser: "require" });
    p.stream(streamTo(ctOut));
    p.fail(ex => { ctOut.textContent += `\n[ERROR] ${ex}\n`; });
  });
  btnStart.addEventListener("click", () => {
    if (!selectedId) return;
    cockpit.spawn(["/usr/local/bin/xcontainers.sh", "start", selectedId], { superuser: "require" })
      .done(refreshContainers).fail(ex => { ctOut.textContent = `\n[ERROR] ${ex}\n`; });
  });
  btnStop.addEventListener("click", () => {
    if (!selectedId) return;
    cockpit.spawn(["/usr/local/bin/xcontainers.sh", "stop", selectedId], { superuser: "require" })
      .done(refreshContainers).fail(ex => { ctOut.textContent = `\n[ERROR] ${ex}\n`; });
  });

  // Initial
  refreshContainers();
})();
